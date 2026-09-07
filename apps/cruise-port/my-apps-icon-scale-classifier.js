import { isKnownMyAppsIconPreset } from './my-apps-icon-presets.js';

// Only Cruise Port-owned simple artwork uses the formal Simple icon scale.
// Uploaded and future external official images keep their original size.
export function getMyAppHomeIconKind(item = null) {
    if (item?.iconId) return 'custom';
    return isKnownMyAppsIconPreset(item?.iconPresetKey) ? 'preset' : 'generic';
}
