import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { validatePortLocalCollections } from './port-sync-local-validation.js';
import { loadPracticeMenuSets } from './practice-menu-sets-store.js';
import { hashRecord, validateOperation } from '../../workers/sound-cruise-sync/src/records.js';
import { validateRecordPayload } from '../../workers/sound-cruise-sync/src/record-schema-registry.js';
import {
    isRecordTypeAllowed, parseBodyCapabilities, parseQueryCapabilities, visibleRecords
} from '../../workers/sound-cruise-sync/src/sync-capabilities.js';

const T = '2026-09-29T00:00:00.000Z';
const SETS = 'cruisePort.practiceMenuSets';
const MENUS = 'cruisePort.practiceMenus';
const INTENTS = 'cruisePort.syncDeletionIntent.v1';

class CustomEventPolyfill extends Event {
    constructor(type, init = {}) { super(type); this.detail = init.detail; }
}

function menu(id, name) {
    return { id, name, durationMinutes: 10, appId: null, memo: '', hidden: false, createdAt: T, updatedAt: T };
}

function set(id, name, itemIds, updatedAt = T) {
    return { id, name, itemIds, createdAt: T, updatedAt };
}

function memoryStorage(values = {}) {
    const data = new Map(Object.entries(values));
    return {
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: (key) => data.delete(key)
    };
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

// A dataset server that applies the Sync Worker's own capability gate and Port schema.
function gatedServer() {
    const server = { state: 'missing', records: new Map(), revision: 0, requests: [], rejected: [] };
    const fetchImpl = async (url, init = {}) => {
        const parsed = new URL(url);
        const body = init.body ? JSON.parse(init.body) : null;
        server.requests.push({ path: parsed.pathname, search: parsed.search, body });
        if (parsed.pathname === '/v1/sync/bootstrap') {
            server.state = 'initializing';
            return Response.json({ ok: true, datasetState: server.state, schemaVersion: 1, alreadyCreated: false }, { status: 201 });
        }
        if (parsed.pathname === '/v1/sync/snapshot') {
            const capabilities = parseQueryCapabilities(parsed, 'port');
            const records = visibleRecords('port', [...server.records.values()], capabilities);
            const live = records.filter((record) => record.deletedAt == null);
            return Response.json({ ok: true, datasetState: server.state, schemaVersion: 1,
                recordCount: live.length, manifestHash: `m-${live.map((record) => record.recordId).sort().join('-')}`,
                cursor: `c${server.revision}`, records });
        }
        if (parsed.pathname === '/v1/sync/push') {
            const capabilities = parseBodyCapabilities(body.capabilities, 'port');
            const results = [];
            for (const operation of body.operations) {
                if (!isRecordTypeAllowed('port', operation.recordType, capabilities)) {
                    server.rejected.push(operation);
                    results.push({ operationId: operation.operationId, status: 'invalid', code: 'capability_required' });
                    continue;
                }
                if (!operation.deleted && !validateRecordPayload('port', operation.recordType, operation.recordId, operation.payload)) {
                    throw new Error(`worker schema rejects ${operation.recordType}/${operation.recordId}`);
                }
                const key = `${operation.recordType}/${operation.recordId}`;
                const current = server.records.get(key) || null;
                if (Number(operation.baseRevision || 0) !== Number(current?.revision || 0)) {
                    results.push({ operationId: operation.operationId, status: 'conflict', record: current });
                    continue;
                }
                server.revision += 1;
                const record = { ...operation, revision: Number(current?.revision || 0) + 1,
                    deletedAt: operation.deleted ? Date.now() : null, changeSeq: server.revision };
                delete record.deleted;
                server.records.set(key, record);
                results.push({ operationId: operation.operationId, status: 'applied', record });
            }
            return Response.json({ ok: true, results });
        }
        if (parsed.pathname === '/v1/sync/migration/complete') {
            server.state = 'ready';
            return Response.json({ ok: true, datasetState: 'ready', recordCount: body.recordCount,
                manifestHash: body.manifestHash, cursor: `c${server.revision}` });
        }
        throw new Error(`unexpected ${parsed.pathname}`);
    };
    return { server, fetchImpl };
}

let deviceCounter = 0;
// `capable: false` models Port 1.3.0 (or a rollback): no capability is declared.
function device(values, fetchImpl, { capable = true } = {}) {
    const deviceId = `d${++deviceCounter}`;
    const globalEvents = new EventTarget();
    const context = {
        crypto: webcrypto, Headers, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout,
        structuredClone, EventTarget, CustomEvent: CustomEventPolyfill, URL,
        navigator: { onLine: true }, queueMicrotask,
        addEventListener: globalEvents.addEventListener.bind(globalEvents),
        removeEventListener: globalEvents.removeEventListener.bind(globalEvents),
        dispatchEvent: globalEvents.dispatchEvent.bind(globalEvents),
        document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
        SoundCruiseMultiAppSync: {},
        SoundCruiseSyncAccount: { appBackupStorage: { async save() {} } }
    };
    context.globalThis = context;
    const storage = memoryStorage(values);
    context.localStorage = storage;
    context.SoundCruisePortSync = { validateLocalStorage: validatePortLocalCollections };
    const shared = new URL('../shared/sync-account/', import.meta.url);
    vm.runInNewContext(readFileSync(new URL('settings-field-merge.js', shared), 'utf8'), context);
    vm.runInNewContext(readFileSync(new URL('multi-app-sync-runtime.js', shared), 'utf8'), context);
    vm.runInNewContext(readFileSync(new URL('./port-sync-adapter.js', import.meta.url), 'utf8'), context);
    const adapter = new context.SoundCruisePortSync.PortSyncAdapter({ storage, cryptoImpl: webcrypto });
    if (!capable) delete adapter.syncCapabilities;
    let id = 0;
    const core = { validAppCredential: (value) => value === 'scd1.valid',
        validQaCredential: (value) => value === 'scq1.valid', createOperationId: () => `${deviceId}-op-${++id}` };
    const accountClient = { admissionMode: 'qa', async consumeHandoff() {
        return { consumeMode: 'new_app', membershipId: 'm1', membershipState: 'active',
            appDeviceCredential: 'scd1.valid', qaCredential: 'scq1.valid' };
    }, async confirmConsumePersisted() {} };
    const runtime = new context.SoundCruiseMultiAppSync.MultiAppSyncRuntime({ appId: 'port',
        endpoint: 'https://example.test', adapter, store: memoryStore(), accountClient, accountCore: core,
        fetchImpl, randomOperationId: () => `${deviceId}-op-${++id}` });
    return {
        runtime, adapter, storage,
        sets: () => JSON.parse(storage.getItem(SETS) || '{"items":[]}').items,
        writeSets: (items, deleted = []) => {
            storage.setItem(SETS, JSON.stringify({ version: 1, items }));
            if (deleted.length) {
                const intents = JSON.parse(storage.getItem(INTENTS) || '{}');
                deleted.forEach((setId) => { intents[`practice_menu_set/${setId}`] = true; });
                storage.setItem(INTENTS, JSON.stringify(intents));
            }
        }
    };
}

const menus = JSON.stringify({ version: 3, items: [menu('menu-a', 'メロディ音感'), menu('menu-b', 'コード音感'), menu('menu-c', 'コード練習')] });

test('the Port adapter serializes sets as reference-only records the Worker accepts', async () => {
    const storage = memoryStorage({ [MENUS]: menus,
        [SETS]: JSON.stringify({ version: 1, items: [set('set-1', '音感練', ['menu-a', 'menu-b', 'deleted-menu'])] }) });
    const context = { crypto: webcrypto, TextEncoder, structuredClone, URL, localStorage: storage };
    context.globalThis = context;
    vm.runInNewContext(readFileSync(new URL('./port-sync-adapter.js', import.meta.url), 'utf8'), context);
    const api = context.SoundCruisePortSync;
    assert.ok(api.MANAGED_KEYS.includes(SETS), 'sets are Cloud Sync data');
    assert.ok(!api.MANAGED_KEYS.includes('cruisePort.practiceMenuSetSelection'), 'the selected set stays device-local');
    assert.deepEqual([...api.SYNC_CAPABILITIES], ['practice_menu_sets_v1']);
    const snapshot = api.readLocalSnapshot(storage);
    const records = snapshot.records.filter((record) => record.recordType === 'practice_menu_set');
    assert.equal(records.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(records[0].payload.value)),
        set('set-1', '音感練', ['menu-a', 'menu-b', 'deleted-menu']), 'itemIds preserved, missing reference included safely');
    assert.equal(snapshot.records.some((record) => record.recordType === 'practice_menu_set_order'), false);
    const [serialized] = (await api.serializeRecords({ schemaVersion: 1, records })).map((item) => ({
        ...item, operationId: '123e4567-e89b-52d3-a456-000000000001', baseRevision: 0, deleted: false
    }));
    // Over the wire the payload is JSON, exactly as the runtime sends it.
    const operation = JSON.parse(JSON.stringify({ operationId: serialized.operationId, recordType: serialized.recordType,
        recordId: serialized.recordId, schemaVersion: 1, baseRevision: 0, payload: serialized.payload,
        payloadHash: serialized.payloadHash, deleted: false }));
    assert.equal(operation.payloadHash, await hashRecord({ ...operation }, webcrypto, 'port'), 'client and Worker hash agree');
    assert.equal((await validateOperation(operation, webcrypto, 'port')).ok, true);
    assert.equal(validateRecordPayload('port', 'practice_menu_set', 'set-1', operation.payload), true);
    assert.equal(api.getConflictPresentation({ localRecord: records[0] }).title, '練習メニューのプリセット');
});

