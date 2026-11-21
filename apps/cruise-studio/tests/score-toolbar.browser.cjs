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
  const initial=await ids();assert(initial.length>10);const hidden=['sc-save-overwrite','sc-menu-display','sc-menu-fullscreen','sc-menu-tools','sc-menu-zoom-out','sc-menu-zoom-reset','sc-menu-zoom-in'];
  assert(hidden.every(id=>!initial.includes(id)));
  await p.click('#sc-curve-menu-toggle');await p.locator('#sc-menu-fullscreen').waitFor();
  const commands=await p.locator('#sc-curve-menu button:visible').evaluateAll(els=>els.map(el=>el.id));
  const shortcuts=await p.locator('[data-shortcut]').evaluateAll(els=>els.map(el=>el.dataset.shortcut));
  assert.deepEqual(shortcuts.slice().sort(),commands.slice().sort());
  assert.equal(initial.length+hidden.length,shortcuts.length);
  await p.keyboard.press('Escape');
  const toggle=picker.locator('summary');
  assert.equal(await toggle.textContent(),'…');
  assert.equal(await toggle.getAttribute('aria-label'),'ショートカットを選ぶ');
  assert(await picker.evaluate(el=>el===el.parentElement.lastElementChild));
  assert((await toggle.boundingBox()).width<(await pin(initial[0]).boundingBox()).width);
  await toggle.press('Enter');
  await picker.getByLabel('曲情報',{exact:true}).waitFor();
  await p.keyboard.press('Escape');
  assert(await toggle.evaluate(el=>document.activeElement===el));
  await pin(initial[0]).dragTo(pin(initial[1]),{targetPosition:{x:32,y:18}});
  assert.deepEqual(await ids(),[initial[1],initial[0],...initial.slice(2)]);
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
  assert.deepEqual(await ids(),[initial[1],initial[0],...initial.slice(2)].filter(id=>id!=='sc-edit-rhythm'));
  assert(await pin('sc-edit-song').isVisible());assert(await pin('sc-edit-rhythm').isHidden());
 }));
 await t.test('all icons include fullscreen and tool settings while saved choices take precedence',()=>fresh(async p=>{
  const picker=p.locator('#sc-shortcut-menu'),pin=id=>p.locator('[data-shortcut="'+id+'"]');
  await picker.locator('summary').click();await picker.getByRole('button',{name:'すべて表示'}).click();
  await p.keyboard.press('Escape');
  await pin('sc-menu-fullscreen').click();await p.locator('#screen-sheet-cruise.score-fullscreen').waitFor();
  await p.locator('.score-fullscreen-exit').click();
  await pin('sc-menu-tools').click();await picker.getByLabel('譜面を拡大').uncheck();await p.keyboard.press('Escape');
  await p.reload();await p.click('#open-sheet-cruise');
  assert(await pin('sc-menu-zoom-in').isHidden());assert(await pin('sc-menu-display').isVisible());
  assert(await pin('sc-menu-tools').isVisible());
 }));
 await t.test('dragging the toolbar grip scales controls independently of the score',()=>fresh(async p=>{
  const toolbar=p.locator('.sc-compact-toolbar'),grip=p.getByRole('slider',{name:'上部カードの表示倍率'});
  const button=toolbar.locator('#sc-save'),score=p.locator('.sheet-bar').first();
  const before=await button.boundingBox(),bar=await score.boundingBox(),handle=await grip.boundingBox();
  await p.mouse.move(handle.x+handle.width-3,handle.y+handle.height-3);await p.mouse.down();
  await p.mouse.move(handle.x-55,handle.y-32,{steps:5});await p.mouse.up();
  assert(Number(await grip.getAttribute('aria-valuenow'))<95);
  assert((await button.boundingBox()).width<before.width*.95);
  assert(Math.abs((await score.boundingBox()).width-bar.width)<1);
  await p.click('#sc-curve-menu-toggle');
  await toolbar.locator('#sc-curve-menu .sc-toolbar-menu-body').waitFor();
  const menu=await toolbar.locator('#sc-curve-menu .sc-toolbar-menu-body').boundingBox(),anchor=await p.locator('#sc-curve-menu-toggle').boundingBox();
  assert(Math.abs(menu.y-anchor.y-anchor.height-6)<3,JSON.stringify({anchor,menu}));
  await p.keyboard.press('Escape');await grip.press('ArrowRight');await grip.press('Enter');
  assert.equal(await grip.getAttribute('aria-valuenow'),'100');
 }));
 await t.test('help opens the illustrated manual and an unsaved song explains its save location',()=>fresh(async p=>{
  const before=await snap(p),opened=p.waitForEvent('popup');await p.locator('#sc-score-guide').click();
  const manual=await opened;await manual.waitForLoadState();
  assert.match(await manual.title(),/譜面クルーズ 取扱説明書/);
  assert(await manual.locator('figure img').evaluateAll(images=>images.length>=8&&images.every(img=>img.complete&&img.naturalWidth>0)));
  assert(await manual.locator('nav a').evaluateAll(links=>links.every(a=>document.getElementById(a.hash.slice(1)))));
  const illustrated=await manual.locator('#lesson h3').evaluateAll(steps=>steps.map(step=>{
   for(let sibling=step.nextElementSibling;sibling && sibling.tagName!=='H3';sibling=sibling.nextElementSibling){
    if(sibling.querySelector('img')?.naturalWidth>0)return true;
   }
   return false;
  }));
  assert(illustrated.length>=1 && illustrated.every(Boolean));
  await manual.close();await p.locator('#sc-project-select').selectOption({label:'この曲の保存場所'});
  const info=p.getByRole('dialog',{name:'保存場所'});assert.match(await info.textContent(),/まだ保存されていません/);
  await info.getByRole('button',{name:'閉じる'}).click();assert.deepEqual(await snap(p),before);
 }));
 await t.test('discard an unsaved song, remove a browser song and keep other entries across reload',()=>fresh(async p=>{
  const id=(await snap(p)).projectId,select=p.locator('#sc-project-select'),list=p.getByRole('dialog',{name:'ファイル一覧'});
  const manage=()=>select.selectOption({label:'ファイル一覧・削除…'});
  await manage();
  const target=list.getByRole('button',{name:/toolbar-test\.json.*削除/});
  p.removeAllListeners('dialog');p.once('dialog',d=>d.dismiss());await target.click();
  assert(await target.isVisible());
  p.on('dialog',d=>d.accept());await target.click();
  await p.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().target.projectId!==id,id);
  await list.getByRole('button',{name:'閉じる'}).click();
  assert.equal(await select.locator('option[value="'+id+'"]').count(),0);
  await p.evaluate(()=>window.showSaveFilePicker=undefined);
  await p.click('#sc-save');
  const saved=(await snap(p)).projectId;
  await p.waitForFunction(id=>CruiseStudio.repository.read({type:'project',projectId:id}).exists,saved);
  await manage();await list.getByRole('button',{name:/を削除$/}).first().click();
  await p.waitForFunction(id=>!CruiseStudio.repository.read({type:'project',projectId:id}).exists,saved);
  await list.getByText(/削除しました/).waitFor();
  await p.reload();await p.click('#open-sheet-cruise');
  for(const gone of [id,saved])assert.equal(await select.locator('option[value="'+gone+'"]').count(),0);
  assert(await select.locator(':scope > option').count()>0);
 }));
 await t.test('shortcut settings remain reachable with all commands on a narrow screen',()=>fresh(async p=>{
  const picker=p.locator('#sc-shortcut-menu'),toggle=picker.locator('summary');
  await toggle.click();
  for(const input of await picker.locator('input[type=checkbox]').all())await input.check();
  await p.keyboard.press('Escape');
  await p.setViewportSize({width:390,height:844});
  const strip=p.locator('.sc-shortcut-items');
  assert(await strip.evaluate(el=>el.scrollWidth>el.clientWidth));
  for(const end of [false,true]){
   await strip.evaluate((el,end)=>{el.scrollLeft=end?el.scrollWidth:0;},end);
   const box=await toggle.boundingBox();
   assert(box.x>=0 && box.x+box.width<=390);
   await toggle.click();await picker.getByLabel('曲情報',{exact:true}).waitFor();
   await p.keyboard.press('Escape');
  }
 }));
 await t.test('all-song strokes, remembered preset, and edge scrolling from outside a bar',()=>fresh(async p=>{
  await p.click('[data-shortcut=sc-edit-rhythm]');
  const dialog=p.locator('[data-score-dialog=strumPreset]'),paper=dialog.locator('.sc-preset-paper'),preset=dialog.locator('[data-score-preset]');
  assert.equal(await preset.locator('option:checked').textContent(),'王道の8分');
  await preset.selectOption({label:'4分連続'});
  const first=await paper.locator('.sheet-bar[data-bar-number]').first().boundingBox(),box=await paper.boundingBox();
  await p.mouse.move(first.x-5,first.y+12);await p.mouse.down();
  await p.mouse.move(first.x+10,first.y+12,{steps:4});await p.mouse.move(first.x+10,box.y+box.height-7,{steps:10});
  await p.waitForFunction(()=>{const paper=document.querySelector('.sc-preset-paper');return paper.scrollTop>0 && paper.scrollTop+paper.clientHeight>=paper.scrollHeight-2;});
  await p.mouse.up();
  assert(await paper.locator('.sheet-bar[data-bar-number]').last().evaluate(el=>el.hasAttribute('data-preset-destination')));
  await dialog.getByLabel('曲全て').check();await dialog.locator('[data-preset-stage]').click();
  await dialog.locator('[data-score-apply]').click();
  const song=await snap(p);assert.equal(song.performance.barRhythms.length,song.bars.length);
  await p.click('[data-shortcut=sc-edit-rhythm]');assert.equal(await preset.locator('option:checked').textContent(),'4分連続');
  await dialog.locator('[data-score-cancel]').click();
  await p.click('#sc-curve-menu-toggle');await p.click('#sc-edit-sections');
  await p.getByRole('button',{name:'イントロの末尾に小節を追加'}).click();
  await p.click('[data-score-apply]');
  await p.click('[data-shortcut=sc-edit-rhythm]');await preset.selectOption({label:'シンコペーション'});
  await dialog.getByLabel('曲全て').check();await dialog.locator('[data-preset-stage]').click();await dialog.locator('[data-score-apply]').click();
  const odd=await snap(p);
  const sequence=odd.bars.map(bar=>odd.performance.barRhythms.find(binding=>binding.barId===bar.id).materialId);
  assert.equal(sequence.length%2,1);assert.notEqual(sequence[0],sequence[1]);
  sequence.forEach((id,i)=>assert.equal(id,sequence[i%2]));
 }));
 await t.test('card layout fits the paper and chord range starts in its margin',()=>fresh(async p=>{
  await p.click('#sc-curve-menu-toggle');await p.click('#sc-edit-song');
  const form=await p.locator('.sc-song-workspace aside').boundingBox(),preview=await p.locator('.sc-song-workspace .sc-song-preview').boundingBox();
  assert(form.x+form.width<=preview.x);
  const tools=p.getByRole('group',{name:'譜面の全体編集',exact:true});
  assert.deepEqual(await tools.getByRole('button').allTextContents(),['セクション編集','コード一括入力','ストローク一括入力']);
  const box=await tools.boundingBox();assert(box.x>=form.x && box.x+box.width<=form.x+form.width+1);
  assert.equal(await tools.locator('p').count(),0);
  assert.equal(await p.locator('.sc-key-entry').count(),0);
  await tools.getByRole('button',{name:'セクション編集',exact:true}).click();
  const paper=p.locator('.sc-section-preview');
  for(const width of [1440,800,390]){
   await p.setViewportSize({width,height:940});
   await p.waitForFunction(()=>{const el=document.querySelector('.sc-section-preview');return el.scrollWidth<=el.clientWidth+1;});
  }
  await p.setViewportSize({width:1440,height:1000});await p.click('[data-score-cancel]');
  const lastSection=p.locator('.sc-song-preview .sheet-section-label button').last();
  const selectedName=await lastSection.innerText();
  await lastSection.press('Enter');
  assert.equal(await p.locator('.sc-section-workspace aside').getByLabel('セクション名',{exact:true}).inputValue(),selectedName);
  assert(await paper.evaluate(e=>e.scrollTop>0));
  await p.click('[data-score-cancel]');
  await p.getByRole('button',{name:'コード一括入力',exact:true}).click();
  const bars=p.locator('.sc-preset-paper .sheet-bar[data-bar-number]');
  const a=await bars.first().boundingBox(),b=await bars.nth(2).boundingBox();
  await p.mouse.move(a.x-6,a.y+15);await p.mouse.down();await p.mouse.move(b.x+8,a.y+15,{steps:12});await p.mouse.up();
  assert.equal(await p.locator('[data-preset-destination]').count(),3);
 }));
 await t.test('reset shortcut order without changing visible commands',()=>fresh(async p=>{
  const icons=p.locator('.sc-menu-shortcuts [data-shortcut]:visible'),ids=()=>icons.evaluateAll(els=>els.map(el=>el.dataset.shortcut));
  const start=await ids();await icons.first().dragTo(icons.last(),{targetPosition:{x:32,y:18}});
  await p.click('#sc-shortcut-menu summary');await p.getByRole('button',{name:'デフォルトの順番に戻す'}).click();
  assert.deepEqual(await ids(),start);
 }));
 await t.test('display controls sit next to the title and the shortcut group stays fixed',()=>fresh(async p=>{
  assert.equal(await p.locator('.sc-dock-grip').count(),0);
  const title=await p.locator('#sc-project-select').boundingBox(),tools=await p.locator('#sc-toolbar-head-actions').boundingBox();
  const menu=await p.locator('#sc-curve-menu-toggle').boundingBox();
  assert(menu.x>=title.x+title.width&&tools.x>=menu.x+menu.width&&Math.abs(title.y-tools.y)<4);
  await p.click('#sc-curve-menu-toggle');assert(await p.locator('#sc-menu-staff-toggle').isHidden());
 }));
 await t.test('the score toolbar leaves a small top inset and other workspaces retain sticky navigation',()=>fresh(async p=>{
  const main=p.locator('#studio-main'),nav=p.locator('#screen-sheet-cruise>.workspace-local-nav'),toolbar=p.locator('.sc-compact-toolbar');
  const start=await nav.boundingBox();assert(start.y>=0);
  await main.evaluate(e=>e.scrollTop=e.scrollHeight);
  const top=(await main.boundingBox()).y,end=await nav.boundingBox();
  assert(end.y+end.height<=top);
  assert(Math.abs((await toolbar.boundingBox()).y-top-6)<2);
  await p.locator('.studio-nav [data-workspace=preDtm]').click();
  assert.equal(await p.locator('#screen-pre-dtm>.workspace-local-nav').evaluate(e=>getComputedStyle(e).position),'sticky');
  await p.locator('#screen-pre-dtm .workspace-back').click();
  assert.equal(await p.getByRole('dialog',{name:'未保存の変更を確認'}).count(),0);
 }));
 await t.test('save and continue keeps the primary ring and handles a nested save reminder by keyboard',()=>fresh(async p=>{
  const before=await snap(p);
  if(engine==='chrome')await p.evaluate(()=>{window.showSaveFilePicker=async()=>{const dir=await navigator.storage.getDirectory();return dir.getFileHandle('continue.json',{create:true});};});
  await p.evaluate(()=>CruiseStudio.sheetCruise.requestLeave(()=>{}));
  const guard=p.getByRole('dialog',{name:'未保存の変更を確認'}),save=guard.getByRole('button',{name:'保存して続行'});
  for(const width of [1440,390]){
   await p.setViewportSize({width,height:1000});
   const sizes=await guard.locator('.sc-leave-actions').evaluate(el=>{
    const box=el.getBoundingClientRect(),buttons=Array.from(el.children,b=>b.getBoundingClientRect());
    return {widths:buttons.map(b=>b.width),left:buttons[0].left-box.left,right:box.right-buttons[2].right,
     gaps:buttons.slice(1).map((b,i)=>b.top===buttons[i].top?b.left-buttons[i].right:b.top-buttons[i].bottom)};
   });
   assert(Math.max(...sizes.widths)-Math.min(...sizes.widths)<1);
   assert(Math.abs(sizes.left-sizes.right)<1);
   assert(sizes.gaps.every(g=>Math.abs(g-12)<1));
  }
  await p.setViewportSize({width:1440,height:1000});
  const outline=()=>save.evaluate(e=>getComputedStyle(e).outlineStyle);
  assert.equal(await outline(),'solid');await guard.locator('p').click();assert.equal(await outline(),'solid');
  await save.click();
  if(engine==='chrome'){
   const reminder=p.getByRole('dialog',{name:'ファイル保存時のご案内'});
   await reminder.press('Escape');assert(await guard.isVisible());await save.click();
   await reminder.getByLabel('この案内').selectOption('never');
   await reminder.getByRole('button',{name:'保存を続ける'}).press('Enter');
  }
  await guard.waitFor({state:'detached'});
  assert(await p.evaluate(id=>CruiseStudio.repository.read({type:'project',projectId:id}).exists,before.projectId));
  if(engine==='chrome'){
   const stored=await p.evaluate(async()=>{const f=await (await navigator.storage.getDirectory()).getFileHandle('continue.json');return JSON.parse(await (await f.getFile()).text());});
   assert.equal(stored.projectId,before.projectId);
  }
 }));
 await t.test('page guides explain the open editor and return focus without changing the draft',()=>fresh(async p=>{
  const initial=await snap(p);
  const menu=async id=>{await p.click('#sc-curve-menu-toggle');await p.click(id);};
  const cases=[
   [()=>menu('#sc-edit-sections'),'セクション編集','貼り付け'],
   [()=>menu('#sc-edit-song'),'曲情報','BPM'],
   [()=>menu('#sc-edit-instrument'),'キー・カポ','Playキー'],
   [()=>menu('#sc-edit-chord-preset'),'コード一括入力','入力を始める小節'],
   [()=>menu('#sc-edit-rhythm'),'ストローク一括入力','ドラッグ'],
   [()=>openPaperSettings(p),'譜面の表示設定','セクション別の表示'],
   [()=>p.click('#sc-history'),'変更履歴','この時点に戻す']
  ];
  for(const [open,name,instruction] of cases){
   await open();
   const owner=p.getByRole('dialog',{name,exact:true}),helpName=name+'の使い方';
   const button=owner.getByRole('button',{name:helpName});
   if(name==='曲情報')await owner.getByLabel('曲名',{exact:true}).fill('確定前の曲名');
   await button.click();
   const help=p.getByRole('dialog',{name:helpName,exact:true});
   assert((await help.innerText()).includes(instruction));
   await p.keyboard.press('Control+z');await p.keyboard.press('Escape');
   await help.waitFor({state:'detached'});assert(await owner.isVisible());
   assert(await button.evaluate(e=>e===document.activeElement));
   if(name==='曲情報')assert.equal(await owner.getByLabel('曲名',{exact:true}).inputValue(),'確定前の曲名');
   await owner.getByRole('button',{name:'キャンセル',exact:true}).click();
  }
  assert.deepEqual(await snap(p),initial);
 }));
 await t.test('section copy and paste keys open the part chooser and preserve native text editing',()=>fresh(async p=>{
  await p.click('#sc-curve-menu-toggle');await p.click('#sc-edit-sections');
  const card=p.locator('[data-score-dialog=sections]'),tabs=card.locator('nav button'),name=card.getByLabel('セクション名',{exact:true});
  const count=await tabs.count(),source=await tabs.first().innerText(),chooser=card.getByRole('group',{name:'貼り付ける内容'});
  await tabs.first().click();await p.keyboard.press('Meta+c');await tabs.nth(1).click();
  await name.focus();await name.evaluate(e=>e.select());
  for(const key of ['c','v']){
   const native=await name.evaluate((e,key)=>e.dispatchEvent(new KeyboardEvent('keydown',{key,ctrlKey:true,bubbles:true,cancelable:true})),key);
   assert(native);assert.equal(await chooser.count(),0);
  }
  await tabs.nth(1).click();await p.keyboard.press('Control+v');await chooser.waitFor();
  assert.equal(await tabs.count(),count);
  await chooser.getByRole('button',{name:'キャンセル'}).click();
  await p.keyboard.press('Meta+v');await chooser.getByLabel('歌詞').uncheck();
  await chooser.getByRole('button',{name:'実行'}).click();assert.equal(await tabs.count(),count+1);
  assert((await tabs.nth(2).innerText()).startsWith(source.split(' ')[0]+' コピー'));
  await name.press('Tab');await p.keyboard.press('Control+z');assert.equal(await tabs.count(),count);
  await card.locator('[data-score-cancel]').click();
 }));
 await t.test('unapplied settings own their history and only discarded edits prompt',()=>fresh(async p=>{
  const song=await snap(p),prompts=[];
  await p.exposeFunction('recordDiscard',message=>prompts.push(message));
  await p.evaluate(()=>{window.allowDiscard=false;window.confirm=m=>{window.recordDiscard(m);return window.allowDiscard;};});
  const open=async id=>{await p.click('#sc-curve-menu-toggle');await p.click(id);};
  await open('#sc-edit-song');const card=p.locator('[data-score-dialog=settings]'),title=card.getByLabel('曲名',{exact:true});
  await title.fill('仮の名前');await title.press('Tab');
  await p.keyboard.press('Control+z');assert.equal(await title.inputValue(),song.songInfo.title);
  await p.keyboard.press('Meta+Shift+z');assert.equal(await title.inputValue(),'仮の名前');
  await p.locator('#screen-sheet-cruise .workspace-home').evaluate(e=>e.click());
  assert(await card.isVisible());assert.equal(await title.inputValue(),'仮の名前');
  assert.equal(prompts.pop(),'この画面の変更を破棄しますか？');
  await card.press('Escape');assert(await card.isVisible());assert.equal(prompts.length,1);
  await card.press('Meta+z');await card.press('Escape');await card.waitFor({state:'detached'});assert.equal(prompts.length,1);
  await open('#sc-edit-instrument');const key=p.locator('[data-score-field=capo]'),old=await key.inputValue();
  await key.fill(old==='3'?'4':'3');await key.press('Tab');await p.keyboard.press('Meta+z');
  assert.equal(await key.inputValue(),old);await p.keyboard.press('Control+Shift+z');assert.notEqual(await key.inputValue(),old);
  await p.evaluate(()=>window.allowDiscard=true);await p.click('[data-score-cancel]');assert.deepEqual(await snap(p),song);
  await openPaperSettings(p);const layout=p.locator('[data-paper-layout]'),size=layout.locator('[data-layout-setting=chordSize]');
  const initial=await size.inputValue();await size.focus();await size.press('ArrowRight');const updated=await size.inputValue();
  assert.notEqual(updated,initial);await size.press('Control+z');assert.equal(await size.inputValue(),initial);
  await size.press('Meta+Shift+z');assert.equal(await size.inputValue(),updated);
  const cancel=layout.locator('[data-layout-cancel]');await p.evaluate(()=>window.allowDiscard=false);
  await cancel.click();assert(await layout.isVisible());await size.press('Control+z');await cancel.click();await layout.waitFor({state:'detached'});
  const unload=()=>p.evaluate(()=>!window.dispatchEvent(new Event('beforeunload',{cancelable:true})));
  assert.equal(await unload(),false);
  await open('#sc-edit-song');await title.fill('未適用');assert.equal(await unload(),true);
  await p.evaluate(()=>window.allowDiscard=true);
  await p.locator('#screen-sheet-cruise .workspace-home').evaluate(e=>e.click());
  await p.click('#open-sheet-cruise');assert.deepEqual(await snap(p),song);
  // Simulate storage eviction, then put back the test draft to verify both exit paths.
  const missing=await p.evaluate(id=>{
   const key=Object.keys(localStorage).find(k=>k.startsWith('cruiseStudio.scoreDraft.'+encodeURIComponent(id)+':'));
   const data=localStorage.getItem(key);localStorage.removeItem(key);return {key,data};
  },song.projectId);
  assert.equal(await unload(),true);
  await p.evaluate(({key,data})=>localStorage.setItem(key,data),missing);assert.equal(await unload(),false);
  const prior=prompts.length;await open('#sc-new-project');await card.locator('[data-score-cancel]').click();
  await p.locator('#sc-project-select').selectOption(song.projectId);assert.deepEqual(await snap(p),song);
  await p.locator('#screen-sheet-cruise .workspace-home').click();await p.click('#open-sheet-cruise');
  assert.deepEqual(await snap(p),song);assert.equal(prompts.length,prior);
  await open('#sc-new-project');await card.locator('[data-score-cancel]').click();
  const active=await snap(p);await p.reload();await p.click('#open-sheet-cruise');
  assert.equal((await snap(p)).projectId,active.projectId);
  const replacement=structuredClone(song);replacement.songInfo.title='別ファイルのタイトル';
  await p.locator('#sc-import-json').setInputFiles({name:'another.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(replacement))});
  await p.getByText(/同じ曲の下書きがあります/).first().waitFor({state:'attached'});
  await p.locator('#sc-project-select').selectOption(song.projectId);assert.deepEqual(await snap(p),song);
 }));
 await t.test('undo and redo individual stroke cells before staging and retain draft on dismiss',()=>fresh(async p=>{
  const song=await snap(p);await p.click('[data-shortcut=sc-edit-rhythm]');
  const card=p.locator('[data-score-dialog=strumPreset]'),cell=card.locator('[data-stroke]').first();
  const before=await cell.textContent();await cell.focus();await cell.press('x');const after=await cell.textContent();
  assert.notEqual(after,before);await cell.press('Meta+z');assert.equal(await cell.textContent(),before);
  await cell.press('Control+Shift+z');assert.equal(await cell.textContent(),after);
  await p.evaluate(()=>{window.confirm=()=>false;});await card.press('Escape');assert(await card.isVisible());
  await cell.press('Meta+z');await card.press('Escape');await card.waitFor({state:'detached'});assert.deepEqual(await snap(p),song);
 }));
 await t.test('preview a section copy with only chords, add a bar, apply and undo',()=>fresh(async p=>{
  const before=await snap(p);await p.click('#sc-curve-menu-toggle');await p.click('#sc-edit-sections');
  const dialog=p.locator('[data-score-dialog=sections]'),rows=dialog.locator('aside');
  await rows.first().getByText('コピー',{exact:true}).click();
  const paste=rows.getByRole('button',{name:'後ろに貼り付け'}),parts=rows.getByRole('group',{name:'貼り付ける内容'});
  assert.equal(await parts.count(),0);await paste.click();
  await parts.getByRole('button',{name:'キャンセル'}).click();
  assert.equal(await dialog.locator('nav button').count(),before.sections.length);
  await paste.click();
  for(const name of ['ストローク','メロディ','歌詞'])await parts.getByLabel(name,{exact:true}).uncheck();
  await parts.getByRole('button',{name:'実行'}).click();
  await dialog.getByRole('button',{name:/コピーの末尾に小節を追加/}).click();
  await dialog.getByRole('button',{name:/コピーの最後の小節を削除/}).click();
  await dialog.getByRole('button',{name:/コピーの末尾に小節を追加/}).click();
  assert.equal(await dialog.locator('.sheet-bar[data-bar-number]').count(),before.bars.length+4);
  assert.deepEqual(await snap(p),before);await dialog.locator('[data-score-apply]').click();
  assert.equal(await dialog.count(),0,await dialog.count()?await dialog.locator("[role=status]").innerText():"");
  const after=await snap(p),copies=after.bars.filter(b=>b.sectionId===after.sections[1].id);
  assert.equal(copies.length,4);assert.equal(copies[0].chords[0].symbol,before.bars[0].chords[0].symbol);
  assert.notEqual(copies[0].chords[0].id,before.bars[0].chords[0].id);
  assert(copies.every(b=>!b.lyrics.length&&!b.melody.length),JSON.stringify(copies.map(b=>[b.lyrics.length,b.melody.map(e=>e.kind)])));
  await p.click('#sc-undo');assert.deepEqual(await snap(p),before);
 }));
 await t.test('undo and redo local section edits before applying or cancelling',()=>fresh(async p=>{
  const before=await snap(p);await p.click('#sc-curve-menu-toggle');await p.click('#sc-edit-sections');
  const dialog=p.locator('[data-score-dialog=sections]'),aside=dialog.locator('aside');
  const name=aside.getByLabel('セクション名',{exact:true}),tabs=dialog.locator('nav button');
  const click=label=>aside.getByRole('button',{name:label,exact:true}).click();
  const add=aside.getByRole('button',{name:'＋ セクションを追加'}),del=aside.getByRole('button',{name:'セクションを削除'});
  assert((await add.boundingBox()).y<(await del.boundingBox()).y);
  const tools=await aside.locator('.sc-song-tools').boundingBox(),paper=await dialog.locator('.sc-section-preview').boundingBox();
  assert(tools.y+tools.height<=paper.y+paper.height);
  const initialCount=await tabs.count();
  for(let i=initialCount;i<9;i++)await add.click();
  for(const [width,height] of [[1920,1080],[1920,920],[1440,800]]){
   await p.setViewportSize({width,height});
   const row=await aside.locator('.sc-song-tools').boundingBox(),box=await dialog.boundingBox();
   assert(row.y+row.height<box.y+box.height-8);
   assert.equal(await dialog.evaluate(el=>el.scrollTop),0);
  }
  for(let i=initialCount;i<9;i++)await p.keyboard.press('Control+z');
  assert.equal(await tabs.count(),initialCount);
  await add.click();await name.fill('コーダ');await name.press('Tab');
  await click('前へ移動');const labels=await tabs.allTextContents();
  await del.click();assert.equal(await tabs.count(),before.sections.length);
  await p.keyboard.press('Control+z');assert.deepEqual(await tabs.allTextContents(),labels);
  await p.keyboard.press('Meta+z');assert.equal(await tabs.last().innerText(),'コーダ 4小節');
  await p.keyboard.press('Control+z');assert.equal(await name.inputValue(),'新しいセクション');
  await p.keyboard.press('Meta+Shift+z');assert.equal(await name.inputValue(),'コーダ');
  await p.keyboard.press('Control+Shift+z');assert.deepEqual(await tabs.allTextContents(),labels);
  await click('コピー');await click('後ろに貼り付け');await click('実行');
  await p.keyboard.press('Control+z');assert.deepEqual(await tabs.allTextContents(),labels);
  const plus=dialog.getByRole('button',{name:'コーダの末尾に小節を追加'});await plus.click();
  assert((await tabs.allTextContents()).includes('コーダ 5小節'));
  await p.keyboard.press('Meta+z');assert.deepEqual(await tabs.allTextContents(),labels);
  const first=tabs.first(),last=tabs.last(),target=await last.boundingBox();
  const transfer=await p.evaluateHandle(()=>new DataTransfer());
  await first.dispatchEvent('dragstart',{dataTransfer:transfer});
  await last.dispatchEvent('drop',{dataTransfer:transfer,clientX:target.x+target.width-1});
  assert.equal(await tabs.last().innerText(),labels[0]);
  await p.keyboard.press('Control+z');assert.deepEqual(await tabs.allTextContents(),labels);
  await name.fill('別の編集');await name.press('Tab');
  await p.keyboard.press('Meta+Shift+z');assert.equal(await name.inputValue(),'別の編集');
  await dialog.getByRole('button',{name:'キャンセル',exact:true}).click();
  assert.deepEqual(await snap(p),before);
 }));
 await t.test('navigate the section flow and copy empty measures without materializing the basic rhythm',()=>fresh(async p=>{
  await p.click('#sc-curve-menu-toggle');await p.click('#sc-edit-sections');
  const dialog=p.locator('[data-score-dialog=sections]'),flow=dialog.locator('nav'),aside=dialog.locator('aside');
  assert(await dialog.locator('header [data-score-apply]').isVisible());
  await flow.getByRole('button').last().click();
  await p.waitForFunction(()=>document.querySelector('.sc-section-preview').scrollTop>0);
  await aside.getByRole('button',{name:'＋ セクションを追加'}).click();
  let prompts=0;p.on('dialog',d=>{if(d.type()==='confirm')prompts++;});
  await dialog.getByRole('button',{name:'新しいセクションの最後の小節を削除'}).click();
  assert.equal(prompts,0);
  const intro=await flow.getByRole('button').first().textContent();
  await dialog.getByRole('button',{name:'イントロの最後の小節を削除'}).click();
  assert.equal(prompts,1);
  assert.notEqual(await flow.getByRole('button').first().textContent(),intro);
  await dialog.locator('[data-score-apply]').click();
  await p.click('#sc-curve-menu-toggle');await p.click('#sc-edit-sections');
  await flow.getByRole('button',{name:'新しいセクション 3小節'}).click();
  await aside.getByText('コピー',{exact:true}).click();await aside.getByRole('button',{name:'後ろに貼り付け'}).click();await aside.getByRole('button',{name:'実行'}).click();
  await dialog.locator('[data-score-apply]').click();
  const song=await snap(p),ids=song.bars.filter(b=>b.sectionId===song.sections.at(-1).id).map(b=>b.id);
  assert.equal(ids.length,3);assert(!song.performance.barRhythms.some(r=>ids.includes(r.barId)));
 }));
 await t.test('frequent actions remain visible; context appears only for selected bars without mutating the Project',()=>fresh(async p=>{
  const before=await snap(p),history=await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory());
  assert(await p.locator('#sc-selected-bar-actions').isHidden());
  assert(await p.locator('#sc-editor-drawer').isHidden());
  for(const id of ['sc-song-preview','sc-save','sc-undo','sc-redo','sc-zoom-reset','sc-playback-settings'])assert(await p.locator('#'+id).isVisible(),id);
  for(const id of ['sc-new-project','sc-print','sc-export-json','sc-show-forms'])assert(await p.locator('#'+id).isHidden(),id);
  await select(p,2);assert(await p.locator('#sc-selected-bar-actions').isVisible());assert.match(await p.locator('#sc-toolbar-selection').innerText(),/第2小節/);assert(await p.locator('#sc-edit-selected').isVisible());assert(await p.locator('#sc-copy-bar').isVisible());assert(await p.locator('[data-bar-operation=deleteBar]').isVisible());assert.equal(await p.locator('#sc-bar-menu').count(),0);
  await p.locator('#sc-edit-selected').click();assert(await p.locator('#sc-slot-overlay').isVisible());await p.locator('.slot-overlay-close').click();
  assert.deepEqual(await snap(p),before);assert.deepEqual(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().getHistory()),history);
  const nav=await p.locator('#screen-sheet-cruise>.workspace-local-nav').boundingBox(),head=await p.locator('.sc-score-toolbar-head').boundingBox();assert(head.y>=nav.y+nav.height-1,JSON.stringify({nav,head}));
 }));
 await t.test('the contextual actions edit and operate on the selected range in score order',()=>fresh(async p=>{
  const actions=p.locator('#sc-selected-bar-actions'),edit=actions.getByRole('button',{name:'編集',exact:true});
  const move=d=>actions.locator('[data-bar-operation=moveBar][data-direction="'+d+'"]');
  const before=await snap(p),chords=project=>project.bars.map(b=>b.chords.map(c=>c.symbol));
  assert(await edit.isHidden());
  await select(p,1);assert(await edit.isVisible());assert(await move(-1).isDisabled());
  const editStyle=await edit.evaluate(e=>getComputedStyle(e).backgroundColor);
  assert.notEqual(editStyle,await actions.locator('#sc-copy-bar').evaluate(e=>getComputedStyle(e).backgroundColor));
  await select(p,2,['Shift']);assert.match(await actions.innerText(),/第1〜2小節（2小節選択）/);
  assert(await move(-1).isDisabled());assert(await move(1).isEnabled());
  await edit.click();
  assert.deepEqual(await p.locator('#sc-slot-overlay .editor-measure').evaluateAll(nodes=>nodes.map(e=>Number(e.dataset.barNumber))),[1,2]);
  await p.click('.slot-overlay-close');assert(await actions.isHidden());
  await select(p,6);await select(p,2,['Shift']);await edit.click();
  assert.deepEqual(await p.locator('#sc-slot-overlay .editor-measure').evaluateAll(nodes=>nodes.map(e=>Number(e.dataset.barNumber))),[2,3,4,5]);
  await p.click('.slot-overlay-close');
  await select(p,1);await select(p,2,['Shift']);await p.click('#sc-copy-bar');
  await select(p,3);await select(p,4,['Shift']);await p.click('#sc-paste-bar');
  const expected=chords(before);expected.splice(2,2,...expected.slice(0,2));assert.deepEqual(chords(await snap(p)),expected);
  await p.click('#sc-undo');assert.deepEqual(await snap(p),before);
  const last=before.bars.length;
  await select(p,last);await select(p,last-1,['Shift']);assert(await move(1).isDisabled());
  await actions.locator('[data-bar-operation=addBar]').click();
  const after=await snap(p);assert.deepEqual(after.bars.slice(0,-1).map(b=>b.id),before.bars.map(b=>b.id));
  await p.click('#sc-undo');assert.deepEqual(await snap(p),before);
  await p.locator('#sc-sheet-scale-box .sheet-page').click({position:{x:14,y:18}});
  assert(await actions.isHidden());assert(await p.locator('#sc-save').isVisible());
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
  await p.locator('[data-bar-operation=deleteBar]').click();assert.equal((await snap(p)).bars.length,before.bars.length-1);await p.locator('#sc-undo').click();assert.equal((await snap(p)).bars.length,before.bars.length);
  await select(p,1);await select(p,2,['Shift']);assert(await p.locator('#sc-copy-bar').isEnabled());assert(await p.locator('#sc-paste-bar').isEnabled());
 }));
 await t.test('curve menu opens song settings, exports the working Project and retains ordinary Save',()=>fresh(async p=>{
  await p.locator('#sc-curve-menu-toggle').click();await p.locator('#sc-edit-song').click();await p.locator('[data-score-field=title]').fill('Toolbar working title');await p.locator('[data-score-apply]').click();await p.locator('[data-score-dialog]').waitFor({state:'detached'});
  const before=await snap(p);await p.locator('#sc-curve-menu-toggle').click();const download=p.waitForEvent('download',{timeout:8000});download.catch(()=>{});await p.locator('#sc-export-json').click();const {scorePresentation,...downloaded}=JSON.parse(fs.readFileSync(await(await download).path(),'utf8'));
  assert.deepEqual(downloaded,before);
  assert.equal(scorePresentation.version,1);
  assert.equal(scorePresentation.layout.barsPerLine,4);
  assert.equal(Object.hasOwn(scorePresentation,'scoreToolbarShortcuts'),false);
  await p.evaluate(()=>Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:undefined}));
  await p.locator('#sc-save').click();await p.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);assert.equal((await snap(p)).songInfo.title,'Toolbar working title');assert.equal(await p.locator('#sc-curve-menu').getAttribute('open'),null);
 }));
 await t.test('song selector and menu share file commands, and provide a distinct export path on browsers without a picker',()=>fresh(async p=>{
  const select=p.locator('#sc-project-select');
  const commands=await p.locator('#sc-curve-menu [data-file-command]').evaluateAll(items=>items.map(item=>[item.id,item.textContent.trim()]));
  assert(commands.length>=10);
  const direct=['sc-menu-file-location','sc-menu-files'];
  assert.deepEqual(await select.locator('option[data-file-action]').evaluateAll(items=>items.map(item=>item.dataset.fileAction)),direct);
  async function more(name){
   await select.selectOption({label:'その他のファイル操作…'});
   const panel=p.getByRole('dialog',{name:'その他のファイル操作'});
   assert.deepEqual(await panel.locator('.sc-file-command-list button').allTextContents(),commands.filter(([id])=>!direct.includes(id)).map(([,label])=>label));
   await panel.getByRole('button',{name,exact:true}).click();
  }
  const before=await snap(p);
  await select.selectOption({label:'ファイル一覧・削除…'});
  await p.locator('.sc-file-list').getByText('閉じる').click();
  await p.evaluate(()=>window.showSaveFilePicker=undefined);
  const card=p.getByRole('dialog',{name:'名前をつけて保存'});
  const command='名前をつけて保存';
  await more(command);
  await card.getByRole('button',{name:'閉じる'}).click();
  assert(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().dirty));
  await more(command);
  assert.equal(await card.locator('input').count(),0);
  assert.match(await card.innerText(),/「名前をつけて保存」は使えません/);
  assert(await card.locator('p a[download]').isVisible());
  assert.match(await card.innerText(),/Chrome・Edge/);
  const output=p.waitForEvent('download');
  await card.getByRole('link',{name:'JSONを書き出す'}).click();
  const file=await output;
  assert(file.suggestedFilename().endsWith('.json'));
  const {scorePresentation,...contents}=JSON.parse(fs.readFileSync(await file.path(),'utf8'));
  assert.deepEqual(contents,before);
  assert(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().dirty));
  assert.deepEqual(await snap(p),before);
 }));
 await t.test('restore unsaved work, cancel the picker, then save twice to one file',()=>fresh(async p=>{
  const before=await snap(p);
  await p.reload();await p.click('#open-sheet-cruise');assert.deepEqual(await snap(p),before);
  await p.locator('#screen-sheet-cruise .workspace-home').first().click();
  await p.click('#open-sheet-cruise');assert.deepEqual(await snap(p),before);
  if(engine==='webkit'){
   await p.click('#sc-curve-menu-toggle');
   assert(await p.locator('#sc-save-as').isVisible());
   assert.equal(await p.locator('#sc-duplicate-project').innerText(),'曲を複製');
   await p.keyboard.press('Escape');
   assert.equal(await p.evaluate(()=>typeof window.showSaveFilePicker),'undefined');
   await p.click('#sc-save');await p.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);
   const status=p.locator('#sc-save-notice'),bounds=await status.boundingBox();
   assert(Math.abs(bounds.y+bounds.height/2-500)<2 && Math.abs(bounds.x+bounds.width/2-720)<2);
   const help=p.waitForEvent('popup');await status.getByRole('link',{name:/詳しく/}).click();
   const guide=await help;await guide.waitForLoadState();
   const section=guide.locator('#browser-saving');
   assert.match(await section.innerText(),/Microsoft Edge/);
   assert(Math.abs((await section.boundingBox()).y-12)<3);
   await guide.close();await status.waitFor({state:'detached'});
   await p.locator('#sc-project-select').selectOption({label:'この曲の保存場所'});

   const location=p.getByRole('dialog',{name:'保存場所'});
   assert.match(await location.innerText(),/直接移動することはできません/);
   const exportedSnapshot=await snap(p);
   assert.match(await location.innerText(),/このパソコン内/);
   assert.match(await location.innerText(),/Safariのサイトデータ/);
   assert.equal(await location.getByRole('button').count(),1);
   await location.getByRole('button',{name:'閉じる'}).click();
   await p.locator('#sc-project-select').selectOption({label:'その他のファイル操作…'});
   await p.getByRole('dialog',{name:'その他のファイル操作'}).getByRole('button',{name:'名前をつけて保存'}).click();
   const download=p.waitForEvent('download');
   await p.getByRole('dialog',{name:'名前をつけて保存'}).getByRole('link',{name:'JSONを書き出す'}).click();
   const {scorePresentation,...file}=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
   assert.deepEqual(file,exportedSnapshot);
   return;
  }
  await p.evaluate(()=>{
   window.picks=0;
   window.showSaveFilePicker=async()=>{
    if(++window.picks===1)throw new DOMException('cancel','AbortError');
    const dir=await navigator.storage.getDirectory();
    return dir.getFileHandle('test-score.json',{create:true});
   };
  });
  const reminder=p.getByRole('dialog',{name:'ファイル保存時のご案内'}),go=()=>reminder.getByRole('button',{name:'保存を続ける'}).click();
  await p.click('#sc-save');
  assert.match(await reminder.innerText(),/通常の確認/);
  assert.equal(await reminder.locator('p').nth(1).textContent(),'アプリやブラウザに問題があるわけではありません。');
  const official=reminder.getByRole('link',{name:'Chrome公式の説明（日本語）'});
  assert.equal(new URL(await official.getAttribute('href')).host,'developer.chrome.com');
  for(const field of [reminder.getByLabel('この案内'),p.locator('#sc-project-select')]){
   const style=await field.evaluate(el=>{const s=getComputedStyle(el);return [s.appearance,s.paddingInlineEnd,s.backgroundPositionX];});
   assert.equal(style[0],'none');assert.equal(style[1],'32px');assert.match(style[2],/12px/);
  }
  await reminder.press('Escape');assert.equal(await p.evaluate(()=>window.picks),0);
  await p.click('#sc-save');await go();await p.waitForFunction(()=>window.picks===1);assert(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().dirty));
  await p.click('#sc-save');await go();await p.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);
  assert.equal(await p.evaluate(()=>window.picks),2);
  await p.reload();await p.click('#open-sheet-cruise');
  await p.evaluate(()=>{window.picks=0;window.showSaveFilePicker=()=>{window.picks++;throw Error('unexpected picker');};});
  await p.click('#sc-curve-menu-toggle');await p.click('#sc-edit-song');await p.locator('[data-score-field=title]').fill('second save');await p.click('[data-score-apply]');
  await p.click('#sc-save');await reminder.getByLabel('この案内').selectOption('sometimes');await go();await p.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);
  const result=await p.evaluate(async()=>{const dir=await navigator.storage.getDirectory(),f=await dir.getFileHandle('test-score.json');return [window.picks,JSON.parse(await (await f.getFile()).text()).songInfo.title];});
  assert.deepEqual(result,[0,'second save']);
  const oldBytes=await p.evaluate(async()=>{
   const f=await (await navigator.storage.getDirectory()).getFileHandle('test-score.json');
   return (await f.getFile()).text();
  });
  const saveAs=async()=>{await p.click('#sc-curve-menu-toggle');await p.getByRole('button',{name:'名前をつけて保存',exact:true}).click();};
  // A clean project can still be written to another path.
  const rows=await p.locator('#sc-project-select option').count();
  await p.evaluate(()=>{window.showSaveFilePicker=async options=>{
   window.suggested=options.suggestedName;
   return (await navigator.storage.getDirectory()).getFileHandle('renamed.json',{create:true});
  };});
  await saveAs();
  await p.locator('#sc-save-notice').getByRole('button',{name:'保存場所'}).waitFor();
  assert.equal(await p.locator('#sc-save-notice').textContent(),'保存しました。(保存場所)');
  await p.locator('#sc-save-notice button').click();
  await p.getByRole('dialog',{name:'保存場所'}).getByRole('button',{name:'閉じる'}).click();
  assert.equal(await p.locator('#sc-save-notice').count(),0);
  assert.equal(await p.evaluate(()=>window.suggested),'second save.json');
  assert.equal(await p.locator('#sc-project-select :checked').textContent(),'renamed.json');
  assert.equal((await snap(p)).songInfo.title,'second save');
  assert.equal((await snap(p)).projectId,before.projectId);
  assert.equal(await p.locator('#sc-project-select option').count(),rows);
  await p.reload();await p.click('#open-sheet-cruise');
  await p.waitForFunction(()=>document.querySelector('#sc-project-select :checked')?.textContent==='renamed.json');
  await p.evaluate(()=>{window.showOpenFilePicker=async({startIn})=>{window.locationFilename=startIn.name;throw new DOMException('cancel','AbortError');};});
  await p.locator('#sc-project-select').selectOption({label:'この曲の保存場所'});const card=p.getByRole('dialog',{name:'保存場所'});assert.equal(await card.locator('strong').textContent(),'renamed.json');
  await card.getByRole('button',{name:'保存フォルダを開く',exact:true}).click();await p.waitForFunction(()=>window.locationFilename==='renamed.json');await card.getByText('閉じる').click();
  await p.click('#sc-curve-menu-toggle');await p.click('#sc-edit-song');
  await p.locator('[data-score-field=title]').fill('after rename');await p.click('[data-score-apply]');
  await p.evaluate(()=>{window.picks=0;window.showSaveFilePicker=async()=>{window.picks++;throw new DOMException('cancel','AbortError');};});
  await p.evaluate(()=>CruiseStudio.storage.setAppSetting('scoreFilePermissionReminder',{mode:'sometimes',lastShown:Date.now()-31*86400000}));
  await saveAs();await reminder.getByLabel('この案内').selectOption('never');await go();
  await p.waitForFunction(()=>document.querySelector('#sc-save-notice')?.textContent.includes('キャンセル'));
  await p.evaluate(()=>{window.showSaveFilePicker=async()=>({createWritable:async()=>{throw Error('テスト書き込み失敗');}});});
  await saveAs();
  await p.waitForFunction(()=>document.querySelector('#sc-save-notice').textContent.includes('テスト書き込み失敗'));
  assert(await p.locator('#sc-save').isEnabled());
  await p.click('#sc-save');await p.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);
  const files=await p.evaluate(async()=>{
   const dir=await navigator.storage.getDirectory();
   const read=async name=>(await (await dir.getFileHandle(name)).getFile()).text();
   return [window.picks,await read('test-score.json'),JSON.parse(await read('renamed.json'))];
  });
  assert.equal(files[0],1);assert.equal(files[1],oldBytes);
  assert.equal(files[2].projectId,before.projectId);assert.equal(files[2].songInfo.title,'after rename');
  await p.click('#sc-curve-menu-toggle');await p.click('#sc-new-project');
  await p.click('[data-score-apply]');
  await p.reload();await p.click('#open-sheet-cruise');
  await p.waitForFunction(id=>Array.from(document.querySelector('#sc-project-select').options).some(o=>o.value===id && !o.selected && o.textContent==='renamed.json'),before.projectId);
 }));
 await t.test('menus fit narrow screens and print hides all toolbar controls',()=>fresh(async p=>{
  await select(p,1);
  for(const width of [320,390,768,1440]){
   await p.setViewportSize({width,height:900});
   for(const id of ['sc-curve-menu','sc-display-menu','sc-shortcut-menu']){await p.locator('#'+id+'-toggle').click();const popup=p.locator('#'+id+' > .sc-toolbar-menu-body');await popup.waitFor({state:'visible'});const box=await popup.boundingBox();assert(box.x>=11&&box.x+box.width<=width-11,JSON.stringify({width,id,box}));assert(box.y+box.height<=901,JSON.stringify({width,id,box}));await p.keyboard.press('Escape');}
   for(const id of ['sc-zoom-reset','sc-copy-bar','sc-song-preview']){const box=await p.locator('#'+id).boundingBox();assert(box.x>=0&&box.x+box.width<=width+1,JSON.stringify({width,id,box}));}
  }
  await p.locator('#sc-display-menu-toggle').click();await p.emulateMedia({media:'print'});assert(await p.locator('.sc-compact-toolbar').isHidden());await p.emulateMedia({media:'screen'});
  if(process.env.STUDIO_SCORE_QA_OUT){fs.mkdirSync(process.env.STUDIO_SCORE_QA_OUT,{recursive:true});await p.keyboard.press('Escape');await p.screenshot({path:path.join(process.env.STUDIO_SCORE_QA_OUT,'toolbar-'+engine+'.png')});}
 }));
 }finally{await browser.close();}
});
