// Disposable local profiles. No real accounts, Sync, production URLs or audio output.
const test = require('node:test'), assert = require('node:assert/strict'), {chromium,webkit} = require('playwright');
const origin = 'http://127.0.0.1:18874';
for (const engine of ['chrome','webkit']) test('viewer stage 0: ' + engine, async t => {
    const {createUITestProject} = await import('../scripts/create-ui-test-project.mjs');
    const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}));
    const context = await browser.newContext({viewport:{width:1440,height:1000}}), page = await context.newPage(), errors = [], external = [];
    page.on('pageerror',e => errors.push(e.message));
    await context.route('**/*',r => { if (new URL(r.request().url()).origin !== origin) { external.push(r.request().url()); return r.abort(); } return r.continue(); });
    try {
        await page.goto(origin); await page.click('#open-sheet-cruise');
        const project = createUITestProject();
        await page.locator('#sc-import-json').setInputFiles({name:'viewer-stage0.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
        await page.waitForFunction(id => CruiseStudio.sheetCruise.getSession().draft.projectId === id,project.projectId);
        await page.evaluate(async () => {
            const C = CruiseStudio, {createStudioViewerContract} = await import('/apps/cruise-studio/js/modules/sheet-cruise/viewer-contract.mjs');
            const score = C.sheetCruise.getSession().workingSnapshot();
            score.extensions = {scoreLayoutV1:{version:1,holes:[{id:'viewer-hole',sectionId:score.sections[0].id,beforeBarId:null}],fills:[]}};
            const contract = createStudioViewerContract({schema:C.model.schema2}), file = await contract.codec.encode(score,{documentId:'browser-viewer',revisionId:'v1',exportedAt:'2026-11-16T00:00:00.000Z',studioVersion:'0.144.0-dev.1'});
            const reader = contract.createReader(); await reader.open(file.text);
            const host = document.createElement('div'); host.id = 'viewer-test-host'; host.style.cssText = 'background:white;color:black;width:794px'; document.body.appendChild(host);
            const original = JSON.stringify({project:C.sheetCruise.getSession().workingSnapshot(),history:C.sheetCruise.getSession().getHistory(),storage:{...localStorage}});
            window.__viewer = {score,contract,file,reader,host,original};
        });
        await t.test('readOnly rendering preserves music/forms/holes and removes all editing activation attributes', async () => {
            const result = await page.evaluate(() => {
                const {reader,host} = __viewer, C = CruiseStudio, p = reader.read().document.score;
                const formView = C.localPaperForms.view(p);
                reader.renderWith(C.sheetRenderer,host,{formsForBar:n => formView.row(n),editableSlots:true,barsPerLine:4,contentKey:'viewer-1'});
                return {bars:host.querySelectorAll('.sheet-bar[data-bar-number]').length,
                    forms:host.querySelectorAll('.sheet-form-event svg').length, holes:host.querySelectorAll('.sheet-bar--empty').length,
                    edit:host.querySelectorAll('[data-paper-edit],[data-editable-empty],[data-empty-slot],[tabindex],[role=button],[aria-haspopup],button,input,textarea,[contenteditable]').length,
                    readonly:host.firstElementChild.dataset.scoreReadonly, lyrics:host.querySelector('.sheet-bar-lyrics').textContent,
                    scoreSame:JSON.stringify(p) === JSON.stringify(__viewer.score)};
            });
            assert.equal(result.bars,12); assert.equal(result.forms,24); assert(result.holes > 0); assert.equal(result.edit,0);
            assert.equal(result.readonly,'true'); assert(result.lyrics.includes('あ')); assert(result.scoreSame);
            await page.locator('#viewer-test-host .sheet-bar-chord').first().dblclick();
            await page.locator('#viewer-test-host .sheet-section-label').first().click();
            assert(await page.evaluate(() => __viewer.original === JSON.stringify({project:CruiseStudio.sheetCruise.getSession().workingSnapshot(),history:CruiseStudio.sheetCruise.getSession().getHistory(),storage:{...localStorage}})));
        });
        await t.test('mode transitions cannot retain editor DOM or its listeners, even with the same content key', async () => {
            const result = await page.evaluate(() => {
                const {reader,host,score} = __viewer, renderer = CruiseStudio.sheetRenderer;
                renderer.render(score,host,{editableSlots:true,reuseBars:true,contentKey:'same'});
                const editable = host.querySelector('.sheet-bar[data-bar-number]'); let leaked = 0; editable.addEventListener('click',() => leaked++);
                const hadButtons = host.querySelectorAll('[data-paper-edit],[role=button]').length > 0;
                reader.renderWith(renderer,host,{editableSlots:true,reuseBars:true,contentKey:'same'});
                const readonly = host.querySelector('.sheet-bar[data-bar-number]'); readonly.click();
                const clean = host.querySelectorAll('[data-paper-edit],[role=button],[tabindex]').length === 0;
                reader.renderWith(renderer,host,{reuseBars:true,contentKey:'same',barsPerLine:2});
                const reused = readonly === host.querySelector('.sheet-bar[data-bar-number]');
                renderer.render(score,host,{editableSlots:true,reuseBars:true,contentKey:'same'});
                return {hadButtons,clean,leaked,reused,editorRebuilt:readonly !== host.querySelector('.sheet-bar[data-bar-number]'),editorBack:host.querySelectorAll('[data-paper-edit],[role=button]').length > 0};
            });
            assert.deepEqual(result,{hadButtons:true,clean:true,leaked:0,reused:true,editorRebuilt:true,editorBack:true});
        });
        await t.test('file text stays text and missing artist never invites editing in readOnly output', async () => {
            const result = await page.evaluate(async () => {
                const {contract,host} = __viewer, p = JSON.parse(JSON.stringify(__viewer.score));
                p.songInfo.artist = ''; p.songInfo.title = '<img src="not-a-url" onerror="window.__viewerInjected=true">';
                const file = await contract.codec.encode(p,{documentId:'text-test',revisionId:'v1',exportedAt:'2026-11-16T00:00:00.000Z',studioVersion:'0.144.0-dev.1'});
                const reader = contract.createReader(); await reader.open(file.text); reader.renderWith(CruiseStudio.sheetRenderer,host);
                return {text:host.querySelector('.sheet-title').textContent,images:host.querySelectorAll('img').length,
                    artist:host.querySelectorAll('.sheet-artist--empty').length,injected:!!window.__viewerInjected};
            });
            assert.match(result.text,/<img/); assert.equal(result.images,0); assert.equal(result.artist,0); assert(!result.injected);
        });
        await t.test('browser codec, frozen score and shared clock preserve editor/storage and exact playback projection', async () => {
            const result = await page.evaluate(async () => {
                const {contract,file,reader,host,original} = __viewer, C = CruiseStudio, before = JSON.stringify(reader.read().document);
                reader.setPresentation({layout:{formScale:140,lyricsSize:22}});
                const roundtrip = await contract.codec.decode(new TextEncoder().encode(file.text));
                let now = 0; const clock = contract.createClock(roundtrip.document.score,{now:() => now}); clock.play(); now = .5;
                const at = clock.snapshot(); clock.setTempo(50); now = 1.5; const later = clock.snapshot(); clock.pause(); now = 100;
                const paused = clock.snapshot(), plan = contract.playbackPlan(roundtrip.document.score);
                reader.renderWith(C.sheetRenderer,host,{contentKey:'last'});
                return {same:before === JSON.stringify(reader.read().document),hash:roundtrip.byteHash === file.byteHash,
                    delta:later.tick - at.tick,paused:paused.tick === later.tick,guitar:plan.events.some(e => e.part === 'guitar'),piano:plan.events.some(e => e.part === 'piano'),
                    editorSame:original === JSON.stringify({project:C.sheetCruise.getSession().workingSnapshot(),history:C.sheetCruise.getSession().getHistory(),storage:{...localStorage}})};
            });
            assert.deepEqual(result,{same:true,hash:true,delta:400,paused:true,guitar:true,piano:true,editorSame:true});
        });
        assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
    } finally { await context.close(); await browser.close(); }
});
