import test from 'node:test';import assert from 'node:assert/strict';
import {consumerReadmissionFixture} from './authority-store/consumer-readmission-fixture.mjs';
test('backend success with local failure requires explicit recovery on exact original consumer; no SQL resend',async t=>{
 let stop=true;const x=await consumerReadmissionFixture(t,{checkpoint:n=>{if(stop&&n==='before-operation-local')throw Error('crash');}});
 const p=await x.prepareNew();ok(p);const r=await x.readmission.commit(p);assert.equal(r.ok,false);assert.equal(r.backendCommitted,true);
 const before=(await x.headNew()).snapshot,rows=await x.backup.inventory();
 assert.equal((await x.readmission.recover({operationId:p.operationId})).ok,false);
 assert.equal((await x.readmission.recoverPending({operationId:p.operationId,explicit:false})).ok,false);
 assert.deepEqual((await x.headNew()).snapshot,before);stop=false;const tab=await x.makeReadmission();
 ok(await tab.recoverPending({operationId:p.operationId,explicit:true}));assert.equal(x.s.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,1);
 assert.equal(JSON.parse((await x.headNew()).snapshot.values['cruisePort.metronome']).bpm,161);
 for(const row of rows)assert.deepEqual((await x.backup.inventory()).find(r=>r.id===row.id),row);
});
const ok=r=>assert.equal(r.ok,true,JSON.stringify(r));
test('new readonly consumer explicitly leases, saves and reloads BPM without reopening writer',async t=>{
 const x=await consumerReadmissionFixture(t),before=(await x.headNew()).snapshot,p=await x.prepareNew();ok(p);
 const saved=await x.readmission.commit(p);ok(saved);const after=(await x.headNew()).snapshot;
 assert.equal(JSON.parse(after.values['cruisePort.metronome']).bpm,161);
 assert(after.control.suspended&&after.control.fenceRevoked);assert.deepEqual(after.control,before.control);assert.deepEqual(after.pointer,before.pointer);
 assert.equal(x.s.db.raw.prepare('SELECT phase FROM sync_account_pointer_fences').get().phase,'readonly');
 const second=await x.prepareNew(172,1);ok(second);ok(await x.readmission.commit(second));
 assert.equal(JSON.parse((await x.headNew()).snapshot.values['cruisePort.metronome']).bpm,172);
 assert.equal(saved.canWrite,false);assert.equal(saved.sharedWrite,false);
});

