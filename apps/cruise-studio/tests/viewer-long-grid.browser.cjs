const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {chromium, webkit} = require('playwright');
const {saveFromToolbar} = require('./helpers/viewer-regression-choices.cjs');
const origin = 'http://127.0.0.1:18874';

function longSong(score) {
    const first = score.bars[0];
    score.sections = score.sections.slice(0,1);
    score.bars = Array.from({length:384}, () => {
        const bar = {id:randomUUID(), sectionId:first.sectionId};
        for (const track of ['chords','lyrics','melody']) {
            bar[track] = [{...first[track][0], id:randomUUID()}];
        }
        return bar;
    });
    score.songInfo.bpm = 240;
    score.notation.lineBreakAfter = [];
    score.performance.formBindings = [];
    score.performance.strokeOverrides = [];
    score.performance.barRhythms = [];
    const gridRows = score.bars.map(bar => ({
        barId:bar.id,
        rows:Object.fromEntries(['chord','lyrics','doremi'].map(row =>
            [row, {unit:16, beats:[null,null,null,null]}]))
    }));
    return {...score, scorePresentation:{version:1, layout:{timingGrid:true}, gridRows}};
}

async function checkPaper(page) {
    const bars = page.locator('.sv-paper .sheet-bar[data-bar-number]');
    await bars.last().waitFor({state:'attached'});
    assert.equal(await bars.count(),384);
    const mismatches = await bars.evaluateAll(elements => elements.flatMap(bar => {
        return ['chord','lyrics','doremi'].filter(track => {
            const row = bar.querySelector('.sheet-bar-' + track);
            const line = [...bar.querySelectorAll('.sheet-bar-grid')].find(grid =>
                row && Number(grid.style.gridRowStart) <= Number(row.style.gridRowStart) &&
                Number(grid.style.gridRowEnd) > Number(row.style.gridRowStart));
            return row?.children.length !== 16 || line?.children.length !== 16;
        }).map(track => bar.dataset.barNumber + ' ' + track);
    }));
    assert.deepEqual(mismatches,[]);
}

for (const engine of ['chrome','webkit']) test('384 bars retain sixteenth grids through viewer export, playback and reopen: '+engine, async () => {
    const {viewerFixture} = await import('./helpers/viewer-fixture.mjs');
    const {score} = viewerFixture();
    const song = longSong(score);
    const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({
        executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    }));
    const dir = await fs.mkdtemp(path.join(os.tmpdir(),'score-grid-'));
    try {
        async function openPage(url) {
            const context = await browser.newContext({serviceWorkers:'block'});
            await context.route('**/*',route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
            const page = await context.newPage();
            await page.goto(origin+url);
            return page;
        }
        const editor = await openPage('/');
        await editor.click('#open-sheet-cruise');
        await editor.locator('#sc-import-json').setInputFiles({name:'long.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(song))});
        await editor.waitForFunction(id => CruiseStudio.sheetCruise.getSession()?.draft.projectId === id,score.projectId);
        const snapshot = () => editor.evaluate(() => CruiseStudio.sheetCruise.getSession().workingSnapshot());
        assert.deepEqual(await snapshot(),score);
        await editor.click('#sc-curve-menu-toggle');
        await editor.click('#sc-export-viewer');
        await editor.click('[data-export-choice=export-save]');
        await editor.click('[data-export-complete=close]');
        const bytes = await editor.evaluate(async () => {
            const {createStudioViewerContract} = await import('/apps/cruise-studio/js/modules/sheet-cruise/viewer-contract.mjs');
            const {createViewerLibrary} = await import('/apps/score-viewer/core/library.mjs');
            const {codec} = createStudioViewerContract({schema:CruiseStudio.model.schema2});
            const library = createViewerLibrary({indexedDB,codec});
            try {
                const [entry] = await library.list();
                return new TextDecoder().decode((await library.read(entry.entryId)).bytes);
            } finally { await library.close(); }
        });
        const file = path.join(dir,'long.cruise-score.json');
        await fs.writeFile(file,bytes);
        const exported = JSON.parse(bytes);
        assert.deepEqual(exported.score,score);
        assert.deepEqual(exported.defaultPresentation.gridRows,song.scorePresentation.gridRows);
        const viewer = await openPage('/apps/score-viewer/local/');
        await viewer.locator('[data-viewer-file]').setInputFiles(file);
        await checkPaper(viewer);
        await saveFromToolbar(viewer);
        await viewer.waitForFunction(() => !CruiseViewer.view.hasUnsaved());
        await viewer.locator('[data-viewer-action=zoom-in]:visible').first().click();
        const zoom = await viewer.evaluate(() => CruiseViewer.view.read().presentation.zoom);
        assert(zoom > exported.defaultPresentation.zoom);
        await viewer.click('[data-viewer-action=play]');
        await viewer.waitForFunction(() => {
            const playback = CruiseViewer.view.playback();
            return playback?.phase === 'playing' && playback.barIndex >= 1 && playback.stats.parts.piano > 0;
        });
        await viewer.click('[data-viewer-action=play]');
        await viewer.reload();
        await checkPaper(viewer);
        assert.equal(await viewer.evaluate(() => CruiseViewer.view.read().presentation.zoom),zoom);
        assert.deepEqual(await viewer.evaluate(() => CruiseViewer.view.read().presentation.gridRows),song.scorePresentation.gridRows);
        await viewer.locator('.sv-paper [data-bar-number="383"]').click({position:{x:5,y:5}});
        await viewer.click('[data-viewer-action=play]');
        await viewer.waitForFunction(() => {
            const playback = CruiseViewer.view.playback();
            return playback.phase === 'playing' && playback.barIndex === 383 && playback.stats.parts.piano > 0;
        });
        await viewer.waitForFunction(() => CruiseViewer.view.playback().phase === 'ended');
        assert.deepEqual(await snapshot(),score);
    } finally {
        await browser.close();
        await fs.rm(dir,{recursive:true,force:true});
    }
});
