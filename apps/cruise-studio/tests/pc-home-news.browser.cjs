/* Isolated UI acceptance: fixture NEWS transport, saved Port bytes are readonly. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium } = require('playwright');
const url = process.env.STUDIO_URL, artifacts = process.env.STUDIO_ARTIFACTS;
test('Home, NEWS and explicit My Apps launch in real disposable Chrome', async t => {
    assert(url, 'STUDIO_URL must name a separate loopback fixture server');
    const origin = new URL(url).origin;
    assert(['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
    assert(!['8765', '8766'].includes(new URL(url).port));
    const { libraryFixture, serializeFixture } = await import('./library-fixture.mjs');
    const fixture = libraryFixture(); fixture['cruisePort.myApps'].items[0].urls.macos = 'https://example.invalid/mac-app';
    const rawFixture = serializeFixture(fixture);
    const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    let mode = 'ready', hold, requestCount = 0;
    const external = [], consoleErrors = [], missing = [], report = { cases: [], screenshots: [] };
    const publishedAt = new Date(Date.now() - 3600000).toISOString();
    const record = { id: 'pc-news-test', label: 'ギター練習ニュース', sourceName: 'Fixture Music', sourceUrl: 'https://example.invalid/article', publishedAt, category: 'acoustic_guitar', publishable: true };
    await context.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.origin === origin && u.pathname === '/__cruise_preview/news') {
            requestCount++;
            if (mode === 'hold') await new Promise(resolve => hold = resolve);
            const body = mode === 'disabled' ? { disabled: true } : mode === 'bad' ? { contractVersion: 99, items: [] } : { contractVersion: 1, items: mode === 'empty' ? [] : [record], nextOffset: null };
            try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); } catch { /* aborted request on workspace leave */ }
            return;
        }
        if (u.origin === origin) return route.continue();
        if (u.hostname === 'fonts.googleapis.com') return route.fulfill({ body: '', contentType: 'text/css' });
        external.push(u.href); return route.abort();
    });
    await context.addInitScript(values => {
        for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
        window.__pcUI = { writes: [], idb: [], opens: [], requests: [] };
        for (const method of ['setItem', 'removeItem', 'clear']) { const fn = Storage.prototype[method]; Storage.prototype[method] = function (key, ...args) { __pcUI.writes.push({ method, key }); return fn.call(this, key, ...args); }; }
        for (const method of ['add', 'put', 'delete', 'clear']) { const fn = IDBObjectStore.prototype[method]; IDBObjectStore.prototype[method] = function (...args) { __pcUI.idb.push({ method, store: this.name }); return fn.apply(this, args); }; }
        const originalFetch = window.fetch.bind(window); window.fetch = (...args) => { __pcUI.requests.push(String(args[0])); return originalFetch(...args); };
        window.open = (...args) => { __pcUI.opens.push(args); return null; };
    }, rawFixture);
    const p = await context.newPage(); p.setDefaultTimeout(10000);
    p.on('pageerror', e => consoleErrors.push(e.message)); p.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); }); p.on('response', r => { if (r.status() === 404) missing.push(r.url()); });
    const nav = id => p.locator(`.studio-nav [data-workspace="${id}"]`).click();
    const ready = () => p.waitForFunction(() => ['ready', 'error', 'off'].includes(document.querySelector('#screen-news').dataset.status));
    const step = (label, fn) => t.test(label, async () => { await fn(); report.cases.push(label); });
    try {
        await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForFunction(() => !!CruiseStudio.homeView && !!CruiseStudio.newsView && !!CruiseStudio.libraryViews);
        await step('Home is cold, readonly and exposes every principal PC entry', async () => {
            assert.equal(requestCount, 0); assert.match(await p.locator('[data-home-port-status]').innerText(), /未確認/);
            assert.deepEqual(await p.locator('.pc-home-grid [data-home-workspace]').evaluateAll(es => es.map(e => e.dataset.homeWorkspace)), ['tuner', 'practice', 'gear', 'myApps', 'news', 'series']);
            assert.equal(await p.evaluate(() => CruiseStudio.portDataHost.canWrite), false);
            for (const id of ['practice', 'gear', 'myApps', 'tuner', 'series']) { await p.locator(`[data-home-workspace="${id}"]`).click(); assert.equal(await p.evaluate(() => CruiseStudio.shellHost.getActiveWorkspace()), id); await nav('home'); }
            assert.equal(requestCount, 0); assert.deepEqual(await p.evaluate(() => __pcUI.idb), []);
        });
        await step('Home Metronome, settings and explicit Port-status entry use existing shell controls', async () => {
            await p.locator('[data-home-action="metronome"]').click(); assert.equal(await p.locator('#studio-dock').isVisible(), true);
            await p.locator('[data-home-action="settings"]').click(); assert.equal(await p.evaluate(() => document.activeElement.name), 'studio-theme');
            await p.locator('[data-home-action="port"]').click(); assert.equal(await p.evaluate(() => document.activeElement.id), 'studio-port-read');
            await p.locator('#shell-pane-close').click(); await p.locator('#shell-dock-toggle').click();
        });
        await step('NEWS loading, official source normalization, list and external detail', async () => {
            mode = 'hold'; await p.locator('[data-home-workspace="news"]').click(); await p.waitForFunction(() => document.querySelector('#screen-news').dataset.status === 'loading');
            assert.match(await p.locator('[data-news-status]').innerText(), /読み込んでいます/); mode = 'ready'; hold(); await ready();
            assert.equal(await p.locator('[data-news-id="pc-news-test"]').count(), 1);
            await p.locator('[data-news-id="pc-news-test"]').focus(); await p.keyboard.press('Enter');
            assert.match(await p.locator('[data-news-detail]').innerText(), /Fixture Music/); assert.equal(await p.evaluate(() => document.activeElement.tagName), 'H2');
            const link = p.locator('[data-news-detail] a'); assert.equal(await link.getAttribute('href'), record.sourceUrl); assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
            await link.focus(); await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow'))); assert.equal(await link.evaluate(e => e === document.activeElement), true);
            await p.keyboard.press('Escape'); assert.equal(await p.evaluate(() => document.activeElement.dataset.newsId), record.id);
        });
        await step('NEWS first-party detail, category empty state and keyboard back', async () => {
            await p.locator('[data-news-id="cruise-port-theme-colors"]').click(); assert.match(await p.locator('[data-news-detail]').innerText(), /4種類/);
            await p.locator('[data-news-back]').focus(); await p.keyboard.press('Enter');
            await p.locator('[data-news-category]').selectOption('sale'); assert.match(await p.locator('[data-news-list]').innerText(), /表示できるニュースはありません/); await p.locator('[data-news-category]').selectOption('');
        });
        await step('API outage and kill do not revive stale external records', async () => {
            mode = 'bad'; await p.locator('[data-news-refresh]').click(); await ready(); assert.equal(await p.locator('#screen-news').getAttribute('data-status'), 'error'); assert.match(await p.locator('[data-news-status]').innerText(), /外部ニュースを読み込めません/); assert.equal(await p.locator('[data-news-id="pc-news-test"]').count(), 0); assert.equal(await p.locator('[data-news-id="cruise-port-theme-colors"]').count(), 1);
            mode = 'disabled'; await p.locator('[data-news-refresh]').click(); await ready(); assert.equal(await p.locator('#screen-news').getAttribute('data-status'), 'off'); assert.equal(await p.locator('[data-news-id]').count(), 0);
        });
        await step('Leaving NEWS aborts pending load; reentry cannot adopt old generation', async () => {
            mode = 'hold'; await p.locator('[data-news-refresh]').click(); await p.waitForFunction(() => document.querySelector('#screen-news').dataset.status === 'loading');
            await nav('home'); mode = 'ready'; hold(); await nav('news'); await ready(); assert.equal(await p.locator('[data-news-id="pc-news-test"]').count(), 1);
        });
        await step('My Apps explicit local read preserves saved bytes and projects owner platform target', async () => {
            await nav('myApps'); await p.locator('#screen-my-apps [data-library-read]').click(); await p.waitForFunction(() => document.querySelector('#screen-my-apps').dataset.status === 'ready');
            await p.locator('[data-library-id="custom"]').click(); assert.equal(await p.locator('[data-library-launch]').isEnabled(), true);
            assert.deepEqual(await p.evaluate(() => __pcUI.opens), []); await p.locator('[data-library-launch]').evaluate(e => e.click()); assert.deepEqual(await p.evaluate(() => __pcUI.opens), []);
            await p.locator('[data-library-launch]').focus(); await p.keyboard.press('Enter');
            const opens = await p.evaluate(() => __pcUI.opens); assert.deepEqual(opens, [['https://example.invalid/mac-app', '_blank', 'noopener,noreferrer']]); assert.match(await p.locator('[data-launch-status]').innerText(), /起動を要求/); assert.equal(await p.evaluate(() => document.activeElement.hasAttribute('data-library-launch')), true);
            for (const [key, value] of Object.entries(rawFixture)) assert.equal(await p.evaluate(k => localStorage.getItem(k), key), value);
        });
        await step('Stale read failure disables launch and cannot use old projection', async () => {
            await p.evaluate(() => { const get = Storage.prototype.getItem; window.__restorePCGet = () => Storage.prototype.getItem = get; Storage.prototype.getItem = function (key) { if (key.startsWith('cruisePort.')) throw Error('fixture read denial'); return get.call(this, key); }; });
            await p.locator('#screen-my-apps [data-library-read]').click(); await p.waitForFunction(() => document.querySelector('#screen-my-apps').dataset.status === 'error'); assert.equal(await p.locator('[data-library-launch]').isDisabled(), true);
            await p.evaluate(() => __restorePCGet()); await p.locator('#screen-my-apps [data-library-read]').click(); await p.waitForFunction(() => document.querySelector('#screen-my-apps').dataset.status === 'ready');
        });
        await step('Four themes and narrow/PC widths fit Main and keep visible keyboard focus', async () => {
            for (const theme of ['dark', 'charcoal', 'gray', 'light']) {
                await p.evaluate(theme => CruiseStudio.colorTheme.setColorTheme(theme), theme);
                for (const width of [390, 768, 1440, 1920]) {
                    await p.setViewportSize({ width, height: 900 }); await nav('home');
                    const home = await p.locator('.pc-home-grid').boundingBox(); assert(home.x >= 0 && home.x + home.width <= width + 1);
                    await p.locator('[data-home-workspace="news"]').focus(); await p.keyboard.press('Enter'); await ready();
                    const geometry = await p.locator('.pc-news-card').first().evaluate(e => ({ x: e.getBoundingClientRect().x, right: e.getBoundingClientRect().right, width: window.innerWidth })); assert(geometry.x >= 0 && geometry.right <= geometry.width + 1);
                    await p.locator('[data-news-id="pc-news-test"]').focus(); await p.keyboard.press('Tab'); assert.equal(await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'), true);
                    if (artifacts && width === 390) { const path = `${artifacts}/news-${theme}-${width}.png`; await p.screenshot({ path }); report.screenshots.push(path); }
                }
            }
        });
        await step('Print hides NEWS; no Port/Account/IDB/network mutations, no console or 404', async () => {
            await p.emulateMedia({ media: 'print' }); assert.equal(await p.locator('#screen-news').evaluate(e => getComputedStyle(e).display), 'none'); await p.emulateMedia({ media: 'screen' });
            const qa = await p.evaluate(() => __pcUI); assert.deepEqual(qa.writes.filter(x => /^(cruisePort\.|soundCruise|sound-cruise)/i.test(x.key)), []); assert.deepEqual(qa.idb, []);
            assert(qa.requests.every(x => x.startsWith('/__cruise_preview/news?'))); assert.deepEqual(external, []); assert.deepEqual(missing, []); assert.deepEqual(consoleErrors, []);
        });
    } finally { if (artifacts) fs.writeFileSync(`${artifacts}/pc-home-news-report.json`, JSON.stringify({ ...report, consoleErrors, missing, external, requestCount }, null, 2)); await context.close(); await browser.close(); }
});
