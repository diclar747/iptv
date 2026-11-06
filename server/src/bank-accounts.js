import express from 'express';
import {many,one,tx} from './pg.js';
import {requireAuth} from './auth.js';
const router=express.Router(),h=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
router.get('/affiliate/bank-accounts',requireAuth,h(async(req,res)=>{
 const rows=await many('SELECT id,label,data FROM affiliate_bank_accounts WHERE user_id=$1 AND NOT disabled ORDER BY created_at DESC',[req.user.id]);
 const u=req.user;if(u.bank_name&&u.bank_holder&&(u.bank_account||u.bank_alias))rows.push({id:'profile',label:'Cuenta de mi perfil',data:{bankName:u.bank_name,bankHolder:u.bank_holder,bankAccount:u.bank_account,bankAlias:u.bank_alias,bankDoc:u.bank_doc}});
 res.set('Cache-Control','private, no-store').json(rows);
}));
router.post('/affiliate/bank-accounts',requireAuth,h(async(req,res)=>{
 const data={};for(const k of ['bankName','bankHolder','bankAccount','bankAlias','bankDoc'])data[k]=String(req.body?.[k]||'').trim().slice(0,120);
 if(!data.bankName||!data.bankHolder||(!data.bankAccount&&!data.bankAlias))return res.status(400).json({error:'Completá banco, titular y cuenta o alias'});
 const row=await tx(async c=>{await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);const n=(await c.query('SELECT count(*)::int AS n FROM affiliate_bank_accounts WHERE user_id=$1 AND NOT disabled',[req.user.id])).rows[0].n;if(n>=10)throw Object.assign(Error('Podés registrar hasta 10 cuentas'),{status:400});return (await c.query('INSERT INTO affiliate_bank_accounts(user_id,label,data) VALUES($1,$2,$3) RETURNING id,label,data',[req.user.id,String(req.body?.label||data.bankName).trim().slice(0,80),JSON.stringify(data)])).rows[0];});res.status(201).json(row);
}));
router.delete('/affiliate/bank-accounts/:id',requireAuth,h(async(req,res)=>{
 if(!/^[a-f0-9-]{36}$/i.test(req.params.id))return res.sendStatus(404);
 const row=await one('UPDATE affiliate_bank_accounts SET disabled=true,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id',[req.params.id,req.user.id]);res.status(row?200:404).json({ok:!!row});
}));
export default router;
