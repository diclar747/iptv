import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRadios } from './radio.js';
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

test('marca online solamente si recibe audio o un manifiesto HLS válido', async () => {
  const station = { url: 'https://radio.example/stream' };
  assert.equal(await probeRadio(station, async () => new Response(new Uint8Array([255,251,1,2]), { headers: { 'content-type': 'audio/mpeg' } })), true);
  assert.equal(await probeRadio(station, async () => new Response('#EXTM3U\n#EXT-X-TARGETDURATION:5\n', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } })), true);
  assert.equal(await probeRadio(station, async () => new Response('<html>Error</html>', { headers: { 'content-type': 'text/html' } })), false);
  assert.equal(await probeRadio(station, async () => new Response('Not found', { status: 404 })), false);
  assert.equal(await probeRadio(station, async () => new Response('', { headers: { 'content-type': 'audio/aac' } })), false);
  assert.equal(await probeRadio(station, async () => { throw Error('Sin conexión'); }), false);
});
