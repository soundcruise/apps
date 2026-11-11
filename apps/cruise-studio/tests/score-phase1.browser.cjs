/* Synthetic editor integration only. No real credential, user profile or backend.
   The real localhost development entry keeps its unmodified Pro gate. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../..');
const studio = path.join(root, 'apps/cruise-studio');
const origin = 'https://score-phase1.fixture.invalid';
const output = process.env.STUDIO_SCORE_QA_OUT;
const snapshot = page => page.evaluate(() => CruiseStudio.sheetCruise.getSession().workingSnapshot());
const retainDrafts = async page => {const b=page.getByRole('button',{name:'保存せず続行',exact:true});if(await b.count())await b.click();};
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

test('Phase 1 score editor in an isolated synthetic browser', async t => {
    const {renderDevelopmentEntry} = await import(pathToFileURL(path.join(studio, 'scripts/generate-development-entry.mjs')));
    const entry = renderDevelopmentEntry(fs.readFileSync(path.join(studio, 'studio-template.html'), 'utf8'));
    const browser = await chromium.launch({headless: true,
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    const errors = [], missing = [], blocked = [];
    if (output) fs.mkdirSync(output, {recursive: true});
    async function fresh(fn) {
        const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.origin !== origin) {
                if (url.hostname === 'fonts.googleapis.com') return route.fulfill({contentType: 'text/css', body: ''});
                blocked.push(url.origin + url.pathname);
                return route.abort();
            }
            const pathname = url.pathname;
            if (pathname === '/') return route.fulfill({contentType: 'text/html', body: entry});
            // Explicit fixture dependency injection, served ONLY at the reserved .invalid origin.
            if (pathname === '/apps/shared/pro-gate.js' ||
                pathname === '/apps/cruise-studio/js/port-sync-status.mjs' ||
                pathname === '/apps/cruise-studio/js/cloud/canary-entry.mjs')
                return route.fulfill({contentType: 'text/javascript', body: '/* isolated editor fixture */'});
            if (pathname === '/apps/cruise-studio/js/core/studio-entry.mjs')
                return route.fulfill({contentType: 'text/javascript', body: `
                    CruiseStudio.entryAuth = Object.freeze({isAuthorized: () => true, check: async () => true,
                        read: () => ({phase: 'ready', accountId: null})});
                    document.getElementById('studio-shell').inert = false;
                    document.documentElement.dataset.studioEntry = 'ready';
                `});
            const file = path.resolve(root, '.' + decodeURIComponent(pathname));
            if (!file.startsWith(root + path.sep)) return route.abort();
            try {
                const contentType = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
                    '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png'}[path.extname(file)] || 'application/octet-stream';
                return route.fulfill({contentType, body: fs.readFileSync(file)});
            } catch {
                missing.push(pathname);
                return route.fulfill({status: 404, body: 'missing fixture asset'});
            }
        });
        const page = await context.newPage();
        page.setDefaultTimeout(5000);
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        try {
            await page.goto(origin + '/');
            await page.locator('#open-sheet-cruise').click();
            await page.locator('#sc-new-project').click();await retainDrafts(page);
            await settle(page);
            await fn(page, context);
        } finally { await context.close(); }
    }
    async function select(page) {
        await page.locator('#sc-editor-drawer').evaluate(e => e.open = false);
        await page.locator('.sheet-bar').first().focus();
        await page.keyboard.press('Enter');
        await settle(page);
    }
    async function timedChord(page, multiple = false) {
        await page.evaluate(multiple => {
            const C = CruiseStudio, s = C.sheetCruise.getSession();
            const result = s.runOperation('Synthetic chord timing fixture', p => {
                const make = (symbol, onsetTick) => ({id: crypto.randomUUID(), symbol, onsetTick,
                    durationTicks: 480, unresolved: false, provenance: {origin: 'user-set'}});
                p.bars[0].chords = [make('C', 480)];
                if (multiple) p.bars[0].chords.push(make('G', 1440));
            });
            if (!result.ok) throw Error(result.error);
        }, multiple);
        await select(page);
    }
    try {
        await t.test('pointer can apply bulk input outside the Loupe, including narrow screens', async () => fresh(async page => {
            for (const width of [1440, 768, 390]) {
                await page.setViewportSize({width, height: 900});
                await select(page);
                await page.getByRole('button', {name: 'まとめて入力', exact: true}).click();
                await page.locator('.slot-overlay-bulk-text').fill('C G Am F');
                await settle(page);
                const apply = page.locator('.slot-overlay-bulk-apply');
                const hit = await apply.evaluate(e => {
                    const r = e.getBoundingClientRect(), n = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                    return !!n && (n === e || e.contains(n));
                });
                if (output) await page.screenshot({path: path.join(output, 'bulk-' + width + '.png')});
                assert(hit, width + 'px Apply button is clipped or covered');
                await apply.click(); // No forced click or keyboard substitute.
                assert.deepEqual((await snapshot(page)).bars.slice(0, 4).map(b => b.chords[0].symbol), ['C', 'G', 'Am', 'F']);
                await page.locator('.slot-overlay-bulk-close').click();
            }
        }));
        await t.test('chord input, Undo/Redo, local save/reload and JSON retain exact timing', async () => fresh(async page => {
            await timedChord(page);
            const before = (await snapshot(page)).bars[0].chords[0];
            await page.locator('[data-overlay-field=chord]').fill('Dm7');
            await page.locator('[data-overlay-field=chord]').press('Tab');
            const edited = (await snapshot(page)).bars[0].chords[0];
            assert.equal(edited.symbol, 'Dm7');
            for (const field of ['id', 'onsetTick', 'durationTicks']) assert.equal(edited[field], before[field]);
            await page.locator('#sc-undo').click();
            assert.deepEqual((await snapshot(page)).bars[0].chords[0], before);
            await page.locator('#sc-redo').click();
            await page.locator('#sc-save').click();
            await page.waitForFunction(() => !CruiseStudio.sheetCruise.getSession().dirty && !CruiseStudio.sheetCruise.getSession().commitInFlight);
            const saved = await snapshot(page);
            const download = page.waitForEvent('download');
            await page.locator('#sc-export-json').click();
            const file = JSON.parse(fs.readFileSync(await (await download).path(), 'utf8'));
            assert.deepEqual(file, saved);
            await page.reload();
            await page.locator('#open-sheet-cruise').click();
            assert.deepEqual(await snapshot(page), saved);
            await page.locator('#sc-import-json').setInputFiles({name: 'original.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file))});
            await page.waitForFunction(() => document.getElementById('sc-save-status').textContent.includes('読み込'));
            assert.deepEqual(await snapshot(page), saved);
        }));
        await t.test('multi-chord text input and bulk replacement preserve the complete draft', async () => fresh(async page => {
            await timedChord(page, true);
            const before = await snapshot(page);
            await page.locator('[data-overlay-field=chord]').fill('Dm7');
            assert.deepEqual(await snapshot(page), before);
            assert.match(await page.locator('#sc-save-status').innerText(), /複数コード/);
            await page.getByRole('button', {name: 'まとめて入力', exact: true}).click();
            await page.locator('.slot-overlay-bulk-text').fill('F Am');
            await page.locator('.slot-overlay-bulk-apply').click();
            assert.deepEqual(await snapshot(page), before);
            assert.match(await page.locator('#sc-save-status').innerText(), /複数コード/);
        }));
        await t.test('project switching, sections, bars, lyrics and strum share one working Project', async () => fresh(async page => {
            await page.locator('#sc-editor-drawer').evaluate(e => e.open = true);
            await page.locator('#sc-title').fill('Original A');
            await page.locator('#sc-artist').fill('Synthetic author');
            await page.locator('#sc-bpm').fill('106');
            await page.locator('#sc-bpm').press('Tab');
            assert(await page.locator('#sc-play-key').isDisabled());
            assert(await page.locator('#sc-capo').isDisabled());
            const sectionCount = (await snapshot(page)).sections.length;
            await page.locator('#sc-add-section').click();
            assert.equal((await snapshot(page)).sections.length, sectionCount + 1);
            await page.locator('.section-name-input').last().fill('Aメロ');
            await page.locator('.section-name-input').last().press('Tab');
            assert.equal((await snapshot(page)).sections.at(-1).name, 'Aメロ');
            await select(page);
            await page.locator('[data-overlay-field=chord]').fill('C');
            await page.locator('.dock-lyrics-cell').first().fill('夜');
            await page.locator('[data-overlay-field=doremi]').fill('ド レ ミ');
            await page.locator('[data-overlay-field=doremi]').press('Tab');
            await page.locator('.dock-strum-cell').first().click();
            const a = await snapshot(page);
            assert.equal(a.songInfo.bpm, 106);
            assert(a.bars[0].lyrics.length && a.bars[0].melody.length && a.performance.barRhythms.length);
            await page.locator('[data-bar-operation=duplicateBar]').click();
            assert.equal((await snapshot(page)).bars.length, a.bars.length + 1);
            await page.locator('#sc-undo').click();
            assert.deepEqual(await snapshot(page), a);
            await page.locator('#sc-new-project').click();await retainDrafts(page);
            const b = await snapshot(page);
            assert.notEqual(a.projectId, b.projectId);
            await page.locator('#sc-project-select').selectOption(a.projectId);await retainDrafts(page);
            assert.deepEqual(await snapshot(page), a);
            await page.locator('#sc-project-select').selectOption(b.projectId);await retainDrafts(page);
            assert.deepEqual(await snapshot(page), b);
            await page.locator('#sc-project-select').selectOption(a.projectId);await retainDrafts(page);
            await page.locator('#sc-goto-pre-dtm').click();await retainDrafts(page);
            assert(await page.locator('#pd-content').isVisible());
            const download = page.waitForEvent('download');
            await page.locator('#pd-export-json').click();
            const arrangement = JSON.parse(fs.readFileSync(await (await download).path(), 'utf8'));
            assert.equal(arrangement.projectId, a.projectId);
            assert(arrangement.generatedEvents.bass.length && arrangement.generatedEvents.drums.length);
            await page.locator('#pd-goto-sheet').click();
            assert.deepEqual(await snapshot(page), a);
        }));
        await t.test('confirmed chord form adoption and MIDI use the same canonical Project', async () => fresh(async page => {
            await select(page);
            await page.locator('[data-overlay-field=chord]').fill('C');
            await page.locator('[data-overlay-field=chord]').press('Tab');
            await page.locator('#sc-chord-forms').click();
            await page.locator('#form-event').selectOption({index: 1});
            await page.locator('#form-open').click();
            await page.locator('#form-instrument').check();
            await page.locator('#form-max-fret').fill('24');
            await page.locator('#form-preview').click();
            assert((await page.locator('#form-position option').count()) > 1);
            for (const n of [1, 2, 3, 4, 5]) await page.locator('[data-form-string="' + n + '"]').check();
            await page.locator('#form-adopt').click();
            await page.waitForFunction(() => CruiseStudio.sheetCruise.getSession().draft.performance.formBindings.length === 1);
            const voiced = await page.evaluate(() => CruiseStudio.arrangement.generateArrangement(CruiseStudio.documents.getSession().workingSnapshot()).bars[0].guitarNotes);
            assert.deepEqual([...new Set(voiced.map(n => n.midi))].sort((a,b) => a-b), [48, 52, 55, 60, 64]);
            await page.locator('#sc-undo').click();
            assert.equal((await snapshot(page)).performance.formBindings.length, 0);
            await page.locator('#sc-redo').click();
            assert.equal((await snapshot(page)).performance.formBindings.length, 1);
            await page.locator('#sc-chord-forms').click();
            await page.locator('#sc-goto-pre-dtm').click();await retainDrafts(page);
            const download = page.waitForEvent('download');
            await page.locator('#pd-export-midi').click();
            const midi = fs.readFileSync(await (await download).path());
            assert.equal(midi.subarray(0, 4).toString(), 'MThd');
            assert(midi.includes(Buffer.from('Guitar')));
        }));
        await t.test('melody Inspector edits exact durations and rests without moving following notes', async () => fresh(async page => {
            await select(page);
            await page.locator('[data-overlay-field=doremi]').fill('ド レ ミ');
            await page.locator('[data-overlay-field=doremi]').press('Tab');
            const before = await snapshot(page), event = before.bars[0].melody[0];
            assert.equal(event.provenance.timing.duration.confirmed, false);
            await page.locator('#sc-score-style').selectOption('melody');
            await page.locator('#sc-staff-refresh').click();
            await page.locator('[data-melody-target][data-event-id="' + event.id + '"]').first().click();
            await page.locator('#sc-melody-duration').selectOption('120');
            const changed = await snapshot(page);
            assert.equal(changed.bars[0].melody[0].durationTicks, 120);
            assert.equal(changed.bars[0].melody[0].provenance.timing.duration.confirmed, true);
            assert.deepEqual(changed.bars[0].melody.slice(1), before.bars[0].melody.slice(1));
            await page.getByRole('button', {name: '休符にする', exact: true}).click();
            assert.equal((await snapshot(page)).bars[0].melody[0].kind, 'rest');
            await page.locator('#sc-undo').click();
            assert.deepEqual(await snapshot(page), changed);
        }));
        await t.test('bulk panel stays visible in five themes and four viewport widths', async () => fresh(async page => {
            await select(page);
            await page.getByRole('button', {name: 'まとめて入力', exact: true}).click();
            const before = await snapshot(page);
            for (const theme of ['dark', 'midnight', 'charcoal', 'gray', 'light']) {
                await page.evaluate(theme => CruiseStudio.colorTheme.setColorTheme(theme), theme);
                for (const width of [1440, 1024, 768, 390]) {
                    await page.setViewportSize({width, height: 900});
                    await settle(page);
                    const r = await page.locator('.slot-overlay-bulk-popover').boundingBox();
                    assert(r.x >= 7 && r.y >= 7 && r.x + r.width <= width - 7 && r.y + r.height <= 893);
                    await page.locator('.slot-overlay-bulk-kind').selectOption('doremi');
                    if (output && (width === 1440 || width === 390)) await page.screenshot({path: path.join(output, 'bulk-' + theme + '-' + width + '.png')});
                }
            }
            assert.deepEqual(await snapshot(page), before);
        }));
        await t.test('open bulk panel remains usable across resize and Escape', async () => fresh(async page => {
            await select(page);
            await page.getByRole('button', {name: 'まとめて入力', exact: true}).click();
            await page.locator('.slot-overlay-bulk-text').fill('C G Am F');
            for (const [width, height] of [[1440, 900], [390, 500], [768, 700]]) {
                await page.setViewportSize({width, height});
                await settle(page);
                const rect = await page.locator('.slot-overlay-bulk-popover').boundingBox();
                assert(rect.x >= 7 && rect.y >= 7 && rect.x + rect.width <= width - 7 && rect.y + rect.height <= height - 7);
                assert.equal(await page.locator('.slot-overlay-bulk-text').inputValue(), 'C G Am F');
            }
            await page.locator('.slot-overlay-bulk-close').click();
            await page.getByRole('button', {name: 'まとめて入力', exact: true}).click();
            await page.locator('.slot-overlay-bulk-text').press('Escape');
            assert.equal(await page.locator('.slot-overlay-bulk-popover').count(), 0);
        }));
        await t.test('print hides editing chrome and produces a PDF without changing the draft', async () => fresh(async page => {
            await page.locator('#sc-editor-drawer').evaluate(e => e.open = true);
            await page.locator('#sc-title').fill('夜の航路 Original');
            await page.locator('#sc-title').press('Tab');
            await select(page);
            await page.locator('[data-overlay-field=chord]').fill('C');
            await page.locator('.dock-lyrics-cell').first().fill('夜');
            await page.locator('[data-overlay-field=doremi]').fill('ド レ ミ');
            await page.locator('[data-overlay-field=doremi]').press('Tab');
            const before = await snapshot(page);
            assert(before.bars[0].lyrics.length && before.bars[0].melody.length);
            for (const width of [1440, 390]) {
                await page.setViewportSize({width, height: 1000});
                await page.emulateMedia({media: 'print'});
                assert.equal(await page.locator('#sc-slot-overlay').evaluate(e => getComputedStyle(e).display), 'none');
                const pdf = await page.pdf({...(output ? {path: path.join(output, 'original-' + width + '.pdf')} : {}), preferCSSPageSize: true});
                assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
                assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1);
                await page.emulateMedia({media: 'screen'});
                assert.deepEqual(await snapshot(page), before);
            }
        }));
        await t.test('no script errors, missing local assets or external requests', () => {
            assert.deepEqual(errors, []);
            assert.deepEqual(missing, []);
            assert.deepEqual(blocked, []);
        });
    } finally { await browser.close(); }
});
