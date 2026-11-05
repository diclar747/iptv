// Proxy de streams: resuelve CORS y aplica cabeceras (User-Agent/Referer)
// que muchos servidores IPTV exigen. Para HLS, reescribe el manifiesto .m3u8
// de modo que segmentos, claves y sub-playlists también pasen por el proxy.
//
//   GET /api/stream?url=<encoded>&ua=<userAgent>&ref=<referrer>
//
// El navegador siempre habla con nuestro backend (mismo origen), así que no
// hay bloqueo CORS y el reproductor no necesita conocer las cabeceras reales.

import {radioSources,radioReferrer,RADIO_USER_AGENT} from './radio-sources.js';
import {preferredRadioSource} from './radio-health.js';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { streamToken } from './streamToken.js';
import { isDesdeParaguay, resolveDesdeStreams, preferDesdeStream } from './desdeparaguay.js';
import { isResolvable, resolvePlatform } from './resolver.js';

// UA de navegador por defecto: algunos orígenes rechazan UA vacío o de Node.
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const M3U8_CT = /mpegurl/i;

function isManifest(url, contentType) {
  if (contentType && M3U8_CT.test(contentType)) return true;
  return /\.m3u8(\?|$)/i.test(url);
}

// Construye la URL de proxy para una URL absoluta, preservando ua/ref.
// En modo token (cast), agrega ?t=<token> para que los segmentos/sub-playlists
// también se puedan servir sin cookie al dispositivo que proyecta.
function proxify(absoluteUrl, ua, ref, tokenMode) {
  const qs = new URLSearchParams({ url: absoluteUrl });
  if (ua) qs.set('ua', ua);
  if (ref) qs.set('ref', ref);
  if (tokenMode) qs.set('t', streamToken(absoluteUrl));
  return `/api/stream?${qs.toString()}`;
}

// Reescribe un manifiesto HLS para enrutar todo por el proxy.
// baseUrl = URL final del manifiesto (tras redirects) para resolver relativos.
function rewriteManifest(text, baseUrl, ua, ref, tokenMode) {
  const lines = text.split(/\r?\n/);
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Atributos con URI="..." (EXT-X-KEY, EXT-X-MEDIA, EXT-X-MAP, etc.)
    if (trimmed.startsWith('#')) {
      if (!trimmed.includes('URI="')) return line;
      return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
        const abs = new URL(uri, baseUrl).href;
        return `URI="${proxify(abs, ua, ref, tokenMode)}"`;
      });
    }

    // Línea de recurso (segmento .ts/.m4s o sub-playlist .m3u8)
    const abs = new URL(trimmed, baseUrl).href;
    return proxify(abs, ua, ref, tokenMode);
  });
  return out.join('\n');
}

