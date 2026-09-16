export const SYNC_CENTER_ROUTE = '#sync-center';

export const SYNC_CENTER_APPS = Object.freeze([
    Object.freeze({ id: 'chord', name: 'コードクルーズ' }),
    Object.freeze({ id: 'pitch', name: '音感クルーズ' }),
    Object.freeze({ id: 'fretboard', name: '指板クルーズ' }),
    Object.freeze({ id: 'rhythm', name: 'リズムクルーズ' })
]);

const MEMBERSHIP_STATES = Object.freeze({
    unset: Object.freeze({ key: 'unset', label: '未設定', action: 'setup' }),
    prepared: Object.freeze({ key: 'prepared', label: '準備済み', action: 'open' }),
    initial: Object.freeze({ key: 'initial', label: '初回同期が必要', action: 'open' }),
    synced: Object.freeze({ key: 'synced', label: '同期済み', action: 'open' }),
    attention: Object.freeze({ key: 'attention', label: '確認が必要', action: 'open' }),
    deleting: Object.freeze({ key: 'deleting', label: '削除中', action: 'none' })
});

export function readSyncCenterConfig(globalObject = globalThis) {
    const value = globalObject?.__SOUND_CRUISE_SYNC_CENTER__;
    const location = globalObject?.location;
    const qaRequested = location?.hostname === 'soundcruise.jp' &&
        new URLSearchParams(location.search || '').get('sound-cruise-qa') === '1';
    const effective = qaRequested ? {
        enabled: true,
        environment: 'qa',
        endpoint: 'https://sound-cruise-sync.cruise-port-requests.workers.dev'
    } : value;
    if (!effective || effective.enabled !== true ||
        !['development', 'qa', 'production'].includes(effective.environment)) {
        return Object.freeze({ enabled: false, endpoint: null });
    }
    try {
        const endpoint = new URL(effective.endpoint);
        if (endpoint.protocol !== 'https:') throw new Error('insecure');
        return Object.freeze({
            enabled: true,
            endpoint: endpoint.toString().replace(/\/$/, ''),
            qaAdmissionRequired: effective.environment === 'qa',
            admissionMode: effective.environment === 'production' ? 'production' : 'qa'
        });
    } catch (_) {
        return Object.freeze({ enabled: false, endpoint: null });
    }
}

export function membershipPresentation(membership) {
    if (!membership) return MEMBERSHIP_STATES.unset;
    if (membership.deletedAt != null || ['deleting', 'deleted'].includes(membership.state)) {
        return MEMBERSHIP_STATES.deleting;
    }
    if (['pending', 'prepared'].includes(membership.state)) return MEMBERSHIP_STATES.prepared;
    if (membership.state !== 'active') return MEMBERSHIP_STATES.attention;
    if (membership.dataset?.state === 'ready') return MEMBERSHIP_STATES.synced;
    if (!membership.dataset || ['initializing', 'migrating', 'empty'].includes(membership.dataset.state)) {
        return MEMBERSHIP_STATES.initial;
    }
    return MEMBERSHIP_STATES.attention;
}

