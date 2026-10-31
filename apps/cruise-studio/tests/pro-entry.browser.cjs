/* Disposable loopback profile: real Pro gates, no credentials or production transport. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('Studio official Pro app links open the existing locked gates', async () => {
    const url = process.env.STUDIO_URL;
    assert(url && ['localhost', '127.0.0.1'].includes(new URL(url).hostname));
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const blocked = [];
    await context.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.origin !== new URL(url).origin) { blocked.push({ origin: u.origin, method: route.request().method() }); return route.abort(); }
        if (u.pathname === '/__cruise_preview/news') return route.fulfill({ contentType: 'application/json', body: '{"contractVersion":1,"items":[],"nextOffset":null}' });
        return route.continue();
    });
    const expected = {
        pitch: '/apps/pitch-cruise/pro_x9v7q2m8/', fretboard: '/apps/fretboard_cruise/pro_a9f4k7q2m8z/',
        rhythm: '/apps/rhythm-cruise/pro_r4m8k7n2q9x/', chord: '/apps/chord-cruise/pro_k7m4q9v2x8/'
    };
    try {
        const page = await context.newPage();
        await page.goto(url);
        assert.equal(await page.locator('[data-studio-cruise-app][data-studio-edition="standard"]').count(), 0);
        for (const [id, pathname] of Object.entries(expected)) {
            const link = page.locator(`#screen-home [data-studio-cruise-app="${id}"]`);
            assert.equal(new URL(await link.getAttribute('href'), url).pathname, pathname);
            assert.equal(await link.locator('img').evaluate(img => img.complete && img.naturalWidth > 0), true);
            const pending = page.waitForEvent('popup');
            await link.click();
            const popup = await pending;
            await popup.locator('#pro-gate-overlay').waitFor({ state: 'visible' });
            assert.equal(new URL(popup.url()).pathname, pathname);
            assert.equal(await popup.locator('body').evaluate(el => el.classList.contains('pro-gate-active')), true);
            await popup.close();
        }
        const port = await context.newPage();
        await port.goto(new URL('../cruise-port/pro_9a3943176561/', url).href);
        await port.locator('#pro-gate-overlay').waitFor({ state: 'visible' });
        assert.equal(await port.locator('body').evaluate(el => el.classList.contains('pro-gate-active')), true);
        assert.equal(await port.locator('html').getAttribute('data-edition'), null);
        assert(blocked.every(x => x.method === 'GET'));
    } finally { await browser.close(); }
});
