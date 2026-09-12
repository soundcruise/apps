'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var webcrypto = require('crypto').webcrypto;

var root = path.join(__dirname, '..');
var coreSource = fs.readFileSync(path.join(root, 'js/sync/sync-core.js'), 'utf8');
var mergeSource = fs.readFileSync(path.join(root, 'js/sync/sync-merge.js'), 'utf8');
var clientSource = fs.readFileSync(path.join(root, 'js/sync/sync-client.js'), 'utf8');
var bootstrapSource = fs.readFileSync(path.join(root, 'js/sync/sync-bootstrap.js'), 'utf8');

function createStorage(seed) {
    var values = Object.assign({}, seed || {});
    var writes = [];
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem: function (key, value) { writes.push({ type: 'set', key: key }); values[key] = String(value); },
        removeItem: function (key) { writes.push({ type: 'remove', key: key }); delete values[key]; },
        key: function (index) { return Object.keys(values)[index] || null; },
        get length() { return Object.keys(values).length; },
        writes: writes,
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
        setMeta: async function (key, value) { meta.set(key, clone(value)); },
        setMetaBatch: async function (entries) {
            if (config.failMetaBatch) throw new Error('IndexedDB metadata batch failure');
            entries.forEach(function (entry) { meta.set(entry.key, clone(entry.value)); });
        },
        putOutbox: async function (value) { outbox.set(value.operationId, clone(value)); },
        getOutbox: async function (key) { return clone(outbox.get(key)); },
        listOutbox: async function () { return clone(Array.from(outbox.values())); },
        deleteOutbox: async function (key) { outbox.delete(key); },
        putShadow: async function (value) { shadow.set(value.recordKey, clone(value)); },
        getShadow: async function (key) { return clone(shadow.get(key)); },
        listShadow: async function () { return clone(Array.from(shadow.values())); },
        putConflict: async function (value) { conflicts.set(value.conflictId, clone(value)); },
        listConflicts: async function () { return clone(Array.from(conflicts.values())); },
        deleteConflict: async function (key) { conflicts.delete(key); },
        inspectMeta: function () { return meta; }
    };
}

function loadClient(store) {
    var window = { crypto: webcrypto };
    var context = {
        window: window, crypto: webcrypto, TextEncoder: TextEncoder, URL: URL,
        JSON: JSON, Object: Object, Number: Number, Uint8Array: Uint8Array
    };
    vm.createContext(context);
    vm.runInContext(coreSource, context, { filename: 'sync-core.js' });
    vm.runInContext(mergeSource, context, { filename: 'sync-merge.js' });
    window.ChordCruiseSync.database = { open: async function () { return store; } };
    vm.runInContext(clientSource, context, { filename: 'sync-client.js' });
    return window.ChordCruiseSync;
}

var seed = {
    'chordCruise.schemaVersion': JSON.stringify('1'),
    'chordCruise.settings': JSON.stringify({ selectedKey: 0 }),
    'chordCruise.folders': JSON.stringify([{ id: 'folder-a', name: 'A' }]),
    'chordCruise.chord.c1': JSON.stringify({ id: 'c1', folderId: 'folder-a', chordName: 'C', notes: [] }),
    'chordCruise.libraryOrder': JSON.stringify({ version: 1, folderIds: ['folder-a'], entryIdsByFolder: { 'folder-a': ['c1'] } })
};

