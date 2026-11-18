// End-to-end local transport and offline checks with a synthetic, three-bar tie.
const test = require('node:test');
const assert = require('node:assert/strict');
const {chromium, webkit} = require('playwright');

const origin = 'http://127.0.0.1:18874';
const viewerURL = origin + '/apps/score-viewer/local/index.html';
const chrome = () => chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const near = (actual, expected, message) => assert(Math.abs(actual - expected) < .025, message + ': ' + actual);

async function prepareContext(browser) {
    const context = await browser.newContext({viewport:{width:1440, height:1000}});
    const errors = [];
    context.on('request', request => {
        if (!request.url().startsWith(origin + '/')) errors.push(request.url());
    });
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    context.on('page', page => {
        page.setDefaultTimeout(12000);
        page.on('pageerror', error => errors.push(error.message));
    });
    await context.addInitScript(() => {
        const Base = window.AudioContext || window.webkitAudioContext;
        const probe = window.tieAudio = {contexts:[], voices:[]};
        window.AudioContext = class extends Base {
            constructor(...args) {
                super(...args);
                probe.contexts.push(this);
                this.silent = super.createGain();
                this.silent.gain.value = 0;
                this.silent.connect(this.destination);
            }
            createGain() {
                const node = super.createGain(), connect = node.connect.bind(node);
                node.connect = (target, ...rest) => connect(target === this.destination ? this.silent : target, ...rest);
                return node;
            }
            createBufferSource() {
                const node = super.createBufferSource();
                const start = node.start.bind(node), stop = node.stop.bind(node), disconnect = node.disconnect.bind(node);
                const context = probe.contexts.indexOf(this);
                let voice;
                node.start = (at, offset = 0, ...rest) => {
                    if (node.buffer?.duration > 1) {
                        voice = {context, start:Math.max(at, this.currentTime), offset, end:Infinity};
                        probe.voices.push(voice);
                    }
                    return start(at, offset, ...rest);
                };
                node.stop = (at = 0) => {
                    if (voice) voice.end = Math.max(at, this.currentTime);
                    return stop(at);
                };
                node.disconnect = (...args) => {
                    if (voice) voice.end = Math.min(voice.end, this.currentTime);
                    return disconnect(...args);
                };
                return node;
            }
        };
    });
    return {context, errors};
}

async function editScore(page, score) {
    await page.goto(origin + '/');
    await page.click('#open-sheet-cruise');
    await page.locator('#sc-import-json').setInputFiles({
        name:'tie-transport.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(score))
    });
    await page.waitForFunction(id => CruiseStudio.documents.getSession()?.target.projectId === id, score.projectId);
}

async function exportScore(page) {
    await page.click('#sc-curve-menu-toggle');
    await page.click('#sc-export-viewer');
    await page.click('[data-export-choice=export-save]');
    await page.click('[data-export-complete=open]');
    await page.locator('.sv-paper .sheet-bar').first().waitFor();
    return page.evaluate(async () => (await CruiseStudio.scoreViewer.ready()).read().byteHash);
}

function transport(page, editor) {
    const prefix = editor ? '#sc-sheet-scale-box' : '.sv-paper';
    const play = page.locator(editor ? '#sc-song-preview' : '[data-viewer-action=play]');
    const repeat = page.locator(editor ? '#sc-repeat' : '[data-viewer-action=repeat]');
    const bpm = page.locator(editor ? '#sc-practice-tempo' : '[data-viewer-tempo]');
    const cursor = page.locator(editor ? prefix + ' > [data-score-playhead]' : '[data-viewer-playhead]');
    const select = async (first, last) => {
        await page.locator(prefix + ' .sheet-bar[data-bar-number="' + first + '"]').click({position:{x:4,y:4}});
        await page.locator(prefix + ' .sheet-bar[data-bar-number="' + last + '"]').click({position:{x:4,y:4},modifiers:['Shift']});
        if (await repeat.getAttribute('aria-pressed') !== 'true') await repeat.click();
    };
    return {
        cursor, select,
        async configure() {
            await page.click(editor ? '#sc-playback-settings' : '[data-viewer-action=playback-settings]');
            await page.locator(editor ? '#sc-count-in' : '[data-viewer-playback=countIn]').uncheck();
            await page.locator(editor ? '#sc-metronome' : '[data-viewer-playback=metronome]').uncheck();
            if (editor) await page.click('[data-playback-done]');
            else await page.getByRole('button',{name:'完了',exact:true}).click();
            if (!editor) await page.locator('[data-viewer-action=sound-all]').click();
        },
        async start() { await play.click(); await cursor.waitFor(); },
        async stop() { await play.click(); await cursor.waitFor({state:'hidden'}); },
        async changeBPM(value) {
            await bpm.fill(String(value)); await bpm.press('Tab');
            await page.waitForFunction(({selector, value}) => document.querySelector(selector)?.value === String(value),
                {selector:editor?'#sc-practice-tempo':'[data-viewer-tempo]',value});
            await cursor.waitFor();
        },
        async at(secondBarTick) {
            await page.waitForFunction(({editor,secondBarTick}) => {
                if (editor) {
                    const overlay = document.querySelector('#sc-slot-overlay');
                    return overlay?.dataset.playbackBar === '2' &&
                        Math.abs(Number(overlay.dataset.playbackTick) - secondBarTick) < 150;
                }
                const state = CruiseViewer.view.playback();
                return state?.phase === 'playing' && state.barIndex === 1 &&
                    Math.abs(state.tickInBar - secondBarTick) < 150;
            },{editor,secondBarTick});
        }
    };
}

