const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const{chromium,webkit}=require('playwright'),origin='http://127.0.0.1:18874',out=process.env.VIEWER_BOOKS_QA_OUT;
for(const engine of ['chrome','webkit'])test('books/menu/output UI '+engine,async t=>{
 const{viewerFixture}=await import('./helpers/viewer-fixture.mjs'),f=viewerFixture(),file=await f.contract.codec.encode(f.score,f.metadata),browser=await(engine==='chrome'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch());
 const read=p=>p.evaluate(()=>CruiseViewer.view.read()),state=p=>p.evaluate(()=>CruiseViewer.view.playback());
 async function fresh(run){const c=await browser.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage(),errors=[],external=[];p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});try{await p.goto(origin+'/apps/score-viewer/local/');await p.waitForFunction(()=>!!window.CruiseViewer);await run(p);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);}catch(e){console.error(engine,await p.evaluate(()=>({dialogs:[...document.querySelectorAll('dialog[open]')].map(e=>e.textContent),status:document.querySelector('[data-viewer-status]')?.textContent})));throw e;}finally{await c.close();}}
 async function open(p){assert(await p.evaluate(text=>CruiseViewer.view.openBytes(text),file.text));}
 async function menu(p,selector){await p.locator('.sv-file-menu:visible').evaluate(e=>e.open=true);if(selector==='[data-viewer-action=display]')await p.locator('.sv-main-menu').getByRole('button',{name:'表示設定',exact:true}).click();else await p.click(selector);}
 async function prepare(p){await open(p);await p.click('[data-viewer-action=sound-mute]');await menu(p,'[data-viewer-audio-menu]');await p.locator('[data-viewer-playback=countIn]').uncheck();await p.getByRole('button',{name:'完了',exact:true}).click();await p.fill('[data-viewer-tempo]','400');await p.locator('[data-viewer-tempo]').press('Tab');}
 async function shot(p,name){if(out){fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,engine+'-'+name+'.png')});}}
 try{
 await t.test('duplicate-name choice is separate from rename and ambiguous overwrite requires an exact target',()=>fresh(async p=>{
  await p.evaluate(()=>{window.__choice=null;void import('/apps/score-viewer/ui/export-dialogs.mjs').then(m=>m.chooseExportName(document,{name:'海辺の散歩',entries:[{title:'海辺の散歩',entryId:'a',folderId:'',version:1}],folders:[]})).then(x=>window.__choice=x);});await p.locator('[data-export-choice=rename]').waitFor();assert.equal(await p.locator('.sv-export-choice select,.sv-export-choice input').count(),0);assert.equal(await p.locator('.sv-export-choice button').count(),3);await shot(p,'export-choice');await p.click('[data-export-choice=rename]');await p.locator('[data-export-name]').fill('海辺の散歩・練習');await shot(p,'export-rename');await p.locator('[data-export-name]').press('Enter');await p.waitForFunction(()=>!!window.__choice);assert.equal((await p.evaluate(()=>window.__choice)).name,'海辺の散歩・練習');
  await p.evaluate(()=>{window.__choice=null;void import('/apps/score-viewer/ui/export-dialogs.mjs').then(m=>m.chooseExportName(document,{name:'同名',entries:[{title:'同名',entryId:'a',folderId:'',version:1},{title:'同名',entryId:'b',folderId:'f',version:2}],folders:[{folderId:'f',name:'ライブ',parentId:''}]})).then(x=>window.__choice=x);});await p.click('[data-export-choice=overwrite]');assert.equal(await p.locator('[data-export-choice=target]').count(),2);await p.locator('[data-export-choice=target]').filter({hasText:'ライブ'}).click();await p.click('[data-export-choice=export-save]');await p.waitForFunction(()=>!!window.__choice);assert.equal((await p.evaluate(()=>window.__choice)).entryId,'b');
 }));
 await t.test('folder browser starts with Unclassified and exposes editing; saved badge absent',()=>fresh(async p=>{
  await open(p);await require('./helpers/viewer-regression-choices.cjs').saveFromToolbar(p,'viewer');await p.waitForFunction(()=>!CruiseViewer.view.hasUnsaved());assert(await p.locator('[data-viewer-action=save]').isHidden());assert(await p.locator('.sv-toolbar>[data-viewer-action=library]').isVisible());await p.click('[data-viewer-action=library]');await p.getByRole('button',{name:'未分類（1曲）',exact:true}).waitFor();assert.equal(await p.locator('.sv-library-list article').count(),1);assert.equal(await p.locator('[data-library-action=duplicate]').count(),1);await shot(p,'bookshelf');await p.getByRole('button',{name:'未分類（1曲）',exact:true}).click();await p.locator('.sv-library-list article').waitFor();await shot(p,'songs');await p.locator('[data-library-action=duplicate]').click();await require('./helpers/viewer-regression-choices.cjs').editNumberedCopy(p);await p.locator('[data-library-name]').fill('練習用');await p.click('[data-library-action=edit-save]');await p.waitForFunction(()=>document.querySelectorAll('.sv-library-list article').length===2);await p.click('[data-library-action=root]');await p.click('[data-library-action=create-folder]');await p.getByRole('textbox',{name:'新しいフォルダ名'}).fill('ライブ');await p.click('[data-library-action=new-folder]');await p.getByRole('button',{name:'ライブ（0曲）',exact:true}).waitFor();await shot(p,'bookshelf-two');
 }));
 await t.test('single selection continues, range stops, repeat loops; exactly one composited cursor survives zoom',()=>fresh(async p=>{
  await prepare(p);await p.click('[data-bar-number="2"]',{position:{x:4,y:4}});assert.equal((await state(p)).range.end,f.score.bars.length*1920);await p.click('[data-viewer-action=play]');await p.waitForFunction(()=>CruiseViewer.view.playback().barIndex>=2);await p.waitForFunction(()=>!document.querySelector('.sv-selected'));assert.equal(await p.locator('.sv-selected').count(),0);assert.equal(await p.locator('[data-viewer-playhead]').count(),1);assert(await p.locator('[data-viewer-playhead]').evaluate(e=>e.parentElement.classList.contains('sv-paper')));await p.click('[data-viewer-action=zoom-in]');await p.waitForTimeout(250);assert.equal(await p.locator('[data-viewer-playhead]').count(),1);await shot(p,'cursor');await p.click('[data-viewer-action=play]');
  await p.click('[data-bar-number="2"]',{position:{x:4,y:4}});await p.click('[data-viewer-action=repeat]');assert.equal((await state(p)).range.end,3840);await p.click('[data-viewer-action=play]');await p.waitForFunction(()=>CruiseViewer.view.playback().iteration>=1);assert.equal((await state(p)).phase,'playing');await p.click('[data-viewer-action=play]');await p.click('[data-viewer-action=repeat]');await p.click('[data-bar-number="1"]',{position:{x:4,y:4}});await p.locator('[data-bar-number="2"]').click({position:{x:4,y:4},modifiers:['Shift']});assert.equal((await state(p)).range.end,3840);await p.click('[data-viewer-action=play]');await p.waitForFunction(()=>CruiseViewer.view.playback().phase==='ended');assert.equal((await state(p)).tick,3840);await p.waitForFunction(()=>!document.querySelector('[data-viewer-playhead]'));assert.equal(await p.locator('.sv-selected').count(),2);await p.waitForTimeout(320);assert.equal(await p.locator('[data-viewer-playhead]').count(),0);const saved=await p.evaluate(async({entryId,revisionId})=>{const{createViewerLibrary}=await import('/apps/score-viewer/core/library.mjs'),{createStudioViewerContract}=await import('/apps/cruise-studio/js/modules/sheet-cruise/viewer-contract.mjs');const lib=createViewerLibrary({indexedDB,codec:createStudioViewerContract({schema:CruiseStudio.model.schema2}).codec});try{return await lib.readPreferences(entryId,revisionId);}finally{await lib.close();}},{entryId:(await read(p)).entryId,revisionId:f.metadata.revisionId});assert.equal(saved.playback.tick,3840);
 }));
 await t.test('scroll switch and contextual resume work without changing audio; grouped mobile transport',()=>fresh(async p=>{
  await prepare(p);await menu(p,'[data-viewer-action=scroll-settings]');const d=p.getByRole('dialog',{name:'譜面の自動スクロール設定'});assert(await d.locator('.sv-settings-note').isHidden());await d.locator('[data-auto-scroll]').uncheck();assert.equal((await read(p)).scroll.enabled,false);assert(await d.locator('.sv-scroll-content').isHidden());await d.getByRole('button',{name:'閉じる',exact:true}).click();const before=await p.locator('.sv-viewport').evaluate(e=>e.scrollTop);await p.click('[data-viewer-action=play]');await p.waitForTimeout(950);assert((await state(p)).tick>1920);assert.equal(await p.locator('.sv-viewport').evaluate(e=>e.scrollTop),before);await p.click('[data-viewer-action=play]');
  await menu(p,'[data-viewer-action=scroll-settings]');await d.locator('[data-auto-scroll]').check();await d.getByRole('button',{name:'閉じる',exact:true}).click();await p.click('[data-viewer-action=play]');await p.locator('.sv-viewport').hover();await p.locator('.sv-viewport').evaluate(v=>{window.__viewerWheel=false;v.addEventListener('wheel',()=>window.__viewerWheel=true,{once:true});});await p.mouse.wheel(0,100);await p.waitForFunction(()=>window.__viewerWheel);await menu(p,'[data-viewer-action=scroll-settings]');await d.locator('[data-scroll-resume]').waitFor();await d.locator('[data-scroll-resume]').click();assert(await d.locator('[data-scroll-resume]').isHidden());await d.getByRole('button',{name:'閉じる',exact:true}).click();await p.click('[data-viewer-action=play]');
  for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:844,height:390}]){await p.setViewportSize(viewport);await p.waitForTimeout(100);const a=await p.locator('[data-viewer-action=play]').boundingBox(),b=await p.locator('.sv-transport').boundingBox();const tempo=await p.locator('.sv-tempo-group').boundingBox(),sound=await p.locator(viewport.width<=1050?'.sv-sound-select':'.sv-sound-modes').boundingBox();assert(a.x+a.width<=tempo.x&&tempo.x+tempo.width<=sound.x+1);assert(Math.abs(a.y+a.height/2-tempo.y-tempo.height/2)<2);const audio=await p.locator('.sv-transport [data-viewer-action=playback-settings]').boundingBox();const end=audio?audio.x+audio.width:sound.x+sound.width;assert(Math.abs((a.x+end)/2-b.x-b.width/2)<3);assert(await p.locator(viewport.width<=1050?'.sv-sound-select':'.sv-sound-modes').isVisible());assert(await p.locator('body').evaluate(e=>e.scrollWidth<=innerWidth+2));await shot(p,'transport-'+viewport.width);}
 }));
 await t.test('relative motion starts at the viewport, the BPM is shared, and pinned row placement is independent',()=>fresh(async p=>{
  await prepare(p);await p.setViewportSize({width:1440,height:560});
  const vp=p.locator('.sv-viewport'),top=()=>vp.evaluate(e=>e.scrollTop);
  await menu(p,'[data-viewer-action=scroll-settings]');
  const d=p.getByRole('dialog',{name:'譜面の自動スクロール設定'}),origin=d.getByLabel('スクロールの動き'),position=d.getByLabel('演奏位置の表示');
  await origin.selectOption('viewport');
  assert(await position.isHidden());
  const tempo=d.getByLabel('演奏とスクロールのBPM');await tempo.fill('120');await tempo.press('Tab');
  assert.equal((await state(p)).settings.bpm,120);
  const before=await vp.evaluate(e=>{e.scrollTop=(e.scrollHeight-e.clientHeight)*.4;return e.scrollTop;});
  assert(before>50);
  await d.getByRole('button',{name:'▶ 再生'}).click();
  await p.waitForFunction(()=>CruiseViewer.view.playback().phase==='playing');
  assert(Math.abs(await top()-before)<12);
  await p.waitForFunction(y=>document.querySelector('.sv-viewport').scrollTop>y+8,before);
  assert.equal((await state(p)).barIndex,0);
  await d.getByRole('button',{name:'Ⅱ 一時停止'}).click();
  await origin.selectOption('score');
  await position.selectOption('center');await d.getByRole('button',{name:'閉じる'}).click();
  await p.locator('[data-bar-number="8"]').click({position:{x:4,y:4}});
  const middle=await top();
  await menu(p,'[data-viewer-action=scroll-settings]');await position.selectOption('start');const upper=await top();
  await position.selectOption('end');assert(upper>middle&&middle>await top());
 }));
 await t.test('horizontal flow uses the visible left edge and restores the saved scrolling choices',()=>fresh(async p=>{
  await prepare(p);
  await p.click('[data-viewer-display-toggle]');await p.click('[data-viewer-flow=horizontal]');
  await require('./helpers/viewer-regression-choices.cjs').saveFromToolbar(p);
  await p.waitForFunction(()=>!CruiseViewer.view.hasUnsaved());
  await menu(p,'[data-viewer-action=scroll-settings]');const d=p.getByRole('dialog',{name:'譜面の自動スクロール設定'});
  await d.getByLabel('演奏位置の表示').selectOption({label:'右側'});
  await d.getByLabel('スクロールの動き').selectOption('viewport');
  await d.getByRole('button',{name:'閉じる'}).click();
  await p.waitForTimeout(300);await p.reload();await p.waitForFunction(()=>window.CruiseViewer?.view.read()?.scroll);
  const settings=(await read(p)).scroll;assert.equal(settings.position,'end');assert.equal(settings.origin,'viewport');
  const x=await p.locator('.sv-viewport').evaluate(e=>{e.scrollLeft=200;return e.scrollLeft;});
  assert(x>=199);await p.click('[data-viewer-action=play]');
  await p.waitForFunction(x=>document.querySelector('.sv-viewport').scrollLeft>x+8,x);
  await p.click('[data-viewer-action=play]');
 }));
 await t.test('PDF starts from the visible page and keeps running after manual scroll and resume',()=>fresh(async p=>{
  const bytes=Array.from(fs.readFileSync(path.join(__dirname,'fixtures/viewer-pdf/mixed.pdf')));
  assert(await p.evaluate(bytes=>CruiseViewer.view.openBytes(new Uint8Array(bytes),{name:'mixed.pdf'}),bytes));
  await menu(p,'[data-pdf-action=settings]');const d=p.getByRole('dialog',{name:'PDFの自動スクロール設定'}),vp=p.locator('.sv-pdf-viewport');
  await d.getByLabel('スクロールの開始位置').selectOption('viewport');
  const before=await vp.evaluate(e=>{e.scrollTop=300;return e.scrollTop;});assert(before>=299);
  await d.locator('[data-pdf-setting-play]').click();
  await p.waitForFunction(y=>document.querySelector('.sv-pdf-viewport').scrollTop>y+3,before);
  await vp.dispatchEvent('wheel');await vp.evaluate(e=>e.scrollTop+=100);
  await d.locator('[data-scroll-resume]').click();assert.equal((await state(p)).phase,'playing');
 }));
 await t.test('PDF auto-scroll OFF keeps the viewport fixed while its clock runs and survives reopen',()=>fresh(async p=>{
  const bytes=Array.from(fs.readFileSync(path.join(__dirname,'fixtures/viewer-pdf/mixed.pdf')));assert(await p.evaluate(bytes=>CruiseViewer.view.openBytes(new Uint8Array(bytes),{name:'mixed.pdf'}),bytes));await menu(p,'[data-pdf-action=settings]');const d=p.getByRole('dialog',{name:'PDFの自動スクロール設定'});await d.locator('[data-auto-scroll]').uncheck();const y=await p.locator('.sv-pdf-viewport').evaluate(e=>e.scrollTop);await d.locator('[data-pdf-setting-play]').click();await p.waitForTimeout(350);assert((await state(p)).position>0);assert.equal(await p.locator('.sv-pdf-viewport').evaluate(e=>e.scrollTop),y);await d.locator('[data-pdf-setting-play]').click();await d.getByRole('button',{name:'閉じる',exact:true}).click();await require('./helpers/viewer-regression-choices.cjs').saveFromToolbar(p,'pdf');await p.locator('[data-export-choice=export-save]').click();await p.waitForFunction(()=>!CruiseViewer.view.hasUnsaved());await p.reload();await p.waitForFunction(()=>window.CruiseViewer?.view.read()?.kind==='pdf');await menu(p,'[data-pdf-action=settings]');assert(!(await p.locator('[data-auto-scroll]').isChecked()));await p.getByRole('dialog',{name:'PDFの自動スクロール設定'}).getByRole('button',{name:'閉じる',exact:true}).click();
 }));
 }finally{await browser.close();}
});
