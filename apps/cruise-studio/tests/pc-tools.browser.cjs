/* Disposable loopback browser. The full tuner is Port-owned; the score Dock remains Studio-owned. */
const test = require('node:test'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

test('Port tuner and Studio Dock have exclusive audio ownership', async t => {
    const url = process.env.STUDIO_URL, origin = new URL(url).origin;
    const browser = await chromium.launch({ headless: true,
        executablePath: process.env.CHROME_PATH,
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'], serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const target = new URL(route.request().url());
        if (target.origin === origin && target.pathname === '/__cruise_preview/news')
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contractVersion: 1, items: [], nextOffset: null }) });
        if (target.origin === origin && route.request().method() === 'GET') return route.continue();
        if (target.hostname === 'fonts.googleapis.com') return route.fulfill({ body: '', contentType: 'text/css' });
        return route.abort();
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.goto(url);
        await page.waitForFunction(() => !!CruiseStudio.metronomeM1 && !!CruiseStudio.tuner);
        await t.test('running Studio Dock keeps its playback when tuner entry is attempted', async () => {
            await page.click('#shell-dock-toggle');
            await page.click('#studio-metronome-toggle');
            await page.waitForFunction(() => CruiseStudio.metronomeM1.snapshot().running);
            await page.click('[data-workspace="tuner"]');
            await page.waitForFunction(() => CruiseStudio.tuner.getState().phase === 'failed');
            assert.equal(await page.locator('#port-tuner-surface iframe').count(), 0);
            assert.equal(await page.evaluate(() => CruiseStudio.metronomeM1.snapshot().running), true);
            assert.match(await page.locator('#port-tuner-status').textContent(), /音声を停止/);
        });
        await t.test('Global Stop then explicit retry opens Port and begins capture', async () => {
            await page.click('#shell-audio-stop');
            await page.waitForFunction(() => !CruiseStudio.metronomeM1.snapshot().running);
            await page.click('#port-tuner-resume');
            await page.waitForFunction(() => document.querySelector('#port-tuner-surface iframe')?.contentDocument.querySelector('#tuner-status')?.textContent === 'マイク入力中');
            assert.equal(await page.frameLocator('#port-tuner-surface iframe').locator('#tuner-tuning option').count(), 11);
            assert.equal(await page.evaluate(() => CruiseStudio.portDataHost.canWrite), false);
            await page.click('[data-workspace="home"]');
            assert.equal(await page.locator('#port-tuner-surface iframe').count(), 0);
        });
        assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); }
});
