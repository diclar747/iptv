import '../src/env.js';
import assert from 'node:assert/strict';
import {initSchema,query,one} from '../src/pg.js';
import {initChannelState} from '../src/channelState.js';
import {ensureLoaded,getState} from '../src/iptvSource.js';
import {queryPublicChannels} from '../src/channelCatalog.js';
await initSchema();await initChannelState();await ensureLoaded();
const stamp=Date.now(),manual=[],provider=[],state=getState();
try {
 for(let i=0;i<11;i++)manual.push((await one("INSERT INTO manual_channels(name,stream_url,country,category) VALUES($1,'https://fixture.test/live','ZZ','fixture') RETURNING id",['Page Fixture '+stamp+' '+i])).id);
 for(let i=0;i<3;i++){const c={id:'PageFixture-'+stamp+'-'+i,name:'Provider Fixture '+i,country:'ZZ',categories:['fixture']};provider.push(c.id);state.channels.push(c);state.channelById.set(c.id,c);state.streamsByChannel.set(c.id,[{url:'https://fixture.test/video'}]);}
 const a=await queryPublicChannels({country:'ZZ',page:1,pageSize:10}),b=await queryPublicChannels({country:'ZZ',page:2,pageSize:10}),c=await queryPublicChannels({country:'ZZ',page:3,pageSize:10});
 assert.equal(a.total,14);assert.equal(a.items.length,10);assert.equal(a.pages,2);assert.equal(b.items.length,4);assert.equal(c.items.length,0);
 assert.equal(new Set([...a.items,...b.items].map(x=>x.id)).size,14);
 assert.equal((await queryPublicChannels({country:'ZZ',search:'Provider Fixture',pageSize:10})).items.length,3);
 console.log('PASS: páginas de 10, transición de canales propios al proveedor, total, búsqueda y final sin duplicados ni saltos');
} finally {
 for(const id of manual)await query('DELETE FROM manual_channels WHERE id=$1',[id]);
 state.channels=state.channels.filter(c=>!provider.includes(c.id));for(const id of provider){state.channelById.delete(id);state.streamsByChannel.delete(id);}
}
