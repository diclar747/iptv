import http from 'node:http';
import {readFile,writeFile,mkdir,stat,open,chmod,statfs,readdir,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {downloadWithExisting,findExistingDownloader} from './existing-downloader.mjs';
import {promisify} from 'node:util';
import {ImportPipeline} from './pipeline.mjs';
const exec=promisify(execFile);

const root=path.dirname(fileURLToPath(import.meta.url)),PORT=Number(process.env.LIVETV_ASSISTANT_PORT)||43827,origin='http://127.0.0.1:'+PORT;
const secret=randomBytes(32).toString('hex'),dataDir=process.env.LIVETV_ASSISTANT_DATA||path.join(process.env.LOCALAPPDATA||os.homedir(),'LiveTV Asistente');
await mkdir(dataDir,{recursive:true});
const configFile=path.join(dataDir,'connection.json');let config=null;
const jobsDir=path.resolve(dataDir,'jobs');
const jobId=/^[a-f0-9-]{36}$/i;
try{config=JSON.parse(await readFile(configFile,'utf8'));}catch{}
let state={message:'Preparado para vincular tu computadora',progress:0,title:'',phase:'idle',lastCompleted:null,error:null,existingDownloader:null};
void findExistingDownloader().then(d=>{state.existingDownloader=d?.base||null;});
const unpackedTool=path.join(root,'tools','yt-dlp','yt-dlp.exe');
const python=path.join(root,'tools','python','python.exe');
const packagedDownloader=path.join(root,'tools','yt-dlp.pyz');
const pythonBundle=process.platform==='win32'&&existsSync(python)&&existsSync(packagedDownloader);
const tool=pythonBundle?python:process.platform==='win32'&&existsSync(unpackedTool)?unpackedTool:path.join(root,'tools',process.platform==='win32'?'yt-dlp.exe':'yt-dlp');
const toolArgs=args=>pythonBundle?['-I',packagedDownloader,...args]:args;
const extractionFailure=/\[PYI-|failed to extract|decompression resulted/i;
function serverOrigin(value){const u=new URL(value);if(u.username||u.password||u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash)throw Error('Usá la dirección HTTPS de LiveTV, por ejemplo https://live.cd.com.py');return u.origin;}
function safeMessage(e){if(e.code==='ENOSPC'||/no space left|not enough space/i.test(e.message))return 'Falta espacio en el disco de la computadora. Liberá espacio para continuar esta descarga.';if(extractionFailure.test(e.message))return 'No se pudo iniciar el descargador. Descargá y extraé el ZIP completo del Asistente actualizado.';if(/confirm you.re not a bot|sign in to confirm/i.test(e.message))return 'YouTube pide verificar esta conexión. Probá abrir el video normalmente en tu navegador; no se usan cookies ni se omiten verificaciones.';if(/private video|not available|unavailable/i.test(e.message))return 'El video no está disponible para esta conexión.';return String(e.message||'No se pudo completar el trabajo').slice(0,400);}
function retryable(error){
 return [408,429,500,502,503,504].includes(error.status)||error.name==='TimeoutError'||
  /fetch failed|timed out|timeout|ECONN|ENOTFOUND|EAI_AGAIN|network|se reinició/i.test(error.message);
}
async function remote(route,{method='GET',body,headers={},signal}={}){
 if(!config)throw Error('Vinculá esta computadora primero');
 const deadline=AbortSignal.timeout(60000);
 const r=await fetch(config.server+'/api/companion'+route,{method,redirect:'error',headers:{Authorization:'Bearer '+config.token,...(body&&!Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,deadline]):deadline});
 let j;try{j=await r.json();}catch{throw Object.assign(Error('El servidor no respondió correctamente.'),{status:r.status>=400?r.status:502});}if(!r.ok)throw Object.assign(Error(j.error||'Error de conexión'),{status:r.status});return j;
}
async function jsonBody(req){let size=0,parts=[];for await(const b of req){size+=b.length;if(size>8192)throw Error('Solicitud demasiado grande');parts.push(b);}return JSON.parse(Buffer.concat(parts).toString()||'{}');}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function isLocal(req){return req.headers.host==='127.0.0.1:'+PORT&&(!req.headers.origin||req.headers.origin===origin);}
const server=http.createServer(async(req,res)=>{
 try{
  if(!isLocal(req))return send(res,403,{error:'Solo se permite acceso desde esta computadora'});
  const u=new URL(req.url,origin),cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).includes('assistant='+secret);
  if(u.pathname==='/'&&req.method==='GET'){
   if(u.searchParams.get('key')!==secret&&!cookie)return send(res,403,{error:'Abrí Iniciar LiveTV.cmd para acceder al asistente.'});
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Set-Cookie':'assistant='+secret+'; HttpOnly; SameSite=Strict; Path=/','Content-Security-Policy':"default-src 'self'; script-src 'nonce-"+secret+"'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",'X-Content-Type-Options':'nosniff'});
   res.end((await readFile(path.join(root,'index.html'),'utf8')).replaceAll('__NONCE__',secret));return;
  }
  if(!cookie)return send(res,403,{error:'Sesión local inválida. Volvé a abrir el asistente.'});
  if(req.method==='GET'&&u.pathname==='/status'){const jobs=pipeline.snapshot();return send(res,200,{...state,...jobs[0],jobs,connected:!!config,server:config?.server,name:config?.name,paused:pipeline.paused});}
  if(req.method!=='POST'||req.headers['x-livetv-local']!==secret||!String(req.headers['content-type']||'').startsWith('application/json'))return send(res,403,{error:'Solicitud local no permitida'});
  const body=await jsonBody(req);
  if(u.pathname==='/pair'){
   if(pipeline.tasks.size)throw Error('Pausá el trabajo actual antes de cambiar la vinculación');
   const base=serverOrigin(body.server),r=await fetch(base+'/api/companion/pair',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:body.code,name:String(body.name||os.hostname()).slice(0,100)}),signal:AbortSignal.timeout(20000)}),j=await r.json();if(!r.ok)throw Error(j.error||'No se pudo vincular');
   config={server:base,token:j.token,id:j.id,name:String(body.name||os.hostname()).slice(0,100)};await writeFile(configFile,JSON.stringify(config),{mode:0o600});await chmod(configFile,0o600).catch(()=>{});pipeline.resume();state.error=null;state.message='Computadora vinculada. Esperando enlaces del panel.';send(res,200,{ok:true});void clearPublishedTemps();void tick();return;
  }
  if(u.pathname==='/pause'){pipeline.pause();state.message='Pausado. Los archivos enviados se conservan para continuar.';return send(res,200,{ok:true});}
  if(u.pathname==='/resume'){pipeline.resume();state.error=null;send(res,200,{ok:true});void tick();return;}
  if(u.pathname==='/disconnect'){pipeline.pause();config=null;await writeFile(configFile,'null',{mode:0o600});state.message='Computadora desconectada localmente. Podés revocar la vinculación desde el panel.';return send(res,200,{ok:true});}
  return send(res,404,{error:'No encontrado'});
 }catch(e){send(res,400,{error:safeMessage(e)});}
});

