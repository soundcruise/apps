import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleProAuthorizedRequest as request } from './pro-entitlement-fixture.js';
import { handleRequest } from '../src/app.js';
import { hmacVerifier } from '../src/crypto.js';
import { hashRecord } from '../src/records.js';
import { sha256Hex } from '../src/asset-validation.js';
import { parseWriterFields, createWriterWireContext } from '../../../apps/shared/sync-account/writer-authority.mjs';
import { admitWriter, writerMutationDatabase, WRITER_ADMISSION_MODE } from '../src/writer-admission.js';
import { seed, environment, deps, jsonRequest, bucket, webp, assetId, operationId, credential, ORIGIN } from './writer-authority-fixture.js';

const fields = createWriterWireContext({ expectedWriteEpoch: 1 }).fields;
const push = operations => ({ appId: 'port', mode: 'sync', operations });
async function operation(baseRevision = 0, deleted = false) {
  const value = { operationId: crypto.randomUUID(), recordType: 'metronome_settings', recordId: 'default',
    schemaVersion: 1, baseRevision, deleted,
    payload: deleted ? null : { id: 'default', value: { version: 3, bpm: 120, meter: '4/4', rhythm: 'quarter',
      sound: 'electronic', volume: 70, accents: [true, false, false, false] } } };
  value.payloadHash = await hashRecord(value, crypto, 'port');
  return value;
}

for (const [name, input, expected] of [
  ['legacy', {}, null], ['supported', fields, null], ['writer 1', { writerProtocol: 1 }, null],
  ['optional epoch', { writerProtocol: 2, syncProtocol: 1 }, null],
  ['future writer', { writerProtocol: 3 }, 'writer_protocol_unsupported'],
  ['future sync', { syncProtocol: 2 }, 'sync_protocol_unsupported'],
  ['string writer', { writerProtocol: '2' }, 'writer_protocol_invalid'],
  ['null writer', { writerProtocol: null }, 'writer_protocol_invalid'],
  ['fraction sync', { syncProtocol: 1.5 }, 'sync_protocol_invalid'],
  ['zero epoch', { expectedWriteEpoch: 0 }, 'dataset_epoch_invalid'],
  ['string epoch', { expectedWriteEpoch: '1' }, 'dataset_epoch_invalid'],
  ['unsafe epoch', { expectedWriteEpoch: Number.MAX_SAFE_INTEGER + 1 }, 'dataset_epoch_invalid']
]) test(`authority fields: ${name}`, () => {
  const result = parseWriterFields(input);
  assert.equal(result.ok, !expected);
  if (expected) assert.equal(result.code, expected);
});

for (const wire of [{}, fields]) test(`push/CAS/dedupe/tombstone remain intact (${Object.keys(wire).length ? 'new' : 'legacy'})`, async t => {
  const db = seed(); t.after(() => db.close()); const env = environment(db, bucket());
  const op = await operation();
  const send = async op => (await (await request(jsonRequest('/v1/sync/push', { ...push([op]), ...wire }), env, null, deps())).json());
  assert.equal((await send(op)).results[0].status, 'applied');
  assert.equal((await send(op)).results[0].status, 'duplicate');
  assert.equal((await send(await operation())).results[0].status, 'conflict');
  assert.equal((await send(await operation(1, true))).results[0].status, 'applied');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM sync_changes').get().n, 2);
  assert.notEqual(db.raw.prepare('SELECT deleted_at FROM sync_records').get().deleted_at, null);
});

test('B1-1 is hardcoded ACCEPT_COMPAT: metadata never activates enforcement, epoch is not refreshed', async t => {
  const db = seed(); t.after(() => db.close());
  db.raw.exec("UPDATE sync_account_memberships SET minimum_writer_protocol=9, write_epoch=7, authority_state='enforced'");
  assert.equal(WRITER_ADMISSION_MODE, 'ACCEPT_COMPAT');
  for (const wire of [{}, fields]) {
    const response = await request(jsonRequest('/v1/sync/push', { ...push([await operation()]), ...wire }), environment(db, bucket()), null, deps());
    assert.equal(response.status, 200);
  }
  assert.equal(db.raw.prepare('SELECT write_epoch FROM sync_account_memberships').get().write_epoch, 7);
});

test('protocol does not replace authentication, membership or Pro', async t => {
  const db = seed(); t.after(() => db.close()); const env = environment(db, bucket());
  const body = { ...push([await operation()]), ...fields };
  assert.equal((await request(jsonRequest('/v1/sync/push', body), env, null, deps(false))).status, 401);
  assert.equal((await handleRequest(jsonRequest('/v1/sync/push', body), { ...env, PRO_CREDENTIAL_PEPPER: 'p'.repeat(64) }, null, deps())).status, 403);
  db.raw.prepare('UPDATE sync_devices SET credential_verifier=?').run(await hmacVerifier(credential, env.SYNC_CREDENTIAL_PEPPER));
  db.raw.exec("UPDATE sync_account_memberships SET state='deleted'");
  const actualAuth = deps(); delete actualAuth.authenticateDevice;
  assert.equal((await request(jsonRequest('/v1/sync/push', body), env, null, actualAuth)).status, 410);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM sync_records').get().n, 0);
});

