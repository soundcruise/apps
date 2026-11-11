/* Synthetic editor integration only. No real credential, user profile or backend.
   The real localhost development entry keeps its unmodified Pro gate. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium,webkit} = require('playwright');
const root = path.resolve(__dirname, '../../..');
const studio = path.join(root, 'apps/cruise-studio');
const origin = 'https://score-phase1.fixture.invalid';
const output = process.env.STUDIO_SCORE_QA_OUT;
const snapshot = page => page.evaluate(() => CruiseStudio.sheetCruise.getSession().workingSnapshot());
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

test('Phase 1 score editor in an isolated synthetic browser', async t => {
    const {renderDevelopmentEntry} = await import(pathToFileURL(path.join(studio, 'scripts/generate-development-entry.mjs')));
    const entry = renderDevelopmentEntry(fs.readFileSync(path.join(studio, 'studio-template.html'), 'utf8'));
    const browser = await (process.env.SCORE_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}));
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
                    ${fs.readFileSync(path.join(studio,'scripts/local-ui-adapter.js'),'utf8').split('// Local integration of B')[1] ? '// Local integration of B'+fs.readFileSync(path.join(studio,'scripts/local-ui-adapter.js'),'utf8').split('// Local integration of B')[1].replaceAll('C.sheetCruise','CruiseStudio.sheetCruise').replaceAll('C.shellHost','CruiseStudio.shellHost') : ''}

                `});
            if(process.env.SCORE_SOURCE_REF && pathname==='/apps/cruise-studio/js/modules/sheet-cruise/sheet-cruise.js') return route.fulfill({contentType:'text/javascript',body:require('node:child_process').execFileSync('git',['show',process.env.SCORE_SOURCE_REF+':apps/cruise-studio/js/modules/sheet-cruise/sheet-cruise.js'],{cwd:root})});
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
            // Use the initial fresh draft.
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
        await t.test('new projects are unique, active, focused and drafts survive cancellation and switching',()=>fresh(async page=>{
            const first=await snapshot(page);assert.equal(first.songInfo.title,'無題のプロジェクト 1');
            for(const n of [2,3]){
                await page.locator('#sc-new-project').click();await page.getByRole('button',{name:'キャンセル',exact:true}).click();assert.equal((await snapshot(page)).songInfo.title,'無題のプロジェクト '+(n-1));
                await page.locator('#sc-new-project').click();await page.getByRole('button',{name:'保存せず続行',exact:true}).click();
                const p=await snapshot(page);assert.equal(p.songInfo.title,'無題のプロジェクト '+n);assert.notEqual(p.projectId,first.projectId);
                assert.equal(await page.evaluate(()=>document.activeElement.id),'sc-title');assert.equal(await page.locator('#sc-title').inputValue(),p.songInfo.title);assert(await page.locator('#sc-slot-overlay').evaluate(e=>e.classList.contains('hidden')));
            }
            await page.locator('#sc-project-select').selectOption(first.projectId);assert.match(await page.getByRole('dialog',{name:'未保存の変更を確認'}).innerText(),/プロジェクト 1.*プロジェクト 2.*プロジェクト 3/);
            await page.getByRole('button',{name:'保存して続行',exact:true}).click();await page.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().target.projectId===id,first.projectId);assert.equal((await snapshot(page)).projectId,first.projectId);
            assert.equal(await page.evaluate(()=>CruiseStudio.sessions.listSessions().filter(s=>s.dirty).length),0);
        }));
        await t.test('Enter moves same row only after valid input; IME and final bar do not advance',()=>fresh(async page=>{
            await select(page);await page.locator('[data-overlay-field=chord]').fill('C');await page.locator('[data-overlay-field=chord]').press('Enter');
            assert.match(await page.locator('[data-overlay-field=chord]').getAttribute('aria-label'),/2小節/);
            await page.locator('[data-overlay-field=doremi]').fill('ド レ');await page.locator('[data-overlay-field=doremi]').press('Enter');assert.match(await page.locator('[data-overlay-field=doremi]').getAttribute('aria-label'),/3小節/);
            await page.locator('[data-overlay-field=chord]').fill('invalid');await page.locator('[data-overlay-field=chord]').press('Enter');assert.match(await page.locator('[data-overlay-field=chord]').getAttribute('aria-label'),/3小節/);
            await page.locator('[data-overlay-field=chord]').evaluate(e=>{e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));});assert.match(await page.locator('[data-overlay-field=chord]').getAttribute('aria-label'),/3小節/);
            const count=(await snapshot(page)).bars.length;await page.locator('.sheet-bar').last().focus();await page.keyboard.press('Enter');await page.locator('[data-overlay-field=chord]').fill('G');await page.locator('[data-overlay-field=chord]').press('Enter');assert.equal((await snapshot(page)).bars.length,count);
        }));
        await t.test('duplicate publication renders canonical source and destination, Undo/Redo and save/JSON/reload agree',()=>fresh(async page=>{
            await select(page);await page.locator('[data-overlay-field=chord]').fill('C');await page.locator('.dock-lyrics-cell').first().fill('夜');await page.locator('[data-overlay-field=doremi]').fill('ド レ');await page.locator('[data-overlay-field=doremi]').press('Tab');await page.locator('.dock-strum-cell').first().click();
            const before=await snapshot(page);await page.locator('[data-bar-operation=duplicateBar]').click();const after=await snapshot(page);
            assert.notEqual(after.bars[0].id,after.bars[1].id);assert.deepEqual(after.bars[0],before.bars[0]);assert.equal(after.bars[1].chords[0].symbol,'C');
            assert.equal(await page.locator('.sheet-bar[data-bar-number="2"] .sheet-bar-chord').innerText(),'C');assert.equal(await page.locator('[data-overlay-field=chord]').inputValue(),'C');assert.match(await page.locator('.sheet-bar[data-bar-number="2"]').innerText(),/夜/);
            assert.deepEqual(after.bars[1].melody.map(e=>e.provenance),before.bars[0].melody.map(e=>e.provenance));assert(after.performance.barRhythms.some(r=>r.barId===after.bars[1].id));
            await page.locator('[data-overlay-field=chord]').fill('Dm7');await page.locator('[data-overlay-field=chord]').press('Tab');assert.equal((await snapshot(page)).bars[0].chords[0].symbol,'C');await page.locator('#sc-undo').click();assert.deepEqual(await snapshot(page),after);await page.locator('#sc-undo').click();assert.deepEqual(await snapshot(page),before);await page.locator('#sc-redo').click();assert.deepEqual(await snapshot(page),after);
            await page.locator('#sc-save').click();await page.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);const saved=await snapshot(page);
            const d=page.waitForEvent('download');await page.locator('#sc-export-json').click();assert.deepEqual(JSON.parse(fs.readFileSync(await(await d).path(),'utf8')),saved);
            await page.reload();await page.locator('#open-sheet-cruise').click();assert.deepEqual(await snapshot(page),saved);assert.equal(await page.locator('.sheet-bar[data-bar-number="2"] .sheet-bar-chord').innerText(),'C');
        }));
        await t.test('save failure never continues or discards draft; repeated request cannot duplicate modal',()=>fresh(async page=>{
            const before=await snapshot(page);await page.locator('#sc-new-project').click();await page.evaluate(()=>{CruiseStudio.sheetCruise.requestLeave(()=>{throw Error('duplicate continuation')});const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='cruiseStudio.projects.index')throw Error('synthetic quota');return original.call(this,k,v)};});
            assert.equal(await page.getByRole('dialog',{name:'未保存の変更を確認'}).count(),1);await page.getByRole('button',{name:'保存して続行',exact:true}).click();await page.getByText(/移動せずdraftを保持しています/).waitFor();assert.deepEqual(await snapshot(page),before);await page.getByRole('button',{name:'キャンセル',exact:true}).click();
        }));
        await t.test('pending input, external conflict and UNKNOWN block continuations',async()=>{
            await fresh(async page=>{
                const before=await snapshot(page);await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().setInputPending(true));await page.locator('#sc-new-project').click();assert.equal(await page.getByRole('dialog',{name:'未保存の変更を確認'}).count(),0);assert.deepEqual(await snapshot(page),before);
                await page.evaluate(async()=>{const C=CruiseStudio,s=C.sheetCruise.getSession();s.setInputPending(false);const p=JSON.parse(JSON.stringify(s.workingSnapshot()));p.songInfo.title='External original';await C.repository.save({target:s.target,snapshot:p,baseRevision:s.baseRevision});});
                await page.locator('#sc-new-project').click();assert.equal(await page.getByRole('dialog',{name:'未保存の変更を確認'}).count(),0);assert.deepEqual(await snapshot(page),before);
            });
            await fresh(async page=>{
                const before=await snapshot(page);await page.locator('#sc-new-project').click();await page.evaluate(()=>{Storage.prototype.setItem=function(){throw Error('synthetic failure')};Storage.prototype.removeItem=function(){throw Error('synthetic rollback failure')};});await page.getByRole('button',{name:'保存して続行',exact:true}).click();await page.getByText(/移動せずdraftを保持しています/).waitFor();assert.deepEqual(await snapshot(page),before);await page.getByRole('button',{name:'保存せず続行',exact:true}).click();assert.equal(await page.getByRole('dialog',{name:'未保存の変更を確認'}).count(),1);
            });
        });
        await t.test('local Shell home/back navigation asks first and preserves drafts',()=>fresh(async page=>{
            const before=await snapshot(page);await page.locator('#screen-sheet-cruise .workspace-home').click();await page.getByRole('button',{name:'キャンセル',exact:true}).click();assert.deepEqual(await snapshot(page),before);
            await page.locator('#screen-sheet-cruise .workspace-home').click();await page.getByRole('button',{name:'保存せず続行',exact:true}).click();assert.equal(await page.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),'home');
            await page.locator('#open-sheet-cruise').click();if(await page.getByRole('button',{name:'保存せず続行',exact:true}).count())await page.getByRole('button',{name:'保存せず続行',exact:true}).click();assert.deepEqual(await snapshot(page),before);
            await page.locator('.studio-nav [data-workspace=preDtm]').click();await page.getByRole('button',{name:'保存せず続行',exact:true}).click();await page.locator('#screen-pre-dtm .workspace-back').click();await page.getByRole('button',{name:'キャンセル',exact:true}).click();assert.deepEqual(await snapshot(page),before);
        }));
        await t.test('no external requests or runtime errors',()=>{assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.deepEqual(missing,[])});
    } finally { await browser.close(); }
});
