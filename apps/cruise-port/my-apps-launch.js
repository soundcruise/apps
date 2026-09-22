import { getKnownApp, resolveKnownAppTarget } from './my-apps-known-apps.js?v=1.3.0';

export function detectMyAppsPlatform(navigatorObject = globalThis.navigator) {
    const clientPlatform = navigatorObject?.userAgentData?.platform?.toLowerCase() || '';
    const userAgent = navigatorObject?.userAgent || '';
    const legacyPlatform = navigatorObject?.platform || '';

    if (clientPlatform === 'android' || /Android/i.test(userAgent)) return 'android';
    if (
        /iPhone|iPad|iPod/i.test(userAgent)
        || /iPhone|iPad|iPod/i.test(clientPlatform)
        || (legacyPlatform === 'MacIntel' && navigatorObject?.maxTouchPoints > 1)
    ) {
        return 'ios';
    }
    if (clientPlatform || /Macintosh|Windows|Linux|CrOS/i.test(userAgent)) return 'desktop';
    return 'unknown';
}

export function resolveVerifiedAndroidTarget(target) {
    if (target?.kind !== 'https' || target.verified !== true || typeof target.href !== 'string') return null;
    try {
        const url = new URL(target.href);
        if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port) return null;
        return target.href;
    } catch (_) {
        return null;
    }
}

export function canUseKnownAppDirectLaunch(appKey, platform) {
    const app = getKnownApp(appKey);
    if (!app) return false;
    if (platform === 'ios') return Boolean(resolveKnownAppTarget(appKey, 'ios'));
    if (platform === 'android') return Boolean(resolveVerifiedAndroidTarget(app.launch.android));
    return false;
}

export function getKnownLaunchUiMode(appKey, platform) {
    if (!getKnownApp(appKey)) return 'hidden';
    if (platform === 'android' && !canUseKnownAppDirectLaunch(appKey, platform)) return 'fallback';
    return 'direct';
}

export function resolveMyAppHref(item, platform) {
    // Keep legacy launch metadata in storage, but always honor the user's saved URL.
    return item?.url || '';
}
