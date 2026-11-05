import { resolveDesdeStream } from './desdeparaguay.js';
export async function probeRadio(station, request = fetch) {
  const controller = new AbortController();
  try {
    const url = await resolveDesdeStream(station.url, request);
    const response = await request(url, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6500)]),
      headers: { 'User-Agent': 'Mozilla/5.0 LiveTV/1.19', ...(station.source ? { Referer: station.source } : {}) },
    });
    if (!response.ok) return false;
    const type = response.headers.get('content-type') || '';
    if (!/audio|ogg|mpegurl|octet-stream/i.test(type)) return false;
    const reader = response.body?.getReader();
    if (!reader) return false;
    try {
      const { value } = await reader.read();
      if (!value?.length) return false;
      if (/mpegurl/i.test(type)) return new TextDecoder().decode(value).trimStart().startsWith('#EXTM3U');
      if (/octet-stream/i.test(type)) return (value[0] === 255 && (value[1] & 224) === 224) || /^(ID3|OggS|fLaC)/.test(new TextDecoder().decode(value.slice(0,4)));
      return true;
    } finally { await reader.cancel().catch(() => {}); }
  } catch { return false; }
  finally { controller.abort(); }
}


// Shared bounded queue: concurrent viewers reuse one probe and its cached result.
export function createRadioHealth({probe=probeRadio,now=Date.now,ttl=180000,concurrency=4,maxQueue=100}={}) {
 const health=new Map(), queued=new Map();let active=0;
 function drain(){while(active<concurrency&&queued.size){const [id,station]=queued.entries().next().value;queued.delete(id);active++;health.set(id,{...(health.get(id)?.url===station.url?health.get(id):{}),pending:true,url:station.url});
  Promise.resolve().then(()=>probe(station)).then(online=>health.set(id,{online,at:now(),url:station.url,pending:false})).catch(()=>health.set(id,{online:false,at:now(),url:station.url,pending:false})).finally(()=>{active--;drain();});
 }}
 function statuses(stations,{verify=true}={}) {
  if(verify)for(const s of stations){const r=health.get(s.id);if(!r?.pending&&(!r||r.url!==s.url||now()-r.at>ttl)&&!queued.has(s.id)&&queued.size<maxQueue)queued.set(s.id,s);}
  drain();
  return stations.map(s=>{const r=health.get(s.id),fresh=r&&r.url===s.url&&r.at!==undefined&&now()-r.at<=ttl;return {...s,status:fresh?(r.online?'online':'offline'):'checking',checkedAt:r?.at?new Date(r.at).toISOString():null};});
 }
 return {statuses,stats:()=>({active,queued:queued.size})};
}
const shared=createRadioHealth();
export const radioStatuses=(stations,options)=>shared.statuses(stations,options);
