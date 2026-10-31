/* Disposable loopback browser: Studio hosts the real Port tuner document. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

function fakeAudio() {
    if (process.env.TUNER_FAKE_AUDIO) return { file: process.env.TUNER_FAKE_AUDIO, cleanup() {} };
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-port-tuner-'));
    const file = path.join(folder, 'a4.wav'), rate = 48000, count = rate * 2, wav = Buffer.alloc(44 + count * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
    for (let i = 0; i < count; i++) wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 443 * i / rate) * 24000), 44 + i * 2);
    fs.writeFileSync(file, wav);
    return { file, cleanup() { fs.rmSync(folder, { recursive: true, force: true }); } };
}

test('Studio/Port tuner UI, save and audio lifetime', async t => {
    const url = process.env.STUDIO_URL;
    assert(url, 'STUDIO_URL is required');
    const origin = new URL(url).origin, audio = fakeAudio(), errors = [], missing = [], foreign = [];
    const browser = await chromium.launch({ headless: true,
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=' + audio.file] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'], serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const request = route.request(), target = new URL(request.url());
        if (target.origin === origin && target.pathname === '/__cruise_preview/news')
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contractVersion: 1, items: [], nextOffset: null }) });
        if (target.origin === origin && request.method() === 'GET') return route.continue();
        if (target.hostname === 'fonts.googleapis.com') return route.fulfill({ body: '', contentType: 'text/css' });
        foreign.push(request.method() + ' ' + request.url()); return route.abort();
    });
    await context.addInitScript(() => {
        window.__tunerStreams = [];
        const native = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
        if (native) navigator.mediaDevices.getUserMedia = async (...args) => {
            const stream = await native(...args); window.__tunerStreams.push(stream); return stream;
        };
    });
    const page = await context.newPage(), frame = page.frameLocator('#port-tuner-surface iframe');
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() === 404) missing.push(response.url()); });
    const open = async () => {
        await page.click('[data-workspace="tuner"]');
        await page.waitForFunction(() => CruiseStudio.tuner.getState().phase === 'running');
        await page.waitForFunction(() => {
            const child = document.querySelector('#port-tuner-surface iframe')?.contentWindow;
            return child?.__tunerStreams?.length > 0 && child.document.querySelector('#tuner-status')?.textContent === 'マイク入力中';
        });
    };
    const remember = () => page.evaluate(() => { window.__lastPortStream = document.querySelector('#port-tuner-surface iframe').contentWindow.__tunerStreams.at(-1); });
    const ended = () => page.evaluate(() => __lastPortStream.getTracks().every(track => track.readyState === 'ended'));
    try {
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => !!CruiseStudio.tunerRuntime && !!CruiseStudio.portDataHost);
        await t.test('cold Studio is read-only and has no Port frame', async () => {
            assert.equal(await page.evaluate(() => CruiseStudio.portDataHost.canWrite), false);
            assert.equal(await page.locator('#port-tuner-surface iframe').count(), 0);
        });
        await t.test('Port UI opens with capture, complete controls and Standard Pro lock', async () => {
            await open();
            assert.equal(await frame.locator('#tuner-tuning option').count(), 11);
            for (const selector of ['#tuner-note-value', '#tuner-frequency', '#tuner-meter', '#tuner-cents', '#tuner-input-settings-toggle', '#tuner-input-level', '#tuner-meter-visibility', '[data-tuner-string]'])
                assert(await frame.locator(selector).count() > 0, selector);
            assert.equal(await frame.locator('#tuner-capo-lock').isVisible(), true);
            assert.equal(await frame.locator('#tuner-capo-up').isVisible(), false);
            await page.waitForFunction(() => document.querySelector('#port-tuner-surface iframe').contentDocument.querySelector('#tuner-note-value').textContent !== '—');
            assert.equal(await frame.locator('#tuner-note-value').textContent(), 'A4');
        });
        await t.test('Port writes its existing v3 key and loads it after a Studio round trip', async () => {
            await frame.locator('#tuner-tuning').selectOption('drop-d');
            await frame.locator('#tuner-input-settings-toggle').click();
            await frame.locator('#tuner-threshold').evaluate(element => {
                element.value = '-65'; element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            });
            await page.waitForFunction(() => JSON.parse(localStorage.getItem('cruisePort.tuner') || 'null')?.thresholdDb === -65);
            assert.deepEqual(await page.evaluate(() => {
                const value = JSON.parse(localStorage.getItem('cruisePort.tuner'));
                return [value.version, value.tuningId, value.thresholdDb, value.capo];
            }), [3, 'drop-d', -65, 0]);
            await remember(); await page.click('[data-workspace="home"]'); assert.equal(await ended(), true);
            await open(); assert.equal(await frame.locator('#tuner-tuning').inputValue(), 'drop-d');
            await frame.locator('#tuner-input-settings-toggle').click();
            assert.equal(await frame.locator('#tuner-threshold').inputValue(), '-65');
        });
        await t.test('Port page-local Home and return retain Port routing and release the old track', async () => {
            await remember();
            await frame.locator('#tuner-view [data-action="home"]').click();
            assert.equal(await ended(), true);
            assert(await frame.locator('#tuner-card').isVisible());
            await frame.locator('#tuner-card').click();
            await page.waitForFunction(() => document.querySelector('#port-tuner-surface iframe')?.contentDocument.querySelector('#tuner-status')?.textContent === 'マイク入力中');
        });
        await t.test('Global Stop, hidden tab and pagehide unload the Port microphone', async () => {
            await remember(); await page.click('#shell-audio-stop'); assert.equal(await ended(), true);
            assert.equal(await page.locator('#port-tuner-surface iframe').count(), 0);
            await page.click('#port-tuner-resume');
            await page.waitForFunction(() => document.querySelector('#port-tuner-surface iframe')?.contentWindow.__tunerStreams?.length > 0);
            await remember();
            await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
            assert.equal(await ended(), true);
            await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
            assert.equal(await page.locator('#port-tuner-surface iframe').count(), 0);
            await page.click('#port-tuner-resume');
            await page.waitForFunction(() => document.querySelector('#port-tuner-surface iframe')?.contentWindow.__tunerStreams?.length > 0);
            await remember(); await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
            assert.equal(await ended(), true);
        });
        await t.test('Studio score, layout, theme and read-only Host survive navigation', async () => {
            await page.click('[data-workspace="sheetCruise"]');
            await page.locator('#sc-editor-drawer > summary').click();
            await page.fill('#sc-title', 'Tuner draft');
            for (const width of [390, 768, 1440, 1920]) {
                await page.setViewportSize({ width, height: 900 }); await open(); await remember();
                assert.equal(await page.evaluate(() => document.querySelector('#studio-main').scrollWidth <= document.querySelector('#studio-main').clientWidth), true, String(width));
                await page.click('[data-workspace="sheetCruise"]'); assert.equal(await ended(), true);
                assert.equal(await page.inputValue('#sc-title'), 'Tuner draft');
            }
            for (const theme of ['dark', 'charcoal', 'gray', 'light']) {
                await page.evaluate(id => CruiseStudio.colorTheme.setColorTheme(id), theme);
                assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
            }
            assert.equal(await page.evaluate(() => CruiseStudio.portDataHost.canWrite), false);
            assert.match(await page.locator('.port-tuner-actions a').last().getAttribute('href'), /cruise-port\/pro_9a3943176561\/$/);
            assert.deepEqual(errors, []); assert.deepEqual(missing, []); assert.deepEqual(foreign, []);
        });
        await t.test('first capture denial keeps the Port retry control and a later retry works', async () => {
            const denied = await browser.newContext({ permissions: ['microphone'], serviceWorkers: 'block' });
            await denied.route('**/*', route => {
                const target = new URL(route.request().url());
                if (target.origin === origin && target.pathname === '/__cruise_preview/news')
                    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contractVersion: 1, items: [], nextOffset: null }) });
                if (target.origin === origin) return route.continue();
                if (target.hostname === 'fonts.googleapis.com') return route.fulfill({ body: '', contentType: 'text/css' });
                return route.abort();
            });
            await denied.addInitScript(() => {
                if (!location.pathname.startsWith('/apps/cruise-port/')) return;
                window.__nativeCapture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
                navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('fixture', 'NotAllowedError'));
            });
            const retryPage = await denied.newPage();
            try {
                await retryPage.goto(url); await retryPage.click('[data-workspace="tuner"]');
                const retryFrame = retryPage.frameLocator('#port-tuner-surface iframe');
                await retryFrame.locator('#tuner-error').waitFor({ state: 'visible' });
                assert.match(await retryFrame.locator('#tuner-error').textContent(), /許可/);
                assert.equal(await retryFrame.locator('#tuner-toggle').isVisible(), true);
                await retryFrame.locator('#tuner-toggle').evaluate(() => {
                    navigator.mediaDevices.getUserMedia = window.__nativeCapture;
                });
                await retryFrame.locator('#tuner-toggle').click();
                await retryFrame.locator('#tuner-status').getByText('マイク入力中').waitFor();
            } finally { await denied.close(); }
        });
        await t.test('two Studio tabs retain separate microphone lifetimes on one origin', async () => {
            await open(); await remember();
            const second = await context.newPage();
            try {
                await second.goto(url);
                await second.click('[data-workspace="tuner"]');
                await second.waitForFunction(() => document.querySelector('#port-tuner-surface iframe')?.contentDocument.querySelector('#tuner-status')?.textContent === 'マイク入力中');
                assert.equal(await ended(), false);
                await second.click('[data-workspace="home"]');
                assert.equal(await ended(), false);
            } finally { await second.close(); }
            await page.click('[data-workspace="home"]');
            assert.equal(await ended(), true);
        });
    } finally { await context.close(); await browser.close(); audio.cleanup(); }
});
