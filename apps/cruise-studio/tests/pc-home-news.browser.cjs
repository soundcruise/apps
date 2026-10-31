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
    const nav = id => ['gear', 'myApps', 'news'].includes(id) ? p.evaluate(id => CruiseStudio.shellHost.navigate(id), id) : p.locator(`.studio-nav [data-workspace="${id}"]`).click();
    const ready = () => p.waitForFunction(() => ['ready', 'error', 'off'].includes(document.querySelector('#screen-news').dataset.status));
    const step = (label, fn) => t.test(label, async () => { await fn(); report.cases.push(label); });
    try {
        await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForFunction(() => !!CruiseStudio.homeView && !!CruiseStudio.newsView && !!CruiseStudio.libraryViews);
        await step('Home is cold, readonly and exposes every principal PC entry', async () => {
            assert.equal(requestCount, 0); assert.match(await p.locator('[data-home-port-status]').textContent(), /未確認/);
            assert.deepEqual(await p.locator('.pc-home-grid [data-home-workspace]').evaluateAll(es => es.map(e => e.dataset.homeWorkspace)), ['tuner', 'metronome', 'portPractice', 'portGear', 'portMyApps', 'portNews']);
            assert.equal(await p.evaluate(() => CruiseStudio.portDataHost.canWrite), false);
            for (const id of ['portPractice', 'portGear', 'portMyApps']) { await p.locator(`[data-home-workspace="${id}"]`).click(); assert.equal(await p.evaluate(() => CruiseStudio.shellHost.getActiveWorkspace()), id); await nav('home'); }
            assert.equal(await p.locator('.home-series a[target="_blank"]').count(), 4);
            // The Port document may request its own NEWS feed while visiting My Apps.
        });
        await step('Home prioritizes creation, reuses icons and explains tools on hover and focus', async () => {
            assert.deepEqual(await p.locator('.home-primary .module-card-label').allTextContents(), ['譜面クルーズ', 'プレDTMクルーズ']);
            assert.equal(await p.locator('#screen-home').getByText('Cruise Apps', { exact: true }).count(), 0);
            assert.equal(await p.locator('.home-series a[target="_blank"]').count(), 4);
            assert.equal(await p.locator('#screen-home img').evaluateAll(es => es.every(e => e.complete && e.naturalWidth > 0)), true);
            const tip = p.locator('[data-home-workspace="tuner"] .home-tool-tip');
            await p.locator('[data-home-workspace="tuner"]').hover();
            assert.equal(await tip.evaluate(e => getComputedStyle(e).visibility), 'visible');
            await p.mouse.move(0, 0); await p.locator('#open-pre-dtm').focus(); await p.keyboard.press('Tab');
            assert.equal(await p.evaluate(() => document.activeElement.dataset.homeWorkspace), 'tuner');
            assert.equal(await tip.evaluate(e => getComputedStyle(e).visibility), 'visible');
        });
        await step('Home motion responds to hover and keyboard focus and respects reduced motion', async () => {
            await p.emulateMedia({ reducedMotion: 'no-preference' }); await p.mouse.move(0, 0);
            const sheet = p.locator('#open-sheet-cruise .home-page-front');
            const before = await sheet.evaluate(el => getComputedStyle(el).transform);
            await p.locator('#open-sheet-cruise').hover();
            await p.waitForFunction(before => getComputedStyle(document.querySelector('#open-sheet-cruise .home-page-front')).transform !== before, before);
            await p.locator('#open-pre-dtm').focus(); await p.keyboard.press('Tab'); await p.keyboard.press('Shift+Tab');
            await p.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('.home-playhead')).transform).m41 > 10);
            const explanation = await p.locator('#open-pre-dtm .module-card-sub').boundingBox();
            const artwork = await p.locator('#open-pre-dtm .home-art').boundingBox();
            assert(explanation && artwork && explanation.y >= artwork.y + artwork.height, 'the explanation must not cover the artwork');
            assert.equal(await p.locator('#open-pre-dtm .module-card-label').isVisible(), false);
            const cards = p.locator('.home-tools .pc-home-grid button, .home-series .module-card');
            assert.equal(await cards.count(), 10);
            for (const width of [1440, 390]) {
                await p.setViewportSize({ width, height: 900 });
                for (const card of await cards.all()) {
                    await card.hover();
                    await p.waitForFunction(el => new DOMMatrix(getComputedStyle(el).transform).m42 < -1, await card.elementHandle());
                    const tip = await card.locator('.home-tool-tip, .module-card-sub').boundingBox();
                    const icon = await card.locator('img').boundingBox();
                    assert(tip && icon && tip.y >= icon.y + icon.height - 1, `the explanation must not cover the icon at ${width}px`);
                    assert.equal(await card.locator('strong, .module-card-label').isVisible(), false);
                }
            }
            await p.setViewportSize({ width: 1440, height: 900 });
            const tuner = p.locator('[data-home-workspace="tuner"]');
            await p.mouse.move(0, 0); await tuner.focus(); await p.keyboard.press('Tab'); await p.keyboard.press('Shift+Tab');
            await p.waitForFunction(el => el.matches(':focus-visible') && new DOMMatrix(getComputedStyle(el).transform).m42 < -1, await tuner.elementHandle());
            await p.mouse.move(0, 0); await p.emulateMedia({ reducedMotion: 'reduce' });
            assert.equal(await sheet.evaluate(el => getComputedStyle(el).transitionDuration), '0s');
            assert.equal(await p.locator('.home-playhead').evaluate(el => getComputedStyle(el).transform), 'none');
            await p.locator('.home-series .module-card').first().hover();
            assert.equal(await p.locator('.home-series .module-card').first().evaluate(el => getComputedStyle(el).transform), 'none');
            await p.emulateMedia({ reducedMotion: 'no-preference' });
        });
        await step('Midnight is the default; all four themes recolor the same cards without changing layout', async () => {
            assert.equal(await p.evaluate(() => CruiseStudio.colorTheme.getColorTheme()), 'dark');
            const colors = [], layouts = [], practiceBoards = [];
            for (const theme of ['dark', 'charcoal', 'gray', 'light']) {
                await p.evaluate(theme => CruiseStudio.colorTheme.setColorTheme(theme), theme);
                const result = await p.locator('#open-sheet-cruise').evaluate(el => ({ color: getComputedStyle(el).backgroundColor, width: el.clientWidth, height: el.clientHeight, art: el.querySelector('.home-art').getBoundingClientRect().height }));
                colors.push(result.color); layouts.push([result.width, result.height, result.art]);
                practiceBoards.push(await p.locator('[data-home-workspace="portPractice"] .practice-menu-icon').evaluate(el => getComputedStyle(el).filter));
            }
            assert.equal(new Set(colors).size, 4);
            assert.equal(new Set(practiceBoards).size, 4);
            assert(layouts.every(layout => JSON.stringify(layout) === JSON.stringify(layouts[0])));
            assert(layouts[0][2] > 100);
            assert.equal(await p.locator('.pc-home-grid img.home-port-icon').count(), 6);
            assert.deepEqual(await p.locator('[data-home-workspace="portPractice"] strong, [data-home-workspace="portGear"] strong').allTextContents(), ['練習メニュー', '機材リスト']);
            await p.evaluate(() => CruiseStudio.colorTheme.setColorTheme('dark'));
        });
        await step('Charcoal, gray and light keep card boundaries and tool labels legible', async () => {
            await p.emulateMedia({ reducedMotion: 'reduce' });
            for (const theme of ['charcoal', 'gray', 'light']) {
                await p.evaluate(theme => CruiseStudio.colorTheme.setColorTheme(theme), theme);
                const contrast = await p.evaluate(() => {
                    const rgb = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
                    const luminance = color => { const [r, g, b] = rgb(color); return .2126 * r + .7152 * g + .0722 * b; };
                    const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((a, b) => b - a); return (x + .05) / (y + .05); };
                    const main = getComputedStyle(document.querySelector('#studio-main'));
                    const card = getComputedStyle(document.querySelector('#open-sheet-cruise'));
                    const tool = document.querySelector('[data-home-workspace="tuner"]');
                    return { boundary: ratio(card.borderTopColor, main.backgroundColor), label: ratio(getComputedStyle(tool.querySelector('strong')).color, getComputedStyle(tool).backgroundColor) };
                });
                assert(contrast.boundary >= 3, `${theme} card boundary: ${contrast.boundary}`);
                assert(contrast.label >= 4.5, `${theme} tool label: ${contrast.label}`);
            }
            await p.evaluate(() => CruiseStudio.colorTheme.setColorTheme('dark'));
            await p.emulateMedia({ reducedMotion: 'no-preference' });
        });
        await step('Every workspace has local Back and Home; Back returns to the previous workspace', async () => {
            for (const id of ['sheetCruise', 'preDtm', 'series', 'news', 'portNews', 'portPractice', 'tuner', 'portGear', 'portMyApps']) {
                await nav(id);
                const screen = p.locator('.screen:not([hidden])');
                assert.equal(await screen.locator('.workspace-back').count(), 1);
                assert.equal(await screen.locator('.workspace-home').count(), 1);
                await screen.locator('.workspace-home').click();
                assert.equal(await p.evaluate(() => CruiseStudio.shellHost.getActiveWorkspace()), 'home');
            }
            await p.locator('#open-sheet-cruise').click();
            await nav('preDtm');
            await p.locator('#screen-pre-dtm .workspace-back').click();
            assert.equal(await p.evaluate(() => CruiseStudio.shellHost.getActiveWorkspace()), 'sheetCruise');
            await p.locator('#screen-sheet-cruise .workspace-back').click();
            assert.equal(await p.evaluate(() => CruiseStudio.shellHost.getActiveWorkspace()), 'home');
        });
        await step('Home Port Metronome, settings and explicit Port-status entry use existing shell controls', async () => {
            await p.locator('[data-home-workspace="metronome"]').click(); assert.equal(await p.locator('#screen-metronome').isVisible(), true);
            await p.locator('[data-workspace="home"]').click();
            await p.locator('.home-options summary').click();
            await p.locator('[data-home-action="settings"]').click(); assert.equal(await p.evaluate(() => document.activeElement.name), 'studio-theme');
            await p.locator('[data-home-action="port"]').click(); assert.equal(await p.evaluate(() => document.activeElement.id), 'studio-port-read');
            await p.locator('#shell-pane-close').click(); await p.locator('#shell-dock-toggle').click();
        });
        await step('NEWS loading, official source normalization, list and external detail', async () => {
            mode = 'hold'; await nav('news'); await p.waitForFunction(() => document.querySelector('#screen-news').dataset.status === 'loading');
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
                    await nav('news'); await ready();
                    const geometry = await p.locator('.pc-news-card').first().evaluate(e => ({ x: e.getBoundingClientRect().x, right: e.getBoundingClientRect().right, width: window.innerWidth })); assert(geometry.x >= 0 && geometry.right <= geometry.width + 1);
                    await p.locator('[data-news-id="pc-news-test"]').focus(); await p.keyboard.press('Tab'); assert.equal(await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'), true);
                    if (artifacts && width === 390) { const path = `${artifacts}/news-${theme}-${width}.png`; await p.screenshot({ path }); report.screenshots.push(path); }
                }
            }
        });
        await step('Touch press reveals a tool explanation and Home fits the viewport', async () => {
            const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
            try {
                await touch.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
                const page = await touch.newPage(); await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => !!CruiseStudio.homeView);
                const button = page.locator('[data-home-workspace="tuner"]'); await button.scrollIntoViewIfNeeded();
                const box = await button.boundingBox(), cdp = await touch.newCDPSession(page);
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
                const result = await page.evaluate(() => {
                    const main = document.querySelector('#studio-main');
                    const tip = document.querySelector('[data-home-workspace="tuner"] .home-tool-tip');
                    return { coarse: matchMedia('(pointer: coarse)').matches, tip: getComputedStyle(tip).visibility, width: main.clientWidth, scrollWidth: main.scrollWidth };
                });
                assert.equal(result.coarse, true); assert.equal(result.tip, 'visible'); assert(result.scrollWidth <= result.width + 1, JSON.stringify(result));
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
            } finally { await touch.close(); }
        });
        await step('Print hides NEWS; no Port/Account/IDB/network mutations, no console or 404', async () => {
            await p.emulateMedia({ media: 'print' }); assert.equal(await p.locator('#screen-news').evaluate(e => getComputedStyle(e).display), 'none'); await p.emulateMedia({ media: 'screen' });
            const qa = await p.evaluate(() => __pcUI); assert.deepEqual(qa.writes.filter(x => /^(cruisePort\.|soundCruise|sound-cruise)/i.test(x.key)), []); assert.deepEqual(qa.idb, []);
            assert(qa.requests.every(x => x.startsWith('/__cruise_preview/news?'))); assert.deepEqual(external, []); assert.deepEqual(missing, []); assert.deepEqual(consoleErrors, []);
        });
    } finally { if (artifacts) fs.writeFileSync(`${artifacts}/pc-home-news-report.json`, JSON.stringify({ ...report, consoleErrors, missing, external, requestCount }, null, 2)); await context.close(); await browser.close(); }
});
