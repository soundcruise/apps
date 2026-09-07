// Temporary U1.4 pre-release comparison state. Remove this module when the
// selected two-group icon sizes are made permanent in the following phase.
export const LEGACY_ICON_SCALE_PREVIEW_STORAGE_KEY = 'cruisePort.iconScalePreview';
export const CRUISE_ICON_SCALE_PREVIEW_STORAGE_KEY = 'cruisePort.cruiseIconScalePreview';
export const SIMPLE_ICON_SCALE_PREVIEW_STORAGE_KEY = 'cruisePort.simpleIconScalePreview';
export const ICON_SCALE_PREVIEW_VALUES = Object.freeze(['100', '90', '80', '70', '60', '50']);
export const DEFAULT_ICON_SCALE_PREVIEW = '100';

export function normalizeIconScalePreview(value) {
    return ICON_SCALE_PREVIEW_VALUES.includes(value) ? value : DEFAULT_ICON_SCALE_PREVIEW;
}

function isAllowedIconScalePreview(value) {
    return ICON_SCALE_PREVIEW_VALUES.includes(value);
}

export function loadIconScalePreviews(storage = globalThis.localStorage) {
    try {
        const storedCruise = storage?.getItem(CRUISE_ICON_SCALE_PREVIEW_STORAGE_KEY);
        const storedSimple = storage?.getItem(SIMPLE_ICON_SCALE_PREVIEW_STORAGE_KEY);
        const legacySimple = storage?.getItem(LEGACY_ICON_SCALE_PREVIEW_STORAGE_KEY);
        const shouldMigrateLegacySimple = !isAllowedIconScalePreview(storedSimple)
            && isAllowedIconScalePreview(legacySimple);
        const previews = {
            cruise: normalizeIconScalePreview(storedCruise),
            simple: shouldMigrateLegacySimple
                ? legacySimple
                : normalizeIconScalePreview(storedSimple)
        };

        if (shouldMigrateLegacySimple) storage?.setItem(SIMPLE_ICON_SCALE_PREVIEW_STORAGE_KEY, previews.simple);
        if (legacySimple !== null) storage?.removeItem(LEGACY_ICON_SCALE_PREVIEW_STORAGE_KEY);
        return {
            ok: true,
            previews,
            migratedLegacySimple: shouldMigrateLegacySimple
        };
    } catch (_) {
        return {
            ok: false,
            previews: { cruise: DEFAULT_ICON_SCALE_PREVIEW, simple: DEFAULT_ICON_SCALE_PREVIEW },
            migratedLegacySimple: false
        };
    }
}

export function saveIconScalePreview(group, value, storage = globalThis.localStorage) {
    const storageKey = group === 'cruise'
        ? CRUISE_ICON_SCALE_PREVIEW_STORAGE_KEY
        : SIMPLE_ICON_SCALE_PREVIEW_STORAGE_KEY;
    const normalized = normalizeIconScalePreview(value);
    try {
        storage?.setItem(storageKey, normalized);
        return { ok: true, value: normalized };
    } catch (_) {
        return { ok: false, value: normalized };
    }
}
