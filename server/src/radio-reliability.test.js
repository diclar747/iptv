import test from 'node:test';import assert from 'node:assert/strict';
import {inspectRadio,createRadioHealth} from './radio-health.js';
import {parseDesdeStreams} from './desdeparaguay.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('network and permission errors are not reported as offline',async()=>{
 for(const status of [401,403,500,502,503])assert.equal((await inspectRadio({url:'https://radio.test/live'},async()=>new Response('No',{status}))).status,'error');
 assert.equal((await inspectRadio({url:'https://radio.test/live'},async()=>{throw Object.assign(Error('fetch failed'),{cause:{code:'ECONNRESET'}})})).status,'error');
 assert.equal((await inspectRadio({url:'https://radio.test/live'},async()=>new Response('No',{status:404}))).status,'offline');
});
test('failed primary falls back to an alternative that actually delivers audio',async()=>{
 const r=await inspectRadio({url:'https://bad.test/live',alternativeSources:['https://good.test/live']},async url=>String(url).includes('bad.test')?new Response('No',{status:404}):new Response(new Uint8Array([255,251,0,1]),{headers:{'content-type':'audio/mpeg'}}));
 assert.equal(r.status,'online');assert.equal(r.source,'https://good.test/live');assert.equal(r.attempts.length,2);
});
test('both published Desde Paraguay CDNs are checked, including actual HLS audio',async()=>{
 const html='dsdpyStream0="https://bad-cdn.test/live.m3u8?k=test";dsdpyStream1="https://good-cdn.test/live.m3u8?k=test";';assert.equal(parseDesdeStreams(html).length,2);
 const r=await inspectRadio({url:'https://www.desdeparaguay.com/two-cdn-test'},async url=>{
  if(String(url).includes('www.desdeparaguay.com'))return new Response(html);
  if(String(url).includes('bad-cdn'))return new Response('Error',{status:503});
  if(String(url).includes('.m3u8'))return new Response('#EXTM3U\n#EXTINF:3,\naudio.aac\n');
  return new Response(new Uint8Array([255,241,1,2]),{headers:{'content-type':'audio/aac'}});
 });assert.equal(r.status,'online');assert.ok(r.attempts.some(a=>a.host==='good-cdn.test'&&!a.error));
});
test('confirmed online survives refresh TTL, and playback shares the existing probe',async()=>{
 let now=1000,calls=0,release;const h=createRadioHealth({now:()=>now,ttl:100,retention:1000,probe:()=>{calls++;return new Promise(r=>release=r)}}),s={id:'a',url:'https://radio.test/live'};
 h.statuses([s]);const a=h.ensure(s),b=h.ensure(s);await tick();assert.equal(calls,1);release({ok:true,status:'online',source:s.url});await Promise.all([a,b]);await tick();
 now+=101;const stale=h.statuses([s],{verify:false})[0];assert.equal(stale.status,'online');assert.equal(stale.stale,true);
 now+=1000;assert.equal(h.statuses([s],{verify:false})[0].status,'checking');
});
