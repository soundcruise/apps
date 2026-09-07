export const SETTINGS_STORAGE_KEY = 'cruisePort.settings';
export const SETTINGS_SCHEMA_VERSION = 2;
export const DISPLAY_SIZES = Object.freeze(['large', 'standard', 'small', 'xsmall']);
export const DEFAULT_SETTINGS = Object.freeze({
    version: SETTINGS_SCHEMA_VERSION,
    displaySize: 'large'
});

const LEGACY_DISPLAY_SIZE_MIGRATION = Object.freeze({
    large: 'standard',
    standard: 'small',
    small: 'xsmall'
});

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeDisplaySize(value) {
    return DISPLAY_SIZES.includes(value) ? value : DEFAULT_SETTINGS.displaySize;
}

export function normalizeSettings(value) {
    return {
        version: SETTINGS_SCHEMA_VERSION,
        displaySize: normalizeDisplaySize(value?.displaySize)
    };
}

export function loadSettings(storage = window.localStorage) {
    try {
        const raw = storage.getItem(SETTINGS_STORAGE_KEY);
        if (raw === null) return { ok: true, settings: { ...DEFAULT_SETTINGS } };
        const parsed = JSON.parse(raw);

        if (isRecord(parsed) && parsed.version === SETTINGS_SCHEMA_VERSION) {
            return { ok: true, settings: normalizeSettings(parsed) };
        }

        if (isRecord(parsed) && !Object.hasOwn(parsed, 'version')) {
            const migratedDisplaySize = LEGACY_DISPLAY_SIZE_MIGRATION[parsed.displaySize];
            if (migratedDisplaySize) {
                const settings = normalizeSettings({ displaySize: migratedDisplaySize });
                try {
                    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
                    return { ok: true, settings };
                } catch (_) {
                    return { ok: false, settings };
                }
            }
        }

        return { ok: true, settings: { ...DEFAULT_SETTINGS } };
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
