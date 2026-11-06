// Disposable-schema HTTP checks; never create payments in the real application schema.
import '../src/env.js';
import pg from 'pg';
import express from 'express';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
const schema='livetv_flow_test_'+randomBytes(8).toString('hex');
const db=new pg.Client(process.env.DATABASE_URL?{connectionString:process.env.DATABASE_URL}:{host:process.env.PGHOST||'localhost',port:Number(process.env.PGPORT||5432),database:process.env.PGDATABASE||'iptv',user:process.env.PGUSER||'iptv',password:process.env.PGPASSWORD||'iptv'});
await db.connect();let server;
const media=path.resolve('node_modules/.cache',schema);await mkdir(media,{recursive:true});process.env.MEDIA_STORAGE_DIR=media;
try{
 await db.query(`CREATE SCHEMA "${schema}";SET search_path TO "${schema}",public;CREATE TABLE users (LIKE public.users INCLUDING ALL)`);
 await db.query(await readFile(new URL('../db/affiliates.sql',import.meta.url),'utf8'));
 process.env.PGOPTIONS='-c search_path='+schema+',public';
 const {query}=await import('../src/pg.js');assert.equal((await query('SELECT current_schema() AS s')).rows[0].s,schema);
 const {hashPassword,createSession,attachUser,userFromToken}=await import('../src/auth.js');
 const {hash,salt}=hashPassword('StrongTestPassword8');
 const insert=async(name,role='client',parent=null)=>(await query("INSERT INTO users(username,role,pass_hash,pass_salt,expires_at,parent_id,bank_name,bank_holder,bank_account) VALUES($1,$2,$3,$4,now()+interval '30 days',$5,'Test bank','Test owner','TEST-123') RETURNING *",[name,role,hash,salt,parent])).rows[0];
 const admin=await insert('testadmin','admin'),affiliate=await insert('testaffiliate'),user=await insert('testuser','client',affiliate.id),other=await insert('testother');
 const token=await createSession(admin.id),userToken=await createSession(user.id),otherToken=await createSession(other.id);
 assert.equal((await userFromToken(token)).id,admin.id,'Persistent sessions authenticate');
 const app=express();app.use(express.json());app.use(attachUser);
 for(const name of ['payment-files','notifications','bank-accounts','affiliate-admin','affiliates','accounts'])app.use('/api',(await import('../src/'+name+'.js')).default);
 app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 async function req(route,method='GET',body,auth=userToken,status=200){const r=await fetch(base+'/api'+route,{method,headers:{Authorization:'Bearer '+auth,...(body?{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json'}:{})},body:body?(Buffer.isBuffer(body)?body:JSON.stringify(body)):undefined});const d=r.headers.get('content-type')?.includes('json')?await r.json():await r.arrayBuffer();assert.equal(r.status,status,JSON.stringify(d));return d;}
 await req('/admin/affiliates?page=1','GET',null,userToken,403);
 const list=await req('/admin/affiliates?page=1','GET',null,token);assert.equal(list.pageSize,20);assert.equal(list.items.length,3);
 const created=await req('/admin/affiliates','POST',{username:'createduser',password:'StrongPassword12',email:'new@example.test'},token,201);assert(!('pass_hash' in created));
 const oldSession=await createSession(created.id);
 await req('/admin/affiliates/'+created.id,'PATCH',{username:'renameduser',password:'ChangedPassword34'},token);assert.equal(await userFromToken(oldSession),null,'Password change revokes sessions');
 await req('/admin/affiliates','POST',{username:'createduser',password:'StrongPassword12'},token,409);
 const bank=await req('/affiliate/bank-accounts','POST',{bankName:'Bank B',bankHolder:'Owner B',bankAccount:'B-456',bankDoc:'12345'},userToken,201);
 await req('/affiliate/bank-accounts/'+bank.id,'DELETE',null,otherToken,404);
 await req('/affiliate/receipts','POST',Buffer.from('<html>invalid</html>'),userToken,400);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 const receipt=await req('/affiliate/receipts','POST',png,userToken,201);
 await req('/affiliate/receipts/'+receipt.id,'GET',null,otherToken,404);await req('/affiliate/receipts/'+receipt.id,'GET',null,token);
 await req('/affiliate/payments','POST',{reference:'test-reference',requestKey:randomUUID(),receiptId:receipt.id},otherToken,400);
 const key=randomUUID(),payment=await req('/affiliate/payments','POST',{reference:'test-reference',requestKey:key,receiptId:receipt.id},userToken,201);
 const retry=await req('/affiliate/payments','POST',{reference:'test-reference',requestKey:key,receiptId:receipt.id},userToken,201);assert.equal(retry.id,payment.id);
 await req('/admin/affiliate-payments/'+payment.id+'/approve','POST',{reference:'confirmed-test-reference'},token);
 await req('/admin/affiliate-payments/'+payment.id+'/approve','POST',{reference:'confirmed-test-reference'},token);
 const balance=(await query('SELECT sum(amount_gs) AS n FROM affiliate_ledger WHERE user_id=$1',[affiliate.id])).rows[0].n;assert.equal(Number(balance),13750);
 const notifications=await req('/notifications');assert(notifications.items.some(n=>n.kind==='plan'));
 assert.equal(Number((await query("SELECT count(*) AS n FROM app_notifications WHERE kind='commission'")).rows[0].n),1);
 const affiliateToken=await createSession(affiliate.id);
 const saved=await req('/affiliate/bank-accounts','POST',{bankName:'Saved bank',bankHolder:'Saved owner',bankAccount:'SAVED'},affiliateToken,201);
 const withdrawal=await req('/affiliate/withdrawals','POST',{amount:10000,requestKey:randomUUID(),bankAccountId:saved.id},affiliateToken,201);assert.equal(withdrawal.bank_snapshot.bankAccount,'SAVED');
 await req('/admin/affiliate-withdrawals/'+withdrawal.id+'/resolve','POST',{status:'paid',reference:'transfer-test'},token);
 assert((await req('/notifications','GET',null,affiliateToken)).items.some(n=>n.title.includes('pagado')));
 const activation={months:3,kind:'paid',reference:'three-month-test',requestKey:randomUUID()};
 const a=await req('/admin/affiliates/'+created.id+'/activate','POST',activation,token);const a2=await req('/admin/affiliates/'+created.id+'/activate','POST',activation,token);assert.equal(a.id,a2.id);assert.equal(Number(a.amount_gs),82500);
 await req('/admin/affiliates/'+created.id,'DELETE',null,token);assert.equal((await req('/admin/affiliates?page=1&account=deleted','GET',null,token)).total,1);
 await req('/admin/affiliates/'+created.id+'/restore','POST',{},token);
 await req('/profile/password','POST',{currentPassword:'StrongTestPassword8',password:'NewStrongPassword9'},otherToken);assert.equal(await userFromToken(otherToken),null,'Own password change invalidates the previous token');
 console.log('PASS: persistent sessions, admin authorization/CRUD/pagination, reserved aliases, password revocation, private receipt upload/access, payment retries, commission once, saved bank snapshot, withdrawal notices, multi-month activation retries, soft delete/restore.');
}finally{
 if(server)await new Promise(r=>server.close(r));
 await db.query('SET search_path TO public');assert(/^livetv_flow_test_[a-f0-9]{16}$/.test(schema));await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.end();
 // Remove only this run's uniquely named disposable media directory.
 if(path.basename(media)===schema)await rm(media,{recursive:true,force:true});
}
process.exit(0);
