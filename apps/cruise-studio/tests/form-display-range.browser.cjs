const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {chromium,webkit} = require('playwright');
const origin = 'http://127.0.0.1:18874';

async function fixture() {
    const {createUITestProject} = await import('../scripts/create-ui-test-project.mjs');
    const song = createUITestProject();
    const events = song.bars.flatMap(bar=>bar.chords).slice(0,3);
    function place(event, symbol, frets) {
        event.symbol=symbol;
        const binding=song.performance.formBindings.find(b=>b.chordEventId===event.id);
        const material=structuredClone(song.materials.forms.find(m=>m.id===binding.materialId));
        material.id=randomUUID();
        material.provenance.sourceSymbol=symbol;
        material.snapshot.strings=frets.map((f,i)=>f===null?{string:i+1,kind:'muted'}:
            {string:i+1,kind:'note',relativeFret:f,finger:f?1:null,fingeringWarning:false});
        material.snapshot.barres=[];
        song.materials.forms.push(material);
        binding.materialId=material.id;
        binding.mode='fixed';
        binding.playedStrings=material.snapshot.strings.filter(n=>n.kind==='note').map(n=>n.string);
        binding.confirmation={status:'unconfirmed',basisKey:null};
        return binding;
    }
    const g=place(events[0],'G',[null,8,0,9,10,null]);
    place(events[1],'Am7',[null,5,5,5,null,5]);
    Object.assign(song.performance.formBindings.find(b=>b.chordEventId===events[2].id),
        {...g,id:randomUUID(),chordEventId:events[2].id});
    events[2].symbol='G';
    return {song, ids:events.map(e=>e.id)};
}
const labels = box=>box.locator('.cc-fb-fret-number').allTextContents();
const model = p=>p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
for (const engine of ['chrome','webkit']) test('form range on paper, detail, print and exported viewer: '+engine,async()=>{
    const browser=await (engine==='webkit'?webkit.launch():chromium.launch({channel:'chrome'}));
    try {
        const context=await browser.newContext({viewport:{width:1500,height:1100},serviceWorkers:'block'});
        await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
        const page=await context.newPage(), {song,ids}=await fixture();
        page.setDefaultTimeout(8000);
        await page.goto(origin);
        await page.click('#open-sheet-cruise');
        await page.locator('#sc-import-json').setInputFiles({name:'ranges.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(song))});
        const box=(p,i)=>p.locator('.sheet-form-event[data-form-event="'+ids[i]+'"]').first();
        const g=box(page,0),am=box(page,1);
        await g.waitFor();
        assert.deepEqual(await labels(g),['8','9','10']);
        const gutter=await g.evaluate(e=>{
            const circle=e.querySelector('g[opacity] circle[fill="#ffffff"], g[opacity] circle[fill="#fff"]');
            const line=e.querySelector('.cc-fb-static-mute line');
            return [circle && Number(circle.getAttribute('cx')), (Number(line.getAttribute('x1'))+Number(line.getAttribute('x2')))/2,Number(e.querySelector('.cc-fb-fret-number').getAttribute('x'))];
        });
        assert(gutter[0]!==null && gutter[0]===gutter[1] && gutter[1]<gutter[2],JSON.stringify(gutter));
        assert.deepEqual(await labels(am),['4','5','6']);
        await g.click();
        assert.deepEqual(await labels(page.locator('[data-paper-form-detail]')),['8','9','10']);
        await page.click('[data-paper-form-edit]');
        const panel=page.locator('.score-form-range'), left=panel.getByLabel('開始'),right=panel.getByLabel('終了');
        await panel.waitFor();
        async function expectRange(a,b,auto) {
            await page.waitForFunction(([a,b,automatic])=>{
                const root=document.querySelector('[data-chord-picker]')?.shadowRoot;
                const inputs=root?.querySelectorAll('.score-form-range input');
                return inputs?.length && inputs[0].checked===automatic && inputs[1].value===String(a) && inputs[2].value===String(b);
            },[a,b,auto]);
        }
        async function drag(edge,by) {
            const grip=page.locator('[data-range-edge='+edge+']');
            await grip.scrollIntoViewIfNeeded();
            const pos=await grip.boundingBox();
            const step=await grip.evaluate(g=>{
                const stage=g.closest('.cc-fb-stage'), labels=stage.querySelectorAll('.cc-fb-fret-number');
                return labels[2].getBoundingClientRect().x-labels[1].getBoundingClientRect().x;
            });
            const x=pos.x+pos.width/2,y=pos.y+pos.height/2;
            await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+by*step,y,{steps:5});await page.mouse.up();
        }
        await expectRange(8,10,true);
        await drag('min',-1); await expectRange(7,10,false);
        await drag('max',1); await expectRange(7,11,false);
        await left.fill('9');await left.press('Enter');await expectRange(8,11,false);
        await panel.getByLabel('自動').check();await expectRange(8,10,true);
        await left.fill('6');await left.press('Enter');await expectRange(6,10,false);
        await right.fill('12');await right.press('Enter');await expectRange(6,12,false);
        await page.click('.slot-overlay-close');
        const manual=['6','7','8','9','10','11','12'];
        assert.deepEqual(await labels(g),manual);
        assert.deepEqual(await labels(box(page,2)),['8','9','10']);
        const after=await model(page);
        for(const [i,id] of ids.entries()){
            const b=after.performance.formBindings.find(b=>b.chordEventId===id);
            const original=song.performance.formBindings.find(b=>b.chordEventId===id);
            assert.deepEqual({...b,materialId:original.materialId},original);
            const snap=after.materials.forms.find(m=>m.id===b.materialId).snapshot;
            const {displayRange,...musical}=snap;
            assert.deepEqual(musical,song.materials.forms.find(m=>m.id===original.materialId).snapshot);
            assert.deepEqual(displayRange,i===0?{min:6,max:12}:undefined);
        }
        await g.click();assert.deepEqual(await labels(page.locator('[data-paper-form-detail]')),manual);await page.click('[data-form-close]');
        await page.emulateMedia({media:'print'});
        await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
        assert(await g.isVisible());assert.deepEqual(await labels(g),manual);assert.deepEqual(await labels(am),['4','5','6']);
        if(engine==='chrome')assert((await page.pdf()).length>1000);
        await page.emulateMedia({media:'screen'});
        await page.click('#sc-curve-menu-toggle');await page.click('#sc-export-viewer');
        await page.click('[data-export-choice=export-save]');await page.click('[data-export-complete=close]');
        const text=await page.evaluate(async()=>{
            const {createStudioViewerContract}=await import('/apps/cruise-studio/js/modules/sheet-cruise/viewer-contract.mjs');
            const {createViewerLibrary}=await import('/apps/score-viewer/core/library.mjs');
            const {codec}=createStudioViewerContract({schema:CruiseStudio.model.schema2});
            const library=createViewerLibrary({indexedDB,codec});
            try{return new TextDecoder().decode((await library.read((await library.list())[0].entryId)).bytes);}finally{await library.close();}
        });
        assert(JSON.parse(text).requires.includes('form:display-range-v1'));
        const viewer=await context.newPage();
        await viewer.goto(origin+'/apps/score-viewer/local/');
        await viewer.locator('[data-viewer-file]').setInputFiles({name:'range.cruise-score.json',mimeType:'application/json',buffer:Buffer.from(text)});
        await box(viewer,0).waitFor();
        assert.deepEqual(await labels(box(viewer,0)),manual);assert.deepEqual(await labels(box(viewer,1)),['4','5','6']);
    } finally {await browser.close();}
});
