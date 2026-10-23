import {runStaleRenewSuite} from './stale-renew-suite.mjs';
import {writeJSONReport} from './report-output.mjs';
import {runEvidenceReproduction,runEvidenceSuite} from './evidence-lifetime-suite.mjs';
import {runEvidenceAdmissionSuite} from './evidence-admission-suite.mjs';
import {runProDeviceSuite} from './pro-device-suite.mjs';
import {runRevocationReproduction,runObservedRevocationSuite} from './observed-revocation-suite.mjs';
import {runControlSuite} from './control-suite.mjs';
import {runPointerSafetySuite} from './pointer-safety-suite.mjs';
// L1 cross-tab race driver: real Chrome, two tabs in separate windows (separate
// renderer processes verified with Chrome trace for IDB), one loopback origin.
// Current mode uses Web Locks/localStorage; isolated L2b uses real Repository/IDB.
//
//   node apps/cruise-port/tests/cross-tab/cross-tab-driver.mjs [--mode=characterization|acceptance]
//        [--backend=current|indexeddb-authority] [--rounds=3] [--iterations=200] [--payloads=0,20000,200000]
//        [--scenarios=save-save-same-key,...]
//
// characterization (default): records observed defects of the current backend and
// exits 0 unless the harness itself failed. acceptance: exits 1 on any violation or
// on an unavailable backend; it is the L2+ gate for the IndexedDB Authority.
// Uses a throwaway profile and a private loopback server; never a real user profile.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runReferentialSuite, runReferentialFailures } from './referential-suite.mjs';
import { runActionPolicySuite } from './action-policy-suite.mjs';
import { runPointerSuite } from './pointer-suite.mjs';
import { SCENARIOS, CONTROL_SCENARIOS, PAYLOADS, classifySameKey, classifyDifferentKeys,
    classifyDeleteIntents, classifyControl, verdict } from './cross-tab-scenarios.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const mode = args.mode || 'characterization';
const backend = args.backend || 'current';
const rounds = Number(args.rounds || 3);
const iterations = Number(args.iterations || 200);
const payloads = (args.payloads ? args.payloads.split(',').map(Number) : PAYLOADS);
const scenarios = args.scenarios ? args.scenarios.split(',') : SCENARIOS;
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const repoRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const appsRoot = join(repoRoot, 'apps');
if (!['characterization', 'acceptance'].includes(mode) || scenarios.some(s => !SCENARIOS.includes(s))) {
    console.error('invalid arguments'); process.exit(2);
}

// Unknown backends cannot pass acceptance. IDB is connected only to the explicit fixture.
if (!['current', 'indexeddb-authority'].includes(backend)) {
    const results = scenarios.flatMap(scenario => payloads.map(payload => ({ scenario, payload, status: 'backend-unavailable' })));
    const v = verdict(mode, results);
    console.log(JSON.stringify({ mode, backend, results, verdict: v }, null, 1));
    process.exit(v.pass ? 0 : 1);
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    const file = resolve(repoRoot, '.' + decodeURIComponent(url.pathname));
    const parts = file.slice(repoRoot.length).split(sep);
    if (req.method !== 'GET' || !file.startsWith(appsRoot + sep) || parts.some(p => p.startsWith('.') || p === 'node_modules')
        || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

const profile = mkdtempSync(join(tmpdir(), 'cruise-cross-tab-'));
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--site-per-process',
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-pings',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch {} server.close(); try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);

const portFile = join(profile, 'DevToolsActivePort');
for (let i = 0; i < 150 && !existsSync(portFile); i++) await new Promise(r => setTimeout(r, 100));
const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');
const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
await new Promise((ok, fail) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', fail, { once: true }); });
let nextId = 0; const pending = new Map(), paused = new Set(), crashed = new Set(), errors = [], missing = [], networkWrites = [], traces = [];
let traceComplete = false;
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Debugger.paused') paused.add(m.sessionId);
    if (m.method === 'Inspector.targetCrashed') crashed.add(m.sessionId);
    if (m.method === 'Tracing.dataCollected') traces.push(...m.params.value);
    if (m.method === 'Tracing.tracingComplete') traceComplete = true;
    if (m.method === 'Fetch.requestPaused') {
        const u=new URL(m.params.request.url),local=['127.0.0.1','localhost'].includes(u.hostname)&&['http:','https:'].includes(u.protocol);
        if(!local)errors.push('non-loopback request blocked: '+u.origin);
        void send(local?'Fetch.continueRequest':'Fetch.failRequest',local?{requestId:m.params.requestId}:{requestId:m.params.requestId,errorReason:'BlockedByClient'},m.sessionId);
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text);
    if (m.method === 'Network.responseReceived' && m.params.response.status === 404) missing.push(m.params.response.url);
    if (m.method === 'Network.requestWillBeSent' && !['GET','HEAD'].includes(m.params.request.method)) networkWrites.push(m.params.request.url);
});
const send = (method, params = {}, sessionId) => new Promise(r => { const id = ++nextId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params, sessionId })); });

