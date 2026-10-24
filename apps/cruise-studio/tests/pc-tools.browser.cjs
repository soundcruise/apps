/* Disposable loopback browser only. All microphone input is the synthetic WAV. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium } = require('playwright');
const url = process.env.STUDIO_URL, origin = new URL(url).origin;
test('PC Tuner and Standard Metronome temporary controls', async t => {
    assert(fs.existsSync(process.env.TUNER_FAKE_AUDIO));
    const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=' + process.env.TUNER_FAKE_AUDIO] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), errors = [], missing = [], network = [];
    await context.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin === origin && route.request().method() === 'GET') return route.continue(); if (u.hostname === 'fonts.googleapis.com') return route.fulfill({ body: '', contentType: 'text/css' }); network.push(u.href); return route.abort(); });
    await context.addInitScript(() => {
        window.__tools = { writes: [], opens: [], contexts: [], fixture: false };
        const Native = AudioContext; window.AudioContext = class extends Native { constructor(...args) { super(...args); __tools.contexts.push(this); } };
        for (const name of ['setItem', 'removeItem', 'clear']) { const fn = Storage.prototype[name]; Storage.prototype[name] = function (key, ...args) { if (!__tools.fixture && (name === 'clear' || /^(cruisePort\.|soundCruise|sound-cruise)/i.test(key))) __tools.writes.push({ name, key }); return fn.call(this, key, ...args); }; }
        const open = IDBFactory.prototype.open; IDBFactory.prototype.open = function (name, ...args) { __tools.opens.push(name); return open.call(this, name, ...args); };
        const transaction = IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction = function (names, mode, ...args) { if (mode === 'readwrite') __tools.writes.push({ names, mode }); return transaction.call(this, names, mode, ...args); };
    });
    const p = await context.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); p.on('response', r => { if (r.status() === 404) missing.push(r.url()); });
    try {
        await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForFunction(() => CruiseStudio.tunerReference && CruiseStudio.metronomeSettingsController.snapshot().loaded);
        await p.evaluate(async () => { const CS = CruiseStudio, project = CS.model.createSampleProject(); await CS.repository.save({ target: { type: 'project', projectId: project.projectId }, snapshot: project, baseRevision: null }); CS.storage.setCurrentProjectId(project.projectId); CS.sheetCruise.load(project.projectId); CS.shellHost.navigate('sheetCruise'); const session = CS.sessions.getActiveSession(); session.draft.songInfo.title = 'Temporary tools must retain this dirty song'; window.__songBefore = JSON.stringify(CS.sheetCruise.getSession()); window.__projectRawBefore = JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([key]) => /^cruiseStudio\.(project\.|projects\.index$|currentProjectId$)/.test(key)))); });
        await p.click('[data-workspace="tuner"]');
        await t.test('cold entry is audio and Port IO free; tuning presets are the owner list', async () => {
            assert.deepEqual(await p.evaluate(() => [__tools.contexts.length, __tools.opens, __tools.writes]), [0, [], []]);
            assert.equal(await p.locator('#tuner-tuning option').count(), 11); assert.match(await p.locator('[data-tuner-permission]').innerText(), /未使用/);
        });
        await t.test('draft apply, cancel and invalid threshold preserve current settings; Enter/Tab remain local', async () => {
            await p.selectOption('#tuner-tuning', 'drop-d'); await p.fill('#tuner-threshold', '-65');
            assert.equal(await p.evaluate(() => CruiseStudio.tunerRuntime.snapshot().thresholdDb), -80);
            await p.click('#tuner-cancel'); assert.equal(await p.inputValue('#tuner-tuning'), 'standard'); assert.equal(await p.inputValue('#tuner-threshold'), '-80');
            await p.selectOption('#tuner-tuning', 'drop-d'); await p.fill('#tuner-threshold', '-65'); await p.locator('#tuner-apply').focus(); await p.keyboard.press('Enter');
            assert.equal(await p.evaluate(() => CruiseStudio.tunerRuntime.snapshot().thresholdDb), -65); assert.match(await p.locator('[data-reference-string="6"]').innerText(), /D2.*73\.42/); assert.equal(await p.evaluate(() => document.activeElement.id), 'tuner-apply');
            await p.fill('#tuner-threshold', '-101'); await p.click('#tuner-apply'); assert.equal(await p.evaluate(() => CruiseStudio.tunerRuntime.snapshot().thresholdDb), -65); assert.match(await p.locator('[data-tuner-draft-status]').innerText(), /整数/); await p.click('#tuner-cancel');
        });
        await t.test('reference uses explicit output lease; mic conflict does not steal; Global Stop closes context', async () => {
            await p.click('[data-reference-string="A4"]'); await p.waitForFunction(() => CruiseStudio.tunerReference.snapshot().state === 'playing');
            assert.equal(await p.evaluate(() => CruiseStudio.audio.snapshot().find(s => s.sessionId === 'studio.tuner.reference').contextCount), 1);
            await p.click('#tuner-start'); assert.equal(await p.evaluate(() => CruiseStudio.tunerRuntime.snapshot().state), 'idle'); assert.match(await p.locator('[data-tuner-status]').innerText(), /先に停止/);
            await p.click('#shell-audio-stop'); await p.waitForFunction(() => __tools.contexts.every(c => c.state === 'closed'));
        });
        await t.test('fake microphone observes settings, denies reference overlap, permission error remains actionable', async () => {
            await p.click('#tuner-start'); await p.waitForFunction(() => CruiseStudio.tunerRuntime.snapshot().state === 'active');
            await p.waitForFunction(() => Math.abs(CruiseStudio.tunerRuntime.snapshot().reading?.frequency - 443) < 1); assert.match(await p.locator('[data-tuner-permission]').innerText(), /取得済み/);
            await p.click('[data-reference-string="A4"]'); assert.match(await p.locator('[data-tuner-reference-status]').innerText(), /先に停止/); assert.equal(await p.evaluate(() => CruiseStudio.tunerRuntime.snapshot().state), 'active');
            await p.click('#tuner-stop'); await p.waitForFunction(() => CruiseStudio.tunerRuntime.snapshot().canStart);
            await p.evaluate(() => { window.__capture = navigator.mediaDevices.getUserMedia; navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('fixture', 'NotAllowedError')); });
            await p.click('#tuner-start'); await p.waitForFunction(() => CruiseStudio.tunerRuntime.snapshot().error === 'permission-denied'); assert.match(await p.locator('[data-tuner-permission]').innerText(), /拒否/); await p.evaluate(() => navigator.mediaDevices.getUserMedia = __capture);
        });
        await t.test('workspace departure stops reference; Free has A4 only; IME and Modal block synthetic activation', async () => {
            await p.click('[data-reference-string="A4"]'); await p.waitForFunction(() => CruiseStudio.tunerReference.snapshot().state === 'playing'); await p.click('[data-workspace="home"]'); await p.waitForFunction(() => __tools.contexts.every(c => c.state === 'closed')); await p.click('[data-workspace="tuner"]');
            await p.selectOption('#tuner-tuning', 'free'); await p.click('#tuner-apply'); assert.equal(await p.locator('#tuner-targets button').count(), 1);
            await p.evaluate(() => { const e = document.querySelector('#tuner-apply'); e.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); document.querySelector('#tuner-threshold').value = '-75'; e.click(); e.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); });
            assert.equal(await p.evaluate(() => CruiseStudio.tunerRuntime.snapshot().thresholdDb), -65); await p.waitForFunction(() => !CruiseStudio.shellHost.keyboard.isIMEBlocked({})); await p.click('#tuner-cancel');
            await p.evaluate(() => { CruiseStudio.shellHost.modal.open({ title: 'Fixture', content: document.createElement('input') }); document.querySelector('[data-reference-string="A4"]').click(); }); assert.notEqual(await p.evaluate(() => CruiseStudio.tunerReference.snapshot().state), 'playing'); await p.keyboard.press('Escape');
        });
        await t.test('four themes and narrow widths preserve settings and control geometry', async () => {
            for (const width of [390, 768, 1440, 1920]) { await p.setViewportSize({ width, height: 1000 }); assert(await p.evaluate(() => document.querySelector('#studio-main').scrollWidth <= document.querySelector('#studio-main').clientWidth)); }
            for (const theme of ['dark', 'charcoal', 'gray', 'light']) { await p.evaluate(t => CruiseStudio.colorTheme.setColorTheme(t), theme); const colors = await p.locator('#tuner-threshold').evaluate(e => ({ color: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor })); assert.notEqual(colors.color, colors.bg); }
        });
        await t.test('Standard detailed controls remain disabled; saved preset previews BPM only, no Port write', async () => {
            await p.setViewportSize({ width: 1440, height: 1000 }); await p.click('#shell-dock-toggle'); await p.click('#shell-tool');
            await p.evaluate(() => { __tools.fixture = true; try { const d = CruiseStudio.metronomeSchema.defaults(); localStorage.setItem('cruisePort.metronomePresets', JSON.stringify({ version: 1, items: [{ ...d, id: 'practice', name: 'Practice', bpm: 150, meter: '3/4', accents: [true, false, false], sound: 'analog' }] })); } finally { __tools.fixture = false; } });
            const raw = await p.evaluate(() => localStorage.getItem('cruisePort.metronomePresets')); await p.click('#studio-port-read'); await p.waitForFunction(() => !document.querySelector('#studio-port-read').disabled); await p.click('[data-preset-id="practice"]'); await p.click('#studio-port-preview-preset');
            await p.waitForFunction(() => CruiseStudio.metronomeM1.snapshot().running); const settings = await p.evaluate(() => CruiseStudio.metronomeM1.snapshot().settings.effectiveSettings); assert.equal(settings.bpm, 150); assert.equal(settings.meter, '4/4'); assert.equal(settings.sound, 'electronic');
            assert.equal(await p.locator('.metronome-advanced select').first().isDisabled(), true); await p.click('#shell-metronome-stop'); await p.waitForFunction(() => CruiseStudio.metronomeM1.snapshot().pendingCloseCount === 0);
            assert.equal(await p.evaluate(() => localStorage.getItem('cruisePort.metronomePresets')), raw); assert.equal(await p.evaluate(() => CruiseStudio.portDataHost.canWrite), false);
        });
        await t.test('no prohibited writes, DBs, traffic, console/404; reload resets only temporary settings', async () => {
            assert.equal(await p.evaluate(() => JSON.stringify(CruiseStudio.sheetCruise.getSession()) === __songBefore), true);
            assert.deepEqual(await p.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => /^cruiseStudio\.(project\.|projects\.index$|currentProjectId$)/.test(key)))), await p.evaluate(() => JSON.parse(__projectRawBefore)));
            assert.deepEqual(await p.evaluate(() => __tools.writes), []); assert.deepEqual(await p.evaluate(() => indexedDB.databases()), []); assert.deepEqual(errors, []); assert.deepEqual(missing, []); assert.deepEqual(network, []);
            await p.reload({ waitUntil: 'networkidle' }); await p.waitForFunction(() => CruiseStudio.tunerRuntime); assert.equal(await p.evaluate(() => CruiseStudio.tunerRuntime.snapshot().thresholdDb), -80); assert.equal(await p.evaluate(() => CruiseStudio.metronomeM1.snapshot().bpm), 120); assert.equal(await p.evaluate(() => __tools.contexts.length), 0);
        });
    } finally { await context.close(); await browser.close(); }
});
