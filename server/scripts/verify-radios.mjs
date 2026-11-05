import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('../src/radios-py.json', import.meta.url);
const entries = JSON.parse(readFileSync(file, 'utf8'));
let next = 0;
await Promise.all(Array.from({ length: 5 }, async () => {
  while (next < entries.length) {
    const entry = entries[next++];
    const controller = new AbortController();
    try {
      const options = {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        headers: { 'User-Agent': 'Mozilla/5.0 LiveTV/1.18', Referer: entry.source },
      };
      let response = await fetch(entry.url, options);
      // Algunos micrositios todavía publican /; del reproductor anterior.
      // El mismo servidor ofrece públicamente su audio en /stream.
      if (response.status === 404 && new URL(entry.url).pathname === '/;') {
        await response.body?.cancel();
        const updated = new URL('/stream', entry.url).href;
        response = await fetch(updated, options);
        if (response.ok) entry.url = updated;
      }
      const type = response.headers.get('content-type') || '';
      if (!response.ok || !/audio|ogg|mpegurl|octet-stream/i.test(type)) throw Error(`HTTP ${response.status} ${type}`);
      const first = await response.body.getReader().read();
      if (!first.value?.length) throw Error('Sin audio');
      if (/octet-stream/i.test(type)) {
        const b = first.value;
        const signature = new TextDecoder().decode(b.slice(0,4));
        if (!(b[0] === 255 && (b[1] & 224) === 224) && !/^(ID3|OggS|fLaC)/.test(signature)) throw Error('Formato de audio no identificado');
      }
      entry.checkedAt = new Date().toISOString();
      entry.codec = /mpegurl/i.test(type) ? 'HLS' : /aac/i.test(type) ? 'AAC' : /ogg/i.test(type) ? 'OGG' : 'MP3';
      entry.available = true;
      delete entry.lastError;
    } catch (error) { entry.available = false; entry.lastError = error.message; }
    finally { controller.abort(); }
    if (next % 40 === 0) console.log(`Verificadas ${next}/${entries.length}`);
  }
}));
// Mantener el informe completo para corregir señales caídas; la API muestra
// únicamente las que respondieron con audio al verificar.
writeFileSync(file, JSON.stringify(entries, null, 2) + '\n');
console.log(JSON.stringify({ revisadas: entries.length, conAudio: entries.filter(r => r.available).length,
  sanFernando: entries.find(r => /San Fernando/.test(r.name))?.available }));
