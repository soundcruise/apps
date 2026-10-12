// L1 cross-tab race driver: real Chrome, two tabs in separate windows (separate
// renderer processes under default site isolation), one loopback origin, native
// Web Locks and localStorage, the real PortDatasetRepository / dormant Authority.
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
import { fileURLToPath } from 'node:url';
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

// The IndexedDB Authority backend arrives in L2; until then acceptance must fail closed.
if (backend === 'indexeddb-authority') {
    const results = scenarios.flatMap(scenario => payloads.map(payload => ({ scenario, payload, status: 'backend-unavailable' })));
    const v = verdict(mode, results);
    console.log(JSON.stringify({ mode, backend, results, verdict: v }, null, 1));
    process.exit(v.pass ? 0 : 1);
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
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
    '--no-first-run', '--no-default-browser-check', '--site-per-process', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch {} server.close(); try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);

const portFile = join(profile, 'DevToolsActivePort');
for (let i = 0; i < 150 && !existsSync(portFile); i++) await new Promise(r => setTimeout(r, 100));
const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');
const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
await new Promise((ok, fail) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', fail, { once: true }); });
let nextId = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}, sessionId) => new Promise(r => { const id = ++nextId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params, sessionId })); });

async function evaluate(session, expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 300000 }, session);
    if (r.error || r.result?.exceptionDetails) throw Error(JSON.stringify(r.error || r.result.exceptionDetails).slice(0, 500));
    return r.result.result.value;
}
async function openTab() {
    const target = await send('Target.createTarget', { url: `${origin}/apps/cruise-port/tests/cross-tab/cross-tab-fixture.html`, newWindow: true });
    const { result } = await send('Target.attachToTarget', { targetId: target.result.targetId, flatten: true });
    for (let i = 0; i < 100; i++) {
        try { if (await evaluate(result.sessionId, 'typeof crossTab') === 'object') return result.sessionId; } catch {}
        await new Promise(r => setTimeout(r, 100));
    }
    throw Error('fixture did not load');
}

const report = { mode, backend, origin: 'loopback', profile: 'throwaway', chrome: null, rounds, iterations, payloads, results: [] };
try {
    report.chrome = (await send('Browser.getVersion')).result?.product || null;
    const primary = await openTab(), peer = await openTab();
    const token = randomUUID();
    await evaluate(primary, `crossTab.claim(${JSON.stringify(token)})`);
    await evaluate(peer, `crossTab.claim(${JSON.stringify(token)})`);
    const info = await send('SystemInfo.getProcessInfo');
    report.rendererProcesses = (info.result?.processInfo || []).filter(p => p.type === 'renderer').length;
    for (const scenario of scenarios) for (const payload of payloads) {
        const aggregate = { scenario, payload, rounds: 0, violations: 0, inconclusiveRounds: 0, details: [] };
        for (let round = 0; round < rounds; round++) {
            const opts = role => JSON.stringify({ scenario, role, iterations, payload });
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
            aggregate.rounds++;
            aggregate.violations += result.violations;
            if (result.inconclusive) aggregate.inconclusiveRounds++;
            aggregate.details.push({ ...result, converged });
        }
        report.results.push(aggregate);
    }
    await evaluate(primary, 'crossTab.release()');
} catch (error) {
    report.harnessError = String(error.stack || error);
}
report.verdict = verdict(mode, report.results);
console.log(JSON.stringify(report, null, 1));
ws.close();
cleanup();
process.exit(report.harnessError ? 2 : report.verdict.pass ? 0 : 1);
