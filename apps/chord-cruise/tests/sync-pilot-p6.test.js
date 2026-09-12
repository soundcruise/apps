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
var DELETE_INTENT = 'sdi1.123e4567-e89b-42d3-a456-426614174030.' + 'B'.repeat(43);

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function storage() { return { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {}, key: function () { return null; }, length: 0 }; }
function createStore() {
    var meta = new Map();
    return {
        name: 'soundCruiseSync', version: 2,
        getMeta: async function (key) { return clone(meta.get(key)); },
        setMeta: async function (key, value) { meta.set(key, clone(value)); },
        setMetaBatch: async function (entries) { entries.forEach(function (entry) { meta.set(entry.key, clone(entry.value)); }); },
        listOutbox: async function () { return []; }, listShadow: async function () { return []; }, listMergeSessions: async function () { return []; },
        clearCloudState: async function () {
            meta.clear();
            meta.set('appId', 'chord'); meta.set('syncState', 'off'); meta.set('datasetState', 'local_only'); meta.set('migrationState', 'not_started');
        },
        inspect: function () { return meta; }
    };
}
function loadClient(store, ua) {
    var window = { crypto: webcrypto, navigator: { userAgent: ua || 'Mozilla/5.0 (iPhone) Version/17.0 Mobile Safari/604.1' } };
    var context = { window: window, crypto: webcrypto, TextEncoder: TextEncoder, URL: URL, JSON: JSON, Object: Object, Number: Number, Uint8Array: Uint8Array, encodeURIComponent: encodeURIComponent, setTimeout: setTimeout };
    vm.createContext(context);
    vm.runInContext(coreSource, context, { filename: 'sync-core.js' });
    vm.runInContext(mergeSource, context, { filename: 'sync-merge.js' });
    window.ChordCruiseSync.database = { open: async function () { return store; } };
    vm.runInContext(clientSource, context, { filename: 'sync-client.js' });
    return window.ChordCruiseSync;
}
function response(status, body) { return { ok: status >= 200 && status < 300, status: status, json: async function () { return clone(body); }, headers: { get: function () { return null; } } }; }

