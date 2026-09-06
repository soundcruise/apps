import { getKnownApp, resolveKnownAppTarget } from './my-apps-known-apps.js?v=1.0.0';

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

export function resolveMyAppHref(item, platform) {
    if (
        !item
        || item.launchMode !== 'known-app'
        || !getKnownApp(item.appKey)
    ) {
        return item?.url || '';
    }

    if (platform === 'ios') {
        return resolveKnownAppTarget(item.appKey, 'ios') || item.url;
    }

    // Android registry data is present, but direct launch remains disabled until M3.2-B device verification.
    return item.url;
}
