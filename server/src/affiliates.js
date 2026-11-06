import express from 'express';
import {many,one,tx} from './pg.js';
import {requireAuth,requireRole} from './auth.js';
import {MONTHLY_PLAN,commissionEligible,commissionAmount,wholeGs} from './affiliate-policy.js';
const router=express.Router();
const fail=(status,message)=>Object.assign(Error(message),{status});
const h=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(e=>{if(!e.status&&e.code!=='23505')console.error('[affiliates]',e);res.status(e.status||(e.code==='23505'?409:500)).json({error:e.status?e.message:e.code==='23505'?'Ya existe una solicitud o referencia de pago igual':'No se pudo completar la operación'});});
const uuid=value=>{if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value||''))throw fail(400,'Falta la identificación de la solicitud');return value;};
const text=(value,max=500)=>typeof value==='string'?value.trim().slice(0,max):'';
const bankOf=u=>({bankName:u.bank_name||'',bankHolder:u.bank_holder||'',bankAccount:u.bank_account||'',bankAlias:u.bank_alias||'',bankDoc:u.bank_doc||''});

// Caller owns the transaction. Row locks and unique ledger keys prevent duplicate money.
export async function approvePayment(c,id,adminId,reference){
 const p=(await c.query('SELECT * FROM subscription_payments WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!p)throw fail(404,'Pago no encontrado');
 if(p.status==='approved')return p;
 if(p.status!=='pending')throw fail(409,'El pago ya fue rechazado');
 const owner=(await c.query('SELECT parent_id FROM users WHERE id=$1',[p.user_id])).rows[0];
 const ids=[p.user_id,owner?.parent_id].filter(Boolean).sort((a,b)=>Number(a)-Number(b));
 const users=(await c.query('SELECT * FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids])).rows;
 const approvedAt=(await c.query('SELECT clock_timestamp() AS at')).rows[0].at;
 const user=users.find(u=>String(u.id)===String(p.user_id));
 if(!user||user.status!=='active')throw fail(409,'La cuenta del cliente está bloqueada');
 const ref=users.find(u=>String(u.id)===String(user.parent_id));
 const approvedReference=text(reference||p.reference,120);if(!approvedReference)throw fail(400,'Ingresá la referencia bancaria confirmada');
 // Inspect eligibility BEFORE extending the referred user's plan.
 if(ref&&String(ref.id)!==String(user.id)){
  const earned=commissionEligible(ref,new Date(approvedAt).getTime()),amount=commissionAmount(p.amount_gs);
  const commission=(await c.query(`INSERT INTO affiliate_commissions(payment_id,affiliate_id,referred_id,amount_gs,state,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[p.id,ref.id,user.id,amount,earned?'earned':'lost',earned?null:'Plan del afiliado inactivo al aprobarse el pago'])).rows[0];
  if(earned)await c.query(`INSERT INTO affiliate_ledger(user_id,amount_gs,kind,commission_id) VALUES($1,$2,'commission',$3)`,[ref.id,amount,commission.id]);
 }
 await c.query(`UPDATE users SET expires_at=GREATEST(COALESCE(expires_at,clock_timestamp()),clock_timestamp())+($1::int*interval '1 day'),package_name=$2,max_connections=1 WHERE id=$3`,[p.duration_days,MONTHLY_PLAN.name,user.id]);
 return (await c.query(`UPDATE subscription_payments SET status='approved',approved_reference=$1,resolved_by=$2,resolved_at=clock_timestamp() WHERE id=$3 RETURNING *`,[approvedReference,adminId,p.id])).rows[0];
}
export async function requestWithdrawal(c,userId,amount,key){
 amount=wholeGs(amount);uuid(key);
 const u=(await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[userId])).rows[0];
 const prior=(await c.query('SELECT * FROM affiliate_withdrawals WHERE user_id=$1 AND request_key=$2',[userId,key])).rows[0];if(prior)return prior;
 const bank=bankOf(u);if(!bank.bankName||!bank.bankHolder||(!bank.bankAccount&&!bank.bankAlias))throw fail(400,'Completá banco, titular y cuenta o alias en tus datos bancarios');
 const balance=Number((await c.query('SELECT COALESCE(sum(amount_gs),0) AS n FROM affiliate_ledger WHERE user_id=$1',[userId])).rows[0].n);
 if(balance<amount)throw fail(409,'El monto supera tu dinero disponible');
 const w=(await c.query('INSERT INTO affiliate_withdrawals(user_id,amount_gs,request_key,bank_snapshot) VALUES($1,$2,$3,$4) RETURNING *',[userId,amount,key,JSON.stringify(bank)])).rows[0];
 await c.query(`INSERT INTO affiliate_ledger(user_id,amount_gs,kind,withdrawal_id) VALUES($1,$2,'withdrawal',$3)`,[userId,-amount,w.id]);return w;
}
export async function resolveWithdrawal(c,id,adminId,status,reference,note){
 const w=(await c.query('SELECT * FROM affiliate_withdrawals WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!w)throw fail(404,'Retiro no encontrado');
 if(w.status===status)return w;if(w.status!=='pending')throw fail(409,'El retiro ya fue resuelto');
 await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[w.user_id]);
 if(status==='paid'&&!text(reference,120))throw fail(400,'Ingresá la referencia de la transferencia realizada');
 if(!['paid','rejected'].includes(status))throw fail(400,'Estado inválido');
 if(status==='rejected')await c.query(`INSERT INTO affiliate_ledger(user_id,amount_gs,kind,withdrawal_id) VALUES($1,$2,'release',$3)`,[w.user_id,w.amount_gs,w.id]);
 return (await c.query('UPDATE affiliate_withdrawals SET status=$1,payment_reference=$2,note=$3,resolved_by=$4,resolved_at=clock_timestamp() WHERE id=$5 RETURNING *',[status,text(reference,120)||null,text(note)||null,adminId,id])).rows[0];
}
router.get('/affiliate/me',requireAuth,h(async(req,res)=>{
 const id=req.user.id;
 const [balance,totals,referrals,commissions,withdrawals,payments,movements,withdrawalTotals]=await Promise.all([
  one('SELECT COALESCE(sum(amount_gs),0) AS available FROM affiliate_ledger WHERE user_id=$1',[id]),
  one(`SELECT COALESCE(sum(amount_gs) FILTER(WHERE state='earned'),0) AS earned,COALESCE(sum(amount_gs) FILTER(WHERE state='lost'),0) AS lost FROM affiliate_commissions WHERE affiliate_id=$1`,[id]),
  many(`SELECT id,username,display_name,created_at,expires_at,status,(SELECT count(*) FROM subscription_payments p WHERE p.user_id=u.id AND p.status='approved') AS payments FROM users u WHERE parent_id=$1 ORDER BY created_at DESC LIMIT 200`,[id]),
  many(`SELECT c.*,u.username AS referred FROM affiliate_commissions c JOIN users u ON u.id=c.referred_id WHERE c.affiliate_id=$1 ORDER BY c.id DESC LIMIT 100`,[id]),
  many("SELECT * FROM affiliate_withdrawals WHERE user_id=$1 ORDER BY (status='pending') DESC,id DESC LIMIT 100",[id]),
  many('SELECT * FROM subscription_payments WHERE user_id=$1 ORDER BY id DESC LIMIT 100',[id]),
  many('SELECT * FROM affiliate_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 100',[id]),
  one(`SELECT COALESCE(sum(amount_gs) FILTER(WHERE status='pending'),0) AS pending,COALESCE(sum(amount_gs) FILTER(WHERE status='paid'),0) AS paid FROM affiliate_withdrawals WHERE user_id=$1`,[id])
 ]);
 res.set('Cache-Control','private, no-store').json({available:Number(balance.available),earned:Number(totals.earned),lost:Number(totals.lost),withdrawalTotals,eligible:commissionEligible(req.user),expiresAt:req.user.expires_at,referralUrl:(process.env.PUBLIC_BASE_URL||'https://live.cd.com.py').replace(/\/$/,'')+'/?ref='+encodeURIComponent(req.user.username),plan:MONTHLY_PLAN,referrals,commissions,withdrawals,payments,movements});
}));
router.post('/affiliate/payments',requireAuth,h(async(req,res)=>{
 const key=uuid(req.body?.requestKey),reference=text(req.body?.reference,120);if(!reference)throw fail(400,'Ingresá la referencia de tu pago');
 const p=await tx(async c=>{await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);const old=(await c.query('SELECT * FROM subscription_payments WHERE user_id=$1 AND request_key=$2',[req.user.id,key])).rows[0];if(old)return old;return (await c.query('INSERT INTO subscription_payments(user_id,amount_gs,duration_days,reference,request_key) VALUES($1,$2,$3,$4,$5) RETURNING *',[req.user.id,MONTHLY_PLAN.amount,MONTHLY_PLAN.durationDays,reference,key])).rows[0];});res.status(201).json(p);
}));
router.post('/affiliate/withdrawals',requireAuth,h(async(req,res)=>res.status(201).json(await tx(c=>requestWithdrawal(c,req.user.id,req.body?.amount,req.body?.requestKey)))));
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
  many("SELECT p.*,u.username FROM subscription_payments p JOIN users u ON u.id=p.user_id ORDER BY (p.status='pending') DESC,p.id DESC LIMIT 300"),
  many("SELECT w.*,u.username FROM affiliate_withdrawals w JOIN users u ON u.id=w.user_id ORDER BY (w.status='pending') DESC,w.id DESC LIMIT 300"),
  one(`SELECT (SELECT COALESCE(sum(amount_gs),0) FROM affiliate_ledger) AS available,(SELECT COALESCE(sum(amount_gs),0) FROM affiliate_withdrawals WHERE status='pending') AS pending,(SELECT COALESCE(sum(amount_gs),0) FROM affiliate_withdrawals WHERE status='paid') AS paid,(SELECT COALESCE(sum(amount_gs),0) FROM affiliate_commissions WHERE state='earned') AS earned`)
 ]);res.set('Cache-Control','private, no-store').json({payments,withdrawals,summary});
}));
router.post('/admin/affiliate-payments/:id/approve',requireRole('admin'),h(async(req,res)=>res.json(await tx(c=>approvePayment(c,req.params.id,req.user.id,req.body?.reference)))));
router.post('/admin/affiliate-payments/:id/reject',requireRole('admin'),h(async(req,res)=>{
 const row=await one(`UPDATE subscription_payments SET status='rejected',note=$1,resolved_at=now(),resolved_by=$2 WHERE id=$3 AND status='pending' RETURNING *`,[text(req.body?.note),req.user.id,req.params.id]);if(!row)throw fail(409,'La solicitud ya fue resuelta');res.json(row);
}));
router.post('/admin/affiliate-withdrawals/:id/resolve',requireRole('admin'),h(async(req,res)=>res.json(await tx(c=>resolveWithdrawal(c,req.params.id,req.user.id,req.body?.status,req.body?.reference,req.body?.note)))));
// Credits remain archived; old endpoints cannot mint money or activate plans.
router.use((req,res,next)=>/^\/(?:reseller(?:\/|$)|credit-requests(?:\/|$)|admin\/(?:resellers|credit-requests)(?:\/|$))/.test(req.path)?res.status(410).json({error:'La gestión por créditos fue reemplazada por Afiliados y billetera'}):next());
export default router;
