import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

class CustomEventPolyfill extends Event {
  constructor(type, init = {}) { super(type); this.detail = init.detail; }
}

function loadRuntime(backupStorage = { async save() {} }) {
  const context = {
    crypto: webcrypto, Headers, TextEncoder, structuredClone, EventTarget, CustomEvent: CustomEventPolyfill,
    navigator: { onLine: true }, queueMicrotask,
    SoundCruiseMultiAppSync: {},
    SoundCruiseSyncAccount: { appBackupStorage: backupStorage }
  };
  context.globalThis = context;
  vm.runInNewContext(readFileSync(new URL('./multi-app-sync-runtime.js', import.meta.url), 'utf8'), context);
  return context.SoundCruiseMultiAppSync.MultiAppSyncRuntime;
}

function memoryStore() {
  const meta = new Map();
  const outbox = new Map();
  const shadow = new Map();
  const conflicts = new Map();
  return {
    readMeta: async (key) => meta.get(key) ?? null,
    setMeta: async (key, value) => { meta.set(key, structuredClone(value)); },
    putOutbox: async (value) => { outbox.set(value.operationId, structuredClone(value)); },
    listOutbox: async () => [...outbox.values()].map((value) => structuredClone(value)),
    deleteOutbox: async (key) => { outbox.delete(key); },
    putShadow: async (key, value) => { shadow.set(key, structuredClone(value)); },
    listShadow: async () => [...shadow.values()].map((value) => structuredClone(value)),
    putConflict: async (value) => { conflicts.set(value.id, structuredClone(value)); },
    listConflicts: async () => [...conflicts.values()].map((value) => structuredClone(value))
  };
}

function adapter(initial = [], appId = 'pitch') {
  let records = structuredClone(initial);
  return {
    get records() { return records; },
    set records(value) { records = structuredClone(value); },
    readLocalSnapshot: () => ({ appId, schemaVersion: 1, records: structuredClone(records) }),
    normalizeLocalSnapshot: (value) => structuredClone(value),
    serializeRecords: async (snapshot) => snapshot.records.map((record) => ({ ...structuredClone(record), payloadHash: record.payloadHash || `hash-${record.recordId}` })),
    deserializeRecords: (remote) => ({ appId, schemaVersion: 1, records: remote.map(({ revision, deletedAt, ...record }) => record) }),
    computeManifest: async (snapshot) => `manifest-${snapshot.records.map((record) => record.recordId).sort().join('-')}`,
    mergeSnapshots: (local, remote) => ({ snapshot: { ...local, records: [...local.records, ...remote.records.filter((right) => !local.records.some((left) => left.recordId === right.recordId))] }, conflicts: [] }),
    applyRemoteSnapshot: async (snapshot) => { records = structuredClone(snapshot.records); return { ok: true }; },
    assertDataPlaneContext: () => true
  };
}

function serverFetch() {
  const server = { state: 'missing', records: new Map(), revision: 0, paused: false };
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    if (server.paused && path === '/v1/sync/push') {
      return Response.json({ ok: false, code: 'sync_write_paused' }, { status: 423 });
    }
    if (path === '/v1/sync/bootstrap') {
      server.state = 'initializing';
      return Response.json({ ok: true, datasetState: server.state, schemaVersion: 1, alreadyCreated: false }, { status: 201 });
    }
    if (path === '/v1/sync/snapshot') {
      const records = [...server.records.values()];
      return Response.json({ ok: true, datasetState: server.state, schemaVersion: 1,
        recordCount: records.filter((record) => record.deletedAt == null).length,
        manifestHash: `server-${server.revision}`, cursor: `c${server.revision}`, records });
    }
    if (path === '/v1/sync/push') {
      const body = JSON.parse(init.body);
      const results = body.operations.map((operation) => {
        server.revision += 1;
        const record = { ...operation, revision: server.revision,
          deletedAt: operation.deleted ? Date.now() : null, changeSeq: server.revision };
        server.records.set(`${operation.recordType}/${operation.recordId}`, record);
        return { operationId: operation.operationId, status: 'applied', record };
      });
      return Response.json({ ok: true, results });
    }
    if (path === '/v1/sync/migration/complete') {
      server.state = 'ready';
      const body = JSON.parse(init.body);
      return Response.json({ ok: true, datasetState: 'ready', recordCount: body.recordCount,
        manifestHash: body.manifestHash, cursor: `c${server.revision}` });
    }
    throw new Error(`unexpected ${path}`);
  };
  return { server, fetchImpl };
}

function runtimeFixture(initial, appId = 'pitch') {
  const backups = [];
  const Runtime = loadRuntime({ async save(value) { backups.push(structuredClone(value)); } });
  const store = memoryStore();
  const local = adapter(initial, appId);
  const { server, fetchImpl } = serverFetch();
  let id = 0;
  const core = {
    validAppCredential: (value) => value === 'scd1.valid',
    validQaCredential: (value) => value === 'scq1.valid',
    createOperationId: () => `op-${++id}`
  };
  const consumed = { consumeMode: 'new_app', membershipId: 'm1',
    membershipState: 'active', appDeviceCredential: 'scd1.valid', qaCredential: 'scq1.valid' };
  const accountClient = {
    consumeHandoff: async () => consumed,
    consumeJoinInvitation: async () => consumed,
    async confirmConsumePersisted() {}
  };
  return { runtime: new Runtime({ appId, endpoint: 'https://example.test', adapter: local,
    store, accountClient, accountCore: core, fetchImpl, randomOperationId: () => `op-${++id}` }), store, local, server, backups };
}

