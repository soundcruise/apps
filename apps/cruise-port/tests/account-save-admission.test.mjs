import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from './authority-store/pointer-fixture.mjs';
import {setupSaveAdmission} from './authority-store/save-admission-fixture.mjs';
import {createIsolatedAccountSaveAdmissionOwner,evaluateSaveCredential} from '../../../workers/sound-cruise-sync/src/account-save-admission.js';
import {seedSaveAdmissionOwner} from '../../../workers/sound-cruise-sync/test/account-save-admission-fixture.js';
import {setupProvider,identity} from './authority-store/account-provider-fixture.mjs';
import {createTestAuthorityScope} from './authority-store/test-authority.mjs';
import {control,values} from './authority-store/fixture.mjs';
import {portAccountMutationBinding} from '../port-account-coordination.mjs';
import {createIsolatedPortSaveAdmission} from '../port-account-save-admission.mjs';
import {createIsolatedMetronomeBpmOwner} from '../port-metronome-bpm-isolated.mjs';
import {handleIsolatedAccountOwnerContext} from '../../../workers/sound-cruise-sync/src/account-owner-context.js';
const scripts=await Promise.all(['sync-account-db.js','sync-account-client.js'].map(f=>readFile(new URL('../../shared/sync-account/'+f,import.meta.url),'utf8')));
function classic(indexedDB){const g={indexedDB,structuredClone,setTimeout,clearTimeout,Headers,AbortController,fetch:()=>{throw Error('forbidden-network');}};for(const s of scripts)vm.runInNewContext(s,g);return g.SoundCruiseSyncAccount;}
async function setup(t,opts={}){const indexedDB=new IDBFactory(),root=classic(indexedDB),x=await setupSaveAdmission({indexedDB,root,...opts});t.after(()=>x.dispose());return {...x,indexedDB,root};}
const head=x=>x.store.hydrate('g1');
async function prepared(x,bpm=147,id='save1'){const v=await x.owner.load();assert(v.ok,v.reason);const p=await x.owner.prepare(v,bpm,{operationId:id});assert(p.ok,p.reason);return p;}
const request=x=>({contractVersion:1,purpose:'port-dataset-save',operationId:'one',action:'saveBpm',partitionId:'p',datasetGeneration:'g1',targetKey:'cruisePort.metronome',accountId:'A',accountDeviceId:x.account.accountDeviceId,accountGeneration:7,membershipId:'member-A',membershipGeneration:11,credentialVersion:3,sourceDigest:'a'.repeat(64),baseRevision:'rev1',changesDigest:'b'.repeat(64)});

