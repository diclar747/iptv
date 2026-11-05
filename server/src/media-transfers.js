import express from 'express';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdir,stat,open,rename,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {one,many,query,tx} from './pg.js';
import {requireRole} from './auth.js';
import {assetDirectory,MAX_BYTES,sanitizeMetadata,MEDIA_ROOT} from './youtube-downloader.js';
import {createYoutubeJob,publishYoutubeJob,cancelYoutubeJob} from './youtube-import.js';
import {prepareVideo} from './media-preparation.js';

const router=express.Router(),exec=promisify(execFile);
export const CHUNK_BYTES=4*1024*1024;
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const digest=s=>createHash('sha256').update(s).digest('hex');
const fail=(s,status=400)=>Object.assign(Error(s),{status});
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(e=>{if(!e.status)console.error('[media-transfer]',e.code||'',e.message);if(!res.headersSent)res.status(e.status||500).json({error:e.status?e.message:'No se pudo completar la transferencia. Volvé a intentar.'});});
const admin=requireRole('admin');
function options(b){
 if(b.authorized!==true||!['owner','permission','license'].includes(b.rightsBasis))throw fail('Confirmá que tenés permiso para guardar y distribuir el video');
 const category=String(b.category||'').trim();if(!category||category.length>80)throw fail('Elegí una categoría de hasta 80 caracteres');
 return {title:String(b.title||'').trim().slice(0,300),description:String(b.description||'').slice(0,30000),year:Number(b.year)||null,category,kind:['movie','music','documentary','video'].includes(b.kind)?b.kind:'movie',rightsBasis:b.rightsBasis,authorizedAt:new Date().toISOString()};
}
export function validUploadSize(n){return Number.isSafeInteger(n)&&n>24&&n<=MAX_BYTES;}
async function deviceAuth(req,res,next){
 const token=String(req.headers.authorization||'').match(/^Bearer (ltv_[a-f0-9]{64})$/)?.[1];
 if(!token)return res.status(401).json({error:'Vinculá el asistente desde el panel de LiveTV'});
 const d=await one("SELECT d.* FROM media_devices d JOIN users u ON u.id=d.created_by WHERE d.token_hash=$1 AND d.revoked_at IS NULL AND u.status='active' AND u.role='admin'",[digest(token)]);
 if(!d)return res.status(401).json({error:'La computadora fue desconectada. Volvé a vincularla.'});
 req.mediaDevice=d;await query('UPDATE media_devices SET last_seen=now() WHERE id=$1',[d.id]);next();
}
async function access(req,id,client){
 if(!ID.test(id))throw fail('Trabajo no encontrado',404);
 const get=client?async(s,p)=>(await client.query(s,p)).rows[0]:one;
 const j=await get('SELECT * FROM media_import_jobs WHERE id=$1'+(client?' FOR UPDATE':''),[id]);
 if(!j||j.execution==='server'||(req.mediaDevice?(j.execution!=='companion'||j.device_id!==req.mediaDevice.id):req.user?.role!=='admin'))throw fail('Trabajo no encontrado',404);
 return j;
}
async function lock(client,id){await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['media-transfer:'+id]);}
async function fileSize(id){try{return (await stat(path.join(assetDirectory(id),'upload.part'))).size;}catch(e){if(e.code!=='ENOENT')throw e;try{return (await stat(path.join(assetDirectory(id),'video.mp4'))).size;}catch{return 0;}}}
async function freeSpace(size){const {statfs}=await import('node:fs/promises');await mkdir(MEDIA_ROOT,{recursive:true});const s=await statfs(MEDIA_ROOT);if(s.bavail*s.bsize<size+256*1024**2)throw fail('No hay espacio suficiente en el servidor',507);}
async function probeFile(file){try{const {stdout}=await exec(process.env.FFPROBE_BIN||'ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{timeout:30000,maxBuffer:2*1024**2});return JSON.parse(stdout);}catch{throw fail('No se pudo leer el video. Usá un archivo MP4 o MKV válido; el servidor necesita FFprobe.',422);}}
let preparationTail=Promise.resolve();
async function finalizeTransfer(j,{file,probe,checksum}){
 const previous=preparationTail;let release;preparationTail=new Promise(r=>{release=r;});
 const heartbeat=setInterval(()=>void query("UPDATE media_import_jobs SET updated_at=now() WHERE id=$1 AND state='publishing'",[j.id]).catch(()=>{}),10000);heartbeat.unref?.();
 try{
  await previous;
  const dir=assetDirectory(j.id),v=probe.streams.find(s=>s.codec_type==='video'),a=probe.streams.find(s=>s.codec_type==='audio');
  const copyVideo=v.codec_name==='h264'&&['yuv420p','yuvj420p'].includes(v.pix_fmt),copyAudio=!a||['aac','mp3'].includes(a.codec_name);
  await freeSpace(MAX_BYTES);
  const target=path.join(dir,'encoded.mp4'),args=['-v','error','-y','-threads','2','-i',file,'-map','0:v:0','-map','0:a:0?','-c:v',copyVideo?'copy':'libx264'];
  if(!copyVideo)args.push('-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-threads','2','-vf',"scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2");
  args.push('-c:a',copyAudio?'copy':'aac');if(!copyAudio)args.push('-b:a','160k');
  args.push('-movflags','+faststart','-fs',String(MAX_BYTES+1),target);
  let savedAt=0;
  await prepareVideo(process.env.FFMPEG_BIN||'ffmpeg',args,{duration:Number(probe.format?.duration)||0,onProgress:processing=>{if(Date.now()-savedAt<2000)return;savedAt=Date.now();void query("UPDATE media_import_jobs SET progress=$2,processing=$3,updated_at=now() WHERE id=$1 AND state='publishing'",[j.id,processing.percent,processing]).catch(()=>{});}});
  await query("UPDATE media_import_jobs SET processing=$2,progress=99,updated_at=now() WHERE id=$1",[j.id,{phase:'cover',percent:99}]);
  const size=(await stat(target)).size;if(size>MAX_BYTES)throw fail('La copia compatible supera el límite de almacenamiento por video',422);
  const output=await probeFile(target),video=output.streams.find(s=>s.codec_type==='video');
  const duration=Number(output.format?.duration)||null;if(Number(probe.format?.duration)>2&&duration<Number(probe.format.duration)-2)throw fail('La preparación del video quedó incompleta',422);
  const meta={...j.metadata,height:Number(video.height)||null,duration,sourceSha256:checksum};let cover=null;
  try{await exec(process.env.FFMPEG_BIN||'ffmpeg',['-y','-i',target,'-frames:v','1','-vf','scale=640:-2',path.join(dir,'cover.jpg')],{timeout:30000,maxBuffer:1024**2});cover='cover.jpg';}catch{}
  await rename(target,path.join(dir,'video.mp4'));
  await publishYoutubeJob(j,{video:'video.mp4',cover,size,metadata:meta});
  if(path.basename(file)==='upload.part')await rm(file,{force:true}).catch(()=>{});
 }catch(e){console.error('[media-transfer finalize]',j.id,e.code||'',String(e.message).slice(0,200));await query("UPDATE media_import_jobs SET state='error',error=$2,updated_at=now() WHERE id=$1 AND state<>'done'",[j.id,e.status?e.message:'No se pudo preparar el video. Podés reintentar o subir un MP4 H.264/AAC.']);}
 finally{clearInterval(heartbeat);release();}
}

router.get('/admin/media-devices',admin,h(async(req,res)=>res.json(await many('SELECT id,name,created_at,last_seen,revoked_at FROM media_devices ORDER BY created_at DESC'))));
router.post('/admin/media-devices/pair',admin,h(async(req,res)=>{
 const code=randomBytes(8).toString('hex').toUpperCase();
 await query('DELETE FROM media_pairings WHERE expires_at<now() OR created_by=$1',[req.user.id]);
 await query("INSERT INTO media_pairings(code_hash,created_by,expires_at) VALUES($1,$2,now()+interval '10 minutes')",[digest(code),req.user.id]);
 res.json({code,expiresAt:new Date(Date.now()+600000).toISOString()});
}));
router.delete('/admin/media-devices/:id',admin,h(async(req,res)=>{
 if(!ID.test(req.params.id))throw fail('Computadora no encontrada',404);
 const cancelled=await tx(async c=>{await c.query('UPDATE media_devices SET revoked_at=now() WHERE id=$1',[req.params.id]);return (await c.query("UPDATE media_import_jobs SET state='cancelled',error='Computadora desconectada por el administrador',updated_at=now() WHERE device_id=$1 AND state IN ('awaiting_device','downloading','uploading') RETURNING id",[req.params.id])).rows;});for(const j of cancelled)await rm(assetDirectory(j.id),{recursive:true,force:true});res.json({ok:true});
}));
// This public endpoint is protected by a 64-bit one-time code, expiration and rate limit.
const pairAttempts=new Map();
router.post('/companion/pair',h(async(req,res)=>{
 const key=req.ip,now=Date.now(),previous=pairAttempts.get(key),a=previous&&now-previous.at<600000?previous:{at:now,count:0};a.count++;pairAttempts.set(key,a);if(pairAttempts.size>1000)for(const [k,v] of pairAttempts)if(now-v.at>600000)pairAttempts.delete(k);
 if(a.count>20||pairAttempts.size>10000)throw fail('Demasiados intentos. Esperá diez minutos.',429);
 const code=String(req.body?.code||'').replaceAll('-','').trim().toUpperCase();if(!/^[A-F0-9]{16}$/.test(code))throw fail('Código de vinculación inválido',401);
 const token='ltv_'+randomBytes(32).toString('hex'),id=randomUUID();
 await tx(async c=>{const p=(await c.query('DELETE FROM media_pairings WHERE code_hash=$1 AND expires_at>now() RETURNING created_by',[digest(code)])).rows[0];if(!p)throw fail('El código venció o ya fue utilizado. Generá uno nuevo.',401);await c.query('INSERT INTO media_devices(id,name,token_hash,created_by,last_seen) VALUES($1,$2,$3,$4,now())',[id,String(req.body.name||'Mi computadora').slice(0,100),digest(token),p.created_by]);});
 res.json({id,token,chunkBytes:CHUNK_BYTES,maxBytes:MAX_BYTES});
}));
router.use('/companion',h(deviceAuth));
router.get('/companion/next',h(async(req,res)=>{
 const j=await tx(async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['device:'+req.mediaDevice.id]);
 let j=(await c.query("SELECT * FROM media_import_jobs WHERE device_id=$1 AND state IN ('downloading','uploading') ORDER BY created_at LIMIT 1 FOR UPDATE",[req.mediaDevice.id])).rows[0];
 if(!j)j=(await c.query("UPDATE media_import_jobs SET state='downloading',error=NULL,updated_at=now() WHERE id=(SELECT id FROM media_import_jobs WHERE device_id=$1 AND state='awaiting_device' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *",[req.mediaDevice.id])).rows[0];
 return j;});res.json({job:j?{id:j.id,url:j.source_url,sourceId:j.source_id,title:j.options.title,quality:j.options.quality||720,state:j.state}:null});
}));
router.post('/companion/jobs/:id/progress',h(async(req,res)=>{
 await tx(async c=>{const j=await access(req,req.params.id,c);if(!['downloading','uploading','publishing','done'].includes(j.state))throw fail('El trabajo fue cancelado o ya terminó',409);await c.query("UPDATE media_import_jobs SET progress=CASE WHEN state='downloading' THEN GREATEST(progress,$2) ELSE progress END,updated_at=now() WHERE id=$1 AND state<>'done'",[j.id,Math.min(49,Math.max(0,Number(req.body.progress)||0))]);});res.json({ok:true});
}));
router.post('/companion/jobs/:id/error',h(async(req,res)=>{
 const j=await access(req,req.params.id);const message=String(req.body.message||'La computadora no pudo completar el trabajo').slice(0,600);
 await query("UPDATE media_import_jobs SET state='error',error=$2,updated_at=now() WHERE id=$1 AND state IN ('downloading','uploading')",[j.id,message]);res.json({ok:true});
}));
router.post('/admin/media-transfers',admin,h(async(req,res)=>{
 const o=options(req.body);
 if(req.body.mode==='companion'){
  if(!ID.test(req.body.deviceId||'')||!await one('SELECT id FROM media_devices WHERE id=$1 AND revoked_at IS NULL',[req.body.deviceId]))throw fail('Vinculá y elegí una computadora');
  const j=await createYoutubeJob(req.body,req.user.id,{schedule:false,execution:'companion',deviceId:req.body.deviceId});return res.status(201).json({id:j.id,state:j.state});
 }
 if(req.body.mode!=='upload')throw fail('Elegí cómo importar el video');
 if(!validUploadSize(req.body.size))throw fail('El video debe tener contenido y no superar '+Math.round(MAX_BYTES/1024**3)+' GB');
 if(!o.title)throw fail('Escribí el título');await freeSpace(req.body.size);
 const id=randomUUID(),meta={id,title:o.title,description:o.description,creator:'',license:o.rightsBasis==='owner'?'Contenido propio':'Autorización declarada por el administrador',year:o.year};
 await query("INSERT INTO media_import_jobs(id,source_id,source_url,state,options,metadata,created_by,execution,upload_size) VALUES($1,$6,'','uploading',$2,$3,$4,'upload',$5)",[id,o,meta,req.user.id,req.body.size,id]);
 res.status(201).json({id,state:'uploading',chunkBytes:CHUNK_BYTES});
}));
router.post('/admin/media-transfers/:id/retry',admin,h(async(req,res)=>{
 const j=await access(req,req.params.id);
 if(j.execution!=='companion'||j.state!=='error')throw fail('Este trabajo no necesita reintento',409);
 if(!await one('SELECT id FROM media_devices WHERE id=$1 AND revoked_at IS NULL',[j.device_id]))throw fail('La computadora fue desvinculada');
 try{await query("UPDATE media_import_jobs SET state='awaiting_device',error=NULL,updated_at=now() WHERE id=$1 AND state='error'",[j.id]);}catch(e){if(e.code==='23505')throw fail('Ya hay otra importación de este video en curso',409);throw e;}res.json({ok:true});
}));

// Same resumable protocol for the browser (admin session) and paired computers.
for(const prefix of ['/admin/media-transfers','/companion/jobs']){
 if(prefix.startsWith('/admin'))router.use(prefix,admin);
 router.get(prefix+'/:id',h(async(req,res)=>{const j=await access(req,req.params.id);res.json({id:j.id,state:j.state,processing:j.processing,progress:j.progress,offset:await fileSize(j.id),size:Number(j.upload_size),chunkBytes:CHUNK_BYTES,movieId:j.movie_id,error:j.error});}));
 router.post(prefix+'/:id/prepare',h(async(req,res)=>{
  await tx(async c=>{const j=await access(req,req.params.id,c);if(j.state==='done')return;if(!['downloading','uploading','error'].includes(j.state))throw fail('Trabajo no disponible',409);
   const size=req.body.size;if(!validUploadSize(size))throw fail('Tamaño de archivo no permitido');if(j.upload_size&&Number(j.upload_size)!==size)throw fail('El archivo cambió. Cancelá y creá otra importación.',409);
   await freeSpace(Math.max(0,size-await fileSize(j.id)));
   const meta=j.execution==='companion'?sanitizeMetadata(req.body.metadata||{}):j.metadata;if(meta.id!==j.source_id)throw fail('El archivo no corresponde al enlace solicitado');
   await c.query("UPDATE media_import_jobs SET state='uploading',upload_size=$2,metadata=$3,error=NULL,updated_at=now() WHERE id=$1",[j.id,size,meta]);});res.json({ok:true});
 }));
 router.put(prefix+'/:id/chunk',express.raw({type:'application/octet-stream',limit:CHUNK_BYTES}),h(async(req,res)=>{
  if(!Buffer.isBuffer(req.body)||!req.body.length)throw fail('Falta el fragmento del archivo');
  const offset=Number(req.headers['x-upload-offset']),sha=String(req.headers['x-chunk-sha256']||'');if(!Number.isSafeInteger(offset)||offset<0||!sha||digest(req.body)!==sha)throw fail('El fragmento no pasó la verificación');
  const next=await tx(async c=>{await lock(c,req.params.id);const j=await access(req,req.params.id,c);if(j.state!=='uploading')throw fail('La transferencia ya no está activa',409);
   const dir=assetDirectory(j.id);await mkdir(dir,{recursive:true});const file=path.join(dir,'upload.part');let actual=0;try{actual=(await stat(file)).size;}catch(e){if(e.code!=='ENOENT')throw e;}
   if(offset!==actual)throw fail('El servidor tiene otro avance. Consultá el estado para continuar.',409);
   if(offset+req.body.length>Number(j.upload_size))throw fail('El fragmento excede el tamaño declarado');
   const fd=await open(file,actual?'r+':'w');try{let written=0;while(written<req.body.length){const result=await fd.write(req.body,written,req.body.length-written,actual+written);if(!result.bytesWritten)throw Error('No se pudo escribir el fragmento');written+=result.bytesWritten;}await fd.sync();}finally{await fd.close();}
   await c.query('UPDATE media_import_jobs SET upload_bytes=$2,progress=$3,updated_at=now() WHERE id=$1',[j.id,actual+req.body.length,Math.min(99,Math.floor((j.execution==='companion'?50:0)+(actual+req.body.length)/Number(j.upload_size)*(j.execution==='companion'?49:99)))]);
   return actual+req.body.length;});res.json({offset:next});
 }));
 router.post(prefix+'/:id/finish',h(async(req,res)=>{
  let input;const j=await tx(async c=>{await lock(c,req.params.id);const j=await access(req,req.params.id,c);if(['done','publishing'].includes(j.state))return j;
   if(!['uploading','error'].includes(j.state))throw fail('El archivo ya se está verificando o fue cancelado',409);
   const dir=assetDirectory(j.id),size=await fileSize(j.id);if(!j.upload_size||size!==Number(j.upload_size))throw fail('Todavía faltan fragmentos del video',409);
   let file=path.join(dir,'upload.part');try{await stat(file);}catch{file=path.join(dir,'video.mp4');}
   const fd=await open(file,'r');const head=Buffer.alloc(16);try{await fd.read(head,0,16,0);}finally{await fd.close();}if(head.toString('ascii',4,8)!=='ftyp'&&head.readUInt32BE(0)!==0x1a45dfa3)throw fail('El archivo debe ser un video MP4 o MKV válido');
   const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);const checksum=hash.digest('hex');if(req.body.sha256&&req.body.sha256!==checksum)throw fail('El archivo recibido no coincide con el original');
   const probe=await probeFile(file);if(!probe.streams?.some(s=>s.codec_type==='video'&&s.width>0&&s.height>0))throw fail('El archivo no contiene un video válido',422);
   input={file,probe,checksum};await c.query("UPDATE media_import_jobs SET state='publishing',progress=0,processing=$2,error=NULL,updated_at=now() WHERE id=$1",[j.id,{phase:'queued',percent:0,totalSeconds:Number(probe.format?.duration)||null}]);return j;
  });
  if(j.state==='done')return res.json({id:j.movie_id,state:'done'});
  if(input)void finalizeTransfer(j,input);res.status(202).json({state:'publishing'});
 }));
 router.post(prefix+'/:id/cancel',h(async(req,res)=>{const j=await access(req,req.params.id);res.json(await cancelYoutubeJob(j.id));}));
}
export default router;
export function startTransferMaintenance(){
 const tick=()=>query("UPDATE media_import_jobs SET state='error',error='La publicación fue interrumpida. Volvé a finalizar el envío.',updated_at=now() WHERE execution<>'server' AND state='publishing' AND updated_at<now()-interval '5 minutes'").catch(e=>console.error('[media-transfer]',e.message));
 void tick();const timer=setInterval(tick,60000);timer.unref?.();return()=>clearInterval(timer);
}
