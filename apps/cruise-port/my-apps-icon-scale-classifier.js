import { isKnownMyAppsIconPreset } from './my-apps-icon-presets.js';

// Only Cruise Port-owned simple artwork participates in the temporary scale
// comparison. Uploaded and future external official images keep their size.
export function getMyAppHomeIconKind(item = null) {
    if (item?.iconId) return 'custom';
    return isKnownMyAppsIconPreset(item?.iconPresetKey) ? 'preset' : 'generic';
}
