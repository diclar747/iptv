import express from 'express';
import {randomUUID} from 'node:crypto';
import {many,one,tx} from './pg.js';
import {requireRole,hashPassword,publicUser} from './auth.js';
import {approvePayment} from './affiliates.js';
import {notify} from './notifications.js';
const router=express.Router(),fail=(status,message)=>Object.assign(Error(message),{status});
const h=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(e=>{if(!e.status&&e.code!=='23505')console.error('[affiliate-admin]',e.message);res.status(e.status||(e.code==='23505'?409:500)).json({error:e.status?e.message:e.code==='23505'?'Ese usuario, correo o referencia ya está registrado':'No se pudo guardar'});});
const cut=(v,n=120)=>String(v||'').trim().slice(0,n)||null;
const audit=(c,user,actor,action,details={})=>c.query('INSERT INTO affiliate_admin_audit(user_id,actor_id,action,details) VALUES($1,$2,$3,$4)',[user,actor,action,JSON.stringify(details)]);
router.use('/admin/affiliates',requireRole('admin'));
router.get('/admin/affiliates',h(async(req,res,next)=>{
 const params=['%'+(cut(req.query.search,80)||'')+'%'];let where="u.role<>'admin' AND (u.username ILIKE $1 OR u.display_name ILIKE $1 OR u.email ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1)";
 if(req.query.account==='deleted')where+=' AND u.deleted_at IS NOT NULL';else where+=' AND u.deleted_at IS NULL';
 if(['active','disabled'].includes(req.query.account)){params.push(req.query.account);where+=' AND u.status=$'+params.length;}
 if(req.query.plan==='active')where+=" AND u.status='active' AND u.expires_at>now()";
 if(req.query.plan==='inactive')where+=" AND (u.status<>'active' OR u.expires_at IS NULL OR u.expires_at<=now())";
 if(req.query.presence==='online')where+=" AND u.last_seen_at>now()-interval '90 seconds'";
 if(req.query.presence==='offline')where+=" AND (u.last_seen_at IS NULL OR u.last_seen_at<=now()-interval '90 seconds')";
 for(const [key,op,offset] of [['from','>=',''],['to','<',"+interval '1 day'"]])if(req.query[key]){if(!/^\d{4}-\d{2}-\d{2}$/.test(req.query[key]))throw fail(400,'Fecha inválida');params.push(req.query[key]);where+=` AND u.created_at ${op} ($${params.length}::date${offset}) AT TIME ZONE 'America/Asuncion'`;}
 const total=Number((await one('SELECT count(*) AS n FROM users u WHERE '+where,params)).n),pages=Math.max(1,Math.ceil(total/20)),page=Math.min(pages,Math.max(1,Math.floor(Number(req.query.page)||1)));
 const rows=await many(`SELECT u.id,u.username,u.display_name,u.email,u.phone,u.status,u.expires_at,u.created_at,u.last_seen_at,u.deleted_at,(u.last_seen_at>now()-interval '90 seconds') AS online,
 (SELECT count(*) FROM users r WHERE r.parent_id=u.id) AS referrals,
 (SELECT COALESCE(sum(amount_gs),0) FROM affiliate_ledger l WHERE l.user_id=u.id) AS available,
 (SELECT COALESCE(sum(amount_gs),0) FROM affiliate_commissions c WHERE c.affiliate_id=u.id AND state='earned') AS earned,
 (SELECT COALESCE(sum(amount_gs),0) FROM subscription_payments p WHERE p.user_id=u.id AND status='approved') AS total_paid
 FROM users u WHERE ${where} ORDER BY u.id DESC LIMIT ${req.query.page?20:200} OFFSET ${(page-1)*20}`,params);
 res.set('Cache-Control','private, no-store').json(req.query.page?{items:rows,total,page,pages,pageSize:20}:rows);
}));
router.get('/admin/affiliates/:id',h(async(req,res)=>{
 const u=await one("SELECT * FROM users WHERE id=$1 AND role<>'admin'",[req.params.id]);if(!u)throw fail(404,'Afiliado no encontrado');
 const [payments,withdrawals,referrals,activations]=await Promise.all([many('SELECT p.*,(SELECT id FROM payment_receipts r WHERE r.payment_id=p.id) AS receipt_id FROM subscription_payments p WHERE user_id=$1 ORDER BY id DESC LIMIT 100',[u.id]),many('SELECT * FROM affiliate_withdrawals WHERE user_id=$1 ORDER BY id DESC LIMIT 100',[u.id]),many('SELECT id,username,display_name,status,expires_at FROM users WHERE parent_id=$1 ORDER BY id DESC LIMIT 100',[u.id]),many('SELECT months,kind,amount_gs,created_at,after_expiry,note FROM admin_plan_activations WHERE user_id=$1 ORDER BY id DESC LIMIT 100',[u.id])]);res.json({user:publicUser(u),deletedAt:u.deleted_at,payments,withdrawals,referrals,activations});
}));
async function save(c,id,b,actor){
 const old=id?(await c.query("SELECT * FROM users WHERE id=$1 AND role<>'admin' FOR UPDATE",[id])).rows[0]:null;
 if(id&&!old)throw fail(404,'Afiliado no encontrado');
 const username=cut(b.username??old?.username,40)?.toLowerCase();if(!/^[a-z0-9_.-]{3,40}$/.test(username||''))throw fail(400,'Usuario: 3 a 40 letras, números, punto o guion');
 const email=cut(b.email??old?.email,160)?.toLowerCase();if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(400,'Correo inválido');
 const alias=(await c.query('SELECT user_id FROM affiliate_referral_aliases WHERE alias=$1',[username])).rows[0];if(alias&&String(alias.user_id)!==String(id))throw fail(409,'Ese nombre está reservado');
 const password=b.password;if((!old||password)&&(typeof password!=='string'||password.length<8||password.length>128))throw fail(400,'La contraseña debe tener entre 8 y 128 caracteres');
 const fields={display_name:'displayName',first_name:'firstName',last_name:'lastName',phone:'phone',address:'address',bank_name:'bankName',bank_holder:'bankHolder',bank_account:'bankAccount',bank_alias:'bankAlias',bank_doc:'bankDoc'};
 const values=[username,email],sets=['username=$1','email=$2'];for(const [column,key] of Object.entries(fields)){values.push(cut(b[key]??old?.[column],column==='address'?200:120));sets.push(column+'=$'+values.length);}
 if(password){const {hash,salt}=hashPassword(password);values.push(hash,salt);sets.push('pass_hash=$'+(values.length-1),'pass_salt=$'+values.length);}
 let row;if(old){values.push(id);row=(await c.query('UPDATE users SET '+sets.join(',')+' WHERE id=$'+values.length+' RETURNING *',values)).rows[0];if(password)await c.query('DELETE FROM app_sessions WHERE user_id=$1',[id]);}else{const columns=sets.map(v=>v.split('=')[0]);row=(await c.query('INSERT INTO users('+columns.join(',')+",role,created_by) VALUES("+values.map((_,i)=>'$'+(i+1)).join(',')+",'client',$"+(values.length+1)+') RETURNING *',[...values,actor])).rows[0];}
 await c.query('INSERT INTO affiliate_referral_aliases(alias,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[username,row.id]);await audit(c,row.id,actor,old?'edit':'create',{passwordChanged:!!password});return publicUser(row);
}
router.post('/admin/affiliates',h(async(req,res)=>res.status(201).json(await tx(c=>save(c,null,req.body||{},req.user.id)))));
router.patch('/admin/affiliates/:id',h(async(req,res)=>{
 res.json(await tx(async c=>{if(req.body?.status){if(!['active','disabled'].includes(req.body.status))throw fail(400,'Estado inválido');const row=(await c.query("UPDATE users SET status=$1 WHERE id=$2 AND role<>'admin' AND deleted_at IS NULL RETURNING *",[req.body.status,req.params.id])).rows[0];if(!row)throw fail(404,'Cuenta no encontrada');if(req.body.status==='disabled')await c.query('DELETE FROM app_sessions WHERE user_id=$1',[row.id]);await audit(c,row.id,req.user.id,req.body.status);return publicUser(row);}return save(c,req.params.id,req.body||{},req.user.id);}));
}));
router.delete('/admin/affiliates/:id',h(async(req,res)=>res.json(await tx(async c=>{const u=(await c.query("UPDATE users SET deleted_at=now(),status='disabled' WHERE id=$1 AND role<>'admin' RETURNING id",[req.params.id])).rows[0];if(!u)throw fail(404,'Cuenta no encontrada');await c.query('DELETE FROM app_sessions WHERE user_id=$1',[u.id]);await audit(c,u.id,req.user.id,'delete');return {ok:true};}))));
router.post('/admin/affiliates/:id/restore',h(async(req,res)=>res.json(await tx(async c=>{const u=(await c.query("UPDATE users SET deleted_at=NULL,status='disabled' WHERE id=$1 AND role<>'admin' RETURNING id",[req.params.id])).rows[0];if(!u)throw fail(404,'Cuenta no encontrada');await audit(c,u.id,req.user.id,'restore');return {ok:true};}))));
router.post('/admin/affiliates/:id/activate',h(async(req,res)=>{
 const months=Number(req.body?.months),kind=req.body?.kind,key=req.body?.requestKey,reference=cut(req.body?.reference),note=cut(req.body?.note,500);
 if(![1,2,3,6,12].includes(months)||!['paid','courtesy'].includes(kind)||! /^[a-f0-9-]{36}$/i.test(key||''))throw fail(400,'Datos de activación inválidos');if(kind==='paid'&&!reference)throw fail(400,'Indicá la referencia del pago recibido');if(kind==='courtesy'&&!note)throw fail(400,'Indicá el motivo de la cortesía');
 res.json(await tx(async c=>{
 // Lock user first, then the new payment. Existing payments are reviewed in Solicitudes.
 const u=(await c.query("SELECT * FROM users WHERE id=$1 AND role<>'admin' AND deleted_at IS NULL FOR UPDATE",[req.params.id])).rows[0];if(!u)throw fail(404,'Cuenta no encontrada');
 const prior=(await c.query('SELECT * FROM admin_plan_activations WHERE user_id=$1 AND request_key=$2',[u.id,key])).rows[0];if(prior)return prior;
 if((await c.query("SELECT id FROM subscription_payments WHERE user_id=$1 AND status='pending'",[u.id])).rows.length)throw fail(409,'Este usuario ya tiene un pago pendiente. Revisalo en Solicitudes.');
 await c.query("UPDATE users SET status='active' WHERE id=$1",[u.id]);let payment=null;
 if(kind==='paid'){payment=(await c.query('INSERT INTO subscription_payments(user_id,amount_gs,duration_days,reference,request_key) VALUES($1,$2,$3,$4,$5) RETURNING id',[u.id,months*27500,months*30,reference,key])).rows[0];await approvePayment(c,payment.id,req.user.id,reference);}
 else{await c.query("UPDATE users SET expires_at=GREATEST(COALESCE(expires_at,now()),now())+($1*interval '30 days'),package_name='LiveTV',max_connections=1 WHERE id=$2",[months,u.id]);await notify(c,u.id,'plan','Tu plan fue activado','Se agregaron '+months+' meses de cortesía.','activation:'+key);}
 const after=(await c.query('SELECT expires_at FROM users WHERE id=$1',[u.id])).rows[0].expires_at;
 const result=(await c.query('INSERT INTO admin_plan_activations(user_id,actor_id,request_key,months,kind,payment_id,amount_gs,before_expiry,after_expiry,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[u.id,req.user.id,key,months,kind,payment?.id||null,kind==='paid'?months*27500:0,u.expires_at,after,note])).rows[0];await audit(c,u.id,req.user.id,'activate',{months,kind,paymentId:payment?.id});return result;
 }));
}));
export default router;
