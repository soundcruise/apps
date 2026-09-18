import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

class CustomEventPolyfill extends Event {
  constructor(type, init = {}) { super(type); this.detail = init.detail; }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function loadRuntime(backupStorage = { async save() {} }) {
  const globalEvents = new EventTarget();
  const documentEvents = new EventTarget();
  const context = {
    crypto: webcrypto, Headers, TextEncoder, structuredClone, EventTarget, CustomEvent: CustomEventPolyfill,
    navigator: { onLine: true }, queueMicrotask,
    addEventListener: globalEvents.addEventListener.bind(globalEvents),
    removeEventListener: globalEvents.removeEventListener.bind(globalEvents),
    dispatchEvent: globalEvents.dispatchEvent.bind(globalEvents),
    document: {
      visibilityState: 'visible',
      addEventListener: documentEvents.addEventListener.bind(documentEvents),
      removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
      dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents)
    },
    SoundCruiseMultiAppSync: {},
    SoundCruiseSyncAccount: { appBackupStorage: backupStorage }
  };
  context.globalThis = context;
  vm.runInNewContext(readFileSync(new URL('./multi-app-sync-runtime.js', import.meta.url), 'utf8'), context);
  const Runtime = context.SoundCruiseMultiAppSync.MultiAppSyncRuntime;
  Runtime.testContext = context;
  return Runtime;
}

function memoryStore() {
  const meta = new Map();
  const outbox = new Map();
  const shadow = new Map();
  const conflicts = new Map();
  return {
    readMeta: async (key) => meta.get(key) ?? null,
    setMeta: async (key, value) => { meta.set(key, structuredClone(value)); },
    removeMeta: async (key) => { meta.delete(key); },
    clearCloudState: async () => { meta.clear(); outbox.clear(); shadow.clear(); conflicts.clear(); },
    putOutbox: async (value) => { outbox.set(value.operationId, structuredClone(value)); },
    listOutbox: async () => [...outbox.values()].map((value) => structuredClone(value)),
    deleteOutbox: async (key) => { outbox.delete(key); },
    putShadow: async (key, value) => { shadow.set(key, structuredClone(value)); },
    getShadow: async (key) => structuredClone(shadow.get(key) ?? null),
    listShadow: async () => [...shadow.values()].map((value) => structuredClone(value)),
    deleteShadow: async (key) => { shadow.delete(key); },
    putConflict: async (value) => { conflicts.set(value.id, structuredClone(value)); },
    getConflict: async (key) => structuredClone(conflicts.get(key) ?? null),
    listConflicts: async () => [...conflicts.values()].map((value) => structuredClone(value)),
    deleteConflict: async (key) => { conflicts.delete(key); }
  };
}

function adapter(initial = [], appId = 'pitch') {
  let records = structuredClone(initial);
  return {
    get records() { return records; },
    set records(value) { records = structuredClone(value); },
    readLocalSnapshot: () => ({ appId, schemaVersion: 1, records: structuredClone(records) }),
    normalizeLocalSnapshot: (value) => structuredClone(value),
    serializeRecords: async (snapshot) => snapshot.records.map((record) => ({
      ...structuredClone(record),
      payloadHash: record.payloadHash || (record.payload?.bpm == null
        ? `hash-${record.recordId}` : `hash-${record.recordId}-${record.payload.bpm}`)
    })),
    deserializeRecords: (remote) => ({ appId, schemaVersion: 1, records: remote.map(({ revision, deletedAt, ...record }) => record) }),
    computeManifest: async (snapshot) => `manifest-${snapshot.records.map((record) => record.recordId).sort().join('-')}`,
    getConflictPresentation: ({ localRecord, remoteRecord }) => ({
      title: 'Custom preset', name: localRecord?.payload?.name || remoteRecord?.payload?.name || 'Deleted item',
      fields: [{ label: 'BPM', local: String(localRecord?.payload?.bpm ?? 'deleted'), remote: String(remoteRecord?.payload?.bpm ?? 'deleted') }]
    }),
    mergeSnapshots: (local, remote) => ({ snapshot: { ...local, records: [...local.records, ...remote.records.filter((right) => !local.records.some((left) => left.recordId === right.recordId))] }, conflicts: [] }),
    applyRemoteSnapshot: async (snapshot) => { records = structuredClone(snapshot.records); return { ok: true }; },
    assertDataPlaneContext: () => true
  };
}

