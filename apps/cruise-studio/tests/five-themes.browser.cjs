/* Port display projection must never write Port theme settings. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

test('five Studio themes project into every Port surface without changing Port settings', async () => {
    const url = process.env.STUDIO_URL;
    assert(url && ['localhost', '127.0.0.1'].includes(new URL(url).hostname));
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.origin !== new URL(url).origin) return route.abort();
        if (u.pathname === '/__cruise_preview/news') return route.fulfill({ contentType: 'application/json', body: '{"contractVersion":1,"items":[],"nextOffset":null}' });
        return route.continue();
    });
    try {
        const page = await context.newPage();
        await page.goto(url);
        assert.deepEqual(await page.locator('#shell-theme input').evaluateAll(inputs => inputs.map(input => input.value)), ['dark', 'midnight', 'charcoal', 'gray', 'light']);
        await page.locator('#shell-theme input[value="midnight"]').check();
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'midnight');
        await page.evaluate(() => localStorage.setItem('cruisePort.settings', JSON.stringify({ version: 3, theme: 'light' })));
        const saved = await page.evaluate(() => localStorage.getItem('cruisePort.settings'));
        for (const theme of ['dark', 'midnight', 'charcoal', 'gray', 'light']) {
            await page.evaluate(id => CruiseStudio.colorTheme.setColorTheme(id), theme);
            await page.evaluate(() => CruiseStudio.shellHost.navigate('home'));
            if (process.env.STUDIO_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.STUDIO_SCREENSHOTS, theme + '.png') });
            for (const [workspace, screen] of [['sheetCruise', '#screen-sheet-cruise'], ['preDtm', '#screen-pre-dtm']]) {
                await page.evaluate(id => CruiseStudio.shellHost.navigate(id), workspace);
                assert.equal(await page.locator(screen).isVisible(), true);
                if (workspace === 'preDtm') {
                    const contrast = await page.locator('.pd-part-midi').first().evaluate(el => {
                        const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
                        const luminance = values => values.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
                        const fg = luminance(rgb(getComputedStyle(el).color));
                        const card = getComputedStyle(el.closest('.pd-part-card'));
                        const bg = luminance(rgb(card.backgroundImage.match(/rgb\([^)]*\)/)?.[0] || card.backgroundColor));
                        return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
                    });
                    assert(contrast >= 4.5, `${theme} Pre-DTM MIDI label contrast ${contrast}`);
                }
                if (process.env.STUDIO_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.STUDIO_SCREENSHOTS, theme + '-' + workspace + '.png') });
            }
            for (const [workspace, selector] of [['tuner','#screen-tuner'],['metronome','#screen-metronome'],['portPractice','#screen-port-practice'],['portGear','#screen-port-gear'],['portMyApps','#screen-port-my-apps'],['portNews','#screen-port-news']]) {
                await page.evaluate(id => CruiseStudio.shellHost.navigate(id), workspace);
                await page.locator(selector + ' iframe').waitFor();
                await page.waitForFunction(({ selector, theme }) => {
                    const root = document.querySelector(selector + ' iframe')?.contentDocument?.documentElement;
                    return root?.dataset.studioTheme === theme && root.dataset.theme === (theme === 'midnight' ? 'dark' : theme);
                }, { selector, theme });
                if (process.env.STUDIO_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.STUDIO_SCREENSHOTS, theme + '-' + workspace + '.png') });
            }
            const expectedBackground = { dark: '#080806', midnight: '#10151c', charcoal: '#424346', gray: '#c8cbd0', light: '#f7f6f2' };
            assert.equal(await page.locator('#screen-port-news iframe').evaluate(frame => getComputedStyle(frame.contentDocument.documentElement).getPropertyValue('--port-bg').trim()), expectedBackground[theme]);
            if (process.env.STUDIO_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.STUDIO_SCREENSHOTS, theme + '-port-news.png') });
            const next = theme === 'light' ? 'dark' : 'light';
            await page.evaluate(id => CruiseStudio.colorTheme.setColorTheme(id), next);
            await page.waitForFunction(id => document.querySelector('#screen-port-news iframe')?.contentDocument?.documentElement?.dataset.studioTheme === id, next);
            assert.equal(await page.evaluate(() => localStorage.getItem('cruisePort.settings')), saved);
        }
        await page.evaluate(() => CruiseStudio.shellHost.navigate('home'));
        const port = await context.newPage();
        await port.goto(new URL('../cruise-port/', url).href);
        assert.equal(await port.locator('html').getAttribute('data-theme'), 'light');
        assert.equal(await page.evaluate(() => localStorage.getItem('cruisePort.settings')), saved);
    } finally { await browser.close(); }
});
