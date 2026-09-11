import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DEFAULT_GEAR_CATEGORIES,
    GEAR_CATEGORY_SCHEMA_VERSION,
    GEAR_CATEGORY_STORAGE_KEY,
    addGearCategory,
    buildInitialGearCategories,
    deleteGearCategory,
    getGearCategoryName,
    loadGearCategories,
    renameGearCategory,
    saveGearCategories
} from './gear-category-store.js';

function createMemoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
        snapshot() { return Object.fromEntries(values); }
    };
}

function createSharedStoragePair(initial = {}) {
    const values = new Map(Object.entries(initial));
    const create = () => ({
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); }
    });
    return [create(), create()];
}

test('new users receive only the three formal categories in order', () => {
    const storage = createMemoryStorage();
    const result = loadGearCategories([], storage);
    assert.equal(result.ok, true);
    assert.equal(result.initialized, true);
    assert.deepEqual(result.categories, [
        { id: 'guitar', name: 'ギター' },
        { id: 'sound', name: '音作り' },
        { id: 'accessories', name: 'アクセサリー' }
    ]);
    const payload = JSON.parse(storage.snapshot()[GEAR_CATEGORY_STORAGE_KEY]);
    assert.equal(payload.version, GEAR_CATEGORY_SCHEMA_VERSION);
});

test('existing users retain every used legacy category without merging items', () => {
    const items = [
        { category: 'effects' },
        { category: 'guitar' },
        { category: 'dtm' },
        { category: 'effects' },
        { category: 'recording' }
    ];
    assert.deepEqual(buildInitialGearCategories(items), [
        ...DEFAULT_GEAR_CATEGORIES,
        { id: 'effects', name: 'エフェクター' },
        { id: 'dtm', name: 'DTM' },
        { id: 'recording', name: '録音・配信' }
    ]);
    assert.deepEqual(items.map(({ category }) => category), ['effects', 'guitar', 'dtm', 'effects', 'recording']);
    const allLegacy = buildInitialGearCategories([
        { category: 'other' }, { category: 'recording' }, { category: 'dtm' },
        { category: 'amp' }, { category: 'effects' }, { category: 'accessories' }, { category: 'guitar' }
    ]);
    assert.deepEqual(allLegacy.map(({ id }) => id), [
        'guitar', 'sound', 'accessories', 'effects', 'amp', 'dtm', 'recording', 'other'
    ]);
});

test('unknown but valid legacy category is preserved as a stable visible category', () => {
    const categories = buildInitialGearCategories([{ category: 'legacy-pedals' }]);
    assert.equal(categories.at(-1).id, 'legacy-pedals');
    assert.equal(categories.at(-1).name, 'legacy-pedals');
    assert.equal(getGearCategoryName(categories, 'legacy-pedals'), 'legacy-pedals');
    const duplicateName = buildInitialGearCategories([{ category: 'ギター' }]);
    assert.deepEqual(duplicateName.at(-1), { id: 'ギター', name: 'ギター（旧カテゴリ）' });
});

test('adding a category appends it with an independent stable id', () => {
    const result = addGearCategory(DEFAULT_GEAR_CATEGORIES, 'ライブ用品');
    assert.equal(result.ok, true);
    assert.match(result.category.id, /^category-/);
    assert.equal(result.category.name, 'ライブ用品');
    assert.equal(result.categories.at(-1).id, result.category.id);
});

test('category names are trimmed, bounded, and unique', () => {
    assert.equal(addGearCategory(DEFAULT_GEAR_CATEGORIES, '  DTM  ').category.name, 'DTM');
    assert.equal(addGearCategory(DEFAULT_GEAR_CATEGORIES, 'ギター').reason, 'duplicate-name');
    assert.equal(addGearCategory(DEFAULT_GEAR_CATEGORIES, '').reason, 'invalid-name');
    assert.equal(addGearCategory(DEFAULT_GEAR_CATEGORIES, '全て').reason, 'invalid-name');
    assert.equal(addGearCategory(DEFAULT_GEAR_CATEGORIES, '長'.repeat(41)).reason, 'invalid-name');
});

test('rename changes only the label and preserves the category id', () => {
    const before = DEFAULT_GEAR_CATEGORIES.map((category) => ({ ...category }));
    const result = renameGearCategory(before, 'sound', 'エフェクター・アンプ');
    assert.equal(result.ok, true);
    assert.deepEqual(result.categories.find(({ id }) => id === 'sound'), {
        id: 'sound',
        name: 'エフェクター・アンプ'
    });
    assert.equal(before.find(({ id }) => id === 'sound').name, '音作り');
});

test('rename requires no gear item rewrite and preserves photo, status, and order references', () => {
    const item = Object.freeze({
        id: 'gear-1',
        category: 'sound',
        status: 'owned',
        order: 3,
        photoId: 'photo-final',
        photoSourceId: 'photo-source',
        photoCrop: Object.freeze({ x: 0.1, y: 0.2, size: 0.8 })
    });
    const snapshot = structuredClone(item);
    const renamed = renameGearCategory(DEFAULT_GEAR_CATEGORIES, item.category, '音響機材');
    assert.equal(renamed.ok, true);
    assert.equal(renamed.categories.find(({ id }) => id === item.category).name, '音響機材');
    assert.deepEqual(item, snapshot);
});

test('all is not a persisted category and therefore cannot be renamed', () => {
    assert.equal(renameGearCategory(DEFAULT_GEAR_CATEGORIES, 'all', '全部').reason, 'not-found');
    assert.equal(DEFAULT_GEAR_CATEGORIES.some(({ id }) => id === 'all'), false);
});

