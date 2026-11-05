import path from 'node:path';
import {existsSync,constants} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {mkdir,access,readdir,readFile,open,stat,statfs,rm} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export const MEDIA_ROOT=path.resolve(process.env.MEDIA_STORAGE_DIR||fileURLToPath(new URL('../../data/media/',import.meta.url)));
export const PUBLIC_BASE=(process.env.PUBLIC_BASE_URL||'https://live.cd.com.py').replace(/\/$/,'');
export const MAX_BYTES=Math.min(10*1024**3,Math.max(1024**2,Number(process.env.MEDIA_MAX_BYTES)||2*1024**3));
const localTool=fileURLToPath(new URL('../.tools/'+(process.platform==='win32'?'yt-dlp.exe':'yt-dlp'),import.meta.url));
const BIN=process.env.YTDLP_BIN||(existsSync(localTool)?localTool:'yt-dlp');
const MAX_HEIGHT=1080;
export function parseYoutubeUrl(raw){
 let u;try{u=new URL(String(raw));}catch{throw Object.assign(Error('Pegá una dirección válida de YouTube'),{status:400});}
 if(u.protocol!=='https:'||u.username||u.password||u.port)throw Object.assign(Error('Usá un enlace HTTPS de YouTube'),{status:400});
 const host=u.hostname.toLowerCase();let id;
 if(host==='youtu.be')id=u.pathname.slice(1).split('/')[0];
 else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host))id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:shorts|live)\/([^/]+)\/?$/)?.[1];
 if(!/^[a-zA-Z0-9_-]{11}$/.test(id||''))throw Object.assign(Error('Elegí un video individual de YouTube, no un canal o una lista'),{status:400});
 return {id,url:'https://www.youtube.com/watch?v='+id};
}
export function sanitizeMetadata(info){
 if(info.is_live||['is_live','is_upcoming','post_live'].includes(info.live_status))throw Object.assign(Error('Elegí un video terminado; las transmisiones en vivo no se importan como película'),{status:400});
 return {height:Number(info.height)||null,id:String(info.id||''),title:String(info.title||'Video sin título').slice(0,300),description:String(info.description||'').slice(0,30000),creator:String(info.uploader||info.channel||'').slice(0,200),channelUrl:String(info.channel_url||info.uploader_url||'').slice(0,1000),duration:Number(info.duration)||null,uploadDate:info.upload_date||null,year:Number(info.release_year)||null,license:String(info.license||'No indicada').slice(0,200),thumbnail:/^https:\/\//.test(info.thumbnail||'')?info.thumbnail:null,tags:Array.isArray(info.tags)?info.tags.slice(0,30).map(String):[],sourceUrl:'https://www.youtube.com/watch?v='+info.id};
}
const baseArgs=['--ignore-config','--no-playlist','--no-warnings','--socket-timeout','15','--retries','2','--fragment-retries','2','--js-runtimes','node:'+process.execPath];
let capabilitiesCache,capabilitiesPending;
export function importerCapabilities(){
 if(capabilitiesCache&&Date.now()-capabilitiesCache.at<60000)return Promise.resolve(capabilitiesCache.value);
 if(capabilitiesPending)return capabilitiesPending;
 capabilitiesPending=(async()=>{
  const [downloader,merger]=await Promise.allSettled([exec(BIN,['--version'],{timeout:15000,windowsHide:true}),exec(process.env.FFMPEG_BIN||'ffmpeg',['-version'],{timeout:5000,windowsHide:true})]);
  let storage=true;try{await mkdir(MEDIA_ROOT,{recursive:true});await access(MEDIA_ROOT,constants.W_OK);}catch{storage=false;}
  const value={ready:downloader.status==='fulfilled'&&storage,downloader:downloader.status==='fulfilled',version:downloader.status==='fulfilled'?downloader.value.stdout.trim():null,merger:merger.status==='fulfilled',storage,maxBytes:MAX_BYTES,maxHeight:MAX_HEIGHT};capabilitiesCache={at:Date.now(),value};return value;
 })().finally(()=>{capabilitiesPending=null;});return capabilitiesPending;
}
const previewCache=new Map(),previewPending=new Map();
async function fetchPreviewYoutube(url){
 const source=parseYoutubeUrl(url),cap=await importerCapabilities();
 if(!cap.downloader)throw Object.assign(Error('El servidor necesita yt-dlp para importar videos. Consultá DEPLOY.md.'),{status:503});
 try{const {stdout}=await exec(BIN,[...baseArgs,'--dump-single-json','--skip-download','--',source.url],{timeout:60000,maxBuffer:16*1024**2,windowsHide:true});const metadata=sanitizeMetadata(JSON.parse(stdout));if(metadata.id!==source.id)throw Error('El proveedor devolvió un video diferente');return metadata;}
 catch(e){if(e.status)throw e;throw Object.assign(Error('No se pudieron obtener los datos. Verificá que el video sea público y esté disponible; no se usan cuentas ni se eluden restricciones.'),{status:422});}
}
export async function previewYoutube(url){
 const source=parseYoutubeUrl(url),cached=previewCache.get(source.id);if(cached&&Date.now()-cached.at<300000)return cached.metadata;
 if(previewPending.has(source.id))return previewPending.get(source.id);
 const promise=fetchPreviewYoutube(source.url).then(metadata=>{if(previewCache.size>=50)previewCache.delete(previewCache.keys().next().value);previewCache.set(source.id,{at:Date.now(),metadata});return metadata;}).finally(()=>previewPending.delete(source.id));previewPending.set(source.id,promise);return promise;
}
export function assetDirectory(id){if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('Identificador de archivo inválido');const dir=path.resolve(MEDIA_ROOT,id);if(path.dirname(dir)!==MEDIA_ROOT)throw Error('Ruta fuera del almacenamiento');return dir;}
async function cancellable(promise,signal){
 if(!signal)return promise;signal.throwIfAborted();let abort;
 try{return await Promise.race([promise,new Promise((resolve,reject)=>{abort=()=>reject(Object.assign(Error('Importación cancelada'),{code:'CANCELLED'}));signal.addEventListener('abort',abort,{once:true});})]);}finally{signal.removeEventListener('abort',abort);}
}
export async function downloadYoutube({id,url,quality=720,signal,onProgress=()=>{}}){
 signal?.throwIfAborted();
 const cap=await cancellable(importerCapabilities(),signal);if(!cap.ready)throw Error('El descargador o la carpeta de almacenamiento no están disponibles');
 await cancellable(previewYoutube(url),signal);
 const dir=assetDirectory(id);await mkdir(dir,{recursive:true});
 const disk=await statfs(MEDIA_ROOT);if(Number(disk.bavail)*Number(disk.bsize)<MAX_BYTES+512*1024**2)throw Error('No hay espacio suficiente en el servidor para importar otro video');
 const height=[360,480,720,1080].includes(Number(quality))?Number(quality):720;
 const combined=`b[height<=${height}][ext=mp4][vcodec^=avc1][acodec!=none]`;
 const format=cap.merger?`bv[height<=${height}][ext=mp4][vcodec^=avc1]+ba[ext=m4a]/${combined}`:combined;
 const args=[...baseArgs,...(process.env.FFMPEG_BIN&&path.isAbsolute(process.env.FFMPEG_BIN)?['--ffmpeg-location',process.env.FFMPEG_BIN]:[]),'--no-simulate','--match-filters','!is_live','--newline','--progress','--progress-delta','1','--progress-template','download:LIVE_PROGRESS %(progress._percent_str)s','--write-info-json','--write-thumbnail','--max-filesize',String(MAX_BYTES),'-f',format,'--merge-output-format','mp4','-o',path.join(dir,'video.%(ext)s'),'--',parseYoutubeUrl(url).url];
 await new Promise((resolve,reject)=>{
  const child=spawn(BIN,args,{windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});let finished=false,buffer='',reported=-1;
  const abort=()=>{if(!child.pid)return;try{if(process.platform==='win32')execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{});else process.kill(-child.pid,'SIGTERM');}catch{child.kill();}};
  const timer=setTimeout(abort,2*60*60*1000);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const progress=data=>{buffer=(buffer+String(data)).slice(-16384);for(const match of buffer.matchAll(/LIVE_PROGRESS\s+(\d+(?:\.\d+)?)%/g)){const value=Math.min(99,Math.floor(Number(match[1])));if(value>reported){reported=value;onProgress(value);}}buffer=buffer.slice(-300);};
  child.stdout.on('data',progress);child.stderr.on('data',progress);
  child.once('error',e=>{finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(Error(e.code==='ENOENT'?'No está instalado yt-dlp':'No se pudo iniciar la descarga'));});
  child.once('close',code=>{if(finished)return;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(signal?.aborted)return reject(Object.assign(Error('Importación cancelada'),{code:'CANCELLED'}));if(code!==0)return reject(Error('YouTube no permitió completar la descarga, o no hay un formato MP4 compatible. Actualizá yt-dlp y comprobá la disponibilidad del video.'));resolve();});
 });
 const files=await readdir(dir),video=files.find(n=>n==='video.mp4');if(!video)throw Error('No se generó un archivo MP4 completo');
 const size=(await stat(path.join(dir,video))).size;if(size<24||size>MAX_BYTES)throw Error('El video está vacío o supera el límite del servidor');
 const handle=await open(path.join(dir,video),'r');const header=Buffer.alloc(16);try{await handle.read(header,0,16,0);}finally{await handle.close();}if(header.subarray(4,8).toString()!=='ftyp')throw Error('El archivo descargado no es un MP4 compatible');
 const info=JSON.parse(await readFile(path.join(dir,'video.info.json'),'utf8')),metadata=sanitizeMetadata(info);
 const cover=files.find(n=>/^video\.(jpg|jpeg|png|webp)$/.test(n))||null;
 await rm(path.join(dir,'video.info.json'),{force:true});
 return {video,cover,size,metadata};
}