test('new Port wire cannot claim an absent membership', async t => {
  const db = seed(); t.after(() => db.close()); db.raw.exec('DELETE FROM sync_account_managed_users');
  const response = await request(jsonRequest('/v1/sync/push', { ...push([await operation()]), ...fields }),
    { ...environment(db, bucket()), SYNC_ALLOWED_APP_IDS: 'port' }, null, deps());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'account_membership_required');
});

for (const wire of [{}, fields]) test(`bootstrap/complete/removal/read compatibility (${Object.keys(wire).length ? 'new' : 'legacy'})`, async t => {
  const db = seed(); t.after(() => db.close()); const env = environment(db, bucket());
  db.raw.exec('DELETE FROM sync_datasets');
  const summary = { appId: 'port', schemaVersion: 1, recordCount: 0, manifestHash: '0'.repeat(64) };
  assert.equal((await request(jsonRequest('/v1/sync/bootstrap', { ...summary, ...wire }), env, null, deps())).status, 201);
  const get = path => request(new Request(`https://sync.example/v1/sync/${path}?appId=port`, {
    headers: { Origin: ORIGIN, Authorization: `Bearer ${credential}`, 'X-Sound-Cruise-Writer-Protocol': '999' }
  }), env, null, deps());
  const snapshot = await (await get('snapshot')).json();
  assert.equal((await request(jsonRequest('/v1/sync/migration/complete', { ...summary, manifestHash: snapshot.manifestHash, ...wire }), env, null, deps())).status, 200);
  assert.equal((await get('changes')).status, 200);
});

for (const wire of [{}, fields]) test(`assets prepare/upload/commit/unreference plus fixed operation metadata (${Object.keys(wire).length ? 'new' : 'legacy'})`, async t => {
  const db = seed(); t.after(() => db.close()); const r2 = bucket(), env = environment(db, r2);
  const bytes = webp(512, 512), hash = await sha256Hex(bytes);
  const common = { appId: 'port', assetId, operationId, hash, ...wire };
  const prepare = () => request(jsonRequest('/v1/sync/assets/prepare', { ...common,
    kind: 'gear_photo_final', mime: 'image/webp', byteSize: bytes.length, width: 512, height: 512 }), env, null, deps());
  assert.equal((await prepare()).status, 201);
  const stored = db.raw.prepare('SELECT writer_protocol,sync_protocol,expected_write_epoch,admitted_write_epoch FROM sync_asset_operations').get();
  assert.equal(stored.writer_protocol, wire.writerProtocol || null);
  assert.equal(stored.expected_write_epoch, wire.expectedWriteEpoch || null);
  assert.equal(stored.admitted_write_epoch, 1);
  const headers = Object.keys(wire).length ? createWriterWireContext({ expectedWriteEpoch: 1 }).headers() : {};
  const response = await request(new Request(`https://sync.example/v1/sync/assets/${assetId}/content`, { method: 'PUT',
    headers: { Origin: ORIGIN, Authorization: `Bearer ${credential}`, 'Content-Type': 'image/webp',
      'X-Sound-Cruise-Operation-Id': operationId, 'X-Content-SHA256': hash, ...headers }, body: bytes }), env, null, deps());
  assert.equal(response.status, 200);
  assert.equal((await request(jsonRequest('/v1/sync/assets/commit', common), env, null, deps())).status, 200);
  assert.equal((await prepare()).status, 200);
  assert.deepEqual(db.raw.prepare('SELECT writer_protocol,sync_protocol,expected_write_epoch,admitted_write_epoch FROM sync_asset_operations').get(), stored);
  assert.equal((await request(new Request(`https://sync.example/v1/sync/assets/${assetId}`, {
    headers: { Origin: ORIGIN, Authorization: `Bearer ${credential}` } }), env, null, deps())).status, 200);
  assert.equal((await request(jsonRequest('/v1/sync/assets/unreference', { appId: 'port', assetIds: [assetId], ...wire }), env, null, deps())).status, 200);
});

