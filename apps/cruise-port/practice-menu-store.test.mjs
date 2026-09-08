import assert from 'node:assert/strict';
import {
    APP_DEFINITIONS,
    SCHEMA_VERSION,
    STORAGE_KEYS,
    createPracticeMenu,
    deletePracticeMenu,
    isValidPracticeAppId,
    loadPracticeMenus,
    savePracticeMenus,
    updatePracticeMenu
} from './practice-menu-store.js';

class FakeStorage {
    constructor(entries = {}) {
        this.entries = new Map(Object.entries(entries));
        this.writes = [];
        this.failNextWriteFor = null;
    }

    getItem(key) {
        return this.entries.has(key) ? this.entries.get(key) : null;
    }

    setItem(key, value) {
        this.writes.push([key, value]);
        if (this.failNextWriteFor === key) {
            this.failNextWriteFor = null;
            throw new Error('write failed');
        }
        this.entries.set(key, value);
    }

    removeItem(key) {
        this.entries.delete(key);
    }
}

const timestamp = '2026-09-07T00:00:00.000Z';
const baseItem = Object.freeze({
    id: 'practice-1',
    name: '基礎練習',
    durationMinutes: 10,
    appId: 'pitch',
    memo: '',
    hidden: false,
    createdAt: timestamp,
    updatedAt: timestamp
});

assert.equal(SCHEMA_VERSION, 3);
assert.deepEqual(Object.keys(APP_DEFINITIONS), ['pitch', 'fretboard', 'rhythm', 'chord', 'metronome', 'tuner']);

{
    const { hidden, ...legacyItem } = baseItem;
    const raw = JSON.stringify({ version: 1, items: [legacyItem] });
    const storage = new FakeStorage({
        [STORAGE_KEYS.schemaVersion]: '1',
        [STORAGE_KEYS.practiceMenus]: raw
    });
    assert.deepEqual(loadPracticeMenus(storage), { ok: true, items: [baseItem], migrated: true });
    assert.equal(storage.getItem(STORAGE_KEYS.practiceMenus), raw, 'v1 load must not rewrite the payload');
    assert.equal(storage.writes.length, 0, 'v1 migration is in memory only');
    assert.deepEqual(savePracticeMenus([baseItem], storage), { ok: true });
    assert.equal(storage.getItem(STORAGE_KEYS.schemaVersion), '3');
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.practiceMenus)).version, 3);
}

for (const appId of Object.keys(APP_DEFINITIONS)) {
    assert.deepEqual(savePracticeMenus([{ ...baseItem, appId }], new FakeStorage()), { ok: true }, `${appId} remains valid`);
}

for (const [appId, expected] of [
    [null, true],
    ['myapp:opaque-id', true],
    ['myapp:', false],
    [`myapp:${'x'.repeat(128)}`, true],
    [`myapp:${'x'.repeat(129)}`, false],
    ['future-app', true],
    ['', false],
    ['   ', false],
    ['bad\napp', false],
    ['bad\u0085app', false]
]) {
    assert.equal(isValidPracticeAppId(appId), expected, appId);
    assert.equal(savePracticeMenus([{ ...baseItem, appId }], new FakeStorage()).ok, expected, `save ${appId}`);
}

{
    const { hidden, ...legacyItem } = baseItem;
    const future = { ...legacyItem, appId: 'future-app' };
    const storage = new FakeStorage({
        [STORAGE_KEYS.schemaVersion]: '2',
        [STORAGE_KEYS.practiceMenus]: JSON.stringify({ version: 2, items: [future] })
    });
    assert.deepEqual(loadPracticeMenus(storage), {
        ok: true,
        items: [{ ...future, hidden: false }],
        migrated: true
    });
}

for (const version of [0, 4, 999]) {
    const raw = JSON.stringify({ version, items: [] });
    const storage = new FakeStorage({
        [STORAGE_KEYS.schemaVersion]: String(version),
        [STORAGE_KEYS.practiceMenus]: raw
    });
    assert.deepEqual(loadPracticeMenus(storage), { ok: false, items: [], reason: 'unsupported-version' });
    assert.equal(storage.getItem(STORAGE_KEYS.practiceMenus), raw, 'unsupported data is not overwritten');
}