test('remote apply restores the same sets and writes nothing for users without sets', async () => {
    const source = memoryStorage({ [MENUS]: menus,
        [SETS]: JSON.stringify({ version: 1, items: [set('set-2', 'ギター練', ['menu-c']), set('set-1', '音感練', ['menu-a'])] }) });
    const load = (storage) => {
        const context = { crypto: webcrypto, TextEncoder, structuredClone, URL, localStorage: storage };
        context.globalThis = context;
        vm.runInNewContext(readFileSync(new URL('./port-sync-adapter.js', import.meta.url), 'utf8'), context);
        return context.SoundCruisePortSync;
    };
    const snapshot = load(source).readLocalSnapshot(source);
    const target = memoryStorage({ [MENUS]: menus });
    await load(target).applyRemoteSnapshot(target, snapshot);
    assert.deepEqual(loadPracticeMenuSets(target).items.map((item) => [item.id, item.name, item.itemIds]),
        [['set-1', '音感練', ['menu-a']], ['set-2', 'ギター練', ['menu-c']]], 'sets arrive in creation order (createdAt, then id)');
    const empty = memoryStorage({ [MENUS]: menus });
    await load(empty).applyRemoteSnapshot(empty, { schemaVersion: 1, records: snapshot.records.filter((record) => record.recordType !== 'practice_menu_set') });
    assert.equal(empty.getItem(SETS), null, 'no sets, no key');
    await load(target).applyRemoteSnapshot(target, { schemaVersion: 1, records: snapshot.records.filter((record) => record.recordId !== 'set-1') });
    assert.deepEqual(loadPracticeMenuSets(target).items.map((item) => item.id), ['set-2'], 'a remote delete removes the set locally');
    assert.deepEqual(JSON.parse(target.getItem(MENUS)).items.map((item) => item.id), ['menu-a', 'menu-b', 'menu-c'], 'menus untouched');
});

