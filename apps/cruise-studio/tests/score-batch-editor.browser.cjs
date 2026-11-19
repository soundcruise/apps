const test = require('node:test');
const assert = require('node:assert/strict');
const {chromium, webkit} = require('playwright');
const origin = 'http://127.0.0.1:18874';

for (const engine of ['chrome', 'webkit']) test('score editor batch tools and form transfers: ' + engine, async () => {
    const browser = await (engine === 'webkit' ? webkit.launch() :
        chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}));
    const context = await browser.newContext({viewport:{width:1440, height:1000}});
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const read = () => page.evaluate(() => CruiseStudio.sheetCruise.getSession().workingSnapshot());
    const open = async id => {
        await page.click('#sc-curve-menu-toggle');
        await page.click('#' + id);
        await page.locator('[data-score-dialog]').waitFor();
    };
    const apply = async () => {
        await page.click('[data-preset-stage]');
        await page.click('[data-score-apply]');
        await page.locator('[data-score-dialog]').waitFor({state:'detached'});
    };
    const bar = number => page.locator('.editor-measure[data-bar-number="' + number + '"]');
    const cell = (number, tick) => bar(number).locator('[data-overlay-field=chord][data-slot-tick="' + tick + '"]');
    try {
        await context.addInitScript(() => localStorage.setItem('rhythmCruiseCreatePresets:v1', JSON.stringify([{
            name:'リズム自作', stageN:2, patternBars:1,
            pattern:['hit','tie','rest','hit','hit','rest','hit','hit'],
            dirs:['down',null,null,'up','down',null,'down','up']
        }])));
        const {createUITestProject} = await import('../scripts/create-ui-test-project.mjs');
        const project = createUITestProject();
        await page.goto(origin);
        await page.click('#open-sheet-cruise');
        await page.locator('#sc-import-json').setInputFiles({
            name:'batch.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(project))
        });
        await page.waitForFunction(id => CruiseStudio.sheetCruise.getSession().draft.projectId === id, project.projectId);
        const before = await read();
        await open('sc-edit-chord-preset');
        const forms=root=>page.locator(root+' .sheet-form-event');
        assert.equal(await forms('.sc-preset-sheet-frame').count(),await forms('#sc-sheet-scale-box').count());
        await page.click('[data-score-cancel]');
        await page.click('#sc-display-menu-toggle');await page.locator('#sc-show-forms').check();await page.keyboard.press('Escape');
        await open('sc-edit-chord-preset');
        const ratios=async root=>forms(root).evaluateAll(nodes=>nodes.map(n=>{
            const bar=n.closest('.sheet-bar').getBoundingClientRect();
            return [n.firstElementChild.getBoundingClientRect().width/bar.width,n.getBoundingClientRect().width/bar.width];
        }));
        const main=await ratios('#sc-sheet-scale-box'),sample=await ratios('.sc-preset-sheet-frame');
        assert(main.length && main.length===sample.length);
        sample.forEach(([svg,box],i)=>{assert(Math.abs(svg-box)<0.01);assert(Math.abs(svg-main[i][0])<0.01);});
        const lane=page.locator('.sc-preset-cell-editor');
        assert.equal(await lane.locator('.sc-pattern-slot').count(),16);
        assert.equal(await lane.locator('input').count(),16);
        await lane.getByRole('button',{name:'コード・フォームを編集'}).click();
        await lane.locator('[data-selected-chord-name]').waitFor();
        await lane.locator('[data-chord-close]').click();
        await page.selectOption('[data-score-preset]', {label:'王道進行'});
        await page.getByLabel('Playキー', {exact:true}).selectOption('D');
        assert.equal(await page.locator('[data-preset-chord-cell]').count(), 4);
        assert.equal(await page.locator('[data-preset-chord-cell]').evaluateAll(nodes=>nodes.map(n=>n.value).join(' ')), 'G A F#m Bm');
        assert(await page.locator('[data-score-apply]').isDisabled());
        await page.getByText('プリセットを編集', {exact:true}).click();
        await page.getByRole('listitem',{name:'王道進行',exact:true}).getByRole('button',{name:'編集',exact:true}).click();
        await page.getByRole('button',{name:'プリセットに保存',exact:true}).click();
        await page.getByLabel('プリセット名').fill('テスト進行');
        await page.getByRole('dialog',{name:'プリセットに保存',exact:true}).getByRole('button',{name:'保存',exact:true}).click();
        // Saving a preset never changes the score.
        assert.deepEqual(await read(), before);
        await apply();
        const progressed = await read();
        assert.deepEqual(progressed.bars.slice(0, 4).map(b => b.chords.map(c => c.symbol)), [['G'], ['A'], ['F#m'], ['Bm']]);
        assert.deepEqual(progressed.bars[4], before.bars[4]);

        const paper = page.locator('#sc-sheet-scale-box .sheet-bar').first();
        await paper.click({position:{x:3,y:3}});
        await page.click('#sc-edit-selected');
        for (const count of [3,4]) {
            await page.click('[data-editor-bars="' + count + '"]');
            assert.equal(await page.locator('.editor-measure').count(), count);
        }
        await page.locator('[data-chord-toggle]').click();
        await page.locator('[data-selected-chord-name]').waitFor();
        const rowsAligned = await page.locator('.editor-measure .slot-overlay-row--strum').evaluateAll(rows => {
            const tops = rows.map(row => row.getBoundingClientRect().top);
            return Math.max(...tops) - Math.min(...tops) < 2;
        });
        assert(rowsAligned);
        await page.locator('[data-chord-toggle]').click();
        await page.locator('[data-row-resolution=chord]').first().click();
        assert.equal(await bar(4).locator('[data-overlay-field=chord]').count(), 16);
        const transferred = progressed.bars[0].chords[0];
        const binding = progressed.performance.formBindings.find(item => item.chordEventId === transferred.id);
        assert(binding, 'fixture chord should have a registered form');
        const replaced = progressed.bars[1].chords[0];
        await cell(1, 0).locator('..').locator('[data-chord-drag-handle]').dragTo(cell(2, 0));
        const overwritten = await read();
        assert.equal(overwritten.bars[0].chords.length, 0);
        assert.equal(overwritten.bars[1].chords[0].id, transferred.id);
        assert(!overwritten.performance.formBindings.some(item => item.chordEventId === replaced.id));
        assert.deepEqual(overwritten.performance.formBindings.find(item => item.chordEventId === transferred.id), binding);
        await cell(2, 0).press('Control+z');
        assert.deepEqual(await read(), progressed);
        await cell(1, 0).locator('..').locator('[data-chord-drag-handle]').dragTo(cell(2, 120));
        await page.waitForFunction(id => CruiseStudio.sheetCruise.getSession().draft.bars[1].chords.some(c => c.id === id), transferred.id);
        const moved = await read();
        assert.equal(moved.bars[0].chords.length, 0);
        assert.equal(moved.bars[1].chords.find(c => c.id === transferred.id).onsetTick, 120);
        assert.deepEqual(moved.performance.formBindings.find(item => item.chordEventId === transferred.id), binding);
        await cell(2, 120).focus();
        await cell(2, 120).press('ControlOrMeta+a');
        await cell(2, 120).press('ControlOrMeta+c');
        await cell(3, 120).focus();
        await cell(3, 120).press('ControlOrMeta+v');
        const pasted = await read();
        const duplicate = pasted.bars[2].chords.find(chord => chord.onsetTick === 120);
        assert(duplicate && duplicate.id !== transferred.id);
        const newBinding = pasted.performance.formBindings.find(item => item.chordEventId === duplicate.id);
        assert.equal(newBinding.materialId, binding.materialId);
        assert.deepEqual(newBinding.playedStrings, binding.playedStrings);
        assert(await page.evaluate(id => {
            const C = CruiseStudio, p = C.sheetCruise.getSession().workingSnapshot();
            return C.localChordForms.evaluate(p, p.performance.formBindings.find(item => item.chordEventId === id)).ready;
        }, duplicate.id));
        await cell(3, 120).press('Control+z');
        assert.deepEqual(await read(), moved);
        await cell(3, 120).press('ControlOrMeta+z');
        assert.deepEqual(await read(), progressed);
        await page.setViewportSize({width:390, height:844});
        assert.equal(await page.locator('.editor-measure').count(), 4);
        const editorScrolls = await page.locator('.editor-score-scroll').evaluate(e => e.scrollWidth > e.clientWidth);
        assert(editorScrolls);
        await page.setViewportSize({width:1440, height:1000});
        await page.locator('#sc-practice-tempo').fill('400');
        await page.locator('#sc-practice-tempo').press('Tab');
        // Exercise the keyboard-accessible play button after the viewport resize.
        await page.locator('[data-bar-preview]').press('Enter');
        await page.waitForFunction(() => document.querySelector('#sc-slot-overlay').dataset.playbackBar === '4');
        await page.waitForFunction(() => !document.querySelector('#sc-slot-overlay').dataset.playbackBar);
        await page.getByRole('button', {name:'小節ルーペを閉じる'}).click();

        await open('sc-edit-rhythm');
        await page.selectOption('[data-score-preset]',{label:'基本の8分'});
        const pattern=page.locator('.sc-strum-preset-grid > div').first();
        const unit=pattern.getByRole('button',{name:'1小節目の入力単位を切り替え'});
        await unit.click(); // 16th notes
        await unit.click(); // quarter notes
        const strokes=pattern.locator('[data-stroke]');
        const visibleStrokes=()=>strokes.evaluateAll(cells=>cells.map(cell=>{
            const direction=cell.querySelector('[data-strum-arrow]')?.dataset.strumArrow;
            return direction==='down'?'↓':direction==='up'?'↑':cell.textContent;
        }));
        assert.deepEqual(await visibleStrokes(),['↓','↓','↓','↓']);
        const entry=strokes.first();
        await entry.press('Delete');assert.equal(await entry.innerHTML(),'');
        for (const [key,marker] of [['r','[data-rest-ticks="480"]'],['d','[data-strum-arrow="down"]']]){
            await entry.press(key);
            assert.equal(await entry.locator(marker).count(),1);
        }
        await entry.press('x');assert.equal(await entry.textContent(),'x');
        await entry.press('d');
        const beat=pattern.locator('.sc-stroke-beat-unit').nth(1);
        const lockVisible=()=>beat.evaluate(el=>{
            const style=getComputedStyle(el,'::before');
            return style.content!=='none' && style.content!=='normal' && (style.maskImage||style.webkitMaskImage).includes('svg');
        });
        assert.equal(await lockVisible(),false);
        await beat.click();
        assert.equal(await lockVisible(),true);
        assert.equal(await strokes.count(),5);
        await beat.click();
        assert.equal(await strokes.count(),7);
        const denseCell=strokes.nth(4); // last sixteenth directly above the resolution button
        await denseCell.scrollIntoViewIfNeeded();
        const cellBox=await denseCell.boundingBox(), buttonBox=await beat.boundingBox();
        assert.ok(buttonBox.y-(cellBox.y+cellBox.height)>=4,'stroke and beat controls have separate hit areas');
        await page.mouse.click(cellBox.x+cellBox.width-2,cellBox.y+cellBox.height-2);
        assert.ok(await denseCell.evaluate(el=>el.hasAttribute('data-selected')));
        assert.equal(await beat.textContent(),'16');
        await strokes.nth(2).press('u');
        assert.deepEqual(await visibleStrokes(),['↓','↓','↑','〜','〜','↓','↓']);
        await unit.click(); // whole note, with beat two fixed at 16th notes
        assert.equal(await beat.getAttribute('aria-pressed'),'true');
        await beat.click(); // auto
        assert.equal(await lockVisible(),false);
        assert.deepEqual(await visibleStrokes(),['↓']);
        await page.selectOption('[data-score-preset]',{label:'4分連続'});
        await page.selectOption('[data-score-preset]',{label:'基本の8分'});
        await unit.click();await unit.click();
        await page.locator('.sc-preset-paper .sheet-bar[data-bar-number]').first().click();
        await strokes.first().press('r');
        await page.click('[data-preset-stage]');
        const measureRow=root=>page.locator(root+' .sheet-bar[data-bar-number="1"] .sheet-bar-strum');
        const durations=row=>row.locator('[data-slot-ticks]').evaluateAll(cells=>cells.map(c=>Number(c.dataset.slotTicks)));
        const sampleRow=measureRow('.sc-preset-paper');
        assert.deepEqual(await durations(sampleRow),[480,480,480,480]);
        assert.equal(await sampleRow.locator('[data-rest-ticks="480"]').count(),1);
        await beat.click();await beat.click();
        await strokes.nth(2).press('Delete');
        await page.click('[data-preset-stage]');
        assert.deepEqual(await durations(sampleRow),[480,120,120,120,120,480,480]);
        assert.equal(await sampleRow.locator('[data-slot-tick="600"]').getAttribute('data-strum-state'),'empty');
        await page.keyboard.press('Control+z');
        assert.deepEqual(await durations(sampleRow),[480,480,480,480]);
        await page.click('[data-score-apply]');
        await page.locator('[data-score-dialog]').waitFor({state:'detached'});
        assert.deepEqual(await durations(measureRow('#sc-sheet-scale-box')),[480,480,480,480]);
        const quarterSong=await read();
        const firstBinding=quarterSong.performance.barRhythms.find(b=>b.barId===quarterSong.bars[0].id);
        const quarterSlots=quarterSong.materials.rhythms.find(m=>m.id===firstBinding.materialId).snapshot.slots;
        assert.deepEqual(quarterSlots.map(s=>[s.tick,s.action,s.durationTicks]),[0,480,960,1440].map(t=>[t,t===0?'rest':'down',480]));
        // The previously staged mixed pattern must also reopen with the same beat lock.
        await open('sc-edit-rhythm');
        await page.selectOption('[data-score-preset]',{label:'4分連続'});
        await beat.click();await beat.click();
        await page.locator('.sc-preset-paper .sheet-bar[data-bar-number]').first().click();
        await apply();
        // Capture the mixed grid from the paper, save, dismiss and reopen the library.
        await open('sc-edit-rhythm');
        await page.getByRole('button',{name:'譜面からプリセット追加'}).click();
        const capture=page.getByRole('dialog',{name:'譜面からプリセット追加',exact:true});
        const sourceBar=capture.locator('.sheet-bar[data-bar-number="1"]');
        await sourceBar.scrollIntoViewIfNeeded();
        const sourceBox=await sourceBar.boundingBox(), captureY=sourceBox.y+12;
        await page.mouse.move(sourceBox.x-10,captureY);await page.mouse.down();
        await page.mouse.move(sourceBox.x+sourceBox.width+10,captureY,{steps:8});
        assert.equal(await capture.locator('[data-preset-source]').count(),2);
        await page.mouse.up();
        assert.equal(await capture.locator('.sc-strum-preset-grid > div').count(),2);
        await sourceBar.click({position:{x:10,y:12}});
        assert.equal(await capture.locator('[data-stroke]').count(),7);
        assert.equal(await capture.locator('.sc-stroke-beat-unit').nth(1).getAttribute('aria-pressed'),'true');
        await capture.getByRole('button',{name:'プリセットに保存'}).click();
        await page.getByLabel('プリセット名',{exact:true}).fill('混在する音価');
        await page.getByRole('dialog',{name:'プリセットに保存',exact:true}).getByRole('button',{name:'保存',exact:true}).click();
        await capture.waitFor({state:'detached'});
        await page.click('[data-score-cancel]');
        await open('sc-edit-rhythm');
        await page.selectOption('[data-score-preset]',{label:'混在する音価'});
        assert.equal(await page.locator('.sc-strum-preset-grid [data-stroke]').count(),7);
        assert.equal(await page.locator('.sc-stroke-beat-unit').nth(1).getAttribute('aria-pressed'),'true');
        await page.click('[data-score-cancel]');
        await page.locator('#sc-sheet-scale-box .sheet-bar[data-bar-number="1"]').click({position:{x:4,y:4}});
        await page.click('#sc-edit-selected');
        assert.deepEqual(await durations(bar(1).locator('.dock-strum-grid')),[480,120,120,120,120,480,480]);
        assert.equal(await bar(1).locator('[data-resolution-row=strum].is-local').textContent(),'16');
        await page.getByRole('button',{name:'小節ルーペを閉じる'}).click();
        await page.click('#sc-undo');
        assert.deepEqual(await read(),quarterSong);
        await page.locator('#sc-sheet-scale-box .sheet-bar[data-bar-number="1"]').click({position:{x:4,y:4}});
        await page.click('#sc-edit-selected');
        const strokeRow=bar(1).locator('.dock-strum-grid');
        assert.deepEqual(await durations(strokeRow),[480,480,480,480]);
        const rowUnit=bar(1).locator('[data-row-resolution=strum]');
        assert.equal(await rowUnit.textContent(),'4');
        for(const next of ['全','2','8','16']){
            await rowUnit.click();assert.equal(await rowUnit.textContent(),next);
        }
        const strokeAt=tick=>strokeRow.locator('[data-slot-tick="'+tick+'"]');
        for(const [tick,key] of [[0,'d'],[120,'u'],[240,'d'],[360,'u']])await strokeAt(tick).press(key);
        const denseSong=await read();
        await rowUnit.click();
        assert.deepEqual(await durations(strokeRow),[480,480,480,480]);
        assert.deepEqual(await read(),denseSong);
        await strokeAt(0).press('u');
        const coarseSong=await read();
        const active=coarseSong.performance.barRhythms.find(b=>b.barId===coarseSong.bars[0].id);
        const editedRhythm=coarseSong.materials.rhythms.find(m=>m.id===active.materialId).snapshot;
        assert.deepEqual(editedRhythm.slots.map(s=>[s.tick,s.action,s.durationTicks]),[[0,'up',480],[480,'down',480],[960,'down',480],[1440,'down',480]]);
        assert.deepEqual(await durations(measureRow('#sc-sheet-scale-box')),[480,480,480,480]);
        await page.click('#sc-undo');
        assert.deepEqual(await read(),denseSong);
        assert.equal(await strokeRow.locator('[data-slot-ticks="120"]').count(),16);
        await page.getByRole('button',{name:'小節ルーペを閉じる'}).click();
        for(let i=0;i<4;i++)await page.click('#sc-undo');
        assert.deepEqual(await read(),quarterSong);
        await page.click('#sc-undo');
        await open('sc-edit-rhythm');
        await page.selectOption('[data-score-preset]', {label:'リズム自作'});
        assert.equal(await page.locator('.sc-strum-preset-grid [data-stroke]').count(), 8);
        await page.getByText('プリセットを編集', {exact:true}).click();
        await page.getByRole('listitem',{name:'リズム自作',exact:true}).getByRole('button',{name:'編集',exact:true}).click();
        await page.getByRole('button',{name:'プリセットに保存',exact:true}).click();
        await page.getByLabel('プリセット名').fill('ストローク自作');
        await page.getByRole('dialog',{name:'プリセットに保存',exact:true}).getByRole('button',{name:'保存',exact:true}).click();
        await page.locator('.sc-preset-paper .sheet-section-label').first().click();
        await apply();
        const stroked = await read();
        const firstSection = stroked.bars.filter(bar => bar.sectionId === before.sections[0].id);
        const changedBindings = stroked.performance.barRhythms.filter(binding => firstSection.some(bar => bar.id === binding.barId));
        assert.equal(changedBindings.length, firstSection.length);
        const rhythm = stroked.materials.rhythms.find(item => item.id === changedBindings[0].materialId);
        assert.equal(rhythm.snapshot.name, 'ストローク自作');
        const {slots} = rhythm.snapshot;
        assert.deepEqual(slots.slice(0, 3).map(slot => [slot.tick,slot.action,slot.durationTicks]),
            [[0,'down',480],[480,'rest',240],[720,'up',240]]);
        assert.deepEqual(stroked.bars, progressed.bars);
        await page.click('#sc-undo');
        assert.deepEqual(await read(), progressed);

        // Choose two bars through the score UI and apply a two-bar pattern.
        await paper.click({position:{x:3,y:3}});
        await page.locator('#sc-sheet-scale-box .sheet-bar').nth(1).click({position:{x:3,y:3}, modifiers:['Shift']});
        await open('sc-edit-rhythm');
        assert.equal(await page.getByLabel('適用範囲').count(), 0);
        await page.selectOption('[data-score-preset]', {label:'シンコペーション'});
        // Observe the sample sources actually scheduled by the pattern's play button.
        await page.evaluate(()=>{
            const proto=AudioBufferSourceNode.prototype;
            const start=proto.start,stop=proto.stop;
            const voices=new Map();
            proto.start=function(time,...rest){voices.set(this,{start:time});return start.call(this,time,...rest);};
            proto.stop=function(time){if(voices.has(this)&&Number.isFinite(time))voices.get(this).end=time;return stop.call(this,time);};
            window.patternAudioProbe={voices,dispose(){delete proto.start;delete proto.stop;
                if(proto.start!==start)proto.start=start;if(proto.stop!==stop)proto.stop=stop;}};
        });
        const beatSeconds=60/Number(await page.locator('#sc-practice-tempo').inputValue());
        await page.locator('[data-preview-play="pattern"]').click();
        await page.waitForFunction(beat=>{
            const notes=Array.from(window.patternAudioProbe.voices.values());
            return notes.length && notes.some(n=>n.start>=notes[0].start+4.49*beat);
        },beatSeconds);
        const notes=await page.evaluate(()=>{const probe=window.patternAudioProbe;
            const recorded=Array.from(probe.voices.values());probe.dispose();delete window.patternAudioProbe;return recorded;});
        const downbeat=notes[0].start+4*beatSeconds;
        assert(notes.some(n=>n.start<downbeat && n.end>downbeat+.25*beatSeconds),'a scheduled guitar sample rings into bar two');
        assert(!notes.some(n=>Math.abs(n.start-downbeat)<.005),'bar two starts without another pick attack');
        const measures=page.locator('.sc-preset-paper .sheet-bar[data-bar-number]');
        const stage=page.locator('[data-preset-stage]');
        await measures.first().click();
        assert.equal(await page.locator('[data-preset-destination]').count(),2);
        const dragStart=await measures.first().boundingBox(),dragEnd=await measures.nth(2).boundingBox();
        await page.mouse.move(dragStart.x-8,dragStart.y+10);await page.mouse.down();
        await page.mouse.move(dragEnd.x+10,dragEnd.y+10,{steps:10});
        const selectedBars=()=>page.locator('[data-preset-destination]').evaluateAll(nodes=>nodes.map(n=>+n.dataset.barNumber));
        assert.deepEqual(await selectedBars(),[1,2,3,4]);
        await page.mouse.up();
        assert.deepEqual(await selectedBars(),[1,2,3,4]);
        await measures.nth(2).click({modifiers:['Shift']});
        assert.deepEqual(await page.locator('[data-preset-destination]').evaluateAll(nodes=>nodes.map(n=>+n.dataset.barNumber)),[1,2,3,4]);
        assert(await stage.isEnabled());
        await measures.nth(4).click();await measures.nth(2).click({modifiers:['Shift']});
        assert.deepEqual(await page.locator('[data-preset-destination]').evaluateAll(nodes=>nodes.map(n=>+n.dataset.barNumber)),[2,3,4,5]);
        const end=await measures.count();
        await measures.nth(end-3).click();await measures.last().click({modifiers:['Shift']});
        assert.deepEqual(await selectedBars(),[end-3,end-2,end-1,end]);
        await measures.last().click();
        assert(await stage.isDisabled());
        await measures.first().click();
        const patternBars=page.locator('.sc-strum-preset-grid > div');
        const firstBox=await patternBars.first().boundingBox();
        const secondBox=await patternBars.nth(1).boundingBox();
        assert.equal(firstBox.y,secondBox.y);
        const scoreTop=(await page.locator('.sc-preset-sheet-frame').boundingBox()).y;
        await page.getByRole('button',{name:'＋ 小節',exact:true}).click();
        const thirdBox=await patternBars.nth(2).boundingBox();
        assert(thirdBox.y>=firstBox.y+firstBox.height-1);
        assert((await page.locator('.sc-preset-sheet-frame').boundingBox()).y>scoreTop);
        assert.equal(await page.locator('[data-preset-destination]').count(),3);
        await measures.nth(2).click({modifiers:['Shift']});
        assert.deepEqual(await selectedBars(),[1,2,3,4]);
        await measures.first().click();
        await page.getByRole('button',{name:'末尾の空小節を削除',exact:true}).click();
        assert.equal(await page.locator('[data-preset-destination]').count(),2);
        await apply();
        const range = await read(), firstIds = range.bars.slice(0, 2).map(b => b.id);
        const inRange = range.performance.barRhythms.filter(b => firstIds.includes(b.barId));
        assert.equal(inRange.length, 2);
        assert.notEqual(inRange[0].materialId, inRange[1].materialId);
        const carry=range.materials.rhythms.find(m=>m.id===inRange[1].materialId).snapshot;
        assert.equal(carry.leadingSustainTicks,240);
        assert.equal(carry.slots[0].tick,240);
        await page.locator('#sc-sheet-scale-box .sheet-bar[data-bar-number="2"]').click({position:{x:4,y:4}});
        await page.click('#sc-edit-selected');
        const firstTick=bar(2).locator('.dock-strum-cell[data-slot-tick="0"]');
        assert.equal(await firstTick.getAttribute('data-strum-state'),'sustain');
        await firstTick.press('Delete');
        assert.equal(await firstTick.getAttribute('data-strum-state'),'empty');
        await firstTick.press('~');
        assert.equal(await firstTick.getAttribute('data-strum-state'),'sustain');
        await page.getByRole('button',{name:'小節ルーペを閉じる'}).click();
        await page.click('#sc-undo');
        await page.click('#sc-undo');
        assert.deepEqual(await read(),range);
        assert.deepEqual(range.performance.barRhythms.filter(b => !firstIds.includes(b.barId)),
            progressed.performance.barRhythms.filter(b => !firstIds.includes(b.barId)));
        await page.click('#sc-undo');

        // Make a pattern in the cell grid, save it, then use it for the whole song.
        await open('sc-edit-rhythm');
        await page.getByText('プリセットを編集', {exact:true}).click();
        await page.getByRole('listitem',{name:'4分連続',exact:true}).getByRole('button',{name:'編集',exact:true}).click();
        await page.getByText('パターンを編集・読み込む', {exact:true}).click();
        await page.getByLabel('リズムクルーズのプリセットJSON（4・8・16分）').setInputFiles({
            name:'rhythm-preset.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify({
                name:'ファイルから読み込み', stageN:1, patternBars:1, pattern:['hit','rest','hit','rest']
            }))
        });
        await page.waitForFunction(() => document.querySelector('[data-score-preset]').selectedOptions[0].text === 'ファイルから読み込み');
        await page.getByRole('button', {name:'空のパターンを作る'}).click();
        await page.locator('.sc-strum-preset-grid [data-stroke]').first().click();
        await page.locator('.sc-strum-preset-grid [data-stroke]').first().click();
        await page.getByRole('button',{name:'プリセットに保存',exact:true}).click();
        await page.getByLabel('プリセット名').fill('頭だけダウン');
        await page.getByRole('dialog',{name:'プリセットに保存',exact:true}).getByRole('button',{name:'保存',exact:true}).click();
        { const bars=page.locator('.sc-preset-paper .sheet-bar[data-bar-number]'); await bars.first().click(); await bars.last().click({modifiers:['Shift']}); }
        await apply();
        const all = await read();
        assert.deepEqual(all.performance.barRhythms, []);
        const basic = all.materials.rhythms.find(m => m.id === all.performance.basicRhythmId);
        assert.equal(basic.snapshot.name, '頭だけダウン');
        assert.deepEqual(basic.snapshot.slots.map(e => e.action), ['down','rest','rest','rest']);
        assert.deepEqual(all.bars, progressed.bars);
        await page.click('#sc-undo');
        assert.deepEqual(await read(), progressed);
        assert.deepEqual(errors, []);
    } finally {
        await context.close();
        await browser.close();
    }
});

