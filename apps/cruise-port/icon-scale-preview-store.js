// Temporary U1.3 pre-release comparison state. Remove this module when the
// selected icon size is made permanent in the following phase.
export const ICON_SCALE_PREVIEW_STORAGE_KEY = 'cruisePort.iconScalePreview';
export const ICON_SCALE_PREVIEW_VALUES = Object.freeze(['100', '90', '80', '70']);
export const DEFAULT_ICON_SCALE_PREVIEW = '100';

export function normalizeIconScalePreview(value) {
    return ICON_SCALE_PREVIEW_VALUES.includes(value) ? value : DEFAULT_ICON_SCALE_PREVIEW;
}

export function loadIconScalePreview(storage = globalThis.localStorage) {
    try {
        return {
            ok: true,
            value: normalizeIconScalePreview(storage?.getItem(ICON_SCALE_PREVIEW_STORAGE_KEY))
        };
    } catch (_) {
        return { ok: false, value: DEFAULT_ICON_SCALE_PREVIEW };
    }
}

export function saveIconScalePreview(value, storage = globalThis.localStorage) {
    const normalized = normalizeIconScalePreview(value);
    try {
        storage?.setItem(ICON_SCALE_PREVIEW_STORAGE_KEY, normalized);
        return { ok: true, value: normalized };
    } catch (_) {
        return { ok: false, value: normalized };
    }
}
