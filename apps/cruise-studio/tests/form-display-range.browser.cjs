const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {chromium,webkit} = require('playwright');
const origin = 'http://127.0.0.1:18874';

async function fixture() {
    const {createUITestProject} = await import('../scripts/create-ui-test-project.mjs');
    const song = createUITestProject();
    const events = song.bars.flatMap(bar=>bar.chords).slice(0,3);
    function place(event, symbol, frets, fingers=[]) {
        event.symbol=symbol;
        const binding=song.performance.formBindings.find(b=>b.chordEventId===event.id);
        const material=structuredClone(song.materials.forms.find(m=>m.id===binding.materialId));
        material.id=randomUUID();
        material.provenance.sourceSymbol=symbol;
        material.snapshot.strings=frets.map((f,i)=>f===null?{string:i+1,kind:'muted'}:
            {string:i+1,kind:'note',relativeFret:f,finger:f?(fingers[i]??1):null,fingeringWarning:false});
        material.snapshot.barres=[];
        song.materials.forms.push(material);
        binding.materialId=material.id;
        binding.mode='fixed';
        binding.playedStrings=material.snapshot.strings.filter(n=>n.kind==='note').map(n=>n.string);
        binding.confirmation={status:'unconfirmed',basisKey:null};
        return binding;
    }
    const g=place(events[0],'G',[null,8,0,9,10,10]);
    g.playedStrings=g.playedStrings.filter(string=>string!==6);
    place(events[1],'Am7',[null,5,5,5,null,5]);
    Object.assign(song.performance.formBindings.find(b=>b.chordEventId===events[2].id),
        {...g,id:randomUUID(),chordEventId:events[2].id});
    events[2].symbol='G';
    const examples=song.bars[2].chords;
    place(examples[0],'Dm',[5,6,7,7,5,null],[1,2,4,3,1]);
    place(examples[1],'G7',[10,12,10,12,10,null],[1,4,1,3,1]);
    return {song, ids:events.map(e=>e.id), barreIds:examples.map(e=>e.id)};
}
const labels = box=>box.locator('.cc-fb-fret-number').allTextContents();
const model = p=>p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
for (const engine of ['chrome','webkit']) test('edit the selected form from paper and catalogue, save to the shelf, print and export: '+engine,async()=>{
    const browser=await (engine==='webkit'?webkit.launch():chromium.launch({channel:'chrome'}));
    try {
        const context=await browser.newContext({viewport:{width:1500,height:1100},serviceWorkers:'block'});
        await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
        const page=await context.newPage(), {song,ids,barreIds}=await fixture();
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
        await g.click();
        const direct=page.locator('[data-paper-form-detail]');
        await direct.getByRole('button',{name:'ここで運指を調整'}).click();
        const finger=direct.locator('[data-form-finger="2"]'),initialFinger=await finger.getAttribute('aria-label');
        await finger.click();const changedFinger=await finger.getAttribute('aria-label');
        assert.notEqual(changedFinger,initialFinger);
        await finger.press('Control+z');assert.equal(await finger.getAttribute('aria-label'),initialFinger);
        await page.keyboard.press('Meta+Shift+z');assert.equal(await finger.getAttribute('aria-label'),changedFinger);
        page.once('dialog',d=>d.dismiss());await direct.press('Escape');assert(await direct.isVisible());
        await finger.press('Meta+z');await direct.press('Escape');await direct.waitFor({state:'detached'});
        // Saving advances the session version while the same paper stays visible.
        const committed=await page.evaluate(async()=> (await CruiseStudio.sheetCruise.getSession().commit()).ok);
        assert.equal(committed,true);
        await list.click();
        const zoom=page.locator('dialog.sc-readonly-form[open]');
        async function expectBarres(p){
            for(const id of barreIds){
                const form=p.locator('.sheet-form-event[data-form-event="'+id+'"]').first();
                assert.equal(await form.locator('rect[fill="#d8d8d8"]').count(),1);
            }
        }
        await expectBarres(page);
        const chooser=zoom.getByLabel('編集する位置');
        assert.equal(await chooser.locator('option').first().textContent(),'全て');
        assert.equal(await chooser.inputValue(),'');
        const bulk=page.getByRole('dialog',{name:'コードとフォームの一括編集'});
        const editAll=async()=>{
            await zoom.getByRole('button',{name:'編集',exact:true}).click();
            assert(await page.locator('#sc-slot-overlay').isHidden());
            const advanced=bulk.locator('[data-chord-advanced]');
            assert.equal(await advanced.getAttribute('aria-expanded'),'false');
            await bulk.locator('[data-chord-symbol="Dm"]').click();
            await advanced.click();
            assert.equal(await bulk.locator('#cc-fretboard-host').getAttribute('data-score-finger-mode'),'true');
            await bulk.locator('.score-chord-diagram .cc-fb-marker[data-string="1"]').click();
            assert.equal(await advanced.getAttribute('aria-expanded'),'true');
            assert(await bulk.locator('[data-save-to-book]').isVisible());
        };
        const beforeBulk=await model(page);
        await zoom.getByRole('button',{name:'編集',exact:true}).click();
        await require('./helpers/score-toolbar.cjs').assertHelpBesideCancel(bulk);
        await bulk.getByRole('button',{name:'コードとフォームの一括編集の使い方'}).click();
        await page.getByRole('dialog',{name:'コードとフォームの一括編集の使い方'}).getByRole('button',{name:'閉じる'}).click();
        const originalName=await bulk.getByLabel(/^コード名/).inputValue();
        await bulk.getByLabel(/^コード名/).fill('Em');
        await bulk.getByLabel(/^コード名/).press('Enter');
        assert.equal(await bulk.locator('[data-selected-chord-name]').textContent(),'Em');
        await bulk.getByRole('button',{name:'キャンセル'}).focus();
        await page.keyboard.press('Control+z');
        assert.equal(await bulk.getByLabel(/^コード名/).inputValue(),originalName);
        await page.keyboard.press('Meta+Shift+z');
        assert.equal(await bulk.getByLabel(/^コード名/).inputValue(),'Em');
        assert.deepEqual(await model(page),beforeBulk);
        page.once('dialog',d=>d.accept());await bulk.getByText('キャンセル',{exact:true}).click();
        assert.deepEqual(await model(page),beforeBulk);
        await list.click();await zoom.getByRole('button',{name:'編集',exact:true}).click();
        await bulk.locator('[data-chord-advanced]').click();
        const groupMin=bulk.locator('.score-form-range').getByLabel('開始');
        await groupMin.fill('7');await groupMin.press('Enter');
        await bulk.getByRole('button',{name:'2箇所に反映'}).click();
        const ranged=await model(page);
        for(const id of [ids[0],ids[2]]){
            const binding=ranged.performance.formBindings.find(b=>b.chordEventId===id);
            const prior=beforeBulk.performance.formBindings.find(b=>b.chordEventId===id);
            assert.deepEqual({...binding,materialId:prior.materialId},prior);
            const snapshot=ranged.materials.forms.find(m=>m.id===binding.materialId).snapshot;
            assert.deepEqual(snapshot.displayRange,{min:7,max:10});
            assert.deepEqual(snapshot.strings,beforeBulk.materials.forms.find(m=>m.id===prior.materialId).snapshot.strings);
        }
        await page.click('#sc-undo');
        await list.click();await editAll();
        await bulk.getByRole('button',{name:'2箇所に反映'}).click();
        if(await bulk.isVisible())assert.fail(await bulk.innerText());
        const bulkSong=await model(page);
        for(const [bi,bar] of bulkSong.bars.entries())for(const [ei,e] of bar.chords.entries()){
            const binding=(p)=>p.performance.formBindings.find(b=>b.chordEventId===e.id);
            if(e.id===ids[0]||e.id===ids[2]){
                assert.equal(e.symbol,'Dm');
                const note=bulkSong.materials.forms.find(m=>m.id===binding(bulkSong).materialId).snapshot.strings[0];
                assert.equal(note.relativeFret,1);assert.equal(note.finger,2);
            }else{
                assert.deepEqual(e,beforeBulk.bars[bi].chords[ei]);
                assert.deepEqual(binding(bulkSong),binding(beforeBulk));
            }
        }
        await page.click('#sc-undo');
        assert.deepEqual((await model(page)).bars,beforeBulk.bars);
        assert.deepEqual((await model(page)).performance,beforeBulk.performance);
        await page.click('#sc-redo');
        assert.deepEqual((await model(page)).bars,bulkSong.bars);
        assert.deepEqual((await model(page)).performance,bulkSong.performance);
        await page.click('#sc-undo');
        await list.click();
        await zoom.getByLabel('編集する位置').selectOption(ids[2]);
        await zoom.getByRole('button',{name:'編集',exact:true}).click();
        await openAdvancedFromForm();
        await page.locator('.score-form-range').waitFor();
        const overlay=page.locator('#sc-slot-overlay');
        assert((await overlay.boundingBox()).y>=90 && (await overlay.boundingBox()).y<=113);
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
        assert((await overlay.boundingBox()).y>=90 && (await overlay.boundingBox()).y<=113);
        const saveToBook=page.getByRole('button',{name:'コード本棚に保存',exact:true});
        const geometry=await saveToBook.evaluate(e=>{
            const r=e.getBoundingClientRect(),card=e.closest('.cc-fb-card').getBoundingClientRect();
            return {width:r.width,height:r.height,right:card.right-r.right,margin:parseFloat(getComputedStyle(e).marginTop)};
        });
        assert(geometry.width<=150&&geometry.height<=36&&geometry.margin>=10&&geometry.right>=8&&geometry.right<=26,JSON.stringify(geometry));
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
        // Use the native Chord Cruise bookshelf and its actual A-shape fingerings.
        const nativeExamples=await book.evaluate(template=>{
            const app=ChordCruise;
            return [['Dm',2,'m',5],['G7',7,'7',10]].map(([name,rootPc,qualityKey,fret])=>{
                const form=app.caged.getForm('A',qualityKey,rootPc,13,0);
                const record={...template,chordName:name,rootPc,qualityKey,shape:'A',keyContext:null,
                    intervals:app.theory.QUALITIES[qualityKey].intervals,notes:form.notes,mutedStrings:form.mutedStrings,fretRange:form.fretRange};
                delete record.id;
                const item=app.storage.saveChord(record);
                return {id:item.id,bars:app.caged.detectBarres(form.notes),fret};
            });
        },saved);
        await book.reload();
        await book.click('#cc-go-library');
        await folder.click();await book.getByText('G',{exact:true}).first().waitFor();
        for(const {id,bars,fret} of nativeExamples){
            assert.deepEqual(bars,[{finger:1,fret,fromString:1,toString:5}]);
            const thumbnail=book.locator('[data-chord-thumb="'+id+'"]');
            assert.equal(await thumbnail.locator('rect[rx="18"][width="36"]').count(),1);
            await book.locator('[data-chord-id="'+id+'"]').click();
            const barre=book.locator('#cc-lib-fb .cc-fb-barre');await barre.waitFor();
            const color=await barre.evaluate(e=>getComputedStyle(e).backgroundColor);
            assert(color!=='transparent' && color!=='rgba(0, 0, 0, 0)');
            await book.evaluate(()=>ChordCruise.ui.library.back());
        }
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
        await expectBarres(page);
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
        await box(viewer,0).waitFor();await expectBarres(viewer);
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
