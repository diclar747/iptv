// Integration checks use a disposable schema. Production users and money are never changed.
import '../src/env.js';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {query,tx} from '../src/pg.js';
import {approvePayment,requestWithdrawal,resolveWithdrawal} from '../src/affiliates.js';
import {requireRole} from '../src/auth.js';
const schema='livetv_aff_test_'+randomBytes(8).toString('hex');
assert(/^livetv_aff_test_[a-f0-9]{16}$/.test(schema));
const scoped=fn=>tx(async c=>{await c.query(`SET LOCAL search_path TO "${schema}",public`);return fn(c);});
const sql=await readFile(new URL('../db/affiliates.sql',import.meta.url),'utf8');
let created=false;
try{
 await tx(async c=>{await c.query(`CREATE SCHEMA "${schema}"`);await c.query(`SET LOCAL search_path TO "${schema}",public`);await c.query('CREATE TABLE users (LIKE public.users INCLUDING ALL)');await c.query(sql);});created=true;
 const users=await scoped(async c=>{
  const insert=async(username,role,expires,parent=null)=>(await c.query(`INSERT INTO users(username,role,pass_hash,pass_salt,expires_at,parent_id,bank_name,bank_holder,bank_account) VALUES($1,$2,'test','test',$3,$4,'Banco prueba','Titular prueba','TEST-000') RETURNING *`,[username,role,expires,parent])).rows[0];
  const admin=await insert('testadmin','admin',null),affiliate=await insert('testaffiliate','client',new Date(Date.now()+86400000)),referred=await insert('testreferred','client',new Date(Date.now()-86400000),affiliate.id);return {admin,affiliate,referred};
 });
 const {admin,affiliate,referred}=users;
 await scoped(c=>c.query('UPDATE users SET credits=100 WHERE id=$1',[affiliate.id]));
 const payment=(reference='bank-'+randomUUID())=>scoped(async c=>(await c.query('INSERT INTO subscription_payments(user_id,amount_gs,duration_days,reference,request_key) VALUES($1,27500,30,$2,$3) RETURNING *',[referred.id,reference,randomUUID()])).rows[0]);
 const balance=()=>scoped(async c=>Number((await c.query('SELECT COALESCE(sum(amount_gs),0) AS n FROM affiliate_ledger WHERE user_id=$1',[affiliate.id])).rows[0].n));
 const first=await payment();
 assert.equal(await balance(),0,'Archived credits do not become money');
 await Promise.all([scoped(c=>approvePayment(c,first.id,admin.id)),scoped(c=>approvePayment(c,first.id,admin.id))]);
 assert.equal(await balance(),13750,'Concurrent approval credits only once');
 const second=await payment();await scoped(c=>approvePayment(c,second.id,admin.id));assert.equal(await balance(),27500,'Each monthly payment earns 50%');
 const expiry=await scoped(async c=>(await c.query('SELECT expires_at FROM users WHERE id=$1',[referred.id])).rows[0].expires_at);
 assert(new Date(expiry).getTime()>Date.now()+59*86400000,'Renewals extend the existing plan');
 await scoped(c=>c.query("UPDATE users SET expires_at=now()-interval '1 day' WHERE id=$1",[affiliate.id]));
 const lost=await payment();await scoped(c=>approvePayment(c,lost.id,admin.id));assert.equal(await balance(),27500,'Expired affiliate earns nothing');
 assert.equal(await scoped(async c=>(await c.query('SELECT state FROM affiliate_commissions WHERE payment_id=$1',[lost.id])).rows[0].state),'lost');
 await scoped(c=>c.query("UPDATE users SET expires_at=now()+interval '30 days' WHERE id=$1",[affiliate.id]));
 await scoped(c=>approvePayment(c,lost.id,admin.id));assert.equal(await balance(),27500,'Lost commissions are not retroactive');
 const duplicate=await payment(first.reference);
 await assert.rejects(scoped(c=>approvePayment(c,duplicate.id,admin.id)),e=>e.code==='23505');assert.equal(await balance(),27500,'Duplicate bank reference rolls back the whole approval');
 await assert.rejects(scoped(c=>requestWithdrawal(c,affiliate.id,27501,randomUUID())),e=>e.status===409);
 const races=await Promise.allSettled([scoped(c=>requestWithdrawal(c,affiliate.id,18000,randomUUID())),scoped(c=>requestWithdrawal(c,affiliate.id,18000,randomUUID()))]);
 assert.equal(races.filter(r=>r.status==='fulfilled').length,1,'Concurrent withdrawals cannot overspend');assert.equal(await balance(),9500);
 const w=races.find(r=>r.status==='fulfilled').value;
 await Promise.all([scoped(c=>resolveWithdrawal(c,w.id,admin.id,'rejected',null,'Prueba')),scoped(c=>resolveWithdrawal(c,w.id,admin.id,'rejected',null,'Prueba'))]);assert.equal(await balance(),27500,'Rejection releases reserved funds once');
 const key=randomUUID();const paid=await scoped(c=>requestWithdrawal(c,affiliate.id,13750,key));const retry=await scoped(c=>requestWithdrawal(c,affiliate.id,13750,key));assert.equal(paid.id,retry.id,'Retried request is idempotent');
 await assert.rejects(scoped(c=>resolveWithdrawal(c,paid.id,admin.id,'paid','')),e=>e.status===400);
 await Promise.all([scoped(c=>resolveWithdrawal(c,paid.id,admin.id,'paid','transfer-test')),scoped(c=>resolveWithdrawal(c,paid.id,admin.id,'paid','transfer-test'))]);assert.equal(await balance(),13750,'Marking paid never deducts twice');
 assert.equal(paid.bank_snapshot.bankAccount,'TEST-000','The bank destination is snapshotted');
 await scoped(c=>c.query("UPDATE users SET status='disabled' WHERE id=$1",[affiliate.id]));
 await scoped(c=>c.query("UPDATE subscription_payments SET status='rejected' WHERE id=$1",[duplicate.id]));
 const disabled=await payment();await scoped(c=>approvePayment(c,disabled.id,admin.id));assert.equal(await balance(),13750,'Disabled affiliate earns nothing');
 let denied=0;requireRole('admin')({user:{role:'client'}},{status:n=>({json:()=>{denied=n;}})},()=>assert.fail('Client obtained admin access'));assert.equal(denied,403);
 console.log('PASS: recurring 50%, duplicate/concurrent approvals, expiry, lost commissions, duplicate bank reference, concurrent withdrawals, refund once, withdrawal retries, bank snapshot, paid once, disabled affiliate, admin authorization.');
}finally{
 if(created)await query(`DROP SCHEMA "${schema}" CASCADE`);
}
process.exit();
