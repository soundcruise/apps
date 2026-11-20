async function setViewerFlow(p,value){const input=p.locator('[aria-label="譜面の配置"]');if(await input.isVisible())await input.selectOption(value);else{const menu=p.locator('.sv-file-menu:visible');await menu.evaluate(e=>e.open=true);await p.locator('[aria-label="メニューの配置"]').selectOption(value);await menu.locator('summary').click();}}
// Actual loopback UI, disposable profiles and synthetic scores only.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const origin='http://127.0.0.1:18874',out=process.env.VIEWER_QA_OUT;
const settle=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
for(const engine of ['chrome','webkit'])test('viewer stage 1: '+engine,async t=>{
    const {createUITestProject}=await import('../scripts/create-ui-test-project.mjs');
    const {viewerFixture}=await import('./helpers/viewer-fixture.mjs');
    const browser=await(engine==='webkit'?webkit.launch():chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}));
    async function fresh(fn,{noStorage=false}={}) {
        const c=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),p=await c.newPage(),errors=[],external=[];p.setDefaultTimeout(15000);
        p.on('pageerror',e=>errors.push(e.message));
        await c.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}return r.continue();});
        await require('./helpers/viewer-regression-choices.cjs').discardTemporaryViewerFiles(c);
        if(noStorage)await c.addInitScript(()=>Object.defineProperty(window,'indexedDB',{value:null}));
        try {await p.goto(origin);await p.waitForFunction(()=>document.documentElement.dataset.studioEntry==='ready');await fn(p,c);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);}
        finally {await c.close();}
    }
    async function exported(p) {
        await p.click('#open-sheet-cruise');const source=createUITestProject();
        await p.locator('#sc-import-json').setInputFiles({name:'source.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});
        await p.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,source.projectId);
        await p.evaluate(()=>CruiseStudio.localPaperLayout.set({barsPerLine:4,appearance:{visibility:{forms:true}}}));
        // The source fixture saves inside this disposable browser profile.
        await p.evaluate(()=>{if(typeof window.showSaveFilePicker==='function')window.showSaveFilePicker=async({suggestedName})=>{
            const directory=await navigator.storage.getDirectory();
            return directory.getFileHandle(suggestedName,{create:true});
        };});
        if(await p.locator('#sc-save').isEnabled())await p.click('#sc-save');await p.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);
        const before=await editorState(p),sourceText=await paperText(p,'#sc-sheet-scale-box');await p.click('#sc-curve-menu-toggle');
        await p.click('#sc-export-viewer');await p.waitForFunction(()=>document.getElementById('sc-save-status').textContent.includes('ライブラリに追加'));
        const text=await p.evaluate(async()=>{const {createViewerLibrary}=await import('/apps/score-viewer/core/library.mjs'),{createStudioViewerContract}=await import('/apps/cruise-studio/js/modules/sheet-cruise/viewer-contract.mjs');const l=createViewerLibrary({indexedDB,codec:createStudioViewerContract({schema:CruiseStudio.model.schema2}).codec});try{const row=(await l.list())[0];return new TextDecoder().decode((await l.read(row.documentId)).bytes);}finally{await l.close();}});
        // Simulate a different receiving browser for file-import/save regressions.
        await p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('cruiseStudio.viewer.library.v1');r.onsuccess=resolve;r.onerror=()=>reject(r.error);}));
        const bytes=Buffer.from(text),file=JSON.parse(text);assert.equal(file.format,'sound-cruise/score-view');
        assert.deepEqual(await editorState(p),before);return {bytes,file,before,sourceText};
    }
    async function paperText(p,host){return p.locator(host+' .sheet-bar[data-bar-number]').evaluateAll(bars=>bars.map(b=>['sheet-bar-chord','sheet-bar-strum','sheet-bar-lyrics','sheet-bar-doremi'].map(name=>b.querySelector('.'+name)?.textContent??null)));}
    async function editorState(p){return p.evaluate(()=>JSON.stringify({project:CruiseStudio.sheetCruise.getSession().workingSnapshot(),history:CruiseStudio.sheetCruise.getSession().getHistory(),storage:{...localStorage}}));}
    async function enter(p){await p.locator('.studio-nav [data-workspace=scoreViewer]').click();if(await p.getByRole('button',{name:'保存せず続行',exact:true}).isVisible())await p.getByRole('button',{name:'保存せず続行',exact:true}).click();await p.locator('[data-viewer-action=open]').waitFor({state:'attached'});}
    async function importBytes(p,bytes){await p.locator('[data-viewer-file]').setInputFiles({name:'test.cruise-score.json',mimeType:'application/json',buffer:bytes});await p.locator('.sv-paper .sheet-title').waitFor();await settle(p);}
    try {
        await t.test('tools entry opens a separate central screen with keyboard-accessible native file chooser',()=>fresh(async p=>{
            await p.click('#open-score-viewer');await p.locator('[data-viewer-action=open]').waitFor({state:'attached'});
            assert.equal(await p.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),'scoreViewer');
            assert(await p.locator('.sv-empty').isVisible());assert(await p.locator('[data-viewer-action=save]').isDisabled());
            const chooser=p.waitForEvent('filechooser');await p.locator('.sv-file-menu:visible').evaluate(e=>e.open=true);await p.locator('[data-viewer-action=open]').focus();await p.keyboard.press('Enter');await chooser;
            await p.locator('#screen-score-viewer .workspace-home').click();assert(await p.locator('#open-score-viewer').isVisible());
        }));
        await t.test('real export and import preserve canonical music/forms and never change editor/history/settings',()=>fresh(async p=>{
            const f=await exported(p);await enter(p);await importBytes(p,f.bytes);
            assert.equal(await p.locator('.sv-paper .sheet-bar[data-bar-number]').count(),12);
            assert.equal(await p.locator('.sv-paper .sheet-form-event svg').count(),24);
            assert.deepEqual(await paperText(p,'.sv-paper'),f.sourceText);
            assert.equal(await p.locator('.sv-paper [data-paper-edit],.sv-paper [role=button]:not(.sheet-form-event),.sv-paper [tabindex]:not(.sheet-form-event)').count(),0);
            await p.locator('.sv-paper .sheet-bar-chord').first().dblclick();assert.equal(await p.locator('#sc-slot-overlay:not(.hidden)').count(),0);
            assert.deepEqual(await editorState(p),f.before);
            if(out){fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,engine+'-desktop.png')});}
            await require('./helpers/viewer-regression-choices.cjs').saveFromToolbar(p,'viewer');await p.waitForFunction(()=>document.querySelector('[data-viewer-action=save]').hidden);
            assert(await p.locator('[data-viewer-action=save]').isDisabled());assert.deepEqual(await editorState(p),f.before);
        }));
        await t.test('saved library and last score survive reload; per-viewer display preferences never alter source files',()=>fresh(async p=>{
            const f=await exported(p);await enter(p);await importBytes(p,f.bytes);await require('./helpers/viewer-regression-choices.cjs').saveFromToolbar(p,'viewer');await p.waitForFunction(()=>document.querySelector('[data-viewer-action=save]').disabled);
            await p.locator('.sv-viewport:visible').dispatchEvent('wheel',{deltaY:-35,ctrlKey:true,bubbles:true,cancelable:true});
            await p.waitForFunction(()=>document.querySelector('[data-viewer-action=zoom-reset]').textContent!=='100%');
            await p.click('[data-viewer-action=zoom-reset]');
            await setViewerFlow(p,'source');await p.click('[data-viewer-action=zoom-in]');await p.waitForTimeout(300);
            await p.reload();await p.waitForFunction(()=>document.documentElement.dataset.studioEntry==='ready');await p.click('#open-score-viewer');await p.locator('.sv-paper .sheet-title').waitFor();
            assert.equal(await p.locator('[data-viewer-action=zoom-reset]').innerText(),'110%');assert.equal(await p.locator('[aria-label="譜面の配置"]').inputValue(),'source');
            assert(await p.locator('[data-viewer-action=save]').isDisabled());await p.locator('.sv-file-menu:visible').evaluate(e=>e.open=true);await p.click('[data-viewer-action=library]');await p.getByRole('button',{name:'未分類（',exact:false}).click();
            await p.locator('.sv-library [data-viewer-action=library-open]').waitFor();assert.equal(await p.locator('.sv-library [data-viewer-action=library-open]').count(),1);await p.click('[data-viewer-action=library-open]');await settle(p);
            assert.equal(await p.locator('.sv-paper .sheet-title').innerText(),f.file.score.songInfo.title);
            assert.equal(await p.evaluate(async id=>{const {createViewerLibrary}=await import('/apps/score-viewer/core/library.mjs');const {createStudioViewerContract}=await import('/apps/cruise-studio/js/modules/sheet-cruise/viewer-contract.mjs');const l=createViewerLibrary({indexedDB,codec:createStudioViewerContract({schema:CruiseStudio.model.schema2}).codec});const value=await l.read(id);await l.close();return new TextDecoder().decode(value.bytes);},f.file.viewerDocumentId),f.bytes.toString('utf8'));
        }));
        await t.test('invalid files preserve the currently displayed score and saving state',()=>fresh(async p=>{
            const f=await exported(p);await enter(p);await importBytes(p,f.bytes);const title=await p.locator('.sv-paper .sheet-title').innerText();
            await p.locator('[data-viewer-file]').setInputFiles({name:'bad.cruise-score.json',mimeType:'application/json',buffer:Buffer.from('{')});
            await p.waitForFunction(()=>document.querySelector('[data-viewer-status]').dataset.error==='true');
            assert.equal(await p.locator('.sv-paper .sheet-title').innerText(),title);assert(await p.locator('[data-viewer-action=save]').isEnabled());
            assert.deepEqual(await editorState(p),f.before);
        }));
        await t.test('long score zoom/reflow retains bars and forms and actually magnifies text',()=>fresh(async p=>{
            const f=viewerFixture(),{longProject}=require('../scripts/measure-score-geometry.cjs'),score=longProject(f.score,128);
            const file=await f.contract.codec.encode(score,f.metadata);await p.click('#open-score-viewer');await p.locator('[data-viewer-action=open]').waitFor({state:'attached'});await importBytes(p,Buffer.from(file.text));
            await setViewerFlow(p,'source');
            const height=await p.locator('.sv-paper .sheet-title').evaluate(e=>e.getBoundingClientRect().height);
            await p.evaluate(()=>window.__viewerOldBar=document.querySelector('.sv-paper .sheet-bar[data-bar-number]'));
            await p.click('[data-viewer-action=zoom-in]');await settle(p);
            assert(await p.locator('.sv-paper .sheet-title').evaluate((e,h)=>e.getBoundingClientRect().height>h,height));
            assert(await p.evaluate(()=>__viewerOldBar===document.querySelector('.sv-paper .sheet-bar[data-bar-number]')));
            assert.equal(await p.locator('.sv-paper .sheet-bar[data-bar-number]').count(),128);
            await setViewerFlow(p,'responsive');await p.setViewportSize({width:390,height:844});await settle(p);
            assert(await p.evaluate(()=>__viewerOldBar===document.querySelector('.sv-paper .sheet-bar[data-bar-number]')));
            assert.equal(await p.locator('.sv-paper .sheet-form-event svg').count(),score.performance.formBindings.length);
        }));
        await t.test('an asynchronous export is cancelled if the editor changes before completion',()=>fresh(async p=>{
            await p.click('#open-sheet-cruise');const source=createUITestProject();await p.locator('#sc-import-json').setInputFiles({name:'source.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await p.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,source.projectId);
            let release,seen=false,downloads=0;p.on('download',()=>downloads++);
            await p.route('**/viewer-contract.mjs?*',async route=>{seen=true;await new Promise(r=>release=r);await route.continue();});
            await p.click('#sc-curve-menu-toggle');await p.click('#sc-export-viewer');
            await p.waitForFunction(()=>document.querySelector('#sc-export-viewer').disabled);for(let i=0;i<30&&!seen;i++)await p.waitForTimeout(20);assert(seen);
            await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().runOperation('export race fixture',project=>{project.bars[0].lyrics[0].text='変更';}));release();
            await p.waitForFunction(()=>document.querySelector('#sc-save-status').textContent.includes('書き出しを中止'));assert.equal(downloads,0);
            assert.equal(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().draft.bars[0].lyrics[0].text),'変更');
        }));
        await t.test('portrait/landscape reflow stays readable, keeps the viewed bar and restores its position after reopening',()=>fresh(async p=>{
            const f=await exported(p);await enter(p);await p.setViewportSize({width:390,height:844});await importBytes(p,f.bytes);
            const count=async()=>p.locator('.sv-paper .sheet-line').first().evaluate(e=>e.dataset.lineCapacity);
            assert.equal(await count(),'1');
            assert(await p.locator('.sv-viewport').evaluate(e=>e.scrollWidth<=e.clientWidth+2));
            await p.locator('.sv-viewport').evaluate(e=>{const b=e.querySelector('.sheet-bar[data-bar-number="5"]');e.scrollTop+=b.getBoundingClientRect().top-e.getBoundingClientRect().top+10;});await p.waitForTimeout(250);
            if(out)await p.screenshot({path:path.join(out,engine+'-portrait.png')});
            await p.setViewportSize({width:844,height:390});await settle(p);await p.waitForTimeout(100);
            assert.equal(await count(),'2');
            assert(await p.locator('.sv-viewport').evaluate(e=>{const b=e.querySelector('.sheet-bar[data-bar-number="5"]').getBoundingClientRect(),r=e.getBoundingClientRect();return b.bottom>r.top&&b.top<r.bottom;}));
            assert(await p.locator('.sv-file-menu:visible summary').isVisible());
            if(out)await p.screenshot({path:path.join(out,engine+'-landscape.png')});
            for(let i=0;i<3;i++){await p.setViewportSize({width:390,height:844});await settle(p);await p.waitForTimeout(40);assert(await p.locator('.sv-viewport').evaluate(e=>{const b=e.querySelector('.sheet-bar[data-bar-number="5"]').getBoundingClientRect(),r=e.getBoundingClientRect();return b.bottom>r.top&&b.top<r.bottom;}));await p.setViewportSize({width:844,height:390});await settle(p);await p.waitForTimeout(40);}
            await require('./helpers/viewer-regression-choices.cjs').saveFromToolbar(p,'viewer');await p.waitForTimeout(300);await p.reload();await p.waitForFunction(()=>document.documentElement.dataset.studioEntry==='ready');await p.click('#open-score-viewer');await p.locator('.sv-paper .sheet-title').waitFor();await settle(p);
            assert(await p.locator('.sv-viewport').evaluate(e=>e.scrollTop>0));
        }));
        await t.test('unavailable storage leaves a working temporary viewer and never reports a successful save',()=>fresh(async p=>{
            const f=viewerFixture(),file=await f.contract.codec.encode(f.score,f.metadata);await p.click('#open-score-viewer');await p.locator('[data-viewer-action=open]').waitFor({state:'attached'});await importBytes(p,Buffer.from(file.text));
            await require('./helpers/viewer-regression-choices.cjs').saveFromToolbar(p,'viewer');await p.waitForFunction(()=>document.querySelector('[data-viewer-status]').dataset.error==='true');
            assert(await p.locator('[data-viewer-action=save]').isEnabled());assert.equal(await p.locator('.sv-paper .sheet-bar[data-bar-number]').count(),12);
            assert(!((await p.locator('[data-viewer-status]').innerText()).includes('保存しました')));
        },{noStorage:true}));
    } finally {await browser.close();}
});
