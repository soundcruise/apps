import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DEFAULT_SETTINGS,
    SETTINGS_SCHEMA_VERSION,
    SETTINGS_STORAGE_KEY,
    clearRetiredIconScalePreviewKeys,
    loadSettings,
    saveSettings
} from './settings-store.js';

function createStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        setCalls: 0,
        removedKeys: [],
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) {
            this.setCalls += 1;
            values.set(key, String(value));
        },
        removeItem(key) {
            this.removedKeys.push(key);
            values.delete(key);
        }
    };
}

test('retired icon comparison keys are removed individually without touching settings', () => {
    const storage = createStorage({
        [SETTINGS_STORAGE_KEY]: JSON.stringify({ version: SETTINGS_SCHEMA_VERSION, displaySize: 'small' }),
        'cruisePort.cruiseIconScalePreview': '90',
        'cruisePort.simpleIconScalePreview': '60',
        'cruisePort.iconScalePreview': '60',
        'cruisePort.myApps': 'preserve'
    });

    assert.equal(clearRetiredIconScalePreviewKeys(storage), true);
    assert.deepEqual(storage.removedKeys, [
        'cruisePort.cruiseIconScalePreview',
        'cruisePort.simpleIconScalePreview',
        'cruisePort.iconScalePreview'
    ]);
    assert.equal(storage.getItem(SETTINGS_STORAGE_KEY), JSON.stringify({ version: SETTINGS_SCHEMA_VERSION, displaySize: 'small' }));
    assert.equal(storage.getItem('cruisePort.myApps'), 'preserve');
});

test('settings default to large', () => {
    assert.deepEqual(loadSettings(createStorage()), { ok: true, settings: DEFAULT_SETTINGS });
});

for (const displaySize of ['large', 'standard', 'small', 'xsmall']) {
    test(`settings save ${displaySize} and persist across reload`, () => {
        const storage = createStorage();
        const saved = saveSettings({ displaySize }, storage);
        const expected = { version: SETTINGS_SCHEMA_VERSION, displaySize };
        assert.deepEqual(saved, { ok: true, settings: expected });
        assert.deepEqual(loadSettings(storage), { ok: true, settings: expected });
    });
}

test('invalid settings safely fall back to large', () => {
    const storage = createStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ displaySize: 'wide' }) });
    assert.deepEqual(loadSettings(storage), { ok: true, settings: DEFAULT_SETTINGS });
});

for (const displaySize of ['large', 'standard', 'small', 'xsmall']) {
    test(`schema v2 ${displaySize} remains unchanged after reload`, () => {
        const storage = createStorage({
            [SETTINGS_STORAGE_KEY]: JSON.stringify({ version: SETTINGS_SCHEMA_VERSION, displaySize })
        });
        const expected = { version: SETTINGS_SCHEMA_VERSION, displaySize };
        assert.deepEqual(loadSettings(storage), { ok: true, settings: expected });
        assert.equal(storage.setCalls, 0, 'existing v2 data is never rewritten by the default change');
        assert.deepEqual(loadSettings(storage), { ok: true, settings: expected });
        assert.equal(storage.setCalls, 0);
    });
}

for (const [legacyDisplaySize, displaySize] of [
    ['large', 'standard'],
    ['standard', 'small'],
    ['small', 'xsmall']
]) {
    test(`legacy ${legacyDisplaySize} migrates once to ${displaySize}`, () => {
        const storage = createStorage({
            [SETTINGS_STORAGE_KEY]: JSON.stringify({ displaySize: legacyDisplaySize })
        });
        const expected = { version: SETTINGS_SCHEMA_VERSION, displaySize };
        assert.deepEqual(loadSettings(storage), { ok: true, settings: expected });
        assert.equal(storage.setCalls, 1);
        assert.deepEqual(loadSettings(storage), { ok: true, settings: expected });
        assert.equal(storage.setCalls, 1, 'the v2 record is not migrated again');
    });
}
