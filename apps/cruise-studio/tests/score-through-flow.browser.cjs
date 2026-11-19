// One continuous local workflow, using disposable storage and synthetic music.
const test=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const origin='http://127.0.0.1:18874';
for(const engine of ['chrome','webkit'])test('apply form and rhythm presets, save, export and perform without losing source: '+engine,async()=>{
 const {viewerFixture}=await import('./helpers/viewer-fixture.mjs'),f=viewerFixture();f.score.songInfo.bpm=400;
 const browser=await(engine==='chrome'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch());
 const c=await browser.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage(),errors=[],external=[];
 p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
 await c.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}return r.continue();});
 const snapshot=()=>p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
 async function openBatch(id){
  await p.click('#sc-curve-menu-toggle');await p.click(id);
  await p.locator('[data-preset-stage]').waitFor();
 }
 const closeBatch=()=>p.locator('[data-score-dialog]').waitFor({state:'detached'});
 const firstPreviewBar=()=>p.locator('.sc-preset-paper .sheet-bar[data-bar-number="1"]');
 const firstBarCellWidths=paper=>p.locator(paper+' .sheet-bar[data-bar-number="1"] .sheet-preset-strum [data-slot-ticks]')
  .evaluateAll(cells=>cells.map(cell=>Number(cell.dataset.slotTicks)));
 const rhythmSlots=(score,index)=>{
  const binding=score.performance.barRhythms.find(b=>b.barId===score.bars[index].id);
  return score.materials.rhythms.find(m=>m.id===(binding?.materialId||score.performance.basicRhythmId))
   .snapshot.slots.map(s=>[s.tick,s.action,s.durationTicks]);
 };
 const registeredForm=(score,event)=>{
  const binding=score.performance.formBindings.find(b=>b.chordEventId===event.id);
  return {binding,material:score.materials.forms.find(m=>m.id===binding.materialId)};
 };
 async function exportMenu(){await p.click('#sc-curve-menu-toggle');await p.click('#sc-export-viewer');}
 try{
 await c.addInitScript(()=>localStorage.setItem('rhythmCruiseCreatePresets:v1',JSON.stringify([{
  name:'通し確認ストローク',stageN:2,patternBars:1,
  pattern:['hit','tie','rest','hit','hit','rest','hit','hit'],
  dirs:['down',null,null,'up','down',null,'down','up']
 }])));
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
 // Save a modified form in a preset, cancel its first application, then commit it.
 const beforeBulk=await snapshot();
 await openBatch('#sc-edit-chord-preset');
 await p.getByRole('button',{name:'プリセットを編集',exact:true}).click();
 await p.getByRole('listitem',{name:'基本進行',exact:true}).getByRole('button',{name:'編集',exact:true}).click();
 const author=p.getByRole('dialog',{name:'プリセットを編集',exact:true});
 const firstChord=author.getByRole('textbox',{name:'1小節 1拍のコード',exact:true});
 await firstChord.fill('Dm');await firstChord.press('Enter');
 await author.getByRole('button',{name:'コード・フォームを編集',exact:true}).click();
 await author.locator('[data-chord-advanced]').click();
 await author.locator('[data-chord-shape="A"]').click();
 await author.locator('.score-chord-diagram .cc-fb-marker:not([data-fret="0"])').first().click();
 await author.getByRole('button',{name:'プリセットに保存',exact:true}).click();
 const savePreset=p.getByRole('dialog',{name:'プリセットに保存',exact:true});
 await savePreset.getByLabel('プリセット名').fill('通し確認コード');
 await savePreset.getByRole('button',{name:'保存',exact:true}).click();
 await author.waitFor({state:'detached'});
 const preset=await p.evaluate(()=>CruiseStudio.storage.getAppSetting('scoreChordPresetsLibraryV2').items
  .find(item=>item.name==='通し確認コード').pattern[0][0]);
 assert.equal(preset.form.material.provenance.shape,'A');
 assert.equal(preset.form.material.snapshot.ownerWarning,'変更した押さえ方は未確認');
 await firstPreviewBar().click({position:{x:4,y:4}});
 await p.click('[data-preset-stage]');
 assert(await p.locator('[data-score-apply]').isEnabled());
 assert.deepEqual(await snapshot(),beforeBulk);
 await p.click('[data-score-cancel]');await closeBatch();
 assert.deepEqual(await snapshot(),beforeBulk);

 await openBatch('#sc-edit-chord-preset');
 await p.selectOption('[data-score-preset]',{label:'通し確認コード'});
 await firstPreviewBar().click({position:{x:4,y:4}});
 await p.click('[data-preset-stage]');await p.click('[data-score-apply]');await closeBatch();
 const withChords=await snapshot();
 assert.deepEqual(withChords.bars.slice(0,4).map(b=>b.chords.map(e=>[e.onsetTick,e.symbol])),
  [[[0,'Dm']],[[0,'F']],[[0,'G']],[[0,'C']]]);
 const chord=withChords.bars[0].chords[0],form=registeredForm(withChords,chord);
 assert.equal(form.binding.mode,'fixed');
 assert.deepEqual(form.binding.playedStrings,preset.form.playedStrings);
 assert.deepEqual(form.material.snapshot,preset.form.material.snapshot);
 await p.click('#sc-undo');assert.deepEqual(await snapshot(),beforeBulk);
 await p.click('#sc-redo');assert.deepEqual(await snapshot(),withChords);

 await openBatch('#sc-edit-rhythm');
 await p.selectOption('[data-score-preset]',{label:'通し確認ストローク'});
 const lastStroke=p.locator('.sc-strum-preset-grid [data-stroke]').last();
 await lastStroke.click();assert.equal(await lastStroke.getAttribute('data-stroke'),'↑');
 // Cycle upstroke through mute and sustain to an empty cell.
 for(const value of ['×','〜','−']){
  await lastStroke.click();assert.equal(await lastStroke.getAttribute('data-stroke'),value);
 }
 await p.locator('.sc-preset-paper .sheet-section-label').first().click();
 await p.click('[data-preset-stage]');
 assert.deepEqual(await snapshot(),withChords);
 await p.click('[data-score-apply]');await closeBatch();
 const withRhythm=await snapshot();
 const expectedRhythm=[[0,'down',480],[480,'rest',240],[720,'up',240],
  [960,'down',240],[1200,'rest',240],[1440,'down',240]];
 assert.deepEqual(rhythmSlots(withRhythm,0),expectedRhythm);
 assert.deepEqual(rhythmSlots(withRhythm,1),expectedRhythm);
 assert.deepEqual(withRhythm.performance.formBindings,withChords.performance.formBindings);
 assert.deepEqual(rhythmSlots(withRhythm,3),rhythmSlots(withChords,3));
 await p.click('#sc-undo');assert.deepEqual(await snapshot(),withChords);
 await p.click('#sc-redo');assert.deepEqual(await snapshot(),withRhythm);

 await p.click('#sc-save');await p.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);const saved=await snapshot();assert(await p.locator('#sc-save').isDisabled());
 await p.reload();await p.click('#open-sheet-cruise');await p.waitForFunction(()=>!!CruiseStudio.sheetCruise.getSession());assert.deepEqual(await snapshot(),saved);
 assert.deepEqual(await firstBarCellWidths('#sc-sheet-scale-box'),Array(8).fill(240));
 await p.locator('#sc-sheet-scale-box .sheet-bar[data-bar-number="1"]').click({position:{x:4,y:4}});
 await p.click('#sc-song-preview');
 await p.locator('#sc-sheet-scale-box .sc-playing-bar').waitFor();
 await p.click('#sc-song-preview');
 await p.locator('#sc-sheet-scale-box .sc-playing-bar').waitFor({state:'detached'});
 assert.deepEqual(await snapshot(),saved);
 await p.click('#sc-curve-menu-toggle');await p.click('#sc-menu-display-settings');await p.locator('[data-layout-form-list]').check();await p.click('[data-layout-save]');
 await exportMenu();await p.click('[data-export-choice=folder-new]');await p.getByRole('textbox',{name:'新しいフォルダ名'}).fill('通し確認');await p.click('[data-export-choice=folder-create]');
 await p.waitForFunction(()=>document.querySelector('[data-export-folder]')?.selectedOptions[0]?.textContent==='通し確認');await p.click('[data-export-choice=export-save]');await p.click('[data-export-complete=close]');
 await exportMenu();await p.click('[data-export-choice=overwrite]');assert.equal(await p.locator('[data-export-folder] option:checked').textContent(),'通し確認');await p.click('[data-export-choice=export-save]');await p.click('[data-export-complete=close]');
 // Exercise the duplicate-name branch and cancellation before committing a copy.
 await exportMenu();await p.click('[data-export-choice=rename]');await p.locator('[data-export-name]').fill('通し確認・別名');await p.click('[data-export-choice=cancel]');
 await exportMenu();await p.click('[data-export-choice=rename]');await p.locator('[data-export-name]').fill('通し確認・別名');await p.click('[data-export-choice=rename-save]');await p.click('[data-export-complete=open]');
 await p.locator('.sv-paper .sheet-bar').first().waitFor();await p.evaluate(async()=>window.__throughViewer=await CruiseStudio.scoreViewer.ready());await p.waitForFunction(()=>__throughViewer.read()?.libraryTitle==='通し確認・別名');const copyRead=await p.evaluate(async()=>(await CruiseStudio.scoreViewer.ready()).read());const hash=copyRead.byteHash;
 assert.equal(await p.locator('.sv-paper .sc-form-list').count(),1);
 assert.deepEqual(await firstBarCellWidths('.sv-paper'),Array(8).fill(240));
 await p.locator('.sv-paper .sheet-bar[data-bar-number="1"]').click({position:{x:4,y:4}});await p.locator('.sv-paper .sheet-bar[data-bar-number="2"]').click({position:{x:4,y:4},modifiers:['Shift']});
 const exported=copyRead.document.score;
 assert.deepEqual(exported.bars,saved.bars);
 assert.deepEqual(exported.performance,saved.performance);
 assert.deepEqual(exported.materials,saved.materials);
 assert.deepEqual(registeredForm(exported,chord),form);
 assert.deepEqual(rhythmSlots(exported,0),expectedRhythm);
 const guitar=f.contract.tickPlan(exported).events.filter(e=>e.part==='guitar'&&e.barIndex===0);
 assert.deepEqual([...new Set(guitar.map(e=>[e.tick,e.stroke].join(':')))],
  ['0:down','720:up','960:down','1440:down']);
 const soundingStrings=guitar.filter(e=>e.tick===0).map(e=>[e.string,e.midi]);
 const expectedStrings=form.material.snapshot.strings.filter(s=>s.kind==='note'&&form.binding.playedStrings.includes(s.string))
  .map(s=>[s.string,form.material.snapshot.tuningMidi[s.string-1]+form.material.snapshot.capo+s.relativeFret]);
 assert.deepEqual(soundingStrings.sort((a,b)=>a[0]-b[0]),expectedStrings.sort((a,b)=>a[0]-b[0]));

 await p.locator('[data-viewer-action=repeat]').click();
 await p.locator('[data-viewer-action=sound-all]').click();
 await p.locator('[data-viewer-action=play]').click();
 await p.locator('[data-viewer-playhead]').waitFor();
 await p.waitForFunction(()=>__throughViewer.playback()?.stats.parts.guitar>0 && __throughViewer.playback()?.barIndex===1);
 await p.waitForFunction(()=>__throughViewer.playback()?.iteration>0);
 await p.locator('[data-viewer-action=play]').click();
 await p.waitForFunction(()=>__throughViewer.playback()?.phase==='paused');
 assert.equal(await p.locator('.sv-paper .sheet-bar.sv-selected').count(),2);assert.equal(await p.evaluate(async()=>(await CruiseStudio.scoreViewer.ready()).read().byteHash),hash);
 await p.click('[data-viewer-action=library]');await p.getByRole('button',{name:'通し確認（1曲）',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.sv-folder-heading strong')?.textContent==='通し確認');assert.equal(await p.locator('[data-library-entry]').count(),1);const originalEntry=await p.locator('[data-library-entry]').getAttribute('data-library-entry');await p.click('[data-library-action=open]');await p.evaluate(async()=>window.__throughViewer=await CruiseStudio.scoreViewer.ready());await p.waitForFunction(id=>__throughViewer.read()?.entryId===id,originalEntry);const reopened=await p.evaluate(async()=>(await CruiseStudio.scoreViewer.ready()).read());assert.match(reopened.byteHash,/^[a-f0-9]{64}$/);assert.notEqual(reopened.entryId,copyRead.entryId);assert.notEqual(reopened.byteHash,hash);assert.deepEqual(reopened.document.score.bars,saved.bars);await p.screenshot({path:'/private/tmp/score-through-'+engine+'-viewer.png'});
 await p.reload();await p.click('#open-score-viewer');await p.locator('.sv-paper .sheet-bar').first().waitFor();assert.equal(await p.evaluate(async()=>(await CruiseStudio.scoreViewer.ready()).read().byteHash),reopened.byteHash);
 await p.click('.studio-nav [data-workspace=sheetCruise]');assert.deepEqual(await snapshot(),saved);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 }catch(e){console.error(engine,await p.locator('body').innerText().then(t=>t.slice(-1800)));throw e;}finally{await c.close();await browser.close();}
});
