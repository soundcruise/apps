import { usesPortRepository, readPortStore, writePortStore } from './port-dataset-storage.js?v=1.30.5';
import { readStorageValue, assertStorageUnchanged, acceptStorageValues } from './storage-conflict.js?v=0.59.3';
export const SETTINGS_STORAGE_KEY = 'cruisePort.settings';
// Port-only local overlay. Not a dataset key, backup record, or Cloud Sync field.
export const MIDNIGHT_STORAGE_KEY = 'cruisePort.midnightTheme.v1';
export const MIDNIGHT_PENDING_KEY = 'cruisePort.midnightTheme.pending.v1';
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
// Color theme is Port-only (never shared with other Cruise apps). It is stored only after an
// explicit choice; a missing or invalid value is Dark at runtime and is never written back on load.
export const THEMES = Object.freeze(['dark', 'midnight', 'charcoal', 'gray', 'light']);
export const DEFAULT_THEME = 'dark';
// Keep in sync with the inline startup bootstrap in both entry HTMLs.
export const THEME_META_COLORS = Object.freeze({ dark: '#090806', midnight: '#10151c', charcoal: '#424346', gray: '#c8cbd0', light: '#f7f6f2' });

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

export function resolveTheme(value) {
    return THEMES.includes(value) ? value : DEFAULT_THEME;
}

export function normalizeSettings(value) {
    const settings = {
        version: SETTINGS_SCHEMA_VERSION,
        displaySize: normalizeDisplaySize(value?.displaySize),
        fontSize: FONT_SIZES.includes(value?.fontSize) ? value.fontSize : DEFAULT_SETTINGS.fontSize,
        sectionOrder: normalizeSectionOrder(value?.sectionOrder)
    };
    // Only an explicit, valid choice is kept; absence stays absence.
    if (THEMES.includes(value?.theme)) settings.theme = value.theme;
    return settings;
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
        const overlay = readStorageValue(storage, MIDNIGHT_STORAGE_KEY);
        const pending = readStorageValue(storage, MIDNIGHT_PENDING_KEY);
        const result = usesPortRepository(storage) ? readPortStore(storage, tx => loadBaseSettings(tx)) : loadBaseSettings(storage);
        return applyPendingTheme(applyMidnightOverlay(result, overlay), result, pending);
    } catch (_) { return { ok: false, settings: normalizeSettings(DEFAULT_SETTINGS) }; }
}

function applyMidnightOverlay(result, raw) {
    try {
        const overlay = JSON.parse(raw || 'null');
        if (overlay?.version === 1 && overlay.theme === 'midnight' &&
            overlay.baseTheme === (result.settings.theme ?? null)) {
            return { ...result, settings: { ...result.settings, theme: 'midnight' } };
        }
    } catch (_) { /* Invalid overlays never replace the ordinary settings. */ }
    return result;
}

// A failed/interrupted multi-key write keeps its previous visible theme. The journal
// is durable BEFORE touching either key, and removed only after both writes succeed.
// An old tab's different explicit theme remains authoritative; equal-value intent
// cannot be distinguished from echoing the existing fallback.
function applyPendingTheme(result, base, raw) {
    try {
        const pending = JSON.parse(raw || 'null');
        const theme = base.settings.theme ?? null;
        if (pending?.version === 1 && (pending.beforeTheme === null || THEMES.includes(pending.beforeTheme)) &&
            (theme === pending.baseTheme || theme === pending.nextBaseTheme)) {
            const settings = { ...result.settings };
            if (pending.beforeTheme === null) delete settings.theme;
            else settings.theme = pending.beforeTheme;
            return { ...result, settings };
        }
    } catch (_) { /* Invalid journals never override base settings. */ }
    return result;
}

function loadBaseSettings(storage) {
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
                return saveBaseSettings(settings, storage);
            }
        }

        return { ok: true, settings: normalizeSettings(DEFAULT_SETTINGS) };
    } catch (_) {
        return { ok: false, settings: normalizeSettings(DEFAULT_SETTINGS) };
    }
}