async function removeJobTemp(id){
 const dir=path.resolve(jobsDir,id);
 if(jobId.test(id)&&path.dirname(dir)===jobsDir)await rm(dir,{recursive:true,force:true}).catch(()=>{});
}
async function clearPublishedTemps(){
 if(!config)return;
 const entries=await readdir(jobsDir,{withFileTypes:true}).catch(()=>[]);
 for(const entry of entries){
  if(!entry.isDirectory()||!jobId.test(entry.name)||pipeline.tasks.has(entry.name))continue;
  try{
   const job=await remote('/jobs/'+entry.name,{signal:AbortSignal.timeout(8000)});
   if(job.state==='done')await removeJobTemp(entry.name);
  }catch{ /* Keep work that cannot be confirmed as published. */ }
 }
}

async function download(job,dir,signal,jobState){
 const url=new URL(job.url);if(url.origin!=='https://www.youtube.com'||url.pathname!=='/watch'||!/^[-\w]{11}$/.test(job.sourceId)||url.searchParams.get('v')!==job.sourceId)throw Error('El enlace recibido no corresponde a un video individual');
 const target=path.join(dir,'video.mp4'),info=path.join(dir,'video.info.json');
 if(existsSync(target)&&existsSync(info)){const m=JSON.parse(await readFile(info,'utf8'));if(m.id===job.sourceId)return {file:target,metadata:m};}
 try{
  const reused=await downloadWithExisting(job,signal,s=>Object.assign(jobState,{...s,phase:s.phase==='uploading'?'metadata':s.phase}),async()=>{const {stdout}=await exec(tool,toolArgs(['--ignore-config','--no-playlist','--js-runtimes','node:'+process.execPath,'--socket-timeout','15','--retries','1','--dump-single-json','--skip-download','--',job.url]),{timeout:60000,maxBuffer:16*1024**2,windowsHide:true,signal});return JSON.parse(stdout);});
  if(reused)return reused;
 }catch(e){signal.throwIfAborted();if(!extractionFailure.test(e.message))throw e;}
 const disk=await statfs(dir);
 if(disk.bsize*disk.bavail<512*1024**2)throw Object.assign(Error('No space left on device'),{code:'ENOSPC'});
 if(!existsSync(tool))throw Error('Falta el descargador. Extraé nuevamente el ZIP completo del asistente.');
 jobState.phase='downloading';jobState.message='Descargando desde YouTube';jobState.progress=0;
 await new Promise((resolve,reject)=>{
  signal.throwIfAborted();let errors='';
  const args=['--ignore-config','--no-playlist','--no-cache-dir','--socket-timeout','15','--retries','2','--fragment-retries','2','--js-runtimes','node:'+process.execPath,'--match-filters','!is_live','--max-filesize','2147483648','--format',`best[ext=mp4][vcodec^=avc1][acodec!=none][height<=${job.quality||720}]`,'--write-info-json','--newline','--progress-template','download:%(progress._percent_str)s','--output',path.join(dir,'video.%(ext)s'),'--',job.url];
  const child=spawn(tool,toolArgs(args),{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const abort=()=>child?.kill();signal.addEventListener('abort',abort,{once:true});
  child.stdout.on('data',b=>{for(const line of b.toString().split(/[\r\n]+/)){const m=line.match(/download:\s*([\d.]+)%/);if(m)jobState.progress=Math.max(jobState.progress,Math.min(100,Number(m[1])));}});
  child.stderr.on('data',b=>{errors=(errors+b.toString()).slice(-3000);});
  child.on('error',reject);child.on('close',code=>{signal.removeEventListener('abort',abort);if(signal.aborted)return reject(Object.assign(Error('Pausado'),{name:'AbortError'}));code===0?resolve():reject(Error(errors||'No se pudo descargar este video. Probá con un MP4 que ya tengas.'));});
 });
 const m=JSON.parse(await readFile(info,'utf8'));if(m.id!==job.sourceId||m.is_live)throw Error('El archivo descargado no corresponde al video terminado solicitado');return {file:target,metadata:m};
}
async function processJob(job,controller,jobState){
 const signal=controller.signal;
 if(!jobId.test(job.id))throw Error('Trabajo inválido');
 const dir=path.join(jobsDir,job.id);await mkdir(dir,{recursive:true});
 jobState.title=job.title||job.url;jobState.error=null;
  const timer=setInterval(()=>{void remote('/jobs/'+job.id+'/progress',{method:'POST',body:{progress:Math.floor(jobState.progress/2),phase:jobState.phase},signal:AbortSignal.timeout(15000)}).catch(e=>{if([401,403,404,409].includes(e.status))controller.abort();});},10000);
 try{
  const current=await remote('/jobs/'+job.id,{signal});
  if(current.state==='uploading'&&current.size>0&&current.offset===current.size){
   jobState.phase='publishing';jobState.message='Publicando el archivo que ya está en el servidor';
   await remote('/jobs/'+job.id+'/finish',{method:'POST',body:{},signal});
  }else{
  const result=await download(job,dir,signal,jobState),size=(await stat(result.file)).size;
  signal.throwIfAborted();jobState.title=result.metadata.title||jobState.title;
  const fields=['id','title','description','uploader','channel_url','duration','upload_date','release_year','license','thumbnail','tags','height','is_live','live_status'];
  const metadata=Object.fromEntries(fields.filter(k=>result.metadata[k]!==undefined).map(k=>[k,result.metadata[k]]));
  if(metadata.description)metadata.description=String(metadata.description).slice(0,30000);if(metadata.tags)metadata.tags=metadata.tags.slice(0,30);
  await remote('/jobs/'+job.id+'/prepare',{method:'POST',body:{size,metadata},signal});
  let status=await remote('/jobs/'+job.id,{signal}),offset=status.offset;
  jobState.phase='uploading';jobState.message='Enviando el video a LiveTV';jobState.progress=Math.floor(offset/size*100);
  const fd=await open(result.file,'r');try{while(offset<size){signal.throwIfAborted();const buffer=Buffer.alloc(Math.min(4*1024*1024,size-offset));const {bytesRead}=await fd.read(buffer,0,buffer.length,offset);if(!bytesRead)throw Error('El archivo local cambió durante el envío');const bytes=buffer.subarray(0,bytesRead);
    try{const r=await remote('/jobs/'+job.id+'/chunk',{method:'PUT',body:bytes,headers:{'Content-Type':'application/octet-stream','X-Upload-Offset':String(offset),'X-Chunk-SHA256':createHash('sha256').update(bytes).digest('hex')},signal});offset=r.offset;jobState.progress=Math.floor(offset/size*100);}catch(e){if(e.status===409){status=await remote('/jobs/'+job.id,{signal});if(status.state!=='uploading')throw e;offset=status.offset;}else throw e;}
  }}finally{await fd.close();}
  jobState.phase='publishing';jobState.message='Publicando en el servidor sin recodificar';await remote('/jobs/'+job.id+'/finish',{method:'POST',body:{},signal});
  }
  for(;;){signal.throwIfAborted();const status=await remote('/jobs/'+job.id,{signal});if(status.state==='done')break;if(['error','cancelled'].includes(status.state))throw Error(status.error||'No se pudo publicar el video');await new Promise(r=>setTimeout(r,2000));}
  state.lastCompleted=jobState.title;jobState.phase='done';jobState.message='Video agregado a la cartelera';jobState.progress=100;
  // Delete only this validated job directory after confirmed publication. Keep incomplete jobs to resume.
  await removeJobTemp(job.id);
 }finally{clearInterval(timer);}
}
const pipeline=new ImportPipeline({
 claim:async body=>{if(!config)return {jobs:[]};const result=await remote('/claim',{method:'POST',body});state.error=null;return result;},
 run:processJob,
 onError:async(e,job)=>{state.error=safeMessage(e);if(e.status===401){pipeline.pause();state.message='La vinculación fue revocada. Generá un código nuevo.';}else if(job){try{await remote('/jobs/'+job.id+'/error',{method:'POST',body:{message:safeMessage(e),retryable:retryable(e)},signal:AbortSignal.timeout(15000)});}catch{}}}
});
async function tick(){if(!config)return;await pipeline.poll();if(!pipeline.tasks.size&&!pipeline.paused){state.phase='idle';state.title='';state.progress=0;state.message='Conectado. El próximo enlace de la cola se procesa automáticamente.';}}
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'El asistente ya está abierto. Cerrá la otra ventana antes de iniciarlo otra vez.':e.message);process.exitCode=1;});
server.listen(PORT,'127.0.0.1',()=>{
 console.log('LiveTV Asistente — mantené esta ventana abierta mientras importa.');
 const url=origin+'/?key='+secret;
 if(process.platform==='win32'&&!process.env.LIVETV_ASSISTANT_NO_BROWSER)execFile('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true},()=>{});else console.log(url);
 void clearPublishedTemps().finally(tick);setInterval(()=>void tick(),2000).unref();
});
process.on('SIGINT',()=>{pipeline.pause();server.close();});
