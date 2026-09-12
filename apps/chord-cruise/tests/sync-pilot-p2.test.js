'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var webcrypto = require('crypto').webcrypto;

var root = path.join(__dirname, '..');
var coreSource = fs.readFileSync(path.join(root, 'js/sync/sync-core.js'), 'utf8');
var clientSource = fs.readFileSync(path.join(root, 'js/sync/sync-client.js'), 'utf8');
var DEVICE_ID = '123e4567-e89b-42d3-a456-426614174000';
var CREDENTIAL = 'scd1.' + DEVICE_ID + '.' + 'A'.repeat(43);

function createStorage(seed, failures) {
    var values = Object.assign({}, seed || {});
    var config = failures || {};
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem: function (key, value) {
            if (config.failSetKey === key) throw new Error('localStorage quota');
            values[key] = String(value);
        },
        removeItem: function (key) {
            if (config.failRemoveKey === key) throw new Error('localStorage remove failed');
            delete values[key];
        },
        key: function (index) { return Object.keys(values)[index] || null; },
        get length() { return Object.keys(values).length; },
        snapshot: function () { return Object.assign({}, values); }
    };
}

function createMemoryStore(failures) {
    var meta = new Map();
    var outbox = new Map();
    var shadow = new Map();
    var conflicts = new Map();
    var config = failures || {};
    function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
    return {
        name: 'soundCruiseSync', version: 1,
        getMeta: async function (key) { return clone(meta.get(key)); },
        setMeta: async function (key, value) {
            if (config.failMetaKey === key) throw new Error('IndexedDB meta failure');
            meta.set(key, clone(value));
        },
        putOutbox: async function (value) {
            if (config.failOutbox) throw new Error('IndexedDB outbox failure');
            outbox.set(value.operationId, clone(value));
        },
        getOutbox: async function (key) { return clone(outbox.get(key)); },
        listOutbox: async function () { return clone(Array.from(outbox.values())); },
        deleteOutbox: async function (key) { outbox.delete(key); },
        putShadow: async function (value) {
            if (config.failShadowOnce) {
                config.failShadowOnce = false;
                throw new Error('IndexedDB shadow failure');
            }
            shadow.set(value.recordKey, clone(value));
        },
        getShadow: async function (key) { return clone(shadow.get(key)); },
        listShadow: async function () { return clone(Array.from(shadow.values())); },
        putConflict: async function (value) { conflicts.set(value.conflictId, clone(value)); },
        listConflicts: async function () { return clone(Array.from(conflicts.values())); },
        deleteConflict: async function (key) { conflicts.delete(key); },
        inspect: function () { return { meta: meta, outbox: outbox, shadow: shadow, conflicts: conflicts }; }
    };
}

function loadClient(store) {
    var window = {
        crypto: webcrypto,
        setTimeout: setTimeout,
        addEventListener: function () {},
        document: { addEventListener: function () {}, visibilityState: 'visible' }
    };
    var context = {
        window: window, crypto: webcrypto, TextEncoder: TextEncoder, URL: URL,
        JSON: JSON, Object: Object, Number: Number, Uint8Array: Uint8Array,
        Date: Date, Promise: Promise, setTimeout: setTimeout, encodeURIComponent: encodeURIComponent
    };
    vm.createContext(context);
    vm.runInContext(coreSource, context, { filename: 'sync-core.js' });
    window.ChordCruiseSync.database = { open: async function () { return store; } };
    vm.runInContext(clientSource, context, { filename: 'sync-client.js' });
    return window.ChordCruiseSync;
}

function response(status, body, bookmark) {
    return {
        ok: status >= 200 && status < 300,
        status: status,
        json: async function () { return body; },
        headers: { get: function (name) { return name.toLowerCase() === 'x-d1-bookmark' ? (bookmark || null) : null; } }
    };
}

