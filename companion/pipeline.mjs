import {randomBytes} from 'node:crypto';
export class SerialUploads{
 constructor(){this.busy=false;this.waiters=[];}
 acquire(signal){return new Promise((resolve,reject)=>{
  signal.throwIfAborted();const entry={signal,resolve,reject,abort:null};
  entry.abort=()=>{this.waiters=this.waiters.filter(x=>x!==entry);reject(signal.reason);};signal.addEventListener('abort',entry.abort,{once:true});this.waiters.push(entry);this.drain();
 });}
 drain(){if(this.busy)return;const entry=this.waiters.shift();if(!entry)return;entry.signal.removeEventListener('abort',entry.abort);if(entry.signal.aborted){entry.reject(entry.signal.reason);this.drain();return;}this.busy=true;let released=false;entry.resolve(()=>{if(released)return;released=true;this.busy=false;this.drain();});}
}
export class ImportPipeline{
 constructor({claim,run,onError=()=>{},onChange=()=>{},downloads=3,maxPending=6}){Object.assign(this,{claim,run,onError,onChange,downloads,maxPending});this.tasks=new Map();this.history=[];this.worker=randomBytes(16).toString('hex');this.paused=false;this.polling=false;this.uploads=new SerialUploads();}
 snapshot(){return [...this.tasks.values()].map(t=>({...t.state,id:t.job.id}));}
 pause(){this.paused=true;for(const t of this.tasks.values())t.controller.abort();this.onChange();}
 resume(){this.paused=false;void this.poll();}
 async poll(){
  if(this.paused||this.polling)return;
  const downloading=[...this.tasks.values()].filter(t=>['queued','downloading','metadata'].includes(t.state.phase)).length;
  const limit=Math.min(this.downloads-downloading,this.maxPending-this.tasks.size);if(limit<=0)return;this.polling=true;
  try{const {jobs}=await this.claim({worker:this.worker,exclude:[...this.tasks.keys()],limit});if(this.paused)return;for(const job of jobs||[])if(!this.tasks.has(job.id)&&this.tasks.size<this.maxPending)this.start(job);}
  catch(e){await this.onError(e,null);}finally{this.polling=false;}
 }
 start(job){
  const task={job,controller:new AbortController(),state:{title:job.title||job.url,phase:'queued',message:'Preparando descarga',progress:0,error:null}};
  this.tasks.set(job.id,task);this.onChange();
  Promise.resolve().then(()=>this.run(job,task.controller,task.state,this.uploads)).catch(async e=>{if(e.name!=='AbortError'){task.state.error=e.message;task.state.phase='error';await this.onError(e,job);}}).finally(()=>{
   this.tasks.delete(job.id);if(!task.controller.signal.aborted)this.history=[{...task.state,id:job.id},...this.history].slice(0,8);this.onChange();void this.poll();
  });
 }
}
