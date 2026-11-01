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

function offlineFixture(){
 let online=true,denial=null,clock=0;
 const f=fixture({now:()=>clock,validatePro:async()=>denial||{ok:true,online,offline:!online,offlineRemainingMs:1000},
  summary:async()=>{if(!online)throw Object.assign(Error('network'),{status:0,code:'network_error'});return {account:{id:'A'}};}});
 return {...f,offline(){online=false;},online(){online=true;},deny(result){denial=result;},advance(ms){clock+=ms;}};
}
test('only a previously online-admitted live owner retains native Pro grace on network failure and reconnects',async()=>{
 const f=offlineFixture();assert(await f.entry.check());f.offline();assert(await f.entry.check());assert(f.entry.isAuthorized());assert.equal(f.entry.read().offline,true);f.online();assert(await f.entry.check());assert.equal(f.entry.read().offline,false);
});
test('stored Account and valid native offline allowance cannot cold-admit or reenter after explicit invalidation',async()=>{
 const f=offlineFixture();f.offline();assert.equal(await f.entry.check(),false);f.online();assert(await f.entry.check());f.entry.invalidate('account-changed');f.offline();assert.equal(await f.entry.check(),false);
});
test('Account replacement, Pro revision replacement and explicit revoke cannot reuse offline proof',async()=>{
 for(const change of ['switchAccount','replacePro','revoke']){const f=offlineFixture();assert(await f.entry.check());f[change]();f.offline();assert.equal(await f.entry.check(),false,change);assert.equal(f.entry.isAuthorized(),false);}
});
test('native expired, terminal and ambiguous Pro failures never retain an old proof',async()=>{
 for(const result of [{ok:false,terminal:true},{ok:false,revoked:true},{ok:false,ambiguous:true},{ok:true,offline:true,offlineRemainingMs:0},{ok:true,offline:true}]){const f=offlineFixture();assert(await f.entry.check());f.offline();f.deny(result);assert.equal(await f.entry.check(),false);}
});
test('offline UI proof expires on a monotonic deadline, with no persistence or new qualification',async()=>{
 const f=offlineFixture();assert(await f.entry.check());f.offline();assert(await f.entry.check());f.advance(1000);assert.equal(f.entry.isAuthorized(),false);assert.equal(await f.entry.check(),false);
});
test('an explicit Account refusal or invalid response is never a network fallback',async()=>{
 for(const failure of [undefined,{account:{id:'B'}},Object.assign(Error('revoked'),{status:401,code:'account_device_revoked'}),Object.assign(Error('changed'),{status:0,code:'account_generation_changed'}),Object.assign(Error('invalid'),{status:200,code:'invalid_response'})]){
  let first=true;const f=fixture({validatePro:async()=>({ok:true,online:true,offlineRemainingMs:1000}),summary:async()=>{if(first){first=false;return {account:{id:'A'}};}if(failure instanceof Error)throw failure;return failure;}});
  assert(await f.entry.check());assert.equal(await f.entry.check(),false);
 }
});
test('Account mismatch during a transient summary request cannot retain the old owner',async()=>{
 let release,n=0;const f=fixture({validatePro:async()=>({ok:true,online:true,offlineRemainingMs:1000}),summary:async()=>++n===1?{account:{id:'A'}}:new Promise((_,reject)=>release=reject)});
 assert(await f.entry.check());const pending=f.entry.check();await Promise.resolve();await Promise.resolve();f.switchAccount();release(Object.assign(Error('network'),{status:0,code:'network_error'}));assert.equal(await pending,false);assert.equal(f.entry.isAuthorized(),false);
});
