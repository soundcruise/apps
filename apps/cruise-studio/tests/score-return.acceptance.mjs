/* Actual public Studio page. Called from the existing isolated Account/Pro product runner. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
export async function acceptLocalCreation(page, output) {
 const C=()=>page.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await page.screenshot({path:output+'/creation-home.png'});
 await page.locator('#open-sheet-cruise').click();await page.locator('#sc-new-project').click();
 await page.locator('#sc-editor-drawer').evaluate(e=>e.open=true);
 await page.locator('#sc-title').fill('夜航テスト — Original');await page.locator('#sc-title').press('Tab');
 await page.locator('#sc-bpm').fill('116');await page.locator('#sc-bpm').press('Tab');
 await page.locator('#sc-editor-drawer').evaluate(e=>e.open=false);
 await page.locator('.sheet-bar').first().focus();await page.keyboard.press('Enter');await settle();
 await page.locator('[data-overlay-field=chord]').fill('C');await page.locator('[data-overlay-field=chord]').press('Tab');
 await page.locator('.dock-lyrics-cell').first().fill('夜');await page.locator('.dock-lyrics-cell').first().press('Tab');
 await page.locator('[data-overlay-field=doremi]').fill('ド レ ミ');await page.locator('[data-overlay-field=doremi]').press('Tab');
 await page.locator('.dock-strum-cell').first().click();await settle();
 // Reuse the preserved native CAGED form UI and qualification, then undo the adoption.
 await page.locator('#sc-chord-forms').click();await page.locator('#form-event').selectOption({index:1});await page.locator('#form-open').click();
 await page.locator('#form-instrument').check();await page.locator('#form-max-fret').fill('24');await page.locator('#form-preview').click();
 assert(await page.locator('#form-position option').count()>1);
 for(const n of [1,2,3,4,5])await page.locator('[data-form-string="'+n+'"]').check();
 await page.locator('#form-adopt').click();await page.waitForFunction(()=>CruiseStudio.documents.getSession().draft.performance.formBindings.length===1);
 const voiced=await page.evaluate(()=>CruiseStudio.arrangement.generateArrangement(CruiseStudio.documents.getSession().workingSnapshot()).bars[0].guitarNotes);
 assert.deepEqual([...new Set(voiced.map(n=>n.midi))].sort((a,b)=>a-b),[48,52,55,60,64]);
 await page.locator('#sc-undo').click();assert.equal((await C()).performance.formBindings.length,0);
 await page.locator('#sc-redo').click();assert.equal((await C()).performance.formBindings.length,1);
 await page.locator('#sc-chord-forms').click();
 const song=await C();assert.equal(song.schemaVersion,2);assert.equal(song.songInfo.bpm,116);
 assert.equal(song.bars[0].chords[0].symbol,'C');assert(song.bars[0].melody.length);assert(song.bars[0].lyrics.length);
 await page.locator('[data-bar-operation=duplicateBar]').click();await settle();
 assert.equal((await C()).bars.length,song.bars.length+1);
 await page.locator('#sc-undo').click();assert.deepEqual(await C(),song);
 await page.locator('#sc-redo').click();assert.equal((await C()).bars.length,song.bars.length+1);
 // Workspace changes keep the same unsaved draft and history, while the right tool is independent.
 const draft=await C(),history=await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory());
 await page.evaluate(()=>window.scoreNode=document.getElementById('screen-sheet-cruise'));
 await page.locator('#screen-sheet-cruise [data-open-tool=metronome]').click();
 await page.waitForFunction(()=>document.querySelector('#studio-tool-window iframe')?.contentDocument?.body?.dataset.componentState==='ready');
 assert.equal(await page.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),'sheetCruise');assert.deepEqual(await C(),draft);
 await page.screenshot({path:output+'/score-and-metronome.png'});await page.locator('#studio-tool-toggle').click();assert.deepEqual(await C(),draft);
 await page.locator('[data-workspace=home]').click();await page.locator('#open-pre-dtm').click();
 assert.equal(await page.locator('#pd-content').isVisible(),true);assert((await page.locator('#pd-preview-body tr').count())>0);
 await page.screenshot({path:output+'/predtm-events.png'});
 let d=page.waitForEvent('download');await page.locator('#pd-export-json').click();const arr=JSON.parse(fs.readFileSync(await(await d).path(),'utf8'));assert(arr.generatedEvents.bass.length);assert(arr.generatedEvents.drums.length);
 d=page.waitForEvent('download');await page.locator('#pd-export-midi').click();const midi=fs.readFileSync(await(await d).path());assert.equal(midi.subarray(0,4).toString(),'MThd');assert(midi.includes(Buffer.from('Guitar')));assert(midi.includes(Buffer.from([0xc1,24])));
 await page.locator('#pd-goto-sheet').click();assert.deepEqual(await C(),draft);assert.deepEqual(await page.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory()),history);
 assert(await page.evaluate(()=>scoreNode===document.getElementById('screen-sheet-cruise')));
 await page.locator('#sc-save').click();await page.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty&&!CruiseStudio.sheetCruise.getSession().commitInFlight);
 const saved=await C();assert.equal(saved.schemaVersion,2);
 d=page.waitForEvent('download');await page.locator('#sc-export-json').click();const file=JSON.parse(fs.readFileSync(await(await d).path(),'utf8'));assert.deepEqual(file,saved);
 await page.reload();await page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized());await page.locator('#open-sheet-cruise').click();assert.deepEqual(await C(),saved);
 await page.locator('#sc-import-json').setInputFiles({name:'original.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
 await page.waitForFunction(()=>document.getElementById('sc-save-status').textContent.includes('読み込'));
 assert.deepEqual((await C()).bars,saved.bars);
 // JSON import remains a draft until explicit save, no automatic overwriting of an existing Project.
 await page.locator('#sc-save').click();await page.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty&&!CruiseStudio.sheetCruise.getSession().commitInFlight);
 await page.locator('#sc-editor-drawer').evaluate(e=>e.open=false);
 for(const theme of ['dark','midnight','charcoal','gray','light']){
  await page.evaluate(t=>CruiseStudio.colorTheme.setColorTheme(t),theme);
  for(const width of [1440,1024,768,390]){
   await page.setViewportSize({width,height:1000});await settle();
   const size=await page.locator('#studio-main').evaluate(e=>({w:e.clientWidth,scroll:e.scrollWidth}));assert(size.scroll<=size.w+1,theme+' '+width+' horizontal overflow');
   if(width===1440||width===390)await page.screenshot({path:output+'/score-'+theme+'-'+width+'.png'});
  }
 }
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({media:'print'});await page.pdf({path:output+'/original-score.pdf',format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});
 assert(fs.statSync(output+'/original-score.pdf').size>1000);
 // Read a genuine legacy schema1 Project without overwriting its persisted bytes.
 const legacy=await page.evaluate(()=>{
  const C=CruiseStudio,p=C.model.createLegacySampleProject();p.projectId='legacy-return-fixture';p.songInfo.title='Legacy preserved';
  const raw=JSON.stringify(p),key='cruiseStudio.project.'+p.projectId;localStorage.setItem(key,raw);
  const index=JSON.parse(localStorage.getItem('cruiseStudio.projects.index')||'[]');index.push({projectId:p.projectId,title:p.songInfo.title,updatedAt:p.updatedAt});localStorage.setItem('cruiseStudio.projects.index',JSON.stringify(index));return {key,raw};
 });
 await page.reload();await page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized());await page.locator('#open-sheet-cruise').click();
 await page.selectOption('#sc-project-select','legacy-return-fixture');assert.equal((await C()).schemaVersion,2);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),legacy.key),legacy.raw,'opening legacy data never rewrites the stored Project');
 await page.locator('#sc-save').click();await page.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty&&!CruiseStudio.sheetCruise.getSession().commitInFlight);
 assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).schemaVersion,legacy.key),2);
 return {formQualifiedGuitar:true,formSaveReload:true,guitarMIDI:true,legacyReadPreserved:true,explicitLegacySave:true,schema:2,newEditSaveReload:true,existingProjectRead:true,undoRedo:true,jsonRoundTrip:true,pdf:true,preDtmJSON:true,preDtmMIDI:true,workspaceDraftPreserved:true,themes:5,widths:[1440,1024,768,390],projectCloud:false};
}
