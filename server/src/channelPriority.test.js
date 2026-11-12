import test from 'node:test';
import assert from 'node:assert/strict';
import {prioritizeChannels,channelPriority} from './channelPriority.js';
test('prioriza los seis canales paraguayos sin alterar la lista original',()=>{
 const names=['Otro','Latele','RCC TV','ABC-TV Paraguay','C9N','SNT','NPY'];
 const input=names.map(name=>({name,country:'PY'}));
 assert.deepEqual(prioritizeChannels(input).map(c=>c.name),['NPY','SNT','C9N','ABC-TV Paraguay','RCC TV','Latele','Otro']);
 assert.deepEqual(input.map(c=>c.name),names);
 assert.equal(channelPriority({name:'SNT',country:'BR'}),100);
});
