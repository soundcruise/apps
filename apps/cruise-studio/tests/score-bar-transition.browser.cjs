const test = require('node:test');
const assert = require('node:assert/strict');
const {chromium, webkit} = require('playwright');

const origin = 'http://127.0.0.1:18874';
const meterPath = '/apps/cruise-studio/tests/helpers/score-output-meter.js';

// Exercise real decoded guitar samples, buffer sources, envelopes and the
// scrolling score. A correct schedule alone does not guarantee audible timing.
async function attachMeter(page) {
    await page.addInitScript(path => {
        const Native = window.AudioContext || window.webkitAudioContext;
        const capture = window.scoreCapture = {starts: [], crossings: []};
        window.AudioContext = class extends Native {
            constructor(...args) {
                super(...args);
                this.tap = this.createGain();
                this.meterReady = this.audioWorklet.addModule(path).then(() => {
                    const meter = new AudioWorkletNode(this, 'score-output-meter');
                    meter.port.onmessage = e => capture.crossings.push(e.data);
                    this.tap.connect(meter);
                    meter.connect(this.destination);
                });
            }
            async resume() {
                const running = super.resume();
                await this.meterReady;
                return running;
            }
            createBufferSource() {
                const node = super.createBufferSource();
                const start = node.start.bind(node);
                node.start = (when, ...args) => {
                    capture.starts.push(when);
                    return start(when, ...args);
                };
                return node;
            }
        };
        const connect = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function(target, ...args) {
            if (this instanceof GainNode && target === this.context.destination && this.context.tap) {
                connect.call(this, this.context.tap);
            }
            return connect.call(this, target, ...args);
        };
    }, meterPath);
}

for (const engine of ['chrome', 'webkit']) test('continuous eighths across chord changes: '+engine, async () => {
    const browser = engine === 'webkit' ? await webkit.launch() :
        await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    try {
        const page = await browser.newPage();
        await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await attachMeter(page);
        const {createUITestProject} = await import('../scripts/create-ui-test-project.mjs');
        const project = createUITestProject();
        for (const bar of project.bars) {
            bar.melody = [];
            bar.chords = bar.chords.slice(0, 1);
            bar.chords[0].durationTicks = 1920;
        }
        const ids = new Set(project.bars.map(bar => bar.chords[0].id));
        project.performance.formBindings = project.performance.formBindings.filter(b => ids.has(b.chordEventId));
        for (const rhythm of project.materials.rhythms) {
            rhythm.snapshot.slots = Array.from({length: 8}, (_, i) => ({
                id: crypto.randomUUID(), tick: i * 240, durationTicks: 240, action: i % 2 ? 'up' : 'down'
            }));
        }
        await page.goto(origin);
        await page.click('#open-sheet-cruise');
        await page.locator('#sc-import-json').setInputFiles({name: 'continuous-eighths.json',
            mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project))});
        await page.waitForFunction(id => CruiseStudio.sheetCruise.getSession().draft.projectId === id, project.projectId);
        await page.click('#sc-song-preview');
        await page.waitForFunction(() => document.querySelector('.sc-playing-bar')?.dataset.barNumber === '7');
        await page.click('#sc-song-preview');
        const {starts, crossings} = await page.evaluate(() => scoreCapture);
        assert(starts.length && crossings.some(c => c.audible));
        const first = Math.min(...starts);
        const secondsPerBar = 4 * 60 / project.songInfo.bpm;
        for (let i = 1; i <= 5; i++) {
            const beat = first + i * secondsPerBar;
            const before = crossings.filter(c => c.time <= beat).at(-1);
            assert(before && (before.audible || beat-before.time < .012), 'premature damping before bar '+(i+1));
            assert(crossings.some(c => c.audible && Math.abs(c.time-beat) < .015), 'missing attack at bar '+(i+1));
        }
    } finally { await browser.close(); }
});
