import assert from 'node:assert/strict';
import test from 'node:test';
import {
    GEAR_CATEGORIES,
    GEAR_LIMITS,
    GEAR_LIST_SCHEMA_VERSION,
    GEAR_LIST_STORAGE_KEY,
    createGearItem,
    deleteGearItem,
    getGearCategoryLabel,
    getInitialGearCategory,
    loadGearList,
    markGearSold,
    markGearPurchased,
    moveGearItem,
    restoreGearOwned,
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
    priceText: '約48万円',
    priority: 'medium',
    memo: 'メイン候補',
    status: 'wishlist'
});
const firstDate = new Date('2026-01-01T00:00:00.000Z');
const secondDate = new Date('2026-02-01T00:00:00.000Z');

function createLegacyItem(overrides = {}) {
    return {
        id: 'legacy-1',
        name: 'Martin D-28',
        category: 'guitar',
        manufacturer: 'Martin',
        url: 'https://example.com/guitar',
        priceYen: 480000,
        priority: 'high',
        memo: '旧メモ',
        status: 'wishlist',
        createdAt: firstDate.toISOString(),
        updatedAt: secondDate.toISOString(),
        ownedAt: null,
        ...overrides
    };
}

function asV2(item) {
    const { order, soldAt, ...v2Item } = item;
    return v2Item;
}

test('empty storage starts with version 3 compatible empty data', () => {
    assert.deepEqual(loadGearList(createMemoryStorage()), { ok: true, items: [] });
    assert.equal(GEAR_LIST_SCHEMA_VERSION, 3);
});

test('category filter supplies a new-item category except for all', () => {
    for (const category of ['guitar', 'effects', 'amp', 'dtm', 'recording', 'accessories', 'other']) {
        assert.equal(getInitialGearCategory(category), category);
    }
    assert.equal(getInitialGearCategory('all'), '');
    assert.equal(getInitialGearCategory('unknown'), '');
});

test('validates required name and fixed category', () => {
    assert.equal(validateGearValues({ ...baseValues, name: '   ' }).field, 'name');
    assert.equal(validateGearValues({ ...baseValues, category: '' }).field, 'category');
    assert.equal(validateGearValues({ ...baseValues, category: 'custom' }).field, 'category');
    const result = validateGearValues({ ...baseValues, name: '  D-28  ' });
    assert.equal(result.ok, true);
    assert.equal(result.values.name, 'D-28');
});

test('accepts Japanese, alphanumeric, and symbol-rich price text verbatim after trim', () => {
    for (const priceText of ['198,000円', '約20万円', '中古 148,000円', '15〜18万円', '未定', 'セール待ち', '¥198,000', '20万円くらい']) {
        const result = validateGearValues({ ...baseValues, priceText: `  ${priceText}  ` });
        assert.equal(result.ok, true, priceText);
        assert.equal(result.values.priceText, priceText);
    }
});

test('treats blank price as unset and enforces the 100 character maximum', () => {
    assert.equal(validateGearValues({ ...baseValues, priceText: '   ' }).values.priceText, '');
    assert.equal(validateGearValues({ ...baseValues, priceText: 'x'.repeat(GEAR_LIMITS.priceText) }).ok, true);
    const invalid = validateGearValues({ ...baseValues, priceText: 'x'.repeat(GEAR_LIMITS.priceText + 1) });
    assert.equal(invalid.field, 'priceText');
});

test('keeps markup-like price input as plain text data', () => {
    const priceText = '<img src=x onerror=alert(1)> 約3万円';
    assert.equal(validateGearValues({ ...baseValues, priceText }).values.priceText, priceText);
});

test('validates priority, status, and memo', () => {
    assert.equal(validateGearValues({ ...baseValues, priority: 'urgent' }).field, 'priority');
    assert.equal(validateGearValues({ ...baseValues, status: 'sold' }).ok, true);
    assert.equal(validateGearValues({ ...baseValues, status: 'archived' }).field, 'status');
    assert.equal(validateGearValues({ ...baseValues, memo: 'x'.repeat(1001) }).field, 'memo');
});

