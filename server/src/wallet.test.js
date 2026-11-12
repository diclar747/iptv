import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';

test('recargas, comisiones y renovación de billetera en PostgreSQL', {
 skip: !process.env.WALLET_TEST_DATABASE_URL,
}, async () => {
 process.env.DATABASE_URL=process.env.WALLET_TEST_DATABASE_URL;
 const {initSchema,one,query,tx}=await import('./pg.js');
 const {approvePayment,payWithWallet,requestTopup,requestWithdrawal,resolveTopup,renewWalletSession}=await import('./affiliates.js');
 await initSchema();
 const suffix=randomUUID();
 async function user(name,role='client',parent=null){
  return one(`INSERT INTO users(username,pass_hash,pass_salt,role,parent_id,expires_at,bank_name,bank_holder,bank_account)
   VALUES($1,'test','test',$2,$3,now()+interval '1 day','Banco Continental','Prueba','123') RETURNING *`,[name+suffix,role,parent]);
 }
 async function bankPayment(owner,reference,status='pending'){
  return one(`INSERT INTO subscription_payments(user_id,amount_gs,duration_days,reference,request_key,status)
   VALUES($1,27500,30,$2,$3,$4) RETURNING *`,[owner,reference,randomUUID(),status]);
 }
 async function receipt(owner){
  const id=randomUUID();
  await query("INSERT INTO payment_receipts(id,user_id,filename,original_name,mime,size_bytes) VALUES($1,$2,'test.png','test','image/png',1)",[id,owner]);
  return id;
 }
 const admin=await user('admin','admin');
 const affiliate=await user('affiliate');
 const referred=await Promise.all([user('first','client',affiliate.id),user('second','client',affiliate.id)]);
 for(const [index,client] of referred.entries()){
  const payment=await bankPayment(client.id,'bank-'+index+suffix);
  await Promise.all([tx(c=>approvePayment(c,payment.id,admin.id)),tx(c=>approvePayment(c,payment.id,admin.id))]);
 }
 assert.equal((await one("SELECT sum(amount_gs) AS balance FROM affiliate_ledger WHERE user_id=$1",[affiliate.id])).balance,'27500');
 await query("UPDATE users SET expires_at=now()-interval '1 minute' WHERE id=$1",[affiliate.id]);
 const auto=()=>tx(c=>payWithWallet(c,affiliate.id,{automatic:true}));
 const renewals=await Promise.all([auto(),auto()]);
 assert.equal(renewals.filter(Boolean).length,1);
 assert.equal(renewals.find(Boolean).method,'wallet');
 assert.equal((await one("SELECT sum(amount_gs) AS balance FROM affiliate_ledger WHERE user_id=$1",[affiliate.id])).balance,'0');

 const proof=await receipt(referred[0].id);
 const input={amount:55000,reference:'topup-'+suffix,receiptId:proof,requestKey:randomUUID()};
 const deposit=await tx(c=>requestTopup(c,referred[0].id,input));
 assert.equal((await tx(c=>requestTopup(c,referred[0].id,input))).id,deposit.id);
 await assert.rejects(tx(c=>requestTopup(c,referred[0].id,{...input,requestKey:randomUUID()})),{status:400});
 await assert.rejects(tx(c=>resolveTopup(c,deposit.id,admin.id,{status:'approved',reference:'BANK-0'+suffix})),{status:409});
 const approve=()=>tx(c=>resolveTopup(c,deposit.id,admin.id,{status:'approved',reference:input.reference}));
 await Promise.all([approve(),approve()]);
 const duplicate=await bankPayment(referred[1].id,input.reference);
 await assert.rejects(tx(c=>approvePayment(c,duplicate.id,admin.id)),{status:409});
 await assert.rejects(tx(c=>requestWithdrawal(c,referred[0].id,1,randomUUID())),{status:409});

 const expectedExpiry=(await one('SELECT expires_at FROM users WHERE id=$1',[referred[0].id])).expires_at.toISOString();
 const manual={expectedExpiry,requestKey:randomUUID()};
 const payment=await tx(c=>payWithWallet(c,referred[0].id,manual));
 assert.equal((await tx(c=>payWithWallet(c,referred[0].id,manual))).id,payment.id);
 await assert.rejects(tx(c=>payWithWallet(c,referred[0].id,{...manual,requestKey:randomUUID()})),{status:409});
 const movements=await one(`SELECT sum(amount_gs) AS balance,sum(prepaid_used_gs) AS used,
  count(*) FILTER (WHERE kind='topup') AS topups FROM affiliate_ledger WHERE user_id=$1`,[referred[0].id]);
 assert.deepEqual(movements,{balance:'27500',used:'27500',topups:'1'});
 assert.equal((await one('SELECT amount_gs,state FROM affiliate_commissions WHERE payment_id=$1',[payment.id])).state,'earned');
 const pending=await bankPayment(referred[0].id,'pending-'+suffix);
 await query("UPDATE users SET expires_at=now()-interval '1 minute' WHERE id=$1",[referred[0].id]);
 assert.equal(await tx(c=>payWithWallet(c,referred[0].id,{automatic:true})),null);
 await query("UPDATE subscription_payments SET status='rejected' WHERE id=$1",[pending.id]);
 const request={user:await one('SELECT * FROM users WHERE id=$1',[referred[0].id])};
 let continued=false;
 await renewWalletSession(request,null,()=>{continued=true;});
 assert.ok(continued);
 assert.ok(request.user.expires_at>Date.now());
 assert.equal((await one("SELECT sum(amount_gs) AS balance FROM affiliate_ledger WHERE user_id=$1",[referred[0].id])).balance,'0');
 await initSchema();
});
