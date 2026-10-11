/* Pure Port settings projection. No Port storage/policy imports or credential checks.
 * Source: metronome-store.js through migrateMetronomeSettings;
 * tool-capabilities.js: effectiveMetronome / mergeMetronomeSettings.
 * Source equality tests reject drift. See docs/METRONOME_INTEGRATION.md. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.metronomeSchema = factory();
})(globalThis, function () {
'use strict';
const METRONOME_SCHEMA_VERSION = 3;

const METRONOME_LIMITS = Object.freeze({
    bpmMin: 30,
    bpmMax: 240,
    volumeMin: 0,
    volumeMax: 100
});

const METRONOME_METERS = Object.freeze(['2/4', '3/4', '4/4', '5/4', '6/8', '9/8', '12/8']);
const METRONOME_RHYTHMS = Object.freeze(['quarter', 'eighth', 'sixteenth', 'triplet', 'eighth-shuffle', 'sixteenth-shuffle']);
const METRONOME_SOUNDS = Object.freeze(['electronic', 'analog', 'click', 'rim']);
const METRONOME_RETIRED_SOUNDS = Object.freeze(['electronic-drum', 'wood']);

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

const METRONOME_DEFAULTS = Object.freeze({
    version: METRONOME_SCHEMA_VERSION,
    bpm: 120,
    meter: '4/4',
    rhythm: 'quarter',
    sound: 'electronic',
    volume: 70,
    accents: Object.freeze([true, false, false, false])
});

function beatCountForMeter(meter) {
    return METER_BEAT_COUNTS[meter] || METER_BEAT_COUNTS[METRONOME_DEFAULTS.meter];
}

function defaultAccentsForMeter(meter) {
    return Array.from({ length: beatCountForMeter(meter) }, (_, index) => index === 0);
}

function clampInteger(value, min, max, fallback) {
    if (value === null || (typeof value === 'string' && value.trim() === '')) return fallback;
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
}

function migrateMetronomeSound(sound) {
    return METRONOME_RETIRED_SOUNDS.includes(sound) ? 'rim' : sound;
}

function normalizeMetronomeSettings(value) {
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

function migrateMetronomeSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (value.version === METRONOME_SCHEMA_VERSION) {
        if (!METRONOME_RETIRED_SOUNDS.includes(value.sound)) return null;
        return normalizeMetronomeSettings({ ...value, sound: migrateMetronomeSound(value.sound) });
    }
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
            sound: value.sound === 'drum' ? 'rim' : 'electronic',
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
        sound: value.sound === 'drum' || value.sound === 'wood'
            ? 'rim'
            : (value.sound === 'click' ? 'click' : 'electronic'),
        volume: value.volume,
        accents: defaultAccentsForMeter(value.meter)
    };
}

function effectiveMetronome(stored, capabilities = { metronomeAdvanced: false }) {
    const settings = capabilities.metronomeAdvanced ? stored : { ...METRONOME_DEFAULTS, bpm: stored.bpm };
    return { ...settings, accents: [...settings.accents] };
}
function mergeMetronomeSettings(stored, effective, capabilities = { metronomeAdvanced: false }) {
    return capabilities.metronomeAdvanced ? { ...effective, accents: [...effective.accents] } : { ...stored, bpm: effective.bpm, accents: [...stored.accents] };
}

function copy(value) { return JSON.parse(JSON.stringify(value)); }
function defaults() { return copy(METRONOME_DEFAULTS); }
function decode(value) {
    if (value && typeof value === 'object' && !Array.isArray(value) &&
        typeof value.version === 'number' && value.version > METRONOME_SCHEMA_VERSION)
        return { ok: false, reason: 'forward-incompatible', forwardIncompatible: true };
    const normalized = normalizeMetronomeSettings(value);
    const migrated = normalized ? null : migrateMetronomeSettings(value);
    if (!normalized && !migrated) return { ok: false, reason: 'invalid-data', forwardIncompatible: false };
    // Port normalization only returns known fields. Preserve unknown JSON fields in
    // the M2 envelope, without feeding them to the timing/audio engine.
    return { ok: true, data: { ...copy(value), ...(normalized || migrated) }, migrated: !!migrated };
}
return Object.freeze({ version: METRONOME_SCHEMA_VERSION, limits: METRONOME_LIMITS,
    defaults, copy, decode, normalize: normalizeMetronomeSettings, migrate: migrateMetronomeSettings,
    clampInteger, effective: effectiveMetronome, merge: mergeMetronomeSettings });
});