const voices = page => page.evaluate(() => tieAudio.voices.filter(v => v.end > v.start).map(v => ({...v})));
const quiet = page => page.waitForFunction(() =>
    tieAudio.voices.every(v => v.end <= v.start || v.end <= tieAudio.contexts[v.context].currentTime));
async function waitForVoices(page,count) {
    await page.waitForFunction(count => tieAudio.voices.filter(v => v.end > v.start &&
        v.start <= tieAudio.contexts[v.context].currentTime).length >= count, count);
}

function timing(score, bpm = score.songInfo.bpm) {
    const beats = score.songInfo.timeSignature.beats, secondsPerBeat = 60/bpm;
    return {bar:beats*secondsPerBeat, lap:3*beats*secondsPerBeat,
        tied:(beats+3)*secondsPerBeat, clipped:(beats+2)*secondsPerBeat, attack:(beats-1)*secondsPerBeat};
}

async function checkTransport(page, editor, score) {
    const originalTiming = timing(score), practiceBpm = 300, practiceTiming = timing(score,practiceBpm);
    const controls = transport(page,editor);
    await controls.configure();
    await controls.select(1,3);
    await controls.start();
    await waitForVoices(page,3);
    const initial = await voices(page);
    for (let i=0;i<3;i++) {
        near(initial[i].end-initial[i].start,originalTiming.tied,'the linked sound holds through both barlines');
        if (i) near(initial[i].start-initial[i-1].start,originalTiming.lap,'one attack per three-bar lap');
    }
    await controls.at(600);
    const beforeTempo = (await voices(page)).length;
    await controls.changeBPM(practiceBpm);
    await controls.at(950);
    const afterTempo = await voices(page);
    assert.equal(afterTempo.length,beforeTempo+(editor?1:0),editor
        ? 'Studio restarts the held note once at the head of the current measure'
        : 'Viewer retimes the held note without playing a fresh attack');
    await controls.stop();
    const stopped = await page.evaluate(() => ({
        noteCount:tieAudio.voices.filter(v => v.end > v.start).length,
        pending:tieAudio.voices.filter(v => v.end > v.start && v.end > tieAudio.contexts[v.context].currentTime).length
    }));
    await controls.start();
    assert.equal(stopped.pending,0,'stop cancels the previous voice before an immediate restart');
    await waitForVoices(page,stopped.noteCount+1);
    const resumed = (await voices(page))[stopped.noteCount];
    if (editor) {
        assert.equal(resumed.offset,0);
        near(resumed.end-resumed.start,practiceTiming.tied,'the restarted range plays the complete tied note');
    } else {
        assert(resumed.offset>0,'resume uses the sample tail instead of replaying its attack');
    }
    await controls.stop();
    await quiet(page);

    await controls.select(2,3);
    const beforeClipped = (await voices(page)).length;
    await controls.start();
    await waitForVoices(page,beforeClipped+2);
    const clipped = (await voices(page)).slice(beforeClipped);
    near(clipped[1].start-clipped[0].start,2*practiceTiming.bar,'a range starting inside the tie loops at the right barline');
    near(clipped[0].end-clipped[0].start,practiceTiming.clipped,'explicit start inside the tie plays only the remaining written duration');
    await controls.stop();
    await quiet(page);
}

