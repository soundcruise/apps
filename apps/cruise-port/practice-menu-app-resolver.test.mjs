import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    PRACTICE_APP_STATUS,
    countPracticeMenuReferences,
    createMyAppPracticeAppId,
    createPracticeAppOptionGroups,
    getMyAppIdFromPracticeAppId,
    isSelectablePracticeAppId,
    resolvePracticeMenuApp
} from './practice-menu-app-resolver.js';

const spotify = {
    id: 'spotify-id',
    name: 'Spotify',
    url: 'https://apps.apple.com/app/id324684580',
    launchMode: 'known-app',
    appKey: 'spotify',
    customLaunch: null
};
const youtube = {
    id: 'youtube-id',
    name: 'YouTube',
    url: 'https://play.google.com/store/apps/details?id=com.google.android.youtube',
    launchMode: 'known-app',
    appKey: 'youtube',
    customLaunch: null
};
const unknown = {
    id: 'unknown-id',
    name: 'Unknown',
    url: 'https://apps.apple.com/app/id999999999',
    launchMode: 'https',
    appKey: null,
    customLaunch: null
};

assert.equal(createMyAppPracticeAppId('opaque-id'), 'myapp:opaque-id');
assert.equal(getMyAppIdFromPracticeAppId('myapp:opaque-id'), 'opaque-id');
assert.equal(getMyAppIdFromPracticeAppId('future-app'), null);

assert.deepEqual(resolvePracticeMenuApp('pitch', { edition: 'pro' }), {
    appId: 'pitch', kind: 'builtin', label: '音感クルーズ',
    href: '/apps/pitch-cruise/pro_x9v7q2m8/', launchable: true, status: 'resolved'
});
assert.equal(resolvePracticeMenuApp('tuner').href, '#tuner');
assert.deepEqual(resolvePracticeMenuApp(null), {
    appId: null, kind: 'none', label: '使用アプリなし', href: null, launchable: false, status: 'none'
});

assert.equal(resolvePracticeMenuApp('myapp:spotify-id', { myApps: [spotify], myAppsReady: true, platform: 'ios' }).href, 'https://open.spotify.com/');
assert.equal(resolvePracticeMenuApp('myapp:unknown-id', { myApps: [unknown], myAppsReady: true, platform: 'ios' }).href, unknown.url);
assert.equal(resolvePracticeMenuApp('myapp:youtube-id', { myApps: [youtube], myAppsReady: true, platform: 'android' }).href, 'https://www.youtube.com/');
assert.equal(resolvePracticeMenuApp('myapp:spotify-id', { myApps: [spotify], myAppsReady: true, platform: 'android' }).href, spotify.url);
assert.equal(resolvePracticeMenuApp('myapp:spotify-id', { myApps: [spotify], myAppsReady: true, platform: 'desktop' }).href, spotify.url);

const legacyCustom = {
    ...unknown,
    id: 'legacy-id',
    name: 'Legacy',
    launchMode: 'custom',
    customLaunch: { ios: 'https://example.com/app-link', android: null }
};
assert.equal(resolvePracticeMenuApp('myapp:legacy-id', { myApps: [legacyCustom], myAppsReady: true, platform: 'ios' }).href, 'https://example.com/app-link');

const missing = resolvePracticeMenuApp('myapp:deleted-id', { myApps: [spotify], myAppsReady: true, platform: 'ios' });
assert.equal(missing.status, PRACTICE_APP_STATUS.missing);
assert.equal(missing.label, '削除済みのMy App');
assert.equal(missing.launchable, false);
assert.equal(missing.href, null);
assert.notEqual(resolvePracticeMenuApp(null).status, missing.status, 'no app and a deleted My App remain distinct');

const unavailable = resolvePracticeMenuApp('myapp:spotify-id', { myApps: [], myAppsReady: false });
assert.equal(unavailable.status, PRACTICE_APP_STATUS.storeUnavailable);
assert.equal(unavailable.label, '使用アプリを読み込めません');
assert.equal(resolvePracticeMenuApp('tuner', { myAppsReady: false }).status, PRACTICE_APP_STATUS.resolved, 'builtin survives My Apps failure');

const unsupported = resolvePracticeMenuApp('future-app', { myAppsReady: true });
assert.equal(unsupported.status, PRACTICE_APP_STATUS.unsupported);
assert.equal(unsupported.label, '未対応のアプリ');
assert.equal(resolvePracticeMenuApp('__proto__', { myAppsReady: true }).status, PRACTICE_APP_STATUS.unsupported);

assert.equal(isSelectablePracticeAppId('pitch'), true);
assert.equal(isSelectablePracticeAppId('myapp:spotify-id', { myApps: [spotify], myAppsReady: true }), true);
assert.equal(isSelectablePracticeAppId('myapp:spotify-id', { myApps: [spotify], myAppsReady: false }), false);
assert.equal(isSelectablePracticeAppId('myapp:deleted-id', { myApps: [spotify], myAppsReady: true }), false);
assert.equal(isSelectablePracticeAppId('future-app', { myApps: [spotify], myAppsReady: true }), false);

