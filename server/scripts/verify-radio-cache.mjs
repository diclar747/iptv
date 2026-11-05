import '../src/env.js';import assert from 'node:assert/strict';
import {initSchema,one,query} from '../src/pg.js';import {createRadioHealth} from '../src/radio-health.js';import {saveRadioCacheRecord} from '../src/radio-cache.js';
await initSchema();const station={id:'cache-fixture-'+Date.now(),url:'https://fixture.test/live'};
try{
 const original=createRadioHealth({probe:async()=>({ok:true,status:'online',source:station.url}),onResult:saveRadioCacheRecord});
 await original.ensure(station);await original.flush();
 const row=await one('SELECT * FROM radio_health_cache WHERE station_id=$1',[station.id]);assert.ok(row);assert.equal(row.result.status,'online');assert.equal(row.fingerprint.length,64);
 let calls=0;const restarted=createRadioHealth({probe:async()=>{calls++;return false;}});restarted.hydrate([row]);
 assert.equal(restarted.statuses([station],{verify:false})[0].status,'online');assert.equal(calls,0);
 console.log('PASS: resultado guardado en PostgreSQL y restaurado en otra instancia sin nueva consulta a la radio');
}finally{await query('DELETE FROM radio_health_cache WHERE station_id=$1',[station.id]);}
