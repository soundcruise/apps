const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {chromium, firefox, webkit} = require('playwright');
const {saveFromToolbar} = require('./helpers/viewer-regression-choices.cjs');

let directory, manifest, output;
const startServer=async()=> (await import('../scripts/serve-score-candidate.mjs')).serveScoreCandidate(output);
const stopServer=server=>new Promise(resolve=>server.close(resolve));
test.before(async () => {
    const {packagePortPC} = await import('../scripts/package-port-pc.mjs');
    if (process.env.SCORE_CANDIDATE_DIR) {
        output = path.resolve(process.env.SCORE_CANDIDATE_DIR);
        manifest = JSON.parse(await fs.readFile(path.join(output,'RELEASE-MANIFEST.json'),'utf8'));
    } else {
        directory = await fs.mkdtemp(path.join(os.tmpdir(),'score-candidate-test-'));
        output = path.join(directory,'distribution');
        manifest = packagePortPC(output);
    }
    const {CRUISE_PORT_ROOT, PRO_ENTRY_PATH} = await import('../../cruise-port/cruise-port-edition.js');
    assert.deepEqual(manifest.portEntries, [CRUISE_PORT_ROOT, PRO_ENTRY_PATH].map(root => root.slice(1) + 'index.html'));
    for (const [name,hash] of Object.entries(manifest.files)) {
        const bytes = await fs.readFile(path.join(output,name));
        assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,name);
        assert.doesNotMatch(name,/\/(?:scripts|local|tests)\/|mock-account|development\.html/);
    }
});
test.after(async () => {
    if(directory) await fs.rm(directory,{recursive:true,force:true});
});

for (const engine of ['chrome','webkit','firefox']) for (const edition of ['standard','pro'])
test('packaged score creation, persistence, export and playback: '+engine+' '+edition,async t=>{
    const server=await startServer(), origin='http://127.0.0.1:'+server.address().port;
    t.after(()=>server.listening && stopServer(server));
    const browser = await (engine==='chrome'?chromium.launch({channel:'chrome'}):engine==='firefox'?firefox.launch():webkit.launch());
    t.after(()=>browser.close());
    const missing = [], exceptions = [], external = [];
    async function open(url) {
        const context = await browser.newContext({viewport:{width:1450,height:1050}});
        await context.route('**/*',route=>{
            const dest = new URL(route.request().url());
            if(dest.origin === origin) return route.continue();
            external.push(dest.origin);return route.abort();
        });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on('pageerror',e=>exceptions.push(e.message));
        page.on('response',r=>{if(r.status()>=400) missing.push([r.status(),new URL(r.url()).pathname]);});
        await page.goto(origin+url);
        return page;
    }

    const editor=await open(edition==='standard'?'/apps/cruise-studio/':'/'+manifest.entry);
    if(edition==='pro'){
        await editor.locator('#pro-gate-overlay').waitFor();
        assert(await editor.locator('#studio-shell').evaluate(el=>el.inert));
        const {signIntoLocalPro}=await import('./helpers/score-candidate-pro.mjs');
        await signIntoLocalPro(editor,origin,t);
    }
    await editor.waitForFunction(()=>document.documentElement.dataset.studioEntry==='ready');
    await editor.click('#open-sheet-cruise');
    await editor.click('#sc-curve-menu-toggle');
    await editor.click('#sc-new-project');
    const discard = editor.getByRole('button',{name:'保存せず続行',exact:true});
    if(await discard.isVisible()) await discard.click();
    const card = editor.getByRole('dialog',{name:'新しい曲を作成'});
    const title = '配布物の演奏確認 '+engine;
    await card.locator('[data-score-field=title]').fill(title);
    await card.locator('[data-score-field=bpm]').fill('200');
    await card.getByRole('button',{name:'セクション編集',exact:true}).click();
    const sections=editor.getByRole('dialog',{name:'セクション編集',exact:true});
    await sections.getByLabel('セクション名',{exact:true}).fill('うた');
    await sections.locator('[data-score-apply]').click();
    for(const [name,preset] of [['コード一括入力','1950s'],['ストローク一括入力','4分連続']]) {
        await card.getByRole('button',{name,exact:true}).click();
        const dialog=editor.getByRole('dialog',{name,exact:true});
        await dialog.locator('[data-score-preset]').selectOption({label:preset});
        await dialog.getByLabel('曲全て').check();
        await dialog.locator('[data-preset-stage]').click();
        await dialog.getByRole('button',{name:'OK',exact:true}).click();
    }
    assert.equal(await card.getByLabel('曲名',{exact:true}).inputValue(),title);
    await card.locator('[data-score-apply]').click();
    const snapshot=()=>editor.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
    if(engine==='chrome') await editor.evaluate(()=>{
        window.showSaveFilePicker=async()=>(await navigator.storage.getDirectory()).getFileHandle('candidate.json',{create:true});
    });
    await editor.click('#sc-save');
    if(engine==='chrome') await editor.getByRole('button',{name:'保存を続ける',exact:true}).click();
    await editor.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);
    const saved = await snapshot();
    assert.equal(saved.songInfo.title,title);
    assert(saved.bars[0].chords.length && saved.performance.barRhythms.length);
    if(engine==='chrome') {
        const disk=await editor.evaluate(async()=>{
            const handle=await (await navigator.storage.getDirectory()).getFileHandle('candidate.json');
            return JSON.parse(await (await handle.getFile()).text());
        });
        assert.deepEqual(disk.bars,saved.bars);
    }
    await editor.reload();
    await editor.click('#open-sheet-cruise');
    assert.deepEqual(await snapshot(),saved);
    await editor.click('#sc-curve-menu-toggle');
    await editor.click('#sc-export-viewer');
    await editor.click('[data-export-choice=export-save]');
    await editor.click('[data-export-complete=open]');
    await editor.locator('.sv-paper .sheet-bar').first().waitFor();
    const bytes=await editor.evaluate(async()=>{
        const host=await CruiseStudio.scoreViewer.ready();
        const {readViewerEntry}=await import('/apps/cruise-studio/js/viewer-host.mjs');
        return new TextDecoder().decode((await readViewerEntry(CruiseStudio,host.read().entryId)).bytes);
    });
    const exported=JSON.parse(bytes);
    assert.deepEqual(exported.score,saved);
    assert.equal(exported.source.studioVersion,manifest.scoreVersion);
    await editor.click('[data-viewer-action=play]');
    await editor.waitForFunction(async()=>{
        const playing=(await CruiseStudio.scoreViewer.ready()).playback();
        return playing?.barIndex>=1 && playing.stats.parts.guitar>0;
    });
    await editor.click('[data-viewer-action=play]');
    assert.deepEqual(await snapshot(),saved);

    // Exercise the native shelf bundled in each edition using the same tab handoff as the editor.
    const shelfOpened=editor.context().waitForEvent('page');
    await editor.evaluate(async()=>{
        const {openBookSave}=await import('/apps/cruise-studio/js/modules/sheet-cruise/book-save.mjs');
        openBookSave({chordName:'C',shape:'C',rootPc:0,intervals:[0,4,7],qualityKey:'major',
            keyContext:{tonicPc:0,mode:'major',degreeLabel:'I'},fretRange:{min:1,max:3,includesOpen:true},
            notes:[{string:1,fret:0,interval:4,finger:null}],mutedStrings:[2,3,4,5,6]});
    });
    const shelf=await shelfOpened;
    if(edition==='pro')await shelf.getByRole('button',{name:'譜面のフォームをコード本棚に保存'}).click();
    await shelf.locator('#cc-save-confirm').click();
    await shelf.waitForFunction(()=>ChordCruise.storage.loadChordIndex().length===1);
    assert.equal(await shelf.evaluate(()=>ChordCruise.storage.loadChordIndex()[0].chordName),'C');
    await shelf.close();

    const link=await editor.locator('.sv-standalone-link').getAttribute('href');
    assert.equal(link,'/apps/score-viewer/standalone/?from='+edition);
    await editor.locator('.sv-standalone-link').click();
    await editor.locator('.sv-paper .sheet-bar').first().waitFor();
    assert.deepEqual(await editor.evaluate(()=>CruiseViewer.view.read().document.score),saved);
    await editor.click('[data-viewer-action=play]');
    await editor.waitForFunction(()=>CruiseViewer.view.playback()?.stats.parts.guitar>0);
    await editor.click('[data-viewer-action=play]');
    const reader=await open(link);
    assert.equal(await reader.locator('#viewer-return').getAttribute('href'),edition==='pro'?'/'+manifest.entry:'/apps/cruise-studio/');
    await reader.locator('[data-viewer-file]').setInputFiles({
        name:'release.cruise-score.json',mimeType:'application/json',buffer:Buffer.from(bytes)
    });
    await reader.locator('.sv-paper .sheet-bar').first().waitFor();
    assert.deepEqual(await reader.evaluate(()=>CruiseViewer.view.read().document.score),saved);
    await saveFromToolbar(reader);
    await reader.waitForFunction(()=>!CruiseViewer.view.hasUnsaved());
    await reader.locator('.sv-device-options summary').click();
    await reader.click('#viewer-offline-prepare');
    await reader.waitForFunction(()=>document.querySelector('#viewer-offline-status').textContent.startsWith('オフライン準備済み'),{},{timeout:60000});
    await reader.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await stopServer(server);
    const offlineReader=await reader.context().newPage();
    offlineReader.on('pageerror',e=>exceptions.push(e.message));
    await offlineReader.goto(origin+'/apps/score-viewer/standalone/');
    await offlineReader.locator('.sv-paper .sheet-bar').first().waitFor();
    assert.deepEqual(await offlineReader.evaluate(()=>CruiseViewer.view.read().document.score),saved);
    await offlineReader.click('[data-viewer-action=play]');
    await offlineReader.waitForFunction(()=>{
        const playing=CruiseViewer.view.playback();
        return playing?.barIndex>=1 && playing.stats.parts.guitar>0;
    });
    await offlineReader.click('[data-viewer-action=play]');
    assert.deepEqual(exceptions,[]);
    assert.deepEqual(missing,[]);
    assert.deepEqual(external,[]);
});

