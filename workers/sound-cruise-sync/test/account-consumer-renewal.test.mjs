import test from 'node:test';import assert from 'node:assert/strict';
import {consumerReadmissionFixture} from '../../../apps/cruise-port/tests/authority-store/consumer-readmission-fixture.mjs';
import {digest} from '../../../apps/cruise-port/port-idb-authority-contract.mjs';
const ok=r=>assert.equal(r.status,200,JSON.stringify({status:r.status,code:r.body?.code}));
const send=async(x,path,e,l,auth=x.s.credentials)=>x.s.send('operation/'+path,{envelope:e,envelopeDigest:digest(e),...(l?{lease:l}:{})},{owner:x.readmissionRoutes,auth});
for(const scenario of ['normal-renewal','ACK-recovery','revoke-before-finish','revoke-after-finish','pointer-race'])test('actual owner renewal and readonly consumer: '+scenario,async t=>{
 const x=await consumerReadmissionFixture(t),p=await x.prepareNew();assert(p.ok);const pin=(await x.backup.read('op-'+p.operationId)).packet,e=pin.envelope,local=(await x.headNew()).snapshot,pins=await x.backup.inventory();x.s.credentials.accountAuthorization='Bearer '+(await x.record()).accountCredential;
 const ticket=await x.s.prepare();assert.notEqual((await send(x,'save',e,p.lease)).status,200); // renewing is not active
 if(scenario==='revoke-before-finish')x.s.db.raw.exec("UPDATE sync_account_devices SET revoked_at=100001 WHERE account_id='A'");
 let finish;
 if(scenario==='ACK-recovery'){const original=x.s.db.batch.bind(x.s.db);let lost=true;x.s.db.batch=async statements=>{const out=await original(statements);if(lost&&x.s.row().credential_version>e.request.credentialVersion){lost=false;throw Error('ack');}return out;};finish=await x.s.finish(ticket);assert.notEqual(finish.status,200);x.s.db.batch=original;finish=await x.s.recover(ticket);}
 else finish=await x.s.finish(ticket);
 if(scenario==='revoke-before-finish'){assert.notEqual(finish.status,200);assert.equal((await x.readmission.commit(p)).ok,false);return;}
 ok(finish);x.s.adopt(finish);
 if(scenario==='revoke-after-finish')x.s.db.raw.exec("UPDATE sync_account_devices SET revoked_at=100001 WHERE account_id='A'");
 if(scenario==='pointer-race')x.s.db.raw.exec('UPDATE sync_account_pointer_fences SET revision=revision+2');
 assert.notEqual((await send(x,'save',e,p.lease)).status,200); // new bearer cannot revive old lease
 const next=structuredClone(e);next.request.operation.operationId=crypto.randomUUID();next.request.credentialVersion=x.s.row().credential_version;next.request.credentialLeaseRevision=x.s.row().credential_lease_revision;
 const lease=await send(x,'lease',next);if(['revoke-after-finish','pointer-race'].includes(scenario))assert.notEqual(lease.status,200);else{ok(lease);assert(lease.body.lease.fencingRevision>p.lease.fencingRevision);ok(await send(x,'save',next,lease.body.lease));}
 // Backend renewal is NOT adoption into the old local consumer/Authority.
 assert.equal((await x.readmission.commit(p)).ok,false);assert.deepEqual((await x.headNew()).snapshot,local);for(const row of pins)assert.deepEqual((await x.backup.inventory()).find(v=>v.id===row.id),row);
});
import {ownerCutoverFixture} from '../../../apps/cruise-port/tests/authority-store/owner-cutover-fixture.mjs';
for(const order of ['renew-before-stop','stop-before-renew'])test('actual renewal racing actual owner pointer cutover: '+order,async t=>{
 const x=await ownerCutoverFixture(t),p=await x.prepareBound();assert(p.ok);x.s.credentials.accountAuthorization='Bearer '+(await x.record()).accountCredential;const before=(await x.store.readPointer()).pointer;let ticket,b;
 if(order==='renew-before-stop'){ticket=await x.s.prepare();b=await x.beginCutover();assert.equal(b.ok,false);}
 else{b=await x.beginCutover();assert(b.ok);ticket=await x.s.prepare();}
 ok(await x.s.finish(ticket));assert.equal((await x.cutoverOperation.commit(p)).ok,false);
 if(b.ok)assert.equal((await x.cutover.publish({transitionId:b.transitionId,explicit:true})).ok,false);
 assert.deepEqual((await x.store.readPointer()).pointer,before);assert.equal(x.s.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,0);assert((await x.opHead()).snapshot.control.fenceRevoked);
});