import {raw} from './authority-store/pointer-fixture.mjs';
import {digest} from '../port-idb-authority-contract.mjs';
import {createIsolatedConsumerBpm} from '../port-consumer-bpm-isolated.mjs';
import {createIsolatedBpmController} from '../../cruise-studio/js/modules/metronome/isolated-bpm-controller.mjs';
const send=async(x,path,e,l,auth)=>{const record=await x.record(),r=await x.readmissionRoutes.handle(new Request('https://owner-route.invalid/__isolated/account/v1/operation/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:auth||'Bearer '+record.accountCredential,'X-Sound-Cruise-App-Authorization':x.s.credentials.appAuthorization,'X-Sound-Cruise-Pro-Authorization':x.s.credentials.proAuthorization},body:JSON.stringify({envelope:e,envelopeDigest:digest(e),...(l?{lease:l}:{})})}));return {status:r.status,body:await r.json()};};
const packet=async(x,p)=>(await x.backup.read('op-'+p.operationId)).packet;
const patch=(x,stores,fn)=>raw({factory:x.indexedDB,scope:x.scope},stores,fn);
for(const [name,change]of[
 ['credential-expiry',x=>x.s.db.raw.exec('UPDATE sync_account_devices SET credential_expires_at=99999')],
 ['credential-revoke',x=>x.s.db.raw.exec('UPDATE sync_account_devices SET revoked_at=99999')],
 ['owner-generation',x=>x.s.db.raw.exec('UPDATE sync_accounts SET generation=generation+1')],
 ['owner-fence',x=>x.s.db.raw.exec('UPDATE sync_account_devices SET operation_fence_revision=operation_fence_revision+1')],
 ['writer-rights',x=>x.s.db.raw.exec('UPDATE sync_account_memberships SET write_epoch=write_epoch+1')],
 ['Pro',x=>x.s.db.raw.exec('UPDATE pro_credentials SET revoked_at=99999')],
 ['lease-expiry',x=>x.clock.server+=10000],
 ['registry-ABA',x=>x.s.db.raw.exec('UPDATE sync_account_pointer_fences SET revision=revision+2')],
 ['registry-consumer',x=>x.s.db.raw.exec("UPDATE sync_account_pointer_fences SET consumer_json='{}'")],
 ['pointer-ABA',x=>patch(x,['pointer'],tx=>{const s=tx.objectStore('pointer'),r=s.get('active');r.onsuccess=()=>s.put({...r.result,pointerEpoch:r.result.pointerEpoch+2});})],
 ['consumer-ABA',x=>patch(x,['pointer'],tx=>{const s=tx.objectStore('pointer'),r=s.get('isolated-consumer');r.onsuccess=()=>s.put({...r.result,epoch:r.result.epoch+2});})],
 ['consumer-missing',x=>patch(x,['pointer'],tx=>tx.objectStore('pointer').delete('isolated-consumer'))],
 ['stop-intent',x=>patch(x,['control'],tx=>{const s=tx.objectStore('control'),r=s.get(x.generation);r.onsuccess=()=>s.put({...r.result,recoveryRequired:true,epoch:r.result.epoch+1});})],
 ['Account-ABA',async x=>{await x.mutationStore.auxiliary({context:await x.mutationStore.capture(),key:'pendingStart',value:{unknown:true},write:true});await x.mutationStore.auxiliary({context:await x.mutationStore.capture(),key:'pendingStart',remove:true,write:true});}],
 ['pending-mismatch',x=>x.backup.add('unknown',{unknown:true})]
])test('new consumer rejects '+name+' without changing data or pinned backups',async t=>{
 const x=await consumerReadmissionFixture(t),p=await x.prepareNew();ok(p);const data=x.f.state(),values=(await x.headNew()).snapshot.values,pins=await x.backup.inventory();await change(x);assert.equal((await x.readmission.commit(p)).ok,false);
 assert.equal(x.f.state(),data);const h=await x.headNew();if(h.ok)assert.deepEqual(h.snapshot.values,values);for(const row of pins)assert.deepEqual((await x.backup.inventory()).find(v=>v.id===row.id),row);
});
for(const field of ['consumer','pointer','generation','readmission','operation','digest'])test('SQL refuses altered '+field+' binding and old lease',async t=>{
 const x=await consumerReadmissionFixture(t),p=await x.prepareNew();ok(p);const e=structuredClone((await packet(x,p)).envelope),before=x.f.state();
 if(field==='consumer')e.consumer.epoch+=2;if(field==='pointer')e.authority.pointer.pointerEpoch+=2;if(field==='generation'){e.authority.generation='other';e.authority.pointer.activeGeneration='other';e.request.localGeneration='other';}if(field==='readmission')e.readmission.stopFenceRevision++;if(field==='operation')e.request.operation.operationId=crypto.randomUUID();if(field==='digest')e.request.operation.payload.value.bpm++;
 assert.notEqual((await send(x,'save',e,p.lease)).status,200);assert.equal(x.f.state(),before);
});
for(const field of ['history-null','history-id','publication','receipt'])test('corrupt immutable provenance '+field+' blocks new Admission',async t=>{
 const x=await consumerReadmissionFixture(t);if(field==='receipt')await patch(x,['reservations'],tx=>tx.objectStore('reservations').delete([x.generation,x.transitionId]));
 else{const db=await new Promise((r,j)=>{const q=x.indexedDB.open('sound-cruise-sync-app-backups');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});await new Promise((r,j)=>{const tx=db.transaction('backups','readwrite'),s=tx.objectStore('backups'),q=s.getAll();q.onsuccess=()=>{const row=q.result.find(v=>v.id.endsWith((field==='publication'?'publish-cutover-':'cutover-')+x.transitionId));if(field==='history-null')row.packet.history=null;if(field==='history-id')row.packet.history.adoptionOperationId=crypto.randomUUID();if(field==='publication')row.packet.intentDigest='e'.repeat(64);s.put(row);};tx.oncomplete=r;tx.onabort=()=>j(tx.error);});db.close();}
 const before=x.f.state();assert.equal((await x.prepareNew()).ok,false);assert.equal(x.f.state(),before);
});
test('Studio draft controller uses existing owner pins; unknown fields, reopen and consecutive save preserved',async t=>{
 const x=await consumerReadmissionFixture(t),initial=(await x.headNew()).snapshot,make=operation=>createIsolatedConsumerBpm({fixtureOnly:true,operation,backup:x.backup,readBackendRevision:()=>x.s.db.raw.prepare('SELECT MAX(revision) r FROM sync_changes').get().r||0}),facade=make(x.readmission),ui=createIsolatedBpmController(facade);
 ok(await ui.reload());assert.equal(ui.snapshot().bpm,JSON.parse(initial.values['cruisePort.metronome']).bpm);assert(ui.edit(181));assert.equal((await x.headNew()).snapshot.values['cruisePort.metronome'],initial.values['cruisePort.metronome']);const id=crypto.randomUUID();ok(await ui.save({operationId:id}));assert(await ui.acknowledgeRecovery({operationId:id}));ok(await ui.reload());assert.equal(ui.snapshot().bpm,181);
 assert.deepEqual(JSON.parse(initial.values['cruisePort.metronome']).futureOwnerField,{preserve:['unknown',17]});const expected={...JSON.parse(initial.values['cruisePort.metronome']),bpm:181};assert.deepEqual(JSON.parse((await x.headNew()).snapshot.values['cruisePort.metronome']),expected);
 const reopened=createIsolatedBpmController(make(await x.makeReadmission()));ok(await reopened.reload());assert.equal(reopened.snapshot().bpm,181);assert(reopened.edit(182));ok(await reopened.save({operationId:crypto.randomUUID()}));assert.equal(ui.snapshot().canWrite,false);
});
test('replay, same ID different content, CAS conflict never auto retry',async t=>{
 const x=await consumerReadmissionFixture(t),p=await x.prepareNew();ok(p);ok(await x.readmission.commit(p));const before=x.f.state();assert.equal((await x.readmission.commit(p)).ok,false);assert.equal((await x.prepareNew(170,1,p.operationId)).ok,false);assert.equal(x.f.state(),before);const stale=await x.prepareNew(171,0);assert.equal(stale.ok,false);assert.equal(x.f.state(),before);
});
for(const phase of ['before-operation-backend','after-operation-backend','before-operation-local','local-application-result','after-operation-local'])test('crash '+phase+' keeps exact receipts and explicit recovery only',async t=>{
 const x=await consumerReadmissionFixture(t,{checkpoint:n=>{if(n===phase)throw Error('crash');}}),p=await x.prepareNew();ok(p);const result=await x.readmission.commit(p);assert.equal(result.ok,false);const committed=!['before-operation-backend'].includes(phase),applied=['local-application-result','after-operation-local'].includes(phase);assert.equal(x.s.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,committed?1:0);
 const tab=await x.makeReadmission({checkpoint:async()=>{}}),r=await tab.recover({operationId:p.operationId});assert.equal(r.ok,applied);assert.equal(result.localCommitted,applied?true:null);if(committed)ok(await tab.recoverPending({operationId:p.operationId,explicit:true}));else assert.equal((await tab.recoverPending({operationId:p.operationId,explicit:true})).ok,false);
});
for(const corruption of ['missing-backend','altered-backend','missing-local','altered-local'])test('receipt '+corruption+' refuses recovery; never repairs uncertain local commit',async t=>{
 const x=await consumerReadmissionFixture(t),p=await x.prepareNew();ok(p);ok(await x.readmission.commit(p));const values=(await x.headNew()).snapshot.values;if(corruption==='missing-backend')x.s.db.raw.exec('DELETE FROM sync_changes');if(corruption==='altered-backend')x.s.db.raw.exec("UPDATE sync_changes SET isolated_request_digest='wrong'");if(corruption.includes('local'))await patch(x,['reservations'],tx=>{const s=tx.objectStore('reservations'),key=[x.generation,p.operationId];if(corruption==='missing-local')s.delete(key);else{const q=s.get(key);q.onsuccess=()=>s.put({...q.result,proofDigest:'e'.repeat(64)});}});
 assert.equal((await x.readmission.recoverPending({operationId:p.operationId,explicit:true})).ok,false);assert.deepEqual((await x.headNew()).snapshot.values,values);
});
test('two tabs serialize new consumer Admission and prevent two pending saves',async t=>{
 const x=await consumerReadmissionFixture(t),tab=await x.makeReadmission(),a=await Promise.all([x.prepareNew(),tab.prepare({generation:x.generation,operationId:crypto.randomUUID(),bpm:190,expectedBackendRevision:0,explicit:true})]);assert.equal(a.filter(r=>r.ok).length,1);ok(await (a[0].ok?x.readmission:tab).commit(a.find(r=>r.ok)));
});
for(const kind of ['ACK-loss','timeout'])test('backend '+kind+' preserves pending and no auto resends',async t=>{
 let saves=0;const x=await consumerReadmissionFixture(t,{dispatch:async(req,routes)=>{if(new URL(req.url).pathname.endsWith('/operation/save')){saves++;if(kind==='timeout')return new Promise(()=>{});await routes.handle(req);throw Error('ack');}return routes.handle(req);}}),p=await x.prepareNew();ok(p);const before=(await x.headNew()).snapshot.values;assert.equal((await x.readmission.commit(p)).ok,false);assert.equal((await x.readmission.commit(p)).ok,false);assert.equal(saves,1);assert.deepEqual((await x.headNew()).snapshot.values,before);if(kind==='ACK-loss')ok(await (await x.makeReadmission()).recoverPending({operationId:p.operationId,explicit:true}));else assert.equal((await x.readmission.recoverPending({operationId:p.operationId,explicit:true})).ok,false);
});
test('old A late response never changes normal B prepared save, authorization, receipt or backup',async t=>{
 const x=await consumerReadmissionFixture(t),p=await x.prepareNew();ok(p);const b=await x.f.otherAccount('B');t.after(()=>b.owner.dispose());const bp=await b.owner.prepare(await b.request(),b.credentials);ok(bp);const before=x.s.db.raw.prepare("SELECT * FROM sync_account_devices WHERE account_id='B'").get(),pins=await x.backup.inventory();x.s.db.raw.exec("UPDATE sync_account_devices SET revoked_at=100001 WHERE account_id='A'");assert.equal((await x.readmission.commit(p)).ok,false);assert.deepEqual(x.s.db.raw.prepare("SELECT * FROM sync_account_devices WHERE account_id='B'").get(),before);ok(await b.owner.commit(bp));assert.equal(x.s.db.raw.prepare("SELECT COUNT(*) n FROM sync_changes WHERE user_id='user-B'").get().n,1);assert.equal(x.s.db.raw.prepare("SELECT COUNT(*) n FROM sync_changes WHERE user_id='user-A'").get().n,0);for(const row of pins)assert.deepEqual((await x.backup.inventory()).find(v=>v.id===row.id),row);
});
test('explicit local recovery preserves known commit facts if final local acknowledgement crashes',async t=>{
 let phase='before-operation-local';const x=await consumerReadmissionFixture(t,{checkpoint:n=>{if(n===phase)throw Error('crash');}}),p=await x.prepareNew();ok(p);assert.equal((await x.readmission.commit(p)).ok,false);phase='after-explicit-consumer-local';const r=await x.readmission.recoverPending({operationId:p.operationId,explicit:true});assert.equal(r.ok,false);assert.equal(r.backendCommitted,true);assert.equal(r.localCommitted,true);ok(await x.readmission.recover({operationId:p.operationId}));
});
test('async reconcile rejection after explicit local apply retains proven backend/local success',async t=>{
 let crash=true,block=false;const x=await consumerReadmissionFixture(t,{checkpoint:n=>{if(crash&&n==='before-operation-local')throw Error('crash');if(n==='after-explicit-consumer-local')block=true;},dispatch:(req,routes)=>block&&new URL(req.url).pathname.endsWith('/operation/reconcile')?Promise.reject(Error('ack-lost')):routes.handle(req)}),p=await x.prepareNew();ok(p);assert.equal((await x.readmission.commit(p)).ok,false);crash=false;const r=await x.readmission.recoverPending({operationId:p.operationId,explicit:true});assert.equal(r.ok,false);assert.equal(r.backendCommitted,true);assert.equal(r.localCommitted,true);assert.equal(r.receipt.operationId,p.operationId);block=false;ok(await x.readmission.recover({operationId:p.operationId}));
});
import {createIsolatedAccountSaveTransaction} from '../../../workers/sound-cruise-sync/src/account-save-transaction.js';
test('new envelope is denied without explicit readmission flag; ordinary writer remains fenced',async t=>{
 const x=await consumerReadmissionFixture(t),p=await x.prepareNew();ok(p);const e=(await packet(x,p)).envelope,credentials={...x.s.credentials,accountAuthorization:'Bearer '+(await x.record()).accountCredential},owner=createIsolatedAccountSaveTransaction({...x.readmissionRouteOptions,requireLifecycleBinding:true,enableConsumerReadmission:false});t.after(()=>owner.dispose());const before=x.f.state();assert.equal((await owner.issueOperationLease(e,credentials)).ok,false);assert.equal((await owner.prepareLeased(e,p.lease,credentials)).ok,false);assert.equal(x.f.state(),before);
 const base=(await x.headNew()).snapshot,handle=x.store.prepare({base,operationId:crypto.randomUUID(),action:'saveBpm',changes:{'cruisePort.metronome':JSON.stringify({...JSON.parse(base.values['cruisePort.metronome']),bpm:185})}});assert.equal((await x.store.commit(handle)).ok,false);
});
for(const phase of ['below-stop','below-issued'])test('SQL rejects fence rollback '+phase+' without reviving stopped lease',async t=>{
 const x=await consumerReadmissionFixture(t),p=await x.prepareNew();ok(p);const e=(await packet(x,p)).envelope,next=structuredClone(e);next.request.operation.operationId=crypto.randomUUID();x.s.db.raw.prepare('UPDATE sync_account_devices SET operation_fence_revision=?').run(phase==='below-stop'?e.readmission.stopFenceRevision-1:p.lease.fencingRevision-1);const before=x.f.state();assert.notEqual((await send(x,'lease',next)).status,200);assert.notEqual((await send(x,'save',e,p.lease)).status,200);assert.equal(x.f.state(),before);
});
for(const action of ['revoke-A','switch-B'])test('actual delayed A SQL response cannot contaminate B committed result: '+action,async t=>{
 let release,ready;const held=new Promise(r=>release=r),arrived=new Promise(r=>ready=r);t.after(()=>release());const x=await consumerReadmissionFixture(t,{dispatch:async(req,routes)=>{const r=await routes.handle(req);if(new URL(req.url).pathname.endsWith('/operation/save')){ready();await held;}return r;}}),p=await x.prepareNew();ok(p);const before=(await x.headNew()).snapshot.values,pins=await x.backup.inventory(),delayed=x.readmission.commit(p);await arrived;
 const b=await x.f.otherAccount('B');t.after(()=>b.owner.dispose());const bp=await b.owner.prepare(await b.request(),b.credentials);ok(bp);ok(await b.owner.commit(bp));const bDevice=x.s.db.raw.prepare("SELECT * FROM sync_account_devices WHERE account_id='B'").get(),bReceipt=x.s.db.raw.prepare("SELECT * FROM sync_changes WHERE user_id='user-B'").get();if(action==='revoke-A')x.s.db.raw.exec("UPDATE sync_account_devices SET revoked_at=100001 WHERE account_id='A'");else{const h=(await x.headNew()).snapshot,record={accountId:'B',accountDeviceId:bDevice.id,accountCredential:b.credentials.accountAuthorization.slice(7)},binding=portAccountMutationBinding({generation:x.generation,operationId:crypto.randomUUID(),identity:h.control.identity,expectedEpoch:h.control.epoch,expectedPointerEpoch:h.pointer.pointerEpoch,kind:'switch',destination:{accountId:'B',accountDeviceId:bDevice.id}},x.scope.name);ok(await x.mutationStore.mutate({context:await x.mutationStore.capture(),binding,nextAccount:record}));}release();const out=await delayed;assert.equal(out.ok,false);assert.equal(out.backendCommitted,true);assert.equal(out.localCommitted,null);assert.deepEqual((await x.headNew()).snapshot.values,before);assert.deepEqual(x.s.db.raw.prepare("SELECT * FROM sync_account_devices WHERE account_id='B'").get(),bDevice);assert.deepEqual(x.s.db.raw.prepare("SELECT * FROM sync_changes WHERE user_id='user-B'").get(),bReceipt);for(const row of pins)assert.deepEqual((await x.backup.inventory()).find(v=>v.id===row.id),row);
});

import {portAccountMutationBinding} from '../port-account-coordination.mjs';
