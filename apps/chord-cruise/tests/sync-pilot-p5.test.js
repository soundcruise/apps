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
var uiSource = fs.readFileSync(path.join(root, 'js/sync/sync-pairing-ui.js'), 'utf8');
var DEVICE_ID = '123e4567-e89b-42d3-a456-426614174020';
var CREDENTIAL = 'scd1.' + DEVICE_ID + '.' + 'A'.repeat(43);
var CLAIM_ID = '123e4567-e89b-42d3-a456-426614174030';
var CLAIM = 'scr1.' + CLAIM_ID + '.' + 'B'.repeat(43);

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function createStorage(seed) {
    var values = Object.assign({}, seed || {});
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem: function (key, value) { values[key] = String(value); },
        removeItem: function (key) { delete values[key]; },
        key: function (index) { return Object.keys(values)[index] || null; },
        get length() { return Object.keys(values).length; }
    };
}

function createStore(options) {
    var config = options || {};
    var meta = new Map();
    return {
        name: 'soundCruiseSync', version: 2,
        getMeta: async function (key) { return clone(meta.get(key)); },
        setMeta: async function (key, value) {
            if (config.failPending && key === 'pendingRecovery') throw new Error('IndexedDB write failed');
            meta.set(key, clone(value));
        },
        setMetaBatch: async function (entries) { entries.forEach(function (entry) { meta.set(entry.key, clone(entry.value)); }); },
        listOutbox: async function () { return []; },
        listShadow: async function () { return []; },
        listMergeSessions: async function () { return []; },
        inspect: function () { return meta; }
    };
}

function loadClient(store) {
    var window = { crypto: webcrypto };
    var context = {
        window: window, crypto: webcrypto, TextEncoder: TextEncoder, URL: URL,
        JSON: JSON, Object: Object, Number: Number, Uint8Array: Uint8Array,
        encodeURIComponent: encodeURIComponent
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

function preparedBody() {
    return {
        ok: true, operation: 'prepared', appId: 'chord', claimToken: CLAIM,
        expiresAt: 700000, deviceId: DEVICE_ID, deviceCredential: CREDENTIAL,
        recoveryCode: '2345-6789-ABCD-EFGH-JKMN'
    };
}

(async function () {
    var store = createStore();
    var sync = loadClient(store);
    assert.strictEqual(sync.client.RECOVERY_ALPHABET, '0123456789ABCDEFGHJKMNPQRSTVWXYZ');
    assert.strictEqual(sync.client.normalizeRecoveryCode('2345 6789-abcd-efgh-jkmn'), '23456789ABCDEFGHJKMN');
    assert.strictEqual(sync.client.normalizeRecoveryCode('O'.repeat(20)), null);
    assert.strictEqual(sync.client.formatRecoveryCode('23456789ABCDEFGHJKMN'), '2345-6789-ABCD-EFGH-JKMN');

    var calls = [];
    var client = sync.client.createClient({
        enabled: true, localStorage: createStorage(), crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', now: function () { return 1000; },
        fetch: async function (url, options) {
            calls.push({ url: url, options: options });
            return response(200, preparedBody());
        }
    });
    var prepared = await client.prepareRecovery({
        recoveryCode: '0123-4567-89AB-CDEF-GHJK', turnstileToken: 'turnstile'
    });
    assert.strictEqual(prepared.ok, true);
    assert.strictEqual(prepared.localState, 'empty');
    var wire = JSON.parse(calls[0].options.body);
    assert.strictEqual(wire.operation, 'prepare');
    assert.strictEqual(wire.recoveryCode, '0123456789ABCDEFGHJK');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(wire, 'userId'), false);

    var failStore = createStore({ failPending: true });
    var failSync = loadClient(failStore);
    var commitCalls = 0;
    var failClient = failSync.client.createClient({
        enabled: true, localStorage: createStorage(), crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787',
        fetch: async function () { commitCalls += 1; throw new Error('must not commit'); }
    });
    var failed = await failClient.commitRecovery(prepared);
    assert.strictEqual(failed.code, 'client_storage_failed');
    assert.strictEqual(failed.serverUnchanged, true);
    assert.strictEqual(commitCalls, 0, 'IndexedDB failure occurs before destructive commit');

    var lossStore = createStore();
    var lossSync = loadClient(lossStore);
    var committed = false;
    var lossCalls = [];
    var lossClient = lossSync.client.createClient({
        enabled: true, localStorage: createStorage(), crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', now: function () { return 2000; },
        fetch: async function (url, options) {
            lossCalls.push((options && options.method) || 'GET');
            if ((!options || options.method === 'GET') && !committed) return response(401, { ok: false, code: 'invalid_credential' });
            if (options && options.method === 'POST') { committed = true; throw new Error('response lost after commit'); }
            return response(200, { ok: true, appId: 'chord', records: [] });
        }
    });
    var recovered = await lossClient.commitRecovery(prepared);
    assert.strictEqual(recovered.ok, true, 'candidate credential proves a commit whose response was lost');
    assert.deepStrictEqual(lossCalls, ['GET', 'POST', 'GET']);
    assert.strictEqual((await lossStore.getMeta('deviceCredential')).credential, CREDENTIAL);
    assert.strictEqual(await lossStore.getMeta('pendingRecovery'), null);
    assert.strictEqual(await lossStore.getMeta('pairingLocalState'), 'empty');

    var uncertainStore = createStore();
    var uncertainSync = loadClient(uncertainStore);
    var uncertainClient = uncertainSync.client.createClient({
        enabled: true, localStorage: createStorage(), crypto: webcrypto,
        endpoint: 'http://127.0.0.1:8787', fetch: async function () { throw new Error('offline'); }
    });
    var uncertain = await uncertainClient.commitRecovery(prepared);
    assert.strictEqual(uncertain.code, 'recovery_uncertain');
    assert.strictEqual(uncertain.resumable, true);
    assert.strictEqual((await uncertainStore.getMeta('pendingRecovery')).deviceCredential, CREDENTIAL,
        'candidate survives reload without storing the new Recovery Code plaintext');
    assert.strictEqual(JSON.stringify(Array.from(uncertainStore.inspect().values())).includes('2345-6789'), false);

    assert(uiSource.includes("provider(action)"), 'Turnstile action is selected per start/pair/recover flow');
    assert(uiSource.includes("tokenFor('sound_cruise_sync_recover')"));
    assert(uiSource.includes('復旧コードを使う'));
    assert(uiSource.includes('新しい復旧コードを発行'));
    assert(uiSource.includes('現在の復旧コードは使えなくなります。'));
    assert(uiSource.includes("input.autocomplete = 'off'"));
    assert(uiSource.includes('保存しました'));
    console.log('sync-pilot-p5: Recovery normalization, storage-first commit, response-loss proof, UI, and no plaintext persistence passed');
}()).catch(function (error) {
    console.error(error);
    process.exit(1);
});
