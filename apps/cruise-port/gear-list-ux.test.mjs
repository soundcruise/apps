import assert from 'node:assert/strict';
import test from 'node:test';
import {
    GEAR_TABS, gearCardLabel, gearGridColumns, saveGearGridColumns,
    gearItemsForExport, gearListCsv, gearItemText, shareGearText
} from './gear-list-ux.js';

const category = [{ id: 'guitar', name: 'ギター' }];
const base = { manufacturer: 'YAMAHA', name: 'LL6', category: 'guitar', status: 'wishlist',
    priceText: '50,000円', priority: 'high', memo: '練習用', order: 0,
    createdAt: '2026-01-01T00:00:00.000Z', ownedAt: null, soldAt: null };

test('card label and tabs keep sold items under owned', () => {
    assert.equal(gearCardLabel(base), 'YAMAHA / LL6');
    assert.equal(gearCardLabel({ ...base, manufacturer: '' }), 'LL6');
    assert.deepEqual(GEAR_TABS.map(({ status }) => status), ['all', 'owned', 'wishlist']);
});

test('grid preference accepts 1 through 4 per device', () => {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    assert.equal(gearGridColumns(storage), 1);
    for (const columns of [1, 2, 3, 4]) {
        assert.equal(saveGearGridColumns(columns, storage), true);
        assert.equal(gearGridColumns(storage), columns);
    }
    assert.equal(saveGearGridColumns(5, storage), false);
    assert.equal(gearGridColumns(storage), 4);
});

test('CSV exports only current tab/category and escapes text and formulas', () => {
    const items = [base, { ...base, name: 'Owned', status: 'owned' }, { ...base, name: 'Sold', status: 'sold' }];
    assert.deepEqual(gearItemsForExport(items, 'owned').map(({ status }) => status), ['owned', 'sold']);
    assert.equal(gearItemsForExport(items, 'all').length, 3);
    assert.equal(gearItemsForExport(items, 'all', 'amp').length, 0);
    const csv = gearListCsv([{ ...base, memo: 'a,"b"\n=SUM(1)', name: '=DANGER' }], category);
    assert.match(csv, /^\uFEFF/);
    assert.match(csv, /"'=DANGER"/);
    assert.match(csv, /"a,""b""\n=SUM\(1\)"/);
    assert.doesNotMatch(csv, /photoId|assetId|url|password/iu);
    assert.match(gearListCsv([{ ...base, status: 'sold' }], category), /"手放した機材"/);
});

test('single text excludes internal IDs, shares when available, downloads otherwise', async () => {
    const text = gearItemText({ ...base, id: 'secret-id', photoId: 'photo-secret' }, category);
    assert.match(text, /メーカー：YAMAHA/);
    assert.doesNotMatch(text, /secret/);
    let shared = null;
    assert.equal(await shareGearText(base, category, {
        navigatorObject: { share: async (payload) => { shared = payload; } },
        download: () => { throw new Error('unexpected download'); }
    }), 'shared');
    assert.equal(shared.title, 'YAMAHA / LL6');
    let downloaded = null;
    assert.equal(await shareGearText(base, category, {
        navigatorObject: {}, download: (...args) => { downloaded = args; }
    }), 'downloaded');
    assert.match(downloaded[1], /LL6\.txt$/);
});
