import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    MY_APPS_SCHEMA_VERSION,
    MY_APPS_STORAGE_KEY,
    createMyApp,
    deleteMyApp,
    loadMyApps,
    moveMyApp,
    normalizeCustomLaunch,
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
    launchMode: 'https',
    appKey: null,
    customLaunch: null,
    iconId: null,
    iconSourceId: null,
    iconCrop: null,
    createdAt,
    updatedAt
});
const { customLaunch: omittedCustomLaunch, ...v4ItemValues } = baseItem;
const v4Item = Object.freeze(v4ItemValues);
const { launchMode: omittedLaunchMode, appKey: omittedAppKey, ...v3ItemValues } = v4Item;
const v3Item = Object.freeze(v3ItemValues);
const { iconSourceId: omittedSourceId, iconCrop: omittedCrop, ...v2ItemValues } = v3Item;
const v2Item = Object.freeze(v2ItemValues);
const { iconId: omittedIconId, ...v1ItemValues } = v2Item;
const v1Item = Object.freeze(v1ItemValues);

assert.deepEqual(loadMyApps(new FakeStorage()), { ok: true, items: [] }, 'empty store loads safely');

{
    const raw = JSON.stringify({ version: 1, items: [v1Item] });
    const storage = new FakeStorage({ [MY_APPS_STORAGE_KEY]: raw });
    assert.deepEqual(loadMyApps(storage), {
        ok: true,
        items: [baseItem],
        migrated: true
    }, 'v1 metadata is migrated to v5 defaults in memory');
    assert.equal(storage.getItem(MY_APPS_STORAGE_KEY), raw, 'v1 load does not rewrite storage');
    assert.deepEqual(saveMyApps(loadMyApps(storage).items, storage), { ok: true });
    assert.equal(JSON.parse(storage.getItem(MY_APPS_STORAGE_KEY)).version, 5, 'next explicit save writes v5');
}

{
    const v2WithIcon = { ...v2Item, iconId: '56582913-4b14-4ae4-95f6-af8367858f6d' };
    const raw = JSON.stringify({ version: 2, items: [v2WithIcon] });
    const storage = new FakeStorage({ [MY_APPS_STORAGE_KEY]: raw });
    assert.deepEqual(loadMyApps(storage), {
        ok: true,
        items: [{ ...v2WithIcon, launchMode: 'https', appKey: null, customLaunch: null, iconSourceId: null, iconCrop: null }],
        migrated: true
    }, 'v2 metadata preserves its final icon and adds null source/crop in memory');
    assert.equal(storage.getItem(MY_APPS_STORAGE_KEY), raw, 'v2 load does not rewrite storage');
}

{
    const v3WithIcon = {
        ...v3Item,
        iconId: '56582913-4b14-4ae4-95f6-af8367858f6d',
        iconSourceId: '38d1c7d2-5248-4df7-aa11-7d8e8c96b58f',
        iconCrop: { x: 0.25, y: 0.1, size: 0.5 }
    };
    const raw = JSON.stringify({ version: 3, items: [v3WithIcon] });
    const storage = new FakeStorage({ [MY_APPS_STORAGE_KEY]: raw });
    assert.deepEqual(loadMyApps(storage), {
        ok: true,
        items: [{ ...v3WithIcon, launchMode: 'https', appKey: null, customLaunch: null }],
        migrated: true
    }, 'v3 metadata preserves all icon data and adds safe launch defaults');
    assert.equal(storage.getItem(MY_APPS_STORAGE_KEY), raw, 'v3 load does not rewrite storage');
}

{
    const v4Known = { ...v4Item, launchMode: 'known-app', appKey: 'spotify' };
    const raw = JSON.stringify({ version: 4, items: [v4Known] });
    const storage = new FakeStorage({ [MY_APPS_STORAGE_KEY]: raw });
    assert.deepEqual(loadMyApps(storage), {
        ok: true,
        items: [{ ...v4Known, customLaunch: null }],
        migrated: true
    }, 'v4 known-app metadata is preserved and gains customLaunch null');
    assert.equal(storage.getItem(MY_APPS_STORAGE_KEY), raw, 'v4 load does not rewrite storage');
}

