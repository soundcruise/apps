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
        for (const scenario of ['stop-before-save', 'save-before-stop', 'cas-gap-B', 'failed-account-reopen', 'two-tabs']) {
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
            if (scenario === 'stop-before-save') {
                assert.equal((await second.evaluate(() => accountFixture.transition('B'))).ok, true);
                assert.equal((await first.evaluate(() => accountFixture.commit())).ok, false);
                assert.equal(await first.evaluate(() => accountFixture.readAccount()), 'B');
            } else if (scenario === 'save-before-stop') {
                assert.equal((await first.evaluate(() => accountFixture.commit())).ok, true);
                assert.equal((await second.evaluate(() => accountFixture.transition(null))).ok, true);
                const current = await second.evaluate(() => accountFixture.current());
                assert.equal(JSON.parse(current.snapshot.values['cruisePort.metronome']).bpm, 145);
                assert.equal(current.snapshot.control.identityInvalidated, true);
            } else if (scenario === 'cas-gap-B') {
                await first.evaluate(() => { accountFixture.gate(); window.pendingAccountTransition = accountFixture.transition(null); });
                await first.waitForFunction(() => accountFixture.entered());
                assert.equal((await second.evaluate(() => accountFixture.current())).snapshot.control.identityInvalidated, true);
                await second.evaluate(() => accountFixture.setAccount('B'));
                await first.evaluate(() => accountFixture.release());
                const result = await first.evaluate(() => window.pendingAccountTransition);
                assert.equal(result.ok, false); assert.equal(result.stopped, true);
                assert.equal(await first.evaluate(() => accountFixture.readAccount()), 'B');
                assert.equal((await first.evaluate(() => accountFixture.commit())).ok, false);
            } else if (scenario === 'failed-account-reopen') {
                await first.evaluate(() => accountFixture.abortAccount());
                const result = await first.evaluate(() => accountFixture.transition('B'));
                assert.equal(result.ok, false); assert.equal(result.stopped, true);
                assert.equal(await first.evaluate(() => accountFixture.readAccount()), 'A');
                await first.evaluate(() => accountFixture.close());
                await first.reload(); await first.waitForFunction(() => window.accountFixture);
                const reopened = await first.evaluate(options => accountFixture.init(options), { name });
                assert.equal(reopened.observed, false); assert.equal(reopened.status.state, 'recovery-required');
                assert.equal((await second.evaluate(() => accountFixture.commit())).ok, false);
            } else {
                const outcome = await Promise.all([
                    first.evaluate(() => accountFixture.transition('B')),
                    second.evaluate(() => accountFixture.transition('C'))
                ]);
                assert.equal(outcome.filter(result => result.ok).length, 1);
                assert.equal(outcome.filter(result => result.reason === 'account-context-stale').length, 1);
                assert(['B', 'C'].includes(await first.evaluate(() => accountFixture.readAccount())));
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
