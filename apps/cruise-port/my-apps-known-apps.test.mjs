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

const expected = [
    ['spotify', '324684580', 'com.spotify.music', 'https://open.spotify.com/'],
    ['youtube', '544007664', 'com.google.android.youtube', 'https://www.youtube.com/'],
    ['dropbox', '327630330', 'com.dropbox.android', 'https://www.dropbox.com/home'],
    ['notion', '1232780281', 'notion.id', 'https://www.notion.so/'],
    ['chatgpt', '6448311069', 'com.openai.chatgpt', 'https://chatgpt.com/#native']
];

assert.equal(MY_APPS_KNOWN_APPS.length, 5, 'only the approved initial five apps are registered');
for (const [key, iosId, androidPackage, iosHref] of expected) {
    const app = getKnownApp(key);
    assert(app, `${key} is registered`);
    assert.equal(findKnownAppByIosStoreId(iosId), app);
    assert.equal(findKnownAppByAndroidPackage(androidPackage), app);
    assert.equal(resolveKnownAppTarget(key, 'ios'), iosHref);
}
assert.equal(resolveKnownAppTarget('chatgpt', 'android'), null, 'unverified ChatGPT Android target is disabled');
assert.equal(getKnownApp('google-drive'), null, 'M3.2-C candidates are excluded');

for (const app of MY_APPS_KNOWN_APPS) {
    for (const target of Object.values(app.launch).filter(Boolean)) {
        const url = new URL(target.href);
        assert.equal(target.kind, 'https');
        assert.equal(url.protocol, 'https:');
        assert(url.hostname);
        assert.equal(url.username, '');
        assert.equal(url.password, '');
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
