import test from 'node:test';import assert from 'node:assert/strict';
import {createRadioHealth} from './radio-health.js';
import {startRadioMaintenance} from './radio-cache.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('persisted verification survives a restart and stale online is displayed while refreshing',async()=>{
 let now=10000,saved;const station={id:'cache-fixture',url:'https://radio.test/live'};
 const first=createRadioHealth({now:()=>now,onResult:async row=>{saved=structuredClone(row);},probe:async()=>({ok:true,status:'online',source:station.url})});
 await first.ensure(station);await first.flush();assert.ok(saved);
 let calls=0;const restarted=createRadioHealth({now:()=>now,ttl:1000,retention:10000,probe:async()=>{calls++;return {ok:false,status:'offline'};}});
 restarted.hydrate([{station_id:saved.id,fingerprint:saved.signature,checked_at:new Date(saved.at),result:saved}]);
 assert.equal(restarted.statuses([station],{verify:false})[0].status,'online');assert.equal(calls,0);
 now+=1001;const previous=restarted.statuses([station])[0];assert.equal(previous.status,'online');assert.equal(previous.stale,true);
 await tick();assert.equal(restarted.statuses([station],{verify:false})[0].status,'offline');assert.equal(calls,1);
 const changed={...station,url:'https://new-source.test/live'};assert.equal(restarted.statuses([changed],{verify:false})[0].status,'checking');
});
test('background maintenance skips fresh records and limits its own concurrency to two',async()=>{
 let active=0,max=0;const calls=[],releases=[];const now=10000000;
 const rows=[{id:'fresh-online',status:'online',checkedAt:new Date(now).toISOString()},{id:'fresh-offline',status:'offline',checkedAt:new Date(now).toISOString()},...Array.from({length:5},(_,i)=>({id:String(i),status:'checking'}))];
 const job=startRadioMaintenance({now:()=>now,catalog:async()=>rows,statuses:s=>s,verify:async station=>{calls.push(station.id);active++;max=Math.max(max,active);await new Promise(r=>releases.push(r));active--;}});
 await tick();assert.equal(calls.length,2);assert.equal(max,2);
 while(calls.length<5||active){while(releases.length)releases.shift()();await tick();}
 job.stop();assert.equal(calls.length,5);assert.ok(!calls.includes('fresh-online'));assert.ok(!calls.includes('fresh-offline'));assert.equal(max,2);
});
