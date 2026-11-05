import test from 'node:test';import assert from 'node:assert/strict';import {ImportPipeline,SerialUploads} from './pipeline.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<100;i++){if(check())return;await delay(5);}assert.fail('No se alcanzó el estado esperado');}
test('downloads overlap while ready files upload serially; publishing does not lock uploads',async()=>{
 const jobs=[1,2,3,4].map(id=>({id:String(id),title:'Video '+id}));let activeDownloads=0,maxDownloads=0,activeUploads=0,maxUploads=0,claimed=0;const events=[],downloads=new Map(),publication=new Map();
 const pipeline=new ImportPipeline({claim:async({limit})=>({jobs:jobs.splice(0,limit)}),run:async(j,c,s,uploads)=>{
  s.phase='downloading';activeDownloads++;maxDownloads=Math.max(maxDownloads,activeDownloads);events.push('download:'+j.id);await new Promise(r=>downloads.set(j.id,r));activeDownloads--;s.phase='waiting_upload';const release=await uploads.acquire(c.signal);s.phase='uploading';activeUploads++;maxUploads=Math.max(maxUploads,activeUploads);events.push('upload:'+j.id);await delay(10);activeUploads--;release();s.phase='publishing';await new Promise(r=>publication.set(j.id,r));s.phase='done';
 }});
 await pipeline.poll();await until(()=>downloads.size===3);assert.equal(maxDownloads,3);
 downloads.get('2')();downloads.get('1')();await until(()=>publication.has('2')&&publication.has('1'));assert.equal(activeDownloads,1,'Third download must continue while completed files upload');assert.equal(maxUploads,1);assert.ok(events.indexOf('upload:2')<events.indexOf('upload:1'));
 await pipeline.poll();await until(()=>downloads.has('4'));downloads.get('3')();downloads.get('4')();await until(()=>publication.has('3')&&publication.has('4'));assert.equal(maxUploads,1);for(const r of publication.values())r();await until(()=>pipeline.tasks.size===0);assert.equal(pipeline.history.length,4);assert.equal(pipeline.snapshot().length,0);
});
test('pause aborts running and waiting work and releases the upload slot',async()=>{
 const queue=new SerialUploads(),a=new AbortController(),b=new AbortController();const release=await queue.acquire(a.signal);const waiting=queue.acquire(b.signal);b.abort();await assert.rejects(waiting,/abort/i);release();const next=await queue.acquire(new AbortController().signal);next();assert.equal(queue.busy,false);
});
test('same job cannot start twice and pending files remain bounded',async()=>{
 let finish;const p=new ImportPipeline({maxPending:1,claim:async()=>({jobs:[{id:'same'},{id:'same'}]}),run:async()=>new Promise(r=>finish=r)});await p.poll();await until(()=>!!finish);assert.equal(p.tasks.size,1);p.pause();finish();await until(()=>p.tasks.size===0);assert.equal(p.paused,true);
});
