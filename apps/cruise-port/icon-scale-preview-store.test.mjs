import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CRUISE_ICON_SCALE_PREVIEW_STORAGE_KEY,
    LEGACY_ICON_SCALE_PREVIEW_STORAGE_KEY,
    SIMPLE_ICON_SCALE_PREVIEW_STORAGE_KEY,
    loadIconScalePreviews,
    saveIconScalePreview
} from './icon-scale-preview-store.js';

function createStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); }
    };
}

test('both comparison groups default to 100 percent', () => {
    assert.deepEqual(loadIconScalePreviews(createStorage()), {
        ok: true,
        previews: { cruise: '100', simple: '100' },
        migratedLegacySimple: false
    });
});

test('legacy U1.3 simple 70 percent migrates and removes only the legacy key', () => {
    const storage = createStorage({ [LEGACY_ICON_SCALE_PREVIEW_STORAGE_KEY]: '70' });
    assert.deepEqual(loadIconScalePreviews(storage), {
        ok: true,
        previews: { cruise: '100', simple: '70' },
        migratedLegacySimple: true
    });
    assert.equal(storage.getItem(SIMPLE_ICON_SCALE_PREVIEW_STORAGE_KEY), '70');
    assert.equal(storage.getItem(LEGACY_ICON_SCALE_PREVIEW_STORAGE_KEY), null);
});

for (const value of ['90', '80', '70', '60', '50']) {
    test(`Cruise ${value} percent persists across reload`, () => {
        const storage = createStorage();
        assert.deepEqual(saveIconScalePreview('cruise', value, storage), { ok: true, value });
        assert.equal(loadIconScalePreviews(storage).previews.cruise, value);
    });

    test(`Simple ${value} percent persists across reload`, () => {
        const storage = createStorage();
        assert.deepEqual(saveIconScalePreview('simple', value, storage), { ok: true, value });
        assert.equal(loadIconScalePreviews(storage).previews.simple, value);
    });
}

test('invalid Cruise and Simple comparison values safely fall back to 100 percent', () => {
    const storage = createStorage({
        [CRUISE_ICON_SCALE_PREVIEW_STORAGE_KEY]: '55',
        [SIMPLE_ICON_SCALE_PREVIEW_STORAGE_KEY]: 'invalid'
    });
    assert.deepEqual(loadIconScalePreviews(storage).previews, { cruise: '100', simple: '100' });
});
