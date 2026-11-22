const test=require('node:test'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
for(const engine of ['chrome','webkit'])test('two measure units and unified chord entry '+engine,async()=>{
 const {viewerFixture}=await import('./helpers/viewer-fixture.mjs'),f=viewerFixture(),browser=await(engine==='webkit'?webkit.launch():chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}));const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await ctx.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:18874'?r.continue():r.abort());
 try{await p.goto('http://127.0.0.1:18874/');await p.waitForFunction(()=>document.documentElement.dataset.studioEntry==='ready');await p.click('#open-sheet-cruise');await p.locator('#sc-import-json').setInputFiles({name:'units.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f.score))});await p.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,f.score.projectId);
 await p.locator('#sc-sheet-scale-box .sheet-bar').first().click({position:{x:3,y:3}});await p.locator('#sc-sheet-scale-box .sheet-bar').first().click({position:{x:3,y:3}});await p.locator('[data-row-resolution=chord]').waitFor();
 const before=await p.evaluate(()=>JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot()));
 assert.equal(await p.locator('[data-chord-cell-toggle]').count(),0);
 const entry=p.url(), scroller=p.locator('.editor-score-scroll');
 for(const count of [1,2,3,4,2,1]){
    await p.locator('[data-editor-bars="'+count+'"]').click();
    assert.equal(await p.locator('.editor-measure').count(),Math.min(count,f.score.bars.length));
    assert.equal(await scroller.evaluate(e=>getComputedStyle(e).overscrollBehaviorX),'contain');
    assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).overscrollBehaviorX),'contain');
    await scroller.hover();
    await p.mouse.wheel(-900,0);
    assert.equal(p.url(),entry);
 }
 await p.locator('[data-editor-bars="2"]').click();
 await p.getByRole('button',{name:'横に拡大',exact:true}).click();
 const viewport=p.locator('.editor-score-scroll'), label=viewport.locator('.slot-overlay-row--strum .slot-overlay-row-label').first();
 const originalX=(await label.boundingBox()).x;
 await viewport.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
 await p.waitForFunction(x=>{
    const view=document.querySelector('.editor-score-scroll'), rows=view.querySelectorAll('.slot-overlay-row--strum');
    const label=rows[0].querySelector('.slot-overlay-row-label'), box=label.getBoundingClientRect();
    const body=row=>row.querySelector('.slot-overlay-row-body').getBoundingClientRect();
    return view.scrollLeft>0 && Math.abs(box.left-x)<1 && label.contains(document.elementFromPoint(box.left+4,box.top+box.height/2))
        && Math.abs(body(rows[0]).right-body(rows[1]).left)<1;
 },originalX);
 await viewport.evaluate(el=>{el.scrollLeft=0;});
 for (const lane of ['chord','strum','lyrics','doremi']) {
    const first=p.locator('.editor-measure').nth(0).locator('.slot-overlay-row--'+lane);
    const second=p.locator('.editor-measure').nth(1).locator('.slot-overlay-row--'+lane);
    assert.equal(await second.locator('.slot-overlay-row-label').isVisible(),false);
    const unit=first.locator('[data-row-resolution]'),previous=await unit.inputValue();
    if(previous==='16')continue;
    await unit.selectOption('16');
    const confirm=p.getByRole('dialog',{name:'行の音価をそろえる'});
    if(await confirm.isVisible())await confirm.getByText('適用',{exact:true}).click();
    assert.equal(await unit.inputValue(),'16');
    assert.equal(await second.locator('[data-cell-value]').count(),16);
    await p.locator('#sc-undo').click({force:true});
    assert.deepEqual(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot()),JSON.parse(before));
 }
 const secondLyric=p.locator('.editor-measure[data-bar-number="2"] .slot-overlay-row--lyrics input').first();await secondLyric.fill('試');await secondLyric.press('Tab');const afterText=await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());assert.deepEqual(afterText.bars[0].lyrics,JSON.parse(before).bars[0].lyrics);assert(JSON.stringify(afterText.bars[1].lyrics).includes('試'));await p.locator('#sc-undo').click();const undone=await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());assert.deepEqual(undone,JSON.parse(before));
 await p.locator('.editor-measure[data-bar-number="2"] [data-overlay-field=chord][data-slot-tick="960"]').focus();await p.locator('[data-chord-toggle]').click();await p.locator('[data-selected-chord-name]').waitFor();assert.equal(await p.locator('[data-selected-chord-name]').textContent(),'F');
 const rect=await p.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();return {chord:r('.slot-overlay-row--chord').bottom,panelTop:r('[data-chord-picker]').top,panelBottom:r('[data-chord-picker]').bottom,strum:r('.slot-overlay-row--strum').top,strum2:r('.editor-measure:nth-child(2) .slot-overlay-row--strum').top,width:r('[data-chord-picker]').width};});assert(rect.panelTop>=rect.chord-2&&rect.strum>=rect.panelBottom-2&&Math.abs(rect.strum-rect.strum2)<2,JSON.stringify(rect));
 await p.screenshot({path:'/private/tmp/score160-'+engine+'-chord.png'});
 await p.locator('[data-chord-symbol="Dm"]').click();const draft=await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());assert.equal(draft.bars[1].chords.find(c=>c.onsetTick===960).symbol,'Dm');await p.locator('[data-chord-toggle]').click();assert.equal(await p.locator('[data-chord-picker]:not([hidden])').count(),0);
 await p.screenshot({path:'/private/tmp/score160-'+engine+'-editor.png'});assert.deepEqual(errors,[]);
 }finally{await ctx.close();await browser.close();}
});
