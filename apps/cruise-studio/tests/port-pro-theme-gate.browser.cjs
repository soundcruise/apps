/* Isolated loopback profile: real locked Pro document and display-only theme. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('locked Port Pro frame follows five Studio themes without changing Port settings', async () => {
    const url = process.env.STUDIO_URL;
    assert(url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.origin !== new URL(url).origin) return route.abort();
        if (u.pathname === '/__cruise_preview/news') return route.fulfill({ contentType: 'application/json', body: '{"contractVersion":1,"items":[],"nextOffset":null}' });
        return route.continue();
    });
    try {
        const page = await context.newPage();
        await page.goto(url);
        await page.evaluate(() => localStorage.setItem('cruisePort.settings', JSON.stringify({ version: 3, theme: 'light' })));
        const saved = await page.evaluate(() => localStorage.getItem('cruisePort.settings'));
        await page.evaluate(() => { const f = document.createElement('iframe'); f.id = 'synthetic-pro-frame'; f.src = '../cruise-port/pro_9a3943176561/'; document.body.append(f); });
        const frame = page.frameLocator('#synthetic-pro-frame');
        await frame.locator('#pro-gate-overlay').waitFor({ state: 'visible' });
        for (const theme of ['dark', 'midnight', 'charcoal', 'gray', 'light']) {
            await page.evaluate(id => CruiseStudio.colorTheme.setColorTheme(id), theme);
            await page.waitForFunction(id => document.querySelector('#synthetic-pro-frame')?.contentDocument?.documentElement?.dataset.studioTheme === id, theme);
            assert.equal(await frame.locator('body').evaluate(body => body.classList.contains('pro-gate-active')), true);
            assert.equal(await frame.locator('html').getAttribute('data-edition'), null);
            assert.equal(await page.evaluate(() => localStorage.getItem('cruisePort.settings')), saved);
        }
        await page.locator('#synthetic-pro-frame').evaluate(frame => frame.remove());
        await page.evaluate(() => { const f = document.createElement('iframe'); f.id = 'synthetic-pro-frame'; f.src = '../cruise-port/pro_9a3943176561/'; document.body.append(f); });
        await frame.locator('#pro-gate-overlay').waitFor({ state: 'visible' });
        await page.waitForFunction(() => document.querySelector('#synthetic-pro-frame')?.contentDocument?.documentElement?.dataset.studioTheme === 'light');
        assert.equal(await frame.locator('body').evaluate(body => body.classList.contains('pro-gate-active')), true);
        await page.locator('#synthetic-pro-frame').evaluate(frame => frame.remove());
        await page.evaluate(() => { const f = document.createElement('iframe'); f.id = 'unrelated-frame'; f.srcdoc = '<!doctype html><title>Unrelated fixture</title>'; document.body.append(f); });
        await page.frameLocator('#unrelated-frame').locator('title').waitFor({ state: 'attached' });
        assert.equal(await page.locator('#unrelated-frame').evaluate(f => f.contentDocument.documentElement.hasAttribute('data-studio-theme')), false);
        assert.equal(await page.locator('#unrelated-frame').evaluate(f => !!f.contentDocument.getElementById('studio-port-theme')), false);
        const standalone = await context.newPage();
        await standalone.goto(new URL('../cruise-port/pro_9a3943176561/', url).href);
        await standalone.locator('#pro-gate-overlay').waitFor({ state: 'visible' });
        assert.equal(await standalone.locator('html').getAttribute('data-theme'), 'light');
        assert.equal(await page.evaluate(() => localStorage.getItem('cruisePort.settings')), saved);
    } finally { await browser.close(); }
});
