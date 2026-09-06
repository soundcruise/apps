import assert from 'node:assert/strict';
import {
    TUNER_DEFAULTS,
    TUNER_SCHEMA_VERSION,
    TUNER_STORAGE_KEY,
    loadTunerSettings,
    normalizeTunerSettings,
    saveTunerSettings
} from './tuner-store.js';

function createStorage(initialValue = null, { readError = null, writeError = null } = {}) {
    const values = new Map();
    if (initialValue !== null) values.set(TUNER_STORAGE_KEY, initialValue);
    const writes = [];
    return {
        values,
        writes,
        getItem(key) {
            if (readError) throw readError;
            return values.get(key) ?? null;
        },
        setItem(key, value) {
            if (writeError) throw writeError;
            writes.push([key, value]);
            values.set(key, value);
        }
    };
}

assert.deepEqual(TUNER_DEFAULTS, { version: 1, sensitivity: 'standard' });
assert.equal(TUNER_SCHEMA_VERSION, 1);
assert.equal(TUNER_STORAGE_KEY, 'cruisePort.tuner');

{
    const storage = createStorage();
    assert.deepEqual(loadTunerSettings(storage), { ok: true, settings: { version: 1, sensitivity: 'standard' } });
    assert.equal(storage.writes.length, 0, 'missing settings are not written during load');
}

for (const sensitivity of ['low', 'standard', 'high']) {
    assert.deepEqual(
        normalizeTunerSettings({ version: 1, sensitivity }),
        { version: 1, sensitivity }
    );
}
for (const invalid of [
    null,
    [],
    { version: 2, sensitivity: 'high' },
    { version: 1, sensitivity: 'maximum' },
    { version: 1 }
]) {
    assert.equal(normalizeTunerSettings(invalid), null);
}

for (const raw of ['{broken', JSON.stringify({ version: 2, sensitivity: 'high' })]) {
    const storage = createStorage(raw);
    const loaded = loadTunerSettings(storage);
    assert.equal(loaded.ok, false);
    assert.deepEqual(loaded.settings, { version: 1, sensitivity: 'standard' });
    assert.equal(storage.values.get(TUNER_STORAGE_KEY), raw, 'invalid source data remains untouched');
    assert.equal(storage.writes.length, 0);
}

{
    const storage = createStorage(null, { readError: new Error('blocked') });
    assert.equal(loadTunerSettings(storage).reason, 'read-failed');
}

{
    const storage = createStorage();
    assert.deepEqual(saveTunerSettings({ version: 1, sensitivity: 'high', extra: true }, storage), { ok: true });
    assert.deepEqual(storage.writes, [[
        'cruisePort.tuner',
        JSON.stringify({ version: 1, sensitivity: 'high' })
    ]]);
}

{
    const storage = createStorage(null, { writeError: new Error('quota') });
    assert.equal(saveTunerSettings({ version: 1, sensitivity: 'low' }, storage).reason, 'write-failed');
    assert.equal(storage.writes.length, 0);
}

assert.equal(saveTunerSettings({ version: 1, sensitivity: 'invalid' }, createStorage()).reason, 'invalid-data');

console.log('tuner-store: all settings tests passed');
