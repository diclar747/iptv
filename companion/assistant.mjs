import http from 'node:http';
import {readFile,writeFile,mkdir,stat,open,chmod} from 'node:fs/promises';
import {createReadStream,existsSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {downloadWithExisting,findExistingDownloader} from './existing-downloader.mjs';
import {promisify} from 'node:util';
const exec=promisify(execFile);

const root=path.dirname(fileURLToPath(import.meta.url)),PORT=Number(process.env.LIVETV_ASSISTANT_PORT)||43827,origin='http://127.0.0.1:'+PORT;
const secret=randomBytes(32).toString('hex'),dataDir=process.env.LIVETV_ASSISTANT_DATA||path.join(process.env.LOCALAPPDATA||os.homedir(),'LiveTV Asistente');
await mkdir(dataDir,{recursive:true});
const configFile=path.join(dataDir,'connection.json');let config=null,paused=false,running=false,controller=null,child=null;
try{config=JSON.parse(await readFile(configFile,'utf8'));}catch{}
let state={message:'Preparado para vincular tu computadora',progress:0,title:'',phase:'idle',lastCompleted:null,error:null,existingDownloader:null};
void findExistingDownloader().then(d=>{state.existingDownloader=d?.base||null;});
const tool=path.join(root,'tools',process.platform==='win32'?'yt-dlp.exe':'yt-dlp');
function serverOrigin(value){const u=new URL(value);if(u.username||u.password||u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash)throw Error('Usá la dirección HTTPS de LiveTV, por ejemplo https://live.cd.com.py');return u.origin;}
function safeMessage(e){if(/confirm you.re not a bot|sign in to confirm/i.test(e.message))return 'YouTube pide verificar esta conexión. Probá abrir el video normalmente en tu navegador; no se usan cookies ni se omiten verificaciones.';if(/private video|not available|unavailable/i.test(e.message))return 'El video no está disponible para esta conexión.';return String(e.message||'No se pudo completar el trabajo').slice(0,400);}
async function remote(route,{method='GET',body,headers={},signal}={}){
 if(!config)throw Error('Vinculá esta computadora primero');
 const r=await fetch(config.server+'/api/companion'+route,{method,redirect:'error',headers:{Authorization:'Bearer '+config.token,...(body&&!Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),signal:signal||AbortSignal.timeout(60000)});
 let j;try{j=await r.json();}catch{throw Error('El servidor no respondió correctamente. Reintentaremos la conexión.');}if(!r.ok)throw Object.assign(Error(j.error||'Error de conexión'),{status:r.status});return j;
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
  if(req.method==='GET'&&u.pathname==='/status')return send(res,200,{...state,connected:!!config,server:config?.server,name:config?.name,paused});
  if(req.method!=='POST'||req.headers['x-livetv-local']!==secret||!String(req.headers['content-type']||'').startsWith('application/json'))return send(res,403,{error:'Solicitud local no permitida'});
  const body=await jsonBody(req);
  if(u.pathname==='/pair'){
   if(running)throw Error('Pausá el trabajo actual antes de cambiar la vinculación');
   const base=serverOrigin(body.server),r=await fetch(base+'/api/companion/pair',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:body.code,name:String(body.name||os.hostname()).slice(0,100)}),signal:AbortSignal.timeout(20000)}),j=await r.json();if(!r.ok)throw Error(j.error||'No se pudo vincular');
   config={server:base,token:j.token,id:j.id,name:String(body.name||os.hostname()).slice(0,100)};await writeFile(configFile,JSON.stringify(config),{mode:0o600});await chmod(configFile,0o600).catch(()=>{});paused=false;state.error=null;state.message='Computadora vinculada. Esperando enlaces del panel.';send(res,200,{ok:true});void tick();return;
  }
  if(u.pathname==='/pause'){paused=true;controller?.abort();child?.kill();state.message='Pausado. Los archivos enviados se conservan para continuar.';return send(res,200,{ok:true});}
  if(u.pathname==='/resume'){paused=false;state.error=null;send(res,200,{ok:true});void tick();return;}
  if(u.pathname==='/disconnect'){paused=true;controller?.abort();child?.kill();config=null;await writeFile(configFile,'null',{mode:0o600});state.message='Computadora desconectada localmente. Podés revocar la vinculación desde el panel.';return send(res,200,{ok:true});}
  return send(res,404,{error:'No encontrado'});
 }catch(e){send(res,400,{error:safeMessage(e)});}
});

