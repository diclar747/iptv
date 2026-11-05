import {writeFile} from 'node:fs/promises';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile);
function thumbnail(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&/^(?:i(?:[1-4])?\.ytimg\.com|img\.youtube\.com)$/.test(u.hostname)?u.href:null;}catch{return null;}}
export async function createMediaCover({file,dir,duration,metadata={},title=''}){
 const id=metadata.sourceUrl?.match(/[?&]v=([-\w]{11})(?:&|$)/)?.[1]||String(title).match(/\[([-\w]{11})\](?:\.\w+)?\s*$/)?.[1];
 const url=thumbnail(metadata.thumbnail)||(id?'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg':null);
 if(url)try{const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok||!/^image\/(?:jpeg|png|webp)/i.test(r.headers.get('content-type')||''))throw Error();const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>2*1024**2)throw Error();chunks.push(chunk);}const bytes=Buffer.concat(chunks);if(bytes.length<2000)throw Error();const ext=bytes[0]===255&&bytes[1]===216?'jpg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'webp':null;if(!ext)throw Error();const name='cover.'+ext;await writeFile(path.join(dir,name),bytes);return name;}catch{}
 try{const seek=duration>20?Math.min(300,Math.max(12,duration*.15)):0;await exec(process.env.FFMPEG_BIN||'ffmpeg',['-v','error','-y','-ss',String(seek),'-threads','2','-i',file,'-frames:v','1','-vf','thumbnail=24,scale=960:-2',path.join(dir,'cover.jpg')],{timeout:30000,maxBuffer:1024**2});return 'cover.jpg';}catch{return null;}
}