test('set deletion is guarded by the durable deletion intent', () => {
    const storage = memoryStorage({});
    const context = { crypto: webcrypto, TextEncoder, structuredClone, URL, localStorage: storage };
    context.globalThis = context;
    vm.runInNewContext(readFileSync(new URL('./port-sync-adapter.js', import.meta.url), 'utf8'), context);
    const adapter = new context.SoundCruisePortSync.PortSyncAdapter({ storage, cryptoImpl: webcrypto });
    assert.equal(adapter.canDeleteRecord('practice_menu_set/set-1', null), false);
    storage.setItem(INTENTS, JSON.stringify({ 'practice_menu_set/set-1': true }));
    assert.equal(adapter.canDeleteRecord('practice_menu_set/set-1', null), true);
});

test('Case 2: two capable devices sync create, rename, membership edit and delete', async () => {
    const { server, fetchImpl } = gatedServer();
    const a = device({ [MENUS]: menus }, fetchImpl);
    await a.runtime.consumeHandoff('a');
    a.writeSets([set('set-1', '音感練', ['menu-a', 'menu-b'])]);
    await a.runtime.sync('create');
    assert.ok(server.records.has('practice_menu_set/set-1'));
    const b = device({}, fetchImpl);
    await b.runtime.consumeHandoff('b');
    assert.deepEqual(b.sets(), [set('set-1', '音感練', ['menu-a', 'menu-b'])], 'device B sees the same id, name and itemIds');

    b.writeSets([set('set-1', '朝の音感練', ['menu-b', 'menu-c'], '2026-09-29T02:00:00.000Z')]);
    await b.runtime.sync('edit');
    await a.runtime.sync('pull');
    assert.deepEqual(a.sets().map((item) => [item.name, item.itemIds]), [['朝の音感練', ['menu-b', 'menu-c']]]);

    a.writeSets([], ['set-1']);
    await a.runtime.sync('delete');
    assert.ok(server.records.get('practice_menu_set/set-1').deletedAt != null);
    await b.runtime.sync('pull');
    assert.deepEqual(b.sets(), []);
    assert.equal(JSON.parse(b.storage.getItem(MENUS)).items.length, 3, 'menus survive the set deletion');
    for (const request of server.requests.filter((item) => item.path === '/v1/sync/snapshot')) {
        assert.match(request.search, /capabilities=practice_menu_sets_v1/);
    }
});

