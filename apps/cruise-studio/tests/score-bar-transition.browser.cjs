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
        const capture = window.scoreCapture = {starts: [], crossings: [], blocks: []};
        window.AudioContext = class extends Native {
            constructor(...args) {
                super(...args);
                capture.sampleRate = this.sampleRate;
                this.tap = this.createGain();
                this.meterReady = this.audioWorklet.addModule(path).then(() => {
                    const meter = new AudioWorkletNode(this, 'score-output-meter');
                    meter.port.onmessage = ({data}) => (data.samples ? capture.blocks : capture.crossings).push(data);
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
        const [C, G] = project.bars[0].chords;
        const bindings = project.performance.formBindings;
        project.performance.formBindings = [];
        // With an upstroke at beat one, each comparison is down -> up.
        // The same C -> G change occurs inside bar 2 and leading into bar 4.
        const chords = [[C], [C,G], [G,C], [G]];
        for (const [index,bar] of project.bars.entries()) {
            bar.melody = [];
            const row = chords[index] ?? bar.chords.slice(0,1);
            bar.chords = row.map((source,i) => {
                const id = crypto.randomUUID();
                const binding = bindings.find(b => b.chordEventId === source.id);
                project.performance.formBindings.push({...binding, id:crypto.randomUUID(), chordEventId:id});
                return {...source, id, onsetTick:i*960, durationTicks:1920/row.length};
            });
        }
        for (const rhythm of project.materials.rhythms) {
            rhythm.snapshot.slots = Array.from({length: 8}, (_, i) => ({
                id: crypto.randomUUID(), tick: i * 240, durationTicks: 240, action: i % 2 ? 'down' : 'up'
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
        const {starts, crossings, differences} = await page.evaluate(() => {
            const {starts,crossings,blocks,sampleRate} = scoreCapture;
            const first = Math.min(...starts);
            const pcm = new Float32Array(blocks.at(-1).frame + blocks.at(-1).samples.length);
            for (const {frame,samples} of blocks) pcm.set(samples,frame);
            // Compare 60 ms of outgoing strings and the first 75 ms of the new stroke.
            const wave = beat => pcm.subarray(Math.round((first+beat-.060)*sampleRate),Math.round((first+beat+.075)*sampleRate));
            function compareEnvelope(left,right) {
                const a=wave(left), b=wave(right), block=Math.round(sampleRate*.002);
                let difference=0, reference=0, dipDb=0;
                for (let i=0;i+block<=a.length;i+=block) {
                    let energyA=0, energyB=0;
                    for (let k=i;k<i+block;k++) {
                        energyA+=a[k]**2;
                        energyB+=b[k]**2;
                    }
                    difference+=(Math.sqrt(energyA)-Math.sqrt(energyB))**2;
                    reference+=energyA;
                    if (Math.abs(i/sampleRate-.060)<.008) dipDb=Math.max(dipDb,10*Math.log10(energyA/energyB));
                }
                return {relative:Math.sqrt(difference/reference),dipDb};
            }
            return {starts,crossings,differences:[compareEnvelope(1.2,2.4),compareEnvelope(3.6,7.2)]};
        });
        for (const {relative,dipDb} of differences) {
            assert(relative < .05, 'barline volume envelope differs from interior by '+relative);
            assert(dipDb < 2, 'extra dip around the boundary in dB: '+dipDb);
        }
        assert(starts.length && crossings.some(c => c.audible));
        const first = Math.min(...starts);
        const secondsPerBar = 4 * 60 / project.songInfo.bpm;
        for (let i = 1; i <= 5; i++) {
            const beat = first + i * secondsPerBar;
            const before = crossings.filter(c => c.time <= beat).at(-1);
            assert(before && (before.audible || beat-before.time < .012), 'premature damping before bar '+(i+1));
            assert(starts.some(time => Math.abs(time-beat) < .001), 'missing attack at bar '+(i+1));
            assert(before.audible || crossings.some(c => c.audible && Math.abs(c.time-beat) < .015), 'silent downbeat at bar '+(i+1));
        }
    } finally { await browser.close(); }
});
