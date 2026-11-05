import {createHash} from 'node:crypto';
import {resolveDesdeStreams,preferDesdeStream} from './desdeparaguay.js';
import {checkStream} from './checker.js';
import {radioSources,radioReferrer,RADIO_USER_AGENT} from './radio-sources.js';

export async function inspectRadio(station,request=fetch){
 const attempts=[],started=Date.now(),deadline=AbortSignal.timeout(24000);
 for(const source of radioSources(station)){
  if(deadline.aborted)break;
  const at=Date.now();let stage='resolve';
  try{
   const limited=(url,options={})=>request(url,{...options,signal:AbortSignal.any([deadline,AbortSignal.timeout(10000),...(options.signal?[options.signal]:[])])});
   const urls=await resolveDesdeStreams(source,limited),controllers=urls.map(()=>new AbortController());
   stage='media';
   try{
    const winner=await Promise.any(urls.map(async(url,index)=>{
     const variantRequest=(target,options={})=>limited(target,{...options,signal:AbortSignal.any([controllers[index].signal,...(options.signal?[options.signal]:[])])});
     const result=await checkStream({url,userAgent:RADIO_USER_AGENT,referrer:radioReferrer(station,source)},variantRequest);
     attempts.push({host:new URL(url).host,stage,httpStatus:result.status||null,code:result.code||null,error:result.ok?null:result.error,ms:Date.now()-at});
     if(!result.ok)throw result;
     return {url,index,contentType:result.contentType};
    }));
    preferDesdeStream(source,winner.url);
    return {ok:true,status:'online',source,contentType:winner.contentType,attempts:attempts.slice(),ms:Date.now()-started};
   }catch(error){if(!(error instanceof AggregateError))throw error;}
   finally{controllers.forEach(c=>c.abort());}
  }catch(e){attempts.push({host:new URL(source).host,stage,httpStatus:e.status||null,code:e.code||e.cause?.code||null,error:e.name==='TimeoutError'?'Tiempo de espera agotado':e.message,ms:Date.now()-at});}
 }
 const offline=attempts.length>0&&attempts.every(a=>[404,410].includes(a.httpStatus)||a.code==='RADIO_PAGE_MISSING');
 return {ok:false,status:offline?'offline':'error',reason:offline?'Las fuentes consultadas no tienen una señal disponible':'No se pudo comprobar la señal desde el servidor',attempts,ms:Date.now()-started};
}
export async function probeRadio(station,request=fetch){return (await inspectRadio(station,request)).ok;}

// Refresh quickly without erasing the last confirmed status when the TTL expires.
export function createRadioHealth({probe=inspectRadio,now=Date.now,ttl=180000,retention=86400000,errorTtl=60000,concurrency=4,maxQueue=100,onResult=async()=>{}}={}){
 const health=new Map(),queued=new Map(),waiters=new Map(),writes=new Set();let active=0;
 const signature=s=>createHash('sha256').update(JSON.stringify([s.url,...(s.alternativeSources||[])])).digest('hex');
 function persist(id){const result=health.get(id);if(!result)return;const task=Promise.resolve().then(()=>onResult({id,...result})).catch(e=>console.warn('[radio-cache] No se pudo guardar:',e.message));writes.add(task);void task.finally(()=>writes.delete(task));}
 function drain(){while(active<concurrency&&queued.size){const [id,station]=queued.entries().next().value;queued.delete(id);active++;
  const previous=health.get(id);health.set(id,{...(previous?.signature===signature(station)?previous:{}),pending:true,signature:signature(station)});
  Promise.resolve().then(()=>probe({...station,preferredSource:previous?.source})).then(result=>{
   const r=typeof result==='boolean'?{ok:result,status:result?'online':'offline'}:result;
   health.set(id,{...r,at:now(),pending:false,signature:signature(station),firstOnlineAt:r.ok?(previous?.firstOnlineAt??now()):previous?.firstOnlineAt,lastOnlineAt:r.ok?now():previous?.lastOnlineAt});
   persist(id);waiters.get(id)?.resolve(r);
  }).catch(e=>{const failed={status:'error',reason:'No se pudo comprobar la señal',at:now(),pending:false,signature:signature(station),lastOnlineAt:previous?.lastOnlineAt};health.set(id,failed);persist(id);waiters.get(id)?.resolve(failed);}).finally(()=>{waiters.delete(id);active--;drain();});
 }}
 function statuses(stations,{verify=true}={}){
  if(verify)for(const s of stations){const r=health.get(s.id),age=r?.at===undefined?Infinity:now()-r.at;const due=age>(r?.status==='error'?errorTtl:ttl);
   if(!r?.pending&&(!r||r.signature!==signature(s)||due)&&!queued.has(s.id)&&queued.size<maxQueue)queued.set(s.id,s);
  }
  drain();
  return stations.map(s=>{const r=health.get(s.id),age=r?.at===undefined?Infinity:now()-r.at,known=r?.signature===signature(s)&&age<=retention;
   const status=known?r.status:'checking';return {...s,status,reason:known?r.reason||null:null,stale:known&&age>ttl,checking:!!r?.pending||queued.has(s.id),checkedAt:r?.at!==undefined?new Date(r.at).toISOString():null,firstOnlineAt:r?.firstOnlineAt!==undefined?new Date(r.firstOnlineAt).toISOString():null,lastOnlineAt:r?.lastOnlineAt!==undefined?new Date(r.lastOnlineAt).toISOString():null};
  });
 }
 function ensure(station){
  const r=health.get(station.id);if(r?.signature===signature(station)&&r.status==='online'&&now()-r.at<=ttl)return Promise.resolve(r);
  if(waiters.has(station.id))return waiters.get(station.id).promise;
  if(!r?.pending&&!queued.has(station.id)){if(queued.size>=maxQueue)return Promise.resolve({status:'error',reason:'Hay muchas comprobaciones. Intentá nuevamente.'});queued.set(station.id,station);}
  let resolve;const promise=new Promise(done=>{resolve=done;});waiters.set(station.id,{promise,resolve});drain();return promise;
 }
 function hydrate(rows){
  for(const r of rows){const at=new Date(r.checked_at).getTime(),result=r.result;
   if(!r.station_id||!['online','offline','error'].includes(result?.status)||!Number.isFinite(at)||at>now()+60000||now()-at>retention)continue;
   health.set(r.station_id,{...result,at,signature:r.fingerprint,pending:false});
  }
 }
 return {statuses,ensure,hydrate,flush:()=>Promise.all([...writes]),stats:()=>({active,queued:queued.size}),preferred:id=>health.get(id)?.source};
}
let saveResult=async()=>{};
const shared=createRadioHealth({onResult:record=>saveResult(record)});
export const radioStatuses=(stations,options)=>shared.statuses(stations,options);
export const radioHealthStats=()=>shared.stats();
export const preferredRadioSource=id=>shared.preferred(id);

export const resolveRadioPlayback=station=>shared.ensure(station);

export function configureRadioPersistence(rows,save){shared.hydrate(rows);saveResult=save;}
export const flushRadioCache=()=>shared.flush();
