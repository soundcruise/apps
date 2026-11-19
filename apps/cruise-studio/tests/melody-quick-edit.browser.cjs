const test = require('node:test');
const assert = require('node:assert/strict');
const {chromium, webkit} = require('playwright');

const origin = 'http://127.0.0.1:18874';
for (const engine of ['chrome', 'webkit']) test('staff edits update the score in undoable steps: ' + engine, async () => {
    const {viewerFixture} = await import('./helpers/viewer-fixture.mjs');
    const {score} = viewerFixture();
    const sample = score.bars[0].melody.find(event => event.kind === 'note');
    score.bars[0].melody = [
        {...sample, id:'staff-first', onsetTick:240, durationTicks:240},
        {...sample, id:'staff-second', onsetTick:1080, durationTicks:240}
    ];
    const browser = await (engine === 'chrome'
        ? chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
        : webkit.launch());
    try {
        const context = await browser.newContext({viewport:{width:1440,height:1000}});
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        const page = await context.newPage(), errors = [];
        page.setDefaultTimeout(9000);
        page.on('pageerror', error => errors.push(error.message));
        const read = () => page.evaluate(() => {
            const session = CruiseStudio.documents.getSession();
            return {draft:session.workingSnapshot(), base:session.baseSnapshot, cursor:session.getHistory().cursor};
        });
        const ready = () => page.waitForFunction(() => document.querySelector('.melody-page')?.dataset.ready === 'true' &&
            CruiseStudio.sheetCruise.getStaffMetrics()?.source?.snapshotVersion === CruiseStudio.documents.getSession().snapshotVersion);
        async function toggleStaff() {
            const menu=page.locator('#sc-curve-menu-toggle');
            await menu.click();
            await page.locator('#sc-menu-staff-toggle').evaluate(button=>button.click());
        }
        const note = id => page.locator('[data-event-id="' + id + '"]');
        const panel = page.locator('#sc-melody-inspector');
        const extend = panel.getByRole('button', {name:'空きまで伸ばす', exact:true});
        const undo = async () => { await page.click('#sc-undo'); await ready(); };
        await page.goto(origin);
        await page.click('#open-sheet-cruise');
        await page.locator('#sc-import-json').setInputFiles({
            name:'staff.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(score))
        });
        await page.waitForFunction(id => CruiseStudio.documents.getSession()?.target.projectId === id, score.projectId);
        const original = await read();

        await toggleStaff();
        await ready().catch(async error=>{
            console.error(await page.evaluate(()=>({style:document.querySelector('#sc-score-style').value,
                preview:document.querySelector('#sc-preview').textContent.slice(0,300),menu:document.querySelector('#sc-curve-menu')?.open})));
            throw error;
        });
        assert.deepEqual(await read(), original, 'conversion is a read-only projection');

        await note('staff-second').first().click();
        await panel.getByRole('button',{name:'休符にする',exact:true}).click();
        await ready();
        const rest = await read();
        assert.equal(rest.draft.bars[0].melody[1].kind,'rest');
        assert.equal(rest.cursor,original.cursor+1);

        await note('staff-first').first().click();
        assert.equal(await panel.locator('details').getAttribute('open'),null);
        await panel.getByLabel('長さ',{exact:true}).selectOption('120');
        await ready();
        const shorter = await read();
        assert.equal(shorter.draft.bars[0].melody[0].durationTicks,120);
        assert.equal(shorter.cursor,rest.cursor+1);

        await extend.click();
        await ready();
        const longer = await read(), extendedNote = longer.draft.bars[0].melody[0];
        assert.equal(extendedNote.onsetTick,240);
        assert.equal(extendedNote.durationTicks,840);
        assert.deepEqual(extendedNote.pitch,score.bars[0].melody[0].pitch);
        assert.deepEqual(longer.draft.bars[0].melody[1],rest.draft.bars[0].melody[1]);
        assert.deepEqual(longer.draft.bars[0].chords,original.draft.bars[0].chords);
        assert.deepEqual(longer.draft.bars[0].lyrics,original.draft.bars[0].lyrics);
        assert.deepEqual(longer.draft.bars.slice(1),original.draft.bars.slice(1));
        assert.deepEqual(longer.base,original.base);
        assert.equal(longer.cursor,shorter.cursor+1);
        assert(await extend.isDisabled());
        assert(await note('staff-first').count()>1, 'the extended note is drawn as tied fragments');

        await toggleStaff();
        await page.locator('#sc-sheet-scale-box .sheet-bar').first().waitFor();
        assert.deepEqual(await read(),longer);
        await toggleStaff();
        await ready();
        assert.deepEqual(await read(),longer);
        await undo(); assert.deepEqual(await read(),shorter);
        await undo(); assert.deepEqual(await read(),rest);
        await undo(); assert.deepEqual(await read(),original);
        for(const expected of [rest,shorter,longer]){
            await page.click('#sc-redo'); await ready(); assert.deepEqual(await read(),expected);
        }
        await page.click('#sc-save');
        await page.waitForFunction(()=>!CruiseStudio.documents.getSession().dirty);
        const saved=(await read()).draft;
        assert.deepEqual(saved.bars,longer.draft.bars);
        await page.reload();
        await page.click('#open-sheet-cruise');
        await page.waitForFunction(id=>CruiseStudio.documents.getSession()?.target.projectId===id,saved.projectId);
        assert.deepEqual((await read()).draft,saved);
        await toggleStaff(); await ready();
        assert(await note('staff-first').count()>1);
        assert.deepEqual(errors,[]);
    } finally {
        await browser.close();
    }
});
