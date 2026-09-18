import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createSyncCenterOrchestrator } from './sync-center-orchestrator.js';

function fixture() {
    const calls = [];
    let savedAccount = { accountCredential: 'sca1.account' };
    let pendingConsume = null;
    let qaAdmission = null;
    let failPitch = true;
    const memberships = new Map([['chord', { id: 'm-chord', appId: 'chord', state: 'pending' }]]);
    const storage = {
        async getAccount() { return savedAccount; },
        async setAccount(value) { savedAccount = value; calls.push(['save-account', value.accountDeviceId]); },
        async getPendingConsume() { return pendingConsume; },
        async setPendingConsume(value) { pendingConsume = value; calls.push(['save-pending', value.transport]); },
        async clearPendingConsume() { pendingConsume = null; calls.push(['clear-pending']); },
        async setQaAdmission(value) { qaAdmission = value; calls.push(['save-qa', value.scope]); }
    };
    class Client {
        async request(path, options) {
            calls.push(['request', path]);
            if (path === '/v2/accounts/port-join-invitations') {
                return { invitationId: options.body.invitationId, expiresAt: 300000 };
            }
            if (path === '/v2/accounts/port-join-invitations/cancel') return { cancelled: true };
            if (path === '/v2/accounts/port-join-invitations/consume') {
                return {
                    accountId: 'account-1', accountDeviceId: 'port-device-2',
                    recoveryVersion: 1, qaSessionId: 'qa-session-2', qaExpiresAt: 900000
                };
            }
            throw new Error('unexpected_request');
        }
        async startAccount(input) { calls.push(['start', input]); return { ok: true }; }
        async summary() { return { account: { id: 'account-1', state: 'active' }, memberships: [...memberships.values()] }; }
        async prepareMembership({ appId }) {
            calls.push(['prepare', appId]);
            if (appId === 'pitch' && failPitch) { failPitch = false; throw Object.assign(new Error('temporary'), { code: 'temporary' }); }
            const value = { id: `m-${appId}`, appId, state: 'pending' };
            memberships.set(appId, value);
            return { membershipState: 'pending' };
        }
        async issueHandoff({ appId, appUrl }) {
            calls.push(['handoff', appId]);
            return { url: `${appUrl}#sc_handoff=opaque`, expiresAt: 300000 };
        }
        async issueJoinInvitation({ appId, material }) {
            calls.push(['join', appId]);
            return { invitationId: material.invitationId, displayJoinCode: 'SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE', expiresAt: 300000 };
        }
        async cancelJoinInvitation({ invitationId }) {
            calls.push(['cancel-join', invitationId]);
            return { cancelled: true };
        }
        async detachApp({ appId, operationId }) {
            calls.push(['detach', appId, operationId]);
            const membership = memberships.get(appId);
            if (membership) memberships.set(appId, { ...membership, activeAppDeviceCount: 0 });
            return { status: 'detached', appId, revokedAppDeviceCount: 1 };
        }
        async detachCurrentEnvironment({ operationId }) {
            calls.push(['detach-current-environment', operationId]);
            return { status: 'detached', scope: 'current_environment', revokedAppDeviceCount: 4 };
        }
        async cancelAppDelete({ appId, operationId }) {
            calls.push(['cancel-app-delete', appId, operationId]);
            const membership = memberships.get(appId);
            if (membership) memberships.set(appId, { ...membership, state: 'active', activeAppDeviceCount: 0 });
            return { status: 'active', appId };
        }
        async revokeAppEnvironment({ appId, appDeviceId, operationId }) {
            calls.push(['revoke-app-environment', appId, appDeviceId, operationId]);
            return { status: 'revoked', appId, appDeviceId };
        }
    }
    let operation = 0;
    const accountRoot = {
        AccountClient: Client,
        AccountApiError: class AccountApiError extends Error {},
        storage,
        core: {
            validAccountCredential: (value) => typeof value === 'string' && value.startsWith('sca1.'),
            validQaCredential: (value) => typeof value === 'string' && value.startsWith('scq1.'),
            createAccountMaterial: () => ({ recoveryCode: 'secret', accountCredential: 'sca1.account' }),
            formatRecoveryCode: () => 'DISPLAY-ONLY',
            createOperationId: () => `op-${++operation}`,
            createHandoffMaterial: () => ({ operationId: `op-${++operation}`, handoffToken: 'opaque' }),
            createJoinMaterial: () => ({ operationId: `op-${++operation}`, invitationId: 'invite-1', joinCode: 'SCJ1AAAABBBBCCCCDDDDEEEE' }),
            formatJoinCode: () => 'SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE',
            normalizeJoinCode: (value) => value?.replaceAll('-', '') || null,
            createAccountCredential: () => ({ accountDeviceId: 'port-device-2', accountCredential: 'sca1.port-device-2.secret' }),
            createQaCredential: () => ({ qaSessionId: 'qa-session-2', qaCredential: 'scq1.qa-session-2.secret' })
        }
    };
    const navigations = [];
    const orchestrator = createSyncCenterOrchestrator({
        config: { enabled: true, endpoint: 'https://sync.example' },
        accountRoot,
        navigate: (url) => navigations.push(url),
        appUrl: (appId) => `https://apps.example/${appId}/pro/`
    });
    return {
        orchestrator, calls, memberships, navigations,
        setSavedAccount(value) { savedAccount = value; },
        getSavedAccount() { return savedAccount; },
        getPendingConsume() { return pendingConsume; },
        getQaAdmission() { return qaAdmission; }
    };
}

