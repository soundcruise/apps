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
var pairingUiSource = fs.readFileSync(path.join(root, 'js/sync/sync-pairing-ui.js'), 'utf8');
var DEVICE_ID = '123e4567-e89b-42d3-a456-426614174000';
var CREDENTIAL = 'scd1.' + DEVICE_ID + '.' + 'A'.repeat(43);
var ENROLLMENT = 'SCE1-0123-4567-89AB-CDEF-GHJK';

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function memoryStore() {
    var meta = new Map();
    var outbox = new Map();
    return {
        name: 'soundCruiseSync', version: 2,
        getMeta: async function (key) { return clone(meta.get(key)); },
        setMeta: async function (key, value) { meta.set(key, clone(value)); },
        setMetaBatch: async function (entries) { entries.forEach(function (entry) { meta.set(entry.key, clone(entry.value)); }); },
        putOutbox: async function (value) { outbox.set(value.operationId, clone(value)); },
        getOutbox: async function (key) { return clone(outbox.get(key)); },
        listOutbox: async function () { return clone(Array.from(outbox.values())); },
        deleteOutbox: async function (key) { outbox.delete(key); },
        putShadow: async function () {}, getShadow: async function () { return null; }, listShadow: async function () { return []; },
        putConflict: async function () {}, listConflicts: async function () { return []; }, deleteConflict: async function () {}
    };
}

function storage() {
    var values = { 'chordCruise.schemaVersion': JSON.stringify('1') };
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem: function (key, value) { values[key] = String(value); },
        removeItem: function (key) { delete values[key]; },
        key: function (index) { return Object.keys(values)[index] || null; },
        get length() { return Object.keys(values).length; },
        snapshot: function () { return clone(values); }
    };
}

function load(store) {
    var window = { crypto: webcrypto, addEventListener: function () {}, setTimeout: setTimeout, document: { addEventListener: function () {}, visibilityState: 'visible' } };
    var context = { window: window, crypto: webcrypto, TextEncoder: TextEncoder, URL: URL, JSON: JSON, Object: Object, Number: Number, Uint8Array: Uint8Array, Date: Date, Promise: Promise, setTimeout: setTimeout, encodeURIComponent: encodeURIComponent };
    vm.createContext(context);
    vm.runInContext(coreSource, context);
    vm.runInContext(mergeSource, context);
    window.ChordCruiseSync.database = { open: async function () { return store; } };
    vm.runInContext(clientSource, context);
    return window.ChordCruiseSync;
}

function response(status, body) {
    return { ok: status >= 200 && status < 300, status: status, json: async function () { return body; }, headers: { get: function () { return null; } } };
}

