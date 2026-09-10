import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canCreatePractice } from './practice-capabilities.js';
import {
    INITIAL_PRACTICE_MENU_VALUES,
    SCHEMA_VERSION,
    STORAGE_KEYS,
    deletePracticeMenu,
    initializePracticeMenus,
    loadPracticeMenus,
    savePracticeMenus,
    updatePracticeMenu
} from './practice-menu-store.js';
import {
    PRACTICE_NAME_PRESET_CUSTOM,
    PRACTICE_NAME_PRESETS,
    getPracticeNamePreset
} from './practice-menu-presets.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const source = read('practice-menu-app.js');

class FakeStorage {
    constructor(entries = {}) {
        this.entries = new Map(Object.entries(entries));
        this.writes = [];
    }

    getItem(key) {
        return this.entries.has(key) ? this.entries.get(key) : null;
    }

    setItem(key, value) {
        this.writes.push([key, value]);
        this.entries.set(key, value);
    }

    removeItem(key) {
        this.entries.delete(key);
    }
}

const now = new Date('2026-09-11T00:00:00.000Z');

test('only a never-initialized Practice store receives one normal 曲練 item', () => {
    const storage = new FakeStorage();
    const fresh = loadPracticeMenus(storage);
    assert.deepEqual(fresh, { ok: true, items: [], uninitialized: true });

    const initialized = initializePracticeMenus(fresh, storage, now);
    assert.equal(initialized.ok, true);
    assert.equal(initialized.items.length, 1);
    assert.deepEqual(
        Object.fromEntries(Object.keys(INITIAL_PRACTICE_MENU_VALUES).map((key) => [key, initialized.items[0][key]])),
        INITIAL_PRACTICE_MENU_VALUES
    );
    assert.equal(Object.hasOwn(initialized.items[0], 'attachment'), false);
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.practiceMenus)).version, 3);
    assert.equal(storage.getItem(STORAGE_KEYS.schemaVersion), '3');
});

test('deleting the initial item and reloading never recreates it', () => {
    const storage = new FakeStorage();
    const initialized = initializePracticeMenus(loadPracticeMenus(storage), storage, now);
    const removed = deletePracticeMenu(initialized.items, initialized.items[0].id);
    assert.equal(removed.found, true);
    assert.equal(savePracticeMenus(removed.items, storage).ok, true);

    const reloaded = loadPracticeMenus(storage);
    assert.deepEqual(reloaded, { ok: true, items: [] });
    assert.equal(initializePracticeMenus(reloaded, storage, now), reloaded);
    assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.practiceMenus)).items, []);
});

test('saved empty and existing stores are not treated as new', () => {
    const emptyStorage = new FakeStorage({
        [STORAGE_KEYS.schemaVersion]: '3',
        [STORAGE_KEYS.practiceMenus]: JSON.stringify({ version: 3, items: [] })
    });
    const empty = loadPracticeMenus(emptyStorage);
    assert.equal(initializePracticeMenus(empty, emptyStorage, now), empty);
    assert.equal(emptyStorage.writes.length, 0);

    const existingStorage = new FakeStorage();
    const initial = initializePracticeMenus(loadPracticeMenus(existingStorage), existingStorage, now);
    existingStorage.writes.length = 0;
    const existing = loadPracticeMenus(existingStorage);
    assert.equal(initializePracticeMenus(existing, existingStorage, now), existing);
    assert.equal(existingStorage.writes.length, 0);
    assert.deepEqual(existing.items, initial.items);
});

test('initial 曲練 remains editable, deletable and counts toward the Standard limit', () => {
    const storage = new FakeStorage();
    const [item] = initializePracticeMenus(loadPracticeMenus(storage), storage, now).items;
    const edited = updatePracticeMenu([item], item.id, {
        name: '曲練 EDIT', durationMinutes: 20, appId: 'metronome', memo: 'memo', hidden: true
    }, new Date('2026-09-11T01:00:00.000Z'));
    assert.equal(edited.found, true);
    assert.equal(edited.items[0].name, '曲練 EDIT');
    assert.equal(edited.items[0].hidden, true);
    assert.equal(deletePracticeMenu(edited.items, item.id).items.length, 0);
    assert.equal(canCreatePractice([item], { practiceMenuCreateLimit: 5 }), true);
    assert.equal(canCreatePractice(Array(5).fill(item), { practiceMenuCreateLimit: 5 }), false);
});

test('name presets have the formal order and only three builtin app suggestions', () => {
    assert.equal(PRACTICE_NAME_PRESET_CUSTOM, 'custom');
    assert.deepEqual(PRACTICE_NAME_PRESETS.map(({ label }) => label), [
        '自由記入', '音感練', 'リズム練', '指板練', '基礎練習', 'スケール練', '曲練', '作曲', '譜面作り'
    ]);
    assert.deepEqual(PRACTICE_NAME_PRESETS.map(({ appId }) => appId ?? null), [
        null, 'pitch', 'rhythm', 'fretboard', null, null, null, null, null
    ]);
    assert.equal(getPracticeNamePreset('invalid').value, PRACTICE_NAME_PRESET_CUSTOM);
});

test('Standard and Pro share the create preset and preserve the edit text input', () => {
    for (const file of ['index.html', 'pro_9a3943176561/index.html']) {
        const markup = read(file);
        assert.match(markup, /id="practice-name-preset" name="namePreset"/);
        assert.match(markup, /id="practice-name" name="name" type="text" maxlength="100"/);
    }
    assert.match(source, /elements\.namePresetInput\.hidden = !isCreate/);
    assert.match(source, /elements\.nameInput\.hidden = isCreate && !customName/);
    assert.match(source, /state\.formMode === 'create'[\s\S]*getPracticeNamePreset/);
});

test('preset selection suggests an app only on change and submit respects the current app select', () => {
    assert.match(source, /namePresetInput\.addEventListener\('change', handlePracticeNamePresetChange\)/);
    assert.match(source, /if \(preset\.appId\) elements\.appInput\.value = preset\.appId/);
    const readForm = source.slice(source.indexOf('function readFormValues'), source.indexOf('function persist(candidateItems)'));
    assert.match(readForm, /const selectedAppId = elements\.appInput\.value/);
    assert.doesNotMatch(readForm, /preset\.appId/);
});

test('schema, pending files, Live icon and edition limits stay unchanged', () => {
    assert.equal(SCHEMA_VERSION, 3);
    assert.match(source, /savePendingPracticeAttachments\(practiceAttachmentStore, item\.id, pending\)/);
    assert.match(source, /live: \[\['path',[\s\S]*M3\.3 20\.2c-1-1-1-2\.5/);
    assert.match(source, /guardPracticeCreation\(\)/);
    assert.match(read('app-version.js'), /CRUISE_PORT_APP_VERSION = '0\.26\.2'/);
});
