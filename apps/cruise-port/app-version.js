export const CRUISE_PORT_APP_VERSION = '1.24.27';

let reloadInProgress = false;

export function buildReloadUrl(href, timestamp) {
    const url = new URL(href);
    url.hash = '';
    url.searchParams.set('_r', String(timestamp));
    return url.toString();
}

// Call once at document startup, never from the SPA route renderer.
export function normalizeInitialHome({ historyObject = globalThis.history, locationObject = globalThis.location } = {}) {
    if (!locationObject?.hash || locationObject.hash === '#sync-center' || locationObject.hash === '#news' || locationObject.hash.startsWith('#news/')) return;
    historyObject.replaceState(historyObject.state, '', `${locationObject.pathname}${locationObject.search}`);
}

export function applyVersionDisplay(root = globalThis.document) {
    root?.querySelectorAll?.('.port-app-version-display').forEach((display) => {
        display.textContent = `Ver ${CRUISE_PORT_APP_VERSION}`;
    });
}

export function reloadAppWithCacheBust({
    documentObject = globalThis.document,
    locationObject = globalThis.location,
    preserveRoute = false,
    timestamp = Date.now()
} = {}) {
    if (reloadInProgress || !locationObject) return false;
    reloadInProgress = true;
    documentObject?.querySelectorAll?.('.port-refresh-app').forEach((button) => {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = '更新中…';
    });
    try {
        const next = new URL(buildReloadUrl(locationObject.href, timestamp));
        if (preserveRoute) next.hash = new URL(locationObject.href).hash;
        locationObject.replace(next.href);
    } catch (_) {
        locationObject.reload();
    }
    return true;
}
