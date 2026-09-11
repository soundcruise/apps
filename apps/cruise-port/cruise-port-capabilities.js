import { getEdition } from './cruise-port-edition.js?v=0.27.0';
import { MY_APPS_LIMITS } from './my-apps-store.js?v=0.24.0';

// Creation/write policy only. Never pass product limits into store validation.
// SP1 defines policy; feature-specific enforcement follows in SP3–SP5.
const STANDARD = Object.freeze({
    tunerCapo: false,
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

export function getCapabilities(edition = getEdition()) {
    return edition === 'pro' ? PRO : STANDARD;
}
