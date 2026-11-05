import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import radio from './radio.js';

test('radio pages return without waiting for the directory; snapshots stay stable and probes are shared',async()=>{
 const original=globalThis.fetch;let finishDirectory, probes=0;
 globalThis.fetch=async(url)=>{
  if(String(url).includes('api.radio-browser.info'))return new Promise(resolve=>{finishDirectory=()=>resolve(new Response(JSON.stringify([{stationuuid:'fixture-new-radio',name:'000 New Directory Radio',url:'https://fixture.test/new',countrycode:'PY'}]),{headers:{'content-type':'application/json'}}));});
  probes++;return new Response(new Uint8Array([255,251,1,2]),{headers:{'content-type':'audio/mpeg'}});
 };
 const app=express();app.use((req,res,next)=>{req.user={id:1,role:'admin',status:'active'};next();});app.use(radio);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 const get=async(path)=>{const r=await original(base+path);assert.equal(r.status,200);return r.json();};
 try{
  const cold=await get('/radios?page=1&pageSize=10&search=Yvy%20Pyt&status=online');assert.equal(cold.discovering,true);
  await new Promise(r=>setImmediate(r));
  const warm=await get('/radios?page=1&pageSize=10&search=Yvy%20Pyt&status=online&catalog='+cold.catalog);assert.ok(warm.items.some(r=>r.id==='yvypyta-941'));
  const playback=await get('/radios/yvypyta-941/playback');assert.equal(playback.status,'online');assert.equal(playback.codec,'MP3');
  const expandable=await get('/radios?page=1&pageSize=1&search=Yvy&status=online');assert.equal(expandable.hasMore,true,'A full online page must still allow discovering unchecked radios');
  const beforeFirst=probes;
  const first=await get('/radios?page=1&pageSize=10');assert.equal(first.items.length,10);assert.equal(first.hasMore,true);assert.ok(finishDirectory,'Directory is still pending while the page was delivered');
  await new Promise(r=>setImmediate(r));
  const initial=probes,budget=first.items.reduce((n,s)=>n+1+(s.alternativeSources?.length||0),0);assert.ok(initial-beforeFirst<=budget,'Only the first ten radios and their registered alternatives may be probed');
  await Promise.all(Array.from({length:30},()=>get('/radios?page=1&pageSize=10&catalog='+first.catalog)));
  assert.equal(probes,initial,'Viewers reuse the cached probes');
  finishDirectory();await new Promise(r=>setImmediate(r));
  const second=await get('/radios?page=2&pageSize=10&catalog='+first.catalog);
  assert.equal(second.items.length,10);assert.equal(second.total,first.total);assert.equal(second.catalog,first.catalog);
  assert.equal(new Set([...first.items,...second.items].map(r=>r.id)).size,20);
  const search=await get('/radios?page=1&pageSize=10&search=Yvy%20Pyt');assert.ok(search.items.some(r=>/Yvy Pyt/i.test(r.name)));
  const clamped=await get('/radios?page=1&pageSize=999');assert.equal(clamped.items.length,20);
  const statuses=await get('/radios/status?ids='+encodeURIComponent(first.items.map(r=>r.id).join(',')));assert.equal(statuses.length,10);
  assert.ok(statuses.every(s=>['checking','online','offline','error'].includes(s.status)));
 }finally{globalThis.fetch=original;server.closeAllConnections();await new Promise(r=>server.close(r));}
});
