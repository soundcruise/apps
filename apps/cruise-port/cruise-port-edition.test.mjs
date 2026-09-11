import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { getEdition, isProEdition, isStandardEdition, applyEditionDisplay, PRO_ENTRY_PATH, CRUISE_PORT_ROOT } from './cruise-port-edition.js';
import { getCapabilities } from './cruise-port-capabilities.js';
import { APP_DEFINITIONS, applyHomeCruiseLinks, resolveCruiseAppHref } from './cruise-app-links.js';
import { resolvePracticeMenuApp } from './practice-menu-app-resolver.js';
import { savePracticeMenus, loadPracticeMenus } from './practice-menu-store.js';
import { MY_APPS_LIMITS, loadMyApps, saveMyApps, createMyApp } from './my-apps-store.js';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const proFile = `.${PRO_ENTRY_PATH.slice(CRUISE_PORT_ROOT.length - 1)}index.html`;
const root = read('./index.html');
const pro = read(proFile);

test('SP2 root is Standard; only explicit Pro route is Pro', () => {
    for (const path of [PRO_ENTRY_PATH, `${PRO_ENTRY_PATH}index.html`]) {
        assert.equal(getEdition(path), 'pro');
        assert.equal(isProEdition(path), true);
    }
    for (const path of [CRUISE_PORT_ROOT, `${CRUISE_PORT_ROOT}index.html`, undefined, null, '', '/', {}, '/apps/cruise-port/pro_fake/', `${PRO_ENTRY_PATH}extra`, '/apps/cruise-port/%70ro_fake/', '/apps/cruise-port/../', '//apps/cruise-port/', `${PRO_ENTRY_PATH}?edition=pro`]) {
        assert.equal(getEdition(path), 'standard');
        assert.equal(isStandardEdition(path), true);
    }
    assert.match(PRO_ENTRY_PATH, /^\/apps\/cruise-port\/pro_[a-z0-9]{10,14}\/$/);
});

test('formal Standard and Pro policies are immutable and separate from store caps', () => {
    assert.deepEqual(getCapabilities('standard'), {
        tunerCapo: false, metronomeAdvanced: false, metronomePresetWrite: false,
        practiceMenuCreateLimit: 5, practiceFileWrite: false, myAppsCreateLimit: 5,
        customMyAppIconWrite: false, gearPhotoWrite: false, calendarMemo: true, settings: true, directLaunch: true
    });
    const proPolicy = getCapabilities('pro');
    for (const [key, value] of Object.entries(proPolicy)) {
        if (!key.endsWith('Limit')) assert.equal(value, true, key);
    }
    assert.equal(proPolicy.practiceMenuCreateLimit, Infinity);
    assert.equal(proPolicy.myAppsCreateLimit, MY_APPS_LIMITS.items);
    assert.equal(MY_APPS_LIMITS.items, 100);
    assert.ok(Object.isFrozen(proPolicy));
    assert.ok(Object.isFrozen(getCapabilities('standard')));
    assert.equal(getCapabilities('invalid'), getCapabilities('standard'));
});

test('Home and Practice resolve all four editions through one catalog; local tools and My Apps unchanged', () => {
    const apps = {
        pitch: ['pitch-cruise', 'pro_x9v7q2m8'], fretboard: ['fretboard_cruise', 'pro_a9f4k7q2m8z'],
        rhythm: ['rhythm-cruise', 'pro_r4m8k7n2q9x'], chord: ['chord-cruise', 'pro_k7m4q9v2x8']
    };
    for (const edition of ['standard', 'pro']) {
        const links = Object.keys(apps).map((id) => ({ dataset: { cruiseApp: id }, setAttribute(_, href) { this.href = href; } }));
        applyHomeCruiseLinks({ querySelectorAll: () => links }, edition);
        for (const [id, [dir, proDir]] of Object.entries(apps)) {
            const expected = `/apps/${dir}/${edition === 'pro' ? proDir : 'standard'}/`;
            assert.equal(resolveCruiseAppHref(id, edition), expected);
            assert.equal(resolvePracticeMenuApp(id, { edition }).href, expected);
            assert.equal(links.find((link) => link.dataset.cruiseApp === id).href, expected);
            assert.ok(existsSync(new URL(`../..${expected}index.html`, import.meta.url)));
        }
        for (const id of ['tuner', 'metronome']) assert.equal(resolvePracticeMenuApp(id, { edition }).href, `#${id}`);
        const item = { id: 'qa-sp1', name: 'QA SP1', url: 'https://soundcruise.jp/apps/pitch-cruise/pro_x9v7q2m8/', launchMode: 'https' };
        assert.equal(resolvePracticeMenuApp('myapp:qa-sp1', { edition, myApps: [item], myAppsReady: true }).href, item.url);
    }
    assert.equal(resolveCruiseAppHref('__proto__'), null);
    assert.deepEqual(Object.keys(APP_DEFINITIONS), ['pitch', 'fretboard', 'rhythm', 'chord', 'metronome', 'tuner']);
});

