const test=require('node:test'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
for(const engine of ['chrome','webkit'])test('row units, colors and fullscreen '+engine,async()=>{
 const {viewerFixture}=await import('./helpers/viewer-fixture.mjs'),f=viewerFixture(),browser=await(engine==='webkit'?webkit.launch():chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}));const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await ctx.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:18874'?r.continue():r.abort());
 try{await p.goto('http://127.0.0.1:18874/');await p.waitForFunction(()=>document.documentElement.dataset.studioEntry==='ready');await p.click('#open-sheet-cruise');await p.locator('#sc-import-json').setInputFiles({name:'units.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f.score))});await p.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,f.score.projectId);
 await p.locator('#sc-sheet-scale-box .sheet-bar').first().click({position:{x:3,y:3}});await p.locator('#sc-sheet-scale-box .sheet-bar').first().click({position:{x:3,y:3}});await p.locator('[data-row-resolution=chord]').waitFor();
 const before=await p.evaluate(()=>JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot()));
 assert.equal(await p.getByRole('button',{name:'まとめて入力',exact:true}).count(),0);assert.equal(await p.locator('[data-fold-row]').count(),0);assert.equal(await p.locator('[data-active-resolution]').count(),0);
 for (const lane of ['chord','strum','lyrics','doremi']) {
    const row=p.locator('.slot-overlay-row--'+lane), select=row.locator('[data-row-resolution]');
    const values=await row.locator('[data-slot-ticks]').evaluateAll(nodes=>nodes.map(n=>+n.dataset.slotTicks));
    assert.equal(values.reduce((sum,span)=>sum+span,0),1920);
    assert.equal(await select.inputValue(),new Set(values).size===1 ? String(1920/values[0]) : '');
 }
 await p.evaluate(()=>CruiseStudio.localPaperLayout.set({appearance:{...CruiseStudio.localPaperLayout.value.appearance,interaction:{highlight:'#cc3377',playhead:'#117744',opacity:.3}}}));assert.equal(await p.locator('#sc-slot-overlay').evaluate(e=>e.style.getPropertyValue('--score-line')),'#117744');assert.equal(await p.locator('#sc-slot-overlay').evaluate(e=>e.style.getPropertyValue('--score-border')),'#cc3377');
 assert.equal(await p.locator('[data-chord-cell-toggle]').count(),0);
 const lane=p.locator('.slot-overlay-row--lyrics');
 const previous=await lane.locator('[data-row-resolution]').inputValue();
 await lane.locator('[data-row-resolution]').selectOption('16');
 assert.equal(await lane.locator('[data-cell-value]').count(),16);
 if(previous!=='16')await p.locator('#sc-undo').click({force:true});
 assert.deepEqual(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot()),JSON.parse(before));
 await p.locator('.slot-overlay-close').hover();assert((await p.locator('.slot-overlay-close').getAttribute('title')).includes('閉じる'));
 await p.screenshot({path:'/private/tmp/score159-'+engine+'-editor.png'});
 await p.locator('.slot-overlay-close').click();const encoded=await f.contract.codec.encode(f.score,f.metadata);await p.goto('http://127.0.0.1:18874/apps/score-viewer/local/');await p.waitForFunction(()=>!!window.CruiseViewer);await p.evaluate(text=>CruiseViewer.view.openBytes(text),encoded.text);await p.locator('[data-viewer-focus]').click();await p.waitForTimeout(100);const margin=await p.locator('.sv-focused>.sv-viewport').evaluate(e=>window.innerWidth-e.getBoundingClientRect().width);assert(margin>=0&&margin<=32,'fullscreen viewport uses safe-area margins: '+margin);await p.screenshot({path:'/private/tmp/score159-'+engine+'-fullscreen.png'});assert.deepEqual(errors,[]);
 }finally{await ctx.close();await browser.close();}
});