test('Case 1 + rollback: an old device never receives, re-pushes or deletes sets and keeps menu sync', async () => {
    const { server, fetchImpl } = gatedServer();
    const newA = device({ [MENUS]: menus }, fetchImpl);
    await newA.runtime.consumeHandoff('a');
    newA.writeSets([set('set-1', '音感練', ['menu-a'])]);
    await newA.runtime.sync('create');

    const oldB = device({}, fetchImpl, { capable: false });
    await oldB.runtime.consumeHandoff('b');
    for (let round = 0; round < 3; round += 1) await oldB.runtime.sync(`old-${round}`);
    assert.equal(oldB.storage.getItem(SETS), null, 'the old device never receives sets');
    assert.equal(JSON.parse(oldB.storage.getItem(MENUS)).items.length, 3, 'its practice menu sync works');
    assert.deepEqual(server.rejected, [], 'the old device never even attempts a set write or delete');
    assert.equal(server.records.get('practice_menu_set/set-1').deletedAt, null, 'remote set preserved');

    // The old device edits a practice menu; the capable device still has its set.
    const items = JSON.parse(oldB.storage.getItem(MENUS)).items;
    items[0] = { ...items[0], name: 'メロディ音感（改）', updatedAt: '2026-09-29T03:00:00.000Z' };
    oldB.storage.setItem(MENUS, JSON.stringify({ version: 3, items }));
    await oldB.runtime.sync('old-edit');
    await newA.runtime.sync('pull');
    assert.equal(JSON.parse(newA.storage.getItem(MENUS)).items[0].name, 'メロディ音感（改）');
    assert.deepEqual(newA.sets().map((item) => item.id), ['set-1']);

    // Even a forged delete from a client without the capability is refused.
    const forged = await fetchImpl('https://example.test/v1/sync/push', { method: 'POST', body: JSON.stringify({
        appId: 'port', mode: 'sync', operations: [{ operationId: 'forged', recordType: 'practice_menu_set',
            recordId: 'set-1', schemaVersion: 1, baseRevision: 1, payload: null, payloadHash: '0'.repeat(64), deleted: true }]
    }) });
    assert.equal((await forged.json()).results[0].code, 'capability_required');
    assert.equal(server.records.get('practice_menu_set/set-1').deletedAt, null);
});

