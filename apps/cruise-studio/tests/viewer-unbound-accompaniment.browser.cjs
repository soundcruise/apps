// Exercise the actual score export and playback with disposable, loopback-only data.
const test = require('node:test');
const assert = require('node:assert/strict');
const {chromium, webkit} = require('playwright');
const origin = 'http://127.0.0.1:18874';

function observeGuitar() {
    window.attacks = [];
    const create = BaseAudioContext.prototype.createBufferSource;
    BaseAudioContext.prototype.createBufferSource = function () {
        const node = create.call(this), start = node.start.bind(node);
        const setRate = node.playbackRate.setValueAtTime.bind(node.playbackRate);
        let rate = 1;
        node.playbackRate.setValueAtTime = (value, time) => {
            rate = value;
            return setRate(value, time);
        };
        node.start = (time, ...args) => {
            // The fixture has no melody. Exclude short synthesized clicks and mutes.
            if (node.buffer?.duration > 1) {
                const samples = node.buffer.getChannelData(0);
                window.attacks.push({time, rate, length:samples.length, amplitude:samples[1000]});
            }
            return start(time, ...args);
        };
        return node;
    };
}

async function playTwoStrokes(page, editor) {
    await page.click(editor ? '#sc-playback-settings' : '[data-viewer-action=playback-settings]');
    await page.locator(editor ? '#sc-count-in' : '[data-viewer-playback=countIn]').uncheck();
    await page.locator(editor ? '#sc-metronome' : '[data-viewer-playback=metronome]').uncheck();
    if (editor) await page.click('[data-playback-done]');
    else await page.getByRole('button',{name:'完了',exact:true}).click();
    const play = page.locator(editor ? '#sc-song-preview' : '[data-viewer-action=play]');
    await play.click();
    await page.waitForFunction(() => window.attacks.length >= 10);
    await play.click();
    return page.evaluate(() => window.attacks.slice().sort((a,b) => a.time-b.time).slice(0,10));
}

for (const engine of ['chrome','webkit']) test('export and play an unregistered slash chord: '+engine, async () => {
    const {viewerFixture} = await import('./helpers/viewer-fixture.mjs');
    const {score} = viewerFixture();
    score.performance.formBindings = [];
    score.materials.forms = [];
    for (const bar of score.bars) bar.melody = [];
    score.bars[0].chords[0].symbol = 'Cmaj7/E';
    score.performance.barRhythms = [];
    const rhythm = score.materials.rhythms.find(m => m.id === score.performance.basicRhythmId);
    rhythm.snapshot.slots = rhythm.snapshot.slots.slice(0,2).map((s,i) => ({...s,tick:i*480,action:i?'up':'down'}));
    const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({
        executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    }));
    try {
        const external = [];
        async function newLocalPage() {
            const profile = await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
            await profile.route('**/*', route => {
                if (new URL(route.request().url()).origin === origin) return route.continue();
                external.push(route.request().url());
                return route.abort();
            });
            await profile.addInitScript(observeGuitar);
            return profile.newPage();
        }
        const editor = await newLocalPage();
        await editor.goto(origin);
        await editor.click('#open-sheet-cruise');
        await editor.locator('#sc-import-json').setInputFiles({name:'unbound.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(score))});
        await editor.waitForFunction(id => CruiseStudio.sheetCruise.getSession()?.draft.projectId === id,score.projectId);
        const snapshot = () => editor.evaluate(() => CruiseStudio.sheetCruise.getSession().workingSnapshot());
        const before = await snapshot();
        const original = await playTwoStrokes(editor,true);
        await editor.click('#sc-curve-menu-toggle');
        await editor.click('#sc-export-viewer');
        await editor.click('[data-export-choice=export-save]');
        await editor.click('[data-export-complete=close]');
        assert.deepEqual(await snapshot(),before);
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
        assert.deepEqual(JSON.parse(bytes).score,before);
        // Import the exported bytes into a separate profile without the editor or its library.
        const viewer = await newLocalPage();
        await viewer.goto(origin+'/apps/score-viewer/local/');
        await viewer.locator('[data-viewer-file]').setInputFiles({name:'unbound.cruise-score.json',mimeType:'application/json',buffer:Buffer.from(bytes)});
        await viewer.locator('.sv-paper .sheet-bar').first().waitFor();
        const received = await playTwoStrokes(viewer,false);
        assert(original.some(e => Math.abs(e.amplitude)>0.001));
        assert.equal(new Set(original.slice(0,5).map(e => e.length+'-'+e.rate)).size,5);
        const notes = events => events.map(({length,rate,amplitude}) => ({length,rate,amplitude}));
        assert.deepEqual(notes(received),notes(original));
        assert.deepEqual(notes(received.slice(5)),notes(received.slice(0,5)).reverse());
        assert.deepEqual(await viewer.evaluate(() => CruiseViewer.view.read().document.score),before);
        assert.deepEqual(external,[]);
    } finally { await browser.close(); }
});