for (const [beats,engine] of [[4,'chrome'],[4,'webkit'],[3,'chrome'],[3,'webkit']]) test(beats+'/4 three-bar tie passes actual repeat, tempo and restart controls: '+engine,async()=>{
    const {tiedViewerFixture}=await import('./helpers/viewer-fixture.mjs');
    const {score}=tiedViewerFixture(beats);
    const browser=await(engine==='chrome'?chrome():webkit.launch());
    try {
        const {context,errors}=await prepareContext(browser);
        const editor=await context.newPage();
        await editScore(editor,score);
        const project=()=>editor.evaluate(()=>CruiseStudio.documents.getSession().workingSnapshot());
        const original=await project();
        await checkTransport(editor,true,score);
        assert.deepEqual(await project(),original,'practice tempo and transport do not change the score');
        const hash=await exportScore(editor);
        const viewer=await context.newPage();
        await viewer.goto(viewerURL);
        await viewer.waitForFunction(hash=>window.CruiseViewer?.view.read()?.byteHash===hash,hash);
        await checkTransport(viewer,false,score);
        assert.equal(await viewer.evaluate(()=>CruiseViewer.view.read().byteHash),hash);
        assert.deepEqual(errors,[]);
    } finally {await browser.close();}
});

for (const beats of [4,3]) test(beats+'/4 exported three-bar tie restores from the offline library and plays once across both barlines',async()=>{
    const {tiedViewerFixture}=await import('./helpers/viewer-fixture.mjs');
    const {score}=tiedViewerFixture(beats);
    const browser=await chrome();
    try {
        const {context,errors}=await prepareContext(browser);
        const editor=await context.newPage();
        await editScore(editor,score);
        const hash=await exportScore(editor);
        await editor.close();
        const online=await context.newPage();
        await online.goto(viewerURL);
        await online.waitForFunction(hash=>window.CruiseViewer?.view.read()?.byteHash===hash,hash);
        await transport(online,false).configure();
        await online.locator('.sv-device-options summary').click();
        await online.click('#viewer-offline-prepare');
        await online.waitForFunction(()=>document.querySelector('#viewer-offline-status')?.textContent.includes('準備済み')&&
            navigator.serviceWorker.controller,{},{timeout:120000});
        await online.close();
        await context.setOffline(true);
        const offline=await context.newPage();
        await offline.goto(viewerURL);
        await offline.waitForFunction(hash=>window.CruiseViewer?.view.read()?.byteHash===hash,hash);
        assert.equal(await offline.evaluate(()=>navigator.onLine),false);
        assert.equal(await offline.evaluate(async()=>{
            try {await fetch('./not-in-offline-cache.txt');return true;} catch {return false;}
        }),false);
        const restored=await offline.evaluate(()=>CruiseViewer.view.read().document.score);
        assert.deepEqual(restored.songInfo.timeSignature,score.songInfo.timeSignature);
        assert.deepEqual(restored.bars,score.bars);
        const controls=transport(offline,false);
        await controls.select(1,3);
        await controls.start();
        await waitForVoices(offline,2);
        const notes=await voices(offline);
        near(notes[1].start-notes[0].start,timing(score).lap,'the offline loop plays one attack per pass');
        near(notes[0].end-notes[0].start,timing(score).tied,'the offline sound remains tied across two barlines');
        await controls.stop();
        await quiet(offline);
        assert.deepEqual(errors,[]);
    } finally {await browser.close();}
});

