// SP1 compatibility only: switch this to 'standard' after Standard gating QA.
export const ROOT_COMPATIBILITY_EDITION = 'pro';
export const CRUISE_PORT_ROOT = '/apps/cruise-port/';
export const PRO_ENTRY_PATH = `${CRUISE_PORT_ROOT}pro_9a3943176561/`;

// Edition is presentation/product policy, NOT proof of Pro authentication.
// Never derive it from saved user data or a query parameter.
export function getEdition(pathname = globalThis.location?.pathname) {
    if (pathname === PRO_ENTRY_PATH || pathname === `${PRO_ENTRY_PATH}index.html`) return 'pro';
    if (pathname === CRUISE_PORT_ROOT || pathname === `${CRUISE_PORT_ROOT}index.html`) return ROOT_COMPATIBILITY_EDITION;
    return 'standard';
}

export function isProEdition(pathname) { return getEdition(pathname) === 'pro'; }
export function isStandardEdition(pathname) { return getEdition(pathname) === 'standard'; }

export function applyEditionDisplay(documentObject = document, edition = getEdition()) {
    documentObject.documentElement.dataset.edition = edition === 'pro' ? 'pro' : 'standard';
    const badge = documentObject.getElementById('home-pro-badge');
    if (badge) badge.hidden = edition !== 'pro';
}
