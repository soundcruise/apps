export const CRUISE_PORT_APP_VERSION = '0.21.1';

let reloadInProgress = false;

export function buildReloadUrl(href, timestamp) {
    const url = new URL(href);
    url.searchParams.set('_r', String(timestamp));
    return url.toString();
}

export function applyVersionDisplay(root = globalThis.document) {
    root?.querySelectorAll?.('.port-app-version-display').forEach((display) => {
        display.textContent = `Ver ${CRUISE_PORT_APP_VERSION}`;
    });
}

export function reloadAppWithCacheBust({
    documentObject = globalThis.document,
    locationObject = globalThis.location,
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
        locationObject.replace(buildReloadUrl(locationObject.href, timestamp));
    } catch (_) {
        locationObject.reload();
    }
    return true;
}
