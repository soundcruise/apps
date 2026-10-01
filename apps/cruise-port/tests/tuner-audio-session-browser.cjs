// Usage: NODE_PATH=<Playwright runtime> node apps/cruise-port/tests/tuner-audio-session-browser.cjs [output-dir] [production-origin]
// Isolated storage, synthetic microphone tracks and a mocked AudioSession: never a device-volume test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const out = path.resolve(process.argv[2] || '/tmp/cruise-port-phase-a');
const production = process.argv[3];
const baseline = '9e728e226bb54363738a29d588d674c25b5d0851';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

(async () => {
    fs.mkdirSync(out, { recursive: true });
    const server = http.createServer((request, response) => {
        let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const old = name.startsWith('/baseline/');
        name = name.replace(/^\/(?:baseline|current)\//, '');
        if (name.endsWith('/')) name += 'index.html';
        const absolute = path.resolve(root, name);
        if (!absolute.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
        try {
            const data = old ? execFileSync('git', ['show', `${baseline}:${name}`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }) : fs.readFileSync(absolute);
            response.writeHead(200, { 'Content-Type': mime[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            response.end(data);
        } catch (_) { response.writeHead(404).end(); }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    let browser;
    const result = { mode: production ? 'production' : 'local', baseline, themes: [], levels: [], functional: [], pageErrors: [] };
    try {
        browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
        async function open(kind, theme, supported = true) {
            const context = await browser.newContext({ viewport: { width: 393, height: 852 }, reducedMotion: 'reduce' });
            await context.addInitScript(({ theme, supported }) => {
                localStorage.setItem('cruisePort.settings', JSON.stringify({ version: 3, displaySize: 'standard', fontSize: 'medium', sectionOrder: ['cruiseApps', 'tools', 'myApps'], theme }));
                const qa = window.phaseA = { events: [], streams: [], permission: 'granted', hidden: false, type: 'auto' };
                Object.defineProperty(document, 'hidden', { configurable: true, get: () => qa.hidden });
                const session = {};
                Object.defineProperty(session, 'type', { get: () => qa.type, set: (type) => { qa.events.push(`session:${type}`); qa.type = type; } });
                Object.defineProperty(navigator, 'audioSession', { configurable: true, value: supported ? session : undefined });
                navigator.mediaDevices.getUserMedia = async () => {
                    qa.events.push('getUserMedia');
                    if (qa.permission === 'denied') throw new DOMException('QA denied', 'NotAllowedError');
                    const audio = new AudioContext();
                    const destination = audio.createMediaStreamDestination();
                    const silence = audio.createConstantSource();
                    silence.offset.value = 0;
                    silence.connect(destination);
                    silence.start();
                    const stream = destination.stream;
                    qa.streams.push(stream);
                    for (const track of stream.getTracks()) {
                        const stop = track.stop.bind(track);
                        track.stop = () => { stop(); qa.events.push('tracks:ended'); void audio.close(); };
                    }
                    return stream;
                };
            }, { theme, supported });
            const page = await context.newPage();
            page.on('pageerror', (error) => result.pageErrors.push(error.message));
            await page.route('**/*', (route) => {
                const url = new URL(route.request().url());
                if (url.origin === origin || (production && url.origin === new URL(production).origin && url.pathname.startsWith('/apps/'))) return route.continue();
                if (url.pathname === '/v1/news') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [], pagination: { hasMore: false }, mode: 'on' }) });
                return route.fulfill({ status: 200, contentType: route.request().resourceType() === 'stylesheet' ? 'text/css' : 'application/json', body: route.request().resourceType() === 'stylesheet' ? '' : '{}' });
            });
            const base = kind === 'baseline' ? `${origin}/baseline` : production || `${origin}/current`;
            await page.goto(`${base}/apps/cruise-port/`, { waitUntil: 'networkidle' });
            assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
            await page.locator('#tuner-card').click();
            await page.waitForFunction(() => document.getElementById('tuner-status').textContent === 'マイク入力中');
            return { context, page, base };
        }
        const state = (page) => page.evaluate(() => ({ type: phaseA.type, events: [...phaseA.events], live: phaseA.streams.flatMap((stream) => stream.getTracks()).filter((track) => track.readyState === 'live').length }));
        async function leave(page, supported = true) {
            await page.locator('#tuner-view [data-action="home"]').click();
            const value = await state(page);
            assert.equal(value.live, 0);
            if (supported) {
                assert.equal(value.type, 'auto');
                assert.deepEqual(value.events.slice(-3), ['tracks:ended', 'session:playback', 'session:auto']);
            }
        }
        for (const theme of ['dark', 'gray', 'light']) {
            const old = await open('baseline', theme);
            const current = await open('current', theme);
            const oldPng = await old.page.locator('#tuner-view').screenshot({ animations: 'disabled', path: path.join(out, `${theme}-baseline.png`) });
            const newPng = await current.page.locator('#tuner-view').screenshot({ animations: 'disabled', path: path.join(out, `${theme}-current.png`) });
            assert.equal(digest(newPng), digest(oldPng), `${theme}: tuner UI pixels are unchanged`);
            result.themes.push({ theme, pixelsIdentical: true });
            await current.page.locator('[data-tuner-string][data-string="6"]').click();
            assert.equal((await state(current.page)).type, 'play-and-record', 'preview keeps capture active');
            assert.equal((await state(current.page)).live, 1);
            await leave(current.page);
            await current.page.locator('#metronome-card').click();
            await current.page.locator('#metronome-toggle').click();
            await current.page.waitForFunction(() => document.getElementById('metronome-toggle').getAttribute('aria-pressed') === 'true');
            assert.equal((await state(current.page)).type, 'auto');
            await current.page.locator('#metronome-toggle').click();
            await current.page.locator('#metronome-view [data-action="home"]').click();
            await current.page.locator('#tuner-card').click();
            await current.page.waitForFunction(() => document.getElementById('tuner-status').textContent === 'マイク入力中');
            assert.equal((await state(current.page)).type, 'play-and-record');
            await leave(current.page);
            result.functional.push(`${theme}: open / preview / leave / metronome / reopen PASS`);
            await old.context.close();
            await current.context.close();
        }
        const { page, context, base } = await open('current', 'dark');
        await page.setViewportSize({ width: 375, height: 812 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
        assert.equal((await state(page)).type, 'auto');
        assert.equal((await state(page)).live, 0);
        await page.locator('#tuner-toggle').click();
        await page.waitForFunction(() => document.getElementById('tuner-status').textContent === 'マイク入力中');
        await page.evaluate(() => { phaseA.hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
        assert.equal((await state(page)).type, 'auto');
        assert.equal((await state(page)).live, 0);
        await page.evaluate(() => { phaseA.hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
        await leave(page, false);
        await page.evaluate(() => { phaseA.permission = 'denied'; });
        await page.locator('#tuner-card').click();
        await page.waitForFunction(() => document.getElementById('tuner-status').textContent === 'マイクを開始できませんでした');
        assert.equal((await state(page)).type, 'auto');
        await page.evaluate(() => { phaseA.permission = 'granted'; });
        await page.locator('#tuner-toggle').click();
        await page.waitForFunction(() => document.getElementById('tuner-status').textContent === 'マイク入力中');
        await leave(page);
        result.functional.push('375px / pagehide / visibility / permission deny / retry PASS');
        result.levels = await page.evaluate(async () => {
            const { createTunerPreviewAudioController } = await import('./tuner-preview-audio.js?v=0.69.0');
            const references = [[44100, 40, 0.47419464588165283, 0.06624024105525961], [44100, 64, 0.46254459023475647, 0.028559644177134923], [48000, 40, 0.5244203805923462, 0.06627980837153452], [48000, 64, 0.4581543207168579, 0.026876924777881433]];
            const rows = [];
            for (const [sampleRate, midi, expectedPeak, expectedRms] of references) {
                const offline = new OfflineAudioContext(1, sampleRate * 3, sampleRate);
                const adapted = new Proxy(offline, { get(target, key) { if (key === 'state') return 'running'; if (['resume', 'suspend', 'close'].includes(key)) return () => Promise.resolve(); const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; } });
                const AudioContextClass = function () { return adapted; };
                const controller = createTunerPreviewAudioController({ environment: { AudioContextClass, documentTarget: {}, windowTarget: {}, navigatorObject: {} } });
                let seed = 0x12345678;
                const original = Math.random;
                Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
                try { await controller.play({ targetFrequency: 440 * 2 ** ((midi - 69) / 12) }); } finally { Math.random = original; }
                const samples = (await offline.startRendering()).getChannelData(0);
                let peak = 0, power = 0;
                for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); power += sample * sample; }
                rows.push({ sampleRate, midi, peak, rms: Math.sqrt(power / samples.length), expectedPeak, expectedRms });
            }
            return rows;
        });
        for (const row of result.levels) {
            assert.ok(Math.abs(row.peak - row.expectedPeak) < 1e-6);
            assert.ok(Math.abs(row.rms - row.expectedRms) < 1e-7);
        }
        await context.close();
        const unsupported = await open('current', 'dark', false);
        await leave(unsupported.page, false);
        assert.equal((await state(unsupported.page)).events.some((event) => event.startsWith('session:')), false);
        await unsupported.context.close();
        result.functional.push('unsupported AudioSession API PASS');
        assert.deepEqual(result.pageErrors, []);
        result.result = 'PASS';
        fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result, null, 2));
    } finally {
        if (browser) await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
})().catch((error) => { console.error(error); process.exitCode = 1; });
