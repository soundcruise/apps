export const TUNER_METER_VISIBILITY_KEY = 'cruisePort.tunerMeterVisible';

export function loadTunerMeterVisible(storage = globalThis.localStorage) {
    try {
        return storage.getItem(TUNER_METER_VISIBILITY_KEY) !== 'false';
    } catch (_) {
        return true;
    }
}

export function saveTunerMeterVisible(visible, storage = globalThis.localStorage) {
    try {
        storage.setItem(TUNER_METER_VISIBILITY_KEY, visible ? 'true' : 'false');
        return true;
    } catch (_) {
        return false;
    }
}
