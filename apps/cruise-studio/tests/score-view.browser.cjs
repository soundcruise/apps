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
async function glyphOf(cell){const arrow=cell.locator('[data-strum-arrow]');if(await arrow.count())return await arrow.getAttribute('data-strum-arrow')==='up'?'↑':'↓';const svg=cell.locator('[data-rest-ticks]');if(await svg.count()){assert((await svg.locator('path').getAttribute('d')).length>50);return await svg.getAttribute('data-rest-ticks')==='120'?'𝄿':'𝄾';}return cell.innerText();}
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
        await t.test('stroke selection is visible for pointer and Up Down x keyboard input',()=>fresh(async page=>{
            await select(page);let first=page.locator('.dock-strum-cell').first();await first.click();await settle(page);assert.notEqual(await first.evaluate(e=>getComputedStyle(e).boxShadow),'none');
            for(const [key,glyph] of [['u','↑'],['d','↓'],['x','x']]){await first.press(key);await settle(page);assert.equal(await glyphOf(first),glyph);assert.notEqual(await first.evaluate(e=>getComputedStyle(e).boxShadow),'none');}
            await first.press('ArrowRight');await settle(page);assert.equal(await page.evaluate(()=>document.activeElement.dataset.cellIndex),'1');assert.notEqual(await page.locator('.dock-strum-cell').nth(1).evaluate(e=>getComputedStyle(e).boxShadow),'none');
        }));
        await t.test('lyrics and solfege use matching centers and font metrics; paper cells center all rows',()=>fresh(async page=>{
            await select(page);await page.locator('.dock-lyrics-cell').first().fill('あい');await page.locator('[data-overlay-field=doremi]').first().fill('ドレ');await page.locator('[data-overlay-field=doremi]').first().press('Tab');await settle(page);await page.locator('[data-overlay-field=chord]').first().fill('C');await page.locator('[data-overlay-field=chord]').first().press('Tab');await settle(page);
            const before=await snapshot(page);
            for(const width of [1440,390]){
                await page.setViewportSize({width,height:900});await settle(page);
                const metrics=await page.evaluate(()=>{function m(e){const s=getComputedStyle(e),r=e.getBoundingClientRect();return {center:r.x+r.width/2,align:s.textAlign,size:s.fontSize,family:s.fontFamily,spacing:s.letterSpacing};}return {lyric:m(document.querySelector('.dock-lyrics-cell')),note:m(document.querySelector('[data-overlay-field=doremi]')),paper:[...document.querySelector('.sheet-bar').querySelectorAll('.sheet-bar-chord > span:first-child,.sheet-bar-lyrics > span:first-child,.sheet-bar-doremi > span:first-child')].map(m)};});
                assert(Math.abs(metrics.lyric.center-metrics.note.center)<2);assert.equal(metrics.note.align,'center');assert.equal(metrics.note.size,metrics.lyric.size);assert.equal(metrics.note.family,metrics.lyric.family);
                assert.equal(metrics.paper.length,3);for(const m of metrics.paper){assert.equal(m.align,'center');assert(Math.abs(m.center-metrics.paper[0].center)<1);}
                if(output)await page.screenshot({path:path.join(output,'aligned-'+width+'.png')});
            }
            assert.deepEqual(await snapshot(page),before);
        }));
        await t.test('zoom changes only screen geometry and print stays A4',()=>fresh(async page=>{
            await page.locator('#sc-editor-drawer').evaluate(e=>e.open=false);await settle(page);
            const before=await snapshot(page),history=await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory());const paper=page.locator('.sheet-page').first(),base=(await paper.boundingBox()).width;
            await page.locator('#sc-zoom-in').click();await settle(page);assert((await paper.boundingBox()).width>base*1.2);
            const viewport=page.locator('#sc-preview');assert(Math.abs((await viewport.boundingBox()).width-(await paper.boundingBox()).width)<2);
            for(let i=0;i<3;i++)await page.locator('#sc-zoom-in').click();await settle(page);
            assert(Math.abs((await viewport.boundingBox()).width-base*2)<2);
            const geometry=await viewport.evaluate(e=>{const p=e.parentElement,box=e.querySelector('.sheet-page').getBoundingClientRect(),v=e.getBoundingClientRect();p.scrollLeft=p.scrollWidth;return {inside:box.right<=v.right+1,scroll:p.scrollLeft,overflow:getComputedStyle(p).overflowX};});
            assert(geometry.inside);assert(geometry.scroll>0);assert.equal(geometry.overflow,'auto');
            await viewport.scrollIntoViewIfNeeded();if(output)await page.screenshot({path:path.join(output,'zoom-200.png')});
            await page.locator('#sc-zoom-reset').click();await page.locator('#sc-zoom-in').click();await settle(page);assert.equal(await page.locator('#sc-zoom-reset').innerText(),'125%');
            await viewport.scrollIntoViewIfNeeded();if(output)await page.screenshot({path:path.join(output,'zoom-125-paper.png')});
            await page.locator('#sc-zoom-reset').click();await page.locator('#sc-zoom-out').click();await settle(page);assert((await paper.boundingBox()).width<base*.8);assert.equal(await page.locator('#sc-zoom-reset').innerText(),'75%');
            await page.setViewportSize({width:390,height:900});await page.locator('#sc-zoom-reset').click();await page.locator('#sc-zoom-in').click();await settle(page);assert(Math.abs((await viewport.boundingBox()).width-(await paper.boundingBox()).width)<2);
            await page.emulateMedia({media:'print'});assert.equal(await page.locator('#sc-zoom-controls').evaluate(e=>getComputedStyle(e.closest('.sheet-toolbar')).display),'none');assert(Math.abs((await paper.boundingBox()).width-210*96/25.4)<2);await page.emulateMedia({media:'screen'});
            assert.deepEqual(await snapshot(page),before);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory()),history);
        }));
        await t.test('stroke arrows cycle; wave extends the preceding stroke and survives history/save',()=>fresh(async page=>{
            await select(page);const cells=page.locator('.dock-strum-cell');
            for(const [key,glyphs] of [['ArrowDown',['↓','↑','x','𝄾','']],['ArrowUp',['↑','↓','x','𝄾','']]]){
                for(const glyph of glyphs){await cells.first().press(key);await settle(page);assert.equal(await glyphOf(cells.first()),glyph);}
            }
            const empty=await snapshot(page);await cells.first().press('~');await settle(page);assert.deepEqual(await snapshot(page),empty);
            await cells.first().press('d');await settle(page);
            for(const key of ['~','〜','～']){if(key==='~')await cells.nth(1).press(key);else await cells.nth(1).dispatchEvent('keydown',{key});await settle(page);assert.equal(await glyphOf(cells.nth(1)),'〜');}
            const extended=await snapshot(page);await page.locator('#sc-undo').click();assert.notDeepEqual(await snapshot(page),extended);await page.locator('#sc-redo').click();assert.deepEqual(await snapshot(page),extended);
            await page.locator('#sc-save').click();await page.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);const saved=await snapshot(page);await page.reload();await page.locator('#open-sheet-cruise').click();await select(page);assert.equal(await glyphOf(cells.nth(1)),'〜');assert.deepEqual(await snapshot(page),saved);
        }));
        await t.test('per-beat lyric subdivision matches solfege without changing data or history',()=>fresh(async page=>{
            await select(page);await page.locator('.dock-lyrics-cell').first().fill('あい');await settle(page);await page.locator('[data-overlay-field=doremi]').first().fill('ドレ');await page.locator('[data-overlay-field=doremi]').first().press('Tab');await settle(page);const before=await snapshot(page),history=await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory());
            const button=page.locator('[data-resolution-row=lyrics]').first();
            for(const count of [10,8,8]){
                await button.click();await settle(page);assert.equal(await page.locator('[data-overlay-field=doremi]').count(),count);
                const metrics=await page.evaluate(()=>{const lyric=[...document.querySelectorAll('.dock-lyrics-cell')],note=[...document.querySelectorAll('[data-overlay-field=doremi]')];return lyric.map((l,i)=>{const a=l.getBoundingClientRect(),b=note[i].getBoundingClientRect();return {tick:l.dataset.slotTick,other:note[i].dataset.slotTick,delta:Math.abs(a.x-b.x)+Math.abs(a.width-b.width)};});});
                for(const m of metrics){assert.equal(m.tick,m.other);assert(m.delta<2);}
                if(output&&count===10)await page.screenshot({path:path.join(output,'mixed-subdivision.png')});
            }
            assert.deepEqual(await snapshot(page),before);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory()),history);
            const note=page.locator('[data-overlay-field=doremi]').first();await note.fill('不正');await button.click();await settle(page);assert.equal(await page.locator('[data-overlay-field=doremi]').count(),8);assert.equal(await note.inputValue(),'不正');assert.equal(await note.getAttribute('aria-invalid'),'true');
            await note.fill('ドレ');await note.dispatchEvent('compositionstart');await button.click();await settle(page);assert.equal(await page.locator('[data-overlay-field=doremi]').count(),8);assert(await note.evaluate(e=>e.classList.contains('is-composing')));await note.dispatchEvent('compositionend');await settle(page);assert.deepEqual(await snapshot(page),before);
        }));
        await t.test('vertical row movement keeps tick; stroke Shift arrows navigate without editing',()=>fresh(async page=>{
            await select(page);await page.locator('[data-resolution-row=lyrics]').first().click();await settle(page);
            const fields=page.locator('[data-overlay-field=doremi]');await fields.nth(1).focus();const before=await snapshot(page),history=await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory());
            async function expectCell(row,tick){await settle(page);assert.deepEqual(await page.evaluate(()=>{const e=document.activeElement;return [e.dataset.overlayField||e.closest('[data-overlay-field]')?.dataset.overlayField,e.dataset.slotTick];}),[row,String(tick)]);}
            await page.keyboard.press('ArrowUp');await expectCell('lyrics',120);
            await page.keyboard.press('Shift+ArrowUp');await expectCell('strum',0);
            await page.keyboard.press('Shift+ArrowUp');await expectCell('chord',0);
            await page.keyboard.press('ArrowDown');await expectCell('strum',0);
            await page.keyboard.press('Shift+ArrowDown');await expectCell('lyrics',0);
            await page.keyboard.press('ArrowDown');await expectCell('doremi',0);
            assert.deepEqual(await snapshot(page),before);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory()),history);
            await fields.first().fill('不正');await fields.first().press('ArrowUp');await expectCell('doremi',0);assert.equal(await fields.first().getAttribute('aria-invalid'),'true');
        }));
        await t.test('Enter ends every row at the next bar, but never adds a final bar',()=>fresh(async page=>{
            await select(page);
            for(const selector of ['[data-overlay-field=chord]','.dock-strum-cell','.dock-lyrics-cell','[data-overlay-field=doremi]']){
                const count=(await snapshot(page)).bars.length;await page.locator(selector).last().press('Enter');await settle(page);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[2]);
                await page.locator('.sheet-bar').last().focus();await page.keyboard.press('Enter');await settle(page);await page.locator(selector).last().press('Enter');await settle(page);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[count]);assert.equal((await snapshot(page)).bars.length,count);await select(page);
            }
            const last=page.locator('[data-overlay-field=doremi]').last();await last.fill('不正');await last.press('Enter');await settle(page);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[1]);
            await last.fill('ド');await last.dispatchEvent('keydown',{key:'Enter',isComposing:true,keyCode:229});await settle(page);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[1]);
        }));
        await t.test('both arrow cycles include a real sustain with canonical duration and JSON persistence',()=>fresh(async page=>{
            await select(page);const cells=page.locator('.dock-strum-cell');await cells.first().press('d');await settle(page);
            for(const [key,glyphs] of [['ArrowDown',['↓','↑','x','〜','𝄾','']],['ArrowUp',['↑','↓','x','〜','𝄾','']]]){
                for(const glyph of glyphs){await cells.nth(1).press(key);await settle(page);assert.equal(await glyphOf(cells.nth(1)),glyph);
                    if(glyph==='〜'){
                        const p=await snapshot(page),id=p.performance.barRhythms.find(x=>x.barId===p.bars[0].id).materialId;
                        const slots=p.materials.rhythms.find(x=>x.id===id).snapshot.slots;assert.equal(slots[0].durationTicks,480);assert.equal(slots.length,1);
                    }
                }
            }
            await cells.nth(1).press('~');await settle(page);const stretched=await snapshot(page);
            await page.locator('#sc-undo').click();assert.notDeepEqual(await snapshot(page),stretched);await page.locator('#sc-redo').click();assert.deepEqual(await snapshot(page),stretched);
            const download=page.waitForEvent('download');await page.locator('#sc-export-json').click();const file=await download;assert.deepEqual(JSON.parse(fs.readFileSync(await file.path(),'utf8')),stretched);
            await page.locator('#sc-save').click();await page.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);const saved=await snapshot(page);await page.reload();await page.locator('#open-sheet-cruise').click();await select(page);assert.equal(await glyphOf(cells.nth(1)),'〜');assert.deepEqual(await snapshot(page),saved);
        }));
        await t.test('chord and stroke beat buttons are independent and boundaries align at both resolutions',()=>fresh(async page=>{
            await select(page);const before=await snapshot(page),history=await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory());
            await page.locator('[data-resolution-row=chord]').first().click();await settle(page);assert.equal(await page.locator('[data-overlay-field=chord]').count(),10);assert.equal(await page.locator('.dock-strum-cell').count(),8);assert.equal(await page.locator('[data-overlay-field=doremi]').count(),8);
            await page.locator('[data-resolution-row=strum]').first().click();await settle(page);assert.equal(await page.locator('.dock-strum-cell').count(),10);assert.equal(await page.locator('.dock-lyrics-cell').count(),8);
            for(const width of [1440,390]){
                await page.setViewportSize({width,height:1000});await settle(page);
                const pairs=await page.evaluate(()=>[...document.querySelectorAll('[data-overlay-field=chord]')].map((e,i)=>{const other=document.querySelectorAll('.dock-strum-cell')[i],a=e.getBoundingClientRect(),b=other.getBoundingClientRect(),s=getComputedStyle(e);return {tick:e.dataset.slotTick,other:other.dataset.slotTick,delta:Math.abs(a.x-b.x)+Math.abs(a.width-b.width),border:s.borderRightWidth,color:s.borderRightColor};}));
                for(const p of pairs){assert.equal(p.tick,p.other);assert(p.delta<2);assert.equal(p.border,'1px');assert.notEqual(p.color,'rgba(0, 0, 0, 0)');}
            }
            assert.deepEqual(await snapshot(page),before);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory()),history);
            await page.locator('#sc-new-project').click();await page.getByRole('dialog').getByRole('button',{name:'保存せず続行',exact:true}).click();await select(page);assert.equal(await page.locator('[data-overlay-field=chord]').count(),8);assert.equal(await page.locator('.dock-strum-cell').count(),8);
            await page.locator('#sc-project-select').selectOption(before.projectId);await page.getByRole('dialog').getByRole('button',{name:'保存せず続行',exact:true}).click();await select(page);assert.equal(await page.locator('[data-overlay-field=chord]').count(),10);assert.equal(await page.locator('.dock-strum-cell').count(),10);assert.deepEqual(await snapshot(page),before);
        }));
        await t.test('coarse display protects fine events and editing another stroke retains exact durations and accents',()=>fresh(async page=>{
            await page.evaluate(()=>{
                const s=CruiseStudio.sheetCruise.getSession();const result=s.runOperation('Synthetic shared fine rhythm',p=>{
                    const id=crypto.randomUUID();p.materials.rhythms.push({id,encoding:'studio-strum-v1',provenance:{origin:'user-set'},snapshot:{name:'synthetic',lengthTicks:1920,slots:[{id:crypto.randomUUID(),tick:0,action:'down',durationTicks:60,accent:true},{id:crypto.randomUUID(),tick:120,action:'up',durationTicks:120,accent:false},{id:crypto.randomUUID(),tick:960,action:'mute',durationTicks:180,accent:true,tieToNext:false}]}});
                    p.performance.barRhythms=[{id:crypto.randomUUID(),barId:p.bars[0].id,materialId:id},{id:crypto.randomUUID(),barId:p.bars[1].id,materialId:id}];
                    p.bars[0].chords=[0,120].map((onsetTick,i)=>({id:crypto.randomUUID(),onsetTick,symbol:i?'G':'C',unresolved:false,provenance:{origin:'user-set'}}));
                });if(!result.ok)throw Error(result.error);
            });
            await select(page);const before=await snapshot(page),binding=before.performance.barRhythms[0],material=before.materials.rhythms.find(m=>m.id===binding.materialId);
            for(const row of ['chord','strum']){await page.locator('[data-resolution-row='+row+']').first().click();await settle(page);}
            assert.equal(await page.locator('[data-overlay-field=chord]').first().getAttribute('readonly'),'');assert.equal(await page.locator('.dock-strum-cell').first().innerText(),'…');
            await page.locator('.dock-strum-cell').first().press('ArrowDown');await settle(page);assert.deepEqual(await snapshot(page),before);
            await page.locator('.dock-strum-cell[data-slot-tick="480"]').press('d');await settle(page);const edited=await snapshot(page);
            assert.deepEqual(edited.bars,before.bars);assert.deepEqual(edited.performance.barRhythms[1],before.performance.barRhythms[1]);assert.deepEqual(edited.materials.rhythms.find(m=>m.id===material.id),material);
            const current=edited.materials.rhythms.find(m=>m.id===edited.performance.barRhythms.find(b=>b.barId===edited.bars[0].id).materialId);
            for(const old of material.snapshot.slots){const newer=current.snapshot.slots.find(e=>e.tick===old.tick);const {id,...a}=old,{id:otherId,...b}=newer;assert.deepEqual(b,a);}
            await page.locator('#sc-undo').click();assert.deepEqual(await snapshot(page),before);await page.locator('#sc-redo').click();assert.deepEqual(await snapshot(page),edited);
        }));
        await t.test('left and right cross bar edges in every row, keeping the same row and correct end',()=>fresh(async page=>{
            await select(page);
            for(const selector of ['[data-overlay-field=chord]','.dock-strum-cell','.dock-lyrics-cell','[data-overlay-field=doremi]']){
                const cells=page.locator(selector),expected=selector.includes('chord')?'chord':selector.includes('strum')?'strum':selector.includes('lyrics')?'lyrics':'doremi';await cells.first().press('ArrowLeft');await settle(page);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[1]);
                await cells.last().press('ArrowRight');await settle(page);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[2]);assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'0');assert.equal(await page.evaluate(()=>{const e=document.activeElement;return e.dataset.overlayField||e.closest('[data-overlay-field]')?.dataset.overlayField;}),expected);
                await cells.first().press('ArrowLeft');await settle(page);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[1]);assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'1680');
                const count=(await snapshot(page)).bars.length;await page.locator('.sheet-bar').last().focus();await page.keyboard.press('Enter');await settle(page);await cells.last().press('ArrowRight');await settle(page);assert.equal((await snapshot(page)).bars.length,count);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[count]);await select(page);
            }
            const field=page.locator('[data-overlay-field=chord]').last();await field.fill('invalid!');await field.press('ArrowRight');await settle(page);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[1]);
        }));
        await t.test('resizing the actual handle scales buttons, row names, beat labels and resolution controls',()=>fresh(async page=>{
            await select(page);await page.locator('[data-resolution-row=chord]').first().click();await settle(page);
            const before=await snapshot(page),history=await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory());
            async function metrics(){return page.evaluate(()=>{const root=document.querySelector('#sc-slot-overlay');const selectors=['.slot-overlay-title','.slot-overlay-section','.slot-overlay-nav-btn','.slot-overlay-res-btn','.slot-overlay-bulk-toggle','.slot-overlay-close','.slot-overlay-row-label','.slot-overlay-ruler-cell','.dock-lyrics-beat-res-btn'];return {width:root.getBoundingClientRect().width,fonts:selectors.map(s=>parseFloat(getComputedStyle(root.querySelector(s)).fontSize)),button:root.querySelector('.dock-lyrics-beat-res-btn').getBoundingClientRect().width};});}
            const small=await metrics(),handle=await page.locator('.slot-overlay-resize-handle').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+220,handle.y+handle.height/2,{steps:8});await page.mouse.up();await settle(page);const large=await metrics(),ratio=large.width/small.width;assert(ratio>1.15);
            small.fonts.forEach((size,i)=>assert(Math.abs(large.fonts[i]/size-ratio)<.02));assert(Math.abs(large.button/small.button-ratio)<.02);
            const boxes=await page.locator('.dock-lyrics-beat-res-btn').evaluateAll(elements=>elements.map(e=>{const a=e.getBoundingClientRect(),b=e.parentElement.getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1&&a.bottom<=b.bottom+1;}));assert(boxes.every(Boolean));
            if(output)await page.screenshot({path:path.join(output,'loupe-enlarged.png')});assert.deepEqual(await snapshot(page),before);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory()),history);
        }));
        await t.test('explicit rests, blanks and stretches differ on screen, in JSON and after reload',()=>fresh(async page=>{
            await page.evaluate(()=>{const s=CruiseStudio.sheetCruise.getSession();const r=s.runOperation('Synthetic nonempty basic rhythm',p=>CruiseStudio.model.setBasicStrumText(p,'↓'));if(!r.ok)throw Error(r.error);});
            await select(page);const cells=page.locator('.dock-strum-cell');assert.equal(await glyphOf(cells.first()),'↓');await cells.first().press('r');await settle(page);assert.equal(await glyphOf(cells.first()),'𝄾');assert.equal(await cells.first().getAttribute('data-strum-state'),'rest');
            let p=await snapshot(page),binding=p.performance.barRhythms.find(b=>b.barId===p.bars[0].id),slots=p.materials.rhythms.find(m=>m.id===binding.materialId).snapshot.slots;assert.equal(slots[0].action,'rest');assert.equal(slots[0].durationTicks,240);await page.emulateMedia({media:'print'});assert((await page.locator('.sheet-bar').first().locator('[data-rest-ticks]').first().boundingBox()).height>5);await page.emulateMedia({media:'screen'});assert.equal(await glyphOf(page.locator('.sheet-bar').first().locator('[data-strum-state=rest]').first()),'𝄾');
            await page.locator('[data-resolution-row=strum]').first().click();await settle(page);assert.equal(await glyphOf(cells.first()),'𝄿');assert.equal(await glyphOf(cells.nth(1)),'𝄿');assert.deepEqual(await snapshot(page),p);
            await cells.nth(1).press('Delete');await settle(page);assert.equal(await cells.nth(1).getAttribute('data-strum-state'),'empty');p=await snapshot(page);binding=p.performance.barRhythms.find(b=>b.barId===p.bars[0].id);slots=p.materials.rhythms.find(m=>m.id===binding.materialId).snapshot.slots;assert.equal(slots[0].durationTicks,120);
            await cells.first().press('Delete');await settle(page);const empty=await snapshot(page);assert.deepEqual(await page.evaluate(()=>Array.from(CruiseStudio.model.getBarEffectiveStrumSlots(CruiseStudio.sheetCruise.getSession().draft,1))),[]);assert(await page.getByRole('button',{name:'基本に戻す',exact:true}).isVisible());
            await page.locator('#sc-undo').click();await page.locator('#sc-redo').click();assert.deepEqual(await snapshot(page),empty);await page.locator('#sc-save').click();await page.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);const saved=await snapshot(page);await page.reload();await page.locator('#open-sheet-cruise').click();await select(page);assert.equal(await glyphOf(cells.first()),'');assert.deepEqual(await snapshot(page),saved);
            await page.getByRole('button',{name:'基本に戻す',exact:true}).click();await settle(page);assert.equal(await glyphOf(cells.first()),'↓');await cells.first().press('d');await cells.nth(1).press('~');await settle(page);assert.equal(await cells.nth(1).getAttribute('data-strum-state'),'sustain');await cells.nth(2).press('r');await settle(page);assert.equal(await glyphOf(cells.nth(2)),'𝄾');await cells.nth(3).press('r');await settle(page);await cells.nth(3).press('Delete');await settle(page);assert.equal(await glyphOf(cells.nth(3)),'');
            const current=await snapshot(page),download=page.waitForEvent('download');await page.locator('#sc-export-json').click();const file=await download;assert.deepEqual(JSON.parse(fs.readFileSync(await file.path(),'utf8')),current);
            if(output)await page.screenshot({path:path.join(output,'rest-empty-stretch.png')});
        }));
        await t.test('Tab and Shift Tab cross every row at boundaries and stop at the song ends',()=>fresh(async page=>{
            await select(page);
            for(const selector of ['[data-overlay-field=chord]','.dock-strum-cell','.dock-lyrics-cell','[data-overlay-field=doremi]']){
                const cells=page.locator(selector);await cells.first().press('Shift+Tab');await settle(page);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[1]);await cells.last().press('Tab');await settle(page);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[2]);assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'0');await cells.first().press('Shift+Tab');await settle(page);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[1]);assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'1680');
            }
            const last=page.locator('[data-overlay-field=doremi]').last();await last.fill('不正');await last.press('Tab');await settle(page);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[1]);
        }));
        await t.test('lyrics share the input color, keep IME feedback, and Loupe may overlap the Project toolbar',()=>fresh(async page=>{
            await select(page);await page.locator('.dock-lyrics-cell').first().fill('あい');await settle(page);await page.locator('[data-overlay-field=doremi]').first().focus();await settle(page);
            const colors=await page.evaluate(()=>{const a=getComputedStyle(document.querySelector('.dock-lyrics-cell')),b=getComputedStyle(document.querySelector('[data-overlay-field=chord]'));return [a.backgroundColor,b.backgroundColor,getComputedStyle(document.querySelector('.dock-lyrics-grid')).backgroundColor,getComputedStyle(document.querySelector('.slot-overlay-row--chord .slot-overlay-row-body')).backgroundColor];});assert.equal(colors[0],colors[1]);assert.equal(colors[2],colors[3]);
            const before=await snapshot(page),head=page.locator('.slot-overlay-head'),r=await head.boundingBox();await page.mouse.move(r.x+r.width-6,r.y+4);await page.mouse.down();await page.mouse.move(r.x+r.width-6,80,{steps:8});await page.mouse.up();await settle(page);
            const geometry=await page.evaluate(()=>{const card=document.querySelector('#sc-slot-overlay').getBoundingClientRect(),toolbar=document.querySelector('.sheet-toolbar').getBoundingClientRect(),nav=document.querySelector('#screen-sheet-cruise .workspace-local-nav').getBoundingClientRect();return {y:card.y,bottom:toolbar.bottom,navBottom:nav.bottom};});assert(geometry.y<geometry.bottom-20);assert(geometry.y>=geometry.navBottom+7);assert.deepEqual(await snapshot(page),before);
            const lyric=page.locator('.dock-lyrics-cell').first();await lyric.focus();await lyric.dispatchEvent('compositionstart');assert(await lyric.evaluate(e=>e.classList.contains('is-composing')));await lyric.dispatchEvent('compositionend');await settle(page);
            if(output)await page.screenshot({path:path.join(output,'toolbar-overlap.png')});
        }));
        await t.test('clearing inside an explicit rest preserves silence on both sides and rejects an orphan stretch',()=>fresh(async page=>{
            await page.evaluate(()=>{const s=CruiseStudio.sheetCruise.getSession();const result=s.runOperation('Synthetic long explicit rest',p=>CruiseStudio.model.setBarStrumSlots(p,1,[{tick:0,action:'rest',durationTicks:720,accent:false}]));if(!result.ok)throw Error(result.error);});await select(page);
            await page.locator('[data-resolution-row=strum]').first().click();await settle(page);const before=await snapshot(page);await page.locator('.dock-strum-cell[data-slot-tick="240"]').press('Delete');await settle(page);const after=await snapshot(page),binding=after.performance.barRhythms.find(b=>b.barId===after.bars[0].id),slots=after.materials.rhythms.find(m=>m.id===binding.materialId).snapshot.slots;
            assert.deepEqual(slots.map(e=>[e.tick,e.durationTicks,e.action]),[[0,240,'rest'],[360,360,'rest']]);await page.locator('.dock-strum-cell[data-slot-tick="240"]').press('~');await settle(page);assert.deepEqual(await snapshot(page),after);await page.locator('#sc-undo').click();assert.deepEqual(await snapshot(page),before);await page.locator('#sc-redo').click();assert.deepEqual(await snapshot(page),after);
        }));
        await t.test('current text entry already preserves explicit high and low octaves with timing and IDs',()=>fresh(async page=>{
            await select(page);const field=page.locator('[data-overlay-field=doremi]').first();await field.fill('ド↑');await field.press('Tab');await settle(page);let note=(await snapshot(page)).bars[0].melody[0];assert.deepEqual(note.pitch,{step:'C',alter:0,octave:5});const original=note;
            await field.fill('ド↓');await field.press('Tab');await settle(page);note=(await snapshot(page)).bars[0].melody[0];assert.deepEqual(note.pitch,{step:'C',alter:0,octave:3});assert.equal(note.id,original.id);assert.equal(note.durationTicks,original.durationTicks);assert.deepEqual(note.provenance,original.provenance);
        }));
        await t.test('input text and symbols are vertically centered with corner beat toggles and balanced rest size',()=>fresh(async page=>{
            await select(page);await page.locator('[data-overlay-field=chord]').first().fill('C');await page.locator('.dock-lyrics-cell').first().fill('あ');await page.locator('[data-overlay-field=doremi]').first().fill('ド');await page.locator('.dock-strum-cell').first().press('d');await settle(page);await page.locator('.dock-strum-cell').nth(1).press('r');await settle(page);
            const metrics=await page.evaluate(()=>['chord','strum','lyrics','doremi'].map(row=>{const body=document.querySelector('.slot-overlay-row--'+row+' .slot-overlay-row-body'),group=body.querySelector('.beat-group'),cell=group.querySelector('input,button'),button=group.querySelector('[data-resolution-row]'),a=cell.getBoundingClientRect(),b=body.getBoundingClientRect(),g=group.getBoundingClientRect(),t=button?.getBoundingClientRect();return {row,delta:Math.abs(a.y+a.height/2-b.y-b.height/2),height:a.height,group:g.height,button:t?{right:Math.abs(t.right-g.right),bottom:Math.abs(t.bottom-g.bottom)}:null};}));
            for(const m of metrics){assert(m.delta<2,JSON.stringify(m));assert(Math.abs(m.height-m.group)<2);if(m.button){assert(m.button.bottom<3);assert(m.button.right<3);}}
            const arrow=await page.locator('.dock-strum-cell [data-strum-arrow]').first().boundingBox(),rest=await page.locator('.dock-strum-cell [data-rest-ticks]').first().boundingBox();assert(rest.height<arrow.height*.85);assert.equal(await page.locator('[data-strum-arrow] path').first().getAttribute('stroke-width'),'1.65');
            if(output)await page.screenshot({path:path.join(output,'centered-and-balanced.png')});
        }));
        await t.test('piano inserts and groups notes, changes one pitch only, spans A0 C8 and persists octave colors',()=>fresh(async page=>{
            await select(page);await page.locator('[data-overlay-field=doremi]').first().focus();await page.locator('[data-piano-toggle]').click();await page.locator('[data-piano-midi="60"]').click();await settle(page);let song=await snapshot(page),first=song.bars[0].melody[0];assert.deepEqual(first.pitch,{step:'C',alter:0,octave:4});assert.equal(first.durationTicks,240);
            await page.locator('[data-piano-add]').click();await page.locator('[data-piano-midi="64"]').click();await settle(page);song=await snapshot(page);assert.equal(song.bars[0].melody.length,2);assert.deepEqual(song.bars[0].melody.map(e=>e.onsetTick),[0,120]);assert(song.bars[0].melody.every(e=>!e.provenance.timing.duration.confirmed));const original=song.bars[0].melody;
            await page.locator('[data-piano-event="'+original[1].id+'"]').click();await page.locator('[data-piano-range="高い"]').click();await page.locator('[data-piano-midi="76"]').click();await settle(page);const changed=await snapshot(page);assert.deepEqual(changed.bars[0].melody[0],original[0]);const e=changed.bars[0].melody[1];assert.equal(e.id,original[1].id);assert.equal(e.onsetTick,120);assert.equal(e.durationTicks,120);assert.deepEqual(e.provenance,original[1].provenance);assert.equal(e.pitch.octave,5);assert.equal(await page.locator('.solfege-cell.piano-color-mode .solfege-colors').first().evaluate(e=>getComputedStyle(e).visibility),'visible');
            await page.locator('[data-overlay-field=doremi]').first().press('Tab');await settle(page);const palette=await page.locator('.solfege-colors [data-note-octave]').evaluateAll(es=>es.map(e=>({oct:e.dataset.noteOctave,color:getComputedStyle(e).color})));assert.equal(palette.length,2);assert.notEqual(palette[0].color,palette[1].color);assert.equal(await page.locator('.sheet-bar-doremi [data-note-octave="5"]').count(),1);
            const current=await snapshot(page),history=await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory());await page.locator('[data-piano-octave]').selectOption('0');assert(await page.locator('[data-piano-midi="21"]').isEnabled());assert(await page.locator('[data-piano-midi="12"]').isDisabled());await page.locator('[data-piano-octave]').selectOption('7');assert(await page.locator('[data-piano-midi="108"]').isEnabled());assert.deepEqual(await snapshot(page),current);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory()),history);
            await page.locator('[data-piano-midi="108"]').click();await settle(page);assert.equal((await snapshot(page)).bars[0].melody.find(e=>e.onsetTick===240).pitch.octave,8);
            await page.locator('[data-overlay-field=doremi][data-slot-tick="480"]').focus();await page.locator('[data-piano-octave]').selectOption('0');await page.locator('[data-piano-midi="21"]').click();await settle(page);assert.deepEqual((await snapshot(page)).bars[0].melody.find(e=>e.onsetTick===480).pitch,{step:'A',alter:0,octave:0});
            const edited=await snapshot(page);await page.keyboard.press('Meta+z');await settle(page);assert.notDeepEqual(await snapshot(page),edited);await page.keyboard.press('Meta+Shift+z');await settle(page);assert.deepEqual(await snapshot(page),edited);await page.locator('#sc-save').click();await page.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);const saved=await snapshot(page),download=page.waitForEvent('download');await page.locator('#sc-export-json').click();const file=await download;assert.deepEqual(JSON.parse(fs.readFileSync(await file.path(),'utf8')),saved);await page.reload();await page.locator('#open-sheet-cruise').click();await select(page);assert.deepEqual(await snapshot(page),saved);
            if(output){await page.locator('[data-overlay-field=doremi]').first().focus();await page.locator('[data-piano-toggle]').click();await page.screenshot({path:path.join(output,'piano-colors.png')});}
        }));
        await t.test('piano preserves manually timed notes and rests; stale buttons, IME and invalid text cannot write',()=>fresh(async page=>{
            await page.evaluate(()=>{const C=CruiseStudio,s=C.sheetCruise.getSession();const r=s.runOperation('Synthetic manual note and rest',p=>{p.bars[0].melody=[{id:crypto.randomUUID(),kind:'note',onsetTick:0,durationTicks:180,pitch:{step:'D',alter:0,octave:4},provenance:C.model.schema2.timing('user-set',true)},{id:crypto.randomUUID(),kind:'rest',onsetTick:360,durationTicks:120,provenance:C.model.schema2.timing('user-set',true)}];});if(!r.ok)throw Error(r.error);});await select(page);await page.locator('[data-overlay-field=doremi]').first().focus();await page.locator('[data-piano-toggle]').click();const before=await snapshot(page);assert(await page.locator('[data-piano-add]').isDisabled());await page.locator('[data-piano-midi="65"]').click();await settle(page);const edited=await snapshot(page);assert.equal(edited.bars[0].melody[0].id,before.bars[0].melody[0].id);assert.equal(edited.bars[0].melody[0].durationTicks,180);assert.deepEqual(edited.bars[0].melody[0].provenance,before.bars[0].melody[0].provenance);assert.deepEqual(edited.bars[0].melody[1],before.bars[0].melody[1]);
            await page.locator('[data-overlay-field=doremi]').first().fill('不正');const invalid=await snapshot(page);await page.locator('[data-piano-midi="67"]').dispatchEvent('click');await settle(page);assert.deepEqual(await snapshot(page),invalid);await page.locator('[data-overlay-field=doremi]').first().fill('ファ');await settle(page);
            const stale=await page.locator('[data-piano-midi="67"]').elementHandle();await page.locator('.sheet-bar').nth(1).focus();await page.keyboard.press('Enter');await settle(page);const old=await snapshot(page);await stale.evaluate(e=>e.click());assert.deepEqual(await snapshot(page),old);
            const field=page.locator('[data-overlay-field=doremi]').first();await field.focus();await field.dispatchEvent('compositionstart');const ime=await snapshot(page);await page.locator('[data-piano-midi]').first().dispatchEvent('click');assert.deepEqual(await snapshot(page),ime);await field.dispatchEvent('compositionend');await settle(page);
        }));
        await t.test('piano respects a non-C tonic and manual timing; rest, extend and delete use the same canonical history',()=>fresh(async page=>{
            await page.evaluate(()=>{const C=CruiseStudio,s=C.sheetCruise.getSession();const r=s.runOperation('Synthetic G3 tonic',p=>{p.solfege.tonic={step:'G',alter:0,octave:3};p.songInfo.originalKey='G';p.bars[0].melody=[{id:crypto.randomUUID(),kind:'note',onsetTick:0,durationTicks:180,pitch:{step:'G',alter:0,octave:3},provenance:C.model.schema2.timing('user-set',true)}];});if(!r.ok)throw Error(r.error);});await select(page);await page.locator('[data-overlay-field=doremi]').first().focus();await page.locator('[data-piano-toggle]').click();const before=await snapshot(page);await page.locator('[data-piano-midi="66"]').click();await settle(page);const note=(await snapshot(page)).bars[0].melody[0];assert.deepEqual(note.pitch,{step:'F',alter:1,octave:4});assert.equal(note.id,before.bars[0].melody[0].id);assert.equal(note.durationTicks,180);assert.deepEqual(note.provenance,before.bars[0].melody[0].provenance);assert.equal(await page.locator('.sheet-bar-doremi [data-note-octave="4"]').count(),1);
            await page.locator('[data-piano-action=rest]').click();await settle(page);const rest=(await snapshot(page)).bars[0].melody[0];assert.equal(rest.kind,'rest');assert(!('pitch' in rest));assert.equal(rest.durationTicks,180);assert.equal(rest.id,note.id);
            await page.locator('[data-piano-action=delete]').click();await settle(page);assert.equal((await snapshot(page)).bars[0].melody.length,0);await page.locator('[data-piano-action=rest]').click();await settle(page);assert.equal((await snapshot(page)).bars[0].melody[0].durationTicks,240);
            await page.locator('[data-piano-midi="60"]').click();await settle(page);const prior=await snapshot(page);await page.locator('[data-piano-action=extend]').click();await settle(page);const extended=await snapshot(page);assert.equal(extended.bars[0].melody[0].durationTicks,480);assert.equal(extended.bars[0].melody[0].id,prior.bars[0].melody[0].id);assert(extended.bars[0].melody[0].provenance.timing.duration.confirmed);await page.locator('#sc-undo').click();assert.deepEqual(await snapshot(page),prior);await page.locator('#sc-redo').click();assert.deepEqual(await snapshot(page),extended);
        }));
        await t.test('opened piano remains reachable across resizing and uses existing Enter Tab cell navigation',()=>fresh(async page=>{
            await select(page);await page.locator('[data-overlay-field=doremi]').first().focus();await page.locator('[data-piano-toggle]').click();await page.locator('[data-piano-midi="60"]').click();await settle(page);const before=await snapshot(page);
            const layout=await page.evaluate(()=>{const grid=document.querySelector('.slot-overlay-grid').getBoundingClientRect(),piano=document.querySelector('[data-doremi-piano]').getBoundingClientRect();return {height:grid.height,top:grid.top,bottom:grid.bottom,pianoTop:piano.top};});assert(layout.height>170);assert(layout.top>=0);assert(layout.bottom<=layout.pianoTop);
            for(const width of [1440,390,1024]){await page.setViewportSize({width,height:1000});await settle(page);const key=page.locator('[data-piano-midi="62"]');await key.scrollIntoViewIfNeeded();const rect=await key.boundingBox();assert(rect.width>8);assert(rect.x>=0&&rect.x+rect.width<=width+1);assert(await key.isEnabled());}
            assert.deepEqual(await snapshot(page),before);await page.locator('[data-overlay-field=doremi]').first().focus();await page.keyboard.press('Enter');await settle(page);assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'240');await page.locator('[data-piano-midi="62"]').focus();await page.keyboard.press('Tab');await settle(page);assert.equal(await page.evaluate(()=>document.activeElement.dataset.slotTick),'480');
            if(output)await page.screenshot({path:path.join(output,'piano-responsive.png')});
        }));
        await t.test('piano renews its target after Save and rejects overlap without leaving a broken text buffer',()=>fresh(async page=>{
            await select(page);await page.locator('[data-overlay-field=doremi]').first().focus();await page.locator('[data-piano-toggle]').click();await page.locator('[data-piano-midi="60"]').click();await settle(page);await page.locator('#sc-save').click();await page.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);const saved=await snapshot(page);await page.locator('[data-piano-midi="62"]').click();await settle(page);let edited=await snapshot(page);assert.equal(edited.bars[0].melody[0].pitch.step,'D');assert.equal(edited.bars[0].melody[0].id,saved.bars[0].melody[0].id);assert.equal(edited.bars[0].melody[0].durationTicks,saved.bars[0].melody[0].durationTicks);
            await page.locator('[data-piano-action=extend]').click();await settle(page);const held=await snapshot(page);await page.locator('[data-overlay-field=doremi][data-slot-tick="240"]').focus();await page.locator('[data-piano-midi="64"]').click();await settle(page);assert.deepEqual(await snapshot(page),held);assert.equal(await page.locator('[data-overlay-field=doremi][data-slot-tick="240"]').inputValue(),'');assert.notEqual(await page.locator('[data-overlay-field=doremi][data-slot-tick="240"]').getAttribute('aria-invalid'),'true');assert(await page.locator('[data-piano-midi="64"]').isEnabled());
            await page.locator('[data-overlay-field=doremi][data-slot-tick="480"]').focus();await page.locator('[data-piano-midi="64"]').click();await settle(page);edited=await snapshot(page);assert.deepEqual(edited.bars[0].melody[0],held.bars[0].melody[0]);assert.equal(edited.bars[0].melody[1].onsetTick,480);
        }));
        await t.test('console and external requests remain clean',()=>{assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.deepEqual(missing,[])});
    }finally{await browser.close();}
});
