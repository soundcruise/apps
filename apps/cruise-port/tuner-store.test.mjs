import assert from 'node:assert/strict';
import {
    TUNER_DEFAULTS,
    TUNER_DEFAULT_THRESHOLD_DB,
    TUNER_SCHEMA_VERSION,
    TUNER_STORAGE_KEY,
    TUNER_THRESHOLD_DB_MAX,
    TUNER_THRESHOLD_DB_MIN,
    TUNER_THRESHOLD_DB_STEP,
    loadTunerSettings,
    normalizeTunerSettings,
    saveTunerSettings,
    thresholdDbToRms
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

assert.deepEqual(TUNER_DEFAULTS, { version: 2, thresholdDb: -80 });
assert.equal(TUNER_SCHEMA_VERSION, 2);
assert.equal(TUNER_STORAGE_KEY, 'cruisePort.tuner');
assert.deepEqual([TUNER_THRESHOLD_DB_MIN, TUNER_THRESHOLD_DB_MAX, TUNER_THRESHOLD_DB_STEP], [-100, -40, 1]);
assert.equal(TUNER_DEFAULT_THRESHOLD_DB, -80);
assert.equal(thresholdDbToRms(-80), 0.0001, '-80 dBFS converts safely to RMS');

{
    const storage = createStorage();
    assert.deepEqual(loadTunerSettings(storage), {
        ok: true,
        settings: { version: 2, thresholdDb: -80 },
        migrated: false
    });
    assert.equal(storage.writes.length, 0, 'missing settings are not written during load');
}

{
    const storage = createStorage(JSON.stringify({ version: 2, thresholdDb: -68 }));
    assert.deepEqual(loadTunerSettings(storage), {
        ok: true,
        settings: { version: 2, thresholdDb: -68 },
        migrated: false
    }, 'an existing saved threshold remains unchanged');
    assert.equal(storage.writes.length, 0);
}

for (const thresholdDb of [-100, -80, -68, -40]) {
    assert.deepEqual(
        normalizeTunerSettings({ version: 2, thresholdDb }),
        { version: 2, thresholdDb }
    );
}
for (const invalid of [
    null,
    [],
    { version: 1, thresholdDb: -68 },
    { version: 2, thresholdDb: -101 },
    { version: 2, thresholdDb: -39 },
    { version: 2, thresholdDb: -68.5 },
    { version: 2 }
]) {
    assert.equal(normalizeTunerSettings(invalid), null);
}

for (const [legacy, expected] of [
    ['low', -44],
    ['standard', -50],
    ['high', -62]
]) {
    const raw = JSON.stringify({ version: 1, sensitivity: legacy });
    const storage = createStorage(raw);
    assert.deepEqual(loadTunerSettings(storage), {
        ok: true,
        settings: { version: 2, thresholdDb: expected },
        migrated: true
    });
    assert.equal(storage.values.get(TUNER_STORAGE_KEY), raw, 'v1 data remains untouched until a user adjustment');
    assert.equal(storage.writes.length, 0);
}

for (const raw of ['{broken', JSON.stringify({ version: 2, thresholdDb: -101 }), JSON.stringify({ version: 1, sensitivity: 'maximum' })]) {
    const storage = createStorage(raw);
    const loaded = loadTunerSettings(storage);
    assert.equal(loaded.ok, false);
    assert.deepEqual(loaded.settings, { version: 2, thresholdDb: -80 });
    assert.equal(storage.values.get(TUNER_STORAGE_KEY), raw, 'invalid source data remains untouched');
    assert.equal(storage.writes.length, 0);
}

{
    const storage = createStorage(null, { readError: new Error('blocked') });
    assert.equal(loadTunerSettings(storage).reason, 'read-failed');
}

{
    const storage = createStorage();
    assert.deepEqual(saveTunerSettings({ version: 2, thresholdDb: -60, extra: true }, storage), { ok: true });
    assert.deepEqual(storage.writes, [[
        'cruisePort.tuner',
        JSON.stringify({ version: 2, thresholdDb: -60 })
    ]]);
}

for (const thresholdDb of [-100, -40]) {
    const storage = createStorage();
    assert.deepEqual(saveTunerSettings({ version: 2, thresholdDb }, storage), { ok: true });
    assert.equal(
        storage.values.get(TUNER_STORAGE_KEY),
        JSON.stringify({ version: 2, thresholdDb }),
        `${thresholdDb} dBFS is saved without clamping`
    );
}

{
    const storage = createStorage(null, { writeError: new Error('quota') });
    assert.equal(saveTunerSettings({ version: 2, thresholdDb: -80 }, storage).reason, 'write-failed');
    assert.equal(storage.writes.length, 0);
}

assert.equal(saveTunerSettings({ version: 2, thresholdDb: -80.5 }, createStorage()).reason, 'invalid-data');

console.log('tuner-store: threshold v2 settings tests passed');