(async function () {
    var disabledOpenCount = 0;
    var disabledNetworkCount = 0;
    var disabledSync = loadClient(createMemoryStore());
    disabledSync.database.open = async function () { disabledOpenCount += 1; throw new Error('must not open'); };
    var disabled = disabledSync.client.createClient({
        enabled: false,
        localStorage: createStorage(seed),
        indexedDB: {},
        fetch: async function () { disabledNetworkCount += 1; }
    });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(await disabled.initialize())), { enabled: false });
    assert.strictEqual((await disabled.startIdentity({})).code, 'pilot_disabled');
    var disabledSaveResolved = await disabled.queueLocalMutation({ record: {} }, async function () { return 'saved-locally'; });
    assert.strictEqual(disabledSaveResolved.localSaved, 'saved-locally', 'OFF preserves the asynchronous local save result');
    assert.strictEqual(disabledOpenCount, 0, 'OFF never opens IndexedDB');
    assert.strictEqual(disabledNetworkCount, 0, 'OFF never calls Worker');

    var store = createMemoryStore();
    var sync = loadClient(store);
    var storage = createStorage(seed);
    var client = sync.client.createClient({
        enabled: true,
        localStorage: storage,
        crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787',
        now: function () { return 1000; }
    });
    assert.strictEqual((await client.initialize()).database, 'soundCruiseSync');
    assert.strictEqual(await store.getMeta('migrationState'), 'not_started');
    var beforeSnapshot = storage.snapshot();
    var snapshot = await client.captureSnapshot();
    assert.strictEqual(snapshot.counts.total, 4);
    assert.deepStrictEqual(storage.snapshot(), beforeSnapshot, 'client snapshot is read-only');

    var chord = snapshot.records.find(function (record) { return record.recordKey === 'chord/c1'; });
    var failed = await client.queueLocalMutation({ record: chord }, function () { return false; });
    assert.strictEqual(failed.localSaved, false);
    assert.strictEqual(await store.getOutbox(failed.operationId), undefined, 'known local failure removes the staged operation');
    var cleaned = await client.reconcile();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(cleaned)), { enabled: true, committed: 0, discarded: 0, generated: 0 });
    assert.strictEqual((await store.listOutbox()).length, 0, 'failed local write is never sent');

    var staged = await client.buildOperation(chord, 0, null, false);
    await store.putOutbox(staged);
    var repaired = await client.reconcile();
    assert.strictEqual(repaired.committed, 1, 'matching local state repairs transaction gap');
    assert.strictEqual((await store.getOutbox(staged.operationId)).localCommitted, true);

    await store.deleteOutbox(staged.operationId);
    var notWrittenRecord = JSON.parse(JSON.stringify(chord));
    notWrittenRecord.payload.chordName = 'Never saved';
    var interrupted = await client.buildOperation(notWrittenRecord, 0, null, false);
    await store.putOutbox(interrupted);
    var discarded = await client.reconcile();
    assert.strictEqual(discarded.discarded, 1, 'reload discards an uncommitted operation whose local hash never changed');
    assert.strictEqual(await store.getOutbox(interrupted.operationId), undefined);

    var gated = await client.reconcile({ captureLocalDiffs: true });
    assert.strictEqual(gated.skipped, 'migration_not_ready', 'existing data cannot become outbox work before explicit migration completion');
    assert.strictEqual((await store.listOutbox()).length, 0);

    await client.saveShadow([{
        recordType: 'chord', recordId: 'c1', revision: 4, payload: chord.payload,
        payloadHash: chord.payloadHash, deletedAt: null
    }]);
    var deletedHash = await sync.core.hashSyncPayload('chord', 'deleted-chord', null, 1, webcrypto);
    await client.saveShadow([{
        recordType: 'chord', recordId: 'deleted-chord', revision: 5, payload: null,
        payloadHash: deletedHash, deletedAt: 1000
    }]);
    assert.strictEqual((await store.getShadow('chord/deleted-chord')).payload, null, 'tombstone shadow accepts no payload');
    var changedPayload = JSON.parse(storage.getItem('chordCruise.chord.c1'));
    changedPayload.chordName = 'Cm';
    storage.setItem('chordCruise.chord.c1', JSON.stringify(changedPayload));
    await store.setMeta('datasetState', 'ready');
    await store.setMeta('migrationState', 'complete');
    var generated = await client.reconcile({ captureLocalDiffs: true });
    assert(generated.generated >= 1, 'local difference creates an idempotent outbox operation');
    var generatedCount = (await store.listOutbox()).length;
    await client.reconcile({ captureLocalDiffs: true });
    assert.strictEqual((await store.listOutbox()).length, generatedCount, 'reconciliation does not duplicate active operations');

    var offlineStore = createMemoryStore();
    var offlineSync = loadClient(offlineStore);
    var offlineStorage = createStorage(seed);
    var offlineClient = offlineSync.client.createClient({
        enabled: true, localStorage: offlineStorage, crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', fetch: async function () { throw new Error('offline'); }
    });
    assert.strictEqual((await offlineClient.startIdentity({ turnstileToken: 'token' })).code, 'network_error');
    assert.deepStrictEqual(offlineStorage.snapshot(), seed, 'network failure never changes app storage');

    var invalidStore = createMemoryStore();
    var invalidSync = loadClient(invalidStore);
    var invalidClient = invalidSync.client.createClient({
        enabled: true, localStorage: createStorage(seed), crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787',
        fetch: async function () { return { ok: true, json: async function () { return { ok: true, appId: 'chord', datasetState: 'initializing', deviceId: 'bad', deviceCredential: 'bad' }; } }; }
    });
    assert.strictEqual((await invalidClient.startIdentity({ turnstileToken: 'token' })).code, 'invalid_response');
    assert.strictEqual(await invalidStore.getMeta('deviceCredential'), undefined, 'invalid credential is not stored');

    var validStore = createMemoryStore();
    var validSync = loadClient(validStore);
    var validStorage = createStorage(seed);
    var requestBody;
    var deviceId = '123e4567-e89b-42d3-a456-426614174000';
    var credential = 'scd1.' + deviceId + '.' + 'A'.repeat(43);
    var validClient = validSync.client.createClient({
        enabled: true, localStorage: validStorage, crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', now: function () { return 2000; },
        fetch: async function (_url, options) {
            requestBody = JSON.parse(options.body);
            return { ok: true, json: async function () { return { ok: true, appId: 'chord', datasetState: 'initializing', deviceId: deviceId, deviceCredential: credential }; } };
        }
    });
    assert.strictEqual((await validClient.startIdentity({ turnstileToken: 'token', deviceLabel: 'QA iPhone' })).ok, true);
    assert.strictEqual(requestBody.initialSummary.recordCount, 4);
    assert.strictEqual(requestBody.initialSummary.manifestHash.length, 64);
    assert.strictEqual((await validStore.getMeta('deviceCredential')).credential, credential, 'credential is stored only in sync IndexedDB metadata');
    assert.deepStrictEqual(validStorage.snapshot(), seed, 'start does not write localStorage');

    var pairingStore = createMemoryStore();
    var pairingSync = loadClient(pairingStore);
    var pairingStorage = createStorage({ 'chordCruise.schemaVersion': JSON.stringify('1') });
    var pairCredential = 'scd1.123e4567-e89b-42d3-a456-426614174999.' + 'B'.repeat(43);
    var pairingClient = pairingSync.client.createClient({
        enabled: true, localStorage: pairingStorage, crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', now: function () { return 3000; },
        fetch: async function (url, options) {
            assert.strictEqual(url.endsWith('/v1/sync/pair'), true);
            var sent = JSON.parse(options.body);
            assert.strictEqual(sent.pairingCode, '12345678');
            return {
                ok: true, status: 201,
                json: async function () { return { ok: true, appId: 'chord', syncState: 'paired_pending', datasetState: 'remote_pending', deviceId: '123e4567-e89b-42d3-a456-426614174999', deviceCredential: pairCredential }; },
                headers: { get: function () { return 'bookmark-pair'; } }
            };
        }
    });
    await pairingClient.initialize();
    var paired = await pairingClient.pairWithCode({ pairingCode: '1234-5678', turnstileToken: 'token', deviceLabel: 'Device B' });
    assert.strictEqual(paired.ok, true, JSON.stringify(paired));
    assert.strictEqual(paired.localState, 'empty');
    assert.strictEqual((await pairingStore.getMeta('deviceCredential')).credential, pairCredential);
    assert.strictEqual(await pairingStore.getMeta('syncState'), 'paired_pending');
    assert.strictEqual(await pairingStore.getMeta('pairingLocalState'), 'empty');
    assert.deepStrictEqual(pairingStorage.snapshot(), { 'chordCruise.schemaVersion': JSON.stringify('1') }, 'pair never overwrites localStorage');

    var pairingFailStore = createMemoryStore({ failMetaBatch: true });
    var pairingFailSync = loadClient(pairingFailStore);
    var pairingFailClient = pairingFailSync.client.createClient({
        enabled: true, localStorage: createStorage(), crypto: webcrypto, endpoint: 'http://127.0.0.1:8787',
        fetch: async function () { return { ok: true, status: 201, json: async function () {
            return { ok: true, appId: 'chord', syncState: 'paired_pending', datasetState: 'remote_pending', deviceId: '123e4567-e89b-42d3-a456-426614174999', deviceCredential: pairCredential };
        }, headers: { get: function () { return null; } } }; }
    });
    var pairingFail = await pairingFailClient.pairWithCode({ pairingCode: '12345678', turnstileToken: 'token' });
    assert.strictEqual(pairingFail.code, 'client_storage_failed');
    assert.strictEqual(await pairingFailStore.getMeta('deviceCredential'), undefined, 'metadata batch failure leaves no partial credential state');

    var failingDbSync = loadClient(createMemoryStore());
    failingDbSync.database.open = async function () {
        var failingStore = createMemoryStore();
        failingStore.putOutbox = async function () { throw new Error('IndexedDB write failed'); };
        return failingStore;
    };
    var saveInvoked = false;
    var failingDbClient = failingDbSync.client.createClient({
        enabled: true, localStorage: createStorage(seed), crypto: webcrypto, endpoint: 'http://127.0.0.1:8787'
    });
    await assert.rejects(failingDbClient.queueLocalMutation({ record: chord }, function () {
        saveInvoked = true;
        return true;
    }), /IndexedDB write failed/);
    assert.strictEqual(saveInvoked, false, 'local write does not start after the outbox staging failure');

    var serverErrorStore = createMemoryStore();
    var serverErrorSync = loadClient(serverErrorStore);
    var serverErrorClient = serverErrorSync.client.createClient({
        enabled: true, localStorage: createStorage(seed), crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787',
        fetch: async function () { return { ok: false, json: async function () { return { ok: false, code: 'server_error' }; } }; }
    });
    assert.strictEqual((await serverErrorClient.startIdentity({ turnstileToken: 'token' })).code, 'server_error');
    assert.strictEqual(await serverErrorStore.getMeta('deviceCredential'), undefined, 'Worker 500 cannot create local credentials');

    var offContext = {
        window: {
            location: { hostname: 'soundcruise.jp' },
            sessionStorage: { getItem: function () { return 'enabled'; }, setItem: function () {}, removeItem: function () {} },
            document: { currentScript: null }
        },
        Promise: Promise, Object: Object
    };
    vm.createContext(offContext);
    vm.runInContext(bootstrapSource, offContext, { filename: 'sync-bootstrap.js' });
    assert.strictEqual(offContext.window.ChordCruiseSyncPilot.enabled, false, 'production host cannot enable the P1 session flag');
    assert.strictEqual(offContext.window.ChordCruiseSyncPilot.defaultEnabled, false);

    console.log('sync-pilot-client: OFF isolation, outbox gap repair, shadow reconciliation, failures, and credential storage passed');
}()).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
