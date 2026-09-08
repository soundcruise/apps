import {
    METRONOME_SCHEMA_VERSION,
    normalizeMetronomeSettings
} from './metronome-store.js?v=3.1.0';

export const METRONOME_PRESETS_STORAGE_KEY = 'cruisePort.metronomePresets';
export const METRONOME_PRESETS_SCHEMA_VERSION = 1;
export const METRONOME_PRESET_LIMITS = Object.freeze({
    items: 50,
    name: 40
});

function normalizeName(value) {
    if (typeof value !== 'string') return '';
    return value.trim().normalize('NFC');
}

function nameKey(value) {
    return normalizeName(value).toLocaleLowerCase('ja-JP');
}

function validTimestamp(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

function defaultId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return `metronome-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeMetronomePreset(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const name = normalizeName(item.name);
    if (typeof item.id !== 'string' || !item.id || item.id.length > 100) return null;
    if (!name || name !== item.name || [...name].length > METRONOME_PRESET_LIMITS.name) return null;
    if (!validTimestamp(item.createdAt) || !validTimestamp(item.updatedAt) || item.updatedAt < item.createdAt) return null;
    const settings = normalizeMetronomeSettings({
        version: METRONOME_SCHEMA_VERSION,
        bpm: item.bpm,
        meter: item.meter,
        rhythm: item.rhythm,
        accents: item.accents,
        sound: item.sound,
        volume: item.volume
    });
    if (!settings) return null;
    return {
        id: item.id,
        name,
        bpm: settings.bpm,
        meter: settings.meter,
        rhythm: settings.rhythm,
        accents: [...settings.accents],
        sound: settings.sound,
        volume: settings.volume,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
    };
}

function validatePresetList(presets) {
    if (!Array.isArray(presets) || presets.length > METRONOME_PRESET_LIMITS.items) return null;
    const normalized = [];
    const ids = new Set();
    const names = new Set();
    for (const candidate of presets) {
        const preset = normalizeMetronomePreset(candidate);
        const normalizedName = preset ? nameKey(preset.name) : '';
        if (!preset || ids.has(preset.id) || names.has(normalizedName)) return null;
        ids.add(preset.id);
        names.add(normalizedName);
        normalized.push(preset);
    }
    return normalized;
}

export function loadMetronomePresets(storage = window.localStorage) {
    try {
        const raw = storage.getItem(METRONOME_PRESETS_STORAGE_KEY);
        if (raw === null) return { ok: true, presets: [], ignored: 0 };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
            || parsed.version !== METRONOME_PRESETS_SCHEMA_VERSION || !Array.isArray(parsed.items)) {
            return { ok: false, presets: [], reason: 'invalid-data', ignored: 0 };
        }
        const presets = [];
        const ids = new Set();
        const names = new Set();
        let ignored = 0;
        parsed.items.slice(0, METRONOME_PRESET_LIMITS.items).forEach((candidate) => {
            const preset = normalizeMetronomePreset(candidate);
            const normalizedName = preset ? nameKey(preset.name) : '';
            if (!preset || ids.has(preset.id) || names.has(normalizedName)) {
                ignored += 1;
                return;
            }
            ids.add(preset.id);
            names.add(normalizedName);
            presets.push(preset);
        });
        ignored += Math.max(0, parsed.items.length - METRONOME_PRESET_LIMITS.items);
        return {
            ok: ignored === 0,
            presets,
            reason: ignored === 0 ? undefined : 'partial-invalid',
            ignored
        };
    } catch (_) {
        return { ok: false, presets: [], reason: 'read-failed', ignored: 0 };
    }
}

export function saveMetronomePresets(presets, storage = window.localStorage) {
    const normalized = validatePresetList(presets);
    if (!normalized) return { ok: false, reason: 'invalid-data' };
    try {
        storage.setItem(METRONOME_PRESETS_STORAGE_KEY, JSON.stringify({
            version: METRONOME_PRESETS_SCHEMA_VERSION,
            items: normalized
        }));
        return { ok: true, presets: normalized };
    } catch (_) {
        return { ok: false, reason: 'write-failed' };
    }
}

export function createMetronomePreset({
    presets,
    name,
    settings,
    storage = window.localStorage,
    idFactory = defaultId,
    now = Date.now()
}) {
    const normalizedPresets = validatePresetList(presets);
    if (!normalizedPresets) return { ok: false, reason: 'invalid-data' };
    const normalizedName = normalizeName(name);
    if (!normalizedName) return { ok: false, reason: 'name-required' };
    if ([...normalizedName].length > METRONOME_PRESET_LIMITS.name) return { ok: false, reason: 'name-too-long' };
    if (normalizedPresets.some((preset) => nameKey(preset.name) === nameKey(normalizedName))) {
        return { ok: false, reason: 'duplicate-name' };
    }
    if (normalizedPresets.length >= METRONOME_PRESET_LIMITS.items) return { ok: false, reason: 'limit-reached' };
    const normalizedSettings = normalizeMetronomeSettings(settings);
    if (!normalizedSettings) return { ok: false, reason: 'invalid-settings' };
    const id = idFactory();
    if (typeof id !== 'string' || !id || id.length > 100 || normalizedPresets.some((preset) => preset.id === id)) {
        return { ok: false, reason: 'invalid-id' };
    }
    if (!validTimestamp(now)) return { ok: false, reason: 'invalid-time' };
    const preset = {
        id,
        name: normalizedName,
        bpm: normalizedSettings.bpm,
        meter: normalizedSettings.meter,
        rhythm: normalizedSettings.rhythm,
        accents: [...normalizedSettings.accents],
        sound: normalizedSettings.sound,
        volume: normalizedSettings.volume,
        createdAt: now,
        updatedAt: now
    };
    const result = saveMetronomePresets([...normalizedPresets, preset], storage);
    if (!result.ok) return result;
    return { ok: true, presets: result.presets, preset: normalizeMetronomePreset(preset) };
}

export function deleteMetronomePreset({ presets, id, storage = window.localStorage }) {
    const normalizedPresets = validatePresetList(presets);
    if (!normalizedPresets) return { ok: false, reason: 'invalid-data' };
    if (!normalizedPresets.some((preset) => preset.id === id)) return { ok: false, reason: 'not-found' };
    const result = saveMetronomePresets(normalizedPresets.filter((preset) => preset.id !== id), storage);
    if (!result.ok) return result;
    return { ok: true, presets: result.presets };
}

export function settingsFromMetronomePreset(preset) {
    const normalized = normalizeMetronomePreset(preset);
    if (!normalized) return null;
    return {
        version: METRONOME_SCHEMA_VERSION,
        bpm: normalized.bpm,
        meter: normalized.meter,
        rhythm: normalized.rhythm,
        accents: [...normalized.accents],
        sound: normalized.sound,
        volume: normalized.volume
    };
}
