// One continuous local workflow, using disposable storage and synthetic music.
const test=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const origin='http://127.0.0.1:18874';
for(const engine of ['chrome','webkit'])test('edit, save, export and perform without losing source: '+engine,async()=>{
 const {viewerFixture}=await import('./helpers/viewer-fixture.mjs'),f=viewerFixture();f.score.songInfo.bpm=400;
 const browser=await(engine==='chrome'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch());
 const c=await browser.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage(),errors=[],external=[];
 p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
 await c.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}return r.continue();});
 const snapshot=()=>p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
 async function exportMenu(){await p.click('#sc-curve-menu-toggle');await p.click('#sc-export-viewer');}
 try{
 await p.goto(origin);await p.waitForFunction(()=>document.documentElement.dataset.studioEntry==='ready');await p.click('#open-sheet-cruise');
 await p.locator('#sc-import-json').setInputFiles({name:'through-flow.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f.score))});
 await p.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,f.score.projectId);
 await p.locator('#sc-sheet-scale-box .sheet-bar').first().click({position:{x:4,y:4}});await p.click('#sc-edit-selected');await p.click('[data-editor-bars="2"]');
 const lyric=p.locator('.editor-measure[data-bar-number="2"] .slot-overlay-row--lyrics input').first();
 await lyric.fill('通');await p.locator('[data-row-resolution=lyrics]').first().click();
 assert(JSON.stringify((await snapshot()).bars[1].lyrics).includes('通'));
 await p.click('#sc-undo');assert(!JSON.stringify((await snapshot()).bars[1].lyrics).includes('通'));await p.click('#sc-redo');
 await p.locator('.editor-measure[data-bar-number="2"] [data-overlay-field=chord][data-slot-tick="960"]').focus();await p.click('[data-chord-toggle]');await p.click('[data-chord-symbol=Dm]');
 await p.click('[data-chord-close]');await p.click('.slot-overlay-close');
 assert.equal((await snapshot()).bars[1].chords.find(e=>e.onsetTick===960).symbol,'Dm');
 await p.click('#sc-save');await p.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);const saved=await snapshot();assert(await p.locator('#sc-save').isDisabled());
 await p.reload();await p.click('#open-sheet-cruise');await p.waitForFunction(()=>!!CruiseStudio.sheetCruise.getSession());assert.deepEqual(await snapshot(),saved);
 await p.click('#sc-curve-menu-toggle');await p.click('#sc-menu-display-settings');await p.locator('[data-layout-form-list]').check();await p.click('[data-layout-save]');
 await exportMenu();await p.click('[data-export-choice=folder-new]');await p.getByRole('textbox',{name:'新しいフォルダ名'}).fill('通し確認');await p.click('[data-export-choice=folder-create]');
 await p.waitForFunction(()=>document.querySelector('[data-export-folder]')?.selectedOptions[0]?.textContent==='通し確認');await p.click('[data-export-choice=export-save]');await p.click('[data-export-complete=close]');
 await exportMenu();await p.click('[data-export-choice=overwrite]');assert.equal(await p.locator('[data-export-folder] option:checked').textContent(),'通し確認');await p.click('[data-export-choice=export-save]');await p.click('[data-export-complete=close]');
 // Exercise the duplicate-name branch and cancellation before committing a copy.
 await exportMenu();await p.click('[data-export-choice=rename]');await p.locator('[data-export-name]').fill('通し確認・別名');await p.click('[data-export-choice=cancel]');
 await exportMenu();await p.click('[data-export-choice=rename]');await p.locator('[data-export-name]').fill('通し確認・別名');await p.click('[data-export-choice=rename-save]');await p.click('[data-export-complete=open]');
 await p.locator('.sv-paper .sheet-bar').first().waitFor();await p.evaluate(async()=>window.__throughViewer=await CruiseStudio.scoreViewer.ready());await p.waitForFunction(()=>__throughViewer.read()?.libraryTitle==='通し確認・別名');const copyRead=await p.evaluate(async()=>(await CruiseStudio.scoreViewer.ready()).read());const hash=copyRead.byteHash;
 assert.equal(await p.locator('.sv-paper .sc-form-list').count(),1);
 await p.locator('.sv-paper .sheet-bar[data-bar-number="1"]').click({position:{x:4,y:4}});await p.locator('.sv-paper .sheet-bar[data-bar-number="2"]').click({position:{x:4,y:4},modifiers:['Shift']});
 await p.locator('[data-viewer-action=repeat]').click();await p.locator('[data-viewer-action=sound-mute]').click();
 await p.locator('[data-viewer-action=play]').click();await p.locator('[data-viewer-playhead]').waitFor();await p.waitForTimeout(850);await p.locator('[data-viewer-action=play]').click();
 assert.equal(await p.locator('.sv-paper .sheet-bar.sv-selected').count(),2);assert.equal(await p.evaluate(async()=>(await CruiseStudio.scoreViewer.ready()).read().byteHash),hash);
 await p.click('[data-viewer-action=library]');await p.getByRole('button',{name:'通し確認（1曲）',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.sv-folder-heading strong')?.textContent==='通し確認');assert.equal(await p.locator('[data-library-entry]').count(),1);const originalEntry=await p.locator('[data-library-entry]').getAttribute('data-library-entry');await p.click('[data-library-action=open]');await p.evaluate(async()=>window.__throughViewer=await CruiseStudio.scoreViewer.ready());await p.waitForFunction(id=>__throughViewer.read()?.entryId===id,originalEntry);const reopened=await p.evaluate(async()=>(await CruiseStudio.scoreViewer.ready()).read());assert.match(reopened.byteHash,/^[a-f0-9]{64}$/);assert.notEqual(reopened.entryId,copyRead.entryId);assert.notEqual(reopened.byteHash,hash);assert.deepEqual(reopened.document.score.bars,saved.bars);await p.screenshot({path:'/private/tmp/score-through-'+engine+'-viewer.png'});
 await p.reload();await p.click('#open-score-viewer');await p.locator('.sv-paper .sheet-bar').first().waitFor();assert.equal(await p.evaluate(async()=>(await CruiseStudio.scoreViewer.ready()).read().byteHash),reopened.byteHash);
 await p.click('.studio-nav [data-workspace=sheetCruise]');assert.deepEqual(await snapshot(),saved);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 }catch(e){console.error(engine,await p.locator('body').innerText().then(t=>t.slice(-1800)));throw e;}finally{await c.close();await browser.close();}
});
