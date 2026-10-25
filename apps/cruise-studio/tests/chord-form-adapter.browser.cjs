/* Test-only owner loading. No Chord form API is added to the production graph. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.STUDIO_URL;
test('Chord pure adapter in real Chrome: owner import and memory-only boundary', async t => {
    assert(url, 'isolated STUDIO_URL required');
    const origin = new URL(url).origin, errors = [], missing = [], forbidden = [];
    const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const context = await browser.newContext();
    try {
        await context.route('**/*', r => {
            const q = r.request(), u = new URL(q.url());
            if (u.origin === origin && ['GET', 'HEAD'].includes(q.method())) return r.continue();
            if (u.hostname === 'fonts.googleapis.com') return r.fulfill({ body: '', contentType: 'text/css' });
            forbidden.push(q.method() + ' ' + u.href); return r.abort();
        });
        const p = await context.newPage();
        p.on('pageerror', e => errors.push(e.message));
        p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        p.on('response', r => { if (r.status() >= 400) missing.push(r.url()); });
        await p.goto(url, { waitUntil: 'networkidle' });
        await p.waitForFunction(() => !!CruiseStudio.sheetCruise && !!CruiseStudio.repository);
        await t.test('production boot has schema 2 and pure CAGED dependency for explicit form UI', async () => {
            assert.equal(await p.locator('#studio-version').innerText(), 'v0.47.9');
            assert.equal(await p.evaluate(() => !!ChordCruise.caged), true);
            assert.equal(await p.evaluate(() => CruiseStudio.portDataHost.canWrite), false);
        });
        // Disposable fixture setup precedes the measured no-write window.
        await p.evaluate(async () => {
            const CS = CruiseStudio, project = CS.model.createSampleProject();
            const r = await CS.repository.save({ target: { type: 'project', projectId: project.projectId }, snapshot: project, baseRevision: null });
            if (!r.ok) throw Error(r.error);
            CS.sheetCruise.load(project.projectId); CS.shellHost.navigate('sheetCruise');
            const s = CS.sheetCruise.getSession();
            if (!s.runOperation('fixture dirty draft', d => d.songInfo.title = 'unsaved').ok ||
                !s.runOperation('fixture redo entry', d => d.songInfo.artist = 'unsaved artist').ok || !s.undo().ok ||
                !s.canUndo() || !s.canRedo() || s.draft.schemaVersion !== 2 || !CS.model.validateProject(s.workingSnapshot()).ok) throw Error('schema2/history fixture invalid');
        });
        await p.evaluate(() => {
            window.__adapterAudit = { writes: [], db: [], network: [] };
            for (const method of ['setItem', 'removeItem', 'clear']) Storage.prototype[method] = function () { __adapterAudit.writes.push(method); throw Error('storage write'); };
            for (const method of ['put', 'add', 'delete', 'clear']) IDBObjectStore.prototype[method] = function () { __adapterAudit.db.push(method); throw Error('DB write'); };
            const open = indexedDB.open.bind(indexedDB);
            indexedDB.open = function (...args) { __adapterAudit.db.push('open'); return open(...args); };
            window.fetch = function () { __adapterAudit.network.push('fetch'); throw Error('network'); };
            XMLHttpRequest.prototype.open = function () { __adapterAudit.network.push('xhr'); throw Error('network'); };
            navigator.sendBeacon = function () { __adapterAudit.network.push('beacon'); return false; };
            window.__adapterBefore = JSON.stringify({ storage: { ...localStorage }, draft: CruiseStudio.sheetCruise.getSession().workingSnapshot(),
                base: CruiseStudio.sheetCruise.getSession().baseSnapshot, revision: CruiseStudio.sheetCruise.getSession().baseRevision,
                history: CruiseStudio.sheetCruise.getSession().getHistory(), dirty: CruiseStudio.sheetCruise.getSession().dirty });
        });
        // Explicit fixture load of the unchanged released owner, not a product import.
        await p.addScriptTag({ url: origin + '/apps/chord-cruise/js/core/caged-forms.js?v=1.21.0' });
        const report = await p.evaluate(async () => {
            const { createChordFormAdapter, CHORD_FORM_ADAPTER_VERSION } = await import('/apps/cruise-studio/js/modules/chord/form-adapter.mjs');
            const a = createChordFormAdapter({ chordTheory: ChordCruise.theory, caged: ChordCruise.caged,
                parseChordSymbol: CruiseStudio.theory.parseBasicChordSymbol, ownerVersion: '1.21.0' });
            const ownerBefore = JSON.stringify(ChordCruise.caged.FORMS), tuningMidi = [64, 59, 55, 50, 45, 40];
            const results = ['C', 'C6', 'C/E', 'D', 'Cadd9', 'F', 'Dm7'].map(symbol => a.resolve({ symbol, capo: symbol === 'D' ? 2 : 0,
                tuningMidi, maxAbsoluteFret: 24, playedStrings: symbol === 'F' ? [1, 2, 3, 4, 5, 6] : symbol === 'Dm7' ? [1, 2, 3, 4] : [1, 2, 3, 4, 5] }));
            const invalid = createChordFormAdapter({ chordTheory: ChordCruise.theory, caged: { ...ChordCruise.caged,
                detectBarres: () => [{ finger: 1, fret: 1, fromString: 6, toString: 1 }] },
                parseChordSymbol: CruiseStudio.theory.parseBasicChordSymbol, ownerVersion: '1.21.0' });
            const invalidBarre = invalid.resolve({ symbol: 'F', capo: 0, tuningMidi, maxAbsoluteFret: 24, playedStrings: [1, 2, 3, 4, 5, 6] });
            const voicingCases = [
                { symbol: 'C/E', capo: 0, playedStrings: [1, 2, 3, 4], midi: [52, 55, 60, 64], pcs: [0, 4, 7], bass: 52 },
                { symbol: 'C/G', capo: 0, playedStrings: [1, 2, 3], midi: [55, 60, 64], pcs: [0, 4, 7], bass: 55 },
                { symbol: 'D/F#', capo: 2, playedStrings: [1, 2, 3, 4], midi: [54, 57, 62, 66], pcs: [2, 6, 9], bass: 54 }
            ];
            const voicings = voicingCases.map(input => ({ input, result: a.resolve({ ...input, tuningMidi, maxAbsoluteFret: 24 }) }));
            const rejects = [
                { symbol: 'C/E', playedStrings: null }, { symbol: 'C/E', playedStrings: [1, 2, 3, 4, 5] },
                { symbol: 'C/G', playedStrings: [1, 2] }, { symbol: 'Am7/G', playedStrings: [1, 2, 3] },
                { symbol: 'C/E', playedStrings: [1, 2, 3, 4], generation: { minRelativeFret: 0, maxRelativeFret: 2 } }
            ].map(input => a.resolve({ ...input, capo: 0, tuningMidi, maxAbsoluteFret: 24 }));
            const warningCases = [
                { string: 5, global: false }, { string: 4, global: false }, { string: 5, global: true }
            ].map(input => {
                const adapter = createChordFormAdapter({ chordTheory: ChordCruise.theory, caged: { ...ChordCruise.caged,
                    getForm(...args) { const r = ChordCruise.caged.getForm(...args); r.notes.find(n => n.string === input.string).fingeringWarning = true;
                        if (input.global) r.warning = 'Unscoped owner warning'; return r; } },
                    parseChordSymbol: CruiseStudio.theory.parseBasicChordSymbol, ownerVersion: '1.21.0' });
                return adapter.resolve({ symbol: 'C/E', capo: 0, tuningMidi, maxAbsoluteFret: 24, playedStrings: [1, 2, 3, 4] });
            });
            const after = JSON.stringify({ storage: { ...localStorage }, draft: CruiseStudio.sheetCruise.getSession().workingSnapshot(),
                base: CruiseStudio.sheetCruise.getSession().baseSnapshot, revision: CruiseStudio.sheetCruise.getSession().baseRevision,
                history: CruiseStudio.sheetCruise.getSession().getHistory(), dirty: CruiseStudio.sheetCruise.getSession().dirty });
            return { results, invalidBarre, voicings, rejects, warningCases, adapterVersion: CHORD_FORM_ADAPTER_VERSION,
                unchanged: after === __adapterBefore, ownerUnchanged: ownerBefore === JSON.stringify(ChordCruise.caged.FORMS),
                audit: __adapterAudit, databases: await indexedDB.databases(), schema: CruiseStudio.sheetCruise.getSession().draft.schemaVersion };
        });
        await t.test('display, complete voicing, sixth/slash unresolved and capo use owner result', () => {
            assert(report.results[0].performance.voicingUsable);
            for (const i of [1, 2]) { assert(report.results[i].display.possible); assert(!report.results[i].performance.voicingUsable); }
            assert(report.results[3].performance.voicingUsable); assert.equal(report.results[3].request.formRootPc, 0);
            assert(!report.results[4].display.possible);
        });
        await t.test('P2-2 rejects invalid owner barre, keeps normal and open-string mini barre', () => {
            for (const i of [5, 6]) { assert(report.results[i].performance.voicingUsable); assert(report.results[i].form.barres.length > 0); }
            assert(!report.invalidBarre.display.possible); assert.equal(report.invalidBarre.form, null);
            assert.deepEqual(report.invalidBarre.display.reasons, ['invalid-owner-barres']);
        });
        await t.test('P2-1 three explicit slash voicings match independent MIDI/tones/bass while full form remains incomplete', () => {
            assert.equal(report.adapterVersion, '2');
            for (const { input, result: r } of report.voicings) {
                assert(r.display.possible && !r.completeness.complete && r.performance.voicingUsable);
                const played = r.form.notes.filter(n => input.playedStrings.includes(n.string));
                assert.deepEqual(played.map(n => n.soundingMidi).sort((a, b) => a - b), input.midi);
                assert.deepEqual([...new Set(played.map(n => n.pitchClass))].sort((a, b) => a - b), input.pcs);
                assert.equal(Math.min(...played.map(n => n.soundingMidi)), input.bass);
                assert.deepEqual(r.completeness.reasons, ['slash-bass-unresolved']); assert.deepEqual(r.performance.reasons, []);
                assert.equal(r.provenance.adoption, 'unconfirmed'); assert.equal(r.performance.scope, 'voicing-only');
            }
        });
        await t.test('P2-1 missing/invalid played strings, missing tones and owner partial form remain rejected', () => {
            assert.equal(report.rejects.length, 5); for (const r of report.rejects) assert(!r.performance.voicingUsable);
        });
        await t.test('P2-1 unused note warning is retained; used note and unscoped owner warnings still block', () => {
            assert(report.warningCases[0].performance.voicingUsable);
            assert(report.warningCases[0].form.notes.find(n => n.string === 5).fingeringWarning);
            for (const r of report.warningCases.slice(1)) { assert(!r.performance.voicingUsable); assert(r.performance.reasons.includes('playability-unconfirmed')); }
        });
        await t.test('dirty draft, base, revision, Undo/Redo, all raw storage and owner data unchanged', () => {
            assert(report.unchanged); assert(report.ownerUnchanged); assert.equal(report.schema, 2);
            assert.deepEqual(report.audit, { writes: [], db: [], network: [] }); assert.deepEqual(report.databases, []);
        });
        await t.test('no console, missing assets or forbidden requests', () => {
            assert.deepEqual(errors, []); assert.deepEqual(missing, []); assert.deepEqual(forbidden, []);
        });
        if (process.env.STAFF_QA_DIR) fs.writeFileSync(path.join(process.env.STAFF_QA_DIR, 'chord-adapter-browser.json'), JSON.stringify({ ...report, errors, missing, forbidden }, null, 2));
    } finally { await context.close(); await browser.close(); }
});
