import {mkdir,writeFile,chmod} from 'node:fs/promises';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import crypto from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../.tools/',import.meta.url));
const asset=process.platform==='win32'?'yt-dlp.exe':process.platform==='darwin'?'yt-dlp_macos':process.arch==='arm64'?'yt-dlp_linux_aarch64':'yt-dlp_linux';
if(!['win32','linux','darwin'].includes(process.platform))throw Error('Instalá yt-dlp manualmente para esta plataforma');
const response=await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest',{headers:{'User-Agent':'LiveTV-setup'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('No se pudo consultar la versión oficial');const release=await response.json(),tag=release.tag_name;
if(!/^[a-zA-Z0-9._-]+$/.test(tag))throw Error('Versión oficial inválida');const base='https://github.com/yt-dlp/yt-dlp/releases/download/'+tag+'/';
async function get(name,binary=false){const r=await fetch(base+name,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('No se pudo obtener '+name);return binary?Buffer.from(await r.arrayBuffer()):r.text();}
const [sums,bytes]=await Promise.all([get('SHA2-256SUMS'),get(asset,true)]),expected=sums.split(/\r?\n/).find(line=>line.trim().endsWith(' '+asset)||line.trim().endsWith('*'+asset))?.split(/\s+/)[0];
if(!expected||crypto.createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('La suma SHA-256 no coincide; no se instalará el archivo');
await mkdir(root,{recursive:true});const output=path.join(root,process.platform==='win32'?'yt-dlp.exe':'yt-dlp');await writeFile(output,bytes);if(process.platform!=='win32')await chmod(output,0o755);
const {stdout}=await promisify(execFile)(output,['--version'],{timeout:30000,windowsHide:true});console.log('Descargador oficial instalado y verificado:',stdout.trim());console.log('Reiniciá el backend. Para la mejor calidad instalá también FFmpeg; DEPLOY.md incluye los pasos.');