test('Account creation requires the one-time Recovery confirmation', async () => {
    const { orchestrator, calls } = fixture();
    assert.equal(orchestrator.createAccountCandidate().recoveryCode, 'DISPLAY-ONLY');
    await assert.rejects(
        orchestrator.completeAccountSetup({ recoverySaved: false, turnstileToken: 'verified' }),
        /recovery_save_confirmation_required/
    );
    await orchestrator.completeAccountSetup({ recoverySaved: true, turnstileToken: 'verified' });
    assert.equal(calls.filter(([kind]) => kind === 'start').length, 1);
});

test('fresh QA receiver can render before enrollment while configured Accounts remain gated', async () => {
    const fixtureState = fixture();
    assert.equal(await fixtureState.orchestrator.hasConfiguredAccount(), true);
    fixtureState.setSavedAccount(null);
    assert.equal(await fixtureState.orchestrator.hasConfiguredAccount(), false);
});

test('duplicate Account submit shares one in-flight operation', async () => {
    const { orchestrator, calls } = fixture();
    orchestrator.createAccountCandidate();
    const first = orchestrator.completeAccountSetup({ recoverySaved: true, turnstileToken: 'verified' });
    const second = orchestrator.completeAccountSetup({ recoverySaved: true, turnstileToken: 'verified' });
    const [left, right] = await Promise.all([first, second]);
    assert.equal(left, right);
    assert.equal(calls.filter(([kind]) => kind === 'start').length, 1);
});

test('four-app preparation keeps successes and retries only the failed membership', async () => {
    const { orchestrator, calls } = fixture();
    const first = await orchestrator.prepareAll();
    assert.equal(first.ok, false);
    assert.deepEqual(first.results.map(({ appId, ok }) => [appId, ok]), [
        ['pitch', false], ['fretboard', true], ['rhythm', true], ['chord', true]
    ]);
    const second = await orchestrator.prepareAll();
    assert.equal(second.ok, true);
    assert.deepEqual(calls.filter(([kind]) => kind === 'prepare').map(([, appId]) => appId),
        ['pitch', 'fretboard', 'rhythm', 'pitch']);
});

