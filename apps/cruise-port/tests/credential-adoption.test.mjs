import test from 'node:test';import assert from 'node:assert/strict';
import {credentialAdoptionFixture} from './authority-store/credential-adoption-fixture.mjs';
import {portAccountMutationBinding} from '../port-account-coordination.mjs';
import {identity} from './authority-store/account-provider-fixture.mjs';
import {createIsolatedRecoveryBackupStore} from '../../shared/sync-account/app-backup-recovery.mjs';
const adopt=(x,c,operationId=crypto.randomUUID())=>x.owner.adopt({candidate:c,operationId,explicit:true});
async function switchB(x){const b=await x.s.addAccount('B');const binding=portAccountMutationBinding({generation:'g1',operationId:'foreign-account-B',identity:identity('A'),expectedEpoch:1,expectedPointerEpoch:1,kind:'switch',destination:{accountId:'B',accountDeviceId:b.accountDeviceId}},x.scope.name);assert((await x.mutationStore.mutate({context:await x.mutationStore.capture(),binding,nextAccount:b})).ok);return b;}
test('candidate read and validation do not mutate Account/Authority or expose plaintext; explicit operation required',async t=>{
 const x=await credentialAdoptionFixture(t),rows=await x.rows(),head=await x.head(),c=await x.inspect();assert(c.ok,c.reason);assert(!JSON.stringify(c).includes(x.renewed.credential));assert.deepEqual(await x.rows(),rows);assert.deepEqual(await x.head(),head);
 assert.equal((await x.owner.adopt({candidate:c,operationId:crypto.randomUUID()})).ok,false);assert.deepEqual(await x.rows(),rows);assert.deepEqual(await x.head(),head);
});
test('normal same-Account explicit adoption uses existing CAS/receipt and stop, preserves fields; new credential authenticates backend save',async t=>{
 const x=await credentialAdoptionFixture(t),before=await x.record(),c=await x.inspect();assert(c.ok,c.reason);const op=crypto.randomUUID(),r=await adopt(x,c,op);assert(r.ok,JSON.stringify(r));
 assert.equal(r.status,'adopted-stopped');assert.equal(r.canWrite,false);assert.equal(r.operationAuthorized,false);const after=await x.record();assert.deepEqual(after,{...before,accountCredential:x.renewed.credential});
 const proof=await x.owner.reconcile({operationId:op});assert(proof.ok,JSON.stringify(proof));assert.deepEqual(proof.receipt,r.receipt);assert((await x.head()).snapshot.control.identityInvalidated);
 assert.equal((await adopt(x,c,op)).ok,false);assert.deepEqual(await x.record(),after);
 const pin=await createIsolatedRecoveryBackupStore({indexedDB:x.indexedDB,scopeName:x.scope.name}).read('adopt-'+op);assert(pin);assert(!JSON.stringify(pin).includes(after.accountCredential));assert(await x.vault.read(x.h.operationId));
 x.s.adopt({body:{credential:after.accountCredential}});assert.equal((await x.s.send('save',await x.s.saveRequest({bpm:155,revision:0}))).status,200);
 assert.equal((await x.prepare()).ok,false); // local old Authority generation remains STOPPED
});
for(const change of ['B','ABA','credential-update','revoked','source-generation'])test(change+' after candidate validation rejects without overwriting Account',async t=>{
 const x=await credentialAdoptionFixture(t),c=await x.inspect();assert(c.ok,c.reason);
 if(change==='B')await switchB(x);
 else if(change==='ABA'){await x.mutationStore.auxiliary({context:await x.mutationStore.capture(),key:'pendingStart',value:{x:1},write:true});await x.mutationStore.auxiliary({context:await x.mutationStore.capture(),key:'pendingStart',remove:true,write:true});}
 else if(change==='credential-update')x.s.db.raw.exec('UPDATE sync_account_devices SET credential_version=credential_version+1');
 else if(change==='revoked')x.s.db.raw.exec('UPDATE sync_account_devices SET revoked_at=100001');
 else x.s.db.raw.exec('UPDATE sync_account_runtime_control SET generation=generation+1');
 const rows=await x.rows(),r=await adopt(x,c);assert.equal(r.ok,false);assert.deepEqual(await x.rows(),rows);assert(await x.vault.read(x.h.operationId));
});
test('pending stop intent blocks candidate and adoption, never resumes Authority',async t=>{
 const x=await credentialAdoptionFixture(t),a=await x.inspect(),b=await x.inspect();assert(a.ok&&b.ok);assert((await adopt(x,a)).ok);const rows=await x.rows();assert.equal((await adopt(x,b)).ok,false);assert.equal((await x.inspect()).ok,false);assert.deepEqual(await x.rows(),rows);
});
for(const phase of ['before-adoption-stop','before-adoption-cas','after-adoption-cas','after-adoption-confirmed'])test('crash at '+phase+' preserves backup and read-only exact reconciliation on reopen',async t=>{
 const x=await credentialAdoptionFixture(t,{checkpoint:p=>{if(p===phase)throw Error('crash');}}),before=await x.record(),c=await x.inspect(),op=crypto.randomUUID();assert(c.ok,c.reason);assert.equal((await adopt(x,c,op)).ok,false);
 const owner=await x.make({checkpoint:async()=>{}}),r=await owner.reconcile({operationId:op}),after=await x.record();
 if(phase==='after-adoption-confirmed'){assert(r.ok,JSON.stringify(r));assert.equal(r.status,'adopted-stopped');}
 else if(phase==='after-adoption-cas'){assert(!r.ok);assert.equal(r.status,'committed-barrier-unconfirmed');assert(r.accountMutationProven);}
 else{assert(!r.ok);assert.deepEqual(after,before);}
 if(phase.startsWith('after-'))assert.equal(after.accountCredential,x.renewed.credential);assert(await x.vault.read(x.h.operationId));
});
for(const mode of ['cas','B-during-stop'])test(mode+' final boundary refuses stale publication and preserves B/other mutation',async t=>{
 let x; x=await credentialAdoptionFixture(t,{checkpoint:async p=>{if(p==='before-adoption-cas'){if(mode==='cas')await x.mutationStore.auxiliary({context:await x.mutationStore.capture(),key:'pendingStart',value:{other:true},write:true});else await switchB(x);}}});
 const c=await x.inspect(),r=await adopt(x,c);assert(!r.ok);assert.equal((await x.record()).accountId,mode==='cas'?'A':'B');assert((await x.head()).snapshot.control.identityInvalidated);
});
for(const mode of ['missing','key-lost','manifest','receipt'])test(mode+' recovery evidence blocks adoption without mutation',async t=>{
 let broken=false;const x=await credentialAdoptionFixture(t,{vaultOverride:v=>({...v,async read(id){const r=await v.read(id);if(!broken)return r;if(mode==='missing')return null;if(mode==='key-lost')throw Error('keylost');if(mode==='manifest')return {...r,packet:{...r.packet,sourceDigest:'a'.repeat(64)}};return r;}}),dispatch:async(req,s)=>{const response=await s.routes.handle(req);if(broken&&mode==='receipt'){const b=await response.json();b.receipt.operationId=crypto.randomUUID();return Response.json(b);}return response;}}),c=await x.inspect();assert(c.ok,c.reason);const rows=await x.rows();broken=true;assert.equal((await adopt(x,c)).ok,false);assert.deepEqual(await x.rows(),rows);
});
test('same operation ID with different candidate digest cannot overwrite immutable adoption pin or Account',async t=>{
 let crash=true;const x=await credentialAdoptionFixture(t,{checkpoint:p=>{if(crash&&p==='before-adoption-stop')throw Error('crash');}}),c=await x.inspect(),op=crypto.randomUUID();assert(c.ok);assert(!(await adopt(x,c,op)).ok);const rows=await x.rows(),owner=await x.make({checkpoint:async()=>{}}),d=await owner.inspect({renewalOperationId:x.h.operationId,generation:'g1'});assert(d.ok);crash=false;
 // Reusing the exact immutable request is safe only as a read-only reconciliation;
 // an explicit second attempt never publishes through a stopped/historical intent.
 const r=await owner.adopt({candidate:d,operationId:op,explicit:true});assert.equal(r.ok,false);assert.equal(r.reason,'adoption-reconcile-required');assert.deepEqual(await x.rows(),rows);assert.equal((await owner.adopt({candidate:d,operationId:op,explicit:true})).ok,false);
 const pin=await createIsolatedRecoveryBackupStore({indexedDB:x.indexedDB,scopeName:x.scope.name}).read('adopt-'+op);assert(pin);assert.equal(pin.packet.operationId,op);await assert.rejects(createIsolatedRecoveryBackupStore({indexedDB:x.indexedDB,scopeName:x.scope.name}).add('adopt-'+op,{...pin.packet,afterDigest:'a'.repeat(64)}));assert.deepEqual(await x.rows(),rows);
});
test('concurrent renderers: exactly one same-source adoption, no duplicate receipt',async t=>{
 const x=await credentialAdoptionFixture(t),other=await x.make(),a=await x.inspect(),b=await other.inspect({renewalOperationId:x.h.operationId,generation:'g1'});assert(a.ok&&b.ok);
 const out=await Promise.all([adopt(x,a),other.adopt({candidate:b,operationId:crypto.randomUUID(),explicit:true})]);assert.equal(out.filter(r=>r.ok).length,1);assert.equal((await x.record()).accountCredential,x.renewed.credential);
});
test('late A owner response after canonical switch cannot expose or adopt into normal B',async t=>{
 let hold=false,arrived,release;const entered=new Promise(r=>arrived=r),x=await credentialAdoptionFixture(t,{dispatch:async(req,s)=>{const r=await s.routes.handle(req);if(hold){arrived();await new Promise(r=>release=r);}return r;}}),c=await x.inspect();hold=true;const late=adopt(x,c);await entered;await switchB(x);const rows=await x.rows();release();assert.equal((await late).ok,false);assert.deepEqual(await x.rows(),rows);
});
test('revocation in cross-DB publication window is explicit committed-owner-unconfirmed; no rollback/resume',async t=>{
 let x;x=await credentialAdoptionFixture(t,{checkpoint:p=>{if(p==='after-adoption-cas')x.s.db.raw.exec('UPDATE sync_account_devices SET revoked_at=100001');}});const c=await x.inspect(),r=await adopt(x,c);assert(!r.ok);assert.equal(r.status,'committed-owner-unconfirmed');assert.equal((await x.record()).accountCredential,x.renewed.credential);assert((await x.head()).snapshot.control.identityInvalidated);assert(await x.vault.read(x.h.operationId));
});
for(const mode of ['account-generation','member-generation','lease','expiry'])test(mode+' owner change after inspection rejects, Account and ledger unchanged',async t=>{
 const x=await credentialAdoptionFixture(t),c=await x.inspect();assert(c.ok,c.reason);const before=await x.rows();
 if(mode==='account-generation')x.s.db.raw.exec('UPDATE sync_accounts SET generation=generation+1');
 else if(mode==='member-generation')x.s.db.raw.exec('UPDATE sync_account_memberships SET generation=generation+1');
 else if(mode==='lease')x.s.db.raw.exec('UPDATE sync_account_devices SET credential_lease_revision=credential_lease_revision+1');
 else x.s.clock.server=x.s.row().credential_expires_at;
 assert.equal((await adopt(x,c)).ok,false);assert.deepEqual(await x.rows(),before);
});
for(const mode of ['timeout','throw','bad-body','bad-token'])test(mode+' owner response at adoption fails closed and never leaks supplied error/credential',async t=>{
 let bad=false;const secret='sca1.do-not-log-this-secret';const x=await credentialAdoptionFixture(t,{timeoutMs:10,dispatch:async(req,s)=>{if(bad){if(mode==='timeout')return new Promise(()=>{});if(mode==='throw')throw Object.assign(Error(secret),{code:secret});if(mode==='bad-body')return Response.json({ok:true,receipt:Promise.resolve({})});const out=await s.routes.handle(req),b=await out.json();b.credential=secret;return Response.json(b);}return s.routes.handle(req);}}),c=await x.inspect(),rows=await x.rows();assert(c.ok);bad=true;const r=await adopt(x,c);assert(!r.ok);assert(!JSON.stringify(r).includes(secret));assert.deepEqual(await x.rows(),rows);
});
test('pending durable stopped intent after pre-CAS crash prevents all new adoption attempts',async t=>{
 const x=await credentialAdoptionFixture(t,{checkpoint:p=>{if(p==='before-adoption-cas')throw Error('crash');}}),c=await x.inspect(),rows=await x.rows();assert(c.ok);assert(!(await adopt(x,c)).ok);const other=await x.make();assert(!(await other.inspect({renewalOperationId:x.h.operationId,generation:'g1'})).ok);assert.deepEqual(await x.rows(),rows);assert((await x.head()).snapshot.control.identityInvalidated);
});
test('old A rejection preserves normal backend B operation and local B receipt',async t=>{
 const x=await credentialAdoptionFixture(t),c=await x.inspect(),b=await x.s.otherAccount('B');t.after(()=>b.owner.dispose());
 const q=await b.request({bpm:152}),recordB={accountId:'B',accountDeviceId:q.accountDeviceId,accountCredential:b.credentials.accountAuthorization.slice(7)};
 const realBinding=portAccountMutationBinding({generation:'g1',operationId:'normal-B',identity:identity('A'),expectedEpoch:1,expectedPointerEpoch:1,kind:'switch',destination:{accountId:'B',accountDeviceId:q.accountDeviceId}},x.scope.name);
 const mutation=await x.mutationStore.mutate({context:await x.mutationStore.capture(),binding:realBinding,nextAccount:recordB});assert(mutation.ok);const before=await x.rows();
 const prepared=await b.owner.prepare(q,b.credentials);assert(prepared.ok,prepared.reason);assert(!(await adopt(x,c)).ok);const saved=await b.owner.commit(prepared);assert(saved.ok,saved.reason);assert.deepEqual(await x.rows(),before);assert((await x.mutationStore.reconcile(realBinding)).currentObservation);
});
test('old A candidate cannot stop current B Authority or consume B prepared operation',async t=>{
 const {control,values}=await import('./authority-store/fixture.mjs'),{bpmHandle}=await import('./authority-store/pointer-fixture.mjs');
 const x=await credentialAdoptionFixture(t),c=await x.inspect();assert(c.ok);await switchB(x);
 assert((await x.store.initialize({generation:'g2',control:{...control('g2'),identity:identity('B')},values:values(),operationId:'B-ready'})).ok);
 const before=await x.store.hydrate('g2'),prepared=bpmHandle(x.store,before.snapshot,'B-prepared'),rows=await x.rows();assert(!(await adopt(x,c)).ok);
 assert.deepEqual(await x.store.hydrate('g2'),before);assert.deepEqual(await x.rows(),rows);assert((await x.store.commit(prepared)).ok);
});
test('same Account identity with a new Authority generation rejects old candidate without invalidating current generation',async t=>{
 const {control,values}=await import('./authority-store/fixture.mjs');const x=await credentialAdoptionFixture(t),c=await x.inspect();assert(c.ok);
 assert((await x.store.initialize({generation:'g2',control:{...control('g2'),identity:identity('A')},values:values(),operationId:'same-A-new-generation'})).ok);
 const before=await x.store.hydrate('g2'),rows=await x.rows();assert(!(await adopt(x,c)).ok);assert.deepEqual(await x.store.hydrate('g2'),before);assert.deepEqual(await x.rows(),rows);
});
test('forged candidate/digest and protected server targets reject without changing Account',async t=>{
 const x=await credentialAdoptionFixture(t),c=await x.inspect(),before=await x.rows();assert(c.ok);const op=crypto.randomUUID();
 assert(!(await x.owner.adopt({candidate:{...c,credential:x.renewed.credential},operationId:op,explicit:true})).ok);
 assert(!(await x.owner.adopt({candidate:c,operationId:op,explicit:true,requestDigest:'a'.repeat(64)})).ok);assert.deepEqual(await x.rows(),before);
 await assert.rejects(x.make({url:'http://127.0.0.1:8765/__isolated/account/v1/'}));await assert.rejects(x.make({url:'http://127.0.0.1:8766/__isolated/account/v1/'}));
});
for(const mode of ['stopped-owner-throw','CAS-throw'])test(mode+' never reflects secret-bearing dependency error codes',async t=>{
 const sensitive='sca1.synthetic-secret-marker';let stopped=false;
 const x=await credentialAdoptionFixture(t,{checkpoint:p=>{if(p==='before-adoption-stop')stopped=true;},dispatch:async(req,s)=>{if(stopped&&mode==='stopped-owner-throw')throw Object.assign(Error(sensitive),{code:sensitive});return s.routes.handle(req);}});
 const owner=mode==='CAS-throw'?await x.make({source:{...x.mutationStore,mutate(){throw Object.assign(Error(sensitive),{code:sensitive});}}}):x.owner;
 const c=await owner.inspect({renewalOperationId:x.h.operationId,generation:'g1'}),before=await x.rows();assert(c.ok);
 const r=await owner.adopt({candidate:c,operationId:crypto.randomUUID(),explicit:true});assert.equal(r.ok,false);assert.equal(r.stopped,true);assert.equal(r.reason,'adoption-outcome-unproven');assert(!JSON.stringify(r).includes(sensitive));assert.deepEqual(await x.rows(),before);assert((await x.head()).snapshot.control.identityInvalidated);
});
