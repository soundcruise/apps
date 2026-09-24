export const SYNC_CENTER_ROUTE = '#sync-center';

export const SYNC_CENTER_APPS = Object.freeze([
    Object.freeze({ id: 'pitch', name: '音感クルーズ' }),
    Object.freeze({ id: 'fretboard', name: '指板クルーズ' }),
    Object.freeze({ id: 'rhythm', name: 'リズムクルーズ' }),
    Object.freeze({ id: 'chord', name: 'コードクルーズ' })
]);

const MEMBERSHIP_STATES = Object.freeze({
    unset: Object.freeze({ key: 'unset', label: '未設定', action: 'setup' }),
    prepared: Object.freeze({ key: 'prepared', label: '準備済み', action: 'open' }),
    detached: Object.freeze({ key: 'detached', label: '未接続', action: 'setup' }),
    connecting: Object.freeze({ key: 'connecting', label: '接続中', action: 'open' }),
    initial: Object.freeze({ key: 'initial', label: '初回同期が必要', action: 'open' }),
    synced: Object.freeze({ key: 'synced', label: '同期済み', action: 'open' }),
    attention: Object.freeze({ key: 'attention', label: '確認が必要', action: 'open' }),
    deleting: Object.freeze({ key: 'deleting', label: '削除中', action: 'none' })
});
const ACCOUNT_TERMINAL_CODES = new Set(['account_deleting', 'account_deleted', 'account_device_revoked']);

const APP_STATUS_PRESENTATIONS = Object.freeze({
    synced: Object.freeze({ state: 'synced', label: '✓ 同期済み' }),
    syncing: Object.freeze({ state: 'syncing', label: '同期中' }),
    attention: Object.freeze({ state: 'attention', label: '確認が必要' }),
    detached: Object.freeze({ state: 'detached', label: '未接続' }),
    connecting: Object.freeze({ state: 'connecting', label: '接続中' }),
    deleting: Object.freeze({ state: 'deleting', label: '削除中' }),
    offline: Object.freeze({ state: 'offline', label: 'オフライン' })
});

// This is presentation-only.  The membership status and removal-safety
// authority below continue to drive every existing operation and callback.
export function appSyncStatusPresentation(app, unavailableKind = 'ready') {
    if (unavailableKind === 'offline') return APP_STATUS_PRESENTATIONS.offline;
    if (unavailableKind === 'error') return APP_STATUS_PRESENTATIONS.attention;
    if (!app || typeof app !== 'object') return APP_STATUS_PRESENTATIONS.attention;
    if (app.status === 'deleting') return APP_STATUS_PRESENTATIONS.deleting;
    if (app.status === 'connecting') return APP_STATUS_PRESENTATIONS.connecting;
    if (app.status === 'initial') return APP_STATUS_PRESENTATIONS.syncing;
    if (['unset', 'prepared', 'detached'].includes(app.status)) return APP_STATUS_PRESENTATIONS.detached;
    if (app.status === 'synced' && app.removalSafety === 'safe') return APP_STATUS_PRESENTATIONS.synced;
    return APP_STATUS_PRESENTATIONS.attention;
}

// Explains a "確認が必要" row from what the Account summary actually reports. It never
// upgrades a status: every reason keeps the row in attention until the server says otherwise.
export function explainAppAttention(app, unavailableKind = 'ready') {
    if (unavailableKind === 'error') {
        return Object.freeze({ reason: 'unavailable', title: '最新の状態を確認できませんでした',
            body: '同期データの異常ではありません。通信状態を確認して、もう一度確認してください。', action: 'recheck' });
    }
    if (!app || typeof app !== 'object' || app.status !== 'synced') {
        return Object.freeze({ reason: 'unknown', title: '同期の状態を確認できません',
            body: 'もう一度確認しても解消しない場合は、このアプリを開いてください。', action: 'recheck' });
    }
    if (Number(app.attentionCount) > 0) {
        return Object.freeze({ reason: 'conflict', title: `同期する内容の確認が${app.attentionCount}件あります`,
            body: 'アプリを開いて、どちらの内容を残すか選んでください。', action: 'open' });
    }
    if (app.removalSafety === 'attention') {
        return Object.freeze({ reason: 'app_error', title: 'アプリ側で同期が止まっています',
            body: 'アプリを開くと、原因の確認と同期のやり直しができます。', action: 'open' });
    }
    const devices = Number(app.activeAppDeviceCount || 0);
    return Object.freeze({ reason: 'not_confirmed', title: '最新の同期完了をまだ確認できていません',
        body: devices > 1
            ? 'このアプリを一度開くと、同期状態が更新されます。複数の端末やブラウザで使っている場合は、それぞれで一度開いてください。'
            : 'このアプリを一度開くと、同期状態が更新されます。',
        action: 'open' });
}

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