test('creates v3 owned, wishlist, and sold items without retired fields', () => {
    const wishlist = createGearItem({
        ...baseValues,
        manufacturer: 'ignored',
        url: 'https://example.com/ignored',
        priceYen: 1
    }, [], firstDate);
    const owned = createGearItem({ ...baseValues, status: 'owned' }, [wishlist], firstDate);
    const sold = createGearItem({ ...baseValues, status: 'sold' }, [wishlist, owned], firstDate);
    assert.equal(wishlist.status, 'wishlist');
    assert.equal(wishlist.ownedAt, null);
    assert.equal(owned.ownedAt, firstDate.toISOString());
    assert.equal(wishlist.order, 0);
    assert.equal(wishlist.soldAt, null);
    assert.equal(sold.ownedAt, firstDate.toISOString());
    assert.equal(sold.soldAt, firstDate.toISOString());
    assert.notEqual(wishlist.id, owned.id);
    for (const retired of ['manufacturer', 'url', 'priceYen']) {
        assert.equal(Object.hasOwn(wishlist, retired), false, retired);
    }
});

test('saves and loads a version 3 payload without changing other keys', () => {
    const storage = createMemoryStorage({ 'cruisePort.practiceMenus': 'keep' });
    const item = createGearItem(baseValues, [], firstDate);
    assert.deepEqual(saveGearList([item], storage), { ok: true });
    assert.equal(loadGearList(storage).items[0].id, item.id);
    assert.equal(storage.snapshot()['cruisePort.practiceMenus'], 'keep');
    const payload = JSON.parse(storage.snapshot()[GEAR_LIST_STORAGE_KEY]);
    assert.equal(payload.version, 3);
    assert.equal(payload.items[0].priceText, '約48万円');
    assert.equal(payload.items[0].order, 0);
    assert.equal(payload.items[0].soldAt, null);
    assert.equal(Object.hasOwn(payload.items[0], 'manufacturer'), false);
    assert.equal(Object.hasOwn(payload.items[0], 'url'), false);
    assert.equal(Object.hasOwn(payload.items[0], 'priceYen'), false);
});

test('migrates v1 once while preserving identity, state, memo, timestamps, and retired values', () => {
    const legacyItem = createLegacyItem();
    const storage = createMemoryStorage({
        [GEAR_LIST_STORAGE_KEY]: JSON.stringify({ version: 1, items: [legacyItem] })
    });
    const firstLoad = loadGearList(storage);
    assert.equal(firstLoad.ok, true);
    assert.equal(firstLoad.migrated, true);
    const migrated = firstLoad.items[0];
    assert.equal(migrated.id, legacyItem.id);
    assert.equal(migrated.status, legacyItem.status);
    assert.equal(migrated.category, legacyItem.category);
    assert.equal(migrated.memo, legacyItem.memo);
    assert.equal(migrated.createdAt, legacyItem.createdAt);
    assert.equal(migrated.updatedAt, legacyItem.updatedAt);
    assert.equal(migrated.ownedAt, legacyItem.ownedAt);
    assert.equal(migrated.priceText, '¥480,000');
    assert.deepEqual(migrated.legacy, {
        manufacturer: legacyItem.manufacturer,
        url: legacyItem.url
    });
    assert.equal(Object.hasOwn(migrated, 'manufacturer'), false);
    assert.equal(Object.hasOwn(migrated, 'url'), false);
    assert.equal(Object.hasOwn(migrated, 'priceYen'), false);
    assert.equal(JSON.parse(storage.snapshot()[GEAR_LIST_STORAGE_KEY]).version, 3);
    assert.equal(Object.hasOwn(loadGearList(storage), 'migrated'), false);
});

test('migrates zero price visibly and null price to blank', () => {
    for (const [priceYen, expected] of [[0, '¥0'], [null, '']]) {
        const storage = createMemoryStorage({
            [GEAR_LIST_STORAGE_KEY]: JSON.stringify({
                version: 1,
                items: [createLegacyItem({ id: `legacy-${priceYen}`, priceYen })]
            })
        });
        assert.equal(loadGearList(storage).items[0].priceText, expected);
    }
});

test('malformed and unknown-version payloads remain untouched', () => {
    for (const raw of ['{broken', JSON.stringify({ version: 99, items: [] })]) {
        const storage = createMemoryStorage({ [GEAR_LIST_STORAGE_KEY]: raw });
        assert.equal(loadGearList(storage).ok, false);
        assert.equal(storage.snapshot()[GEAR_LIST_STORAGE_KEY], raw);
    }
});

test('invalid v1 data is not migrated or rewritten', () => {
    const raw = JSON.stringify({ version: 1, items: [createLegacyItem({ category: 'custom' })] });
    const storage = createMemoryStorage({ [GEAR_LIST_STORAGE_KEY]: raw });
    assert.equal(loadGearList(storage).reason, 'invalid-data');
    assert.equal(storage.snapshot()[GEAR_LIST_STORAGE_KEY], raw);
});

