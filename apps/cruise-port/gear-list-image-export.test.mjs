import assert from 'node:assert/strict';
import test from 'node:test';
import { gearListImageSections } from './gear-list-image-export.js';

const items = [
    { id: 'one', status: 'owned' },
    { id: 'two', status: 'sold' },
    { id: 'three', status: 'wishlist' }
];

test('PNG sections follow the visible all and owned tabs, including empty groups', () => {
    assert.deepEqual(gearListImageSections(items, 'all').map(({ status }) => status), ['owned', 'sold', 'wishlist']);
    assert.deepEqual(gearListImageSections(items, 'owned').map(({ status }) => status), ['owned', 'sold']);
    assert.deepEqual(gearListImageSections(items, 'wishlist').map(({ status }) => status), ['wishlist']);
    assert.deepEqual(gearListImageSections([], 'owned').map(({ items: group }) => group.length), [0, 0]);
});
