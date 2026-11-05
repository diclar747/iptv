const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const crypto = require('node:crypto');
const root = __dirname, token = crypto.randomBytes(24).toString('hex');
const bin = path.join(root,'tools','yt-dlp.exe');
fs.mkdirSync(path.join(root,'data'),{recursive:true});
const settingsFile = path.join(root,'data','settings.json');
let folder = path.join(root,'downloads');
let concurrency = 3;
try { const settings=JSON.parse(fs.readFileSync(settingsFile)); folder = settings.folder || folder; if(Number.isInteger(settings.concurrency)&&settings.concurrency>=1&&settings.concurrency<=8)concurrency=settings.concurrency; } catch {}
function saveSettings(){fs.writeFileSync(settingsFile,JSON.stringify({folder,concurrency}));}
const jobs = [], processes = new Map();
const jobsFile=path.join(root,'data','jobs.json');
try{const history=JSON.parse(fs.readFileSync(jobsFile,'utf8'));if(Array.isArray(history))for(const j of history.slice(0,500)){if(!j||!validURL(j.url))continue;if(['queued','downloading'].includes(j.status)){j.status='error';j.error='La descarga se interrumpió al cerrar el programa. Podés agregar el enlace otra vez para continuar.';}jobs.push(j);}}catch{}
function saveJobs(){try{fs.writeFileSync(jobsFile+'.tmp',JSON.stringify(jobs.slice(0,500)));fs.renameSync(jobsFile+'.tmp',jobsFile);}catch(e){console.error('No se pudo guardar el historial:',e.message);}}

