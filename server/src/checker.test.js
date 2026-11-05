import test from 'node:test';
import assert from 'node:assert/strict';
import {checkStream} from './checker.js';
test('HTTP 200 con HTML no significa que haya señal',async()=>{
 assert.equal((await checkStream({url:'https://test.example/error'},async()=>new Response('<html>Error del servidor</html>',{headers:{'content-type':'text/html'}}))).ok,false);
});
test('comprueba manifiesto, variante y bytes de video',async()=>{
 let calls=0;
 const result=await checkStream({url:'https://test.example/master.m3u8'},async url=>{
  calls++;
  if(String(url).endsWith('master.m3u8'))return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=50000\nvariant.m3u8\n');
  if(String(url).endsWith('variant.m3u8'))return new Response('#EXTM3U\n#EXTINF:5,\nsegment.ts\n');
  return new Response(new Uint8Array([0x47,0,1,2]),{headers:{'content-type':'video/mp2t'}});
 });
 assert.equal(result.ok,true);assert.equal(calls,3);
});
test('detecta fuente caída y manifiesto vacío',async()=>{
 assert.equal((await checkStream({url:'https://test.example/offline'},async()=>new Response('offline',{status:503}))).ok,false);
 assert.equal((await checkStream({url:'https://test.example/empty.m3u8'},async()=>new Response('#EXTM3U\n'))).ok,false);
});
