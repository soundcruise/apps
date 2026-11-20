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
