import { detectMyAppsPlatform, resolveMyAppHref } from '../../../../cruise-port/my-apps-launch.js?v=1.3.0';

// Port owns platform precedence. Studio only rejects unsafe saved targets; it
// never guesses another target when the selected platform value is invalid.
export function resolveLibraryLaunch(item, navigatorObject = globalThis.navigator) {
    const platform = detectMyAppsPlatform(navigatorObject);
    const href = resolveMyAppHref(item?.launch, platform);
    try {
        const url = new URL(href);
        if (typeof href !== 'string' || href.length > 2048 || /[\u0000-\u0020\u007f]/.test(href) || url.protocol !== 'https:' || !url.hostname || url.username || url.password) return { ok: false, platform };
        return { ok: true, platform, href: url.href };
    } catch { return { ok: false, platform }; }
}

// Called synchronously by the trusted click/keyboard handler, after rechecking
// the current Host projection. noopener gives the destination no Studio handle.
export function launchLibraryApp(item, { navigatorObject = globalThis.navigator, windowObject = globalThis.window } = {}) {
    const target = resolveLibraryLaunch(item, navigatorObject);
    if (!target.ok) return { ok: false, reason: 'invalid-url' };
    // With noopener browsers may return null even on success. Do not report
    // null as a popup blocker or retry without the isolation flags.
    try { windowObject.open(target.href, '_blank', 'noopener,noreferrer'); return { ok: true }; }
    catch { return { ok: false, reason: 'blocked' }; }
}
