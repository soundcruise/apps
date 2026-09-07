import assert from 'node:assert/strict';
import test from 'node:test';
import {
    GEAR_CATEGORIES,
    GEAR_LIST_SCHEMA_VERSION,
    GEAR_LIST_STORAGE_KEY,
    createGearItem,
    deleteGearItem,
    getGearCategoryLabel,
    loadGearList,
    markGearPurchased,
    normalizeGearUrl,
    saveGearList,
    selectGearItems,
    updateGearItem,
    validateGearValues
} from './gear-list-store.js';

function createMemoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
        snapshot() { return Object.fromEntries(values); }
    };
}

const baseValues = Object.freeze({
    name: 'Martin D-28',
    category: 'guitar',
    manufacturer: 'Martin',
    url: 'https://example.com/guitar',
    priceYen: 480000,
    priority: 'medium',
    memo: 'メイン候補',
    status: 'wishlist'
});
const firstDate = new Date('2026-01-01T00:00:00.000Z');
const secondDate = new Date('2026-02-01T00:00:00.000Z');

test('empty storage starts with version 1 compatible empty data', () => {
    assert.deepEqual(loadGearList(createMemoryStorage()), { ok: true, items: [] });
    assert.equal(GEAR_LIST_SCHEMA_VERSION, 1);
});

test('creates owned and wishlist items with stable timestamps', () => {
    const wishlist = createGearItem(baseValues, [], firstDate);
    const owned = createGearItem({ ...baseValues, status: 'owned' }, [wishlist], firstDate);
    assert.equal(wishlist.status, 'wishlist');
    assert.equal(wishlist.ownedAt, null);
    assert.equal(owned.status, 'owned');
    assert.equal(owned.ownedAt, firstDate.toISOString());
    assert.notEqual(wishlist.id, owned.id);
});

test('validates required name, fixed category, and optional manufacturer', () => {
    assert.equal(validateGearValues({ ...baseValues, name: '   ' }).field, 'name');
    assert.equal(validateGearValues({ ...baseValues, category: 'custom' }).field, 'category');
    assert.equal(validateGearValues({ ...baseValues, manufacturer: 'x'.repeat(101) }).field, 'manufacturer');
    const result = validateGearValues({ ...baseValues, name: '  D-28  ', manufacturer: '  Martin  ' });
    assert.equal(result.ok, true);
    assert.equal(result.values.name, 'D-28');
    assert.equal(result.values.manufacturer, 'Martin');
});

test('accepts safe http and https URLs and rejects unsafe URLs', () => {
    assert.equal(normalizeGearUrl('').value, '');
    assert.equal(normalizeGearUrl('http://example.com/item').ok, true);
    assert.equal(normalizeGearUrl('https://example.com/item').ok, true);
    for (const value of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/a', 'https://user:pass@example.com/']) {
        assert.equal(normalizeGearUrl(value).ok, false, value);
    }
});

test('validates optional non-negative integer price', () => {
    assert.equal(validateGearValues({ ...baseValues, priceYen: '' }).values.priceYen, null);
    assert.equal(validateGearValues({ ...baseValues, priceYen: '0' }).values.priceYen, 0);
    assert.equal(validateGearValues({ ...baseValues, priceYen: '-1' }).field, 'priceYen');
    assert.equal(validateGearValues({ ...baseValues, priceYen: '1.5' }).field, 'priceYen');
});

test('validates priority, status, and memo', () => {
    assert.equal(validateGearValues({ ...baseValues, priority: 'urgent' }).field, 'priority');
    assert.equal(validateGearValues({ ...baseValues, status: 'sold' }).field, 'status');
    assert.equal(validateGearValues({ ...baseValues, memo: 'x'.repeat(1001) }).field, 'memo');
});

test('saves and loads a version 1 payload without changing other keys', () => {
    const storage = createMemoryStorage({ 'cruisePort.practiceMenus': 'keep' });
    const item = createGearItem(baseValues, [], firstDate);
    assert.deepEqual(saveGearList([item], storage), { ok: true });
    assert.equal(loadGearList(storage).items[0].id, item.id);
    assert.equal(storage.snapshot()['cruisePort.practiceMenus'], 'keep');
    assert.equal(JSON.parse(storage.snapshot()[GEAR_LIST_STORAGE_KEY]).version, 1);
});

test('malformed and unknown-version payloads remain untouched', () => {
    for (const raw of ['{broken', JSON.stringify({ version: 99, items: [] })]) {
        const storage = createMemoryStorage({ [GEAR_LIST_STORAGE_KEY]: raw });
        assert.equal(loadGearList(storage).ok, false);
        assert.equal(storage.snapshot()[GEAR_LIST_STORAGE_KEY], raw);
    }
});

test('rejects duplicate IDs and unknown categories while loading', () => {
    const item = createGearItem(baseValues, [], firstDate);
    const duplicateStorage = createMemoryStorage({
        [GEAR_LIST_STORAGE_KEY]: JSON.stringify({ version: 1, items: [item, item] })
    });
    assert.equal(loadGearList(duplicateStorage).ok, false);
    const invalidStorage = createMemoryStorage({
        [GEAR_LIST_STORAGE_KEY]: JSON.stringify({ version: 1, items: [{ ...item, category: 'custom' }] })
    });
    assert.equal(loadGearList(invalidStorage).ok, false);
    assert.equal(getGearCategoryLabel('custom'), 'その他');
});

