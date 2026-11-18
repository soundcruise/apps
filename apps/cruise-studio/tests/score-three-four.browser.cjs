const test = require('node:test');
const assert = require('node:assert/strict');
const {chromium, webkit} = require('playwright');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');

const origin = 'http://127.0.0.1:18874';

for (const engine of ['chrome', 'webkit']) test('3/4 from score entry to tied melody and Viewer playback: ' + engine, async () => {
    const {viewerFixture} = await import('./helpers/viewer-fixture.mjs');
    const {score, contract} = viewerFixture();
    score.bars = score.bars.slice(0,3).map(bar => ({...bar, chords:[], melody:[], lyrics:[]}));
    score.sections = score.sections.filter(section => section.id === score.bars[0].sectionId);
    score.performance.formBindings = [];
    score.performance.barRhythms = [];
    score.notation.lineBreakAfter = [score.bars[0].id];
    score.songInfo.bpm = 300;
    const browser = await (engine === 'chrome'
        ? chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
        : webkit.launch());
    try {
        const context = await browser.newContext({viewport:{width:1440,height:1000}});
        const studioSource = readFileSync(join(__dirname,'../js/modules/sheet-cruise/sheet-cruise.js'),'utf8');
        const marker = 'osc.buffer=sample.buffer;';
        assert(studioSource.includes(marker));
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin !== origin) return route.abort();
            if (url.pathname.endsWith('/sheet-cruise/sheet-cruise.js')) {
                return route.fulfill({contentType:'text/javascript',
                    body:studioSource.replace(marker,'osc.testPart=e.part;'+marker)});
            }
            return route.continue();
        });
        await context.addInitScript(() => {
            const Base=window.AudioContext||window.webkitAudioContext;
            window.scoreNotes=[];
            window.AudioContext=class extends Base {
                createBufferSource() {
                    const source=super.createBufferSource(),start=source.start.bind(source),stop=source.stop.bind(source);
                    let note;
                    source.start=(at,...args)=>{
                        if(source.testPart){note={part:source.testPart,at,until:null};scoreNotes.push(note);}
                        start(at,...args);
                    };
                    source.stop=(at,...args)=>{if(note&&note.until===null)note.until=at;stop(at,...args);};
                    return source;
                }
            };
        });
        const page = await context.newPage(), errors = [];
        page.setDefaultTimeout(12000);
        page.on('pageerror', error => errors.push(error.message));
        async function menu(item) {
            await page.click('#sc-curve-menu-toggle');
            await page.click(item);
        }
        const read = () => page.evaluate(() => CruiseStudio.documents.getSession().workingSnapshot());
        const staffReady = () => page.waitForFunction(() => document.querySelector('.melody-page')?.dataset.ready === 'true' &&
            CruiseStudio.sheetCruise.getStaffMetrics()?.source?.snapshotVersion === CruiseStudio.documents.getSession().snapshotVersion);
        const note = id => page.locator('[data-event-id="' + id + '"]').first();

        await page.goto(origin);
        await page.click('#open-sheet-cruise');
        await page.locator('#sc-import-json').setInputFiles({name:'waltz.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(score))});
        await page.waitForFunction(id => CruiseStudio.documents.getSession()?.target.projectId === id,score.projectId);
        await menu('#sc-edit-song');
        await page.getByLabel('拍子',{exact:true}).selectOption('3');
        await page.click('[data-score-apply]');
        await page.locator('[data-score-dialog]').waitFor({state:'detached'});
        assert.deepEqual((await read()).songInfo.timeSignature,{beats:3,beatUnit:4});

        await page.locator('#sc-sheet-scale-box .sheet-bar[data-bar-number="1"]').click({position:{x:4,y:4}});
        await page.click('#sc-edit-selected');
        await page.click('[data-editor-bars="2"]');
        const measureEditor = bar => page.locator('.editor-measure[data-bar-number="' + bar + '"]');
        const cell = (bar,tick,field='doremi') => measureEditor(bar).locator('[data-overlay-field="' + field + '"][data-slot-tick="' + tick + '"]');
        assert.equal(await cell(1,1440).count(),0,'the editor stops after beat three');
        await cell(1,960).fill('ド');
        await cell(2,0).fill('ド');
        await measureEditor(2).locator('.dock-lyrics-cell[data-slot-tick="960"]').fill('海');
        await cell(2,960,'chord').fill('Am');
        await cell(2,960,'chord').press('Enter');
        const stroke = measureEditor(2).locator('.dock-strum-cell[data-slot-tick="960"]');
        assert.equal(await stroke.getAttribute('data-strum-state'),'down');
        await stroke.press('r');
        await page.click('.slot-overlay-close');
        const entered = await read(), first = entered.bars[0].melody[0], next = entered.bars[1].melody[0];
        assert.equal(first.onsetTick,960);
        assert.equal(next.onsetTick,0);
        assert.deepEqual(first.pitch,next.pitch);
        assert.equal(entered.bars[1].chords[0].onsetTick,960);
        assert.equal(entered.bars[1].chords[0].symbol,'Am');
        assert.equal(entered.bars[1].lyrics[0].text,'海');
        const binding = entered.performance.barRhythms.find(entry => entry.barId === entered.bars[1].id);
        const rhythm = entered.materials.rhythms.find(material => material.id === binding.materialId);
        assert(rhythm.snapshot.slots.some(slot=>slot.tick===960&&slot.action==='rest'));

        await menu('#sc-menu-staff-toggle');
        await staffReady();
        assert.match(await page.locator('.melody-caption').innerText(),/3\/4/);
        const measure = page.locator('.melody-measure[data-bar-number="3"] .melody-svg');
        const anchors = JSON.parse(await measure.getAttribute('data-anchors'));
        assert.equal(anchors.at(-1).tick,1440);
        assert.equal(await measure.locator('.vf-stavenote').count(),1,'a silent 3/4 measure has a single whole-measure rest');
        await note(first.id).click();
        const panel = page.locator('#sc-melody-inspector');
        await panel.getByRole('button',{name:'空きまで伸ばす',exact:true}).click();
        await staffReady();
        assert.equal((await read()).bars[0].melody[0].durationTicks,480);
        await panel.getByRole('button',{name:'次の小節の音とつなぐ',exact:true}).click();
        await staffReady();
        assert.equal(await page.locator('[data-melody-tie] path').count(),2);
        assert.equal((await read()).bars[0].melody[0].tieToNext,next.id);
        await page.click('#sc-undo');await staffReady();
        assert.equal(await page.locator('[data-melody-tie] path').count(),0);
        await page.click('#sc-redo');await staffReady();
        assert.equal(await page.locator('[data-melody-tie] path').count(),2);

        await page.click('#sc-save');
        await page.waitForFunction(()=>!CruiseStudio.documents.getSession().dirty);
        const saved = await read();
        await page.reload();
        await page.click('#open-sheet-cruise');
        await page.waitForFunction(id=>CruiseStudio.documents.getSession()?.target.projectId===id,saved.projectId);
        assert.deepEqual(await read(),saved);
        await menu('#sc-menu-staff-toggle');
        await staffReady();
        assert.equal(await page.locator('[data-melody-tie] path').count(),2);
        await page.locator('.melody-measure[data-bar-number="1"]').click({position:{x:4,y:4}});
        await page.click('#sc-playback-settings');
        await page.locator('#sc-count-in').check();
        await page.click('[data-playback-done]');
        await page.click('#sc-song-preview');
        await page.waitForFunction(() => /カウント [1-3] \/ 3/.test(document.getElementById('sc-song-position').textContent));
        await page.locator('.melody-measure[data-bar-number="3"].sc-playing-bar').waitFor();
        const audio = await page.evaluate(()=>scoreNotes);
        assert.equal(audio.filter(event=>event.part==='count').length,3);
        assert(audio.some(event=>event.part==='guitar'));
        const notes = audio.filter(event=>event.part==='piano');
        assert.equal(notes.length,1);
        assert(Math.abs(notes[0].until-notes[0].at-.3)<.01);
        await page.click('#sc-song-preview');
        await menu('#sc-menu-staff-toggle');

        await menu('#sc-export-viewer');
        await page.click('[data-export-choice=export-save]');
        await page.click('[data-export-complete=open]');
        await page.locator('.sv-paper .sheet-bar').first().waitFor();
        await page.evaluate(async()=>window.meterViewer=await CruiseStudio.scoreViewer.ready());
        const file = await page.evaluate(()=>meterViewer.read().document);
        assert(file.requires.includes('meter:3/4'));
        assert.deepEqual(file.score.bars,saved.bars);
        const plan = contract.tickPlan(file.score);
        assert.equal(plan.ticksPerBar,1440);
        assert.deepEqual(plan.events.filter(event=>event.part==='piano').map(event=>[event.tick,event.durationTicks,event.tieStarts]),
            [[960,720,[1440]]]);

        await page.locator('.sv-paper .sheet-bar[data-bar-number="1"]').click({position:{x:4,y:4}});
        await page.locator('.sv-paper .sheet-bar[data-bar-number="3"]').click({position:{x:4,y:4},modifiers:['Shift']});
        await page.locator('[data-viewer-action=sound-all]').click();
        await page.locator('[data-viewer-action=play]').click();
        await page.waitForFunction(()=>meterViewer.playback()?.barIndex===2);
        const playback = await page.evaluate(()=>meterViewer.playback());
        assert.equal(playback.ticksPerBar,1440);
        assert.equal(playback.range.end,4320);
        assert.equal(playback.stats.parts.count,3,'Viewer counts in three quarters');
        assert.equal(playback.stats.parts.piano,1);
        assert.deepEqual(errors,[]);
    } finally {
        await browser.close();
    }
});
