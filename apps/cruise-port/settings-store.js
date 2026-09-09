import { readStorageValue, assertStorageUnchanged, acceptStorageValues } from './storage-conflict.js?v=0.24.0';
export const SETTINGS_STORAGE_KEY = 'cruisePort.settings';
export const SETTINGS_SCHEMA_VERSION = 3;
export const DISPLAY_SIZES = Object.freeze(['large', 'standard', 'small', 'xsmall']);
export const FONT_SIZES = Object.freeze(['small', 'medium', 'large', 'xlarge']);
export const HOME_SECTIONS = Object.freeze(['cruiseApps', 'tools', 'myApps']);
export const DEFAULT_SETTINGS = Object.freeze({
    version: SETTINGS_SCHEMA_VERSION,
    displaySize: 'standard',
    fontSize: 'medium',
    sectionOrder: HOME_SECTIONS
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
        displaySize: normalizeDisplaySize(value?.displaySize),
        fontSize: FONT_SIZES.includes(value?.fontSize) ? value.fontSize : DEFAULT_SETTINGS.fontSize,
        sectionOrder: normalizeSectionOrder(value?.sectionOrder)
    };
}

export function normalizeSectionOrder(value) {
    return [...new Set([...(Array.isArray(value) ? value : []), ...HOME_SECTIONS])]
        .filter(key => HOME_SECTIONS.includes(key));
}

export function moveHomeSection(order, key, direction) {
    const next = normalizeSectionOrder(order);
    const index = next.indexOf(key);
    const destination = index + direction;
    if (index >= 0 && (direction === -1 || direction === 1) && destination >= 0 && destination < next.length) {
        [next[index], next[destination]] = [next[destination], next[index]];
    }
    return next;
}

export function loadSettings(storage) {
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        const raw = readStorageValue(storage, SETTINGS_STORAGE_KEY);
        if (raw === null) return { ok: true, settings: normalizeSettings(DEFAULT_SETTINGS) };
        const parsed = JSON.parse(raw);

        if (isRecord(parsed) && parsed.version === SETTINGS_SCHEMA_VERSION) {
            return { ok: true, settings: normalizeSettings(parsed) };
        }
        if (isRecord(parsed) && parsed.version === 2) {
            return { ok: true, settings: normalizeSettings({ displaySize: parsed.displaySize }) };
        }

        if (isRecord(parsed) && !Object.hasOwn(parsed, 'version')) {
            const migratedDisplaySize = LEGACY_DISPLAY_SIZE_MIGRATION[parsed.displaySize];
            if (migratedDisplaySize) {
                const settings = normalizeSettings({ displaySize: migratedDisplaySize });
                return saveSettings(settings, storage);
            }
        }

        return { ok: true, settings: normalizeSettings(DEFAULT_SETTINGS) };
    } catch (_) {
        return { ok: false, settings: normalizeSettings(DEFAULT_SETTINGS) };
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
