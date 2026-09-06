const createKnownApp = ({ key, name, iosStoreId, androidPackage, iosHref, androidHref = null }) => Object.freeze({
    key,
    name,
    match: Object.freeze({
        iosStoreIds: Object.freeze([iosStoreId]),
        androidPackages: Object.freeze([androidPackage])
    }),
    launch: Object.freeze({
        ios: Object.freeze({ kind: 'https', href: iosHref }),
        android: androidHref ? Object.freeze({ kind: 'https', href: androidHref }) : null
    })
});

// Targets are limited to HTTPS Universal/App Links verified during the M3.2 audit.
export const MY_APPS_KNOWN_APPS = Object.freeze([
    createKnownApp({
        key: 'spotify',
        name: 'Spotify',
        iosStoreId: '324684580',
        androidPackage: 'com.spotify.music',
        iosHref: 'https://open.spotify.com/',
        androidHref: 'https://open.spotify.com/'
    }),
    createKnownApp({
        key: 'youtube',
        name: 'YouTube',
        iosStoreId: '544007664',
        androidPackage: 'com.google.android.youtube',
        iosHref: 'https://www.youtube.com/',
        androidHref: 'https://www.youtube.com/'
    }),
    createKnownApp({
        key: 'dropbox',
        name: 'Dropbox',
        iosStoreId: '327630330',
        androidPackage: 'com.dropbox.android',
        iosHref: 'https://www.dropbox.com/home',
        androidHref: 'https://www.dropbox.com/home'
    }),
    createKnownApp({
        key: 'notion',
        name: 'Notion',
        iosStoreId: '1232780281',
        androidPackage: 'notion.id',
        iosHref: 'https://www.notion.so/',
        androidHref: 'https://www.notion.so/'
    }),
    createKnownApp({
        key: 'chatgpt',
        name: 'ChatGPT',
        iosStoreId: '6448311069',
        androidPackage: 'com.openai.chatgpt',
        iosHref: 'https://chatgpt.com/#native'
    })
]);

const KNOWN_APPS_BY_KEY = new Map(MY_APPS_KNOWN_APPS.map((app) => [app.key, app]));
const KNOWN_APPS_BY_IOS_ID = new Map(
    MY_APPS_KNOWN_APPS.flatMap((app) => app.match.iosStoreIds.map((id) => [id, app]))
);
const KNOWN_APPS_BY_ANDROID_PACKAGE = new Map(
    MY_APPS_KNOWN_APPS.flatMap((app) => app.match.androidPackages.map((packageName) => [packageName, app]))
);

export function getKnownApp(appKey) {
    return typeof appKey === 'string' ? KNOWN_APPS_BY_KEY.get(appKey) || null : null;
}

export function findKnownAppByIosStoreId(storeId) {
    return typeof storeId === 'string' ? KNOWN_APPS_BY_IOS_ID.get(storeId) || null : null;
}

export function findKnownAppByAndroidPackage(packageName) {
    return typeof packageName === 'string'
        ? KNOWN_APPS_BY_ANDROID_PACKAGE.get(packageName) || null
        : null;
}

function parseHttpsUrl(value) {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value.trim());
        if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
        return url;
    } catch (_) {
        return null;
    }
}

export function parseIosAppStoreId(value) {
    const url = parseHttpsUrl(value);
    if (!url || url.hostname !== 'apps.apple.com') return null;
    const match = url.pathname.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?app\/(?:[^/]+\/)?id(\d{6,20})\/?$/i);
    return match?.[1] || null;
}

export function parseAndroidPlayPackage(value) {
    const url = parseHttpsUrl(value);
    if (!url || url.hostname !== 'play.google.com' || url.pathname !== '/store/apps/details') return null;
    const packageValues = url.searchParams.getAll('id');
    if (packageValues.length !== 1) return null;
    const packageName = packageValues[0];
    return /^[A-Za-z][A-Za-z\d_]*(?:\.[A-Za-z][A-Za-z\d_]*)+$/.test(packageName)
        ? packageName
        : null;
}

export function recognizeStoreUrl(value) {
    const iosStoreId = parseIosAppStoreId(value);
    if (iosStoreId) return { platform: 'ios', identifier: iosStoreId };
    const androidPackage = parseAndroidPlayPackage(value);
    if (androidPackage) return { platform: 'android', identifier: androidPackage };
    return null;
}

export function recognizeKnownAppUrl(value) {
    const store = recognizeStoreUrl(value);
    if (!store) return null;
    const app = store.platform === 'ios'
        ? findKnownAppByIosStoreId(store.identifier)
        : findKnownAppByAndroidPackage(store.identifier);
    return app ? { ...store, app } : null;
}

export function resolveKnownAppTarget(appKey, platform) {
    const app = getKnownApp(appKey);
    if (!app || !Object.hasOwn(app.launch, platform)) return null;
    return app.launch[platform]?.href || null;
}