test('initial Join Code remains the default while active memberships reopen directly', async () => {
    const { orchestrator, calls, memberships, navigations } = fixture();
    const join = await orchestrator.launch('chord');
    assert.equal(join.kind, 'join');
    assert.match(join.displayJoinCode, /^SCJ1-/);
    assert.equal(navigations.length, 0);
    memberships.set('chord', {
        id: 'm-chord', appId: 'chord', state: 'active', activeAppDeviceCount: 1,
        dataset: { state: 'initializing' }
    });
    const reopened = await orchestrator.launch('chord');
    assert.equal(reopened.kind, 'open');
    assert.equal(calls.filter(([kind]) => kind === 'join').length, 1);
    assert.equal(navigations.at(-1), 'https://apps.example/chord/pro/');
});

test('Home launch issues Auto Rejoin only for an active ready membership', async () => {
    const { orchestrator, calls, memberships, navigations } = fixture();
    const pending = await orchestrator.launchFromHome('chord');
    assert.equal(pending.kind, 'open');
    assert.equal(calls.filter(([kind]) => kind === 'join' || kind === 'handoff').length, 0);
    memberships.set('chord', {
        id: 'm-chord', appId: 'chord', state: 'active', activeAppDeviceCount: 1,
        dataset: { state: 'ready' }
    });
    const ready = await orchestrator.launchFromHome('chord');
    assert.equal(ready.kind, 'handoff');
    assert.equal(calls.filter(([kind]) => kind === 'handoff').length, 1);
    assert.equal(navigations.length, 2);
});

