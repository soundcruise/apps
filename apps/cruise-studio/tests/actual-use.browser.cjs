// Local entry, disposable storage and synthetic scores only. Block every external request.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'../../..'),origin='http://127.0.0.1:18874';
const snap=p=>p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
const settle=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
for(const engine of ['chrome','webkit'])test('actual use regression: '+engine,async t=>{
 const {createUITestProject}=await import(pathToFileURL(path.join(root,'apps/cruise-studio/scripts/create-ui-test-project.mjs')));
 const browser=await(engine==='chrome'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch());
 async function fresh(fn){const c=await browser.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage(),errors=[],external=[];p.setDefaultTimeout(7000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await c.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}return r.continue();});
 try{await p.goto(origin);await p.click('#open-sheet-cruise');await fn(p,createUITestProject());assert.deepEqual(errors,[]);assert.deepEqual(external,[]);}finally{await c.close();}}
 try{
 await t.test('JSON import is a named button in Tab order; Enter and Space open exactly one native chooser',()=>fresh(async(p,project)=>{
  await p.click('#sc-curve-menu-toggle');const importer=p.getByRole('button',{name:'JSON読み込み',exact:true});await importer.waitFor();assert.equal(await importer.count(),1);
  await p.locator('#sc-new-project').focus();let found=false;for(let i=0;i<20;i++){await p.keyboard.press(engine==='webkit'?'Alt+Tab':'Tab');if(await importer.evaluate(e=>document.activeElement===e)){found=true;break;}}assert(found,'Import must be reachable using Tab');
  let choosers=0;p.on('filechooser',()=>choosers++);const first=p.waitForEvent('filechooser');await p.keyboard.press('Enter');await (await first).setFiles({name:'actual-use.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await p.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,project.projectId);assert.equal(choosers,1);
  const before=await snap(p);await p.click('#sc-curve-menu-toggle');await importer.focus();const second=p.waitForEvent('filechooser');await p.keyboard.press('Space');await(await second).setFiles([]);await settle(p);assert.equal(choosers,2);assert.deepEqual(await snap(p),before);
 }));
 await t.test('bar operation hints return to their actual action after deselecting and selecting again',()=>fresh(async p=>{
  const add=p.locator('[data-bar-operation=addBar]');assert.equal(await add.getAttribute('title'),'編集する小節を選択してください');await p.locator('.sheet-bar[data-bar-number="1"]').click({position:{x:4,y:4}});assert.equal(await add.getAttribute('title'),'選択小節の後に追加');assert(await add.isEnabled());
  await p.locator('.sheet-bar[data-bar-number="1"]').press('Escape');assert.deepEqual(await p.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[]);await p.locator('.sheet-bar[data-bar-number="2"]').click({position:{x:4,y:4}});assert.equal(await add.getAttribute('title'),'選択小節の後に追加');
 }));
 await t.test('editing a finger at the bottom of the right editor keeps the viewport and input DOM in place',()=>fresh(async(p,project)=>{
  await p.locator('#sc-import-json').setInputFiles({name:'scroll.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await p.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,project.projectId);await p.locator('.sheet-bar[data-bar-number="1"]').click({position:{x:4,y:4}});await p.click('#sc-edit-selected');await p.locator('[data-chord-cell-toggle="0"]').click();await p.locator('[data-chord-advanced]').click();await p.locator('[data-chord-shape="G"]').click();await settle(p);await p.locator('[data-editor-placement]').click();await settle(p);
  const marker=p.locator('#cc-fretboard-host .cc-fb-marker[data-string="2"][data-fret="5"]');await marker.scrollIntoViewIfNeeded();await p.locator('#tool-window-slot').evaluate(e=>e.scrollTop=e.scrollHeight);await p.locator('#cc-fretboard-host .cc-fb-scroll').evaluate(e=>e.scrollLeft=250);await marker.scrollIntoViewIfNeeded();await p.evaluate(()=>window.__retainedInput=document.querySelector('[data-overlay-field=chord]'));
  const positions=()=>p.evaluate(()=>({top:document.querySelector('#tool-window-slot').scrollTop,board:document.querySelector('[data-chord-picker]').shadowRoot.querySelector('#cc-fretboard-host .cc-fb-scroll').scrollLeft}));const before=await positions(),model=await snap(p);await marker.click();await settle(p);assert.notDeepEqual(await snap(p),model);assert.deepEqual(await positions(),before);assert(await p.evaluate(()=>document.querySelector('[data-overlay-field=chord]')===__retainedInput));
 }));
 }finally{await browser.close();}
});
