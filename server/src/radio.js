import express from 'express';
import { requireActiveViewer, requireRole } from './auth.js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {radioStatuses,radioHealthStats,inspectRadio,resolveRadioPlayback} from './radio-health.js';
import {isDesdeParaguay} from './desdeparaguay.js';
import {radioSources,radioReferrer} from './radio-sources.js';

function curatedRadios() {
  try { return JSON.parse(readFileSync(new URL('./radios-py.json', import.meta.url), 'utf8')); }
  catch { return []; }
}
export function sameRadio(a, b) {
  const clean = name => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/(\d)(am|fm)\b/g,'$1').replace(/\b(radio|fm|am|paraguay)\b/g,'');
  const left = clean(a.name), right = clean(b.name);
  const exact = name => name.replace(/[^a-z0-9]/g,'');
  if(exact(left) === exact(right)) return true;
  const freqA = left.match(/\d{2,4}(?:[.,]\d)?/)?.[0];
  const freqB = right.match(/\d{2,4}(?:[.,]\d)?/)?.[0];
  if(freqA && freqB && freqA !== freqB) return false;
  const core = name => name.replace(/[\d.,]+/g,'').replace(/[^a-z]/g,'');
  return core(left).length > 2 && core(left) === core(right);
}
export function mergeRadios(curated, directory) {
  const result = [];
  const urlKey = url => url.replace(/^https?:\/\//,'').replace(/\/$/,'');
  for(const station of [...curated,...directory]) {
    const index = result.findIndex(r => urlKey(r.url) === urlKey(station.url) || sameRadio(r,station));
    if(index < 0) result.push({...station});
    else {
      const old=result[index],replace=old.available===false&&station.available===true;
      const primary=replace?station:old;
      result[index]={...primary,id:old.id,alternativeSources:[...new Set([...radioSources(old),...radioSources(station)])].filter(u=>u!==primary.url)};
    }
  }
  return result.sort((a,b) => a.name.localeCompare(b.name, 'es'));
}

const router = express.Router();
let cache = null;
let pending = null;
async function loadDirectory() {
  if (cache && Date.now() - cache.at < 3600000) return cache.items;
  if (pending) return pending;
  pending = (async () => {
    for (const host of ['de1.api.radio-browser.info', 'nl1.api.radio-browser.info', 'at1.api.radio-browser.info']) {
      try {
        const response = await fetch(`https://${host}/json/stations/bycountrycodeexact/PY?hidebroken=true&order=name&limit=10000`, {
          signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'LiveTV/1.18 (Paraguay radio directory)' },
        });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const rows = await response.json();
        if (!Array.isArray(rows)) throw Error('Directorio inválido');
        const seen = new Set();
        const items = rows.filter(r => r.countrycode === 'PY').flatMap(r => {
          const url = r.url_resolved || r.url;
          if (!/^https?:\/\//i.test(url || '') || seen.has(url)) return [];
          seen.add(url);
          return [{ id: r.stationuuid, name: r.name.trim(), url, logo: /^https?:\/\//i.test(r.favicon) ? r.favicon : null,
            city: r.state || '', tags: r.tags || '', codec: r.codec || '', bitrate: r.bitrate || 0 }];
        });
        if (!items.length) throw Error('Directorio vacío');
        cache = { at: Date.now(), items };
        return items;
      } catch { /* probar otro servidor del directorio */ }
    }
    if (cache) return cache.items;
    throw Error('No se pudo cargar el directorio de radios. Volvé a intentar.');
  })().finally(() => { pending = null; });
  return pending;
}

let localCatalog, mergedCatalog, mergedSource;
function currentCatalog(){
 if(!localCatalog)localCatalog=curatedRadios();
 // Serve local/stale data immediately; one shared request refreshes the directory.
 void loadDirectory().catch(()=>{});
 if(cache?.items&&mergedSource!==cache){mergedCatalog=mergeRadios(localCatalog,cache.items);mergedSource=cache;}
 return mergedCatalog||localCatalog;
}
export async function loadRadios(){return currentCatalog();}
export function getRadioByUrl(url){return currentCatalog().find(s=>radioSources(s).includes(url));}
const snapshots=new Map();
function snapshot(token){
 const now=Date.now();for(const [key,value] of snapshots)if(now-value.at>600000)snapshots.delete(key);
 if(token&&snapshots.has(token))return {token,...snapshots.get(token)};
 if(!token&&snapshots.size){const [key,value]=[...snapshots].at(-1);if(now-value.at<300000)return {token:key,...value};}
 const id=randomUUID(),rows=currentCatalog().slice().sort((a,b)=>a.name.localeCompare(b.name,'es'));
 if(snapshots.size>=8)snapshots.delete(snapshots.keys().next().value);
 const result={at:now,rows};snapshots.set(id,result);return {token:id,...result};
}
router.get('/radios/:id/playback',requireActiveViewer,async(req,res)=>{
 try{
  const station=currentCatalog().find(s=>s.id===req.params.id);if(!station)return res.status(404).json({error:'Radio no encontrada'});
  let timeout;const result=await Promise.race([resolveRadioPlayback(station),new Promise(resolve=>{timeout=setTimeout(()=>resolve({ok:false,status:'error',reason:'La comprobación sigue en curso. Volvé a intentar en unos segundos.'}),26000);})]).finally(()=>clearTimeout(timeout));
  res.set('Cache-Control','private, no-store');
  if(!result.ok)return res.status(503).json({error:result.reason||'La radio no respondió. Volvé a intentar.',status:result.status});
  const url=result.source||station.url,codec=isDesdeParaguay(url)||/\.m3u8(?:\?|$)/i.test(url)?'HLS':/aac/i.test(result.contentType||'')?'AAC':/ogg/i.test(result.contentType||'')?'OGG':'MP3';
  res.json({...station,url,source:radioReferrer(station,url),codec,status:'online'});
 }catch(e){res.status(503).json({error:'No se pudo conectar con la radio. Volvé a intentar.'});}
});
router.get('/radios/status',requireActiveViewer,async(req,res)=>{
 const ids=new Set(String(req.query.ids||'').split(',').filter(Boolean).slice(0,20));
 res.set('Cache-Control','private, no-store');
 res.json(radioStatuses(currentCatalog().filter(r=>ids.has(r.id))));
});
router.post('/admin/radios/diagnostics',requireRole('admin'),async(req,res)=>{
 const ids=Array.isArray(req.body?.ids)?req.body.ids.slice(0,3):[];
 const stations=currentCatalog().filter(s=>ids.includes(s.id));
 const results=[];for(const s of stations){const r=await inspectRadio(s);results.push({id:s.id,name:s.name,...r,source:undefined});}
 res.set('Cache-Control','private, no-store').json({results});
});
router.get('/radios',requireActiveViewer,async(req,res)=>{
 try{
  const snap=snapshot(String(req.query.catalog||'')),q=String(req.query.search||'').trim().toLocaleLowerCase('es');
  const base=snap.rows.filter(r=>(r.name+' '+r.city+' '+r.tags).toLocaleLowerCase('es').includes(q));
  const page=Math.max(1,parseInt(req.query.page)||1),pageSize=Math.min(20,Math.max(1,parseInt(req.query.pageSize)||10));
  const paged=req.query.page!==undefined||req.query.pageSize!==undefined,filter=String(req.query.status||'');
  let states=radioStatuses(base,{verify:false}),rows=filter?states.filter(r=>r.status===filter):states;
  if(filter==='online')rows.sort((a,b)=>new Date(a.firstOnlineAt||a.checkedAt)-new Date(b.firstOnlineAt||b.checkedAt)||a.id.localeCompare(b.id));
  const hasUnverified=filter==='online'&&states.some(s=>s.status==='checking'||s.status==='error'&&(!s.checkedAt||Date.now()-new Date(s.checkedAt).getTime()>60000));
  let discovering=false;
  if(filter==='online'&&rows.length<page*pageSize){
   const unknown=states.filter(s=>s.status==='checking'||s.status==='error'&&(!s.checkedAt||Date.now()-new Date(s.checkedAt).getTime()>60000));
   unknown.sort((a,b)=>Number(!!a.checkedAt)-Number(!!b.checkedAt)||(new Date(a.checkedAt||0)-new Date(b.checkedAt||0)));
   const next=unknown.slice(0,10);radioStatuses(next);
   discovering=next.length>0||states.some(s=>s.checking);
  }
  const items=paged?rows.slice((page-1)*pageSize,page*pageSize):rows;
  const checked=radioStatuses(items.slice(0,paged?pageSize:10)),map=new Map(checked.map(r=>[r.id,r]));
  res.set('Cache-Control','private, no-store').json({items:items.map(r=>map.get(r.id)||r),total:rows.length,page,pageSize,catalog:snap.token,
   hasMore:paged&&(page*pageSize<rows.length||discovering||hasUnverified),discovering,verified:states.filter(s=>s.checkedAt).length,catalogTotal:base.length,
   counts:states.reduce((out,s)=>(out[s.status]=(out[s.status]||0)+1,out),{}),country:'PY'});
 }catch(e){res.status(502).json({error:e.message});}
});
export default router;