function isAppDeleteGrace(membership, accountDeleting, now = Date.now()) {
    return membership?.state === 'deleting' && !accountDeleting &&
        membership.deletedAt == null && safeCount(membership.deleteRequestedAt) != null &&
        safeCount(membership.purgeAfter) != null && membership.purgeAfter > now;
}

export function membershipPresentation(membership, { accountDeleting = true, now = Date.now() } = {}) {
    if (!membership) return MEMBERSHIP_STATES.unset;
    if (isAppDeleteGrace(membership, accountDeleting, now)) {
        return MEMBERSHIP_STATES.detached;
    }
    if (membership.deletedAt != null || ['deleting', 'deleted'].includes(membership.state)) {
        return MEMBERSHIP_STATES.deleting;
    }
    const activeDevices = safeCount(membership.activeAppDeviceCount);
    if (['pending', 'prepared'].includes(membership.state)) {
        return activeDevices === 0 ? MEMBERSHIP_STATES.detached
            : activeDevices > 0 ? MEMBERSHIP_STATES.connecting : MEMBERSHIP_STATES.prepared;
    }
    if (membership.state !== 'active') return MEMBERSHIP_STATES.attention;
    if (membership.dataset?.state === 'ready' && activeDevices === 0) {
        return MEMBERSHIP_STATES.detached;
    }
    if (membership.dataset?.state === 'ready') return MEMBERSHIP_STATES.synced;
    if (activeDevices > 0 && (!membership.dataset ||
        ['initializing', 'migrating', 'empty'].includes(membership.dataset.state))) {
        return MEMBERSHIP_STATES.connecting;
    }
    if (!membership.dataset || ['initializing', 'migrating', 'empty'].includes(membership.dataset.state)) {
        return MEMBERSHIP_STATES.initial;
    }
    return MEMBERSHIP_STATES.attention;
}