async function download(job,dir,signal){
 const url=new URL(job.url);if(url.origin!=='https://www.youtube.com'||url.pathname!=='/watch'||!/^[-\w]{11}$/.test(job.sourceId)||url.searchParams.get('v')!==job.sourceId)throw Error('El enlace recibido no corresponde a un video individual');
 const reused=await downloadWithExisting(job,signal,s=>Object.assign(state,s),async()=>{const {stdout}=await exec(tool,['--ignore-config','--no-playlist','--js-runtimes','node:'+process.execPath,'--socket-timeout','15','--retries','1','--dump-single-json','--skip-download','--',job.url],{timeout:60000,maxBuffer:16*1024**2,windowsHide:true,signal});return JSON.parse(stdout);});if(reused)return reused;
 const target=path.join(dir,'video.mp4'),info=path.join(dir,'video.info.json');
 if(existsSync(target)&&existsSync(info)){const m=JSON.parse(await readFile(info,'utf8'));if(m.id===job.sourceId)return {file:target,metadata:m};}
 if(!existsSync(tool))throw Error('Falta el descargador. Extraé nuevamente el ZIP completo del asistente.');
 state.phase='downloading';state.message='Descargando desde YouTube';state.progress=0;
 await new Promise((resolve,reject)=>{
  signal.throwIfAborted();let errors='';
  const args=['--ignore-config','--no-playlist','--no-cache-dir','--socket-timeout','15','--retries','2','--fragment-retries','2','--js-runtimes','node:'+process.execPath,'--match-filters','!is_live','--max-filesize','2147483648','--format',`best[ext=mp4][vcodec^=avc1][acodec!=none][height<=${job.quality||720}]`,'--write-info-json','--newline','--progress-template','download:%(progress._percent_str)s','--output',path.join(dir,'video.%(ext)s'),'--',job.url];
  child=spawn(tool,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const abort=()=>child?.kill();signal.addEventListener('abort',abort,{once:true});
  child.stdout.on('data',b=>{for(const line of b.toString().split(/[\r\n]+/)){const m=line.match(/download:\s*([\d.]+)%/);if(m)state.progress=Math.max(state.progress,Math.min(100,Number(m[1])));}});
  child.stderr.on('data',b=>{errors=(errors+b.toString()).slice(-3000);});
  child.on('error',reject);child.on('close',code=>{signal.removeEventListener('abort',abort);child=null;if(signal.aborted)return reject(Object.assign(Error('Pausado'),{name:'AbortError'}));code===0?resolve():reject(Error(errors||'No se pudo descargar este video. Probá con un MP4 que ya tengas.'));});
 });
 const m=JSON.parse(await readFile(info,'utf8'));if(m.id!==job.sourceId||m.is_live)throw Error('El archivo descargado no corresponde al video terminado solicitado');return {file:target,metadata:m};
}
async function processJob(job,signal){
 const dir=path.join(dataDir,'jobs',job.id);if(!/^[a-f0-9-]{36}$/i.test(job.id))throw Error('Trabajo inválido');await mkdir(dir,{recursive:true});
 state.title=job.title||job.url;state.error=null;
 const timer=setInterval(()=>{void remote('/jobs/'+job.id+'/progress',{method:'POST',body:{progress:Math.floor(state.progress/2)},signal:AbortSignal.timeout(15000)}).catch(e=>{if([401,403,404,409].includes(e.status))controller?.abort();});},10000);
 try{
  const result=await download(job,dir,signal),size=(await stat(result.file)).size;
  signal.throwIfAborted();state.title=result.metadata.title||state.title;
  const fields=['id','title','description','uploader','channel_url','duration','upload_date','release_year','license','thumbnail','tags','height','is_live','live_status'];
  const metadata=Object.fromEntries(fields.filter(k=>result.metadata[k]!==undefined).map(k=>[k,result.metadata[k]]));
  if(metadata.description)metadata.description=String(metadata.description).slice(0,30000);if(metadata.tags)metadata.tags=metadata.tags.slice(0,30);
  await remote('/jobs/'+job.id+'/prepare',{method:'POST',body:{size,metadata},signal});
  const hash=createHash('sha256');for await(const chunk of createReadStream(result.file)){signal.throwIfAborted();hash.update(chunk);}const checksum=hash.digest('hex');
  let status=await remote('/jobs/'+job.id,{signal}),offset=status.offset;
  state.phase='uploading';state.message='Enviando el video a LiveTV';
  const fd=await open(result.file,'r');try{while(offset<size){signal.throwIfAborted();const buffer=Buffer.alloc(Math.min(4*1024*1024,size-offset));const {bytesRead}=await fd.read(buffer,0,buffer.length,offset);if(!bytesRead)throw Error('El archivo local cambió durante el envío');const bytes=buffer.subarray(0,bytesRead);
    try{const r=await remote('/jobs/'+job.id+'/chunk',{method:'PUT',body:bytes,headers:{'Content-Type':'application/octet-stream','X-Upload-Offset':String(offset),'X-Chunk-SHA256':createHash('sha256').update(bytes).digest('hex')},signal});offset=r.offset;state.progress=Math.floor(offset/size*100);}catch(e){if(e.status===409){status=await remote('/jobs/'+job.id,{signal});if(status.state!=='uploading')throw e;offset=status.offset;}else throw e;}
  }}finally{await fd.close();}
  state.phase='publishing';state.message='Preparando la copia compatible en el servidor';await remote('/jobs/'+job.id+'/finish',{method:'POST',body:{sha256:checksum},signal});
  for(;;){signal.throwIfAborted();const status=await remote('/jobs/'+job.id,{signal});if(status.state==='done')break;if(['error','cancelled'].includes(status.state))throw Error(status.error||'No se pudo publicar el video');await new Promise(r=>setTimeout(r,2000));}
  state.lastCompleted=state.title;state.message='Video agregado a la cartelera';state.progress=100;
  // Delete only this validated job directory after confirmed publication. Keep incomplete jobs to resume.
  const {rm}=await import('node:fs/promises');const expected=path.join(dataDir,'jobs');if(path.dirname(path.resolve(dir))===path.resolve(expected))await rm(dir,{recursive:true,force:true}).catch(()=>{});
 }finally{clearInterval(timer);}
}
async function tick(){
 if(running||paused||!config)return;running=true;controller=new AbortController();let currentJob=null;
 try{const {job}=await remote('/next');currentJob=job;if(job)await processJob(job,controller.signal);else{state.phase='idle';state.message='Conectado. Esperando enlaces enviados desde el panel.';state.progress=0;state.title='';state.error=null;}}
 catch(e){if(e.name!=='AbortError'){state.error=safeMessage(e);state.message='No se pudo completar el trabajo';if(e.status===401){paused=true;state.message='La vinculación venció o fue revocada. Generá un código nuevo.';}else if(!/fetch failed|timeout|network|ECONN|ENOTFOUND|interrump/i.test(e.message)){
   try{if(currentJob)await remote('/jobs/'+currentJob.id+'/error',{method:'POST',body:{message:state.error}});}catch{}
  }}}
 finally{running=false;controller=null;}
}
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'El asistente ya está abierto. Cerrá la otra ventana antes de iniciarlo otra vez.':e.message);process.exitCode=1;});
server.listen(PORT,'127.0.0.1',()=>{
 console.log('LiveTV Asistente — mantené esta ventana abierta mientras importa.');
 const url=origin+'/?key='+secret;
 if(process.platform==='win32'&&!process.env.LIVETV_ASSISTANT_NO_BROWSER)execFile('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true},()=>{});else console.log(url);
 void tick();setInterval(()=>void tick(),5000).unref();
});
process.on('SIGINT',()=>{paused=true;controller?.abort();child?.kill();server.close();});
