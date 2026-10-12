import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, environment, deps, bucket, credential, ORIGIN, jsonRequest } from './writer-authority-fixture.js';
import { hashRecord } from '../src/records.js';
import { checkFence } from '../src/writer-fence.js';
import { createIsolatedWriterPolicy } from '../src/writer-fence.js';
import { createIsolatedCutoverController, readAuthorityEvidence } from '../src/authority-cutover.js';
import { handleProAuthorizedRequest as request } from './pro-entitlement-fixture.js';
const stale = error => error.code === 'dataset_authority_unavailable' && error.reason === 'migration_generation_stale';
function fixture(t) {
  const db=seed();t.after(()=>db.close());const policy=createIsolatedWriterPolicy('account-a');
  const ctl=createIsolatedCutoverController(db,policy);
  const input=phase=>({accountId:'account-a',migrationId:'generation-tests',generation:'g1',operationId:phase+'-op',phase});
  const transition=phase=>ctl.transition(input(phase));
  const facts=()=>({ledger:db.raw.prepare('SELECT * FROM sync_authority_cutovers').get(),membership:db.raw.prepare('SELECT * FROM sync_account_memberships').get()});
  const data=()=>JSON.stringify(['sync_records','sync_changes','sync_datasets','sync_assets','sync_asset_operations'].map(name=>db.raw.prepare('SELECT * FROM '+name).all()));
  const change=owner=>db.raw.exec(`UPDATE ${owner==='account'?'sync_accounts':'sync_account_memberships'} SET generation=generation+1`);
  return{db,ctl,policy,input,transition,facts,data,change};
}
async function paused(f){await f.transition('prepared');await f.transition('paused');}
async function noEvidence(f){await assert.rejects(readAuthorityEvidence(f.db,{accountId:'account-a',membershipId:'port-membership-a'}),e=>e.code==='dataset_authority_unavailable');}

async function operation() {
  const op = { operationId: crypto.randomUUID(), recordType: 'metronome_settings', recordId: 'default',
    schemaVersion: 1, baseRevision: 0, deleted: false,
    payload: { id: 'default', value: { version: 3, bpm: 120, meter: '4/4', rhythm: 'quarter',
      sound: 'electronic', volume: 70, accents: [true, false, false, false] } } };
  op.payloadHash = await hashRecord(op, crypto, 'port');
  return op;
}

for (const owner of ['account', 'membership']) for (const boundary of ['preflight', 'mutation-batch']) {
  test(`${owner}: ordinary record mutation rechecks generations at ${boundary}`, async t => {
    const f = fixture(t);
    await paused(f); await f.transition('enforced');
    const before = f.data(), env = environment(f.db, bucket()), batch = f.db.batch.bind(f.db);
    let changed = boundary === 'preflight';
    if (changed) f.change(owner);
    else f.db.batch = async statements => {
      if (!changed && statements.some(s => s.sql.includes('INSERT INTO sync_records'))) {
        changed = true; f.change(owner);
      }
      return batch(statements);
    };
    const response = await request(jsonRequest('/v1/sync/push', { appId: 'port', mode: 'sync',
      writerProtocol: 2, syncProtocol: 1, expectedWriteEpoch: 2, operations: [await operation()] }),
      env, null, { ...deps(), writerPolicy: f.policy });
    assert.equal((await response.json()).code, 'dataset_authority_unavailable');
    assert(changed); assert.equal(f.data(), before);
    assert.equal(f.facts().membership.write_epoch, 2);
  });
}

test('two current devices use one generation binding and one epoch', async t => {
  const f = fixture(t); await paused(f); await f.transition('enforced');
  f.db.raw.prepare(`INSERT INTO sync_devices(id,user_id,app_id,credential_version,credential_verifier,
    last_cursor,created_at,last_seen_at,paired_at) VALUES ('second-device','port-user-a','port',1,?,0,1,1,1)`)
    .run('b'.repeat(64));
  const env = environment(f.db, bucket()), send = async (dependencies, op) => request(
    jsonRequest('/v1/sync/push', { appId: 'port', mode: 'sync', writerProtocol: 2,
      syncProtocol: 1, expectedWriteEpoch: 2, operations: [op] }), env, null, dependencies);
  const first = await operation();
  assert.equal((await send({ ...deps(), writerPolicy: f.policy }, first)).status, 200);
  const second = await operation(); second.baseRevision = 1;
  assert.equal((await (await send({ ...deps(), writerPolicy: f.policy,
    authenticateDevice: async () => ({ userId: 'port-user-a', deviceId: 'second-device', appId: 'port' }) },
    second)).json()).results[0].status, 'applied');
  assert.equal(f.facts().membership.write_epoch, 2);
  assert.equal(f.facts().ledger.account_generation, 1);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n, 2);
});

