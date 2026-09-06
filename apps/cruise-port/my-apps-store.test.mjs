import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    MY_APPS_SCHEMA_VERSION,
    MY_APPS_STORAGE_KEY,
    createMyApp,
    deleteMyApp,
    loadMyApps,
    moveMyApp,
    normalizeMyAppUrl,
    saveMyApps,
    updateMyApp,
    validateMyAppValues
} from './my-apps-store.js';

class FakeStorage {
    constructor(entries = {}) {
        this.entries = new Map(Object.entries(entries));
        this.failWrites = false;
    }

    getItem(key) {
        return this.entries.has(key) ? this.entries.get(key) : null;
    }

    setItem(key, value) {
        if (this.failWrites) throw new Error('write failed');
        this.entries.set(key, value);
    }
}

const createdAt = '2026-09-06T00:00:00.000Z';
const updatedAt = '2026-09-06T00:01:00.000Z';
const baseItem = Object.freeze({
    id: 'b2cd4d9e-4f14-47e1-8cc2-9623f0a18cc9',
    name: 'Spotify',
    url: 'https://open.spotify.com/',
    createdAt,
    updatedAt
});

assert.deepEqual(loadMyApps(new FakeStorage()), { ok: true, items: [] }, 'empty store loads safely');

{
    const storage = new FakeStorage();
    assert.deepEqual(saveMyApps([baseItem], storage), { ok: true });
    assert.deepEqual(loadMyApps(storage), { ok: true, items: [baseItem] }, 'saved data persists across reload');
}

{
    const result = createMyApp(
        { name: ' Spotify ', url: 'open.spotify.com' },
        [],
        new Date(createdAt),
        () => baseItem.id
    );
    assert.equal(result.ok, true, 'valid item can be created');
    assert.deepEqual(result.item, {
        ...baseItem,
        updatedAt: createdAt
    });
}

{
    const result = updateMyApp([baseItem], baseItem.id, { name: 'Spotify Web', url: 'https://open.spotify.com/jp' }, new Date('2026-09-06T00:02:00.000Z'));
    assert.equal(result.found, true, 'existing item can be edited');
    assert.deepEqual(result.items[0], {
        ...baseItem,
        name: 'Spotify Web',
        url: 'https://open.spotify.com/jp',
        updatedAt: '2026-09-06T00:02:00.000Z'
    });
    assert.equal(updateMyApp([baseItem], 'missing', { name: 'x', url: 'https://example.com' }).found, false, 'unknown edit ID is safe');
}

{
    const deleted = deleteMyApp([baseItem], baseItem.id);
    assert.deepEqual(deleted, { found: true, items: [] }, 'item can be deleted');
    assert.equal(deleteMyApp([baseItem], 'missing').found, false, 'unknown delete ID is safe');
}

{
    const second = { ...baseItem, id: 'e4a121b3-20af-4961-92f6-126b5b1c5e1d', name: 'Notion' };
    const moved = moveMyApp([baseItem, second], second.id, -1);
    assert.equal(moved.moved, true, 'item can be reordered');
    assert.deepEqual(moved.items.map((item) => item.id), [second.id, baseItem.id]);
    assert.equal(moved.items[0].updatedAt, second.updatedAt, 'reorder does not change updatedAt');
    assert.equal(moveMyApp([baseItem], baseItem.id, -1).moved, false, 'boundary move is disabled');
}

for (const raw of [
    '{',
    JSON.stringify({ items: [] }),
    JSON.stringify({ version: 2, items: [] }),
    JSON.stringify({ version: MY_APPS_SCHEMA_VERSION, items: [{}] }),
    JSON.stringify({ version: MY_APPS_SCHEMA_VERSION, items: [{ ...baseItem, url: 'http://example.com/' }] }),
    JSON.stringify({ version: MY_APPS_SCHEMA_VERSION, items: [{ ...baseItem, iconId: 'not-supported-in-m2' }] })
]) {
    const storage = new FakeStorage({ [MY_APPS_STORAGE_KEY]: raw });
    assert.equal(loadMyApps(storage).ok, false, 'malformed or unsupported stored data is rejected without rewrite');
    assert.equal(storage.getItem(MY_APPS_STORAGE_KEY), raw);
}

assert.equal(validateMyAppValues({ name: '', url: 'https://example.com' }).ok, false, 'empty name is rejected');
assert.deepEqual(normalizeMyAppUrl('https://example.com'), { ok: true, url: 'https://example.com/' });
assert.deepEqual(normalizeMyAppUrl('https://example.com/path?q=1#x'), { ok: true, url: 'https://example.com/path?q=1#x' });
assert.deepEqual(normalizeMyAppUrl('example.com'), { ok: true, url: 'https://example.com/' }, 'bare host gets HTTPS convenience prefix');
for (const url of [
    'http://example.com',
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///tmp/test',
    'ftp://example.com',
    'https://user:pass@example.com'
]) {
    assert.equal(normalizeMyAppUrl(url).ok, false, `${url} is rejected`);
}

{
    const storage = new FakeStorage();
    storage.failWrites = true;
    assert.deepEqual(saveMyApps([baseItem], storage), { ok: false, reason: 'write-failed' }, 'write failures are reported');
}

const appSource = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
assert.match(appSource, /card\.href = item\.url/);
assert.match(appSource, /name\.textContent = item\.name/);
assert.match(appSource, /#my-apps\/manage/);
assert.match(appSource, /#my-apps\/new/);
assert.match(appSource, /#my-apps\/\$\{encodeURIComponent\(editButton\.dataset\.id\)\}\/edit/);
assert.match(markup, /id="my-apps-manage-view"/);
assert.match(markup, /id="my-apps-form-view"/);

console.log('my-apps-store: secure HTTPS launcher storage and route integration tests passed');