var seed = {
    'chordCruise.schemaVersion': JSON.stringify('1'),
    'chordCruise.settings': JSON.stringify({ selectedKey: 0 }),
    'chordCruise.folders': JSON.stringify([{ id: 'folder-a', name: 'A' }]),
    'chordCruise.chord.c1': JSON.stringify({ id: 'c1', folderId: 'folder-a', chordName: 'C', notes: [] }),
    'chordCruise.libraryOrder': JSON.stringify({ version: 1, folderIds: ['folder-a'], entryIdsByFolder: { 'folder-a': ['c1'] } })
};

async function seedCredential(store) {
    await store.setMeta('deviceCredential', { deviceId: DEVICE_ID, credential: CREDENTIAL, credentialVersion: 1 });
}

(async function () {
    var migrationStore = createMemoryStore();
    await seedCredential(migrationStore);
    var migrationSync = loadClient(migrationStore);
    var migrationStorage = createStorage(seed);
    var serverOperations = new Map();
    var serverSequence = 0;
    var loseFirstResponse = true;
    var migrationClient = migrationSync.client.createClient({
        enabled: true,
        localStorage: migrationStorage,
        crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787',
        now: function () { return 1000; },
        fetch: async function (url, options) {
            assert.strictEqual(options.headers.Authorization, 'Bearer ' + CREDENTIAL);
            if (url.endsWith('/v1/sync/push')) {
                var request = JSON.parse(options.body);
                assert.strictEqual(request.mode, 'migration');
                var results = request.operations.map(function (operation) {
                    var existing = serverOperations.get(operation.operationId);
                    if (existing) return { operationId: operation.operationId, status: 'duplicate', record: existing };
                    serverSequence += 1;
                    var record = {
                        recordType: operation.recordType,
                        recordId: operation.recordId,
                        schemaVersion: 1,
                        revision: 1,
                        payload: operation.payload,
                        payloadHash: operation.payloadHash,
                        deletedAt: null,
                        operationId: operation.operationId,
                        changeSeq: serverSequence
                    };
                    serverOperations.set(operation.operationId, record);
                    return { operationId: operation.operationId, status: 'applied', record: record };
                });
                if (loseFirstResponse) {
                    loseFirstResponse = false;
                    throw new Error('response lost after server commit');
                }
                return response(200, { ok: true, appId: 'chord', results: results }, 'bookmark-push');
            }
            if (url.endsWith('/v1/sync/migration/complete')) {
                var completed = JSON.parse(options.body);
                assert.strictEqual(serverOperations.size, completed.recordCount);
                return response(200, {
                    ok: true,
                    appId: 'chord',
                    datasetState: 'ready',
                    recordCount: completed.recordCount,
                    manifestHash: completed.manifestHash,
                    cursor: 'scc1.NA'
                }, 'bookmark-ready');
            }
            throw new Error('unexpected endpoint');
        }
    });
    var beforeMigration = migrationStorage.snapshot();
    var firstMigration = await migrationClient.beginInitialMigration();
    assert.strictEqual(firstMigration.ok, false);
    assert.strictEqual(firstMigration.code, 'network_error');
    assert.strictEqual(serverOperations.size, 4, 'server commit happened once before response loss');
    assert.strictEqual((await migrationStore.listOutbox()).length, 4, 'response loss retains original operations');
    var completedMigration = await migrationClient.beginInitialMigration();
    assert.strictEqual(completedMigration.ok, true);
    assert.strictEqual(serverOperations.size, 4, 'retry uses deterministic operation IDs without duplicate records');
    assert.strictEqual((await migrationStore.listOutbox()).length, 0);
    assert.strictEqual((await migrationStore.listShadow()).length, 4);
    assert.strictEqual(await migrationStore.getMeta('datasetState'), 'ready');
    assert.strictEqual(await migrationStore.getMeta('migrationState'), 'complete');
    assert.strictEqual(await migrationStore.getMeta('cursor'), 'scc1.NA');
    assert.deepStrictEqual(migrationStorage.snapshot(), beforeMigration, 'migration and retry never rewrite localStorage');

    var syncStore = createMemoryStore();
    await seedCredential(syncStore);
    await syncStore.setMeta('datasetState', 'ready');
    await syncStore.setMeta('migrationState', 'complete');
    var sync = loadClient(syncStore);
    var syncStorage = createStorage(seed);
    var client;
    var snapshotClient = sync.client.createClient({ enabled: true, localStorage: syncStorage, crypto: webcrypto, endpoint: 'http://127.0.0.1:8787' });
    var initialRecord = (await snapshotClient.captureSnapshot()).records.find(function (record) { return record.recordKey === 'chord/c1'; });
    await snapshotClient.saveShadow([{
        recordType: 'chord', recordId: 'c1', schemaVersion: 1, revision: 1,
        payload: initialRecord.payload, payloadHash: initialRecord.payloadHash, deletedAt: null
    }]);
    var changedPayload = Object.assign({}, initialRecord.payload, { chordName: 'Cm' });
    var changedHash = await sync.core.hashSyncPayload('chord', 'c1', changedPayload, 1, webcrypto);
    var serverChange = {
        recordType: 'chord', recordId: 'c1', schemaVersion: 1, revision: 2,
        payload: changedPayload, payloadHash: changedHash, deletedAt: null,
        operationId: 'server-op', changeSeq: 2
    };
    client = sync.client.createClient({
        enabled: true, localStorage: syncStorage, crypto: webcrypto, endpoint: 'http://127.0.0.1:8787',
        fetch: async function () {
            return response(200, { ok: true, appId: 'chord', changes: [serverChange], nextCursor: 'scc1.Mg', hasMore: false });
        }
    });
    var pulled = await client.pullOnce();
    assert.strictEqual(pulled.applied, 1);
    assert.strictEqual(JSON.parse(syncStorage.getItem('chordCruise.chord.c1')).chordName, 'Cm');
    assert.strictEqual(await syncStore.getMeta('cursor'), 'scc1.Mg');

    var cursorFailures = { failMetaKey: null };
    var cursorStore = createMemoryStore(cursorFailures);
    await seedCredential(cursorStore);
    var cursorSync = loadClient(cursorStore);
    var cursorStorage = createStorage(seed);
    var cursorClient = cursorSync.client.createClient({
        enabled: true, localStorage: cursorStorage, crypto: webcrypto, endpoint: 'http://127.0.0.1:8787',
        fetch: async function () {
            return response(200, { ok: true, appId: 'chord', changes: [serverChange], nextCursor: 'scc1.Mg', hasMore: false });
        }
    });
    var cursorInitial = (await cursorClient.captureSnapshot()).records.find(function (record) { return record.recordKey === 'chord/c1'; });
    await cursorClient.saveShadow([{
        recordType: 'chord', recordId: 'c1', schemaVersion: 1, revision: 1,
        payload: cursorInitial.payload, payloadHash: cursorInitial.payloadHash, deletedAt: null
    }]);
    cursorFailures.failMetaKey = 'cursor';
    await assert.rejects(cursorClient.pullOnce(), /meta failure/);
    assert.strictEqual(await cursorStore.getMeta('cursor'), undefined, 'failed cursor commit keeps the old cursor');
    assert.strictEqual(JSON.parse(cursorStorage.getItem('chordCruise.chord.c1')).chordName, 'Cm');
    cursorFailures.failMetaKey = null;
    assert.strictEqual((await cursorClient.pullOnce()).ok, true, 'cursor page retry is idempotent');
    assert.strictEqual(await cursorStore.getMeta('cursor'), 'scc1.Mg');

    var divergent = Object.assign({}, changedPayload, { chordName: 'C local' });
    syncStorage.setItem('chordCruise.chord.c1', JSON.stringify(divergent));
    var newerPayload = Object.assign({}, changedPayload, { chordName: 'C server' });
    var newerHash = await sync.core.hashSyncPayload('chord', 'c1', newerPayload, 1, webcrypto);
    var conflict = await client.applyPulledRecord({
        recordType: 'chord', recordId: 'c1', schemaVersion: 1, revision: 3,
        payload: newerPayload, payloadHash: newerHash, deletedAt: null,
        operationId: 'server-op-2', changeSeq: 3
    });
    assert.strictEqual(conflict.status, 'conflict');
    assert.strictEqual(JSON.parse(syncStorage.getItem('chordCruise.chord.c1')).chordName, 'C local');
    assert.strictEqual((await syncStore.listConflicts()).length, 1, 'local divergence is persisted without overwrite');
    var tombstoneHash = await sync.core.hashSyncPayload('chord', 'c1', null, 1, webcrypto);
    var tombstone = {
        recordType: 'chord', recordId: 'c1', schemaVersion: 1, revision: 4,
        payload: null, payloadHash: tombstoneHash, deletedAt: 4000,
        operationId: 'server-delete', changeSeq: 4
    };
    assert.strictEqual((await client.applyPulledRecord(tombstone)).status, 'conflict');
    assert.strictEqual(JSON.parse(syncStorage.getItem('chordCruise.chord.c1')).chordName, 'C local',
        'a tombstone cannot erase a locally diverged record');

    var deleteStore = createMemoryStore();
    await seedCredential(deleteStore);
    var deleteSync = loadClient(deleteStore);
    var deleteStorage = createStorage(seed);
    var deleteClient = deleteSync.client.createClient({ enabled: true, localStorage: deleteStorage, crypto: webcrypto, endpoint: 'http://127.0.0.1:8787' });
    var deleteInitial = (await deleteClient.captureSnapshot()).records.find(function (record) { return record.recordKey === 'chord/c1'; });
    await deleteClient.saveShadow([{
        recordType: 'chord', recordId: 'c1', schemaVersion: 1, revision: 1,
        payload: deleteInitial.payload, payloadHash: deleteInitial.payloadHash, deletedAt: null
    }]);
    assert.strictEqual((await deleteClient.applyPulledRecord(tombstone)).status, 'applied');
    assert.strictEqual(deleteStorage.getItem('chordCruise.chord.c1'), null, 'matching local state accepts a server tombstone');

    var shadowFailures = { failShadowOnce: false };
    var failureStore = createMemoryStore(shadowFailures);
    await seedCredential(failureStore);
    var failureSync = loadClient(failureStore);
    var failureStorage = createStorage(seed);
    var failureClient = failureSync.client.createClient({ enabled: true, localStorage: failureStorage, crypto: webcrypto, endpoint: 'http://127.0.0.1:8787' });
    var failureInitial = (await failureClient.captureSnapshot()).records.find(function (record) { return record.recordKey === 'chord/c1'; });
    await failureClient.saveShadow([{
        recordType: 'chord', recordId: 'c1', schemaVersion: 1, revision: 1,
        payload: failureInitial.payload, payloadHash: failureInitial.payloadHash, deletedAt: null
    }]);
    shadowFailures.failShadowOnce = true;
    await assert.rejects(failureClient.applyPulledRecord(serverChange), /shadow failure/);
    assert.strictEqual(JSON.parse(failureStorage.getItem('chordCruise.chord.c1')).chordName, 'Cm',
        'server value already written before the shadow failure remains valid local data');
    assert.strictEqual((await failureStore.getShadow('chord/c1')).revision, 1, 'failed shadow write does not advance shadow');
    assert.strictEqual((await failureClient.applyPulledRecord(serverChange)).status, 'unchanged',
        'retry recognizes the already-applied server hash and repairs shadow idempotently');
    assert.strictEqual((await failureStore.getShadow('chord/c1')).revision, 2);

    var localFailureStorage = createStorage(seed, { failSetKey: 'chordCruise.chord.c1' });
    var localFailureStore = createMemoryStore();
    await seedCredential(localFailureStore);
    var localFailureSync = loadClient(localFailureStore);
    var localFailureClient = localFailureSync.client.createClient({ enabled: true, localStorage: localFailureStorage, crypto: webcrypto, endpoint: 'http://127.0.0.1:8787' });
    var localInitial = (await localFailureClient.captureSnapshot()).records.find(function (record) { return record.recordKey === 'chord/c1'; });
    await localFailureClient.saveShadow([{
        recordType: 'chord', recordId: 'c1', schemaVersion: 1, revision: 1,
        payload: localInitial.payload, payloadHash: localInitial.payloadHash, deletedAt: null
    }]);
    await assert.rejects(localFailureClient.applyPulledRecord(serverChange), /quota/);
    assert.strictEqual(JSON.parse(localFailureStorage.getItem('chordCruise.chord.c1')).chordName, 'C');
    assert.strictEqual((await localFailureStore.getShadow('chord/c1')).revision, 1, 'local failure never advances shadow');

    var statusStore = createMemoryStore();
    await seedCredential(statusStore);
    var statusSync = loadClient(statusStore);
    var statusStorage = createStorage(seed);
    var statusClient;
    var baseRecord = (await snapshotClient.captureSnapshot()).records.find(function (record) { return record.recordKey === 'chord/c1'; });
    var operations = [];
    for (var index = 0; index < 4; index += 1) {
        var operation = await statusSync.client.createClient({ enabled: true, localStorage: statusStorage, crypto: webcrypto, endpoint: 'http://127.0.0.1:8787' })
            .buildOperation(baseRecord, index, null, false);
        operation.localCommitted = true;
        await statusStore.putOutbox(operation);
        operations.push(operation);
    }
    statusClient = statusSync.client.createClient({
        enabled: true, localStorage: statusStorage, crypto: webcrypto, endpoint: 'http://127.0.0.1:8787',
        fetch: async function () {
            var acknowledged = {
                recordType: 'chord', recordId: 'c1', schemaVersion: 1, revision: 1,
                payload: baseRecord.payload, payloadHash: baseRecord.payloadHash, deletedAt: null, changeSeq: 1
            };
            return response(200, {
                ok: true, appId: 'chord', results: [
                    { operationId: operations[0].operationId, status: 'applied', record: Object.assign({}, acknowledged, { operationId: operations[0].operationId }) },
                    { operationId: operations[1].operationId, status: 'duplicate', record: Object.assign({}, acknowledged, { revision: 2, operationId: operations[1].operationId }) },
                    { operationId: operations[2].operationId, status: 'conflict', record: Object.assign({}, acknowledged, { revision: 3 }) },
                    { operationId: operations[3].operationId, status: 'invalid', code: 'hash_mismatch' }
                ]
            });
        }
    });
    var flushed = await statusClient.flushOutbox({ force: true });
    assert.deepStrictEqual(JSON.parse(JSON.stringify({
        applied: flushed.applied, duplicate: flushed.duplicate, conflict: flushed.conflict, invalid: flushed.invalid
    })), { applied: 1, duplicate: 1, conflict: 1, invalid: 1 });
    assert.strictEqual((await statusStore.listOutbox()).length, 2, 'conflict and invalid operations remain inspectable');
    assert.strictEqual((await statusStore.listOutbox()).some(function (operation) { return operation.conflict; }), true);
    assert.strictEqual((await statusStore.listOutbox()).some(function (operation) { return operation.terminalError; }), true);

    var offlineStore = createMemoryStore();
    await seedCredential(offlineStore);
    var offlineSync = loadClient(offlineStore);
    var offlineStorage = createStorage(seed);
    var offlineClient = offlineSync.client.createClient({
        enabled: true, localStorage: offlineStorage, crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', now: function () { return 5000; },
        fetch: async function () { throw new Error('offline'); }
    });
    var offlineOperation = await offlineClient.buildOperation(baseRecord, 0, null, false);
    offlineOperation.localCommitted = true;
    await offlineStore.putOutbox(offlineOperation);
    var offlineResult = await offlineClient.flushOutbox({ force: true });
    assert.strictEqual(offlineResult.code, 'network_error');
    assert.strictEqual((await offlineStore.getOutbox(offlineOperation.operationId)).retryCount, 1);
    assert.strictEqual((await offlineStore.getOutbox(offlineOperation.operationId)).nextRetryAt, 6000);
    assert.deepStrictEqual(offlineStorage.snapshot(), seed, 'offline retry state never changes Chord localStorage');

    var serverFailureStore = createMemoryStore();
    await seedCredential(serverFailureStore);
    var serverFailureSync = loadClient(serverFailureStore);
    var serverFailureClient = serverFailureSync.client.createClient({
        enabled: true, localStorage: createStorage(seed), crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', now: function () { return 8000; },
        fetch: async function () { return response(503, { ok: false, code: 'server_error' }); }
    });
    var serverFailureOperation = await serverFailureClient.buildOperation(baseRecord, 0, null, false);
    serverFailureOperation.localCommitted = true;
    await serverFailureStore.putOutbox(serverFailureOperation);
    assert.strictEqual((await serverFailureClient.flushOutbox({ force: true })).retryable, true);
    assert.strictEqual((await serverFailureStore.getOutbox(serverFailureOperation.operationId)).nextRetryAt, 9000,
        '5xx keeps the operation with bounded exponential backoff');

    var credentialFailureStore = createMemoryStore();
    await seedCredential(credentialFailureStore);
    var credentialFailureSync = loadClient(credentialFailureStore);
    var credentialFailureClient = credentialFailureSync.client.createClient({
        enabled: true, localStorage: createStorage(seed), crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', now: function () { return 9000; },
        fetch: async function () { return response(401, { ok: false, code: 'invalid_credential' }); }
    });
    var credentialFailureOperation = await credentialFailureClient.buildOperation(baseRecord, 0, null, false);
    credentialFailureOperation.localCommitted = true;
    await credentialFailureStore.putOutbox(credentialFailureOperation);
    var credentialFailure = await credentialFailureClient.flushOutbox({ force: true });
    assert.strictEqual(credentialFailure.code, 'invalid_credential');
    assert.strictEqual(await credentialFailureStore.getMeta('syncState'), 'credential_invalid');
    assert.strictEqual((await credentialFailureStore.listOutbox()).length, 1, '401 never discards local work');

    var batchStore = createMemoryStore();
    await seedCredential(batchStore);
    var batchSync = loadClient(batchStore);
    var batchBodies = [];
    var batchStorage = createStorage(seed);
    var batchClient = batchSync.client.createClient({
        enabled: true, localStorage: batchStorage, crypto: webcrypto, endpoint: 'http://127.0.0.1:8787',
        fetch: async function (_url, options) {
            var body = JSON.parse(options.body);
            batchBodies.push(options.body);
            return response(200, {
                ok: true,
                results: body.operations.map(function (wire) {
                    return {
                        operationId: wire.operationId,
                        status: 'applied',
                        record: Object.assign({}, wire, { revision: 1, deletedAt: null, changeSeq: batchBodies.length })
                    };
                })
            });
        }
    });
    for (var bigIndex = 0; bigIndex < 2; bigIndex += 1) {
        var bigPayload = { id: 'big-' + bigIndex, chordName: 'Large', notes: ['x'.repeat(135 * 1024)] };
        var bigRecord = batchSync.core.normalizeRecord('chord', bigPayload.id, bigPayload, 1);
        var bigOperation = await batchClient.buildOperation(bigRecord, 0, null, false);
        bigOperation.localCommitted = true;
        await batchStore.putOutbox(bigOperation);
    }
    await batchClient.flushOutbox({ force: true });
    await batchClient.flushOutbox({ force: true });
    assert.strictEqual(batchBodies.length, 2, 'operations are split before the 256 KiB request limit');
    batchBodies.forEach(function (body) {
        assert(new TextEncoder().encode(body).byteLength <= 256 * 1024);
    });
    assert.strictEqual((await batchStore.listOutbox()).length, 0);

    var rapidStore = createMemoryStore();
    await seedCredential(rapidStore);
    await rapidStore.setMeta('datasetState', 'ready');
    await rapidStore.setMeta('migrationState', 'complete');
    var rapidSync = loadClient(rapidStore);
    var rapidBase = { id: 'rapid', chordName: 'C', notes: [] };
    var rapidMiddle = { id: 'rapid', chordName: 'Cm', notes: [] };
    var rapidLatest = { id: 'rapid', chordName: 'C7', notes: [] };
    var rapidStorage = createStorage({
        'chordCruise.schemaVersion': JSON.stringify('1'),
        'chordCruise.chord.rapid': JSON.stringify(rapidLatest)
    });
    var rapidClient;
    var pushCount = 0;
    rapidClient = rapidSync.client.createClient({
        enabled: true, localStorage: rapidStorage, crypto: webcrypto, endpoint: 'http://127.0.0.1:8787',
        fetch: async function (url, options) {
            if (url.indexOf('/v1/sync/push') !== -1) {
                pushCount += 1;
                var wire = JSON.parse(options.body).operations[0];
                assert.strictEqual(wire.baseRevision, pushCount, 'a newer local save waits for the previous ack revision');
                return response(200, {
                    ok: true,
                    results: [{
                        operationId: wire.operationId,
                        status: 'applied',
                        record: Object.assign({}, wire, { revision: pushCount + 1, deletedAt: null, changeSeq: pushCount })
                    }]
                });
            }
            return response(200, { ok: true, changes: [], nextCursor: 'scc1.Mg', hasMore: false });
        }
    });
    var rapidBaseHash = await rapidSync.core.hashSyncPayload('chord', 'rapid', rapidBase, 1, webcrypto);
    await rapidClient.saveShadow([{
        recordType: 'chord', recordId: 'rapid', schemaVersion: 1, revision: 1,
        payload: rapidBase, payloadHash: rapidBaseHash, deletedAt: null
    }]);
    var rapidMiddleRecord = rapidSync.core.normalizeRecord('chord', 'rapid', rapidMiddle, 1);
    var rapidPending = await rapidClient.buildOperation(rapidMiddleRecord, 1, rapidBase, false);
    rapidPending.localCommitted = true;
    await rapidStore.putOutbox(rapidPending);
    var rapidResult = await rapidClient.syncNow();
    assert.strictEqual(rapidResult.ok, true);
    assert.strictEqual(pushCount, 2, 'two rapid local saves serialize instead of creating a stale conflict');
    assert.strictEqual((await rapidStore.listOutbox()).length, 0);
    assert.strictEqual((await rapidStore.getShadow('chord/rapid')).revision, 3);
    assert.strictEqual(JSON.parse(rapidStorage.getItem('chordCruise.chord.rapid')).chordName, 'C7');

    var watchedCalls = 0;
    var watchedStorage = { saveChord: function () { watchedCalls += 1; return true; } };
    assert.strictEqual(batchClient.watchLocalMutations(watchedStorage), true);
    assert.strictEqual(batchClient.watchLocalMutations(watchedStorage), false, 'storage hooks install only once');
    assert.strictEqual(watchedStorage.saveChord(), true);
    assert.strictEqual(watchedCalls, 1, 'Pilot save hook preserves the original local-first save');

    console.log('sync-pilot-p2: migration retry, idempotent ack, safe pull, conflict persistence, storage failures, batching, and backoff passed');
}()).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
