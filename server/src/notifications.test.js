import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationSettingsHandler} from './notifications.js';
function response(){return {code:200,status(n){this.code=n;return this;},json(value){this.value=value;return this;}};}
test('preferencias de avisos se guardan por usuario y rechazan valores ambiguos',async()=>{
 const state=new Map(),handler=notificationSettingsHandler(async(sql,[id,value])=>{assert.match(sql,/ON CONFLICT\(user_id\)/);state.set(id,value);});
 for(const [id,enabled] of [[1,false],[2,true],[1,true]]){const res=response();await handler({user:{id},body:{enabled}},res);assert.equal(res.value.enabled,enabled);}
 assert.equal(state.get(1),true);assert.equal(state.get(2),true);
 for(const enabled of ['false',0,null,undefined]){const res=response();await handler({user:{id:1},body:{enabled}},res);assert.equal(res.code,400);assert.equal(state.get(1),true);}
});
