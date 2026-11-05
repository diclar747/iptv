import test from 'node:test';import assert from 'node:assert/strict';
import {streamToken,validToken,tokenExpiresAt} from './streamToken.js';
test('cast tokens bind the URL and expire with the account deadline',()=>{
 const url='https://media.test/live.m3u8',expiry=Math.floor((Date.now()+100000)/1000)*1000,token=streamToken(url,expiry);
 assert.equal(validToken(url,token),true);assert.equal(tokenExpiresAt(token),expiry);assert.equal(validToken(url+'/other',token),false);
 assert.equal(validToken(url,streamToken(url,Date.now()-1000)),false);assert.equal(validToken(url,'legacy-unsigned-token'),false);
 assert.equal(validToken(url,token.split('.')[0]+'.'+'é'.repeat(43)),false);
});
