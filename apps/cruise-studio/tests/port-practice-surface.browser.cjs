/* Port's own Standard practice UI in a disposable same-origin Studio frame. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const url = process.env.STUDIO_URL;

test('Studio uses Port practice and calendar with Port-owned storage', async t => {
    assert(url && ['localhost', '127.0.0.1'].includes(new URL(url).hostname));
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/__cruise_preview/news**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contractVersion: 1, items: [], nextOffset: null }) }));
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const frame = () => page.frameLocator('#screen-port-practice iframe');
    const open = async () => {
        await page.locator('[data-home-workspace="portPractice"]').click();
        await frame().locator('#practice-list-view').waitFor({ state: 'visible' });
    };
    const add = async name => {
        await frame().locator('#practice-menu-add').click();
        await frame().locator('#practice-form-view').waitFor({ state: 'visible' });
        assert.equal(await frame().locator('#practice-form-attachments').isVisible(), true);
        assert.match(await frame().locator('#practice-form-attachments .practice-attachment-add').getAttribute('class'), /tool-pro-locked/);
        await frame().locator('#practice-name-preset').selectOption('custom');
        await frame().locator('#practice-name').fill(name);
        await frame().locator('#practice-duration').fill('12');
        await frame().locator('#practice-menu-form button[type=submit]').click();
        await page.waitForFunction(name => JSON.parse(localStorage.getItem('cruisePort.practiceMenus') || '{}').items?.some(item => item.name === name), name);
    };
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await t.test('Port Standard screen and Studio return controls', async () => {
            await open();
            assert.equal(await frame().locator('#practice-menu-add').isVisible(), true);
            assert.equal(await frame().locator('#practice-history-open').isVisible(), true);
            assert.equal(await page.locator('#screen-port-practice .workspace-home').isVisible(), true);
            assert.equal(await page.evaluate(() => CruiseStudio.portDataHost.canWrite), false);
            assert.deepEqual(await page.evaluate(() => CruiseStudio.portPractice.getState()), { active: true, phase: 'ready', hasFrame: true });
        });
        await t.test('embedded controls are the same Port document as the direct Standard route', async () => {
            const direct = await context.newPage();
            try {
                await direct.goto(new URL('../cruise-port/', url).href, { waitUntil: 'domcontentloaded' });
                await direct.evaluate(() => { location.hash = '#practice-menu'; });
                await direct.locator('#practice-list-view').waitFor({ state: 'visible' });
                const embeddedIds = await page.locator('#screen-port-practice iframe').evaluate(element => [...element.contentDocument.querySelectorAll('#practice-list-view button[id], #practice-menu-form [id], #practice-history-view button[id]')].map(node => node.id));
                const directIds = await direct.evaluate(() => [...document.querySelectorAll('#practice-list-view button[id], #practice-menu-form [id], #practice-history-view button[id]')].map(node => node.id));
                assert.deepEqual(embeddedIds, directIds);
                assert.equal(await direct.locator('#practice-menu-add').isVisible(), true);
            } finally { await direct.close(); }
        });
        await t.test('create, edit, reorder and Port native keys survive reopen', async () => {
            await add('Studio Practice A');
            await add('Studio Practice B');
            const menu = await page.evaluate(() => JSON.parse(localStorage.getItem('cruisePort.practiceMenus')));
            assert.equal(menu.version, 3);
            assert(menu.items.some(item => item.name === 'Studio Practice A'));
            const id = menu.items.find(item => item.name === 'Studio Practice A').id;
            await frame().locator('.practice-menu-card').filter({ hasText: 'Studio Practice A' }).locator('.practice-card-link').click();
            await frame().locator('#practice-edit').click();
            await frame().locator('#practice-memo').fill('Studio edit retained');
            await frame().locator('#practice-menu-form button[type=submit]').click();
            await page.waitForFunction(() => JSON.parse(localStorage.getItem('cruisePort.practiceMenus') || '{}').items?.some(item => item.memo === 'Studio edit retained'));
            await frame().locator('#practice-detail-view').waitFor({ state: 'visible' });
            await frame().locator('#practice-detail-back').click();
            await frame().locator('#practice-reorder-start').click();
            assert.equal(await frame().locator('.reorder-move').count() > 0, true);
            await frame().locator('.reorder-move:not([disabled])').first().click();
            await frame().locator('#practice-reorder-complete').click();
            assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem('cruisePort.practiceMenus')).items.some(item => item.id === id), id), true);
            await page.locator('#screen-port-practice .workspace-home').click();
            assert.equal(await page.locator('#screen-port-practice iframe').count(), 0);
            await open();
            assert.match(await frame().locator('#practice-menu-list').innerText(), /Studio Practice A/);
            assert.match(await frame().locator('#practice-menu-list').innerText(), /Studio Practice B/);
            page.once('dialog', dialog => dialog.accept());
            await frame().locator('.practice-menu-card').filter({ hasText: 'Studio Practice B' }).locator('.practice-card-link').click();
            await frame().locator('#practice-delete').click();
            await page.waitForFunction(() => !JSON.parse(localStorage.getItem('cruisePort.practiceMenus') || '{}').items?.some(item => item.name === 'Studio Practice B'));
            await page.reload({ waitUntil: 'domcontentloaded' });
            await open();
            assert.match(await frame().locator('#practice-menu-list').innerText(), /Studio Practice A/);
            assert.doesNotMatch(await frame().locator('#practice-menu-list').innerText(), /Studio Practice B/);
        });
        await t.test('Studio navigation uses Port unsaved-edit save, discard and continue choices', async () => {
            const edit = async memo => {
                await frame().locator('.practice-menu-card').filter({ hasText: 'Studio Practice A' }).locator('.practice-card-link').click();
                await frame().locator('#practice-edit').click();
                await frame().locator('#practice-memo').fill(memo);
            };
            await edit('Uncommitted practice edit');
            await page.locator('#screen-port-practice .workspace-home').click();
            await frame().locator('#practice-exit-dialog').waitFor({ state: 'visible' });
            assert.equal(await page.evaluate(() => CruiseStudio.shellHost.getActiveWorkspace()), 'portPractice');
            await frame().locator('#practice-exit-continue').click();
            assert.equal(await frame().locator('#practice-form-view').isVisible(), true);
            await page.locator('#screen-port-practice .workspace-home').click();
            await frame().locator('#practice-exit-discard').click();
            await page.waitForFunction(() => CruiseStudio.shellHost.getActiveWorkspace() === 'home');
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cruisePort.practiceMenus')).items.find(item => item.name === 'Studio Practice A').memo), 'Studio edit retained');
            await open();
            await edit('Saved from Port exit dialog');
            await page.locator('#screen-port-practice .workspace-home').click();
            await frame().locator('#practice-exit-save').click();
            await page.waitForFunction(() => CruiseStudio.shellHost.getActiveWorkspace() === 'home');
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cruisePort.practiceMenus')).items.find(item => item.name === 'Studio Practice A').memo), 'Saved from Port exit dialog');
            await open();
        });
        await t.test('timer, history and calendar save through Port', async () => {
            await frame().locator('#practice-timer-toggle').click();
            await frame().locator('#practice-timer-stop').waitFor({ state: 'visible' });
            await frame().locator('#practice-timer-stop').click();
            await frame().locator('#practice-completion-dialog').waitFor({ state: 'visible' });
            await frame().locator('#practice-completion-calendar').click();
            await frame().locator('#practice-history-view').waitFor({ state: 'visible' });
            await frame().locator('#practice-calendar-note-add').click();
            await frame().locator('#practice-calendar-note-text').fill('Studio calendar QA');
            await frame().locator('#practice-calendar-note-form').evaluate(form => form.requestSubmit());
            await page.waitForFunction(() => JSON.parse(localStorage.getItem('cruisePort.practiceCalendar') || '{}').notes?.some(note => note.text === 'Studio calendar QA'));
            await frame().locator('#practice-history-add').click();
            await frame().locator('#practice-history-minutes').fill('9');
            await frame().locator('#practice-history-form').evaluate(form => form.requestSubmit());
            await page.waitForFunction(() => JSON.parse(localStorage.getItem('cruisePort.practiceHistory') || '{}').events?.length > 0);
            assert.equal(await frame().locator('[data-calendar-view="week"]').isVisible(), true);
            await frame().locator('[data-calendar-view="week"]').click();
            await frame().locator('[data-calendar-view="day"]').click();
            await frame().locator('[data-calendar-view="month"]').click();
            await page.locator('#screen-port-practice .workspace-home').click();
            await open();
            await frame().locator('#practice-history-open').click();
            assert.match(await frame().locator('#practice-calendar-notes-list').innerText(), /Studio calendar QA/);
        });
        await t.test('Port Standard limit and Pro prompt remain intact', async () => {
            await frame().locator('#practice-history-back').click();
            await frame().locator('#practice-list-view').waitFor({ state: 'visible' });
            let count = await page.evaluate(() => JSON.parse(localStorage.getItem('cruisePort.practiceMenus')).items.length);
            while (count < 5) { await add(`Studio Standard ${count}`); count++; }
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cruisePort.practiceMenus')).items.length), 5);
            await frame().locator('#practice-menu-add').click();
            assert.equal(await frame().locator('.port-pro-prompt').isVisible(), true);
            assert.equal(await frame().locator('#practice-form-view').isVisible(), false);
            await frame().locator('.port-pro-prompt').press('Escape').catch(() => {});
        });
        await t.test('four themes, narrow width and Port home return', async () => {
            for (const theme of ['dark', 'charcoal', 'gray', 'light']) {
                await page.evaluate(theme => CruiseStudio.colorTheme.setColorTheme(theme), theme);
                assert.equal(await frame().locator('#practice-list-view').isVisible(), true);
            }
            await page.setViewportSize({ width: 390, height: 800 });
            assert.equal(await page.evaluate(() => document.querySelector('#studio-main').scrollWidth <= document.querySelector('#studio-main').clientWidth), true);
            assert.equal(await page.locator('#screen-port-practice iframe').evaluate(element => element.contentDocument.documentElement.scrollWidth <= element.contentDocument.documentElement.clientWidth), true);
            await page.setViewportSize({ width: 1440, height: 900 });
            await frame().locator('#practice-list-view .view-back[data-action="home"]').click();
            await page.waitForFunction(() => CruiseStudio.shellHost.getActiveWorkspace() === 'home');
            assert.equal(await page.locator('#screen-port-practice iframe').count(), 0);
        });
        await t.test('Global Stop, hidden tab, pagehide and tool navigation release the Port frame', async () => {
            await open();
            await page.locator('#shell-audio-stop').click();
            await page.waitForFunction(() => !document.querySelector('#port-practice-surface iframe'));
            await page.locator('#port-practice-resume').click();
            await frame().locator('#practice-list-view').waitFor({ state: 'visible' });
            await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
            await page.waitForFunction(() => !document.querySelector('#port-practice-surface iframe'));
            await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
            await page.locator('#port-practice-resume').click();
            await frame().locator('#practice-list-view').waitFor({ state: 'visible' });
            await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
            await page.waitForFunction(() => !document.querySelector('#port-practice-surface iframe'));
            await page.locator('#port-practice-resume').click();
            await frame().locator('#practice-list-view').waitFor({ state: 'visible' });
            await page.locator('[data-workspace="metronome"]').click();
            assert.equal(await page.locator('#port-practice-surface iframe').count(), 0);
            await page.locator('#port-metronome-surface iframe').waitFor({ state: 'visible' });
            await page.locator('[data-workspace="portPractice"]').click();
            await frame().locator('#practice-list-view').waitFor({ state: 'visible' });
            assert.equal(await page.locator('#port-metronome-surface iframe').count(), 0);
        });
        assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); }
});
