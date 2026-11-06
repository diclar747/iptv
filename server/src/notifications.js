import express from 'express';
import {many,one,query} from './pg.js';
import {requireAuth} from './auth.js';
export async function notify(c,userId,kind,title,body,key,link='/afiliados'){
 await c.query('INSERT INTO app_notifications(user_id,kind,title,body,dedupe_key,link) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(dedupe_key) DO NOTHING',[userId,kind,title,body,key,link]);
}
const router=express.Router();
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
router.get('/notifications',requireAuth,h(async(req,res)=>{
 const after=/^\d+$/.test(String(req.query.after||''))?req.query.after:'0';
 const items=await many('SELECT id,kind,title,body,link,created_at FROM app_notifications WHERE (user_id=$1 OR (user_id IS NULL AND created_at>=$2)) AND id>$3 ORDER BY id DESC LIMIT 50',[req.user.id,req.user.created_at,after]);
 const state=await one('SELECT * FROM app_notification_state WHERE user_id=$1',[req.user.id]);
 res.set('Cache-Control','private, no-store').json({userId:req.user.id,items,lastRead:state?.last_read_id||0,enabled:state?.enabled!==false});
}));
router.post('/notifications/read',requireAuth,h(async(req,res)=>{
 const id=String(req.body?.id||'0');if(!/^\d{1,18}$/.test(id))return res.status(400).json({error:'Identificador inválido'});
 await query('INSERT INTO app_notification_state(user_id,last_read_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET last_read_id=GREATEST(app_notification_state.last_read_id,EXCLUDED.last_read_id)',[req.user.id,id]);res.json({ok:true});
}));
export default router;