test('only adapters that declare a capability send one; other apps send unchanged requests', async () => {
    const { server, fetchImpl } = gatedServer();
    const newA = device({ [MENUS]: menus }, fetchImpl);
    await newA.runtime.consumeHandoff('a');
    const oldB = device({ [MENUS]: menus }, fetchImpl, { capable: false });
    const before = server.requests.length;
    await oldB.runtime.consumeHandoff('b');
    const oldRequests = server.requests.slice(before);
    assert.ok(oldRequests.length > 0);
    for (const request of oldRequests) {
        assert.doesNotMatch(request.search, /capabilities/);
        assert.equal(Object.hasOwn(request.body || {}, 'capabilities'), false);
    }
    const pushes = server.requests.slice(0, before).filter((item) => item.path === '/v1/sync/push');
    assert.ok(pushes.length > 0 && pushes.every((item) => item.body.capabilities?.[0] === 'practice_menu_sets_v1'));
});

test('1.4.1: a preset order set on device A arrives unchanged on device B, independent of other sets', async () => {
    const { server, fetchImpl } = gatedServer();
    const a = device({ [MENUS]: menus }, fetchImpl);
    await a.runtime.consumeHandoff('a');
    a.writeSets([set('set-1', '音感練', ['menu-a', 'menu-b', 'menu-c']), set('set-2', '朝練', ['menu-b', 'menu-a'])]);
    await a.runtime.sync('create');
    const b = device({}, fetchImpl);
    await b.runtime.consumeHandoff('b');
    assert.deepEqual(b.sets().map((item) => item.itemIds), [['menu-a', 'menu-b', 'menu-c'], ['menu-b', 'menu-a']]);

    // Device A reorders 音感練 to C → A → B (only that set's itemIds change).
    a.writeSets([set('set-1', '音感練', ['menu-c', 'menu-a', 'menu-b'], '2026-09-30T00:00:00.000Z'), set('set-2', '朝練', ['menu-b', 'menu-a'])]);
    await a.runtime.sync('reorder');
    await b.runtime.sync('pull');
    assert.deepEqual(b.sets().map((item) => [item.name, item.itemIds]),
        [['音感練', ['menu-c', 'menu-a', 'menu-b']], ['朝練', ['menu-b', 'menu-a']]]);
    assert.deepEqual(JSON.parse(b.storage.getItem(MENUS)).items.map((item) => item.id), ['menu-a', 'menu-b', 'menu-c'],
        'the master order is unchanged');
    assert.equal(server.records.get('practice_menu_set/set-2').revision, 1, 'the other set was not rewritten');

    // Renaming on device B keeps the order everywhere.
    b.writeSets([set('set-1', '朝の音感練', ['menu-c', 'menu-a', 'menu-b'], '2026-09-30T01:00:00.000Z'), set('set-2', '朝練', ['menu-b', 'menu-a'])]);
    await b.runtime.sync('rename');
    await a.runtime.sync('pull');
    assert.deepEqual(a.sets()[0].itemIds, ['menu-c', 'menu-a', 'menu-b']);
});
