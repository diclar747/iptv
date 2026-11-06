import '../src/env.js';import assert from 'node:assert/strict';import express from 'express';import {mkdir,writeFile,rm,stat} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {initSchema,one,many,query} from '../src/pg.js';import {attachUser,createSession,requireActiveViewer} from '../src/auth.js';
import {createYoutubeJob,runYoutubeJob,cancelYoutubeJob} from '../src/youtube-import.js';
import {assetDirectory,PUBLIC_BASE} from '../src/youtube-downloader.js';
import library from '../src/media-library.js';import adminRouter from '../src/youtube-admin.js';import movies from '../src/movieAdmin.js';import catalog from '../src/catalog.js';import {streamHandler} from '../src/proxy.js';
await initSchema();const admin=await one("SELECT id FROM users WHERE role='admin' LIMIT 1");assert.ok(admin);
const stamp=Date.now(),ids=[],movieIds=[],sourceIds=[],category='Fixture videos '+stamp;
const app=express();app.use(express.json(),attachUser);app.use('/api',library,adminRouter,movies,catalog);app.get('/api/stream',requireActiveViewer,streamHandler());
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,cookie='sid='+await createSession(admin.id);
async function request(url,method='GET',body,status=200){const r=await fetch(base+url,{method,headers:{cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;}
const source=()=>randomUUID().replaceAll('-','').slice(0,11);
async function job(input={}){const id=source();sourceIds.push(id);const result=await createYoutubeJob({url:'https://www.youtube.com/watch?v='+id,title:'Fixture reciente '+stamp,category,kind:'music',year:1980,authorized:true,rightsBasis:'owner',...input},admin.id,{schedule:false});ids.push(result.id);return result;}
const bytes=Buffer.alloc(64);bytes.writeUInt32BE(24,0);bytes.write('ftyp',4);bytes.write('isom',8);
try{
 const denied=await fetch(base+'/api/admin/youtube');assert.equal(denied.status,401);
 await assert.rejects(createYoutubeJob({url:'https://youtu.be/YE7VzlLtp-4'},admin.id,{schedule:false}),/permiso/);
 await request('/api/admin/media-categories','POST',{name:category},201);
 const current=await job();await assert.rejects(createYoutubeJob({url:current.source_url,category,authorized:true,rightsBasis:'owner'},admin.id,{schedule:false}),/curso/);
 const old=await one("INSERT INTO movies(title,year,stream_url,provider,created_at) VALUES($1,2026,'https://fixture.test/video.mp4','fixture',now()-interval '1 day') RETURNING id",['Fixture anterior '+stamp]);movieIds.push(old.id);
 await query("UPDATE media_import_jobs SET state='downloading' WHERE id=$1",[current.id]);
 await runYoutubeJob(current,{download:async()=>{await mkdir(assetDirectory(current.id),{recursive:true});await writeFile(path.join(assetDirectory(current.id),'video.mp4'),bytes);await writeFile(path.join(assetDirectory(current.id),'video.jpg'),Buffer.from([255,216,255,217]));return {video:'video.mp4',cover:'video.jpg',size:bytes.length,metadata:{id:current.source_id,title:'Original',creator:'Autor de prueba',description:'Descripción original',duration:60,year:null,license:'Contenido propio',sourceUrl:current.source_url}};}});
 const finished=await one('SELECT * FROM media_import_jobs WHERE id=$1',[current.id]);assert.equal(finished.state,'done');assert.equal(finished.progress,100);movieIds.push(finished.movie_id);
 const list=await request('/api/catalog/movies?search='+encodeURIComponent('Fixture '));assert.equal(String(list[0].id),String(finished.movie_id),'Last imported comes first even with older release year');
 const detail=await request('/api/catalog/movies/'+finished.movie_id);assert.equal(detail.creator,'Autor de prueba');assert.equal(detail.originUrl,current.source_url);assert.equal(detail.license,'Contenido propio');assert.equal(detail.category,category);
 const url=detail.streamUrl;assert.ok(url.startsWith(PUBLIC_BASE+'/api/library/'));
 const privateResponse=await fetch(base+new URL(url).pathname);assert.equal(privateResponse.status,401);
 const playable=await fetch(base+'/api/stream?url='+encodeURIComponent(url),{headers:{cookie,Range:'bytes=4-7'}});assert.equal(playable.status,206);assert.equal(await playable.text(),'ftyp');
 const verified=await request('/api/admin/movies/'+finished.movie_id+'/verify','POST',{});assert.equal(verified.status,'online');
 await request('/api/admin/movies/'+finished.movie_id+'/state','PATCH',{hidden:true});const hidden=await fetch(base+new URL(url).pathname,{headers:{cookie}});assert.equal(hidden.status,404);
 await request('/api/admin/movies/'+finished.movie_id+'/state','PATCH',{hidden:false});
 await assert.rejects(createYoutubeJob({url:current.source_url,category,authorized:true,rightsBasis:'owner'},admin.id,{schedule:false}),/biblioteca/);
 const failed=await job();await query("UPDATE media_import_jobs SET state='downloading' WHERE id=$1",[failed.id]);await runYoutubeJob(failed,{download:async()=>{await mkdir(assetDirectory(failed.id),{recursive:true});await writeFile(path.join(assetDirectory(failed.id),'partial'),bytes);throw Error('Fallo simulado');}});assert.equal((await one('SELECT state FROM media_import_jobs WHERE id=$1',[failed.id])).state,'error');await assert.rejects(stat(assetDirectory(failed.id)));
 const cancelled=await job();await cancelYoutubeJob(cancelled.id);assert.equal((await one('SELECT state FROM media_import_jobs WHERE id=$1',[cancelled.id])).state,'cancelled');
 const activeJob=await job();await query("UPDATE media_import_jobs SET state='downloading' WHERE id=$1",[activeJob.id]);
 const running=runYoutubeJob(activeJob,{download:async({signal})=>{await mkdir(assetDirectory(activeJob.id),{recursive:true});if(signal.aborted)throw Object.assign(Error('Cancelado'),{code:'CANCELLED'});return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('Cancelado'),{code:'CANCELLED'})),{once:true}));}});
 await new Promise(r=>setImmediate(r));await cancelYoutubeJob(activeJob.id);await running;assert.equal((await one('SELECT state FROM media_import_jobs WHERE id=$1',[activeJob.id])).state,'cancelled');await assert.rejects(stat(assetDirectory(activeJob.id)));
 console.log('PASS: autorización, categorías, cola, duplicados, publicación atómica, metadatos, orden reciente, archivo privado, Range/seek, verificación local, ocultar/restaurar, errores y cancelación');
}finally{
 for(const id of movieIds){await query("DELETE FROM media_sources WHERE content_type='movie' AND content_id=$1",[id]);await query("DELETE FROM channel_health WHERE channel_id=$1",['movie:'+id]);await query('DELETE FROM movies WHERE id=$1',[id]);}
 for(const id of sourceIds)await query("DELETE FROM external_ids WHERE provider='youtube' AND external_id=$1",[id]);
 for(const id of ids){await query('DELETE FROM media_import_jobs WHERE id=$1',[id]);await rm(assetDirectory(id),{recursive:true,force:true});}
 await query('DELETE FROM media_categories WHERE name=$1',[category]);server.closeAllConnections();await new Promise(r=>server.close(r));
}