test('deleting an empty category removes only its definition and permits an empty category list', () => {
    const item = Object.freeze({
        id: 'gear-1',
        category: 'sound',
        photoId: 'photo-final',
        photoSourceId: 'photo-source',
        photoCrop: Object.freeze({ x: 0.1, y: 0.2, size: 0.8 }),
        status: 'owned',
        order: 2
    });
    const snapshot = structuredClone(item);
    const removed = deleteGearCategory(DEFAULT_GEAR_CATEGORIES, 'guitar');
    assert.equal(removed.ok, true);
    assert.deepEqual(removed.categories.map(({ id }) => id), ['sound', 'accessories']);
    assert.deepEqual(item, snapshot);

    const withoutSound = deleteGearCategory(removed.categories, 'sound');
    const withoutAccessories = deleteGearCategory(withoutSound.categories, 'accessories');
    assert.equal(withoutAccessories.ok, true);
    assert.deepEqual(withoutAccessories.categories, []);
    const storage = createMemoryStorage();
    assert.equal(saveGearCategories(withoutAccessories.categories, storage).ok, true);
    assert.deepEqual(loadGearCategories([], storage).categories, []);
});

test('deleted category ids are not reused when a category with the same name is created again', () => {
    const first = addGearCategory(DEFAULT_GEAR_CATEGORIES, 'ライブ用');
    const removed = deleteGearCategory(first.categories, first.category.id);
    const recreated = addGearCategory(removed.categories, 'ライブ用');
    assert.equal(recreated.ok, true);
    assert.notEqual(recreated.category.id, first.category.id);
});

test('all and unknown category ids cannot be deleted', () => {
    assert.equal(deleteGearCategory(DEFAULT_GEAR_CATEGORIES, 'all').reason, 'not-found');
    assert.equal(deleteGearCategory(DEFAULT_GEAR_CATEGORIES, 'missing').reason, 'not-found');
});

test('reload preserves additions and renames without touching gear data', () => {
    const storage = createMemoryStorage({ 'cruisePort.gearList': 'gear-data' });
    const initial = loadGearCategories([], storage);
    const added = addGearCategory(initial.categories, 'ケーブル');
    const renamed = renameGearCategory(added.categories, 'guitar', '弦楽器');
    assert.equal(saveGearCategories(renamed.categories, storage).ok, true);
    assert.deepEqual(loadGearCategories([], storage).categories, renamed.categories);
    assert.equal(storage.snapshot()['cruisePort.gearList'], 'gear-data');
});

test('initialization is idempotent and does not duplicate used legacy categories', () => {
    const storage = createMemoryStorage();
    const items = [{ category: 'amp' }, { category: 'amp' }];
    const first = loadGearCategories(items, storage);
    const second = loadGearCategories(items, storage);
    assert.equal(first.categories.filter(({ id }) => id === 'amp').length, 1);
    assert.deepEqual(second.categories, first.categories);
    assert.equal(Object.hasOwn(second, 'initialized'), false);
});

test('a missing association is repaired without rewriting the item', () => {
    const storage = createMemoryStorage();
    loadGearCategories([], storage);
    const item = { category: 'other' };
    const result = loadGearCategories([item], storage);
    assert.equal(result.ok, true);
    assert.equal(result.repaired, true);
    assert.equal(result.categories.some(({ id }) => id === 'other'), true);
    assert.equal(item.category, 'other');
});

test('malformed category settings remain untouched and fall back safely in memory', () => {
    const raw = JSON.stringify({ version: 99, categories: [] });
    const storage = createMemoryStorage({ [GEAR_CATEGORY_STORAGE_KEY]: raw });
    const result = loadGearCategories([{ category: 'amp' }], storage);
    assert.equal(result.ok, false);
    assert.equal(result.categories.some(({ id }) => id === 'amp'), true);
    assert.equal(storage.snapshot()[GEAR_CATEGORY_STORAGE_KEY], raw);
});

test('stale tab rename cannot overwrite a newer category addition', () => {
    const [tabA, tabB] = createSharedStoragePair();
    const stateA = loadGearCategories([], tabA);
    const stateB = loadGearCategories([], tabB);
    const added = addGearCategory(stateA.categories, '配信機材');
    assert.equal(saveGearCategories(added.categories, tabA).ok, true);
    const staleRename = renameGearCategory(stateB.categories, 'guitar', 'アコギ');
    assert.equal(saveGearCategories(staleRename.categories, tabB).ok, false);
    assert.equal(loadGearCategories([], tabA).categories.some(({ name }) => name === '配信機材'), true);
});

test('stale tab addition cannot overwrite a newer category rename', () => {
    const [tabA, tabB] = createSharedStoragePair();
    const stateA = loadGearCategories([], tabA);
    const stateB = loadGearCategories([], tabB);
    const renamed = renameGearCategory(stateA.categories, 'guitar', 'アコギ');
    assert.equal(saveGearCategories(renamed.categories, tabA).ok, true);
    const staleAdd = addGearCategory(stateB.categories, 'ライブ用品');
    assert.equal(saveGearCategories(staleAdd.categories, tabB).ok, false);
    assert.equal(loadGearCategories([], tabA).categories.find(({ id }) => id === 'guitar').name, 'アコギ');
});

test('stale tab deletion cannot overwrite a newer category addition', () => {
    const [tabA, tabB] = createSharedStoragePair();
    const stateA = loadGearCategories([], tabA);
    const stateB = loadGearCategories([], tabB);
    const added = addGearCategory(stateA.categories, '配信機材');
    assert.equal(saveGearCategories(added.categories, tabA).ok, true);
    const staleDelete = deleteGearCategory(stateB.categories, 'guitar');
    assert.equal(saveGearCategories(staleDelete.categories, tabB).ok, false);
    assert.equal(loadGearCategories([], tabA).categories.some(({ name }) => name === '配信機材'), true);
});
