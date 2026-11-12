import { isResolvable, resolvePlatform } from './resolver.js';
import {isDesdeParaguay,resolveDesdeStreams,refreshableDesdeSource} from './desdeparaguay.js';
import {RADIO_USER_AGENT} from './radio-sources.js';
export function mediaBytes(bytes) {
 if(!bytes?.length) return false;
 const signature=new TextDecoder().decode(bytes.slice(0,12));
 return bytes[0]===0x47 || (bytes[0]===255 && (bytes[1]&224)===224) || /^(ID3|OggS|fLaC|FLV)/.test(signature) || ['ftyp','styp','moof','moov','sidx'].includes(signature.slice(4,8)) || (bytes[0]===0x1a && bytes[1]===0x45);
}
async function readProbe(response, target) {
 const reader = response.body?.getReader();
 if (!reader) return null;
 const chunks = [];
 let size = 0;
 let playlist = /mpegurl/i.test(response.headers.get('content-type') || '') || /\.m3u8(?:\?|$)/i.test(target);
 try {
  while (size < (playlist ? 256 * 1024 : 4096)) {
   const { done, value } = await reader.read();
   if (done) break;
   const chunk = Buffer.from(value.subarray(0, 256 * 1024 - size));
   chunks.push(chunk);
   size += chunk.length;
   if (!playlist) {
    const prefix = Buffer.concat(chunks).subarray(0, 32).toString('utf8').trimStart();
    playlist = prefix.startsWith('#EXTM3U');
    if (!playlist && size >= 377) break;
   }
  }
  return Buffer.concat(chunks);
 } finally { await reader.cancel().catch(() => {}); }
}

function playlistResources(text) {
 const lines = text.split(/\r?\n/).map(line => line.trim());
 const entries = lines.filter(line => line && !line.startsWith('#'));
 if (lines.some(line => line.startsWith('#EXT-X-STREAM-INF:'))) return entries.slice(0,2).map(url=>({url,encrypted:false}));
 // Prefer a complete segment close to the live edge. The first segment
 // can expire between the manifest request and the segment request.
 return entries.slice(-2).map(url=>{
  const key = lines.slice(0, lines.lastIndexOf(url)).findLast(line => line.startsWith('#EXT-X-KEY:'));
  return { url, encrypted: Boolean(key && !/^#EXT-X-KEY:METHOD=NONE(?:,|$)/.test(key)) };
 });
}

function isPlayableSample(bytes, encrypted) {
 if (encrypted) return bytes?.length >= 16;
 if (!mediaBytes(bytes)) return false;
 if (bytes[0] === 0x47) return bytes[188] === 0x47 && bytes[376] === 0x47;
 return bytes.length >= 12;
}

export async function checkStream({url,userAgent,referrer}={}, request=fetch, { strict = false } = {}) {
 if(!/^https?:\/\//i.test(url||'')) return {ok:false,error:'URL inválida'};
 url=refreshableDesdeSource(url);
 const started=Date.now(), controller=new AbortController(), timer=setTimeout(()=>controller.abort(),10000);
 const headers={'User-Agent':userAgent||RADIO_USER_AGENT,...(referrer?{Referer:referrer}:{})};
 let remaining=10;
 async function probe(target,depth=0,encrypted=false) {
  if(depth>=4||remaining--<=0)return {ok:false,error:'Demasiadas listas anidadas'};
  try {
   const response=await request(target,{headers,signal:controller.signal,redirect:'follow'});
   const contentType=response.headers.get('content-type')||'';
   if(!response.ok) {await response.body?.cancel();return {ok:false,status:response.status,error:'HTTP '+response.status,ms:Date.now()-started};}
   const bytes = await readProbe(response, response.url || target);
   if (!bytes?.length) return {ok:false,error:'Sin contenido'};
   const text=new TextDecoder().decode(bytes||new Uint8Array()).trimStart();
   if(text.startsWith('#EXTM3U')) {
    let result={ok:false,error:'Manifiesto vacío'};
    for(const resource of playlistResources(text)){
     result=await probe(new URL(resource.url,response.url||target).href,depth+1,resource.encrypted);
     if(result.ok)return {...result,format:'hls'};
    }
    return result;
   }
   const ok = strict
    ? !/^(?:text\/html|application\/json)/i.test(contentType) && isPlayableSample(bytes, encrypted)
    : mediaBytes(bytes)||(/^video\/|^audio\//i.test(contentType)&&bytes?.length>16&&!/^<(?:!doctype|html)|^\{/i.test(text));
   const format = bytes[0] === 0x47 && bytes[188] === 0x47 && bytes[376] === 0x47 ? 'mpegts' : undefined;
   return {ok,status:response.status,contentType,ms:Date.now()-started,...(ok?{format}:{error:'La URL no entregó video/audio válido'})};
  } catch(error) {return failed(error);}
 }
 function failed(error) {return {ok:false,error:controller.signal.aborted?'Tiempo de espera agotado':error.message,code:error.cause?.code||error.code||error.name,ms:Date.now()-started};}
 try {
  const targets=isDesdeParaguay(url)?(await resolveDesdeStreams(url,request)).slice(0,2):[isResolvable(url)?await resolvePlatform(url):url];
  let result={ok:false,error:'Sin señal disponible'};
  for(const target of targets){
   result=await probe(target);
   if(result.ok)return result;
  }
  return result;
 } catch(error) {return failed(error);}
 finally {clearTimeout(timer);controller.abort();}
}
export async function checkMany(streams,{concurrency=4,strict=false}={}) {
 const results=new Array(streams.length);let index=0;
 await Promise.all(Array.from({length:Math.min(concurrency,streams.length)},async()=>{while(index<streams.length){const current=index++;results[current]={...streams[current],...await checkStream(streams[current],fetch,{strict})};}}));return results;
}
