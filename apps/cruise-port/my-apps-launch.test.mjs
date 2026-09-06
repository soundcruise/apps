import assert from 'node:assert/strict';
import { detectMyAppsPlatform, resolveMyAppHref } from './my-apps-launch.js';

const storeUrl = 'https://apps.apple.com/jp/app/spotify/id324684580';
const httpsItem = { url: storeUrl, launchMode: 'https', appKey: null, customLaunch: null };
const spotifyItem = { url: storeUrl, launchMode: 'known-app', appKey: 'spotify', customLaunch: null };

assert.equal(resolveMyAppHref(httpsItem, 'ios'), storeUrl);
assert.equal(resolveMyAppHref(httpsItem, 'android'), storeUrl);
assert.equal(resolveMyAppHref(spotifyItem, 'ios'), 'https://open.spotify.com/');
assert.equal(resolveMyAppHref({ ...spotifyItem, appKey: 'youtube' }, 'ios'), 'https://www.youtube.com/');
assert.equal(resolveMyAppHref({ ...spotifyItem, appKey: 'dropbox' }, 'ios'), 'https://www.dropbox.com/home');
assert.equal(resolveMyAppHref({ ...spotifyItem, appKey: 'notion' }, 'ios'), 'https://www.notion.so/');
assert.equal(resolveMyAppHref({ ...spotifyItem, appKey: 'chatgpt' }, 'ios'), 'https://chatgpt.com/#native');
assert.equal(resolveMyAppHref(spotifyItem, 'desktop'), storeUrl, 'desktop uses registered HTTPS URL');
assert.equal(resolveMyAppHref(spotifyItem, 'unknown'), storeUrl, 'unknown platform uses safe fallback');
assert.equal(resolveMyAppHref(spotifyItem, 'android'), storeUrl, 'Android direct launch is disabled until M3.2-B');
assert.equal(resolveMyAppHref({ ...spotifyItem, appKey: 'unknown-app' }, 'ios'), storeUrl);

const customItem = {
    url: storeUrl,
    launchMode: 'custom',
    appKey: null,
    customLaunch: { ios: 'https://example.com/app-link', android: 'https://example.com/android' }
};
assert.equal(resolveMyAppHref(customItem, 'ios'), 'https://example.com/app-link');
assert.equal(resolveMyAppHref({ ...customItem, customLaunch: { ios: null, android: 'https://example.com/android' } }, 'ios'), storeUrl);
assert.equal(resolveMyAppHref(customItem, 'android'), storeUrl, 'Android custom target stays inactive in M3.2-A.1');
assert.equal(resolveMyAppHref(customItem, 'desktop'), storeUrl);
assert.equal(resolveMyAppHref({ ...customItem, customLaunch: { ios: 'javascript:alert(1)', android: null } }, 'ios'), storeUrl);

assert.equal(detectMyAppsPlatform({ userAgent: 'Mozilla/5.0 (iPhone)', platform: 'iPhone' }), 'ios');
assert.equal(detectMyAppsPlatform({ userAgent: 'Mozilla/5.0', platform: 'MacIntel', maxTouchPoints: 5 }), 'ios');
assert.equal(detectMyAppsPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux armv8l' }), 'android');
assert.equal(detectMyAppsPlatform({ userAgentData: { platform: 'Android' }, userAgent: '' }), 'android');
assert.equal(detectMyAppsPlatform({ userAgentData: { platform: 'macOS' }, userAgent: '' }), 'desktop');
assert.equal(detectMyAppsPlatform({ userAgent: '', platform: '', maxTouchPoints: 0 }), 'unknown');

console.log('my-apps-launch: iOS direct targets, platform detection, and safe fallbacks passed');
