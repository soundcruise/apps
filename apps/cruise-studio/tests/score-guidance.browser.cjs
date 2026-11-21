// Isolated storage, synthetic Project, loopback only. No real account/backend.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const{pathToFileURL}=require('node:url'),{chromium,webkit}=require('playwright');
const origin='http://127.0.0.1:18874',root=path.resolve(__dirname,'../../..');
const snapshot=p=>p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
const select=(p,n,modifiers=[])=>p.locator('#sc-sheet-scale-box .sheet-bar[data-bar-number="'+n+'"]').click({position:{x:5,y:5},modifiers});
const margin=p=>p.locator('#sc-sheet-scale-box .sheet-page').click({position:{x:15,y:350}});
async function menu(p,id,target){await p.click('#'+id+'-toggle');await p.click(target);}
for(const engine of ['chrome','webkit'])test('unified settings and visible score guidance: '+engine,async t=>{
 const{createUITestProject}=await import(pathToFileURL(path.join(root,'apps/cruise-studio/scripts/create-ui-test-project.mjs')));
 if(process.env.STUDIO_SCORE_QA_OUT)fs.mkdirSync(process.env.STUDIO_SCORE_QA_OUT,{recursive:true});
 const b=await(engine==='chrome'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch());
 async function fresh(fn){const c=await b.newContext({viewport:{width:1440,height:1100}}),p=await c.newPage(),errors=[],external=[];p.setDefaultTimeout(7000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await c.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}return r.continue();});try{await p.goto(origin);await p.click('#open-sheet-cruise');const project=createUITestProject();project.songInfo.bpm=400;await p.locator('#sc-import-json').setInputFiles({name:'guidance-synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await p.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,project.projectId);await fn(p);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);}catch(e){console.error('GUIDANCE FAILURE',engine,e.stack);throw e;}finally{await c.close();}}
 try{
 await t.test('new song and menu share a score and song-info workspace; staged cancellation and Apply preserve sessions and explicit saving',()=>fresh(async p=>{
  const original=await snapshot(p);await menu(p,'sc-curve-menu','#sc-new-project');const dialog=p.locator('[data-score-dialog=settings]');await dialog.waitFor();assert(await p.locator('#sc-editor-drawer').isHidden());assert.equal(await dialog.locator('[role=tab]').count(),0);assert.equal(await dialog.locator('h2').innerText(),'新しい曲を作成');assert.equal(await p.evaluate(()=>document.activeElement.dataset.scoreField),'title');const title=dialog.locator('[data-score-field=title]');assert(await title.evaluate(e=>e.selectionStart===0&&e.selectionEnd===e.value.length));if(process.env.STUDIO_SCORE_QA_OUT&&engine==='chrome')await dialog.screenshot({path:path.join(process.env.STUDIO_SCORE_QA_OUT,'new-song.png')});const empty=await snapshot(p);assert.deepEqual(empty.materials.rhythms.find(m=>m.id===empty.performance.basicRhythmId).snapshot.slots,[]);assert.notEqual(empty.projectId,original.projectId);assert(empty.bars.every(b=>!b.chords.length&&!b.lyrics.length&&!b.melody.length));
  await p.keyboard.insertText('新しい曲');await dialog.locator('[data-score-field=bpm]').fill('120');assert.deepEqual(await snapshot(p),empty);await dialog.locator('[data-score-cancel]').click();await dialog.waitFor({state:'detached'});assert.deepEqual(await snapshot(p),empty);
  await menu(p,'sc-curve-menu','#sc-edit-song');await dialog.waitFor();assert.equal(await title.inputValue(),empty.songInfo.title);await title.fill('共通設定の曲');await dialog.locator('[data-score-field=bpm]').fill('120');const h=await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory().cursor);await dialog.locator('[data-score-apply]').click();await dialog.waitFor({state:'detached'});const edited=await snapshot(p);assert.equal(edited.songInfo.title,'共通設定の曲');assert.equal(edited.songInfo.bpm,120);assert.equal(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory().cursor),h+1);assert.equal(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().baseRevision),null);assert(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().dirty));await p.click('#sc-undo');assert.deepEqual(await snapshot(p),empty);await p.locator('#sc-project-select').selectOption(original.projectId);assert.deepEqual(await snapshot(p),original);assert(await p.locator('#sc-editor-drawer').isHidden());
 }));
 await t.test('compose with both keys and apply a progression to sections and the whole song',()=>fresh(async p=>{
  await menu(p,'sc-curve-menu','#sc-new-project');
  const card=p.getByRole('dialog',{name:'新しい曲を作成',exact:true});
  await p.evaluate(()=>{const layout=CruiseStudio.localPaperLayout,appearance=layout.value.appearance;layout.set({appearance:{...appearance,visibility:{...appearance.visibility,forms:true,formList:true}}});});
  await card.getByLabel('アーティスト名').fill('テスト');await card.getByLabel('アーティスト名').press('Enter');
  await card.getByLabel('原曲キー').selectOption('D');await card.getByLabel('Playキー').selectOption({label:'2カポ C'});
  await card.getByRole('button',{name:'セクション編集',exact:true}).click();
  await p.getByRole('button',{name:'Bメロの最後の小節を削除'}).click();await p.click('[data-score-apply]');
  await card.getByRole('button',{name:'コード一括入力',exact:true}).click();
  const batch=p.locator('[data-score-dialog=chordPreset]');
  for(const [name,n] of [['Aメロ',8],['Bメロ',7]]){
   await batch.locator('.sheet-section-label').filter({hasText:name}).click();
   assert.equal(await batch.locator('[data-preset-destination]').count(),n);await batch.locator('[data-preset-stage]').click();
  }
  await batch.getByLabel('曲全て').check();await batch.locator('[data-preset-stage]').click();await batch.locator('[data-score-apply]').click();
  const song=await snapshot(p);assert.equal(song.songInfo.originalKey,'D');assert.equal(song.instrument.capo,2);
  assert.equal(await card.locator('[data-meta-field=capo]').count(),0);
  assert.match(await card.locator('[data-meta-field=playKey]').innerText(),/2カポC/);
  const pattern=song.bars.slice(0,4).map(b=>b.chords[0].symbol);song.bars.forEach((b,i)=>assert.equal(b.chords[0].symbol,pattern[i%4]));
  const svg=card.locator('.sheet-form-event svg').first(),size=await svg.boundingBox();assert(size.width>0&&size.width<100&&size.height<100);
  const catalogue=await card.locator('.sc-form-list-item').first().evaluate(el=>({width:el.offsetWidth,svg:el.querySelector('svg').getBoundingClientRect().width}));
  assert(catalogue.width<=100&&catalogue.svg>0&&catalogue.svg<=100);
 }));
 await t.test('Delete at a single progression start clears all four highlighted bars',()=>fresh(async p=>{
  const before=await snapshot(p);await menu(p,'sc-curve-menu','#sc-edit-chord-preset');
  const dialog=p.locator('[data-score-dialog]'),bars=dialog.locator('.sheet-bar[data-bar-number]');
  await bars.nth(1).click();
  assert.deepEqual(await dialog.locator('[data-preset-destination]').evaluateAll(nodes=>nodes.map(n=>n.dataset.barNumber)),['2','3','4','5']);
  await p.keyboard.press('Backspace');await dialog.locator('[data-score-apply]').click();
  const after=await snapshot(p);assert(after.bars.slice(1,5).every(b=>!b.chords.length));
  assert.deepEqual(after.bars[0],before.bars[0]);assert.deepEqual(after.bars.slice(5),before.bars.slice(5));
 }));
 await t.test('Delete clears only the selected track and bars in each batch editor',()=>fresh(async p=>{
  for(const [id,chords] of [['sc-edit-chord-preset',true],['sc-edit-rhythm',false]]){
   const before=await snapshot(p);await menu(p,'sc-curve-menu','#'+id);
   const dialog=p.locator('[data-score-dialog]'),bars=dialog.locator('.sheet-bar[data-bar-number]');
   await bars.nth(0).click();await bars.nth(1).click({modifiers:['Shift']});await p.keyboard.press('Delete');
   await dialog.locator('[data-score-apply]').click();await dialog.waitFor({state:'detached'});
   const after=await snapshot(p);
   if(chords){assert(after.bars.slice(0,2).every(b=>!b.chords.length));assert.deepEqual(after.performance.barRhythms,before.performance.barRhythms);}
   else{for(const b of after.bars.slice(0,2)){const binding=after.performance.barRhythms.find(v=>v.barId===b.id);assert.deepEqual(after.materials.rhythms.find(m=>m.id===binding.materialId).snapshot.slots,[]);}assert.deepEqual(after.bars,before.bars);}
   assert.deepEqual(after.bars.slice(2),before.bars.slice(2));
  }
 }));
 await t.test('song card returns from all three editors and previews section reordering',()=>fresh(async p=>{
  await menu(p,'sc-curve-menu','#sc-edit-song');
  const card=p.getByRole('dialog',{name:'曲情報',exact:true});
  await card.locator('[data-score-field=title]').fill('カードから編集');
  assert.equal(await card.locator('.sheet-title').textContent(),'カードから編集');
  assert.equal(await card.locator('[data-meta-field=basicStrum]').count(),0);
  await card.getByRole('button',{name:'セクション編集',exact:true}).click();
  const sections=p.getByRole('dialog',{name:'セクション編集',exact:true}),tabs=sections.locator('nav button');
  const first=await tabs.first().textContent(),second=await tabs.nth(1).textContent();
  const bounds=await tabs.nth(1).boundingBox();
  await tabs.first().dragTo(tabs.nth(1),{targetPosition:{x:bounds.width-4,y:10}});
  assert.deepEqual((await tabs.allTextContents()).slice(0,2),[second,first]);
  await sections.locator('[data-score-apply]').click();
  assert.equal(await card.locator('.sheet-section-label').first().textContent(),(await snapshot(p)).sections[0].name);
  for(const label of ['コード一括入力','ストローク一括入力']){
   await card.getByRole('button',{name:label,exact:true}).click();
   await p.getByRole('dialog',{name:label,exact:true}).locator('[data-score-cancel]').click();
   assert.equal(await card.locator('[data-score-field=title]').inputValue(),'カードから編集');
  }
 }));
 await t.test('a saved song creates another song through the common dialog without an unnecessary leave prompt',()=>fresh(async p=>{
  await p.evaluate(async()=>{for(const session of CruiseStudio.sessions.listSessions().filter(s=>s.dirty)){const result=await session.commit();if(!result.ok)throw Error(result.error);}});const old=await snapshot(p);await menu(p,'sc-curve-menu','#sc-new-project');await p.locator('[data-score-dialog=settings]').waitFor();assert.equal(await p.getByRole('dialog',{name:'未保存の変更を確認',exact:true}).count(),0);assert.notEqual((await snapshot(p)).projectId,old.projectId);await p.keyboard.press('Escape');await p.locator('[data-score-dialog]').waitFor({state:'detached'});assert(await p.locator('#sc-editor-drawer').isHidden());
 }));
 await t.test('playback caption shows beginning, selected start, full loop range and disabled empty score without data writes',()=>fresh(async p=>{
  const before=await snapshot(p),history=await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory());assert.equal(await p.locator('#sc-song-target').innerText(),'最初から');assert.equal(await p.locator('#sc-song-preview').getAttribute('aria-label'),'再生');assert.equal(await p.locator('#sc-song-preview').getAttribute('aria-describedby'),'sc-song-target');await select(p,5);assert.equal(await p.locator('#sc-song-target').innerText(),'5小節目から');await select(p,7,['Shift']);assert.equal(await p.locator('#sc-song-target').innerText(),'5〜7小節をループ');assert.equal(await p.locator('#sc-toolbar-selection').innerText(),'第5〜7小節（3小節選択）');await margin(p);assert.equal(await p.locator('#sc-song-target').innerText(),'最初から');assert.deepEqual(await snapshot(p),before);assert.deepEqual(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory()),history);
  await select(p,1);await select(p,before.bars.length,['Shift']);await p.click('[data-bar-operation=deleteBar]');assert.equal(await p.locator('#sc-song-target').innerText(),'再生する小節なし');assert(await p.locator('#sc-song-preview').isDisabled());await p.click('#sc-undo');assert.deepEqual(await snapshot(p),before);
 }));
 await t.test('visible loop target remains stable while audio position moves and stopping retains range',()=>fresh(async p=>{
  const before=await snapshot(p);await select(p,1);await select(p,2,['Shift']);await p.click('#sc-song-preview');await p.waitForFunction(()=>document.querySelector('#sc-song-position').textContent.includes('2 /'));assert.equal(await p.locator('#sc-song-target').innerText(),'1〜2小節をループ');assert.equal(await p.locator('#sc-song-preview').getAttribute('aria-label'),'停止');await p.waitForFunction(()=>document.querySelector('#sc-song-position').textContent.includes('1 /'));assert.equal(await p.locator('#sc-song-target').innerText(),'1〜2小節をループ');await p.click('#sc-song-preview');await p.waitForFunction(()=>CruiseStudio.audio.snapshot().every(s=>!s.resourceType));assert.equal(await p.locator('#sc-song-preview').getAttribute('aria-label'),'再生');assert.equal(await p.locator('#sc-song-target').innerText(),'1〜2小節をループ');assert.deepEqual(await snapshot(p),before);
 }));
 await t.test('gesture guide follows actual selection, range dragging and bar move handlers; Undo restores content',()=>fresh(async p=>{
  const before=await snapshot(p);for(const width of [1024,1440]){await p.setViewportSize({width,height:1100});await margin(p);assert.match(await p.locator('#sc-score-gesture-help').innerText(),/最初の小節から最後の小節までドラッグ/);await p.locator('.sheet-bar[data-bar-number="1"]').evaluate(e=>e.scrollIntoView({block:'center'}));await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const [a,z]=await p.locator('.sheet-bar[data-bar-number="1"],.sheet-bar[data-bar-number="2"]').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y};}));await p.mouse.move(a.x+4,a.y+5);await p.mouse.down();await p.mouse.move(z.x+4,z.y+5,{steps:12});await p.mouse.up();assert.match(await p.locator('#sc-toolbar-selection').innerText(),/第1〜2小節/);assert.match(await p.locator('#sc-score-gesture-help').innerText(),/選んだ小節は、ドラッグで移動/);assert.deepEqual(await snapshot(p),before);}
  await margin(p);await select(p,1);const data=await p.evaluateHandle(()=>new DataTransfer());await p.locator('.sheet-bar[data-bar-number="1"]').dispatchEvent('dragstart',{dataTransfer:data});await p.locator('.sheet-bar[data-bar-number="4"]').dispatchEvent('drop',{dataTransfer:data});await data.dispose();const moved=await snapshot(p);assert.notDeepEqual(moved.bars.map(b=>b.id),before.bars.map(b=>b.id));assert.equal(moved.bars.findIndex(b=>b.id===before.bars[0].id),2);assert.match(await p.locator('#sc-score-gesture-help').innerText(),/ドラッグで移動/);await p.click('#sc-undo');assert.deepEqual(await snapshot(p),before);await margin(p);assert.match(await p.locator('#sc-score-gesture-help').innerText(),/最初の小節から最後の小節までドラッグ/);
 }));
 await t.test('captions and guide fit narrow layouts and are excluded from print',()=>fresh(async p=>{
  await select(p,1);await select(p,2,['Shift']);for(const width of [320,390,768,1440]){await p.setViewportSize({width,height:1100});for(const selector of ['#sc-score-gesture-help','#sc-song-preview','#sc-zoom-controls']){const box=await p.locator(selector).boundingBox();assert(box&&box.x>=0&&box.x+box.width<=width+1,JSON.stringify({width,selector,box}));}if(process.env.STUDIO_SCORE_QA_OUT&&engine==='chrome'&&[390,1440].includes(width))await p.locator('.sc-compact-toolbar').screenshot({path:path.join(process.env.STUDIO_SCORE_QA_OUT,'toolbar-'+width+'.png')});}
  await p.emulateMedia({media:'print'});assert(await p.locator('#sc-song-target').isHidden());assert(await p.locator('#sc-score-gesture-help').isHidden());await p.emulateMedia({media:'screen'});
 }));
 }finally{await b.close();}
});