test('all mutation routes reject future protocols before mutation (including upload headers)', async t => {
  const db = seed(); t.after(() => db.close()); const r2 = bucket(), env = environment(db, r2);
  const summary = { appId: 'port', schemaVersion: 1, recordCount: 0, manifestHash: '0'.repeat(64) };
  const asset = { appId: 'port', assetId, operationId, hash: '0'.repeat(64), kind: 'gear_photo_final',
    mime: 'image/webp', byteSize: 30, width: 512, height: 512 };
  for (const [path, body] of [['push', push([await operation()])], ['bootstrap', summary], ['migration/complete', summary],
    ['assets/prepare', asset], ['assets/commit', asset], ['assets/unreference', { appId: 'port', assetIds: [assetId] }],
    ['removal-safety', { appId: 'port', state: 'clean' }]]) {
    const response = await request(jsonRequest(`/v1/sync/${path}`, { ...body, writerProtocol: 999 }), env, null, deps());
    assert.equal(response.status, 409, path); assert.equal((await response.json()).code, 'writer_protocol_unsupported', path);
  }
  const response = await request(new Request(`https://sync.example/v1/sync/assets/${assetId}/content`, {
    method: 'PUT', headers: { Origin: ORIGIN, Authorization: `Bearer ${credential}`, 'X-Sound-Cruise-Writer-Protocol': '999' }, body: 'x'
  }), env, null, deps());
  assert.equal(response.status, 409); assert.equal(r2.objects.size, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM sync_records').get().n, 0);
});

test('mutation observation and record batch roll back together on SQL failure', async t => {
  const db = seed(); t.after(() => db.close());
  const admission = await admitWriter(db, { userId: 'port-user-a', deviceId: credential.split('.')[1], appId: 'port' }, fields,
    { accountId: 'account-a', membershipId: 'port-membership-a' });
  const guarded = writerMutationDatabase(db, admission);
  await assert.rejects(guarded.batch([
    guarded.prepare('UPDATE sync_datasets SET record_count=9'),
    guarded.prepare('UPDATE sync_datasets SET record_count=-1')
  ]));
  assert.equal(db.raw.prepare('SELECT record_count FROM sync_datasets').get().record_count, 0);
});

test('additive migration preserves existing rows; new defaults and ledger reapplication are safe', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const dir = new URL('../migrations/', import.meta.url);
    for (const name of fs.readdirSync(dir).filter(name => name.endsWith('.sql') && name < '0034').sort()) db.exec(fs.readFileSync(new URL(name, dir), 'utf8'));
    db.exec("INSERT INTO sync_accounts(id,state,recovery_version,created_at,updated_at) VALUES ('a','provisioning',0,1,1)");
    db.exec("INSERT INTO sync_account_memberships(id,account_id,app_id,created_at,updated_at) VALUES ('m','a','port',1,1)");
    db.exec("INSERT INTO sync_users(id,state,recovery_version,created_at,updated_at) VALUES ('u','provisioning',0,1,1)");
    db.exec("INSERT INTO sync_datasets(user_id,app_id,state,schema_version,record_count,updated_at) VALUES ('u','port','ready',1,1,1)");
    db.exec("INSERT INTO sync_records(user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,last_operation_id) VALUES ('u','port','settings','global','{}','hash',1,1,'op')");
    const before = ['sync_records', 'sync_datasets', 'sync_account_memberships'].map(table => db.prepare(`SELECT * FROM ${table}`).all());
    const sql = fs.readFileSync(new URL('0034_add_writer_authority.sql', dir), 'utf8');
    assert.doesNotMatch(sql, /\b(?:DROP|DELETE|REPLACE|UPDATE)\s/i);
    db.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT UNIQUE)');
    const apply = () => {
      if (db.prepare('SELECT 1 FROM d1_migrations WHERE name=?').get('0034_add_writer_authority.sql')) return false;
      db.exec('BEGIN'); try { db.exec(sql); db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run('0034_add_writer_authority.sql'); db.exec('COMMIT'); }
      catch (e) { db.exec('ROLLBACK'); throw e; } return true;
    };
    assert.equal(apply(), true); assert.equal(apply(), false);
    for (const [i, table] of ['sync_records', 'sync_datasets'].entries()) assert.deepEqual(db.prepare(`SELECT * FROM ${table}`).all(), before[i]);
    const row = db.prepare('SELECT * FROM sync_account_memberships').get();
    for (const [key,value] of Object.entries(before[2][0])) assert.equal(row[key],value);
    db.exec("INSERT INTO sync_account_memberships(id,account_id,app_id,created_at,updated_at) VALUES ('m2','a','pitch',1,1)");
    for (const row of db.prepare('SELECT minimum_writer_protocol,write_epoch,authority_state,authority_updated_at FROM sync_account_memberships').all())
      assert.deepEqual({ ...row }, { minimum_writer_protocol: 0, write_epoch: 1, authority_state: 'legacy', authority_updated_at: 0 });
  } finally { db.close(); }
});

for (const wire of [{}, fields]) test('removal-safety admission preserves the existing non-Port reporting contract', async t => {
  const db = seed(); t.after(() => db.close());
  for (const table of ['sync_devices','sync_account_memberships','sync_account_managed_users','sync_datasets'])
    db.raw.exec(`UPDATE ${table} SET app_id='pitch'`);
  const d = deps(); d.authenticateDevice = async () => ({ userId:'port-user-a', deviceId:credential.split('.')[1], appId:'pitch' });
  const env = {...environment(db,bucket()), SYNC_ALLOWED_APP_IDS:'pitch', SYNC_ACCOUNT_PUBLIC_APP_IDS:'pitch'};
  const response = await request(jsonRequest('/v1/sync/removal-safety',{appId:'pitch',state:'clean',...wire}),env,null,d);
  assert.equal(response.status,200);
  assert.equal(db.raw.prepare('SELECT state FROM sync_app_device_sync_safety').get().state,'clean');
});
