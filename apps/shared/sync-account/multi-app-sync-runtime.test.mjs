import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { validatePortLocalCollections } from '../../cruise-port/port-sync-local-validation.js';
import { METRONOME_DEFAULTS } from '../../cruise-port/metronome-store.js';
import { loadMetronomePresets, deleteMetronomePreset } from '../../cruise-port/metronome-presets-store.js';
import { validateOperation as validateWorkerOperation } from '../../../workers/sound-cruise-sync/src/records.js';

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
    crypto: webcrypto, Headers, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout,
    structuredClone, EventTarget, CustomEvent: CustomEventPolyfill,
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
  vm.runInNewContext(readFileSync(new URL('./settings-field-merge.js', import.meta.url), 'utf8'), context);
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
    validateSnapshot: () => true,
    computeManifest: async (snapshot) => `manifest-${snapshot.records.map((record) => record.recordId).sort().join('-')}`,
    getConflictPresentation: ({ localRecord, remoteRecord }) => ({
      appName: 'リズムクルーズ', title: 'カスタムプリセット',
      name: localRecord?.payload?.name || remoteRecord?.payload?.name || '削除済みの項目',
      localUpdatedAt: localRecord?.payload?.updatedAt,
      remoteUpdatedAt: remoteRecord?.payload?.updatedAt,
      fields: [{ label: 'BPM', local: String(localRecord?.payload?.bpm ?? '削除済み'), remote: String(remoteRecord?.payload?.bpm ?? '削除済み') }]
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
    beforeNextPush: null, beforePushOperation: null, pushCalls: 0, pushBatchSizes: [],
    pushedOperationIds: [], operations: new Map()
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
      if (server.beforePushOperation) await server.beforePushOperation(server, body.operations);
      server.pushBatchSizes.push(body.operations.length);
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

function installInvalidRecordRecovery(fixture) {
  const invalid = (record) => record?.payload?.invalid === true && record.deletedAt == null;
  fixture.local.normalizeLocalSnapshot = (value) => {
    if (value.records.some(invalid)) throw new Error('synthetic_invalid_record');
    return structuredClone(value);
  };
  fixture.local.normalizeLocalSnapshotForRecovery = (value) => {
    const broken = value.records.filter(invalid);
    return {
      snapshot: { ...structuredClone(value), records: value.records.filter((record) => !invalid(record)) },
      issues: broken.map((record) => ({ recordKey: `${record.recordType}/${record.recordId}`,
        recordType: record.recordType, recordId: record.recordId, reason: 'synthetic_unreadable' })),
      isolatedKeys: broken.map((record) => `${record.recordType}/${record.recordId}`)
    };
  };
  fixture.local.partitionSyncRecords = (records) => {
    const broken = records.filter(invalid);
    return {
      records: structuredClone(records.filter((record) => !invalid(record))),
      issues: broken.map((record) => ({ recordKey: `${record.recordType}/${record.recordId}`,
        recordType: record.recordType, recordId: record.recordId, reason: 'synthetic_unreadable' })),
      isolatedKeys: broken.map((record) => `${record.recordType}/${record.recordId}`)
    };
  };
}

test('Pitch local read repairs a stale referenced chord from the saved shadow once', async () => {
  const fixture = runtimeFixture([]);
  let invalid = true;
  let repairs = 0;
  fixture.local.normalizeLocalSnapshot = (value) => {
    if (invalid) throw new Error('pitch_legacy_chord_stage_reference_invalid');
    return value;
  };
  fixture.local.repairMissingLegacyReferences = async (shadow) => {
    assert.equal(shadow.length, 1);
    repairs += 1;
    invalid = false;
    return true;
  };
  await fixture.store.putShadow('custom_chord/qa', { recordType: 'custom_chord', recordId: 'qa' });
  assert.equal((await fixture.runtime.localRecords()).records.length, 0);
  assert.equal((await fixture.runtime.localRecords()).records.length, 0);
  assert.equal(repairs, 1);
});

function realPortFixture(values, fetchImpl = null) {
  const deviceId = fetchImpl ? 'second' : 'first';
  const Runtime = loadRuntime();
  const context = Runtime.testContext;
  const data = new Map(Object.entries(values));
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key)
  };
  context.URL = URL;
  context.localStorage = storage;
  context.SoundCruisePortSync = { validateLocalStorage: validatePortLocalCollections };
  vm.runInNewContext(readFileSync(new URL('../../cruise-port/port-sync-adapter.js', import.meta.url), 'utf8'), context);
  const adapter = new context.SoundCruisePortSync.PortSyncAdapter({ storage, cryptoImpl: webcrypto });
  const store = memoryStore();
  const server = fetchImpl ? null : serverFetch();
  let id = 0;
  const core = { validAppCredential: (value) => value === 'scd1.valid',
    validQaCredential: (value) => value === 'scq1.valid', createOperationId: () => `port-${deviceId}-${++id}` };
  const accountClient = { admissionMode: 'qa', async consumeHandoff() {
    return { consumeMode: 'new_app', membershipId: 'm1', membershipState: 'active',
      appDeviceCredential: 'scd1.valid', qaCredential: 'scq1.valid' };
  }, async confirmConsumePersisted() {} };
  const runtime = new Runtime({ appId: 'port', endpoint: 'https://example.test', adapter,
    store, accountClient, accountCore: core, fetchImpl: fetchImpl || server.fetchImpl,
    randomOperationId: () => `port-${deviceId}-${++id}` });
  return { runtime, adapter, storage, store, server: server?.server, fetchImpl: fetchImpl || server.fetchImpl };
}

test('real Port adapter, store validator and runtime retain same-name presets from two devices', async () => {
  const preset = (id) => ({ id, name: 'Rock 120', ...METRONOME_DEFAULTS,
    accents: [...METRONOME_DEFAULTS.accents], createdAt: 1000, updatedAt: 1000 });
  const key = 'cruisePort.metronomePresets';
  const a = realPortFixture({ [key]: JSON.stringify({ version: 1, items: [preset('preset-a')] }) });
  await a.runtime.consumeHandoff('a');
  const b = realPortFixture({ [key]: JSON.stringify({ version: 1, items: [preset('preset-b')] }) }, a.fetchImpl);
  await b.runtime.consumeHandoff('b');
  await a.runtime.sync('pull-b');
  for (const [label, target] of [['a', a], ['b', b]]) {
    assert.deepEqual(JSON.parse(target.storage.getItem(key)).items.map((item) => item.id).sort(),
      ['preset-a', 'preset-b'], `${label}; cloud=${[...a.server.records.keys()].join(',')}`);
  }
  assert.equal([...a.server.records.values()].filter((item) => item.deletedAt != null).length, 0);
});

test('real Port two-device merge retains 7,999 history events plus two new events', async () => {
  const event = (index) => ({ id: `history-${index}`, type: 'cycle-completed',
    timestamp: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
    localDate: '2026-01-01', cycleId: `cycle-${index}`,
    practiceId: null, practiceName: null, durationMinutes: null, appId: null });
  const key = 'cruisePort.practiceHistory';
  const a = realPortFixture({ [key]: JSON.stringify({ version: 5,
    events: Array.from({ length: 7999 }, (_, index) => event(index)) }) });
  await a.runtime.consumeHandoff('a');
  const b = realPortFixture({ [key]: JSON.stringify({ version: 5,
    events: [event(7999), event(8000)] }) }, a.fetchImpl);
  await b.runtime.consumeHandoff('b');
  await a.runtime.sync('pull-b');
  for (const target of [a, b]) {
    const events = JSON.parse(target.storage.getItem(key)).events;
    assert.equal(events.length, 8001);
    assert.equal(new Set(events.map((item) => item.id)).size, 8001);
    assert.equal(events[0].id, 'history-0');
    assert.equal(events.at(-1).id, 'history-8000');
  }
  assert.equal([...a.server.records.values()].filter((item) => item.deletedAt != null).length, 0);
});

test('confirmed Port deletion cleans its intent only after response-loss recovery', async () => {
  const key = 'cruisePort.metronomePresets';
  const preset = { id: 'preset-a', name: 'Rock 120', ...METRONOME_DEFAULTS,
    accents: [...METRONOME_DEFAULTS.accents], createdAt: 1000, updatedAt: 1000 };
  const fixture = realPortFixture({ [key]: JSON.stringify({ version: 1, items: [preset] }) });
  await fixture.runtime.consumeHandoff('base');
  fixture.storage.setItem(key, JSON.stringify({ version: 1, items: [] }));
  fixture.storage.setItem('cruisePort.syncDeletionIntent.v1', JSON.stringify({ 'metronome_preset/preset-a': true }));
  fixture.server.responseLossAfterApply = true;
  await assert.rejects(fixture.runtime.sync('delete'), (error) => error.code === 'network_error');
  assert.equal(JSON.parse(fixture.storage.getItem('cruisePort.syncDeletionIntent.v1'))['metronome_preset/preset-a'], true);
  fixture.runtime.now = () => Date.now() + 500000;
  await fixture.runtime.sync('retry-delete');
  assert.equal(fixture.storage.getItem('cruisePort.syncDeletionIntent.v1'), null);
  assert.ok(fixture.server.records.get('metronome_preset/preset-a').deletedAt);
});

test('real Port interrupted migration sends only an explicit deletion and completes after response loss', async () => {
  const key = 'cruisePort.metronomePresets';
  const make = (id) => ({ id, name: id, ...METRONOME_DEFAULTS,
    accents: [...METRONOME_DEFAULTS.accents], createdAt: 1000, updatedAt: 1000 });
  const fixture = realPortFixture({ [key]: JSON.stringify({ version: 1,
    items: [make('keep'), make('delete')] }) });
  await fixture.runtime.consumeHandoff('partial');
  fixture.server.state = 'initializing';
  for (const record of fixture.server.records.values()) record.ownedByCurrentDevice = true;
  const loaded = loadMetronomePresets(fixture.storage);
  assert.equal(loaded.ok, true);
  assert.equal(deleteMetronomePreset({ presets: loaded.presets, id: 'delete', storage: fixture.storage }).ok, true);
  assert.equal(JSON.parse(fixture.storage.getItem('cruisePort.syncDeletionIntent.v1'))['metronome_preset/delete'], true);
  fixture.server.responseLossAfterApply = true;
  await assert.rejects(fixture.runtime.initializeDataset(), (error) => error.code === 'network_error');
  assert.equal(JSON.parse(fixture.storage.getItem('cruisePort.syncDeletionIntent.v1'))['metronome_preset/delete'], true);
  assert.ok(fixture.server.records.get('metronome_preset/delete').deletedAt);
  assert.equal(fixture.server.records.get('metronome_preset/keep').deletedAt, null);
  assert.equal((await fixture.runtime.initializeDataset()).ok, true);
  assert.equal(fixture.server.state, 'ready');
  assert.equal(fixture.storage.getItem('cruisePort.syncDeletionIntent.v1'), null);
  assert.equal((await fixture.store.listOutbox()).length, 0);
  const serverLive = [...fixture.server.records.values()].filter((record) => record.deletedAt == null);
  assert.equal(await fixture.adapter.computeManifest(fixture.adapter.deserializeRecords(serverLive)),
    await fixture.adapter.computeManifest((await fixture.runtime.localRecords()).snapshot));
});

test('real Port migration never tombstones an absent remote record without deletion intent', async () => {
  const key = 'cruisePort.metronomePresets';
  const fixture = realPortFixture({ [key]: JSON.stringify({ version: 1, items: [] }) });
  await fixture.store.setMeta('credential', 'scd1.valid');
  await fixture.store.setMeta('qaCredential', 'scq1.valid');
  fixture.server.state = 'initializing';
  const remote = { id: 'remote-only', name: 'Remote', ...METRONOME_DEFAULTS,
    accents: [...METRONOME_DEFAULTS.accents], createdAt: 1000, updatedAt: 1000 };
  const source = realPortFixture({ [key]: JSON.stringify({ version: 1, items: [remote] }) });
  const operation = await source.runtime.operationFor((await source.runtime.localRecords()).records
    .find((record) => record.recordType === 'metronome_preset'), 0);
  fixture.server.records.set('metronome_preset/remote-only', { ...operation, revision: 1,
    deletedAt: null, changeSeq: 1, ownedByCurrentDevice: true });
  fixture.server.revision = 1;
  // An absent record with no intent is hydrated or retained, never deleted.
  await fixture.runtime.initializeDataset();
  assert.equal(fixture.server.records.get('metronome_preset/remote-only').deletedAt, null);
});

test('real Port free text data URL shape survives adapter serialization and Worker validation', async () => {
  const key = 'cruisePort.metronomePresets';
  const preset = { id: 'text-note', name: 'data:text/plain,practice note',
    ...METRONOME_DEFAULTS, accents: [...METRONOME_DEFAULTS.accents],
    createdAt: 1000, updatedAt: 1000 };
  const fixture = realPortFixture({ [key]: JSON.stringify({ version: 1, items: [preset] }) });
  const record = (await fixture.runtime.localRecords()).records.find((item) =>
    item.recordType === 'metronome_preset' && item.recordId === 'text-note');
  const { recordType, recordId, schemaVersion, baseRevision, payload, payloadHash, deleted } =
    await fixture.runtime.operationFor(record, 0);
  const operation = { operationId: webcrypto.randomUUID(), recordType, recordId,
    schemaVersion, baseRevision, payload, payloadHash, deleted };
  const validation = await validateWorkerOperation(operation, webcrypto, 'port');
  assert.equal(validation.ok, true, validation.code);
});

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

