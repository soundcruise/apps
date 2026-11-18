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
        await page.selectOption('[data-score-preset]', {label:'王道進行'});
        await page.getByLabel('Playキー', {exact:true}).selectOption('D');
        assert.equal(await page.locator('[data-pattern-chord]').count(), 4);
        assert.equal(await page.locator('[data-pattern-chord]').allTextContents().then(a=>a.join(' ')), 'G A F#m Bm');
        assert(await page.locator('[data-score-apply]').isDisabled());
        await page.getByText('プリセットを編集', {exact:true}).click();
        await page.getByRole('button',{name:'一覧から編集'}).click();
        await page.getByRole('button',{name:/この(コード進行|ストローク)を編集/}).click();
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
        await page.selectOption('[data-score-preset]', {label:'リズム自作'});
        assert.equal(await page.locator('.sc-strum-preset-grid button').count(), 8);
        await page.getByText('プリセットを編集', {exact:true}).click();
        await page.getByRole('button',{name:'一覧から編集'}).click();
        await page.getByRole('button',{name:/この(コード進行|ストローク)を編集/}).click();
        await page.getByRole('button',{name:'プリセットに保存',exact:true}).click();
        await page.getByLabel('プリセット名').fill('ストローク自作');
        await page.getByRole('dialog',{name:'プリセットに保存',exact:true}).getByRole('button',{name:'保存',exact:true}).click();
        await page.getByLabel('適用範囲').selectOption('section');
        await page.getByLabel('セクション', {exact:true}).selectOption(before.sections[0].id);
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
        assert.equal(await page.getByLabel('適用範囲').inputValue(), 'selection');
        await page.selectOption('[data-score-preset]', {label:'シンコペーション'});
        await apply();
        const range = await read(), firstIds = range.bars.slice(0, 2).map(b => b.id);
        const inRange = range.performance.barRhythms.filter(b => firstIds.includes(b.barId));
        assert.equal(inRange.length, 2);
        assert.notEqual(inRange[0].materialId, inRange[1].materialId);
        assert.deepEqual(range.performance.barRhythms.filter(b => !firstIds.includes(b.barId)),
            progressed.performance.barRhythms.filter(b => !firstIds.includes(b.barId)));
        await page.click('#sc-undo');

        // Make a pattern in the cell grid, save it, then use it for the whole song.
        await open('sc-edit-rhythm');
        await page.getByText('プリセットを編集', {exact:true}).click();
        await page.getByRole('button',{name:'一覧から編集'}).click();
        await page.getByRole('button',{name:/この(コード進行|ストローク)を編集/}).click();
        await page.getByText('パターンを編集・読み込む', {exact:true}).click();
        await page.getByLabel('リズムクルーズのプリセットJSON（4・8・16分）').setInputFiles({
            name:'rhythm-preset.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify({
                name:'ファイルから読み込み', stageN:1, patternBars:1, pattern:['hit','rest','hit','rest']
            }))
        });
        await page.waitForFunction(() => document.querySelector('[data-score-preset]').selectedOptions[0].text === 'ファイルから読み込み');
        await page.getByRole('button', {name:'空のパターンを作る'}).click();
        await page.locator('.sc-strum-preset-grid button').first().click();
        await page.getByRole('button',{name:'プリセットに保存',exact:true}).click();
        await page.getByLabel('プリセット名').fill('頭だけダウン');
        await page.getByRole('dialog',{name:'プリセットに保存',exact:true}).getByRole('button',{name:'保存',exact:true}).click();
        await page.getByLabel('適用範囲').selectOption('all');
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
            const manage=async()=>{await button('一覧から編集').click();return page.getByLabel('プリセット一覧',{exact:true});};
            await open();
            await play('pattern').click(); await waitPlaying('pattern');
            await play('score').click(); await waitPlaying('score');
            assert.equal(await play('pattern').getAttribute('aria-pressed'),'false');
            await play('score').click();
            await page.click('[data-preset-stage]');
            await play('score').click(); await waitPlaying('score');
            await button('プリセットを編集').click();
            const author=page.getByRole('dialog',{name:'プリセットを編集',exact:true});
            assert(await author.isVisible());
            assert.equal(await author.getByRole('button',{name:'プリセットに保存',exact:true}).count(),0);
            let list=await manage();
            const editorLabel=mode==='chord-preset'?'このコード進行を編集':'このストロークを編集';
            await list.selectOption({label:first}); await button(editorLabel).click();
            await author.getByText('このプリセットの整理',{exact:true}).click();
            await button('複製').click();
            await button('名前を変更').click(); await page.getByLabel('新しいプリセット名').fill('試験用');
            await button('変更を保存').click(); await button('↑ 上へ').click();
            list=await manage(); assert.equal(await list.locator('option').first().textContent(),'試験用');
            await list.selectOption({label:'試験用'}); await button(editorLabel).click();
            const details=author.locator('details').filter({hasText:'このプリセットの整理'});
            if(!await details.evaluate(e=>e.open))await details.locator('summary').click();
            await button('削除').click(); await details.getByRole('button',{name:'キャンセル',exact:true}).click();
            await button('削除').click(); await button('削除する').click();
            await author.waitFor({state:'detached'});await button('プリセットを編集').click();
            list=await manage();assert.equal(await list.locator('option').first().textContent(),first);
            await list.selectOption({label:first});await button(editorLabel).click();
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
                await author.locator('.sc-strum-preset-grid button').first().click();
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
            assert.equal(await page.locator('[data-score-preset] option:checked').textContent(),first);
            if(mode==='chord-preset') assert.equal(await page.locator('[data-pattern-chord]').first().textContent(),'Dm');
            else assert.equal(await page.locator('.sc-strum-preset-grid button').first().textContent(),'↑');
            await play('pattern').click();await waitPlaying('pattern');await page.keyboard.press('Escape');
            await page.locator('[data-score-dialog]').waitFor({state:'detached'});
        }
        assert.deepEqual(errors,[]);
    } finally {await browser.close();}
});
