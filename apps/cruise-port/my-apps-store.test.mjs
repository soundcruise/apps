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
    iconId: null,
    createdAt,
    updatedAt
});
const { iconId: omittedIconId, ...v1ItemValues } = baseItem;
const v1Item = Object.freeze(v1ItemValues);

assert.deepEqual(loadMyApps(new FakeStorage()), { ok: true, items: [] }, 'empty store loads safely');

{
    const raw = JSON.stringify({ version: 1, items: [v1Item] });
    const storage = new FakeStorage({ [MY_APPS_STORAGE_KEY]: raw });
    assert.deepEqual(loadMyApps(storage), {
        ok: true,
        items: [baseItem],
        migrated: true
    }, 'v1 metadata is migrated to iconId null in memory');
    assert.equal(storage.getItem(MY_APPS_STORAGE_KEY), raw, 'v1 load does not rewrite storage');
    assert.deepEqual(saveMyApps(loadMyApps(storage).items, storage), { ok: true });
    assert.equal(JSON.parse(storage.getItem(MY_APPS_STORAGE_KEY)).version, 2, 'next explicit save writes v2');
}

{
    const storage = new FakeStorage();
    assert.deepEqual(saveMyApps([baseItem], storage), { ok: true });
    assert.deepEqual(loadMyApps(storage), { ok: true, items: [baseItem] }, 'saved data persists across reload');
    const withIcon = { ...baseItem, iconId: '56582913-4b14-4ae4-95f6-af8367858f6d' };
    assert.deepEqual(saveMyApps([withIcon], storage), { ok: true });
    assert.deepEqual(loadMyApps(storage), { ok: true, items: [withIcon] }, 'v2 iconId persists');
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
    const storage = new FakeStorage();
    assert.deepEqual(saveMyApps([baseItem, second], storage), { ok: true }, 'multiple v2 items validate independently of their array index');
    const moved = moveMyApp([baseItem, second], second.id, -1);
    assert.equal(moved.moved, true, 'item can be reordered');
    assert.deepEqual(moved.items.map((item) => item.id), [second.id, baseItem.id]);
    assert.equal(moved.items[0].updatedAt, second.updatedAt, 'reorder does not change updatedAt');
    assert.equal(moveMyApp([baseItem], baseItem.id, -1).moved, false, 'boundary move is disabled');
}

for (const raw of [
    '{',
    JSON.stringify({ items: [] }),
    JSON.stringify({ version: 3, items: [] }),
    JSON.stringify({ version: MY_APPS_SCHEMA_VERSION, items: [{}] }),
    JSON.stringify({ version: MY_APPS_SCHEMA_VERSION, items: [{ ...baseItem, url: 'http://example.com/' }] }),
    JSON.stringify({ version: MY_APPS_SCHEMA_VERSION, items: [{ ...baseItem, iconId: 42 }] })
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
assert.match(markup, /id="my-apps-icon-input"[^>]+type="file"[^>]+accept="image\/\*"/);
assert.doesNotMatch(markup, /id="my-apps-icon-input"[^>]+capture/);
assert.match(appSource, /cleanupMyAppsObjectUrls\('home'\)/);
assert.match(appSource, /cleanupMyAppsObjectUrls\('manage'\)/);
assert.match(appSource, /cleanupMyAppsObjectUrls\('form'\)/);
assert.match(appSource, /createMyAppsIconStore\(\)/);
assert.match(appSource, /if \(!result\.ok \|\| !result\.record[^\n]+return;/, 'missing/read-failed Blob leaves the generic icon');
assert.match(appSource, /image\.alt = '';/, 'decorative icon does not duplicate the card name');

console.log('my-apps-store: secure HTTPS launcher storage and route integration tests passed');
