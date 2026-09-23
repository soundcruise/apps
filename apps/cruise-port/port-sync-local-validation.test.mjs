import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePortLocalCollections } from './port-sync-local-validation.js';

function storage(entries = {}) {
    const values = new Map(Object.entries(entries));
    let writes = 0;
    return {
        getItem(key) { return values.get(key) ?? null; },
        setItem(key, value) { writes += 1; values.set(key, String(value)); },
        get writes() { return writes; },
        snapshot() { return [...values]; }
    };
}

const urls = { web: '', windows: '', macos: '', android: '', ios: 'https://example.com/ios' };
const app = {
    updatedAt: '2026-09-23T00:00:00.000Z', createdAt: '2026-09-23T00:00:00.000Z',
    urls, iconPresetKey: null, iconCrop: null, iconSourceId: null, iconId: null,
    customLaunch: null, appKey: null, launchMode: 'https', url: '', name: 'QA', id: 'app-1'
};

test('the authoritative store validators accept a mixed My Apps envelope without rewriting original bytes', () => {
    const target = storage({ 'cruisePort.myApps': JSON.stringify({ version: 6, items: [app] }) });
    const before = target.snapshot();
    assert.equal(validatePortLocalCollections(target), true);
    assert.deepEqual(target.snapshot(), before);
    assert.equal(target.writes, 0);
});

test('older Gear, Practice History and missing optional My Apps fields remain readable without migration writes', () => {
    const { iconPresetKey, ...withoutPreset } = app;
    const target = storage({
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [withoutPreset] }),
        'cruisePort.gearList': JSON.stringify({ version: 1, items: [] }),
        'cruisePort.practiceHistory': JSON.stringify({ version: 4, events: [] })
    });
    const before = target.snapshot();
    assert.equal(validatePortLocalCollections(target), true);
    assert.deepEqual(target.snapshot(), before);
    assert.equal(target.writes, 0);
});

test('the authoritative store validators reject malformed collections and malformed items', () => {
    for (const [key, value] of [
        ['cruisePort.myApps', { version: 7, items: {} }],
        ['cruisePort.myApps', { version: 7, items: [{ ...app, name: 123 }] }],
        ['cruisePort.gearList', { version: 5, items: [{ id: 'gear-1' }] }],
        ['cruisePort.practiceMenus', { version: 3, items: [{ id: 'menu-1' }] }],
        ['cruisePort.practiceHistory', { version: 5, events: [{ id: 'history-1' }] }],
        ['cruisePort.metronomePresets', { version: 1, items: [{ id: 'preset-1' }] }]
    ]) {
        const target = storage({ [key]: JSON.stringify(value) });
        assert.throws(() => validatePortLocalCollections(target), /port_storage_invalid/u, key);
        assert.equal(target.writes, 0);
    }
});
