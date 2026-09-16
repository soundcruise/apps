import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createSyncCenterController,
    membershipPresentation,
    normalizeSyncCenterSummary,
    readSyncCenterConfig
} from './sync-center-controller.js';

const endpoint = 'https://sync.example.test';
const activeSummary = {
    account: { id: 'secret-account-id', state: 'active', recoveryVersion: 3 },
    memberships: [
        { appId: 'chord', state: 'active', dataset: { state: 'ready', recordCount: 7, schemaVersion: 1, manifestHash: 'secret-hash' } },
        { appId: 'pitch', state: 'pending', dataset: null },
        { appId: 'fretboard', state: 'active', dataset: { state: 'initializing', recordCount: 0, schemaVersion: 1 } },
        { appId: 'rhythm', state: 'error', dataset: null }
    ]
};

test('production defaults OFF and accepts only explicit HTTPS configuration', () => {
    assert.deepEqual(readSyncCenterConfig({}), { enabled: false, endpoint: null });
    assert.deepEqual(readSyncCenterConfig({ __SOUND_CRUISE_SYNC_CENTER__: { enabled: true, environment: 'development', endpoint: 'http://localhost' } }), { enabled: false, endpoint: null });
    assert.deepEqual(readSyncCenterConfig({ __SOUND_CRUISE_SYNC_CENTER__: { enabled: true, environment: 'production', endpoint } }), {
        enabled: true,
        endpoint,
        qaAdmissionRequired: false,
        admissionMode: 'production'
    });
    assert.deepEqual(readSyncCenterConfig({ __SOUND_CRUISE_SYNC_CENTER__: { enabled: true, environment: 'development', endpoint: `${endpoint}/` } }), {
        enabled: true,
        endpoint,
        qaAdmissionRequired: false,
        admissionMode: 'qa'
    });
});

test('production QA activation is exact-host and query-bound while ordinary users stay OFF', () => {
    assert.deepEqual(readSyncCenterConfig({ location: {
        hostname: 'soundcruise.jp', search: '?sound-cruise-qa=1'
    } }), {
        enabled: true,
        endpoint: 'https://sound-cruise-sync.cruise-port-requests.workers.dev',
        qaAdmissionRequired: true,
        admissionMode: 'qa'
    });
    assert.deepEqual(readSyncCenterConfig({ location: {
        hostname: 'soundcruise.jp', search: ''
    } }), { enabled: false, endpoint: null });
    assert.deepEqual(readSyncCenterConfig({ location: {
        hostname: 'attacker.example', search: '?sound-cruise-qa=1'
    } }), { enabled: false, endpoint: null });
});

test('membership presentation covers unset, prepared, initial, ready, attention and deleting', () => {
    assert.equal(membershipPresentation(null).key, 'unset');
    assert.equal(membershipPresentation({ state: 'pending' }).key, 'prepared');
    assert.equal(membershipPresentation({ state: 'active', dataset: null }).key, 'initial');
    assert.equal(membershipPresentation({ state: 'active', dataset: { state: 'ready' } }).key, 'synced');
    assert.equal(membershipPresentation({ state: 'broken' }).key, 'attention');
    assert.equal(membershipPresentation({ state: 'deleted' }).key, 'deleting');
});

test('summary normalization creates four-app progress without leaking Account identifiers or hashes', () => {
    const model = normalizeSyncCenterSummary(activeSummary, { devices: [
        { id: 'secret-device-id', label: 'iPhone', isCurrent: true, revokedAt: null }
    ] });
    assert.deepEqual(model.apps.map(({ id, status }) => [id, status]), [
        ['pitch', 'prepared'], ['fretboard', 'initial'], ['rhythm', 'attention'], ['chord', 'synced']
    ]);
    assert.equal(model.readyCount, 1);
    assert.equal(model.totalCount, 4);
    assert.deepEqual(model.environments, [{
        id: 'secret-device-id', label: 'iPhone', isCurrent: true, state: 'active',
        createdAt: null, lastSeenAt: null, relatedApps: []
    }]);
    const serialized = JSON.stringify(model);
    assert.doesNotMatch(serialized, /secret-account-id|secret-hash/);
    assert.doesNotMatch(serialized, /lastSync|lastSyncedAt/);
});

test('only a ready active membership with an existing app device can add another environment', () => {
    const model = normalizeSyncCenterSummary({
        account: { id: 'account', state: 'active', recoveryVersion: 1 },
        memberships: [
            { appId: 'chord', state: 'active', activeAppDeviceCount: 1, dataset: { state: 'ready', recordCount: 1 } },
            { appId: 'pitch', state: 'active', activeAppDeviceCount: 0, dataset: { state: 'ready', recordCount: 1 } },
            { appId: 'fretboard', state: 'active', activeAppDeviceCount: 1, dataset: { state: 'initializing', recordCount: 0 } },
            { appId: 'rhythm', state: 'pending', activeAppDeviceCount: 0, dataset: null }
        ]
    });
    assert.deepEqual(model.apps.map(({ id, canAddEnvironment }) => [id, canAddEnvironment]), [
        ['pitch', false], ['fretboard', false], ['rhythm', false], ['chord', true]
    ]);
    assert.equal(model.readyCount, 2, 'environment count never changes the four-app progress');
});

function accountRoot({ account = null, summary = activeSummary, devices = { devices: [] }, fail = false } = {}) {
    class Client {
        constructor(options) { assert.equal(options.endpoint, endpoint); }
        async summary() { if (fail) throw new Error('offline'); return summary; }
        async devices() { if (fail) throw new Error('offline'); return devices; }
    }
    return {
        core: {}, AccountClient: Client,
        storage: { async getAccount() { return account; } }
    };
}

test('disabled gate never opens Account storage; unset account remains distinct', async () => {
    let reads = 0;
    const disabled = createSyncCenterController({
        config: { enabled: false, endpoint: null },
        accountRoot: { storage: { async getAccount() { reads += 1; } } }
    });
    assert.equal((await disabled.load()).kind, 'disabled');
    assert.equal(reads, 0);
    const unset = createSyncCenterController({
        config: { enabled: true, endpoint }, accountRoot: accountRoot(), online: () => true
    });
    assert.equal((await unset.load()).kind, 'unset');
});

test('controller reads only shared Account primitives and retains known status on errors', async () => {
    const root = accountRoot({ account: { accountCredential: 'opaque' } });
    const controller = createSyncCenterController({ config: { enabled: true, endpoint }, accountRoot: root, online: () => true });
    const ready = await controller.load();
    assert.equal(ready.kind, 'ready');
    root.AccountClient.prototype.summary = async () => { throw new Error('temporary'); };
    const failed = await controller.load();
    assert.equal(failed.kind, 'error');
    assert.equal(failed.apps.find(({ id }) => id === 'chord').status, 'synced');
    assert.notEqual(failed.accountState, 'unset');
    assert.deepEqual(controller.planFourAppSetup(failed), { kind: 'unavailable', appIds: [] });
    assert.deepEqual(controller.planFourAppSetup(ready), { kind: 'local-preview', appIds: ['pitch', 'fretboard', 'rhythm'] });
});

test('offline state does not call API and does not masquerade as an unset account', async () => {
    const controller = createSyncCenterController({
        config: { enabled: true, endpoint },
        accountRoot: accountRoot({ account: { accountCredential: 'opaque' } }),
        online: () => false
    });
    const model = await controller.load();
    assert.equal(model.kind, 'offline');
    assert.equal(model.accountState, 'unknown');
});