test('migration write failure restores the complete v1 payload', () => {
    const raw = JSON.stringify({ version: 1, items: [createLegacyItem()] });
    let value = raw;
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
    assert.equal(loadGearList(storage).reason, 'migration-write-failed');
    assert.equal(value, raw);
});

test('migrates v2 to v3 with deterministic legacy display order', () => {
    const low = asV2(createGearItem({ ...baseValues, name: 'Low', priority: 'low' }, [], firstDate));
    const high = asV2(createGearItem({ ...baseValues, name: 'High', priority: 'high' }, [low], secondDate));
    const storage = createMemoryStorage({
        [GEAR_LIST_STORAGE_KEY]: JSON.stringify({ version: 2, items: [low, high] })
    });
    const result = loadGearList(storage);
    assert.equal(result.ok, true);
    assert.equal(result.migrated, true);
    assert.deepEqual(selectGearItems(result.items, { status: 'wishlist' }).map(({ name }) => name), ['High', 'Low']);
    assert.deepEqual(result.items.map(({ soldAt }) => soldAt), [null, null]);
    assert.equal(JSON.parse(storage.snapshot()[GEAR_LIST_STORAGE_KEY]).version, 3);
});

test('rejects duplicate IDs, status orders, and unknown categories while loading v3', () => {
    const item = createGearItem(baseValues, [], firstDate);
    const duplicateStorage = createMemoryStorage({
        [GEAR_LIST_STORAGE_KEY]: JSON.stringify({ version: 3, items: [item, item] })
    });
    assert.equal(loadGearList(duplicateStorage).ok, false);
    const invalidStorage = createMemoryStorage({
        [GEAR_LIST_STORAGE_KEY]: JSON.stringify({ version: 3, items: [{ ...item, category: 'custom' }] })
    });
    assert.equal(loadGearList(invalidStorage).ok, false);
    const sameOrder = createGearItem({ ...baseValues, name: 'Same order' }, [item], firstDate);
    const orderStorage = createMemoryStorage({
        [GEAR_LIST_STORAGE_KEY]: JSON.stringify({ version: 3, items: [item, { ...sameOrder, order: item.order }] })
    });
    assert.equal(loadGearList(orderStorage).ok, false);
    assert.equal(getGearCategoryLabel('custom'), 'その他');
});

