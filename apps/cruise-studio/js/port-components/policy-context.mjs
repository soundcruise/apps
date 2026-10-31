/* Document-scoped policy injection. Only the component owner installs a boundary result. */
let admitted = null;
const denied = Object.freeze({ tunerCapo:false, cloudSyncOperations:false, metronomeAdvanced:false,
    metronomePresetWrite:false, practiceMenuCreateLimit:0, practiceFileWrite:false,
    myAppsCreateLimit:0, customMyAppIconWrite:false, gearPhotoWrite:false,
    calendarMemo:false, settings:false, directLaunch:false });
export function installPermission(permission) {
    if (!permission?.ok || !permission.capabilities) throw Error('Component permission required');
    admitted = permission.capabilities;
}
export function revokePermission() { admitted = null; }
export function getCapabilities(edition) {
    return admitted || denied;
}
export function isProAccessReady() { return admitted !== null; }
export function getEdition() { return admitted ? 'pro' : 'standard'; }
export function isProEdition() { return getEdition() === 'pro'; }
export function isStandardEdition() { return !isProEdition(); }
export function applyEditionDisplay(doc = document) {
    doc.documentElement.dataset.edition = getEdition();
    const badge = doc.getElementById('home-pro-badge'); if (badge) badge.hidden = !admitted;
}
export const CRUISE_PORT_ROOT = '/apps/cruise-port/';
export const PRO_ENTRY_PATH = '/apps/cruise-port/pro_9a3943176561/';