{
    const storage = new FakeStorage();
    assert.deepEqual(saveMyApps([baseItem], storage), { ok: true });
    assert.deepEqual(loadMyApps(storage), { ok: true, items: [baseItem] }, 'saved data persists across reload');
    const withIcon = { ...baseItem, iconId: '56582913-4b14-4ae4-95f6-af8367858f6d' };
    assert.deepEqual(saveMyApps([withIcon], storage), { ok: true });
    assert.deepEqual(loadMyApps(storage), { ok: true, items: [withIcon] }, 'legacy iconId remains valid in v5');
    const editableIcon = {
        ...withIcon,
        iconSourceId: '38d1c7d2-5248-4df7-aa11-7d8e8c96b58f',
        iconCrop: { x: 0.25, y: 0.1, size: 0.5 }
    };
    assert.deepEqual(saveMyApps([editableIcon], storage), { ok: true });
    assert.deepEqual(loadMyApps(storage), { ok: true, items: [editableIcon] }, 'source ID and normalized crop persist');
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
    assert.deepEqual(saveMyApps([baseItem, second], storage), { ok: true }, 'multiple v5 items validate independently of their array index');
    const moved = moveMyApp([baseItem, second], second.id, -1);
    assert.equal(moved.moved, true, 'item can be reordered');
    assert.deepEqual(moved.items.map((item) => item.id), [second.id, baseItem.id]);
    assert.equal(moved.items[0].updatedAt, second.updatedAt, 'reorder does not change updatedAt');
    assert.equal(moveMyApp([baseItem], baseItem.id, -1).moved, false, 'boundary move is disabled');
}

for (const raw of [
    '{',
    JSON.stringify({ items: [] }),
    JSON.stringify({ version: 6, items: [] }),
    JSON.stringify({ version: MY_APPS_SCHEMA_VERSION, items: [{}] }),
    JSON.stringify({ version: MY_APPS_SCHEMA_VERSION, items: [{ ...baseItem, url: 'http://example.com/' }] }),
    JSON.stringify({ version: MY_APPS_SCHEMA_VERSION, items: [{ ...baseItem, iconId: 42 }] }),
    JSON.stringify({ version: MY_APPS_SCHEMA_VERSION, items: [{ ...baseItem, iconId: 'icon', iconSourceId: 'source', iconCrop: { x: -1, y: 0, size: 1 } }] }),
    JSON.stringify({ version: MY_APPS_SCHEMA_VERSION, items: [{ ...baseItem, iconSourceId: 'orphan-source' }] })
]) {
    const storage = new FakeStorage({ [MY_APPS_STORAGE_KEY]: raw });
    assert.equal(loadMyApps(storage).ok, false, 'malformed or unsupported stored data is rejected without rewrite');
    assert.equal(storage.getItem(MY_APPS_STORAGE_KEY), raw);
}

{
    const knownAppItem = { ...baseItem, launchMode: 'known-app', appKey: 'spotify' };
    const storage = new FakeStorage();
    assert.deepEqual(saveMyApps([knownAppItem], storage), { ok: true }, 'known registry app can be saved');
    assert.deepEqual(loadMyApps(storage), { ok: true, items: [knownAppItem] });
    assert.equal(
        saveMyApps([{ ...knownAppItem, appKey: 'removed-app' }], storage).ok,
        false,
        'unknown appKey cannot be written'
    );
}

{
    const unknownAppItem = { ...baseItem, launchMode: 'known-app', appKey: 'removed-app' };
    const raw = JSON.stringify({ version: 5, items: [unknownAppItem] });
    const storage = new FakeStorage({ [MY_APPS_STORAGE_KEY]: raw });
    assert.deepEqual(loadMyApps(storage), {
        ok: true,
        items: [baseItem],
        migrated: true
    }, 'unknown stored appKey falls back to HTTPS in memory');
    assert.equal(storage.getItem(MY_APPS_STORAGE_KEY), raw, 'safe fallback does not rewrite storage automatically');
}

for (const customLaunch of [
    { ios: 'https://example.com/ios', android: null },
    { ios: null, android: 'https://example.com/android' },
    { ios: 'https://example.com/ios', android: 'https://example.com/android' }
]) {
    const customItem = { ...baseItem, launchMode: 'custom', customLaunch };
    const storage = new FakeStorage();
    assert.deepEqual(saveMyApps([customItem], storage), { ok: true }, 'valid custom HTTPS targets can be saved');
    assert.deepEqual(loadMyApps(storage), { ok: true, items: [customItem] });
}

assert.deepEqual(normalizeCustomLaunch({ ios: 'example.com/app', android: null }), {
    ok: true,
    value: { ios: 'https://example.com/app', android: null }
});
for (const customLaunch of [
    null,
    { ios: null, android: null },
    { ios: 'javascript:alert(1)', android: null },
    { ios: 'https://user:pass@example.com/', android: null },
    { ios: 'https://example.com/', android: null, extra: true }
]) {
    assert.equal(
        validateMyAppValues({ name: 'Custom', url: 'https://apps.apple.com/app/id999999999', launchMode: 'custom', appKey: null, customLaunch }).ok,
        false,
        'invalid custom launch combination is rejected'
    );
}