function visiblePlaybackPosition() {
    const bar = document.querySelector('#sc-sheet-scale-box .sc-playing-bar');
    const cursor = document.querySelector('#sc-sheet-scale-box [data-score-playhead]');
    const stop = document.querySelector('#sc-song-preview[aria-label="停止"]');
    if (!bar || !cursor || !stop) return null;
    const b = bar.getBoundingClientRect(), k = cursor.getBoundingClientRect(), s = stop.getBoundingClientRect();
    const x = Math.min(b.right - 2, Math.max(b.left + 2, k.left));
    const hit = (element, x, y) => element.contains(document.elementFromPoint(x, y));
    if (k.left < b.left - 3 || k.left > b.right + 3 || Math.abs(k.top - b.top) > 3) return null;
    if (![b.top + 4, b.top + b.height / 2, b.bottom - 4].every(y => hit(bar, x, y))) return null;
    if (s.top < 0 || s.bottom > innerHeight + 1 || !hit(stop, s.left + s.width / 2, s.top + s.height / 2)) return null;
    return {bar: Number(bar.dataset.barNumber), x: k.left, stopX: s.left + s.width / 2, stopY: s.top + s.height / 2};
}

for (const engine of ['chrome', 'webkit']) test('packaged editor mobile playback layout: ' + engine, async t => {
    const server = await startServer();
    t.after(() => stopServer(server));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const browser = await (engine === 'chrome' ? chromium.launch({channel:'chrome'}) : webkit.launch());
    t.after(() => browser.close());
    const {createUITestProject} = await import('../scripts/create-ui-test-project.mjs');
    const score = createUITestProject();
    score.songInfo.bpm = 180;
    await t.test('PC toolbar stays available during playback, including a short window', async () => {
        const page = await browser.newPage({viewport:{width:1440,height:900}, hasTouch:false});
        try {
            await page.goto(origin + '/apps/cruise-studio/');
            await page.locator('#open-sheet-cruise').click();
            await page.locator('#sc-import-json').setInputFiles({
                name:'desktop.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(score))
            });
            await page.waitForFunction(id => CruiseStudio.sheetCruise.getSession().draft.projectId === id, score.projectId);
            await page.locator('#sc-song-preview').click();
            await page.locator('.sc-playing-bar').waitFor();
            for (const height of [900, 390]) {
                await page.setViewportSize({width:1440, height});
                assert(await page.locator('#sc-curve-menu-toggle').isVisible());
                assert.equal(await page.locator('.sc-compact-toolbar').evaluate(e => getComputedStyle(e).position), 'sticky');
                assert(await page.locator('#sc-curve-menu-toggle').evaluate(el => {
                    const r = el.getBoundingClientRect();
                    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
                }));
                assert.equal(await page.locator('#sc-song-preview').getAttribute('aria-label'), '停止');
            }
            await page.locator('#sc-song-preview').click();
            await page.waitForFunction(() => !document.querySelector('.sc-playing-bar'));
            await page.locator('#sc-curve-menu-toggle').click();
            await page.locator('#sc-new-project').waitFor();
        } finally {
            await page.context().close();
        }
    });
    const profiles = [
        ['iPhone', {width:390,height:664}, {width:664,height:390}],
        ['iPhone wide', {width:390,height:844}, {width:844,height:390}],
        ['iPad', {width:810,height:1080}, {width:1080,height:810}]
    ];
    for (const [name, portrait, landscape] of profiles) for (const rotate of [false, true]) {
        await t.test(name + (rotate ? ' portrait → landscape → portrait' : ' landscape launch'), async () => {
            const context = await browser.newContext({isMobile:true, hasTouch:true, viewport:rotate ? portrait : landscape});
            try {
                const page = await context.newPage();
                await page.goto(origin + '/apps/cruise-studio/');
                await page.locator('#open-sheet-cruise').tap();
                await page.locator('#sc-import-json').setInputFiles({
                    name:'layout.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(score))
                });
                await page.waitForFunction(id => CruiseStudio.sheetCruise.getSession().draft.projectId === id, score.projectId);
                await page.locator('#sc-song-preview').tap();
                const sample = async () => {
                    const result = await page.waitForFunction(visiblePlaybackPosition, null, {timeout:3500});
                    return result.jsonValue();
                };
                let last = await sample();
                for (const size of rotate ? [landscape, portrait] : [landscape]) {
                    if (rotate) await page.setViewportSize(size);
                    const first = await sample();
                    assert(first.bar >= last.bar, 'rotation kept the playback position');
                    await page.waitForFunction(n => Number(document.querySelector('.sc-playing-bar')?.dataset.barNumber) > n, first.bar);
                    last = await sample();
                    assert(last.bar > first.bar, 'cursor advanced to another visible measure');
                    assert.equal(await page.locator('#screen-sheet-cruise.sc-focused').count(), 0);
                }
                // Tap the measured position; an auto-scrolling locator could conceal an occlusion.
                await page.touchscreen.tap(last.stopX, last.stopY);
                await page.waitForFunction(() => !document.querySelector('#sc-sheet-scale-box .sc-playing-bar'));
                assert.equal(await page.locator('#sc-song-preview').getAttribute('aria-label'), '再生');
                assert(await page.locator('#sc-curve-menu-toggle').isVisible());
            } finally {
                await context.close();
            }
        });
    }
});

