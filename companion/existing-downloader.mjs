import {existsSync} from 'node:fs';
import {readdir} from 'node:fs/promises';
import path from 'node:path';
const wait=(ms,signal)=>new Promise((resolve,reject)=>{signal.throwIfAborted();const abort=()=>{clearTimeout(t);reject(signal.reason);};const t=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});
function videoId(value){try{const u=new URL(value);return u.hostname==='youtu.be'?u.pathname.slice(1):u.searchParams.get('v')||u.pathname.match(/^\/(?:shorts|live)\/([^/]+)/)?.[1];}catch{return null;}}
export async function findExistingDownloader(){
 for(const port of [4317,4318])try{
  const base='http://127.0.0.1:'+port,r=await fetch(base+'/',{signal:AbortSignal.timeout(1200),redirect:'error'}),html=await r.text();
  if(!html.includes('<title>Downloader YouTuber</title>'))continue;
  const token=html.match(/name="app-token" content="([a-f0-9]+)"/)?.[1];if(!token)continue;
  const state=await (await fetch(base+'/api/state',{signal:AbortSignal.timeout(2000),redirect:'error'})).json();
  if(Array.isArray(state.jobs)&&state.ready)return {base,token,state};
 }catch{}
 return null;
}
export async function downloadWithExisting(job,signal,onState,readMetadata){
 const app=await findExistingDownloader();if(!app)return null;
 async function get(){const r=await fetch(app.base+'/api/state',{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)]),redirect:'error'});if(!r.ok)throw Error('No se pudo consultar Downloader YouTuber');return r.json();}
 async function post(route,body){const r=await fetch(app.base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':app.token},body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(60000)]),redirect:'error'});const j=await r.json();if(!r.ok)throw Error(j.error||'Falló el descargador local');return j;}
 const matches=j=>videoId(j.url)===job.sourceId&&j.quality!=='audio';
 let local=app.state.jobs.find(j=>matches(j)&&j.status==='done'&&j.file&&existsSync(j.file))||app.state.jobs.find(j=>matches(j)&&['queued','downloading'].includes(j.status));
 // The existing downloader keeps its queue in memory. Recover completed files after a restart.
 if(!local&&typeof app.state.folder==='string')try{
  const suffix=' ['+job.sourceId+']';const found=(await readdir(app.state.folder,{withFileTypes:true})).find(e=>e.isFile()&&['.mp4','.mkv','.webm'].includes(path.extname(e.name).toLowerCase())&&path.basename(e.name,path.extname(e.name)).endsWith(suffix));
  if(found)local={id:null,status:'done',file:path.join(app.state.folder,found.name),title:path.basename(found.name,path.extname(found.name)).slice(0,-suffix.length)};
 }catch{}
 if(!local){const q=await post('batch',{urls:[job.url],quality:String(Math.min(1080,job.quality||720))});const state=await get();local=state.jobs.find(j=>q.ids?.includes(j.id))||state.jobs.find(j=>matches(j)&&['queued','downloading'].includes(j.status));if(!local)throw Error('No se encontró el trabajo en el descargador local');}
 const id=local.id;
 while(['queued','downloading'].includes(local.status)){
  onState({phase:'downloading',message:local.status==='queued'?'En cola en Downloader YouTuber':'Descargando con Downloader YouTuber',progress:Number(local.progress)||0});
  await wait(1500,signal);local=(await get()).jobs.find(j=>j.id===id);if(!local)throw Error('El descargador local se reinició. Volvé a abrirlo y reintentá el trabajo.');
 }
 signal.throwIfAborted();if(local.status!=='done'||!local.file||!existsSync(local.file))throw Error(local.error||'La descarga local no terminó correctamente');
 onState({phase:'uploading',message:'Reutilizando el archivo de Downloader YouTuber',progress:0});
 if(readMetadata)try{const metadata=await readMetadata();if(metadata.id===job.sourceId)return {file:local.file,metadata};}catch(e){if(signal.aborted)throw e;}
 let info={};if(!readMetadata)try{info=await post('info',{url:job.url});}catch(e){if(signal.aborted)throw e;}
 return {file:local.file,metadata:{id:job.sourceId,title:info.title||local.title,description:'',uploader:info.channel||'',duration:info.duration||null,thumbnail:info.thumbnail||null,license:'No indicada'}};
}
