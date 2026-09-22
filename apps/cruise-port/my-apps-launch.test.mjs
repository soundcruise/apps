import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMyAppHref } from './my-apps-launch.js';
import { resolvePracticeMenuApp, createMyAppPracticeAppId } from './practice-menu-app-resolver.js';

const storeUrl = 'https://apps.apple.com/jp/app/spotify/id324684580';
const legacyKnown = { id: 'spotify', name: 'Spotify', url: storeUrl, launchMode: 'known-app', appKey: 'spotify', customLaunch: null };
const legacyCustom = { ...legacyKnown, launchMode: 'custom', appKey: null, customLaunch: { ios: 'https://open.spotify.com/', android: null } };

test('saved URL is the only launch target for all platforms and legacy metadata', () => {
    for (const platform of ['ios', 'android', 'desktop', 'unknown']) {
        for (const item of [legacyKnown, legacyCustom, { ...legacyKnown, launchMode: 'https', appKey: null }]) {
            assert.equal(resolveMyAppHref(item, platform), storeUrl);
        }
    }
    assert.equal(resolveMyAppHref(null, 'ios'), '');
});

test('Practice Menu links to the same saved My Apps URL', () => {
    for (const item of [legacyKnown, legacyCustom]) {
        const model = resolvePracticeMenuApp(createMyAppPracticeAppId(item.id), {
            myApps: [item], myAppsReady: true, platform: 'ios'
        });
        assert.equal(model.href, storeUrl);
    }
});
