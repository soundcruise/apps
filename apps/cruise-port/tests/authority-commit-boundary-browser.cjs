// Native Chrome Web Locks + shared localStorage. Isolated loopback fixture only.
const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs');
const origin = process.argv[2] || 'http://127.0.0.1:8766';
(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const result = { cases: [], errors: [], missing: [], external: [] };
    const setup = async (page, fresh) => page.evaluate(async fresh => {
        const F = await import('./migration-fixture.mjs'), M = await import('../port-authority-migration.mjs');
        window.M = M;
        if (fresh) for (const [key, value] of Object.entries(F.cleanValues())) localStorage.setItem(key, value);
        window.f = await F.migrationFixture({ bound: true, storage: localStorage, locks: navigator.locks });
        window.e = f.engine();
        if (fresh) { const s = await F.sealed(f); window.e = s.e; window.qaFence = s.fence; await e.publish({ fence: qaFence }); }
        else window.qaFence = f.fence(f.cloud(await f.capture()));
        window.r = await e.activeRepository({ fence: qaFence });
        window.base = r.inspect();
    }, fresh);
    const context = async () => {
        const ctx = await browser.newContext();
        await ctx.route('**/*', route => {
            if (new URL(route.request().url()).origin === origin) return route.continue();
            result.external.push(route.request().url()); return route.abort();
        });
        for (const p of [await ctx.newPage(), await ctx.newPage()]) {
            p.on('pageerror', e => result.errors.push(e.message));
            p.on('console', m => { if (m.type() === 'error') result.errors.push(m.text()); });
            p.on('response', r => { if (r.status() === 404) result.missing.push(r.url()); });
            await p.goto(origin + '/apps/cruise-port/tests/migration-browser-fixture.html');
        }
        return ctx;
    };
    try {
        for (const kind of ['save', 'suspend', 'fence', 'account', 'account-generation', 'membership-generation']) {
            const ctx = await context(), [a, b] = ctx.pages();
            try {
                await setup(a, true); await setup(b, false);
                await a.evaluate(() => {
                    let resume; const wait = new Promise(resolve => { resume = resolve; }); window.release = resume; window.entered = false;
                    let checks = 0;
                    window.saving = r.runWrite({ expectedRevision: base.revision, operationId: 'native-operation',
                        assertCurrent: async () => { if (++checks === 2) { window.entered = true; await wait; } } }, draft => {
                        const key = 'cruisePort.metronome'; draft.setItem(key, JSON.stringify({ ...JSON.parse(draft.getItem(key)), bpm: 166 })); return { ok: true };
                    });
                });
                await a.waitForFunction(() => entered);
                await b.evaluate(async kind => {
                    if (kind === 'save') { const result = await r.runWrite({ expectedRevision: base.revision }, d => {
                        const key = 'cruisePort.metronome'; d.setItem(key, JSON.stringify({ ...JSON.parse(d.getItem(key)), bpm: 177 })); return { ok: true };
                    }); if (!result.ok) throw Error(JSON.stringify(result)); }
                    else if (kind === 'suspend') await e.suspendWrites();
                    else if (kind === 'fence') await M.revokeIsolatedFence(qaFence);
                    else { const next = { ...f.state.identity }; if (kind === 'account') next.accountId = 'B';
                        else next[kind === 'account-generation' ? 'accountGeneration' : 'membershipGeneration']++;
                        await M.changeIsolatedIdentity(f.scope, next); }
                }, kind);
                const facts = await a.evaluate(async () => { release(); const outcome = await saving; return { outcome, state: r.inspect(), base }; });
                assert.equal(facts.outcome.ok, false);
                assert.equal(facts.outcome.operationId, 'native-operation');
                if (kind !== 'save') assert.equal(facts.state.revision, facts.base.revision);
                assert.equal(JSON.parse(facts.state.values['cruisePort.metronome']).bpm, kind === 'save' ? 177 : JSON.parse(facts.base.values['cruisePort.metronome']).bpm);
                result.cases.push('native two-tab save/' + kind);
                // A recreated context must observe the persistent invalidation, not a delayed storage event cache.
                if (!['save'].includes(kind)) {
                    await a.reload(); await setup(a, false);
                    const retry = await a.evaluate(() => r.runWrite({ expectedRevision: base.revision }, () => ({ ok: true })));
                    assert.equal(retry.ok, false); result.cases.push('reload observes ' + kind);
                }
            } finally { await ctx.close(); }
        }
        // Exact grant order: queued invalidation wins the same native lock.
        const ctx = await context(), [a, b] = ctx.pages();
        try {
            await setup(a, true); await setup(b, false);
            await a.evaluate(() => {
                window.lockEntered = false;
                window.held = navigator.locks.request(r.lockName, { mode: 'exclusive' }, async () => {
                    window.lockEntered = true; await new Promise(resolve => { window.unlock = resolve; });
                });
            });
            await a.waitForFunction(() => lockEntered);
            await b.evaluate(() => { window.stopping = e.suspendWrites(); });
            await b.waitForFunction(async () => (await navigator.locks.query()).pending.some(l => l.name === r.lockName));
            await a.evaluate(() => { window.saving = r.runWrite({ expectedRevision: base.revision }, d => {
                const key = 'cruisePort.metronome'; d.setItem(key, JSON.stringify({ ...JSON.parse(d.getItem(key)), bpm: 188 })); return { ok: true };
            }); unlock(); });
            await b.evaluate(() => stopping);
            assert.equal((await a.evaluate(() => saving)).ok, false);
            result.cases.push('native queued stop wins grant order');
        } finally { await ctx.close(); }
        assert.deepEqual(result.errors, []); assert.deepEqual(result.missing, []); assert.deepEqual(result.external, []);
        result.result = 'PASS';
    } catch (e) { result.result = 'FAIL'; result.failure = e.stack; process.exitCode = 1; }
    finally { fs.writeFileSync('/private/tmp/local-authority-browser.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
