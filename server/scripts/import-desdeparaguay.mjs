import { readFileSync, writeFileSync } from 'node:fs';
import { mergeRadios, sameRadio } from '../src/radio.js';
const path = new URL('../src/radios-py.json', import.meta.url);
const stations = JSON.parse(readFileSync(path, 'utf8'));
stations.sort((a,b) => Number(a.id.startsWith('desde-')) - Number(b.id.startsWith('desde-')));
const decode = s => s.replace(/&(?:aacute|eacute|iacute|oacute|uacute|ntilde|amp);/gi, x => ({'&aacute;':'á','&eacute;':'é','&iacute;':'í','&oacute;':'ó','&uacute;':'ú','&ntilde;':'ñ','&amp;':'&'}[x.toLowerCase()] || x)).replace(/&#(\d+);/g, (_,n) => String.fromCodePoint(Number(n)));
const key = name => name.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/(\d)(am|fm)\b/g,'$1').replace(/\b(radio|fm|am|paraguay)\b/g,'').replace(/[^a-z0-9]/g,'');
const response = await fetch('https://www.desdeparaguay.com/', { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw Error(`HTTP ${response.status}`);
const html = await response.text();
const entries = [...html.matchAll(/listaRadios\[\d+\]\[0\]="([a-z0-9-]+)";\s*listaRadios\[\d+\]\[1\]="([^"\r\n]+)"/gi)];
if (!entries.length) throw Error('El catálogo cambió de formato');
let added = 0, existing = 0, recovered = 0;
for (const match of entries) {
  const slug = match[1], name = decode(match[2]);
  const source = `https://www.desdeparaguay.com/${slug}`;
  const previous = stations.find(s => s.id === `desde-${slug}` || sameRadio(s,{name}));
  if (previous) {
    existing++;
    previous.alternativeSources = [...new Set([...(previous.alternativeSources || []), source])];
    if (previous.available === false) {
      previous.url = source; previous.source = source; previous.codec = 'HLS';
      previous.available = null; delete previous.checkedAt; delete previous.lastError;
      recovered++;
    }
    continue;
  }
  const prefix = html.slice(0, match.index);
  const cityHeading = [...prefix.matchAll(/class='laciudad'[^>]*>\s*<a[^>]*>([^<]+)<\/a>/g)].at(-1)?.[1] || 'Paraguay';
  const city = decode(cityHeading).replace(/^RADIOS (?:DE|DEL) /i,'').replace(/\s*\((?:AM|FM)\)/i,'').trim();
  stations.push({ id: `desde-${slug}`, name, url: source, source, city, tags: 'Paraguay', codec: 'HLS', logo: `https://www.desdeparaguay.com/images_hpy/logos/radios/90x90px2/${slug}.png?4`, available: null });
  added++;
}
const unique = mergeRadios(stations,[]);
writeFileSync(path, JSON.stringify(unique,null,2)+'\n');
console.log(JSON.stringify({catalogadas:entries.length,yaExistentes:existing,nuevas:added,enlacesActualizados:recovered,duplicadosConsolidados:stations.length-unique.length,totalGuardadas:unique.length}));
