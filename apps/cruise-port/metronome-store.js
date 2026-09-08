export const METRONOME_STORAGE_KEY = 'cruisePort.metronome';
export const METRONOME_SCHEMA_VERSION = 3;

export const METRONOME_LIMITS = Object.freeze({
    bpmMin: 30,
    bpmMax: 240,
    volumeMin: 0,
    volumeMax: 100
});

export const METRONOME_METERS = Object.freeze(['2/4', '3/4', '4/4', '5/4', '6/8', '9/8', '12/8']);
export const METRONOME_RHYTHMS = Object.freeze(['quarter', 'eighth', 'sixteenth', 'triplet', 'eighth-shuffle', 'sixteenth-shuffle']);
export const METRONOME_SOUNDS = Object.freeze(['electronic', 'electronic-drum', 'analog', 'wood', 'click']);

const METER_BEAT_COUNTS = Object.freeze({
    '2/4': 2,
    '3/4': 3,
    '4/4': 4,
    '5/4': 5,
    '6/8': 2,
    '9/8': 3,
    '12/8': 4
});

const LEGACY_METERS = Object.freeze(['2/4', '3/4', '4/4', '6/8']);
const LEGACY_SOUNDS = Object.freeze(['standard', 'wood', 'click', 'drum']);
const V2_SOUNDS = Object.freeze(['electronic', 'drum']);
const COMPOUND_METERS = Object.freeze(['6/8', '9/8', '12/8']);
const COMPOUND_RHYTHMS = Object.freeze(['quarter', 'eighth', 'sixteenth']);

export const METRONOME_DEFAULTS = Object.freeze({
    version: METRONOME_SCHEMA_VERSION,
    bpm: 120,
    meter: '4/4',
    rhythm: 'quarter',
    sound: 'electronic',
    volume: 70,
    accents: Object.freeze([true, false, false, false])
});

export function beatCountForMeter(meter) {
    return METER_BEAT_COUNTS[meter] || METER_BEAT_COUNTS[METRONOME_DEFAULTS.meter];
}

export function defaultAccentsForMeter(meter) {
    return Array.from({ length: beatCountForMeter(meter) }, (_, index) => index === 0);
}

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
    if (!METRONOME_RHYTHMS.includes(value.rhythm)) return null;
    if (COMPOUND_METERS.includes(value.meter) && !COMPOUND_RHYTHMS.includes(value.rhythm)) return null;
    if (!METRONOME_SOUNDS.includes(value.sound)) return null;
    if (!Number.isInteger(value.volume) || value.volume < METRONOME_LIMITS.volumeMin || value.volume > METRONOME_LIMITS.volumeMax) return null;
    if (!Array.isArray(value.accents) || value.accents.length !== beatCountForMeter(value.meter)) return null;
    if (!value.accents.every((accent) => typeof accent === 'boolean')) return null;

    return {
        version: METRONOME_SCHEMA_VERSION,
        bpm: value.bpm,
        meter: value.meter,
        rhythm: value.rhythm,
        sound: value.sound,
        volume: value.volume,
        accents: [...value.accents]
    };
}

export function migrateMetronomeSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (value.version === 2) {
        if (!Number.isInteger(value.bpm) || value.bpm < METRONOME_LIMITS.bpmMin || value.bpm > METRONOME_LIMITS.bpmMax) return null;
        if (!METRONOME_METERS.includes(value.meter)) return null;
        if (!METRONOME_RHYTHMS.includes(value.rhythm)) return null;
        if (COMPOUND_METERS.includes(value.meter) && !COMPOUND_RHYTHMS.includes(value.rhythm)) return null;
        if (!V2_SOUNDS.includes(value.sound)) return null;
        if (!Number.isInteger(value.volume) || value.volume < METRONOME_LIMITS.volumeMin || value.volume > METRONOME_LIMITS.volumeMax) return null;
        if (!Array.isArray(value.accents) || value.accents.length !== beatCountForMeter(value.meter)) return null;
        if (!value.accents.every((accent) => typeof accent === 'boolean')) return null;
        return {
            version: METRONOME_SCHEMA_VERSION,
            bpm: value.bpm,
            meter: value.meter,
            rhythm: value.rhythm,
            sound: value.sound === 'drum' ? 'electronic-drum' : 'electronic',
            volume: value.volume,
            accents: [...value.accents]
        };
    }
    if (value.version !== 1) return null;
    if (!Number.isInteger(value.bpm) || value.bpm < METRONOME_LIMITS.bpmMin || value.bpm > METRONOME_LIMITS.bpmMax) return null;
    if (!LEGACY_METERS.includes(value.meter)) return null;
    if (!LEGACY_SOUNDS.includes(value.sound)) return null;
    if (!Number.isInteger(value.volume) || value.volume < METRONOME_LIMITS.volumeMin || value.volume > METRONOME_LIMITS.volumeMax) return null;
    return {
        version: METRONOME_SCHEMA_VERSION,
        bpm: value.bpm,
        meter: value.meter,
        rhythm: value.meter === '6/8' ? 'eighth' : 'quarter',
        sound: value.sound === 'drum'
            ? 'electronic-drum'
            : (value.sound === 'wood' || value.sound === 'click' ? value.sound : 'electronic'),
        volume: value.volume,
        accents: defaultAccentsForMeter(value.meter)
    };
}

function defaultSettings() {
    return {
        ...METRONOME_DEFAULTS,
        accents: [...METRONOME_DEFAULTS.accents]
    };
}

export function loadMetronomeSettings(storage = window.localStorage) {
    try {
        const raw = storage.getItem(METRONOME_STORAGE_KEY);
        if (raw === null) return { ok: true, settings: defaultSettings(), migrated: false };
        const parsed = JSON.parse(raw);
        const settings = normalizeMetronomeSettings(parsed);
        if (settings) return { ok: true, settings, migrated: false };
        const migrated = migrateMetronomeSettings(parsed);
        if (!migrated) return { ok: false, settings: defaultSettings(), reason: 'invalid-data', migrated: false };
        try {
            storage.setItem(METRONOME_STORAGE_KEY, JSON.stringify(migrated));
            return { ok: true, settings: migrated, migrated: true };
        } catch (error) {
            return { ok: false, settings: migrated, reason: 'migration-write-failed', migrated: false };
        }
    } catch (error) {
        return { ok: false, settings: defaultSettings(), reason: 'read-failed', migrated: false };
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
