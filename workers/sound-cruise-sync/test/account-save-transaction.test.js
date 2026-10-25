import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {backendFixture} from './account-save-transaction-fixture.js';
import {hashRecord} from '../src/records.js';
async function setup(t,options){const s=await backendFixture(options);t.after(()=>s.dispose());return s;}
async function prepare(s,opts){const q=await s.request(opts),p=await s.owner.prepare(q,s.credentials);assert(p.ok,p.reason);return {q,p};}
test('backend Account and existing Pro/writer fence commit record/CAS/request-bound receipt atomically',async t=>{
 const s=await setup(t),{q,p}=await prepare(s);const r=await s.owner.commit(p);assert(r.ok,r.reason);assert.equal(r.backendCommitted,true);assert.equal(r.operationAuthorized,false);assert.equal(r.canWrite,false);
 assert.equal(r.receipt.requestDigest,p.binding.requestDigest);assert.equal(r.receipt.revision,1);
 const recovered=await s.owner.reconcile(p.binding,s.credentials);assert(recovered.ok,recovered.reason);assert.equal(recovered.historical,true);
 const next=await prepare(s,{revision:1,bpm:155});assert((await s.owner.commit(next.p)).ok);
 assert.equal(s.db.raw.prepare('SELECT count(*) n FROM sync_changes').get().n,2);
 assert.equal((await s.owner.commit(p)).reason,'backend-replay-requires-recovery');
});
for(const [name,sql] of [
 ['Account credential revoke',"UPDATE sync_account_devices SET revoked_at=1"],
 ['Account generation',"UPDATE sync_accounts SET generation=generation+1"],
 ['membership generation',"UPDATE sync_account_memberships SET generation=generation+1"],
 ['credential version',"UPDATE sync_account_devices SET credential_version=credential_version+1"],
 ['credential verifier',"UPDATE sync_account_devices SET credential_verifier='"+'e'.repeat(64)+"'"],
 ['lease revision',"UPDATE sync_account_devices SET credential_lease_revision=credential_lease_revision+1"],
 ['save permission',"UPDATE sync_account_runtime_control SET account_save_enabled=0"],
 ['runtime generation',"UPDATE sync_account_runtime_control SET generation=generation+1"],
 ['membership revoked',"UPDATE sync_account_memberships SET state='deleted'"],
 ['app device revoked',"UPDATE sync_devices SET revoked_at=1"],
 ['Pro revoked',"UPDATE pro_credentials SET revoked_at=created_at+1"],
 ['Pro generation',"UPDATE pro_auth_state SET generation=generation+1"],
 ['Pro lease',"UPDATE pro_auth_state SET unbound_backend_until=0"],
 ['unknown expiry',"UPDATE sync_account_devices SET credential_expires_at=NULL"],
 ['clock rollback',"UPDATE sync_account_devices SET credential_clock_floor=9999999"]
])test('authorization followed by '+name+' before transaction cannot create data or receipt',async t=>{
 const s=await setup(t),{p}=await prepare(s),before=s.state();s.db.raw.exec(sql);assert.equal((await s.owner.commit(p)).ok,false);assert.equal(s.state(),before);
 assert.equal(s.db.raw.prepare('SELECT count(*) n FROM sync_writer_fence_assertion').get().n,0);
});
test('expiry at final assertion rolls back data/receipt, then durable denial survives clock rollback/reopen',async t=>{
 const s=await setup(t),{q,p}=await prepare(s),before=s.state(),batch=s.db.batch.bind(s.db);let once=true;
 s.db.batch=async statements=>{if(once&&statements.some(x=>x.sql.includes('INSERT INTO sync_records'))){once=false;
  const last=statements.findLast(x=>x.sql.includes('INSERT INTO sync_writer_fence_assertion')&&x.sql.includes('isolated_request_digest'));
  const at=statements.indexOf(last);const original=last.run.bind(last);last.run=async()=>{s.clock.server=160000;return original();};assert(at>0);
 }return batch(statements);};
 assert.equal((await s.owner.commit(p)).ok,false);assert.equal(s.state(),before);assert.equal(s.row().credential_lifecycle,'expired');
 s.clock.server=100000;const reopened=s.service();t.after(()=>reopened.dispose());assert.equal((await reopened.prepare(q,s.credentials)).ok,false);
});
test('same operation ID differing digest and two simultaneous requests commit at most once',async t=>{
 const s=await setup(t),{q,p}=await prepare(s),changed=structuredClone(q);changed.operation.payload.value.bpm=151;changed.operation.payloadHash=await hashRecord(changed.operation,crypto,'port');
 const b=await s.owner.prepare(changed,s.credentials);assert(b.ok);const both=await Promise.all([s.owner.commit(p),s.owner.commit(b)]);assert.equal(both.filter(x=>x.ok).length,1);assert.equal(s.db.raw.prepare('SELECT count(*) n FROM sync_changes').get().n,1);
 const winner=both[0].ok?p:b,loser=both[0].ok?b:p;assert((await s.owner.reconcile(winner.binding,s.credentials)).ok);assert.equal((await s.owner.reconcile(loser.binding,s.credentials)).ok,false);
});
test('CAS race cannot create a receipt for a rejected operation',async t=>{
 const s=await setup(t),a=await prepare(s),b=await prepare(s,{bpm:152});assert((await s.owner.commit(a.p)).ok);const after=s.state();assert.equal((await s.owner.commit(b.p)).ok,false);assert.equal(s.state(),after);
});
test('lost ack after commit is unknown until owner readback, never unconditional replay',async t=>{
 let drop=true;const s=await setup(t,{checkpoint:phase=>{if(phase==='after-transaction'&&drop){drop=false;throw Error('ack-lost');}}}),{p}=await prepare(s);
 assert.equal((await s.owner.commit(p)).ok,false);assert.equal((await s.owner.commit(p)).reason,'backend-replay-requires-recovery');const state=s.state();assert((await s.owner.reconcile(p.binding,s.credentials)).ok);assert.equal(s.state(),state);
 const reopened=s.service();t.after(()=>reopened.dispose());assert((await reopened.reconcile(p.binding,s.credentials)).ok);
});
test('receipt missing, tampered, or foreign binding cannot imply success',async t=>{
 const s=await setup(t),{p}=await prepare(s);assert((await s.owner.commit(p)).ok);const bad=structuredClone(p.binding);bad.request.accountId='B';assert.equal((await s.owner.reconcile(bad,s.credentials)).ok,false);
 s.db.raw.exec("UPDATE sync_changes SET isolated_request_digest='"+'e'.repeat(64)+"'");assert.equal((await s.owner.reconcile(p.binding,s.credentials)).ok,false);
 s.db.raw.exec('DELETE FROM sync_changes');assert.equal((await s.owner.reconcile(p.binding,s.credentials)).ok,false);
});
test('transaction partial failure aborts record, receipt and dataset changes together',async t=>{
 const s=await setup(t),{p}=await prepare(s),before=s.state(),batch=s.db.batch.bind(s.db);
 s.db.batch=statements=>batch([...statements,s.db.prepare('UPDATE sync_datasets SET record_count=-1')]);assert.equal((await s.owner.commit(p)).ok,false);assert.equal(s.state(),before);
});
test('owner read gate never substitutes save permission; missing credentials/Pro remain denied',async t=>{
 const s=await setup(t),q=await s.request();assert.equal((await s.owner.prepare(q,{...s.credentials,proAuthorization:null})).ok,false);
 s.db.raw.exec('UPDATE sync_account_runtime_control SET account_save_enabled=0,account_read_enabled=1');assert.equal((await s.owner.prepare(q,s.credentials)).ok,false);
});
test('unrouted boundary cannot be selected by product JSON, env or boot',async()=>{
 for(const n of ['app.js','account-app.js'])assert.doesNotMatch(await readFile(new URL('../src/'+n,import.meta.url),'utf8'),/account-save-transaction/);
});
test('old A delayed transaction cannot alter normal B prepared operation/receipt; B continues saving',async t=>{
 let release,arrive;const entered=new Promise(r=>arrive=r),s=await setup(t,{checkpoint:async p=>{if(p==='before-transaction'){arrive();await new Promise(r=>release=r);}}}),a=await prepare(s),late=s.owner.commit(a.p);await entered;
 const b=await s.otherAccount('B');t.after(()=>b.owner.dispose());const q=await b.request(),bp=await b.owner.prepare(q,b.credentials);assert(bp.ok,bp.reason);
 s.db.raw.prepare('UPDATE sync_account_devices SET revoked_at=1 WHERE id=?').run(s.account.accountDeviceId);
 const saved=await b.owner.commit(bp);assert(saved.ok,saved.reason);const before=s.state();release();assert.equal((await late).ok,false);assert.equal(s.state(),before);assert((await b.owner.reconcile(bp.binding,b.credentials)).ok);
 const n=await b.owner.prepare(await b.request({revision:1,bpm:154}),b.credentials);assert(n.ok,n.reason);assert((await b.owner.commit(n)).ok);
});
test('BPM-only update refuses other backend settings changes',async t=>{
 const s=await setup(t),a=await prepare(s);assert((await s.owner.commit(a.p)).ok);const q=await s.request({revision:1});q.operation.payload.value.volume=10;q.operation.payloadHash=await hashRecord(q.operation,crypto,'port');const before=s.state();assert.equal((await s.owner.prepare(q,s.credentials)).reason,'backend-non-bpm-conflict');assert.equal(s.state(),before);
});
test('exact credential expiry boundary is enforced, no observation TTL or lease is substituted',async t=>{
 const s=await setup(t),a=await prepare(s);s.clock.server=159999;assert((await s.owner.commit(a.p)).ok);
 const q=await s.request({revision:1});s.clock.server=160000;assert.equal((await s.owner.prepare(q,s.credentials)).ok,false);assert.equal(s.row().credential_lifecycle,'expired');
});
test('credential verifier rotation during owner reread cannot authorize old HMAC at same version',async t=>{
 const s=await setup(t),base=s.db.prepare.bind(s.db);let once=true;s.db.prepare=sql=>{const st=base(sql),bind=st.bind;st.bind=(...v)=>{const b=bind.apply(st,v);if(once&&sql.includes('credential_clock_floor=MAX')){const run=b.run.bind(b);b.run=async()=>{const out=await run();once=false;s.db.raw.exec("UPDATE sync_account_devices SET credential_verifier='"+'f'.repeat(64)+"'");return out;};}return b;};return st;};
 assert.equal((await s.owner.prepare(await s.request(),s.credentials)).reason,'backend-account-credential-invalid');assert.equal(s.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,0);
});
