import test from 'node:test';
import assert from 'node:assert/strict';
import {createRadioHealth} from './radio-health.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('many viewers share probes; only requested stations are checked with bounded concurrency',async()=>{
 let now=1000,calls=[];const releases=[];
 const h=createRadioHealth({now:()=>now,ttl:100,concurrency:2,maxQueue:3,probe:s=>{calls.push(s.id);return new Promise(resolve=>releases.push(resolve));}});
 const stations=Array.from({length:50},(_,i)=>({id:String(i),url:'https://radio.test/'+i}));
 for(let i=0;i<100;i++)h.statuses(stations.slice(0,3));
 await tick();assert.equal(calls.length,2);assert.deepEqual(h.stats(),{active:2,queued:1});
 assert.ok(calls.every(id=>Number(id)<3));
 releases.shift()(true);await tick();assert.equal(calls.length,3);
 while(releases.length)releases.shift()(true);await tick();
 assert.equal(h.statuses(stations.slice(0,3))[0].status,'online');await tick();assert.equal(calls.length,3);
 // Reading a filter must not schedule unseen radios.
 h.statuses(stations,{verify:false});await tick();assert.equal(calls.length,3);
 now+=101;h.statuses([stations[0]]);await tick();assert.equal(calls.length,4);
 releases.shift()(false);await tick();assert.equal(h.statuses([stations[0]])[0].status,'offline');
});
test('queue size stays bounded even when many different lists arrive at once',async()=>{
 const releases=[];const h=createRadioHealth({concurrency:2,maxQueue:3,probe:()=>new Promise(r=>releases.push(r))});
 for(let i=0;i<100;i++)h.statuses([{id:String(i),url:'https://radio.test/'+i}]);
 await tick();assert.equal(h.stats().active,2);assert.equal(h.stats().queued,3);
 while(h.stats().active){while(releases.length)releases.shift()(true);await tick();}
 assert.equal(h.stats().queued,0);
});
