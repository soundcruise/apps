/* Disposable product-page regression: no Production credentials or writes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const origin = process.env.PORT_ORIGIN;
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

test('the current B Port is marked even when the legacy store retains A', async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const calls = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let accountCredential, devices;
    await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === origin) {
            if (url.pathname === '/__seed') return route.fulfill({ contentType: 'text/html', body:
                '<script src="/apps/shared/sync-account/sync-account-core.js"></script>' +
                '<script src="/apps/shared/sync-account/sync-account-db.js"></script>' +
                '<script src="/apps/shared/sync-account/multi-app-sync-db.js"></script>' });
            return route.continue();
        }
        if (url.hostname !== 'sound-cruise-sync.cruise-port-requests.workers.dev') return route.abort();
        const headers = { 'access-control-allow-origin': origin,
            'access-control-allow-methods': 'GET', 'access-control-allow-headers': 'authorization' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        calls.push([request.method(), url.pathname]);
        assert.equal(request.method(), 'GET');
        assert.equal(request.headers().authorization, `Bearer ${accountCredential}`);
        assert(['/v2/accounts/summary', '/v2/accounts/devices'].includes(url.pathname));
        return route.fulfill({ headers, json: url.pathname.endsWith('/devices')
            ? { ok: true, devices, appDevices: [] }
            : { ok: true, account: { id: B, state: 'active' }, memberships: [] } });
    });
    try {
        await page.goto(origin + '/__seed');
        const seeded = await page.evaluate(async ({ accountId, previousId }) => {
            const root = SoundCruiseSyncAccount, data = SoundCruiseMultiAppSync.dataStorage;
            const account = root.core.createAccountCredential();
            const old = root.core.createAppCredential().appDeviceCredential;
            const current = root.core.createAppCredential().appDeviceCredential;
            await root.storage.setAccount({ accountId, ...account });
            await data.createStore('port').setMeta('credential', old);
            await data.createStore('port', { accountId }).setMeta('credential', current);
            await data.createStore('port', { accountId: previousId }).putOutbox({
                operationId: 'old-account-pending', recordType: 'gear_item', recordId: 'old-only',
                payload: { name: 'Old Account item' }
            });
            return { accountCredential: account.accountCredential, accountDeviceId: account.accountDeviceId,
                oldPortId: old.split('.')[1], currentPortId: current.split('.')[1] };
        }, { accountId: B, previousId: A });
        accountCredential = seeded.accountCredential;
        devices = [
            { id: A, label: 'Old PC', isCurrent: false, isPortEnvironment: true, revokedAt: null,
                portAppDeviceIds: [seeded.oldPortId] },
            { id: seeded.accountDeviceId, label: 'Current PC', isCurrent: true,
                isPortEnvironment: true, revokedAt: null, portAppDeviceIds: [seeded.currentPortId] }
        ];
        await page.goto(origin + '/apps/cruise-port/#sync-center');
        await page.locator('#sync-center-account-status[data-sync-account-state=active]').waitFor();
        await page.getByRole('button', { name: 'Cruise Portの同期先2件を表示' }).first().click();
        const rows = page.locator('#sync-center-environment-details-port-account li');
        assert.match(await rows.nth(0).innerText(), /Old PC/);
        assert.equal(await rows.nth(0).locator('.sync-center-environment-current').count(), 0);
        assert.match(await rows.nth(1).innerText(), /Current PC[\s\S]*この端末/);
        assert.equal(await rows.nth(1).locator('.sync-center-environment-current').count(), 1);
        assert.equal(await page.locator('#sync-center-port-status-chip').getAttribute('data-sync-port-status'), 'unstarted');
        assert.match(await page.locator('#sync-center-port-status-detail').innerText(), /自動再開できる状態を確認できません/);
        assert.deepEqual(await page.evaluate(async ({ previousId, currentId }) => {
            const data = SoundCruiseMultiAppSync.dataStorage;
            return [await data.createStore('port', { accountId: previousId }).listOutbox(),
                await data.createStore('port', { accountId: currentId }).listOutbox()];
        }, { previousId: A, currentId: B }).then(([old, current]) => [old.length, current.length]), [1, 0]);
        assert(calls.some(([, path]) => path === '/v2/accounts/devices'));
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
    }
});
