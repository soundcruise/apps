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

const defaults = { version: 3, thresholdDb: -80, tuningId: 'standard', capo: 0 };
assert.deepEqual(TUNER_DEFAULTS, defaults);
assert.equal(TUNER_SCHEMA_VERSION, 3);
assert.equal(TUNER_STORAGE_KEY, 'cruisePort.tuner');
assert.deepEqual([TUNER_THRESHOLD_DB_MIN, TUNER_THRESHOLD_DB_MAX, TUNER_THRESHOLD_DB_STEP], [-100, -40, 1]);
assert.equal(TUNER_DEFAULT_THRESHOLD_DB, -80);
assert.equal(thresholdDbToRms(-80), 0.0001, '-80 dBFS converts safely to RMS');

{
    const storage = createStorage();
    assert.deepEqual(loadTunerSettings(storage), {
        ok: true,
        settings: defaults,
        migrated: false
    });
    assert.equal(storage.writes.length, 0, 'missing settings are not written during load');
}

{
    const storage = createStorage(JSON.stringify({ version: 3, thresholdDb: -68, tuningId: 'dadgad', capo: 3 }));
    assert.deepEqual(loadTunerSettings(storage), {
        ok: true,
        settings: { version: 3, thresholdDb: -68, tuningId: 'dadgad', capo: 3 },
        migrated: false
    }, 'an existing saved threshold remains unchanged');
    assert.equal(storage.writes.length, 0);
}

for (const thresholdDb of [-100, -80, -68, -40]) {
    assert.deepEqual(
        normalizeTunerSettings({ version: 3, thresholdDb, tuningId: 'open-d', capo: 12 }),
        { version: 3, thresholdDb, tuningId: 'open-d', capo: 12 }
    );
}
for (const invalid of [
    null,
    [],
    { version: 2, thresholdDb: -68, tuningId: 'standard', capo: 0 },
    { version: 3, thresholdDb: -101, tuningId: 'standard', capo: 0 },
    { version: 3, thresholdDb: -39, tuningId: 'standard', capo: 0 },
    { version: 3, thresholdDb: -68.5, tuningId: 'standard', capo: 0 },
    { version: 3, thresholdDb: -68, tuningId: 'unknown', capo: 0 },
    { version: 3, thresholdDb: -68, tuningId: 'standard', capo: -1 },
    { version: 3, thresholdDb: -68, tuningId: 'standard', capo: 13 },
    { version: 3, thresholdDb: -68, tuningId: 'standard', capo: 1.5 },
    { version: 3, thresholdDb: -68, tuningId: 'standard' }
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
        settings: { version: 3, thresholdDb: expected, tuningId: 'standard', capo: 0 },
        migrated: true
    });
    assert.equal(storage.values.get(TUNER_STORAGE_KEY), raw, 'v1 data remains untouched until a user adjustment');
    assert.equal(storage.writes.length, 0);
}

{
    const raw = JSON.stringify({ version: 2, thresholdDb: -68 });
    const storage = createStorage(raw);
    assert.deepEqual(loadTunerSettings(storage), {
        ok: true,
        settings: { version: 3, thresholdDb: -68, tuningId: 'standard', capo: 0 },
        migrated: true
    });
    assert.equal(storage.values.get(TUNER_STORAGE_KEY), raw, 'v2 data remains untouched until a user adjustment');
    assert.equal(storage.writes.length, 0);
}

for (const raw of [
    '{broken',
    JSON.stringify({ version: 4, thresholdDb: -80, tuningId: 'standard', capo: 0 }),
    JSON.stringify({ version: 3, thresholdDb: -80, tuningId: 'unknown', capo: 0 }),
    JSON.stringify({ version: 3, thresholdDb: -80, tuningId: 'standard', capo: -1 }),
    JSON.stringify({ version: 3, thresholdDb: -80, tuningId: 'standard', capo: 13 }),
    JSON.stringify({ version: 2, thresholdDb: -101 }),
    JSON.stringify({ version: 1, sensitivity: 'maximum' })
]) {
    const storage = createStorage(raw);
    const loaded = loadTunerSettings(storage);
    assert.equal(loaded.ok, false);
    assert.deepEqual(loaded.settings, defaults);
    assert.equal(storage.values.get(TUNER_STORAGE_KEY), raw, 'invalid source data remains untouched');
    assert.equal(storage.writes.length, 0);
}

{
    const storage = createStorage(null, { readError: new Error('blocked') });
    assert.equal(loadTunerSettings(storage).reason, 'read-failed');
}

{
    const storage = createStorage();
    assert.deepEqual(saveTunerSettings({ version: 3, thresholdDb: -60, tuningId: 'open-g', capo: 5, extra: true }, storage), { ok: true });
    assert.deepEqual(storage.writes, [[
        'cruisePort.tuner',
        JSON.stringify({ version: 3, thresholdDb: -60, tuningId: 'open-g', capo: 5 })
    ]]);
}

for (const thresholdDb of [-100, -40]) {
    const storage = createStorage();
    assert.deepEqual(saveTunerSettings({ version: 3, thresholdDb, tuningId: 'standard', capo: 0 }, storage), { ok: true });
    assert.equal(
        storage.values.get(TUNER_STORAGE_KEY),
        JSON.stringify({ version: 3, thresholdDb, tuningId: 'standard', capo: 0 }),
        `${thresholdDb} dBFS is saved without clamping`
    );
}

{
    const storage = createStorage(null, { writeError: new Error('quota') });
    assert.equal(saveTunerSettings(defaults, storage).reason, 'write-failed');
    assert.equal(storage.writes.length, 0);
}

assert.equal(saveTunerSettings({ ...defaults, thresholdDb: -80.5 }, createStorage()).reason, 'invalid-data');
assert.equal(saveTunerSettings({ ...defaults, tuningId: 'unknown' }, createStorage()).reason, 'invalid-data');
assert.equal(saveTunerSettings({ ...defaults, capo: 13 }, createStorage()).reason, 'invalid-data');

console.log('tuner-store: tuner v3 settings and migration tests passed');
