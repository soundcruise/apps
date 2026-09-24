// Re-checks the visible Sync Center when the user comes back to Port (after opening an app,
// switching apps, back/forward cache, or reconnecting). One check at a time and never faster
// than minIntervalMs: explicit return events only, no polling.
export function bindSyncCenterReturnRefresh({
    isVisible,
    refresh,
    documentObject = globalThis.document,
    windowObject = globalThis,
    now = () => Date.now(),
    minIntervalMs = 3000
}) {
    let lastRefreshAt = -Infinity;
    let inFlight = null;
    let leftPort = false;

    function trigger() {
        if (inFlight || !isVisible() || now() - lastRefreshAt < minIntervalMs) return false;
        lastRefreshAt = now();
        inFlight = Promise.resolve().then(refresh).catch(() => {}).finally(() => { inFlight = null; });
        return true;
    }

    documentObject?.addEventListener?.('visibilitychange', () => {
        if (documentObject.visibilityState === 'hidden') leftPort = true;
        else if (leftPort) { leftPort = false; trigger(); }
    });
    windowObject?.addEventListener?.('blur', () => { leftPort = true; });
    windowObject?.addEventListener?.('focus', () => {
        if (!leftPort) return;
        leftPort = false;
        trigger();
    });
    windowObject?.addEventListener?.('pageshow', (event) => { if (event?.persisted) trigger(); });
    windowObject?.addEventListener?.('online', trigger);

    return Object.freeze({
        trigger,
        // An explicit open/recheck counts as the latest check, so returning right after it does not repeat it.
        noteRefreshed() { lastRefreshAt = now(); }
    });
}
