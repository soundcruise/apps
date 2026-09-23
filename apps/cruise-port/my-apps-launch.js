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
    if (/mac/i.test(clientPlatform) || /Macintosh|Mac OS X/i.test(userAgent) || /Mac/i.test(legacyPlatform)) return 'macos';
    if (/windows/i.test(clientPlatform) || /Windows/i.test(userAgent) || /Win/i.test(legacyPlatform)) return 'windows';
    return 'web';
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
    // `urls` is the platform authority; `url` is only the preserved v1-v6 fallback.
    // Deprecated launchMode/appKey/customLaunch never participate in routing.
    const urls = item?.urls || {};
    const target = ['ios', 'android', 'macos', 'windows'].includes(platform) ? urls[platform] : '';
    return target || urls.web || item?.url || '';
}