{
    const { hidden, ...legacyItem } = baseItem;
    const raw = JSON.stringify({ version: 1, items: [legacyItem] });
    const storage = new FakeStorage({
        [STORAGE_KEYS.schemaVersion]: '01',
        [STORAGE_KEYS.practiceMenus]: raw
    });
    assert.deepEqual(loadPracticeMenus(storage), { ok: false, items: [], reason: 'unsupported-version' });
}

{
    const { hidden, ...legacyItem } = baseItem;
    const storage = new FakeStorage({
        [STORAGE_KEYS.schemaVersion]: '1',
        [STORAGE_KEYS.practiceMenus]: JSON.stringify({ version: 2, items: [legacyItem] })
    });
    assert.deepEqual(loadPracticeMenus(storage), { ok: false, items: [], reason: 'invalid-data' });
}

for (const item of [
    { ...baseItem, appId: '' },
    { ...baseItem, appId: 1 },
    { ...baseItem, appId: 'myapp:' },
    { ...baseItem, appId: `myapp:${'x'.repeat(129)}` },
    { ...baseItem, appId: 'bad\u0000value' },
    { ...baseItem, hidden: 'false' }
]) {
    const raw = JSON.stringify({ version: 3, items: [item] });
    const storage = new FakeStorage({
        [STORAGE_KEYS.schemaVersion]: '3',
        [STORAGE_KEYS.practiceMenus]: raw
    });
    assert.equal(loadPracticeMenus(storage).ok, false);
    assert.equal(storage.getItem(STORAGE_KEYS.practiceMenus), raw, 'malformed data is not overwritten');
}

{
    const withoutApp = { ...baseItem, appId: null };
    const storage = new FakeStorage();
    assert.deepEqual(savePracticeMenus([withoutApp], storage), { ok: true });
    assert.deepEqual(loadPracticeMenus(storage), { ok: true, items: [withoutApp] });
    const secondWithoutApp = { ...withoutApp, id: 'practice-2', name: '2件目' };
    assert.deepEqual(
        savePracticeMenus([baseItem, secondWithoutApp], storage),
        { ok: true },
        'array index is never mistaken for a legacy schema version during validation'
    );
}

{
    const created = createPracticeMenu({
        name: 'アプリなし練習', durationMinutes: 20, appId: null, memo: '運指のみ'
    }, [], new Date(timestamp));
    assert.equal(created.appId, null);
    assert.equal(created.hidden, false);
    assert.equal(created.createdAt, timestamp);
    const updated = updatePracticeMenu([created], created.id, {
        name: created.name, durationMinutes: 25, appId: 'tuner', memo: created.memo
    }, new Date('2026-09-07T01:00:00.000Z'));
    assert.equal(updated.found, true);
    assert.equal(updated.items[0].appId, 'tuner');
    assert.equal(updated.items[0].createdAt, timestamp);
    const removed = deletePracticeMenu(updated.items, created.id);
    assert.equal(removed.found, true);
    assert.deepEqual(removed.items, []);
}

{
    const { hidden, ...legacyItem } = baseItem;
    const legacyWithoutApp = { ...legacyItem, appId: null };
    const storage = new FakeStorage({
        [STORAGE_KEYS.schemaVersion]: '1',
        [STORAGE_KEYS.practiceMenus]: JSON.stringify({ version: 1, items: [legacyWithoutApp] })
    });
    assert.equal(loadPracticeMenus(storage).ok, false, 'v1 keeps its original builtin-app requirement');
}

{
    const { hidden, ...legacyItem } = baseItem;
    const previousPayload = JSON.stringify({ version: 1, items: [legacyItem] });
    const storage = new FakeStorage({
        [STORAGE_KEYS.schemaVersion]: '1',
        [STORAGE_KEYS.practiceMenus]: previousPayload
    });
    storage.failNextWriteFor = STORAGE_KEYS.practiceMenus;
    assert.deepEqual(savePracticeMenus([baseItem], storage), { ok: false, reason: 'write-failed' });
    assert.equal(storage.getItem(STORAGE_KEYS.schemaVersion), '1', 'schema key rolls back');
    assert.equal(storage.getItem(STORAGE_KEYS.practiceMenus), previousPayload, 'payload remains intact');
}

console.log('practice-menu-store: schema v3, v1/v2 migration, hidden state, references, and rollback passed');
