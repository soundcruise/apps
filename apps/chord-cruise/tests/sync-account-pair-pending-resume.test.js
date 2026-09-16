'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var source = fs.readFileSync(path.join(root, 'js/sync/sync-account-orchestration.js'), 'utf8');
var clientSource = fs.readFileSync(path.join(root, 'js/sync/sync-client.js'), 'utf8');
var DEVICE_ID = '123e4567-e89b-42d3-a456-426614174777';
var CREDENTIAL = 'scd1.' + DEVICE_ID + '.' + 'C'.repeat(43);

async function settle() {
    await new Promise(function (resolve) { setImmediate(resolve); });
    await new Promise(function (resolve) { setImmediate(resolve); });
}

assert.match(source, /function canRetryAsNewChordEnvironment\(reason\)[\s\S]*?reason\?\.code === 'retired_legacy_device'/,
    'only a server-confirmed retired Legacy credential can use the Account-managed fallback');
assert.doesNotMatch(source, /function canRetryAsNewChordEnvironment\(reason\)[\s\S]{0,240}(?:invalid_app_credential|membership_state_invalid)/,
    'unknown, invalid, active Account-managed and cross-account credentials safe-stop');
assert.match(source, /if \(!canRetryAsNewChordEnvironment\(reason\)\) throw reason;[\s\S]*?return connectAsNewChordEnvironment\(joinCode\);/,
    'only the stale legacy-device failure uses the new-environment fallback');
assert.match(source, /app_join_expired: '接続コードの有効期限が切れました。Cruise Portで新しいコードを発行してください。'/,
    'safe Join status feedback remains available without revealing the code');
assert.match(source, /replaceRetiredLegacyCredential: replaceRetiredLegacy/,
    'identity replacement requires persisted server confirmation');
assert.match(source, /serverConfirmed: true[\s\S]*?retiredDeviceId: existing\.deviceId[\s\S]*?nextDeviceId: appMaterial\.appDeviceId/,
    'the retired bridge stores only non-secret, operation-bound proof for committed Join recovery');
assert.doesNotMatch(source, /同期の設定を再開|クラウド同期の設定を再開/,
    'normal Account-managed users never see a Chord-only resume state');
assert.match(clientSource, /existing && existing\.credential !== candidate\.deviceCredential &&\s*candidate\.replaceRetiredLegacyCredential !== true/,
    'a different credential remains protected unless the Account Join explicitly confirmed the legacy device is retired');

async function runStartup(options) {
    var config = options || {};
    var calls = { resume: 0, adopt: 0, begin: 0, ensureUi: 0, refresh: 0, createElement: 0, consume: 0 };
    var meta = {
        deviceCredential: config.hasCredential === false ? null : { deviceId: DEVICE_ID, credential: CREDENTIAL },
        accountManagedSetup: config.accountManagedSetup === false ? false : true,
        migrationState: config.migrationState || 'pair_pending'
    };
    var chordClient = {
        openStore: async function () {
            return { getMeta: async function (key) { return meta[key]; } };
        },
        adoptAccountManagedIdentity: async function () { calls.adopt += 1; return { ok: true }; },
        beginInitialMigration: async function () { calls.begin += 1; throw new Error('must not migrate'); },
        resumeAccountManagedHydrate: async function () {
            calls.resume += 1;
            return config.resumeResult || { ok: true, completed: true, automaticHydrate: true };
        },
        getServerSnapshot: async function () { return config.snapshotResult || { ok: true }; }
    };
    function AccountClient() {
        return {
            resumePendingConsume: async function () { return { status: 'none' }; },
            consumeJoinInvitation: async function () { calls.consume += 1; throw new Error('must not consume'); }
        };
    }
    var document = {
        readyState: 'complete',
        querySelector: function () { return null; },
        createElement: function () {
            calls.createElement += 1;
            return { disabled: false, type: '', textContent: '', addEventListener: function () {}, click: function () {} };
        },
        body: { append: function () { throw new Error('must not append Join UI'); } }
    };
    var window = {
        location: { hostname: 'soundcruise.jp', search: '?sound-cruise-qa=1' },
        document: document,
        ChordCruiseSyncPilot: {
            ready: Promise.resolve({ enabled: true, ready: true }),
            ensureManagementUi: async function () { calls.ensureUi += 1; return true; }
        },
        ChordCruiseSync: {
            pilotClient: chordClient,
            pairingUi: { refresh: async function () { calls.refresh += 1; } }
        },
        SoundCruiseSyncAccount: {
            AccountClient: AccountClient,
            ChordAccountBridgeClient: function () {},
            storage: { getPendingConsume: async function () { return null; } },
            core: { takeHandoffFromLocation: function () { return null; } }
        }
    };
    var context = {
        window: window, globalThis: window, document: document,
        URL: URL, URLSearchParams: URLSearchParams, Promise: Promise, Object: Object, Error: Error
    };
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'sync-account-orchestration.js' });
    await settle();
    return calls;
}

(async function () {
    var emptyResume = await runStartup({
        resumeResult: { ok: true, completed: true, automaticHydrate: true }
    });
    assert.strictEqual(emptyResume.resume, 1, 'pair_pending reload resumes the existing B hydrate');
    assert.strictEqual(emptyResume.adopt, 0, 'reload never re-adopts or creates a device');
    assert.strictEqual(emptyResume.begin, 0, 'existing ready Cloud data never enters initial migration');
    assert.strictEqual(emptyResume.consume, 0, 'reload never consumes another Join');
    assert.strictEqual(emptyResume.ensureUi, 0, 'normal Account-managed hydrate does not install legacy management UI');
    assert.strictEqual(emptyResume.createElement, 0, 'pair_pending is not rendered as an unconnected Join entry');

    var meaningfulResume = await runStartup({
        resumeResult: { ok: true, completed: false, requiresConfirmation: true, localState: 'local_data_pending_merge' }
    });
    assert.strictEqual(meaningfulResume.resume, 1);
    assert.strictEqual(meaningfulResume.ensureUi, 0, 'confirmation starts from the common Account-managed card');
    assert.strictEqual(meaningfulResume.createElement, 1, 'confirmation creates only the common card action');

    var fetchFailure = await runStartup({ resumeResult: { ok: false, code: 'server_error' } });
    assert.strictEqual(fetchFailure.resume, 1);
    assert.strictEqual(fetchFailure.ensureUi, 0, 'failed hydrate remains in the common attention/retry state');
    assert.strictEqual(fetchFailure.createElement, 1, 'failed hydrate creates only the common retry action');

    var completed = await runStartup({ migrationState: 'complete' });
    assert.strictEqual(completed.resume, 0, 'completed reload never rehydrates');
    assert.strictEqual(completed.ensureUi, 0);
    assert.strictEqual(completed.refresh, 0);
    assert.strictEqual(completed.createElement, 0, 'completed Account-managed Chord suppresses Join entry');

    console.log('sync-account-pair-pending-resume: existing B hydrate resume and Join suppression passed');
}()).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
