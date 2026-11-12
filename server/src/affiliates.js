import express from 'express';
import {randomUUID} from 'node:crypto';
import {notify} from './notifications.js';
import {many,one,tx} from './pg.js';
import {requireAuth,requireRole} from './auth.js';
import {MONTHLY_PLAN,commissionEligible,commissionAmount,wholeGs} from './affiliate-policy.js';
const router=express.Router();
const fail=(status,message)=>Object.assign(Error(message),{status});
const h=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(e=>{if(!e.status&&e.code!=='23505')console.error('[affiliates]',e);res.status(e.status||(e.code==='23505'?409:500)).json({error:e.status?e.message:e.code==='23505'?'Ya existe una solicitud o referencia de pago igual':'No se pudo completar la operación'});});
const uuid=value=>{if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value||''))throw fail(400,'Falta la identificación de la solicitud');return value;};
const text=(value,max=500)=>typeof value==='string'?value.trim().slice(0,max):'';
const bankOf=u=>({bankName:u.bank_name||'',bankHolder:u.bank_holder||'',bankAccount:u.bank_account||'',bankAlias:u.bank_alias||'',bankDoc:u.bank_doc||''});
const walletTotals=`SELECT COALESCE(sum(amount_gs),0) AS total,
 COALESCE(sum(CASE WHEN kind='topup' THEN amount_gs ELSE -prepaid_used_gs END),0) AS prepaid
 FROM affiliate_ledger WHERE user_id=$1`;
const validWalletUser=u=>u?.status==='active'&&u.role!=='admin'&&!u.deleted_at;

