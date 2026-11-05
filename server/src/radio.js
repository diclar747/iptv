import express from 'express';
import { requireActiveViewer } from './auth.js';
import { readFileSync } from 'node:fs';
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
export async function loadRadios() {
  const curated = curatedRadios();
  try { return mergeRadios(curated, await loadDirectory()); }
  catch (error) { if (curated.length) return curated; throw error; }
}
router.get('/radios', requireActiveViewer, async (req, res) => {
  try {
    const all = radioStatuses(await loadRadios());
    const order = { online: 0, checking: 1, offline: 2 };
    all.sort((a,b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name, 'es'));
    const search = String(req.query.search || '').toLocaleLowerCase('es');
    res.json({ items: all.filter(r => `${r.name} ${r.city} ${r.tags}`.toLocaleLowerCase('es').includes(search)), total: all.length,
      counts: { online: all.filter(s => s.status === 'online').length, offline: all.filter(s => s.status === 'offline').length, checking: all.filter(s => s.status === 'checking').length },
      attribution: 'Radio Browser · Paraguay Online · señales oficiales', country: 'PY' });
  } catch (error) { res.status(502).json({ error: error.message }); }
});
export default router;
