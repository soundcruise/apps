import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/app.js';
import { encodeCursor, hashRecord, manifestHash } from '../src/records.js';
import { recordTypesForApp, validateRecordPayload } from '../src/record-schema-registry.js';
import {
  isRecordTypeAllowed, parseBodyCapabilities, parseQueryCapabilities
} from '../src/sync-capabilities.js';
import { createD1SyncRepository } from '../src/sync-database.js';
import { createSqliteD1, seedIdentity } from './sqlite-d1.js';

const ORIGIN = 'https://soundcruise.jp';
const USER_ID = '123e4567-e89b-42d3-a456-426614174001';
const DEVICE_NEW_A = '123e4567-e89b-42d3-a456-426614174000';
const DEVICE_NEW_B = '123e4567-e89b-42d3-a456-426614174002';
const DEVICE_OLD = '123e4567-e89b-42d3-a456-426614174003';
const CAPABILITY = 'practice_menu_sets_v1';
const OPEN_CONTROL = Object.freeze({
  rolloutMode: 'open', admissionEnabled: true, dataWriteEnabled: true,
  dataReadEnabled: true, recoveryEnabled: true, cloudDeleteEnabled: true,
  generation: 1, updatedAt: 1
});
const T = '2026-09-29T00:00:00.000Z';

function setValue(overrides = {}) {
  return { id: 'set-1', name: '音感練', itemIds: ['menu-a', 'menu-b'], createdAt: T, updatedAt: T, ...overrides };
}

function menuValue(id, name) {
  return { id, name, durationMinutes: 10, appId: null, memo: '', hidden: false, createdAt: T, updatedAt: T };
}

test('practice_menu_set is a formal Port record type with a strict reference-only schema', () => {
  assert.ok(recordTypesForApp('port').includes('practice_menu_set'));
  for (const appId of ['chord', 'pitch', 'rhythm', 'fretboard']) {
    assert.ok(!recordTypesForApp(appId).includes('practice_menu_set'), `${appId} is unaffected`);
  }
  const valid = (value, recordId = 'set-1') => validateRecordPayload('port', 'practice_menu_set', recordId, { id: recordId, value });
  assert.equal(valid(setValue()), true);
  assert.equal(valid(setValue({ itemIds: [] })), true, 'an effectively empty set survives menu deletion');
  assert.equal(valid(setValue({ name: 'x'.repeat(100) })), true);
  assert.equal(valid(setValue({ name: '' })), false);
  assert.equal(valid(setValue({ name: '   ' })), false);
  assert.equal(valid(setValue({ name: 'x'.repeat(101) })), false);
  assert.equal(valid(setValue({ name: 'a\u0007b' })), false);
  assert.equal(valid(setValue({ itemIds: ['menu-a', 'menu-a'] })), false, 'duplicate references are rejected');
  assert.equal(valid(setValue({ itemIds: ['../x'] })), false);
  assert.equal(valid(setValue({ itemIds: [1] })), false);
  assert.equal(valid(setValue({ itemIds: 'menu-a' })), false);
  assert.equal(valid(setValue({ itemIds: Array.from({ length: 2001 }, (_, i) => `m${i}`) })), false);
  assert.equal(valid(setValue({ createdAt: 'yesterday' })), false);
  assert.equal(valid(setValue({ updatedAt: undefined })), false);
  assert.equal(valid(setValue({ id: 'other' })), false, 'value id must equal the record id');
  assert.equal(valid(setValue({ items: [menuValue('menu-a', 'copy')] })), false, 'menus are never copied into sets');
  assert.equal(valid(setValue({ id: '-bad' }), '-bad'), false);
});

test('capability parsing is app-scoped, ignores unknown values, and fails closed on malformed input', () => {
  assert.deepEqual([...parseBodyCapabilities(undefined, 'port')], []);
  assert.deepEqual([...parseBodyCapabilities([CAPABILITY], 'port')], [CAPABILITY]);
  assert.deepEqual([...parseBodyCapabilities([CAPABILITY, 'future_feature_v9'], 'port')], [CAPABILITY],
    'an unknown capability is ignored without affecting known ones');
  assert.deepEqual([...parseBodyCapabilities([CAPABILITY], 'chord')], [], 'capabilities are scoped per app');
  for (const malformed of [CAPABILITY, null, {}, [1], [CAPABILITY, 7], ['Bad Value'],
    Array.from({ length: 17 }, () => CAPABILITY)]) {
    assert.deepEqual([...parseBodyCapabilities(malformed, 'port')], [], JSON.stringify(malformed));
  }
  const url = (query) => new URL(`https://sync.soundcruise.jp/v1/sync/snapshot?appId=port${query}`);
  assert.deepEqual([...parseQueryCapabilities(url(''), 'port')], []);
  assert.deepEqual([...parseQueryCapabilities(url(`&capabilities=${CAPABILITY}`), 'port')], [CAPABILITY]);
  assert.deepEqual([...parseQueryCapabilities(url(`&capabilities=x_v1,${CAPABILITY}`), 'port')], [CAPABILITY]);
  assert.deepEqual([...parseQueryCapabilities(url(`&capabilities=${CAPABILITY}&capabilities=${CAPABILITY}`), 'port')], []);
  assert.deepEqual([...parseQueryCapabilities(url('&capabilities=%00'), 'port')], []);
  assert.equal(isRecordTypeAllowed('port', 'practice_menu', new Set()), true, 'ungated types need nothing');
  assert.equal(isRecordTypeAllowed('port', 'practice_menu_set', new Set()), false);
  assert.equal(isRecordTypeAllowed('port', 'practice_menu_set', new Set([CAPABILITY])), true);
});