function serverFetch() {
  const server = {
    state: 'missing', records: new Map(), revision: 0, paused: false,
    nextSnapshotFailure: null, nextPushFailure: null, responseLossAfterApply: false,
    beforeNextPush: null, pushCalls: 0, pushedOperationIds: [], operations: new Map()
  };
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
      if (server.nextSnapshotFailure) {
        const failure = server.nextSnapshotFailure;
        server.nextSnapshotFailure = null;
        if (failure.network) throw new Error('network failure');
        return Response.json({ ok: false, code: failure.code }, { status: failure.status });
      }
      const records = [...server.records.values()];
      const liveIds = records.filter((record) => record.deletedAt == null)
        .map((record) => record.recordId).sort();
      return Response.json({ ok: true, datasetState: server.state, schemaVersion: 1,
        recordCount: records.filter((record) => record.deletedAt == null).length,
        manifestHash: `manifest-${liveIds.join('-')}`, cursor: `c${server.revision}`, records });
    }
    if (path === '/v1/sync/push') {
      server.pushCalls += 1;
      if (server.nextPushFailure) {
        const failure = server.nextPushFailure;
        server.nextPushFailure = null;
        if (failure.network) throw new Error('network failure');
        return Response.json({ ok: false, code: failure.code }, { status: failure.status });
      }
      if (server.beforeNextPush) {
        const before = server.beforeNextPush;
        server.beforeNextPush = null;
        await before(server);
      }
      const body = JSON.parse(init.body);
      const results = body.operations.map((operation) => {
        server.pushedOperationIds.push(operation.operationId);
        const duplicate = server.operations.get(operation.operationId);
        if (duplicate) return { operationId: operation.operationId, status: 'duplicate', record: duplicate };
        const key = `${operation.recordType}/${operation.recordId}`;
        const current = server.records.get(key) || null;
        if (Number(operation.baseRevision || 0) !== Number(current?.revision || 0)) {
          return { operationId: operation.operationId, status: 'conflict', record: current };
        }
        server.revision += 1;
        const record = { ...operation, revision: Number(current?.revision || 0) + 1,
          operationId: operation.operationId,
          deletedAt: operation.deleted ? Date.now() : null, changeSeq: server.revision };
        server.records.set(key, record);
        server.operations.set(operation.operationId, structuredClone(record));
        return { operationId: operation.operationId, status: 'applied', record };
      });
      if (server.responseLossAfterApply) {
        server.responseLossAfterApply = false;
        throw new Error('response lost');
      }
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

function runtimeFixture(initial, appId = 'pitch', admissionMode = 'qa') {
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
    admissionMode,
    consumeHandoff: async () => consumed,
    consumeJoinInvitation: async () => consumed,
    async confirmConsumePersisted() {}
  };
  return { runtime: new Runtime({ appId, endpoint: 'https://example.test', adapter: local,
    store, accountClient, accountCore: core, fetchImpl, admissionMode,
    randomOperationId: () => `op-${++id}` }),
    Runtime, store, local, server, backups, context: Runtime.testContext,
    accountClient, core, fetchImpl, nextId: () => `op-${++id}` };
}

test('production data-plane requests require only app authority and never send QA authorization', async () => {
  const fixture = runtimeFixture([], 'pitch', 'production');
  await fixture.store.setMeta('credential', 'scd1.valid');
  await fixture.store.setMeta('qaCredential', null);
  let headers;
  fixture.runtime.fetchImpl = async (_url, init) => {
    headers = init.headers;
    return Response.json({ ok: true, datasetState: 'ready', schemaVersion: 1,
      recordCount: 0, manifestHash: 'manifest-', cursor: 'c0', records: [] });
  };
  await fixture.runtime.request('GET', '/v1/sync/snapshot?appId=pitch');
  assert.equal(headers.get('Authorization'), 'Bearer scd1.valid');
  assert.equal(headers.has('X-Sound-Cruise-QA-Authorization'), false);
});

test('definitive terminal auth detaches only sync state, preserves local data, and allows safe rejoin for three shared apps', async () => {
  for (const appId of ['pitch', 'fretboard', 'rhythm', 'port']) {
    const localRecord = record(`local-${appId}`, `Local ${appId}`);
    const fixture = runtimeFixture([localRecord], appId, 'production');
    await fixture.store.setMeta('credential', 'scd1.valid');
    await fixture.store.setMeta('migrationState', 'complete');
    fixture.server.nextSnapshotFailure = { status: 410, code: 'account_deleting' };
    await assert.rejects(fixture.runtime.sync('startup'), (error) => error.code === 'account_deleting');
    assert.equal(await fixture.store.readMeta('credential'), null, appId);
    assert.equal(await fixture.store.readMeta('runtimeState'), 'credential_invalid', appId);
    assert.deepEqual(fixture.local.records, [localRecord], `${appId} user data`);
    assert.equal((await fixture.runtime.consumeInvitation('opaque')).ok, true, `${appId} rejoin`);
    assert.deepEqual(fixture.local.records, [localRecord], `${appId} user data after rejoin`);
  }
});

