const test = require('node:test');
const assert = require('node:assert/strict');
const {chromium, webkit} = require('playwright');

const origin = 'http://127.0.0.1:18874';

for (const engine of ['chrome', 'webkit']) test('cross-bar ties survive save and play with one attack: ' + engine, async () => {
    const {viewerFixture} = await import('./helpers/viewer-fixture.mjs');
    const {score, contract} = viewerFixture();
    const sample = score.bars[0].melody[0];
    score.songInfo.bpm = 300;
    for (const bar of score.bars) {
        bar.melody = [];
        bar.chords = [];
    }
    score.performance.formBindings = [];
    score.bars[0].melody = [{...sample, id:'tail-note', onsetTick:1440, durationTicks:240}];
    score.bars[1].melody = [{...sample, id:'head-note', onsetTick:0, durationTicks:960}];
    score.notation.lineBreakAfter = [score.bars[0].id];

    const browser = await (engine === 'chrome'
        ? chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
        : webkit.launch());
    try {
        const context = await browser.newContext({viewport:{width:1440,height:1000}});
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await context.addInitScript(() => {
            window.audioStarts = [];
            const prototype = (window.AudioContext || window.webkitAudioContext).prototype;
            const create = prototype.createBufferSource;
            prototype.createBufferSource = function() {
                const source = create.call(this), record = {};
                const start = source.start.bind(source), stop = source.stop.bind(source);
                source.start = (time, ...other) => {record.start = time; record.sampleDuration = source.buffer?.duration; window.audioStarts.push(record); return start(time, ...other);};
                source.stop = (time, ...other) => {record.end ??= time; return stop(time, ...other);};
                return source;
            };
        });
        const page = await context.newPage(), errors = [];
        page.setDefaultTimeout(12000);
        page.on('pageerror', error => errors.push(error.message));
        const snapshot = () => page.evaluate(() => CruiseStudio.documents.getSession().workingSnapshot());
        const ready = () => page.waitForFunction(() => document.querySelector('.melody-page')?.dataset.ready === 'true' &&
            CruiseStudio.sheetCruise.getStaffMetrics()?.source?.snapshotVersion === CruiseStudio.documents.getSession().snapshotVersion);
        async function menu(item) {
            await page.click('#sc-curve-menu-toggle');
            await page.click(item);
        }
        const note = id => page.locator('[data-event-id="' + id + '"]').first();
        const panel = page.locator('#sc-melody-inspector');
        const tie = panel.getByRole('button',{name:'次の小節の音とつなぐ',exact:true});
        const untie = panel.getByRole('button',{name:'小節をまたぐタイを外す',exact:true});
        const renderedTies = () => page.locator('[data-melody-tie] path');
        const toggleReady = async () => {await menu('#sc-menu-staff-toggle'); await ready();};

        await page.goto(origin);
        await page.click('#open-sheet-cruise');
        await page.locator('#sc-import-json').setInputFiles({
            name:'tie.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(score))
        });
        await page.waitForFunction(id => CruiseStudio.documents.getSession()?.target.projectId === id, score.projectId);
        await toggleReady();
        await note('tail-note').click();
        assert(await tie.isDisabled(), 'the source must reach the barline');
        await panel.getByRole('button',{name:'空きまで伸ばす',exact:true}).click();
        await ready();
        const untied = await snapshot();
        assert(await tie.isEnabled());
        await tie.click(); await ready();
        const tied = await snapshot();
        assert.equal(tied.bars[0].melody[0].tieToNext,'head-note');
        assert.deepEqual(tied.bars[1],untied.bars[1]);
        assert.equal(await renderedTies().count(),2,'both line-break halves have their own curve');
        assert(await untie.isVisible());

        await untie.click(); await ready();
        assert.deepEqual(await snapshot(),untied);
        await page.click('#sc-undo'); await ready();
        assert.deepEqual(await snapshot(),tied);
        await page.click('#sc-undo'); await ready();
        assert.deepEqual(await snapshot(),untied);
        assert.equal(await renderedTies().count(),0);
        await page.click('#sc-redo'); await ready();
        assert.deepEqual(await snapshot(),tied);

        await note('head-note').click();
        await panel.getByRole('button',{name:'休符にする',exact:true}).click();
        await ready();
        assert.equal((await snapshot()).bars[0].melody[0].tieToNext,undefined);
        await page.click('#sc-undo'); await ready();
        assert.deepEqual(await snapshot(),tied);
        await page.click('#sc-save');
        await page.waitForFunction(()=>!CruiseStudio.documents.getSession().dirty);
        const saved = await snapshot();
        await page.reload();
        await page.click('#open-sheet-cruise');
        await page.waitForFunction(id=>CruiseStudio.documents.getSession()?.target.projectId===id,saved.projectId);
        assert.deepEqual(await snapshot(),saved);
        await toggleReady();
        assert.equal(await renderedTies().count(),2);
        await page.locator('.melody-measure').first().click({position:{x:4,y:4}});
        await page.click('#sc-song-preview');
        await page.locator('.melody-measure[data-bar-number="3"].sc-playing-bar').waitFor();
        const studio = await page.evaluate(() => audioStarts.filter(record => record.sampleDuration > 1));
        assert.equal(studio.length,1,'Studio schedules only one attack through the boundary');
        assert(Math.abs(studio[0].end-studio[0].start-.6)<.01,'Studio holds the note for both written lengths');
        await page.click('#sc-song-preview');
        await menu('#sc-menu-staff-toggle');

        await menu('#sc-export-viewer');
        await page.click('[data-export-choice=export-save]');
        await page.click('[data-export-complete=open]');
        await page.locator('.sv-paper .sheet-bar').first().waitFor();
        await page.evaluate(async()=>window.tieViewer=await CruiseStudio.scoreViewer.ready());
        const exported = await page.evaluate(()=>tieViewer.read().document.score);
        assert.deepEqual(exported.bars,saved.bars);
        const piano = contract.tickPlan(exported).events.filter(e=>e.part==='piano');
        assert.deepEqual(piano.map(e=>[e.tick,e.durationTicks,e.tieStarts]),[[1440,1440,[1920]]]);
        await page.locator('[data-viewer-action=sound-all]').click();
        await page.locator('[data-viewer-action=play]').click();
        await page.waitForFunction(()=>tieViewer.playback()?.barIndex===2);
        assert.equal(await page.evaluate(()=>tieViewer.playback().stats.parts.piano),1);
        assert.deepEqual(errors,[]);
    } finally {
        await browser.close();
    }
});
