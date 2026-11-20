const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {chromium, webkit} = require('playwright');
const {saveFromToolbar} = require('./helpers/viewer-regression-choices.cjs');

let directory, manifest, output;
const startServer=async()=> (await import('../scripts/serve-score-candidate.mjs')).serveScoreCandidate(output);
const stopServer=server=>new Promise(resolve=>server.close(resolve));
test.before(async () => {
    const {packageScoreCandidate} = await import('../scripts/package-score-candidate.mjs');
    if (process.env.SCORE_CANDIDATE_DIR) {
        output = path.resolve(process.env.SCORE_CANDIDATE_DIR);
        manifest = JSON.parse(await fs.readFile(path.join(output,'RELEASE-MANIFEST.json'),'utf8'));
    } else {
        directory = await fs.mkdtemp(path.join(os.tmpdir(),'score-candidate-test-'));
        output = path.join(directory,'distribution');
        manifest = packageScoreCandidate(output);
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

for (const engine of ['chrome','webkit']) for (const edition of ['standard','pro'])
test('packaged score creation, persistence, export and playback: '+engine+' '+edition,async t=>{
    const server=await startServer(), origin='http://127.0.0.1:'+server.address().port;
    t.after(()=>server.listening && stopServer(server));
    const browser = await (engine==='chrome'?chromium.launch({channel:'chrome'}):webkit.launch());
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
    await card.locator('[data-score-apply]').click();
    for(const menu of ['#sc-edit-chord-preset','#sc-edit-rhythm']) {
        await editor.click('#sc-curve-menu-toggle');
        await editor.click(menu);
        const dialog = editor.locator('[data-score-dialog]');
        await dialog.getByLabel('曲全て').check();
        await dialog.locator('[data-preset-stage]').click();
        await dialog.locator('[data-score-apply]').click();
        await dialog.waitFor({state:'detached'});
    }
    const snapshot=()=>editor.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
    if(engine==='chrome') await editor.evaluate(()=>{
        window.showSaveFilePicker=async()=>(await navigator.storage.getDirectory()).getFileHandle('candidate.json',{create:true});
    });
    await editor.click('#sc-save');
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
    assert.equal(exported.source.studioVersion,manifest.version);
    await editor.click('[data-viewer-action=play]');
    await editor.waitForFunction(async()=>{
        const playing=(await CruiseStudio.scoreViewer.ready()).playback();
        return playing?.barIndex>=1 && playing.stats.parts.guitar>0;
    });
    await editor.click('[data-viewer-action=play]');
    assert.deepEqual(await snapshot(),saved);

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

for(const engine of ['chrome','webkit'])
test('packaged tutorial plays and seeks from the editor guide: '+engine,async t=>{
    const server=await startServer(), origin='http://127.0.0.1:'+server.address().port;
    t.after(()=>stopServer(server));
    const browser=await(engine==='chrome'?chromium.launch({channel:'chrome'}):webkit.launch());
    t.after(()=>browser.close());
    const editor=await browser.newPage();
    await editor.goto(origin+'/apps/cruise-studio/');
    await editor.click('#open-sheet-cruise');
    const opened=editor.waitForEvent('popup');
    await editor.click('#sc-score-guide');
    const guide=await opened;
    const video=guide.locator('#lesson video');
    await video.evaluate(async element=>{element.muted=true;await element.play();});
    await guide.waitForFunction(()=>document.querySelector('video')?.currentTime>0.2);
    const end=await video.evaluate(element=>{
        element.currentTime=element.duration-2;
        return element.duration;
    });
    await guide.waitForFunction(t=>document.querySelector('video').currentTime>t,end-1.9);
    assert(await video.evaluate(element=>element.videoWidth>0 && !element.error));
    await guide.close();
});
