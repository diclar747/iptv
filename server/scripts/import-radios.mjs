// Actualiza la lista de señales públicas de los directorios indicados.
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const decode = s => s.replace(/&amp;|&#0*38;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&quot;/g, '"').replace(/<[^>]+>/g, '').trim();
const normalize = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\bradio\b|\bfm\b|\bam\b/g, '').replace(/[^a-z0-9]/g, '');
async function html(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'LiveTV/1.18 RadioDirectory' } });
  if (!r.ok) throw Error(`HTTP ${r.status}`);
  return r.text();
}
const items = [];
function add(name, url, source, extra = {}) {
  url = decode(url);
  if (!/^https?:\/\//.test(url)) return;
  if (items.some(x => x.url === url || normalize(x.name) === normalize(name))) return;
  items.push({ id: 'py-' + createHash('sha256').update(source).digest('hex').slice(0,16), name: decode(name), url, source, city: '', tags: '', codec: '', ...extra });
}
const index = await html('https://paraguayonline.net/lista/');
const links = [...index.matchAll(/<li class="page_item[^>]*>\s*<a href="([^"]+)">([\s\S]*?)<\/a>/g)]
  .map(m => ({ url: m[1], name: decode(m[2]) })).filter(x => new URL(x.url).hostname === 'paraguayonline.net' && !/^(lista|enlace|bingo)|producciones|podcast/i.test(x.name));
let next = 0, missing = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (next < links.length) {
    const entry = links[next++];
    try {
      const page = await html(entry.url);
      const tag = page.match(/<(?:audio|source)\b[^>]*\bsrc=["']([^"']+)["']/i);
      if (tag) add(entry.name, tag[1], entry.url);
      else {
        const stream = page.match(/https?:[^\s"'<>\\]+:\d{3,5}\/[^\s"'<>\\]*/i);
        if (stream) add(entry.name, stream[0], entry.url); else missing++;
      }
    } catch { missing++; }
    if (next % 30 === 0) console.log(`Revisadas ${next}/${links.length}; señales ${items.length}`);
  }
}));
// La web oficial publica ambas señales en su configuración de reproducción.
const official = await html('https://radiosanfernandofm.com/');
const config = official.match(/var SF\s*=\s*(\{[^\n]+?\});/);
if (config) {
  const data = JSON.parse(config[1]);
  for (const station of Object.values(data.radios || {})) add(`${station.name.replace(/^FM /, "")} ${station.freq}`, station.stream, 'https://radiosanfernandofm.com/#' + station.name, { logo: station.logo });
}
// Emisoras.com.py: las señales coincidentes se obtienen del directorio abierto;
// su API de audio puede exigir un desafío de navegador, que no se elude.
const emisoras = await html('https://emisoras.com.py/');
const names = [...emisoras.matchAll(/<a\b[^>]*href=["']https:\/\/emisoras.com.py\/[^/"']+\/["'][^>]*>([\s\S]*?)<\/a>/g)].map(m => decode(m[1]));
let matched = 0;
try {
  const rows = JSON.parse(await html('https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/PY?hidebroken=true&limit=10000'));
  for (const r of rows) if (names.some(n => normalize(n).length > 3 && normalize(r.name).includes(normalize(n)))) {
    add(r.name, r.url_resolved || r.url, 'https://www.radio-browser.info/history/' + r.stationuuid, { codec: r.codec, city: r.state, logo: r.favicon });
    matched++;
  }
} catch { /* el directorio dinámico sigue disponible en la API */ }
items.sort((a,b) => a.name.localeCompare(b.name, 'es'));
writeFileSync(new URL('../src/radios-py.json', import.meta.url), JSON.stringify(items, null, 2) + '\n');
console.log(JSON.stringify({ revisadas: links.length, sinEnlace: missing, coincidenciasEmisoras: matched, guardadas: items.length, sanFernando: items.some(i => /San Fernando/.test(i.name)) }));
