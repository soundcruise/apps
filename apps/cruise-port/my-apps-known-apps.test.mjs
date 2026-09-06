import assert from 'node:assert/strict';
import {
    MY_APPS_KNOWN_APPS,
    findKnownAppByAndroidPackage,
    findKnownAppByIosStoreId,
    getKnownApp,
    parseAndroidPlayPackage,
    parseIosAppStoreId,
    recognizeKnownAppUrl,
    recognizeStoreUrl,
    resolveKnownAppTarget
} from './my-apps-known-apps.js';
import { normalizeMyAppUrl } from './my-apps-store.js';

const expected = [
    ['spotify', 'music-streaming', '324684580', 'com.spotify.music', 'https://open.spotify.com/'],
    ['youtube', 'music-streaming', '544007664', 'com.google.android.youtube', 'https://www.youtube.com/'],
    ['dropbox', 'cloud-storage', '327630330', 'com.dropbox.android', 'https://www.dropbox.com/home'],
    ['notion', 'notes', '1232780281', 'notion.id', 'https://www.notion.so/'],
    ['chatgpt', 'ai', '6448311069', 'com.openai.chatgpt', 'https://chatgpt.com/#native']
];

const expectedNewKeys = [
    'youtube-music', 'amazon-music', 'soundcloud', 'tidal', 'pandora', 'deezer', 'audiomack', 'line-music', 'rakuten-music',
    'songsterr', 'flat', 'bandlab', 'moises', 'evernote', 'google-drive', 'onedrive', 'box', 'mega', 'pcloud',
    'canva', 'adobe-express', 'picsart', 'vn-video-editor', 'claude', 'perplexity', 'grok', 'suno',
    'discord', 'slack', 'messenger', 'instagram', 'tiktok', 'x-twitter', 'threads'
];

assert.equal(MY_APPS_KNOWN_APPS.length, 39, 'the approved registry contains five existing and 34 new apps');
assert.equal(new Set(MY_APPS_KNOWN_APPS.map((app) => app.key)).size, 39, 'app keys are unique');
for (const key of expectedNewKeys) assert(getKnownApp(key), `${key} is registered`);
for (const [key, category, iosId, androidPackage, iosHref] of expected) {
    const app = getKnownApp(key);
    assert(app, `${key} is registered`);
    assert.equal(app.category, category);
    assert.deepEqual(app.match.iosStoreIds, [iosId]);
    assert.deepEqual(app.match.androidPackages, [androidPackage]);
    assert.equal(findKnownAppByIosStoreId(iosId), app);
    assert.equal(findKnownAppByAndroidPackage(androidPackage), app);
    assert.equal(resolveKnownAppTarget(key, 'ios'), iosHref);
}
assert.equal(resolveKnownAppTarget('chatgpt', 'android'), null, 'unverified ChatGPT Android target is disabled');
assert.deepEqual(getKnownApp('tiktok').match.iosStoreIds, ['1235601864', '835599320']);
assert.equal(findKnownAppByIosStoreId('1235601864')?.key, 'tiktok', 'TikTok Japan Store ID resolves');
assert.equal(findKnownAppByIosStoreId('835599320')?.key, 'tiktok', 'TikTok US Store ID resolves');

const allIosStoreIds = MY_APPS_KNOWN_APPS.flatMap((app) => app.match.iosStoreIds);
const allAndroidPackages = MY_APPS_KNOWN_APPS.flatMap((app) => app.match.androidPackages);
assert.equal(new Set(allIosStoreIds).size, allIosStoreIds.length, 'Store IDs have no accidental duplicates');
assert.equal(new Set(allAndroidPackages).size, allAndroidPackages.length, 'Android packages have no accidental duplicates');

for (const app of MY_APPS_KNOWN_APPS) {
    assert.equal(typeof app.category, 'string');
    assert(app.category.length > 0);
    assert(Array.isArray(app.match.iosStoreIds));
    assert(Array.isArray(app.match.androidPackages));
    for (const storeId of app.match.iosStoreIds) {
        assert.equal(findKnownAppByIosStoreId(storeId), app);
        for (const region of ['jp', 'us']) {
            assert.equal(
                recognizeKnownAppUrl(`https://apps.apple.com/${region}/app/example/id${storeId}?l=ja`)?.app,
                app,
                `${app.key} matches ${region} App Store URLs`
            );
        }
    }
    for (const packageName of app.match.androidPackages) {
        assert.equal(findKnownAppByAndroidPackage(packageName), app);
        assert.equal(
            recognizeKnownAppUrl(`https://play.google.com/store/apps/details?id=${packageName}&hl=ja&gl=JP`)?.app,
            app,
            `${app.key} matches Play Store URLs`
        );
    }
    for (const target of Object.values(app.launch).filter(Boolean)) {
        const url = new URL(target.href);
        assert.equal(target.kind, 'https');
        assert.equal(url.protocol, 'https:');
        assert(url.hostname);
        assert.equal(url.username, '');
        assert.equal(url.password, '');
        assert.equal(url.port, '');
        assert.deepEqual(normalizeMyAppUrl(target.href), { ok: true, url: target.href });
    }
}

assert.equal(parseIosAppStoreId('https://apps.apple.com/app/id324684580'), '324684580');
assert.equal(parseIosAppStoreId('https://apps.apple.com/jp/app/spotify/id324684580?l=ja#details'), '324684580');
for (const value of [
    'https://example.com/id324684580',
    'https://apps.apple.com/not-an-app/324684580',
    'https://apps.apple.com.evil.example/app/id324684580',
    'javascript:alert(1)'
]) {
    assert.equal(parseIosAppStoreId(value), null, `invalid App Store URL rejected: ${value}`);
}

assert.equal(
    parseAndroidPlayPackage('https://play.google.com/store/apps/details?id=com.spotify.music'),
    'com.spotify.music'
);
for (const value of [
    'https://example.com/store/apps/details?id=com.spotify.music',
    'https://play.google.com/store/apps?id=com.spotify.music',
    'https://play.google.com/store/apps/details',
    'https://play.google.com/store/apps/details?id=not-a-package',
    'https://play.google.com/store/apps/details?id=com.spotify.music&id=com.google.android.youtube'
]) {
    assert.equal(parseAndroidPlayPackage(value), null, `invalid Play URL rejected: ${value}`);
}

assert.equal(
    recognizeKnownAppUrl('https://apps.apple.com/jp/app/spotify/id324684580').app.key,
    'spotify'
);
assert.equal(
    recognizeKnownAppUrl('https://play.google.com/store/apps/details?id=com.google.android.youtube').app.key,
    'youtube'
);
assert.equal(recognizeKnownAppUrl('https://apps.apple.com/app/id000000000'), null, 'unknown store app stays HTTPS-only');
assert.deepEqual(recognizeStoreUrl('https://apps.apple.com/app/id000000000'), {
    platform: 'ios',
    identifier: '000000000'
});
assert.deepEqual(recognizeStoreUrl('https://play.google.com/store/apps/details?id=com.example.unknown'), {
    platform: 'android',
    identifier: 'com.example.unknown'
});
assert.equal(recognizeStoreUrl('https://example.com/'), null);

console.log('my-apps-known-apps: registry, HTTPS targets, and strict store URL parsers passed');
