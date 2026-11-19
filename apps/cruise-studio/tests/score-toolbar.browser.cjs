async function openPaperSettings(page){return (await require('./helpers/score-toolbar.cjs').toolbarControl(page,'#sc-paper-settings')).click();}
// Actual local UI, isolated browser storage and synthetic Project. No Account/Sync.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium,webkit}=require('playwright');
const origin='http://127.0.0.1:18874',root=path.resolve(__dirname,'../../..');
const snap=p=>p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
for(const engine of ['chrome','webkit'])test('compact score toolbar: '+engine,async t=>{
 const {createUITestProject}=await import(pathToFileURL(path.join(root,'apps/cruise-studio/scripts/create-ui-test-project.mjs')));
 const browser=await(engine==='chrome'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch());
 async function fresh(fn){const context=await browser.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage(),errors=[],external=[];p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await context.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}return r.continue();});try{await p.goto(origin);await p.click('#open-sheet-cruise');const project=createUITestProject();await p.locator('#sc-import-json').setInputFiles({name:'toolbar-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await p.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,project.projectId);await p.locator('#sc-editor-drawer').evaluate(e=>e.open=false);await fn(p);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);}catch(e){console.error('TOOLBAR FAILURE',engine,e.stack);throw e;}finally{await context.close();}}
 async function select(p,n,modifiers=[]){await p.locator('.sheet-bar[data-bar-number="'+n+'"]').click({position:{x:5,y:5},modifiers});}
 try{
 await t.test('choose menu shortcuts, run the same command and restore the choices after reload',()=>fresh(async p=>{
  const before=await snap(p);
  const picker=p.locator('#sc-shortcut-menu');
  const pin=id=>p.locator('[data-shortcut="'+id+'"]');
  assert(await pin('sc-edit-rhythm').isVisible());
  const ids=()=>p.locator('.sc-menu-shortcuts [data-shortcut]:visible').evaluateAll(items=>items.map(item=>item.dataset.shortcut));
  const initial=await ids();
  await pin(initial[0]).dragTo(pin(initial[1]),{targetPosition:{x:32,y:18}});
  assert.deepEqual(await ids(),[initial[1],initial[0]]);
  await p.locator('#sc-curve-menu-toggle').click();
  await p.getByRole('button',{name:'ツールエリア',exact:true}).click();
  await picker.getByLabel('曲情報',{exact:true}).check();
  await picker.getByLabel('ストローク一括',{exact:true}).uncheck();
  await p.keyboard.press('Escape');
  assert(await pin('sc-edit-rhythm').isHidden());
  await pin('sc-edit-song').click();
  assert(await p.locator('[data-score-field=title]').isVisible());
  await p.click('[data-score-cancel]');
  assert.deepEqual(await snap(p),before);
  await p.reload();await p.click('#open-sheet-cruise');
  assert.deepEqual(await ids(),[initial[0],'sc-edit-song']);
  assert(await pin('sc-edit-song').isVisible());assert(await pin('sc-edit-rhythm').isHidden());
 }));
 await t.test('move each tool group within the card and retain the chosen row',()=>fresh(async p=>{
  const group=p.locator('.sc-menu-shortcuts'),head=p.locator('.sc-score-toolbar-head'),primary=p.locator('.sc-toolbar-primary');
  await group.locator('.sc-dock-grip').dragTo(head,{targetPosition:{x:20,y:10}});
  assert.equal(await head.locator('.sc-menu-shortcuts').count(),1);
  await p.locator('#sc-toolbar-head-actions .sc-dock-grip').dragTo(primary,{targetPosition:{x:20,y:10}});
  assert.equal(await primary.locator('#sc-toolbar-head-actions').count(),1);
  await p.reload();await p.click('#open-sheet-cruise');
  assert.equal(await head.locator('.sc-menu-shortcuts').count(),1);assert.equal(await primary.locator('#sc-toolbar-head-actions').count(),1);
  await p.click('#sc-curve-menu-toggle');assert(await p.locator('#sc-menu-staff-toggle').isHidden());
 }));
 await t.test('preview a section copy with only chords, add a bar, apply and undo',()=>fresh(async p=>{
  const before=await snap(p);await p.click('#sc-curve-menu-toggle');await p.click('#sc-edit-sections');
  const dialog=p.locator('[data-score-dialog=sections]'),rows=dialog.locator('.sc-song-section-row');
  await rows.first().getByText('コピー',{exact:true}).click();
  for(const name of ['ストローク','メロディ','歌詞'])await dialog.getByLabel(name,{exact:true}).uncheck();
  await rows.first().getByText('後ろに貼り付け').click();
  await rows.nth(1).getByText('＋ 小節').click();
  assert.equal(await dialog.locator('.sheet-bar[data-bar-number]').count(),before.bars.length+4);
  assert.deepEqual(await snap(p),before);await dialog.locator('[data-score-apply]').click();
  assert.equal(await dialog.count(),0,await dialog.count()?await dialog.locator("[role=status]").innerText():"");
  const after=await snap(p),copies=after.bars.filter(b=>b.sectionId===after.sections[1].id);
  assert.equal(copies.length,4);assert.equal(copies[0].chords[0].symbol,before.bars[0].chords[0].symbol);
  assert.notEqual(copies[0].chords[0].id,before.bars[0].chords[0].id);
  assert(copies.every(b=>!b.lyrics.length&&!b.melody.length),JSON.stringify(copies.map(b=>[b.lyrics.length,b.melody.map(e=>e.kind)])));
  await p.click('#sc-undo');assert.deepEqual(await snap(p),before);
 }));
 await t.test('frequent actions remain visible; context appears only for selected bars without mutating the Project',()=>fresh(async p=>{
  const before=await snap(p),history=await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory());
  assert(await p.locator('#sc-selected-bar-actions').isHidden());
  assert(await p.locator('#sc-editor-drawer').isHidden());
  for(const id of ['sc-song-preview','sc-save','sc-undo','sc-redo','sc-zoom-reset','sc-playback-settings'])assert(await p.locator('#'+id).isVisible(),id);
  for(const id of ['sc-new-project','sc-print','sc-export-json','sc-show-forms'])assert(await p.locator('#'+id).isHidden(),id);
  await select(p,2);assert(await p.locator('#sc-selected-bar-actions').isVisible());assert.match(await p.locator('#sc-toolbar-selection').innerText(),/第2小節/);assert(await p.locator('#sc-edit-selected').isVisible());assert(await p.locator('#sc-copy-bar').isVisible());assert(await p.locator('[data-bar-operation=deleteBar]').isHidden());
  await p.locator('#sc-edit-selected').click();assert(await p.locator('#sc-slot-overlay').isVisible());await p.locator('.slot-overlay-close').click();
  assert.deepEqual(await snap(p),before);assert.deepEqual(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory()),history);
  const nav=await p.locator('#screen-sheet-cruise>.workspace-local-nav').boundingBox(),head=await p.locator('.sc-score-toolbar-head').boundingBox();assert(head.y>=nav.y+nav.height-1,JSON.stringify({nav,head}));
 }));
 await t.test('display checks stay open for repeated edits; Escape restores focus; settings dialog remains available',()=>fresh(async p=>{
  const before=await snap(p);await p.locator('#sc-display-menu-toggle').click();
  await p.locator('#sc-show-title').uncheck();await p.locator('#sc-show-artist').uncheck();await p.locator('#sc-show-forms').check();
  assert.equal(await p.locator('#sc-display-menu').getAttribute('open'),'');assert(await p.locator('.sheet-title').first().isHidden());assert(await p.locator('.sheet-form-event').first().isVisible());
  await p.keyboard.press('Escape');assert.equal(await p.locator('#sc-display-menu').getAttribute('open'),null);assert.equal(await p.evaluate(()=>document.activeElement.id),'sc-display-menu-toggle');assert.deepEqual(await snap(p),before);
  await openPaperSettings(p);assert(await p.locator('[data-paper-layout]').isVisible());await p.locator('[data-layout-cancel]').click();await p.locator('[data-paper-layout]').waitFor({state:'detached'});assert(await p.locator('#sc-paper-settings').isEnabled());
 }));
 await t.test('menu summaries keep Space and arrows local, outside clicks dismiss, Escape does not close the editor',()=>fresh(async p=>{
  await select(p,1);await p.locator('#sc-edit-selected').click();await p.locator('#sc-curve-menu-toggle').focus();await p.keyboard.press('Space');assert.equal(await p.locator('#sc-curve-menu').getAttribute('open'),'');assert.equal(await p.locator('#sc-song-preview').getAttribute('aria-label'),'再生');await p.keyboard.press('ArrowRight');assert.match(await p.locator('#sc-toolbar-selection').innerText(),/第1小節/);
  await p.keyboard.press('Escape');assert(await p.locator('#sc-slot-overlay').isVisible());assert.equal(await p.evaluate(()=>document.activeElement.id),'sc-curve-menu-toggle');
  await p.locator('#sc-display-menu-toggle').click();await p.locator('[data-piano-toggle]').click();assert.equal(await p.locator('[data-piano-toggle]').getAttribute('aria-expanded'),'true');assert.equal(await p.locator('#sc-display-menu').getAttribute('open'),null);await p.locator('#sc-display-menu-toggle').click();await p.locator('#sc-zoom-reset').click();assert.equal(await p.locator('#sc-display-menu').getAttribute('open'),null);await p.keyboard.press('Escape');assert.equal(await p.locator('#sc-display-menu').getAttribute('open'),null);
 }));
 await t.test('copy/paste, add, duplicate, delete and Undo use existing session commands',()=>fresh(async p=>{
  const before=await snap(p);await select(p,1);await p.locator('#sc-copy-bar').click();await select(p,2);await p.locator('#sc-paste-bar').click();let now=await snap(p);assert.deepEqual(now.bars[1].chords.map(c=>c.symbol),before.bars[0].chords.map(c=>c.symbol));await p.locator('#sc-undo').click();assert.deepEqual(await snap(p),before);
  for(const operation of ['addBar','duplicateBar']){await p.locator('[data-bar-operation='+operation+']').click();assert.equal((await snap(p)).bars.length,before.bars.length+1);await p.locator('#sc-undo').click();assert.equal((await snap(p)).bars.length,before.bars.length);await select(p,2);}
  await p.locator('#sc-bar-menu-toggle').click();await p.locator('[data-bar-operation=deleteBar]').click();assert.equal((await snap(p)).bars.length,before.bars.length-1);await p.locator('#sc-undo').click();assert.equal((await snap(p)).bars.length,before.bars.length);
  await select(p,1);await select(p,2,['Shift']);assert(await p.locator('#sc-copy-bar').isEnabled());assert(await p.locator('#sc-paste-bar').isEnabled());
 }));
 await t.test('curve menu opens song settings, exports the working Project and retains ordinary Save',()=>fresh(async p=>{
  await p.locator('#sc-curve-menu-toggle').click();await p.locator('#sc-edit-song').click();await p.locator('[data-score-field=title]').fill('Toolbar working title');await p.locator('[data-score-apply]').click();await p.locator('[data-score-dialog]').waitFor({state:'detached'});
  const before=await snap(p);await p.locator('#sc-curve-menu-toggle').click();const download=p.waitForEvent('download',{timeout:8000});download.catch(()=>{});await p.locator('#sc-export-json').click();const {scorePresentation,...downloaded}=JSON.parse(fs.readFileSync(await(await download).path(),'utf8'));
  assert.deepEqual(downloaded,before);
  assert.equal(scorePresentation.version,1);
  assert.equal(scorePresentation.layout.barsPerLine,4);
  assert.equal(Object.hasOwn(scorePresentation,'scoreToolbarShortcuts'),false);
  await p.locator('#sc-save').click();await p.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);assert.equal((await snap(p)).songInfo.title,'Toolbar working title');assert.equal(await p.locator('#sc-curve-menu').getAttribute('open'),null);
 }));
 await t.test('menus fit narrow screens and print hides all toolbar controls',()=>fresh(async p=>{
  await select(p,1);
  for(const width of [320,390,768,1440]){
   await p.setViewportSize({width,height:900});
   for(const id of ['sc-curve-menu','sc-display-menu','sc-bar-menu','sc-shortcut-menu']){await p.locator('#'+id+'-toggle').click();const popup=p.locator('#'+id+' > .sc-toolbar-menu-body');await popup.waitFor({state:'visible'});const box=await popup.boundingBox();assert(box.x>=11&&box.x+box.width<=width-11,JSON.stringify({width,id,box}));assert(box.y+box.height<=901,JSON.stringify({width,id,box}));await p.keyboard.press('Escape');}
   for(const id of ['sc-zoom-reset','sc-copy-bar','sc-song-preview']){const box=await p.locator('#'+id).boundingBox();assert(box.x>=0&&box.x+box.width<=width+1,JSON.stringify({width,id,box}));}
  }
  await p.locator('#sc-display-menu-toggle').click();await p.emulateMedia({media:'print'});assert(await p.locator('.sc-compact-toolbar').isHidden());await p.emulateMedia({media:'screen'});
  if(process.env.STUDIO_SCORE_QA_OUT){fs.mkdirSync(process.env.STUDIO_SCORE_QA_OUT,{recursive:true});await p.keyboard.press('Escape');await p.screenshot({path:path.join(process.env.STUDIO_SCORE_QA_OUT,'toolbar-'+engine+'.png')});}
 }));
 }finally{await browser.close();}
});
