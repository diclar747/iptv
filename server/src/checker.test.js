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
 assert.equal(result.format,'hls');
});

test('identifica MPEG-TS directo aunque la URL y las cabeceras no lo indiquen', async () => {
 const packets = new Uint8Array(188 * 3);
 for (let offset = 0; offset < packets.length; offset += 188) packets[offset] = 0x47;
 const result = await checkStream({ url: 'https://test.example/live' }, async () => new Response(packets), { strict: true });
 assert.equal(result.ok, true);
 assert.equal(result.format, 'mpegts');
});
test('detecta fuente caída y manifiesto vacío',async()=>{
 assert.equal((await checkStream({url:'https://test.example/offline'},async()=>new Response('offline',{status:503}))).ok,false);
 assert.equal((await checkStream({url:'https://test.example/empty.m3u8'},async()=>new Response('#EXTM3U\n'))).ok,false);
});

test('verifica un segmento reciente y rechaza bytes inválidos aunque indiquen video', async () => {
 const targets = [];
 const request = async url => {
  targets.push(url);
  if (url.endsWith('.m3u8')) {
   return new Response('#EXTM3U\n#EXTINF:5,\nold.ts\n#EXTINF:5,\nready.ts\n#EXTINF:5,\nnew.ts\n');
  }
  return new Response('respuesta vacía del proveedor', { headers: { 'content-type': 'video/mpeg' } });
 };
 const result = await checkStream({ url: 'https://test.example/live.m3u8' }, request, { strict: true });
 assert.deepEqual(targets.slice(1), ['https://test.example/ready.ts','https://test.example/new.ts']);
 assert.equal(result.ok, false);
});

test('un canal sigue online si falla la primera variante pero otra entrega video', async () => {
 const result=await checkStream({url:'https://test.example/master.m3u8'},async url=>{
  if(url.endsWith('master.m3u8'))return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=60000\nbroken.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=50000\nready.m3u8\n');
  if(url.endsWith('broken.m3u8'))return new Response(null,{status:404});
  if(url.endsWith('ready.m3u8'))return new Response('#EXTM3U\n#EXTINF:5,\nmedia.ts\n');
  const bytes=new Uint8Array(188*3);
  bytes[0]=bytes[188]=bytes[376]=0x47;
  return new Response(bytes);
 },{strict:true});
 assert.equal(result.ok,true);
 assert.equal(result.format,'hls');
});