function safeCount(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeApp(app, membership) {
    const status = membershipPresentation(membership);
    const activeAppDeviceCount = safeCount(membership?.activeAppDeviceCount);
    return Object.freeze({
        id: app.id,
        name: app.name,
        status: status.key,
        statusLabel: status.label,
        action: status.action,
        recordCount: safeCount(membership?.dataset?.recordCount),
        schemaVersion: safeCount(membership?.dataset?.schemaVersion),
        activeAppDeviceCount,
        // This does not change four-app progress: it represents a second
        // browser/PWA/container for an already ready app dataset.
        canAddEnvironment: status.key === 'synced' && (activeAppDeviceCount || 0) > 0
    });
}

export function normalizeSyncCenterSummary(summary, devicesResponse = null) {
    const account = summary?.account;
    if (!account || typeof account !== 'object') throw new Error('account_summary_invalid');
    const rawMemberships = Array.isArray(summary.memberships) ? summary.memberships : [];
    const byApp = new Map(rawMemberships
        .filter((item) => item && typeof item.appId === 'string')
        .map((item) => [item.appId, item]));
    const apps = Object.freeze(SYNC_CENTER_APPS.map((app) => normalizeApp(app, byApp.get(app.id))));
    const deleting = account.deletedAt != null || account.deleteRequestedAt != null ||
        ['deleting', 'deleted'].includes(account.state);
    const accountState = deleting ? 'deleting' : account.state === 'active' ? 'active' : 'attention';
    const rawDevices = Array.isArray(devicesResponse?.devices) ? devicesResponse.devices : [];
    const environments = Object.freeze(rawDevices.map((device) => Object.freeze({
        id: typeof device?.id === 'string' ? device.id : null,
        label: typeof device?.label === 'string' && device.label.trim() ? device.label.trim() : '名前のない環境',
        isCurrent: device?.isCurrent === true,
        state: device?.revokedAt == null ? 'active' : 'revoked',
        createdAt: safeCount(device?.createdAt),
        lastSeenAt: safeCount(device?.lastSeenAt),
        relatedApps: Object.freeze(Array.isArray(device?.relatedApps)
            ? device.relatedApps.filter((appId) => SYNC_CENTER_APPS.some((app) => app.id === appId))
            : [])
    })));
    return Object.freeze({
        kind: 'ready',
        accountState,
        accountLabel: accountState === 'active' ? 'Sound Cruise Sync 接続済み' :
            accountState === 'deleting' ? 'アカウント削除中' : 'アカウントの確認が必要です',
        accountDescription: accountState === 'active'
            ? '各Cruiseアプリのクラウド同期設定を確認できます。'
            : '安全のため、各Cruiseアプリから状態を確認してください。',
        recoveryVersion: safeCount(account.recoveryVersion),
        apps,
        readyCount: apps.filter((app) => app.status === 'synced').length,
        totalCount: SYNC_CENTER_APPS.length,
        environments
    });
}

export function createUnsetPresentation() {
    return Object.freeze({
        kind: 'unset',
        accountState: 'unset',
        accountLabel: 'Sound Cruise Syncは未設定です',
        accountDescription: '4つのProアプリをクラウド同期できます。',
        recoveryVersion: null,
        apps: Object.freeze(SYNC_CENTER_APPS.map((app) => normalizeApp(app, null))),
        readyCount: 0,
        totalCount: SYNC_CENTER_APPS.length,
        environments: Object.freeze([])
    });
}

export function createUnavailablePresentation(kind = 'error', previous = null) {
    const base = Array.isArray(previous?.apps) && previous.accountState !== 'unset' ? previous : Object.freeze({
        accountState: 'unknown', recoveryVersion: null, accountDescription: '',
        apps: Object.freeze(SYNC_CENTER_APPS.map((app) => Object.freeze({
            id: app.id, name: app.name, status: 'unknown', statusLabel: '確認できません',
            action: 'open', recordCount: null, schemaVersion: null
        }))),
        readyCount: 0, totalCount: SYNC_CENTER_APPS.length, environments: Object.freeze([])
    });
    return Object.freeze({
        ...base,
        kind,
        accountLabel: kind === 'offline' ? 'オフラインです' : '同期情報を確認できません'
    });
}

export function createSyncCenterController({
    config,
    accountRoot = globalThis.SoundCruiseSyncAccount,
    indexedDb = globalThis.indexedDB,
    online = () => globalThis.navigator?.onLine !== false,
    fetchImpl = globalThis.fetch?.bind(globalThis)
} = {}) {
    let lastPresentation = null;
    const effectiveConfig = config || readSyncCenterConfig();
    return Object.freeze({
        enabled: effectiveConfig.enabled === true,
        async load() {
            if (effectiveConfig.enabled !== true) return Object.freeze({ kind: 'disabled' });
            const storage = accountRoot?.storage;
            const Client = accountRoot?.AccountClient;
            if (!storage?.getAccount || typeof Client !== 'function') {
                lastPresentation = createUnavailablePresentation('error', lastPresentation);
                return lastPresentation;
            }
            let credential;
            try { credential = await storage.getAccount(indexedDb); } catch (_) {
                lastPresentation = createUnavailablePresentation('error', lastPresentation);
                return lastPresentation;
            }
            if (!credential?.accountCredential) {
                lastPresentation = createUnsetPresentation();
                return lastPresentation;
            }
            if (!online()) {
                lastPresentation = createUnavailablePresentation('offline', lastPresentation);
                return lastPresentation;
            }
            try {
                const client = new Client({
                    endpoint: effectiveConfig.endpoint,
                    fetchImpl,
                    storage,
                    core: accountRoot.core,
                    admissionMode: effectiveConfig.admissionMode || 'qa'
                });
                const [summary, devices] = await Promise.all([
                    client.summary(credential.accountCredential),
                    client.devices(credential.accountCredential)
                ]);
                lastPresentation = normalizeSyncCenterSummary(summary, devices);
            } catch (_) {
                lastPresentation = createUnavailablePresentation('error', lastPresentation);
            }
            return lastPresentation;
        },
        planFourAppSetup(presentation) {
            if (!presentation || ['error', 'offline'].includes(presentation.kind)) {
                return Object.freeze({ kind: 'unavailable', appIds: Object.freeze([]) });
            }
            const appIds = (presentation?.apps || [])
                .filter((app) => app.status !== 'synced' && app.status !== 'deleting')
                .map((app) => app.id);
            return Object.freeze({ kind: 'local-preview', appIds: Object.freeze(appIds) });
        }
    });
}
