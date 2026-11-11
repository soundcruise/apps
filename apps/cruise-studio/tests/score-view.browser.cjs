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
        await t.test('stroke selection is visible for pointer and Up Down x keyboard input',()=>fresh(async page=>{
            await select(page);let first=page.locator('.dock-strum-cell').first();await first.click();await settle(page);assert.notEqual(await first.evaluate(e=>getComputedStyle(e).boxShadow),'none');
            for(const [key,glyph] of [['ArrowUp','↑'],['ArrowDown','↓'],['x','x']]){await first.press(key);await settle(page);assert.equal(await first.innerText(),glyph);assert.notEqual(await first.evaluate(e=>getComputedStyle(e).boxShadow),'none');}
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
            const before=await snapshot(page),history=await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory());const paper=page.locator('.sheet-page').first(),base=(await paper.boundingBox()).width;
            await page.locator('#sc-zoom-in').click();await settle(page);assert((await paper.boundingBox()).width>base*1.2);assert.equal(await page.locator('#sc-zoom-reset').innerText(),'125%');
            await page.locator('#sc-zoom-reset').click();await page.locator('#sc-zoom-out').click();await settle(page);assert((await paper.boundingBox()).width<base*.8);assert.equal(await page.locator('#sc-zoom-reset').innerText(),'75%');
            await page.emulateMedia({media:'print'});assert.equal(await page.locator('#sc-zoom-controls').evaluate(e=>getComputedStyle(e.closest('.sheet-toolbar')).display),'none');assert(Math.abs((await paper.boundingBox()).width-210*96/25.4)<2);await page.emulateMedia({media:'screen'});
            assert.deepEqual(await snapshot(page),before);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory()),history);
        }));
        await t.test('console and external requests remain clean',()=>{assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.deepEqual(missing,[])});
    }finally{await browser.close();}
});