test('current-environment detach is server-first, preserves local app data and leaves a resumable operation on failure', async () => {
  const localRecord = record('local-detach', 'Local detach');
  const fixture = runtimeFixture([localRecord], 'pitch', 'production');
  await fixture.store.setMeta('credential', 'scd1.valid');
  await fixture.store.setMeta('migrationState', 'complete');
  let calls = 0;
  fixture.accountClient.detachCurrentAppEnvironment = async ({ appCredential, operationId }) => {
    calls += 1;
    assert.equal(appCredential, 'scd1.valid');
    assert.equal(operationId, 'op-1');
    return { ok: true, scope: 'current_app_environment' };
  };
  await fixture.runtime.detachCurrentEnvironment();
  assert.equal(calls, 1);
  assert.equal(await fixture.store.readMeta('credential'), null);
  assert.equal(await fixture.store.readMeta('runtimeState'), 'credential_invalid');
  assert.deepEqual(fixture.local.records, [localRecord], 'ordinary local app data is untouched');

  const retry = runtimeFixture([localRecord], 'pitch', 'production');
  await retry.store.setMeta('credential', 'scd1.valid');
  retry.accountClient.detachCurrentAppEnvironment = async () => { throw new Error('network_error'); };
  await assert.rejects(retry.runtime.detachCurrentEnvironment());
  assert.equal(await retry.store.readMeta('credential'), 'scd1.valid', 'failure never clears the binding');
  assert.deepEqual(await retry.store.readMeta('pendingCurrentEnvironmentDetach'), { operationId: 'op-1' });
  assert.deepEqual(retry.local.records, [localRecord]);
});

test('generic auth, network failure, offline state, and an active identity never detach or silently replace', async () => {
  const fixture = runtimeFixture([record('local')], 'pitch', 'production');
  await fixture.store.setMeta('credential', 'scd1.valid');
  await fixture.store.setMeta('migrationState', 'complete');
  fixture.server.nextSnapshotFailure = { status: 403, code: 'invalid_credential' };
  await assert.rejects(fixture.runtime.sync('generic'));
  assert.equal(await fixture.store.readMeta('credential'), 'scd1.valid');
  fixture.server.nextSnapshotFailure = { network: true };
  await assert.rejects(fixture.runtime.sync('network'));
  assert.equal(await fixture.store.readMeta('credential'), 'scd1.valid');
  fixture.context.navigator.onLine = false;
  assert.equal((await fixture.runtime.sync('offline')).code, 'offline');
  assert.equal(await fixture.store.readMeta('credential'), 'scd1.valid');
  await assert.rejects(fixture.runtime.consumeInvitation('opaque'), (error) => error.code === 'active_identity_present');
  assert.equal(await fixture.store.readMeta('credential'), 'scd1.valid');
  assert.deepEqual(fixture.local.records, [record('local')]);
});

function record(id, name = id, recordType = 'custom_record') {
  return { recordType, recordId: id, schemaVersion: 1,
    payload: { name }, payloadHash: `hash-${id}-${name}` };
}

