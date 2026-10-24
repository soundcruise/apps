import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {IDBFactory,bpmHandle} from './authority-store/pointer-fixture.mjs';
import {setupProvider,identity} from './authority-store/account-provider-fixture.mjs';
import {control,values} from './authority-store/fixture.mjs';
import {portAccountMutationBinding} from '../port-account-coordination.mjs';
import {seedAccountOwnerContext} from '../../../workers/sound-cruise-sync/test/account-owner-context-fixture.js';
import {handleIsolatedAccountOwnerContext} from '../../../workers/sound-cruise-sync/src/account-owner-context.js';
import {createAccountCredential,accountCredentialVerifier} from '../../../workers/sound-cruise-sync/src/account-crypto.js';
const scripts=await Promise.all(['sync-account-db.js','sync-account-client.js'].map(f=>readFile(new URL('../../shared/sync-account/'+f,import.meta.url),'utf8')));
function classic(indexedDB){const env={indexedDB,structuredClone,setTimeout,clearTimeout,Headers,AbortController,fetch:()=>{throw Error('network forbidden');}};for(const s of scripts)vm.runInNewContext(s,env);return env.SoundCruiseSyncAccount;}
async function setup(t){const owner=await seedAccountOwnerContext(),indexedDB=new IDBFactory(),root=classic(indexedDB),clock={wall:1000,mono:0,origin:'renderer-1'};
 const options={indexedDB,root,record:owner.account,ownerContext:true,clockOptions:{now:()=>clock.wall,monotonicNow:()=>clock.mono,clockIdentity:()=>clock.origin}};
 const x=await setupProvider(options);t.after(()=>{x.dispose();owner.db.close();});
 const ownerResponse=(url,options)=>handleIsolatedAccountOwnerContext(new Request(url,options),{db:owner.db,pepper:owner.pepper,now:()=>100000});
 x.respond(ownerResponse);return {...x,owner,indexedDB,root,clock,options,ownerResponse};
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const refresh=x=>x.provider.refresh({generation:'g1',operationId:'owner-read-'+x.requests.length});
test('real AccountClient -> owner SQL -> provider binds exact server generations; no mutation or write admission',async t=>{
 const x=await setup(t),before=await x.rows(),authority=await x.store.hydrate('g1'),r=await refresh(x);
 assert.equal(r.status,'observed');assert.equal(r.credentialFreshness,'owner-confirmed-at-read');assert.equal(r.portMembership.generation,11);assert.equal(r.serverAccountGeneration,7);assert.equal(r.credentialVersion,3);
 assert.equal(r.expiresAt,105000);assert.equal(r.credentialExpiresAt,null);assert.equal(r.canWrite,false);assert.equal(r.operationAuthorized,false);assert.equal(r.authorizationConfirmed,false);
 assert.equal(x.requests.length,1);assert.match(x.requests[0].url,/owner-context\?requestId=/);assert(!JSON.stringify(r).includes(x.owner.account.accountCredential));
 assert.deepEqual(await x.rows(),before);assert.deepEqual(await x.store.hydrate('g1'),authority);
});
test('cached expiry is checked without timer and remains expired after clock rollback',async t=>{const x=await setup(t);await refresh(x);x.clock.mono=4999;assert.equal(x.provider.getCachedStatus().status,'observed');x.clock.mono=5000;assert.equal(x.provider.getCachedStatus().status,'expired');x.clock.mono=0;x.clock.wall=500;assert.equal(x.provider.getCachedStatus().status,'expired');});
for(const [label,change] of [['wall rollback',c=>c.wall--],['monotonic rollback',c=>c.mono=-1],['clock realm changed',c=>c.origin='other'],['invalid clock',c=>c.wall=NaN]])
 test('cached observation fails closed on '+label,async t=>{const x=await setup(t);await refresh(x);change(x.clock);assert.equal(x.provider.getCachedStatus().status,'expired');});
test('stale response and delayed renew consume elapsed budget; no old snapshot revival',async t=>{
 const x=await setup(t),gate=deferred();x.respond(async(u,o)=>{const response=await x.ownerResponse(u,o);return gate.promise.then(()=>response);});
 const pending=refresh(x);while(!x.requests.length)await new Promise(r=>setImmediate(r));x.clock.mono=6000;gate.resolve();assert.equal((await pending).status,'unconfirmed');
 x.respond(x.ownerResponse);assert.equal((await refresh(x)).status,'observed'); // new nonce, new primary read
});
for(const sql of ['UPDATE sync_account_memberships SET generation=12','UPDATE sync_accounts SET generation=8'])
 test('changed generation is not adopted into Authority: '+sql,async t=>{const x=await setup(t),before=await x.store.hydrate('g1');x.owner.db.raw.exec(sql);assert.equal((await refresh(x)).status,'unconfirmed');assert.deepEqual(await x.store.hydrate('g1'),before);});
for(const [label,change] of [['missing generation',v=>delete v.identity.membershipGeneration],['string generation',v=>v.identity.accountGeneration='7'],['future contract',v=>v.contractVersion=2],['nonce mismatch',v=>v.challenge=crypto.randomUUID()],['missing expiry',v=>delete v.freshness.expiresAt],['fabricated budget',v=>v.freshness.remainingMs=6000]])
 test('unknown owner proof refuses: '+label,async t=>{const x=await setup(t);x.respond(async(u,o)=>{const r=await x.ownerResponse(u,o),v=await r.json();change(v);return {ok:true,status:200,json:async()=>v};});assert.equal((await refresh(x)).status,'unconfirmed');});
test('membership denial is not credential revocation; no Account/Authority stop',async t=>{const x=await setup(t),before=await x.store.hydrate('g1');x.owner.db.raw.exec('DELETE FROM sync_membership_device_links');assert.equal((await refresh(x)).status,'unconfirmed');assert.deepEqual(await x.store.hydrate('g1'),before);});
test('actual revoked credential stops durably; crash/reopen and successful response cannot revive',async t=>{
 const x=await setup(t),before=await x.rows();x.owner.db.raw.exec('UPDATE sync_account_devices SET revoked_at=2');assert.equal((await refresh(x)).status,'denied');assert.deepEqual(await x.rows(),before);
 x.provider.dispose();const other=await setupProvider({...x.options,root:classic(x.indexedDB),seed:false});t.after(()=>other.dispose());other.respond(x.ownerResponse);
 assert.equal((await refresh(other)).status,'unconfirmed');assert.equal(other.requests.length,0);
});
for(const terminal of [false,true])test('same Account credential rotation B survives delayed A '+(terminal?'denial':'success')+' with receipt/prepared operation',async t=>{
 const x=await setup(t),gate=deferred();let ready=false;x.respond(async(u,o)=>{const r=terminal?null:await x.ownerResponse(u,o);ready=true;await gate.promise;return terminal?{ok:false,status:401,json:async()=>({ok:false,code:'invalid_account_credential'})}:r;});
 const pending=refresh(x);while(!ready)await new Promise(r=>setImmediate(r));
 const old=x.owner.account,token='sca1.'+old.accountDeviceId+'.'+createAccountCredential().credential.split('.')[2],b={...old,accountCredential:token};
 x.owner.db.raw.prepare('UPDATE sync_account_devices SET credential_version=4,credential_verifier=?').run(await accountCredentialVerifier(token,x.owner.pepper));
 const binding=portAccountMutationBinding({generation:'g1',operationId:'rotation-B',identity:identity('A'),expectedEpoch:1,expectedPointerEpoch:1,kind:'switch',destination:{accountId:'A',accountDeviceId:b.accountDeviceId}},'sound-cruise-port-authority-v1-fixture-provider');
 await x.mutationStore.mutate({context:await x.mutationStore.capture(),binding,nextAccount:b});
 assert((await x.store.initialize({generation:'g2',control:{...control('g2'),identity:identity('A')},values:values(),operationId:'current-B'})).ok);
 const authority=await x.store.hydrate('g2'),prepared=bpmHandle(x.store,authority.snapshot,'B-prepared'),before=await x.rows();
 gate.resolve();assert.notEqual((await pending).status,'observed');assert.deepEqual(await x.rows(),before);assert.deepEqual(await x.store.hydrate('g2'),authority);
 assert.equal((await x.mutationStore.reconcile(binding)).mutationProven,true);assert.equal((await x.store.commit(prepared)).ok,true);
 x.respond(x.ownerResponse);assert.equal((await x.provider.refresh({generation:'g2',operationId:'B-fresh'})).credentialVersion,4);
});
test('missing receipt refuses before owner request; missing notification cannot hide exact source change',async t=>{const x=await setup(t);await x.rows(s=>s.put({bad:true},'accountMutationMarker:v1'));assert.equal((await refresh(x)).status,'unconfirmed');assert.equal(x.requests.length,0);});
