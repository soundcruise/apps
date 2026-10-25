import test from 'node:test';import assert from 'node:assert/strict';
import {backendSaveFixture} from './authority-store/backend-save-fixture.mjs';
import {clockRecoveryFixture} from '../../../workers/sound-cruise-sync/test/account-clock-recovery-fixture.js';
import {createIsolatedRenewalVault,createIsolatedRenewalRecoveryClient} from '../port-renewal-recovery-isolated.mjs';
import {portAccountMutationBinding} from '../port-account-coordination.mjs';
import {identity} from './authority-store/account-provider-fixture.mjs';
async function setup(t,{checkpoint,dispatch,vaultOverride,timeoutMs=1000}={}){
 const x=await backendSaveFixture(t),s=await clockRecoveryFixture({existing:x.f,checkpoint});t.after(()=>s.dispose());
 const vault=createIsolatedRenewalVault({indexedDB:x.indexedDB,scopeName:x.scope.name}),opts={scope:x.scope,indexedDB:x.indexedDB,source:x.mutationStore,vault:vaultOverride?vaultOverride(vault):vault,dispatch:dispatch?req=>dispatch(req,s):req=>s.routes.handle(req),url:'https://owner-route.invalid/__isolated/account/v1/',timeoutMs},client=createIsolatedRenewalRecoveryClient(opts);t.after(()=>client.dispose());
 const begin=await s.send('credential/renew/begin',s.lifecycle());assert.equal(begin.status,200);const request=s.lifecycle({transitionId:begin.body.transitionId}),id={accountId:'A',accountDeviceId:s.account.accountDeviceId,membershipId:'member-A'};
 return {...x,s,vault,opts,client,request,id,prepare:()=>client.prepare({request,identity:id})};
}
test('nonextractable key + encrypted recovery proof readback before finish; ACK-loss/reopen recovers exact credential',async t=>{
 let lose=true;const x=await setup(t,{checkpoint:(p,d)=>{if(lose&&p==='after-lifecycle-transaction'&&d.action==='finish-renew')throw Error('ack-lost');}}),before=await x.rows(),h=await x.prepare();assert(h.ok,h.reason);
 const local=await x.vault.read(h.operationId);assert.equal(local.packet.key.extractable,false);await assert.rejects(crypto.subtle.exportKey('raw',local.packet.key));assert(!JSON.stringify(local.packet).includes(local.secret));assert.equal((await x.client.finish(h)).ok,false);
 const reopened=createIsolatedRenewalRecoveryClient(x.opts);t.after(()=>reopened.dispose());const r=await reopened.recover(h);assert(r.ok,r.reason);assert(r.adoptionRequired);const again=await reopened.recover(h);assert(again.ok);assert.equal(r.credential,again.credential);assert.deepEqual(await x.rows(),before);assert.equal(x.s.row().credential_version,4);assert(!JSON.stringify(x.s.row()).includes(r.credential));assert.equal((await x.client.finish(h)).ok,false);assert(await x.vault.read(h.operationId));
});
test('backup failure prevents credential commit; no fallback plaintext persistence',async t=>{
 const x=await setup(t,{vaultOverride:v=>({...v,claim(){throw Error('quota');}})});assert.equal((await x.prepare()).ok,false);assert.equal(x.s.row().credential_version,3);assert.equal(x.s.row().credential_lifecycle,'renewing');assert.equal(x.s.row().credential_recovery_json,null);
});
test('immutable operation pin cannot be overwritten; concurrent operation pins do not mix keys',async t=>{
 const x=await setup(t),h=await x.prepare();assert(h.ok);assert.equal((await x.prepare()).ok,false);const local=await x.vault.read(h.operationId);await assert.rejects(x.vault.claim({...local.packet,secret:local.secret,request:{...x.request,expectedCredentialVersion:99}}));assert.deepEqual((await x.vault.read(h.operationId)).packet.request,x.request);
});
for(const type of ['header-timeout','body-timeout'])test(type+' remains unknown and retains encrypted pending without automatic retry',async t=>{
 const x=await setup(t,{timeoutMs:15,dispatch:()=>type==='header-timeout'?new Promise(()=>{}):Promise.resolve({status:200,json:()=>new Promise(()=>{})})}),h=await x.prepare();assert(h.ok);assert.equal((await x.client.finish(h)).reason,'renewal-outcome-unknown');assert(await x.vault.read(h.operationId));assert.equal(x.s.row().credential_version,3);
});
test('late A recovery response after persistent switch to B cannot expose/adopt credential or modify B',async t=>{
 let release,entered,hold=false;const arrived=new Promise(r=>entered=r),x=await setup(t,{dispatch:async(req,s)=>{const response=await s.routes.handle(req);if(hold&&req.url.endsWith('/reconcile')){entered();await new Promise(r=>release=r);}return response;}}),h=await x.prepare();assert(h.ok);assert((await x.client.finish(h)).ok);hold=true;const late=x.client.recover(h);await arrived;
 const accountB=await x.s.addAccount('B'),binding=portAccountMutationBinding({generation:'g1',operationId:'switch-recovery-B',identity:identity('A'),expectedEpoch:1,expectedPointerEpoch:1,kind:'switch',destination:{accountId:'B',accountDeviceId:accountB.accountDeviceId}},x.scope.name);
 assert((await x.mutationStore.mutate({context:await x.mutationStore.capture(),binding,nextAccount:accountB})).ok);const rows=await x.rows(),data=x.s.state();release();const r=await late;assert.equal(r.ok,false);assert.equal(r.credential,undefined);assert.deepEqual(await x.rows(),rows);assert.equal(x.s.state(),data);assert(await x.vault.read(h.operationId));assert.equal((await x.client.recover(h)).ok,false);
});
test('same identity ABA / Account fence change rejects old vault on reopened client',async t=>{
 const x=await setup(t),h=await x.prepare();assert(h.ok);assert((await x.client.finish(h)).ok);const before=await x.mutationStore.capture();
 await x.mutationStore.auxiliary({context:await x.mutationStore.capture(),key:'pendingStart',value:{fixture:true},write:true});
 await x.mutationStore.auxiliary({context:await x.mutationStore.capture(),key:'pendingStart',remove:true,write:true});
 assert.equal(await x.mutationStore.current(before),false);const reopened=createIsolatedRenewalRecoveryClient(x.opts);t.after(()=>reopened.dispose());const r=await reopened.recover(h);assert.equal(r.ok,false);assert.equal(r.credential,undefined);assert(await x.vault.read(h.operationId));
});
test('missing native-storable key after commit cannot fall back to plaintext or reissue',async t=>{
 const x=await setup(t),h=await x.prepare();assert(h.ok);assert((await x.client.finish(h)).ok);const data=x.s.state(),version=x.s.row().credential_version;
 const db=await new Promise((r,j)=>{const q=x.indexedDB.open('sound-cruise-sync-app-backups');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
 await new Promise((r,j)=>{const tx=db.transaction('backups','readwrite'),store=tx.objectStore('backups'),q=store.getAll();q.onsuccess=()=>{const row=q.result.find(v=>v.packet?.operationId===h.operationId);delete row.packet.key;store.put(row);};tx.oncomplete=r;tx.onabort=()=>j(tx.error);});db.close();
 const recovered=await x.client.recover(h);assert.equal(recovered.ok,false);assert.equal(recovered.credential,undefined);assert.equal(x.s.row().credential_version,version);assert.equal(x.s.state(),data);
});
