import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DEFAULT_SETTINGS,
    SETTINGS_SCHEMA_VERSION,
    SETTINGS_STORAGE_KEY,
    clearRetiredIconScalePreviewKeys,
    loadSettings,
    normalizeSettings,
    normalizeSectionOrder,
    moveHomeSection,
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

test('settings default to standard / medium / default order', () => {
    assert.deepEqual(loadSettings(createStorage()), { ok: true, settings: DEFAULT_SETTINGS });
});

for (const displaySize of ['large', 'standard', 'small', 'xsmall']) {
    test(`settings save ${displaySize} and persist across reload`, () => {
        const storage = createStorage();
        const saved = saveSettings({ displaySize }, storage);
        const expected = { ...DEFAULT_SETTINGS, displaySize };
        assert.deepEqual(saved, { ok: true, settings: expected });
        assert.deepEqual(loadSettings(storage), { ok: true, settings: expected });
    });
}

test('invalid settings safely fall back to standard', () => {
    const storage = createStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ displaySize: 'wide' }) });
    assert.deepEqual(loadSettings(storage), { ok: true, settings: DEFAULT_SETTINGS });
});

for (const displaySize of ['large', 'standard', 'small', 'xsmall']) {
    test(`schema v2 ${displaySize} remains unchanged after reload`, () => {
        const storage = createStorage({
            [SETTINGS_STORAGE_KEY]: JSON.stringify({ version: 2, displaySize })
        });
        const expected = { ...DEFAULT_SETTINGS, displaySize };
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
        const expected = { ...DEFAULT_SETTINGS, displaySize };
        assert.deepEqual(loadSettings(storage), { ok: true, settings: expected });
        assert.equal(storage.setCalls, 1);
        assert.deepEqual(loadSettings(storage), { ok: true, settings: expected });
        assert.equal(storage.setCalls, 1, 'the v2 record is not migrated again');
    });
}

for (const fontSize of ['small', 'medium', 'large', 'xlarge']) {
    test(`font ${fontSize}, order and display size persist independently`, () => {
        const storage = createStorage();
        const settings = { ...DEFAULT_SETTINGS, displaySize: 'xsmall', fontSize, sectionOrder: ['myApps', 'tools', 'cruiseApps'] };
        assert.equal(saveSettings(settings, storage).ok, true);
        assert.deepEqual(loadSettings(storage).settings, settings);
    });
}

test('malformed fields and section permutations normalize without mutating input', () => {
    assert.deepEqual(normalizeSettings({displaySize: 'bad', fontSize: 'bad', sectionOrder: []}), DEFAULT_SETTINGS);
    for (const value of [null, {}, '', [], ['unknown']]) assert.deepEqual(normalizeSectionOrder(value), DEFAULT_SETTINGS.sectionOrder);
    assert.deepEqual(normalizeSectionOrder(['myApps', 'myApps', 'unknown']), ['myApps', 'cruiseApps', 'tools']);
    assert.deepEqual(moveHomeSection(DEFAULT_SETTINGS.sectionOrder, 'myApps', -1), ['cruiseApps', 'myApps', 'tools']);
    assert.deepEqual(moveHomeSection(DEFAULT_SETTINGS.sectionOrder, 'cruiseApps', 1), ['tools', 'cruiseApps', 'myApps']);
    assert.deepEqual(moveHomeSection(DEFAULT_SETTINGS.sectionOrder, 'cruiseApps', -1), DEFAULT_SETTINGS.sectionOrder);
});

test('stale tab order and reset cannot overwrite a newer font setting', () => {
    const shared = createStorage();
    const tab = () => ({ getItem: k => shared.getItem(k), setItem: (k,v) => shared.setItem(k,v) });
    const a = tab(), b = tab();
    const first = loadSettings(a).settings, stale = loadSettings(b).settings;
    assert.equal(saveSettings({...first,fontSize:'xlarge'},a).ok,true);
    assert.equal(saveSettings({...stale,sectionOrder:['tools','cruiseApps','myApps']},b).ok,false);
    assert.equal(saveSettings(DEFAULT_SETTINGS,b).ok,false);
    assert.equal(JSON.parse(shared.getItem(SETTINGS_STORAGE_KEY)).fontSize,'xlarge');
});

test('settings reset writes only its key and migration keeps conflict snapshot current', () => {
    const preserved = ['auth','tuner','metronome','presets','practice','history','calendar','timer','myApps','gear'];
    const storage = createStorage(Object.fromEntries(preserved.map(k=>[k,'keep'])));
    loadSettings(storage);
    saveSettings({...DEFAULT_SETTINGS,fontSize:'large'},storage);
    assert.equal(saveSettings(DEFAULT_SETTINGS,storage).ok,true);
    preserved.forEach(k=>assert.equal(storage.getItem(k),'keep'));
    assert.deepEqual(storage.removedKeys,[]);
    const legacy=createStorage({[SETTINGS_STORAGE_KEY]:JSON.stringify({displaySize:'large'})});
    const migrated=loadSettings(legacy);
    assert.equal(saveSettings({...migrated.settings,fontSize:'large'},legacy).ok,true);
});