for (const model of ['iPhone 13', 'Pixel 7', 'iPad (gen 7)', 'Galaxy Tab S4']) {
    test('Port tool opens and plays an exported score: ' + model, async t => {
        const {devices} = require('playwright');
        const device = devices[model];
        const browser = await (device.defaultBrowserType === 'webkit' ? webkit.launch() : chromium.launch({channel:'chrome'}));
        const server = await startServer();
        t.after(() => stopServer(server));
        t.after(() => browser.close());
        const origin = 'http://127.0.0.1:' + server.address().port;
        const {viewerFixture} = await import('./helpers/viewer-fixture.mjs');
        const {score, contract, metadata} = viewerFixture();
        score.songInfo.bpm = 180;
        const file = await contract.codec.encode(score, metadata);
        for (const entry of manifest.portEntries) for (const landscape of [false, true]) {
            const pro = entry.includes('/pro_');
            await t.test((pro ? 'Pro' : 'Standard') + (landscape ? ' landscape' : ' portrait'), async t => {
                const {width,height} = device.viewport;
                const context = await browser.newContext({...device, viewport:landscape ? {width:height,height:width} : {width,height}});
                t.after(() => context.close());
                const page = await context.newPage();
                page.setDefaultTimeout(6000);
                const failures = [];
                await context.route('**/*', route => {
                    const url = new URL(route.request().url());
                    if (url.origin === origin || ['blob:', 'data:'].includes(url.protocol)) return route.continue();
                    failures.push(url.origin);return route.abort();
                });
                // The Port requests news from its loopback preview API; the distribution supplies the UI.
                await context.route(origin+'/__cruise_preview/news?*', route =>
                    route.fulfill({json:{contractVersion:1, items:[]}}));
                page.on('pageerror', e => failures.push(e.message));
                page.on('response', r => {if(r.status()>=400) failures.push(r.status()+' '+new URL(r.url()).pathname);});
                const home = origin + '/' + entry.replace(/index\.html$/, '');
                await page.goto(home);
                if(pro) {
                    await page.locator('#pro-gate-input').waitFor();
                    const {signIntoLocalPro} = await import('./helpers/score-candidate-pro.mjs');
                    await signIntoLocalPro(page, origin, t, () => document.documentElement.dataset.edition === 'pro');
                }
                await page.waitForFunction(edition => document.documentElement.dataset.edition === edition, pro ? 'pro' : 'standard');
                await page.locator('[data-home-section="tools"]').getByRole('link',{name:'譜面ビューワー'}).tap();
                await page.waitForFunction(() => !!window.CruiseViewer);
                const menu = page.locator('.sv-main-menu:visible > summary');
                await menu.tap();
                const [chooser] = await Promise.all([
                    page.waitForEvent('filechooser'), page.locator('[data-viewer-action=open]:visible').tap()
                ]);
                await chooser.setFiles({name:'Port.cruise-score.json',mimeType:'application/json',buffer:Buffer.from(file.text)});
                await page.locator('.sv-paper .sheet-bar').first().waitFor();
                assert.deepEqual(await page.evaluate(()=>CruiseViewer.view.read().document.score),score);
                const play = page.locator('[data-viewer-action=play]:visible');
                await play.tap();
                await page.waitForFunction(()=>{
                    const p=CruiseViewer.view.playback();
                    const bar=document.querySelector('.sv-playing'), cursor=document.querySelector('[data-viewer-playhead]');
                    if(p.phase!=='playing'||p.barIndex<1||!p.stats.parts.guitar||!bar||!cursor) return false;
                    const b=bar.getBoundingClientRect(),k=cursor.getBoundingClientRect();
                    return +bar.dataset.barNumber===p.barIndex+1 && k.x>=b.left-2 && k.x<=b.right+2 &&
                        bar.contains(document.elementFromPoint(Math.min(b.right-2,Math.max(b.left+2,k.x)),b.y+8));
                });
                const pos = await play.boundingBox();
                assert(pos && pos.y>=0 && pos.y+pos.height<=page.viewportSize().height+1);
                await page.touchscreen.tap(pos.x+pos.width/2,pos.y+pos.height/2);
                await page.waitForFunction(()=>CruiseViewer.view.playback().phase==='paused');
                const back = page.getByRole('link',{name:'← ポート'});
                assert.equal(await back.evaluate(a=>a.href),home);
                await back.tap();
                await page.locator('[data-viewer-leave=discard]').tap();
                await page.waitForURL(home);
                await page.waitForFunction(edition => document.documentElement.dataset.edition === edition, pro ? 'pro' : 'standard');
                await page.locator('[data-home-section="tools"]').getByRole('link',{name:'譜面ビューワー'}).waitFor();
                assert.deepEqual(failures,[]);
            });
        }
    });
}

for (const engine of ['chrome','webkit']) test('automatic measure layout survives rotation, zoom and fullscreen: '+engine, async t=>{
    const server=await startServer();
    t.after(()=>stopServer(server));
    const origin='http://127.0.0.1:'+server.address().port;
    const browser=await (engine==='chrome'?chromium.launch({channel:'chrome'}):webkit.launch());
    t.after(()=>browser.close());
    const {viewerFixture}=await import('./helpers/viewer-fixture.mjs');
    const {score,contract,metadata}=viewerFixture();
    const exported=await contract.codec.encode(score,metadata);
    for(const viewer of [false,true]) await t.test(viewer?'Viewer':'Editor',async t=>{
        const context=await browser.newContext({isMobile:true,hasTouch:true,viewport:{width:402,height:874}});
        t.after(()=>context.close());
        const page=await context.newPage();
        page.setDefaultTimeout(7000);
        await page.goto(origin+(viewer?'/apps/score-viewer/standalone/':'/apps/cruise-studio/'));
        if(!viewer)await page.click('#open-sheet-cruise');
        await page.locator(viewer?'[data-viewer-file]':'#sc-import-json').setInputFiles({
            name:viewer?'test.cruise-score.json':'editor.json',mimeType:'application/json',
            buffer:Buffer.from(viewer?exported.text:JSON.stringify(score))
        });
        const firstLine=(viewer?'.sv-paper':'#sc-sheet-scale-box')+' .sheet-line';
        const columns=n=>page.waitForFunction(([sel,n])=>Number(document.querySelector(sel)?.dataset.lineCapacity)===n,[firstLine,n]);
        const play=page.locator(viewer?'[data-viewer-action=play]:visible':'#sc-song-preview');
        const activeBar=page.locator(viewer?'.sv-playing':'#sc-sheet-scale-box .sc-playing-bar');
        await columns(1);
        await play.tap();
        await activeBar.first().waitFor();
        const bar=Number(await activeBar.first().getAttribute('data-bar-number'));
        await page.setViewportSize({width:874,height:402});
        await columns(2);
        await page.locator(viewer?'.sv-viewport':'#sc-preview').dispatchEvent('wheel',{ctrlKey:true,deltaY:-150,bubbles:true,cancelable:true});
        await page.waitForFunction(v=>v?CruiseViewer.view.read().presentation.zoom>1:parseInt(document.querySelector('#sc-zoom-reset').textContent)>100,viewer);
        await columns(2);
        const focus=page.locator(viewer?'[data-viewer-focus]':'#sc-fullscreen');
        await focus.evaluate(b=>b.click());
        await columns(2);
        await page.setViewportSize({width:402,height:874});
        await columns(1);
        await page.waitForFunction(([sel,n])=>Number(document.querySelector(sel)?.dataset.barNumber)>n,[viewer?'.sv-playing':'.sc-playing-bar',bar]);
        await play.tap();
        await page.locator('.score-fullscreen .score-focus-settings').tap();
        const dialog=page.locator('[data-paper-layout]');
        await dialog.locator('[data-layout-setting=autoBarsPerLine]').uncheck();
        await dialog.locator('[data-layout-setting=barsPerLine]').selectOption('3');
        await dialog.locator('[data-layout-save]').tap();
        await columns(3);
        await page.locator('.score-fullscreen-exit:visible').tap();
        await page.setViewportSize({width:820,height:1180});
        await columns(3);
        await focus.evaluate(b=>b.click());
        await page.locator('.score-fullscreen .score-focus-settings').tap();
        await dialog.locator('[data-layout-setting=autoBarsPerLine]').check();
        await dialog.locator('[data-layout-save]').tap();
        await columns(2);
        await page.setViewportSize({width:1180,height:820});
        await columns(4);
    });
});

