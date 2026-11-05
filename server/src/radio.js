import express from 'express';
import { requireActiveViewer } from './auth.js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { radioStatuses } from './radio-health.js';

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
    else if(result[index].available === false && station.available === true) result[index] = {...station,id:result[index].id};
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
const snapshots=new Map();
function snapshot(token){
 const now=Date.now();for(const [key,value] of snapshots)if(now-value.at>600000)snapshots.delete(key);
 if(token&&snapshots.has(token))return {token,...snapshots.get(token)};
 if(!token&&snapshots.size){const [key,value]=[...snapshots].at(-1);if(now-value.at<300000)return {token:key,...value};}
 const id=randomUUID(),rows=currentCatalog().slice().sort((a,b)=>a.name.localeCompare(b.name,'es'));
 if(snapshots.size>=8)snapshots.delete(snapshots.keys().next().value);
 const result={at:now,rows};snapshots.set(id,result);return {token:id,...result};
}
router.get('/radios/status',requireActiveViewer,async(req,res)=>{
 const ids=new Set(String(req.query.ids||'').split(',').filter(Boolean).slice(0,20));
 res.set('Cache-Control','private, no-store');
 res.json(radioStatuses(currentCatalog().filter(r=>ids.has(r.id))));
});
router.get('/radios',requireActiveViewer,async(req,res)=>{
 try {
  const snap=snapshot(String(req.query.catalog||''));
  const q=String(req.query.search||'').trim().toLocaleLowerCase('es');
  let rows=snap.rows.filter(r=>(r.name+' '+r.city+' '+r.tags).toLocaleLowerCase('es').includes(q));
  if(req.query.status)rows=radioStatuses(rows,{verify:false}).filter(r=>r.status===req.query.status);
  const paged=req.query.page!==undefined||req.query.pageSize!==undefined;
  const page=Math.max(1,parseInt(req.query.page)||1),pageSize=Math.min(20,Math.max(1,parseInt(req.query.pageSize)||10));
  const items=paged?rows.slice((page-1)*pageSize,page*pageSize):rows;
  // Legacy clients can still read all metadata, but never start a full-catalog scan.
  const statuses=radioStatuses(items.slice(0,paged?pageSize:10));
  const byId=new Map(statuses.map(r=>[r.id,r]));
  res.set('Cache-Control','private, no-store');
  res.json({items:items.map(r=>byId.get(r.id)||radioStatuses([r],{verify:false})[0]),total:rows.length,page,pageSize,catalog:snap.token,hasMore:paged&&page*pageSize<rows.length,country:'PY'});
 }catch(e){res.status(502).json({error:e.message});}
});
export default router;
