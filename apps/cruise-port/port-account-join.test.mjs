import assert from 'node:assert/strict';
import test from 'node:test';
import { createPortAccountJoin } from './port-account-join.js';

class AccountApiError extends Error {
    constructor(code) { super(code); this.code = code; }
}

function fixture({ admissionMode = 'qa', consume = async () => ({
    accountId: 'account-1', accountDeviceId: 'device-2', recoveryVersion: 4,
    qaSessionId: 'qa-2', qaExpiresAt: 999999
}), summary = async () => ({
    account: { id: 'account-1', recoveryVersion: 4 }, memberships: [], qaSessionExpiresAt: 999999
}), setAccount = null } = {}) {
    let account = null;
    let pending = null;
    let qa = null;
    const writes = [];
    const storage = {
        async getAccount() { return account; },
        async setAccount(value) {
            if (setAccount) await setAccount(value);
            account = structuredClone(value);
            writes.push(['account', account]);
        },
        async getPendingConsume() { return pending && structuredClone(pending); },
        async setPendingConsume(value) { pending = structuredClone(value); writes.push(['pending', pending]); },
        async clearPendingConsume() { pending = null; writes.push(['clear']); },
        async setQaAdmission(value) { qa = structuredClone(value); writes.push(['qa', qa]); }
    };
    const client = {
        async request(path, options) {
            if (path.endsWith('/consume')) return consume(options.body);
            if (path.endsWith('/cancel')) return { ok: true };
            return { invitationId: options.body.invitationId, expiresAt: 300000 };
        },
        summary
    };
    const accountRoot = {
        AccountApiError,
        storage,
        core: {
            createJoinMaterial: () => ({ operationId: 'issue-op', invitationId: 'invite-1', joinCode: 'SCJ1AAAABBBBCCCCDDDDEEEE' }),
            formatJoinCode: () => 'SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE',
            normalizeJoinCode: (value) => String(value).replaceAll('-', ''),
            createAccountCredential: () => ({ accountDeviceId: 'device-2', accountCredential: 'sca1.device-2.secret' }),
            createQaCredential: () => ({ qaSessionId: 'qa-2', qaCredential: 'scq1.qa-2.secret' }),
            createOperationId: () => 'consume-op'
        }
    };
    return {
        join: createPortAccountJoin({ client, accountRoot, admissionMode }),
        storage, writes,
        values: () => ({ account, pending, qa })
    };
}

test('Port receiver preserves one response-loss candidate without persisting the addition code', async () => {
    const current = fixture({
        consume: async () => { throw new Error('network_error'); },
        summary: async () => { throw new Error('network_error'); }
    });
    await assert.rejects(
        current.join.consume('SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE'),
        /network_error/
    );
    const pending = current.values().pending;
    assert.equal(pending.transport, 'port_join');
    assert.equal(JSON.stringify(pending).includes('SCJ1'), false);
    assert.equal(JSON.stringify(current.writes).includes('SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE'), false);
});

test('response-loss is reconciled immediately with the exact new Account Device', async () => {
    const current = fixture({ consume: async () => { throw new Error('network_error'); } });
    const result = await current.join.consume('SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE');
    assert.equal(result.reconciled, true);
    assert.equal(current.values().account.accountId, 'account-1');
    assert.equal(current.values().account.recoveryVersion, 4);
    assert.equal(current.values().qa.scope, 'port');
    assert.equal(current.values().pending, null);
});

test('retry reconciles the original pending credential without a duplicate consume or Account Device', async () => {
    let consumeCalls = 0;
    let summaryCalls = 0;
    const current = fixture({
        consume: async () => { consumeCalls += 1; throw new Error('network_error'); },
        summary: async () => {
            summaryCalls += 1;
            if (summaryCalls === 1) throw new Error('network_error');
            return {
                account: { id: 'account-1', recoveryVersion: 4 },
                memberships: [], qaSessionExpiresAt: 999999
            };
        }
    });
    await assert.rejects(current.join.consume('SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE'), /network_error/);
    const pendingDevice = current.values().pending.accountDeviceId;
    const result = await current.join.consume('SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE');
    assert.equal(result.reconciled, true);
    assert.equal(current.values().account.accountDeviceId, pendingDevice);
    assert.equal(consumeCalls, 1);
    assert.equal(current.writes.filter(([kind]) => kind === 'pending').length, 1);
});

test('post-consume local persistence failure reconciles without a duplicate consume', async () => {
    let consumeCalls = 0;
    let accountWrites = 0;
    const current = fixture({
        consume: async () => {
            consumeCalls += 1;
            return {
                accountId: 'account-1', accountDeviceId: 'device-2', recoveryVersion: 4,
                qaSessionId: 'qa-2', qaExpiresAt: 999999
            };
        },
        setAccount: async () => {
            accountWrites += 1;
            if (accountWrites === 1) throw new Error('account_storage_write_failed');
        }
    });
    const result = await current.join.consume('SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE');
    assert.equal(result.reconciled, true);
    assert.equal(consumeCalls, 1);
    assert.equal(accountWrites, 2);
    assert.equal(current.values().pending, null);
});

test('definitively uncommitted candidate is cleared and can be entered again', async () => {
    const current = fixture({
        consume: async () => { throw new Error('network_error'); },
        summary: async () => { throw new AccountApiError('invalid_account_credential'); }
    });
    await assert.rejects(current.join.consume('SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE'));
    assert.equal((await current.join.resume()).status, 'none');
    assert.equal(current.values().pending, null);
});

test('production Port addition creates no QA material', async () => {
    const current = fixture({
        admissionMode: 'production',
        consume: async () => ({
            accountId: 'account-1', accountDeviceId: 'device-2', recoveryVersion: 4,
            qaSessionId: null, qaExpiresAt: null
        })
    });
    await current.join.consume('SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE');
    assert.equal(current.values().qa, null);
    assert.equal(current.values().account.accountId, 'account-1');
});