// A real SQLite-backed dataset shared by several devices of one user.
function harness() {
  const db = createSqliteD1();
  seedIdentity(db, { appId: 'port', deviceId: DEVICE_NEW_A });
  for (const [index, deviceId] of [DEVICE_NEW_B, DEVICE_OLD].entries()) {
    db.raw.prepare(`INSERT INTO sync_devices (id,user_id,app_id,credential_version,credential_verifier,label,
      last_cursor,created_at,last_seen_at,revoked_at) VALUES (?, ?, 'port', 1, ?, NULL, 0, 1, 1, NULL)`)
      .run(deviceId, USER_ID, String(index).repeat(64));
  }
  db.raw.prepare("UPDATE sync_datasets SET state = 'ready' WHERE user_id = ? AND app_id = 'port'").run(USER_ID);
  let clock = 1000;
  const env = {
    ALLOWED_ORIGINS: ORIGIN, SYNC_ALLOWED_APP_IDS: 'port,chord',
    SYNC_CREDENTIAL_PEPPER: 'p'.repeat(64), SYNC_DB: db,
    SYNC_RATE_LIMITER: { limit: async () => ({ success: true }) }
  };
  const dependencies = {
    readRuntimeControl: async () => OPEN_CONTROL,
    authenticateDevice: async (_db, authorization, appId) => ({
      userId: USER_ID, deviceId: authorization.slice('Bearer '.length), appId, userState: 'provisioning'
    }),
    createRepository: (session) => createD1SyncRepository(session, () => clock++)
  };
  let operationCounter = 1;
  const call = async (deviceId, path, { method = 'GET', body } = {}) => {
    const response = await handleRequest(new Request(`https://sync.soundcruise.jp${path}`, {
      method,
      headers: {
        Origin: ORIGIN, Authorization: `Bearer ${deviceId}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    }), env, null, dependencies);
    return { status: response.status, json: await response.json() };
  };
  const operation = async (recordType, recordId, value, baseRevision = 0) => {
    const op = {
      operationId: `123e4567-e89b-52d3-a456-${String(operationCounter++).padStart(12, '0')}`,
      recordType, recordId, schemaVersion: 1, baseRevision,
      payload: value === null ? null : { id: recordId, value }, payloadHash: '', deleted: value === null
    };
    op.payloadHash = await hashRecord({ ...op }, crypto, 'port');
    return op;
  };
  const client = (deviceId, capabilities) => ({
    push: (operations) => call(deviceId, '/v1/sync/push', {
      method: 'POST',
      body: { appId: 'port', mode: 'sync', operations, ...(capabilities !== undefined ? { capabilities } : {}) }
    }),
    snapshot: () => call(deviceId, `/v1/sync/snapshot?appId=port${capabilities !== undefined
      ? `&capabilities=${encodeURIComponent(Array.isArray(capabilities) ? capabilities.join(',') : String(capabilities))}` : ''}`),
    changes: (cursor) => call(deviceId, `/v1/sync/changes?appId=port&cursor=${cursor}${capabilities !== undefined
      ? `&capabilities=${encodeURIComponent(capabilities.join(','))}` : ''}`)
  });
  const raw = (recordType, recordId) => db.raw.prepare(`SELECT revision, deleted_at, payload_json FROM sync_records
    WHERE user_id = ? AND app_id = 'port' AND record_type = ? AND record_id = ?`).get(USER_ID, recordType, recordId);
  return { db, env, dependencies, call, operation, client, raw };
}

const keys = (snapshot) => snapshot.records.filter((record) => record.deletedAt == null)
  .map((record) => `${record.recordType}/${record.recordId}`).sort();

test('Case 1: an old client never receives, writes, or deletes sets while its menu sync keeps working', async () => {
  const h = harness();
  const newA = h.client(DEVICE_NEW_A, [CAPABILITY]);
  const oldB = h.client(DEVICE_OLD);
  let result = await newA.push([
    await h.operation('practice_menu', 'menu-a', menuValue('menu-a', 'メロディ音感')),
    await h.operation('practice_menu', 'menu-b', menuValue('menu-b', 'コード音感')),
    await h.operation('practice_menu_set', 'set-1', setValue())
  ]);
  assert.equal(result.status, 200);
  assert.deepEqual(result.json.results.map((item) => item.status), ['applied', 'applied', 'applied']);

  const oldSnapshot = (await oldB.snapshot()).json;
  assert.deepEqual(keys(oldSnapshot), ['practice_menu/menu-a', 'practice_menu/menu-b']);
  assert.equal(oldSnapshot.recordCount, 2, 'count describes exactly what the old client receives');
  assert.equal(oldSnapshot.manifestHash,
    await manifestHash(oldSnapshot.records, 1, crypto, 'port'), 'manifest is self-consistent for the old client');
  const newSnapshot = (await newA.snapshot()).json;
  assert.deepEqual(keys(newSnapshot), ['practice_menu/menu-a', 'practice_menu/menu-b', 'practice_menu_set/set-1']);
  assert.equal(newSnapshot.recordCount, 3);
  assert.notEqual(newSnapshot.manifestHash, oldSnapshot.manifestHash);

  const oldChanges = (await oldB.changes(encodeCursor(0))).json;
  assert.deepEqual(oldChanges.changes.map((item) => item.recordType), ['practice_menu', 'practice_menu']);
  const newChanges = (await newA.changes(encodeCursor(0))).json;
  assert.equal(newChanges.changes.length, 3);
  assert.equal(oldChanges.nextCursor, newChanges.nextCursor, 'the old cursor still advances past hidden changes');

  // The old client's ordinary Practice Menu sync is unaffected.
  result = await oldB.push([await h.operation('practice_menu', 'menu-a',
    { ...menuValue('menu-a', 'メロディ音感（改）'), updatedAt: '2026-09-29T01:00:00.000Z' }, 1)]);
  assert.equal(result.json.results[0].status, 'applied');
  assert.equal(h.raw('practice_menu_set', 'set-1').deleted_at, null, 'remote set is preserved');
  h.db.close();
});

test('Case 2: capable clients create, edit, rename, change membership and delete sets', async () => {
  const h = harness();
  const newA = h.client(DEVICE_NEW_A, [CAPABILITY]);
  const newB = h.client(DEVICE_NEW_B, [CAPABILITY]);
  await newA.push([await h.operation('practice_menu_set', 'set-1', setValue())]);
  let snapshot = (await newB.snapshot()).json;
  const received = snapshot.records.find((record) => record.recordType === 'practice_menu_set');
  assert.deepEqual(received.payload.value, setValue(), 'same id, name and itemIds arrive on device B');

  let result = await newB.push([await h.operation('practice_menu_set', 'set-1',
    setValue({ name: '朝の音感練', itemIds: ['menu-b', 'menu-c'], updatedAt: '2026-09-29T02:00:00.000Z' }), 1)]);
  assert.equal(result.json.results[0].status, 'applied');
  snapshot = (await newA.snapshot()).json;
  assert.deepEqual(snapshot.records.find((record) => record.recordId === 'set-1').payload.value.itemIds, ['menu-b', 'menu-c']);

  result = await newA.push([await h.operation('practice_menu_set', 'set-1', null, 2)]);
  assert.equal(result.json.results[0].status, 'applied');
  snapshot = (await newB.snapshot()).json;
  assert.ok(snapshot.records.find((record) => record.recordId === 'set-1').deletedAt != null, 'delete syncs as a tombstone');
  assert.equal(snapshot.recordCount, 0);
  h.db.close();
});

test('Case 3: any set write or delete from an old client is rejected and remote data stays intact', async () => {
  const h = harness();
  await h.client(DEVICE_NEW_A, [CAPABILITY]).push([await h.operation('practice_menu_set', 'set-1', setValue())]);
  const before = h.raw('practice_menu_set', 'set-1');
  const oldB = h.client(DEVICE_OLD);
  const menu = await h.operation('practice_menu', 'menu-z', menuValue('menu-z', '曲練'));
  const result = await oldB.push([
    await h.operation('practice_menu_set', 'set-1', null, 1),
    await h.operation('practice_menu_set', 'set-1', setValue({ name: '上書き' }), 1),
    await h.operation('practice_menu_set', 'set-2', setValue({ id: 'set-2' })),
    menu
  ]);
  assert.equal(result.status, 200, 'the batch itself is not rejected');
  assert.deepEqual(result.json.results.map((item) => [item.status, item.code]), [
    ['invalid', 'capability_required'], ['invalid', 'capability_required'],
    ['invalid', 'capability_required'], ['applied', undefined]
  ]);
  assert.deepEqual(h.raw('practice_menu_set', 'set-1'), before);
  assert.equal(h.raw('practice_menu_set', 'set-2'), undefined);
  h.db.close();
});

test('Case 4: invalid capability values only disable sets and never break existing sync', async () => {
  const h = harness();
  await h.client(DEVICE_NEW_A, [CAPABILITY]).push([await h.operation('practice_menu_set', 'set-1', setValue())]);
  for (const capabilities of ['practice_menu_sets_v1', [CAPABILITY, 3], ['NOT VALID'], ['unknown_v1']]) {
    const bad = h.client(DEVICE_OLD, capabilities);
    const pushed = await bad.push([
      await h.operation('practice_menu', `menu-${Math.random().toString(36).slice(2, 8)}`, menuValue('m', '基礎練')),
      await h.operation('practice_menu_set', 'set-1', null, 1)
    ]);
    assert.equal(pushed.status, 200, JSON.stringify(capabilities));
    assert.deepEqual(pushed.json.results.map((item) => item.status), ['applied', 'invalid']);
    if (Array.isArray(capabilities)) {
      const snapshot = await bad.snapshot();
      assert.equal(snapshot.status, 200);
      assert.ok(!keys(snapshot.json).includes('practice_menu_set/set-1'));
    }
  }
  assert.equal(h.raw('practice_menu_set', 'set-1').deleted_at, null);
  // Other apps ignore the field entirely.
  const chord = await h.call(DEVICE_OLD, '/v1/sync/snapshot?appId=chord&capabilities=practice_menu_sets_v1');
  assert.notEqual(chord.status, 400);
  const devices = await h.call(DEVICE_OLD, '/v1/sync/devices?appId=port&capabilities=practice_menu_sets_v1');
  assert.equal(devices.status, 400, 'capabilities are accepted only on sync read routes');
  h.db.close();
});

test('rollback: after a Port rollback, server sets remain, invisible and undeletable to the old client', async () => {
  const h = harness();
  const deviceA = DEVICE_NEW_A;
  await h.client(deviceA, [CAPABILITY]).push([await h.operation('practice_menu_set', 'set-1', setValue())]);
  const rolledBack = h.client(deviceA); // the same device, now running an old Port build
  const snapshot = (await rolledBack.snapshot()).json;
  assert.ok(!keys(snapshot).includes('practice_menu_set/set-1'));
  const result = await rolledBack.push([await h.operation('practice_menu_set', 'set-1', null, 1)]);
  assert.equal(result.json.results[0].code, 'capability_required');
  const restored = (await h.client(deviceA, [CAPABILITY]).snapshot()).json;
  assert.ok(keys(restored).includes('practice_menu_set/set-1'), 'upgrading again restores the set');
  h.db.close();
});

test('migration completion compares against the records the requesting client can see', async () => {
  const h = harness();
  h.db.raw.prepare("UPDATE sync_datasets SET state = 'initializing' WHERE user_id = ? AND app_id = 'port'").run(USER_ID);
  const push = (deviceId, capabilities, operations) => h.call(deviceId, '/v1/sync/push', {
    method: 'POST', body: { appId: 'port', mode: 'migration', operations, ...(capabilities ? { capabilities } : {}) }
  });
  const menu = await h.operation('practice_menu', 'menu-a', menuValue('menu-a', '曲練'));
  const set = await h.operation('practice_menu_set', 'set-1', setValue());
  await push(DEVICE_NEW_A, [CAPABILITY], [menu, set]);
  const menuOnly = await manifestHash([{ recordType: 'practice_menu', recordId: 'menu-a', payloadHash: menu.payloadHash }], 1, crypto, 'port');
  const complete = (deviceId, body) => h.call(deviceId, '/v1/sync/migration/complete', {
    method: 'POST', body: { appId: 'port', schemaVersion: 1, ...body }
  });
  let result = await complete(DEVICE_OLD, { recordCount: 1, manifestHash: menuOnly });
  assert.equal(result.status, 200, 'an old client attests to its visible records');
  assert.equal(result.json.manifestHash, menuOnly);
  const dataset = h.db.raw.prepare("SELECT record_count FROM sync_datasets WHERE user_id = ? AND app_id = 'port'").get(USER_ID);
  assert.equal(dataset.record_count, 2, 'the dataset still records the full count');
  h.db.raw.prepare("UPDATE sync_datasets SET state = 'initializing' WHERE user_id = ? AND app_id = 'port'").run(USER_ID);
  result = await complete(DEVICE_NEW_A, { recordCount: 1, manifestHash: menuOnly, capabilities: [CAPABILITY] });
  assert.equal(result.status, 409, 'a capable client must account for its sets');
  assert.equal(result.json.serverRecordCount, 2);
  h.db.close();
});
