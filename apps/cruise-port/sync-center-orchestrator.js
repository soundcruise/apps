import { resolveCruiseAppHref } from './cruise-app-links.js?v=0.27.0';
import { SYNC_CENTER_APPS } from './sync-center-controller.js?v=0.40.7';
import { createPortAccountJoin } from './port-account-join.js?v=0.40.7';

export function createSyncCenterOrchestrator({
    config,
    accountRoot = globalThis.SoundCruiseSyncAccount,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    navigate = (url) => globalThis.location.assign(url),
    appUrl = (appId) => {
        const url = new URL(resolveCruiseAppHref(appId, 'pro'), globalThis.location.origin);
        if (config?.qaAdmissionRequired) url.searchParams.set('sound-cruise-qa', '1');
        return url.toString();
    },
    deviceLabel = () => 'Cruise Port'
} = {}) {
    if (!config?.enabled || !accountRoot?.AccountClient || !accountRoot?.core || !accountRoot?.storage) {
        return Object.freeze({ enabled: false });
    }
    const client = new accountRoot.AccountClient({
        endpoint: config.endpoint, fetchImpl, storage: accountRoot.storage, core: accountRoot.core,
        admissionMode: config.admissionMode || 'qa', qaScope: 'port'
    });
    const portJoin = createPortAccountJoin({
        client,
        accountRoot,
        admissionMode: config.admissionMode || 'qa',
        deviceLabel: () => `${deviceLabel()}（追加した環境）`
    });
    let accountMaterial = null;
    let accountStartPromise = null;
    let recoveryMaterial = null;
    let recoveryRotationMaterial = null;
    let deleteMaterial = null;

    async function account() { return accountRoot.storage.getAccount(); }
    async function credential() {
        const saved = await account();
        if (!saved?.accountCredential) throw new Error('account_not_configured');
        return saved.accountCredential;
    }
    async function summary() { return client.summary(await credential()); }

    return Object.freeze({
        enabled: true,
        qaAdmissionRequired: config.qaAdmissionRequired === true,
        async hasConfiguredAccount() {
            const saved = await account();
            return accountRoot.core.validAccountCredential(saved?.accountCredential);
        },
        async hasQaAdmission() {
            const value = await accountRoot.storage.getQaAdmission('port');
            return accountRoot.core.validQaCredential(value?.qaCredential) && value.expiresAt > Date.now();
        },
        async enrollQa({ enrollmentCode, turnstileToken }) {
            return client.enrollQa({ enrollmentCode, turnstileToken });
        },
        createAccountCandidate() {
            accountMaterial = accountRoot.core.createAccountMaterial();
            return Object.freeze({
                phase: 'recovery',
                recoveryCode: accountRoot.core.formatRecoveryCode(accountMaterial.recoveryCode)
            });
        },
        async completeAccountSetup({ recoverySaved, turnstileToken }) {
            if (!accountMaterial || recoverySaved !== true) throw new Error('recovery_save_confirmation_required');
            if (accountStartPromise) return accountStartPromise;
            accountStartPromise = (async () => {
                const result = await client.startAccount({
                    appIds: SYNC_CENTER_APPS.map((app) => app.id),
                    deviceLabel: deviceLabel(), turnstileToken,
                    material: accountMaterial, recoverySaved: true
                });
                accountMaterial = null;
                return result;
            })();
            try { return await accountStartPromise; }
            finally { accountStartPromise = null; }
        },
        discardAccountCandidate() { accountMaterial = null; },
        async resume() {
            const joinedPort = await portJoin.resume();
            if (joinedPort.status === 'committed') return joinedPort.summary;
            const recovered = await client.resumePendingRecovery?.();
            if (recovered?.status === 'committed') return summary();
            const detached = await client.resumePendingDetach?.();
            if (detached?.status === 'committed') return summary();
            const environmentDetached = await client.resumePendingEnvironmentDetach?.();
            if (environmentDetached?.status === 'committed') return Object.freeze({ accountDetached: true });
            const deleted = await client.resumePendingDelete?.();
            if (deleted?.status === 'committed' && deleted.result?.scope === 'account') {
                return Object.freeze({ accountDeleted: true });
            }
            const resumed = await client.resumePendingStart();
            return resumed.status === 'committed' ? resumed.summary : summary();
        },
        async prepareRecovery({ recoveryCode, turnstileToken }) {
            recoveryMaterial = accountRoot.core.createAccountRecoveryMaterial();
            return client.prepareAccountRecovery({
                recoveryCode,
                deviceLabel: deviceLabel(),
                turnstileToken,
                material: recoveryMaterial
            });
        },
        recoveryCandidateCode() {
            if (!recoveryMaterial) throw new Error('account_recovery_not_prepared');
            return accountRoot.core.formatRecoveryCode(recoveryMaterial.nextRecoveryCode);
        },
        async commitRecovery({ recoverySaved }) {
            if (!recoveryMaterial) throw new Error('account_recovery_not_prepared');
            const result = await client.commitAccountRecovery({
                material: recoveryMaterial,
                recoverySaved
            });
            recoveryMaterial = null;
            return result;
        },
        discardRecoveryCandidate() { recoveryMaterial = null; },
        async prepareRecoveryRotation({ turnstileToken }) {
            if (!recoveryRotationMaterial) {
                recoveryRotationMaterial = accountRoot.core.createAccountRecoveryMaterial();
            }
            return client.prepareAccountRecoveryRotation({
                accountCredential: await credential(),
                turnstileToken,
                material: recoveryRotationMaterial
            });
        },
        recoveryRotationCandidateCode() {
            if (!recoveryRotationMaterial) throw new Error('account_recovery_rotation_not_prepared');
            return accountRoot.core.formatRecoveryCode(recoveryRotationMaterial.nextRecoveryCode);
        },
        async commitRecoveryRotation({ recoverySaved }) {
            if (!recoveryRotationMaterial) throw new Error('account_recovery_rotation_not_prepared');
            const result = await client.commitAccountRecoveryRotation({
                accountCredential: await credential(),
                material: recoveryRotationMaterial,
                recoverySaved
            });
            recoveryRotationMaterial = null;
            return result;
        },
        discardRecoveryRotationCandidate() { recoveryRotationMaterial = null; },
        async revokeEnvironment(accountDeviceId) {
            return client.revokeEnvironment({
                accountCredential: await credential(),
                accountDeviceId,
                operationId: accountRoot.core.createOperationId()
            });
        },
        async revokeAppEnvironment(appId, appDeviceId) {
            if (!SYNC_CENTER_APPS.some((app) => app.id === appId) ||
                typeof appDeviceId !== 'string' || !appDeviceId) throw new Error('app_environment_invalid');
            return client.revokeAppEnvironment({
                accountCredential: await credential(), appId, appDeviceId,
                operationId: accountRoot.core.createOperationId()
            });
        },
        async detachCurrentEnvironment() {
            return client.detachCurrentEnvironment({
                accountCredential: await credential(), operationId: accountRoot.core.createOperationId()
            });
        },
        async detachApp(appId) {
            if (!SYNC_CENTER_APPS.some((app) => app.id === appId)) throw new Error('app_invalid');
            return client.detachApp({
                accountCredential: await credential(), appId,
                operationId: accountRoot.core.createOperationId()
            });
        },
        async cancelAppDeleteAndLaunch(appId) {
            if (!SYNC_CENTER_APPS.some((app) => app.id === appId)) throw new Error('app_invalid');
            const accountCredential = await credential();
            await client.cancelAppDelete({
                accountCredential, appId, operationId: accountRoot.core.createOperationId()
            });
            const material = accountRoot.core.createJoinMaterial();
            const issued = await client.issueJoinInvitation({ accountCredential, appId, material });
            return Object.freeze({
                kind: 'join', appId, invitationId: issued.invitationId,
                displayJoinCode: issued.displayJoinCode, expiresAt: issued.expiresAt,
                appUrl: appUrl(appId)
            });
        },
        async issueDelete(scope, appId = null) {
            deleteMaterial = accountRoot.core.createAccountDeleteMaterial();
            return client.issueDeleteIntent({
                accountCredential: await credential(), scope, appId, material: deleteMaterial
            });
        },
        async commitDelete(scope, appId = null) {
            if (!deleteMaterial) throw new Error('account_delete_not_prepared');
            const result = await client.commitDelete({
                accountCredential: await credential(), scope, appId,
                material: deleteMaterial, confirmed: true
            });
            deleteMaterial = null;
            return result;
        },
        discardDeleteCandidate() { deleteMaterial = null; },
        async prepareAll() {
            const accountCredential = await credential();
            const before = await client.summary(accountCredential);
            const byApp = new Map((before.memberships || []).map((membership) => [membership.appId, membership]));
            const results = [];
            for (const app of SYNC_CENTER_APPS) {
                const existing = byApp.get(app.id);
                if (existing && ['pending', 'active'].includes(existing.state)) {
                    results.push({ appId: app.id, ok: true, state: existing.state, reused: true });
                    continue;
                }
                try {
                    const value = await client.prepareMembership({
                        accountCredential, appId: app.id, operationId: accountRoot.core.createOperationId()
                    });
                    results.push({ appId: app.id, ok: true, state: value.membershipState || 'pending' });
                } catch (error) {
                    results.push({ appId: app.id, ok: false, code: error.code || error.message || 'prepare_failed' });
                }
            }
            return Object.freeze({
                ok: results.every((result) => result.ok),
                results: Object.freeze(results.map(Object.freeze)),
                summary: await client.summary(accountCredential)
            });
        },
        async launch(appId) {
            if (!SYNC_CENTER_APPS.some((app) => app.id === appId)) throw new Error('app_invalid');
            const accountCredential = await credential();
            let current = await client.summary(accountCredential);
            let membership = current.memberships?.find((item) => item.appId === appId);
            if (!membership) {
                await client.prepareMembership({
                    accountCredential, appId, operationId: accountRoot.core.createOperationId()
                });
                current = await client.summary(accountCredential);
                membership = current.memberships?.find((item) => item.appId === appId);
            }
            if (!membership || membership.state === 'deleted') throw new Error('membership_unavailable');
            if (membership.state === 'active' && Number(membership.activeAppDeviceCount || 0) > 0) {
                const url = appUrl(appId);
                navigate(url);
                return Object.freeze({ kind: 'open', appId, url });
            }
            const material = accountRoot.core.createJoinMaterial();
            const issued = await client.issueJoinInvitation({ accountCredential, appId, material });
            return Object.freeze({
                kind: 'join', appId, invitationId: issued.invitationId,
                displayJoinCode: issued.displayJoinCode, expiresAt: issued.expiresAt,
                appUrl: appUrl(appId)
            });
        },
        async addEnvironment(appId) {
            if (!SYNC_CENTER_APPS.some((app) => app.id === appId)) throw new Error('app_invalid');
            const accountCredential = await credential();
            const current = await client.summary(accountCredential);
            const membership = current.memberships?.find((item) => item.appId === appId);
            if (membership?.state !== 'active' || membership?.dataset?.state !== 'ready' ||
                Number(membership.activeAppDeviceCount || 0) < 1) {
                throw new Error('membership_unavailable');
            }
            const material = accountRoot.core.createJoinMaterial();
            const issued = await client.issueJoinInvitation({ accountCredential, appId, material });
            return Object.freeze({
                kind: 'add_environment', appId, invitationId: issued.invitationId,
                displayJoinCode: issued.displayJoinCode, expiresAt: issued.expiresAt,
                appUrl: appUrl(appId)
            });
        },
        async issuePortAddition() {
            return portJoin.issue(await credential());
        },
        async cancelPortAddition(invitationId) {
            if (typeof invitationId !== 'string' || !invitationId) throw new Error('port_join_invalid');
            return portJoin.cancel(await credential(), invitationId);
        },
        async connectExistingAccount(joinCode) {
            return portJoin.consume(joinCode);
        },
        async launchSameContainer(appId) {
            if (!SYNC_CENTER_APPS.some((app) => app.id === appId)) throw new Error('app_invalid');
            const accountCredential = await credential();
            const material = accountRoot.core.createHandoffMaterial();
            const issued = await client.issueHandoff({
                accountCredential, appId, appUrl: appUrl(appId), material
            });
            navigate(issued.url);
            return Object.freeze({ kind: 'handoff', appId, expiresAt: issued.expiresAt });
        },
        async cancelJoin(invitationId) {
            if (typeof invitationId !== 'string' || !invitationId) throw new Error('app_join_invalid');
            return client.cancelJoinInvitation({
                accountCredential: await credential(), invitationId
            });
        },
        summary
    });
}
