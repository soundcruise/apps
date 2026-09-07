import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DEFAULT_ICON_SCALE_PREVIEW,
    ICON_SCALE_PREVIEW_STORAGE_KEY,
    loadIconScalePreview,
    saveIconScalePreview
} from './icon-scale-preview-store.js';

function createStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); }
    };
}

test('comparison defaults to the current 100 percent icon size', () => {
    assert.deepEqual(loadIconScalePreview(createStorage()), { ok: true, value: DEFAULT_ICON_SCALE_PREVIEW });
});

for (const value of ['90', '80', '70']) {
    test(`${value} percent comparison persists across reload`, () => {
        const storage = createStorage();
        assert.deepEqual(saveIconScalePreview(value, storage), { ok: true, value });
        assert.deepEqual(loadIconScalePreview(storage), { ok: true, value });
    });
}

test('invalid comparison values safely fall back to 100 percent', () => {
    const storage = createStorage({ [ICON_SCALE_PREVIEW_STORAGE_KEY]: '55' });
    assert.deepEqual(loadIconScalePreview(storage), { ok: true, value: '100' });
    assert.deepEqual(saveIconScalePreview('invalid', storage), { ok: true, value: '100' });
});
