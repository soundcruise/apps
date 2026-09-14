import { resolveCruiseAppHref } from './cruise-app-links.js?v=0.27.0';
import { SYNC_CENTER_APPS } from './sync-center-controller.js?v=0.31.1';

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
        qaScope: 'port'
    });
    let accountMaterial = null;

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
            const result = await client.startAccount({
                appIds: SYNC_CENTER_APPS.map((app) => app.id),
                deviceLabel: deviceLabel(), turnstileToken,
                material: accountMaterial, recoverySaved: true
            });
            accountMaterial = null;
            return result;
        },
        discardAccountCandidate() { accountMaterial = null; },
        async resume() {
            const resumed = await client.resumePendingStart();
            return resumed.status === 'committed' ? resumed.summary : summary();
        },
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
            if (membership.state === 'active') {
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
