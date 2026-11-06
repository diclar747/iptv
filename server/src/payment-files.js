import express from 'express';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {one,query} from './pg.js';
import {requireAuth} from './auth.js';
const router=express.Router();
const root=path.resolve(process.env.MEDIA_STORAGE_DIR||'server/media','_payments');
export const bankFingerprint=u=>createHash('sha256').update(JSON.stringify([u.bank_name,u.bank_holder,u.bank_account,u.bank_alias,u.bank_doc])).digest('hex');
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
router.post('/affiliate/receipts',requireAuth,express.raw({type:'application/octet-stream',limit:'8mb'}),h(async(req,res)=>{
 const b=req.body;
 const mime=Buffer.isBuffer(b)&&b.length>12?(b.subarray(0,3).equals(Buffer.from([255,216,255]))?'image/jpeg':b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'?'image/webp':null):null;
 if(!mime)return res.status(400).json({error:'Elegí una imagen JPG, PNG o WebP de hasta 8 MB'});
 const recent=await one("SELECT count(*)::int AS n FROM payment_receipts WHERE user_id=$1 AND created_at>now()-interval '1 hour'",[req.user.id]);
 if(recent.n>=15)return res.status(429).json({error:'Demasiados comprobantes. Intentá más tarde.'});
 const id=randomUUID(),filename=id+'.'+mime.split('/')[1];await mkdir(root,{recursive:true});
 await writeFile(path.join(root,filename),b,{flag:'wx',mode:0o600});
 try{await query('INSERT INTO payment_receipts(id,user_id,filename,original_name,mime,size_bytes) VALUES($1,$2,$3,$4,$5,$6)',[id,req.user.id,filename,'Comprobante',mime,b.length]);}catch(e){await unlink(path.join(root,filename));throw e;}
 res.status(201).json({id,url:'/api/affiliate/receipts/'+id});
}));
router.get('/affiliate/receipts/:id',requireAuth,h(async(req,res)=>{
 if(!/^[a-f0-9-]{36}$/i.test(req.params.id))return res.sendStatus(404);
 const f=await one('SELECT * FROM payment_receipts WHERE id=$1 AND (user_id=$2 OR $3)',[req.params.id,req.user.id,req.user.role==='admin']);
 if(!f)return res.sendStatus(404);
 res.set({'Content-Type':f.mime,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox"});res.sendFile(path.join(root,path.basename(f.filename)));
}));
router.get('/billing/provider/qr',requireAuth,h(async(req,res)=>{
 const u=await one("SELECT * FROM users WHERE role='admin' ORDER BY id LIMIT 1"),f=await one('SELECT * FROM billing_qr_asset WHERE id=1');
 if(!u||!f||bankFingerprint(u)!==f.bank_fingerprint)return res.sendStatus(404);
 res.set({'Content-Type':'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.sendFile(path.join(root,path.basename(f.filename)));
}));
export default router;
