import {mkdir,copyFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const exec=promisify(execFile),root=fileURLToPath(new URL('../../',import.meta.url));
if(process.platform!=='win32')throw Error('El paquete de Windows se prepara desde Windows.');
const work=await mkdtemp(path.join(root,'node_modules/.livetv-package-'));
const stage=path.join(work,'LiveTV Asistente'),zip=path.join(root,'web/public/livetv-asistente-windows.zip');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
async function get(url){
 const response=await fetch(url,{signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw Error('No se pudo descargar '+new URL(url).pathname);
 return response;
}
try {
await mkdir(path.join(stage,'runtime'),{recursive:true});await mkdir(path.join(stage,'tools'),{recursive:true});await mkdir(path.join(stage,'licenses'),{recursive:true});
for(const name of ['assistant.mjs','pipeline.mjs','existing-downloader.mjs','index.html','Iniciar LiveTV.cmd','LEEME.txt'])await copyFile(path.join(root,'companion',name),path.join(stage,name));
await copyFile(process.execPath,path.join(stage,'runtime/node.exe'));
const release=await (await get('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest')).json();
const asset=name=>release.assets.find(asset=>asset.name===name)?.browser_download_url;
const archive=Buffer.from(await (await get(asset('yt-dlp'))).arrayBuffer());
const checksums=await (await get(asset('SHA2-256SUMS'))).text();
const checksum=checksums.match(/^([0-9a-f]{64})\s+\*?yt-dlp\s*$/mi)?.[1];
if(!checksum||createHash('sha256').update(archive).digest('hex')!==checksum.toLowerCase())throw Error('La firma de integridad de yt-dlp no coincide');
const downloader=path.join(stage,'tools/yt-dlp.pyz');
await writeFile(downloader,archive);
const pythonVersion='3.13.17';
const pythonArchive=Buffer.from(await (await get('https://www.python.org/ftp/python/'+pythonVersion+'/python-'+pythonVersion+'-embeddable-amd64.zip')).arrayBuffer());
const pythonSha256='0ba1ee4bfcbdc3a559d27e2e9ce76d04a7839947a23f46375872c755c0d463b8';
if(createHash('sha256').update(pythonArchive).digest('hex')!==pythonSha256)throw Error('La suma oficial de Python no coincide');
const pythonZip=path.join(work,'python.zip'),pythonDir=path.join(stage,'tools/python');
await mkdir(pythonDir);
await writeFile(pythonZip,pythonArchive);
await exec('tar.exe',['-xf',pythonZip,'-C',pythonDir],{timeout:90000,windowsHide:true});
const version=(await exec(path.join(pythonDir,'python.exe'),['-I',downloader,'--version'],{timeout:15000,windowsHide:true})).stdout.trim();
for(const [name,url] of [['node-LICENSE.txt','https://raw.githubusercontent.com/nodejs/node/'+process.version+'/LICENSE'],['yt-dlp-LICENSE.txt','https://raw.githubusercontent.com/yt-dlp/yt-dlp/'+release.tag_name+'/LICENSE'],['yt-dlp-THIRD-PARTY.txt','https://raw.githubusercontent.com/yt-dlp/yt-dlp/'+release.tag_name+'/THIRD_PARTY_LICENSES.txt']]){
 await writeFile(path.join(stage,'licenses',name),await (await get(url)).text());
}
await writeFile(path.join(stage,'VERSION.txt'),'LiveTV Asistente 1.2.0\nNode '+process.version+'\nPython '+pythonVersion+'\nyt-dlp '+version+'\n');
await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command','Compress-Archive -LiteralPath '+quote(stage)+' -DestinationPath '+quote(zip)+' -Force -CompressionLevel Optimal'],{timeout:180000,windowsHide:true});
console.log('Asistente preparado:',zip);
} finally {
 if(path.dirname(work)===path.join(root,'node_modules')&&path.basename(work).startsWith('.livetv-package-'))await rm(work,{recursive:true,force:true});
}