// themeChanged is reserved for the theme buttons/reset. Other saves cannot clear a local
// Midnight choice merely because a tab has old in-memory settings. CAS still rejects stale tabs.
export function saveSettings(settings, storage, { themeChanged = false } = {}) {
    const requested = normalizeSettings(settings);
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        assertStorageUnchanged(storage, [MIDNIGHT_STORAGE_KEY, MIDNIGHT_PENDING_KEY]);
        const overlayRaw = storage.getItem(MIDNIGHT_STORAGE_KEY);
        const pendingRaw = storage.getItem(MIDNIGHT_PENDING_KEY);
        const base = loadBaseSettings({ getItem: key => storage.getItem(key) });
        if (!base.ok) return { ok: false, settings: requested };
        const before = applyPendingTheme(applyMidnightOverlay(base, overlayRaw), base, pendingRaw);
        const active = before.settings.theme === 'midnight';
        const change = themeChanged || (!active && pendingRaw === null && requested.theme !== base.settings.theme);
        const stored = { ...requested };
        if (!change) {
            // Ordinary saves must not acknowledge or clear an interrupted choice.
            if (base.settings.theme === undefined) delete stored.theme;
            else stored.theme = base.settings.theme;
            const finish = result => result.ok ? { ...result, settings: { ...result.settings,
                ...(before.settings.theme === undefined ? {} : { theme: before.settings.theme }) } } : result;
            return usesPortRepository(storage)
                ? writePortStore(storage, [SETTINGS_STORAGE_KEY], tx => saveBaseSettings(stored, tx)).then(finish)
                : finish(saveBaseSettings(stored, storage));
        }
        const midnight = requested.theme === 'midnight';
        let nextOverlay = null;
        if (midnight) {
            const fallback = base.settings.theme === 'midnight' ? null : base.settings.theme ?? null;
            if (fallback === null) delete stored.theme;
            else stored.theme = fallback;
            nextOverlay = JSON.stringify({ version: 1, theme: 'midnight', baseTheme: fallback });
        }
        const journal = JSON.stringify({ version: 1, id: globalThis.crypto.randomUUID(),
            beforeTheme: before.settings.theme ?? null, baseTheme: base.settings.theme ?? null,
            nextBaseTheme: stored.theme ?? null });
        // If this write fails, neither the base nor the overlay has been touched.
        storage.setItem(MIDNIGHT_PENDING_KEY, journal);
        acceptStorageValues(storage, [MIDNIGHT_PENDING_KEY]);
        const finish = result => {
            if (!result.ok) return { ...result, recoveryRequired: true };
            try {
                // Compare this operation's own journal, not a mutable tab-wide snapshot.
                if (storage.getItem(MIDNIGHT_PENDING_KEY) !== journal ||
                    storage.getItem(MIDNIGHT_STORAGE_KEY) !== overlayRaw) throw Error('storage-write-conflict');
                if (nextOverlay !== overlayRaw) {
                    if (nextOverlay === null) storage.removeItem(MIDNIGHT_STORAGE_KEY);
                    else storage.setItem(MIDNIGHT_STORAGE_KEY, nextOverlay);
                    acceptStorageValues(storage, [MIDNIGHT_STORAGE_KEY]);
                }
                storage.removeItem(MIDNIGHT_PENDING_KEY);
                acceptStorageValues(storage, [MIDNIGHT_PENDING_KEY]);
                return { ...result, settings: midnight ? { ...result.settings, theme: 'midnight' } : result.settings };
            } catch (_) {
                // The journal still restores the previous choice after restart, even
                // when all subsequent storage writes fail. Never clear it in cleanup.
                return { ok: false, settings: requested, recoveryRequired: true };
            }
        };
        return usesPortRepository(storage)
            ? writePortStore(storage, [SETTINGS_STORAGE_KEY], tx => saveBaseSettings(stored, tx)).then(finish,
                () => ({ ok: false, settings: requested, recoveryRequired: true }))
            : finish(saveBaseSettings(stored, storage));
    } catch (_) { return { ok: false, settings: requested }; }
}

function saveBaseSettings(settings, storage) {
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
