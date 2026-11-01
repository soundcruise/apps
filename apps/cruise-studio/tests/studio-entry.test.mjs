import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioEntry} from '../js/core/studio-entry.mjs';

function fixture(options={}){
 let generation=1,account={accountId:'A',accountCredential:'fixture-A'},pro={auth:{credential:'fixture-pro',generation:1,sessionVersion:3},revision:'r1',revoked:false};
 const calls={pro:0,summary:0,reject:0};
 const entry=createStudioEntry({storage:{getGeneration:()=>generation,getAccount:async()=>account},source:{read:()=>pro},
  gateReady:()=>true,validatePro:async()=>{calls.pro++;return {ok:true,online:true};},summary:async()=>{calls.summary++;return {account:{id:account.accountId}};},rejectPro:()=>calls.reject++,...options});
 return {entry,calls,switchAccount(){generation++;account={accountId:'B',accountCredential:'fixture-B'};entry.invalidate('account-changed');},revoke(){pro={...pro,revoked:true};},replacePro(){pro={...pro,revision:'r2'};}};
}
test('no gate, stored Account alone and a UI flag never grant entry',async()=>{
 const f=fixture({gateReady:()=>false});assert.equal(await f.entry.check(),false);assert.equal(f.entry.isAuthorized(),false);assert.equal(f.calls.pro,0);assert.equal(f.calls.summary,0);
});
test('native Pro validation plus matching remote Account admits; invalidation permits reauthentication',async()=>{
 const f=fixture();assert.equal(await f.entry.check(),true);assert.equal(f.entry.isAuthorized(),true);assert.equal(f.entry.read().accountId,'A');f.entry.invalidate();assert.equal(f.entry.isAuthorized(),false);assert.equal(await f.entry.check(),true);
});
test('native validation failure and offline allowance do not substitute for online entrance proof',async()=>{
 for(const result of [{ok:false},{ok:true,offline:true}]){const f=fixture({validatePro:async()=>result});assert.equal(await f.entry.check(),false);assert.equal(f.calls.summary,0);}
});
test('terminal native denial goes through existing revocation hook',async()=>{
 const f=fixture({validatePro:async()=>({ok:false,terminal:true})});assert.equal(await f.entry.check(),false);assert.equal(f.calls.reject,1);
});
test('remote Account mismatch or Device refusal fails closed without changing Account data',async()=>{
 for(const summary of [async()=>({account:{id:'other'}}),async()=>{throw Error('account_device_revoked');}]){
  const f=fixture({summary});assert.equal(await f.entry.check(),false);assert.equal(f.entry.isAuthorized(),false);assert.equal(f.entry.read().accountId,null);
 }
});
test('Account replacement during validation cannot adopt the old result',async()=>{
 let release;const f=fixture({validatePro:()=>new Promise(r=>release=r)});const pending=f.entry.check();await Promise.resolve();f.switchAccount();release({ok:true,online:true});assert.equal(await pending,false);assert.equal(f.entry.isAuthorized(),false);
});
test('a delayed Account response cannot grant a changed Pro revision',async()=>{
 let release;const f=fixture({summary:()=>new Promise(r=>release=r)});const pending=f.entry.check();await Promise.resolve();await Promise.resolve();f.replacePro();release({account:{id:'A'}});assert.equal(await pending,false);
});
test('revocation immediately closes an existing proof even before notifications',async()=>{
 const f=fixture();assert.equal(await f.entry.check(),true);f.revoke();assert.equal(f.entry.isAuthorized(),false);assert.notEqual(f.entry.read().phase,'ready');
});
test('concurrent checks share one native validation and Account request',async()=>{
 const f=fixture();assert.deepEqual(await Promise.all([f.entry.check(),f.entry.check()]),[true,true]);assert.equal(f.calls.pro,1);assert.equal(f.calls.summary,1);
});
test('an old in-flight validation cannot clear or overwrite a newer Account proof',async()=>{
 let release,count=0;const f=fixture({validatePro:()=>++count===1?new Promise(r=>release=r):Promise.resolve({ok:true,online:true})});
 const old=f.entry.check();await Promise.resolve();f.switchAccount();assert.equal(await f.entry.check(),true);release({ok:true,online:true});assert.equal(await old,false);assert.equal(f.entry.isAuthorized(),true);assert.equal(f.entry.read().accountId,'B');
});