test('Port generation guard does not consume other app admissions', async t => {
  const f = fixture(t); await paused(f); f.change('account');
  await checkFence({ prepare() { throw Error('Port-only SQL must not run'); } }, { identity: { appId: 'chord' } });
  assert.equal(f.facts().ledger.phase, 'paused');
});

test('server generations are fixed independently of client claims; normal retry never increments epoch twice',async t=>{const f=fixture(t);const prepared=await f.ctl.transition({...f.input('prepared'),accountGeneration:999,membershipGeneration:999});assert.equal(prepared.account_generation,1);assert.equal(prepared.membership_generation,1);assert.equal(prepared.membership_id,'port-membership-a');assert.equal(prepared.sync_user_id,'port-user-a');assert.deepEqual(await f.transition('prepared'),prepared);await f.transition('paused');const done=await f.transition('enforced');assert.deepEqual(await f.transition('enforced'),done);assert.equal(f.facts().membership.write_epoch,2);const proof=await readAuthorityEvidence(f.db,{accountId:'account-a',membershipId:'port-membership-a'});assert.equal(proof.fence.accountGeneration,1);assert.equal(proof.fence.membershipGeneration,1);assert.equal(proof.fence.membershipId,'port-membership-a');assert.equal(proof.fence.barrierId,'paused-op');assert.equal(proof.fence.generationBinding,true);});
for(const owner of ['account','membership']) {
  test(`${owner}: stale before paused preserves prepared and original epoch`,async t=>{const f=fixture(t);await f.transition('prepared');const data=f.data();f.change(owner);await assert.rejects(f.transition('paused'),stale);assert.equal(f.facts().ledger.phase,'prepared');assert.equal(f.facts().membership.write_epoch,1);assert.equal(f.data(),data);await noEvidence(f);});
  test(`${owner}: stale during initial prepare batch cannot silently bind latest generation`,async t=>{const f=fixture(t),batch=f.db.batch.bind(f.db);let changed=false;f.db.batch=async statements=>{if(!changed&&statements.some(s=>s.sql.includes('INSERT INTO sync_authority_cutovers'))){changed=true;f.change(owner);}return batch(statements);};await assert.rejects(f.transition('prepared'),stale);assert(changed);assert.equal(f.facts().ledger,undefined);assert.equal(f.facts().membership.write_epoch,1);assert.equal(f.facts().membership.authority_state,'legacy');});
  test(`${owner}: in-batch change between ledger and membership publication rolls back whole transaction`,async t=>{const f=fixture(t);await paused(f);const batch=f.db.batch.bind(f.db),data=f.data();let changed=false;f.db.batch=async statements=>{if(!changed&&statements.some(s=>s.sql.includes('UPDATE sync_authority_cutovers'))){changed=true;const index=statements.findIndex(s=>s.sql.includes('UPDATE sync_account_memberships SET authority_state'));return batch([...statements.slice(0,index),f.db.prepare(`UPDATE ${owner==='account'?'sync_accounts':'sync_account_memberships'} SET generation=generation+1`),...statements.slice(index)]);}return batch(statements);};await assert.rejects(f.transition('enforced'),stale);assert(changed);assert.equal(f.facts().ledger.phase,'paused');assert.equal(f.facts().membership.write_epoch,1);assert.equal(f.facts().membership.minimum_writer_protocol,0);assert.equal(f.data(),data);});
  test(`${owner}: response loss then generation change preserves past commit, rejects retry and fresh evidence`,async t=>{const f=fixture(t);await paused(f);const batch=f.db.batch.bind(f.db),before=f.data();let lost=false;f.db.batch=async statements=>{const result=await batch(statements);if(!lost&&statements.some(s=>s.sql.includes('UPDATE sync_authority_cutovers'))){lost=true;f.change(owner);throw Error('response lost after commit');}return result;};await assert.rejects(f.transition('enforced'),stale);assert(lost);assert.equal(f.facts().ledger.phase,'enforced');assert.equal(f.facts().membership.write_epoch,2);await assert.rejects(f.transition('enforced'),stale);const historical=await f.ctl.recover('account-a','generation-tests');assert.equal(historical.phase,'enforced');assert.equal(historical.authorizationFresh,false);assert.equal(historical.recoveryRequired,true);assert.equal(historical.account_generation,1);assert.equal(historical.membership_generation,1);assert.equal(historical.enforce_operation_id,'enforced-op');assert.equal(f.facts().membership.write_epoch,2);assert.equal(f.data(),before);await noEvidence(f);});
  test(`${owner}: same operation/migration retry after generation change is not a fresh success`,async t=>{const f=fixture(t);await paused(f);f.change(owner);for(const phase of ['prepared','paused','enforced'])await assert.rejects(f.transition(phase),stale);const history=await f.ctl.recover('account-a','generation-tests');assert.equal(history.phase,'paused');assert.equal(history.authorizationFresh,false);assert.equal(f.facts().membership.write_epoch,1);});
  test(`${owner}: revoke retains paused barrier and blocks authority proof`,async t=>{const f=fixture(t);await paused(f);f.db.raw.exec(`UPDATE ${owner==='account'?'sync_accounts':'sync_account_memberships'} SET state='deleted',generation=generation+1`);await assert.rejects(f.transition('enforced'),stale);assert.equal(f.facts().ledger.phase,'paused');assert.equal(f.facts().membership.write_epoch,1);await noEvidence(f);});
  test(`${owner}: generation change after enforced invalidates read evidence and mutation admission`,async t=>{const f=fixture(t);await paused(f);await f.transition('enforced');f.change(owner);await noEvidence(f);const response=await request(new Request('https://sync.example/v1/sync/writer-authority?appId=port',{headers:{Origin:ORIGIN,Authorization:`Bearer ${credential}`}}),environment(f.db,bucket()),null,deps());assert.equal(response.status,503);assert.equal((await response.json()).authority,undefined);assert.equal(f.facts().membership.write_epoch,2);});
}
test('membership replacement with new identity cannot inherit old ledger, even with generation reset',async t=>{const f=fixture(t);await paused(f);f.db.raw.exec("BEGIN; PRAGMA defer_foreign_keys=ON; UPDATE sync_account_memberships SET id='replacement'; UPDATE sync_account_managed_users SET membership_id='replacement'; COMMIT");await assert.rejects(f.transition('enforced'),stale);await assert.rejects(readAuthorityEvidence(f.db,{accountId:'account-a',membershipId:'replacement'}),stale);assert.equal(f.facts().ledger.membership_id,'port-membership-a');assert.equal(f.facts().membership.write_epoch,1);});
test('immutable ledger generations cannot be retagged or forged',async t=>{const f=fixture(t);await paused(f);for(const key of ['account_generation','membership_generation'])assert.throws(()=>f.db.raw.exec(`UPDATE sync_authority_cutovers SET ${key}=2`),/b15_migration_generation_stale/);await assert.rejects(f.ctl.transition({...f.input('enforced'),generation:'g2'}));assert.equal(f.facts().ledger.phase,'paused');});
test('foreign migration/operation/Account capabilities cannot consume existing cutover',async t=>{const f=fixture(t);await paused(f);for(const patch of [{migrationId:'other'},{operationId:'other-op',phase:'paused'},{accountId:'other'}])await assert.rejects(f.ctl.transition({...f.input('enforced'),...patch}));await assert.rejects(createIsolatedCutoverController(f.db,createIsolatedWriterPolicy('other')).recover('account-a','generation-tests'));assert.equal(f.facts().ledger.phase,'paused');});
test('response loss with unchanged generations recovers exact commit and evidence',async t=>{const f=fixture(t);await paused(f);const batch=f.db.batch.bind(f.db);let lost=false;f.db.batch=async statements=>{const result=await batch(statements);if(!lost&&statements.some(s=>s.sql.includes('UPDATE sync_authority_cutovers'))){lost=true;throw Error('response lost');}return result;};const result=await f.transition('enforced');assert.equal(result.target_epoch,2);assert.deepEqual(await f.transition('enforced'),result);assert.equal(f.facts().membership.write_epoch,2);assert.equal((await readAuthorityEvidence(f.db,{accountId:'account-a',membershipId:'port-membership-a'})).fence.epoch,2);});

