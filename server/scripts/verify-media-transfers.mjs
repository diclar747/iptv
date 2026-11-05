import '../src/env.js';
import assert from 'node:assert/strict';import express from 'express';import {randomUUID,createHash} from 'node:crypto';import {readFile,rm,mkdtemp} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {initSchema,one,query} from '../src/pg.js';import {attachUser,createSession} from '../src/auth.js';import router,{CHUNK_BYTES,recoverTransferredJobs} from '../src/media-transfers.js';import {assetDirectory} from '../src/youtube-downloader.js';
import library from '../src/media-library.js';
import catalog from '../src/catalog.js';
await initSchema();const admin=await one("SELECT id FROM users WHERE role='admin' AND status='active' LIMIT 1");assert.ok(admin);
const app=express();app.use(express.json(),attachUser);app.use('/api',router,catalog,library);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
const auth={cookie:'sid='+createSession(admin.id)},jobs=[],devices=[],sha=b=>createHash('sha256').update(b).digest('hex');let codeHash;
async function call(route,{method='GET',body,headers=auth,status=200}={}){const raw=Buffer.isBuffer(body);const r=await fetch(base+'/api'+route,{method,headers:{...headers,...(body?{'Content-Type':raw?'application/octet-stream':'application/json'}:{})},body:body===undefined?undefined:raw?body:JSON.stringify(body)});const j=await r.json();assert.equal(r.status,status,JSON.stringify(j));return j;}
const options={mode:'upload',title:'Fixture transferencia '+Date.now(),category:'Películas',kind:'movie',authorized:true,rightsBasis:'owner',size:CHUNK_BYTES+128};const movieIds=[],temp=await mkdtemp(path.join(os.tmpdir(),'livetv-media-fixture-'));
try{
 await call('/admin/media-devices',{headers:{},status:401});
 const pair=await call('/admin/media-devices/pair',{method:'POST',body:{}});codeHash=sha(pair.code);
 const d=await call('/companion/pair',{method:'POST',body:{code:pair.code,name:'Fixture asistente'},headers:{}});devices.push(d.id);assert.ok(d.token.startsWith('ltv_'));const token={Authorization:'Bearer '+d.token};
 await call('/companion/pair',{method:'POST',body:{code:pair.code},headers:{},status:401});
 const listing=await call('/admin/media-devices');assert.ok(!JSON.stringify(listing).includes(d.token));
 await call('/admin/media-transfers',{method:'POST',body:{...options,authorized:false},status:400});
 const upload=await call('/admin/media-transfers',{method:'POST',body:options,status:201});jobs.push(upload.id);
 await call('/companion/jobs/'+upload.id,{headers:token,status:404});
 const bytes=Buffer.alloc(CHUNK_BYTES+128,0x41);bytes.writeUInt32BE(24,0);bytes.write('ftyp',4);bytes.write('isom',8);
 const chunk=bytes.subarray(0,CHUNK_BYTES),headers={...auth,'X-Upload-Offset':'0','X-Chunk-SHA256':sha(chunk)};
 await call('/admin/media-transfers/'+upload.id+'/chunk',{method:'PUT',body:chunk,headers:{...headers,'X-Chunk-SHA256':'wrong'},status:400});
 assert.equal((await call('/admin/media-transfers/'+upload.id+'/chunk',{method:'PUT',body:chunk,headers})).offset,CHUNK_BYTES);
 await call('/admin/media-transfers/'+upload.id+'/chunk',{method:'PUT',body:chunk,headers,status:409});
 assert.equal((await call('/admin/media-transfers/'+upload.id)).offset,CHUNK_BYTES,'Resume offset survives a new request');
 await call('/admin/media-transfers/'+upload.id+'/finish',{method:'POST',body:{},status:409});
 const last=bytes.subarray(CHUNK_BYTES);await call('/admin/media-transfers/'+upload.id+'/chunk',{method:'PUT',body:last,headers:{...auth,'X-Upload-Offset':String(CHUNK_BYTES),'X-Chunk-SHA256':sha(last)}});
 assert.equal(sha(await readFile(path.join(assetDirectory(upload.id),'upload.part'))),sha(bytes),'Chunks must append without overwriting the first bytes');
 await call('/admin/media-transfers/'+upload.id+'/finish',{method:'POST',body:{sha256:'bad'},status:400});
 await call('/admin/media-transfers/'+upload.id+'/cancel',{method:'POST',body:{}});await assert.rejects(readFile(path.join(assetDirectory(upload.id),'upload.part')));
 const source=randomUUID().replaceAll('-','').slice(0,11),link={...options,mode:'companion',deviceId:d.id,url:'https://youtu.be/'+source};
 const queued=await call('/admin/media-transfers',{method:'POST',body:link,status:201});jobs.push(queued.id);assert.equal(queued.state,'awaiting_device');
 await call('/admin/media-transfers',{method:'POST',body:link,status:409});
 const next=await call('/companion/next',{headers:token});assert.equal(next.job.id,queued.id);assert.equal((await call('/companion/next',{headers:token})).job.id,queued.id,'Reconnect receives the same unfinished job');
 await call('/companion/jobs/'+queued.id+'/prepare',{method:'POST',body:{size:64,metadata:{id:'wrong'}},headers:token,status:400});
 await call('/companion/jobs/'+queued.id+'/prepare',{method:'POST',body:{size:64,metadata:{id:source,title:'Original',uploader:'Autor',description:'Sinopsis',thumbnail:'https://example.test/cover.jpg'}},headers:token});
 await call('/companion/jobs/'+queued.id+'/progress',{method:'POST',body:{progress:20},headers:token});
 await call('/admin/media-devices/'+d.id,{method:'DELETE'});
 await call('/companion/next',{headers:token,status:401});assert.equal((await one('SELECT state FROM media_import_jobs WHERE id=$1',[queued.id])).state,'cancelled');
 if(process.env.FFMPEG_BIN&&process.env.FFPROBE_BIN){
  const exec=promisify(execFile),input=path.join(temp,'synthetic.mkv');
  await exec(process.env.FFMPEG_BIN,['-v','error','-y','-f','lavfi','-i','color=c=blue:s=320x180:r=12','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','1','-c:v','libvpx-vp9','-c:a','libopus',input],{timeout:30000});
  const source=await readFile(input),u=await call('/admin/media-transfers',{method:'POST',body:{...options,size:source.length},status:201});jobs.push(u.id);
  await call('/admin/media-transfers/'+u.id+'/chunk',{method:'PUT',body:source,headers:{...auth,'X-Upload-Offset':'0','X-Chunk-SHA256':sha(source)}});
  await call('/admin/media-transfers/'+u.id+'/finish',{method:'POST',body:{sha256:sha(source)},status:202});
  let status;for(let i=0;i<60;i++){status=await call('/admin/media-transfers/'+u.id);if(['done','error'].includes(status.state))break;await new Promise(r=>setTimeout(r,500));}
  assert.equal(status.state,'done',status.error);movieIds.push(status.movieId);
  const asset=await one('SELECT * FROM media_assets WHERE id=$1',[u.id]);assert.ok(asset.size_bytes>24);assert.equal(asset.metadata.sourceSha256,sha(source));
  assert.equal(asset.video_name,'video.webm');
  const output=path.join(assetDirectory(u.id),asset.video_name);
  const {stdout}=await exec(process.env.FFPROBE_BIN,['-v','error','-show_streams','-of','json',output]);const streams=JSON.parse(stdout).streams;assert.equal(streams.find(s=>s.codec_type==='video').codec_name,'vp9');assert.equal(streams.find(s=>s.codec_type==='audio').codec_name,'opus');
  async function packets(file){const {stdout}=await exec(process.env.FFPROBE_BIN,['-v','error','-show_packets','-show_entries','packet=codec_type,data_hash','-show_data_hash','sha256','-of','json',file]);return JSON.parse(stdout).packets;}
  assert.deepEqual(await packets(output),await packets(input),'Encoded video/audio packets must remain identical: no recoding');
  const privateFile=await fetch(base+'/api/library/'+u.id+'/video.webm');assert.equal(privateFile.status,401);
  const range=await fetch(base+'/api/library/'+u.id+'/video.webm',{headers:{...auth,Range:'bytes=0-3'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-type'),'video/webm');assert.equal(Buffer.from(await range.arrayBuffer()).toString('hex'),'1a45dfa3');
  const cover=await fetch(base+'/api/library/'+u.id+'/cover.jpg',{headers:auth});assert.equal(cover.status,200);
  const mp4=path.join(temp,'original.mp4');await exec(process.env.FFMPEG_BIN,['-v','error','-y','-i',input,'-c:v','libx264','-c:a','aac',mp4]);const original=await readFile(mp4);
  const direct=await call('/admin/media-transfers',{method:'POST',body:{...options,size:original.length},status:201});jobs.push(direct.id);
  await call('/admin/media-transfers/'+direct.id+'/chunk',{method:'PUT',body:original,headers:{...auth,'X-Upload-Offset':'0','X-Chunk-SHA256':sha(original)}});
  await query("UPDATE media_import_jobs SET state='publishing' WHERE id=$1",[direct.id]);
  await Promise.all([recoverTransferredJobs({all:true}),recoverTransferredJobs({all:true})]);
  for(let i=0;i<60;i++){status=await call('/admin/media-transfers/'+direct.id);if(['done','error'].includes(status.state))break;await new Promise(r=>setTimeout(r,500));}assert.equal(status.state,'done',status.error);movieIds.push(status.movieId);
  assert.equal(sha(await readFile(path.join(assetDirectory(direct.id),'video.mp4'))),sha(original),'MP4 must be published byte-for-byte unchanged');
  console.log('PASS: recuperación tras reinicio sin duplicar; MP4 original idéntico byte por byte; MKV VP9/Opus publicado como WebM con paquetes idénticos, sin recodificación; portada, privacidad y Range.');
 }
 console.log('PASS: vinculación única, autenticación, permisos, dispositivos limitados a sus trabajos, cola durable, duplicados, fragmentos SHA-256, reanudación, segundo fragmento, rechazo de archivos incompletos, cancelación y revocación.');
}finally{
 for(const id of movieIds)await query('DELETE FROM movies WHERE id=$1',[id]);
 for(const id of jobs){await query('DELETE FROM media_import_jobs WHERE id=$1',[id]);await rm(assetDirectory(id),{recursive:true,force:true});}
 for(const id of devices)await query('DELETE FROM media_devices WHERE id=$1',[id]);if(codeHash)await query('DELETE FROM media_pairings WHERE code_hash=$1',[codeHash]);server.closeAllConnections();await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true});
}
