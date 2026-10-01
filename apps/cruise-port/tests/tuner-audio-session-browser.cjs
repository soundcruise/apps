// Usage: NODE_PATH=<Playwright runtime> node apps/cruise-port/tests/tuner-audio-session-browser.cjs [output-dir] [production-origin]
// Phase B: isolated storage, synthetic microphone tracks, real source endings and mocked sessions.
// Includes Phase A cleanup, baseline pixels/styles, pause geometry and OfflineAudioContext levels.
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
const baseline = 'a3717eb897b9e4c3525f400a4f73cd1d4d4ea4c8';
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
        browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--disable-gpu', '--force-color-profile=srgb'] });
        async function open(kind, theme, supported = true, width = 393) {
            const context = await browser.newContext({ viewport: { width, height: width > 500 ? 1000 : 852 }, reducedMotion: 'reduce' });
            await context.addInitScript(({ theme, supported }) => {
                localStorage.setItem('cruisePort.settings', JSON.stringify({ version: 3, displaySize: 'standard', fontSize: 'medium', sectionOrder: ['cruiseApps', 'tools', 'myApps'], theme }));
                const qa = window.phaseA = { events: [], streams: [], permission: 'granted', hidden: false, type: 'auto' };
                Object.defineProperty(document, 'hidden', { configurable: true, get: () => qa.hidden });
                const session = {};
                Object.defineProperty(session, 'type', { get: () => qa.type, set: (type) => { qa.events.push(`session:${type}`); qa.type = type; } });
                Object.defineProperty(navigator, 'audioSession', { configurable: true, value: supported ? session : undefined });
                const createSource = AudioContext.prototype.createBufferSource;
                let sourceId = 0;
                AudioContext.prototype.createBufferSource = function () {
                    const source = createSource.call(this), id = ++sourceId;
                    const start = source.start.bind(source);
                    source.start = (...args) => { qa.events.push(`tone:start:${id}`); return start(...args); };
                    source.addEventListener('ended', () => { qa.events.push(`tone:end:${id}`); });
                    return source;
                };
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
                assert.deepEqual(value.events.filter((event) => event.startsWith('session:')).slice(-2), ['session:playback', 'session:auto']);
            }
        }
        const selectors = ['.tuner-panel', '#tuner-note', '#tuner-meter', '.tuner-strings', '#tuner-input-level-wrap', '#tuner-toggle', '#tuner-status', '#tuner-tuning', '#tuner-capo-up', '#tuner-input-settings-toggle'];
        const presentation = (page, styles = false) => page.evaluate(({ selectors, styles }) => Object.fromEntries(selectors.map((selector) => {
            const element = document.querySelector(selector), rect = element.getBoundingClientRect();
            const value = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            if (styles) { const computed = getComputedStyle(element); value.styles = Object.fromEntries([...computed].map((key) => [key, computed.getPropertyValue(key)])); }
            return [selector, value];
        })), { selectors, styles });
        for (const theme of ['dark', 'gray', 'light']) {
          for (const width of [375, 393, 1024]) {
            const old = await open('baseline', theme, true, width);
            const current = await open('current', theme, true, width);
            const oldPng = await old.page.locator('#tuner-view').screenshot({ animations: 'disabled', path: path.join(out, `${theme}-${width}-baseline.png`) });
            const newPng = await current.page.locator('#tuner-view').screenshot({ animations: 'disabled', path: path.join(out, `${theme}-${width}-current.png`) });
            assert.equal(digest(newPng), digest(oldPng), `${theme}: tuner UI pixels are unchanged`);
            assert.deepEqual(await presentation(current.page, true), await presentation(old.page, true));
            const before = await presentation(current.page);
            await current.page.locator('[data-tuner-string][data-string="6"]').click();
            await current.page.waitForFunction(() => phaseA.type === 'playback' && phaseA.events.some((event) => event.startsWith('tone:start:')));
            const paused = await state(current.page);
            assert.equal(paused.live, 0);
            assert.ok(paused.events.indexOf('tracks:ended') < paused.events.indexOf('session:playback'));
            assert.ok(paused.events.indexOf('session:playback') < paused.events.findIndex((event) => event.startsWith('tone:start:')));
            assert.equal(await current.page.locator('#tuner-status').textContent(), 'マイク一時停止中');
            assert.deepEqual(await presentation(current.page), before, 'pause changes no measured rectangle');
            await current.page.locator('#tuner-view').screenshot({ animations: 'disabled', path: path.join(out, `${theme}-${width}-paused.png`) });
            await current.page.locator('[data-tuner-string][data-string="5"]').click();
            await current.page.locator('[data-tuner-string][data-string="4"]').click();
            assert.equal((await state(current.page)).events.filter((event) => event === 'getUserMedia').length, 1, 'no microphone restart between taps');
            assert.deepEqual(await presentation(current.page), before);
            await current.page.waitForFunction(() => document.getElementById('tuner-status').textContent === 'マイク入力中');
            const resumed = await state(current.page);
            assert.equal(resumed.live, 1);
            assert.equal(resumed.type, 'play-and-record');
            assert.equal(resumed.events.filter((event) => event === 'getUserMedia').length, 2);
            assert.ok(resumed.events.findIndex((event) => event === 'tone:end:3') < resumed.events.lastIndexOf('getUserMedia'), 'actual final source end precedes microphone resume');
            assert.deepEqual(await presentation(current.page), before, 'resume changes no measured rectangle');
            result.themes.push({ theme, width, pixelsIdentical: true, computedStylesIdentical: true, pauseRectanglesDiff: 0, resumeRectanglesDiff: 0 });
            await current.page.locator('[data-tuner-string][data-string="6"]').click();
            await current.page.waitForFunction(() => phaseA.type === 'playback');
            await leave(current.page);
            const count = (await state(current.page)).events.filter((event) => event === 'getUserMedia').length;
            await current.page.locator('#metronome-card').click();
            await current.page.locator('#metronome-toggle').click();
            await current.page.waitForFunction(() => document.getElementById('metronome-toggle').getAttribute('aria-pressed') === 'true');
            assert.equal((await state(current.page)).type, 'auto');
            await current.page.locator('#metronome-toggle').click();
            await current.page.locator('#metronome-view [data-action="home"]').click();
            assert.equal((await state(current.page)).events.filter((event) => event === 'getUserMedia').length, count, 'leave during preview does not restart capture');
            await current.page.locator('#tuner-card').click();
            await current.page.waitForFunction(() => document.getElementById('tuner-status').textContent === 'マイク入力中');
            assert.equal((await state(current.page)).type, 'play-and-record');
            await leave(current.page);
            result.functional.push(`${theme}/${width}: pause / E2-A2-D3 / natural end / resume / leave / Phase A / reopen PASS`);
            await old.context.close();
            await current.context.close();
          }
        }
        const { page, context, base } = await open('current', 'dark');
        await page.setViewportSize({ width: 375, height: 812 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.locator('[data-tuner-string][data-string="6"]').click();
        await page.waitForFunction(() => phaseA.type === 'playback');
        await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
        assert.equal((await state(page)).type, 'auto');
        assert.equal((await state(page)).live, 0);
        await page.locator('#tuner-toggle').click();
        await page.waitForFunction(() => document.getElementById('tuner-status').textContent === 'マイク入力中');
        await page.locator('[data-tuner-string][data-string="6"]').click();
        await page.waitForFunction(() => phaseA.type === 'playback');
        await page.evaluate(() => { phaseA.hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
        assert.equal((await state(page)).type, 'auto');
        assert.equal((await state(page)).live, 0);
        await page.evaluate(() => { phaseA.hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
        const stoppedCount = (await state(page)).events.filter((event) => event === 'getUserMedia').length;
        await page.locator('#tuner-toggle').click();
        await page.waitForFunction(() => document.getElementById('tuner-status').textContent === 'マイク入力中');
        assert.equal((await state(page)).events.filter((event) => event === 'getUserMedia').length, stoppedCount + 1, 'no hidden/pagehide callback resumes microphone');
        await page.locator('[data-tuner-string][data-string="6"]').click();
        await page.waitForFunction(() => phaseA.type === 'playback');
        await page.evaluate(() => { phaseA.permission = 'denied'; });
        await page.waitForFunction(() => document.getElementById('tuner-status').textContent === 'マイクを開始できませんでした');
        assert.equal((await state(page)).type, 'auto');
        assert.equal((await state(page)).live, 0);
        assert.equal(await page.locator('#tuner-toggle').textContent(), 'マイクを再試行');
        await leave(page);
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
            const { createTunerPreviewAudioController } = await import('./tuner-preview-audio.js?v=1.12.3');
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
        await unsupported.page.locator('[data-tuner-string][data-string="6"]').click();
        await unsupported.page.waitForFunction(() => phaseA.events.some((event) => event.startsWith('tone:start:')));
        assert.equal((await state(unsupported.page)).live, 0);
        await unsupported.page.waitForFunction(() => document.getElementById('tuner-status').textContent === 'マイク入力中');
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
