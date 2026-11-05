import test from 'node:test';
import assert from 'node:assert/strict';
import { isDesdeParaguay, parseDesdeStream, resolveDesdeStream } from './desdeparaguay.js';

test('reconoce páginas de emisoras y rechaza dominios similares', () => {
  assert.equal(isDesdeParaguay('https://www.desdeparaguay.com/730'),true);
  assert.equal(isDesdeParaguay('https://desdeparaguay.com/monumental'),true);
  assert.equal(isDesdeParaguay('https://desdeparaguay.com.evil.test/730'),false);
  assert.equal(isDesdeParaguay('https://www.desdeparaguay.com/'),false);
});
test('extrae la señal sin ejecutar scripts ni inventar un enlace', () => {
  assert.equal(parseDesdeStream('var dsdpyStream0="https://radio.example/live/playlist.m3u8?k=example&exp=1";'),'https://radio.example/live/playlist.m3u8?k=example&exp=1');
  assert.throws(()=>parseDesdeStream('<html>No hay señal</html>'),/no publica/);
});
test('solicita una página fresca y mantiene la firma recibida del proveedor',async () => {
  let requested;
  const url = await resolveDesdeStream('https://www.desdeparaguay.com/test-station',async page => {
    requested = new URL(page);
    return new Response('dsdpyStream0="https://radio.example/live/playlist.m3u8?k=public-test&exp=1";');
  });
  assert.ok(requested.searchParams.has('live'));
  assert.equal(new URL(url).searchParams.get('k'),'public-test');
});
test('no reemplaza una emisora eliminada por la radio de portada',async () => {
  await assert.rejects(resolveDesdeStream('https://www.desdeparaguay.com/removed-station',async () => ({ok:true,redirected:true,url:'https://www.desdeparaguay.com/',text:async()=> 'dsdpyStream0="https://radio.example/default.m3u8";'})),/ya no está/);
});
