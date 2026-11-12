import test from 'node:test';import assert from 'node:assert/strict';import {ImportPipeline} from './pipeline.mjs';
import {existingVideoFile} from './existing-downloader.mjs';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<100;i++){if(check())return;await delay(5);}assert.fail('No se alcanzó el estado esperado');}
test('waits for publication, then starts the next queued video even after a failure', async () => {
 const jobs=[{id:'first'},{id:'broken'},{id:'last'}];
 const started=[], failures=[];
 let publish;
 const pipeline=new ImportPipeline({
  claim:async ({limit})=>{assert.equal(limit,1);return {jobs:jobs.splice(0,1)};},
  run:async (job,controller,state)=>{
   started.push(job.id);
   if(job.id==='first'){state.phase='publishing';await new Promise(resolve=>{publish=resolve;});}
   if(job.id==='broken')throw Error('Video privado');
   state.phase='done';
  },
  onError:async (error,job)=>{failures.push([job.id,error.message]);},
 });
 await pipeline.poll();
 await until(()=>!!publish);
 await pipeline.poll();
 assert.deepEqual(started,['first']);
 assert.equal(pipeline.snapshot()[0].phase,'publishing');
 publish();
 await until(()=>started.length===3&&pipeline.snapshot().length===0);
 assert.deepEqual(started,['first','broken','last']);
 assert.deepEqual(failures,[['broken','Video privado']]);
});

test('pause aborts the current job and leaves the next one queued until resume', async () => {
 const jobs=[{id:'first'},{id:'last'}], started=[];
 const pipeline=new ImportPipeline({
  claim:async()=>({jobs:jobs.splice(0,1)}),
  run:async (job,controller)=>{
   started.push(job.id);
   if(job.id==='first')await new Promise(resolve=>controller.signal.addEventListener('abort',resolve,{once:true}));
  },
 });
 await pipeline.poll();
 await until(()=>started.length===1);
 pipeline.pause();
 await until(()=>pipeline.snapshot().length===0);
 assert.deepEqual(started,['first']);
 pipeline.resume();
 await until(()=>started.length===2&&pipeline.snapshot().length===0);
 assert.deepEqual(started,['first','last']);
});
test('finds the real Unicode filename by video ID instead of trusting a damaged console path',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'livetv-name-'));try{const filename='Una desaparición en un avión [kGe-yt-Cb1o].mkv';await writeFile(path.join(dir,filename),'fixture');const found=await existingVideoFile(dir,'kGe-yt-Cb1o');assert.equal(found.file,path.join(dir,filename));assert.equal(found.title,'Una desaparición en un avión');assert.equal(await existingVideoFile(dir,'../invalid'),null);}finally{await rm(dir,{recursive:true,force:true});}});
