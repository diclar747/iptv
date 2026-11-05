import '../src/env.js';
import assert from 'node:assert/strict';import express from 'express';
import {initSchema,query,one} from '../src/pg.js';
import {attachUser,requireActiveViewer,requireRole} from '../src/auth.js';
import accounts from '../src/accounts.js';
await initSchema();const username='trial-fixture-'+Date.now(),password='FixturePass_123';let id;
const app=express();app.use(express.json(),attachUser);app.use('/api',accounts);
app.get('/channel',requireActiveViewer,(req,res)=>res.json({ok:true}));app.get('/radio',requireActiveViewer,(req,res)=>res.json({ok:true}));app.get('/admin',requireRole('admin'),(req,res)=>res.json({ok:true}));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;let cookie='';
async function req(path,method='GET',body,expected=200){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(s=>s.split(';')[0]).join(';');const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data;}
try{
 await req('/api/auth/register','POST',{username:{bad:true},password},400);
 await req('/api/auth/register','POST',{username,password:'123'},400);
 const r=await req('/api/auth/register','POST',{username,password,role:'admin',expires_at:'2099-01-01',max_connections:100},201);id=r.user.id;
 assert.equal(r.user.role,'client');assert.equal(r.user.maxConnections,1);assert.equal(r.user.subscription.active,true);assert.equal(r.user.packageName,'Prueba gratis 24h');assert.equal(r.user.pass_hash,undefined);
 const row=await one('SELECT * FROM users WHERE id=$1',[id]);assert.equal(new Date(row.expires_at)-new Date(row.created_at),86400000);
 await req('/channel');await req('/radio');await req('/admin','GET',undefined,403);
 await req('/api/auth/register','POST',{username,password},409);
 await req('/api/auth/login','POST',{username,password});const reloaded=await req('/api/auth/me');assert.equal(new Date(reloaded.user.expiresAt).getTime(),new Date(row.expires_at).getTime(),'Login must not restart the trial');
 await query("UPDATE users SET expires_at=now()-interval '1 second' WHERE id=$1",[id]);
 await req('/channel','GET',undefined,403);assert.equal((await req('/radio','GET',undefined,403)).reason,'expired');
 await req('/api/auth/login','POST',{username,password});assert.equal((await req('/api/auth/me')).user.subscription.active,false);
 await query("UPDATE users SET status='disabled' WHERE id=$1",[id]);assert.equal((await req('/api/auth/me')).user,null);await req('/api/auth/login','POST',{username,password},403);
 console.log('PASS: registro público, sesión, 24 horas exactas, permisos de cliente, duplicados, acceso a canales/radios y vencimiento sin reinicio al ingresar');
}finally{if(id)await query('DELETE FROM users WHERE id=$1',[id]);server.closeAllConnections();await new Promise(r=>server.close(r));}