test('handoff migration, durable-save push, tombstone and remote pull share one safe runtime', async () => {
  for (const appId of ['pitch', 'rhythm', 'fretboard']) {
    const a = { recordType: 'custom_record', recordId: 'a', schemaVersion: 1, payload: { name: 'A' }, payloadHash: 'hash-a' };
    const fixture = runtimeFixture([a], appId);
    assert.equal((await fixture.runtime.consumeHandoff('transient')).ok, true, `${appId} migration`);
    assert.equal(fixture.server.state, 'ready');
    assert.equal(fixture.server.records.size, 1);
    fixture.local.records = [a, { recordType: 'custom_record', recordId: 'b', schemaVersion: 1, payload: { name: 'B' }, payloadHash: 'hash-b' }];
    assert.equal((await fixture.runtime.sync('save')).ok, true, `${appId} push`);
    assert.equal(fixture.server.records.get('custom_record/b').deletedAt, null);
    fixture.local.records = fixture.local.records.filter((record) => record.recordId !== 'b');
    assert.equal((await fixture.runtime.sync('save')).ok, true, `${appId} tombstone`);
    assert.ok(fixture.server.records.get('custom_record/b').deletedAt != null);
    const remoteA = fixture.server.records.get('custom_record/a');
    fixture.server.records.set('custom_record/a', { ...remoteA, revision: remoteA.revision + 1,
      payload: { name: 'remote' }, payloadHash: 'hash-remote', changeSeq: remoteA.changeSeq + 1 });
    assert.equal((await fixture.runtime.sync('focus')).ok, true, `${appId} pull`);
    assert.equal(fixture.local.records.find((record) => record.recordId === 'a').payload.name, 'remote');
  }
});

test('cross-container Join Code converges on the same migration runtime without shared Port storage', async () => {
  for (const appId of ['pitch', 'rhythm', 'fretboard']) {
    const localRecord = { recordType: 'custom_record', recordId: 'local', schemaVersion: 1,
      payload: { name: 'local' }, payloadHash: 'hash-local' };
    const fixture = runtimeFixture([localRecord], appId);
    const result = await fixture.runtime.consumeInvitation('SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE');
    assert.equal(result.ok, true, appId);
    assert.equal(fixture.server.records.size, 1, appId);
    assert.equal(await fixture.store.readMeta('migrationState'), 'complete', appId);
  }
});

test('failed Join hydrate restores the exact local snapshot and retains its pre-apply backup', async () => {
  const fixture = runtimeFixture([], 'pitch');
  fixture.server.state = 'ready';
  fixture.server.records.set('custom_record/remote', {
    recordType: 'custom_record', recordId: 'remote', schemaVersion: 1,
    payload: { name: 'remote' }, payloadHash: 'hash-remote', revision: 1, changeSeq: 1, deletedAt: null
  });
  const originalApply = fixture.local.applyRemoteSnapshot;
  let attempts = 0;
  fixture.local.applyRemoteSnapshot = async (snapshot) => {
    attempts += 1;
    if (attempts === 1) {
      fixture.local.records = [{ recordId: 'partial-write' }];
      throw new Error('apply failed');
    }
    return originalApply(snapshot);
  };
  await assert.rejects(
    fixture.runtime.consumeInvitation('SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE'),
    /apply failed/
  );
  assert.deepEqual(fixture.local.records, []);
  assert.equal(fixture.backups.length, 1);
  assert.deepEqual(fixture.backups[0].values.records, []);
});

test('pause gate keeps the persisted outbox and never rolls back local data', async () => {
  const fixture = runtimeFixture([]);
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.records = [{ recordType: 'custom_chord', recordId: 'later', schemaVersion: 1,
    payload: { name: 'local' }, payloadHash: 'hash-later' }];
  fixture.server.paused = true;
  await assert.rejects(() => fixture.runtime.sync('save'), /sync_write_paused/);
  assert.equal(fixture.local.records.length, 1);
  assert.equal((await fixture.store.listOutbox()).length, 1);
  assert.equal(await fixture.store.readMeta('runtimeState'), 'paused');
});

test('concurrent local and remote edits stop for attention without overwriting local data', async () => {
  const a = { recordType: 'custom_chord', recordId: 'a', schemaVersion: 1,
    payload: { name: 'base' }, payloadHash: 'hash-base' };
  const fixture = runtimeFixture([a]);
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.records = [{ ...a, payload: { name: 'local' }, payloadHash: 'hash-local' }];
  const remote = fixture.server.records.get('custom_chord/a');
  fixture.server.records.set('custom_chord/a', {
    ...remote, revision: remote.revision + 1, changeSeq: remote.changeSeq + 1,
    payload: { name: 'remote' }, payloadHash: 'hash-remote'
  });
  const result = await fixture.runtime.sync('focus');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'conflict');
  assert.equal(result.conflicts, 1);
  assert.equal(fixture.local.records[0].payload.name, 'local');
  assert.equal((await fixture.store.listConflicts()).length, 1);
  assert.equal(await fixture.store.readMeta('runtimeState'), 'attention');
});