test('save failure restores the dedicated key', () => {
    const oldValue = JSON.stringify({ version: 3, items: [] });
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

test('edit preserves ID, createdAt, saved category, and legacy values', () => {
    const item = {
        ...createGearItem(baseValues, [], firstDate),
        legacy: { manufacturer: 'Martin', url: 'https://example.com/guitar' }
    };
    const result = updateGearItem([item], item.id, { ...baseValues, name: 'Updated' }, secondDate);
    assert.equal(result.found, true);
    assert.equal(result.items[0].id, item.id);
    assert.equal(result.items[0].createdAt, item.createdAt);
    assert.equal(result.items[0].category, item.category);
    assert.equal(result.items[0].name, 'Updated');
    assert.equal(result.items[0].updatedAt, secondDate.toISOString());
    assert.deepEqual(result.items[0].legacy, item.legacy);
});

test('wishlist purchase preserves price text, ID, category, and other fields', () => {
    const item = createGearItem({ ...baseValues, priceText: '中古 148,000円' }, [], firstDate);
    const result = markGearPurchased([item], item.id, secondDate);
    const purchased = result.items[0];
    assert.equal(result.found, true);
    assert.equal(purchased.id, item.id);
    assert.equal(purchased.category, item.category);
    assert.equal(purchased.priceText, '中古 148,000円');
    assert.equal(purchased.memo, item.memo);
    assert.equal(purchased.status, 'owned');
    assert.equal(purchased.ownedAt, secondDate.toISOString());
    assert.equal(purchased.soldAt, null);
    assert.equal(purchased.order, 0);
});

test('owned to sold and sold to owned preserve ID, fields, timestamps, and front order', () => {
    const owned = createGearItem({ ...baseValues, status: 'owned', priceText: '約20万円' }, [], firstDate);
    const oldSold = createGearItem({ ...baseValues, name: 'Old sold', status: 'sold' }, [owned], firstDate);
    const soldResult = markGearSold([owned, oldSold], owned.id, secondDate);
    const sold = soldResult.items.find((item) => item.id === owned.id);
    assert.equal(soldResult.found, true);
    assert.equal(sold.id, owned.id);
    assert.equal(sold.status, 'sold');
    assert.equal(sold.soldAt, secondDate.toISOString());
    assert.equal(sold.ownedAt, owned.ownedAt);
    assert.equal(sold.order, 0);
    assert.equal(sold.priceText, owned.priceText);
    const restoredResult = restoreGearOwned(soldResult.items, owned.id, new Date('2026-03-01T00:00:00.000Z'));
    const restored = restoredResult.items.find((item) => item.id === owned.id);
    assert.equal(restoredResult.found, true);
    assert.equal(restored.status, 'owned');
    assert.equal(restored.soldAt, null);
    assert.equal(restored.ownedAt, '2026-03-01T00:00:00.000Z');
    assert.equal(restored.order, 0);
    assert.equal(restored.id, owned.id);
});

test('owned item can return to wishlist without losing price text', () => {
    const owned = createGearItem({ ...baseValues, status: 'owned', priceText: '未定' }, [], firstDate);
    const result = updateGearItem([owned], owned.id, { ...baseValues, status: 'wishlist', priceText: '未定' }, secondDate);
    assert.equal(result.items[0].status, 'wishlist');
    assert.equal(result.items[0].ownedAt, null);
    assert.equal(result.items[0].priceText, '未定');
});

test('delete returns a candidate without mutating the source', () => {
    const item = createGearItem(baseValues, [], firstDate);
    const result = deleteGearItem([item], item.id);
    assert.equal(result.found, true);
    assert.equal(result.items.length, 0);
    assert.equal(item.name, baseValues.name);
});

test('filters owned, wishlist, and sold items by category and all', () => {
    const ownedGuitar = createGearItem({ ...baseValues, name: 'Owned', status: 'owned' }, [], firstDate);
    const ownedAmp = createGearItem({ ...baseValues, name: 'Amp', category: 'amp', status: 'owned' }, [ownedGuitar], secondDate);
    const wanted = createGearItem({ ...baseValues, name: 'Wanted' }, [ownedGuitar, ownedAmp], firstDate);
    const sold = createGearItem({ ...baseValues, name: 'Sold', status: 'sold' }, [ownedGuitar, ownedAmp, wanted], firstDate);
    const items = [ownedGuitar, ownedAmp, wanted, sold];
    assert.deepEqual(selectGearItems(items, { status: 'owned', category: 'guitar' }).map(({ name }) => name), ['Owned']);
    assert.equal(selectGearItems(items, { status: 'owned', category: 'all' }).length, 2);
    assert.deepEqual(selectGearItems(items, { status: 'wishlist', category: 'guitar' }).map(({ name }) => name), ['Wanted']);
    assert.deepEqual(selectGearItems(items, { status: 'sold', category: 'guitar' }).map(({ name }) => name), ['Sold']);
    assert.deepEqual(selectGearItems(items, { status: 'owned', category: 'unknown' }), []);
});

test('uses saved order and reorders only the current status', () => {
    const low = createGearItem({ ...baseValues, name: 'Low', priority: 'low' }, [], secondDate);
    const high = createGearItem({ ...baseValues, name: 'High', priority: 'high' }, [low], firstDate);
    const owned = createGearItem({ ...baseValues, name: 'Owned', status: 'owned' }, [low, high], firstDate);
    const result = moveGearItem([low, high, owned], low.id, -1);
    assert.equal(result.moved, true);
    assert.deepEqual(
        selectGearItems(result.items, { status: 'wishlist' }).map(({ name }) => name),
        ['Low', 'High']
    );
    assert.deepEqual(selectGearItems(result.items, { status: 'owned' }).map(({ name }) => name), ['Owned']);
    assert.equal(moveGearItem(result.items, low.id, -1).moved, false);
});

test('v3 malformed and unknown payloads remain untouched', () => {
    const item = createGearItem(baseValues, [], firstDate);
    for (const raw of [
        JSON.stringify({ version: 3, items: [{ ...item, soldAt: 'invalid' }] }),
        JSON.stringify({ version: 4, items: [] })
    ]) {
        const storage = createMemoryStorage({ [GEAR_LIST_STORAGE_KEY]: raw });
        assert.equal(loadGearList(storage).ok, false);
        assert.equal(storage.snapshot()[GEAR_LIST_STORAGE_KEY], raw);
    }
});

test('fixed category labels cover the seven specified categories', () => {
    assert.deepEqual(GEAR_CATEGORIES.map(({ key }) => key), [
        'guitar', 'effects', 'amp', 'dtm', 'recording', 'accessories', 'other'
    ]);
});