for (const engine of ['chrome','webkit']) test('preset auditions, library operations and content editing: '+engine, async () => {
    const browser = await (engine==='webkit' ? webkit.launch() :
        chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}));
    const page = await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.setDefaultTimeout(9000);
    await page.route('**/*',r=>new URL(r.request().url()).origin===origin ? r.continue() : r.abort());
    const button = name=>page.getByRole('button',{name,exact:true});
    const play = kind=>page.locator('[data-preview-play="'+kind+'"]');
    const waitPlaying = kind=>page.waitForFunction(kind=>{
        const btn=document.querySelector('[data-preview-play="'+kind+'"]');
        return btn?.getAttribute('aria-pressed')==='true' && btn.getAttribute('aria-busy')==='false';
    },kind);
    try {
        const {createUITestProject}=await import('../scripts/create-ui-test-project.mjs');
        const project=createUITestProject();
        await page.goto(origin);
        await page.click('#open-sheet-cruise');
        await page.locator('#sc-import-json').setInputFiles({name:'song.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
        await page.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,project.projectId);
        const snapshot=()=>page.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
        const before=await snapshot();
        for (const [mode,first] of [['chord-preset','基本進行'],['rhythm','4分連続']]) {
            const open=async()=>{await page.click('#sc-curve-menu-toggle');await page.click('#sc-edit-'+mode);};
            const row=name=>page.getByRole('listitem',{name,exact:true});
            const act=(item,name)=>row(item).getByRole('button',{name,exact:true}).click();
            await open();
            await play('score').waitFor({state:'visible'});
            await page.keyboard.press('Space');
            await waitPlaying('score');
            const cursor=page.locator('.sc-preset-paper [data-layout-playhead]');
            await cursor.waitFor();
            const initial=await cursor.evaluate(el=>getComputedStyle(el).transform);
            await page.waitForFunction(initial=>getComputedStyle(document.querySelector('.sc-preset-paper [data-layout-playhead]')).transform!==initial,initial);
            assert.equal(await cursor.count(),1);
            const inside=await cursor.evaluate(el=>{
                const line=el.getBoundingClientRect();
                const bar=el.parentElement.querySelector('.sc-layout-playing').getBoundingClientRect();
                return Math.abs(line.top-bar.top)<2 && Math.abs(line.height-bar.height)<2 &&
                    line.left>=bar.left-2 && line.left<=bar.right+2;
            });
            assert(inside,'the moving line spans the active measure');
            await page.keyboard.press('Space');
            await cursor.waitFor({state:'detached'});
            assert.equal(await play('score').getAttribute('aria-pressed'),'false');
            await play('pattern').click(); await waitPlaying('pattern');
            await play('score').click(); await waitPlaying('score');
            assert.equal(await play('pattern').getAttribute('aria-pressed'),'false');
            await play('score').click();
            await page.click('[data-preset-stage]');
            await play('score').click(); await waitPlaying('score');
            await button('プリセットを編集').click();
            const author=page.getByRole('dialog',{name:'プリセットを編集',exact:true});
            assert(await page.getByLabel('プリセット一覧',{exact:true}).isVisible());
            assert.equal(await author.getByRole('button',{name:'プリセットに保存',exact:true}).count(),0);
            const list=page.getByLabel('プリセット一覧',{exact:true});
            const actions=row(first).locator('.sc-preset-list-actions button');
            assert.equal(await actions.count(),6);
            for(const action of await actions.all())assert((await action.getAttribute('title')).includes(first));
            const editStyle=await actions.first().evaluate(el=>[getComputedStyle(el).fontWeight,getComputedStyle(el).fontSize]);
            assert.deepEqual(editStyle,['500','13px']);
            await act(first,'複製');
            await act(first+' (2)','名前を変更');await page.getByLabel('新しいプリセット名').fill('試験用');
            await act(first+' (2)','変更を保存');await act('試験用','上へ');
            assert.equal(await list.getByRole('listitem').first().getAttribute('aria-label'),'試験用');
            await act('試験用','下へ');await act('試験用','上へ');
            await act('試験用','削除');await act('試験用','キャンセル');
            await act('試験用','削除');await act('試験用','削除する');
            assert.equal(await row('試験用').count(),0);
            await act(first,'編集');
            assert.equal(await author.getByText('このプリセットの整理').count(),0);
            if(mode==='chord-preset') {
                const cell=author.getByRole('textbox',{name:'1小節 1拍のコード',exact:true});
                await cell.fill('Dm');await cell.press('Enter');
                await author.getByRole('button',{name:'コード・フォームを編集'}).click();
                await author.locator('[data-selected-chord-name]').waitFor();
                assert.equal(await author.locator('[data-selected-chord-name]').textContent(),'Dm');
                // A CAGED form chosen in the owner picker persists with this occurrence.
                await author.locator('[data-chord-advanced]').click();
                await author.locator('[data-chord-shape="A"]').click();
                const finger=author.locator('.score-chord-diagram .cc-fb-marker:not([data-fret="0"])').first();
                await finger.click();
            } else {
                await author.locator('.sc-stroke-beat-unit').nth(1).click();
                await author.locator('.sc-strum-preset-grid [data-stroke]').first().click();
                await author.locator('.sc-strum-preset-grid [data-stroke]').first().click();
            }
            await button('プリセットに保存').click();
            assert.equal(await page.getByLabel('プリセット名',{exact:true}).inputValue(),first);
            await page.getByRole('dialog',{name:'プリセットに保存',exact:true}).getByRole('button',{name:'保存',exact:true}).click(); await author.waitFor({state:'detached'});
            if(mode==='chord-preset') {
                const saved=await page.evaluate(()=>CruiseStudio.storage.getAppSetting('scoreChordPresetsLibraryV2').items[0].pattern[0][0].form);
                assert.equal(saved.material.provenance.shape,'A');
                assert.equal(saved.material.snapshot.ownerWarning,'変更した押さえ方は未確認');
            }
            await page.click('[data-score-cancel]');
            assert.deepEqual(await snapshot(),before);
            await open();
            if(mode!=='chord-preset')await page.selectOption('[data-score-preset]',{label:first});
            assert.equal(await page.locator('[data-score-preset] option:checked').textContent(),first);
            if(mode==='chord-preset') assert.equal(await page.locator('[data-preset-chord-cell]').first().inputValue(),'Dm');
            else {
                assert.equal(await page.locator('.sc-strum-preset-grid [data-stroke]').first().locator('[data-strum-arrow=up]').count(),1);
                assert.equal(await page.locator('.sc-stroke-beat-unit').nth(1).getAttribute('aria-pressed'),'true');
                assert.equal(await page.locator('.sc-strum-preset-grid [data-stroke]').count(),5);
            }
            await play('pattern').click();await waitPlaying('pattern');await page.keyboard.press('Escape');
            await page.locator('[data-score-dialog]').waitFor({state:'detached'});
        }
        // Old presets may contain more than one onset within a quarter note.
        await page.evaluate(()=>CruiseStudio.storage.setAppSetting('scoreChordPresetsLibraryV2',{
            items:[{id:'offbeat',name:'裏拍の進行',pattern:[[{tick:0,symbol:'C'},{tick:240,symbol:'F'}]]}],
            knownRhythms:[]
        }));
        await page.click('#sc-curve-menu-toggle');await page.click('#sc-edit-chord-preset');
        assert.equal(await page.locator('.sc-pattern-slot').count(),4);
        const offbeat=page.getByRole('textbox',{name:'1小節 1.5拍のコード',exact:true});
        assert.equal(await offbeat.inputValue(),'F');
        await offbeat.fill('Dm');await offbeat.press('Enter');
        await page.click('[data-preset-stage]');await page.click('[data-score-apply]');
        const applied=await snapshot();
        assert.deepEqual(applied.bars[0].chords.map(c=>[c.onsetTick,c.symbol]),[[0,'C'],[240,'Dm']]);
        assert.deepEqual(errors,[]);
    } finally {await browser.close();}
});