(async function () {
    var store = memoryStore();
    var local = storage();
    await store.setMeta('deviceCredential', { deviceId: DEVICE_ID, credential: CREDENTIAL, credentialVersion: 1 });
    await store.setMeta('migrationState', 'complete');
    await store.putOutbox({
        operationId: '123e4567-e89b-42d3-a456-426614174010', recordType: 'chord', recordId: 'c1',
        schemaVersion: 1, baseRevision: 0, payload: { id: 'c1', chordName: 'C' }, payloadHash: '0'.repeat(64),
        deleted: false, localCommitted: true, retryCount: 0
    });
    var sync = load(store);
    var client = sync.client.createClient({
        enabled: true, localStorage: local, crypto: webcrypto, endpoint: 'http://127.0.0.1:8787', now: function () { return 1000; },
        fetch: async function (url) {
            return url.indexOf('/v1/sync/push') !== -1
                ? response(423, { ok: false, code: 'sync_write_paused' })
                : response(423, { ok: false, code: 'sync_read_paused' });
        }
    });
    var before = local.snapshot();
    var pushed = await client.flushOutbox({ force: true });
    assert.strictEqual(pushed.ok, false);
    assert.strictEqual(pushed.code, 'sync_write_paused');
    assert.strictEqual(pushed.retryable, false);
    var retained = await store.getOutbox('123e4567-e89b-42d3-a456-426614174010');
    assert.strictEqual(retained.retryCount, 0, 'gate pause is not a failure backoff loop');
    assert.strictEqual(retained.nextRetryAt, 301000);
    assert.strictEqual(retained.lastError, 'sync_write_paused');
    assert.strictEqual((await store.getMeta('deviceCredential')).credential, CREDENTIAL);
    assert.deepStrictEqual(local.snapshot(), before, 'write freeze leaves local Chord data unchanged');
    var pulled = await client.pullOnce();
    assert.strictEqual(pulled.code, 'sync_read_paused');
    assert.deepStrictEqual(local.snapshot(), before, 'read pause leaves local Chord data unchanged');

    await store.setMeta('runtimePause', { category: 'write', code: 'sync_write_paused', observedAt: 1000 });
    var readOnlyClient = sync.client.createClient({
        enabled: true, localStorage: local, crypto: webcrypto, endpoint: 'http://127.0.0.1:8787', now: function () { return 1000; },
        fetch: async function () { return response(200, { ok: true, changes: [], nextCursor: 'scc1.0', hasMore: false }); }
    });
    assert.strictEqual((await readOnlyClient.pullOnce()).ok, true);
    assert.strictEqual((await store.getMeta('runtimePause')).category, 'write', 'successful pull does not hide an active write freeze');

    retained.nextRetryAt = null;
    retained.lastError = null;
    await store.putOutbox(retained);
    var unavailableClient = sync.client.createClient({
        enabled: true, localStorage: local, crypto: webcrypto, endpoint: 'http://127.0.0.1:8787', now: function () { return 2000; },
        fetch: async function () { return response(503, { ok: false, code: 'rollout_control_unavailable' }); }
    });
    var unavailable = await unavailableClient.flushOutbox({ force: true });
    assert.strictEqual(unavailable.retryable, false);
    assert.strictEqual((await store.getMeta('runtimePause')).category, 'write');
    assert.strictEqual((await store.getOutbox(retained.operationId)).retryCount, 0);

    var startStore = memoryStore();
    var startSync = load(startStore);
    var sentBody;
    var startClient = startSync.client.createClient({
        enabled: true, localStorage: storage(), crypto: webcrypto, endpoint: 'http://127.0.0.1:8787', now: function () { return 2000; },
        fetch: async function (_url, options) {
            sentBody = JSON.parse(options.body);
            return response(201, {
                ok: true, appId: 'chord', syncState: 'provisioning', datasetState: 'initializing',
                deviceId: DEVICE_ID, deviceCredential: CREDENTIAL,
                recoveryCode: '0123-4567-89AB-CDEF-GHJK', recoveryVersion: 1
            });
        }
    });
    assert.strictEqual((await startClient.startIdentity({ turnstileToken: 'token', enrollmentCode: ENROLLMENT })).ok, true);
    assert.strictEqual(sentBody.enrollmentCode, 'SCE10123456789ABCDEFGHJK');
    assert.strictEqual(startSync.client.normalizeEnrollmentCode('0123-4567-89AB-CDEF-GHJK'), null);
    assert(bootstrapSource.includes('var DEFAULT_ENABLED = false'));
    assert(bootstrapSource.includes("endpoint: 'https://sound-cruise-sync.cruise-port-requests.workers.dev'"));
    assert(bootstrapSource.includes('var PRODUCTION_ROLLOUT = Object.freeze'));
    assert(pairingUiSource.includes('現在、新しいクラウド同期の受付を一時停止しています。'));
    assert(pairingUiSource.includes('クラウド同期は一時停止中です。端末内の保存は利用できます。'));
    assert(pairingUiSource.includes('__SOUND_CRUISE_SYNC_ENROLLMENT_REQUIRED__ === true'));

    console.log('sync-rollout-gates: Enrollment payload, local-first pause, outbox retention, and production lockout passed');
}()).catch(function (error) { console.error(error); process.exitCode = 1; });