test('real Account HMAC owner -> isolated BPM -> exact dataset receipt/reload; no Account mutation',async t=>{
 const x=await setup(t),before=await x.rows(),h=await head(x);assert((await x.controller.reload()).ok);assert(x.controller.edit(147));
 const r=await x.controller.save({operationId:'saved'});assert(r.ok,r.reason);assert.equal(r.historical,true);assert.equal(r.operationAuthorized,false);assert.equal(r.canWrite,false);
 assert.deepEqual(await x.rows(),before);assert((await x.controller.recover()).saved);assert((await x.controller.reload()).ok);assert.equal(x.controller.snapshot().bpm,147);
 const n=await head(x);assert.equal(n.snapshot.head.seq,h.snapshot.head.seq+1);
});
test('credential lifecycle explicitly distinguishes every unresolved state',async t=>{
 const s=await seedSaveAdmissionOwner();t.after(()=>s.db.raw.close());const q=request(s),row=s.row();
 assert.equal(evaluateSaveCredential(row,q,s.clock.server),'valid');
 for(const state of ['expired','revoked','renewing','renewal-failed','unknown'])assert.equal(evaluateSaveCredential({...row,credential_lifecycle:state},q,s.clock.server),state);
 assert.equal(evaluateSaveCredential(row,{...q,accountId:'B'},s.clock.server),'old-account');
 assert.equal(evaluateSaveCredential(row,{...q,membershipGeneration:12},s.clock.server),'generation-mismatch');
 assert.equal(evaluateSaveCredential({...row,credential_expires_at:null},q,s.clock.server),'unknown');
 assert.equal(evaluateSaveCredential(row,q,row.credential_expires_at),'expired');
});
for(const [name,change] of [
 ['expiry',x=>{x.clock.server=x.server.row().credential_expires_at;}],
 ['revocation',x=>x.server.db.raw.prepare('UPDATE sync_account_devices SET revoked_at=1 WHERE id=?').run(x.server.account.accountDeviceId)],
 ['membership generation',x=>x.server.db.raw.exec('UPDATE sync_account_memberships SET generation=generation+1')],
 ['credential rotation',x=>x.server.db.raw.exec('UPDATE sync_account_devices SET credential_version=credential_version+1')],
 ['renewing',x=>x.server.lease({credential_lifecycle:'renewing'})],
 ['renewal failure',x=>x.server.lease({credential_lifecycle:'renewal-failed'})],
 ['unknown expiry',x=>x.server.lease({credential_expires_at:null})]
])test('final admission rejects '+name+' after prepare without changing dataset',async t=>{
 const x=await setup(t),p=await prepared(x),before=await head(x);change(x);const r=await x.owner.commit(p);assert.equal(r.ok,false);assert.deepEqual(await head(x),before);
});
test('a successful provider observation cannot bypass owner save permission denial',async t=>{
 const x=await setup(t);x.server.db.raw.exec('UPDATE sync_account_runtime_control SET account_save_enabled=0');
 const view=await x.owner.load();assert(view.ok,view.reason);assert.equal(x.provider.getCachedStatus().credentialFreshness,'owner-confirmed-at-read');
 const before=await head(x),r=await x.owner.prepare(view,154,{operationId:'read-is-not-write'});assert.equal(r.reason,'save-admission-permission-denied');assert.deepEqual(await head(x),before);
});
test('expiry inside actual Authority transaction guard rejects (not only preflight)',async t=>{
 let expire=false;const x=await setup(t,{backendHook:b=>{const f=b.readAtCommit;b.readAtCommit=q=>{if(expire)x.clock.server=x.server.row().credential_expires_at;return f(q);};}});
 const p=await prepared(x),before=await head(x);expire=true;assert.equal((await x.owner.commit(p)).ok,false);assert.deepEqual(await head(x),before);
});
test('expiry denial persists in owner DB through owner reopen and clock rollback',async t=>{
 const s=await seedSaveAdmissionOwner();t.after(()=>s.db.raw.close());const q=request(s),authorization='Bearer '+s.account.accountCredential;
 s.clock.server=s.row().credential_expires_at;await assert.rejects(s.owner.prepare(q,{authorization}),/expired/);
 assert.equal(s.row().credential_lifecycle,'expired');s.owner.dispose();s.clock.server=100000;
 await assert.rejects(s.createOwner().prepare(q,{authorization}),/unknown|expired/);
});
test('same operation ID different content is rejected by owner and Authority reservation',async t=>{
 const x=await setup(t),v=await x.owner.load();assert((await x.owner.prepare(v,150,{operationId:'same'})).ok);
 const r=await x.owner.prepare(v,151,{operationId:'same'});assert.equal(r.ok,false);assert.match(r.reason,/operation-conflict/);
});
test('CAS conflict keeps newer BPM; duplicate commit and ack-loss recovery never add a second save',async t=>{
 const x=await setup(t),old=await prepared(x,150,'old'),fresh=await prepared(x,151,'new');assert((await x.owner.commit(fresh)).ok);
 assert.equal((await x.owner.commit(old)).ok,false);const before=await head(x);assert((await x.owner.commit(fresh)).ok);assert.deepEqual(await head(x),before);
 const reopened=await x.reopen();t.after(()=>reopened.dispose());const r=await reopened.owner.recover(fresh.recoveryTicket);assert(r.ok);assert.equal(r.historical,true);assert.equal(r.operationAuthorized,false);
});
test('commit ack loss is recovered by exact receipt, without auto-replay',async t=>{
 let lost=true;const x=await setup(t,{checkpoint:phase=>{if(phase==='after-commit'&&lost){lost=false;throw Error('ack-lost');}}});
 const p=await prepared(x);assert.equal((await x.owner.commit(p)).ok,false);const before=await head(x),r=await x.owner.recover(p.recoveryTicket);assert(r.ok);assert.equal(r.historical,true);assert.deepEqual(await head(x),before);
});
test('receipt missing or different identity cannot prove success',async t=>{
 const x=await setup(t),p=await prepared(x);assert((await x.owner.commit(p)).ok);const bad=structuredClone(p.recoveryTicket);bad.body.authorizationIdentity.accountDigest='f'.repeat(64);assert.equal((await x.owner.recover(bad)).ok,false);
 const db=await new Promise(r=>{const q=x.indexedDB.open(x.scope.name);q.onsuccess=()=>r(q.result);});
 await new Promise((r,j)=>{const tx=db.transaction('oplog','readwrite');tx.objectStore('oplog').delete(['g1','save1']);tx.oncomplete=r;tx.onabort=j;});db.close();assert.equal((await x.owner.recover(p.recoveryTicket)).ok,false);
});
test('backend nonresponse is bounded and cannot publish a save',async t=>{
 const x=await setup(t,{timeoutMs:10,ownerWrapper:o=>({...o,prepare:()=>new Promise(()=>{})})}),v=await x.owner.load(),before=await head(x);
 const r=await x.owner.prepare(v,150,{operationId:'timeout'});assert.equal(r.reason,'save-admission-timeout');assert.deepEqual(await head(x),before);
});
for(const [name,wrapper] of [
 ['exception',o=>({...o,prepare:()=>{throw Error('backend-down');}})],
 ['malformed',o=>({...o,prepare:async()=>({ok:true,context:{},binding:{}})})],
 ['Promise guard',o=>({...o,guard:()=>Promise.resolve(true)})],
 ['throwing guard',o=>({...o,guard:()=>{throw Error('broken');}})]
])test('abnormal admission '+name+' refuses without publication',async t=>{
 const x=await setup(t,{ownerWrapper:wrapper}),v=await x.owner.load(),before=await head(x),p=await x.owner.prepare(v,149,{operationId:'bad'});
 const r=p.ok?await x.owner.commit(p):p;assert.equal(r.ok,false);assert.deepEqual(await head(x),before);
});
test('an asynchronous owner commit probe is never accepted as server truth',async t=>{
 const s=await seedSaveAdmissionOwner();t.after(()=>s.db.raw.close());s.backend.readAtCommit=async()=>s.row();
 await assert.rejects(s.createOwner().prepare(request(s),{authorization:'Bearer '+s.account.accountCredential}),/async-boundary/);
});
test('normal product routers do not install admission, and no implicit backend fallback exists',async()=>{
 for(const file of ['../../../workers/sound-cruise-sync/src/app.js','../../../workers/sound-cruise-sync/src/account-app.js','../../cruise-studio/js/app.js'])
  assert.doesNotMatch(await readFile(new URL(file,import.meta.url),'utf8'),/account-save-admission|port-account-save-admission/);
 assert.throws(()=>createIsolatedAccountSaveAdmissionOwner({}),/boundary-required/);
});
test('late A authorization after switch cannot change B receipt/prepared save; normal B still commits',async t=>{
 let release,entered,delay=false;const arrived=new Promise(r=>entered=r);
 const x=await setup(t,{backendHook:b=>{const f=b.readPrimary;b.readPrimary=async q=>{if(delay&&q.accountId==='A'){entered();await new Promise(r=>release=r);}return f(q);};}});
 const v=await x.owner.load();assert(v.ok);delay=true;const late=x.owner.prepare(v,150,{operationId:'late-A'});await arrived;
 const accountB=await x.server.addAccount('B'),binding=portAccountMutationBinding({generation:'g1',operationId:'switch-B',identity:identity('A'),expectedEpoch:1,expectedPointerEpoch:1,kind:'switch',destination:{accountId:'B',accountDeviceId:accountB.accountDeviceId}},x.scope.name);
 assert((await x.mutationStore.mutate({context:await x.mutationStore.capture(),binding,nextAccount:accountB})).ok);
 assert((await x.store.initialize({generation:'g2',control:{...control('g2'),identity:identity('B')},values:values(),operationId:'init-B'})).ok);
 const opts={indexedDB:x.indexedDB,name:x.scope.name,partitionId:'fixture-partition',now:()=>x.clock.wall,monotonicNow:()=>x.clock.mono,clockIdentity:()=>x.clock.origin};
 const b=await setupProvider({indexedDB:x.indexedDB,root:x.root,scopeName:x.scope.name,seed:false,ownerContext:true,clockOptions:opts});t.after(()=>b.dispose());
 b.respond((url,options)=>handleIsolatedAccountOwnerContext(new Request(url,{headers:options.headers}),{db:x.server.db,pepper:x.server.pepper,now:()=>x.clock.server}));
 const scope=createTestAuthorityScope(opts),admission=createIsolatedPortSaveAdmission({scope,mutationStore:b.mutationStore,owner:x.server.owner});
 const owner=await createIsolatedMetronomeBpmOwner({scope,indexedDB:x.indexedDB,generation:'g2',provider:b.provider,finalAdmission:admission});t.after(()=>{owner.dispose();admission.dispose();});
 const bv=await owner.load();assert(bv.ok,bv.reason);const bp=await owner.prepare(bv,159,{operationId:'normal-B'});assert(bp.ok,bp.reason);
 const before=await x.store.hydrate('g2'),rows=await x.rows();x.server.db.raw.prepare('UPDATE sync_account_devices SET revoked_at=1 WHERE id=?').run(x.server.account.accountDeviceId);
 release();assert.equal((await late).ok,false);assert.deepEqual(await x.rows(),rows);assert.deepEqual(await x.store.hydrate('g2'),before);
 assert((await b.mutationStore.reconcile(binding)).mutationProven);const saved=await owner.commit(bp);assert(saved.ok,saved.reason);assert.equal(saved.bpm,159);assert.deepEqual(await x.rows(),rows);
});
