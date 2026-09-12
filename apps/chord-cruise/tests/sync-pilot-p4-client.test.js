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
var DEVICE_ID = '123e4567-e89b-42d3-a456-426614174000';
var CREDENTIAL = 'scd1.' + DEVICE_ID + '.' + 'A'.repeat(43);

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function createStorage(seed, failKey, corruptOnceKey) {
    var values = Object.assign({}, seed || {});
    var corrupted = false;
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem: function (key, value) {
            if (key === failKey) throw new Error('write failed');
            if (key === corruptOnceKey && !corrupted) {
                var parsed = JSON.parse(value);
                parsed.chordName = 'CORRUPTED AFTER WRITE';
                values[key] = JSON.stringify(parsed);
                corrupted = true;
                return;
            }
            values[key] = String(value);
        },
        removeItem: function (key) { delete values[key]; },
        key: function (index) { return Object.keys(values)[index] || null; },
        get length() { return Object.keys(values).length; },
        snapshot: function () { return Object.assign({}, values); }
    };
}

function createStore(options) {
    var config = options || {};
    var meta = new Map(); var outbox = new Map(); var shadow = new Map(); var conflicts = new Map();
    var backups = new Map(); var sessions = new Map();
    return {
        name: 'soundCruiseSync', version: 2,
        getMeta: async function (key) { return clone(meta.get(key)); },
        setMeta: async function (key, value) { meta.set(key, clone(value)); },
        setMetaBatch: async function (entries) { entries.forEach(function (entry) { meta.set(entry.key, clone(entry.value)); }); },
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
        putBackup: async function (value) { if (config.failBackup) throw new Error('backup failed'); backups.set(value.backupId, clone(value)); },
        getBackup: async function (key) { return clone(backups.get(key)); },
        listBackups: async function () { return clone(Array.from(backups.values())); },
        putMergeSession: async function (value) { sessions.set(value.sessionId, clone(value)); },
        getMergeSession: async function (key) { return clone(sessions.get(key)); },
        listMergeSessions: async function () { return clone(Array.from(sessions.values())); },
        inspect: function () { return { meta: meta, outbox: outbox, shadow: shadow, backups: backups, sessions: sessions }; }
    };
}

function loadClient(store) {
    var window = {
        crypto: webcrypto,
        setTimeout: function () { return 1; },
        addEventListener: function () {},
        document: { addEventListener: function () {}, visibilityState: 'visible' }
    };
    var context = {
        window: window, crypto: webcrypto, TextEncoder: TextEncoder, URL: URL,
        JSON: JSON, Object: Object, Number: Number, Uint8Array: Uint8Array,
        Date: Date, Promise: Promise, setTimeout: window.setTimeout, encodeURIComponent: encodeURIComponent
    };
    vm.createContext(context);
    vm.runInContext(coreSource, context, { filename: 'sync-core.js' });
    vm.runInContext(mergeSource, context, { filename: 'sync-merge.js' });
    window.ChordCruiseSync.database = { open: async function () { return store; } };
    vm.runInContext(clientSource, context, { filename: 'sync-client.js' });
    return window.ChordCruiseSync;
}

function response(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status: status,
        json: async function () { return clone(body); },
        headers: { get: function () { return null; } }
    };
}

function chordSeed(prefix) {
    var folderId = 'folder-' + prefix;
    var chordId = 'chord-' + prefix;
    var chord = {
        id: chordId, folderId: folderId, chordName: prefix.toUpperCase(), notes: [], intervals: [],
        shape: 'open', rootPc: 0, qualityKey: 'major', fretRange: { min: 0, max: 3 }
    };
    return {
        'chordCruise.schemaVersion': JSON.stringify(1),
        'chordCruise.folders': JSON.stringify([{ id: folderId, name: prefix }]),
        ['chordCruise.chord.' + chordId]: JSON.stringify(chord),
        'chordCruise.libraryOrder': JSON.stringify({ version: 1, folderIds: [folderId], entryIdsByFolder: { [folderId]: [chordId] } }),
        'unrelated.keep': 'untouched'
    };
}