test('active ready memberships keep manual Add Environment and use a one-time launch handoff', async () => {
    const { orchestrator, calls, memberships, navigations } = fixture();
    memberships.set('pitch', {
        id: 'm-pitch', appId: 'pitch', state: 'active', activeAppDeviceCount: 1,
        dataset: { state: 'ready', recordCount: 1 }
    });
    const added = await orchestrator.addEnvironment('pitch');
    assert.equal(added.kind, 'add_environment');
    assert.match(added.displayJoinCode, /^SCJ1-/);
    assert.deepEqual(calls.filter(([kind]) => kind === 'join'), [['join', 'pitch']]);
    assert.equal(navigations.length, 0);

    const opened = await orchestrator.launch('pitch');
    assert.equal(opened.kind, 'handoff');
    assert.match(navigations.at(-1), /^https:\/\/apps\.example\/pitch\/pro\/#sc_handoff=opaque$/);
    assert.deepEqual(calls.filter(([kind]) => kind === 'handoff'), [['handoff', 'pitch']]);
});

test('add environment rejects pending, incomplete, and device-less memberships', async () => {
    const { orchestrator, memberships, calls } = fixture();
    await assert.rejects(() => orchestrator.addEnvironment('chord'), /membership_unavailable/);
    memberships.set('pitch', {
        id: 'm-pitch', appId: 'pitch', state: 'active', activeAppDeviceCount: 1,
        dataset: { state: 'initializing' }
    });
    await assert.rejects(() => orchestrator.addEnvironment('pitch'), /membership_unavailable/);
    memberships.set('pitch', {
        id: 'm-pitch', appId: 'pitch', state: 'active', activeAppDeviceCount: 0,
        dataset: { state: 'ready' }
    });
    await assert.rejects(() => orchestrator.addEnvironment('pitch'), /membership_unavailable/);
    assert.equal(calls.filter(([kind]) => kind === 'join').length, 0);
});

test('Recovery-revoked membership gets an automatic handoff without recreating its dataset', async () => {
    const { orchestrator, calls, memberships, navigations } = fixture();
    memberships.set('chord', {
        id: 'm-chord', appId: 'chord', state: 'active', activeAppDeviceCount: 0,
        dataset: { state: 'ready', recordCount: 12 }
    });
    const reconnect = await orchestrator.launch('chord');
    assert.equal(reconnect.kind, 'handoff');
    assert.equal(calls.filter(([kind]) => kind === 'handoff').length, 1);
    assert.equal(navigations.length, 1);
});

test('app detach uses Account authority once and immediate rejoin reuses the active ready membership', async () => {
    const { orchestrator, calls, memberships } = fixture();
    memberships.set('rhythm', {
        id: 'm-rhythm', appId: 'rhythm', state: 'active', activeAppDeviceCount: 2,
        dataset: { state: 'ready', recordCount: 9 }
    });
    const detached = await orchestrator.detachApp('rhythm');
    assert.equal(detached.revokedAppDeviceCount, 1);
    assert.equal(calls.filter(([kind]) => kind === 'detach').length, 1);
    const rejoin = await orchestrator.launch('rhythm');
    assert.equal(rejoin.kind, 'handoff');
    assert.equal(memberships.get('rhythm').id, 'm-rhythm');
    assert.equal(memberships.get('rhythm').dataset.state, 'ready');
    assert.equal(calls.filter(([kind, appId]) => kind === 'prepare' && appId === 'rhythm').length, 0);
});

test('delete cancellation completes before issuing a launch handoff and app environment revoke stays scoped', async () => {
    const { orchestrator, calls, memberships } = fixture();
    memberships.set('pitch', {
        id: 'm-pitch', appId: 'pitch', state: 'deleting', activeAppDeviceCount: 0,
        dataset: { state: 'ready', recordCount: 4 }
    });
    const join = await orchestrator.cancelAppDeleteAndLaunch('pitch');
    assert.equal(join.kind, 'handoff');
    assert.deepEqual(calls.filter(([kind]) => ['cancel-app-delete', 'handoff'].includes(kind))
        .map(([kind, appId]) => [kind, appId]), [
        ['cancel-app-delete', 'pitch'], ['handoff', 'pitch']
    ]);
    await orchestrator.revokeAppEnvironment('pitch', 'app-device-1');
    assert.deepEqual(calls.find(([kind]) => kind === 'revoke-app-environment').slice(0, 3),
        ['revoke-app-environment', 'pitch', 'app-device-1']);
});

test('current Port detach uses only the stored Account authority and does not issue a Join or Delete intent', async () => {
    const { orchestrator, calls } = fixture();
    const result = await orchestrator.detachCurrentEnvironment();
    assert.equal(result.scope, 'current_environment');
    assert.equal(calls.filter(([kind]) => kind === 'detach-current-environment').length, 1);
    assert.equal(calls.some(([kind]) => kind === 'join' || kind === 'prepare'), false);
});

test('Port can cancel a displayed cross-container Join invitation', async () => {
    const { orchestrator, calls } = fixture();
    await orchestrator.cancelJoin('invite-1');
    assert.deepEqual(calls.find(([kind]) => kind === 'cancel-join'), ['cancel-join', 'invite-1']);
});

test('Port addition issues separately and receiver stores no plaintext Join Code', async () => {
    const current = fixture();
    const issued = await current.orchestrator.issuePortAddition();
    assert.equal(issued.kind, 'add_port');
    assert.match(issued.displayJoinCode, /^SCJ1-/);
    await current.orchestrator.cancelPortAddition(issued.invitationId);
    assert.equal(current.calls.filter(([, path]) => path === '/v2/accounts/port-join-invitations').length, 1);
    assert.equal(current.calls.filter(([, path]) => path === '/v2/accounts/port-join-invitations/cancel').length, 1);

    const receiver = fixture();
    receiver.setSavedAccount(null);
    await receiver.orchestrator.connectExistingAccount('SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE');
    assert.equal(receiver.getSavedAccount().accountDeviceId, 'port-device-2');
    assert.equal(receiver.getQaAdmission().scope, 'port');
    assert.equal(receiver.getPendingConsume(), null);
    assert.equal(JSON.stringify(receiver.calls).includes('SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE'), false);
});

test('Port orchestrator never reads app localStorage or IndexedDB', () => {
    const source = readFileSync(new URL('./sync-center-orchestrator.js', import.meta.url), 'utf8');
    assert.equal(/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/.test(source), false);
});
