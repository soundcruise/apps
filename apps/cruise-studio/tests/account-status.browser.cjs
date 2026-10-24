// Disposable loopback only. The second renderer seeds synthetic Account records;
// the Studio renderer stays readonly and never submits credentials to a server.
const test = require('node:test'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const url = process.env.STUDIO_URL;
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw Error('isolated STUDIO_URL required');
test('Account readonly status uses local observations without promoting authorization', async t => {
    const origin = new URL(url).origin, errors = [], missing = [], external = [];
    const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
        await context.route('**/*', route => {
            const request = route.request(), target = new URL(request.url());
            if (target.hostname === 'fonts.googleapis.com') return route.fulfill({ body: '', contentType: 'text/css' });
            if (target.origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue();
            external.push(request.method() + ' ' + target.href); return route.abort();
        });
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('response', response => { if (response.status() === 404) missing.push(response.url()); });
        await page.addInitScript(() => {
            window.__accountReadonly = { opens: 0, mutations: 0, portWrites: [] };
            const open = indexedDB.open.bind(indexedDB);
            indexedDB.open = (...args) => { __accountReadonly.opens++; return open(...args); };
            for (const method of ['put', 'add', 'delete', 'clear']) {
                const original = IDBObjectStore.prototype[method];
                IDBObjectStore.prototype[method] = function (...args) { __accountReadonly.mutations++; return original.apply(this, args); };
            }
            for (const method of ['setItem', 'removeItem', 'clear']) {
                const original = Storage.prototype[method];
                Storage.prototype[method] = function (key, ...args) {
                    if (method === 'clear' || /^(cruisePort\.|soundCruise|sound-cruise)/.test(key)) __accountReadonly.portWrites.push({ method, key });
                    return original.call(this, key, ...args);
                };
            }
        });
        await page.goto(url); await page.waitForFunction(() => !!CruiseStudio.portDataHost);
        await t.test('cold cache and status display create no DB or authorization', async () => {
            assert.deepEqual(await page.evaluate(() => __accountReadonly), { opens: 0, mutations: 0, portWrites: [] });
            await page.click('#shell-tool');
            assert.match(await page.locator('[data-port-account-detail]').innerText(), /読み取り専用/);
            assert.equal(await page.evaluate(() => CruiseStudio.portDataHost.canWrite), false);
        });
        await t.test('explicit absent Account inspection does not create a database', async () => {
            await page.click('#studio-port-read');
            await page.waitForFunction(() => CruiseStudio.portDataHost.getCachedStatus().account === 'no-account-known');
            assert.deepEqual(await page.evaluate(() => indexedDB.databases()), []);
            assert.match(await page.locator('[data-port-account-detail]').innerText(), /世代は未確認/);
        });
        const writer = await context.newPage(); await writer.goto(url);
        const change = async letter => {
            const id = letter.repeat(8) + '-' + letter.repeat(4) + '-4' + letter.repeat(3) + '-8' + letter.repeat(3) + '-' + letter.repeat(12);
            await writer.evaluate(async accountId => {
                await import('/apps/shared/sync-account/sync-account-db.js');
                await SoundCruiseSyncAccount.storage.setAccount({ accountId, accountDeviceId: accountId, accountCredential: 'isolated-status-fixture-' + accountId });
            }, id);
            await page.waitForFunction(id => CruiseStudio.portDataHost.getCachedStatus().accountId === id, id);
            return id;
        };
        await t.test('second renderer A then B observations retain readonly and unknown server generations', async () => {
            await change('a'); const b = await change('b');
            const value = await page.evaluate(async () => {
                const { describeAccountObservation } = await import('/apps/cruise-studio/js/port-data/account-status-projection.mjs');
                return describeAccountObservation(CruiseStudio.portDataHost.getCachedStatus());
            });
            assert.equal(value.authorizationConfirmed, false); assert.equal(value.canWrite, false);
            assert.equal(value.serverAccountGeneration, null); assert.equal(value.serverMembershipGeneration, null);
            assert.match(await page.locator('[data-port-account]').innerText(), /保存済みAccount/);
            assert.equal(await writer.evaluate(() => SoundCruiseSyncAccount.storage.getAccount().then(a => a.accountId)), b);
        });
        await t.test('four themes preserve account detail and reader has no storage/network mutations', async () => {
            for (const theme of ['dark', 'charcoal', 'gray', 'light']) {
                await page.evaluate(theme => CruiseStudio.colorTheme.setColorTheme(theme), theme);
                assert(await page.locator('[data-port-account-detail]').isVisible());
            }
            const io = await page.evaluate(() => __accountReadonly);
            assert.equal(io.mutations, 0); assert.deepEqual(io.portWrites, []);
            assert.deepEqual(errors, []); assert.deepEqual(missing, []); assert.deepEqual(external, []);
            assert.equal(await page.evaluate(() => CruiseStudio.portDataHost.canWrite), false);
        });
        await context.close();
    } finally { await browser.close(); }
});
