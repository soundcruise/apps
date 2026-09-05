export const METRONOME_STORAGE_KEY = 'cruisePort.metronome';
export const METRONOME_SCHEMA_VERSION = 1;

export const METRONOME_LIMITS = Object.freeze({
    bpmMin: 30,
    bpmMax: 240,
    volumeMin: 0,
    volumeMax: 100
});

export const METRONOME_METERS = Object.freeze(['2/4', '3/4', '4/4', '6/8']);
export const METRONOME_SOUNDS = Object.freeze(['standard', 'wood', 'click', 'drum']);

export const METRONOME_DEFAULTS = Object.freeze({
    version: METRONOME_SCHEMA_VERSION,
    bpm: 120,
    meter: '4/4',
    sound: 'standard',
    volume: 70
});

export function clampInteger(value, min, max, fallback) {
    if (value === null || (typeof value === 'string' && value.trim() === '')) return fallback;
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
}

export function normalizeMetronomeSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (value.version !== METRONOME_SCHEMA_VERSION) return null;
    if (!Number.isInteger(value.bpm) || value.bpm < METRONOME_LIMITS.bpmMin || value.bpm > METRONOME_LIMITS.bpmMax) return null;
    if (!METRONOME_METERS.includes(value.meter)) return null;
    if (!METRONOME_SOUNDS.includes(value.sound)) return null;
    if (!Number.isInteger(value.volume) || value.volume < METRONOME_LIMITS.volumeMin || value.volume > METRONOME_LIMITS.volumeMax) return null;

    return {
        version: METRONOME_SCHEMA_VERSION,
        bpm: value.bpm,
        meter: value.meter,
        sound: value.sound,
        volume: value.volume
    };
}

export function loadMetronomeSettings(storage = window.localStorage) {
    try {
        const raw = storage.getItem(METRONOME_STORAGE_KEY);
        if (raw === null) return { ok: true, settings: { ...METRONOME_DEFAULTS } };
        const settings = normalizeMetronomeSettings(JSON.parse(raw));
        if (!settings) return { ok: false, settings: { ...METRONOME_DEFAULTS }, reason: 'invalid-data' };
        return { ok: true, settings };
    } catch (error) {
        return { ok: false, settings: { ...METRONOME_DEFAULTS }, reason: 'read-failed' };
    }
}

export function saveMetronomeSettings(settings, storage = window.localStorage) {
    const normalized = normalizeMetronomeSettings(settings);
    if (!normalized) return { ok: false, reason: 'invalid-data' };
    try {
        storage.setItem(METRONOME_STORAGE_KEY, JSON.stringify(normalized));
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: 'write-failed' };
    }
}
