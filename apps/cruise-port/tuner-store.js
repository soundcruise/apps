import { readStorageValue, assertStorageUnchanged, acceptStorageValues } from './storage-conflict.js?v=0.24.0';
import { isValidCapo, isValidTuningId } from './tuner-tuning.js?v=1.1.6';

export const TUNER_STORAGE_KEY = 'cruisePort.tuner';
export const TUNER_SCHEMA_VERSION = 3;
export const TUNER_THRESHOLD_DB_MIN = -100;
export const TUNER_THRESHOLD_DB_MAX = -40;
export const TUNER_THRESHOLD_DB_STEP = 1;
export const TUNER_DEFAULT_THRESHOLD_DB = -80;

export const TUNER_DEFAULTS = Object.freeze({
    version: TUNER_SCHEMA_VERSION,
    thresholdDb: TUNER_DEFAULT_THRESHOLD_DB,
    tuningId: 'standard',
    capo: 0
});

// These values only translate an existing v1 setting. The range is now a 1 dB control.
const LEGACY_SENSITIVITY_THRESHOLDS = Object.freeze({
    low: -44,
    standard: -50,
    high: -62
});

export function thresholdDbToRms(thresholdDb) {
    return Number.isFinite(thresholdDb) ? 10 ** (thresholdDb / 20) : null;
}

export function normalizeTunerSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (value.version !== TUNER_SCHEMA_VERSION
        || !Number.isInteger(value.thresholdDb)
        || value.thresholdDb < TUNER_THRESHOLD_DB_MIN
        || value.thresholdDb > TUNER_THRESHOLD_DB_MAX
        || !isValidTuningId(value.tuningId)
        || !isValidCapo(value.capo)) return null;
    return {
        version: TUNER_SCHEMA_VERSION,
        thresholdDb: value.thresholdDb,
        tuningId: value.tuningId,
        // Retain the saved Pro capo even when Standard selects Free mode.
        // Free mode's targets are empty; controllers decide effective playback.
        capo: value.capo
    };
}

function migrateV2Settings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 2) return null;
    if (!Number.isInteger(value.thresholdDb)
        || value.thresholdDb < TUNER_THRESHOLD_DB_MIN
        || value.thresholdDb > TUNER_THRESHOLD_DB_MAX) return null;
    return { ...TUNER_DEFAULTS, thresholdDb: value.thresholdDb };
}

function migrateV1Settings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) return null;
    const thresholdDb = LEGACY_SENSITIVITY_THRESHOLDS[value.sensitivity];
    return Number.isInteger(thresholdDb)
        ? { ...TUNER_DEFAULTS, thresholdDb }
        : null;
}

export function loadTunerSettings(storage) {
    try {
        const targetStorage = storage ?? globalThis.localStorage;
        const raw = readStorageValue(targetStorage, TUNER_STORAGE_KEY);
        if (raw === null) return { ok: true, settings: { ...TUNER_DEFAULTS }, migrated: false };
        const value = JSON.parse(raw);
        const settings = normalizeTunerSettings(value);
        if (settings) return { ok: true, settings, migrated: false };
        const migrated = migrateV2Settings(value) || migrateV1Settings(value);
        if (migrated) return { ok: true, settings: migrated, migrated: true };
        return { ok: false, settings: { ...TUNER_DEFAULTS }, reason: 'invalid-data', migrated: false };
    } catch (_) {
        return { ok: false, settings: { ...TUNER_DEFAULTS }, reason: 'read-failed', migrated: false };
    }
}

export function saveTunerSettings(settings, storage) {
    const normalized = normalizeTunerSettings(settings);
    if (!normalized) return { ok: false, reason: 'invalid-data' };
    try {
        const targetStorage = storage ?? globalThis.localStorage;
        assertStorageUnchanged(targetStorage, [TUNER_STORAGE_KEY]);
        targetStorage.setItem(TUNER_STORAGE_KEY, JSON.stringify(normalized));
        acceptStorageValues(targetStorage, [TUNER_STORAGE_KEY]);
        return { ok: true };
    } catch (_) {
        return { ok: false, reason: 'write-failed' };
    }
}