async function openHelpBesideAction(owner, helpName, actionName) {
    const trigger=owner.getByRole('button',{name:helpName,exact:true});
    const action=owner.getByRole('button',{name:actionName,exact:true});
    const [left,right]=await Promise.all([trigger.boundingBox(),action.boundingBox()]);
    assert(left && right && left.x+left.width<=right.x+1 && right.x-left.x-left.width<=24 &&
        Math.abs(left.y+left.height/2-right.y-right.height/2)<=6,helpName+' should be immediately left of '+actionName);
    await trigger.click();
}

for(const engine of ['chrome','webkit'])
test('packaged illustrated tutorial opens from the editor guide: '+engine,async t=>{
    const server=await startServer(), origin='http://127.0.0.1:'+server.address().port;
    t.after(()=>stopServer(server));
    const browser=await(engine==='chrome'?chromium.launch({channel:'chrome'}):webkit.launch());
    t.after(()=>browser.close());
    const editor=await browser.newPage();
    await editor.goto(origin+'/apps/cruise-studio/');
    await editor.click('#open-sheet-cruise');
    const manualLink=editor.getByRole('link',{name:'譜面クルーズの取扱説明書（新しいタブ）'});
    const viewport=editor.viewportSize();
    for(const width of [390,900,viewport.width]){
        await editor.setViewportSize({...viewport,width});
        assert(await manualLink.evaluate(link=>{
            const header=link.closest('.sc-score-toolbar-head').getBoundingClientRect();
            const box=link.getBoundingClientRect();
            return Math.abs(header.right-box.right)<2 && box.top>=header.top && box.top-header.top<12 &&
                document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)===link;
        }),'Manual link is visible at the top right at width '+width);
    }
    const opened=editor.waitForEvent('popup');
    await manualLink.click();
    const guide=await opened;
    await guide.waitForLoadState('load');
    const lesson=guide.locator('#lesson');
    assert.equal(await lesson.locator('video').count(),0);
    const figures=guide.locator('figure');
    assert(await figures.count()>0);
    const incompleteFigures=await figures.evaluateAll(items=>items.flatMap(figure=>{
        const img=figure.querySelector('img');
        return img?.complete && img.naturalWidth && img.alt.trim() && figure.querySelector('figcaption')?.textContent.trim()
            ? [] : [img?.getAttribute('src') || '(missing image)'];
    }));
    assert.deepEqual(incompleteFigures,[]);
    const brokenLinks=await guide.locator('a[href^="#"]').evaluateAll(links=>
        links.map(a=>a.hash.slice(1)).filter(id=>!document.getElementById(id)));
    assert.deepEqual(brokenLinks,[]);
    assert(!Object.keys(manifest.files).some(name=>name.startsWith('apps/cruise-studio/score-guide/') && name.endsWith('.mp4')));
    await guide.close();

    async function checkChapter(owner,title,anchor,steps,images,helpName=title+'の使い方') {
        const action=anchor==='edit'?'小節ルーペを閉じる':anchor==='sound-settings'?'完了':'キャンセル';
        await openHelpBesideAction(owner,helpName,action);
        const help=editor.getByRole('dialog',{name:helpName,exact:true});
        await help.locator('img').evaluate(img=>img.decode());
        assert.equal(await help.locator('ol li').count(),steps);
        if(anchor==='edit'){
            const stroke=help.getByText('ストロークを入れる・消す',{exact:true});
            await stroke.click();
            assert.match(await stroke.locator('..').innerText(),/Dでダウン、Uでアップ/);
        }
        const opened=editor.waitForEvent('popup');
        await help.getByRole('link',{name:/詳しくはこちら/}).click();
        const details=await opened;
        await details.waitForLoadState('load');
        assert.equal(new URL(details.url()).hash,'#'+anchor);
        const chapter=details.locator('#'+anchor);
        const heading=await chapter.getByRole('heading',{level:2}).boundingBox();
        assert(heading && heading.y>=-1 && heading.y<120,'Link lands on the corresponding instructions');
        assert.equal(await chapter.locator('figure img').count(),images);
        const numberedImage=await help.locator('img').evaluate(img=>img.src);
        assert(await chapter.locator('figure img').evaluateAll((imgs,src)=>imgs.some(img=>img.src===src),numberedImage));
        await details.close();
        await help.getByRole('button',{name:'閉じる'}).click();
    }
    await editor.click('#sc-curve-menu-toggle');
    await editor.click('#sc-new-project');
    const discard=editor.getByRole('button',{name:'保存せず続行',exact:true});
    if(await discard.isVisible())await discard.click();
    const newSong=editor.getByRole('dialog',{name:'新しい曲を作成',exact:true});
    await checkChapter(newSong,'新しい曲を作成','lesson',6,15);
    await newSong.getByRole('button',{name:'キャンセル'}).click();
    const {createUITestProject}=await import('../scripts/create-ui-test-project.mjs');
    const fixture=createUITestProject();
    await editor.locator('#sc-import-json').setInputFiles({name:'guide.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
    await editor.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,fixture.projectId);
    await editor.locator('.sheet-bar[data-bar-number="1"]').first().focus();
    await editor.keyboard.press('Enter');
    const measure=editor.locator('#sc-slot-overlay');
    const chord=measure.locator('[data-overlay-field=chord]').first();
    await chord.focus();
    assert.doesNotMatch(await measure.innerText(),/ストローク[：:]\s*↓/);
    await checkChapter(measure,'小節編集','edit',6,4,'編集の操作ガイド');
    assert(await chord.evaluate(el=>el===document.activeElement));
    await measure.locator('[data-chord-toggle]').click();
    const advanced=measure.locator('[data-chord-advanced]');
    if(await advanced.getAttribute('aria-expanded')!=='true')await advanced.click();
    const fretHelp=measure.getByRole('button',{name:'ハイフレット表示の説明'});
    await fretHelp.click();
    assert.equal(await fretHelp.getAttribute('aria-expanded'),'true');
    assert.match(await measure.locator('#cc-high-fret-note').innerText(),/12〜25フレット/);
    await fretHelp.click();
    assert(await measure.locator('#cc-high-fret-note').isHidden());
    await measure.locator('.slot-overlay-close').click();

    await editor.click('#sc-playback-settings');
    const sound=editor.getByRole('dialog',{name:'音設定',exact:true});
    const melody=sound.locator('[data-playback-volume=melody]');
    await melody.focus();
    await melody.press('Home');
    await melody.press('ArrowRight');
    await checkChapter(sound,'音設定','sound-settings',4,1);
    assert.equal(await melody.inputValue(),'1');
    await sound.locator('[data-playback-done]').click();

    await editor.click('#sc-curve-menu-toggle');
    await editor.click('#sc-edit-song');
    const song=editor.locator('[data-score-dialog=settings]');
    const bpm=song.getByLabel('BPM',{exact:true});
    await bpm.fill('112');
    await checkChapter(song,'曲情報','song',4,2);
    assert.equal(await bpm.inputValue(),'112');
    await song.locator('[data-score-apply]').click();
    assert.match(await editor.locator('#sc-sheet-scale-box .sheet-header').innerText(),/BPM:\s*112/);

    await editor.click('#sc-curve-menu-toggle');
    await editor.click('#sc-edit-instrument');
    const instrument=editor.locator('[data-score-dialog=instrument]');
    await instrument.locator('[data-score-field=capo]').fill('5');
    await checkChapter(instrument,'キー・カポ','key-capo',4,2);
    assert.equal(await instrument.locator('[data-key-after=playKey]').textContent(),'G');
    await instrument.locator('[data-score-apply]').click();

    await editor.click('#sc-history');
    const history=editor.locator('.sc-history-dialog');
    const prior=history.locator('[data-history-cursor]').nth(1);
    await prior.click();
    await checkChapter(history,'変更履歴','history',3,2);
    assert.equal(await prior.getAttribute('aria-pressed'),'true');
    await history.locator('[data-history-apply]').click();
    assert(await history.getByRole('button',{name:'この時点に戻す'}).isVisible());
    await history.locator('[data-history-cancel]').click();
    assert.equal(await editor.evaluate(()=>CruiseStudio.sheetCruise.getSession().draft.instrument.capo),5);
    await editor.click('#sc-undo');

    await editor.locator('.sc-form-list-item').first().click();
    const zoom=editor.locator('dialog.sc-readonly-form[open]');
    const beforeFingering=await editor.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
    await zoom.getByLabel('編集する位置').selectOption({label:'全て'});
    await zoom.locator('[data-quick-finger]').first().click();
    await zoom.getByRole('button',{name:'詳しく編集',exact:true}).click();
    const handoff=editor.getByRole('dialog',{name:'コードとフォームの一括編集',exact:true});
    const confirmFingers=handoff.getByRole('button',{name:'5箇所に反映',exact:true});
    await confirmFingers.waitFor();
    assert(await confirmFingers.isEnabled());
    assert.deepEqual(await editor.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot()),beforeFingering);
    await handoff.getByRole('button',{name:'キャンセル',exact:true}).click();
    await handoff.waitFor({state:'detached'});
    assert.deepEqual(await editor.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot()),beforeFingering);
    await editor.locator('.sc-form-list-item').first().click();
    await zoom.locator('[data-quick-finger]').first().click();
    await zoom.getByRole('button',{name:'キャンセル',exact:true}).click();
    await zoom.waitFor({state:'detached'});
    assert.deepEqual(await editor.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot()),beforeFingering);
    await editor.locator('.sc-form-list-item').first().click();
    await zoom.locator('[data-quick-finger]').first().click();
    await zoom.getByRole('button',{name:'詳しく編集',exact:true}).click();
    await confirmFingers.click();
    await editor.click('#sc-undo');
    assert.deepEqual(await editor.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot()),beforeFingering);
    await editor.locator('.sc-form-list-item').first().click();
    await zoom.getByRole('button',{name:'編集',exact:true}).click();
    const bulk=editor.getByRole('dialog',{name:'コードとフォームの一括編集',exact:true});
    await bulk.locator(':scope > details > summary').click();
    await bulk.locator('[data-chord-symbol="Dm"]').click();
    await checkChapter(bulk,'コードとフォームの一括編集','catalogue-edit',4,2);
    assert(await bulk.locator(':scope > details').evaluate(el=>el.open));
    assert.equal(await bulk.getByLabel(/^コード名/).inputValue(),'Dm');
    await bulk.getByRole('button',{name:'5箇所に反映'}).click();
    await bulk.waitFor({state:'detached'});

    const {toolbarControl}=require('./helpers/score-toolbar.cjs');
    const layout=editor.locator('[data-paper-layout]');
    await (await toolbarControl(editor,'#sc-paper-settings')).click();
    await layout.locator('[data-layout-setting=autoBarsPerLine]').uncheck();
    const columns=layout.locator('[data-layout-setting=barsPerLine]');
    await columns.selectOption('2');
    await checkChapter(layout,'譜面の表示設定','view',5,2);
    assert.equal(await columns.inputValue(),'2');
    await layout.locator('[data-layout-save]').click();
    await (await toolbarControl(editor,'#sc-paper-settings')).click();
    assert.equal(await columns.inputValue(),'2');
    await layout.locator('[data-layout-cancel]').click();

    await editor.click('#sc-curve-menu-toggle');
    await editor.click('#sc-edit-sections');
    const sections=editor.locator('[data-score-dialog=sections]');
    const name=sections.getByLabel('セクション名',{exact:true});
    await name.fill('未適用の編集');
    await checkChapter(sections,'セクション編集','sections',4,5);
    assert.equal(await name.inputValue(),'未適用の編集');
});

