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
        await page.getByRole('button', {name:'小節ルーペを閉じる'}).click();
        for (const action of ['#sc-edit-chord-preset','#sc-edit-rhythm']) {
            await openMenu(action);
            const root = page.locator('[data-score-dialog]'), sheet = root.locator('.sc-preset-paper');
            const original = await sheet.innerText();
            await root.locator('[data-preset-stage]').click();
            const firstStage=await sheet.innerText();
            if (action.endsWith('rhythm')) await page.getByLabel('適用範囲').selectOption('all');
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
        await page.mouse.move(first.x+12, first.y+15);
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
        await paper.getByRole('button', {name:'4小節目を選択',exact:true}).click();
        assert.equal(await page.getByLabel('適用範囲').inputValue(), 'section');
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
