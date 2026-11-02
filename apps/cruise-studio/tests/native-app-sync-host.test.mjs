import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNativeSyncHost} from '../js/modules/series/internal-app.mjs';

// Unit fixtures verify host restrictions only. Formal Account/Pro, wire grants,
// native adapters and actual data equivalence are covered by product E2E.
function fixture({credential='scd1.device-A.secret',local=[],shadow=[],outbox=[],devices=[{id:'device-A',appId:'pitch',revokedAt:null}],membershipState='active'}={}) {
 let generation=0,authorized=true,writes=0,ownedDisposals=0;
 const listeners=new Set(),calls=[];
 const account={accountId:'account-A',accountCredential:'native-account-A',accountDeviceId:'port-device'};
 const storage={getGeneration:()=>generation,getAccount:async()=>structuredClone(account),subscribeAccount:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},setAccount:async()=>{writes++;},getPendingConsume:async()=>null};
 class Client {
  async summary(){calls.push('summary');return {account:{id:account.accountId,state:'active'},memberships:[{id:'membership-A',appId:'pitch',state:membershipState}]};}
  async devices(){calls.push('devices');return {appDevices:devices};}
  async issueHandoff(){calls.push('handoff');}
  async issueJoinInvitation(){calls.push('invitation');return {displayJoinCode:'synthetic-invitation'};}
 }
 const root={storage,AccountClient:Client,core:{validAccountCredential:x=>x==='native-account-A',createHandoffMaterial:()=>({handoffToken:'synthetic-handoff'}),createJoinMaterial:()=>({})}};
 const entry={read:()=>({accountId:account.accountId}),isAuthorized:()=>authorized};
 const host=createNativeSyncHost('pitch',()=>true,entry,root,new URL('https://fixture.invalid/apps/pitch-cruise/pro/'));
 const store={readMeta:async key=>key==='credential'?credential:null,listOutbox:async()=>structuredClone(outbox),listConflicts:async()=>[],listShadow:async()=>structuredClone(shadow)};
 const adapter={storage:{},readLocalSnapshot:()=>({records:local}),serializeRecords:async s=>s.records,isMeaningfulLocalData:s=>s.records.length>0};
 return {host,prepare:()=>host.prepare({appId:'pitch',adapter,store}),calls,account,writes:()=>writes,disposals:()=>ownedDisposals,own:()=>host.own({dispose:()=>ownedDisposals++}),change(){generation++;for(const f of listeners)f();},revoke(){authorized=false;}};
}
const record=hash=>({recordType:'settings',recordId:'settings',payloadHash:hash,payload:{id:'settings',values:{instrument:'piano'}}});

test('same-container native grant preserves the Port Account Device; foreign Account replacement is rejected',async()=>{
 const f=fixture(),s=await f.prepare();
 assert.deepEqual(await s.accountStorage.setAccount({accountId:'account-A',accountCredential:'new-native-app-device'}),{generation:0});
 await assert.rejects(s.accountStorage.setAccount({accountId:'account-B'}),/studio_account_mismatch/);
 assert.equal(f.writes(),0);assert.equal(f.account.accountDeviceId,'port-device');f.host.dispose();
});
test('AppDevice must appear in the current authenticated Account; Account DB alone cannot admit it',async()=>{
 const f=fixture({devices:[{id:'device-B',appId:'pitch',revokedAt:null}]});
 await assert.rejects(f.prepare(),/studio_app_account_mismatch/);assert.deepEqual(f.calls,['summary','devices']);f.host.dispose();
});
test('empty first connection uses the existing native invitation or handoff, without declaring a new Account',async()=>{
 for(const membershipState of ['pending','active']){
  const f=fixture({credential:null,membershipState}),s=await f.prepare();assert.equal(s.review,false);assert.equal(s.connected,false);
  const g=await s.grant();assert.equal(membershipState==='pending'?g.joinCode:g.handoffToken,membershipState==='pending'?'synthetic-invitation':'synthetic-handoff');assert.equal(f.writes(),0);f.host.dispose();
 }
});
test('untracked local changes require review; an exact native pending operation attributes a known offline edit',async()=>{
 for(const tracked of [false,true]){
  const f=fixture({local:[record('local')],shadow:[record('base')],outbox:tracked?[record('local')]:[]}),s=await f.prepare();
  assert.equal(s.review,!tracked);assert.deepEqual(f.calls,['summary','devices']);f.host.dispose();
 }
});
test('an unbound pending operation is preserved and rejected, never adopted because Account is connected',async()=>{
 const pending=[record('old')],f=fixture({credential:null,local:[record('old')],outbox:pending});
 await assert.rejects(f.prepare(),/studio_app_account_mismatch/);assert.equal(pending[0].payloadHash,'old');assert.equal(f.calls.includes('handoff'),false);f.host.dispose();
});
test('Account generation change aborts the native owner and stale mutation paths; dispose is idempotent',async()=>{
 const f=fixture(),s=await f.prepare();f.own();f.change();
 assert.equal(s.runtimeOptions.assertCurrent instanceof Function,true);assert.throws(s.runtimeOptions.assertCurrent,/studio_account_changed/);
 assert.equal(s.runtimeOptions.retainTerminalIdentity,true);assert.equal(f.disposals(),1);f.host.dispose();assert.equal(f.disposals(),1);
});
test('Pro invalidation denies native writes even when the Account DB and AppDevice still exist',async()=>{
 const f=fixture(),s=await f.prepare();f.revoke();assert.throws(s.runtimeOptions.assertCurrent,/studio_account_changed/);await assert.rejects(s.runtimeOptions.assertCurrentAsync(),/studio_account_changed/);f.host.dispose();
});

test('an existing incomplete Chord DB is reported without deletion, migration or rewriting',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 let closed=0,openedVersion;
 const request={result:{objectStoreNames:{contains:()=>false},close(){closed++;}}};
 const factory={open(name,version){assert.equal(name,'soundCruiseSync');openedVersion=version;queueMicrotask(()=>request.onsuccess());return request;}};
 const window={ChordCruiseSync:{core:{DB_NAME:'soundCruiseSync',DB_VERSION:2}}};
 runInNewContext(readFileSync(new URL('../../chord-cruise/js/sync/sync-db.js',import.meta.url),'utf8'),{window,AbortController});
 await assert.rejects(window.ChordCruiseSync.database.open(factory,{signal:new AbortController().signal}),/sync_storage_schema_invalid/);
 assert.equal(openedVersion,2);assert.equal(closed,1);
});

test('a connected untracked edit cannot sync from save/online/refresh before the native explicit review',async()=>{
 const f=fixture({local:[record('local')],shadow:[record('base')]}),s=await f.prepare();
 assert.equal(s.review,true);assert.throws(s.runtimeOptions.assertCurrent,/studio_app_review_required/);
 await assert.rejects(s.runtimeOptions.assertCurrentAsync(),/studio_app_review_required/);
 s.approveReview();assert.doesNotThrow(s.runtimeOptions.assertCurrent);f.host.dispose();
});
