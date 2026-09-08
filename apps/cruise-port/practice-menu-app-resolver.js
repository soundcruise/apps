import { APP_DEFINITIONS, MY_APP_PREFIX } from './practice-menu-store.js?v=3.0.1';
import { resolveMyAppHref } from './my-apps-launch.js?v=1.3.0';

export const PRACTICE_APP_STATUS = Object.freeze({
    none: 'none',
    resolved: 'resolved',
    missing: 'missing',
    storeUnavailable: 'store-unavailable',
    unsupported: 'unsupported'
});

const BUILTIN_GROUPS = Object.freeze([
    Object.freeze({ label: 'クルーズアプリ', appIds: Object.freeze(['pitch', 'fretboard', 'rhythm', 'chord']) }),
    Object.freeze({ label: 'ツール', appIds: Object.freeze(['metronome', 'tuner']) })
]);

function resolvedModel(appId, kind, label, href) {
    return {
        appId,
        kind,
        label,
        href,
        launchable: Boolean(href),
        status: PRACTICE_APP_STATUS.resolved
    };
}

export function getMyAppIdFromPracticeAppId(appId) {
    if (typeof appId !== 'string' || !appId.startsWith(MY_APP_PREFIX)) return null;
    const myAppId = appId.slice(MY_APP_PREFIX.length);
    return myAppId || null;
}

export function createMyAppPracticeAppId(myAppId) {
    return `${MY_APP_PREFIX}${myAppId}`;
}

export function resolvePracticeMenuApp(appId, {
    myApps = [],
    myAppsReady = false,
    platform = 'unknown'
} = {}) {
    if (appId === null) {
        return {
            appId: null,
            kind: 'none',
            label: '使用アプリなし',
            href: null,
            launchable: false,
            status: PRACTICE_APP_STATUS.none
        };
    }
    const builtin = Object.hasOwn(APP_DEFINITIONS, appId) ? APP_DEFINITIONS[appId] : null;
    if (builtin) return resolvedModel(appId, 'builtin', builtin.name, builtin.href);

    const myAppId = getMyAppIdFromPracticeAppId(appId);
    if (myAppId) {
        if (!myAppsReady) {
            return {
                appId,
                kind: 'myapp',
                label: '使用アプリを読み込めません',
                href: null,
                launchable: false,
                status: PRACTICE_APP_STATUS.storeUnavailable
            };
        }
        const item = myApps.find((candidate) => candidate.id === myAppId);
        if (!item) {
            return {
                appId,
                kind: 'myapp',
                label: '削除済みのMy App',
                href: null,
                launchable: false,
                status: PRACTICE_APP_STATUS.missing
            };
        }
        return resolvedModel(appId, 'myapp', item.name, resolveMyAppHref(item, platform));
    }

    return {
        appId,
        kind: 'unknown',
        label: '未対応のアプリ',
        href: null,
        launchable: false,
        status: PRACTICE_APP_STATUS.unsupported
    };
}

function truncate(value, maxLength) {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function safeHostname(url) {
    try {
        return new URL(url).hostname || '登録URL';
    } catch (_) {
        return '登録URL';
    }
}

export function createPracticeAppOptionGroups(myApps = []) {
    const groups = BUILTIN_GROUPS.map((group) => ({
        label: group.label,
        options: group.appIds.map((appId) => ({ value: appId, label: APP_DEFINITIONS[appId].name }))
    }));
    if (myApps.length === 0) return groups;

    const nameCounts = new Map();
    myApps.forEach((item) => nameCounts.set(item.name, (nameCounts.get(item.name) || 0) + 1));
    const labelCounts = new Map();
    const options = myApps.map((item) => {
        let label = item.name;
        if (nameCounts.get(item.name) > 1) {
            label = `${truncate(item.name, 60)} — ${truncate(safeHostname(item.url), 32)}`;
            const duplicateNumber = (labelCounts.get(label) || 0) + 1;
            labelCounts.set(label, duplicateNumber);
            if (duplicateNumber > 1) label = `${label} (${duplicateNumber})`;
        }
        return { value: createMyAppPracticeAppId(item.id), label };
    });
    groups.push({ label: 'My Apps', options });
    return groups;
}

export function isSelectablePracticeAppId(appId, { myApps = [], myAppsReady = false } = {}) {
    if (Object.hasOwn(APP_DEFINITIONS, appId)) return true;
    const myAppId = getMyAppIdFromPracticeAppId(appId);
    return Boolean(myAppsReady && myAppId && myApps.some((item) => item.id === myAppId));
}

export function countPracticeMenuReferences(practiceMenus, myAppId) {
    const appId = createMyAppPracticeAppId(myAppId);
    return practiceMenus.reduce((count, item) => count + (item.appId === appId ? 1 : 0), 0);
}
