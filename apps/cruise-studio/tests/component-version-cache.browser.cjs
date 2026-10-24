/* Real imports and explicit local reader only, empty disposable storage, no credentials. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.STUDIO_URL || 'http://127.0.0.1:8767/apps/cruise-studio/index.html', origin = new URL(url).origin;
test('F3: released versions, real cache paths and readonly workspace boot', async t => {
    const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const ctx = await browser.newContext(), requests = [], errors = [], missing = [], forbidden = [];
    const report = { versions: null, requests, errors, missing, forbidden, noWrite: null };
    try {
        await ctx.route('**/*', route => {
            const req = route.request(), u = new URL(req.url());
            if (u.origin === origin && ['GET', 'HEAD'].includes(req.method())) return route.continue();
            if (u.hostname === 'fonts.googleapis.com') return route.fulfill({ body: '', contentType: 'text/css' });
            forbidden.push(req.method() + ' ' + u.origin + u.pathname); return route.abort();
        });
        await ctx.addInitScript(() => {
            window.__f3 = { protectedWrites: [], idbWrites: [], apiRequests: [], unhandled: [] };
            for (const name of ['setItem', 'removeItem', 'clear']) {
                const f = Storage.prototype[name];
                Storage.prototype[name] = function (key, ...args) {
                    if (name === 'clear' || /^(cruisePort\.|soundCruise|sound-cruise)/i.test(key)) __f3.protectedWrites.push({ name, key });
                    return f.call(this, key, ...args);
                };
            }
            const tx = IDBDatabase.prototype.transaction;
            IDBDatabase.prototype.transaction = function (stores, mode, ...args) {
                if (mode === 'readwrite') __f3.idbWrites.push(this.name);
                return tx.call(this, stores, mode, ...args);
            };
            for (const name of ['put', 'add', 'delete', 'clear']) {
                const f = IDBObjectStore.prototype[name];
                IDBObjectStore.prototype[name] = function (...args) { __f3.idbWrites.push(this.name + ':' + name); return f.apply(this, args); };
            }
            const fetch = window.fetch.bind(window);
            window.fetch = (...args) => { __f3.apiRequests.push(String(args[0])); return fetch(...args); };
            window.addEventListener('unhandledrejection', e => __f3.unhandled.push(String(e.reason)));
        });
        const p = await ctx.newPage();
        p.on('request', r => { if (new URL(r.url()).origin === origin) requests.push(new URL(r.url()).pathname + new URL(r.url()).search); });
        p.on('pageerror', e => errors.push(e.message));
        p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        p.on('response', r => { if (r.status() >= 400) missing.push(r.url()); });
        await p.goto(url, { waitUntil: 'networkidle' });
        await p.waitForFunction(() => !!CruiseStudio.libraryViews && !!CruiseStudio.portDataHost);
        await t.test('Home, Library, Tuner and Dock boot through current Studio modules', async () => {
            assert.equal(await p.locator('#studio-version').innerText(), 'v0.47.7');
            for (const workspace of ['gear', 'myApps', 'tuner', 'home']) await p.evaluate(id => CruiseStudio.shellHost.navigate(id), workspace);
            assert.equal(await p.evaluate(() => CruiseStudio.tunerRuntime.snapshot().state), 'idle');
            assert.equal(await p.evaluate(() => CruiseStudio.metronomeM1.snapshot().running), false);
            for (const file of ['js/app.js', 'js/port-data/panel.mjs', 'js/port-data/connection.mjs', 'js/modules/tuner/panel.mjs', 'js/modules/library/panel.mjs', 'js/modules/chord/form-panel.mjs', 'js/modules/chord/form-adapter.mjs', 'js/modules/chord/form-adoption.mjs', 'js/core/component-metadata.mjs']) {
                assert.ok(requests.includes('/apps/cruise-studio/' + file + '?v=0.47.7'), file);
            }
        });
        await t.test('registry import obtains Port owner ESM via its actual 1.24.10 URL', async () => {
            // Registry is a public reader API, not a claim that every Home feature activates it.
            report.versions = await p.evaluate(async () => {
                const m = await import('/apps/cruise-studio/js/core/feature-registry.mjs?v=0.47.7');
                return Object.fromEntries(m.listComponents().map(c => [c.componentId, c.appVersion]));
            });
            assert.deepEqual(report.versions, { 'cruise-port': '1.24.10', 'chord-cruise': '1.21.0', 'pitch-cruise': '2.30.0', 'fretboard-cruise': '2.25.0', 'rhythm-cruise': '1.21.0', 'cruise-studio': '0.47.7' });
            assert.ok(requests.includes('/apps/cruise-port/app-version.js?v=1.24.10'));
            for (const name of ['music-theory', 'chord-model']) assert.ok(requests.includes('/apps/chord-cruise/js/core/' + name + '.js?v=1.21.0'));
            assert.equal(requests.some(r => /chord-cruise\/js\/app\.js|pitch-cruise\/script\.js|fretboard_cruise\/script\.js|rhythm-cruise\/script\.js/.test(r)), false);
        });
        await t.test('explicit Port reader loads its owner definitions, empty local dataset and no writer', async () => {
            await p.click('#shell-tool');
            await p.click('#studio-port-read');
            await p.waitForFunction(() => !document.querySelector('#studio-port-read').disabled && CruiseStudio.portDataHost.getCachedStatus().dataset !== null);
            assert.equal(await p.locator('#studio-port-read-status').getAttribute('data-status'), 'empty');
            assert.equal(await p.evaluate(() => CruiseStudio.portDataHost.canWrite), false);
            assert.ok(requests.includes('/apps/cruise-port/port-dataset-repository.js'));
            assert.ok(requests.includes('/apps/cruise-port/port-sync-controller.js'));
        });
        await t.test('all observed Studio product cache URLs are current; zero stale owner URLs', async () => {
            for (const ref of requests.filter(r => r.startsWith('/apps/cruise-studio/') && /\.(js|mjs|css)\?/.test(r) && !r.includes('/vendor/'))) {
                assert.equal(new URL(ref, origin).search, '?v=0.47.7', ref);
            }
            assert.equal(requests.includes('/apps/cruise-port/app-version.js?v=1.23.0'), false);
            assert.equal(requests.includes('/apps/cruise-port/app-version.js?v=1.23.1'), false);
            assert.equal(requests.includes('/apps/cruise-port/app-version.js?v=1.24.0'), false);
            assert.equal(requests.some(r => r.includes('/chord-cruise/js/core/') && r.endsWith('?v=1.20.1')), false);
        });
        await t.test('No-write, no cloud requests, console errors or missing assets', async () => {
            report.noWrite = await p.evaluate(async () => ({ ...__f3, databases: await indexedDB.databases() }));
            assert.deepEqual(report.noWrite, { protectedWrites: [], idbWrites: [], apiRequests: [], unhandled: [], databases: [] });
            assert.deepEqual(errors, []); assert.deepEqual(missing, []); assert.deepEqual(forbidden, []);
        });
    } finally {
        if (process.env.STAFF_QA_DIR) fs.writeFileSync(path.join(process.env.STAFF_QA_DIR, 'f3-cache-browser.json'), JSON.stringify(report, null, 2));
        await ctx.close(); await browser.close();
    }
});