const renamed = { ...spotify, name: 'Spotify renamed' };
assert.equal(resolvePracticeMenuApp('myapp:spotify-id', { myApps: [renamed], myAppsReady: true }).label, 'Spotify renamed');
const changedUrl = { ...unknown, url: 'https://example.com/new' };
assert.equal(resolvePracticeMenuApp('myapp:unknown-id', { myApps: [changedUrl], myAppsReady: true, platform: 'desktop' }).href, changedUrl.url);
const directEnabled = { ...unknown, launchMode: 'known-app', appKey: 'spotify' };
assert.equal(resolvePracticeMenuApp('myapp:unknown-id', { myApps: [directEnabled], myAppsReady: true, platform: 'ios' }).href, 'https://open.spotify.com/');
assert.equal(resolvePracticeMenuApp('myapp:spotify-id', { myApps: [], myAppsReady: true }).status, 'missing');
assert.equal(
    resolvePracticeMenuApp('myapp:spotify-id', { myApps: [{ ...spotify, id: 'new-id' }], myAppsReady: true }).status,
    'missing',
    'same-name recreation does not reconnect'
);

{
    const groups = createPracticeAppOptionGroups([]);
    assert.deepEqual(groups.map((group) => group.label), ['クルーズアプリ', 'ツール']);
    assert.deepEqual(groups.flatMap((group) => group.options.map((option) => option.value)), [
        'pitch', 'fretboard', 'rhythm', 'chord', 'metronome', 'tuner'
    ]);
}

{
    const duplicateApps = [
        { ...spotify, id: 'a', name: 'Music', url: 'https://one.example/a' },
        { ...spotify, id: 'b', name: 'Music', url: 'https://two.example/b' },
        { ...spotify, id: 'c', name: 'Music', url: 'https://two.example/c' }
    ];
    const groups = createPracticeAppOptionGroups(duplicateApps);
    assert.deepEqual(groups.map((group) => group.label), ['クルーズアプリ', 'ツール', 'My Apps']);
    assert.deepEqual(groups[2].options.map((option) => option.value), ['myapp:a', 'myapp:b', 'myapp:c'], 'saved order is preserved');
    assert.deepEqual(groups[2].options.map((option) => option.label), [
        'Music — one.example', 'Music — two.example', 'Music — two.example (2)'
    ]);
}

{
    const hundred = Array.from({ length: 100 }, (_, index) => ({
        ...unknown,
        id: `id-${index}`,
        name: `App ${index}`
    }));
    const myAppsGroup = createPracticeAppOptionGroups(hundred)[2];
    assert.equal(myAppsGroup.options.length, 100);
    assert.equal(myAppsGroup.options[99].value, 'myapp:id-99');
}

const menus = [
    { id: '1', appId: 'myapp:spotify-id' },
    { id: '2', appId: 'pitch' },
    { id: '3', appId: 'myapp:spotify-id' }
];
assert.equal(countPracticeMenuReferences(menus, 'spotify-id'), 2);
assert.equal(countPracticeMenuReferences(menus, 'missing'), 0);

const appSource = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
assert.match(appSource, /resolvePracticeMenuApp\(appId,/);
assert.match(appSource, /createPracticeAppOptionGroups\(myAppsState\.items\)/);
assert.match(appSource, /countPracticeMenuReferences\(state\.items, item\.id\)/);
assert.match(appSource, /このアプリは練習メニュー\$\{referenceCount\}件で使用されています/);
assert.match(appSource, /elements\.openApp\.href = app\.href/);
assert.match(appSource, /elements\.openApp\.removeAttribute\('href'\)/);
assert.doesNotMatch(appSource, /window\.open\(/);
assert.match(markup, /<select id="practice-app" name="appId">/);
assert.doesNotMatch(markup, /<select id="practice-app" name="appId" required>/);
assert.match(appSource, /const appId = selectedAppId \|\| null/);
assert.match(appSource, /elements\.openApp\.hidden = !app\.launchable/);
assert.match(markup, /id="practice-empty"[\s\S]*まだ練習メニューがありません/);
assert.match(markup, /id="practice-detail-saved"/);
assert.match(appSource, /message: savedCount > 0 \? `保存しました。ファイルを\$\{savedCount\}件追加しました。` : '保存しました。'/);
assert.match(markup, /id="practice-detail-back"[^>]*>練習メニューに戻る/);
assert.match(appSource, /function replacePracticeDetailRoute\(id\)[\s\S]*history\.replaceState/);
const createSubmitSource = appSource.slice(appSource.indexOf("if (!guardPracticeCreation()) return;"), appSource.indexOf('\nfunction cancelForm'));
assert.match(createSubmitSource, /if \(attachmentResult\.ok\)[\s\S]*state\.listNotice[\s\S]*replacePracticeListRoute\(\)/);
assert.match(createSubmitSource, /state\.savedNotice[\s\S]*attachmentResult\.failed\.fileName[\s\S]*replacePracticeDetailRoute\(item\.id\)/);
assert.match(appSource, /elements\.empty\.hidden = state\.reorderMode \|\| activeItems\.length > 0/);
assert.match(appSource, /launch\.dataset\.practiceAction = 'launch'/);
assert.match(appSource, /if \(app\.launchable\)/);
assert.match(appSource, /if \(action\.dataset\.practiceAction === 'launch'\)[\s\S]*event\.stopPropagation/);
assert.match(appSource, /action\.getAttribute\('href'\) === '#tuner'[\s\S]*tunerController\.startFromUserGesture/);
assert.match(appSource, /elements\.openApp\.getAttribute\('href'\) !== '#tuner'[\s\S]*tunerController\.startFromUserGesture/);

console.log('practice-menu-app-resolver: resolution, dynamic options, updates, and delete references passed');