(async function () {
    var store = createStore();
    await store.setMeta('deviceCredential', { deviceId: DEVICE_ID, credential: CREDENTIAL });
    var sync = loadClient(store);
    var calls = [];
    var client = sync.client.createClient({
        enabled: true, localStorage: storage(), crypto: webcrypto, endpoint: 'http://127.0.0.1:8787',
        fetch: async function (url, options) {
            calls.push({ url: url, options: options });
            if (url.indexOf('/v1/sync/devices?') !== -1) return response(200, { ok: true, devices: [{ deviceId: DEVICE_ID, appId: 'chord', createdAt: 1, lastSeenAt: 2, isCurrent: true }, { deviceId: '123e4567-e89b-42d3-a456-426614174021', appId: 'chord', createdAt: 1, lastSeenAt: 2, isCurrent: false }] });
            if (url.indexOf('/devices/revoke') !== -1) return response(200, { ok: true, isCurrent: false });
            if (url.indexOf('/delete-intent') !== -1) return response(201, { ok: true, intentToken: DELETE_INTENT, expiresAt: 99999 });
            if (url.indexOf('/v1/sync/account') !== -1) return response(200, { ok: true, deleted: true });
            return response(404, { ok: false, code: 'not_found' });
        }
    });
    var devices = await client.listDevices();
    assert.strictEqual(devices.ok, true);
    assert.strictEqual(devices.devices.filter(function (device) { return device.isCurrent; }).length, 1);
    var revoked = await client.revokeDevice(devices.devices[1].deviceId);
    assert.strictEqual(revoked.ok, true);
    assert.strictEqual(revoked.current, false);
    var prepared = await client.prepareAccountDelete();
    assert.strictEqual(prepared.ok, true);
    var deleted = await client.commitAccountDelete(prepared);
    assert.strictEqual(deleted.ok, true);
    assert.strictEqual(await store.getMeta('syncState'), 'off');
    assert.strictEqual(await store.getMeta('deviceCredential'), undefined, 'cloud credential is removed, local Chord storage is untouched');
    var deleteWire = JSON.parse(calls.filter(function (call) { return call.url.indexOf('/v1/sync/account') !== -1 && call.url.indexOf('delete-intent') === -1; })[0].options.body);
    assert.deepStrictEqual(Object.keys(deleteWire).sort(), ['appId', 'intentToken']);

    var labelStore = createStore();
    var labelSync = loadClient(labelStore);
    var labelClient = labelSync.client.createClient({
        enabled: true, localStorage: storage(), crypto: webcrypto, endpoint: 'http://127.0.0.1:8787',
        fetch: async function (_url, options) {
            var wire = JSON.parse(options.body);
            assert.strictEqual(wire.deviceLabel, 'iPhone Safari');
            return response(400, { ok: false, code: 'turnstile_failed' });
        }
    });
    await labelClient.startIdentity({ turnstileToken: 'token' });

    var responseLossStore = createStore();
    await responseLossStore.setMeta('deviceCredential', { deviceId: DEVICE_ID, credential: CREDENTIAL });
    var deleteAttempts = 0;
    var responseLossSync = loadClient(responseLossStore);
    var responseLossClient = responseLossSync.client.createClient({
        enabled: true, localStorage: storage(), crypto: webcrypto, endpoint: 'http://127.0.0.1:8787',
        fetch: async function (url) {
            if (url.indexOf('/delete-intent') !== -1) return response(201, { ok: true, intentToken: DELETE_INTENT, expiresAt: 99999 });
            if (url.indexOf('/v1/sync/account') !== -1) {
                deleteAttempts += 1;
                if (deleteAttempts === 1) throw new Error('response_lost_after_server_commit');
                return response(200, { ok: true, deleted: true, alreadyDeleted: true });
            }
            return response(404, { ok: false, code: 'not_found' });
        }
    });
    var responseLossPrepared = await responseLossClient.prepareAccountDelete();
    var uncertain = await responseLossClient.commitAccountDelete(responseLossPrepared);
    assert.strictEqual(uncertain.ok, false);
    assert.strictEqual(uncertain.code, 'network_error');
    assert(await responseLossStore.getMeta('pendingAccountDelete'), 'response-loss retry token stays only in local Sync IDB');
    var resumed = await responseLossClient.resumeAccountDelete();
    assert.strictEqual(resumed.ok, true);
    assert.strictEqual(await responseLossStore.getMeta('deviceCredential'), undefined);

    var cleanupFailureStore = createStore();
    await cleanupFailureStore.setMeta('deviceCredential', { deviceId: DEVICE_ID, credential: CREDENTIAL });
    cleanupFailureStore.clearCloudState = async function () { throw new Error('idb_write_failed'); };
    var cleanupFailureSync = loadClient(cleanupFailureStore);
    var cleanupFailureClient = cleanupFailureSync.client.createClient({
        enabled: true, localStorage: storage(), crypto: webcrypto, endpoint: 'http://127.0.0.1:8787',
        fetch: async function (url) {
            if (url.indexOf('/devices/revoke') !== -1) return response(200, { ok: true, isCurrent: true, revoked: true });
            return response(404, { ok: false, code: 'not_found' });
        }
    });
    var cleanupFailed = await cleanupFailureClient.disconnectCurrentDevice();
    assert.strictEqual(cleanupFailed.ok, false);
    assert.strictEqual(cleanupFailed.revoked, true, 'server revocation remains known when local Sync IDB cleanup fails');
    assert(uiSource.includes('この端末の同期を解除'));
    assert(uiSource.includes('クラウドデータを削除'));
    assert(uiSource.includes('クラウド削除を再確認'));
    assert(uiSource.includes('この端末の同期情報を削除'));
    assert(uiSource.includes('コードはこの端末に残ります'));
    assert(uiSource.includes('同期中の端末を管理'));
    console.log('sync-pilot-p6: device list/revoke, delete intent/local cleanup, automatic label, and separated UI passed');
}()).catch(function (error) { console.error(error); process.exit(1); });
