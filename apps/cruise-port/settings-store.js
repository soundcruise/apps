export const SETTINGS_STORAGE_KEY = 'cruisePort.settings';
export const DISPLAY_SIZES = Object.freeze(['large', 'standard', 'small']);
export const DEFAULT_SETTINGS = Object.freeze({ displaySize: 'standard' });

export function normalizeDisplaySize(value) {
    return DISPLAY_SIZES.includes(value) ? value : DEFAULT_SETTINGS.displaySize;
}

export function normalizeSettings(value) {
    return {
        displaySize: normalizeDisplaySize(value?.displaySize)
    };
}

export function loadSettings(storage = window.localStorage) {
    try {
        const raw = storage.getItem(SETTINGS_STORAGE_KEY);
        if (raw === null) return { ok: true, settings: { ...DEFAULT_SETTINGS } };
        return { ok: true, settings: normalizeSettings(JSON.parse(raw)) };
    } catch (_) {
        return { ok: false, settings: { ...DEFAULT_SETTINGS } };
    }
}

export function saveSettings(settings, storage = window.localStorage) {
    const normalized = normalizeSettings(settings);
    try {
        storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
        return { ok: true, settings: normalized };
    } catch (_) {
        return { ok: false, settings: normalized };
    }
}
