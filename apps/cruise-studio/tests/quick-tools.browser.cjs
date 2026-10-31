const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

test('quick tuner and Port-style BPM steps keep the score and audio ownership intact', async t => {
    const url = process.env.STUDIO_URL;
    assert(url, 'STUDIO_URL must point to an isolated loopback server');
    const origin = new URL(url).origin;
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH,
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'], serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [], foreign = [], missing = [];
    await context.route('**/*', route => {
        const request = route.request(), target = new URL(request.url());
        if (target.origin === origin && target.pathname === '/__cruise_preview/news') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contractVersion: 1, items: [], nextOffset: null }) });
        if (target.origin === origin && request.method() === 'GET') return route.continue();
        if (target.hostname === 'fonts.googleapis.com') return route.fulfill({ body: '', contentType: 'text/css' });
        foreign.push(request.method() + ' ' + request.url()); return route.abort();
    });
    await context.addInitScript(() => {
        window.__quickToolWrites = [];
        for (const name of ['setItem', 'removeItem', 'clear']) {
            const native = Storage.prototype[name];
            Storage.prototype[name] = function (key, ...args) {
                if (name === 'clear' || /^(cruisePort\.|soundCruise|sound-cruise)/i.test(key)) __quickToolWrites.push({ name, key });
                return native.call(this, key, ...args);
            };
        }
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
    const state = () => page.evaluate(() => CruiseStudio.tunerRuntime.snapshot());
    const audio = () => page.evaluate(() => CruiseStudio.audio.snapshot());
    const step = (name, fn) => t.test(name, fn);
    try {
        await page.goto(url);
        await page.waitForFunction(() => !!CruiseStudio.quickTuner && CruiseStudio.metronomeM1.snapshot().settings?.loaded);
        await page.click('[data-workspace="sheetCruise"]');
        await step('Port icons open a tuner without hiding Structure or requesting a microphone', async () => {
            assert(await page.locator('#shell-tuner-quick img').evaluate(img => img.complete && img.naturalWidth > 0));
            await page.click('#shell-tuner-quick');
            assert(await page.locator('#screen-sheet-cruise').isVisible());
            assert(await page.locator('#studio-quick-tuner').isVisible());
            assert.equal((await state()).state, 'idle');
            assert.equal(await page.locator('#shell-tuner-quick').getAttribute('aria-expanded'), 'true');
        });
        await step('one explicit Start, close and no microphone lease', async () => {
            await page.click('#studio-quick-tuner-toggle');
            await page.waitForFunction(() => CruiseStudio.tunerRuntime.snapshot().state === 'active');
            assert.equal((await state()).state, 'active');
            await page.click('#studio-quick-tuner-close');
            await page.waitForFunction(() => CruiseStudio.tunerRuntime.snapshot().state === 'idle');
            assert(await page.locator('#studio-quick-tuner').isHidden());
            assert((await audio()).every(item => item.resourceType === null && item.contextCount === 0));
        });
        await step('BPM steps use the existing memory controller and engine', async () => {
            await page.click('#shell-dock-toggle');
            await page.click('[data-studio-bpm-delta="5"]');
            await page.click('[data-studio-bpm-delta="1"]');
            assert.equal(await page.evaluate(() => CruiseStudio.metronomeM1.snapshot().bpm), 126);
            await page.click('#studio-metronome-toggle');
            await page.waitForFunction(() => CruiseStudio.metronomeM1.snapshot().running);
            assert(await page.locator('#screen-sheet-cruise').isVisible());
        });
        await step('running Metronome cannot silently start the microphone', async () => {
            await page.click('#shell-tuner-quick');
            await page.click('#studio-quick-tuner-toggle');
            assert.match(await page.locator('[data-quick-tuner-status]').textContent(), /先に使用中の音声を停止/);
            assert.equal((await state()).state, 'idle');
            assert(await page.evaluate(() => CruiseStudio.metronomeM1.snapshot().running));
            await page.click('#shell-audio-stop');
            await page.waitForFunction(() => !CruiseStudio.metronomeM1.snapshot().running);
        });
        await step('workspace departure stops capture and closes the panel', async () => {
            await page.click('#studio-quick-tuner-toggle');
            await page.waitForFunction(() => CruiseStudio.tunerRuntime.snapshot().state === 'active');
            await page.click('[data-workspace="preDtm"]');
            await page.waitForFunction(() => CruiseStudio.tunerRuntime.snapshot().state === 'idle');
            assert(await page.locator('#studio-quick-tuner').isHidden());
            assert(await page.locator('#screen-pre-dtm').isVisible());
        });
        await step('settings route and narrow four-theme layout remain reachable', async () => {
            await page.click('[data-workspace="sheetCruise"]');
            await page.setViewportSize({ width: 390, height: 844 });
            await page.click('#shell-tuner-quick');
            for (const theme of ['dark', 'light', 'charcoal', 'gray']) {
                await page.evaluate(id => CruiseStudio.colorTheme.applyColorTheme(id), theme);
                const rect = await page.locator('#studio-quick-tuner').evaluate(el => el.getBoundingClientRect().toJSON());
                assert(rect.left >= 0 && rect.right <= 390 && rect.top >= 0 && rect.bottom <= 844, theme + ': ' + JSON.stringify(rect));
            }
            await page.click('#studio-quick-tuner-full');
            await page.waitForFunction(() => CruiseStudio.shellHost.getActiveWorkspace() === 'tuner');
            assert(await page.locator('#studio-quick-tuner').isHidden());
            assert(await page.locator('#screen-tuner').isVisible());
            assert.equal((await state()).state, 'idle');
        });
        await step('dispose detaches quick UI without disposing the shared tuner runtime', async () => {
            assert.deepEqual(await page.evaluate(() => CruiseStudio.quickTuner.dispose()), { ok: true });
            await page.click('#shell-tuner-quick');
            assert(await page.locator('#studio-quick-tuner').isHidden());
            assert((await audio()).some(item => item.sessionId === 'studio.tuner.standard'));
        });
        await step('no unexpected Port write, foreign request, page error or missing asset', async () => {
            assert.deepEqual(await page.evaluate(() => __quickToolWrites), []);
            assert.deepEqual(foreign, []); assert.deepEqual(errors, []); assert.deepEqual(missing, []);
        });
    } finally { await browser.close(); }
});