test('SP2 shells allow only Pro title/gate and document-relative URL differences', () => {
    const expected = root.replace(/((?:src|href)=")(\.\.?\/)/g, (_, start, relative) => start + (relative === './' ? '../' : '../../'));
    const withoutGate = pro
        .replace('クルーズポート Pro</title>', 'クルーズポート</title>')
        .replace('href="./manifest.json?v=0.27.1"', 'href="../manifest.json?v=0.27.1"')
        .replaceAll('/app-icons/pro/', '/app-icons/standard/')
        .split('\n').filter(line => !line.includes('shared/pro-gate.')).join('\n')
        .replace(/    <script>\n        window\.__SOUNDCRUISE_PRO_GATE__[\s\S]*?<\/script>\n/, '');
    assert.equal(withoutGate, expected, 'Only explicitly allowed edition differences may diverge');
    assert.doesNotMatch(root, /pro-gate\.(?:js|css)|__SOUNDCRUISE_PRO_GATE__/);
    assert.match(pro, /shared\/pro-gate\.js\?v=21/);
    assert.match(pro, /__SOUNDCRUISE_PRO_GATE__/);
    assert.doesNotMatch(pro, /<iframe|<base|http-equiv="refresh"|location\.(?:replace|assign)/i);
    for (const entry of [root, pro]) {
        assert.match(entry, /home-pro-badge[^>]*hidden>Pro/);
        assert.equal((entry.match(/data-cruise-app=/g) || []).length, 4);
    }
    const gate = read('../shared/pro-gate.js');
    assert.match(gate, /SHARED_AUTH_KEY = 'soundCruiseProAuth'/);
    for (const [html, path] of [[root, CRUISE_PORT_ROOT], [pro, PRO_ENTRY_PATH]]) {
        for (const [, relative] of html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)) {
            const url = new URL(relative, `https://soundcruise.jp${path}`);
            if (url.origin !== 'https://soundcruise.jp') continue;
            assert.ok(existsSync(new URL(`../..${url.pathname}`, import.meta.url)), `${path}: ${relative}`);
        }
    }
});

test('badge responds only to edition, retains a readable text label, and CSS has no path-specific override', () => {
    const badge = { hidden: true };
    const doc = { documentElement: { dataset: {} }, getElementById: () => badge };
    applyEditionDisplay(doc, 'pro'); assert.equal(badge.hidden, false);
    applyEditionDisplay(doc, 'standard'); assert.equal(badge.hidden, true);
    assert.equal(doc.documentElement.dataset.edition, 'standard');
    const css = read('./style.css');
    assert.match(css, /\.port-pro-badge[\s\S]*font-size: 0\.38em/);
    assert.doesNotMatch(css, /pro_9a3943176561/);
    for (const file of readdirSync(new URL('.', import.meta.url)).filter((file) => file.endsWith('.js') && file !== 'cruise-port-edition.js')) {
        assert.doesNotMatch(read(`./${file}`), /pathname[^\n]*(?:pro_|cruise-port\/)/, file);
    }
});

test('over-five stored Practice and My Apps survive policy changes without rewriting schemas', () => {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
    const timestamp = '2026-09-09T00:00:00.000Z';
    loadPracticeMenus(storage);
    loadMyApps(storage);
    const menus = Array.from({ length: 6 }, (_, i) => ({ id: `qa-sp1-${i}`, name: `QA SP1 ${i}`, durationMinutes: 10, appId: 'pitch', memo: '', hidden: i === 5, createdAt: timestamp, updatedAt: timestamp }));
    assert.equal(savePracticeMenus(menus, storage).ok, true);
    const apps = Array.from({ length: 6 }, (_, i) => createMyApp({ name: `QA SP1 ${i}`, url: `https://example.com/${i}` }, [], new Date(timestamp), () => `qa-sp1-${i}`).item);
    assert.equal(saveMyApps(apps, storage).ok, true);
    const snapshot = [...values];
    for (const edition of ['pro', 'standard', 'pro']) {
        getCapabilities(edition);
        assert.equal(loadPracticeMenus(storage).items.length, 6);
        assert.equal(loadMyApps(storage).items.length, 6);
    }
    assert.deepEqual([...values], snapshot);
});
