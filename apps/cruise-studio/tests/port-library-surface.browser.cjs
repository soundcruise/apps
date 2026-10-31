/* Disposable same-origin Port UI acceptance. No real account or user data. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('Port Gear and My Apps use the owner UI and storage inside Studio', async () => {
    const url = process.env.STUDIO_URL;
    assert(url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/__cruise_preview/news**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"contractVersion":1,"items":[],"nextOffset":null}' }));
    await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await context.route('https://example.invalid/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Synthetic external app</title>' }));
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const active = () => page.evaluate(() => CruiseStudio.shellHost.getActiveWorkspace());
    const gear = () => page.frameLocator('#port-gear-surface iframe');
    const apps = () => page.frameLocator('#port-my-apps-surface iframe');
    const storage = key => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    const nav = id => page.locator(`.studio-nav [data-workspace="${id}"]`).click();
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!CruiseStudio.portGear && !!CruiseStudio.portMyApps);
        assert.equal(await page.evaluate(() => CruiseStudio.portDataHost.canWrite), false);

        await page.locator('[data-home-workspace="portGear"]').click();
        await gear().locator('#wishlist-view').waitFor({ state: 'visible' });
        assert.equal(await gear().locator('#gear-list-title-add').count(), 1);
        await gear().locator('#gear-list-title-add').click();
        await gear().locator('#gear-name').fill('QA Guitar');
        await gear().locator('#gear-category').selectOption('guitar');
        await gear().locator('#gear-status').selectOption('owned');
        await gear().locator('#gear-list-form button[type="submit"]').click();
        await gear().locator('.gear-card', { hasText: 'QA Guitar' }).waitFor();
        assert.equal((await storage('cruisePort.gearList')).items[0].name, 'QA Guitar');
        assert.equal((await storage('cruisePort.gearList')).version, 5);
        await gear().locator('[data-gear-columns="3"]').click();
        assert.equal(await page.evaluate(() => localStorage.getItem('cruisePort.gearGridColumns')), '3');
        const gearId = (await storage('cruisePort.gearList')).items[0].id;
        await gear().locator(`[data-gear-card-id="${gearId}"]`).click();
        await gear().locator('#gear-name').fill('QA Guitar Edited');
        await nav('home');
        await gear().locator('#gear-exit-dialog').waitFor({ state: 'visible' });
        assert.equal(await active(), 'portGear');
        await gear().locator('#gear-exit-continue').click();
        assert.equal(await active(), 'portGear');
        await nav('home');
        await gear().locator('#gear-exit-discard').click();
        await page.waitForFunction(() => CruiseStudio.shellHost.getActiveWorkspace() === 'home');
        assert.equal((await storage('cruisePort.gearList')).items[0].name, 'QA Guitar');

        await nav('portGear');
        await gear().locator(`[data-gear-card-id="${gearId}"]`).waitFor();
        await gear().locator(`[data-gear-menu-toggle="${gearId}"]`).click();
        page.once('dialog', dialog => dialog.accept());
        await gear().locator(`[data-gear-action="delete"][data-id="${gearId}"]`).click();
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('cruisePort.gearList')).items.length === 0);
        await nav('home');

        await page.locator('[data-home-workspace="portMyApps"]').click();
        await apps().locator('#my-apps-section').waitFor({ state: 'visible' });
        await apps().locator('#my-apps-add').click();
        await apps().locator('#my-apps-name').fill('QA App');
        await apps().locator('#my-apps-other-urls summary').click();
        await apps().locator('#my-apps-web-url').fill('https://example.invalid/qa');
        await apps().locator('#my-apps-icon-preset-open').click();
        const preset = apps().locator('.my-apps-preset-option[data-preset-key]').first();
        await preset.click();
        await apps().locator('#my-apps-submit').click();
        await apps().locator('.my-app-launch-card', { hasText: 'QA App' }).waitFor();
        let saved = await storage('cruisePort.myApps');
        assert.equal(saved.version, 7);
        assert.equal(saved.items[0].name, 'QA App');
        assert(saved.items[0].iconPresetKey);

        const popupPromise = page.waitForEvent('popup');
        await apps().locator('.my-app-launch-card', { hasText: 'QA App' }).click();
        const popup = await popupPromise;
        await popup.waitForURL('https://example.invalid/qa');
        assert.equal(new URL(popup.url()).hostname, 'example.invalid');
        assert.equal(await active(), 'portMyApps');
        await popup.close();
        await apps().locator('#my-apps-manage').click();
        await apps().locator('.my-app-edit-button').click();
        await apps().locator('#my-apps-name').fill('QA App Edited');
        await apps().locator('#my-apps-submit').click();
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('cruisePort.myApps')).items[0].name === 'QA App Edited');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await nav('portMyApps');
        await apps().locator('.my-app-launch-card', { hasText: 'QA App Edited' }).waitFor();
        assert.equal((await storage('cruisePort.myApps')).items[0].iconPresetKey, saved.items[0].iconPresetKey);
        await apps().locator('#my-apps-manage').click();
        await apps().locator('.my-app-edit-button').click();
        page.once('dialog', dialog => dialog.accept());
        await apps().locator('#my-apps-delete').click();
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('cruisePort.myApps')).items.length === 0);
        await apps().locator('#my-apps-manage-view [data-action="my-apps-home"]').click();
        await apps().locator('#my-apps-section').waitFor({ state: 'visible' });

        for (const theme of ['dark', 'charcoal', 'gray', 'light']) {
            await page.evaluate(theme => CruiseStudio.colorTheme.setColorTheme(theme), theme);
            for (const width of [390, 1440]) {
                await page.setViewportSize({ width, height: 900 });
                assert.equal(await page.locator('#screen-port-my-apps').isVisible(), true);
                assert.equal(await apps().locator('#my-apps-section').isVisible(), true);
            }
        }
        await nav('sheetCruise');
        assert.equal(await page.evaluate(() => CruiseStudio.portMyApps.getState().hasFrame), false);
        assert.equal(await page.locator('#screen-sheet-cruise').isVisible(), true);
        await nav('portGear');
        await gear().locator('#wishlist-view').waitFor({ state: 'visible' });
        await page.locator('#shell-audio-stop').click();
        assert.equal(await page.evaluate(() => CruiseStudio.portGear.getState().hasFrame), false);
        await page.locator('#port-gear-resume').click();
        await gear().locator('#wishlist-view').waitFor({ state: 'visible' });
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
        assert.equal(await page.evaluate(() => CruiseStudio.portGear.getState().hasFrame), false);
        await nav('portMyApps');
        await apps().locator('#my-apps-section').waitFor({ state: 'visible' });
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
        assert.equal(await page.evaluate(() => CruiseStudio.portMyApps.getState().hasFrame), false);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
});

test('synthetic existing photo and icon bodies survive reload and Port deletion removes their references', async () => {
    const url = process.env.STUDIO_URL;
    assert(url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/__cruise_preview/news**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"contractVersion":1,"items":[],"nextOffset":null}' }));
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.evaluate(async () => {
            const date = '2026-10-31T00:00:00.000Z';
            localStorage.setItem('cruisePort.gearCategories', JSON.stringify({ version: 1, categories: [{ id: 'guitar', name: 'ギター' }] }));
            localStorage.setItem('cruisePort.gearList', JSON.stringify({ version: 5, items: [{ id: 'photo-gear', name: 'Photo Gear', manufacturer: '', status: 'owned', order: 0, category: 'guitar', priceText: '', priority: 'medium', memo: '', photoId: 'photo-final', photoSourceId: 'photo-source', photoCrop: { x: 0, y: 0, size: 1 }, createdAt: date, updatedAt: date, ownedAt: date, soldAt: null }] }));
            localStorage.setItem('cruisePort.myApps', JSON.stringify({ version: 7, items: [{ id: 'icon-app', name: 'Icon App', url: 'https://example.invalid/icon', urls: { ios: '', android: '', macos: '', windows: '', web: 'https://example.invalid/icon' }, launchMode: 'https', appKey: null, customLaunch: null, iconId: 'icon-final', iconSourceId: 'icon-source', iconCrop: { x: 0, y: 0, size: 1 }, iconPresetKey: null, createdAt: date, updatedAt: date }] }));
            const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'image/png' });
            async function seed(dbName, storeName, records) {
                await new Promise((resolve, reject) => {
                    const request = indexedDB.open(dbName, 1);
                    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'id' });
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => {
                        const db = request.result, tx = db.transaction(storeName, 'readwrite'), store = tx.objectStore(storeName);
                        records.forEach(record => store.put(record));
                        tx.oncomplete = () => { db.close(); resolve(); };
                        tx.onerror = () => { db.close(); reject(tx.error); };
                    };
                });
            }
            await seed('cruisePortGear', 'photos', ['photo-final', 'photo-source'].map((id, i) => ({ id, kind: i ? 'source' : 'final', blob, mimeType: 'image/png', byteSize: blob.size, width: 1, height: 1, createdAt: date })));
            await seed('cruisePortMyApps', 'icons', ['icon-final', 'icon-source'].map(id => ({ id, blob, mimeType: 'image/png', byteSize: blob.size, createdAt: date })));
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('[data-home-workspace="portGear"]').click();
        const gear = page.frameLocator('#port-gear-surface iframe');
        await gear.locator('[data-gear-card-id="photo-gear"]').waitFor();
        await page.waitForFunction(() => document.querySelector('#port-gear-surface iframe')?.contentDocument?.querySelector('[data-gear-card-id="photo-gear"] img')?.naturalWidth === 1);
        await gear.locator('[data-gear-menu-toggle="photo-gear"]').click();
        page.once('dialog', dialog => dialog.accept());
        await gear.locator('[data-gear-action="delete"][data-id="photo-gear"]').click();
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('cruisePort.gearList')).items.length === 0);
        await page.locator('.studio-nav [data-workspace="portMyApps"]').click();
        const apps = page.frameLocator('#port-my-apps-surface iframe');
        await apps.locator('.my-app-launch-card', { hasText: 'Icon App' }).waitFor();
        await page.waitForFunction(() => document.querySelector('#port-my-apps-surface iframe')?.contentDocument?.querySelector('.my-app-launch-card img')?.naturalWidth === 1);
        await apps.locator('#my-apps-manage').click();
        await apps.locator('.my-app-edit-button').click();
        page.once('dialog', dialog => dialog.accept());
        await apps.locator('#my-apps-delete').click();
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('cruisePort.myApps')).items.length === 0);
        const remainingBodies = await page.evaluate(async () => {
            async function read(dbName, storeName, ids) {
                return new Promise((resolve, reject) => {
                    const request = indexedDB.open(dbName, 1);
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => {
                        const db = request.result, tx = db.transaction(storeName, 'readonly');
                        Promise.all(ids.map(id => new Promise((done, fail) => {
                            const item = tx.objectStore(storeName).get(id);
                            item.onsuccess = () => done(!!item.result);
                            item.onerror = () => fail(item.error);
                        }))).then(values => { db.close(); resolve(values); }, reject);
                    };
                });
            }
            return [
                ...await read('cruisePortGear', 'photos', ['photo-final', 'photo-source']),
                ...await read('cruisePortMyApps', 'icons', ['icon-final', 'icon-source'])
            ];
        });
        assert.deepEqual(remainingBodies, [false, false, false, false]);
        assert.equal(await page.evaluate(() => CruiseStudio.portDataHost.canWrite), false);
    } finally { await browser.close(); }
});

test('Port Standard limits and Pro image prompts stay owned by Port', async () => {
    const url = process.env.STUDIO_URL;
    assert(url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/__cruise_preview/news**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"contractVersion":1,"items":[],"nextOffset":null}' }));
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.locator('[data-home-workspace="portMyApps"]').click();
        const apps = page.frameLocator('#port-my-apps-surface iframe');
        await page.waitForFunction(() => document.querySelector('#port-my-apps-surface iframe')?.contentDocument?.querySelector('#my-apps-add')?.disabled === false);
        await apps.locator('#my-apps-add').click();
        await apps.locator('#my-apps-form-view').waitFor({ state: 'visible' });
        await apps.locator('.my-apps-icon-select').click();
        await apps.locator('.port-pro-prompt').waitFor({ state: 'visible' });
        assert.match(await apps.locator('.port-pro-prompt p').innerText(), /カスタムアイコン/);
        await apps.locator('.port-pro-prompt button').click();
        for (let index = 0; index < 5; index++) {
            if (index) await apps.locator('#my-apps-add').click();
            await apps.locator('#my-apps-name').fill(`Standard App ${index}`);
            if (!await apps.locator('#my-apps-web-url').isVisible()) await apps.locator('#my-apps-other-urls summary').click();
            await apps.locator('#my-apps-web-url').fill(`https://example.invalid/app-${index}`);
            await apps.locator('#my-apps-submit').click();
            await apps.locator('.my-app-launch-card', { hasText: `Standard App ${index}` }).waitFor();
        }
        await apps.locator('#my-apps-add').click();
        await apps.locator('.port-pro-prompt').waitFor({ state: 'visible' });
        assert.match(await apps.locator('.port-pro-prompt p').innerText(), /5件/);
        assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('cruisePort.myApps')))).items.length, 5);
        await apps.locator('.port-pro-prompt button').click();
        await page.locator('.studio-nav [data-workspace="portGear"]').click();
        const gear = page.frameLocator('#port-gear-surface iframe');
        await gear.locator('#gear-list-title-add').click();
        await gear.locator('#gear-photo-select-label').click();
        await gear.locator('.port-pro-prompt').waitFor({ state: 'visible' });
        assert.match(await gear.locator('.port-pro-prompt p').innerText(), /機材写真/);
        await gear.locator('.port-pro-prompt a[href="#pro-access"]').click();
        await gear.locator('#pro-access-view').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => CruiseStudio.shellHost.getActiveWorkspace()), 'portGear');
        assert.equal(await page.evaluate(() => CruiseStudio.portDataHost.canWrite), false);
    } finally { await browser.close(); }
});

test('Port category, order and Home display size persist through Studio routes', async () => {
    const url = process.env.STUDIO_URL;
    assert(url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
    const { libraryFixture } = await import('./library-fixture.mjs');
    const fixture = libraryFixture();
    fixture['cruisePort.gearList'].items = fixture['cruisePort.gearList'].items.slice(0, 2).map((item, index) => ({ ...item, order: index, photoId: null, photoSourceId: null, photoCrop: null }));
    fixture['cruisePort.myApps'].items = fixture['cruisePort.myApps'].items.slice(0, 2).map(item => ({ ...item, iconId: null, iconSourceId: null, iconCrop: null }));
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/__cruise_preview/news**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"contractVersion":1,"items":[],"nextOffset":null}' }));
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.evaluate(fixture => { for (const key of ['cruisePort.gearList', 'cruisePort.gearCategories', 'cruisePort.myApps']) localStorage.setItem(key, JSON.stringify(fixture[key])); }, fixture);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('[data-home-workspace="portGear"]').click();
        const gear = page.frameLocator('#port-gear-surface iframe');
        await gear.locator('.gear-card').first().waitFor({ state: 'visible' });
        await gear.locator('#gear-owned-tab').click();
        await gear.locator('.gear-reorder-start').click();
        await gear.locator('.gear-card--reorder [data-direction="-1"]').last().click();
        await gear.locator('#gear-reorder-complete').click();
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('cruisePort.gearList')).items.find(i => i.id === 'g2').order === 0);
        await gear.locator('#gear-category-menu-toggle').click();
        await gear.locator('#gear-category-add').click();
        await gear.locator('#gear-category-name').fill('QA Category');
        await gear.locator('#gear-category-form button[type="submit"]').click();
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('cruisePort.gearCategories')).categories.some(c => c.name === 'QA Category'));

        await page.locator('.studio-nav [data-workspace="portMyApps"]').click();
        const apps = page.frameLocator('#port-my-apps-surface iframe');
        await apps.locator('#my-apps-manage').click();
        await apps.locator('#my-apps-reorder-start').click();
        await apps.locator('.my-apps-reorder-card [data-direction="-1"]').last().click();
        await apps.locator('#my-apps-reorder-complete').click();
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('cruisePort.myApps')).items[0].id === 'preset');
        await page.locator('#port-my-apps-settings').click();
        await apps.locator('[data-display-size="small"]').click();
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('cruisePort.settings') || 'null')?.displaySize === 'small');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('[data-home-workspace="portMyApps"]').click();
        await apps.locator('#my-apps-section').waitFor({ state: 'visible' });
        assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('cruisePort.myApps')))).items[0].id, 'preset');
        assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('cruisePort.settings')))).displaySize, 'small');
    } finally { await browser.close(); }
});