// Opt in to wall-clock verification. Both apps loop at the same time with real
// AudioContexts and a silent final bus; the test measures reservations, not speakers.
if (process.env.SCORE_TIE_SOAK_SECONDS) {
    const seconds = Number(process.env.SCORE_TIE_SOAK_SECONDS);
    assert(Number.isFinite(seconds) && seconds >= 10);
    const beats = Number(process.env.SCORE_TIE_SOAK_BEATS || 4);
    assert([3,4].includes(beats));
    test(beats+'/4 both apps keep the three-bar tie and playhead stable in real time',
        {timeout:(seconds+120)*1000}, async () => {
        const {setTimeout:sleep} = require('node:timers/promises');
        const {tiedViewerFixture} = await import('./helpers/viewer-fixture.mjs');
        const {score, contract, metadata} = tiedViewerFixture(beats);
        const expected = timing(score);
        const file = await contract.codec.encode(score,metadata);
        const browser = await chrome();
        try {
            const runs = [];
            for (const editor of [true,false]) {
                const {context, errors} = await prepareContext(browser);
                const page = await context.newPage();
                if (editor) await editScore(page,score);
                else {
                    await page.goto(viewerURL);
                    await page.waitForFunction(()=>!!window.CruiseViewer);
                    assert(await page.evaluate(text=>CruiseViewer.view.openBytes(text),file.text));
                }
                const controls = transport(page,editor);
                await controls.configure();
                await controls.select(1,3);
                const source = () => page.evaluate(editor => editor
                    ? JSON.stringify(CruiseStudio.documents.getSession().workingSnapshot())
                    : CruiseViewer.view.read().byteHash,editor);
                runs.push({editor,page,controls,source,initial:await source(),errors,bars:new Set(),phaseErrors:[]});
            }
            await Promise.all(runs.map(run=>run.controls.start()));
            const started = performance.now();
            let checkpoint = 0;
            while (performance.now()-started < seconds*1000) {
                await sleep(Math.min(1000,Math.max(0,seconds*1000-(performance.now()-started))));
                for (const run of runs) {
                    const frame = await run.page.evaluate(({editor,expected})=>{
                        const selector=editor?'#sc-sheet-scale-box > [data-score-playhead]':'[data-viewer-playhead]';
                        const cursors=document.querySelectorAll(selector);
                        const measure=document.querySelector(editor?'#sc-sheet-scale-box .sc-playing-bar':'.sv-paper .sv-playing');
                        const bar=Number(measure?.dataset.barNumber);
                        const context=tieAudio.contexts.at(-1),first=tieAudio.voices[0];
                        let phaseErrorMs=null;
                        if (first&&cursors[0]&&measure) {
                            const stamp=context.getOutputTimestamp?.();
                            const output=stamp?.performanceTime>0
                                ? stamp.contextTime+(performance.now()-stamp.performanceTime)/1000
                                : context.currentTime-(context.baseLatency||0)-(context.outputLatency||0);
                            const rect=measure.getBoundingClientRect();
                            const actual=bar-1+(cursors[0].getBoundingClientRect().left-rect.left)/rect.width;
                            const difference=actual*expected.bar-(output-first.start+expected.attack);
                            phaseErrorMs=1000*(difference-expected.lap*Math.round(difference/expected.lap));
                        }
                        return {cursors:cursors.length,bar,phaseErrorMs,
                            running:tieAudio.contexts.filter(context=>context.state==='running').length,
                            attacks:tieAudio.voices.length};
                    },{editor:run.editor,expected});
                    assert.equal(frame.cursors,1,'one visible transport cursor throughout');
                    assert(frame.bar>=1&&frame.bar<=3,'transport stays within the selected bars');
                    assert.equal(frame.running,1,'one running audio context');
                    run.bars.add(frame.bar);
                    if(Number.isFinite(frame.phaseErrorMs))run.phaseErrors.push(Math.abs(frame.phaseErrorMs));
                    run.attacks = frame.attacks;
                }
                const elapsed = Math.floor((performance.now()-started)/1000);
                if (elapsed >= checkpoint+60) {
                    checkpoint = elapsed;
                    console.log(JSON.stringify({elapsed,attacks:runs.map(run=>run.attacks)}));
                }
            }
            for (const run of runs) {
                const notes = await voices(run.page);
                assert(notes.length>=Math.floor(seconds/expected.lap));
                assert.deepEqual([...run.bars].sort(),[1,2,3]);
                for (let i=0;i<notes.length;i++) {
                    near(notes[i].end-notes[i].start,expected.tied,'note holds across two barlines on lap '+i);
                    if (i) near(notes[i].start-notes[i-1].start,expected.lap,'one attack per lap '+i);
                }
                await run.controls.stop();
                await quiet(run.page);
                if (!run.editor) await run.page.evaluate(()=>CruiseViewer.view.deactivate());
                await run.page.waitForFunction(()=>tieAudio.contexts.every(context=>context.state==='closed'));
                assert.equal(await run.source(),run.initial);
                assert.deepEqual(run.errors,[]);
                assert(run.phaseErrors.length>=seconds*.65,'enough sound/playhead comparisons');
                const phase=run.phaseErrors.sort((a,b)=>a-b);
                const phaseP95=phase[Math.floor(phase.length*.95)];
                assert(phaseP95<100,'playhead follows the browser output clock');
                console.log(JSON.stringify({app:run.editor?'Studio':'Viewer',attacks:notes.length,
                    checkedSeconds:seconds,phaseSamples:phase.length,phaseP95Ms:phaseP95,phaseMaxMs:phase.at(-1)}));
            }
        } finally {await browser.close();}
    });
}
