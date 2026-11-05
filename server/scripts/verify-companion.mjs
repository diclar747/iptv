import {spawn} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const dir=await mkdtemp(path.join(os.tmpdir(),'livetv-companion-test-'));
const child=spawn(process.execPath,['companion/assistant.mjs'],{env:{...process.env,LIVETV_ASSISTANT_PORT:'43829',LIVETV_ASSISTANT_NO_BROWSER:'1',LIVETV_ASSISTANT_DATA:dir},stdio:['ignore','pipe','pipe']});
try{
 const url=await new Promise((resolve,reject)=>{let text='';const t=setTimeout(()=>reject(Error('El asistente no inició')),10000);child.on('error',reject);child.stdout.on('data',b=>{text+=b;const m=text.match(/http:\/\/127\.0\.0\.1:43829\/\?key=([a-f0-9]+)/);if(m){clearTimeout(t);resolve(m[0]);}});});
 const origin=new URL(url).origin,secret=new URL(url).searchParams.get('key');
 let r=await fetch(origin);assert.equal(r.status,403);
 r=await fetch(url);assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0],html=await r.text();assert.ok(html.includes('Vincular computadora'));assert.ok(!html.includes('__NONCE__'));
 r=await fetch(origin+'/status',{headers:{cookie}});assert.equal(r.status,200);const state=await r.json();assert.equal(state.connected,false);assert.equal(state.token,undefined);
 r=await fetch(origin+'/pause',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403,'Missing CSRF token must not pause');
 r=await fetch(origin+'/pause',{method:'POST',headers:{cookie,'Content-Type':'application/json','X-LiveTV-Local':secret,Origin:'https://evil.example'},body:'{}'});assert.equal(r.status,403,'Foreign origins must not operate the helper');
 r=await fetch(origin+'/pair',{method:'POST',headers:{cookie,'Content-Type':'application/json','X-LiveTV-Local':secret},body:JSON.stringify({server:'http://example.com',code:'1234567890ABCDEF'})});assert.equal(r.status,400,'Credentials must not be sent over HTTP');
 r=await fetch(origin+'/pause',{method:'POST',headers:{cookie,'Content-Type':'application/json','X-LiveTV-Local':secret},body:'{}'});assert.equal(r.status,200);
 assert.equal((await (await fetch(origin+'/status',{headers:{cookie}})).json()).paused,true);
 console.log('PASS: asistente local, acceso restringido, sesión local, protección CSRF, rechazo de otros sitios y vinculación solo HTTPS.');
}finally{child.kill();await new Promise(r=>child.once('close',r));await rm(dir,{recursive:true,force:true});}
