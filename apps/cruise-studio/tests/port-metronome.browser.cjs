/* Disposable browser: Studio hosts Port's real Standard metronome document. */
const test = require('node:test'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

test('Studio Port metronome: parity, saving and audio lifetime', async t => {
    const url = process.env.STUDIO_URL, origin = new URL(url).origin;
    assert(url);
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
    await context.addInitScript(() => {
        window.__portAudioContexts = [];
        const Native = window.AudioContext;
        window.AudioContext = class extends Native {
            constructor(...args) { super(...args); window.__portAudioContexts.push(this); }
        };
    });
    const page = await context.newPage(), errors = [], missing = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
    const frame = page.frameLocator('#port-metronome-surface iframe');
    const open = async () => {
        await page.click('[data-workspace="metronome"]');
        await page.waitForFunction(() => CruiseStudio.portMetronome.getState().phase === 'ready');
    };
    const remember = () => page.evaluate(() => {
        window.__lastMetronomeFrame = document.querySelector('#port-metronome-surface iframe').contentWindow;
        window.__lastMetronomeContext = __lastMetronomeFrame.__portAudioContexts.at(-1);
    });
    const stopped = () => page.evaluate(() => !__lastMetronomeContext || __lastMetronomeContext.state === 'closed');
    try {
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => !!CruiseStudio.portMetronome && !!CruiseStudio.portDataHost);
        await t.test('cold Studio is read-only; Port Standard UI exposes BPM and Pro locks', async () => {
            assert.equal(await page.evaluate(() => CruiseStudio.portDataHost.canWrite), false);
            assert.equal(await page.locator('#port-metronome-surface iframe').count(), 0);
            await open();
            for (const selector of ['#metronome-bpm', '#metronome-bpm-slider', '#metronome-toggle', '#metronome-visual-beats', '#metronome-preset-select', '#metronome-details-summary', '#metronome-meter', '#metronome-rhythm', '#metronome-beats', '#metronome-sound', '#metronome-volume'])
                assert(await frame.locator(selector).count() > 0, selector);
            assert(await frame.locator('#metronome-details-summary').evaluate(el => el.classList.contains('tool-pro-locked')));
            assert(await frame.locator('#metronome-preset-save-open').evaluate(el => el.classList.contains('tool-pro-locked')));
        });
        await t.test('BPM uses Port schema v3 and survives a Studio round trip', async () => {
            await frame.locator('#metronome-bpm').fill('143');
            await frame.locator('#metronome-bpm').press('Enter');
            await page.waitForFunction(() => JSON.parse(localStorage.getItem('cruisePort.metronome') || 'null')?.bpm === 143);
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cruisePort.metronome')).version), 3);
            await page.click('[data-workspace="home"]');
            await open();
            assert.equal(await frame.locator('#metronome-bpm').inputValue(), '143');
        });
        await t.test('an existing Port preset is readable without granting Standard advanced controls', async () => {
            await page.click('[data-workspace="home"]');
            const raw = JSON.stringify({ version: 1, items: [{ id: 'fixture-preset', name: '練習160', bpm: 160,
                meter: '3/4', rhythm: 'eighth', accents: [true, false, false], sound: 'analog', volume: 55,
                createdAt: 1, updatedAt: 1 }] });
            await page.evaluate(value => localStorage.setItem('cruisePort.metronomePresets', value), raw);
            await open();
            await frame.locator('#metronome-preset-select').selectOption('fixture-preset');
            await page.waitForFunction(() => JSON.parse(localStorage.getItem('cruisePort.metronome') || 'null')?.bpm === 160);
            assert.equal(await frame.locator('#metronome-bpm').inputValue(), '160');
            assert.equal(await frame.locator('#metronome-meter').inputValue(), '4/4');
            assert.equal(await page.evaluate(() => localStorage.getItem('cruisePort.metronomePresets')), raw);
        });
        await t.test('Port playback stops at Global Stop, navigation, hidden tab and pagehide', async () => {
            const play = async () => {
                await frame.locator('#metronome-toggle').click();
                await frame.locator('#metronome-toggle[aria-pressed="true"]').waitFor();
                await remember();
            };
            await play();
            await page.click('#shell-audio-stop');
            await page.waitForFunction(() => !document.querySelector('#port-metronome-surface iframe'));
            await page.waitForFunction(() => !window.__lastMetronomeContext || window.__lastMetronomeContext.state === 'closed');
            assert(await stopped());
            await page.click('#port-metronome-resume');
            await page.waitForFunction(() => CruiseStudio.portMetronome.getState().phase === 'ready');
            await play(); await page.click('[data-workspace="home"]');
            await page.waitForFunction(() => !window.__lastMetronomeContext || window.__lastMetronomeContext.state === 'closed');
            await open(); await play();
            await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
            await page.waitForFunction(() => !window.__lastMetronomeContext || window.__lastMetronomeContext.state === 'closed');
            await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
            assert.equal(await page.locator('#port-metronome-surface iframe').count(), 0);
            await page.click('#port-metronome-resume');
            await page.waitForFunction(() => CruiseStudio.portMetronome.getState().phase === 'ready');
            await play(); await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
            await page.waitForFunction(() => !window.__lastMetronomeContext || window.__lastMetronomeContext.state === 'closed');
        });
        await t.test('four themes and PC widths retain Studio score and navigation', async () => {
            await page.click('[data-workspace="sheetCruise"]');
            await page.locator('#sc-editor-drawer > summary').click();
            await page.fill('#sc-title', 'Metronome draft');
            for (const width of [390, 768, 1440, 1920]) {
                await page.setViewportSize({ width, height: 900 });
                await open();
                assert(await page.evaluate(() => document.querySelector('#studio-main').scrollWidth <= document.querySelector('#studio-main').clientWidth));
                await page.click('[data-workspace="sheetCruise"]');
                assert.equal(await page.inputValue('#sc-title'), 'Metronome draft');
            }
            for (const theme of ['dark', 'charcoal', 'gray', 'light']) {
                await page.evaluate(id => CruiseStudio.colorTheme.setColorTheme(id), theme);
                assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
            }
            assert.deepEqual(errors, []); assert.deepEqual(missing, []);
        });
        await t.test('Port metronome and tuner exchange audio ownership on workspace change', async () => {
            await open();
            await frame.locator('#metronome-toggle').click();
            await frame.locator('#metronome-toggle[aria-pressed="true"]').waitFor();
            await remember();
            await page.click('[data-workspace="tuner"]');
            await page.waitForFunction(() => !window.__lastMetronomeContext || window.__lastMetronomeContext.state === 'closed');
            await page.waitForFunction(() => CruiseStudio.tuner.getState().phase === 'running');
            await page.waitForFunction(() => document.querySelector('#port-tuner-surface iframe')?.contentDocument.querySelector('#tuner-status')?.textContent === 'マイク入力中');
            await page.click('[data-workspace="metronome"]');
            await page.waitForFunction(() => CruiseStudio.portMetronome.getState().phase === 'ready');
            assert.equal(await page.locator('#port-tuner-surface iframe').count(), 0);
        });
        await t.test('a running score Dock is not silently stopped by the Port entry', async () => {
            await page.click('[data-workspace="home"]');
            await page.click('#shell-dock-toggle');
            await page.click('#studio-metronome-toggle');
            await page.waitForFunction(() => CruiseStudio.metronomeM1.snapshot().running);
            await page.click('[data-workspace="metronome"]');
            await page.waitForFunction(() => CruiseStudio.portMetronome.getState().phase === 'failed');
            assert.equal(await page.locator('#port-metronome-surface iframe').count(), 0);
            assert.equal(await page.evaluate(() => CruiseStudio.metronomeM1.snapshot().running), true);
            await page.click('#shell-audio-stop');
            await page.waitForFunction(() => !CruiseStudio.metronomeM1.snapshot().running);
            await page.click('#port-metronome-resume');
            await page.waitForFunction(() => CruiseStudio.portMetronome.getState().phase === 'ready');
        });
    } finally { await context.close(); await browser.close(); }
});
