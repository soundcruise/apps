const test = require('node:test');
const assert = require('node:assert/strict');
const {chromium, webkit} = require('playwright');
const origin = 'http://127.0.0.1:18874';
for (const engine of ['chrome', 'webkit']) test('editor transfers and batch score preview: ' + engine, async () => {
    const browser = await (engine === 'webkit' ? webkit.launch() :
        chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}));
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const snapshot = () => page.evaluate(() => CruiseStudio.sheetCruise.getSession().workingSnapshot());
    const openMenu = async selector => {
        await page.click('#sc-curve-menu-toggle');
        await page.click(selector);
        await page.locator('[data-score-dialog]').waitFor();
    };
    const editorBar = page.locator('.editor-measure[data-bar-number="2"]');
    try {
        const {createUITestProject} = await import('../scripts/create-ui-test-project.mjs');
        const project = createUITestProject();
        const binding = project.performance.barRhythms.find(item => item.barId === project.bars[1].id);
        const strokes = project.materials.rhythms.find(item => item.id === binding.materialId).snapshot.slots;
        // Distinct strokes make both the occupied drop and the subsequent paste observable edits.
        strokes.find(slot => slot.tick === 480).action = 'mute';
        await page.goto(origin);
        await page.click('#open-sheet-cruise');
        await page.locator('#sc-import-json').setInputFiles({name:'transfer.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(project))});
        await page.waitForFunction(id => CruiseStudio.sheetCruise.getSession().draft.projectId === id, project.projectId);
        const before = await snapshot();
        await page.locator('#sc-sheet-scale-box .sheet-bar[data-bar-number="2"]').click({position:{x:3,y:3}});
        await page.click('#sc-edit-selected');
        const measure = page.locator('.editor-measures'), wide = (await measure.boundingBox()).width;
        await page.getByRole('button',{name:'横に縮小',exact:true}).click();
        assert((await measure.boundingBox()).width < wide - 10);
        await page.getByRole('button',{name:'横方向を100%に戻す'}).click();
        const words = editorBar.locator('.dock-lyrics-cell');
        const chords = editorBar.locator('[data-overlay-field=chord]');
        const selected = page.locator('#sc-slot-overlay [data-cell-selected]');
        await chords.first().dblclick();
        await chords.nth(1).hover();
        await page.waitForTimeout(450);
        assert.equal(await chords.first().evaluate(e=>e.parentElement.hasAttribute('data-cell-editing')),true);
        assert.equal(await page.locator('.is-lifted').count(),0);
        await chords.nth(2).click();
        // A release consumed above the viewport must still end the press.
        await page.evaluate(() => {
            for (const type of ['pointerup','lostpointercapture']) {
                document.addEventListener(type, e=>e.stopPropagation(), {once:true,capture:true});
            }
        });
        await chords.first().click();
        await page.waitForTimeout(450);
        assert.equal(await page.locator('.is-lifted').count(),0,'released chord must not float');
        await chords.nth(4).hover();
        assert.equal(await selected.count(),1,'hover cannot extend a selection');
        await chords.nth(4).click();
        assert.deepEqual(await snapshot(),before,'a new click must not move the old chord');
        await chords.first().click();
        await chords.first().click({delay:550});
        assert(await chords.first().evaluate(input => document.activeElement===input &&
            input.parentElement.hasAttribute('data-cell-editing') && input.selectionStart===input.selectionEnd &&
            getComputedStyle(input).caretColor==='rgb(32, 40, 48)'));
        await chords.nth(4).click();
        const firstBox = await chords.first().boundingBox();
        await page.mouse.move(firstBox.x+firstBox.width/2,firstBox.y+firstBox.height/2);
        await page.mouse.down();
        await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
        await page.waitForTimeout(450);
        assert.equal(await page.locator('.is-lifted').count(),0,'interrupted press must not float');
        await chords.nth(3).hover();
        await page.mouse.up();
        assert.deepEqual(await snapshot(),before);
        // A hover with no primary button is also sufficient to cancel a press
        // when the browser delivered neither a release nor a capture-loss event.
        await chords.first().evaluate(input=>input.addEventListener('pointerdown', e=>{
            input.dataset.testPointerId=e.pointerId;
        }, {once:true}));
        await page.mouse.move(firstBox.x+firstBox.width/2,firstBox.y+firstBox.height/2);
        await page.mouse.down();
        await chords.first().evaluate(input=>{
            const other=input.closest('.editor-measure').querySelector('[data-overlay-field=chord][data-slot-tick="480"]');
            const rect=other.getBoundingClientRect();
            input.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:Number(input.dataset.testPointerId),
                pointerType:'mouse',buttons:0,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2}));
        });
        assert.equal(await selected.count(),1);
        await page.mouse.up();
        // An intentional long press still moves both the chord and its fingering.
        await words.nth(2).click();
        await page.mouse.move(firstBox.x+firstBox.width/2,firstBox.y+firstBox.height/2);
        await page.mouse.down();
        await page.locator('[data-range-row=chord].is-lifted').waitFor();
        const dropBox=await chords.nth(2).boundingBox();
        await page.mouse.move(dropBox.x+dropBox.width/2,dropBox.y+dropBox.height/2,{steps:8});
        await page.mouse.up();
        const movedProject=await snapshot(), originalChord=before.bars[1].chords[0];
        assert.equal(movedProject.bars[1].chords.find(chord=>chord.id===originalChord.id).onsetTick,480);
        const fingering=project=>project.performance.formBindings.find(binding=>binding.chordEventId===originalChord.id);
        assert(fingering(before));
        assert.deepEqual(fingering(movedProject),fingering(before));
        await chords.nth(2).press('ControlOrMeta+z');
        assert.deepEqual(await snapshot(),before);
        await words.nth(2).click();
        for (const field of [editorBar.locator('[data-overlay-field=chord]').first(),words.nth(0),editorBar.locator('[data-overlay-field=doremi]').first()]) {
            const cursor = () => field.evaluate(input => getComputedStyle(input).cursor);
            assert.equal(await cursor(),'pointer');
            await field.click();
            assert.equal(await cursor(),'pointer');
            await field.click();
            assert.equal(await cursor(),'text');
            assert(await field.evaluate(input => document.activeElement === input &&
                input.selectionStart === input.selectionEnd && getComputedStyle(input).caretColor !== 'rgba(0, 0, 0, 0)'));
            await field.evaluate(input => input.setSelectionRange(input.value.length,input.value.length));
            await field.press('ArrowLeft');
            assert(await field.evaluate(input => document.activeElement === input && input.selectionStart === input.value.length-1));
        }
        await words.nth(0).click();
        assert.equal(await page.locator('[data-cell-selected]').count(),1);
        assert.equal(await words.first().evaluate(e=>getComputedStyle(e).caretColor),'rgba(0, 0, 0, 0)');
        await words.nth(0).click();
        assert.equal(await page.locator('[data-cell-selected]').count(),0);
        await words.nth(1).click();
        await words.nth(1).press('a');
        assert.equal(await words.nth(1).inputValue(),'a');
        await words.nth(1).press('ControlOrMeta+z');
        assert.deepEqual(await snapshot(),before);
        await words.nth(0).click();
        await words.nth(1).click({modifiers:['Shift']});
        assert.equal(await page.locator('[data-cell-selected]').count(),2);
        const center = async field => {const box = await field.boundingBox();return [box.x+box.width/2,box.y+box.height/2];};
        await page.mouse.move(...await center(words.nth(0))); await page.mouse.down();
        await page.locator('.is-lifted').first().waitFor();
        await page.mouse.move(...await center(words.nth(3)),{steps:6}); await page.mouse.up();
        assert.equal(await words.nth(3).inputValue(), before.bars[1].lyrics[0].text);
        assert.equal(await words.nth(4).inputValue(), before.bars[1].lyrics[1].text);
        await words.nth(3).press('ControlOrMeta+z');
        assert.deepEqual(await snapshot(),before);
        await page.mouse.move(...await center(words.nth(1))); await page.mouse.down();
        await page.mouse.move(...await center(words.nth(3)),{steps:6}); await page.mouse.up();
        assert.equal(await page.locator('[data-cell-selected]').count(),3);
        await words.nth(1).press('ControlOrMeta+c');
        await words.nth(4).click();
        await words.nth(4).press('ControlOrMeta+v');
        for (let offset=0; offset<3; offset++) {
            assert.equal(await words.nth(4+offset).inputValue(),before.bars[1].lyrics[1+offset].text);
        }
        await words.nth(4).press('ControlOrMeta+z');
        assert.deepEqual(await snapshot(),before);
        await page.click('[data-editor-bars="4"]');
        const viewport = page.locator('.editor-score-scroll');
        const beforeWidth = await viewport.evaluate(e => e.scrollWidth);
        await page.getByRole('button', {name:'横に縮小',exact:true}).click();
        await page.getByRole('button', {name:'横に縮小',exact:true}).click();
        assert((await viewport.evaluate(e => e.scrollWidth)) < beforeWidth);
        const cases = [
            ['lyrics','.dock-lyrics-cell',p => p.bars[1].lyrics,'onsetTick'],
            ['doremi','[data-overlay-field=doremi]',p => p.bars[1].melody,'onsetTick'],
            ['strum','.dock-strum-cell',p => {
                const binding = p.performance.barRhythms.find(item => item.barId === p.bars[1].id);
                return p.materials.rhythms.find(item => item.id === binding.materialId).snapshot.slots;
            },'tick']
        ];
        for (const [row, selector, events, tickField] of cases) {
            const cell = tick => editorBar.locator(selector + '[data-slot-tick="' + tick + '"]');
            const original = events(before).find(event => event[tickField] === 0);
            assert(events(before).some(event => event[tickField] === 240), row + ' overwrites an occupied cell');
            await cell(0).locator('..').locator('[data-cell-drag-handle="' + row + '"]').dragTo(cell(240));
            const moved = await snapshot();
            assert.equal(events(moved).some(event => event[tickField] === 0), false, row);
            const landed = events(moved).find(event => event[tickField] === 240);
            const {id, ...data} = original;
            const {id:landedId, ...landedData} = landed;
            assert.deepEqual(landedData, {...data, [tickField]:240});
            if (row !== 'strum') assert.equal(landedId, id);
            await cell(240).focus();
            if (row !== 'strum') await cell(240).press('ControlOrMeta+a');
            await cell(240).press('ControlOrMeta+c');
            await cell(480).focus();
            await cell(480).press('ControlOrMeta+v');
            const copy = events(await snapshot()).find(event => event[tickField] === 480);
            assert(copy, row + ' should paste via the keyboard');
            const {id:copyId, ...copiedData} = copy;
            assert.deepEqual(copiedData, {...data,[tickField]:480});
            assert.notEqual(copyId, landedId);
            await cell(480).press('ControlOrMeta+z');
            assert.deepEqual(await snapshot(), moved);
            await cell(480).press('ControlOrMeta+z');
            assert.deepEqual(await snapshot(), before);
        }
        const stroke = (bar,tick) => page.locator('.editor-measure[data-bar-number="'+bar+'"] .dock-strum-cell[data-slot-tick="'+tick+'"]');
        const firstStroke = stroke(2,0), secondStroke = stroke(2,240);
        const upbeatChord = editorBar.locator('[data-overlay-field=chord][data-slot-tick="240"]');
        await secondStroke.press('Delete');
        assert.equal(await secondStroke.getAttribute('data-strum-state'),'empty');
        const blankUpbeat = await snapshot();
        await upbeatChord.fill('D');
        await upbeatChord.press('Tab');
        assert.equal(await secondStroke.getAttribute('data-strum-state'),'up');
        await upbeatChord.press('ControlOrMeta+z');
        assert.deepEqual(await snapshot(),blankUpbeat);
        await secondStroke.press('ControlOrMeta+z');
        assert.deepEqual(await snapshot(),before);

        const initialStroke = await firstStroke.getAttribute('data-strum-state');
        await firstStroke.click();
        assert.deepEqual(await snapshot(),before,'first stroke click only selects');
        const selectedStroke=page.locator('[data-range-row=strum][data-cell-selected]');
        assert.equal(await selectedStroke.evaluate(cell=>getComputedStyle(cell).backgroundColor),'rgb(237, 246, 255)');
        await firstStroke.click();
        const nextStroke = await firstStroke.getAttribute('data-strum-state');
        assert.notEqual(nextStroke,initialStroke);
        await firstStroke.click();
        assert.notEqual(await firstStroke.getAttribute('data-strum-state'),nextStroke,'third click changes the selected stroke again');
        await firstStroke.press('ControlOrMeta+z');
        assert.equal(await firstStroke.getAttribute('data-strum-state'),nextStroke);
        await firstStroke.press('ControlOrMeta+z');
        assert.deepEqual(await snapshot(),before);
        await words.first().click();
        await firstStroke.click();
        await secondStroke.click({modifiers:['Shift']});
        assert.equal(await selectedStroke.count(),2);
        await page.mouse.move(...await center(firstStroke));await page.mouse.down();
        await page.locator('.is-lifted').first().waitFor();
        await page.mouse.move(...await center(stroke(2,480)),{steps:6});await page.mouse.up();
        assert.equal(await stroke(2,0).getAttribute('data-strum-state'),'empty');
        assert.equal(await stroke(2,480).getAttribute('data-strum-state'),initialStroke);
        await stroke(2,480).press('ControlOrMeta+z');
        assert.deepEqual(await snapshot(),before);
        await firstStroke.click();
        await page.mouse.move(...await center(firstStroke));await page.mouse.down();
        await page.mouse.move(...await center(secondStroke),{steps:6});await page.mouse.up();
        assert.equal(await selectedStroke.count(),2,'drag selects without moving');
        const sourceActions=await selectedStroke.locator('button[data-strum-state]').evaluateAll(cells=>cells.map(cell=>cell.dataset.strumState));
        await firstStroke.press('ControlOrMeta+c');
        await stroke(3,1680).click();
        await stroke(3,1680).press('ControlOrMeta+v');
        assert.equal(await stroke(3,1680).getAttribute('data-strum-state'),sourceActions[0]);
        assert.equal(await stroke(4,0).getAttribute('data-strum-state'),sourceActions[1]);
        await stroke(3,1680).press('ControlOrMeta+z');
        assert.deepEqual(await snapshot(),before);

        await page.getByRole('button',{name:'横方向を100%に戻す'}).click();
        const practice=page.locator('#sc-practice-tempo');
        await practice.fill('300');await practice.press('Tab');
        const play=page.locator('[data-bar-preview]');
        await play.click();
        const geometry=await page.evaluate(()=>new Promise((resolve,reject)=>{
            const overlay=document.querySelector('#sc-slot-overlay'), seen=new Set(), samples=[];
            const deadline=performance.now()+4500;
            let cursor;
            function collect(){
                const lines=overlay.querySelectorAll('[data-score-playhead]');
                if(lines.length){
                    const first=!cursor;cursor ||= lines[0];
                    const bar=Number(overlay.dataset.playbackBar),tick=Number(overlay.dataset.playbackTick);
                    const x=lines[0].getBoundingClientRect().left;
                    const playing=overlay.querySelectorAll('.sc-editor-playing-bar');
                    const row=playing[0]?.querySelector('.slot-overlay-row--chord .slot-overlay-row-body');
                    const currentCell=row && Array.from(row.querySelectorAll('[data-slot-tick]')).find(input =>
                        tick>=Number(input.dataset.slotTick) && tick<Number(input.dataset.slotTick)+Number(input.dataset.slotTicks));
                    const rect=currentCell?.parentElement.getBoundingClientRect();
                    const view=overlay.querySelector('.editor-score-scroll'), bounds=view.getBoundingClientRect();
                    const overflow=view.scrollWidth-view.clientWidth;
                    const expectedScroll=(bar-2+tick/1920)/4*overflow;
                    const valid=lines.length===1&&(first||lines[0]===cursor)&&playing.length===1&&
                        Number(playing[0].dataset.barNumber)===bar&&getComputedStyle(row,'::after').content!=='none'&&
                        !overlay.querySelector('.sc-playing-cell,.sc-playing-note')&&rect&&x>=rect.left-2&&x<=rect.right+2&&
                        overflow>20&&Math.abs(view.scrollLeft-expectedScroll)<2&&x>=bounds.left-2&&x<=bounds.right+2;
                    samples.push({bar,tick,valid,scroll:view.scrollLeft,expectedScroll,overflow});
                    seen.add(bar);
                    if(seen.size>=4&&samples.filter(sample=>sample.bar===bar).length>=4)return resolve(samples);
                }
                if(performance.now()>deadline)return reject(Error(JSON.stringify(samples.slice(-8))));
                requestAnimationFrame(collect);
            }
            collect();
        }));
        assert(geometry.every(sample=>sample.valid),JSON.stringify(geometry.filter(sample=>!sample.valid).slice(0,6)));
        await play.click();
        assert.equal(await page.locator('#sc-slot-overlay [data-score-playhead],#sc-slot-overlay .sc-editor-playing-bar').count(),0);
        assert.deepEqual(await snapshot(),before);

        await page.getByRole('button', {name:'小節ルーペを閉じる'}).click();
        for (const action of ['#sc-edit-chord-preset','#sc-edit-rhythm']) {
            await openMenu(action);
            const root = page.locator('[data-score-dialog]'), sheet = root.locator('.sc-preset-paper');
            const original = await sheet.innerText();
            await root.locator('[data-preset-stage]').click();
            const firstStage=await sheet.innerText();
            if (action.endsWith('rhythm')) { const bars=page.locator('.sc-preset-paper .sheet-bar[data-bar-number]'); await bars.first().click(); await bars.last().click({modifiers:['Shift']}); }
            else await page.locator('.sc-preset-paper').getByRole('button',{name:'5小節目を選択',exact:true}).click();
            await root.locator('[data-preset-stage]').click();
            assert.notEqual(await sheet.innerText(),original);
            await page.keyboard.press('Control+z');assert.equal(await sheet.innerText(),firstStage);
            await page.keyboard.press('ControlOrMeta+z');assert.equal(await sheet.innerText(),original);
            assert(await root.locator('[data-score-apply]').isDisabled());
            await page.keyboard.press('Control+Shift+z');assert.equal(await sheet.innerText(),firstStage);
            assert.deepEqual(await snapshot(),before);
            await root.locator('[data-score-cancel]').click();
            assert.deepEqual(await snapshot(),before);
        }
        await openMenu('#sc-edit-chord-preset');
        await page.locator('.sc-preset-paper').getByRole('button',{name:'1小節目を選択',exact:true}).click();
        await page.click('[data-preset-stage]');
        await page.locator('.sc-preset-paper').getByRole('button',{name:'5小節目を選択',exact:true}).click();
        await page.click('[data-preset-stage]');
        await page.click('[data-score-apply]');
        const committed = await snapshot();
        for (const base of [0,4]) {
            assert.deepEqual(committed.bars.slice(base,base+4).map(bar=>bar.chords.map(event=>event.symbol)),[['C'],['F'],['G'],['C']]);
        }
        await page.locator('#sc-undo').focus();
        await page.keyboard.press('ControlOrMeta+z');
        assert.deepEqual(await snapshot(),before);
        await openMenu('#sc-edit-chord-preset');
        assert.deepEqual(await page.locator('[data-preset-chord-cell]').evaluateAll(nodes=>nodes.map(n=>n.value)), ['C','F','G','C']);
        await page.selectOption('[data-score-preset]',{label:'カノン進行'});
        const positions=await page.locator('.sc-author-measure').evaluateAll(rows=>rows.map(row=>row.offsetTop));
        assert.equal(positions.length,8);
        assert(positions.slice(0,4).every(top=>top===positions[0]) && positions[4]>positions[0]);
        await page.selectOption('[data-score-preset]',{label:'基本進行'});
        const grid = page.locator('.sc-preset-cell-editor');
        assert.equal(await grid.locator('[data-active]').evaluate(input=>getComputedStyle(input).backgroundColor),'rgb(237, 246, 255)');
        await grid.locator('.sc-pattern-grip').first().dragTo(grid.locator('[data-preset-chord-cell]').nth(1));
        assert.deepEqual(await grid.locator('[data-preset-chord-cell]').evaluateAll(nodes=>nodes.map(n=>n.value)), ['C','G','C']);
        await grid.press('ControlOrMeta+z');
        assert.deepEqual(await grid.locator('[data-preset-chord-cell]').evaluateAll(nodes=>nodes.map(n=>n.value)), ['C','F','G','C']);
        const paper = page.locator('.sc-preset-paper');
        for (const size of [{width:1280,height:800},{width:390,height:844}]) {
            await page.setViewportSize(size);
            await page.waitForFunction(() => {
                const paper = document.querySelector('.sc-preset-paper'), view = paper.getBoundingClientRect();
                const sheet = paper.querySelector('.sheet-page').getBoundingClientRect();
                return sheet.width > 200 && sheet.top >= view.top && sheet.height > 0 &&
                    sheet.left >= view.left && sheet.right <= view.right + 1;
            });
            const sidebar = await page.locator('.sc-preset-sidebar').boundingBox(), pattern = await grid.boundingBox();
            const sheet = await paper.locator('.sheet-page').boundingBox();
            assert(Math.abs(pattern.width-sheet.width)<2 && Math.abs(pattern.x-sheet.x)<2);
            assert.equal(await page.getByLabel('曲の譜面を拡大',{exact:true}).count(),0);
            assert(sidebar.y + sidebar.height <= pattern.y);
            const stage = await page.locator('[data-preset-stage]').boundingBox();
            assert(stage.y >= pattern.y + pattern.height - 1);
        }
        await page.setViewportSize({width:1440,height:1000});
        await page.waitForFunction(() => document.querySelector('.sc-preset-cell-editor').getBoundingClientRect().width > 500);
        await grid.locator('.sc-pattern-grip').first().dragTo(grid.getByLabel('1小節 3拍のコード',{exact:true}));
        assert.equal(await grid.locator('[data-preset-chord-cell]').first().getAttribute('data-tick'), '960');
        await paper.getByRole('button', {name:'4小節目を選択',exact:true}).click();
        assert.deepEqual(await paper.locator('[data-preset-destination]').evaluateAll(nodes => nodes.map(node => Number(node.dataset.barNumber))), [4,5,6,7]);
        await page.click('[data-preset-stage]');
        assert.deepEqual(await snapshot(), before);
        await page.click('[data-score-apply]');
        await page.locator('[data-score-dialog]').waitFor({state:'detached'});
        const applied = await snapshot();
        assert.deepEqual(applied.bars[3].chords.map(e => [e.onsetTick,e.symbol]), [[960,'C']]);
        assert.deepEqual(applied.bars[2], before.bars[2]);
        await openMenu('#sc-edit-chord-preset');
        await page.getByRole('button',{name:'譜面からプリセット追加',exact:true}).click();
        const first = await paper.getByRole('button', {name:'1小節目を選択',exact:true}).boundingBox();
        const second = await paper.getByRole('button', {name:'2小節目を選択',exact:true}).boundingBox();
        await page.mouse.move(first.x-10, first.y+15);
        await page.mouse.down();
        await page.mouse.move(second.x+12, second.y+15, {steps:8});
        await page.mouse.up();
        assert.equal(await paper.locator('[data-preset-source]').count(), 2);
        const captured = page.locator('[data-preset-chord-cell]');
        assert.deepEqual(await page.locator('.sc-author-beats [data-preset-chord-cell]').evaluateAll(cells=>cells.map(input=>input.value)), ['C','G','Am','F']);
        await page.setViewportSize({width:390,height:844});
        const authorBody=page.locator('.sc-preset-author .sc-preset-dialog-body');
        await page.waitForFunction(()=>{const body=document.querySelector('.sc-preset-author .sc-preset-dialog-body');return body && body.scrollWidth<=body.clientWidth+1;});
        const saveButton=await authorBody.getByRole('button',{name:'プリセットに保存',exact:true}).boundingBox();
        assert(saveButton.x>=0 && saveButton.x+saveButton.width<=390);
        await page.setViewportSize({width:1440,height:1000});
        await page.getByRole('button',{name:'プリセットに保存',exact:true}).click();
        await page.getByLabel('プリセット名').fill('譜面からの進行');
        await page.getByRole('dialog',{name:'プリセットに保存',exact:true}).getByRole('button',{name:'保存',exact:true}).click();
        assert.deepEqual(await snapshot(), applied);
        await page.click('[data-score-cancel]');
        await page.locator('[data-score-dialog]').waitFor({state:'detached'});
        await openMenu('#sc-edit-chord-preset');
        await page.selectOption('[data-score-preset]', {label:'譜面からの進行'});
        assert.deepEqual(await captured.evaluateAll(nodes => nodes.map(node => Number(node.dataset.tick))), [0,960,0,960]);
        await page.locator('.sc-preset-paper').getByRole('button',{name:'7小節目を選択',exact:true}).click();
        await page.click('[data-preset-stage]');
        await page.click('[data-score-apply]');
        await page.locator('[data-score-dialog]').waitFor({state:'detached'});
        const withForms=await snapshot();
        const bindingFor=e=>withForms.performance.formBindings.find(b=>b.chordEventId===e.id);
        for(const [index,src] of applied.bars[0].chords.entries()){
            const source=bindingFor(src), target=bindingFor(withForms.bars[6].chords[index]);
            assert(source && target);
            assert.equal(target.materialId,source.materialId);
            assert.equal(target.confirmation.status,source.confirmation.status);
            assert.deepEqual(target.playedStrings,source.playedStrings);
        }
        await page.click('#sc-undo');assert.deepEqual(await snapshot(),applied);
        await openMenu('#sc-edit-rhythm');
        const presetStroke=page.locator('.sc-strum-preset-grid [data-stroke]').first();
        await presetStroke.focus();
        assert.equal(await presetStroke.evaluate(cell=>getComputedStyle(cell).backgroundColor),'rgb(237, 246, 255)');
        await paper.getByRole('button', {name:'4小節目を選択',exact:true}).click();
        const destinations=()=>paper.locator('[data-preset-destination]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.barNumber)));
        assert.deepEqual(await destinations(),[4]);
        const patternBar=page.locator('.sc-strum-preset-grid > div').first();
        const firstBar=paper.locator('.sheet-bar[data-bar-number="1"]');
        const secondBar=paper.locator('.sheet-bar[data-bar-number="2"]');
        await firstBar.scrollIntoViewIfNeeded();
        const gridBox=await page.locator('.sc-strum-preset-grid').boundingBox();
        assert.ok(Math.abs(2*(await patternBar.boundingBox()).width-gridBox.width)<8);
        const toggle=patternBar.getByRole('button',{name:'1小節目の入力単位を切り替え'});
        const counts=new Set();
        for(let step=0;step<5;step++){
            counts.add(await patternBar.locator('[data-stroke]').count());
            await toggle.click();
        }
        assert.deepEqual([...counts].sort((a,b)=>a-b),[1,2,4,8,16]);
        await firstBar.scrollIntoViewIfNeeded();
        const box=await firstBar.boundingBox(), next=await secondBar.boundingBox();
        const y=box.y+box.height/2;
        await page.mouse.click(box.x-8,y);
        assert.deepEqual(await destinations(),[]);
        assert.ok(await page.locator('[data-preset-stage]').isDisabled());
        await page.mouse.move(box.x-8,y);await page.mouse.down();
        await page.mouse.move(next.x+10,y,{steps:6});await page.mouse.up();
        assert.deepEqual(await destinations(),[1,2]);
        assert.equal(await page.locator('[data-score-preset]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(251, 248, 240)');
        assert.match(await page.locator('.sc-strum-preset-grid strong').first().innerText(),/^1小節目/);
        assert.deepEqual(await page.locator('.sc-strum-preset-grid > div').first().locator('small').allTextContents(),['1拍','2拍','3拍','4拍']);
        await paper.getByRole('button',{name:'4小節目を選択',exact:true}).dragTo(paper.getByRole('button',{name:'5小節目を選択',exact:true}));
        assert.deepEqual(await destinations(),[4,5]);
        await paper.getByRole('button',{name:'6小節目を選択',exact:true}).click({modifiers:['Shift']});
        assert.deepEqual(await destinations(),[4,5,6]);
        await paper.locator('.sheet-section-label').filter({hasText:'Aメロ'}).click();
        assert.equal(await page.getByLabel('適用範囲').count(), 0);
        assert.deepEqual(await paper.locator('[data-preset-destination]').evaluateAll(nodes => nodes.map(node => Number(node.dataset.barNumber))), [4,5,6,7]);
        await page.getByRole('button',{name:'譜面からプリセット追加',exact:true}).click();
        await paper.getByRole('button', {name:'4小節目を選択',exact:true}).press('Enter');
        await paper.getByRole('button', {name:'5小節目を選択',exact:true}).press('Shift+Enter');
        await page.getByRole('button',{name:'プリセットに保存',exact:true}).click();
        await page.getByLabel('プリセット名').fill('譜面からのストローク');
        await page.getByRole('dialog',{name:'プリセットに保存',exact:true}).getByRole('button',{name:'保存',exact:true}).click();
        const preset = await page.evaluate(() => CruiseStudio.storage.getAppSetting('scoreStrumPresetsLibraryV2').items.at(-1));
        assert.equal(preset.slots.length, 2);
        await page.setViewportSize({width:390,height:844});
        const applyBox = await page.locator('[data-score-apply]').boundingBox();
        assert(applyBox.x >= 0 && applyBox.x + applyBox.width <= 390 && applyBox.y + applyBox.height <= 844);
        assert.deepEqual(errors, []);
    } finally {
        await context.close();
        await browser.close();
    }
});
