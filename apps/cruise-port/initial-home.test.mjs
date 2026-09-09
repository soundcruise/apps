import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeInitialHome, buildReloadUrl } from './app-version.js';
for (const pathname of ['/apps/cruise-port/', '/apps/cruise-port/pro_9a3943176561/']) {
    test(`initial load and footer retain edition: ${pathname}`, () => {
        for (const hash of ['#tuner', '#metronome', '#practice-menu/calendar', '#pro-access', '#wishlist', '#settings']) {
            const state = { existing: true }; const calls = [];
            normalizeInitialHome({locationObject:{pathname, search:'?keep=1', hash}, historyObject:{state, replaceState(...args){calls.push(args)}}});
            assert.deepEqual(calls, [[state, '', pathname+'?keep=1']]);
            assert.equal(buildReloadUrl('https://example.com'+pathname+'?keep=1'+hash, 123), 'https://example.com'+pathname+'?keep=1&_r=123');
        }
    });
}
test('clean initial URL needs no history entry; startup only, not hashchange', () => {
    normalizeInitialHome({locationObject:{hash:''}, historyObject:{replaceState(){assert.fail()}}});
    const source=readFileSync(new URL('./practice-menu-app.js',import.meta.url),'utf8');
    assert.equal((source.match(/normalizeInitialHome\(\)/g)||[]).length,1);
    assert(source.indexOf('normalizeInitialHome();')<source.indexOf('function renderRoute()'));
});