async function evaluate(session, expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 300000 }, session);
    if (r.error || r.result?.exceptionDetails) throw Error(JSON.stringify(r.error || r.result.exceptionDetails).slice(0, 500));
    return r.result.result.value;
}
async function openTab() {
    const page = backend === 'indexeddb-authority' ? 'idb-repository-fixture.html' : 'cross-tab-fixture.html';
    const target = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const { result } = await send('Target.attachToTarget', { targetId: target.result.targetId, flatten: true });
    for (const method of ['Runtime.enable','Log.enable','Network.enable']) await send(method, {}, result.sessionId);
    await send('Fetch.enable',{patterns:[{urlPattern:'*'}]},result.sessionId);
    await send('Page.navigate', { url: `${origin}/apps/cruise-port/tests/cross-tab/${page}` }, result.sessionId);
    for (let i = 0; i < 100; i++) {
        try { if (await evaluate(result.sessionId, 'typeof crossTab') === 'object') return { session: result.sessionId, target: target.result.targetId }; } catch {}
        await new Promise(r => setTimeout(r, 100));
    }
    throw Error('fixture did not load');
}

const report = { mode, backend, origin: 'loopback', profile: 'throwaway', chrome: null, rounds, iterations, payloads, results: [] };
try {
    report.chrome = (await send('Browser.getVersion')).result?.product || null;
    let primaryTab = await openTab(), peerTab = await openTab();
    let primary = primaryTab.session; const peer = peerTab.session;
    const token = randomUUID();
    await evaluate(primary, `crossTab.claim(${JSON.stringify(token)})`);
    await evaluate(peer, `crossTab.claim(${JSON.stringify(token)})`);
    const info = await send('SystemInfo.getProcessInfo');
    report.rendererProcesses = (info.result?.processInfo || []).filter(p => p.type === 'renderer').length;
    if (report.rendererProcesses < 2) throw Error('separate renderers unavailable');
    report.controlBoundary = backend === 'indexeddb-authority' ? 'fixture only; product L3 not connected' : 'dormant legacy';
    report.webLocks = backend === 'indexeddb-authority' ? false : true;
    report.notifications = backend === 'indexeddb-authority' ? 'dropped' : 'native propagation';
    if (backend === 'indexeddb-authority') {
        await send('Tracing.start', { categories: 'blink.user_timing', transferMode: 'ReportEvents' });
        const marks = ['primary-'+randomUUID(), 'peer-'+randomUUID()];
        await evaluate(primary, `performance.mark(${JSON.stringify(marks[0])})`);
        await evaluate(peer, `performance.mark(${JSON.stringify(marks[1])})`);
        const frames = await Promise.all([send('Page.getFrameTree', {}, primary), send('Page.getFrameTree', {}, peer)]);
        await send('Tracing.end');
        for (let n=0;n<100&&!traceComplete;n++) await new Promise(r=>setTimeout(r,25));
        report.targetRendererPids = marks.map(mark=>traces.find(t=>t.name===mark)?.pid);
        const urls = frames.map(f=>new URL(f.result.frameTree.frame.url).origin);
        if (urls.some(url=>url!==origin)) throw Error('target origins differ');
        if (report.targetRendererPids.some(p=>!Number.isInteger(p)) || new Set(report.targetRendererPids).size!==2)
            throw Error('trace did not prove distinct target renderer processes');
    }
    if(args.suite==='evidence-reproduction'){report.evidenceReproduction=await runEvidenceReproduction({evaluate,primary});report.results=[{scenario:'known-evidence-counterexample',rounds:2,violations:2,inconclusiveRounds:0}];}
    if(args.suite==='evidence'){report.evidenceCases=await runEvidenceSuite({evaluate,primary,peer});report.results=[{scenario:'evidence-lifetime',rounds:report.evidenceCases.length,violations:0,inconclusiveRounds:0}];}
    if(args.suite==='evidence-admission'){report.evidenceAdmissionCases=await runEvidenceAdmissionSuite({evaluate,primary,peer});report.results=[{scenario:'evidence-admission',rounds:report.evidenceAdmissionCases.length,violations:0,inconclusiveRounds:0}];}
    if(args.suite==='pro-device'){report.proDeviceCases=await runProDeviceSuite({evaluate,primary,peer});report.results=[{scenario:'pro-device',rounds:report.proDeviceCases.length,violations:0,inconclusiveRounds:0}];}
    if(args.suite==='revocation-reproduction'){report.revocationReproduction=await runRevocationReproduction({evaluate,primary});report.results=[{scenario:'known-revocation-counterexamples',rounds:3,violations:3,inconclusiveRounds:0}];}
    if(args.suite==='stale-renew'){report.staleRenewCases=await runStaleRenewSuite({evaluate,primary,peer,reloadPeer:async()=>{
        await evaluate(peer,'window.__l3cBeforeReload=true');await send('Page.reload',{},peer);
        let ready=false;for(let n=0;n<100;n++){
            try{if(await evaluate(peer,"typeof crossTab==='object'&&!window.__l3cBeforeReload")){ready=true;break;}}catch{}
            await new Promise(r=>setTimeout(r,50));
        }
        if(!ready)throw Error('inconclusive: fresh peer document unavailable');
        await evaluate(peer,`crossTab.claim(${JSON.stringify(token)})`);
    }});report.results=[{scenario:'stale-renew',rounds:report.staleRenewCases.length,violations:0,inconclusiveRounds:0}];}
    if(args.suite==='observed-revocation'){report.observedRevocationCases=await runObservedRevocationSuite({evaluate,primary,peer});report.results=[{scenario:'observed-revocation',rounds:report.observedRevocationCases.length,violations:0,inconclusiveRounds:0}];}
    if(args.suite==='control'){report.controlCases=await runControlSuite({evaluate,primary,peer,rounds});report.results=[{scenario:'formal-control',rounds:rounds*16,violations:0,inconclusiveRounds:0}];}
    if (args.suite === 'policy') {
        if(backend!=='indexeddb-authority')throw Error('policy suite requires isolated IDB');
        report.actionPolicy=await runActionPolicySuite({evaluate,primary,peer});
        report.results=[{scenario:'action-policy',rounds:1,violations:0,inconclusiveRounds:0}];
    }
    if(args.suite==='pointer-safety'){
        report.pointerSafetyCases=await runPointerSafetySuite({evaluate,primary,peer,rounds});
        report.results=[{scenario:'pointer-safety',rounds,violations:0,inconclusiveRounds:0}];
    }
    if (args.suite === 'pointer') {
        if (backend !== 'indexeddb-authority') throw Error('pointer suite requires isolated IDB');
        const pointer = await runPointerSuite({ evaluate, send, openTab, primaryTab, peerTab, token, paused, crashed, rounds });
        primaryTab = pointer.primaryTab; primary = primaryTab.session; report.pointerCases = pointer.results;
        report.results = [{ scenario: 'pointer-publication', rounds, violations: 0, inconclusiveRounds: 0 }];
    }
    if (args.suite === 'referential') {
        if (backend !== 'indexeddb-authority') throw Error('referential suite requires isolated IDB');
        report.results = await runReferentialSuite({ evaluate, primary, peer, rounds, payloads, reproduction: mode === 'characterization' });
        if (mode === 'acceptance') {
            const failure = await runReferentialFailures({ evaluate, send, openTab, primaryTab, peerTab, token });
            primaryTab = failure.primaryTab; primary = primaryTab.session;
            for (let i=0;i<200&&!paused.has(primary);i++) await new Promise(r=>setTimeout(r,25));
            assert(paused.has(primary), 'attachment crash checkpoint not reached');
            const beforeCrash = failure.beforeCrash;
            await send('Inspector.enable', {}, primary);
            await Promise.race([send('Page.crash', {}, primary), new Promise(r=>setTimeout(r,500))]);
            for (let i=0;i<100&&!crashed.has(primary);i++) await new Promise(r=>setTimeout(r,25));
            assert(crashed.has(primary), 'native renderer crash not observed');
            await send('Target.closeTarget', { targetId: primaryTab.target });
            const crashFact=(await evaluate(peer, "crossTab.lookup('attachment-renderer-crash')")).result;
            const afterCrash=await evaluate(peer,'crossTab.referenceObserve()');
            assert.equal(afterCrash.seq,beforeCrash.seq+(crashFact?1:0));
            assert.deepEqual(afterCrash.values,crashFact?{...beforeCrash.values,
                'cruisePort.syncAssetMetadata':failure.crashPacket.changes['cruisePort.syncAssetMetadata'],
                'cruisePort.syncDeletionIntent.v1':'{}'}:beforeCrash.values);
            report.referenceCrashOutcome=crashFact?'committed-with-lost-response':'aborted';
            primaryTab=await openTab();primary=primaryTab.session;
            await evaluate(primary, `crossTab.claim(${JSON.stringify(token)})`);
            await evaluate(primary, `crossTab.prepare(${JSON.stringify({reference:true,generation:failure.generation,role:'peer'})})`);
            assert.deepEqual((await evaluate(primary,'crossTab.referenceObserve()')).values, afterCrash.values);
            report.referenceFailures=[...failure.results,{name:'native Page.crash in attachment callback: exact committed/aborted snapshot and reopen',pass:true}];
        }
    }
    for (const scenario of ['referential','policy','pointer','pointer-safety','control','evidence-reproduction','evidence','evidence-admission','pro-device','revocation-reproduction','observed-revocation','stale-renew'].includes(args.suite) ? [] : scenarios) for (const payload of payloads) {
        const aggregate = { scenario, payload, rounds: 0, violations: 0, inconclusiveRounds: 0, details: [] };
        for (let round = 0; round < rounds; round++) {
            const generation = randomUUID();
            const opts = role => JSON.stringify({ scenario, role, iterations, payload, generation });
            await evaluate(primary, `crossTab.prepare(${opts('primary')})`);
            await evaluate(peer, `crossTab.prepare(${opts('peer')})`);
            const [a, b] = await Promise.all([evaluate(primary, `crossTab.run(${opts('primary')})`), evaluate(peer, `crossTab.run(${opts('peer')})`)]);
            await new Promise(r => setTimeout(r, 800)); // settle propagation before observing
            const [seenA, seenB] = [await evaluate(primary, 'crossTab.observe()'), await evaluate(peer, 'crossTab.observe()')];
            const converged = JSON.stringify({ ...seenA, authorityCounter: null }) === JSON.stringify({ ...seenB, authorityCounter: null });
            let result;
            if (scenario === 'save-save-same-key') result = classifySameKey({ commitsA: a.commits, commitsB: b.commits, finalCounter: seenA.counterA });
            else if (scenario === 'save-save-different-keys') result = classifyDifferentKeys({ commitsA: a.commits, commitsB: b.commits, finalA: seenA.counterA, finalB: seenA.counterB });
            else if (scenario === 'delete-intent') result = classifyDeleteIntents({ deletedA: a.deleted, deletedB: b.deleted, journal: seenA.journal, itemsA: seenA.itemsA, itemsB: seenA.itemsB });
            else if (CONTROL_SCENARIOS.includes(scenario)) result = classifyControl({ commits: a.commits, changedAt: b.changedAt });
            if (!converged) result.violations++;
            if (backend === 'indexeddb-authority' && !CONTROL_SCENARIOS.includes(scenario) &&
                (scenario === 'delete-intent' ? !a.deleted.length || !b.deleted.length :
                    !a.commits.some(c => c.ok) || !b.commits.some(c => c.ok))) result.inconclusive = true;
            if (backend === 'indexeddb-authority') {
                const integrity = await evaluate(primary, 'crossTab.integrity()');
                const committed = scenario === 'delete-intent' ? a.deleted.length+b.deleted.length :
                    a.commits.filter(c=>c.ok).length+(b.commits?.filter(c=>c.ok).length || 0);
                result.duplicateOperations = integrity.logs-integrity.unique;
                result.partialManifests = integrity.partial;
                if (integrity.seq!==committed+1 || integrity.logs!==integrity.seq || result.duplicateOperations || integrity.partial) result.violations++;
            }
            aggregate.rounds++;
            aggregate.violations += result.violations;
            if (result.inconclusive) aggregate.inconclusiveRounds++;
            aggregate.details.push({ ...result, converged });
        }
        report.results.push(aggregate);
        process.stderr.write(`${scenario} payload=${payload}: rounds=${aggregate.rounds} violations=${aggregate.violations}\n`);
    }
    if (backend === 'indexeddb-authority') {
        report.acceptanceCases = [];
        const record = name => report.acceptanceCases.push({ name, pass: true });
        const poll = async fn => { for (let i=0;i<200;i++) { if(await fn()) return; await new Promise(r=>setTimeout(r,25)); } throw Error('checkpoint timeout'); };
        const generation = randomUUID(), options = role => JSON.stringify({ scenario: 'save-save-different-keys', role, iterations: 10, generation });
        await evaluate(primary, `crossTab.prepare(${options('primary')})`);
        await evaluate(peer, `crossTab.prepare(${options('peer')})`);
        await evaluate(primary, "crossTab.preparePacket('tx-abort')");
        assert.equal((await evaluate(primary, "crossTab.abortPacket('tx-abort')")).ok, false);
        assert.equal((await evaluate(peer, "crossTab.lookup('tx-abort')")).result, null);
        assert.equal((await evaluate(peer, 'crossTab.snapshot()')).head.seq, 1); record('Repository native transaction abort: head / oplog unchanged');
        const packet = await evaluate(primary, "crossTab.preparePacket('response-loss')");
        // Observe the fact through the peer, deliberately discard the response.
        await send('Runtime.evaluate', { expression: "crossTab.commitPacket('response-loss'); 'dispatched'", returnByValue:true }, primary);
        let fact;
        await poll(async()=>{fact=await evaluate(peer,"crossTab.lookup('response-loss')");return !!fact.result;});
        await send('Target.closeTarget',{targetId:primaryTab.target});
        primaryTab=await openTab();primary=primaryTab.session;
        await evaluate(primary,`crossTab.claim(${JSON.stringify(token)})`);await evaluate(primary,`crossTab.prepare(${options('peer')})`);
        const retry=await evaluate(primary,`crossTab.retryPacket(${JSON.stringify(packet)})`);
        assert.equal(retry.replayed,true);assert.equal(retry.seq,fact.result.seq);record('Repository response loss / renderer reopen / hydrate / lookup / same-ID replay');
        const altered=structuredClone(packet);altered.changes['cruisePort.metronome']=JSON.stringify({...JSON.parse(altered.changes['cruisePort.metronome']),bpm:180});
        assert.equal((await evaluate(primary,`crossTab.retryPacket(${JSON.stringify(altered)})`)).reason,'operation-id-payload-conflict');record('same ID changed payload denied');
        const crashPacket=await evaluate(primary,"crossTab.preparePacket('terminated-before','cruisePort.metronome',{bpm:175})");
        await evaluate(peer,"crossTab.preparePacket('unrelated-during-crash','cruisePort.tuner',{thresholdDb:-75})");
        await send('Debugger.enable',{},primary);
        await send('Runtime.evaluate',{expression:"crossTab.armCrash();crossTab.commitPacket('terminated-before');'started'",returnByValue:true},primary);
        await poll(()=>paused.has(primary));await send('Target.closeTarget',{targetId:primaryTab.target});
        const terminationFact=(await evaluate(peer,"crossTab.lookup('terminated-before')")).result;
        const afterTermination=await evaluate(peer,'crossTab.snapshot()');
        assert.equal(afterTermination.head.seq,fact.result.seq+(terminationFact?1:0));
        assert.equal(afterTermination.values['cruisePort.metronome'],(terminationFact?crashPacket:packet).changes['cruisePort.metronome']);
        report.recordCallbackTermination=terminationFact?'committed-with-lost-response':'aborted';
        const merged=await evaluate(peer,"crossTab.commitPacket('unrelated-during-crash')");assert.equal(merged.ok,true);record('renderer termination has atomic committed/aborted outcome; interrupted different-key save succeeds');
        primaryTab=await openTab();primary=primaryTab.session;
        await evaluate(primary,`crossTab.claim(${JSON.stringify(token)})`);await evaluate(primary,`crossTab.prepare(${options('peer')})`);
        const resumed=await evaluate(primary,`crossTab.retryPacket(${JSON.stringify(crashPacket)})`);assert.equal(resumed.ok,true);
        assert.equal(JSON.parse((await evaluate(primary,'crossTab.snapshot()')).values['cruisePort.tuner']).thresholdDb,-75);
        assert.equal((await evaluate(primary,`crossTab.retryPacket(${JSON.stringify(crashPacket)})`)).replayed,true);record('uncommitted original request resumes after unrelated merge; retry once');
        const integrity=await evaluate(primary,'crossTab.integrity()');
        assert.equal(integrity.logs,integrity.unique);assert.equal(integrity.logs,integrity.seq);assert.equal(integrity.partial,0);
        report.integrity=integrity;record('oplog duplicate 0 / partial manifest 0 / head consistency');
        assert.equal(await evaluate(peer,'crossTab.upgrade()'),'versionchange');assert.equal(await evaluate(primary,'crossTab.status()'),'versionchange');
        assert.equal((await evaluate(primary,'crossTab.futureOpen()')).reason,'future-schema');record('Repository versionchange / disconnected old connection / future schema fail closed');
    }
    await evaluate(primary, 'crossTab.release()');
    await evaluate(peer, 'crossTab.release()');
    report.errors = errors; report.missing = missing; report.networkWrites = networkWrites;
    if (errors.length || missing.length || networkWrites.length) throw Error('application side effect/error');
} catch (error) {
    report.harnessError = String(error.stack || error);
}
report.verdict = verdict(mode, report.results);
if (report.harnessError) report.verdict.pass = false;
await writeJSONReport(report);
ws.close();
cleanup();
process.exit(report.harnessError ? 2 : report.verdict.pass ? 0 : 1);
