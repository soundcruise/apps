const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
test('Studio product boundary denies both components without a source and never starts Port', async () => {
    const origin = process.env.STUDIO_URL;
    assert(origin && ['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(origin).origin ? route.continue() : route.abort());
    try {
        const page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(new URL('/apps/cruise-studio/index.html', origin).href);
        await page.waitForFunction(() => !!window.CruiseStudio?.portProComponents);
        const result = await page.evaluate(async () => {
            const before = Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('cruisePort.')));
            const tuner = await CruiseStudio.portProComponents.open('tuner');
            const metronome = await CruiseStudio.portProComponents.open('metronome');
            return { tuner, metronome, before, after: Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('cruisePort.'))) };
        });
        assert.deepEqual(result.tuner, { ok: false, reason: 'studio-entry-required' });
        assert.deepEqual(result.metronome, result.tuner);
        assert.deepEqual(result.before, result.after);
        // Synthetic source exists only in this disposable browser context.
        const admitted = await page.evaluate(async () => {
            window.__SOUNDCRUISE_PRO_GATE__ = {};
            window.__soundCruiseClearGate = () => {};
            window.SoundCruiseProOperationSource = { read: () => ({ revoked: false, revision: 'fixture', auth: { credential: 'fixture', generation: 1, sessionVersion: 1 } }), validate: async () => ({ ok: true }) };
            return CruiseStudio.portProComponents.open('tuner');
        });
        assert.deepEqual(admitted, { ok: false, reason: 'studio-entry-required' });
        assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); }
});
