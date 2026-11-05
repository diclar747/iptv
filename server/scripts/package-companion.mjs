import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const exec=promisify(execFile),root=fileURLToPath(new URL('../../',import.meta.url));
if(process.platform!=='win32')throw Error('El paquete de Windows se prepara desde Windows.');
const stage=path.join(root,'node_modules/.livetv-package/LiveTV Asistente'),zip=path.join(root,'web/public/livetv-asistente-windows.zip');
await mkdir(path.join(stage,'runtime'),{recursive:true});await mkdir(path.join(stage,'tools'),{recursive:true});await mkdir(path.join(stage,'licenses'),{recursive:true});
for(const name of ['assistant.mjs','existing-downloader.mjs','index.html','Iniciar LiveTV.cmd','LEEME.txt'])await copyFile(path.join(root,'companion',name),path.join(stage,name));
await copyFile(process.execPath,path.join(stage,'runtime/node.exe'));
await copyFile(path.join(root,'server/.tools/yt-dlp.exe'),path.join(stage,'tools/yt-dlp.exe'));
for(const [name,url] of [['node-LICENSE.txt','https://raw.githubusercontent.com/nodejs/node/'+process.version+'/LICENSE'],['yt-dlp-LICENSE.txt','https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/LICENSE']]){
 const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('No se pudo obtener '+name);await writeFile(path.join(stage,'licenses',name),await r.text());
}
await writeFile(path.join(stage,'VERSION.txt'),'LiveTV Asistente 1.0.0\nNode '+process.version+'\nyt-dlp '+(await exec(path.join(stage,'tools/yt-dlp.exe'),['--version'])).stdout.trim()+'\n');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command','Compress-Archive -LiteralPath '+quote(stage)+' -DestinationPath '+quote(zip)+' -Force -CompressionLevel Optimal'],{timeout:180000,windowsHide:true});
console.log('Asistente preparado:',zip);