export async function lockWalletUsers(c,userId) {
 const owner=(await c.query('SELECT parent_id FROM users WHERE id=$1',[userId])).rows[0];
 const ids=[userId,owner?.parent_id].filter(Boolean);
 const users=(await c.query('SELECT * FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids])).rows;
 const user=users.find(u=>String(u.id)===String(userId));
 const ref=users.find(u=>String(u.id)===String(user?.parent_id));
 return {user,ref};
}

async function confirmBankReference(c,reference) {
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended(lower($1), 771104))',[reference]);
 const used=await c.query(`SELECT 1 FROM subscription_payments WHERE status='approved' AND lower(approved_reference)=lower($1)
  UNION ALL SELECT 1 FROM wallet_topups WHERE status='approved' AND lower(approved_reference)=lower($1) LIMIT 1`,[reference]);
 if(used.rows.length)throw fail(409,'Esa referencia bancaria ya se acreditó en un pago o una recarga');
}

async function attachReceipt(c,userId,receiptId,operationId,kind) {
 const column=kind==='topup'?'topup_id':'payment_id';
 const result=await c.query(`UPDATE payment_receipts SET ${column}=$3
  WHERE id=$1 AND user_id=$2 AND payment_id IS NULL AND topup_id IS NULL RETURNING id`,[uuid(receiptId),userId,operationId]);
 if(!result.rows.length)throw fail(400,'Adjuntá un comprobante propio que no hayas usado');
}

// Caller owns the transaction. Row locks and unique ledger keys prevent duplicate money.
export async function approvePayment(c,id,adminId,reference){
 const p=(await c.query('SELECT * FROM subscription_payments WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!p)throw fail(404,'Pago no encontrado');
 if(p.status==='approved')return p;
 if(p.status!=='pending')throw fail(409,'El pago ya fue rechazado');
 const {user,ref}=await lockWalletUsers(c,p.user_id);
 if(!validWalletUser(user))throw fail(409,'La cuenta del cliente está bloqueada');
 const approvedReference=text(reference||p.reference,120);if(!approvedReference)throw fail(400,'Ingresá la referencia bancaria confirmada');
 await confirmBankReference(c,approvedReference);
 const approvedAt=(await c.query('SELECT clock_timestamp() AS at')).rows[0].at;
 await activatePaidPlan(c,p,user,ref,approvedAt);
 return (await c.query(`UPDATE subscription_payments SET status='approved',approved_reference=$1,resolved_by=$2,resolved_at=$3 WHERE id=$4 RETURNING *`,[approvedReference,adminId,approvedAt,p.id])).rows[0];
}

async function activatePaidPlan(c,p,user,ref,approvedAt){
 // Inspect eligibility BEFORE extending the referred user's plan.
 if(ref&&String(ref.id)!==String(user.id)){
  const earned=commissionEligible(ref,new Date(approvedAt).getTime()),amount=commissionAmount(p.amount_gs);
  const commission=(await c.query(`INSERT INTO affiliate_commissions(payment_id,affiliate_id,referred_id,amount_gs,state,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[p.id,ref.id,user.id,amount,earned?'earned':'lost',earned?null:'Plan del afiliado inactivo al aprobarse el pago'])).rows[0];
  if(earned){await c.query(`INSERT INTO affiliate_ledger(user_id,amount_gs,kind,commission_id) VALUES($1,$2,'commission',$3)`,[ref.id,amount,commission.id]);await notify(c,ref.id,'commission','Recibiste una comisión','Gs. '+amount.toLocaleString('es-PY')+' por el pago de '+user.username,'commission:'+p.id);}
 }
 await c.query(`UPDATE users SET expires_at=GREATEST(expires_at,$4::timestamptz)+($1::int*interval '1 day'),package_name=$2,max_connections=$5 WHERE id=$3`,[p.duration_days,MONTHLY_PLAN.name,user.id,approvedAt,MONTHLY_PLAN.maxConnections]);
 await notify(c,user.id,'plan',p.method==='wallet'?'Plan renovado con tu billetera':'Tu plan fue activado','Se agregaron '+p.duration_days+' días a tu plan LiveTV.','plan:'+p.id);
}

export async function payWithWallet(c,userId,{automatic=false,requestKey=randomUUID(),expectedExpiry}={}){
 const {user,ref}=await lockWalletUsers(c,userId);
 if(!validWalletUser(user)){if(automatic)return null;throw fail(409,'La cuenta no puede renovar su plan');}
 if(!automatic){
  const prior=(await c.query("SELECT * FROM subscription_payments WHERE user_id=$1 AND request_key=$2 AND method='wallet'",[userId,requestKey])).rows[0];
  if(prior)return prior;
  if((user.expires_at?new Date(user.expires_at).toISOString():null)!==expectedExpiry)throw fail(409,'Tu plan cambió. Actualizá la billetera antes de volver a pagar.');
 }
 const now=(await c.query('SELECT clock_timestamp() AS at')).rows[0].at;
 if(automatic&&user.expires_at&&new Date(user.expires_at)>now)return null;
 const pending=await c.query("SELECT 1 FROM subscription_payments WHERE user_id=$1 AND status='pending'",[userId]);
 if(pending.rows.length){if(automatic)return null;throw fail(409,'Ya tenés un pago bancario en revisión');}
 const balance=(await c.query(walletTotals,[userId])).rows[0];
 if(BigInt(balance.total)<BigInt(MONTHLY_PLAN.amount)){if(automatic)return null;throw fail(409,'El saldo no alcanza para renovar tu plan');}
 const prepaidUsed=Math.min(MONTHLY_PLAN.amount,Number(balance.prepaid));
 const p=(await c.query(`INSERT INTO subscription_payments(user_id,amount_gs,duration_days,reference,request_key,status,method,resolved_at)
  VALUES($1,$2,$3,$4,$5,'approved','wallet',$6) RETURNING *`,
  [userId,MONTHLY_PLAN.amount,MONTHLY_PLAN.durationDays,automatic?'Renovación automática con saldo':'Pago con saldo',requestKey,now])).rows[0];
 await c.query("INSERT INTO affiliate_ledger(user_id,amount_gs,kind,payment_id,prepaid_used_gs) VALUES($1,$2,'renewal',$3,$4)",[userId,-MONTHLY_PLAN.amount,p.id,prepaidUsed]);
 await activatePaidPlan(c,p,user,ref,now);
 return p;
}

async function renewIfDue(userId){
 try{return await tx(c=>payWithWallet(c,userId,{automatic:true}));}
 catch(error){console.error('[wallet] No se pudo renovar:',error.code||error.message);return null;}
}

export async function renewWalletSession(req,res,next){
 const user=req.user;
 if(validWalletUser(user)&&!commissionEligible(user)){
  try{
   const balance=await one(walletTotals,[user.id]);
   if(BigInt(balance.total)>=BigInt(MONTHLY_PLAN.amount)&&await renewIfDue(user.id)){
    req.user=await one('SELECT * FROM users WHERE id=$1',[user.id]);
   }
  }catch(error){console.error('[wallet] No se pudo actualizar la sesión:',error.code||error.message);}
 }
 next();
}

export function startWalletRenewals(){
 let running=false;
 async function sweep(){
  if(running)return;
  running=true;
  try{
   const due=await many(`SELECT u.id FROM users u
    JOIN LATERAL (SELECT sum(amount_gs) AS balance FROM affiliate_ledger WHERE user_id=u.id) l ON l.balance >= $1
    WHERE u.status='active' AND u.role<>'admin' AND u.deleted_at IS NULL
      AND (u.expires_at IS NULL OR u.expires_at<=now())
      AND NOT EXISTS(SELECT 1 FROM subscription_payments WHERE user_id=u.id AND status='pending')
    ORDER BY u.expires_at NULLS FIRST,u.id LIMIT 100`,[MONTHLY_PLAN.amount]);
   for(const {id} of due)await renewIfDue(id);
  }catch(error){console.error('[wallet] No se pudieron revisar vencimientos:',error.code||error.message);}
  finally{running=false;}
 }
 void sweep();
 setInterval(sweep,30000).unref();
}
export async function requestWithdrawal(c,userId,amount,key,bankAccountId){
 amount=wholeGs(amount);uuid(key);
 const u=(await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[userId])).rows[0];
 const prior=(await c.query('SELECT * FROM affiliate_withdrawals WHERE user_id=$1 AND request_key=$2',[userId,key])).rows[0];if(prior)return prior;
 let bank=bankOf(u);if(bankAccountId&&bankAccountId!=='profile'){uuid(bankAccountId);const saved=(await c.query('SELECT data FROM affiliate_bank_accounts WHERE id=$1 AND user_id=$2 AND NOT disabled FOR SHARE',[bankAccountId,userId])).rows[0];if(!saved)throw fail(400,'Cuenta bancaria no encontrada');bank=saved.data;}if(!bank.bankName||!bank.bankHolder||(!bank.bankAccount&&!bank.bankAlias))throw fail(400,'Completá banco, titular y cuenta o alias en tus datos bancarios');
 if(!validWalletUser(u))throw fail(409,'La cuenta no puede solicitar retiros');
 const balance=(await c.query(walletTotals,[userId])).rows[0];
 if(BigInt(balance.total)-BigInt(balance.prepaid)<BigInt(amount))throw fail(409,'El monto supera tu dinero disponible para retirar');
 const w=(await c.query('INSERT INTO affiliate_withdrawals(user_id,amount_gs,request_key,bank_snapshot) VALUES($1,$2,$3,$4) RETURNING *',[userId,amount,key,JSON.stringify(bank)])).rows[0];
 await c.query(`INSERT INTO affiliate_ledger(user_id,amount_gs,kind,withdrawal_id) VALUES($1,$2,'withdrawal',$3)`,[userId,-amount,w.id]);const admins=(await c.query("SELECT id FROM users WHERE role='admin' AND status='active'")).rows;for(const a of admins)await notify(c,a.id,'withdrawal','Nuevo retiro solicitado',u.username+' solicitó Gs. '+amount.toLocaleString('es-PY'),'withdrawal:'+w.id+':'+a.id);return w;
}
export async function resolveWithdrawal(c,id,adminId,status,reference,note){
 const w=(await c.query('SELECT * FROM affiliate_withdrawals WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!w)throw fail(404,'Retiro no encontrado');
 if(w.status===status)return w;if(w.status!=='pending')throw fail(409,'El retiro ya fue resuelto');
 await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[w.user_id]);
 if(status==='paid'&&!text(reference,120))throw fail(400,'Ingresá la referencia de la transferencia realizada');
 if(!['paid','rejected'].includes(status))throw fail(400,'Estado inválido');
 if(status==='rejected')await c.query(`INSERT INTO affiliate_ledger(user_id,amount_gs,kind,withdrawal_id) VALUES($1,$2,'release',$3)`,[w.user_id,w.amount_gs,w.id]);
 await notify(c,w.user_id,'withdrawal',status==='paid'?'Tu retiro fue marcado como pagado':'Tu retiro fue rechazado',status==='paid'?'Se registró la transferencia de Gs. '+Number(w.amount_gs).toLocaleString('es-PY')+'. Revisá tu cuenta bancaria.':'El dinero fue devuelto a tu billetera. '+text(note),'withdrawal-resolved:'+w.id);
 return (await c.query('UPDATE affiliate_withdrawals SET status=$1,payment_reference=$2,note=$3,resolved_by=$4,resolved_at=clock_timestamp() WHERE id=$5 RETURNING *',[status,text(reference,120)||null,text(note)||null,adminId,id])).rows[0];
}
router.get('/affiliate/me',requireAuth,h(async(req,res)=>{
 const id=req.user.id;
 const [balance,totals,referrals,commissions,withdrawals,payments,movements,withdrawalTotals,topups]=await Promise.all([
  one(walletTotals,[id]),
  one(`SELECT COALESCE(sum(amount_gs) FILTER(WHERE state='earned'),0) AS earned,COALESCE(sum(amount_gs) FILTER(WHERE state='lost'),0) AS lost FROM affiliate_commissions WHERE affiliate_id=$1`,[id]),
  many(`SELECT id,username,display_name,created_at,expires_at,status,(SELECT count(*) FROM subscription_payments p WHERE p.user_id=u.id AND p.status='approved') AS payments FROM users u WHERE parent_id=$1 ORDER BY created_at DESC LIMIT 200`,[id]),
  many(`SELECT c.*,u.username AS referred FROM affiliate_commissions c JOIN users u ON u.id=c.referred_id WHERE c.affiliate_id=$1 ORDER BY c.id DESC LIMIT 100`,[id]),
  many("SELECT * FROM affiliate_withdrawals WHERE user_id=$1 ORDER BY (status='pending') DESC,id DESC LIMIT 100",[id]),
  many('SELECT p.*,(SELECT id FROM payment_receipts r WHERE r.payment_id=p.id) AS receipt_id FROM subscription_payments p WHERE user_id=$1 ORDER BY id DESC LIMIT 100',[id]),
  many('SELECT * FROM affiliate_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 100',[id]),
  one(`SELECT COALESCE(sum(amount_gs) FILTER(WHERE status='pending'),0) AS pending,COALESCE(sum(amount_gs) FILTER(WHERE status='paid'),0) AS paid FROM affiliate_withdrawals WHERE user_id=$1`,[id]),
  many("SELECT t.*,r.id AS receipt_id FROM wallet_topups t LEFT JOIN payment_receipts r ON r.topup_id=t.id WHERE t.user_id=$1 ORDER BY (t.status='pending') DESC,t.id DESC LIMIT 100",[id])
 ]);
 res.set('Cache-Control','private, no-store').json({available:Number(balance.total)-Number(balance.prepaid),walletBalance:Number(balance.total),prepaid:Number(balance.prepaid),earned:Number(totals.earned),lost:Number(totals.lost),withdrawalTotals,eligible:commissionEligible(req.user),expiresAt:req.user.expires_at,referralUrl:(process.env.PUBLIC_BASE_URL||'https://live.cd.com.py').replace(/\/$/,'')+'/?ref='+encodeURIComponent(req.user.affiliate_code||req.user.username),plan:MONTHLY_PLAN,referrals,commissions,withdrawals,payments,movements,topups});
}));
router.post('/affiliate/payments',requireAuth,h(async(req,res)=>{
 const key=uuid(req.body?.requestKey),reference=text(req.body?.reference,120);if(!reference)throw fail(400,'Ingresá la referencia de tu pago');
 const p=await tx(async c=>{
  await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
  const old=(await c.query("SELECT * FROM subscription_payments WHERE user_id=$1 AND request_key=$2 AND method='bank'",[req.user.id,key])).rows[0];
  if(old)return old;
  const payment=(await c.query('INSERT INTO subscription_payments(user_id,amount_gs,duration_days,reference,request_key) VALUES($1,$2,$3,$4,$5) RETURNING *',[req.user.id,MONTHLY_PLAN.amount,MONTHLY_PLAN.durationDays,reference,key])).rows[0];
  await attachReceipt(c,req.user.id,req.body?.receiptId,payment.id,'payment');
  const admins=(await c.query("SELECT id FROM users WHERE role='admin' AND status='active'")).rows;
  for(const a of admins)await notify(c,a.id,'payment','Nuevo comprobante de pago',req.user.username+' informó un pago de Gs. 27.500.','payment:'+payment.id+':'+a.id);
  return payment;
 });res.status(201).json(p);
}));
router.post('/affiliate/wallet/renew',requireAuth,h(async(req,res)=>{
 const requestKey=uuid(req.body?.requestKey);
 const expectedExpiry=req.body?.expectedExpiry;
 if(expectedExpiry!==null&&(typeof expectedExpiry!=='string'||!Number.isFinite(Date.parse(expectedExpiry))))throw fail(400,'Falta el vencimiento actual del plan');
 res.status(201).json(await tx(c=>payWithWallet(c,req.user.id,{requestKey,expectedExpiry:expectedExpiry===null?null:new Date(expectedExpiry).toISOString()})));
}));

export async function requestTopup(c,userId,{amount,reference,requestKey,receiptId}={}){
 amount=wholeGs(amount);requestKey=uuid(requestKey);reference=text(reference,120);
 if(!reference)throw fail(400,'Ingresá la referencia de la transferencia');
 const user=(await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[userId])).rows[0];
 if(!validWalletUser(user))throw fail(409,'La cuenta no puede cargar saldo');
 const previous=(await c.query('SELECT * FROM wallet_topups WHERE user_id=$1 AND request_key=$2',[userId,requestKey])).rows[0];
 if(previous)return previous;
 const provider=(await c.query("SELECT * FROM users WHERE role='admin' ORDER BY id LIMIT 1")).rows[0];
 const bank=provider&&bankOf(provider);
 if(!bank?.bankName||!bank.bankHolder||(!bank.bankAccount&&!bank.bankAlias))throw fail(409,'El administrador debe completar los datos de cobro');
 const topup=(await c.query('INSERT INTO wallet_topups(user_id,amount_gs,reference,request_key,bank_snapshot) VALUES($1,$2,$3,$4,$5) RETURNING *',
  [userId,amount,reference,requestKey,JSON.stringify(bank)])).rows[0];
 await attachReceipt(c,userId,receiptId,topup.id,'topup');
 await notify(c,provider.id,'topup','Nueva recarga de billetera','Hay un comprobante de recarga pendiente de revisión.','topup:'+topup.id,'/cuenta?section=administracion');
 return topup;
}

export async function resolveTopup(c,id,adminId,{status,reference,note}={}){
 if(!['approved','rejected'].includes(status))throw fail(400,'Estado inválido');
 const topup=(await c.query('SELECT * FROM wallet_topups WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!topup)throw fail(404,'Recarga no encontrada');
 if(topup.status===status)return topup;
 if(topup.status!=='pending')throw fail(409,'La recarga ya fue resuelta');
 let confirmed=null;
 if(status==='approved'){
  const user=(await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[topup.user_id])).rows[0];
  if(!validWalletUser(user))throw fail(409,'La cuenta no puede recibir saldo');
  confirmed=text(reference,120);
  if(!confirmed)throw fail(400,'Ingresá la referencia bancaria confirmada');
  await confirmBankReference(c,confirmed);
  await c.query("INSERT INTO affiliate_ledger(user_id,amount_gs,kind,topup_id) VALUES($1,$2,'topup',$3)",[topup.user_id,topup.amount_gs,topup.id]);
 }
 await notify(c,topup.user_id,'topup',status==='approved'?'Recarga acreditada':'Recarga rechazada',
  status==='approved'?'Tu saldo ya está disponible para pagar LiveTV.':text(note)||'Consultá con el administrador para revisar tu comprobante.','topup-result:'+topup.id);
 return (await c.query('UPDATE wallet_topups SET status=$1,approved_reference=$2,note=$3,resolved_by=$4,resolved_at=clock_timestamp() WHERE id=$5 RETURNING *',
  [status,confirmed,text(note)||null,adminId,topup.id])).rows[0];
}

router.post('/affiliate/wallet/topups',requireAuth,h(async(req,res)=>{
 res.status(201).json(await tx(c=>requestTopup(c,req.user.id,req.body)));
}));
router.get('/admin/wallet/topups',requireRole('admin'),h(async(req,res)=>{
 res.set('Cache-Control','private, no-store').json(await many(`SELECT t.*,u.username,u.display_name,r.id AS receipt_id
  FROM wallet_topups t JOIN users u ON u.id=t.user_id LEFT JOIN payment_receipts r ON r.topup_id=t.id
  ORDER BY (t.status='pending') DESC,t.id DESC LIMIT 300`));
}));
router.post('/admin/wallet/topups/:id/resolve',requireRole('admin'),h(async(req,res)=>{
 if(!/^\d{1,18}$/.test(req.params.id))throw fail(400,'Identificador inválido');
 const topup=await tx(c=>resolveTopup(c,req.params.id,req.user.id,req.body));
 const renewal=topup.status==='approved'?await renewIfDue(topup.user_id):null;
 res.json({...topup,renewed:Boolean(renewal)});
}));
router.post('/affiliate/withdrawals',requireAuth,h(async(req,res)=>res.status(201).json(await tx(c=>requestWithdrawal(c,req.user.id,req.body?.amount,req.body?.requestKey,req.body?.bankAccountId)))));
router.get('/admin/affiliates',requireRole('admin'),h(async(req,res)=>{
 const search='%'+text(req.query.search,80)+'%';res.set('Cache-Control','private, no-store').json(await many(`SELECT u.id,u.username,u.display_name,u.status,u.expires_at,u.created_at,
 (SELECT count(*)::int FROM users r WHERE r.parent_id=u.id) AS referrals,
 (SELECT COALESCE(sum(l.amount_gs),0) FROM affiliate_ledger l WHERE l.user_id=u.id) AS available,
 (SELECT COALESCE(sum(c.amount_gs),0) FROM affiliate_commissions c WHERE c.affiliate_id=u.id AND c.state='earned') AS earned
 FROM users u WHERE u.role<>'admin' AND (u.username ILIKE $1 OR u.display_name ILIKE $1) ORDER BY u.id DESC LIMIT 200`,[search]));
}));
router.patch('/admin/affiliates/:id',requireRole('admin'),h(async(req,res)=>{
 const status=req.body?.status;if(!['active','disabled'].includes(status))throw fail(400,'Estado inválido');
 const row=await one(`UPDATE users SET status=$1 WHERE id=$2 AND role<>'admin' RETURNING id,status`,[status,req.params.id]);if(!row)throw fail(404,'Afiliado no encontrado');res.json(row);
}));
router.get('/admin/affiliate-requests',requireRole('admin'),h(async(req,res)=>{
 const [payments,withdrawals,summary]=await Promise.all([
  many("SELECT p.*,u.username,(SELECT id FROM payment_receipts r WHERE r.payment_id=p.id) AS receipt_id FROM subscription_payments p JOIN users u ON u.id=p.user_id ORDER BY (p.status='pending') DESC,p.id DESC LIMIT 300"),
  many("SELECT w.*,u.username FROM affiliate_withdrawals w JOIN users u ON u.id=w.user_id ORDER BY (w.status='pending') DESC,w.id DESC LIMIT 300"),
  one(`SELECT (SELECT COALESCE(sum(amount_gs),0) FROM affiliate_ledger) AS available,(SELECT COALESCE(sum(amount_gs),0) FROM affiliate_withdrawals WHERE status='pending') AS pending,(SELECT COALESCE(sum(amount_gs),0) FROM affiliate_withdrawals WHERE status='paid') AS paid,(SELECT COALESCE(sum(amount_gs),0) FROM affiliate_commissions WHERE state='earned') AS earned`)
 ]);res.set('Cache-Control','private, no-store').json({payments,withdrawals,summary});
}));
router.post('/admin/affiliate-payments/:id/approve',requireRole('admin'),h(async(req,res)=>res.json(await tx(c=>approvePayment(c,req.params.id,req.user.id,req.body?.reference)))));
router.post('/admin/affiliate-payments/:id/reject',requireRole('admin'),h(async(req,res)=>{
 const row=await tx(async c=>{const p=(await c.query(`UPDATE subscription_payments SET status='rejected',note=$1,resolved_at=now(),resolved_by=$2 WHERE id=$3 AND status='pending' RETURNING *`,[text(req.body?.note),req.user.id,req.params.id])).rows[0];if(!p)throw fail(409,'La solicitud ya fue resuelta');await notify(c,p.user_id,'payment','Tu pago necesita revisión',text(req.body?.note)||'Contactá al administrador para revisar el comprobante.','payment-rejected:'+p.id);return p;});
 await renewIfDue(row.user_id);res.json(row);
}));
router.post('/admin/affiliate-withdrawals/:id/resolve',requireRole('admin'),h(async(req,res)=>{
 const row=await tx(c=>resolveWithdrawal(c,req.params.id,req.user.id,req.body?.status,req.body?.reference,req.body?.note));
 if(row.status==='rejected')await renewIfDue(row.user_id);
 res.json(row);
}));
// Credits remain archived; old endpoints cannot mint money or activate plans.
router.use((req,res,next)=>/^\/(?:reseller(?:\/|$)|credit-requests(?:\/|$)|admin\/(?:resellers|credit-requests)(?:\/|$))/.test(req.path)?res.status(410).json({error:'La gestión por créditos fue reemplazada por Afiliados y billetera'}):next());
export default router;
