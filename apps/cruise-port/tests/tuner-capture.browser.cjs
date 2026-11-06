// Native Chromium capture with generated WAV only; never records or sends microphone audio.
// NODE_PATH=<Playwright node_modules> node apps/cruise-port/tests/tuner-capture.browser.cjs [out]
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..'), out = path.resolve(process.argv[2] || '/tmp/cruise-tuner-capture');
const types = { '.js': 'application/javascript', '.mjs': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
function wav(samples, sampleRate) {
    const b = Buffer.alloc(44 + samples.length * 2);
    b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
    samples.forEach((v,i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1,v)) * 32767),44+i*2)); return b;
}
(async () => {
    fs.mkdirSync(out, { recursive: true });
    const { guitarSignal } = await import(pathToFileURL(path.join(__dirname, 'fixtures/tuner-guitar.mjs')));
    const server = http.createServer((req,res) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname === '/tuner-qa.html') { res.writeHead(200, {'Content-Type':'text/html'}).end('<!doctype html><title>Tuner synthetic QA</title>'); return; }
        let name = path.resolve(root, '.' + pathname); if (pathname.endsWith('/')) name = path.join(name,'index.html');
        if (!name.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        try { const bytes=fs.readFileSync(name); res.writeHead(200, {'Content-Type': types[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store'}).end(bytes); } catch { res.writeHead(404).end(); }
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r)); const origin = `http://127.0.0.1:${server.address().port}`;
    const report = { syntheticOnly: true, cases: [], blockedNetwork: [] };
    let browser;
    try {
        for (const [note, frequency] of [['E2',82.406889],['E4',329.627557]]) {
            const input = path.join(out,note+'.wav'); fs.writeFileSync(input,wav(guitarSignal({sampleRate:48000,frequency,profile:'hiss',duration:8,onset:0,sustain:true}),48000));
            browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-audio-capture='+input]});
            report.browser = browser.version();
            const context = await browser.newContext();
            await context.route('**/*',r=> { const u = new URL(r.request().url()); if(u.origin === origin) return r.continue(); report.blockedNetwork.push(u.origin); return r.abort(); });
            const page = await context.newPage();
            await page.goto(origin+'/tuner-qa.html');
            for (const sampleRate of [44100,48000]) for (const owner of ['port','studio-quick']) {
                const row = await page.evaluate(async ({frequency,sampleRate,owner}) => {
                    globalThis.CruiseStudio ||= {};
                    await import('/apps/cruise-studio/js/core/audio-coordinator.js');
                    const streams=[],contexts=[],frames=[],originalGet=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
                    const mediaDevices={ getUserMedia:async c=>{const s=await originalGet(c);streams.push(s);return s;}, getSupportedConstraints:()=>navigator.mediaDevices.getSupportedConstraints() };
                    class Context extends AudioContext { constructor(){super({sampleRate});contexts.push(this);} }
                    let controller,coordinator;
                    if(owner==='port') {
                        const {createTunerAudioController}=await import('/apps/cruise-port/tuner-audio.js');
                        controller=createTunerAudioController({rmsThreshold:.0001,diagnosticEnabled:true,onDiagnostic:d=>frames.push(d),environment:{navigatorObject:{mediaDevices},AudioContextClass:Context}});
                    } else {
                        coordinator=CruiseStudio.audioCoordinator.createCoordinator();
                        const {createRuntime}=await import('/apps/cruise-studio/js/modules/tuner/runtime.mjs');
                        controller=createRuntime({coordinator,environment:{mediaDevices,createContext:()=>new Context()}});
                        controller.subscribe(s=>{if(s.diagnostics)frames.push(s.diagnostics);});
                    }
                    const start=performance.now(); if(!await controller.start())throw Error('capture did not start');
                    await new Promise(r=>setTimeout(r,1350));
                    const settings=streams[0].getAudioTracks()[0].getSettings();
                    await controller.stop();
                    const result={owner,sampleRate,frames:frames.length,elapsedMs:performance.now()-start,settings:{sampleRate:settings.sampleRate,channelCount:settings.channelCount,echoCancellation:settings.echoCancellation,noiseSuppression:settings.noiseSuppression,autoGainControl:settings.autoGainControl},reasons:{},correct:0,wrong:0,intervals:[],durations:[],maxErrorCents:0};
                    // Exclude initial microphone pipeline fill; native capture startup differs from generated onset.
                    for(const d of frames.slice(5)) {result.reasons[d.reason]=(result.reasons[d.reason]||0)+1;if(d.finalFrequency){const e=Math.abs(1200*Math.log2(d.finalFrequency/frequency));result.maxErrorCents=Math.max(result.maxErrorCents,e);if(e<=10)result.correct++;else result.wrong++;}if(Number.isFinite(d.analysisIntervalMs))result.intervals.push(d.analysisIntervalMs);result.durations.push(d.analysisDurationMs);}
                    result.stopped=streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))&&contexts.every(c=>c.state==='closed');
                    result.contexts=contexts.length;
                    if(owner==='port')await controller.destroy();else{await controller.dispose();result.leases=coordinator.snapshot().length;}
                    return result;
                },{frequency,sampleRate,owner});
                row.note=note; report.cases.push(row);
                assert(row.correct>=15,JSON.stringify(row)); assert.equal(row.wrong,0,JSON.stringify(row)); assert(row.stopped);assert.equal(row.contexts,1);if(owner==='studio-quick')assert.equal(row.leases,0);
            }
            // Real Standard Port DOM, same capture path used by Studio's embedded Port.
            // No Pro gate fixtures, credentials or auth bypass.
            await context.addInitScript(() => {
                window.__tunerUI = { contexts: [], streams: [] };
                const Native = window.AudioContext;
                window.AudioContext = class extends Native { constructor(...args) { super(...args); __tunerUI.contexts.push(this); } };
                const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
                navigator.mediaDevices.getUserMedia = async constraints => { const stream = await get(constraints); __tunerUI.streams.push(stream); return stream; };
            });
            await page.setViewportSize(note === 'E2' ? {width:393,height:852} : {width:1280,height:900});
            await page.goto(origin+'/apps/cruise-port/');
            await page.waitForFunction(()=>document.getElementById('tuner-card') && document.getElementById('tuner-tuning').options.length>0);
            await page.locator('#tuner-card').click();
            await page.waitForFunction(()=>document.getElementById('tuner-note-value')?.textContent!=='—');
            await page.waitForTimeout(350);
            const display=await page.locator('#tuner-note-value').innerText();
            assert.equal(display,note);report.cases.push({owner:'port-dom',note,display});
            await page.locator('#tuner-input-settings-toggle').click();
            assert.equal(await page.locator('#tuner-diagnostic').isVisible(),false);
            await page.locator('#tuner-diagnostic-toggle').click();
            assert(await page.locator('#tuner-diagnostic').isVisible());
            assert.equal(new URL(page.url()).search,'','diagnostics need no query string');
            const saved = await page.evaluate(()=>localStorage.getItem('cruisePort.tuner'));
            await page.waitForFunction(()=>document.getElementById('tuner-diagnostic-advice').dataset.result==='detected',null,{timeout:10000});
            const advice = await page.locator('#tuner-diagnostic-advice').innerText();
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false,'input settings fit the viewport');
            await page.locator('#tuner-input-settings-panel').screenshot({path:path.join(out,note+'-input-diagnosis.png')});
            await page.locator('#tuner-diagnostic-reconnect').click();
            await page.waitForFunction(()=>__tunerUI.streams.length===2 && __tunerUI.contexts.filter(c=>c.state==='running').length===1);
            assert(await page.evaluate(()=>__tunerUI.streams[0].getTracks().every(t=>t.readyState==='ended')));
            assert.equal(await page.evaluate(()=>localStorage.getItem('cruisePort.tuner')),saved);
            assert.equal(await page.locator('#tuner-threshold').inputValue(),'-80');
            report.cases.push({owner:'port-diagnose-reconnect',note,advice,settingsUnchanged:true});
            await page.evaluate(()=>{location.hash='';});
            await page.waitForFunction(()=>document.getElementById('tuner-note-value').textContent==='—');
            assert.equal(await page.locator('#tuner-note-value').innerText(),'—');
            assert(await page.evaluate(()=>__tunerUI.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
            await page.waitForFunction(()=>__tunerUI.contexts.every(c=>c.state==='closed'));
            assert.equal(await page.locator('#tuner-diagnostic-check').isDisabled(),false);
            await browser.close();browser=null;
        }
        console.log(JSON.stringify(report,null,2));
    } finally { fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');if(browser)await browser.close();await new Promise(r=>server.close(r)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
