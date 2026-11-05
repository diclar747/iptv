import '../src/env.js';
import assert from 'node:assert/strict';
import express from 'express';
import {initSchema,one,query} from '../src/pg.js';
import {attachUser,createSession} from '../src/auth.js';
import catalog from '../src/catalog.js';
await initSchema();
const stamp=Date.now(),users=[];let comment;
const app=express();app.use(express.json(),attachUser);app.use('/api',catalog);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port+'/api/catalog';
async function req(path,user,method='GET',body,status=200){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(user?{cookie:'sid='+createSession(user.id)}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;}
try {
 for(let i=0;i<2;i++) users.push(await one("INSERT INTO users(username,pass_hash,pass_salt,role,expires_at) VALUES($1,'test','test','client',now()+interval '1 day') RETURNING id",['social-fixture-'+stamp+'-'+i]));
 const [a,b]=users,id='social-fixture-'+stamp;
 await req('/reactions?type=radio&id='+id,null,'GET',undefined,401);
 for(const type of ['radio','channel']) {
  assert.equal((await req('/likes',a,'POST',{type,id,value:1})).likes,1);
  const negative=await req('/likes',a,'POST',{type,id,value:-1});assert.equal(negative.likes,0);assert.equal(negative.dislikes,1);
  assert.equal((await req('/likes',a,'POST',{type,id,value:-1})).dislikes,0);
 }
 comment=await req('/comments',a,'POST',{type:'radio',id,body:'Saludos Paraguay 👋 🇵🇾 <script>alert(1)</script>'});
 await req('/comments',a,'POST',{type:'radio',id,body:'Otro saludo'},429);
 await req('/comments',a,'POST',{type:'radio',id,body:'x'.repeat(501)},400);
 assert.ok(comment.body.includes('👋'));assert.ok(comment.author.startsWith('social-fixture-'));
 let r=await req('/comments/'+comment.id+'/reaction',b,'POST',{emoji:'👍'});assert.equal(r.reactions['👍'],1);
 r=await req('/comments/'+comment.id+'/reaction',b,'POST',{emoji:'❤️'});assert.equal(r.reactions['👍'],undefined);assert.equal(r.reactions['❤️'],1);
 await req('/comments/'+comment.id+'/reaction',a,'POST',{emoji:'❤️'});
 const state=await req('/reactions?type=radio&id='+id,b);assert.equal(state.comments[0].reactions['❤️'],2);assert.equal(state.comments[0].reaction,'❤️');assert.equal(state.comments[0].mine,false);
 await req('/comments/'+comment.id,b,'DELETE');assert.ok(await one('SELECT id FROM comments WHERE id=$1',[comment.id]),'Un usuario no elimina el comentario ajeno');
 await req('/comments/'+comment.id+'/reaction',b,'POST',{emoji:'INVALID'},400);
 await req('/comments',a,'POST',{type:'channel',id,body:'  '},400);
 const removed=await req('/comments/'+comment.id+'/reaction',b,'POST',{emoji:'❤️'});assert.equal(removed.reaction,null);assert.equal(removed.reactions['❤️'],1);
 await req('/comments/'+comment.id,a,'DELETE');assert.equal((await req('/reactions?type=radio&id='+id,a)).comments.length,0);
 await req('/comments/'+comment.id+'/reaction',b,'POST',{emoji:'👍'},404);
 assert.equal((await one('SELECT count(*)::int n FROM comment_reactions WHERE comment_id=$1',[comment.id])).n,0);
 console.log('PASS: sesión, votos excluyentes en canal/radio, emojis, autor, reacciones compartidas, cambio/anulación, permisos de borrado y limpieza de reacciones');
} finally {
 for(const u of users)await query('DELETE FROM users WHERE id=$1',[u.id]);
 server.closeAllConnections();await new Promise(r=>server.close(r));
}
