import { getEdition } from './cruise-port-edition.js?v=0.27.0';
import { MY_APPS_LIMITS } from './my-apps-store.js?v=0.59.3';

// Creation/write policy only. Never pass product limits into store validation.
// SP1 defines policy; feature-specific enforcement follows in SP3–SP5.
const STANDARD = Object.freeze({
    tunerCapo: false,
    cloudSyncOperations: false,
    metronomeAdvanced: false,
    metronomePresetWrite: false,
    practiceMenuCreateLimit: 5,
    practiceFileWrite: false,
    myAppsCreateLimit: 5,
    customMyAppIconWrite: false,
    gearPhotoWrite: false,
    calendarMemo: true,
    settings: true,
    directLaunch: true
});
const PRO = Object.freeze({
    ...STANDARD,
    tunerCapo: true,
    cloudSyncOperations: true,
    metronomeAdvanced: true,
    metronomePresetWrite: true,
    // Practice currently has no technical item-count cap. Infinity is runtime
    // policy only: it is never serialized or used to rewrite saved data.
    practiceMenuCreateLimit: Infinity,
    practiceFileWrite: true,
    myAppsCreateLimit: MY_APPS_LIMITS.items,
    customMyAppIconWrite: true,
    gearPhotoWrite: true
});

// The shared gate is the UI access authority. Do not trust pathname, stored
// user data or a saved edition flag as proof that the gate has unlocked.
export function isProAccessReady(globalObject = globalThis) {
    const documentObject = globalObject.document;
    return Boolean(globalObject.__SOUNDCRUISE_PRO_GATE__
        && typeof globalObject.__soundCruiseClearGate === 'function'
        && documentObject?.body
        && !documentObject.body.classList.contains('pro-gate-active')
        && !documentObject.getElementById('pro-gate-overlay'));
}
// Live getters also revoke capabilities immediately while the reset gate is
// visible. Explicit edition arguments below are pure policy projections for
// tests/catalogs; write paths always use the guarded default.
const GUARDED_PRO = Object.freeze(Object.defineProperties({}, Object.fromEntries(
    Object.keys(PRO).map(key => [key, { enumerable: true, get: () => isProAccessReady() ? PRO[key] : STANDARD[key] }])
)));
export function getCapabilities(edition) {
    if (arguments.length) return edition === 'pro' ? PRO : STANDARD;
    return getEdition() === 'pro' ? GUARDED_PRO : STANDARD;
}
