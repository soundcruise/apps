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

function createStorage(seed, failures) {
    var values = Object.assign({}, seed || {});
    var writes = [];
    var config = failures || {};
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem: function (key, value) {
            if (config.failSetItemOnce === key) {
                config.failSetItemOnce = null;
                throw new Error('local storage write failure');
            }
            writes.push({ type: 'set', key: key }); values[key] = String(value);
        },
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
    var backups = new Map();
    var mergeSessions = new Map();
    var config = failures || {};
    function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
    return {
        name: 'soundCruiseSync', version: 1,
        getMeta: async function (key) { return clone(meta.get(key)); },
        setMeta: async function (key, value) { meta.set(key, clone(value)); },
        setMetaBatch: async function (entries) {
            if (config.failMetaBatch) throw new Error('IndexedDB metadata batch failure');
            if (config.failCompleteMetaBatchOnce && entries.some(function (entry) {
                return entry.key === 'migrationState' && entry.value === 'complete';
            })) {
                config.failCompleteMetaBatchOnce = false;
                throw new Error('IndexedDB completion batch failure');
            }
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
        putBackup: async function (value) { backups.set(value.backupId, clone(value)); },
        getBackup: async function (key) { return clone(backups.get(key)); },
        listBackups: async function () { return clone(Array.from(backups.values())); },
        putMergeSession: async function (value) { mergeSessions.set(value.sessionId, clone(value)); },
        getMergeSession: async function (key) { return clone(mergeSessions.get(key)); },
        listMergeSessions: async function () { return clone(Array.from(mergeSessions.values())); },
        clearCloudState: async function () {
            meta.clear(); outbox.clear(); shadow.clear(); conflicts.clear(); mergeSessions.clear();
            meta.set('appId', 'chord');
            meta.set('syncState', 'off');
            meta.set('datasetState', 'local_only');
            meta.set('migrationState', 'not_started');
        },
        inspectMeta: function () { return meta; }
    };
}

function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status: status,
        json: async function () { return JSON.parse(JSON.stringify(body)); },
        headers: { get: function () { return null; } }
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
            return { ok: true, json: async function () { return {
                ok: true, appId: 'chord', datasetState: 'initializing', deviceId: deviceId,
                deviceCredential: credential, recoveryCode: '0123-4567-89AB-CDEF-GHJK', recoveryVersion: 1
            }; } };
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

    // Regression: Account Add Environment can return a new B credential for a
    // membership whose Chord dataset already exists.  B must enter the existing
    // safe hydrate/merge flow, never try to re-run an initial migration.
    var cloudSeed = Object.assign({}, seed, {
        'chordCruise.chord.c2': JSON.stringify({ id: 'c2', folderId: 'folder-a', chordName: 'Dm', notes: [] }),
        'chordCruise.libraryOrder': JSON.stringify({ version: 1, folderIds: ['folder-a'], entryIdsByFolder: { 'folder-a': ['c1', 'c2'] } })
    });
    var cloudSourceStore = createMemoryStore();
    var cloudSourceSync = loadClient(cloudSourceStore);
    var cloudSourceClient = cloudSourceSync.client.createClient({
        enabled: true, localStorage: createStorage(cloudSeed), crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787'
    });
    await cloudSourceClient.initialize();
    var cloudSource = await cloudSourceClient.captureSnapshot();
    assert.strictEqual(cloudSource.counts.total, 5, 'fixture has the existing five-record Chord dataset');
    var existingCloud = {
        ok: true,
        appId: 'chord',
        datasetState: 'ready',
        schemaVersion: 1,
        recordCount: cloudSource.counts.total,
        manifestHash: cloudSource.manifestHash,
        cursor: 'scc1.test-cursor',
        records: cloudSource.records.map(function (record, index) {
            return Object.assign({}, record, { revision: index + 1, deletedAt: null, operationId: null, changeSeq: index + 1 });
        })
    };
    var promotionStore = createMemoryStore();
    var promotionSync = loadClient(promotionStore);
    var promotionLocal = createStorage({ 'chordCruise.schemaVersion': JSON.stringify('1') });
    var promotionRequests = [];
    var hydrateUnavailable = true;
    var promotionClient = promotionSync.client.createClient({
        enabled: true, localStorage: promotionLocal, crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', now: function () { return 4000; },
        fetch: async function (url) {
            promotionRequests.push(url);
            if (url.indexOf('/v1/sync/bootstrap') !== -1) {
                return jsonResponse(200, { ok: true, appId: 'chord', datasetState: 'ready', alreadyCreated: true });
            }
            if (url.indexOf('/v1/sync/snapshot') !== -1) {
                if (hydrateUnavailable) return jsonResponse(503, { ok: false, code: 'server_error' });
                return jsonResponse(200, existingCloud);
            }
            throw new Error('unexpected promotion request');
        }
    });
    await promotionClient.initialize();
    var promotionDeviceId = '123e4567-e89b-42d3-a456-426614174777';
    var promotionCredential = 'scd1.' + promotionDeviceId + '.' + 'C'.repeat(43);
    var adopted = await promotionClient.adoptAccountManagedIdentity({
        deviceId: promotionDeviceId,
        deviceCredential: promotionCredential
    });
    assert.strictEqual(adopted.ok, true, 'the consumed B credential is promoted locally');
    assert.strictEqual(adopted.requiresMerge, true, 'existing ready data uses the hydrate boundary');
    assert.strictEqual((await promotionStore.getMeta('deviceCredential')).deviceId, promotionDeviceId, 'the same B device is retained');
    assert.strictEqual(await promotionStore.getMeta('accountManagedSetup'), true, 'B remains Account-managed');
    assert.strictEqual(await promotionStore.getMeta('syncState'), 'paired_pending');
    assert.strictEqual(await promotionStore.getMeta('migrationState'), 'pair_pending');
    assert.strictEqual(promotionRequests.some(function (url) { return url.indexOf('/v1/sync/migration/complete') !== -1; }), false,
        'B never attempts a second initial migration against the existing dataset');
    assert.deepStrictEqual(promotionLocal.snapshot(), { 'chordCruise.schemaVersion': JSON.stringify('1') },
        'credential promotion does not overwrite B local data');

    var failedHydrate = await promotionClient.resumeAccountManagedHydrate();
    assert.strictEqual(failedHydrate.ok, false, 'a transient hydrate failure remains recoverable');
    assert.strictEqual(await promotionStore.getMeta('syncState'), 'paired_pending', 'hydrate failure keeps the resumable state');
    assert.strictEqual((await promotionStore.getMeta('deviceCredential')).credential, promotionCredential,
        'hydrate failure keeps the existing B credential');
    hydrateUnavailable = false;
    var hydrated = await promotionClient.resumeAccountManagedHydrate();
    assert.strictEqual(hydrated.ok, true, 'the same B device can retry hydrate without another Join');
    assert.strictEqual(hydrated.automaticHydrate, true, 'empty Account-managed B hydrates without an unnecessary confirmation');
    var hydratedSnapshot = await promotionClient.captureSnapshot();
    assert.strictEqual(hydratedSnapshot.counts.total, 5, 'B receives all existing canonical records');
    assert.deepStrictEqual(Array.from(new Set(hydratedSnapshot.records.map(function (record) {
        return record.recordType;
    }))).sort(), ['chord', 'folder', 'library_order', 'settings'],
    'hydrate reconstructs Chord, Folder, order, and settings records');
    assert.strictEqual(await promotionStore.getMeta('syncState'), 'pilot_ready');
    assert.strictEqual(await promotionStore.getMeta('migrationState'), 'complete');
    assert.strictEqual((await promotionStore.listOutbox()).length, 0, 'Cloud-authoritative empty hydrate creates no outbox work');
    assert.strictEqual(promotionRequests.some(function (url) {
        return url.indexOf('/v1/sync/push') !== -1 || url.indexOf('/v2/accounts/app-join-invitations') !== -1;
    }), false, 'promotion and hydrate create neither a third device nor remote user-data writes');
    var requestsAfterHydrate = promotionRequests.length;
    var repeatedHydrate = await promotionClient.resumeAccountManagedHydrate();
    assert.strictEqual(repeatedHydrate.alreadyComplete, true, 'repeated resume converges without rehydrating');
    assert.strictEqual(promotionRequests.length, requestsAfterHydrate, 'completed resume performs no network or device operation');

    var meaningfulStore = createMemoryStore();
    var meaningfulSync = loadClient(meaningfulStore);
    var meaningfulLocal = createStorage(seed);
    var meaningfulRequests = [];
    var meaningfulClient = meaningfulSync.client.createClient({
        enabled: true, localStorage: meaningfulLocal, crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', now: function () { return 5000; },
        fetch: async function (url) {
            meaningfulRequests.push(url);
            if (url.indexOf('/v1/sync/bootstrap') !== -1) {
                return jsonResponse(200, { ok: true, appId: 'chord', datasetState: 'ready', alreadyCreated: true });
            }
            if (url.indexOf('/v1/sync/snapshot') !== -1) return jsonResponse(200, existingCloud);
            throw new Error('meaningful local data must not push before confirmation');
        }
    });
    await meaningfulClient.initialize();
    var meaningfulBefore = meaningfulLocal.snapshot();
    assert.strictEqual((await meaningfulClient.adoptAccountManagedIdentity({
        deviceId: promotionDeviceId, deviceCredential: promotionCredential
    })).ok, true);
    var meaningfulPending = await meaningfulClient.resumeAccountManagedHydrate();
    assert.strictEqual(meaningfulPending.ok, true);
    assert.strictEqual(meaningfulPending.requiresConfirmation, true, 'meaningful local data retains semantic merge confirmation');
    assert.strictEqual(await meaningfulStore.getMeta('migrationState'), 'pair_pending');
    assert.deepStrictEqual(meaningfulLocal.snapshot(), meaningfulBefore, 'meaningful local data is never silently overwritten');
    assert.strictEqual(meaningfulRequests.some(function (url) { return url.indexOf('/v1/sync/push') !== -1; }), false);

    var retiredStore = createMemoryStore();
    var retiredSync = loadClient(retiredStore);
    var retiredLocal = createStorage(seed);
    var retiredDeviceId = '123e4567-e89b-42d3-a456-426614174700';
    var retiredCredential = 'scd1.' + retiredDeviceId + '.' + 'R'.repeat(43);
    await retiredStore.setMeta('deviceCredential', {
        deviceId: retiredDeviceId,
        credential: retiredCredential,
        credentialVersion: 1,
        createdAt: 1
    });
    var retiredClient = retiredSync.client.createClient({
        enabled: true, localStorage: retiredLocal, crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', now: function () { return 6000; },
        fetch: async function (url) {
            if (url.indexOf('/v1/sync/bootstrap') !== -1) {
                return jsonResponse(200, { ok: true, appId: 'chord', datasetState: 'ready', alreadyCreated: true });
            }
            throw new Error('retired identity adoption must not write user data');
        }
    });
    await retiredClient.initialize();
    var retiredBefore = retiredLocal.snapshot();
    var unconfirmedReplacement = await retiredClient.adoptAccountManagedIdentity({
        deviceId: promotionDeviceId,
        deviceCredential: promotionCredential
    });
    assert.strictEqual(unconfirmedReplacement.ok, false, 'unknown or active existing identities safe-stop');
    assert.strictEqual(unconfirmedReplacement.code, 'existing_credential_conflict');
    assert.strictEqual((await retiredStore.getMeta('deviceCredential')).credential, retiredCredential,
        'a rejected replacement keeps the exact old identity');
    assert.deepStrictEqual(retiredLocal.snapshot(), retiredBefore,
        'a rejected replacement leaves settings, folders, chords and library order byte-for-byte unchanged');
    var confirmedReplacement = await retiredClient.adoptAccountManagedIdentity({
        deviceId: promotionDeviceId,
        deviceCredential: promotionCredential,
        replaceRetiredLegacyCredential: true
    });
    assert.strictEqual(confirmedReplacement.ok, true, 'the isolated retired bridge can replace sync identity only');
    assert.deepStrictEqual(retiredLocal.snapshot(), retiredBefore,
        'the retired bridge preserves settings, folders, saved chords and library order byte-for-byte');
    var retiredSnapshot = await retiredClient.captureSnapshot();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(retiredSnapshot.counts)), {
        total: 4, settings: 1, folder: 1, chord: 1, library_order: 1
    }, 'stable record counts and semantic types are preserved across identity replacement');

    var terminalStore = createMemoryStore();
    var terminalSync = loadClient(terminalStore);
    var terminalLocal = createStorage(seed);
    var terminalDeviceId = '123e4567-e89b-42d3-a456-426614174701';
    var terminalCredential = 'scd1.' + terminalDeviceId + '.' + 'T'.repeat(43);
    await terminalStore.setMeta('deviceCredential', { deviceId: terminalDeviceId, credential: terminalCredential });
    await terminalStore.setMeta('accountManagedSetup', true);
    await terminalStore.setMeta('migrationState', 'complete');
    var terminalMode = true;
    var terminalClient = terminalSync.client.createClient({
        enabled: true, localStorage: terminalLocal, crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787',
        fetch: async function (url) {
            if (terminalMode) return jsonResponse(410, { ok: false, code: 'account_deleting' });
            if (url.indexOf('/v1/sync/bootstrap') !== -1) {
                return jsonResponse(200, { ok: true, appId: 'chord', datasetState: 'ready', alreadyCreated: true });
            }
            throw new Error('unexpected terminal rebind request');
        }
    });
    var terminalBefore = terminalLocal.snapshot();
    var terminalResult = await terminalClient.getServerSnapshot();
    assert.strictEqual(terminalResult.code, 'account_deleting', 'exact terminal response is preserved');
    assert.strictEqual(await terminalStore.getMeta('deviceCredential'), undefined, 'terminal Account-managed identity detaches');
    assert.deepStrictEqual(terminalLocal.snapshot(), terminalBefore,
        'terminal detach preserves settings, folders, saved chords and library order byte-for-byte');
    terminalMode = false;
    var rebound = await terminalClient.adoptAccountManagedIdentity({
        deviceId: promotionDeviceId, deviceCredential: promotionCredential
    });
    assert.strictEqual(rebound.ok, true, 'a new Account identity can be adopted after exact terminal detach');

    var genericStore = createMemoryStore();
    var genericSync = loadClient(genericStore);
    await genericStore.setMeta('deviceCredential', { deviceId: terminalDeviceId, credential: terminalCredential });
    await genericStore.setMeta('accountManagedSetup', true);
    await genericStore.setMeta('migrationState', 'complete');
    var genericClient = genericSync.client.createClient({
        enabled: true, localStorage: createStorage(seed), crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787',
        fetch: async function () { return jsonResponse(401, { ok: false, code: 'invalid_credential' }); }
    });
    assert.strictEqual((await genericClient.getServerSnapshot()).code, 'invalid_credential');
    assert.strictEqual((await genericStore.getMeta('deviceCredential')).credential, terminalCredential,
        'generic authorization failure does not detach an Account-managed identity');

    var applyFailureStore = createMemoryStore();
    var applyFailureSync = loadClient(applyFailureStore);
    var applyFailureLocal = createStorage({ 'chordCruise.schemaVersion': JSON.stringify('1') }, {
        failSetItemOnce: 'chordCruise.folders'
    });
    var applyFailureClient = applyFailureSync.client.createClient({
        enabled: true, localStorage: applyFailureLocal, crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', now: function () { return 6000; },
        fetch: async function (url) {
            if (url.indexOf('/v1/sync/bootstrap') !== -1) {
                return jsonResponse(200, { ok: true, appId: 'chord', datasetState: 'ready', alreadyCreated: true });
            }
            if (url.indexOf('/v1/sync/snapshot') !== -1) return jsonResponse(200, existingCloud);
            throw new Error('failed hydrate must not push');
        }
    });
    await applyFailureClient.initialize();
    await applyFailureClient.adoptAccountManagedIdentity({ deviceId: promotionDeviceId, deviceCredential: promotionCredential });
    var applyFailed = await applyFailureClient.resumeAccountManagedHydrate();
    assert.strictEqual(applyFailed.code, 'local_apply_failed');
    assert.strictEqual(await applyFailureStore.getMeta('migrationState'), 'pair_pending');
    assert.strictEqual((await applyFailureStore.getMeta('deviceCredential')).credential, promotionCredential);
    assert.strictEqual((await applyFailureClient.captureSnapshot()).counts.total, 0, 'failed local apply rolls back to empty B');
    assert.strictEqual((await applyFailureClient.resumeAccountManagedHydrate()).ok, true,
        'rolled-back hydrate retries with the same B credential');

    var completionFailures = { failCompleteMetaBatchOnce: true };
    var completionStore = createMemoryStore(completionFailures);
    var completionSync = loadClient(completionStore);
    var completionRequests = [];
    var completionClient = completionSync.client.createClient({
        enabled: true, localStorage: createStorage({ 'chordCruise.schemaVersion': JSON.stringify('1') }), crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', now: function () { return 7000; },
        fetch: async function (url) {
            completionRequests.push(url);
            if (url.indexOf('/v1/sync/bootstrap') !== -1) {
                return jsonResponse(200, { ok: true, appId: 'chord', datasetState: 'ready', alreadyCreated: true });
            }
            if (url.indexOf('/v1/sync/snapshot') !== -1) return jsonResponse(200, existingCloud);
            throw new Error('completion retry must not push');
        }
    });
    await completionClient.initialize();
    await completionClient.adoptAccountManagedIdentity({ deviceId: promotionDeviceId, deviceCredential: promotionCredential });
    await assert.rejects(completionClient.resumeAccountManagedHydrate(), /completion batch failure/);
    assert.strictEqual(await completionStore.getMeta('migrationState'), 'pair_pending', 'completion failure remains resumable');
    assert.strictEqual((await completionStore.getMeta('deviceCredential')).credential, promotionCredential);
    var completedRetry = await completionClient.resumeAccountManagedHydrate();
    assert.strictEqual(completedRetry.ok, true, 'verifying-stage retry completes without a duplicate hydrate');
    assert.strictEqual(completedRetry.resumed, true);
    assert.strictEqual((await completionStore.listOutbox()).length, 0);
    assert.strictEqual(completionRequests.some(function (url) { return url.indexOf('/v1/sync/push') !== -1; }), false);

    var promotionSaveFailStore = createMemoryStore({ failMetaBatch: true });
    var promotionSaveFailSync = loadClient(promotionSaveFailStore);
    var promotionSaveFailRequests = 0;
    var promotionSaveFailClient = promotionSaveFailSync.client.createClient({
        enabled: true, localStorage: createStorage(), crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787',
        fetch: async function () { promotionSaveFailRequests += 1; throw new Error('must not request'); }
    });
    var saveFailed = await promotionSaveFailClient.adoptAccountManagedIdentity({
        deviceId: promotionDeviceId,
        deviceCredential: promotionCredential
    });
    assert.strictEqual(saveFailed.code, 'client_storage_failed', 'a credential persistence failure is explicit and resumable from the Account candidate');
    assert.strictEqual(await promotionSaveFailStore.getMeta('deviceCredential'), undefined, 'failed promotion leaves no partial Chord credential');
    assert.strictEqual(promotionSaveFailRequests, 0, 'no data-plane request runs before durable B credential storage');

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