function safeCount(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeApp(app, membership, appEnvironments = [], accountDeleting = false, now = Date.now()) {
    const status = membershipPresentation(membership, { accountDeleting, now });
    const activeAppDeviceCount = safeCount(membership?.activeAppDeviceCount);
    const deleteGrace = isAppDeleteGrace(membership, accountDeleting, now);
    const safety = status.key === 'synced' && membership?.removalSafety === 'safe' ? 'safe'
        : membership?.removalSafety === 'attention' ? 'attention' : 'unknown';
    const result = {
        id: app.id,
        name: app.name,
        status: status.key,
        statusLabel: status.label,
        action: status.action,
        recordCount: safeCount(membership?.dataset?.recordCount),
        attentionCount: safeCount(membership?.attentionConflictCount) || 0,
        schemaVersion: safeCount(membership?.dataset?.schemaVersion),
        activeAppDeviceCount,
        deleteGrace,
        removalSafety: safety,
        removalSafetyLabel: safety === 'safe' ? '同期完了'
            : safety === 'attention' ? '確認が必要' : '同期を確認してください',
        environments: Object.freeze(appEnvironments),
        // This does not change four-app progress: it represents a second
        // browser/PWA/container for an already ready app dataset.
        canAddEnvironment: status.key === 'synced' && (activeAppDeviceCount || 0) > 0
    };
    return Object.freeze({ ...result, presentationStatus: appSyncStatusPresentation(result) });
}

export function normalizeSyncCenterSummary(summary, devicesResponse = null,
    formatAccountDisplayId = globalThis.SoundCruiseSyncAccount?.core?.formatAccountDisplayId) {
    const account = summary?.account;
    if (!account || typeof account !== 'object') throw new Error('account_summary_invalid');
    const rawMemberships = Array.isArray(summary.memberships) ? summary.memberships : [];
    const byApp = new Map(rawMemberships
        .filter((item) => item && typeof item.appId === 'string')
        .map((item) => [item.appId, item]));
    const deleting = account.deletedAt != null || account.deleteRequestedAt != null ||
        ['deleting', 'deleted'].includes(account.state);
    const accountState = deleting ? 'deleting' : account.state === 'active' ? 'active' : 'attention';
    const now = Date.now();
    const rawDevices = Array.isArray(devicesResponse?.devices) ? devicesResponse.devices : [];
    const environments = Object.freeze(rawDevices.map((device) => Object.freeze({
        id: typeof device?.id === 'string' ? device.id : null,
        label: typeof device?.label === 'string' && device.label.trim() ? device.label.trim() : '名前のない環境',
        isCurrent: device?.isCurrent === true,
        isPortEnvironment: device?.isPortEnvironment === true,
        state: device?.revokedAt == null ? 'active' : 'revoked',
        createdAt: safeCount(device?.createdAt),
        lastSeenAt: safeCount(device?.lastSeenAt),
        relatedApps: Object.freeze(Array.isArray(device?.relatedApps)
            ? device.relatedApps.filter((appId) => SYNC_CENTER_APPS.some((app) => app.id === appId))
            : [])
    })));
    const rawAppDevices = Array.isArray(devicesResponse?.appDevices) ? devicesResponse.appDevices : [];
    const appEnvironments = rawAppDevices.filter((device) => device?.revokedAt == null &&
        SYNC_CENTER_APPS.some((app) => app.id === device?.appId)).map((device) => Object.freeze({
        id: typeof device?.id === 'string' ? device.id : null,
        appId: device.appId,
        label: typeof device?.label === 'string' && device.label.trim()
            ? device.label.trim() : '名前のない環境',
        isCurrent: device?.isCurrent === true,
        state: 'active',
        createdAt: safeCount(device?.createdAt),
        lastSeenAt: safeCount(device?.lastSeenAt)
    }));
    const apps = Object.freeze(SYNC_CENTER_APPS.map((app) => normalizeApp(
        app, byApp.get(app.id), appEnvironments.filter((environment) => environment.appId === app.id),
        deleting, now
    )));
    return Object.freeze({
        kind: 'ready',
        accountState,
        accountLabel: accountState === 'active' ? '作成済み' :
            accountState === 'deleting' ? '削除中' : '確認が必要',
        accountDisplayId: accountState === 'active' && typeof formatAccountDisplayId === 'function'
            ? formatAccountDisplayId(account.id) : null,
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
        accountLabel: '未作成',
        accountDisplayId: null,
        recoveryVersion: null,
        apps: Object.freeze(SYNC_CENTER_APPS.map((app) => normalizeApp(app, null))),
        readyCount: 0,
        totalCount: SYNC_CENTER_APPS.length,
        environments: Object.freeze([])
    });
}

export function createUnavailablePresentation(kind = 'error', previous = null) {
    const base = Array.isArray(previous?.apps) && previous.accountState !== 'unset' ? previous : Object.freeze({
        accountState: 'unknown', recoveryVersion: null,
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
                lastPresentation = normalizeSyncCenterSummary(
                    summary, devices, accountRoot.core?.formatAccountDisplayId
                );
            } catch (error) {
                if (ACCOUNT_TERMINAL_CODES.has(error?.code) && typeof storage.clearAccount === 'function') {
                    try {
                        await storage.clearAccount(indexedDb);
                        lastPresentation = createUnsetPresentation();
                        return lastPresentation;
                    } catch (_) { /* retain fail-closed unavailable presentation */ }
                }
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
