import assert from 'node:assert/strict';
import test from 'node:test';
import { METRONOME_DEFAULTS, METRONOME_STORAGE_KEY } from './metronome-store.js';
import {
    METRONOME_PRESET_LIMITS,
    METRONOME_PRESETS_SCHEMA_VERSION,
    METRONOME_PRESETS_STORAGE_KEY,
    createMetronomePreset,
    deleteMetronomePreset,
    loadMetronomePresets,
    saveMetronomePresets,
    settingsFromMetronomePreset
} from './metronome-presets-store.js';

function memoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        value(key) { return values.get(key); }
    };
}

function createOne(storage, overrides = {}) {
    return createMetronomePreset({
        presets: [],
        name: '弾き語り練習',
        settings: { ...METRONOME_DEFAULTS, accents: [...METRONOME_DEFAULTS.accents] },
        storage,
        idFactory: () => 'preset-1',
        now: 1000,
        ...overrides
    });
}

test('empty preset store is independent and safe', () => {
    assert.deepEqual(loadMetronomePresets(memoryStorage()), { ok: true, presets: [], ignored: 0 });
    assert.equal(METRONOME_PRESETS_STORAGE_KEY, 'cruisePort.metronomePresets');
    assert.equal(METRONOME_PRESETS_SCHEMA_VERSION, 1);
});

test('create trims and persists a complete named preset', () => {
    const storage = memoryStorage();
    const result = createOne(storage, { name: '  16分練習  ' });
    assert.equal(result.ok, true);
    assert.equal(result.preset.name, '16分練習');
    assert.deepEqual(JSON.parse(storage.value(METRONOME_PRESETS_STORAGE_KEY)), {
        version: 1,
        items: [result.preset]
    });
});

test('reload preserves stable id, settings, and timestamps', () => {
    const storage = memoryStorage();
    const created = createOne(storage);
    assert.deepEqual(loadMetronomePresets(storage).presets, created.presets);
});

test('preset captures all metronome settings', () => {
    const storage = memoryStorage();
    const settings = {
        ...METRONOME_DEFAULTS,
        bpm: 148,
        meter: '6/8',
        rhythm: 'sixteenth',
        accents: [true, true],
        sound: 'rim',
        volume: 88
    };
    const result = createOne(storage, { settings });
    assert.deepEqual(settingsFromMetronomePreset(result.preset), settings);
});

test('preset accents are deep copied from current settings', () => {
    const storage = memoryStorage();
    const settings = { ...METRONOME_DEFAULTS, accents: [...METRONOME_DEFAULTS.accents] };
    const result = createOne(storage, { settings });
    settings.accents[0] = false;
    assert.equal(result.preset.accents[0], true);
    const applied = settingsFromMetronomePreset(result.preset);
    applied.accents[0] = false;
    assert.equal(result.preset.accents[0], true);
});

test('empty and overlong names are rejected', () => {
    const storage = memoryStorage();
    assert.equal(createOne(storage, { name: '   ' }).reason, 'name-required');
    assert.equal(createOne(storage, { name: 'あ'.repeat(METRONOME_PRESET_LIMITS.name + 1) }).reason, 'name-too-long');
});

test('duplicate names are rejected without overwriting', () => {
    const storage = memoryStorage();
    const first = createOne(storage);
    const second = createMetronomePreset({
        presets: first.presets,
        name: '弾き語り練習',
        settings: METRONOME_DEFAULTS,
        storage,
        idFactory: () => 'preset-2',
        now: 2000
    });
    assert.equal(second.reason, 'duplicate-name');
    assert.deepEqual(loadMetronomePresets(storage).presets, first.presets);
});

test('duplicate English names are matched case-insensitively', () => {
    const storage = memoryStorage();
    const first = createOne(storage, { name: 'Ballad' });
    assert.equal(createMetronomePreset({
        presets: first.presets,
        name: 'ballad',
        settings: METRONOME_DEFAULTS,
        storage,
        idFactory: () => 'preset-2',
        now: 2000
    }).reason, 'duplicate-name');
});