for (const engine of ['chrome','webkit']) test('packaged batch guides keep the selected range through preview and OK: '+engine,async t=>{
    const server=await startServer(),origin='http://127.0.0.1:'+server.address().port;
    t.after(()=>stopServer(server));
    const browser=await(engine==='chrome'?chromium.launch({channel:'chrome'}):webkit.launch());
    t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    await page.goto(origin+'/apps/cruise-studio/');
    await page.click('#open-sheet-cruise');
    const {createUITestProject}=await import('../scripts/create-ui-test-project.mjs');
    const song=createUITestProject();
    await page.locator('#sc-import-json').setInputFiles({name:'batch.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(song))});
    await page.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,song.projectId);
    const score=page.locator('#sc-sheet-scale-box');
    const bar=(area,n)=>area.locator('.sheet-bar[data-bar-number="'+n+'"]');
    for(const [command,title,anchor,preset,targets] of [
        ['sc-edit-chord-preset','コード一括入力','batch-chords','王道進行',[4,5,6,7]],
        ['sc-edit-rhythm','ストローク一括入力','batch-strokes','基本の8分',[2,3]]
    ]){
        await page.click('#sc-curve-menu-toggle');
        await page.click('#'+command);
        const dialog=page.getByRole('dialog',{name:title,exact:true});
        await dialog.locator('[data-score-preset]').selectOption({label:preset});
        const chords=anchor==='batch-chords';
        const first=bar(dialog,targets[0]);
        if(chords) await first.click({position:{x:10,y:14}});
        else {
            const start=await first.boundingBox(),end=await bar(dialog,3).boundingBox();
            await page.mouse.move(start.x+14,start.y+18);
            await page.mouse.down();
            await page.mouse.move(end.x+20,end.y+18,{steps:10});
            await page.mouse.up();
        }
        const destinations=()=>dialog.locator('[data-preset-destination]').evaluateAll(items=>items.map(e=>Number(e.dataset.barNumber)));
        assert.deepEqual(await destinations(),targets);
        await openHelpBesideAction(dialog,title+'の使い方','キャンセル');
        const help=page.getByRole('dialog',{name:title+'の使い方',exact:true});
        await help.locator('img').evaluate(img=>img.decode());
        assert.equal(await help.locator('ol li').count(),4);
        const opened=page.waitForEvent('popup');
        await help.getByRole('link',{name:/詳しくはこちら/}).click();
        const manual=await opened;
        await manual.waitForLoadState('load');
        assert.equal(new URL(manual.url()).hash,'#'+anchor);
        const chapter=manual.locator('#'+anchor);
        const heading=await chapter.getByRole('heading',{name:title,exact:true}).boundingBox();
        assert(heading && heading.y>=-1 && heading.y<120);
        assert.equal(await chapter.locator('figure img').count(),3);
        await chapter.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
        await manual.close();
        await help.getByRole('button',{name:'閉じる'}).click();
        assert.deepEqual(await destinations(),targets);
        const readBars=async area=>Promise.all(targets.map(async n=>{
            const row=bar(area,n);
            return chords ? (await row.locator('.sheet-chord-event').allTextContents()).join('') :
                row.locator('[data-strum-arrow]').evaluateAll(arrows=>arrows.map(a=>a.dataset.strumArrow).join(' '));
        }));
        const before=await readBars(score);
        await dialog.locator('[data-preset-stage]').click();
        const eighths='down up down up down up down up';
        const expected=chords?['F','G','Em','Am']:[eighths,eighths];
        assert.deepEqual(await readBars(dialog),expected);
        assert.deepEqual(await readBars(score),before);
        await dialog.getByRole('button',{name:'OK',exact:true}).click();
        await dialog.waitFor({state:'detached'});
        assert.deepEqual(await readBars(score),expected);
    }
});

for (const engine of ['chrome','webkit']) test('packaged chord names, capo and shelf forms agree: '+engine,async t=>{
    const server=await startServer(),origin='http://127.0.0.1:'+server.address().port;
    t.after(()=>stopServer(server));
    const browser=await(engine==='chrome'?chromium.launch({channel:'chrome'}):webkit.launch());
    t.after(()=>browser.close());
    const context=await browser.newContext({viewport:{width:1500,height:1050},serviceWorkers:'block'});
    await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/apps/cruise-studio/');await page.click('#open-sheet-cruise');
    const {createUITestProject}=await import('../scripts/create-ui-test-project.mjs');
    const {savedChordForm,makeChordForms}=await import('../js/modules/sheet-cruise/chord-form-transfer.mjs');
    const song=createUITestProject(),event=song.bars[0].chords[0];
    song.instrument.capo=2;song.songInfo.originalKey='D';
    await page.locator('#sc-import-json').setInputFiles({name:'capo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(song))});
    await page.locator('.sheet-form-event[data-form-event="'+event.id+'"]').first().click();
    await page.click('[data-paper-form-edit]');
    const field=page.locator('[data-overlay-field=chord]').first();
    await page.locator('[data-chord-symbol=Dm]').click();
    assert.equal(await field.inputValue(),'Dm');
    assert.equal(await page.locator('[data-selected-chord-name]').innerText(),'Dm');
    const symbol=()=>page.evaluate(()=>CruiseStudio.sheetCruise.getSession().draft.bars[0].chords[0].symbol);
    assert.equal(await symbol(),'Em');
    await field.fill('C7(9)');await field.press('Enter');await field.focus();
    assert.equal(await page.locator('[data-selected-chord-name]').innerText(),'C7(9)');
    assert.equal(await symbol(),'D7(9)');
    await page.click('[data-chord-advanced]');
    const popup=context.waitForEvent('page');await page.click('[data-save-to-book]');
    const shelf=await popup;await shelf.locator('#cc-save-chord-name').waitFor();
    assert.equal(await shelf.locator('#cc-save-chord-name').inputValue(),'C7(9)');
    await shelf.close();
    const notes=[5,6,7,7,5].map((fret,i)=>({string:i+1,fret,finger:[1,2,4,3,1][i]}));
    const form=savedChordForm({notes,mutedStrings:[6],fretRange:{min:4,max:8}});
    const payload=makeChordForms([{id:'book',name:'テスト'}],[{id:'high',name:'Dm',folderId:'book',form}]);
    await page.click('[data-book-open]');
    await page.locator('[data-chord-names-import]').setInputFiles({name:'book.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
    await page.locator('[data-chord-audition=high]').click();
    assert(!(await page.locator('[data-chord-picker]').locator('[role=status]').allTextContents()).some(text=>text.includes('楽器条件を確認')));
    await page.locator('[data-transfer-chord=high]').click();
    const actual=await page.evaluate(()=>{
        const p=CruiseStudio.sheetCruise.getSession().workingSnapshot(),id=p.bars[0].chords[0].id;
        const b=p.performance.formBindings.find(b=>b.chordEventId===id);
        return p.materials.forms.find(m=>m.id===b.materialId).snapshot;
    });
    assert.equal(await symbol(),'Em');assert.equal(actual.capo,2);
    assert.deepEqual(actual.strings.map(n=>n.relativeFret??null),[5,6,7,7,5,null]);
    assert.deepEqual(actual.displayRange,{min:4,max:8});
    const next=page.locator('[data-overlay-field=chord]').nth(1);
    await next.fill('C6');await next.focus();
    assert.equal(await page.locator('[data-selected-chord-name]').innerText(),'C6');
    assert(await page.locator('#cc-fretboard-host .cc-fb-marker').count()>0);
    await next.fill('C未定');await next.focus();
    assert.equal(await page.locator('[data-selected-chord-name]').innerText(),'C未定');
    assert(await page.locator('[data-save-to-book]').isDisabled());
    assert.deepEqual(errors,[]);
});

for(const engine of ['chrome','webkit'])test('native bookshelf bass and tension survive score, enlargement and viewer playback: '+engine,async t=>{
    const server=await startServer(),origin='http://127.0.0.1:'+server.address().port;
    t.after(()=>stopServer(server));
    const browser=await(engine==='chrome'?chromium.launch({channel:'chrome'}):webkit.launch());
    t.after(()=>browser.close());
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
    const page=await context.newPage();page.setDefaultTimeout(9000);
    await page.goto(origin+'/apps/cruise-studio/');await page.click('#open-sheet-cruise');
    const {createUITestProject}=await import('../scripts/create-ui-test-project.mjs');
    const score=createUITestProject(),id=score.bars[0].chords[0].id;
    await page.locator('#sc-import-json').setInputFiles({name:'song.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(score))});
    const diagram='.sheet-form-event[data-form-event="'+id+'"]';
    await page.locator(diagram).first().click();await page.click('[data-paper-form-edit]');
    await page.click('[data-book-open]');
    const popup=context.waitForEvent('page');
    await page.getByRole('link',{name:'本棚からフォームを書き出す'}).click();
    const book=await popup;book.setDefaultTimeout(9000);await book.locator('[data-folder-id]').first().waitFor();
    const record=await book.evaluate(()=>{
        const store=ChordCruise.storage;
        return store.saveChord({chordName:'Cadd9/G',formName:'テスト',folderId:store.loadFolders()[0].id,
            shape:'C',rootPc:0,qualityKey:'major',intervals:[0,4,7],keyContext:null,
            fretRange:{min:1,max:3,includesOpen:true},bassPc:7,tensionPcs:[2],
            notes:[{string:2,fret:1,finger:1,interval:0},{string:3,fret:0,finger:null,interval:7},
                {string:4,fret:2,finger:2,interval:4},{string:5,fret:3,finger:3,interval:0}],
            mutedStrings:[1,6],bassFingerings:[{string:6,fret:3,finger:'T'}],
            tensionFingerings:[{string:2,fret:3,pc:2,finger:4}]});
    });
    await book.locator('[data-folder-id="'+record.folderId+'"]').click();
    const download=book.waitForEvent('download',{timeout:9000});
    await book.locator('button[data-chord-id="'+record.id+'"]').click();
    const file=await download;
    assert.deepEqual(await book.evaluate(id=>ChordCruise.storage.loadChord(id),record.id),record);
    await page.locator('[data-chord-names-import]').setInputFiles(await file.path());
    await book.close();await page.locator('[data-transfer-chord="'+record.id+'"]').click();
    await page.click('.slot-overlay-close');
    const snapshot=await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
    const binding=snapshot.performance.formBindings.find(b=>b.chordEventId===id);
    assert.equal(snapshot.bars[0].chords[0].symbol,'Cadd9/G');
    const actual=snapshot.materials.forms.find(f=>f.id===binding.materialId).snapshot;
    assert.deepEqual(actual.strings.map(n=>n.kind==='muted'?null:[n.relativeFret,n.finger]),[null,[3,4],[0,null],[2,2],[3,3],[3,'T']]);
    const artwork=scope=>scope.locator('svg').evaluate(s=>[...s.querySelectorAll('circle,text')].map(e=>[e.tagName,e.getAttribute('cx')||e.getAttribute('x'),e.getAttribute('cy')||e.getAttribute('y'),e.textContent]));
    const editorPaper=await artwork(page.locator(diagram).first());
    await page.locator(diagram).first().click();
    const editorZoom=await artwork(page.locator('[data-paper-form-detail]'));
    for(const finger of ['小','親'])assert(editorZoom.some(mark=>mark.at(-1)===finger));
    await page.click('[data-form-close]');
    await page.click('#sc-song-preview');
    await page.locator('.sheet-bar.sc-playing-bar[data-bar-number="1"]').waitFor();
    await page.click('#sc-song-preview');
    await page.click('#sc-curve-menu-toggle');await page.click('#sc-export-viewer');
    await page.click('[data-export-choice=export-save]');await page.click('[data-export-complete=open]');
    const view=page.locator('.sv-paper');await view.locator(diagram).waitFor();
    assert.deepEqual(await artwork(view.locator(diagram)),editorPaper);
    await view.locator(diagram).click();
    assert.deepEqual(await artwork(page.locator('.sc-readonly-form[open]')),editorZoom);
    await page.getByRole('dialog').getByRole('button',{name:'閉じる'}).click();
    const notes=await page.evaluate(async id=>{
        const host=await CruiseStudio.scoreViewer.ready(),song=host.read().document.score;
        const {createStudioViewerContract}=await import('/apps/cruise-studio/js/modules/sheet-cruise/viewer-contract.mjs');
        const audio=createStudioViewerContract({schema:CruiseStudio.model.schema2});
        return [audio.playbackPlan(song),audio.tickPlan(song)].map(plan=>plan.events
            .filter(e=>e.part==='guitar'&&e.sourceEventId===id&&e.tick===0).map(e=>[e.string,e.midi]));
    },id);
    for(const played of notes)assert.deepEqual(played,[[6,43],[5,48],[4,52],[3,55],[2,62]]);
    await page.click('[data-viewer-action=play]');
    await page.waitForFunction(async()=>(await CruiseStudio.scoreViewer.ready()).playback()?.stats.parts.guitar>0);
    await page.click('[data-viewer-action=play]');
});

for (const engine of ['chrome','webkit']) test('measure note values, legacy sustains and history: '+engine, async t => {
    const server = await startServer(), origin = 'http://127.0.0.1:'+server.address().port;
    t.after(() => stopServer(server));
    const browser = engine === 'chrome' ? await chromium.launch({channel:'chrome'}) : await webkit.launch();
    t.after(() => browser.close());
    const page = await browser.newPage({viewport:{width:1450,height:950},serviceWorkers:'block'});
    page.setDefaultTimeout(5500);
    await page.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
    await page.addInitScript(() => {
        window.playedLengths = [];
        window.playedSpans = [];
        const proto = AudioBufferSourceNode.prototype, originalStart = proto.start, originalStop = proto.stop;
        const starts = new WeakMap();
        proto.start = function(time,...args) { starts.set(this,time); return originalStart.call(this,time,...args); };
        proto.stop = function(time) {
            if (starts.has(this) && Number.isFinite(time)) {
                window.playedLengths.push(time-starts.get(this));
                window.playedSpans.push([starts.get(this),time]);
            }
            return originalStop.apply(this,arguments);
        };
    });
    const errors = [];
    page.on('pageerror', e => errors.push(e.stack));
    await page.goto(origin+'/apps/cruise-studio/');
    await page.click('#open-sheet-cruise');
    const snapshot = () => page.evaluate(() => CruiseStudio.sheetCruise.getSession().workingSnapshot());
    const fixture = await page.evaluate(() => {
        const model = CruiseStudio.model, song = model.createEmptyProject();
        model.setBarDoremiText(song,2,'ソ〜〜〜ラ');
        return song;
    });
    await page.locator('#sc-import-json').setInputFiles({name:'音価テスト.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
    await page.waitForFunction(id => CruiseStudio.sheetCruise.getSession().draft.projectId===id,fixture.projectId);
    const imported = await snapshot(), legacy = imported.bars[1].melody;
    assert.deepEqual(legacy.map(e=>[e.onsetTick,e.durationTicks]),[[0,960],[960,240]]);
    await page.locator('.sheet-bar').first().press('Enter');
    const measure = page.locator('.editor-measure').first();
    const row = measure.locator('[data-row-resolution=doremi]');
    const cell = tick => measure.locator('.slot-overlay-row--doremi [data-cell-value="'+tick+'"]');
    const field = tick => measure.locator('[data-overlay-field=doremi][data-slot-tick="'+tick+'"]');
    const before = await snapshot();
    const labelGap = await measure.locator('.slot-overlay-row--strum .slot-overlay-row-label').evaluate(el =>
        el.querySelector('select').getBoundingClientRect().left - el.firstElementChild.getBoundingClientRect().right);
    assert(labelGap >= 5, 'stroke label gap: '+labelGap);
    assert.equal(await cell(0).evaluate(el=>getComputedStyle(el).fontSize),'9px');
    const picker=page.getByRole('dialog',{name:'マスの音価'});
    const dot=picker.getByRole('checkbox',{name:'付点'});
    await cell(0).click();
    const optionTops=await picker.getByRole('radio').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
    assert(Math.max(...optionTops)-Math.min(...optionTops)<1);
    for (const name of ['全','2分','4分','8分','16分','32分']) {
        await picker.getByRole('radio',{name,exact:true}).check();
        assert.equal(await dot.isEnabled(), name!=='全' && name!=='32分');
    }
    for (const [name,ticks] of [['2分',1440],['4分',720],['16分',180]]) {
        await picker.getByRole('radio',{name,exact:true}).check();
        await dot.check();
        await picker.getByText('適用',{exact:true}).click();
        assert.equal(await field(0).getAttribute('data-slot-ticks'),String(ticks));
        await page.click('#sc-undo',{force:true});
        await cell(0).click();
    }
    await picker.getByRole('radio',{name:'32分',exact:true}).check();
    await picker.getByText('適用',{exact:true}).click();
    for (const [tick,pitch] of [[0,'ド'],[60,'レ']]) {
        await field(tick).fill(pitch);
        await field(tick).press('Tab');
    }
    const fine = await snapshot();
    assert.deepEqual(fine.bars[0].melody.map(e=>[e.onsetTick,e.durationTicks]),[[0,60],[60,60]]);
    await page.locator('[data-bar-preview]').click();
    await page.waitForFunction(bpm=>{
        const duration=60/bpm/8, close=(a,b)=>Math.abs(a-b)<.001;
        return window.playedSpans.some(([start,end])=>close(end-start,duration) &&
            window.playedSpans.some(([next,stop])=>close(next,end) && close(stop-next,duration)));
    },fine.songInfo.bpm);
    await page.locator('[data-bar-preview]').click();
    for (let i=0;i<3;i++) await page.click('#sc-undo',{force:true});
    assert.deepEqual(await snapshot(),before);
    await cell(0).click();
    await picker.getByRole('radio',{name:'8分',exact:true}).check();
    await dot.check();
    await picker.getByText('適用',{exact:true}).click();
    assert.equal(await cell(0).textContent(),'8·');
    assert.equal(await cell(360).textContent(),'16');
    for (const [tick,pitch] of [[0,'ド'],[360,'レ']]) {
        await field(tick).fill(pitch);
        await field(tick).press('Tab');
    }
    const dotted = await snapshot();
    assert.deepEqual(dotted.bars[0].melody.map(e=>[e.pitch.step,e.onsetTick,e.durationTicks]),[['C',0,360],['D',360,120]]);
    await page.locator('[data-bar-preview]').click();
    await page.waitForFunction(bpm=>{
        const beat=60/bpm, close=(a,b)=>Math.abs(a-b)<.001;
        return window.playedSpans.some(([start,end])=>close(end-start,beat*.75) &&
            window.playedSpans.some(([next,stop])=>close(end,next) && close(stop-next,beat*.25)));
    },dotted.songInfo.bpm);
    await page.locator('[data-bar-preview]').click();
    for (let i=0;i<3;i++) await page.click('#sc-undo',{force:true});
    assert.deepEqual(await snapshot(),before);
    await row.selectOption('8');
    await cell(1680).click();
    assert(await dot.isDisabled());
    await picker.getByText('キャンセル',{exact:true}).click();
    await cell(240).press('ArrowDown');
    assert.equal(await row.inputValue(),'');
    assert.equal(await row.locator(':checked').textContent(),'混在');
    assert(await row.evaluate(el=>{
        const style=getComputedStyle(el), canvas=document.createElement('canvas'), ctx=canvas.getContext('2d');
        ctx.font=style.font;
        return el.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)>=ctx.measureText('混在').width;
    }));
    assert.deepEqual(await measure.locator('.slot-overlay-row--doremi input[data-slot-tick]').evaluateAll(nodes=>nodes.slice(0,3).map(n=>[+n.dataset.slotTick,+n.dataset.slotTicks])), [[0,240],[240,120],[360,120]]);
    const mixed = await snapshot();
    assert.deepEqual(mixed.bars,before.bars);
    await page.click('#sc-undo',{force:true});
    assert.equal(await row.inputValue(),'8');
    await page.click('#sc-redo',{force:true});
    assert.deepEqual((await snapshot()).extensions,mixed.extensions);
    await cell(480).click();
    await picker.getByRole('radio',{name:'2分',exact:true}).check();
    await picker.getByText('適用',{exact:true}).click();
    await field(480).fill('ド');
    await field(480).press('Tab');
    await page.waitForFunction(() => CruiseStudio.sheetCruise.getSession().draft.bars[0].melody.some(e=>e.onsetTick===480 && e.durationTicks===960));
    let song = await snapshot();
    assert.deepEqual(song.bars[1].melody,legacy);
    const playback = await page.evaluate(async () => {
        const song=CruiseStudio.sheetCruise.getSession().workingSnapshot();
        const {buildBarPreviewPlan} = await import('/apps/cruise-studio/js/modules/sheet-cruise/score-playback.mjs');
        const plan=buildBarPreviewPlan(song,0,{melodyOnly:true,pitchMidi:CruiseStudio.model.schema2.pitchMidi});
        return plan.events.filter(e=>e.part==='piano').map(e=>[e.tick,e.duration*song.songInfo.bpm/60]);
    });
    assert.deepEqual(playback,[[480,2]]);
    await page.locator('[data-bar-preview]').click();
    await page.waitForFunction(bpm=>window.playedLengths.some(n=>Math.abs(n-120/bpm)<0.001),song.songInfo.bpm);
    await page.locator('[data-bar-preview]').click();
    await cell(0).click();
    assert(await picker.getByRole('radio',{name:'2分',exact:true}).isDisabled());
    await picker.getByRole('radio',{name:'4分',exact:true}).check();
    assert(await dot.isDisabled());
    await picker.getByText('キャンセル',{exact:true}).click();
    assert.equal(await field(480).inputValue(),'ド');
    await row.selectOption('4');
    await page.getByRole('dialog',{name:'行の音価をそろえる'}).getByText('適用',{exact:true}).click();
    assert.equal((await snapshot()).bars[0].melody[0].durationTicks,480);
    await page.click('#sc-undo',{force:true});
    assert.deepEqual((await snapshot()).bars,song.bars);
    await page.click('#sc-redo',{force:true});
    assert.equal((await snapshot()).bars[0].melody[0].durationTicks,480);
    assert.deepEqual((await snapshot()).bars[1].melody,legacy);
    // Every lane is independent, including when two measures are edited side by side.
    await page.locator('[data-editor-bars="2"]').click();
    const second = page.locator('.editor-measure').nth(1);
    for (const lane of ['lyrics','chord','strum']) {
        const stateBefore = await snapshot();
        const select = measure.locator('[data-row-resolution="'+lane+'"]');
        await select.selectOption('16');
        const confirm = page.getByRole('dialog',{name:'行の音価をそろえる'});
        if (await confirm.isVisible()) await confirm.getByText('適用',{exact:true}).click();
        assert.equal(await select.inputValue(),'16');
        assert.equal(await second.locator('.slot-overlay-row--'+lane+' [data-cell-value]').count(),16);
        assert.equal(await measure.locator('.slot-overlay-row--'+lane+' [data-cell-value]').count(),16);
        assert.deepEqual((await snapshot()).bars[1].melody,legacy);
        await page.keyboard.press(engine==='webkit'?'Meta+z':'Control+z');
        assert.deepEqual(await snapshot(),stateBefore);
        await page.keyboard.press(engine==='webkit'?'Meta+Shift+z':'Control+Shift+z');
        assert.equal(await select.inputValue(),'16');
    }
    // Focusing another bar changes the editing cursor, but not the page stride.
    const visibleBars = () => page.locator('.editor-measure').evaluateAll(nodes => nodes.map(n => Number(n.dataset.barNumber)));
    await second.locator('[data-overlay-field="chord"]').first().focus();
    await page.getByRole('button',{name:'次へ →',exact:true}).click();
    assert.deepEqual(await visibleBars(),[3,4]);
    await page.locator('.editor-measure').first().locator('.dock-lyrics-cell').first().press('Shift+Tab');
    assert.deepEqual(await visibleBars(),[1,2]);
    await second.locator('.dock-lyrics-cell').last().press('Enter');
    assert.deepEqual(await visibleBars(),[3,4]);
    await page.getByRole('button',{name:'← 前へ',exact:true}).click();
    assert.deepEqual(await visibleBars(),[1,2]);
    const edited = await snapshot();
    const exported = await page.evaluate(() => CruiseStudio.storage.exportProjectJson(CruiseStudio.sheetCruise.getSession().workingSnapshot()));
    // Read back the exported file in a fresh tab with an isolated browser store.
    const reader = await browser.newPage({serviceWorkers:'block'});
    await reader.route('**/*', r=>new URL(r.request().url()).origin===origin ? r.continue() : r.abort());
    await reader.goto(origin+'/apps/cruise-studio/');
    await reader.click('#open-sheet-cruise');
    await reader.locator('#sc-import-json').setInputFiles({name:'音価を変更した譜面.json',mimeType:'application/json',buffer:Buffer.from(exported)});
    await reader.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,edited.projectId);
    await reader.locator('.sheet-bar').first().press('Enter');
    assert.equal(await reader.locator('[data-row-resolution=doremi]').first().inputValue(),'4');
    const reopened=await reader.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
    assert.deepEqual(reopened.extensions,edited.extensions);
    assert.deepEqual(reopened.bars,edited.bars);

    // A beat division is visible in both grids while the sounding note keeps its duration.
    const grouped=structuredClone(reopened), firstBar=grouped.bars[0];
    grouped.projectId=crypto.randomUUID();
    firstBar.melody=[{...legacy[0],id:crypto.randomUUID(),onsetTick:360,durationTicks:360}];
    grouped.extensions.scoreCellValuesV1[firstBar.id].doremi=[0,360,480,720,960,1440];
    grouped.extensions.scoreCellValuesV1[firstBar.id].melodyBeatGrouping=true;
    await reader.locator('.slot-overlay-close').click();
    await reader.locator('#sc-import-json').setInputFiles({name:'拍をまたぐ音.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(grouped))});
    await reader.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,grouped.projectId);
    await reader.locator('.sheet-bar').first().press('Enter');
    const melody=reader.locator('.editor-measure').first().locator('.slot-overlay-row--doremi');
    assert.equal(await melody.locator('[data-cell-value="360"]').innerText(),'16');
    assert.equal(await melody.locator('[data-cell-value="480"]').innerText(),'8');
    assert.equal(await melody.locator('[data-piano-sustain]').innerText(),'〜');
    assert.equal(await reader.locator('.sheet-bar').first().locator('.sheet-bar-doremi [data-slot-tick="480"]').innerText(),'〜');
    assert.deepEqual(await reader.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot().bars[0].melody),firstBar.melody);
    // The field and the duration badge share shortcuts and retain keyboard focus after redraw.
    const quarter=melody.locator('[data-overlay-field="doremi"][data-slot-tick="960"]');
    const value=melody.locator('[data-cell-value="960"]');
    await quarter.focus();
    await reader.keyboard.press('Shift++');
    assert.equal(await value.textContent(),'8');
    assert(await quarter.evaluate(e=>document.activeElement===e));
    await reader.keyboard.press('.');
    assert.equal(await value.textContent(),'8·');
    await value.focus();
    await reader.keyboard.press('.');
    await reader.keyboard.press('Shift+-');
    assert.equal(await value.textContent(),'4');
    assert(await value.evaluate(e=>document.activeElement===e));

    // macOS Japanese input: WebKit can deliver marked text before the first keydown.
    await quarter.focus();
    const beforeIme=await quarter.inputValue();
    await quarter.evaluate(field=>{
        const composition=(type,data)=>new CompositionEvent(type,{bubbles:true,data});
        field.dispatchEvent(composition('compositionstart',''));
        field.dispatchEvent(composition('compositionupdate','＋'));
        field.value='＋';
        field.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'＋',inputType:'insertCompositionText'}));
        field.addEventListener('blur',()=>field.dispatchEvent(composition('compositionend','＋')),{once:true});
        field.dispatchEvent(new KeyboardEvent('keydown',{
            bubbles:true,cancelable:true,key:'+',code:'Semicolon',shiftKey:true,isComposing:true,keyCode:229
        }));
    });
    await reader.waitForFunction(()=>document.querySelector('.slot-overlay-row--doremi [data-cell-value="960"]')?.textContent==='8');
    assert.equal(await quarter.inputValue(),beforeIme);
    assert.deepEqual(await reader.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot().bars[0].melody),firstBar.melody);
    assert.deepEqual(errors,[]);
});
