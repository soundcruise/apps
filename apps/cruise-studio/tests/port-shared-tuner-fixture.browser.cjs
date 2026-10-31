/* Synthetic research fixture only. It never supplies Pro capability to product code. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('Port tuner DOM and controller can run together in a disposable shared-component fixture', async () => {
    const url = process.env.STUDIO_URL;
    assert(url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
    const origin = new URL(url).origin;
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH,
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.grantPermissions(['microphone'], { origin });
    await context.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.origin !== origin) return route.abort();
        if (u.pathname === '/__shared-tuner-fixture') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><link rel="stylesheet" href="/apps/cruise-port/style.css"></head><body><div id="fixture"></div></body></html>' });
        return route.continue();
    });
    try {
        const page = await context.newPage();
        await page.goto(origin + '/__shared-tuner-fixture');
        async function mount() { await page.evaluate(async () => {
            const response = await fetch('/apps/cruise-port/pro_9a3943176561/index.html');
            if (!response.ok) throw Error('Port Pro HTML unavailable');
            const source = new DOMParser().parseFromString(await response.text(), 'text/html');
            const original = source.querySelector('#tuner-view');
            if (!original) throw Error('Port tuner missing');
            const root = document.importNode(original, true);
            window.__matchesSource = root.outerHTML === original.outerHTML;
            root.hidden = false;
            document.querySelector('#fixture').append(root);
            window.__streams = [];
            const originalGet = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = async (...args) => { const stream = await originalGet(...args); window.__streams.push(stream); return stream; };
            const { initTuner } = await import('/apps/cruise-port/tuner-app.js');
            const { getCapabilities } = await import('/apps/cruise-port/cruise-port-capabilities.js');
            // Pure Port policy projection is confined to this fixture; it is not authentication.
            window.__tuner = initTuner(root, { capabilities: getCapabilities('pro'), storage: localStorage });
            window.__tuner.setActive(true);
        }); }
        await mount();
        assert.equal(await page.evaluate(() => window.__matchesSource), true);
        await page.waitForFunction(() => window.__streams?.some(stream => stream.getAudioTracks().some(track => track.readyState === 'live')));
        assert.equal(await page.locator('#tuner-capo-up').isVisible(), true);
        await page.locator('#tuner-capo-up').click();
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('cruisePort.tuner') || 'null')?.capo === 1);
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cruisePort.tuner')));
        assert.equal(stored.version, 3);
        await page.evaluate(() => window.__tuner.setActive(false));
        await page.waitForFunction(() => window.__streams.every(stream => stream.getAudioTracks().every(track => track.readyState === 'ended')));
        await page.evaluate(() => window.__tuner.setActive(true));
        await page.waitForFunction(() => window.__streams.some(stream => stream.getAudioTracks().some(track => track.readyState === 'live')));
        await page.evaluate(async () => { await window.__tuner.destroy(); });
        await page.waitForFunction(() => window.__streams.every(stream => stream.getAudioTracks().every(track => track.readyState === 'ended')));
        await page.reload();
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cruisePort.tuner')).capo), 1);
        await mount();
        assert.equal((await page.locator('#tuner-capo-value').textContent()).trim(), '1');
        await page.evaluate(async () => { await window.__tuner.destroy(); });
        assert.equal(await page.evaluate(() => localStorage.getItem('soundCruiseProAuth')), null);
    } finally { await browser.close(); }
});

test('Port metronome advanced writes remain denied without its Pro operation source', async () => {
    const url = process.env.STUDIO_URL;
    assert(url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
    const origin = new URL(url).origin;
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.origin !== origin) return route.abort();
        if (u.pathname === '/__shared-metronome-fixture') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><link rel="stylesheet" href="/apps/cruise-port/style.css"></head><body><div id="fixture"></div></body></html>' });
        return route.continue();
    });
    try {
        const page = await context.newPage();
        await page.goto(origin + '/__shared-metronome-fixture');
        await page.evaluate(async () => {
            const response = await fetch('/apps/cruise-port/pro_9a3943176561/index.html');
            if (!response.ok) throw Error('Port Pro HTML unavailable');
            const source = new DOMParser().parseFromString(await response.text(), 'text/html');
            const original = source.querySelector('#metronome-view');
            if (!original) throw Error('Port metronome missing');
            const root = document.importNode(original, true); root.hidden = false;
            document.querySelector('#fixture').append(root);
            const { initMetronome } = await import('/apps/cruise-port/metronome-app.js');
            const { getCapabilities } = await import('/apps/cruise-port/cruise-port-capabilities.js');
            // The pure policy projection opens the UI in this test, but grants no write authority.
            window.__metronome = initMetronome(root, { capabilities: getCapabilities('pro') });
            window.__metronome.setActive(true);
        });
        assert.equal(await page.evaluate(() => localStorage.getItem('soundCruiseProAuth')), null);
        const before = await page.evaluate(() => localStorage.getItem('cruisePort.metronome'));
        await page.locator('#metronome-details-summary').click();
        await page.locator('#metronome-meter').selectOption('3/4');
        await page.locator('#metronome-storage-error:not([hidden])').waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem('cruisePort.metronome')), before);
        await page.locator('#metronome-toggle').click();
        await page.waitForFunction(() => document.querySelector('#metronome-toggle').getAttribute('aria-pressed') === 'true');
        await page.evaluate(() => window.__metronome.setActive(false));
        assert.equal(await page.locator('#metronome-toggle').getAttribute('aria-pressed'), 'false');
    } finally { await browser.close(); }
});
