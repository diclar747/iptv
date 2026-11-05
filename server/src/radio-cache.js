import {many,one,query} from './pg.js';
import {configureRadioPersistence,radioStatuses,resolveRadioPlayback} from './radio-health.js';
import {configureRadioDirectoryCache,loadRadios} from './radio.js';

export async function initRadioCache(){
 const [checks,directory]=await Promise.all([
  many("SELECT * FROM radio_health_cache WHERE checked_at>now()-interval '24 hours'"),
  one("SELECT * FROM radio_directory_cache WHERE country='PY'")
 ]);
 configureRadioPersistence(checks,saveRadioCacheRecord);
 configureRadioDirectoryCache(directory,async({items,at})=>{
  await query(`INSERT INTO radio_directory_cache(country,items,checked_at) VALUES('PY',$1,$2)
   ON CONFLICT(country) DO UPDATE SET items=EXCLUDED.items,checked_at=EXCLUDED.checked_at`,[JSON.stringify(items),new Date(at)]);
 });
 return {checks:checks.length,directory:directory?.items?.length||0};
}

// Two maintenance workers share the global four-slot queue with viewers.
// Fresh results are skipped; no request waits for this sweep to finish.
export function startRadioMaintenance({catalog=loadRadios,statuses=radioStatuses,verify=resolveRadioPlayback,now=Date.now,intervalMs=60000}={}){
 let running=false,stopped=false;let timer;
 async function refresh(){
  if(running||stopped)return;running=true;
  try{
   const all=statuses(await catalog(),{verify:false});
   const isDue=s=>!s.checkedAt||now()-new Date(s.checkedAt).getTime()>(s.status==='online'?600000:s.status==='offline'?1800000:300000);
   const due=all.filter(isDue);
   due.sort((a,b)=>Number(b.status==='online')-Number(a.status==='online')||new Date(a.checkedAt||0)-new Date(b.checkedAt||0));
   let index=0;
   await Promise.all(Array.from({length:2},async()=>{while(index<due.length&&!stopped){const station=due[index++];if(isDue(statuses([station],{verify:false})[0]))await verify(station);}}));
  }catch(e){console.warn('[radio-cache] Actualización pendiente:',e.message);}finally{running=false;}
 }
 timer=setInterval(()=>void refresh(),intervalMs);timer.unref?.();void refresh();
 return {refresh,stop(){stopped=true;clearInterval(timer);}};
}

export async function saveRadioCacheRecord(record){
  const {id,signature,at,pending,...result}=record;
  await query(`INSERT INTO radio_health_cache(station_id,fingerprint,result,checked_at) VALUES($1,$2,$3,$4)
   ON CONFLICT(station_id) DO UPDATE SET fingerprint=EXCLUDED.fingerprint,result=EXCLUDED.result,checked_at=EXCLUDED.checked_at
   WHERE radio_health_cache.checked_at<=EXCLUDED.checked_at`,[id,signature,result,new Date(at)]);
}
