import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DEFAULT_SETTINGS,
    SETTINGS_STORAGE_KEY,
    loadSettings,
    saveSettings
} from './settings-store.js';

function createStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); }
    };
}

test('settings default to standard', () => {
    assert.deepEqual(loadSettings(createStorage()), { ok: true, settings: DEFAULT_SETTINGS });
});

for (const displaySize of ['large', 'standard', 'small']) {
    test(`settings save ${displaySize} and persist across reload`, () => {
        const storage = createStorage();
        const saved = saveSettings({ displaySize }, storage);
        assert.deepEqual(saved, { ok: true, settings: { displaySize } });
        assert.deepEqual(loadSettings(storage), { ok: true, settings: { displaySize } });
    });
}

test('invalid settings safely fall back to standard', () => {
    const storage = createStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ displaySize: 'wide' }) });
    assert.deepEqual(loadSettings(storage), { ok: true, settings: DEFAULT_SETTINGS });
});