async function makeServer(sync, seedStorage) {
    var local = await sync.core.snapshotLocalStorage(createStorage(seedStorage), webcrypto);
    var records = new Map(); var nextRevision = 10; var cursorSequence = 10; var seen = new Map();
    local.records.forEach(function (item, index) {
        records.set(item.recordKey, Object.assign(clone(item), { revision: index + 1, deletedAt: null, operationId: null, changeSeq: index + 1 }));
    });
    var server = {
        loseNextPushResponse: false,
        snapshotRequests: 0,
        mutateOnSnapshotRequest: 0,
        async snapshotBody() {
            var all = Array.from(records.values());
            var liveSnapshot = await sync.merge.buildSnapshot(all, webcrypto);
            return {
                ok: true, appId: 'chord', datasetState: 'ready', schemaVersion: 1,
                recordCount: liveSnapshot.counts.total, manifestHash: liveSnapshot.manifestHash,
                cursor: 'scc1.' + Buffer.from(String(cursorSequence)).toString('base64url'), records: clone(all)
            };
        },
        async addCloudChord() {
            var key = 'chord/cloud-new';
            var payload = { id: 'cloud-new', folderId: 'folder-cloud', chordName: 'NEW', notes: [] };
            records.set(key, {
                recordType: 'chord', recordId: 'cloud-new', schemaVersion: 1, payload: payload,
                payloadHash: await sync.core.hashSyncPayload('chord', 'cloud-new', payload, 1, webcrypto),
                revision: nextRevision++, deletedAt: null, operationId: 'external', changeSeq: ++cursorSequence
            });
        },
        async fetch(url, options) {
            if (url.indexOf('/v1/sync/snapshot') !== -1) {
                server.snapshotRequests += 1;
                if (server.snapshotRequests === server.mutateOnSnapshotRequest) await server.addCloudChord();
                return response(200, await server.snapshotBody());
            }
            if (url.indexOf('/v1/sync/push') !== -1) {
                var body = JSON.parse(options.body); var results = [];
                for (var index = 0; index < body.operations.length; index += 1) {
                    var operation = body.operations[index];
                    if (seen.has(operation.operationId)) {
                        results.push({ operationId: operation.operationId, status: 'duplicate', record: clone(seen.get(operation.operationId)) });
                        continue;
                    }
                    var key = operation.recordType + '/' + operation.recordId;
                    var current = records.get(key);
                    var currentRevision = current ? current.revision : 0;
                    if (currentRevision !== operation.baseRevision) {
                        results.push({ operationId: operation.operationId, status: 'conflict', code: 'stale_revision', record: clone(current) });
                        continue;
                    }
                    var applied = {
                        recordType: operation.recordType, recordId: operation.recordId, schemaVersion: 1,
                        revision: nextRevision++, payload: operation.deleted ? null : clone(operation.payload),
                        payloadHash: operation.payloadHash, deletedAt: operation.deleted ? Date.now() : null,
                        operationId: operation.operationId, changeSeq: ++cursorSequence
                    };
                    records.set(key, applied); seen.set(operation.operationId, applied);
                    results.push({ operationId: operation.operationId, status: 'applied', record: clone(applied) });
                }
                if (server.loseNextPushResponse) { server.loseNextPushResponse = false; throw new Error('response lost'); }
                return response(200, { ok: true, results: results });
            }
            throw new Error('unexpected request ' + url);
        }
    };
    return server;
}

async function pairedClient(localSeed, cloudSeed, options) {
    var config = options || {};
    var store = createStore(config.store); var sync = loadClient(store);
    var storage = createStorage(localSeed, config.failKey, config.corruptOnceKey);
    var server = await makeServer(sync, cloudSeed);
    await store.setMeta('deviceCredential', { deviceId: DEVICE_ID, credential: CREDENTIAL, credentialVersion: 1 });
    await store.setMeta('syncState', 'paired_pending');
    var client = sync.client.createClient({
        enabled: true, localStorage: storage, crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', fetch: server.fetch, now: function () { return 1000; }
    });
    await client.initialize();
    return { store: store, sync: sync, storage: storage, server: server, client: client };
}

