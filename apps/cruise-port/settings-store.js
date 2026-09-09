import { readStorageValue, assertStorageUnchanged, acceptStorageValues } from './storage-conflict.js?v=0.24.0';
export const SETTINGS_STORAGE_KEY = 'cruisePort.settings';
export const SETTINGS_SCHEMA_VERSION = 2;
export const DISPLAY_SIZES = Object.freeze(['large', 'standard', 'small', 'xsmall']);
export const DEFAULT_SETTINGS = Object.freeze({
    version: SETTINGS_SCHEMA_VERSION,
    displaySize: 'large'
});

const RETIRED_ICON_SCALE_PREVIEW_STORAGE_KEYS = Object.freeze([
    'cruisePort.cruiseIconScalePreview',
    'cruisePort.simpleIconScalePreview',
    'cruisePort.iconScalePreview'
]);

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

export function loadSettings(storage) {
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        const raw = readStorageValue(storage, SETTINGS_STORAGE_KEY);
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

export function saveSettings(settings, storage) {
    const normalized = normalizeSettings(settings);
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        assertStorageUnchanged(storage, [SETTINGS_STORAGE_KEY]);
        storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
        acceptStorageValues(storage, [SETTINGS_STORAGE_KEY]);
        return { ok: true, settings: normalized };
    } catch (_) {
        return { ok: false, settings: normalized };
    }
}

export function clearRetiredIconScalePreviewKeys(storage) {
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        RETIRED_ICON_SCALE_PREVIEW_STORAGE_KEYS.forEach((key) => storage?.removeItem(key));
        return true;
    } catch (_) {
        return false;
    }
}
