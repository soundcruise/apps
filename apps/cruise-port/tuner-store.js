export const TUNER_STORAGE_KEY = 'cruisePort.tuner';
export const TUNER_SCHEMA_VERSION = 1;
export const TUNER_SENSITIVITIES = Object.freeze(['low', 'standard', 'high']);

export const TUNER_DEFAULTS = Object.freeze({
    version: TUNER_SCHEMA_VERSION,
    sensitivity: 'standard'
});

export function normalizeTunerSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (value.version !== TUNER_SCHEMA_VERSION) return null;
    if (!TUNER_SENSITIVITIES.includes(value.sensitivity)) return null;
    return { version: TUNER_SCHEMA_VERSION, sensitivity: value.sensitivity };
}

export function loadTunerSettings(storage) {
    try {
        const targetStorage = storage ?? globalThis.localStorage;
        const raw = targetStorage.getItem(TUNER_STORAGE_KEY);
        if (raw === null) return { ok: true, settings: { ...TUNER_DEFAULTS } };
        const settings = normalizeTunerSettings(JSON.parse(raw));
        if (!settings) return { ok: false, settings: { ...TUNER_DEFAULTS }, reason: 'invalid-data' };
        return { ok: true, settings };
    } catch (_) {
        return { ok: false, settings: { ...TUNER_DEFAULTS }, reason: 'read-failed' };
    }
}

export function saveTunerSettings(settings, storage) {
    const normalized = normalizeTunerSettings(settings);
    if (!normalized) return { ok: false, reason: 'invalid-data' };
    try {
        const targetStorage = storage ?? globalThis.localStorage;
        targetStorage.setItem(TUNER_STORAGE_KEY, JSON.stringify(normalized));
        return { ok: true };
    } catch (_) {
        return { ok: false, reason: 'write-failed' };
    }
}
