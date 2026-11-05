import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRadios, sameRadio } from './radio.js';
import { probeRadio } from './radio-health.js';

test('conserva la identidad oficial y evita duplicados entre directorios', () => {
  const official = { id: 'sanfernando', name: 'Radio San Fernando FM', url: 'https://example.org/live' };
  const directory = [
    { id: 'other', name: 'San Fernando', url: 'http://example.org/live/' },
    { id: 'third', name: 'Radio San Fernando FM', url: 'https://another.org/audio' },
    { id: 'new', name: 'ABC Cardinal', url: 'https://abc.example/live' },
  ];
  const merged = mergeRadios([official], directory);
  assert.equal(merged.length, 2);
  assert.ok(merged.some(r => r.id === 'sanfernando'));
  assert.ok(merged.some(r => r.id === 'new'));
});

test('compara variantes de nombre sin juntar frecuencias diferentes', () => {
  assert.equal(sameRadio({name:'ABC Cardinal 730AM'},{name:'Radio ABC Cardinal 730 AM'}),true);
  assert.equal(sameRadio({name:'Radio Aspen Paraguay'},{name:'Aspen FM 102.7'}),true);
  assert.equal(sameRadio({name:'Radio Amistad 102.5 FM'},{name:'Radio Amistad 103.1 FM'}),false);
  const merged=mergeRadios([{id:'old',name:'Radio Aspen',url:'https://old.example',available:false}],[{id:'new',name:'Aspen 102.7 FM',url:'https://new.example',available:true}]);
  assert.equal(merged.length,1); assert.equal(merged[0].id,'old'); assert.equal(merged[0].url,'https://new.example');
});

test('marca online solamente si recibe audio; una lista vacía no basta', async () => {
  const station = { url: 'https://radio.example/stream' };
  assert.equal(await probeRadio(station, async () => new Response(new Uint8Array([255,251,1,2]), { headers: { 'content-type': 'audio/mpeg' } })), true);
  assert.equal(await probeRadio(station, async () => new Response('#EXTM3U\n#EXT-X-TARGETDURATION:5\n', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } })), false);
  assert.equal(await probeRadio(station, async () => new Response('<html>Error</html>', { headers: { 'content-type': 'text/html' } })), false);
  assert.equal(await probeRadio(station, async () => new Response('Not found', { status: 404 })), false);
  assert.equal(await probeRadio(station, async () => new Response('', { headers: { 'content-type': 'audio/aac' } })), false);
  assert.equal(await probeRadio(station, async () => { throw Error('Sin conexión'); }), false);
});