async function findRadio(url){const {getRadioByUrl}=await import('./radio.js');return getRadioByUrl(url);}
export function streamHandler({request=fetch,lookupRadio=findRadio,connectTimeoutMs=12000,totalTimeoutMs=30000}={}) {
 return async(req,res)=>{
  const original=req.query.url;
  if(!original||!/^https?:\/\//i.test(original))return res.status(400).json({error:'Parámetro url inválido'});
  const controller=new AbortController(),total=setTimeout(()=>controller.abort(),totalTimeoutMs);
  const close=()=>{if(!res.writableEnded)controller.abort();};
  // IncomingMessage.close can fire after the request has been read; only a
  // response disconnect means the viewer has actually stopped streaming.
  res.on('close',close);
  const attempts=[];let station;
  try{
   station=await lookupRadio(original);
   const candidates=station?radioSources({...station,preferredSource:preferredRadioSource(station.id)}):[original];
   for(const source of candidates){
    if(controller.signal.aborted)break;
    const attempt=new AbortController(),timer=setTimeout(()=>attempt.abort(),connectTimeoutMs);
    const signal=AbortSignal.any([controller.signal,attempt.signal]);let upstream,stage='resolve';
    try{
     const scoped=(url,options={})=>request(url,{...options,signal:AbortSignal.any([signal,...(options.signal?[options.signal]:[])])});
     let targets=isDesdeParaguay(source)?await resolveDesdeStreams(source,scoped):[source];
     if(isResolvable(targets[0]))targets=[await resolvePlatform(targets[0])];
     const ua=req.query.ua||RADIO_USER_AGENT,ref=station?radioReferrer(station,source):req.query.ref||undefined;
     const headers={'User-Agent':ua,...(ref?{Referer:ref}:{})};
     if(req.headers.range&&!targets.some(target=>/\.m3u8(\?|$)/i.test(target)))headers.Range=req.headers.range;
     const variants=targets.slice(0,2),controllers=variants.map(()=>new AbortController());
     stage='connect';let opened;
     try{
      opened=await Promise.any(variants.map(async(target,index)=>{
       const response=await scoped(target,{headers,redirect:'follow',signal:controllers[index].signal});
       if(!response.ok){await response.body?.cancel();throw Object.assign(Error('HTTP '+response.status),{status:response.status,host:new URL(target).host});}
       const contentType=response.headers.get('content-type')||'',baseUrl=response.url||target;
       let body;
       if(isManifest(baseUrl,contentType)){body=await response.text();if(!body.trimStart().startsWith('#EXTM3U'))throw Object.assign(Error('Manifiesto inválido'),{code:'INVALID_MANIFEST',host:new URL(target).host});}
       return {response,contentType,baseUrl,body,index,target};
      }));
      controllers.forEach((c,i)=>{if(i!==opened.index)c.abort();});
     }catch(error){controllers.forEach(c=>c.abort());if(error instanceof AggregateError){for(const e of error.errors)attempts.push({host:e.host||new URL(source).host,stage,status:e.status||null,code:signal.aborted?'TIMEOUT':e.code||e.cause?.code||'UPSTREAM_ERROR'});continue;}throw error;}
     upstream=opened.response;const {contentType,baseUrl}=opened;
     if(isDesdeParaguay(source))preferDesdeStream(source,opened.target);
     stage='body';
     if(isManifest(baseUrl,contentType)){
      const body=opened.body;
      if(!body.trimStart().startsWith('#EXTM3U')){attempts.push({host:new URL(source).host,stage,status:upstream.status,code:'INVALID_MANIFEST'});continue;}
      clearTimeout(timer);clearTimeout(total);
      res.status(200).set('Content-Type','application/vnd.apple.mpegurl').set('Cache-Control','no-cache');
      return res.send(rewriteManifest(body,baseUrl,req.query.ua,ref,Boolean(req.query.t)));
     }
     if(/text\/html|application\/json/i.test(contentType)){await upstream.body?.cancel();attempts.push({host:new URL(source).host,stage,status:upstream.status,code:'NOT_MEDIA'});continue;}
     const reader=upstream.body?.getReader();if(!reader){attempts.push({host:new URL(source).host,stage,code:'EMPTY_BODY'});continue;}
     const first=await reader.read();if(!first.value?.length){await reader.cancel();attempts.push({host:new URL(source).host,stage,code:'EMPTY_BODY'});continue;}
     clearTimeout(timer);clearTimeout(total);
     res.status(upstream.status);
     for(const header of ['content-type','content-length','content-range','accept-ranges']){const value=upstream.headers.get(header);if(value)res.set(header,value);}
     res.set('Cache-Control','no-cache');
     async function* chunks(){try{yield first.value;while(true){const next=await reader.read();if(next.done)break;yield next.value;}}finally{await reader.cancel().catch(()=>{});}}
     try{await pipeline(Readable.from(chunks()),res);}catch{if(!res.writableEnded)res.destroy();}
     return;
    }catch(error){
     attempts.push({host:new URL(source).host,stage,code:signal.aborted?'TIMEOUT':error.cause?.code||error.code||'UPSTREAM_ERROR'});
     if(upstream?.body&&!upstream.body.locked)await upstream.body.cancel().catch(()=>{});
    }finally{clearTimeout(timer);}
   }
   if(!res.destroyed&&!res.headersSent){
    console.warn('[stream] Fuentes no disponibles',JSON.stringify({radio:station?.id||null,attempts}));
    const timeout=controller.signal.aborted||attempts.some(a=>a.code==='TIMEOUT');
    res.status(timeout?504:502).json({error:'No se pudo conectar con la señal. Volvé a intentar.',code:timeout?'UPSTREAM_TIMEOUT':'UPSTREAM_UNAVAILABLE',attempts});
   }
  }catch(error){if(!res.destroyed&&!res.headersSent)res.status(502).json({error:'No se pudo preparar la reproducción',code:'STREAM_SETUP_ERROR'});}
  finally{clearTimeout(total);res.off('close',close);}
 };
}
