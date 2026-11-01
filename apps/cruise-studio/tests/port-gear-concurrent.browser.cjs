/* Two disposable tabs must not silently overwrite a stale Port gear form. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('two Studio tabs preserve the first gear save when the second form is stale', async () => {
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
        const a = await context.newPage(), b = await context.newPage();
        for (const page of [a, b]) {
            page.setDefaultTimeout(12000);
            await page.goto(url);
            await page.locator('[data-home-workspace="portGear"]').click();
            await page.waitForFunction(() => document.querySelector('#screen-port-gear').dataset.portLibraryPhase === 'ready');
            const frame = page.frameLocator('#port-gear-surface iframe');
            await frame.locator('#wishlist-view:not([hidden])').waitFor();
            await frame.locator('#gear-list-title-add').click();
            await frame.locator('#gear-name').fill(page === a ? 'Synthetic A' : 'Synthetic B');
            await frame.locator('#gear-category').selectOption('guitar');
            await frame.locator('#gear-status').selectOption('owned');
        }
        const first = a.frameLocator('#port-gear-surface iframe'), second = b.frameLocator('#port-gear-surface iframe');
        await first.locator('#gear-list-form button[type="submit"]').click();
        await first.locator('.gear-card', { hasText: 'Synthetic A' }).waitFor();
        await second.locator('#gear-list-form button[type="submit"]').click();
        await second.locator('#gear-form-error:not([hidden])').waitFor();
        assert.deepEqual(await a.evaluate(() => JSON.parse(localStorage.getItem('cruisePort.gearList')).items.map(item => item.name)), ['Synthetic A']);
        assert.equal(await second.locator('#gear-form-view').isVisible(), true);
    } finally { await browser.close(); }
});