{
    const unsafeCustom = {
        ...baseItem,
        launchMode: 'custom',
        customLaunch: { ios: 'javascript:alert(1)', android: null }
    };
    const raw = JSON.stringify({ version: 5, items: [unsafeCustom] });
    const storage = new FakeStorage({ [MY_APPS_STORAGE_KEY]: raw });
    assert.deepEqual(loadMyApps(storage), { ok: true, items: [baseItem], migrated: true });
    assert.equal(storage.getItem(MY_APPS_STORAGE_KEY), raw, 'unsafe stored custom target falls back without rewrite');
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
const styles = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
assert.match(appSource, /card\.href = resolveMyAppHref\(item, myAppsPlatform\)/);
assert.match(appSource, /name\.textContent = item\.name/);
assert.match(appSource, /#my-apps\/manage/);
assert.match(appSource, /#my-apps\/new/);
assert.match(appSource, /#my-apps\/\$\{encodeURIComponent\(editButton\.dataset\.id\)\}\/edit/);
assert.match(markup, /id="my-apps-manage-view"/);
assert.match(markup, /id="my-apps-form-view"/);
assert.match(markup, /id="my-apps-icon-input"[^>]+type="file"[^>]+accept="image\/\*"/);
assert.doesNotMatch(markup, /id="my-apps-icon-input"[^>]+capture/);
assert.match(markup, /id="my-apps-icon-preview"[^>]+type="button"[^>]+aria-label="現在のアイコンを調整"[^>]+disabled/);
assert.match(markup, /id="my-apps-icon-adjust-hint"[^>]*>タップして調整/);
assert.match(markup, /id="my-apps-direct-enabled"[^>]+type="checkbox"[^>]+aria-describedby="my-apps-direct-description"/);
assert.match(markup, /対応している端末では、Webページではなくアプリを開きます。/);
assert.match(markup, /id="my-apps-custom-launch"[^>]+hidden/);
assert.match(markup, /直接起動の設定（任意）/);
assert.match(markup, /id="my-apps-custom-ios"[^>]+type="url"[^>]+maxlength="2048"/);
assert.match(markup, /id="my-apps-custom-android"[^>]+type="url"[^>]+maxlength="2048"/);
assert.match(markup, /id="my-apps-custom-ios-test"[^>]+target="_blank"[^>]+rel="noopener noreferrer"/);
assert.match(markup, /id="my-apps-custom-android-test"[^>]+target="_blank"[^>]+rel="noopener noreferrer"/);
assert.match(markup, /id="my-apps-custom-enabled"[^>]+type="checkbox"[^>]+aria-describedby="my-apps-custom-enabled-description"/);
assert.match(markup, /id="my-apps-crop-dialog"[^>]+role="dialog"[^>]+aria-modal="true"/);
assert.match(markup, /id="my-apps-crop-canvas"[^>]+width="320"[^>]+height="320"/);
assert.match(markup, /id="my-apps-crop-slider"[^>]+type="range"/);
assert.match(appSource, /addEventListener\('pointerdown', handleCropPointerDown\)/);
assert.match(appSource, /addEventListener\('pointermove', handleCropPointerMove\)/);
assert.match(appSource, /encodePreparedMyAppIcon\(session\.prepared, cropState\)/);
assert.match(appSource, /myAppsIconPreview\.addEventListener\('click', handleCurrentMyAppsIconAdjustment\)/);
assert.match(appSource, /myAppsIconStore\.getIcon\(item\.iconSourceId\)/);
assert.match(appSource, /recognizeKnownAppUrl\(elements\.myAppsUrlInput\.value\)/);
assert.match(appSource, /updateMyAppsLaunchOptions\(\)/);
assert.match(appSource, /normalizeCustomLaunch\(\{/);
assert.match(appSource, /link\.href = href/);
assert.doesNotMatch(appSource, /window\.open\(/);
assert.match(appSource, /useCurrentIconAsSource = true/);
assert.match(appSource, /closeMyAppsCropEditor\(\{ restoreStatus: false, restoreFocus: false \}\)/);
assert.match(styles, /\.my-apps-manage-card,[\s\S]*grid-template-columns:\s*48px minmax\(0, 1fr\)/);
assert.match(styles, /\.my-app-edit-button[\s\S]*grid-column:\s*1 \/ -1/);
assert.match(styles, /\.my-apps-crop-canvas[\s\S]*touch-action:\s*none/);
assert.match(appSource, /cleanupMyAppsObjectUrls\('home'\)/);
assert.match(appSource, /cleanupMyAppsObjectUrls\('manage'\)/);
assert.match(appSource, /cleanupMyAppsObjectUrls\('form'\)/);
assert.match(appSource, /createMyAppsIconStore\(\)/);
assert.match(appSource, /if \(!result\.ok \|\| !result\.record[^\n]+return;/, 'missing/read-failed Blob leaves the generic icon');
assert.match(appSource, /image\.alt = '';/, 'decorative icon does not duplicate the card name');

console.log('my-apps-store: secure HTTPS launcher storage and route integration tests passed');
