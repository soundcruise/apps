import assert from 'node:assert/strict';
import { MY_APPS_KNOWN_APPS } from './my-apps-known-apps.js';
import {
    canUseKnownAppDirectLaunch,
    detectMyAppsPlatform,
    getKnownLaunchUiMode,
    resolveMyAppHref,
    resolveVerifiedAndroidTarget
} from './my-apps-launch.js';

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
assert.equal(resolveMyAppHref(spotifyItem, 'android'), storeUrl, 'unverified Android known app uses its Store URL');
assert.equal(resolveMyAppHref({ ...spotifyItem, appKey: 'unknown-app' }, 'ios'), storeUrl);

const youtubePlayUrl = 'https://play.google.com/store/apps/details?id=com.google.android.youtube';
const youtubeAndroidItem = { url: youtubePlayUrl, launchMode: 'known-app', appKey: 'youtube', customLaunch: null };
assert.equal(resolveMyAppHref(youtubeAndroidItem, 'android'), 'https://www.youtube.com/');
assert.equal(resolveMyAppHref({ ...youtubeAndroidItem, appKey: 'youtube-music' }, 'android'), 'https://music.youtube.com/');
assert.equal(resolveMyAppHref({ ...youtubeAndroidItem, appKey: 'google-drive' }, 'android'), 'https://drive.google.com/drive');
assert.equal(resolveMyAppHref({ ...youtubeAndroidItem, appKey: 'canva' }, 'android'), 'https://www.canva.com/design');
assert.equal(resolveMyAppHref({ ...youtubeAndroidItem, appKey: 'x-twitter' }, 'android'), 'https://x.com/');
assert.equal(resolveMyAppHref({ ...youtubeAndroidItem, appKey: 'instagram' }, 'android'), youtubePlayUrl, 'WEB result remains disabled');
assert.equal(resolveMyAppHref({ ...youtubeAndroidItem, appKey: 'moises' }, 'android'), youtubePlayUrl, 'redirect-to-WEB result remains disabled');
assert.equal(resolveMyAppHref({ ...youtubeAndroidItem, appKey: 'chatgpt' }, 'android'), youtubePlayUrl, 'null Android target falls back');

assert.equal(resolveVerifiedAndroidTarget({ kind: 'https', href: 'https://example.com/app', verified: true }), 'https://example.com/app');
assert.equal(resolveVerifiedAndroidTarget({ kind: 'https', href: 'https://example.com/app', verified: false }), null);
assert.equal(resolveVerifiedAndroidTarget({ kind: 'https', href: 'javascript:alert(1)', verified: true }), null);
assert.equal(resolveVerifiedAndroidTarget({ kind: 'https', href: 'https://user@example.com/app', verified: true }), null);
assert.equal(resolveVerifiedAndroidTarget({ kind: 'https', href: 'https://example.com:444/app', verified: true }), null);

assert.equal(canUseKnownAppDirectLaunch('youtube', 'android'), true);
assert.equal(canUseKnownAppDirectLaunch('spotify', 'android'), false);
assert.equal(canUseKnownAppDirectLaunch('chatgpt', 'android'), false);
assert.equal(getKnownLaunchUiMode('youtube', 'android'), 'direct');
assert.equal(getKnownLaunchUiMode('spotify', 'android'), 'fallback');
assert.equal(getKnownLaunchUiMode('chatgpt', 'android'), 'fallback');
assert.equal(getKnownLaunchUiMode('unknown-app', 'android'), 'hidden');
assert.equal(getKnownLaunchUiMode('spotify', 'ios'), 'direct', 'iOS UI remains unchanged');

for (const app of MY_APPS_KNOWN_APPS) {
    assert.equal(
        resolveMyAppHref({ ...spotifyItem, appKey: app.key }, 'ios'),
        app.launch.ios?.href || storeUrl,
        `${app.key} keeps its iOS direct target`
    );
}

const lineMusicItem = {
    url: 'https://play.google.com/store/apps/details?id=jp.linecorp.linemusic.android',
    launchMode: 'known-app',
    appKey: 'line-music',
    customLaunch: null
};
assert.equal(resolveMyAppHref(lineMusicItem, 'ios'), 'https://music.line.me/launch');
assert.equal(
    resolveMyAppHref(lineMusicItem, 'android'),
    lineMusicItem.url,
    'Android candidate metadata remains inactive until M3.2-B'
);

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
