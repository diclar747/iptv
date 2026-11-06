import test from 'node:test';
import assert from 'node:assert/strict';
import {commissionEligible,commissionAmount,wholeGs} from './affiliate-policy.js';
test('50% mensual en guaraníes enteros; valores inválidos no ingresan a la billetera',()=>{
 assert.equal(commissionAmount('27500'),13750);
 for(const value of [0,-1,0.5,null,true,{},'1e3','0x10',Infinity])assert.throws(()=>wholeGs(value));
});
test('comisión exige una cuenta habilitada y un vencimiento vigente, también para vendedores antiguos',()=>{
 const now=Date.now(),u={role:'reseller',status:'active',expires_at:new Date(now+1000)};
 assert.equal(commissionEligible(u,now),true);
 assert.equal(commissionEligible({...u,expires_at:null},now),false);
 assert.equal(commissionEligible({...u,expires_at:new Date(now)},now),false);
 assert.equal(commissionEligible({...u,status:'disabled'},now),false);
 assert.equal(commissionEligible({...u,role:'admin'},now),false);
});