test('handoff migration, durable-save push, tombstone and remote pull share one safe runtime', async () => {
  for (const appId of ['pitch', 'rhythm', 'fretboard', 'port']) {
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
  for (const appId of ['pitch', 'rhythm', 'fretboard', 'port']) {
    const localRecord = { recordType: 'custom_record', recordId: 'local', schemaVersion: 1,
      payload: { name: 'local' }, payloadHash: 'hash-local' };
    const fixture = runtimeFixture([localRecord], appId);
    const result = await fixture.runtime.consumeInvitation('SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE');
    assert.equal(result.ok, true, appId);
    assert.equal(fixture.server.records.size, 1, appId);
    assert.equal(await fixture.store.readMeta('migrationState'), 'complete', appId);
  }
});

test('Port item deletion creates isolated tombstones for every mutable collection family', async () => {
  const initial = [
    record('gear-1', 'Gear', 'gear_item'),
    record('preset-1', 'Preset', 'metronome_preset'),
    record('calendar-1', 'Calendar', 'calendar_event'),
    record('practice-1', 'Practice', 'practice_menu'),
    record('app-1', 'App', 'my_app')
  ];
  const fixture = runtimeFixture(initial, 'port');
  assert.equal((await fixture.runtime.consumeHandoff('transient')).ok, true);
  fixture.local.records = [];
  assert.equal((await fixture.runtime.sync('save')).ok, true);
  for (const item of initial) {
    const remote = fixture.server.records.get(`${item.recordType}/${item.recordId}`);
    assert.ok(remote.deletedAt != null, `${item.recordType} is tombstoned`);
  }
  assert.equal(fixture.server.records.size, initial.length);
  assert.equal((await fixture.store.listOutbox()).length, 0);
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

test('save during startup sync schedules one follow-up with the post-save snapshot', async () => {
  const a = { recordType: 'custom_preset', recordId: 'a', schemaVersion: 1,
    payload: { name: 'QA-DP-RHYTHM-1' }, payloadHash: 'hash-a' };
  const b = { recordType: 'custom_preset', recordId: 'b', schemaVersion: 1,
    payload: { name: 'QA-DP-RHYTHM-B1' }, payloadHash: 'hash-b' };
  const fixture = runtimeFixture([a], 'rhythm');
  await fixture.runtime.consumeHandoff('transient');

  const snapshotTaken = deferred();
  const releaseStartup = deferred();
  const originalLocalRecords = fixture.runtime.localRecords.bind(fixture.runtime);
  let localRecordCalls = 0;
  fixture.runtime.localRecords = async () => {
    const value = await originalLocalRecords();
    localRecordCalls += 1;
    if (localRecordCalls === 1) {
      snapshotTaken.resolve();
      await releaseStartup.promise;
    }
    return value;
  };
  const originalPerformSync = fixture.runtime.performSync.bind(fixture.runtime);
  let syncRuns = 0;
  fixture.runtime.performSync = async (reason) => {
    syncRuns += 1;
    return originalPerformSync(reason);
  };

  const startup = fixture.runtime.sync('startup');
  await snapshotTaken.promise;
  fixture.local.records = [a, b];
  fixture.runtime.notifyLocalSave();
  await Promise.resolve();
  releaseStartup.resolve();
  await startup;

  assert.equal(syncRuns, 2);
  assert.equal(fixture.server.records.get('custom_preset/b')?.deletedAt, null);
  assert.equal(fixture.server.revision, 2);
  assert.equal(new Set(fixture.server.pushedOperationIds).size, fixture.server.pushedOperationIds.length);
  assert.equal((await fixture.store.listOutbox()).length, 0);
});

test('save during pull schedules one follow-up after the captured snapshot', async () => {
  const a = record('a');
  const b = record('b');
  const fixture = runtimeFixture([a], 'rhythm');
  await fixture.runtime.consumeHandoff('transient');
  const localCaptured = deferred();
  const remoteCaptured = deferred();
  const releasePull = deferred();
  const originalLocalRecords = fixture.runtime.localRecords.bind(fixture.runtime);
  const originalServerSnapshot = fixture.runtime.serverSnapshot.bind(fixture.runtime);
  let localCalls = 0;
  let remoteCalls = 0;
  fixture.runtime.localRecords = async () => {
    const value = await originalLocalRecords();
    if (++localCalls === 1) localCaptured.resolve();
    return value;
  };
  fixture.runtime.serverSnapshot = async () => {
    const value = await originalServerSnapshot();
    if (++remoteCalls === 1) {
      remoteCaptured.resolve();
      await releasePull.promise;
    }
    return value;
  };
  let runs = 0;
  const originalPerformSync = fixture.runtime.performSync.bind(fixture.runtime);
  fixture.runtime.performSync = async (reason) => { runs += 1; return originalPerformSync(reason); };

  const pulling = fixture.runtime.sync('focus');
  await Promise.all([localCaptured.promise, remoteCaptured.promise]);
  fixture.local.records = [a, b];
  fixture.runtime.sync('save');
  releasePull.resolve();
  await pulling;

  assert.equal(runs, 2);
  assert.equal(fixture.server.records.get('custom_record/b')?.deletedAt, null);
});

test('save during push schedules one follow-up without duplicating the first push', async () => {
  const a = record('a');
  const b = record('b');
  const c = record('c');
  const fixture = runtimeFixture([a], 'fretboard');
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.records = [a, b];
  const pushed = deferred();
  const releasePush = deferred();
  const originalFlushOutbox = fixture.runtime.flushOutbox.bind(fixture.runtime);
  let flushCalls = 0;
  fixture.runtime.flushOutbox = async (...args) => {
    const result = await originalFlushOutbox(...args);
    if (++flushCalls === 1) {
      pushed.resolve();
      await releasePush.promise;
    }
    return result;
  };
  let runs = 0;
  const originalPerformSync = fixture.runtime.performSync.bind(fixture.runtime);
  fixture.runtime.performSync = async (reason) => { runs += 1; return originalPerformSync(reason); };

  const first = fixture.runtime.sync('save');
  await pushed.promise;
  fixture.local.records = [a, b, c];
  fixture.runtime.sync('save');
  releasePush.resolve();
  await first;

  assert.equal(runs, 2);
  assert.equal(fixture.server.records.get('custom_record/b')?.deletedAt, null);
  assert.equal(fixture.server.records.get('custom_record/c')?.deletedAt, null);
  assert.equal(fixture.server.revision, 3);
  assert.equal(new Set(fixture.server.pushedOperationIds).size, fixture.server.pushedOperationIds.length);
});

test('multiple save, focus and online requests coalesce into one follow-up', async () => {
  const a = record('a');
  const b = record('b');
  const fixture = runtimeFixture([a], 'pitch');
  await fixture.runtime.consumeHandoff('transient');
  const captured = deferred();
  const release = deferred();
  const originalLocalRecords = fixture.runtime.localRecords.bind(fixture.runtime);
  let localCalls = 0;
  fixture.runtime.localRecords = async () => {
    const value = await originalLocalRecords();
    if (++localCalls === 1) {
      captured.resolve();
      await release.promise;
    }
    return value;
  };
  let runs = 0;
  const originalPerformSync = fixture.runtime.performSync.bind(fixture.runtime);
  fixture.runtime.performSync = async (reason) => { runs += 1; return originalPerformSync(reason); };

  const first = fixture.runtime.sync('startup');
  await captured.promise;
  fixture.local.records = [a, b];
  fixture.runtime.notifyLocalSave();
  fixture.runtime.notifyLocalSave();
  fixture.context.dispatchEvent(new Event('focus'));
  fixture.context.dispatchEvent(new Event('online'));
  fixture.runtime.sync('save');
  await Promise.resolve();
  release.resolve();
  await first;

  assert.equal(runs, 2);
  assert.equal(fixture.server.records.get('custom_record/b')?.deletedAt, null);
});

test('save at the completion boundary is not lost', async () => {
  const a = record('a');
  const b = record('b');
  const fixture = runtimeFixture([a], 'rhythm');
  await fixture.runtime.consumeHandoff('transient');
  const originalPerformSync = fixture.runtime.performSync.bind(fixture.runtime);
  let runs = 0;
  fixture.runtime.performSync = async (reason) => {
    runs += 1;
    const result = await originalPerformSync(reason);
    if (runs === 1) {
      fixture.local.records = [a, b];
      fixture.runtime.sync('save');
    }
    return result;
  };

  await fixture.runtime.sync('startup');

  assert.equal(runs, 2);
  assert.equal(fixture.server.records.get('custom_record/b')?.deletedAt, null);
});

test('an apply-triggered save causes at most one follow-up and no loop', async () => {
  const a = record('a', 'base');
  const fixture = runtimeFixture([a], 'pitch');
  await fixture.runtime.consumeHandoff('transient');
  const remote = fixture.server.records.get('custom_record/a');
  fixture.server.records.set('custom_record/a', {
    ...remote, revision: remote.revision + 1, changeSeq: remote.changeSeq + 1,
    payload: { name: 'remote' }, payloadHash: 'hash-a-remote'
  });
  const originalApply = fixture.local.applyRemoteSnapshot.bind(fixture.local);
  fixture.local.applyRemoteSnapshot = async (snapshot) => {
    await originalApply(snapshot);
    fixture.runtime.notifyLocalSave();
  };
  let runs = 0;
  const originalPerformSync = fixture.runtime.performSync.bind(fixture.runtime);
  fixture.runtime.performSync = async (reason) => { runs += 1; return originalPerformSync(reason); };

  await fixture.runtime.sync('focus');

  assert.equal(runs, 2);
  assert.equal(fixture.runtime.running, null);
  assert.equal(fixture.local.records[0].payload.name, 'remote');
});

for (const failure of [
  { label: '429', status: 429, code: 'rate_limited' },
  { label: '5xx', status: 503, code: 'service_unavailable' },
  { label: 'network', network: true }
]) {
  test(`${failure.label} with a pending save stops automatic follow-up and remains retryable`, async () => {
    const a = record('a');
    const b = record('b');
    const fixture = runtimeFixture([a], 'rhythm');
    await fixture.runtime.consumeHandoff('transient');
    const requestStarted = deferred();
    const releaseRequest = deferred();
    const originalServerSnapshot = fixture.runtime.serverSnapshot.bind(fixture.runtime);
    let snapshotCalls = 0;
    fixture.runtime.serverSnapshot = async () => {
      if (++snapshotCalls === 1) {
        requestStarted.resolve();
        await releaseRequest.promise;
      }
      return originalServerSnapshot();
    };
    fixture.server.nextSnapshotFailure = failure;
    let runs = 0;
    const originalPerformSync = fixture.runtime.performSync.bind(fixture.runtime);
    fixture.runtime.performSync = async (reason) => { runs += 1; return originalPerformSync(reason); };

    const failing = fixture.runtime.sync('startup');
    await requestStarted.promise;
    fixture.local.records = [a, b];
    fixture.runtime.notifyLocalSave();
    await Promise.resolve();
    releaseRequest.resolve();
    await assert.rejects(failing);
    await Promise.resolve();

    assert.equal(runs, 1);
    assert.equal(fixture.server.records.has('custom_record/b'), false);
    assert.equal(await fixture.store.readMeta('runtimeState'), 'retrying');
    await fixture.runtime.sync('online');
    assert.equal(runs, 2);
    assert.equal(fixture.server.records.get('custom_record/b')?.deletedAt, null);
  });
}

test('offline save stays local and the online trigger sends the latest snapshot', async () => {
  const a = record('a');
  const b = record('b');
  const fixture = runtimeFixture([a], 'fretboard');
  await fixture.runtime.consumeHandoff('transient');
  fixture.context.navigator.onLine = false;
  fixture.local.records = [a, b];

  const offline = await fixture.runtime.sync('save');
  assert.equal(offline.ok, false);
  assert.equal(offline.code, 'offline');
  assert.equal(fixture.server.records.has('custom_record/b'), false);

  fixture.context.navigator.onLine = true;
  await fixture.runtime.sync('online');
  assert.equal(fixture.server.records.get('custom_record/b')?.deletedAt, null);
});

test('conflict safe-stop does not run a pending follow-up', async () => {
  const a = record('a', 'base');
  const fixture = runtimeFixture([a], 'pitch');
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.records = [record('a', 'local')];
  const remote = fixture.server.records.get('custom_record/a');
  fixture.server.records.set('custom_record/a', {
    ...remote, revision: remote.revision + 1, changeSeq: remote.changeSeq + 1,
    payload: { name: 'remote' }, payloadHash: 'hash-a-remote'
  });
  let runs = 0;
  const originalPerformSync = fixture.runtime.performSync.bind(fixture.runtime);
  fixture.runtime.performSync = async (reason) => { runs += 1; return originalPerformSync(reason); };

  const first = fixture.runtime.sync('focus');
  fixture.runtime.sync('save');
  const result = await first;

  assert.equal(result.code, 'conflict');
  assert.equal(runs, 1);
  assert.equal(await fixture.store.readMeta('runtimeState'), 'attention');
  assert.equal((await fixture.store.listConflicts()).length, 1);
  assert.equal(fixture.local.records[0].payload.name, 'local');
});

function preset(id, bpm) {
  return {
    recordType: 'custom_preset', recordId: id, schemaVersion: 1,
    payload: { name: 'QA-DP-RHYTHM-CONFLICT-BASE', bpm }, payloadHash: `hash-${id}-${bpm}`
  };
}

function setRemoteVariant(fixture, id, bpm, options = {}) {
  const key = `custom_preset/${id}`;
  const current = fixture.server.records.get(key);
  fixture.server.revision += 1;
  fixture.server.records.set(key, {
    ...current,
    payload: options.deleted ? null : { name: 'QA-DP-RHYTHM-CONFLICT-BASE', bpm },
    payloadHash: options.deleted ? `hash-${id}-deleted` : `hash-${id}-${bpm}`,
    revision: current.revision + 1,
    deletedAt: options.deleted ? Date.now() : null,
    operationId: options.operationId || `remote-${id}-${bpm}`,
    changeSeq: fixture.server.revision
  });
}

async function conflictFixture(ids = ['conflict']) {
  const fixture = runtimeFixture(ids.map((id) => preset(id, 80)), 'rhythm');
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.records = ids.map((id) => preset(id, 79));
  for (const id of ids) setRemoteVariant(fixture, id, 81);
  const stopped = await fixture.runtime.sync('focus');
  assert.equal(stopped.code, 'conflict');
  return fixture;
}

test('exact BPM 80/79/81 fixture persists minimal conflict anchors and safe presentation only', async () => {
  const fixture = await conflictFixture();
  const [conflict] = await fixture.store.listConflicts();
  assert.equal(conflict.kind, 'pull');
  assert.equal(conflict.recordKey, 'custom_preset/conflict');
  assert.equal(conflict.recordType, 'custom_preset');
  assert.equal(conflict.recordId, 'conflict');
  assert.equal(conflict.anchors.shadow.payloadHash, 'hash-conflict-80');
  assert.equal(conflict.anchors.local.payloadHash, 'hash-conflict-79');
  assert.equal(conflict.anchors.remote.payloadHash, 'hash-conflict-81');
  assert.equal(Object.hasOwn(conflict, 'payload'), false);
  const [item] = await fixture.runtime.listConflictPresentations();
  assert.equal(item.presentation.name, 'QA-DP-RHYTHM-CONFLICT-BASE');
  assert.deepEqual(JSON.parse(JSON.stringify(item.presentation.fields)), [
    { label: 'BPM', local: '79', remote: '81' }
  ]);
});

test('Local wins uses the current Remote revision as CAS and advances exactly once', async () => {
  const fixture = await conflictFixture();
  const [conflict] = await fixture.store.listConflicts();
  const result = await fixture.runtime.resolveConflict(conflict.id, 'local');
  const remote = fixture.server.records.get('custom_preset/conflict');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(remote.payload.bpm, 79);
  assert.equal(remote.revision, 3);
  assert.equal((await fixture.store.listConflicts()).length, 0);
  assert.equal(await fixture.store.readMeta('runtimeState'), 'ready');
  assert.equal(fixture.backups.length, 1);
});

test('Remote wins applies one record with backup and performs no Remote write', async () => {
  const fixture = await conflictFixture();
  const pushCalls = fixture.server.pushCalls;
  const revision = fixture.server.records.get('custom_preset/conflict').revision;
  const [conflict] = await fixture.store.listConflicts();
  const result = await fixture.runtime.resolveConflict(conflict.id, 'remote');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(fixture.local.records[0].payload.bpm, 81);
  assert.equal(fixture.server.records.get('custom_preset/conflict').revision, revision);
  assert.equal(fixture.server.pushCalls, pushCalls);
  assert.equal(fixture.backups.length, 1);
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

test('Later leaves local, Remote, attention and the conflict entry unchanged', async () => {
  const fixture = await conflictFixture();
  const [conflict] = await fixture.store.listConflicts();
  const result = await fixture.runtime.resolveConflict(conflict.id, 'later');
  assert.equal(result.ok, true);
  assert.equal(result.deferred, true);
  assert.equal(fixture.local.records[0].payload.bpm, 79);
  assert.equal(fixture.server.records.get('custom_preset/conflict').payload.bpm, 81);
  assert.equal((await fixture.store.listConflicts()).length, 1);
  assert.equal(await fixture.store.readMeta('runtimeState'), 'attention');
});

test('Local wins fails closed when Remote changes after the resolution read', async () => {
  const fixture = await conflictFixture();
  fixture.server.beforeNextPush = async () => setRemoteVariant(fixture, 'conflict', 82, { operationId: 'remote-third' });
  const [conflict] = await fixture.store.listConflicts();
  const result = await fixture.runtime.resolveConflict(conflict.id, 'local');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'stale_resolution');
  assert.equal(fixture.server.records.get('custom_preset/conflict').payload.bpm, 82);
  assert.equal(fixture.server.records.get('custom_preset/conflict').revision, 3);
  assert.equal(fixture.local.records[0].payload.bpm, 79);
  assert.equal((await fixture.store.listConflicts()).length, 1);
  assert.equal(await fixture.store.readMeta('runtimeState'), 'attention');
});

test('Remote wins apply failure rolls local data back and retains the conflict', async () => {
  const fixture = await conflictFixture();
  const originalApply = fixture.local.applyRemoteSnapshot.bind(fixture.local);
  let attempts = 0;
  fixture.local.applyRemoteSnapshot = async (snapshot) => {
    attempts += 1;
    if (attempts === 1) {
      fixture.local.records = [preset('partial', 1)];
      throw new Error('synthetic_apply_failure');
    }
    return originalApply(snapshot);
  };
  const [conflict] = await fixture.store.listConflicts();
  const result = await fixture.runtime.resolveConflict(conflict.id, 'remote');
  assert.equal(result.ok, false);
  assert.equal(fixture.local.records[0].recordId, 'conflict');
  assert.equal(fixture.local.records[0].payload.bpm, 79);
  assert.equal(fixture.server.records.get('custom_preset/conflict').payload.bpm, 81);
  assert.equal((await fixture.store.listConflicts()).length, 1);
});

test('Local wins response loss resumes with the same operation and never adds a second revision', async () => {
  const fixture = await conflictFixture();
  fixture.server.responseLossAfterApply = true;
  const [conflict] = await fixture.store.listConflicts();
  const first = await fixture.runtime.resolveConflict(conflict.id, 'local');
  assert.equal(first.ok, false);
  assert.equal(fixture.server.records.get('custom_preset/conflict').revision, 3);
  const pushes = fixture.server.pushCalls;
  const restarted = new fixture.Runtime({
    appId: 'rhythm', endpoint: 'https://example.test', adapter: fixture.local,
    store: fixture.store, accountClient: fixture.accountClient, accountCore: fixture.core,
    fetchImpl: fixture.fetchImpl, randomOperationId: fixture.nextId
  });
  const resumed = await restarted.resumeConflictResolutions();
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  assert.equal(fixture.server.records.get('custom_preset/conflict').revision, 3);
  assert.equal(fixture.server.pushCalls, pushes);
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

test('response-loss recovery verifies that the selected local value did not change before clearing', async () => {
  const fixture = await conflictFixture();
  fixture.server.responseLossAfterApply = true;
  const [conflict] = await fixture.store.listConflicts();
  assert.equal((await fixture.runtime.resolveConflict(conflict.id, 'local')).ok, false);
  fixture.local.records = [preset('conflict', 78)];
  const restarted = new fixture.Runtime({
    appId: 'rhythm', endpoint: 'https://example.test', adapter: fixture.local,
    store: fixture.store, accountClient: fixture.accountClient, accountCore: fixture.core,
    fetchImpl: fixture.fetchImpl, randomOperationId: fixture.nextId
  });
  const resumed = await restarted.resumeConflictResolutions();
  assert.equal(resumed.ok, false);
  assert.equal(resumed.code, 'local_changed_during_resolution');
  assert.equal(fixture.server.records.get('custom_preset/conflict').payload.bpm, 79);
  assert.equal(fixture.server.records.get('custom_preset/conflict').revision, 3);
  assert.equal(fixture.local.records[0].payload.bpm, 78);
  assert.equal((await fixture.store.listConflicts()).length, 1);
  assert.equal(await fixture.store.readMeta('runtimeState'), 'attention');
});

test('429, 5xx and network failures retain one retryable Local-wins intent', async (t) => {
  for (const failure of [
    { label: '429', status: 429, code: 'rate_limited' },
    { label: '5xx', status: 503, code: 'service_unavailable' },
    { label: 'network', network: true }
  ]) await t.test(failure.label, async () => {
    const fixture = await conflictFixture();
    fixture.server.nextPushFailure = failure;
    const [conflict] = await fixture.store.listConflicts();
    const first = await fixture.runtime.resolveConflict(conflict.id, 'local');
    assert.equal(first.ok, false);
    assert.equal(fixture.local.records[0].payload.bpm, 79);
    assert.equal((await fixture.store.listConflicts()).length, 1);
    const second = await fixture.runtime.resolveConflict(conflict.id, 'local');
    assert.equal(second.ok, true);
    assert.equal(fixture.server.records.get('custom_preset/conflict').payload.bpm, 79);
    assert.equal(fixture.server.records.get('custom_preset/conflict').revision, 3);
  });
});

test('offline resolution persists intent without applying either side and resumes safely online', async () => {
  const fixture = await conflictFixture();
  fixture.context.navigator.onLine = false;
  const [conflict] = await fixture.store.listConflicts();
  const pending = await fixture.runtime.resolveConflict(conflict.id, 'remote');
  assert.equal(pending.ok, false);
  assert.equal(pending.code, 'resolution_offline');
  assert.equal(fixture.local.records[0].payload.bpm, 79);
  assert.equal(fixture.server.records.get('custom_preset/conflict').payload.bpm, 81);
  fixture.context.navigator.onLine = true;
  const resumed = await fixture.runtime.resumeConflictResolutions();
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  assert.equal(fixture.local.records[0].payload.bpm, 81);
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

test('one of two conflicts resolves without changing the other local variant', async () => {
  const fixture = await conflictFixture(['one', 'two']);
  const conflicts = await fixture.store.listConflicts();
  assert.equal(conflicts.length, 2);
  const one = conflicts.find((entry) => entry.recordId === 'one');
  const result = await fixture.runtime.resolveConflict(one.id, 'remote');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.remaining, 1);
  assert.equal(fixture.local.records.find((record) => record.recordId === 'one').payload.bpm, 81);
  assert.equal(fixture.local.records.find((record) => record.recordId === 'two').payload.bpm, 79);
  assert.equal((await fixture.store.listConflicts()).length, 1);
  assert.equal(await fixture.store.readMeta('runtimeState'), 'attention');
});

test('edit/delete and delete/edit divergences remain tombstone conflicts without automatic writes', async (t) => {
  await t.test('local edit vs remote delete', async () => {
    const fixture = runtimeFixture([preset('conflict', 80)], 'rhythm');
    await fixture.runtime.consumeHandoff('transient');
    fixture.local.records = [preset('conflict', 79)];
    setRemoteVariant(fixture, 'conflict', 0, { deleted: true });
    const pushes = fixture.server.pushCalls;
    const result = await fixture.runtime.sync('focus');
    assert.equal(result.code, 'conflict');
    assert.equal(fixture.server.pushCalls, pushes);
    assert.equal((await fixture.store.listConflicts()).length, 1);
  });
  await t.test('local delete vs remote edit', async () => {
    const fixture = runtimeFixture([preset('conflict', 80)], 'rhythm');
    await fixture.runtime.consumeHandoff('transient');
    fixture.local.records = [];
    setRemoteVariant(fixture, 'conflict', 81);
    const pushes = fixture.server.pushCalls;
    const result = await fixture.runtime.sync('focus');
    assert.equal(result.code, 'conflict');
    assert.equal(fixture.server.pushCalls, pushes);
    assert.equal((await fixture.store.listConflicts()).length, 1);
  });
});