function videoKey(value){const u=new URL(value);return u.hostname==='youtu.be'?u.pathname.slice(1):u.searchParams.get('v')||u.pathname.replace(/^\/(shorts|live|embed)\//,'');}
function validURL(value) { try {const u=new URL(value); return u.protocol==='https:' && ['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(u.hostname) && !u.username && !u.password;} catch {return false;} }
function run(exe,args,timeout=120000) {return new Promise((resolve,reject)=>{const p=spawn(exe,args,{windowsHide:true}); let out='',err=''; const timer=setTimeout(()=>{p.kill();reject(new Error('La operación tardó demasiado. Intentá de nuevo.'));},timeout); p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',e=>{clearTimeout(timer);reject(e)});p.on('close',c=>{clearTimeout(timer);c===0?resolve(out):reject(new Error(err.slice(-2500)||'No se pudo completar la operación.'));});});}
const common = ()=>['--ignore-config','--no-playlist','--js-runtimes',`node:${process.execPath}`,'--ffmpeg-location',path.join(root,'tools'),'--no-colors'];
const searchMovies=require('./search-library').createSearch(run,bin,common);
function fillSlots(list,active,limit,start){while(active.size<limit){const job=list.findLast(j=>j.status==='queued');if(!job)return;start(job);}}
function pump(){fillSlots(jobs,processes,concurrency,startJob);}
function startJob(job){
 job.status='downloading'; try{fs.mkdirSync(job.folder,{recursive:true});}catch(e){job.status='error';job.error='No se pudo crear la carpeta: '+e.message;return;}
 const format=job.quality==='best'?'bv*+ba/b':`bv*[height<=${job.quality}]+ba/b[height<=${job.quality}]`;
 const args=[...common(),'--newline','--progress','--progress-template','download:PROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s','--print','before_dl:TITLE:%(title)s','--print','after_move:FILE:%(filepath)s','--windows-filenames','--no-overwrites','-P',job.folder,'-o','%(title).160B [%(id)s].%(ext)s'];
 if(job.quality==='audio')args.push('-f','ba/b','-x','--audio-format','mp3','--audio-quality','0'); else args.push('-f',format,'--merge-output-format','mkv');
 args.push('--',job.url); const p=spawn(bin,args,{windowsHide:true}); processes.set(job.id,p);let buffer='';
 p.stdout.on('data',d=>{buffer+=d.toString();const lines=buffer.split(/\r?\n/);buffer=lines.pop(); for(const line of lines){if(line.startsWith('PROGRESS:')){const [percent,speed,eta]=line.slice(9).split('|');job.progress=parseFloat(percent)||0;job.speed=speed.trim();job.eta=eta.trim();job.stage=job.progress>=100?'Uniendo video y audio…':'Descargando…';}if(line.startsWith('TITLE:'))job.title=line.slice(6);if(line.startsWith('FILE:'))job.file=line.slice(5);}});
 p.stderr.on('data',d=>{job.log=(job.log+d.toString()).slice(-4000);});
 p.on('error',e=>{job.status='error';job.error=e.message;});
 p.on('close',code=>{processes.delete(job.id);if(job.status!=='cancelled'){job.status=code===0?'done':'error';job.progress=code===0?100:job.progress;job.error=code===0?'':job.log || job.error || 'Falló la descarga.';}saveJobs();pump();});
}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{try{
 const address=`127.0.0.1:${server.address().port}`;
 if(req.headers.host!==address && req.headers.host!==`localhost:${server.address().port}`)return send(res,403,{error:'Acceso no permitido'});
 const url=new URL(req.url,`http://${address}`);
 if(url.pathname.startsWith('/api/')){
 if(req.method==='GET'&&url.pathname==='/api/state')return send(res,200,{folder,jobs,concurrency,ready:fs.existsSync(bin)&&fs.existsSync(path.join(root,'tools','ffmpeg.exe'))});
 if(req.method!=='POST'||req.headers['x-app-token']!==token)return send(res,403,{error:'Acceso no permitido'});
 let body='';for await(const chunk of req){body+=chunk;if(body.length>16000)return send(res,413,{error:'Solicitud demasiado grande'});}const data=JSON.parse(body||'{}');
 if(url.pathname==='/api/search'){if(!fs.existsSync(bin))return send(res,503,{error:'Falta el descargador. Ejecutá Preparar.ps1.'});try{return send(res,200,await searchMovies(data));}catch(e){return send(res,400,{error:e.message});}}
 if(url.pathname==='/api/folder'){const selected=(await run('powershell.exe',['-NoProfile','-STA','-Command',"Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description='Elegí la carpeta de descargas'; if($d.ShowDialog() -eq 'OK'){[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Write-Output $d.SelectedPath}"],300000)).trim();if(selected){folder=selected;saveSettings();}return send(res,200,{folder});}
 if(url.pathname==='/api/open-folder'){const target=data.id?jobs.find(j=>j.id===data.id)?.folder:folder;if(!target)return send(res,404,{error:'Carpeta no encontrada'});fs.mkdirSync(target,{recursive:true});spawn('explorer.exe',[target],{windowsHide:true}).on('error',()=>{});return send(res,200,{ok:true});}
 if(url.pathname==='/api/info'){if(!validURL(data.url))return send(res,400,{error:'Pegá un enlace válido de YouTube.'});const info=JSON.parse(await run(bin,[...common(),'--dump-single-json','--skip-download','--',data.url]));return send(res,200,{title:info.title,thumbnail:info.thumbnail,duration:info.duration,channel:info.channel,height:Math.max(0,...(info.formats||[]).map(f=>f.height||0))});}
 if(url.pathname==='/api/settings'){if(!Number.isInteger(data.concurrency)||data.concurrency<1||data.concurrency>8)return send(res,400,{error:'Elegí entre 1 y 8 descargas simultáneas.'});concurrency=data.concurrency;saveSettings();pump();return send(res,200,{concurrency});}
 if(url.pathname==='/api/download'||url.pathname==='/api/batch'){
 const urls=url.pathname==='/api/batch'?data.urls:[data.url];
 if(!Array.isArray(urls)||!urls.length||urls.length>100||urls.some(u=>typeof u!=='string'||!validURL(u))||!['720','1080','1440','2160','best','audio'].includes(data.quality))return send(res,400,{error:'Agregá entre 1 y 100 enlaces válidos de YouTube y elegí una calidad.'});
 if(!fs.existsSync(bin)||!fs.existsSync(path.join(root,'tools','ffmpeg.exe')))return send(res,400,{error:'Faltan los motores. Ejecutá Preparar.ps1.'});
 const keys=new Set(jobs.filter(j=>['queued','downloading'].includes(j.status)&&j.folder===folder).map(j=>videoKey(j.url)));const ids=[];let skipped=0;
 for(const videoURL of urls){const key=videoKey(videoURL);if(keys.has(key)){skipped++;continue;}keys.add(key);const job={id:crypto.randomUUID(),url:videoURL,quality:data.quality,folder,title:'Obteniendo información…',status:'queued',progress:0,log:'',created:Date.now()};jobs.unshift(job);ids.push(job.id);}
 saveJobs();pump();return send(res,200,{id:ids[0],ids,skipped});}
 if(url.pathname==='/api/cancel'){const job=jobs.find(j=>j.id===data.id);if(job&&['queued','downloading'].includes(job.status)){job.status='cancelled';processes.get(job.id)?.kill();saveJobs();}return send(res,200,{ok:true});}
 return send(res,404,{error:'Operación no encontrada'});
 }
 const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/search.js':'search.js','/search.css':'search.css'};const file=files[url.pathname];if(!file){res.writeHead(404);return res.end();}let content=fs.readFileSync(path.join(root,'public',file),'utf8');if(file==='index.html')content=content.replace('__TOKEN__',token);res.writeHead(200,{'Content-Type':file.endsWith('html')?'text/html; charset=utf-8':file.endsWith('css')?'text/css':'text/javascript','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(content);
 }catch(e){send(res,500,{error:e.message});}});
if(require.main===module)server.listen(Number(process.env.PORT)||4318,'127.0.0.1',()=>{const url=`http://127.0.0.1:${server.address().port}`;console.log(`Downloader YouTuber: ${url}`);if(process.argv.includes('--open'))spawn('explorer.exe',[url]);});
module.exports={validURL,server,fillSlots};
