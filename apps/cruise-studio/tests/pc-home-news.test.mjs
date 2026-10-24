import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNewsController } from '../js/modules/pc-home-news.mjs';
import { resolveLibraryLaunch, launchLibraryApp } from '../js/modules/library/launch.mjs';
import { projectLibrary } from '../js/port-data/library-projection.mjs';
import { libraryFixture } from './library-fixture.mjs';
import { resolveMyAppHref } from '../../cruise-port/my-apps-launch.js';
const mac = { platform: 'MacIntel', userAgent: 'Macintosh' }, win = { platform: 'Win32', userAgent: 'Windows' };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('NEWS import does not fetch, open storage, start timer or load Port application', () => {
    const source = readFileSync(new URL('../js/modules/pc-home-news.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /localStorage|indexedDB|practice-menu-app|ensure\w*\(|provision\w*\(|\.setItem\(/);
    let calls = 0; const c = createNewsController({ load() { calls++; } }); assert.equal(calls, 0); assert.equal(c.snapshot().phase, 'idle'); c.dispose();
});
test('NEWS loading/ready and disposal are memory-only', async () => {
    let finish, calls = 0, changes = [];
    const c = createNewsController({ load: () => { calls++; return new Promise(r => finish = r); }, change: s => changes.push(s.phase) });
    const p = c.activate(); assert.equal(c.snapshot().phase, 'loading'); finish({ items: [], mode: 'on' }); await p;
    assert.deepEqual(changes, ['loading', 'ready']); assert.equal(calls, 1); c.dispose(); await c.activate(); assert.equal(calls, 1);
});
test('NEWS deactivation aborts actual fetch signal and rejects a late previous activation', async () => {
    let resolveOld, signals = [], calls = 0;
    const c = createNewsController({ fetcher: (_url, options) => { signals.push(options.signal); return ++calls === 1 ? new Promise(r => resolveOld = r) : Promise.resolve({ items: [{ id: 'new' }], mode: 'on' }); },
        load: ({ fetcher }) => fetcher('https://news.invalid', { signal: AbortSignal.timeout(1000) }) });
    const old = c.activate(); assert.equal(signals[0].aborted, false); c.deactivate(); assert.equal(signals[0].aborted, true);
    await c.activate(); resolveOld({ items: [{ id: 'stale' }], mode: 'on' }); await old;
    assert.equal(c.snapshot().items[0].id, 'new'); c.dispose();
});
test('NEWS refresh drops previous external content before response, kill cannot revive fallback', async () => {
    let call = 0;
    const c = createNewsController({ load: async () => { if (++call === 1) return { items: [{ id: 'old' }], mode: 'on' }; const error = Error('disabled'); error.name = 'NewsDisabledError'; throw error; } });
    await c.activate(); assert.equal(c.snapshot().items.length, 1); const p = c.refresh(); assert.equal(c.snapshot().items.length, 0); await p;
    assert.equal(c.snapshot().phase, 'off'); assert.equal(c.snapshot().mode, 'off'); assert.deepEqual(c.snapshot().items, []); c.dispose();
});
test('NEWS outage has explicit error and only the owner fallback, never old external cache', async () => {
    const { CRUISE_APPS_NEWS_ITEM } = await import('../../cruise-port/news-articles.js');
    const c = createNewsController({ fetcher: async () => { throw Error('offline'); } });
    await c.activate(); assert.equal(c.snapshot().phase, 'error'); assert.deepEqual(c.snapshot().items.map(x => x.id), [CRUISE_APPS_NEWS_ITEM.id]); assert.match(c.snapshot().notice, /読み込めません/); c.dispose();
});
test('NEWS failure never manufactures an available state', async () => {
    const c = createNewsController({ load: async () => { throw Error('malformed'); } }); await c.activate(); assert.equal(c.snapshot().phase, 'error'); assert.deepEqual(c.snapshot().items, []); c.dispose();
});
test('My Apps routing reuses exact Port platform precedence with readonly snapshots', () => {
    const f = libraryFixture(), raw = f['cruisePort.myApps'].items[0]; raw.urls.macos = 'https://example.invalid/mac'; raw.urls.windows = 'https://example.invalid/win';
    const before = JSON.stringify(f), item = projectLibrary(f).myApps.items[0];
    assert.equal(resolveLibraryLaunch(item, mac).href, resolveMyAppHref(raw, 'macos'));
    assert.equal(resolveLibraryLaunch(item, win).href, resolveMyAppHref(raw, 'windows'));
    assert.equal(JSON.stringify(f), before); assert(Object.isFrozen(item.launch.urls));
});
test('My Apps old saved fallback remains available; deprecated launchMode/appKey cannot override', () => {
    const f = libraryFixture(); const raw = f['cruisePort.myApps'].items[0]; delete raw.urls; raw.launchMode = 'known-app'; raw.appKey = 'spotify';
    assert.equal(resolveLibraryLaunch(projectLibrary(f).myApps.items[0], mac).href, raw.url);
});
test('My Apps unsafe chosen platform never falls through to a different safe URL', () => {
    for (const href of ['javascript:alert(1)', 'https://u:p@example.invalid/', 'data:text/html,hi', '//example.invalid/', 'https://example.invalid/a\nb', 'https://example.invalid/' + 'x'.repeat(2048)]) {
        const item = { launch: { urls: { macos: href, web: 'https://safe.invalid/' }, url: 'https://fallback.invalid/' } };
        assert.equal(resolveLibraryLaunch(item, mac).ok, false, href);
    }
});
test('My Apps launch requests noopener/noreferrer once; no resolver or launch storage writes', () => {
    const calls = [], item = projectLibrary(libraryFixture()).myApps.items[0];
    const result = launchLibraryApp(item, { navigatorObject: mac, windowObject: { open(...args) { calls.push(args); return null; } } });
    assert.equal(result.ok, true); assert.deepEqual(calls, [[item.launch.urls.web, '_blank', 'noopener,noreferrer']]);
    assert.deepEqual(launchLibraryApp(item, { navigatorObject: mac, windowObject: { open() { throw Error('blocked'); } } }), { ok: false, reason: 'blocked' });
});
test('NEWS and Home markup owns no save/Account mutation and prints no new screen', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8'), print = readFileSync(new URL('../print.css', import.meta.url), 'utf8');
    assert.match(html, /data-workspace="news"/); assert.match(html, /data-home-workspace="practice"/); assert.match(print, /#screen-news/);
    assert.match(readFileSync(new URL('../js/modules/library/workspace.js', import.meta.url), 'utf8'), /event\.isTrusted/);
});
