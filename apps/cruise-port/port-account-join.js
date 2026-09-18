export function createPortAccountJoin({
    client,
    accountRoot = globalThis.SoundCruiseSyncAccount,
    admissionMode = 'qa',
    deviceLabel = () => 'Cruise Port（追加）'
} = {}) {
    if (!client?.request || !accountRoot?.core || !accountRoot?.storage) {
        throw new Error('port_join_unavailable');
    }
    const { core, storage } = accountRoot;

    async function persistJoinedAccount(result, pending) {
        await storage.setAccount({
            accountId: result.accountId,
            accountDeviceId: pending.accountDeviceId,
            accountCredential: pending.accountCredential,
            recoveryVersion: result.recoveryVersion
        });
        if (pending.qaCredential) {
            await storage.setQaAdmission({
                qaSessionId: pending.qaSessionId,
                qaCredential: pending.qaCredential,
                scope: 'port', appId: null,
                accountId: result.accountId,
                expiresAt: result.qaExpiresAt
            });
        }
        await storage.clearPendingConsume();
    }

    async function resumePending() {
        const pending = await storage.getPendingConsume();
        if (!pending || pending.transport !== 'port_join') return Object.freeze({ status: 'none' });
        try {
            const summary = await client.summary(
                pending.accountCredential,
                pending.qaCredential ? { qaCredential: pending.qaCredential } : null
            );
            const result = Object.freeze({
                accountId: summary.account.id,
                accountDeviceId: pending.accountDeviceId,
                recoveryVersion: summary.account.recoveryVersion,
                qaExpiresAt: summary.qaSessionExpiresAt || null,
                reconciled: true
            });
            await persistJoinedAccount(result, pending);
            return Object.freeze({ status: 'committed', summary, result });
        } catch (error) {
            if (error instanceof accountRoot.AccountApiError &&
                ['invalid_account_credential', 'qa_admission_required'].includes(error.code)) {
                await storage.clearPendingConsume();
                return Object.freeze({ status: 'not_committed' });
            }
            throw error;
        }
    }

    return Object.freeze({
        async issue(accountCredential) {
            const material = core.createJoinMaterial();
            const result = await client.request('/v2/accounts/port-join-invitations', {
                method: 'POST', accountCredential,
                body: {
                    operationId: material.operationId,
                    invitationId: material.invitationId,
                    joinCode: material.joinCode
                }
            });
            return Object.freeze({
                kind: 'add_port', appId: 'port',
                invitationId: result.invitationId,
                displayJoinCode: core.formatJoinCode(material.joinCode),
                expiresAt: result.expiresAt
            });
        },
        cancel(accountCredential, invitationId) {
            return client.request('/v2/accounts/port-join-invitations/cancel', {
                method: 'POST', accountCredential, body: { invitationId }
            });
        },
        async consume(joinCode) {
            const saved = await storage.getAccount();
            if (saved?.accountCredential) throw new Error('account_already_configured');
            const existing = await storage.getPendingConsume();
            if (existing?.transport === 'port_join') {
                const resumed = await resumePending();
                if (resumed.status === 'committed') return resumed.result;
            }
            const normalizedCode = core.normalizeJoinCode(joinCode);
            if (!normalizedCode) throw new Error('port_join_input_invalid');
            const account = core.createAccountCredential();
            const qa = admissionMode === 'qa' ? core.createQaCredential() : null;
            const pending = {
                transport: 'port_join', operationId: core.createOperationId(),
                accountDeviceId: account.accountDeviceId,
                accountCredential: account.accountCredential,
                ...(qa ? { qaSessionId: qa.qaSessionId, qaCredential: qa.qaCredential } : {}),
                deviceLabel: deviceLabel()
            };
            await storage.setPendingConsume(pending);
            try {
                const result = await client.request('/v2/accounts/port-join-invitations/consume', {
                    method: 'POST', skipQa: true,
                    body: {
                        operationId: pending.operationId,
                        joinCode: normalizedCode,
                        accountCredential: pending.accountCredential,
                        ...(pending.qaCredential ? { qaCredential: pending.qaCredential } : {}),
                        deviceLabel: pending.deviceLabel
                    }
                });
                await persistJoinedAccount(result, pending);
                return Object.freeze(result);
            } catch (error) {
                try {
                    const resumed = await resumePending();
                    if (resumed.status === 'committed') return resumed.result;
                } catch (_) {
                    // Keep the exact pending credential for the next bounded
                    // reconciliation attempt; never replace it after consume
                    // may already have committed server-side.
                }
                throw error;
            }
        },
        resume: resumePending
    });
}
