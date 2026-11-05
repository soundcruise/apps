import test from 'node:test';import assert from 'node:assert/strict';import {inspectSyncConnection} from '../js/port-sync-status.mjs';
const account={accountId:'private-A',accountCredential:'secret-credential'};
const fixture=(overrides={})=>({storage:{getAccount:async()=>account},summary:async()=>({account:{id:account.accountId}}),devices:async()=>({devices:[{id:'private-device',revokedAt:null}]}),deviceId:()=> 'private-device',readPortCredential:async()=> 'secret-device',...overrides});
for(const [name,overrides,category] of [
 ['no credentials',{storage:{getAccount:async()=>null}},'account-unconnected'],
 ['offline',{online:false},'communication'],
 ['normal Account without app Sync',{readPortCredential:async()=>null},'account-confirmed'],
 ['existing Device revoked',{devices:async()=>({devices:[{id:'private-device',revokedAt:123}]})},'credential-attention'],
 ['summary network failure',{summary:async()=>{throw new TypeError('secret-message');}},'communication'],
 ['Device qualification rejected',{devices:async()=>{throw Object.assign(Error('secret'),{status:410,code:'account_device_revoked'});}},'credential-attention'],
 ['foreign summary',{summary:async()=>({account:{id:'private-B'}})},'credential-attention']
])test(name,async()=>{const r=await inspectSyncConnection(fixture(overrides));assert.equal(r.category,category);assert(!/private-|secret/.test(JSON.stringify(r)));});
test('read failure is not disconnected; diagnostics never change stored Account',async()=>{const r=await inspectSyncConnection(fixture({storage:{getAccount:async()=>{throw Error('secret');}}}));assert.equal(r.accountCredentialPresent,null);assert.equal(r.category,'unconfirmed');});

test('late diagnostic does not attribute old A to new B',async()=>{let current=account;const r=await inspectSyncConnection(fixture({storage:{getAccount:async()=>current},devices:async()=>{current={accountId:'private-B',accountCredential:'secret-B'};return {devices:[]};}}));assert.equal(r.category,'unconfirmed');assert.equal(r.stage,'account-changed');});
test('unstarted native storage remains unknown, not an absent Port credential',async()=>{const r=await inspectSyncConnection(fixture({readPortCredential:async()=>{throw Error('secret-unavailable');}}));assert.equal(r.portCredentialPresent,null);assert.equal(r.category,'account-confirmed');assert(!JSON.stringify(r).includes('secret'));});
