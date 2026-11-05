import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {streamHandler} from './proxy.js';
async function withProxy(options,fn){const app=express();app.get('/stream',streamHandler(options));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));try{await fn('http://127.0.0.1:'+server.address().port+'/stream?url='+encodeURIComponent('https://primary.test/live'));}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}
test('proxy tries the alternative after an upstream failure',async()=>{
 await withProxy({lookupRadio:async()=>({url:'https://primary.test/live',alternativeSources:['https://backup.test/live']}),request:async url=>String(url).includes('primary')?new Response('Down',{status:503}):new Response(new Uint8Array([255,251,1,2]),{headers:{'content-type':'audio/mpeg'}})},async url=>{const r=await fetch(url);assert.equal(r.status,200);assert.equal((await r.arrayBuffer()).byteLength,4);});
});
test('a connection timeout returns JSON instead of leaving the gateway hanging',async()=>{
 await withProxy({lookupRadio:async()=>null,connectTimeoutMs:30,totalTimeoutMs:200,request:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))},async url=>{const r=await fetch(url);assert.equal(r.status,504);assert.equal((await r.json()).code,'UPSTREAM_TIMEOUT');});
});
test('a valid audio stream continues beyond its connection timeout',async()=>{
 await withProxy({lookupRadio:async()=>null,connectTimeoutMs:40,totalTimeoutMs:80,request:async(url,{signal})=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([255,251]));const t=setTimeout(()=>{controller.enqueue(new Uint8Array([1,2]));controller.close();},120);signal.addEventListener('abort',()=>{clearTimeout(t);controller.error(Error('aborted'));},{once:true});}}),{headers:{'content-type':'audio/mpeg'}})},async url=>{const r=await fetch(url);assert.equal(r.status,200);assert.equal((await r.arrayBuffer()).byteLength,4);});
});
test('proxy selects the second published CDN and rewrites HLS resources',async()=>{
 const request=async url=>{const u=String(url);if(u.includes('www.desdeparaguay.com'))return new Response('dsdpyStream0="https://bad.test/a.m3u8";dsdpyStream1="https://good.test/b.m3u8";');if(u.includes('bad.test'))return new Response('Down',{status:503});return new Response('#EXTM3U\n#EXTINF:3,\nsegment.aac\n',{headers:{'content-type':'application/vnd.apple.mpegurl'}});};
 await withProxy({lookupRadio:async()=>({url:'https://www.desdeparaguay.com/proxy-cdn-test'}),request},async url=>{const r=await fetch(url);assert.equal(r.status,200);assert.ok((await r.text()).includes(encodeURIComponent('https://good.test/segment.aac')));});
});
