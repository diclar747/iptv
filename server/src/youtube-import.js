import {notify} from './notifications.js';
import {randomUUID} from 'node:crypto';import {rm} from 'node:fs/promises';
import {many,one,query,tx} from './pg.js';
import {downloadYoutube,assetDirectory,PUBLIC_BASE,parseYoutubeUrl} from './youtube-downloader.js';
import {cleanImportedTitle,cleanImportedOverview} from './import-presentation.js';
const active=new Map();let draining=false;
const failure=(message,status=400)=>Object.assign(Error(message),{status});
export async function createYoutubeJob(input,userId,{schedule=true,execution='server',deviceId=null}={}){
 const source=parseYoutubeUrl(input.url);
 if(input.authorized!==true||!['owner','permission','license'].includes(input.rightsBasis))throw failure('Confirmá que tenés permiso para guardar y distribuir el video');
 const existing=await one("SELECT internal_id FROM external_ids WHERE provider='youtube' AND content_type='movie' AND external_id=$1",[source.id]);if(existing)throw failure('Este video ya está en la biblioteca. Podés editarlo o restaurarlo desde la lista.',409);
 const category=String(input.category||'').trim().slice(0,80);if(!category)throw failure('Elegí o creá una categoría');
 const kind=['movie','music','documentary','video'].includes(input.kind)?input.kind:'movie';
 const options={category,kind,quality:[360,480,720,1080].includes(Number(input.quality))?Number(input.quality):720,title:String(input.title||'').trim().slice(0,300),description:String(input.description||'').slice(0,30000),year:Number(input.year)||null,rightsBasis:input.rightsBasis,authorizationNote:String(input.authorizationNote||'').slice(0,2000),authorizedAt:new Date().toISOString()};
 try{const row=await one('INSERT INTO media_import_jobs(id,source_id,source_url,options,created_by,execution,device_id,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[randomUUID(),source.id,source.url,options,userId,execution,deviceId,execution==='companion'?'awaiting_device':'queued']);if(schedule&&execution==='server')void drainYoutubeJobs();return row;}catch(e){if(e.code==='23505')throw failure('Este video ya tiene una importación en curso',409);throw e;}
}
async function claim(){return tx(async client=>{
 const lock=await client.query("SELECT pg_try_advisory_xact_lock(hashtext('livetv-youtube-worker')) ok");if(!lock.rows[0].ok)return null;
 if((await client.query("SELECT 1 FROM media_import_jobs WHERE execution='server' AND state IN ('downloading','publishing') LIMIT 1")).rowCount)return null;
 return (await client.query("UPDATE media_import_jobs SET state='downloading',updated_at=now() WHERE id=(SELECT id FROM media_import_jobs WHERE execution='server' AND state='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *")).rows[0];
});}
export async function publishYoutubeJob(job,download){
 if(download.metadata.id!==job.source_id)throw Error('El archivo no corresponde al video solicitado');
 return tx(async client=>{
  const row=(await client.query('SELECT * FROM media_import_jobs WHERE id=$1 FOR UPDATE',[job.id])).rows[0];if(!row||row.state==='cancelled')throw Object.assign(Error('Importación cancelada'),{code:'CANCELLED'});
  const provider=job.execution==='upload'?'upload':'youtube';
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[provider+':'+job.source_id]);
  if(provider==='youtube'&&(await client.query("SELECT 1 FROM external_ids WHERE provider='youtube' AND content_type='movie' AND external_id=$1",[job.source_id])).rowCount)throw Error('El video ya se importó');
  const m=download.metadata,o=job.options,video=PUBLIC_BASE+'/api/library/'+job.id+'/'+download.video,cover=download.cover?PUBLIC_BASE+'/api/library/'+job.id+'/'+download.cover:m.thumbnail;
  await client.query('INSERT INTO media_categories(name) VALUES($1) ON CONFLICT DO NOTHING',[o.category]);
  const movie=(await client.query("INSERT INTO movies(title,year,poster,description,overview_es,category,stream_url,provider,runtime,content_kind,origin_url,creator) VALUES($1,$2,$3,$4,$4,$5,$6,$11,$7,$8,$9,$10) RETURNING id",[cleanImportedTitle(o.title||m.title),o.year||m.year,cover,cleanImportedOverview(o.description||m.description),o.category,video,m.duration?Math.ceil(m.duration/60):null,o.kind,provider==='youtube'?job.source_url:null,m.creator,provider])).rows[0];
  await notify(client,null,'content','Nuevo contenido en LiveTV',cleanImportedTitle(o.title||m.title),'movie:'+movie.id);
  await client.query('INSERT INTO media_assets(id,movie_id,video_name,cover_name,size_bytes,metadata) VALUES($1,$2,$3,$4,$5,$6)',[job.id,movie.id,download.video,download.cover,download.size,m]);
  if(provider==='youtube')await client.query("INSERT INTO external_ids(provider,content_type,external_id,internal_id) VALUES('youtube','movie',$1,$2)",[job.source_id,movie.id]);
  await client.query("UPDATE media_import_jobs SET state='done',progress=100,metadata=$2,movie_id=$3,error=NULL,updated_at=now() WHERE id=$1",[job.id,m,movie.id]);return movie;
 });
}
export async function runYoutubeJob(job,{download=downloadYoutube}={}){
 const controller=new AbortController();active.set(job.id,controller);let lastProgress=-1,progressAt=0;
 const heartbeat=setInterval(()=>{void one('SELECT state FROM media_import_jobs WHERE id=$1',[job.id]).then(row=>{if(row?.state==='cancelled')controller.abort();else return query("UPDATE media_import_jobs SET updated_at=now() WHERE id=$1 AND state='downloading'",[job.id]);}).catch(()=>{});},2000);heartbeat.unref?.();
 try{
  const result=await download({id:job.id,url:job.source_url,quality:job.options.quality,signal:controller.signal,onProgress:value=>{const now=Date.now();if(value<=lastProgress||now-progressAt<1000)return;lastProgress=value;progressAt=now;void query("UPDATE media_import_jobs SET progress=$2,updated_at=now() WHERE id=$1 AND state='downloading'",[job.id,value]).catch(()=>{});}});
  if(controller.signal.aborted)throw Object.assign(Error('Importación cancelada'),{code:'CANCELLED'});
  const moved=await query("UPDATE media_import_jobs SET state='publishing',updated_at=now() WHERE id=$1 AND state='downloading'",[job.id]);if(!moved.rowCount)throw Object.assign(Error('Importación cancelada'),{code:'CANCELLED'});
  await publishYoutubeJob(job,result);
 }catch(e){
  await query("UPDATE media_import_jobs SET state=CASE WHEN state='cancelled' OR $3 THEN 'cancelled' ELSE 'error' END,error=$2,updated_at=now() WHERE id=$1 AND state<>'done'",[job.id,String(e.message||'No se pudo importar').slice(0,1000),controller.signal.aborted||e.code==='CANCELLED']);
  if(!await one('SELECT id FROM media_assets WHERE id=$1',[job.id]))await rm(assetDirectory(job.id),{recursive:true,force:true});
 }finally{clearInterval(heartbeat);active.delete(job.id);}
}
export async function drainYoutubeJobs(){if(draining)return;draining=true;try{let job;while((job=await claim()))await runYoutubeJob(job);}catch(e){console.error('[youtube-import]',e.message);}finally{draining=false;}}
export async function cancelYoutubeJob(id){const result=await query("UPDATE media_import_jobs SET state='cancelled',updated_at=now() WHERE id=$1 AND state IN ('queued','downloading','awaiting_device','uploading','error') RETURNING execution",[id]);if(!result.rowCount)throw failure('La importación ya terminó o está publicando el archivo',409);active.get(id)?.abort();if(result.rows[0].execution!=='server')await rm(assetDirectory(id),{recursive:true,force:true});return {ok:true};}
export function startYoutubeWorker(){
 const tick=async()=>{try{const recovered=await many("UPDATE media_import_jobs SET state='error',error='El servidor interrumpió la descarga. Volvé a importar el video.',updated_at=now() WHERE execution='server' AND state IN ('downloading','publishing') AND updated_at<now()-interval '5 minutes' RETURNING id");for(const row of recovered){if(!await one('SELECT id FROM media_assets WHERE id=$1',[row.id]))await rm(assetDirectory(row.id),{recursive:true,force:true});}void drainYoutubeJobs();}catch(e){console.error('[youtube-import]',e.message);}};
 const timer=setInterval(()=>void tick(),10000);timer.unref?.();void tick();return ()=>clearInterval(timer);
}
