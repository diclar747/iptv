import test from 'node:test';
import assert from 'node:assert/strict';
import { isDesdeParaguay, parseDesdeStream, resolveDesdeStream, refreshableDesdeSource } from './desdeparaguay.js';

test('NPY renueva enlaces del catálogo y firmas vencidas desde el reproductor oficial',async()=>{
 const page='https://www.desdepylabs.com/External/tvaccion/npy';
 assert.equal(refreshableDesdeSource('https://copacogen.desdeparaguay.net/npy/npy_py_alta/playlist.m3u8?admin=tvaccion'),page);
 for(const quality of ['alta','med','baja']){
  assert.equal(refreshableDesdeSource(`https://copacotf.desdeparaguay.net/npy/npy_py_${quality}/playlist.m3u8?exp=1&k=old`),page);
 }
 const other='https://copacotf.desdeparaguay.net/telefuturo/live/playlist.m3u8';
 assert.equal(refreshableDesdeSource(other),other);
 const child='https://copacotf.desdeparaguay.net/npy/npy_py_alta/chunklist_w123.m3u8?k=current';
 assert.equal(refreshableDesdeSource(child),child);
 assert.equal(refreshableDesdeSource('https://copacotf.desdeparaguay.net.evil.test/npy/npy_py_alta/playlist.m3u8'),'https://copacotf.desdeparaguay.net.evil.test/npy/npy_py_alta/playlist.m3u8');
 let requested;
 const result=await resolveDesdeStream('https://copacotf.desdeparaguay.net/npy/npy_py_alta/playlist.m3u8',async url=>{requested=url;return new Response(`src: 'https://cdn.example/npy.m3u8?k=fresh&exp=9999999999'`);});
 assert.equal(new URL(requested).pathname,'/External/tvaccion/npy');
 assert.equal(result,'https://cdn.example/npy.m3u8?k=fresh&exp=9999999999');
});

test('reconoce páginas de emisoras y rechaza dominios similares', () => {
  assert.equal(isDesdeParaguay('https://www.desdeparaguay.com/730'),true);
  assert.equal(isDesdeParaguay('https://desdeparaguay.com/monumental'),true);
  assert.equal(isDesdeParaguay('https://desdeparaguay.com.evil.test/730'),false);
  assert.equal(isDesdeParaguay('https://www.desdeparaguay.com/'),false);
});

test('reconoce solamente el reproductor oficial de NPY y conserva su enlace temporal',()=>{
 assert.equal(isDesdeParaguay('https://www.desdepylabs.com/External/tvaccion/npy'),true);
 assert.equal(isDesdeParaguay('https://www.desdepylabs.com.evil.test/External/tvaccion/npy'),false);
 assert.equal(isDesdeParaguay('https://www.desdepylabs.com/External/otro'),false);
 assert.equal(parseDesdeStream("src: 'https://cdn.desdeparaguay.net/npy/playlist.m3u8?k=public-test&exp=123'"),'https://cdn.desdeparaguay.net/npy/playlist.m3u8?k=public-test&exp=123');
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