test('save failure restores the dedicated key', () => {
    const oldValue = JSON.stringify({ version: 1, items: [] });
    let value = oldValue;
    let writes = 0;
    const storage = {
        getItem() { return value; },
        setItem(_key, next) {
            writes += 1;
            value = next;
            if (writes === 1) throw new Error('quota');
        },
        removeItem() { value = null; }
    };
    const item = createGearItem(baseValues, [], firstDate);
    assert.equal(saveGearList([item], storage).ok, false);
    assert.equal(value, oldValue);
});

test('edit preserves ID and createdAt while updating fields', () => {
    const item = createGearItem(baseValues, [], firstDate);
    const result = updateGearItem([item], item.id, { ...baseValues, name: 'Updated' }, secondDate);
    assert.equal(result.found, true);
    assert.equal(result.items[0].id, item.id);
    assert.equal(result.items[0].createdAt, item.createdAt);
    assert.equal(result.items[0].name, 'Updated');
    assert.equal(result.items[0].updatedAt, secondDate.toISOString());
});

test('delete returns a candidate without mutating the source', () => {
    const item = createGearItem(baseValues, [], firstDate);
    const result = deleteGearItem([item], item.id);
    assert.equal(result.found, true);
    assert.equal(result.items.length, 0);
    assert.equal(item.name, baseValues.name);
});

test('wishlist purchase preserves ID and fields and adds ownedAt', () => {
    const item = createGearItem(baseValues, [], firstDate);
    const result = markGearPurchased([item], item.id, secondDate);
    const purchased = result.items[0];
    assert.equal(result.found, true);
    assert.equal(purchased.id, item.id);
    assert.equal(purchased.name, item.name);
    assert.equal(purchased.category, item.category);
    assert.equal(purchased.manufacturer, item.manufacturer);
    assert.equal(purchased.url, item.url);
    assert.equal(purchased.priceYen, item.priceYen);
    assert.equal(purchased.memo, item.memo);
    assert.equal(purchased.status, 'owned');
    assert.equal(purchased.ownedAt, secondDate.toISOString());
});

test('owned item can be repaired back to wishlist', () => {
    const owned = createGearItem({ ...baseValues, status: 'owned' }, [], firstDate);
    const result = updateGearItem([owned], owned.id, { ...baseValues, status: 'wishlist' }, secondDate);
    assert.equal(result.items[0].status, 'wishlist');
    assert.equal(result.items[0].ownedAt, null);
});

test('filters owned and wishlist items by category and all', () => {
    const ownedGuitar = createGearItem({ ...baseValues, name: 'Owned', status: 'owned' }, [], firstDate);
    const ownedAmp = createGearItem({ ...baseValues, name: 'Amp', category: 'amp', status: 'owned' }, [ownedGuitar], secondDate);
    const wanted = createGearItem({ ...baseValues, name: 'Wanted' }, [ownedGuitar, ownedAmp], firstDate);
    const items = [ownedGuitar, ownedAmp, wanted];
    assert.deepEqual(selectGearItems(items, { status: 'owned', category: 'guitar' }).map(({ name }) => name), ['Owned']);
    assert.equal(selectGearItems(items, { status: 'owned', category: 'all' }).length, 2);
    assert.deepEqual(selectGearItems(items, { status: 'wishlist', category: 'guitar' }).map(({ name }) => name), ['Wanted']);
    assert.deepEqual(selectGearItems(items, { status: 'owned', category: 'unknown' }), []);
});

test('sorts owned by updatedAt descending', () => {
    const older = createGearItem({ ...baseValues, name: 'Older', status: 'owned' }, [], firstDate);
    const newer = createGearItem({ ...baseValues, name: 'Newer', status: 'owned' }, [older], secondDate);
    assert.deepEqual(selectGearItems([older, newer], { status: 'owned' }).map(({ name }) => name), ['Newer', 'Older']);
});

test('sorts wishlist by priority then updatedAt descending', () => {
    const low = createGearItem({ ...baseValues, name: 'Low', priority: 'low' }, [], secondDate);
    const medium = createGearItem({ ...baseValues, name: 'Medium', priority: 'medium' }, [low], secondDate);
    const highOld = createGearItem({ ...baseValues, name: 'High old', priority: 'high' }, [low, medium], firstDate);
    const highNew = createGearItem({ ...baseValues, name: 'High new', priority: 'high' }, [low, medium, highOld], secondDate);
    assert.deepEqual(
        selectGearItems([low, highOld, medium, highNew], { status: 'wishlist' }).map(({ name }) => name),
        ['High new', 'High old', 'Medium', 'Low']
    );
});

test('fixed category labels cover the seven specified categories', () => {
    assert.deepEqual(GEAR_CATEGORIES.map(({ key }) => key), [
        'guitar', 'effects', 'amp', 'dtm', 'recording', 'accessories', 'other'
    ]);
});
