import {spawn} from 'node:child_process';
export function preparationProgress(record,duration){
 const seconds=Math.max(0,(Number(record.out_time_us)||0)/1e6),speed=Number(String(record.speed||'').replace(/x$/,''))||null;
 return {phase:'converting',percent:duration>0?Math.min(99,Math.floor(seconds/duration*100)):0,secondsProcessed:seconds,totalSeconds:duration||null,speed,etaSeconds:speed&&seconds>0&&duration>seconds?Math.ceil((duration-seconds)/speed):null};
}
export function prepareVideo(executable,args,{duration,onProgress,timeoutMs=8*60*60*1000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,['-nostats','-progress','pipe:1',...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let buffer='',error='',record={},timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
  child.stdout.on('data',data=>{buffer+=data.toString();let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n).trim();buffer=buffer.slice(n+1);const i=line.indexOf('=');if(i<0)continue;record[line.slice(0,i)]=line.slice(i+1);if(line.startsWith('progress=')){onProgress?.(preparationProgress(record,duration));record={};}}});
  child.stderr.on('data',data=>{error=(error+data.toString()).slice(-6000);});
  child.on('error',e=>{clearTimeout(timer);reject(e);});
  child.on('close',code=>{clearTimeout(timer);if(code===0)resolve();else reject(Error(timedOut?'La preparación superó el tiempo máximo permitido.':error||'No se pudo preparar el video.'));});
 });
}