test('maximum preset count is 50', () => {
    const storage = memoryStorage();
    const presets = Array.from({ length: METRONOME_PRESET_LIMITS.items }, (_, index) => ({
        id: `preset-${index}`,
        name: `練習${index}`,
        bpm: 120,
        meter: '4/4',
        rhythm: 'quarter',
        accents: [true, false, false, false],
        sound: 'electronic',
        volume: 70,
        createdAt: index,
        updatedAt: index
    }));
    assert.equal(saveMetronomePresets(presets, storage).ok, true);
    assert.equal(createMetronomePreset({
        presets,
        name: '上限超過',
        settings: METRONOME_DEFAULTS,
        storage,
        idFactory: () => 'extra',
        now: 999
    }).reason, 'limit-reached');
});

test('delete removes only the selected preset', () => {
    const storage = memoryStorage();
    const first = createOne(storage);
    const second = createMetronomePreset({
        presets: first.presets,
        name: '高速練習',
        settings: METRONOME_DEFAULTS,
        storage,
        idFactory: () => 'preset-2',
        now: 2000
    });
    const deleted = deleteMetronomePreset({ presets: second.presets, id: 'preset-1', storage });
    assert.equal(deleted.ok, true);
    assert.deepEqual(deleted.presets.map(({ id }) => id), ['preset-2']);
});

test('preset deletion leaves current metronome settings untouched', () => {
    const currentRaw = JSON.stringify(METRONOME_DEFAULTS);
    const storage = memoryStorage({ [METRONOME_STORAGE_KEY]: currentRaw });
    const created = createOne(storage);
    assert.equal(deleteMetronomePreset({ presets: created.presets, id: 'preset-1', storage }).ok, true);
    assert.equal(storage.value(METRONOME_STORAGE_KEY), currentRaw);
});

test('malformed root falls back without overwriting raw data', () => {
    const raw = '{"version":1,"items":"broken"}';
    const storage = memoryStorage({ [METRONOME_PRESETS_STORAGE_KEY]: raw });
    const result = loadMetronomePresets(storage);
    assert.equal(result.ok, false);
    assert.deepEqual(result.presets, []);
    assert.equal(storage.value(METRONOME_PRESETS_STORAGE_KEY), raw);
});

test('malformed item and unknown sound are ignored while valid presets survive', () => {
    const storage = memoryStorage();
    const valid = createOne(storage).preset;
    storage.setItem(METRONOME_PRESETS_STORAGE_KEY, JSON.stringify({
        version: 1,
        items: [valid, { ...valid, id: 'bad', name: '不明音色', sound: 'unknown' }]
    }));
    const result = loadMetronomePresets(storage);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'partial-invalid');
    assert.equal(result.ignored, 1);
    assert.deepEqual(result.presets, [valid]);
});

for (const retiredSound of ['electronic-drum', 'wood']) {
    test(`preset ${retiredSound} migrates to rim while preserving all other fields`, () => {
        const storage = memoryStorage();
        const preset = createOne(storage).preset;
        const retired = { ...preset, sound: retiredSound, volume: 83 };
        storage.setItem(METRONOME_PRESETS_STORAGE_KEY, JSON.stringify({ version: 1, items: [retired] }));
        const result = loadMetronomePresets(storage);
        assert.equal(result.ok, true);
        assert.equal(result.migrated, true);
        assert.deepEqual(result.presets, [{ ...retired, sound: 'rim' }]);
        assert.deepEqual(JSON.parse(storage.value(METRONOME_PRESETS_STORAGE_KEY)), {
            version: 1,
            items: result.presets
        });
    });
}

test('preset migration write failure returns usable data without overwriting raw value', () => {
    const base = memoryStorage();
    const preset = createOne(base).preset;
    const raw = JSON.stringify({ version: 1, items: [{ ...preset, sound: 'wood' }] });
    const storage = {
        getItem: () => raw,
        setItem() { throw new Error('quota'); }
    };
    const result = loadMetronomePresets(storage);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'migration-write-failed');
    assert.equal(result.presets[0].sound, 'rim');
});

test('failed storage write does not mutate the caller preset list', () => {
    const storage = { getItem: () => null, setItem() { throw new Error('quota'); } };
    const presets = [];
    const result = createOne(storage, { presets });
    assert.equal(result.reason, 'write-failed');
    assert.deepEqual(presets, []);
});

console.log('metronome-presets-store: create, reload, apply, duplicate, limit, malformed data, and delete safety passed');
