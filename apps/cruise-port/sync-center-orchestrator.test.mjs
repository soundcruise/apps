import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createSyncCenterOrchestrator } from './sync-center-orchestrator.js';

function fixture() {
    const calls = [];
    let failPitch = true;
    const memberships = new Map([['chord', { id: 'm-chord', appId: 'chord', state: 'pending' }]]);
    const storage = {
        async getAccount() { return { accountCredential: 'sca1.account' }; }
    };
    class Client {
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
    }
    let operation = 0;
    const accountRoot = {
        AccountClient: Client,
        storage,
        core: {
            createAccountMaterial: () => ({ recoveryCode: 'secret', accountCredential: 'sca1.account' }),
            formatRecoveryCode: () => 'DISPLAY-ONLY',
            createOperationId: () => `op-${++operation}`,
            createHandoffMaterial: () => ({ operationId: `op-${++operation}`, handoffToken: 'opaque' }),
            createJoinMaterial: () => ({ operationId: `op-${++operation}`, invitationId: 'invite-1', joinCode: 'SCJ1AAAABBBBCCCCDDDDEEEE' })
        }
    };
    const navigations = [];
    const orchestrator = createSyncCenterOrchestrator({
        config: { enabled: true, endpoint: 'https://sync.example' },
        accountRoot,
        navigate: (url) => navigations.push(url),
        appUrl: (appId) => `https://apps.example/${appId}/pro/`
    });
    return { orchestrator, calls, memberships, navigations };
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

test('four-app preparation keeps successes and retries only the failed membership', async () => {
    const { orchestrator, calls } = fixture();
    const first = await orchestrator.prepareAll();
    assert.equal(first.ok, false);
    assert.deepEqual(first.results.map(({ appId, ok }) => [appId, ok]), [
        ['chord', true], ['pitch', false], ['fretboard', true], ['rhythm', true]
    ]);
    const second = await orchestrator.prepareAll();
    assert.equal(second.ok, true);
    assert.deepEqual(calls.filter(([kind]) => kind === 'prepare').map(([, appId]) => appId),
        ['pitch', 'fretboard', 'rhythm', 'pitch']);
});

test('cross-container Join Code is default while active memberships reopen directly', async () => {
    const { orchestrator, calls, memberships, navigations } = fixture();
    const join = await orchestrator.launch('chord');
    assert.equal(join.kind, 'join');
    assert.match(join.displayJoinCode, /^SCJ1-/);
    assert.equal(navigations.length, 0);
    memberships.set('chord', { id: 'm-chord', appId: 'chord', state: 'active', dataset: { state: 'initializing' } });
    const reopened = await orchestrator.launch('chord');
    assert.equal(reopened.kind, 'open');
    assert.equal(calls.filter(([kind]) => kind === 'join').length, 1);
    assert.equal(navigations.at(-1), 'https://apps.example/chord/pro/');
});

test('Port can cancel a displayed cross-container Join invitation', async () => {
    const { orchestrator, calls } = fixture();
    await orchestrator.cancelJoin('invite-1');
    assert.deepEqual(calls.find(([kind]) => kind === 'cancel-join'), ['cancel-join', 'invite-1']);
});

test('Port orchestrator never reads app localStorage or IndexedDB', () => {
    const source = readFileSync(new URL('./sync-center-orchestrator.js', import.meta.url), 'utf8');
    assert.equal(/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/.test(source), false);
});