test('Port never reports Pro-app removal safety while Pro apps still do', async () => {
  const port = runtimeFixture([], 'port', 'production');
  let portCalls = 0;
  port.runtime.request = async () => { portCalls += 1; };
  await port.runtime.reportRemovalSafety('clean');
  assert.equal(portCalls, 0);

  const pitch = runtimeFixture([], 'pitch', 'production');
  let request;
  pitch.runtime.request = async (...args) => { request = args; };
  await pitch.runtime.reportRemovalSafety('clean');
  assert.equal(request[0], 'POST');
  assert.equal(request[1], '/v1/sync/removal-safety');
  assert.equal(request[2].appId, 'pitch');
  assert.equal(request[2].state, 'clean');
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

test('an interrupted initializing migration resumes only when every partial record belongs to this device', async () => {
  const local = record('gear-1', 'Local with photo', 'gear_item');
  const added = record('gear-2', 'New local gear', 'gear_item');
  const fixture = runtimeFixture([local, added], 'port', 'production');
  await fixture.store.setMeta('credential', 'scd1.valid');
  fixture.server.state = 'initializing';
  fixture.server.revision = 1;
  fixture.server.records.set('gear_item/gear-1', {
    ...record('gear-1', 'Older partial upload', 'gear_item'),
    revision: 1, deletedAt: null, changeSeq: 1, operationId: 'old-operation',
    ownedByCurrentDevice: true
  });
  fixture.local.mergeSnapshots = () => { throw new Error('own partial migration must not enter conflict merge'); };

  const result = await fixture.runtime.initializeDataset();

  assert.equal(result.ok, true);
  assert.equal(fixture.server.state, 'ready');
  assert.equal(fixture.server.records.get('gear_item/gear-1').payload.name, 'Local with photo');
  assert.equal(fixture.server.records.get('gear_item/gear-2').payload.name, 'New local gear');
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

test('a conflict-resolved migration resumes from its exact remote shadow without recreating conflicts', async () => {
  const chosen = record('order', 'Chosen local order', 'my_app_order');
  const remote = {
    ...record('order', 'Older remote order', 'my_app_order'),
    revision: 2, deletedAt: null, changeSeq: 2, operationId: 'remote-operation',
    ownedByCurrentDevice: false
  };
  const fixture = runtimeFixture([chosen], 'port', 'production');
  await fixture.store.setMeta('credential', 'scd1.valid');
  fixture.server.state = 'ready';
  fixture.server.revision = 2;
  fixture.server.records.set('my_app_order/order', structuredClone(remote));
  await fixture.store.putShadow('my_app_order/order', structuredClone(remote));
  fixture.local.mergeSnapshots = () => { throw new Error('resolved migration must not recreate the same conflict'); };

  const result = await fixture.runtime.initializeDataset();

  assert.equal(result.ok, true);
  assert.equal(fixture.server.state, 'ready');
  assert.equal(fixture.server.records.get('my_app_order/order').payload.name, 'Chosen local order');
  assert.equal(await fixture.store.readMeta('migrationState'), 'complete');
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

test('resolved initial merge hydrates a remote-only singleton instead of deleting it', async () => {
  const fixture = runtimeFixture([record('settings', 'local', 'settings')], 'port');
  await fixture.runtime.consumeHandoff('base');
  const singleton = record('default', 'tuner', 'tuner_settings');
  const operation = await fixture.runtime.operationFor(singleton, 0);
  fixture.server.records.set('tuner_settings/default', { ...operation, revision: 1,
    deletedAt: null, changeSeq: ++fixture.server.revision });
  await fixture.store.putShadow('tuner_settings/default', fixture.server.records.get('tuner_settings/default'));
  const result = await fixture.runtime.initializeDataset();
  assert.equal(result.ok, true);
  assert.equal(fixture.local.records.some((item) => item.recordType === 'tuner_settings'), true);
  assert.equal(fixture.server.records.get('tuner_settings/default').deletedAt, null);
});

test('an oversized migration retries the retained invalid-request cohort in Worker-sized batches', async () => {
  const records = Array.from({ length: 85 }, (_, index) => record(`item-${index}`, `Item ${index}`));
  const fixture = runtimeFixture(records, 'port', 'production');
  await fixture.store.setMeta('credential', 'scd1.valid');
  const local = await fixture.runtime.localRecords();
  await fixture.runtime.queueDiff(local.records, [], [], { migration: true });
  for (const operation of await fixture.store.listOutbox()) {
    await fixture.store.putOutbox({ ...operation, attempts: 1, terminalError: 'invalid_request' });
  }

  const result = await fixture.runtime.initializeDataset();

  assert.equal(result.ok, true);
  assert.deepEqual(fixture.server.pushBatchSizes, [50, 35]);
  assert.equal(fixture.server.records.size, 85);
  assert.equal((await fixture.store.listOutbox()).length, 0);
  assert.equal(await fixture.store.readMeta('migrationState'), 'complete');
});

test('a corrected mutation supersedes only its stale terminal outbox operation', async () => {
  const stale = record('attachment-1', 'decomposed filename', 'practice_attachment');
  const corrected = record('attachment-1', 'normalized filename', 'practice_attachment');
  const fixture = runtimeFixture([corrected], 'port', 'production');
  const staleOperation = await fixture.runtime.operationFor(stale, 0);
  await fixture.store.putOutbox({ ...staleOperation, migration: true, terminalError: 'invalid_payload' });

  await fixture.runtime.queueDiff([corrected], [], [], { migration: true });

  const outbox = await fixture.store.listOutbox();
  assert.equal(outbox.length, 1);
  assert.notEqual(outbox[0].operationId, staleOperation.operationId);
  assert.equal(outbox[0].payloadHash, corrected.payloadHash);
  assert.equal(outbox[0].terminalError, undefined);
  assert.equal(outbox[0].migration, true);
});

test('an unchanged terminal mutation remains fail-closed', async () => {
  const unchanged = record('attachment-1', 'same invalid payload', 'practice_attachment');
  const fixture = runtimeFixture([unchanged], 'port', 'production');
  const terminal = await fixture.runtime.operationFor(unchanged, 0);
  await fixture.store.putOutbox({ ...terminal, migration: true, terminalError: 'invalid_payload' });

  await fixture.runtime.queueDiff([unchanged], [], [], { migration: true });

  assert.deepEqual(await fixture.store.listOutbox(), [{ ...terminal, migration: true, terminalError: 'invalid_payload' }]);
});

test('an initializing snapshot containing another device record remains fail-closed', async () => {
  const local = record('gear-1', 'Local', 'gear_item');
  const fixture = runtimeFixture([local], 'port', 'production');
  await fixture.store.setMeta('credential', 'scd1.valid');
  fixture.server.state = 'initializing';
  fixture.server.records.set('gear_item/gear-1', {
    ...record('gear-1', 'Other device', 'gear_item'), revision: 1,
    deletedAt: null, changeSeq: 1, operationId: 'other-operation',
    ownedByCurrentDevice: false
  });
  fixture.local.mergeSnapshots = () => ({ snapshot: null, conflicts: [{ recordKey: 'gear_item/gear-1', reason: 'same_record_changed' }] });

  const result = await fixture.runtime.initializeDataset();

  assert.equal(result.ok, false);
  assert.equal(result.code, 'merge_conflict');
  assert.equal(fixture.server.state, 'initializing');
  assert.equal((await fixture.store.listConflicts()).length, 1);
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
  await remoteCaptured.promise;
  fixture.local.records = [a, b];
  fixture.runtime.sync('save');
  releasePull.resolve();
  await pulling;

  await localCaptured.promise;

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

test('retry timer firing with save and online requests coalesces without a duplicate storm', async () => {
  const a = record('a');
  const b = record('b');
  const fixture = runtimeFixture([a], 'rhythm');
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
  fixture.runtime.sync('retry-timer');
  fixture.runtime.sync('retry-timer');
  fixture.runtime.sync('save');
  fixture.runtime.sync('online');
  release.resolve();
  await first;

  assert.equal(runs, 2);
  assert.equal(fixture.server.records.get('custom_record/b')?.deletedAt, null);
  assert.equal(fixture.server.revision, 2);
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

test('an online wake-up arriving before an offline run settles sends the latest save without reload', async () => {
  const a = record('a');
  const b = record('b');
  const fixture = runtimeFixture([a], 'fretboard');
  await fixture.runtime.consumeHandoff('transient');
  const started = deferred();
  const release = deferred();
  const originalPerformSync = fixture.runtime.performSync.bind(fixture.runtime);
  let runs = 0;
  fixture.runtime.performSync = async (reason) => {
    runs += 1;
    if (runs === 1) {
      started.resolve();
      await release.promise;
      return { ok: false, code: 'offline' };
    }
    return originalPerformSync(reason);
  };

  fixture.context.navigator.onLine = false;
  const first = fixture.runtime.sync('focus');
  await started.promise;
  fixture.local.records = [a, b];
  fixture.runtime.sync('save');
  fixture.context.navigator.onLine = true;
  fixture.runtime.sync('online');
  release.resolve();
  const result = await first;

  assert.equal(result.ok, true);
  assert.equal(runs, 2);
  assert.equal(fixture.server.records.get('custom_record/b')?.deletedAt, null);
  assert.equal(fixture.runtime.running, null);
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

test('attention summary separates conflicts, retryable legacy work and data repair without using record count', async () => {
  const fixture = runtimeFixture(Array.from({ length: 12 }, (_, index) => record(`r${index}`)), 'pitch');
  assert.equal((await fixture.runtime.attentionSummary()).kind, 'retry');
  await fixture.store.putConflict({ id: 'c1', kind: 'pull', recordKey: 'custom_record/r0' });
  let summary = await fixture.runtime.attentionSummary();
  assert.equal(summary.kind, 'conflict');
  assert.equal(summary.count, 1);
  assert.equal(summary.status, '確認が必要 1件');
  await fixture.store.putConflict({ id: 'c2', kind: 'invalid_record', recordKey: 'custom_record/r1' });
  summary = await fixture.runtime.attentionSummary();
  assert.equal(summary.kind, 'data_repair');
  assert.equal(summary.count, 2);
  assert.equal(summary.reviewable, true);
  await fixture.store.deleteConflict('c1');
  await fixture.store.deleteConflict('c2');
  await fixture.store.putOutbox({ operationId: 'legacy', terminalError: 'push_failed' });
  assert.equal((await fixture.runtime.attentionSummary()).kind, 'retry');
  await fixture.store.putOutbox({ operationId: 'invalid', terminalError: 'invalid_record', failureKind: 'terminal' });
  summary = await fixture.runtime.attentionSummary();
  assert.equal(summary.kind, 'data_repair');
  assert.equal(summary.reviewable, undefined);
  assert.match(summary.description, /保存し直してください/);
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
  assert.equal(item.presentation.appName, 'リズムクルーズ');
  assert.equal(item.presentation.localUpdatedAt, null);
  assert.equal(item.presentation.remoteUpdatedAt, null);
  assert.deepEqual(JSON.parse(JSON.stringify(item.presentation.fields)), [
    { label: 'BPM', local: '79', remote: '81' }
  ]);
});

test('presentation keeps only valid adapter timestamps and fails unknown timestamps closed', async () => {
  const fixture = await conflictFixture();
  fixture.local.records[0].payload.updatedAt = 1789999200000;
  fixture.server.records.get('custom_preset/conflict').payload.updatedAt = '2026-09-22T09:00:00.000Z';
  const [item] = await fixture.runtime.listConflictPresentations();
  assert.equal(item.presentation.localUpdatedAt, 1789999200000);
  assert.equal(item.presentation.remoteUpdatedAt, Date.parse('2026-09-22T09:00:00.000Z'));
  fixture.local.records[0].payload.updatedAt = 'not-a-time';
  fixture.server.records.get('custom_preset/conflict').payload.updatedAt = null;
  const [unknown] = await fixture.runtime.listConflictPresentations();
  assert.equal(unknown.presentation.localUpdatedAt, null);
  assert.equal(unknown.presentation.remoteUpdatedAt, null);
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

for (const choice of ['remote', 'local']) {
  test(`${choice} conflict choice retains an unrelated remote edit through the next pull`, async () => {
    const fixture = runtimeFixture([preset('x', 80), preset('y', 80)], 'rhythm');
    await fixture.runtime.consumeHandoff('base');
    fixture.local.records = [preset('x', 79), preset('y', 80)];
    setRemoteVariant(fixture, 'x', 81);
    setRemoteVariant(fixture, 'y', 82);
    assert.equal((await fixture.runtime.sync('conflict')).code, 'conflict');
    const [conflict] = await fixture.store.listConflicts();
    assert.equal(conflict.recordKey, 'custom_preset/x');
    assert.equal((await fixture.runtime.resolveConflict(conflict.id, choice)).ok, true);
    assert.equal((await fixture.store.getShadow('custom_preset/y')).payload.bpm, 80);
    await fixture.runtime.sync('pull-y');
    assert.equal(fixture.local.records.find((item) => item.recordId === 'x').payload.bpm,
      choice === 'remote' ? 81 : 79);
    assert.equal(fixture.local.records.find((item) => item.recordId === 'y').payload.bpm, 82);
  });
}

test('Remote wins verifies an adapter-normalized Local projection without requiring whole-dataset equality', async () => {
  const fixture = await conflictFixture();
  fixture.local.prepareRemoteResolutionSnapshot = async (snapshot) => ({
    ...structuredClone(snapshot),
    records: snapshot.records.map((item) => item.recordId === 'conflict'
      ? { ...structuredClone(item), payload: { ...structuredClone(item.payload), normalized: true } }
      : structuredClone(item))
  });
  fixture.local.serializeRecords = async (snapshot) => snapshot.records.map((item) => ({
    ...structuredClone(item), payloadHash: `projected-${JSON.stringify(item.payload)}`
  }));
  fixture.local.computeManifest = async (snapshot) => `projected-manifest-${JSON.stringify(snapshot.records)}`;
  const pushes = fixture.server.pushCalls;
  const [conflict] = await fixture.store.listConflicts();
  const result = await fixture.runtime.resolveConflict(conflict.id, 'remote');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(fixture.local.records[0].payload.bpm, 81);
  assert.equal(fixture.local.records[0].payload.normalized, true);
  assert.equal(fixture.server.pushCalls, pushes, 'Remote choice must not write to the server');
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

test('three Remote choices converge normal, order-like and tombstone conflicts without a false verification failure', async () => {
  const fixture = runtimeFixture([
    preset('normal', 80), preset('order-like', 80), preset('deleted', 80)
  ], 'rhythm');
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.records = [preset('normal', 79), preset('order-like', 79), preset('deleted', 79)];
  setRemoteVariant(fixture, 'normal', 81);
  setRemoteVariant(fixture, 'order-like', 81);
  setRemoteVariant(fixture, 'deleted', 0, { deleted: true });
  assert.equal((await fixture.runtime.sync('focus')).code, 'conflict');
  const pushes = fixture.server.pushCalls;
  for (const conflict of await fixture.store.listConflicts()) {
    const result = await fixture.runtime.resolveConflict(conflict.id, 'remote');
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  assert.equal(fixture.local.records.find((item) => item.recordId === 'normal').payload.bpm, 81);
  assert.equal(fixture.local.records.find((item) => item.recordId === 'order-like').payload.bpm, 81);
  assert.equal(fixture.local.records.some((item) => item.recordId === 'deleted'), false);
  assert.equal(fixture.server.pushCalls, pushes);
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

function settingsRecord(values) {
  const payload = { id: 'settings', values };
  return { recordType: 'settings', recordId: 'settings', schemaVersion: 1,
    payload, payloadHash: `hash-${JSON.stringify(values)}` };
}

async function settingsConflictFixture() {
  const initial = { keyRandomMode: false, noteSpeed: 1, builtinChordEnabled: { A: true } };
  const fixture = runtimeFixture([settingsRecord(initial)], 'pitch');
  fixture.runtime.adapter.serializeRecords = async (snapshot) => snapshot.records.map((item) =>
    item.recordType === 'settings' ? settingsRecord(item.payload.values) : item);
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.records = [settingsRecord({ keyRandomMode: true, noteSpeed: 3,
    builtinChordEnabled: { A: true, B: false } })];
  const previous = fixture.server.records.get('settings/settings');
  fixture.server.records.set('settings/settings', { ...settingsRecord({ keyRandomMode: false,
    noteSpeed: 2, builtinChordEnabled: { A: true, C: true }, futureOption: 'kept' }),
    revision: previous.revision + 1, operationId: 'remote-settings', deletedAt: null,
    changeSeq: ++fixture.server.revision });
  assert.equal((await fixture.runtime.sync('focus')).code, 'conflict');
  return fixture;
}

test('settings conflict presents only overlapping fields and preserves one-sided additions', async () => {
  const fixture = await settingsConflictFixture();
  const [item] = await fixture.runtime.listConflictPresentations();
  assert.equal(item.settings.fields.length, 1);
  assert.equal(item.settings.fields[0].path, '/noteSpeed');
  assert.equal(item.settings.fields[0].local, 3);
  assert.equal(item.settings.fields[0].remote, 2);
  const result = await fixture.runtime.resolveConflict(item.id, 'merged',
    { fieldChoices: { '/noteSpeed': 'local' } });
  assert.equal(result.ok, true, JSON.stringify(result));
  const values = fixture.server.records.get('settings/settings').payload.values;
  assert.equal(values.keyRandomMode, true);
  assert.equal(values.noteSpeed, 3);
  assert.deepEqual(values.builtinChordEnabled, { A: true, B: false, C: true });
  assert.equal(values.futureOption, 'kept');
  assert.equal((await fixture.store.listConflicts()).length, 0);
  assert.equal(fixture.server.records.get('settings/settings').revision, 3);
});

test('merged settings response loss resumes one operation without discarding either side', async () => {
  const fixture = await settingsConflictFixture();
  const [item] = await fixture.runtime.listConflictPresentations();
  fixture.server.responseLossAfterApply = true;
  const first = await fixture.runtime.resolveConflict(item.id, 'merged',
    { fieldChoices: { '/noteSpeed': 'remote' } });
  assert.equal(first.ok, false);
  const revision = fixture.server.records.get('settings/settings').revision;
  const resumed = await fixture.runtime.resumeConflictResolutions();
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  assert.equal(fixture.server.records.get('settings/settings').revision, revision);
  assert.equal(fixture.server.records.get('settings/settings').payload.values.noteSpeed, 2);
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

test('real adapters merge sparse default resets with unrelated edits and expose true conflicts', () => {
  const cases = [
    { appId: 'fretboard', file: '../../fretboard_cruise/sync/fretboard-sync-adapter.js',
      root: 'SoundCruiseFretboardSync', name: 'FretboardSyncAdapter',
      raw: { fretboard_cruise_state: JSON.stringify({ settings: { tempo: 75 } }) },
      shadow: { tempo: 96 }, remote: { tempo: 96, quizTimeLimit: 6 },
      conflict: { tempo: 120 }, resetKey: 'tempo', resetValue: 75, unrelatedKey: 'quizTimeLimit', unrelatedValue: 6 },
    { appId: 'pitch', file: '../../pitch-cruise/sync/pitch-sync-adapter.js',
      root: 'SoundCruisePitchSync', name: 'PitchSyncAdapter',
      raw: { pitchTrainerTestModeEnabled: 'false' },
      shadow: { testModeEnabled: true }, remote: { testModeEnabled: true, noteSpeed: 2 },
      conflict: { testModeEnabled: true }, resetKey: 'testModeEnabled', resetValue: false,
      unrelatedKey: 'noteSpeed', unrelatedValue: 2 },
    { appId: 'rhythm', file: '../../rhythm-cruise/sync/rhythm-sync-adapter.js',
      root: 'SoundCruiseRhythmSync', name: 'RhythmSyncAdapter',
      raw: { rhythmCruiseSettings: JSON.stringify({}), 'rhythmCruiseClickSettings:v1': JSON.stringify({ offbeat: false }) },
      shadow: { clickOffbeat: true }, remote: { clickOffbeat: true, judgePreset: 'strict' },
      conflict: { clickOffbeat: true }, resetKey: 'clickOffbeat', resetValue: false,
      unrelatedKey: 'judgePreset', unrelatedValue: 'strict' }
  ];
  for (const item of cases) {
    const context = vm.createContext({ crypto: webcrypto, TextEncoder, structuredClone, URL, console });
    vm.runInContext(readFileSync(new URL(item.file, import.meta.url), 'utf8'), context);
    const real = new context[item.root][item.name]({ cryptoImpl: webcrypto });
    const localSnapshot = real.normalizeLocalSnapshot({ schemaVersion: 0, values: item.raw });
    const localRecord = localSnapshot.records.find((record) => record.recordType === 'settings') || null;
    assert.equal(localRecord?.payload.values[item.resetKey], undefined, item.appId);
    const fixture = runtimeFixture([], item.appId);
    fixture.runtime.adapter = real;
    const make = (values) => ({ recordType: 'settings', recordId: 'settings', schemaVersion: 1,
      payload: { id: 'settings', values } });
    const shadowRecord = make(item.shadow);
    const remoteRecord = make(item.remote);
    const plan = fixture.runtime.settingsFieldPlan({ localRecord, remoteRecord, shadowRecord });
    assert.equal(plan.unresolved, 0, item.appId);
    assert.equal(real.effectiveSettingsForMerge(plan.values)[item.resetKey], item.resetValue, item.appId);
    assert.equal(plan.values[item.unrelatedKey], item.unrelatedValue, item.appId);
    const disputed = fixture.runtime.settingsFieldPlan({ localRecord,
      remoteRecord: make({ ...item.shadow, ...item.conflict }), shadowRecord });
    // Boolean defaults have only two states, so a three-way same-field dispute
    // requires a third value; number and enum cases are covered separately.
    if (item.appId === 'fretboard') {
      assert.equal(disputed.unresolved, 1);
      assert.equal(disputed.conflicts[0].path, '/tempo');
      assert.equal(disputed.conflicts[0].local, 75);
      assert.equal(disputed.conflicts[0].remote, 120);
    }
    if (item.appId === 'pitch' || item.appId === 'rhythm') {
      const key = item.appId === 'pitch' ? 'noteSpeed' : 'judgePreset';
      const before = item.appId === 'pitch' ? 1 : 'semiStrict';
      const left = item.appId === 'pitch' ? 2 : 'easy';
      const right = item.appId === 'pitch' ? 3 : 'strict';
      const sameField = fixture.runtime.settingsFieldPlan({
        localRecord: make({ [key]: left }), remoteRecord: make({ [key]: right }),
        shadowRecord: make({ [key]: before })
      });
      assert.equal(sameField.unresolved, 1, item.appId);
      assert.equal(sameField.conflicts[0].path, `/${key}`);
      assert.equal(sameField.conflicts[0].local, left);
      assert.equal(sameField.conflicts[0].remote, right);
    }
  }
});

test('real adapter semantics retain future fields and nested enable flags', () => {
  const fixture = runtimeFixture([], 'rhythm');
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, structuredClone, URL, console });
  vm.runInContext(readFileSync(new URL('../../rhythm-cruise/sync/rhythm-sync-adapter.js', import.meta.url), 'utf8'), context);
  const api = context.SoundCruiseRhythmSync;
  fixture.runtime.adapter = new api.RhythmSyncAdapter({ cryptoImpl: webcrypto });
  const sample = api.BUILTIN_SAMPLE_STAGES[0].key;
  const make = (values) => ({ recordType: 'settings', recordId: 'settings', schemaVersion: 1,
    payload: { id: 'settings', values } });
  const plan = fixture.runtime.settingsFieldPlan({
    localRecord: make({ builtinSampleEnabled: { [sample]: false, 'future:sample': true } }),
    remoteRecord: make({ judgePreset: 'strict', futureSetting: ['a', { b: 1 }] }),
    shadowRecord: make({})
  });
  assert.equal(plan.unresolved, 0);
  assert.equal(plan.values.builtinSampleEnabled[sample], false);
  assert.equal(plan.values.builtinSampleEnabled['future:sample'], true);
  assert.equal(plan.values.judgePreset, 'strict');
  assert.deepEqual(JSON.parse(JSON.stringify(plan.values.futureSetting)), ['a', { b: 1 }]);
  const reenabled = fixture.runtime.settingsFieldPlan({
    localRecord: make({}), remoteRecord: make({ builtinSampleEnabled: { [sample]: false }, judgePreset: 'strict' }),
    shadowRecord: make({ builtinSampleEnabled: { [sample]: false } })
  });
  assert.equal(reenabled.unresolved, 0);
  assert.equal(reenabled.values.builtinSampleEnabled, undefined);
  assert.equal(reenabled.values.judgePreset, 'strict');
});

test('real Fretboard reset and remote edit complete sync without restoring old tempo', async () => {
  const fixture = runtimeFixture([], 'fretboard');
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, structuredClone, URL, console });
  vm.runInContext(readFileSync(new URL('../../fretboard_cruise/sync/fretboard-sync-adapter.js', import.meta.url), 'utf8'), context);
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
  const real = new context.SoundCruiseFretboardSync.FretboardSyncAdapter({ storage, cryptoImpl: webcrypto });
  fixture.runtime.adapter = real;
  const make = (values) => ({ appId: 'fretboard', schemaVersion: 1, records: [{
    recordType: 'settings', recordId: 'settings', schemaVersion: 1,
    payload: { id: 'settings', values }
  }] });
  const baseline = make({ tempo: 96 });
  const remote = make({ tempo: 96, quizTimeLimit: 6 });
  await real.applyRemoteSnapshot(baseline);
  data.set('fretboard_cruise_state', JSON.stringify({ settings: { tempo: 75 } }));
  assert.equal(real.normalizeLocalSnapshot().records.some((record) => record.recordType === 'settings'), false);
  const [shadow] = await real.serializeRecords(baseline);
  const [incoming] = await real.serializeRecords(remote);
  await fixture.store.putShadow('settings/settings', { ...shadow, revision: 1, deletedAt: null });
  fixture.server.records.set('settings/settings', { ...incoming, revision: 2,
    operationId: 'remote-edit', deletedAt: null, changeSeq: 2 });
  fixture.server.revision = 2;
  fixture.server.state = 'ready';
  await fixture.store.setMeta('credential', 'scd1.valid');
  await fixture.store.setMeta('qaCredential', 'scq1.valid');
  await fixture.store.setMeta('migrationState', 'complete');
  const result = await fixture.runtime.performSync('semantic-reset');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(fixture.server.records.get('settings/settings').payload.values.tempo, undefined);
  assert.equal(fixture.server.records.get('settings/settings').payload.values.quizTimeLimit, 6);
  assert.equal(JSON.parse(data.get('fretboard_cruise_state')).settings.tempo, 75);
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

test('real Pitch OFF and Rhythm reset survive unrelated remote edits through sync', async () => {
  for (const item of [
    { appId: 'pitch', file: '../../pitch-cruise/sync/pitch-sync-adapter.js', root: 'SoundCruisePitchSync',
      name: 'PitchSyncAdapter', baseline: { testModeEnabled: true },
      incoming: { testModeEnabled: true, noteSpeed: 2 },
      reset: (data) => data.set('pitchTrainerTestModeEnabled', 'false'),
      check: (data) => assert.equal(data.get('pitchTrainerTestModeEnabled'), 'false'),
      absent: 'testModeEnabled', present: 'noteSpeed', expected: 2 },
    { appId: 'rhythm', file: '../../rhythm-cruise/sync/rhythm-sync-adapter.js', root: 'SoundCruiseRhythmSync',
      name: 'RhythmSyncAdapter', baseline: { clickOffbeat: true },
      incoming: { clickOffbeat: true, judgePreset: 'strict' },
      reset: (data) => data.set('rhythmCruiseClickSettings:v1', JSON.stringify({ offbeat: false })),
      check: (data) => assert.equal(JSON.parse(data.get('rhythmCruiseClickSettings:v1')).offbeat, false),
      absent: 'clickOffbeat', present: 'judgePreset', expected: 'strict' }
  ]) {
    const fixture = runtimeFixture([], item.appId);
    const context = vm.createContext({ crypto: webcrypto, TextEncoder, structuredClone, URL, console });
    vm.runInContext(readFileSync(new URL(item.file, import.meta.url), 'utf8'), context);
    const data = new Map();
    const storage = { getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
    const real = new context[item.root][item.name]({ storage, cryptoImpl: webcrypto });
    fixture.runtime.adapter = real;
    const make = (values) => ({ appId: item.appId, schemaVersion: 1, records: [{
      recordType: 'settings', recordId: 'settings', schemaVersion: 1,
      payload: { id: 'settings', values }
    }] });
    const baseline = make(real.encodeSettingsForMerge(real.effectiveSettingsForMerge(item.baseline)));
    await real.applyRemoteSnapshot(baseline);
    item.reset(data);
    const [shadow] = await real.serializeRecords(baseline);
    const [incoming] = await real.serializeRecords(make(
      real.encodeSettingsForMerge(real.effectiveSettingsForMerge(item.incoming))));
    await fixture.store.putShadow('settings/settings', { ...shadow, revision: 1, deletedAt: null });
    fixture.server.records.set('settings/settings', { ...incoming, revision: 2,
      operationId: 'remote-edit', deletedAt: null, changeSeq: 2 });
    fixture.server.revision = 2;
    fixture.server.state = 'ready';
    await fixture.store.setMeta('credential', 'scd1.valid');
    await fixture.store.setMeta('qaCredential', 'scq1.valid');
    await fixture.store.setMeta('migrationState', 'complete');
    const result = await fixture.runtime.performSync('semantic-reset');
    assert.equal(result.ok, true, `${item.appId}: ${JSON.stringify(result)}`);
    assert.equal(fixture.server.records.get('settings/settings').payload.values[item.absent], undefined, item.appId);
    assert.equal(fixture.server.records.get('settings/settings').payload.values[item.present], item.expected, item.appId);
    item.check(data);
    assert.equal((await fixture.store.listConflicts()).length, 0, item.appId);
  }
});

test('real Pitch all-default merge removes settings and converges for three cycles, including response loss', async () => {
  for (const loseResponse of [false, true]) {
    const fixture = runtimeFixture([], 'pitch');
    const context = vm.createContext({ crypto: webcrypto, TextEncoder, structuredClone, URL, console });
    vm.runInContext(readFileSync(new URL('../../pitch-cruise/sync/pitch-sync-adapter.js', import.meta.url), 'utf8'), context);
    const data = new Map();
    const storage = { getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
    const real = new context.SoundCruisePitchSync.PitchSyncAdapter({ storage, cryptoImpl: webcrypto });
    fixture.runtime.adapter = real;
    const make = (values) => ({ appId: 'pitch', schemaVersion: 1, records: [{
      recordType: 'settings', recordId: 'settings', schemaVersion: 1,
      payload: { id: 'settings', values: real.encodeSettingsForMerge(real.effectiveSettingsForMerge(values)) }
    }] });
    const baseline = make({ testModeEnabled: true, noteSpeed: 1.5 });
    const remote = make({ testModeEnabled: true, noteSpeed: 1 });
    await real.applyRemoteSnapshot(baseline);
    data.set('pitchTrainerTestModeEnabled', 'false');
    data.set('pitchTrainerSettings', JSON.stringify({ ...JSON.parse(data.get('pitchTrainerSettings')), noteSpeed: 1 }));
    assert.equal(real.normalizeLocalSnapshot().records.some((record) => record.recordType === 'settings'), false);
    const [shadow] = await real.serializeRecords(baseline);
    const [incoming] = await real.serializeRecords(remote);
    const plan = fixture.runtime.settingsFieldPlan({ localRecord: null, remoteRecord: incoming, shadowRecord: shadow });
    assert.equal(plan.unresolved, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(plan.values)), {});
    await fixture.store.putShadow('settings/settings', { ...shadow, revision: 1, deletedAt: null });
    fixture.server.records.set('settings/settings', { ...incoming, revision: 2,
      operationId: 'remote-default', deletedAt: null, changeSeq: 2 });
    fixture.server.revision = 2;
    fixture.server.state = 'ready';
    await fixture.store.setMeta('credential', 'scd1.valid');
    await fixture.store.setMeta('qaCredential', 'scq1.valid');
    await fixture.store.setMeta('migrationState', 'complete');
    fixture.server.responseLossAfterApply = loseResponse;
    if (loseResponse) {
      await assert.rejects(fixture.runtime.performSync('all-default'), (error) => error.code === 'network_error');
      assert.equal((await fixture.store.listOutbox()).length, 1);
      fixture.runtime.now = () => Date.now() + 10000;
    }
    const result = loseResponse ? await fixture.runtime.performSync('retry')
      : await fixture.runtime.performSync('all-default');
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(fixture.server.records.get('settings/settings').deletedAt !== null, true);
    assert.equal(fixture.server.records.get('settings/settings').revision, 3);
    if (loseResponse) assert.equal(fixture.server.pushCalls, 2);
    const canonical = real.normalizeLocalSnapshot();
    assert.equal(canonical.records.some((record) => record.recordType === 'settings'), false);
    assert.equal(await real.computeManifest(canonical), await real.computeManifest({ appId: 'pitch', schemaVersion: 1, records: [] }));
    assert.equal((await fixture.store.listOutbox()).length, 0);
    assert.equal((await fixture.store.listConflicts()).length, 0);
    assert.equal(await fixture.store.readMeta('runtimeState'), 'ready');
    const pushes = fixture.server.pushCalls;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const again = await fixture.runtime.performSync(`convergence-${cycle}`);
      assert.equal(again.ok, true, JSON.stringify(again));
      assert.equal(fixture.server.pushCalls, pushes);
      assert.equal(real.normalizeLocalSnapshot().records.some((record) => record.recordType === 'settings'), false);
      assert.equal((await fixture.store.listOutbox()).length, 0);
      assert.equal((await fixture.store.listConflicts()).length, 0);
    }
  }
});

async function realPitchDefaultChoiceFixture({ mixed = false, remoteState = 'live' } = {}) {
  const fixture = runtimeFixture([], 'pitch');
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, structuredClone, URL, console });
  vm.runInContext(readFileSync(new URL('../../pitch-cruise/sync/pitch-sync-adapter.js', import.meta.url), 'utf8'), context);
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
  const real = new context.SoundCruisePitchSync.PitchSyncAdapter({ storage, cryptoImpl: webcrypto });
  fixture.runtime.adapter = real;
  const make = (values) => ({ appId: 'pitch', schemaVersion: 1, records: [{
    recordType: 'settings', recordId: 'settings', schemaVersion: 1,
    payload: { id: 'settings', values: real.encodeSettingsForMerge(real.effectiveSettingsForMerge(values)) }
  }] });
  const baseline = make({ testModeEnabled: true, noteSpeed: 1.5, ...(mixed ? { baseOctave: 4 } : {}) });
  await real.applyRemoteSnapshot(baseline);
  data.set('pitchTrainerTestModeEnabled', 'false');
  data.set('pitchTrainerSettings', JSON.stringify({ ...JSON.parse(data.get('pitchTrainerSettings')),
    noteSpeed: 1.25, ...(mixed ? { baseOctave: 3 } : {}) }));
  const remote = make({ testModeEnabled: true, noteSpeed: 1, ...(mixed ? { baseOctave: 5 } : {}) });
  const [shadow] = await real.serializeRecords(baseline);
  const [incoming] = await real.serializeRecords(remote);
  await fixture.store.putShadow('settings/settings', { ...shadow, revision: 1, deletedAt: null });
  if (remoteState !== 'absent') fixture.server.records.set('settings/settings', {
    ...incoming, revision: 2, operationId: 'remote-choice', changeSeq: 2,
    ...(remoteState === 'tombstone' ? { payload: null, deletedAt: Date.now() } : { deletedAt: null })
  });
  fixture.server.revision = 2;
  fixture.server.state = 'ready';
  await fixture.store.setMeta('credential', 'scd1.valid');
  await fixture.store.setMeta('qaCredential', 'scq1.valid');
  await fixture.store.setMeta('migrationState', 'complete');
  assert.equal((await fixture.runtime.performSync('settings-conflict')).code, 'conflict');
  const [view] = await fixture.runtime.listConflictPresentations();
  assert(view);
  return { ...fixture, real, data, view, shadow, incoming };
}

test('real Pitch Cloud field choice resolves all-default as no record and stays converged', async () => {
  const fixture = await realPitchDefaultChoiceFixture();
  assert.deepEqual(Array.from(fixture.view.settings.fields, (field) => field.path), ['/noteSpeed']);
  assert.equal(fixture.view.settings.fields[0].local, 1.25);
  assert.equal(fixture.view.settings.fields[0].remote, 1);
  const result = await fixture.runtime.resolveConflict(fixture.view.id, 'merged', {
    fieldChoices: { '/noteSpeed': 'remote' }
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(fixture.real.normalizeLocalSnapshot().records.some((record) => record.recordType === 'settings'), false);
  assert.equal(fixture.server.records.get('settings/settings').deletedAt !== null, true);
  const shadow = await fixture.store.getShadow('settings/settings');
  assert.equal(shadow.deletedAt !== null, true);
  assert.equal(shadow.payload, null);
  assert.equal(await fixture.real.computeManifest(fixture.real.normalizeLocalSnapshot()),
    await fixture.real.computeManifest({ appId: 'pitch', schemaVersion: 1, records: [] }));
  assert.equal((await fixture.store.listConflicts()).length, 0);
  assert.equal((await fixture.store.listOutbox()).length, 0);
  assert.equal(await fixture.store.readMeta('runtimeState'), 'ready');
  const other = runtimeFixture([], 'pitch');
  const otherData = new Map();
  const otherStorage = { getItem: (key) => otherData.get(key) ?? null,
    setItem: (key, value) => otherData.set(key, String(value)), removeItem: (key) => otherData.delete(key) };
  const otherAdapter = new fixture.real.constructor({ storage: otherStorage, cryptoImpl: webcrypto });
  const prior = fixture.incoming;
  await otherAdapter.applyRemoteSnapshot({ appId: 'pitch', schemaVersion: 1, records: [{
    recordType: prior.recordType, recordId: prior.recordId, schemaVersion: prior.schemaVersion,
    payload: prior.payload
  }] });
  other.runtime.adapter = otherAdapter;
  other.runtime.fetchImpl = fixture.fetchImpl;
  await other.store.putShadow('settings/settings', { ...prior, revision: 2, deletedAt: null });
  await other.store.setMeta('credential', 'scd1.valid');
  await other.store.setMeta('qaCredential', 'scq1.valid');
  await other.store.setMeta('migrationState', 'complete');
  assert.equal((await other.runtime.performSync('receive-default')).ok, true);
  assert.equal(otherAdapter.normalizeLocalSnapshot().records.some((record) => record.recordType === 'settings'), false);
  assert.equal(await other.store.readMeta('runtimeState'), 'ready');
  assert.equal((await other.store.listConflicts()).length, 0);
  assert.equal((await other.store.listOutbox()).length, 0);
  const pushes = fixture.server.pushCalls;
  for (let cycle = 0; cycle < 3; cycle += 1) {
    assert.equal((await fixture.runtime.performSync(`converge-${cycle}`)).ok, true);
    assert.equal((await other.runtime.performSync(`other-converge-${cycle}`)).ok, true);
    assert.equal(fixture.server.pushCalls, pushes);
  }
});

test('real Pitch Local field choice keeps meaningful settings', async () => {
  const fixture = await realPitchDefaultChoiceFixture();
  const result = await fixture.runtime.resolveConflict(fixture.view.id, 'merged', {
    fieldChoices: { '/noteSpeed': 'local' }
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const local = fixture.real.normalizeLocalSnapshot().records.find((record) => record.recordType === 'settings');
  assert.equal(local.payload.values.noteSpeed, 1.25);
  assert.equal(local.payload.values.testModeEnabled, undefined);
  assert.equal(fixture.server.records.get('settings/settings').payload.values.noteSpeed, 1.25);
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

test('real Pitch mixed field choices can resolve to all-default without an empty record', async () => {
  const fixture = await realPitchDefaultChoiceFixture({ mixed: true });
  assert.deepEqual(Array.from(fixture.view.settings.fields, (field) => field.path), ['/baseOctave', '/noteSpeed']);
  const result = await fixture.runtime.resolveConflict(fixture.view.id, 'merged', {
    fieldChoices: { '/baseOctave': 'local', '/noteSpeed': 'remote' }
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(fixture.real.normalizeLocalSnapshot().records.some((record) => record.recordType === 'settings'), false);
  assert.equal(fixture.server.records.get('settings/settings').deletedAt !== null, true);
});

test('real Pitch default deletion resumes after response loss without another revision', async () => {
  const fixture = await realPitchDefaultChoiceFixture();
  fixture.server.responseLossAfterApply = true;
  const first = await fixture.runtime.resolveConflict(fixture.view.id, 'merged', {
    fieldChoices: { '/noteSpeed': 'remote' }
  });
  assert.equal(first.ok, false);
  assert.equal(fixture.server.records.get('settings/settings').revision, 3);
  const pushes = fixture.server.pushCalls;
  const restarted = new fixture.Runtime({
    appId: 'pitch', endpoint: 'https://example.test', adapter: fixture.real,
    store: fixture.store, accountClient: fixture.accountClient, accountCore: fixture.core,
    fetchImpl: fixture.fetchImpl, randomOperationId: fixture.nextId
  });
  const resumed = await restarted.resumeConflictResolutions();
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  assert.equal(fixture.server.records.get('settings/settings').revision, 3);
  assert.equal(fixture.server.pushCalls, pushes);
  assert.equal(fixture.real.normalizeLocalSnapshot().records.some((record) => record.recordType === 'settings'), false);
  assert.equal((await fixture.store.listConflicts()).length, 0);
  assert.equal((await fixture.store.listOutbox()).length, 0);
});

test('real Pitch default choice converges without a push when remote is absent or already tombstoned', async () => {
  for (const remoteState of ['absent', 'tombstone']) {
    const fixture = await realPitchDefaultChoiceFixture({ remoteState });
    const pushes = fixture.server.pushCalls;
    const result = await fixture.runtime.resolveConflict(fixture.view.id, 'merged', {
      fieldChoices: { '/noteSpeed': 'remote' }
    });
    assert.equal(result.ok, true, `${remoteState}: ${JSON.stringify(result)}`);
    assert.equal(fixture.server.pushCalls, pushes);
    assert.equal(fixture.real.normalizeLocalSnapshot().records.some((record) => record.recordType === 'settings'), false);
    const shadow = await fixture.store.getShadow('settings/settings');
    if (remoteState === 'absent') assert.equal(shadow, null);
    else assert.equal(shadow.deletedAt !== null, true);
    assert.equal((await fixture.store.listConflicts()).length, 0);
    assert.equal((await fixture.store.listOutbox()).length, 0);
  }
});

test('real Pitch default choice retains an unknown future field instead of deleting settings', async () => {
  const fixture = await realPitchDefaultChoiceFixture();
  const incoming = fixture.server.records.get('settings/settings');
  incoming.payload.values.futureSetting = 'keep-me';
  const plan = fixture.runtime.settingsFieldPlan({
    localRecord: (await fixture.runtime.localRecords()).records.find((record) => record.recordType === 'settings'),
    remoteRecord: incoming, shadowRecord: await fixture.store.getShadow('settings/settings')
  }, { '/noteSpeed': 'remote' });
  assert.equal(plan.values.futureSetting, 'keep-me');
  const pushes = fixture.server.pushCalls;
  const result = await fixture.runtime.resolveConflict(fixture.view.id, 'merged', {
    fieldChoices: { '/noteSpeed': 'remote' }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'settings_field_unsupported');
  assert.equal(fixture.server.pushCalls, pushes);
  assert.equal(fixture.server.records.get('settings/settings').deletedAt, null);
});

test('real Pitch default deletion obeys CAS if remote changes during resolution', async () => {
  const fixture = await realPitchDefaultChoiceFixture();
  fixture.server.beforeNextPush = (server) => {
    const current = server.records.get('settings/settings');
    server.records.set('settings/settings', { ...current, revision: current.revision + 1,
      operationId: 'concurrent-edit', changeSeq: ++server.revision });
  };
  const result = await fixture.runtime.resolveConflict(fixture.view.id, 'merged', {
    fieldChoices: { '/noteSpeed': 'remote' }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'stale_resolution');
  assert.equal(fixture.server.records.get('settings/settings').deletedAt, null);
  assert.equal(fixture.real.normalizeLocalSnapshot().records.some((record) => record.recordType === 'settings'), true);
  assert.equal((await fixture.store.listConflicts()).length, 1);
});

test('real Fretboard default versus 120 asks for tempo only and Local choice deletes stale setting', async () => {
  const fixture = runtimeFixture([], 'fretboard');
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, structuredClone, URL, console });
  vm.runInContext(readFileSync(new URL('../../fretboard_cruise/sync/fretboard-sync-adapter.js', import.meta.url), 'utf8'), context);
  const data = new Map([['fretboard_cruise_state', JSON.stringify({ settings: { tempo: 75 } })]]);
  const storage = { getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
  const real = new context.SoundCruiseFretboardSync.FretboardSyncAdapter({ storage, cryptoImpl: webcrypto });
  fixture.runtime.adapter = real;
  const make = (tempo) => ({ appId: 'fretboard', schemaVersion: 1, records: [{
    recordType: 'settings', recordId: 'settings', schemaVersion: 1,
    payload: { id: 'settings', values: { tempo } }
  }] });
  const [shadow] = await real.serializeRecords(make(96));
  const [incoming] = await real.serializeRecords(make(120));
  await fixture.store.putShadow('settings/settings', { ...shadow, revision: 1, deletedAt: null });
  fixture.server.records.set('settings/settings', { ...incoming, revision: 2,
    operationId: 'remote-edit', deletedAt: null, changeSeq: 2 });
  fixture.server.revision = 2;
  fixture.server.state = 'ready';
  await fixture.store.setMeta('credential', 'scd1.valid');
  await fixture.store.setMeta('qaCredential', 'scq1.valid');
  await fixture.store.setMeta('migrationState', 'complete');
  assert.equal((await fixture.runtime.performSync('true-conflict')).code, 'conflict');
  const [view] = await fixture.runtime.listConflictPresentations();
  assert.equal(view.settings.fields.length, 1);
  assert.equal(view.settings.fields[0].local, 75);
  assert.equal(view.settings.fields[0].remote, 120);
  const resolved = await fixture.runtime.resolveConflict(view.id, 'merged', { fieldChoices: { '/tempo': 'local' } });
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  assert.equal(fixture.server.records.get('settings/settings').deletedAt !== null, true);
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

test('an initial settings conflict resumes migration to all 15 records after field choices', async () => {
  const recordKey = (item) => `${item.recordType}/${item.recordId}`;
  const localValues = { keyRandomMode: true, noteSpeed: 3, builtinChordEnabled: { local: true } };
  const remoteValues = { keyRandomMode: false, noteSpeed: 2,
    builtinProgressionEnabled: { remote: true } };
  const localRecords = [settingsRecord(localValues), record('shared'),
    record('local-a'), record('local-b'), record('local-c')];
  const fixture = runtimeFixture(localRecords, 'pitch');
  fixture.runtime.adapter.serializeRecords = async (snapshot) => snapshot.records.map((item) =>
    item.recordType === 'settings' ? settingsRecord(item.payload.values) : item);
  fixture.runtime.adapter.mergeSnapshots = (local, remote) => {
    const merged = [...local.records, ...remote.records.filter((item) =>
      !local.records.some((left) => recordKey(left) === recordKey(item)))];
    const localSettings = local.records.find((item) => item.recordType === 'settings');
    const remoteSettings = remote.records.find((item) => item.recordType === 'settings');
    return { snapshot: { ...local, records: merged }, conflicts:
      JSON.stringify(localSettings?.payload) === JSON.stringify(remoteSettings?.payload)
        ? [] : [{ recordKey: 'settings/settings', reason: 'settings_field_conflict' }] };
  };
  const remoteRecords = [settingsRecord(remoteValues), record('shared'),
    ...Array.from({ length: 10 }, (_, index) => record(`cloud-${index}`))];
  remoteRecords.forEach((item, index) => fixture.server.records.set(recordKey(item), {
    ...item, revision: 1, operationId: `cloud-${index}`, deletedAt: null, changeSeq: index + 1
  }));
  fixture.server.state = 'ready';
  fixture.server.revision = 12;
  fixture.runtime.bootstrap = async () => ({ ok: true });
  await fixture.store.setMeta('credential', 'scd1.valid');
  await fixture.store.setMeta('qaCredential', 'scq1.valid');
  await fixture.store.setMeta('membership', { id: 'm1', appId: 'pitch', state: 'active' });
  const paused = await fixture.runtime.initializeDataset();
  assert.equal(paused.code, 'merge_conflict');
  assert.equal((await fixture.store.listConflicts()).length, 1);
  assert.equal(fixture.server.records.size, 12);
  const [item] = await fixture.runtime.listConflictPresentations();
  assert.deepEqual(Array.from(item.settings.fields, (field) => field.path), ['/keyRandomMode', '/noteSpeed']);
  const completed = await fixture.runtime.resolveConflict(item.id, 'merged', { fieldChoices: {
    '/keyRandomMode': 'local', '/noteSpeed': 'remote'
  } });
  assert.equal(completed.ok, true, JSON.stringify(completed));
  assert.equal(await fixture.store.readMeta('migrationState'), 'complete');
  assert.equal((await fixture.store.listConflicts()).length, 0);
  assert.equal(fixture.server.records.size, 15);
  assert.equal(fixture.local.records.length, 15);
  assert.equal((await fixture.store.listOutbox()).length, 0);
  const finalSettings = fixture.server.records.get('settings/settings').payload.values;
  assert.equal(finalSettings.keyRandomMode, true);
  assert.equal(finalSettings.noteSpeed, 2);
  assert.equal(finalSettings.builtinChordEnabled.local, true);
  assert.equal(finalSettings.builtinProgressionEnabled.remote, true);
});

test('Port clears a stale conflict only after local and Remote have already converged', async () => {
  const fixture = runtimeFixture([preset('converged', 80)], 'port');
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.records = [preset('converged', 79)];
  setRemoteVariant(fixture, 'converged', 81);
  assert.equal((await fixture.runtime.sync('focus')).code, 'conflict');
  assert.equal((await fixture.store.listConflicts()).length, 1);

  const pushes = fixture.server.pushCalls;
  fixture.local.records = [preset('converged', 81)];
  const result = await fixture.runtime.sync('focus');

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal((await fixture.store.listConflicts()).length, 0);
  assert.equal(fixture.server.pushCalls, pushes, 'converged data must not create another revision');
  assert.equal((await fixture.store.getShadow('custom_preset/converged')).payload.bpm, 81);
});

test('Port keeps a real unresolved conflict fail-closed', async () => {
  const fixture = runtimeFixture([preset('unresolved', 80)], 'port');
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.records = [preset('unresolved', 79)];
  setRemoteVariant(fixture, 'unresolved', 81);
  assert.equal((await fixture.runtime.sync('focus')).code, 'conflict');

  const pushes = fixture.server.pushCalls;
  const result = await fixture.runtime.sync('focus');
  assert.equal(result.code, 'conflict_pending');
  assert.equal((await fixture.store.listConflicts()).length, 1);
  assert.equal(fixture.server.pushCalls, pushes);
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
  assert.equal((await fixture.runtime.listConflictPresentations())[0].selection, 'local');
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

test('one unreadable record is isolated while healthy records sync and Remote repair restores it', async () => {
  const brokenBase = preset('broken', 80);
  const safeBase = preset('safe', 90);
  const fixture = runtimeFixture([brokenBase, safeBase], 'pitch');
  installInvalidRecordRecovery(fixture);
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.records = [
    { ...preset('broken', 79), payload: { ...preset('broken', 79).payload, invalid: true } },
    preset('safe', 91)
  ];

  const synced = await fixture.runtime.sync('save');
  assert.equal(synced.ok, true);
  assert.equal(fixture.server.records.get('custom_preset/broken').payload.bpm, 80,
    'unreadable local data must never overwrite the healthy cloud record');
  assert.equal(fixture.server.records.get('custom_preset/safe').payload.bpm, 91,
    'unrelated healthy data continues syncing');
  const [conflict] = await fixture.store.listConflicts();
  assert.equal(conflict.kind, 'invalid_record');
  assert.deepEqual(conflict.recovery, { localInvalid: true, remoteInvalid: false });
  const [presentation] = await fixture.runtime.listConflictPresentations();
  assert.deepEqual(JSON.parse(JSON.stringify(presentation.recovery.allowedChoices)), ['remote']);
  assert.equal(presentation.recovery.remoteLabel, 'クラウドの正常データを使用');
  assert.equal((await fixture.runtime.attentionSummary()).kind, 'data_repair');

  const repaired = await fixture.runtime.resolveConflict(conflict.id, 'remote');
  assert.equal(repaired.ok, true, JSON.stringify(repaired));
  assert.equal(fixture.local.records.find((record) => record.recordId === 'broken').payload.bpm, 80);
  assert.equal(fixture.local.records.find((record) => record.recordId === 'safe').payload.bpm, 91);
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

test('a manually restored invalid record clears its stale recovery item only after both sides match', async () => {
  const baseline = preset('broken', 80);
  const fixture = runtimeFixture([baseline], 'pitch');
  installInvalidRecordRecovery(fixture);
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.records = [{ ...preset('broken', 79),
    payload: { ...preset('broken', 79).payload, invalid: true } }];
  await fixture.runtime.sync('save');
  assert.equal((await fixture.store.listConflicts()).length, 1);
  fixture.local.records = [baseline];

  const result = await fixture.runtime.sync('focus');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal((await fixture.store.listConflicts()).length, 0);
  assert.equal(await fixture.store.readMeta('runtimeState'), 'ready');
});

test('Local repair replaces one corrupt Remote record while twenty unrelated edits continue and Later is non-destructive', async () => {
  const brokenBase = preset('broken', 80);
  const healthyBase = Array.from({ length: 20 }, (_, index) => preset(`healthy-${index}`, 90 + index));
  const fixture = runtimeFixture([brokenBase, ...healthyBase], 'pitch');
  installInvalidRecordRecovery(fixture);
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.records = [preset('broken', 79),
    ...healthyBase.map((record, index) => preset(record.recordId, 190 + index))];
  const remote = fixture.server.records.get('custom_preset/broken');
  fixture.server.revision += 1;
  fixture.server.records.set('custom_preset/broken', { ...remote, revision: remote.revision + 1,
    changeSeq: fixture.server.revision, operationId: 'remote-corrupt',
    payload: { ...remote.payload, bpm: 81, invalid: true }, payloadHash: 'hash-broken-corrupt' });

  assert.equal((await fixture.runtime.sync('save')).ok, true);
  for (let index = 0; index < 20; index += 1) {
    assert.equal(fixture.server.records.get(`custom_preset/healthy-${index}`).payload.bpm, 190 + index);
  }
  const [conflict] = await fixture.store.listConflicts();
  assert.deepEqual(conflict.recovery, { localInvalid: false, remoteInvalid: true });
  const [presentation] = await fixture.runtime.listConflictPresentations();
  assert.deepEqual(JSON.parse(JSON.stringify(presentation.recovery.allowedChoices)), ['local']);
  const localBefore = structuredClone(fixture.local.records);
  const remoteBefore = structuredClone(fixture.server.records.get('custom_preset/broken'));
  const deferred = await fixture.runtime.resolveConflict(conflict.id, 'later');
  assert.equal(deferred.deferred, true);
  assert.deepEqual(fixture.local.records, localBefore);
  assert.deepEqual(fixture.server.records.get('custom_preset/broken'), remoteBefore);

  const repaired = await fixture.runtime.resolveConflict(conflict.id, 'local');
  assert.equal(repaired.ok, true, JSON.stringify(repaired));
  assert.equal(fixture.server.records.get('custom_preset/broken').payload.bpm, 79);
  assert.equal(fixture.server.records.get('custom_preset/broken').payload.invalid, undefined);
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

test('new-device hydrate quarantines one corrupt cloud record and still restores twenty healthy records', async () => {
  const fixture = runtimeFixture([], 'pitch');
  installInvalidRecordRecovery(fixture);
  fixture.server.state = 'ready';
  const cloud = [
    { ...preset('broken', 80), payload: { ...preset('broken', 80).payload, invalid: true } },
    ...Array.from({ length: 20 }, (_, index) => preset(`healthy-${index}`, 100 + index))
  ];
  for (const record of cloud) {
    fixture.server.revision += 1;
    fixture.server.records.set(`${record.recordType}/${record.recordId}`, {
      ...record, revision: 1, deletedAt: null, changeSeq: fixture.server.revision,
      operationId: `remote-${record.recordId}`
    });
  }

  const hydrated = await fixture.runtime.consumeHandoff('transient');
  assert.equal(hydrated.ok, true, JSON.stringify(hydrated));
  assert.equal(fixture.local.records.length, 20);
  assert.equal(fixture.local.records.some((record) => record.recordId === 'broken'), false);
  assert.equal((await fixture.store.listConflicts()).length, 1);
  assert.equal(await fixture.store.readMeta('runtimeState'), 'attention');
  assert.equal((await fixture.runtime.attentionSummary()).kind, 'data_repair');
});

test('two unreadable copies can only be deleted and response-loss resume removes the local copy once', async () => {
  const baseline = preset('broken', 80);
  const fixture = runtimeFixture([baseline], 'pitch');
  installInvalidRecordRecovery(fixture);
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.records = [{ ...preset('broken', 79),
    payload: { ...preset('broken', 79).payload, invalid: true } }];
  const remote = fixture.server.records.get('custom_preset/broken');
  fixture.server.revision += 1;
  fixture.server.records.set('custom_preset/broken', { ...remote, revision: remote.revision + 1,
    changeSeq: fixture.server.revision, operationId: 'remote-corrupt',
    payload: { ...remote.payload, bpm: 81, invalid: true }, payloadHash: 'hash-broken-corrupt' });

  assert.equal((await fixture.runtime.sync('focus')).ok, true);
  const [conflict] = await fixture.store.listConflicts();
  const [presentation] = await fixture.runtime.listConflictPresentations();
  assert.deepEqual(JSON.parse(JSON.stringify(presentation.recovery.allowedChoices)), ['local']);
  assert.equal(presentation.recovery.localLabel, 'このステージを削除');
  assert.equal((await fixture.runtime.resolveConflict(conflict.id, 'remote')).code, 'resolution_choice_invalid');

  fixture.server.responseLossAfterApply = true;
  const first = await fixture.runtime.resolveConflict(conflict.id, 'local');
  assert.equal(first.ok, false);
  const revision = fixture.server.records.get('custom_preset/broken').revision;
  assert.notEqual(fixture.server.records.get('custom_preset/broken').deletedAt, null);
  assert.equal(fixture.local.records.length, 1, 'local cleanup waits until the cloud delete is verified');
  const restarted = new fixture.Runtime({
    appId: 'pitch', endpoint: 'https://example.test', adapter: fixture.local,
    store: fixture.store, accountClient: fixture.accountClient, accountCore: fixture.core,
    fetchImpl: fixture.fetchImpl, randomOperationId: fixture.nextId
  });
  const resumed = await restarted.resumeConflictResolutions();
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  assert.equal(fixture.local.records.length, 0);
  assert.equal(fixture.server.records.get('custom_preset/broken').revision, revision);
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

function pitchStage(id, legacyId, name = `Stage ${legacyId}`) {
  return { recordType: 'melody_stage', recordId: id, schemaVersion: 1, payload: {
    id, legacyId, name, pool: [{ note: 'C', octaveOffset: 0 }, { note: 'D', octaveOffset: 1 }],
    count: 4, is2Octave: true, isPianoLayout: true, answerMethod: 'note', description: 'QA'
  } };
}

function pitchOrder(stageRefs) {
  return { recordType: 'stage_order', recordId: 'melody', schemaVersion: 1,
    payload: { id: 'melody', category: 'melody', stageRefs: [...stageRefs] } };
}

function pitchProgress(stageRef, clearCount = 1) {
  const id = `melody:${stageRef}`;
  return { recordType: 'progress', recordId: id, schemaVersion: 1,
    payload: { id, category: 'melody', stageRef, clearCount, lastClearedAt: null } };
}

function createRealPitchRuntimeFixture() {
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, structuredClone, URL, console });
  vm.runInContext(readFileSync(new URL('../../pitch-cruise/sync/pitch-sync-adapter.js', import.meta.url), 'utf8'), context);
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  const pitch = new context.SoundCruisePitchSync.PitchSyncAdapter({ storage, cryptoImpl: webcrypto,
    backupStore: { async save() {} } });
  const fixture = runtimeFixture([], 'pitch');
  fixture.runtime.adapter = pitch;
  return { fixture, pitch, storage, values };
}

async function seedPitchCloud(fixture, pitch, snapshot, corruptIds = new Set()) {
  const records = await pitch.serializeRecords(snapshot);
  for (const source of records) {
    const record = structuredClone(source);
    if (record.recordType === 'melody_stage' && corruptIds.has(record.recordId)) {
      record.payload.pool = ['[object Object]'];
      record.payloadHash = `corrupt-${record.recordId}`;
    }
    fixture.server.revision += 1;
    fixture.server.records.set(`${record.recordType}/${record.recordId}`, {
      ...record, revision: 1, deletedAt: null, changeSeq: fixture.server.revision,
      operationId: `remote-${record.recordType}-${record.recordId}`
    });
  }
  fixture.server.state = 'ready';
}

async function prepareRealPitchBothCorrupt() {
  const harness = createRealPitchRuntimeFixture();
  const { fixture, pitch, storage } = harness;
  const safeA = pitchStage('legacy:melody-stage:7101', 7101, 'Safe A');
  const corrupt = pitchStage('legacy:melody-stage:7102', 7102, 'Corrupt target');
  const safeB = pitchStage('legacy:melody-stage:7103', 7103, 'Safe B');
  const snapshot = { appId: 'pitch', schemaVersion: 1, records: [
    safeA, corrupt, safeB, pitchOrder([safeA.recordId, corrupt.recordId, safeB.recordId]),
    pitchProgress(safeA.recordId, 2), pitchProgress(corrupt.recordId, 7), pitchProgress(safeB.recordId, 3)
  ] };
  await pitch.applyRemoteSnapshot(snapshot);
  await seedPitchCloud(fixture, pitch, snapshot);
  assert.equal((await fixture.runtime.consumeHandoff('transient')).ok, true);

  const localSlots = JSON.parse(storage.getItem('pitchTrainerStagingProMelodySlots'));
  localSlots.slots.find((slot) => Number(slot.id) === 7102).config.pool = ['[object Object]'];
  storage.setItem('pitchTrainerStagingProMelodySlots', JSON.stringify(localSlots));
  const remoteKey = `melody_stage/${corrupt.recordId}`;
  const remote = fixture.server.records.get(remoteKey);
  fixture.server.records.set(remoteKey, { ...remote,
    payload: { ...remote.payload, pool: ['[object Object]'] }, payloadHash: 'corrupt-remote-stage',
    revision: remote.revision + 1, changeSeq: ++fixture.server.revision, operationId: 'remote-corrupt-stage' });
  assert.equal((await fixture.runtime.performSync('detect-corrupt')).ok, true);
  const [conflict] = await fixture.store.listConflicts();
  assert.equal(conflict.recordKey, remoteKey);
  assert.deepEqual(conflict.recovery, { localInvalid: true, remoteInvalid: true });
  return { ...harness, snapshot, safeA, safeB, corrupt, conflict };
}

async function prepareRealPitchDeleteEditConflict({ deletionResponseLoss = false } = {}) {
  const harness = createRealPitchRuntimeFixture();
  const { fixture, pitch } = harness;
  const x = pitchStage('legacy:melody-stage:8101', 8101, 'Stage X');
  const y = pitchStage('legacy:melody-stage:8102', 8102, 'Stage Y');
  const z = pitchStage('legacy:melody-stage:8103', 8103, 'Stage Z');
  const baseline = { appId: 'pitch', schemaVersion: 1, records: [x, y, z,
    pitchOrder([x.recordId, y.recordId, z.recordId]),
    pitchProgress(x.recordId, 4), pitchProgress(y.recordId, 2)] };
  await pitch.applyRemoteSnapshot(baseline);
  await seedPitchCloud(fixture, pitch, baseline);
  assert.equal((await fixture.runtime.consumeHandoff('transient')).ok, true);
  const editedX = { ...structuredClone(x), payload: { ...structuredClone(x.payload), name: 'Stage X edited' } };
  await pitch.applyRemoteSnapshot({ ...baseline, records: baseline.records.map((record) =>
    record.recordType === 'melody_stage' && record.recordId === x.recordId ? editedX : record) });
  const deletedCloud = { appId: 'pitch', schemaVersion: 1, records: [y, z,
    pitchOrder([y.recordId, z.recordId]), pitchProgress(y.recordId, 2)] };
  const remoteOrder = (await pitch.serializeRecords(deletedCloud)).find((record) =>
    record.recordType === 'stage_order');
  const oldOrder = fixture.server.records.get('stage_order/melody');
  fixture.server.records.set('stage_order/melody', { ...oldOrder, payload: remoteOrder.payload,
    payloadHash: remoteOrder.payloadHash, revision: oldOrder.revision + 1,
    changeSeq: ++fixture.server.revision, operationId: 'other-delete-order' });
  for (const key of [`progress/melody:${x.recordId}`, `melody_stage/${x.recordId}`]) {
    const old = fixture.server.records.get(key);
    if (deletionResponseLoss && key.startsWith('melody_stage/')) {
      fixture.server.responseLossAfterApply = true;
      await assert.rejects(fixture.fetchImpl('https://example.test/v1/sync/push', {
        method: 'POST', body: JSON.stringify({ appId: 'pitch', mode: 'sync', operations: [{
          operationId: 'other-delete-stage-response-lost', recordType: old.recordType,
          recordId: old.recordId, schemaVersion: old.schemaVersion, baseRevision: old.revision,
          payload: null, payloadHash: `deleted-${key}`, deleted: true
        }] })
      }), /response lost/u);
      assert.equal(fixture.server.records.get(key).revision, old.revision + 1);
      continue;
    }
    fixture.server.records.set(key, { ...old, payload: null, deleted: true, deletedAt: Date.now(),
      payloadHash: `deleted-${key}`, revision: old.revision + 1,
      changeSeq: ++fixture.server.revision, operationId: `other-delete-${key}` });
  }
  assert.equal((await fixture.runtime.performSync('delete-versus-edit')).code, 'conflict');
  const [conflict] = await fixture.store.listConflicts();
  assert.equal(conflict.recordKey, `melody_stage/${x.recordId}`);
  return { ...harness, x, y, z, editedX, conflict };
}

test('real Pitch Cloud wins after deleting device push response loss stays deleted without duplicate revision', async () => {
  const { fixture, x, conflict } = await prepareRealPitchDeleteEditConflict({ deletionResponseLoss: true });
  const stageRevision = fixture.server.records.get(`melody_stage/${x.recordId}`).revision;
  assert.equal((await fixture.runtime.resolveConflict(conflict.id, 'remote')).ok, true);
  for (let cycle = 0; cycle < 3; cycle += 1) {
    assert.equal((await fixture.runtime.performSync(`cloud-loss-${cycle}`)).ok, true);
  }
  assert.equal(fixture.server.records.get(`melody_stage/${x.recordId}`).revision, stageRevision);
  assert.equal((await fixture.store.listConflicts()).length, 0);
  assert.equal((await fixture.store.listOutbox()).length, 0);
});

test('real Pitch Local wins resumes stage push response loss without duplicate revision', async () => {
  const { fixture, pitch, x, conflict } = await prepareRealPitchDeleteEditConflict();
  const stageRevision = fixture.server.records.get(`melody_stage/${x.recordId}`).revision;
  fixture.server.responseLossAfterApply = true;
  const first = await fixture.runtime.resolveConflict(conflict.id, 'local');
  assert.equal(first.code, 'network_error');
  assert.equal(fixture.server.records.get(`melody_stage/${x.recordId}`).revision, stageRevision + 1);
  const restarted = new fixture.Runtime({
    appId: 'pitch', endpoint: 'https://example.test', adapter: pitch,
    store: fixture.store, accountClient: fixture.accountClient, accountCore: fixture.core,
    fetchImpl: fixture.fetchImpl, randomOperationId: fixture.nextId
  });
  const resumed = await restarted.resumeConflictResolutions();
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  for (let cycle = 0; cycle < 3; cycle += 1) {
    assert.equal((await restarted.performSync(`local-loss-${cycle}`)).ok, true);
  }
  assert.equal(fixture.server.records.get(`melody_stage/${x.recordId}`).revision, stageRevision + 1);
  assert.equal((await fixture.store.listConflicts()).length, 0);
  assert.equal((await fixture.store.listOutbox()).length, 0);
});

test('real Pitch Local wins resumes order push response loss without duplicate revision', async () => {
  const { fixture, pitch, x, conflict } = await prepareRealPitchDeleteEditConflict();
  const stageRevision = fixture.server.records.get(`melody_stage/${x.recordId}`).revision;
  const orderRevision = fixture.server.records.get('stage_order/melody').revision;
  fixture.server.beforePushOperation = async (server, operations) => {
    if (!operations.some((operation) => operation.recordType === 'stage_order')) return;
    server.beforePushOperation = null;
    server.responseLossAfterApply = true;
  };
  const first = await fixture.runtime.resolveConflict(conflict.id, 'local');
  assert.equal(first.code, 'network_error');
  assert.equal(fixture.server.records.get('stage_order/melody').revision, orderRevision + 1);
  const restarted = new fixture.Runtime({
    appId: 'pitch', endpoint: 'https://example.test', adapter: pitch,
    store: fixture.store, accountClient: fixture.accountClient, accountCore: fixture.core,
    fetchImpl: fixture.fetchImpl, randomOperationId: fixture.nextId
  });
  const resumed = await restarted.resumeConflictResolutions();
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  for (let cycle = 0; cycle < 3; cycle += 1) {
    assert.equal((await restarted.performSync(`order-loss-${cycle}`)).ok, true);
  }
  assert.equal(fixture.server.records.get('stage_order/melody').revision, orderRevision + 1);
  assert.equal(fixture.server.records.get(`melody_stage/${x.recordId}`).revision, stageRevision + 1);
  assert.equal((await fixture.store.listConflicts()).length, 0);
  assert.equal((await fixture.store.listOutbox()).length, 0);
});

test('real Pitch Cloud wins refetches concurrent order edit and retains unrelated stage edit', async () => {
  const { fixture, pitch, x, y, z, conflict } = await prepareRealPitchDeleteEditConflict();
  const currentOrder = fixture.server.records.get('stage_order/melody');
  fixture.server.records.set('stage_order/melody', { ...currentOrder,
    payload: { ...currentOrder.payload, stageRefs: [z.recordId, y.recordId] },
    revision: currentOrder.revision + 1, changeSeq: ++fixture.server.revision,
    operationId: 'other-reorder-after-detection' });
  const currentY = fixture.server.records.get(`melody_stage/${y.recordId}`);
  fixture.server.records.set(`melody_stage/${y.recordId}`, { ...currentY,
    payload: { ...currentY.payload, name: 'Stage Y remote edit' },
    payloadHash: 'stage-y-remote-edit',
    revision: currentY.revision + 1, changeSeq: ++fixture.server.revision,
    operationId: 'other-stage-edit' });
  const resolved = await fixture.runtime.resolveConflict(conflict.id, 'remote');
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  for (let cycle = 0; cycle < 3; cycle += 1) {
    assert.equal((await fixture.runtime.performSync(`cloud-race-${cycle}`)).ok, true);
  }
  const local = await fixture.runtime.localRecords();
  assert.deepEqual(Array.from(local.records.find((record) => record.recordType === 'stage_order').payload.stageRefs),
    [z.recordId, y.recordId]);
  assert.equal(local.records.find((record) => record.recordId === y.recordId).payload.name,
    'Stage Y remote edit');
  assert.equal(local.records.some((record) => record.recordId === x.recordId), false);
  assert.equal((await fixture.store.listConflicts()).length, 0);
  assert.equal((await fixture.store.listOutbox()).length, 0);
});

test('real Pitch Local wins order CAS race preserving concurrent reorder and unrelated stage edit', async () => {
  const { fixture, x, y, z, conflict } = await prepareRealPitchDeleteEditConflict();
  fixture.server.beforePushOperation = async (server, operations) => {
    if (!operations.some((operation) => operation.recordType === 'stage_order')) return;
    server.beforePushOperation = null;
    const currentOrder = server.records.get('stage_order/melody');
    server.records.set('stage_order/melody', { ...currentOrder,
      payload: { ...currentOrder.payload, stageRefs: [z.recordId, y.recordId] },
      revision: currentOrder.revision + 1, changeSeq: ++server.revision,
      operationId: 'other-reorder-during-cas' });
    const currentY = server.records.get(`melody_stage/${y.recordId}`);
    server.records.set(`melody_stage/${y.recordId}`, { ...currentY,
      payload: { ...currentY.payload, name: 'Stage Y concurrent edit' },
      payloadHash: 'stage-y-concurrent-edit',
      revision: currentY.revision + 1, changeSeq: ++server.revision,
      operationId: 'other-stage-edit' });
  };
  const resolved = await fixture.runtime.resolveConflict(conflict.id, 'local');
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  for (let cycle = 0; cycle < 3; cycle += 1) {
    assert.equal((await fixture.runtime.performSync(`local-race-${cycle}`)).ok, true);
  }
  const local = await fixture.runtime.localRecords();
  assert.deepEqual(Array.from(local.records.find((record) => record.recordType === 'stage_order').payload.stageRefs),
    [z.recordId, y.recordId, x.recordId]);
  assert.equal(local.records.find((record) => record.recordId === y.recordId).payload.name,
    'Stage Y concurrent edit');
  assert.equal((await fixture.store.listConflicts()).length, 0);
  assert.equal((await fixture.store.listOutbox()).length, 0);
});

for (const choice of ['remote', 'local']) {
  test(`real Pitch delete/edit conflict ${choice} choice converges stage, order and progress`, async () => {
    const { fixture, pitch, x, y, z, conflict } = await prepareRealPitchDeleteEditConflict();
    const result = await fixture.runtime.resolveConflict(conflict.id, choice);
    assert.equal(result.ok, true, JSON.stringify(result));
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const synced = await fixture.runtime.performSync(`converge-${cycle}`);
      assert.equal(synced.ok, true, JSON.stringify(synced));
    }
    const local = await fixture.runtime.localRecords();
    const order = local.records.find((record) => record.recordType === 'stage_order').payload.stageRefs;
    assert.deepEqual(Array.from(order), choice === 'local'
      ? [y.recordId, z.recordId, x.recordId] : [y.recordId, z.recordId]);
    assert.equal(local.records.some((record) => record.recordId === x.recordId), choice === 'local');
    assert.equal(fixture.server.records.get(`melody_stage/${x.recordId}`).deletedAt == null, choice === 'local');
    assert.equal(fixture.server.records.get(`progress/melody:${x.recordId}`).deletedAt == null, choice === 'local');
    assert.deepEqual(Array.from(fixture.server.records.get('stage_order/melody').payload.stageRefs), Array.from(order));
    assert.equal(local.records.find((record) => record.recordId === y.recordId).payload.name, y.payload.name);
    assert.equal((await fixture.store.listConflicts()).length, 0);
    assert.equal((await fixture.store.listOutbox()).length, 0);
    assert.equal(await fixture.store.readMeta('runtimeState'), 'ready');
    assert.match(await pitch.computeManifest(local.snapshot), /^[a-f0-9]{64}$/u);
  });
}

for (const [label, values, expectedDisplay] of [
  ['missing accidental and other known defaults', { noteSpeed: 2 }, 'sharp'],
  ['explicit sharp', { noteSpeed: 2, accidentalDisplay: 'sharp' }, 'sharp'],
  ['explicit flat', { noteSpeed: 2, accidentalDisplay: 'flat' }, 'flat']
]) {
  test(`real Pitch new-device join accepts ${label} without cloud rewrite or sync churn`, async () => {
    const { fixture, pitch, storage } = createRealPitchRuntimeFixture();
    const stage = pitchStage('legacy:melody-stage:8201', 8201, 'Older client stage');
    const settings = { recordType: 'settings', recordId: 'settings', schemaVersion: 1,
      payload: { id: 'settings', values } };
    const cloud = { appId: 'pitch', schemaVersion: 1, records: [settings, stage,
      pitchOrder([stage.recordId]), pitchProgress(stage.recordId, 3)] };
    await seedPitchCloud(fixture, pitch, cloud);
    const original = structuredClone(fixture.server.records.get('settings/settings'));
    const joined = await fixture.runtime.consumeHandoff('transient');
    assert.equal(joined.ok, true, JSON.stringify(joined));
    assert.equal(storage.getItem('pitchTrainerProAccidentalDisplay'), expectedDisplay);
    assert.equal((await fixture.runtime.localRecords()).records.some((record) =>
      record.recordType === 'progress' && record.payload.stageRef === stage.recordId), true);
    const pushes = fixture.server.pushCalls;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const synced = await fixture.runtime.performSync(`settings-default-cycle-${cycle}`);
      assert.equal(synced.ok, true, JSON.stringify(synced));
    }
    assert.equal(fixture.server.pushCalls, pushes);
    assert.deepEqual(fixture.server.records.get('settings/settings'), original);
    assert.equal((await fixture.store.listConflicts()).length, 0);
    assert.equal((await fixture.store.listOutbox()).length, 0);
    assert.equal(await fixture.store.readMeta('runtimeState'), 'ready');
  });
}

test('Pitch known settings defaults compare semantically while unknown future fields stay strict', () => {
  const { pitch } = createRealPitchRuntimeFixture();
  const bare = { recordType: 'settings', recordId: 'settings', schemaVersion: 1,
    payload: { id: 'settings', values: { noteSpeed: 2 } } };
  const knownDefaults = { ...bare, payload: { id: 'settings', values: {
    noteSpeed: 2, accidentalDisplay: 'sharp', instrument: 'acoustic_guitar',
    testModeEnabled: false
  } } };
  assert.equal(pitch.sameRecordForSync(bare, knownDefaults), true);
  const future = { ...bare, payload: { id: 'settings', values: { noteSpeed: 2, futureMode: 'on' } } };
  assert.equal(pitch.sameRecordForSync(bare, future), false);
  assert.equal(pitch.sameRecordForSync(future, structuredClone(future)), true);
  assert.equal(pitch.sameRecordForSync(bare, { ...bare,
    payload: { ...bare.payload, futureMetadata: 'present' } }), false);
});

test('real Pitch new-device hydrate applies twenty stages, safe order and normal progress beside one corrupt stage', async () => {
  const { fixture, pitch } = createRealPitchRuntimeFixture();
  const normal = Array.from({ length: 20 }, (_, index) =>
    pitchStage(`legacy:melody-stage:${6000 + index}`, 6000 + index));
  const corrupt = pitchStage('legacy:melody-stage:6999', 6999, 'Corrupt C');
  const snapshot = { appId: 'pitch', schemaVersion: 1, records: [
    ...normal, corrupt, pitchOrder([...normal.map((record) => record.recordId), corrupt.recordId]),
    pitchProgress(normal[0].recordId, 4), pitchProgress(corrupt.recordId, 9)
  ] };
  await seedPitchCloud(fixture, pitch, snapshot, new Set([corrupt.recordId]));

  const hydrated = await fixture.runtime.consumeHandoff('transient');
  assert.equal(hydrated.ok, true, JSON.stringify(hydrated));
  const local = await fixture.runtime.localRecords();
  assert.equal(local.records.filter((record) => record.recordType === 'melody_stage').length, 20);
  assert.equal(local.records.some((record) => record.recordType === 'melody_stage' &&
    record.recordId === corrupt.recordId), false);
  const order = local.records.find((record) => record.recordType === 'stage_order' && record.recordId === 'melody');
  assert.deepEqual(Array.from(order.payload.stageRefs), normal.map((record) => record.recordId));
  assert.equal(local.records.some((record) => record.recordType === 'progress' &&
    record.payload.stageRef === normal[0].recordId), true);
  assert.equal(local.records.some((record) => record.recordType === 'progress' &&
    record.payload.stageRef === corrupt.recordId), false);
  assert.equal((await fixture.store.listOutbox()).length, 0);
  const shadow = await fixture.store.listShadow();
  assert.deepEqual(Array.from(shadow.find((record) => record.recordType === 'stage_order').payload.stageRefs),
    normal.map((record) => record.recordId));
  assert.equal(shadow.some((record) => record.recordType === 'melody_stage' && record.recordId === corrupt.recordId), false);
  assert.equal((await fixture.store.listConflicts()).length, 1);
  assert.equal((await fixture.runtime.attentionSummary()).kind, 'data_repair');
  assert.equal(await fixture.store.readMeta('runtimeState'), 'attention');
  assert.match(await pitch.computeManifest(local.snapshot), /^[a-f0-9]{64}$/u);
  assert.equal(fixture.server.records.get(`melody_stage/${corrupt.recordId}`).payload.pool[0], '[object Object]',
    'hydrate projection must not rewrite the cloud source');
});

test('real Pitch both-corrupt delete converges stage, order and progress without touching unrelated records', async () => {
  const { fixture, corrupt, safeA, safeB, conflict } = await prepareRealPitchBothCorrupt();
  const unrelatedBefore = structuredClone(fixture.server.records.get(`progress/melody:${safeA.recordId}`));

  const resolved = await fixture.runtime.resolveConflict(conflict.id, 'local');
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  const stage = fixture.server.records.get(`melody_stage/${corrupt.recordId}`);
  const order = fixture.server.records.get('stage_order/melody');
  const progress = fixture.server.records.get(`progress/melody:${corrupt.recordId}`);
  assert.notEqual(stage.deletedAt, null);
  assert.deepEqual(order.payload.stageRefs, [safeA.recordId, safeB.recordId]);
  assert.notEqual(progress.deletedAt, null);
  assert.deepEqual(fixture.server.records.get(`progress/melody:${safeA.recordId}`), unrelatedBefore);
  const local = await fixture.runtime.localRecords();
  assert.equal(local.records.some((record) => record.recordId === corrupt.recordId), false);
  assert.deepEqual(Array.from(local.records.find((record) => record.recordType === 'stage_order').payload.stageRefs),
    [safeA.recordId, safeB.recordId]);
  assert.equal((await fixture.store.listOutbox()).length, 0);
  assert.equal((await fixture.store.listConflicts()).length, 0);
  const shadow = await fixture.store.listShadow();
  assert.notEqual(shadow.find((record) => record.recordType === 'melody_stage' &&
    record.recordId === corrupt.recordId).deletedAt, null);
  assert.deepEqual(Array.from(shadow.find((record) => record.recordType === 'stage_order').payload.stageRefs),
    [safeA.recordId, safeB.recordId]);
  assert.match(await fixture.runtime.adapter.computeManifest(local.snapshot), /^[a-f0-9]{64}$/u);
});

test('real Pitch corrupt delete resumes after order response loss without duplicate revisions', async () => {
  const { fixture, corrupt, safeA, safeB, conflict } = await prepareRealPitchBothCorrupt();
  const orderBefore = fixture.server.records.get('stage_order/melody').revision;
  fixture.server.responseLossAfterApply = true;

  const first = await fixture.runtime.resolveConflict(conflict.id, 'local');
  assert.equal(first.ok, false);
  assert.equal(first.code, 'network_error');
  assert.equal(fixture.server.records.get('stage_order/melody').revision, orderBefore + 1);
  assert.equal(fixture.server.records.get(`melody_stage/${corrupt.recordId}`).deletedAt, null,
    'the stage stays live until dependency cleanup is verified');
  const restarted = new fixture.Runtime({
    appId: 'pitch', endpoint: 'https://example.test', adapter: fixture.runtime.adapter,
    store: fixture.store, accountClient: fixture.accountClient, accountCore: fixture.core,
    fetchImpl: fixture.fetchImpl, randomOperationId: fixture.nextId
  });
  const resumed = await restarted.resumeConflictResolutions();
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  assert.equal(fixture.server.records.get('stage_order/melody').revision, orderBefore + 1);
  assert.deepEqual(fixture.server.records.get('stage_order/melody').payload.stageRefs,
    [safeA.recordId, safeB.recordId]);
  assert.notEqual(fixture.server.records.get(`progress/melody:${corrupt.recordId}`).deletedAt, null);
  assert.notEqual(fixture.server.records.get(`melody_stage/${corrupt.recordId}`).deletedAt, null);
  assert.equal((await fixture.store.listOutbox()).length, 0);
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

test('real Pitch corrupt delete refetches an order CAS race and preserves the newer reorder', async () => {
  const { fixture, corrupt, safeA, safeB, conflict } = await prepareRealPitchBothCorrupt();
  fixture.server.beforeNextPush = async (server) => {
    const current = server.records.get('stage_order/melody');
    server.records.set('stage_order/melody', { ...current,
      payload: { ...current.payload, stageRefs: [safeB.recordId, corrupt.recordId, safeA.recordId] },
      payloadHash: 'newer-reorder', revision: current.revision + 1,
      changeSeq: ++server.revision, operationId: 'other-device-reorder' });
  };

  const resolved = await fixture.runtime.resolveConflict(conflict.id, 'local');
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  assert.deepEqual(fixture.server.records.get('stage_order/melody').payload.stageRefs,
    [safeB.recordId, safeA.recordId]);
  const local = await fixture.runtime.localRecords();
  assert.deepEqual(Array.from(local.records.find((record) => record.recordType === 'stage_order').payload.stageRefs),
    [safeB.recordId, safeA.recordId]);
  assert.equal((await fixture.store.listConflicts()).length, 0);
  assert.equal((await fixture.store.listOutbox()).length, 0);
});

test('real Pitch normal delete uses ordinary order conflict resolution and later reorder still pushes', async () => {
  const { fixture, pitch } = createRealPitchRuntimeFixture();
  const removed = pitchStage('legacy:melody-stage:7201', 7201, 'Remove normally');
  const keptA = pitchStage('legacy:melody-stage:7202', 7202, 'Kept A');
  const keptB = pitchStage('legacy:melody-stage:7203', 7203, 'Kept B');
  const baseline = { appId: 'pitch', schemaVersion: 1, records: [removed, keptA, keptB,
    pitchOrder([removed.recordId, keptA.recordId, keptB.recordId]),
    pitchProgress(removed.recordId, 2), pitchProgress(keptA.recordId, 1)] };
  await pitch.applyRemoteSnapshot(baseline);
  await seedPitchCloud(fixture, pitch, baseline);
  assert.equal((await fixture.runtime.consumeHandoff('transient')).ok, true);

  const localDelete = { appId: 'pitch', schemaVersion: 1, records: [keptA, keptB,
    pitchOrder([keptA.recordId, keptB.recordId]), pitchProgress(keptA.recordId, 1)] };
  await pitch.applyRemoteSnapshot(localDelete);
  const remoteOrder = fixture.server.records.get('stage_order/melody');
  fixture.server.records.set('stage_order/melody', { ...remoteOrder,
    payload: { ...remoteOrder.payload, stageRefs: [keptB.recordId, removed.recordId, keptA.recordId] },
    payloadHash: 'concurrent-reorder', revision: remoteOrder.revision + 1,
    changeSeq: ++fixture.server.revision, operationId: 'concurrent-reorder' });

  const conflicted = await fixture.runtime.performSync('normal-delete-race');
  assert.equal(conflicted.code, 'conflict');
  const [orderConflict] = await fixture.store.listConflicts();
  assert.equal(orderConflict.kind, 'pull');
  assert.equal(orderConflict.recordKey, 'stage_order/melody');
  assert.equal((await fixture.runtime.listConflictPresentations())[0].recovery, null,
    'a normal tombstone must not enter corrupt recovery');
  assert.equal((await fixture.runtime.resolveConflict(orderConflict.id, 'local')).ok, true);
  assert.equal((await fixture.runtime.performSync('finish-normal-delete')).ok, true);
  assert.notEqual(fixture.server.records.get(`melody_stage/${removed.recordId}`).deletedAt, null);
  assert.notEqual(fixture.server.records.get(`progress/melody:${removed.recordId}`).deletedAt, null);
  assert.deepEqual(fixture.server.records.get('stage_order/melody').payload.stageRefs,
    [keptA.recordId, keptB.recordId]);
  assert.equal((await fixture.store.listConflicts()).length, 0);

  const later = { appId: 'pitch', schemaVersion: 1, records: [keptA, keptB,
    pitchOrder([keptB.recordId, keptA.recordId]), pitchProgress(keptA.recordId, 1)] };
  await pitch.applyRemoteSnapshot(later);
  const orderRevision = fixture.server.records.get('stage_order/melody').revision;
  assert.equal((await fixture.runtime.performSync('later-reorder')).ok, true);
  assert.deepEqual(fixture.server.records.get('stage_order/melody').payload.stageRefs,
    [keptB.recordId, keptA.recordId]);
  assert.equal(fixture.server.records.get('stage_order/melody').revision, orderRevision + 1);
  assert.equal(await fixture.store.readMeta('runtimeState'), 'ready');
  assert.equal((await fixture.store.listOutbox()).length, 0);
});

test('real Pitch valid Local replaces a corrupt cloud stage while order and progress remain consistent', async () => {
  const { fixture, pitch } = createRealPitchRuntimeFixture();
  const target = pitchStage('legacy:melody-stage:7301', 7301, 'Valid Local');
  const other = pitchStage('legacy:melody-stage:7302', 7302, 'Other');
  const baseline = { appId: 'pitch', schemaVersion: 1, records: [target, other,
    pitchOrder([target.recordId, other.recordId]), pitchProgress(target.recordId, 5)] };
  await pitch.applyRemoteSnapshot(baseline);
  await seedPitchCloud(fixture, pitch, baseline);
  assert.equal((await fixture.runtime.consumeHandoff('transient')).ok, true);
  const key = `melody_stage/${target.recordId}`;
  const remote = fixture.server.records.get(key);
  fixture.server.records.set(key, { ...remote, payload: { ...remote.payload, pool: ['[object Object]'] },
    payloadHash: 'corrupt-cloud', revision: remote.revision + 1,
    changeSeq: ++fixture.server.revision, operationId: 'corrupt-cloud' });

  assert.equal((await fixture.runtime.performSync('detect-cloud-corrupt')).ok, true);
  const [conflict] = await fixture.store.listConflicts();
  assert.deepEqual(conflict.recovery, { localInvalid: false, remoteInvalid: true });
  assert.equal((await fixture.runtime.resolveConflict(conflict.id, 'local')).ok, true);
  assert.deepEqual(fixture.server.records.get(key).payload.pool,
    [{ note: 'C', octaveOffset: 0 }, { note: 'D', octaveOffset: 1 }]);
  assert.deepEqual(fixture.server.records.get('stage_order/melody').payload.stageRefs,
    [target.recordId, other.recordId]);
  assert.equal(fixture.server.records.get(`progress/melody:${target.recordId}`).payload.clearCount, 5);
  const orderRevision = fixture.server.records.get('stage_order/melody').revision;
  assert.equal((await fixture.runtime.performSync('converged-valid-local')).ok, true);
  assert.equal(fixture.server.records.get('stage_order/melody').revision, orderRevision,
    'recovery shadows prevent a redundant order rewrite');
  assert.equal((await fixture.store.listOutbox()).length, 0);
});

test('real Pitch valid Cloud restores a corrupt local stage together with order and progress', async () => {
  const { fixture, pitch, storage } = createRealPitchRuntimeFixture();
  const target = pitchStage('legacy:melody-stage:7401', 7401, 'Valid Cloud');
  const other = pitchStage('legacy:melody-stage:7402', 7402, 'Other');
  const baseline = { appId: 'pitch', schemaVersion: 1, records: [target, other,
    pitchOrder([other.recordId, target.recordId]), pitchProgress(target.recordId, 8)] };
  await pitch.applyRemoteSnapshot(baseline);
  await seedPitchCloud(fixture, pitch, baseline);
  assert.equal((await fixture.runtime.consumeHandoff('transient')).ok, true);
  const slots = JSON.parse(storage.getItem('pitchTrainerStagingProMelodySlots'));
  slots.slots.find((slot) => Number(slot.id) === 7401).config.pool = ['[object Object]'];
  storage.setItem('pitchTrainerStagingProMelodySlots', JSON.stringify(slots));

  assert.equal((await fixture.runtime.performSync('detect-local-corrupt')).ok, true);
  const [conflict] = await fixture.store.listConflicts();
  assert.deepEqual(conflict.recovery, { localInvalid: true, remoteInvalid: false });
  assert.equal((await fixture.runtime.resolveConflict(conflict.id, 'remote')).ok, true);
  const local = await fixture.runtime.localRecords();
  assert.deepEqual(JSON.parse(JSON.stringify(local.records.find((record) => record.recordId === target.recordId).payload.pool)),
    [{ note: 'C', octaveOffset: 0 }, { note: 'D', octaveOffset: 1 }]);
  assert.deepEqual(Array.from(local.records.find((record) => record.recordType === 'stage_order').payload.stageRefs),
    [other.recordId, target.recordId]);
  assert.equal(local.records.find((record) => record.recordType === 'progress' &&
    record.payload.stageRef === target.recordId).payload.clearCount, 8);
  assert.equal((await fixture.store.listOutbox()).length, 0);
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

test('real Pitch corrupt stage does not stall an unrelated stage edit or normal progress update', async () => {
  const { fixture, pitch, storage } = createRealPitchRuntimeFixture();
  const safe = pitchStage('legacy:melody-stage:7501', 7501, 'Safe before');
  const corrupt = pitchStage('legacy:melody-stage:7502', 7502, 'Corrupt');
  const baseline = { appId: 'pitch', schemaVersion: 1, records: [safe, corrupt,
    pitchOrder([safe.recordId, corrupt.recordId]), pitchProgress(safe.recordId, 1), pitchProgress(corrupt.recordId, 2)] };
  await pitch.applyRemoteSnapshot(baseline);
  await seedPitchCloud(fixture, pitch, baseline);
  assert.equal((await fixture.runtime.consumeHandoff('transient')).ok, true);
  const slots = JSON.parse(storage.getItem('pitchTrainerStagingProMelodySlots'));
  slots.slots.find((slot) => Number(slot.id) === 7502).config.pool = ['[object Object]'];
  storage.setItem('pitchTrainerStagingProMelodySlots', JSON.stringify(slots));
  const corruptKey = `melody_stage/${corrupt.recordId}`;
  const remoteCorrupt = fixture.server.records.get(corruptKey);
  fixture.server.records.set(corruptKey, { ...remoteCorrupt,
    payload: { ...remoteCorrupt.payload, pool: ['[object Object]'] }, payloadHash: 'corrupt-both',
    revision: remoteCorrupt.revision + 1, changeSeq: ++fixture.server.revision, operationId: 'corrupt-both' });
  assert.equal((await fixture.runtime.performSync('detect-corrupt')).ok, true);

  const editedSlots = JSON.parse(storage.getItem('pitchTrainerStagingProMelodySlots'));
  editedSlots.slots.find((slot) => Number(slot.id) === 7501).name = 'Safe edited';
  storage.setItem('pitchTrainerStagingProMelodySlots', JSON.stringify(editedSlots));
  const results = JSON.parse(storage.getItem('pitchTrainerTestModeResults'));
  results.melody['custom-7501'].clearCount = 11;
  storage.setItem('pitchTrainerTestModeResults', JSON.stringify(results));

  assert.equal((await fixture.runtime.performSync('unrelated-edit')).ok, true);
  assert.equal(fixture.server.records.get(`melody_stage/${safe.recordId}`).payload.name, 'Safe edited');
  assert.equal(fixture.server.records.get(`progress/melody:${safe.recordId}`).payload.clearCount, 11);
  assert.equal(fixture.server.records.get(corruptKey).payload.pool[0], '[object Object]');
  assert.equal((await fixture.store.listConflicts()).length, 1);
  assert.equal((await fixture.runtime.attentionSummary()).kind, 'data_repair');
  assert.equal((await fixture.store.listOutbox()).length, 0);
});

test('real Pitch dangling tombstone references hydrate safely and open data-repair attention', async () => {
  const { fixture, pitch } = createRealPitchRuntimeFixture();
  const removed = pitchStage('legacy:melody-stage:7601', 7601, 'Already removed');
  const safe = pitchStage('legacy:melody-stage:7602', 7602, 'Safe');
  const snapshot = { appId: 'pitch', schemaVersion: 1, records: [removed, safe,
    pitchOrder([removed.recordId, safe.recordId]), pitchProgress(removed.recordId, 3)] };
  await seedPitchCloud(fixture, pitch, snapshot);
  const stageKey = `melody_stage/${removed.recordId}`;
  const stage = fixture.server.records.get(stageKey);
  fixture.server.records.set(stageKey, { ...stage, payload: null, deleted: true, deletedAt: Date.now(),
    payloadHash: 'deleted-stage', revision: stage.revision + 1,
    changeSeq: ++fixture.server.revision, operationId: 'partial-delete' });

  const hydrated = await fixture.runtime.consumeHandoff('transient');
  assert.equal(hydrated.ok, true, JSON.stringify(hydrated));
  const local = await fixture.runtime.localRecords();
  assert.equal(local.records.some((record) => record.recordId === removed.recordId), false);
  assert.deepEqual(Array.from(local.records.find((record) => record.recordType === 'stage_order').payload.stageRefs),
    [safe.recordId]);
  assert.equal(local.records.some((record) => record.recordType === 'progress' &&
    record.payload.stageRef === removed.recordId), false);
  const [conflict] = await fixture.store.listConflicts();
  assert.equal(conflict.reason, 'pitch_stage_dependency_inconsistent');
  assert.equal((await fixture.runtime.attentionSummary()).kind, 'data_repair');
  const [presentation] = await fixture.runtime.listConflictPresentations();
  assert.equal(presentation.presentation.title, 'ステージの関連データを確認');
  assert.equal(presentation.recovery.localLabel, 'このステージを削除');
  assert.equal((await fixture.runtime.resolveConflict(conflict.id, 'local')).ok, true);
  assert.deepEqual(fixture.server.records.get('stage_order/melody').payload.stageRefs, [safe.recordId]);
  assert.notEqual(fixture.server.records.get(`progress/melody:${removed.recordId}`).deletedAt, null);
  assert.equal((await fixture.store.listConflicts()).length, 0);
  assert.equal((await fixture.store.listOutbox()).length, 0);
});

test('real Pitch recovery isolates an object-string melody while a healthy setting syncs and Cloud restores the stage', async () => {
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, structuredClone, URL, console });
  vm.runInContext(readFileSync(new URL('../../pitch-cruise/sync/pitch-sync-adapter.js', import.meta.url), 'utf8'), context);
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  const pitch = new context.SoundCruisePitchSync.PitchSyncAdapter({ storage, cryptoImpl: webcrypto,
    backupStore: { async save() {} } });
  const stageId = 'legacy:melody-stage:5001';
  const baseline = { appId: 'pitch', schemaVersion: 1, records: [
    { recordType: 'melody_stage', recordId: stageId, schemaVersion: 1, payload: {
      id: stageId, legacyId: 5001, name: 'QA recovery melody',
      pool: [{ note: 'C', octaveOffset: 0 }, { note: 'D', octaveOffset: 1 }],
      count: 4, is2Octave: true, isPianoLayout: true, answerMethod: 'note', description: 'QA'
    } },
    { recordType: 'stage_order', recordId: 'melody', schemaVersion: 1,
      payload: { id: 'melody', category: 'melody', stageRefs: [stageId] } }
  ] };
  await pitch.applyRemoteSnapshot(baseline);
  const fixture = runtimeFixture([], 'pitch');
  fixture.runtime.adapter = pitch;
  await fixture.runtime.consumeHandoff('transient');

  const legacy = JSON.parse(storage.getItem('pitchTrainerStagingProMelodySlots'));
  legacy.slots[0].config.pool = ['[object Object]'];
  storage.setItem('pitchTrainerStagingProMelodySlots', JSON.stringify(legacy));
  storage.setItem('pitchTrainerSettings', JSON.stringify({
    instrument: 'acoustic_guitar', notationStyle: 'doremi', scaleEnabled: true,
    isAnswerMode: true, keyRandomMode: false, baseOctave: 3, keyOffset: 0, noteSpeed: 2
  }));
  const result = await fixture.runtime.sync('save');
  assert.equal(result.ok, true);
  assert.equal(fixture.server.records.get(`melody_stage/${stageId}`).payload.pool[0].note, 'C');
  assert.equal(fixture.server.records.get('settings/settings').payload.values.noteSpeed, 2);
  const [conflict] = await fixture.store.listConflicts();
  assert.equal(conflict.kind, 'invalid_record');
  assert.equal(conflict.recordKey, `melody_stage/${stageId}`);
  assert.equal((await fixture.runtime.attentionSummary()).kind, 'data_repair');

  const repaired = await fixture.runtime.resolveConflict(conflict.id, 'remote');
  assert.equal(repaired.ok, true, JSON.stringify(repaired));
  const restored = JSON.parse(storage.getItem('pitchTrainerStagingProMelodySlots')).slots[0];
  assert.deepEqual(restored.config.pool, [{ note: 'C', octaveOffset: 0 }, { note: 'D', octaveOffset: 1 }]);
  assert.equal(JSON.parse(storage.getItem('pitchTrainerSettings')).noteSpeed, 2);
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

test('a malformed Port snapshot cannot queue or push cloud tombstones', async () => {
  const fixture = runtimeFixture([record('x')], 'port');
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.readLocalSnapshot = () => { throw new Error('port_storage_invalid:cruisePort.myApps'); };
  const pushCalls = fixture.server.pushCalls;
  await assert.rejects(fixture.runtime.sync('invalid-local'), /port_storage_invalid/u);
  assert.equal(fixture.server.pushCalls, pushCalls);
  assert.equal((await fixture.store.listOutbox()).length, 0);
  assert.equal(fixture.server.records.get('custom_record/x').deletedAt, null);
});

test('an unconfirmed Port deletion is isolated without a tombstone', async () => {
  const fixture = runtimeFixture([record('x')], 'port');
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.records = [record('safe')];
  fixture.local.canDeleteRecord = () => false;
  const result = await fixture.runtime.sync('unconfirmed-delete');
  assert.equal(result.ok, true);
  assert.equal((await fixture.store.listOutbox()).length, 0);
  assert.equal((await fixture.store.listConflicts())[0].kind, 'ambiguous_delete');
  assert.equal(fixture.server.records.get('custom_record/x').deletedAt, null);
  assert.equal(fixture.server.records.get('custom_record/safe').deletedAt, null);
});

test('record reconciliation keeps an unsent local edit while pulling another remote record', async () => {
  const fixture = runtimeFixture([record('x', 'X0'), record('y', 'Y0')], 'port');
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.records = [record('x', 'X1'), record('y', 'Y0')];
  const remoteY = fixture.server.records.get('custom_record/y');
  fixture.server.records.set('custom_record/y', { ...remoteY, payload: { name: 'Y1' },
    payloadHash: 'hash-y-Y1', revision: remoteY.revision + 1, changeSeq: ++fixture.server.revision });
  const result = await fixture.runtime.sync('remote-y');
  assert.equal(result.ok, true);
  assert.equal(fixture.local.records.find((item) => item.recordId === 'x').payload.name, 'X1');
  assert.equal(fixture.local.records.find((item) => item.recordId === 'y').payload.name, 'Y1');
  assert.equal(fixture.server.records.get('custom_record/x').deletedAt, null);
  assert.equal((await fixture.store.listConflicts()).length, 0);
});

test('an edit made after the initial snapshot survives the remote apply', async () => {
  const fixture = runtimeFixture([record('x', 'X0'), record('y', 'Y0')], 'port');
  await fixture.runtime.consumeHandoff('transient');
  const remoteY = fixture.server.records.get('custom_record/y');
  fixture.server.records.set('custom_record/y', { ...remoteY, payload: { name: 'Y1' },
    payloadHash: 'hash-y-Y1', revision: remoteY.revision + 1, changeSeq: ++fixture.server.revision });
  const originalFlush = fixture.runtime.flushOutbox.bind(fixture.runtime);
  fixture.runtime.flushOutbox = async (...args) => {
    fixture.local.records = [record('x', 'X1'), record('y', 'Y0')];
    return originalFlush(...args);
  };
  await fixture.runtime.sync('mid-sync-edit');
  assert.equal(fixture.local.records.find((item) => item.recordId === 'x').payload.name, 'X1');
  assert.equal(fixture.local.records.find((item) => item.recordId === 'y').payload.name, 'Y1');
});

test('a save during the backup gap stops the apply before overwriting that save', async () => {
  const fixture = runtimeFixture([record('x', 'X0'), record('y', 'Y0')], 'port');
  await fixture.runtime.consumeHandoff('transient');
  const remoteY = fixture.server.records.get('custom_record/y');
  fixture.server.records.set('custom_record/y', { ...remoteY, payload: { name: 'Y1' },
    payloadHash: 'hash-y-Y1', revision: remoteY.revision + 1, changeSeq: ++fixture.server.revision });
  fixture.context.SoundCruiseSyncAccount.appBackupStorage.save = async () => {
    fixture.local.records = [record('x', 'X1'), record('y', 'Y0')];
  };
  await assert.rejects(fixture.runtime.sync('backup-gap'), (error) => error.code === 'local_changed_during_apply');
  assert.equal(fixture.local.records.find((item) => item.recordId === 'x').payload.name, 'X1');
  assert.equal(fixture.local.records.find((item) => item.recordId === 'y').payload.name, 'Y0');
  assert.equal((await fixture.store.listShadow()).find((item) => item.recordId === 'y').payload.name, 'Y0');
});

test('network TypeError keeps the outbox retryable and the saved timer wakes it', async () => {
  const fixture = runtimeFixture([record('a')], 'pitch');
  await fixture.runtime.consumeHandoff('transient');
  let now = 100_000;
  fixture.runtime.now = () => now;
  const timers = [];
  fixture.context.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
  fixture.context.clearTimeout = () => {};
  fixture.local.records = [record('a'), record('b')];
  const originalFetch = fixture.runtime.fetchImpl;
  let failed = false;
  fixture.runtime.fetchImpl = async (url, init) => {
    if (!failed && new URL(url).pathname === '/v1/sync/push') {
      failed = true;
      throw new TypeError('Load failed');
    }
    return originalFetch(url, init);
  };
  await assert.rejects(fixture.runtime.sync('save'), (error) => error.code === 'network_error');
  const [pending] = await fixture.store.listOutbox();
  assert.equal(pending.terminalError, undefined);
  assert.ok(pending.nextRetryAt > now);
  assert.equal(await fixture.store.readMeta('runtimeState'), 'retrying');
  assert.ok(timers.length > 0);
  await fixture.runtime.sync('before-retry-due');
  assert.equal(await fixture.store.readMeta('runtimeState'), 'pending');
  now = pending.nextRetryAt;
  timers.at(-1).callback();
  await Promise.resolve();
  await fixture.runtime.running;
  assert.equal((await fixture.store.listOutbox()).length, 0);
  assert.equal(fixture.server.records.get('custom_record/b').deletedAt, null);
});

test('an aborted fetch is normalized as a retryable network error', async () => {
  const fixture = runtimeFixture([], 'pitch', 'production');
  await fixture.store.setMeta('credential', 'scd1.valid');
  fixture.runtime.fetchImpl = async () => { throw Object.assign(new Error('timed out'), { name: 'AbortError' }); };
  await assert.rejects(fixture.runtime.request('GET', '/v1/sync/snapshot?appId=pitch'),
    (error) => error.code === 'network_error' && error.status === 0);
});

test('permanent validation 4xx is terminal and cannot acquire a retry timer', async () => {
  const fixture = runtimeFixture([record('a')], 'pitch');
  await fixture.runtime.consumeHandoff('transient');
  const timers = [];
  fixture.context.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
  fixture.context.clearTimeout = () => {};
  fixture.local.records = [record('a'), record('b')];
  fixture.server.nextPushFailure = { status: 400, code: 'invalid_request' };
  await assert.rejects(fixture.runtime.sync('save'), (error) => error.code === 'invalid_request');
  assert.equal((await fixture.store.listOutbox())[0].terminalError, 'invalid_request');
  assert.equal(fixture.runtime.retryTimer, null);
  assert.equal(fixture.runtime.networkRetryAt, 0);
  assert.equal(await fixture.store.readMeta('runtimeState'), 'attention');
});

test('legacy push_failed retries only with persisted network provenance', async () => {
  const fixture = runtimeFixture([record('a')], 'pitch');
  await fixture.runtime.consumeHandoff('transient');
  fixture.local.records = [record('a'), record('b')];
  const operation = await fixture.runtime.operationFor(record('b'), 0);
  await fixture.store.putOutbox({ ...operation, migration: false, terminalError: 'push_failed', failureKind: 'network' });
  const result = await fixture.runtime.sync('recovered');
  assert.equal(result.ok, true);
  assert.equal((await fixture.store.listOutbox()).length, 0);
  assert.equal(fixture.server.records.get('custom_record/b').deletedAt, null);

  fixture.local.records = [record('a'), record('b'), record('c')];
  const unknown = await fixture.runtime.operationFor(record('c'), 0);
  await fixture.store.putOutbox({ ...unknown, migration: false, terminalError: 'push_failed' });
  await fixture.runtime.sync('unknown-provenance');
  assert.equal((await fixture.store.listOutbox()).some((item) => item.operationId === unknown.operationId), true);
  assert.equal(fixture.server.records.has('custom_record/c'), false);
  assert.equal(await fixture.store.readMeta('runtimeState'), 'attention');
});

test('explicit legacy retry sends one unchanged operation and never loops on permanent rejection', async () => {
  const fixture = runtimeFixture([record('a')], 'pitch');
  await fixture.runtime.consumeHandoff('base');
  fixture.local.records = [record('a'), record('b')];
  const operation = await fixture.runtime.operationFor(record('b'), 0);
  await fixture.store.putOutbox({ ...operation, migration: false, terminalError: 'push_failed' });
  fixture.server.nextPushFailure = { status: 400, code: 'invalid_request' };
  await assert.rejects(fixture.runtime.retryLegacyFailures(), (error) => error.code === 'invalid_request');
  const [retained] = await fixture.store.listOutbox();
  assert.equal(retained.legacyRecoveryAttempted, true);
  assert.equal(retained.terminalError, 'invalid_request');
  assert.equal((await fixture.runtime.retryLegacyFailures()).recovered, 0);
  assert.equal(fixture.server.records.has('custom_record/b'), false);
});

test('snapshot network failure schedules bounded retry even with an empty outbox', async () => {
  const fixture = runtimeFixture([record('a')], 'pitch');
  await fixture.runtime.consumeHandoff('base');
  const timers = [];
  fixture.context.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
  fixture.context.clearTimeout = () => {};
  fixture.server.nextSnapshotFailure = { network: true };
  await assert.rejects(fixture.runtime.sync('snapshot-failure'), (error) => error.code === 'network_error');
  assert.ok(fixture.runtime.networkRetryAt > 0);
  assert.ok(timers.some((timer) => timer.delay >= 0 && timer.delay <= 300000));
});

test('a hung snapshot fetch times out as a retryable network failure', async () => {
  const fixture = runtimeFixture([], 'pitch');
  await fixture.store.setMeta('credential', 'scd1.valid');
  await fixture.store.setMeta('qaCredential', 'scq1.valid');
  fixture.context.AbortController = AbortController;
  let wake;
  fixture.context.setTimeout = (callback) => { wake = callback; return 1; };
  fixture.context.clearTimeout = () => {};
  fixture.runtime.fetchImpl = async () => new Promise(() => {});
  const request = fixture.runtime.serverSnapshot();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof wake, 'function');
  wake();
  await assert.rejects(request, (error) => error.code === 'network_error');
});

test('hung snapshot releases the sync lock and a later retry succeeds', async () => {
  const fixture = runtimeFixture([], 'pitch');
  await fixture.runtime.consumeHandoff('base');
  const originalFetch = fixture.runtime.fetchImpl;
  let expire;
  fixture.context.setTimeout = (callback, delay) => { if (delay === 20000) expire = callback; return 1; };
  fixture.context.clearTimeout = () => {};
  fixture.runtime.fetchImpl = async () => new Promise(() => {});
  const first = fixture.runtime.sync('hung');
  await new Promise((resolve) => setImmediate(resolve));
  expire();
  await assert.rejects(first, (error) => error.code === 'network_error');
  assert.equal(fixture.runtime.running, null);
  assert.ok(fixture.runtime.networkRetryAt > 0);
  fixture.runtime.fetchImpl = originalFetch;
  assert.equal((await fixture.runtime.sync('retry')).ok, true);
  assert.equal(fixture.runtime.running, null);
});

test('a stalled snapshot response body also times out', async () => {
  const fixture = runtimeFixture([], 'pitch');
  await fixture.store.setMeta('credential', 'scd1.valid');
  await fixture.store.setMeta('qaCredential', 'scq1.valid');
  fixture.context.AbortController = AbortController;
  const timers = [];
  fixture.context.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
  fixture.context.clearTimeout = () => {};
  fixture.runtime.fetchImpl = async () => ({ ok: true, status: 200, json: async () => new Promise(() => {}) });
  const request = fixture.runtime.serverSnapshot();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.length, 2);
  assert.equal(timers[1].delay, 15 * 60 * 1000);
  timers[1].callback();
  await assert.rejects(request, (error) => error.code === 'network_error');
});

test('snapshot 400 stays terminal while 429 and 5xx retain retry scheduling', async () => {
  for (const failure of [
    { status: 400, code: 'invalid_request', retry: false },
    { status: 429, code: 'rate_limited', retry: true },
    { status: 503, code: 'service_unavailable', retry: true }
  ]) {
    const fixture = runtimeFixture([], 'pitch');
    await fixture.store.setMeta('credential', 'scd1.valid');
    await fixture.store.setMeta('qaCredential', 'scq1.valid');
    await fixture.store.setMeta('migrationState', 'complete');
    fixture.server.state = 'ready';
    fixture.server.nextSnapshotFailure = failure;
    await assert.rejects(fixture.runtime.sync('snapshot-status'),
      (error) => error.code === failure.code && error.status === failure.status);
    assert.equal(fixture.runtime.running, null);
    assert.equal(fixture.runtime.networkRetryAt > 0, failure.retry, failure.code);
  }
});

test('snapshot body progress can exceed 20 seconds in total, but an idle stream still times out', async () => {
  const fixture = runtimeFixture([], 'pitch');
  await fixture.store.setMeta('credential', 'scd1.valid');
  await fixture.store.setMeta('qaCredential', 'scq1.valid');
  let clock = 0;
  let nextId = 0;
  const timers = new Map();
  fixture.context.setTimeout = (callback, delay) => {
    const id = ++nextId;
    timers.set(id, { callback, at: clock + delay });
    return id;
  };
  fixture.context.clearTimeout = (id) => timers.delete(id);
  const advance = async (ms) => {
    clock += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= clock) { timers.delete(id); timer.callback(); }
    }
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  };
  let stream;
  fixture.runtime.fetchImpl = async () => new Response(new ReadableStream({
    start(controller) { stream = controller; }
  }), { headers: { 'Content-Type': 'application/json' } });
  const request = fixture.runtime.serverSnapshot();
  await advance(0);
  stream.enqueue(new TextEncoder().encode('{"ok":true,'));
  await advance(10000);
  stream.enqueue(new TextEncoder().encode('"records":[],'));
  await advance(10000);
  stream.enqueue(new TextEncoder().encode('"datasetState":"ready"}'));
  await advance(10000);
  stream.close();
  assert.equal((await request).datasetState, 'ready');
  assert.equal(clock, 30000);

  const stalled = fixture.runtime.serverSnapshot();
  await advance(0);
  stream.enqueue(new TextEncoder().encode('{"ok":true'));
  await advance(0);
  await advance(20001);
  await assert.rejects(stalled, (error) => error.code === 'network_error');
});

test('real Pitch, Fretboard and Rhythm adapters converge Local wins with an unrelated remote edit', async () => {
  const definitions = [
    { appId: 'pitch', file: '../../pitch-cruise/sync/pitch-sync-adapter.js',
      root: 'SoundCruisePitchSync', name: 'PitchSyncAdapter',
      records: (x, y) => [1, 2].map((stage, index) => {
        const ref = `builtin:melody:stage-${stage}`;
        const id = `melody:${ref}`;
        return { recordType: 'progress', recordId: id, schemaVersion: 1,
          payload: { id, category: 'melody', stageRef: ref,
            clearCount: index ? y : x, lastClearedAt: null } };
      }), x: [1, 2, 3], y: [1, 2] },
    { appId: 'fretboard', file: '../../fretboard_cruise/sync/fretboard-sync-adapter.js',
      root: 'SoundCruiseFretboardSync', name: 'FretboardSyncAdapter',
      records: (x, y) => [
        { recordType: 'settings', recordId: 'settings', schemaVersion: 1,
          payload: { id: 'settings', values: { tempo: x } } },
        { recordType: 'progress', recordId: 'rules', schemaVersion: 1,
          payload: { id: 'rules', category: 'rules', completedSteps: y === 1 ? [1] : [1, 2] } }
      ], x: [80, 90, 100], y: [1, 2] },
    { appId: 'rhythm', file: '../../rhythm-cruise/sync/rhythm-sync-adapter.js',
      root: 'SoundCruiseRhythmSync', name: 'RhythmSyncAdapter',
      records: (x, y) => [
        { recordType: 'settings', recordId: 'settings', schemaVersion: 1,
          payload: { id: 'settings', values: {
            judgePreset: x === 1 ? 'easy' : x === 2 ? 'strict' : 'veryStrict' } } },
        { recordType: 'builtin_stage_preferences', recordId: 'builtin:stage:1', schemaVersion: 1,
          payload: { id: 'builtin:stage:1', builtinStageRef: 'builtin:stage:1', bpm: y === 1 ? 92 : 100, bars: 6 } }
      ], x: [1, 2, 3], y: [1, 2] }
  ];
  for (const definition of definitions) {
    const fixture = runtimeFixture([], definition.appId);
    const storageValues = new Map();
    const storage = { getItem: (key) => storageValues.get(key) ?? null,
      setItem: (key, value) => storageValues.set(key, String(value)),
      removeItem: (key) => storageValues.delete(key) };
    const context = vm.createContext({ crypto: webcrypto, TextEncoder, structuredClone, URL, console });
    vm.runInContext(readFileSync(new URL(definition.file, import.meta.url), 'utf8'), context);
    const adapter = new context[definition.root][definition.name]({ storage, cryptoImpl: webcrypto });
    const snapshot = (x, y) => ({ appId: definition.appId, schemaVersion: 1,
      records: definition.records(x, y) });
    const baseline = snapshot(definition.x[0], definition.y[0]);
    const local = snapshot(definition.x[1], definition.y[0]);
    const remote = snapshot(definition.x[2], definition.y[1]);
    for (const value of [baseline, local, remote]) adapter.validateSnapshot(value);
    await adapter.applyRemoteSnapshot(baseline);
    await adapter.applyRemoteSnapshot(local);
    fixture.runtime.adapter = adapter;
    await fixture.store.setMeta('credential', 'scd1.valid');
    await fixture.store.setMeta('qaCredential', 'scq1.valid');
    await fixture.store.setMeta('migrationState', 'complete');
    fixture.server.state = 'ready';
    const baseRecords = await adapter.serializeRecords(baseline);
    for (const record of baseRecords) {
      const cloud = { ...record, revision: 1, deletedAt: null, changeSeq: ++fixture.server.revision,
        operationId: `base-${record.recordId}` };
      fixture.server.records.set(`${record.recordType}/${record.recordId}`, cloud);
      await fixture.store.putShadow(`${record.recordType}/${record.recordId}`, cloud);
    }
    const remoteRecords = await adapter.serializeRecords(remote);
    for (const record of remoteRecords) {
      fixture.server.records.set(`${record.recordType}/${record.recordId}`, {
        ...record, revision: 2, deletedAt: null, changeSeq: ++fixture.server.revision,
        operationId: `remote-${record.recordId}` });
    }
    const originalFetch = fixture.fetchImpl;
    fixture.runtime.fetchImpl = async (url, init) => {
      const response = await originalFetch(url, init);
      if (new URL(url).pathname !== '/v1/sync/snapshot' || !response.ok) return response;
      const payload = await response.json();
      const live = payload.records.filter((record) => record.deletedAt == null);
      payload.manifestHash = await adapter.computeManifest(adapter.deserializeRecords(live));
      return Response.json(payload);
    };
    assert.equal((await fixture.runtime.sync('concurrent')).code, 'conflict', definition.appId);
    const [conflict] = await fixture.store.listConflicts();
    assert.equal(conflict.recordKey, `${local.records[0].recordType}/${local.records[0].recordId}`);
    assert.equal((await fixture.runtime.resolveConflict(conflict.id, 'local')).ok, true, definition.appId);
    assert.equal((await fixture.runtime.sync('pull-unrelated')).ok, true, definition.appId);
    const final = await fixture.runtime.localRecords();
    const expected = snapshot(definition.x[1], definition.y[1]);
    assert.equal(await adapter.computeManifest(final.snapshot), await adapter.computeManifest(expected), definition.appId);
  }
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
    const [item] = await fixture.runtime.listConflictPresentations();
    assert.deepEqual(JSON.parse(JSON.stringify(item.presentation.fields)), [
      { label: 'BPM', local: '79', remote: '削除済み' }
    ]);
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
    const [item] = await fixture.runtime.listConflictPresentations();
    assert.deepEqual(JSON.parse(JSON.stringify(item.presentation.fields)), [
      { label: 'BPM', local: '削除済み', remote: '81' }
    ]);
  });
});