(async function () {
    var flow = await pairedClient(chordSeed('local'), chordSeed('cloud'));
    var preview = await flow.client.preparePairingMerge();
    assert.strictEqual(preview.ok, true);
    assert.strictEqual(preview.plan.conflicts.length, 0);
    assert.strictEqual(preview.plan.localState, 'local_data_pending_merge');
    var applied = await flow.client.applyPairingMerge(preview.sessionId, {});
    assert.strictEqual(applied.ok, true, 'verified local-first merge completes');
    assert.strictEqual((await flow.store.getMergeSession(preview.sessionId)).stage, 'complete');
    assert.strictEqual((await flow.store.listBackups()).length, 1, 'pre-apply raw backup is retained');
    assert.strictEqual(flow.storage.getItem('unrelated.keep'), 'untouched', 'unrelated localStorage is never touched');
    assert(flow.storage.getItem('chordCruise.chord.chord-local'));
    assert(flow.storage.getItem('chordCruise.chord.chord-cloud'));
    assert.strictEqual(JSON.parse(flow.storage.getItem('chordCruise.chords.index')).length, 2, 'derived index is rebuilt after canonical writes');
    assert.strictEqual((await flow.server.snapshotBody()).recordCount, applied.recordCount);

    var stale = await pairedClient(chordSeed('stale-local'), chordSeed('cloud'));
    var stalePreview = await stale.client.preparePairingMerge();
    await stale.server.addCloudChord();
    var staleResult = await stale.client.applyPairingMerge(stalePreview.sessionId, {});
    assert.strictEqual(staleResult.code, 'cloud_snapshot_stale', 'cloud cursor/hash is checked immediately before local apply');
    assert.strictEqual((await stale.store.listBackups()).length, 0, 'stale preview never mutates or backs up local data');

    var staleAfterLocalApply = await pairedClient(chordSeed('stale-race-local'), chordSeed('cloud'));
    var staleRacePreview = await staleAfterLocalApply.client.preparePairingMerge();
    var beforeStaleRace = staleAfterLocalApply.storage.snapshot();
    staleAfterLocalApply.server.mutateOnSnapshotRequest = 3;
    var staleRaceResult = await staleAfterLocalApply.client.applyPairingMerge(staleRacePreview.sessionId, {});
    assert.strictEqual(staleRaceResult.code, 'cloud_snapshot_stale', 'cloud is rechecked after local verify and before queueing remote writes');
    assert.strictEqual(staleRaceResult.rollbackRequired, false, 'post-apply stale detection restores the local backup');
    assert.deepStrictEqual(staleAfterLocalApply.storage.snapshot(), beforeStaleRace, 'stale race never leaves the preview result applied locally');
    assert.strictEqual((await staleAfterLocalApply.server.snapshotBody()).records.some(function (record) {
        return record.recordId === 'chord-stale-race-local';
    }), false, 'stale race never pushes the preview merge');

    var offline = await pairedClient(chordSeed('offline-local'), chordSeed('cloud'));
    var offlinePreview = await offline.client.preparePairingMerge();
    offline.client = offline.sync.client.createClient({
        enabled: true, localStorage: offline.storage, crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', fetch: async function () { throw new Error('offline'); }, now: function () { return 1000; }
    });
    var offlineResult = await offline.client.applyPairingMerge(offlinePreview.sessionId, {});
    assert.strictEqual(offlineResult.code, 'network_error', 'offline preflight leaves local data unchanged');
    assert.strictEqual((await offline.store.listBackups()).length, 0);

    var backupFailure = await pairedClient(chordSeed('backup-local'), chordSeed('cloud'), { store: { failBackup: true } });
    var backupPreview = await backupFailure.client.preparePairingMerge();
    var beforeBackupFailure = backupFailure.storage.snapshot();
    assert.strictEqual((await backupFailure.client.applyPairingMerge(backupPreview.sessionId, {})).code, 'backup_failed');
    assert.deepStrictEqual(backupFailure.storage.snapshot(), beforeBackupFailure, 'IndexedDB backup failure occurs before local writes');

    var indexFailure = await pairedClient(chordSeed('index-local'), chordSeed('cloud'), { failKey: 'chordCruise.chords.index' });
    var indexPreview = await indexFailure.client.preparePairingMerge();
    var beforeIndexFailure = indexFailure.storage.snapshot();
    var indexResult = await indexFailure.client.applyPairingMerge(indexPreview.sessionId, {});
    assert.strictEqual(indexResult.code, 'local_apply_failed');
    assert.deepStrictEqual(indexFailure.storage.snapshot(), beforeIndexFailure, 'index rebuild failure rolls back every managed key');
    assert.strictEqual((await indexFailure.store.getMergeSession(indexPreview.sessionId)).stage, 'rolled_back');

    var postVerify = await pairedClient(chordSeed('verify-local'), chordSeed('cloud'), {
        corruptOnceKey: 'chordCruise.chord.chord-cloud'
    });
    var verifyPreview = await postVerify.client.preparePairingMerge();
    var beforeVerify = postVerify.storage.snapshot();
    var verifyResult = await postVerify.client.applyPairingMerge(verifyPreview.sessionId, {});
    assert.strictEqual(verifyResult.code, 'local_post_verify_failed');
    assert.deepStrictEqual(postVerify.storage.snapshot(), beforeVerify, 'post-verify mismatch restores the pre-merge snapshot');

    var rollbackSeed = chordSeed('rollback-local');
    rollbackSeed['chordCruise.chords.index'] = JSON.stringify([{ id: 'chord-rollback-local' }]);
    var rollbackFailure = await pairedClient(rollbackSeed, chordSeed('cloud'), { failKey: 'chordCruise.chords.index' });
    var rollbackPreview = await rollbackFailure.client.preparePairingMerge();
    var rollbackResult = await rollbackFailure.client.applyPairingMerge(rollbackPreview.sessionId, {});
    assert.strictEqual(rollbackResult.rollbackRequired, true, 'failed automatic restore remains explicitly recoverable');
    assert.strictEqual((await rollbackFailure.store.getMergeSession(rollbackPreview.sessionId)).stage, 'rollback_required');
    assert.strictEqual((await rollbackFailure.store.listBackups()).length, 1, 'rollback failure never deletes the recovery backup');

    var responseLoss = await pairedClient(chordSeed('retry-local'), chordSeed('cloud'));
    var retryPreview = await responseLoss.client.preparePairingMerge();
    responseLoss.server.loseNextPushResponse = true;
    var firstAttempt = await responseLoss.client.applyPairingMerge(retryPreview.sessionId, {});
    assert.strictEqual(firstAttempt.resumable, true);
    assert((await responseLoss.store.listOutbox()).length > 0, 'response loss retains deterministic outbox work');
    var resumed = await responseLoss.client.resumePairingMerge(retryPreview.sessionId);
    assert.strictEqual(resumed.ok, true, 'same operation IDs make response-loss retry idempotent');
    assert.strictEqual((await responseLoss.store.listOutbox()).length, 0);

    var recoveryStore = createStore(); var recoverySync = loadClient(recoveryStore);
    var recoveryStorage = createStorage(chordSeed('before-crash'));
    var original = recoveryStorage.snapshot();
    await recoveryStore.putBackup({ backupId: 'backup-crash', sessionId: 'session-crash', values: original });
    await recoveryStore.putMergeSession({ sessionId: 'session-crash', backupId: 'backup-crash', stage: 'applying_local' });
    recoveryStorage.setItem('chordCruise.folders', JSON.stringify([]));
    var recoveryClient = recoverySync.client.createClient({
        enabled: true, localStorage: recoveryStorage, crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', fetch: async function () { throw new Error('unused'); }
    });
    await recoveryClient.initialize();
    assert.deepStrictEqual(recoveryStorage.snapshot(), original, 'reload during local apply restores the exact scoped backup');
    assert.strictEqual((await recoveryStore.getMergeSession('session-crash')).stage, 'rolled_back');

    console.log('sync-pilot-p4-client: preview, stale guard, backup, local verify, response-loss resume, and crash rollback passed');
}()).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
