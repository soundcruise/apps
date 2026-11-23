// Mobile browser integration, not a substitute for a physical iPhone test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {chromium, webkit} = require('playwright');
const origin = 'http://127.0.0.1:18874';
const fixture = path.join(__dirname, 'fixtures/viewer-pdf/mixed.pdf');

for (const engine of ['chrome', 'webkit']) test('portrait PDF through touch menus: ' + engine, async () => {
    const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({
        headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    }));
    const context = await browser.newContext({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});
    const page = await context.newPage(), errors = [], external = [];
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
        if (new URL(route.request().url()).origin === origin) return route.continue();
        external.push(route.request().url()); return route.abort();
    });
    const read = () => page.evaluate(() => CruiseViewer.view.read());
    async function menu() { await page.locator('.sv-main-menu:visible > summary').tap(); }
    try {
        await page.goto(origin + '/apps/score-viewer/local/');
        await page.waitForFunction(() => !!window.CruiseViewer);
        await menu();
        const [chooser] = await Promise.all([
            page.waitForEvent('filechooser'), page.locator('[data-viewer-action=open]').tap()
        ]);
        await chooser.setFiles(fixture);
        await page.locator('[data-pdf-page="1"][data-pdf-ready=true]').waitFor();
        const sourceHash = createHash('sha256').update(await fs.readFile(fixture)).digest('hex');
        assert.equal((await read()).byteHash, sourceHash);
        assert.equal((await read()).pages, 3);
        await page.getByRole('button', {name: '今は追加しない', exact: true}).tap();
        assert(await page.evaluate(() => CruiseViewer.view.hasUnsaved()));
        await menu();
        await page.getByRole('button', {name: 'ライブラリに追加', exact: true}).tap();
        await page.locator('[data-export-name]').fill('PDF収録見本');
        await page.getByRole('button', {name: '新しいフォルダ', exact: true}).tap();
        await page.getByRole('textbox', {name: '新しいフォルダ名', exact: true}).fill('確認用');
        await page.locator('[data-export-choice=folder-create]').tap();
        await page.waitForFunction(() => document.querySelector('[data-export-folder]').selectedOptions[0]?.textContent === '確認用');
        await page.getByRole('button', {name: '追加する', exact: true}).tap();
        await page.waitForFunction(() => !CruiseViewer.view.hasUnsaved());
        await menu();
        const zoom = page.locator('.sv-main-menu:visible .sv-zoom button');
        await zoom.last().tap();
        assert.equal((await read()).zoom, 1.1);
        // A completed menu action closes the menu, including zoom.
        await menu();
        await page.locator('[data-pdf-action=settings]').tap();
        const settings = page.getByRole('dialog', {name: 'PDFの送り設定'});
        await settings.locator('[data-pdf-speed]').fill('100');
        await settings.locator('[data-pdf-setting-play]').tap();
        await page.waitForFunction(() => CruiseViewer.view.playback().phase === 'playing');
        const before = (await page.evaluate(() => CruiseViewer.view.playback())).position;
        await page.waitForFunction(at => CruiseViewer.view.playback().position > at + .02, before);
        await settings.locator('[data-auto-scroll]').uncheck();
        const top = await page.locator('.sv-pdf-viewport').evaluate(e => e.scrollTop);
        const at = (await page.evaluate(() => CruiseViewer.view.playback())).position;
        await page.waitForFunction(at => CruiseViewer.view.playback().position > at + .02, at);
        assert(Math.abs(await page.locator('.sv-pdf-viewport').evaluate(e => e.scrollTop) - top) < 2);
        await settings.locator('[data-pdf-setting-play]').tap();
        assert.equal((await page.evaluate(() => CruiseViewer.view.playback())).phase, 'paused');
        await settings.getByRole('button', {name: '完了', exact: true}).tap();
        await page.reload();
        await page.locator('[data-pdf-page="1"][data-pdf-ready=true]').waitFor();
        assert.equal((await read()).byteHash, sourceHash);
        assert.equal((await read()).zoom, 1.1);
        assert.equal((await page.evaluate(() => CruiseViewer.view.playback())).phase, 'paused');
        await menu();
        const [download] = await Promise.all([
            page.waitForEvent('download'), page.locator('[data-pdf-export]:visible').tap()
        ]);
        assert.deepEqual(await fs.readFile(await download.path()), await fs.readFile(fixture));
        const bars = await page.locator('.sv-toolbar:visible,.sv-transport:visible').evaluateAll(es =>
            es.map(e => ({width: e.clientWidth, scroll: e.scrollWidth, height: e.getBoundingClientRect().height})));
        assert(bars.every(e => e.scroll <= e.width + 2 && e.height <= 68), JSON.stringify(bars));
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
    } finally { await context.close(); await browser.close(); }
});