test('Migration Engine propagates stale fence read into recovery-required without pointer/cloud publication',async t=>{const f=fixture(t);await paused(f);await f.transition('enforced');const {migrationFixture,prepared}=await import('../../../apps/cruise-port/tests/migration-fixture.mjs');const {issueIsolatedFence}=await import('../../../apps/cruise-port/port-authority-migration.mjs');const {PORT_AUTHORITY_POINTER}=await import('../../../apps/cruise-port/port-local-authority.mjs');const local=await migrationFixture({bound:true});const {e,c}=await prepared(local);const cloud=local.cloud(c);const proof=await readAuthorityEvidence(f.db,{accountId:'account-a',membershipId:'port-membership-a'});const ticket=issueIsolatedFence(local.scope,{...proof.fence,accountId:'A',generation:local.generation,checkpoint:cloud.checkpoint});await e.reconcile({cloud,fence:ticket});const saved=local.storage.getItem('cruisePort.metronome');f.change('account');local.state.checkpoint=async()=>readAuthorityEvidence(f.db,{accountId:'account-a',membershipId:'port-membership-a'});await assert.rejects(e.seal({fence:ticket}),stale);const journal=await e.inspect();assert.equal(journal.state,'recovery-required');assert.equal(journal.error,'dataset_authority_unavailable');assert.equal(journal.fenceEvidence.accountGeneration,1);assert.equal(local.storage.getItem(PORT_AUTHORITY_POINTER),null);assert.equal(local.storage.getItem('cruisePort.metronome'),saved);});
