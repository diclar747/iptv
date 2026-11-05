import { isResolvable, resolvePlatform } from './resolver.js';
export function mediaBytes(bytes) {
 if(!bytes?.length) return false;
 const signature=new TextDecoder().decode(bytes.slice(0,12));
 return bytes[0]===0x47 || (bytes[0]===255 && (bytes[1]&224)===224) || /^(ID3|OggS|fLaC|FLV)/.test(signature) || ['ftyp','styp','moof','moov','sidx'].includes(signature.slice(4,8)) || (bytes[0]===0x1a && bytes[1]===0x45);
}
export async function checkStream({url,userAgent,referrer}={}, request=fetch) {
 if(!/^https?:\/\//i.test(url||'')) return {ok:false,error:'URL inválida'};
 const started=Date.now(), controller=new AbortController(), timer=setTimeout(()=>controller.abort(),10000);
 try {
  let target=isResolvable(url)?await resolvePlatform(url):url;
  const headers={'User-Agent':userAgent||'Mozilla/5.0 LiveTV/1.21',...(referrer?{Referer:referrer}:{})};
  for(let depth=0;depth<4;depth++) {
   const response=await request(target,{headers,signal:controller.signal,redirect:'follow'});
   const contentType=response.headers.get('content-type')||'';
   if(!response.ok) {await response.body?.cancel();return {ok:false,status:response.status,error:'HTTP '+response.status,ms:Date.now()-started};}
   const reader=response.body?.getReader();if(!reader) return {ok:false,error:'Sin contenido'};
   let bytes;try {bytes=(await reader.read()).value;} finally {await reader.cancel().catch(()=>{});}
   const text=new TextDecoder().decode(bytes||new Uint8Array()).trimStart();
   if(text.startsWith('#EXTM3U')) {
    const resource=text.split(/\r?\n/).map(x=>x.trim()).find(x=>x&&!x.startsWith('#'));
    if(!resource) return {ok:false,error:'Manifiesto vacío'};
    target=new URL(resource,response.url||target).href;continue;
   }
   const ok=mediaBytes(bytes)||(/^video\/|^audio\//i.test(contentType)&&bytes?.length>16&&!/^<(?:!doctype|html)|^\{/i.test(text));
   return {ok,status:response.status,contentType,ms:Date.now()-started,...(!ok?{error:'La URL no entregó video/audio válido'}:{})};
  }
  return {ok:false,error:'Demasiadas listas anidadas'};
 } catch(error) {return {ok:false,error:controller.signal.aborted?'Tiempo de espera agotado':error.message,ms:Date.now()-started};}
 finally {clearTimeout(timer);controller.abort();}
}
export async function checkMany(streams,{concurrency=4}={}) {
 const results=new Array(streams.length);let index=0;
 await Promise.all(Array.from({length:Math.min(concurrency,streams.length)},async()=>{while(index<streams.length){const current=index++;results[current]={...streams[current],...await checkStream(streams[current])};}}));return results;
}
