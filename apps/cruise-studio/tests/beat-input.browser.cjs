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
        await t.test('Enter advances by an eighth slot, then the next bar at the row end',()=>fresh(async page=>{
            await select(page);
            for(const kind of ['chord','doremi']){
                const cells=page.locator('[data-overlay-field='+kind+']');assert.equal(await cells.count(),8);
                await cells.nth(0).fill(kind==='chord'?'C':'ド');await cells.nth(0).press('Enter');
                assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'240');
                await cells.nth(1).fill(kind==='chord'?'G':'レ');await cells.nth(1).press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'480');
                await cells.last().press('Enter');await settle(page);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[2]);assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'0');await select(page);
            }
            const lyric=page.locator('.dock-lyrics-cell');await lyric.first().fill('夜');await lyric.first().press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'240');await lyric.last().press('Enter');await settle(page);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[2]);await select(page);
            const strokes=page.locator('.dock-strum-cell');await strokes.first().click();await settle(page);await strokes.first().press('Enter');await settle(page);assert.equal(await page.evaluate(()=>document.activeElement.dataset.cellIndex),'1');
            const song=await snapshot(page);assert.deepEqual(song.bars[0].chords.map(e=>e.onsetTick),[0,240]);assert.deepEqual(song.bars[0].melody.map(e=>e.onsetTick),[0,240]);assert(song.bars[0].melody.every(e=>!e.provenance.timing.duration.confirmed));
            assert.equal(await page.locator('.sheet-bar[data-bar-number="1"] .sheet-chord-event').count(),2);
            if(process.env.SCORE_DIALOG_SCREENSHOTS)await page.screenshot({path:process.env.SCORE_DIALOG_SCREENSHOTS+'/beat-editor.png'});
        }));
        await t.test('Right and Tab move within each row; Shift Tab and Left move back',()=>fresh(async page=>{
            await select(page);
            for(const selector of ['[data-overlay-field=chord]','[data-overlay-field=doremi]','.dock-lyrics-cell']){
                const fields=page.locator(selector);await fields.first().focus();await fields.first().press('ArrowRight');await settle(page);assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'240');
                await page.keyboard.press('Tab');await settle(page);assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'480');await page.keyboard.press('Shift+Tab');await settle(page);assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'240');await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'0');
                await fields.last().press('Tab');await settle(page);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[2]);await select(page);
            }
            await page.locator('.dock-strum-cell').first().focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Tab');await settle(page);assert.equal(await page.evaluate(()=>document.activeElement.dataset.cellIndex),'2');await page.keyboard.press('Shift+Tab');await settle(page);assert.equal(await page.evaluate(()=>document.activeElement.dataset.cellIndex),'1');
        }));
        await t.test('Doremi stays grouped in one cell; navigation and persistence preserve neighbouring notes',()=>fresh(async page=>{
            await select(page);const before=await snapshot(page);let cells=page.locator('[data-overlay-field=doremi]');await cells.first().fill('ドレミ');assert.equal(await cells.first().getAttribute('aria-invalid'),'false');await cells.first().press('Enter');await settle(page);
            assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'240');assert.equal(await cells.first().inputValue(),'ドレミ');assert.deepEqual((await snapshot(page)).bars[0].melody.map(e=>e.onsetTick),[0,80,160]);assert((await snapshot(page)).bars[0].melody.every(e=>!e.provenance.timing.duration.confirmed));
            await cells.nth(1).fill('ファ');assert.equal(await cells.nth(1).getAttribute('aria-invalid'),'false',await cells.nth(1).getAttribute('title'));await cells.nth(1).press('Tab');await settle(page);assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'480');const neighbour=(await snapshot(page)).bars[0].melody.at(-1);
            await cells.first().fill('ソラ');await cells.first().press('ArrowRight');await settle(page);assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'0');assert.equal(await page.locator('.piano-selected-note').getAttribute('data-piano-event'),(await snapshot(page)).bars[0].melody[1].id);await cells.first().press('ArrowRight');await settle(page);assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'240');assert.deepEqual((await snapshot(page)).bars[0].melody.at(-1),neighbour);assert.equal(await cells.first().inputValue(),'ソラ');
            const changed=await snapshot(page);await page.locator('#sc-undo').click();await page.locator('#sc-redo').click();assert.deepEqual(await snapshot(page),changed);
            await page.locator('#sc-save').click();await page.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);const saved=await snapshot(page);await page.reload();await page.locator('#open-sheet-cruise').click();assert.deepEqual(await snapshot(page),saved);await select(page);assert.equal(await page.locator('[data-overlay-field=doremi]').first().inputValue(),'ソラ');
        }));
        await t.test('save/reload/JSON and Undo retain beat timing and IDs',()=>fresh(async page=>{
            await select(page);const chords=page.locator('[data-overlay-field=chord]');await chords.first().fill('C');await chords.first().press('Enter');const before=await snapshot(page);await chords.nth(1).fill('G');await chords.nth(1).press('Tab');const after=await snapshot(page);
            await page.locator('#sc-undo').click();assert.deepEqual(await snapshot(page),before);await page.locator('#sc-redo').click();assert.deepEqual(await snapshot(page),after);
            await page.locator('#sc-save').click();await page.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);const saved=await snapshot(page);const d=page.waitForEvent('download');await page.locator('#sc-export-json').click();assert.deepEqual(JSON.parse(fs.readFileSync(await(await d).path(),'utf8')),saved);await page.reload();await page.locator('#open-sheet-cruise').click();assert.deepEqual(await snapshot(page),saved);
        }));
        await t.test('IME confirmation does not navigate and invalid notes stay in place',()=>fresh(async page=>{
            await select(page);const field=page.locator('[data-overlay-field=doremi]').first();await field.evaluate(e=>{e.focus();e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));e.value='ド';e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'0');
            await field.fill('invalid');await field.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'0');assert.equal((await snapshot(page)).bars[0].melody.length,1);
        }));
        await t.test('existing timing, rests, IDs and sixteen-slot navigation are protected',()=>fresh(async page=>{
            await page.evaluate(()=>{const C=CruiseStudio,s=C.sheetCruise.getSession();s.runOperation('synthetic exact timing',p=>{p.bars[0].melody=[{id:crypto.randomUUID(),kind:'note',onsetTick:0,durationTicks:480,pitch:{step:'C',alter:0,octave:4},provenance:C.model.schema2.timing('user-set',false)},{id:crypto.randomUUID(),kind:'rest',onsetTick:600,durationTicks:120,provenance:C.model.schema2.timing('user-set',false)}];p.bars[0].chords=[{id:crypto.randomUUID(),onsetTick:0,durationTicks:1920,symbol:'C',unresolved:false,provenance:{origin:'user-set'}}];});});
            await select(page);const before=await snapshot(page),notes=page.locator('[data-overlay-field=doremi]');await notes.first().fill('レ');const edited=await snapshot(page);assert.equal(edited.bars[0].melody[0].id,before.bars[0].melody[0].id);assert.equal(edited.bars[0].melody[0].durationTicks,480);assert.deepEqual(edited.bars[0].melody[0].provenance,before.bars[0].melody[0].provenance);assert.deepEqual(edited.bars[0].melody[1],before.bars[0].melody[1]);
            const chords=page.locator('[data-overlay-field=chord]');await chords.nth(1).fill('G');await chords.nth(1).press('Tab');assert.equal((await snapshot(page)).bars[0].chords[0].durationTicks,240);await page.locator('#sc-undo').click();assert.equal((await snapshot(page)).bars[0].chords[0].durationTicks,1920);
            await select(page);await page.getByRole('button',{name:'16分',exact:true}).click();const cells=page.locator('[data-overlay-field=chord]');assert.equal(await cells.count(),16);await cells.first().press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'120');
        }));
        await t.test('dialog has breathing room and readable actions at 390 and 1440',()=>fresh(async page=>{
            await page.locator('#sc-new-project').click();const d=page.getByRole('dialog',{name:'未保存の変更を確認'});
            for(const width of [390,1440]){await page.setViewportSize({width,height:900});await settle(page);const sizes=await d.evaluate(e=>{const p=e.querySelector('p').getBoundingClientRect(),buttons=[...e.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}});return {gap:Math.min(...buttons.map(b=>b.y))-p.bottom,buttons,width:e.clientWidth,scroll:e.scrollWidth}});assert(sizes.gap>=24);assert(sizes.scroll<=sizes.width+1);for(let i=0;i<2;i++){const a=sizes.buttons[i],b=sizes.buttons[i+1];assert(a.right+12<=b.x||a.bottom+12<=b.y);}if(process.env.SCORE_DIALOG_SCREENSHOTS)await page.screenshot({path:process.env.SCORE_DIALOG_SCREENSHOTS+'/beat-dialog-'+width+'.png'});}
        }));
        await t.test('runtime and external requests remain clean',()=>{assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.deepEqual(missing,[])});
    }finally{await browser.close();}
});
