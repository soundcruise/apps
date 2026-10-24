// Uses a disposable browser context and an explicitly supplied isolated server.
// Never falls back to an existing user server or production endpoint.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.ACCOUNT_COORDINATION_BASE_URL;
if (!base || !/^http:\/\/127\.0\.0\.1:\d+\/$/.test(base) || /:(8765|8766)\/$/.test(base)) throw Error('isolated-loopback-server-required');
const url = base + 'apps/cruise-port/tests/account-coordination-fixture.html';
const results = [];
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
    try {
        for (const scenario of ['crash-before-accept', 'crash-after-intent', 'crash-after-CAS', 'confirmed-reopen', 'two-tabs']) {
            const context = await browser.newContext({ serviceWorkers: 'block' });
            const errors = [], requests = [];
            await context.addInitScript(() => { window.BroadcastChannel = class { postMessage() {} close() {} }; });
            await context.route('**/*', route => {
                const request = route.request();
                if (request.url() === base + 'favicon.ico') return route.fulfill({ status: 204, body: '' });
                if (!request.url().startsWith(base) || request.method() !== 'GET') {
                    requests.push({ url: request.url(), method: request.method() }); return route.abort();
                }
                return route.continue();
            });
            const first = await context.newPage(), second = await context.newPage();
            for (const page of [first, second]) {
                page.on('pageerror', error => errors.push(error.message));
                page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
                page.on('response', response => { if (response.status() >= 400) errors.push('HTTP ' + response.status() + ' ' + response.url()); });
                await page.goto(url); await page.waitForFunction(() => window.accountFixture);
            }
            const name = 'sound-cruise-port-authority-v1-fixture-native-' + scenario;
            assert.equal((await first.evaluate(options => accountFixture.init(options), { name, seed: true })).observed, true);
            assert.equal((await second.evaluate(options => accountFixture.init(options), { name })).observed, true);
            await first.evaluate(() => accountFixture.prepare());
            await second.evaluate(() => accountFixture.prepare());
            if (scenario === 'crash-before-accept') {
                await first.evaluate(() => accountFixture.abortIntent());
                assert.equal((await first.evaluate(() => accountFixture.transition('B'))).ok, false);
                assert.equal((await second.evaluate(() => accountFixture.intents())).intents.length, 0);
                assert.equal((await second.evaluate(() => accountFixture.current())).snapshot.control.identityInvalidated, false);
                await first.close();
                assert.equal((await second.evaluate(() => accountFixture.commit())).ok, true);
                assert.equal(await second.evaluate(() => accountFixture.readAccount()), 'A');
            } else if (scenario === 'crash-after-intent' || scenario === 'crash-after-CAS') {
                await first.evaluate(after => { after ? accountFixture.afterCas() : accountFixture.gate();
                    window.pendingAccountTransition = accountFixture.transition('B'); }, scenario === 'crash-after-CAS');
                await first.waitForFunction(() => accountFixture.entered());
                const facts = await second.evaluate(() => accountFixture.intents());
                assert.equal(facts.intents.length, 1); assert.equal(facts.recoveryRequired, true);
                assert.equal((await second.evaluate(() => accountFixture.current())).snapshot.control.identityInvalidated, true);
                assert.equal((await second.evaluate(() => accountFixture.commit())).ok, false);
                assert.equal(await second.evaluate(() => accountFixture.readAccount()), scenario === 'crash-after-CAS' ? 'B' : 'A');
                await first.close(); // actual renderer teardown; no cooperative cleanup
                await second.evaluate(() => accountFixture.close());
                await second.reload(); await second.waitForFunction(() => window.accountFixture);
                const recovered = await second.evaluate(options => accountFixture.init(options), { name });
                assert.equal(recovered.observed, false); assert.equal(recovered.status.state, 'recovery-required');
                assert.equal((await second.evaluate(() => accountFixture.intents())).recoveryRequired, true);
                assert.equal(await second.evaluate(() => accountFixture.readAccount()), scenario === 'crash-after-CAS' ? 'B' : 'A');
            } else if (scenario === 'confirmed-reopen') {
                assert.equal((await first.evaluate(() => accountFixture.transition('B'))).ok, true);
                assert.equal((await second.evaluate(() => accountFixture.intents())).intents[0].accountTransition.phase, 'account-confirmed');
                await first.close(); await second.evaluate(() => accountFixture.close());
                await second.reload(); await second.waitForFunction(() => window.accountFixture);
                const recovered = await second.evaluate(options => accountFixture.init(options), { name });
                assert.equal(recovered.observed, false);
                assert.equal((await second.evaluate(() => accountFixture.current())).snapshot.control.identityInvalidated, true);
                assert.equal(await second.evaluate(() => accountFixture.readAccount()), 'B');
            } else {
                const outcome = await Promise.all([
                    first.evaluate(() => accountFixture.transition('B')),
                    second.evaluate(() => accountFixture.transition('C'))
                ]);
                assert.equal(outcome.filter(result => result.ok).length, 1);
                assert.equal(outcome.filter(result => result.reason === 'account-context-stale').length, 1);
                assert(['B', 'C'].includes(await first.evaluate(() => accountFixture.readAccount())));
                assert.equal((await first.evaluate(() => accountFixture.intents())).intents.length, 1);
                assert.equal((await first.evaluate(() => accountFixture.current())).snapshot.control.identityInvalidated, true);
            }
            assert.deepEqual(errors, []); assert.deepEqual(requests, []);
            results.push({ scenario, pass: true, notifications: 'dropped', nativeIndexedDB: true,
                pageErrors: errors.length, unexpectedNetwork: requests.length });
            await context.close();
        }
        process.stdout.write(JSON.stringify({ pass: true, cases: results.length, results }, null, 2) + '\n');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
