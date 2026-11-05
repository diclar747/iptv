const cache=new Map(),pending=new Map();
export function isDesdeParaguay(value){try{const u=new URL(value);return /^(www\.)?desdeparaguay\.com$/.test(u.hostname)&&/^\/[a-z0-9-]+\/?$/i.test(u.pathname);}catch{return false;}}
export function parseDesdeStreams(html){
 const urls=[...new Set([...html.matchAll(/dsdpyStream(?:0|1|0_alta|0_med)\s*=\s*"([^"\r\n]+)"/g)].map(m=>m[1].replaceAll('\\/','/').replaceAll('&amp;','&')).filter(u=>/^https?:\/\//.test(u)&&/\.m3u8(?:\?|$)/i.test(u)))];
 if(!urls.length)throw Object.assign(Error('Esta emisora no publica una señal disponible'),{code:'RADIO_NO_STREAM'});
 return urls;
}
export const parseDesdeStream=html=>parseDesdeStreams(html)[0];
export async function resolveDesdeStreams(page,request=fetch){
 if(!isDesdeParaguay(page))return [page];
 const cached=cache.get(page);if(cached&&cached.until>Date.now())return cached.urls;
 if(pending.has(page))return pending.get(page);
 const task=(async()=>{
  const fresh=new URL(page);fresh.searchParams.set('live',String(Date.now()));
  const response=await request(fresh.href,{signal:AbortSignal.timeout(10000),headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36','Cache-Control':'no-cache'}});
  if(!response.ok)throw Object.assign(Error(`La emisora respondió HTTP ${response.status}`),{status:response.status});
  if(response.redirected&&new URL(response.url).pathname.replace(/\/$/,'')!==new URL(page).pathname.replace(/\/$/,''))throw Object.assign(Error('La página de esta emisora ya no está disponible'),{code:'RADIO_PAGE_MISSING'});
  const urls=parseDesdeStreams(await response.text());
  if(cache.size>=300)cache.delete(cache.keys().next().value);
  cache.set(page,{urls,until:Date.now()+30000});return urls;
 })().finally(()=>pending.delete(page));
 pending.set(page,task);return task;
}
export async function resolveDesdeStream(page,request=fetch){return (await resolveDesdeStreams(page,request))[0];}
export function preferDesdeStream(page,url){const current=cache.get(page);if(current?.urls.includes(url))current.urls=[url,...current.urls.filter(u=>u!==url)];}
