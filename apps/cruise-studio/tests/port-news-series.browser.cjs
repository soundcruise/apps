/* Disposable browser acceptance for the owner NEWS view and official app routes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('Studio reuses Port NEWS and launches each official Standard/Pro app route', async () => {
    const url = process.env.STUDIO_URL;
    assert(url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
    const origin = new URL(url).origin;
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const publishedAt = new Date(Date.now() - 3600000).toISOString();
    const item = { id: 'studio-news-fixture', label: '合成ギターニュース', sourceName: 'Fixture Music', sourceUrl: 'https://example.invalid/article', publishedAt, category: 'acoustic_guitar', publishable: true };
    const requests = [];
    let feedMode = 'ready';
    await context.route('**/__cruise_preview/news**', route => {
        requests.push(route.request().method());
        const body = feedMode === 'disabled' ? { disabled: true } : { contractVersion: feedMode === 'bad' ? 99 : 1, items: [item], nextOffset: null };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    await context.route('https://example.invalid/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Fixture article</title>' }));
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const news = () => page.frameLocator('#port-news-surface iframe');
    const active = () => page.evaluate(() => CruiseStudio.shellHost.getActiveWorkspace());
    try {
        const port = await context.newPage();
        await port.goto(new URL('../cruise-port/#news', url).href, { waitUntil: 'domcontentloaded' });
        await port.locator('#news-view:not([hidden]) .news-card').first().waitFor();
        const owner = await port.locator('#news-content').evaluate(node => ({
            labels: [...node.querySelectorAll('.news-label')].map(el => el.textContent),
            filters: [...node.querySelectorAll('#news-category option')].map(el => [el.value, el.textContent]),
            links: [...node.querySelectorAll('.news-card')].map(el => el.getAttribute('href'))
        }));
        await port.close();

        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.locator('[data-home-workspace="portNews"]').click();
        await news().locator('#news-view:not([hidden]) .news-card').first().waitFor();
        const embedded = await news().locator('#news-content').evaluate(node => ({
            labels: [...node.querySelectorAll('.news-label')].map(el => el.textContent),
            filters: [...node.querySelectorAll('#news-category option')].map(el => [el.value, el.textContent]),
            links: [...node.querySelectorAll('.news-card')].map(el => el.getAttribute('href'))
        }));
        assert.deepEqual(embedded, owner);
        assert(embedded.labels.includes('合成ギターニュース'));
        await news().locator('#news-category').selectOption('acoustic_guitar');
        assert.deepEqual(await news().locator('.news-label').allTextContents(), ['合成ギターニュース']);
        const external = news().locator('.news-card[href="https://example.invalid/article"]');
        assert.equal(await external.getAttribute('target'), '_blank');
        assert.match(await external.getAttribute('rel'), /noopener/);
        const popupPromise = page.waitForEvent('popup');
        await external.click();
        const popup = await popupPromise;
        await popup.waitForURL('https://example.invalid/article');
        await popup.close();
        await news().locator('#news-category').selectOption('');
        await news().locator('.news-card[href="#news/cruise-apps/theme-colors"]').click();
        await news().locator('#news-article-view:not([hidden]) #news-article-title').waitFor();
        assert.match(await news().locator('#news-article-title').textContent(), /4つのカラーテーマ/);
        assert.match(await news().locator('#news-article-content').textContent(), /使い方/);
        await news().locator('#news-article-view > .view-panel > .view-back').click();
        await news().locator('#news-view:not([hidden]) .news-card').first().waitFor();
        await page.locator('.studio-nav [data-workspace="home"]').click();
        assert.equal(await active(), 'home');
        assert.equal(await page.locator('#port-news-surface iframe').count(), 0);

        feedMode = 'disabled';
        await page.locator('.studio-nav [data-workspace="portNews"]').click();
        await news().locator('#news-content').getByText('ニュースは現在公開を停止しています。').waitFor();
        assert.equal(await news().locator('.news-label').count(), 0);
        await page.locator('.studio-nav [data-workspace="home"]').click();
        feedMode = 'bad';
        await page.locator('.studio-nav [data-workspace="portNews"]').click();
        await news().locator('#news-content').getByText('外部ニュースを読み込めませんでした。時間をおいてページを更新してください。').waitFor();
        assert.equal(await news().locator('.news-label').count(), 1);
        assert.equal(await news().locator('.news-label').textContent(), 'クルーズapps、4つのカラーテーマに対応');
        await page.locator('.studio-nav [data-workspace="home"]').click();
        feedMode = 'ready';

        await page.locator('.studio-nav [data-workspace="portNews"]').click();
        await news().locator('#news-view:not([hidden])').waitFor();
        await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }));
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        assert.equal(await page.locator('#port-news-surface iframe').count(), 0);
        await page.locator('#port-news-resume').click();
        await news().locator('#news-view:not([hidden])').waitFor();
        await page.locator('.studio-nav [data-workspace="series"]').click();
        assert.equal(await active(), 'series');
        assert.equal(await page.locator('#port-news-surface iframe').count(), 0);

        const expected = {
            pitch: ['pitch-cruise/standard/', 'pitch-cruise/pro_x9v7q2m8/'],
            fretboard: ['fretboard_cruise/standard/', 'fretboard_cruise/pro_a9f4k7q2m8z/'],
            rhythm: ['rhythm-cruise/standard/', 'rhythm-cruise/pro_r4m8k7n2q9x/'],
            chord: ['chord-cruise/standard/', 'chord-cruise/pro_k7m4q9v2x8/']
        };
        for (const [id, [standard, pro]] of Object.entries(expected)) {
            const links = page.locator(`#screen-series [data-studio-cruise-app="${id}"]`);
            assert.equal(await links.count(), 2);
            for (const [edition, path] of [['standard', standard], ['pro', pro]]) {
                const target = page.locator(`#screen-series [data-studio-cruise-app="${id}"][data-studio-edition="${edition}"]`);
                assert.equal(new URL(await target.getAttribute('href'), origin).pathname, `/apps/${path}`);
                assert.equal(await target.getAttribute('target'), '_blank');
                assert.match(await target.getAttribute('rel'), /noopener/);
                if (edition === 'pro') assert.equal(await target.locator('img').evaluate(el => el.complete && el.naturalWidth > 0), true);
                const open = page.waitForEvent('popup');
                await target.click();
                const app = await open;
                await app.waitForURL(`**/apps/${path}`);
                assert.equal(new URL(app.url()).pathname, `/apps/${path}`);
                await app.close();
            }
            const home = page.locator(`#screen-home [data-studio-cruise-app="${id}"]`);
            assert.equal(new URL(await home.getAttribute('href'), origin).pathname, `/apps/${standard}`);
        }
        for (const theme of ['dark', 'charcoal', 'gray', 'light']) {
            await page.evaluate(theme => CruiseStudio.colorTheme.setColorTheme(theme), theme);
            assert.equal(await page.locator('#screen-series').isVisible(), true);
            assert.equal(await page.locator('#screen-series .series-pro-link').count(), 4);
        }
        for (const width of [1440, 390]) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
        assert(requests.length >= 2 && requests.every(method => method === 'GET'));
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
});
