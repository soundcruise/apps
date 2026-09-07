import assert from 'node:assert/strict';
import test from 'node:test';
import { GEAR_ROUTE_KIND, parseGearRoute, replaceGearListRoute } from './gear-list-navigation.js';

test('parses list, create, and edit routes', () => {
    assert.deepEqual(parseGearRoute('#wishlist'), { kind: GEAR_ROUTE_KIND.list });
    assert.deepEqual(parseGearRoute('#wishlist/new'), { kind: GEAR_ROUTE_KIND.create });
    assert.deepEqual(parseGearRoute('#wishlist/abc%20123/edit'), { kind: GEAR_ROUTE_KIND.edit, id: 'abc 123' });
    assert.equal(parseGearRoute('#practice-menu'), null);
});

test('treats invalid percent encoding and stale shapes as invalid', () => {
    assert.deepEqual(parseGearRoute('#wishlist/%E0%A4%A/edit'), { kind: GEAR_ROUTE_KIND.invalid });
    assert.deepEqual(parseGearRoute('#wishlist/abc'), { kind: GEAR_ROUTE_KIND.invalid });
    assert.deepEqual(parseGearRoute('#wishlist//edit'), { kind: GEAR_ROUTE_KIND.invalid });
});

test('invalid correction replaces history without adding an entry', () => {
    const calls = [];
    replaceGearListRoute({
        historyObject: { replaceState(...args) { calls.push(args); } },
        locationObject: { pathname: '/apps/cruise-port/', search: '?qa=1' }
    });
    assert.deepEqual(calls, [[null, '', '/apps/cruise-port/?qa=1#wishlist']]);
});
