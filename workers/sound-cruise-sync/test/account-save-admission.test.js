import test from 'node:test';
import assert from 'node:assert/strict';
import {seedSaveAdmissionOwner} from './account-save-admission-fixture.js';
import {createAccountCredential,accountCredentialVerifier} from '../src/account-crypto.js';
const request=s=>({contractVersion:1,purpose:'port-dataset-save',operationId:'one',action:'saveBpm',partitionId:'partition',datasetGeneration:'g1',targetKey:'cruisePort.metronome',accountId:'A',accountDeviceId:s.account.accountDeviceId,accountGeneration:7,membershipId:'member-A',membershipGeneration:11,credentialVersion:3,sourceDigest:'a'.repeat(64),baseRevision:'revision',changesDigest:'b'.repeat(64)});
const identity={ownership:'bound-account',appId:'port',datasetOwner:'port',partitionId:'partition',accountId:'A',accountGeneration:7,membershipId:'member-A',membershipGeneration:11};
const details=(q,a)=>({operationId:q.operationId,action:q.action,generation:q.datasetGeneration,head:{revision:q.baseRevision},changesDigest:q.changesDigest,targetKeys:[q.targetKey],control:{identity},authorizationIdentity:{accountDigest:q.sourceDigest,credentialVersion:q.credentialVersion,identity:{...identity},admission:a.binding}});
async function setup(t){const s=await seedSaveAdmissionOwner();t.after(()=>{s.owner.dispose();s.db.raw.close();});return s;}
async function prepare(s,q=request(s)){return s.owner.prepare(q,{authorization:'Bearer '+s.account.accountCredential});}
test('official HMAC, owner primary state and exact request are necessary; contexts cannot be cloned',async t=>{
 const s=await setup(t),q=request(s),a=await prepare(s,q),d=details(q,a);assert(await s.owner.assertCurrent(a.context));assert(s.owner.guard(a.context,d));assert.equal(s.owner.guard({...a.context},d),false);
 await assert.rejects(s.owner.prepare(q,{authorization:'Bearer synthetic-A'}),/credential-invalid/);
 assert.equal(a.binding.credentialExpiresAt,160000);assert.equal(a.binding.credentialLeaseRevision,1);
});
for(const [name,mutate] of [
 ['operation ID',d=>d.operationId='other'],['action',d=>d.action='pushCloud'],['dataset',d=>d.generation='g2'],
 ['CAS',d=>d.head.revision='other'],['payload',d=>d.changesDigest='c'.repeat(64)],['target',d=>d.targetKeys=['cruisePort.gearList']],
 ['Account',d=>d.control.identity.accountId='B'],['Account generation',d=>d.control.identity.accountGeneration++],
 ['membership',d=>d.control.identity.membershipGeneration++],['partition',d=>d.control.identity.partitionId='other'],
 ['receipt Account digest',d=>d.authorizationIdentity.accountDigest='c'.repeat(64)],
 ['receipt identity',d=>d.authorizationIdentity.identity.accountId='B'],
 ['receipt credential version',d=>d.authorizationIdentity.credentialVersion++],
 ['admission binding',d=>d.authorizationIdentity.admission.requestDigest='c'.repeat(64)]
])test('final guard rejects changed '+name,async t=>{
 const s=await setup(t),q=request(s),a=await prepare(s,q),d=structuredClone(details(q,a));mutate(d);assert.equal(s.owner.guard(a.context,d),false);
 assert.equal(s.owner.guard(a.context,details(q,a)),false,'failed capability cannot revive');
});
test('observation timeout cannot substitute for missing credential expiry',async t=>{
 const s=await setup(t);s.lease({credential_expires_at:null});await assert.rejects(prepare(s),/unknown/);
});
test('owner read gate never substitutes for a separate save permission',async t=>{
 const s=await setup(t);s.db.raw.exec('UPDATE sync_account_runtime_control SET account_save_enabled=0,account_read_enabled=1');
 await assert.rejects(prepare(s),/permission-denied/);
});
test('renewing/failed/expired credential never renews itself; owner-issued rotation is separate',async t=>{
 const s=await setup(t),old=await prepare(s);s.lease({credential_lifecycle:'renewing',credential_lease_revision:2});assert.equal(await s.owner.assertCurrent(old.context),false);
 s.lease({credential_lifecycle:'renewal-failed'});await assert.rejects(prepare(s),/renewal-failed/);
 const material=createAccountCredential({randomUUID:()=>s.account.accountDeviceId,getRandomValues:crypto.getRandomValues.bind(crypto)});
 s.db.raw.prepare(`UPDATE sync_account_devices SET credential_version=4,credential_verifier=?,credential_lifecycle='active',
  credential_issued_at=?,credential_expires_at=?,credential_lease_revision=3 WHERE id=?`).run(await accountCredentialVerifier(material.credential,s.pepper),s.clock.server,s.clock.server+90000,s.account.accountDeviceId);
 const q={...request(s),credentialVersion:4,operationId:'renewed'},a=await s.owner.prepare(q,{authorization:'Bearer '+material.credential});
 assert(s.owner.guard(a.context,details(q,a)));assert.equal(await s.owner.assertCurrent(old.context),false);
});
test('unknown request fields, accessors, wrong target and operation collision fail closed',async t=>{
 const s=await setup(t),q=request(s);await prepare(s,q);
 for(const bad of [{...q,extra:true},{...q,targetKey:'cruisePort.gearList'},{...q,operationId:'../bad'}])await assert.rejects(prepare(s,bad),/request-invalid/);
 const getter={...q};Object.defineProperty(getter,'action',{get(){throw Error('must not invoke');},enumerable:true});await assert.rejects(prepare(s,getter),/request-invalid/);
 await assert.rejects(prepare(s,{...q,changesDigest:'c'.repeat(64)}),/operation-conflict/);
});
test('a delayed primary snapshot cannot bypass a newer owner generation at final probe',async t=>{
 const s=await setup(t),read=s.backend.readPrimary;let release,arrived;const entered=new Promise(r=>arrived=r);
 s.backend.readPrimary=async q=>{const row=await read(q);arrived();await new Promise(r=>release=r);return row;};
 const pending=prepare(s);await entered;s.db.raw.exec('UPDATE sync_account_memberships SET generation=12');release();await assert.rejects(pending,/generation-mismatch/);
});
