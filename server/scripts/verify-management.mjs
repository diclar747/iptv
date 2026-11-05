// Integración local: crea fixtures propios y los elimina al finalizar.
import '../src/env.js';
import assert from 'node:assert/strict';
import express from 'express';
import {initSchema,one,query} from '../src/pg.js';
import {attachUser,createSession} from '../src/auth.js';
import {initChannelState} from '../src/channelState.js';
import channels from '../src/channelAdmin.js';
import movies from '../src/movieAdmin.js';
import manual from '../src/manualChannels.js';
import {ensureLoaded,getState,getChannelStreams,queryChannels} from '../src/iptvSource.js';
await initSchema();await initChannelState();await ensureLoaded();
const admin=await one("SELECT id FROM users WHERE role='admin' LIMIT 1");
assert.ok(admin,'Se necesita una cuenta admin local');
const cookie='sid='+createSession(admin.id),fixture='Fixture-'+Date.now()+'.py';
let movieId,manualId;
const app=express();app.use(express.json(),attachUser);
app.get('/fixture/error',(req,res)=>res.type('html').send('<html>Error</html>'));
app.get('/fixture/master.m3u8',(req,res)=>res.type('application/vnd.apple.mpegurl').send('#EXTM3U\n#EXTINF:5,\nsegment.ts\n'));
app.get('/fixture/segment.ts',(req,res)=>res.type('video/mp2t').send(Buffer.alloc(188,0x47)));
app.use('/api',channels,movies,manual);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port;
const source=getState();source.channels.push({id:fixture,name:'Fixture gestión',country:'PY',categories:['general'],is_nsfw:false});source.channelById.set(fixture,source.channels.at(-1));source.streamsByChannel.set(fixture,[{url:base+'/fixture/error',quality:null}]);
async function req(path,method='GET',body,expected=200){const r=await fetch(base+'/api'+path,{method,headers:{cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data;}
try {
 const denied=await fetch(base+'/api/admin/channels');assert.equal(denied.status,401);
 const path='/admin/channels/'+encodeURIComponent(fixture);
 await req(path,'PATCH',{name:'Fixture editado',streams:[{url:base+'/fixture/error'},{url:base+'/fixture/master.m3u8'}]});
 assert.equal(getChannelStreams(fixture).channel.name,'Fixture editado');
 await initChannelState();assert.equal(getChannelStreams(fixture).channel.name,'Fixture editado','Edición persistida al recargar estado');
 const checked=await req(path+'/verify','POST',{});assert.equal(checked.status,'online');assert.equal(checked.results[0].ok,false);assert.equal(checked.results[1].ok,true);
 assert.equal(getChannelStreams(fixture).streams[0].url,base+'/fixture/master.m3u8','Fuente activa prioritaria');
 assert.equal(getChannelStreams(fixture).channel.status,'online');
 await req(path,'PATCH',{blocked:true});assert.equal(getChannelStreams(fixture),null);assert.ok(!queryChannels({search:fixture}).items.some(c=>c.id===fixture));
 await req(path,'DELETE');const trash=await req('/admin/channels?status=deleted&search='+fixture);assert.equal(trash.items.length,1);
 await req(path+'/restore','POST',{});assert.ok(getChannelStreams(fixture));
 await req(path,'PATCH',{streams:[{url:'javascript:invalid'}]},400);
 await req(path+'/reset','POST',{});assert.equal(getChannelStreams(fixture).channel.name,'Fixture gestión');
 const created=await req('/admin/manual-channels','POST',{name:'Fixture manual '+fixture,streamUrl:base+'/fixture/master.m3u8',country:'PY',category:'general'},201);manualId=created.id;
 const found=await req('/admin/channels?search='+encodeURIComponent('Fixture manual '+fixture));assert.equal(found.items[0].id,'man:'+manualId);
 const movie=await req('/admin/movies','POST',{title:'Fixture película '+fixture,year:2026,streams:[{url:base+'/fixture/master.m3u8'}]},201);movieId=movie.id;
 assert.equal((await req('/admin/movies/'+movieId)).streams.length,1);
 await req('/admin/movies/'+movieId,'PUT',{title:'Fixture película editada',year:2026,streams:[{url:base+'/fixture/master.m3u8'}]});
 assert.equal((await req('/admin/movies/'+movieId+'/verify','POST',{})).status,'online');
 await req('/admin/movies/'+movieId+'/state','PATCH',{deleted:true});assert.equal((await one('SELECT hidden FROM movies WHERE id=$1',[movieId])).hidden,true);
 await req('/admin/movies/'+movieId+'/state','PATCH',{hidden:false,deleted:false});assert.equal((await one('SELECT hidden FROM movies WHERE id=$1',[movieId])).hidden,false);
 console.log('PASS: autenticación, catálogo completo, edición persistente, bloqueo, papelera/restauración, URLs inválidas, alta manual, prioridad de señal y CRUD de películas');
} finally {
 await query('DELETE FROM channel_overrides WHERE channel_id=$1',[fixture]);await query('DELETE FROM channel_health WHERE channel_id=$1 OR channel_id=$2',[fixture,'movie:'+movieId]);
 if(manualId)await query('DELETE FROM manual_channels WHERE id=$1',[manualId]);
 if(movieId){await query("DELETE FROM media_sources WHERE content_type='movie' AND content_id=$1",[movieId]);await query('DELETE FROM movies WHERE id=$1',[movieId]);}
 server.closeAllConnections();await new Promise(r=>server.close(r));
}
