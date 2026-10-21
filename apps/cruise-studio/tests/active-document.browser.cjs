/* Normal Studio document/output regression; disposable Chrome, no auth probes. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium } = require('playwright');
const url = process.env.STUDIO_URL || 'http://127.0.0.1:8766/apps/cruise-studio/index.html';
test('Active Document alignment real Chrome', async t => {
    const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
    const p = await context.newPage(); p.setDefaultTimeout(8000); p.on('dialog', d => d.accept());
    const nav = async id => { await p.click('.studio-nav [data-workspace="' + id + '"]'); await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); };
    const download = async selector => { const pending = p.waitForEvent('download'); await p.click(selector); return fs.readFileSync(await (await pending).path()); };
    try {
        await p.goto(url); await p.waitForFunction(() => !!CruiseStudio.shellHost);
        await p.evaluate(async () => { const CS = CruiseStudio, project = CS.model.createSampleProject(); project.projectId = 'A'; project.songInfo.title = 'Song A'; await CS.repository.save({ target: { type: 'project', projectId: 'A' }, snapshot: project, baseRevision: null }); CS.storage.setCurrentProjectId('A'); });
        await t.test('counterexample A → Pre-DTM → new dirty B → Pre-DTM exports B', async () => {
            await nav('sheetCruise'); await nav('preDtm'); assert.equal(JSON.parse(await download('#pd-export-json')).projectId, 'A');
            await nav('sheetCruise'); await p.click('#sc-new-project');
            await p.locator('#sc-editor-drawer').evaluate(e => e.open = true); await p.locator('#sc-title').fill('Unsaved B'); await p.locator('#sc-editor-drawer').evaluate(e => e.open = false);
            const before = await p.evaluate(() => { const s = CruiseStudio.sheetCruise.getSession(); return { id: s.target.projectId, base: s.baseRevision, draft: JSON.stringify(s.draft) }; });
            await nav('preDtm'); const json = JSON.parse(await download('#pd-export-json'));
            assert.equal(json.projectId, before.id); assert.equal(json.songTitle, 'Unsaved B');
            assert.equal(await p.locator('#pd-project-select').inputValue(), before.id);
            const midi = await download('#pd-export-midi'); assert.equal(midi.subarray(0, 4).toString(), 'MThd'); assert(midi.includes(Buffer.from('Unsaved B')));
            await nav('sheetCruise'); assert.deepEqual(await p.evaluate(() => { const s = CruiseStudio.sheetCruise.getSession(); return { id: s.target.projectId, base: s.baseRevision, draft: JSON.stringify(s.draft) }; }), before);
            assert.equal(await p.evaluate(() => CruiseStudio.sheetCruise.getSession().dirty), true);
        });
        async function fresh(fn, empty = false) {
            const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
            await ctx.route('**/*', r => {
                const u = new URL(r.request().url());
                if (u.origin === new URL(url).origin) return r.continue();
                if (u.hostname === 'fonts.googleapis.com') return r.fulfill({ body: '', contentType: 'text/css' });
                return r.abort();
            });
            await ctx.addInitScript(() => {
                window.__adaQA = { writes: [], idb: [], opens: [], unhandled: [] };
                for (const m of ['setItem', 'removeItem', 'clear']) { const f = Storage.prototype[m]; Storage.prototype[m] = function (key, ...args) { __adaQA.writes.push({ m, key }); return f.call(this, key, ...args); }; }
                for (const m of ['put', 'add', 'delete', 'clear']) { const f = IDBObjectStore.prototype[m]; IDBObjectStore.prototype[m] = function (...args) { __adaQA.idb.push(this.name + ':' + m); return f.apply(this, args); }; }
                const open = IDBFactory.prototype.open; IDBFactory.prototype.open = function (name, ...args) { __adaQA.opens.push(name); return open.call(this, name, ...args); };
                window.addEventListener('unhandledrejection', e => __adaQA.unhandled.push(String(e.reason)));
            });
            const page = await ctx.newPage(), errors = [], missing = []; page.setDefaultTimeout(8000); page.on('dialog', d => d.accept());
            page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('response', r => { if (r.status() === 404) missing.push(r.url()); });
            const go = async id => { await page.click('.studio-nav [data-workspace="' + id + '"]'); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); };
            const get = () => page.evaluate(() => { const s = CruiseStudio.sheetCruise.getSession(); return { id: s?.target.projectId, draft: s && JSON.stringify(s.draft), base: s?.baseRevision, dirty: s?.dirty, pending: s?.externalUpdatePending }; });
            const dl = async selector => { const d = page.waitForEvent('download'); await page.click(selector); return fs.readFileSync(await (await d).path()); };
            try {
                await page.goto(url); await page.waitForFunction(() => !!CruiseStudio.documents);
                if (!empty) {
                    await page.evaluate(async () => { const CS = CruiseStudio; for (const id of ['A', 'B']) { const x = CS.model.createSampleProject(); x.projectId = id; x.songInfo.title = 'Song ' + id; await CS.repository.save({ target: { type: 'project', projectId: id }, snapshot: x, baseRevision: null }); } CS.storage.setCurrentProjectId('A'); });
                    await go('sheetCruise');
                }
                await page.evaluate(() => __adaQA.writes = []);
                await fn(page, { go, get, dl, ctx });
                const qa = await page.evaluate(() => __adaQA);
                assert.deepEqual(qa.writes.filter(x => /^(cruisePort\.|soundCruise|sound-cruise)/.test(x.key) || x.m === 'clear'), []);
                assert.deepEqual(qa.idb, []); assert.deepEqual(qa.opens, []); assert.deepEqual(qa.unhandled, []); assert.deepEqual(errors, []); assert.deepEqual(missing, []);
                assert.equal(await page.evaluate(() => CruiseStudio.portDataHost.canWrite), false);
            } finally { await ctx.close(); }
        }
        await t.test('Scenario B: unsaved chord exports fixed JSON/MIDI and returns draft/focus', () => fresh(async (page, { go, get, dl }) => {
            await page.locator('.sheet-bar').first().click(); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
            await page.locator('[data-overlay-field=chord]').fill('Dm7'); const before = await get(); await go('preDtm');
            const json = JSON.parse(await dl('#pd-export-json')); assert.equal(json.projectId, 'A'); assert(json.generatedEvents.bass.some(e => e.chordSymbol === 'Dm7' && e.midi === 38));
            const midi = await dl('#pd-export-midi'); assert(midi.includes(Buffer.from([0x90, 38, 92]))); await go('sheetCruise'); assert.deepEqual(await get(), before);
            assert.equal(await page.evaluate(() => document.activeElement.dataset.overlayField), 'chord');
        }));
        await t.test('Scenario C: Pre-DTM selector activates cached A/B drafts; app-wide settings remain intact', () => fresh(async (page, { go, dl }) => {
            for (const id of ['A', 'B']) { await page.selectOption('#sc-project-select', id); await page.locator('#sc-editor-drawer').evaluate(e => e.open = true); await page.locator('#sc-title').fill('Dirty ' + id); }
            await go('preDtm'); await page.locator('#pd-on-guitar').uncheck();
            for (const id of ['A', 'B', 'A']) { await page.selectOption('#pd-project-select', id); const x = JSON.parse(await dl('#pd-export-json')); assert.equal(x.projectId, id); assert.equal(x.songTitle, 'Dirty ' + id); assert.equal(x.settings.parts.guitar, false); assert.equal(await page.evaluate(() => CruiseStudio.sheetCruise.getSession().target.projectId), id); }
            await go('sheetCruise'); assert.equal(await page.locator('#sc-title').inputValue(), 'Dirty A');
        }));
        await t.test('Scenario D: document switch inside MIDI build retains A file, rejects old completion on B', () => fresh(async (page, { go, dl }) => {
            await go('preDtm'); await page.evaluate(() => { const build = CruiseStudio.midi.buildMidiFile; CruiseStudio.midi.buildMidiFile = function (arr) { CruiseStudio.documents.select('B'); return build(arr); }; });
            const midi = await dl('#pd-export-midi'); assert(midi.includes(Buffer.from('Song A'))); assert(!midi.includes(Buffer.from('Song B')));
            assert.equal(await page.locator('#pd-project-select').inputValue(), 'B'); assert.match(await page.locator('#pd-song-info').innerText(), /Song B/); assert.equal(await page.locator('#pd-status').innerText(), '');
        }));
        await t.test('Scenario E: save/reload and Pre-DTM-first bootstrap retain the same document', () => fresh(async (page, { go, dl }) => {
            await page.locator('#sc-editor-drawer').evaluate(e => e.open = true); await page.locator('#sc-title').fill('Saved A'); await page.click('#sc-save'); await page.waitForFunction(() => !CruiseStudio.sheetCruise.getSession().commitInFlight);
            await page.reload(); await page.waitForFunction(() => !!CruiseStudio.documents); await go('preDtm'); assert.equal(JSON.parse(await dl('#pd-export-json')).songTitle, 'Saved A'); await go('sheetCruise'); assert.equal(await page.locator('#sc-title').inputValue(), 'Saved A');
        }));
        await t.test('view/round trips/output never write project or collection index', () => fresh(async (page, { go, dl }) => {
            await go('preDtm'); await dl('#pd-export-json'); await dl('#pd-export-midi'); await go('sheetCruise'); await go('preDtm');
            assert.deepEqual(await page.evaluate(() => __adaQA.writes.filter(x => x.key?.startsWith('cruiseStudio.project'))), []);
        }));
        await t.test('dirty external update blocks JSON/MIDI and keeps base/draft until explicit adoption', () => fresh(async (page, { go, get, dl }) => {
            await page.locator('#sc-editor-drawer').evaluate(e => e.open = true); await page.locator('#sc-title').fill('Keep draft'); const before = await get(); await go('preDtm');
            await page.evaluate(async () => { const CS = CruiseStudio, t = { type: 'project', projectId: 'A' }, r = CS.repository.read(t), x = JSON.parse(JSON.stringify(r.snapshot)); x.songInfo.title = 'Incoming'; await CS.repository.save({ target: t, snapshot: x, baseRevision: r.revision }); });
            assert(await page.locator('#pd-export-json').isDisabled()); assert(await page.locator('#pd-export-midi').isDisabled()); assert.match(await page.locator('#pd-status').innerText(), /更新または削除/);
            const after = await get(); assert.equal(after.draft, before.draft); assert.equal(after.base, before.base); assert(after.pending);
            await go('sheetCruise'); await page.click('#sc-adopt-external'); await go('preDtm'); assert.equal(JSON.parse(await dl('#pd-export-json')).songTitle, 'Incoming');
        }));
        await t.test('clean external update refreshes current display without retargeting', () => fresh(async (page, { go, dl }) => {
            await go('preDtm'); await page.evaluate(async () => { const CS = CruiseStudio, t = { type: 'project', projectId: 'A' }, r = CS.repository.read(t), x = JSON.parse(JSON.stringify(r.snapshot)); x.songInfo.title = 'External clean'; await CS.repository.save({ target: t, snapshot: x, baseRevision: r.revision }); });
            assert.match(await page.locator('#pd-song-info').innerText(), /External clean/); assert.equal(JSON.parse(await dl('#pd-export-json')).projectId, 'A');
        }));
        await t.test('deletion keeps an exportable Structure draft but disables Pre-DTM output', () => fresh(async (page, { go, get }) => {
            const before = await get(); await go('preDtm'); await page.evaluate(async () => { const t = { type: 'project', projectId: 'A' }; await CruiseStudio.repository.remove(t, CruiseStudio.repository.read(t).revision); });
            assert(await page.locator('#pd-export-midi').isDisabled()); assert.equal((await get()).draft, before.draft); assert.equal(await page.locator('#pd-project-select').inputValue(), 'A'); await go('sheetCruise'); assert(await page.locator('#sc-save').isDisabled());
        }));
        await t.test('future schema does not use a cached old document or replace it with B', () => fresh(async (page, { go }) => {
            await go('preDtm'); await page.evaluate(() => { const x = JSON.parse(localStorage.getItem('cruiseStudio.project.A')); x.schemaVersion = 999; localStorage.setItem('cruiseStudio.project.A', JSON.stringify(x)); }); await page.click('#pd-reload');
            assert(await page.locator('#pd-export-json').isDisabled()); assert.equal(await page.locator('#pd-project-select').inputValue(), 'A'); assert.equal(await page.evaluate(() => CruiseStudio.sheetCruise.getSession().draft.schemaVersion), 2);
        }));
        await t.test('no document stays empty, without creating/saving a project', () => fresh(async (page, { go }) => {
            await go('preDtm'); assert.equal(await page.locator('#pd-project-select').inputValue(), ''); assert(await page.locator('#pd-empty').isVisible()); assert(await page.locator('#pd-export-json').isDisabled()); assert.equal(await page.evaluate(() => CruiseStudio.sessions.listSessions().length), 0);
            assert.deepEqual(await page.evaluate(() => __adaQA.writes), []);
        }, true));
        await t.test('late Structure FileReader after A/B/A cannot retarget the active document', () => fresh(async (page, { go, get }) => {
            await page.evaluate(() => { window.__nativeReader = FileReader; window.FileReader = class { readAsText() { window.__reader = this; } }; });
            const bytes = await page.evaluate(() => JSON.stringify(CruiseStudio.model.createSampleProject())); await page.locator('#sc-import-json').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(bytes) });
            await page.selectOption('#sc-project-select', 'B'); await page.selectOption('#sc-project-select', 'A'); const before = await get(); await page.evaluate(data => { __reader.result = data; __reader.onload(); }, bytes);
            assert.deepEqual(await get(), before); assert.match(await page.locator('#sc-save-status').innerText(), /中止/); await go('preDtm'); assert.equal(await page.locator('#pd-project-select').inputValue(), 'A');
        }));
        await t.test('four themes, five widths, pane/resize and Print preserve document and draft', () => fresh(async (page, { go, get, dl }) => {
            const before = await get(); await go('preDtm'); assert.equal(await page.locator('#studio-version').textContent(), 'v0.45.0');
            for (const theme of ['dark', 'charcoal', 'gray', 'light']) { await page.evaluate(x => CruiseStudio.colorTheme.setColorTheme(x), theme); for (const width of [390, 768, 1024, 1440, 1920]) { await page.setViewportSize({ width, height: 900 }); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); assert.equal(await page.locator('#pd-project-select').inputValue(), 'A'); assert.equal(JSON.parse(await dl('#pd-export-json')).projectId, 'A'); await page.screenshot({ path: '/private/tmp/ada-' + theme + '-' + width + '.png' }); } }
            await page.setViewportSize({ width: 1440, height: 900 }); await page.click('#shell-inspector'); await page.click('#shell-pane-close'); await go('sheetCruise'); assert.deepEqual(await get(), before); await page.emulateMedia({ media: 'print' }); assert.match(await page.locator('.sheet-page').innerText(), /Song A/); assert.equal(await page.locator('.studio-nav').evaluate(e => getComputedStyle(e).display), 'none'); await page.emulateMedia({ media: 'screen' });
        }));
    } finally { await browser.close(); }
});
