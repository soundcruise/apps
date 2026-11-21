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
for (const engine of ['chrome','webkit']) test('edit the selected form from paper and catalogue, save to the shelf, print and export: '+engine,async()=>{
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
        const capoForm=await page.evaluate(async()=>{
            const {createBookForm}=await import('/apps/cruise-studio/js/modules/sheet-cruise/book-save.mjs');
            const snapshot={capo:2,maxAbsoluteFret:22,tuningMidi:[64,59,55,50,45,40],
                strings:[{kind:'note',string:1,relativeFret:0,finger:null},{kind:'muted',string:6}],barres:[]};
            const chord={rootPc:2,qualityKey:'maj',intervals:[0,4,7]};
            return createBookForm(CruiseStudio,ChordCruise,chord,{selectedKey:2,scaleType:'major'},{snapshot,provenance:{shape:'C'}},'D/F#');
        });
        assert.equal(capoForm.chordName,'C/E');assert.equal(capoForm.rootPc,0);assert.equal(capoForm.bassPc,4);
        assert.equal(capoForm.notes[0].interval,4);assert.equal(capoForm.keyContext,null);
        assert.deepEqual(await labels(g),['8','9','10']);
        const gutter=await g.evaluate(e=>{
            const circle=e.querySelector('g[opacity] circle[fill="#ffffff"], g[opacity] circle[fill="#fff"]');
            const line=e.querySelector('.cc-fb-static-mute line');
            return [circle && Number(circle.getAttribute('cx')), (Number(line.getAttribute('x1'))+Number(line.getAttribute('x2')))/2,Number(e.querySelector('.cc-fb-fret-number').getAttribute('x'))];
        });
        assert(gutter[0]!==null && gutter[0]===gutter[1] && gutter[1]<gutter[2],JSON.stringify(gutter));
        assert.deepEqual(await labels(am),['4','5','6']);
        const list=page.locator('.sc-form-list-item[data-form-event="'+ids[0]+'"]').first();
        async function openAdvancedFromForm(){
            const advanced=page.locator('[data-chord-advanced]');
            await advanced.waitFor();
            assert.equal(await advanced.getAttribute('aria-expanded'),'false');
            assert(await advanced.evaluate(e=>e.classList.contains('score-advanced-invitation')));
            assert(await page.locator('.score-form-range').isHidden());
            await advanced.click();
            assert.equal(await advanced.getAttribute('aria-expanded'),'true');
            assert(await page.locator('[data-chord-view=finger]').evaluate(e=>e.classList.contains('cc-segment-btn--active')));
            assert.equal(await page.locator('#cc-fretboard-host').getAttribute('data-score-finger-mode'),'true');
        }
        await list.click();
        const zoom=page.locator('dialog.sc-readonly-form[open]');
        await zoom.getByLabel('編集する位置').selectOption(ids[2]);
        await zoom.getByRole('button',{name:'編集',exact:true}).click();
        await openAdvancedFromForm();
        await page.locator('.score-form-range').waitFor();
        const overlay=page.locator('#sc-slot-overlay');
        assert.equal(Math.round((await overlay.boundingBox()).y),0);
        const duplicateRange=page.locator('.score-form-range').getByLabel('開始');
        await duplicateRange.fill('7');await duplicateRange.press('Enter');
        await page.click('.slot-overlay-close');
        assert.deepEqual(await labels(box(page,2)),['7','8','9','10']);
        assert.deepEqual(await labels(g),['8','9','10']);
        const copy=page.locator('.sc-form-list-item[data-form-event="'+ids[2]+'"]').first();
        await copy.click();assert.deepEqual(await labels(zoom),['7','8','9','10']);
        await zoom.getByRole('button',{name:'編集',exact:true}).click();
        await openAdvancedFromForm();
        await page.locator('.score-form-range').getByLabel('自動').check();
        await page.click('.slot-overlay-close');
        await g.click();
        assert.deepEqual(await labels(page.locator('[data-paper-form-detail]')),['8','9','10']);
        await page.click('[data-paper-form-edit]');
        await openAdvancedFromForm();
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
        assert.equal(Math.round((await overlay.boundingBox()).y),0);
        const saveToBook=page.getByRole('button',{name:'コード本棚に保存',exact:true});
        const newBookTab=async()=>{
            const pending=context.waitForEvent('page');
            await saveToBook.click();
            const tab=await pending;
            tab.setDefaultTimeout(8000);
            return tab;
        };
        const cancelTab=await newBookTab();
        await cancelTab.locator('#cc-save-cancel').click();
        assert.equal(await cancelTab.evaluate(()=>ChordCruise.storage.loadChordIndex().length),0);
        await cancelTab.close();
        const book=await newBookTab();
        await book.click('#cc-save-folder-create-toggle');
        await book.fill('#cc-save-folder-create-input','フォーム確認');
        await book.click('#cc-save-folder-create-ok');
        await book.click('#cc-save-confirm');
        const folder=book.getByRole('button',{name:/フォーム確認/}).first();
        await folder.waitFor();
        const saved=await book.evaluate(()=>{
            const store=ChordCruise.storage,items=store.loadChordIndex();
            return store.loadChord(items[0].id);
        });
        assert.equal(saved.chordName,'G');
        assert.deepEqual(saved.notes.map(n=>[n.string,n.fret]),[[2,8],[3,0],[4,9],[5,10]]);
        assert.deepEqual(saved.mutedStrings,[1,6]);
        assert.deepEqual(saved.fretRange,{min:8,max:10,includesOpen:true});
        await book.reload();
        await book.click('#cc-go-library');
        await folder.click();await book.getByText('G',{exact:true}).first().waitFor();
        await book.close();
        await drag('min',-1); await expectRange(7,10,false);
        await drag('max',1); await expectRange(7,11,false);
        await left.fill('9');await left.press('Enter');await expectRange(8,11,false);
        await panel.getByLabel('自動').check();await expectRange(8,10,true);
        await left.fill('6');await left.press('Enter');await expectRange(6,10,false);
        await right.fill('12');await right.press('Enter');await expectRange(6,12,false);
        await page.locator('[data-chord-view=degree]').click();
        assert(await page.locator('[data-chord-view=degree]').evaluate(e=>e.classList.contains('cc-segment-btn--active')));
        await page.locator('[data-chord-advanced]').click();await page.locator('[data-chord-advanced]').click();
        assert(await page.locator('[data-chord-view=finger]').evaluate(e=>e.classList.contains('cc-segment-btn--active')));
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
        await viewer.locator('.sc-form-list-item').first().click();
        assert.equal(await viewer.locator('.sc-readonly-form[open] button').count(),1);
        await viewer.getByRole('dialog').getByRole('button',{name:'閉じる'}).click();
        assert.deepEqual(await labels(box(viewer,0)),manual);assert.deepEqual(await labels(box(viewer,1)),['4','5','6']);
        await copy.click();await zoom.getByRole('button',{name:'編集',exact:true}).click();
        await page.locator('.score-chord-diagram .cc-fb-marker[data-string="2"]').click();
        await page.click('.slot-overlay-close');
        await copy.click();assert.match(await zoom.locator('svg').textContent(),/中/);
        await zoom.getByRole('button',{name:'閉じる'}).click();
        await box(page,2).click();assert.match(await page.locator('[data-paper-form-detail] svg').textContent(),/中/);
        await page.click('[data-form-close]');
        await g.click();assert.doesNotMatch(await page.locator('[data-paper-form-detail] svg').textContent(),/中/);
    } finally {await browser.close();}
});
