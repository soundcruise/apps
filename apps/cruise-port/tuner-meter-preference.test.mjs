import assert from 'node:assert/strict';
import test from 'node:test';
import { TUNER_METER_VISIBILITY_KEY, loadTunerMeterVisible, saveTunerMeterVisible } from './tuner-meter-preference.js';

test('meter visibility defaults on and persists only in its device-local key', () => {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    assert.equal(loadTunerMeterVisible(storage), true);
    assert.equal(saveTunerMeterVisible(false, storage), true);
    assert.equal(loadTunerMeterVisible(storage), false);
    assert.deepEqual([...values.keys()], [TUNER_METER_VISIBILITY_KEY]);
    assert.equal(saveTunerMeterVisible(true, storage), true);
    assert.equal(loadTunerMeterVisible(storage), true);
});

test('storage failure leaves the meter visible by default', () => {
    const storage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
    assert.equal(loadTunerMeterVisible(storage), true);
    assert.equal(saveTunerMeterVisible(false, storage), false);
});
