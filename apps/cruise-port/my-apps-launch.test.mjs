import assert from 'node:assert/strict';
import test from 'node:test';
import { detectMyAppsPlatform, resolveMyAppHref } from './my-apps-launch.js';
import { resolvePracticeMenuApp, createMyAppPracticeAppId } from './practice-menu-app-resolver.js';

const legacy = 'https://legacy.example.com/';
const urls = { ios: 'https://ios.example.com/', android: 'https://android.example.com/', macos: 'https://mac.example.com/', windows: 'https://windows.example.com/', web: 'https://web.example.com/' };
const item = { id: 'stable-id', name: 'Shared app', url: legacy, urls, launchMode: 'custom', appKey: null, customLaunch: { ios: 'https://ignored.example.com/', android: null } };

test('platform detection handles mobile, desktop-like iPadOS, Mac, Windows and other', () => {
    assert.equal(detectMyAppsPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', platform: 'iPhone' }), 'ios');
    assert.equal(detectMyAppsPlatform({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }), 'ios');
    assert.equal(detectMyAppsPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux armv8l' }), 'android');
    assert.equal(detectMyAppsPlatform({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 }), 'macos');
    assert.equal(detectMyAppsPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32' }), 'windows');
    assert.equal(detectMyAppsPlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64' }), 'web');
});

test('each platform opens only its saved URL, then web, then legacy', () => {
    for (const [platform, key] of [['ios', 'ios'], ['android', 'android'], ['macos', 'macos'], ['windows', 'windows'], ['web', 'web']]) {
        assert.equal(resolveMyAppHref(item, platform), urls[key]);
    }
    assert.equal(resolveMyAppHref(item, 'unknown'), urls.web);
    assert.equal(resolveMyAppHref({ ...item, urls: { ...urls, ios: '' } }, 'ios'), urls.web);
    assert.equal(resolveMyAppHref({ ...item, urls: { ios: '', android: '', macos: '', windows: '', web: '' } }, 'android'), legacy);
    assert.equal(resolveMyAppHref({ ...item, url: '', urls: { ios: urls.ios, android: '', macos: '', windows: '', web: '' } }, 'android'), '');
    assert.equal(resolveMyAppHref({ ...item, url: '', urls: { ios: urls.ios, android: '', macos: '', windows: '', web: '' } }, 'web'), '');
    assert.equal(resolveMyAppHref(null, 'ios'), '');
});

test('Practice Menu resolves the same current record and signals no URL', () => {
    const appId = createMyAppPracticeAppId(item.id);
    const android = resolvePracticeMenuApp(appId, { myApps: [item], myAppsReady: true, platform: 'android' });
    assert.equal(android.href, urls.android);
    assert.equal(android.launchable, true);
    const iosOnly = { ...item, url: '', urls: { ios: urls.ios, android: '', macos: '', windows: '', web: '' } };
    const missing = resolvePracticeMenuApp(appId, { myApps: [iosOnly], myAppsReady: true, platform: 'android' });
    assert.equal(missing.href, null);
    assert.equal(missing.status, 'no-url');
});
