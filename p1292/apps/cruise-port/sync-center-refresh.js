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
    let returnWake = null;
    const schedule = windowObject.setTimeout?.bind(windowObject) || globalThis.setTimeout;
    const cancel = windowObject.clearTimeout?.bind(windowObject) || globalThis.clearTimeout;
    let leftPort = false;
    let disposed = false;
    const removals = [];
    function listen(target, type, listener) { target?.addEventListener?.(type, listener); removals.push(() => target?.removeEventListener?.(type, listener)); }

    function trigger(fromWake = false) {
        if (disposed || inFlight || !isVisible()) return false;
        const remaining = minIntervalMs - (now() - lastRefreshAt);
        if (remaining > 0) {
            // Keep the existing rate limit, but do not drop a quick online/PWA return.
            if (fromWake !== true && returnWake === null) returnWake = schedule(() => { returnWake = null; trigger(true); }, remaining);
            return false;
        }
        if (returnWake !== null) { cancel(returnWake); returnWake = null; }
        lastRefreshAt = now();
        inFlight = Promise.resolve().then(() => { if (!disposed) return refresh(); }).catch(() => {}).finally(() => { inFlight = null; });
        return true;
    }

    listen(documentObject, 'visibilitychange', () => {
        if (documentObject.visibilityState === 'hidden') leftPort = true;
        else if (leftPort) { leftPort = false; trigger(); }
    });
    listen(windowObject, 'blur', () => { leftPort = true; });
    listen(windowObject, 'focus', () => {
        if (!leftPort) return;
        leftPort = false;
        trigger();
    });
    listen(windowObject, 'pageshow', (event) => { if (event?.persisted) trigger(); });
    listen(windowObject, 'online', trigger);

    return Object.freeze({
        trigger,
        dispose() { if (disposed) return; disposed = true; if (returnWake !== null) cancel(returnWake); returnWake = null; for (const remove of removals.splice(0)) remove(); },
        // An explicit open/recheck counts as the latest check, so returning right after it does not repeat it.
        noteRefreshed() { lastRefreshAt = now(); }
    });
}

// A summary/devices mismatch usually means the two responses straddled an update. The first one
// seen during a Sync Center visit is fetched again once, automatically; after that the row shows
// 「再確認が必要」 and waits for the user's recheck. No loop, no polling.
export function createSnapshotMismatchRetry() {
    let used = false;
    return Object.freeze({
        shouldRetry(presentation) {
            if (used || presentation?.kind !== 'ready' ||
                !presentation.apps?.some((app) => app.snapshot === 'mismatch')) return false;
            used = true;
            return true;
        },
        // A new visit to Sync Center allows one automatic retry again.
        reset() { used = false; }
    });
}
