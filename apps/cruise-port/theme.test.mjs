import { fixtureFullSnapshot } from './tests/full-snapshot-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import {
    DEFAULT_SETTINGS, DEFAULT_THEME, SETTINGS_SCHEMA_VERSION, SETTINGS_STORAGE_KEY, THEMES, THEME_META_COLORS,
    loadSettings, normalizeSettings, resolveTheme, saveSettings
} from './settings-store.js';
import { validateRecordPayload } from '../../workers/sound-cruise-sync/src/record-schema-registry.js';
import { createHash } from 'node:crypto';
import { THEME_SECTION_MARKER, darkRootTokens, readDarkStyle, readStyle } from './theme-test-support.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const entries = [['standard', read('./index.html')], ['pro', read('./pro_9a3943176561/index.html')]];
const app = read('./practice-menu-app.js');
const css = readStyle();

// Parse complete rules rather than treating everything after the theme marker
// as themed. General NEWS rules can follow (or precede) a themed rule.
function cssParts(source, delimiter) {
    const parts = [];
    let start = 0, depth = 0, quote = '', escaped = false;
    for (let i = 0; i < source.length; i++) {
        const c = source[i];
        if (quote) {
            if (escaped) escaped = false;
            else if (c === '\\') escaped = true;
            else if (c === quote) quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (c === delimiter && depth === 0) { parts.push(source.slice(start, i).trim()); start = i + 1; }
        assert.ok(depth >= 0, 'balanced CSS component');
    }
    assert.equal(depth, 0, 'complete CSS component');
    assert.equal(quote, '', 'complete CSS string');
    parts.push(source.slice(start).trim());
    return parts.filter(Boolean);
}

function themeRegions(source) {
    const marker = source.indexOf(THEME_SECTION_MARKER);
    assert.ok(marker > 0, 'theme marker exists');
    const section = source.slice(marker).replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [];
    let start = 0, bodyStart = 0, selector = '', depth = 0, quote = '', escaped = false;
    for (let i = 0; i < section.length; i++) {
        const c = section[i];
        if (quote) {
            if (escaped) escaped = false;
            else if (c === '\\') escaped = true;
            else if (c === quote) quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '{') {
            if (depth === 0) { selector = section.slice(start, i).trim(); bodyStart = i + 1; }
            depth++;
        } else if (c === '}') {
            assert.ok(depth > 0, 'balanced CSS rule');
            if (--depth === 0) { rules.push({ selector, body: section.slice(bodyStart, i) }); start = i + 1; }
        }
    }
    assert.equal(depth, 0, 'complete CSS rule');
    assert.equal(quote, '', 'complete CSS rule string');
    assert.equal(section.slice(start).trim(), '', 'no unparsed CSS');
    const themed = [], general = [];
    for (const rule of rules) {
        const selectors = cssParts(rule.selector, ',');
        assert.ok(selectors.length, 'nonempty CSS selector');
        (selectors.some(s => s.includes('[data-theme')) ? themed : general).push({ ...rule, selectors });
    }
    assert.ok(themed.length, 'theme rules exist');
    return { themed, general };
}

function themeDeclarations(body) {
    return cssParts(body, ';').map(declaration => {
        const colon = declaration.indexOf(':');
        assert.ok(colon > 0, 'CSS declaration has property and value');
        return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
    });
}

function assertThemeStructure(source) {
    const regions = themeRegions(source), radii = [];
    const scoped = /^:root(?:\[data-theme="(?:charcoal|gray|light)"\]|:is\(\[data-theme="gray"\], \[data-theme="light"\]\))/;
    const allowed = /^(?:--port-[a-z0-9-]+|color|color-scheme|background|background-color|border-color|outline-color|box-shadow|filter|accent-color|border-radius)$/;
    for (const rule of regions.themed) {
        for (const selector of rule.selectors) assert.match(selector, scoped, selector);
        for (const [name, value] of themeDeclarations(rule.body)) {
            assert.match(name, allowed, name);
            if (name === 'border-radius') radii.push({ selector: rule.selector, value });
        }
    }
    assert.deepEqual(radii, [{ selector: ':root:is([data-theme="gray"], [data-theme="light"]) #home-view .tool-card:not(.my-app-launch-card) .skeleton-icon', value: '23%' }], 'only the themed tool icon tile may set border-radius');
    // NEWS uses the released flex-card layout (already present before this integration).
    // Every general rule in this section is accounted for; none is silently
    // discarded to make the theme constraints pass.
    assert.deepEqual(regions.general.map(rule => rule.selector), ['.news-hot'], 'general CSS after the theme marker is the NEWS badge');
    assert.deepEqual(Object.fromEntries(themeDeclarations(regions.general[0].body)), {
        display: 'inline-flex', 'align-items': 'center', 'align-self': 'flex-end', flex: 'none', 'white-space': 'nowrap', gap: '4px',
        'font-size': '12px', 'font-weight': '500', color: 'var(--accent,#d8bc76)',
        border: '1px solid color-mix(in srgb,var(--accent,#d8bc76) 45%,transparent)',
        'border-radius': '5px', padding: '1px 6px', 'line-height': '1.5'
    }, 'NEWS remains a complete general badge rule, independently of theme overrides');
    return regions;
}

function storage(values = {}) {
    const data = new Map(Object.entries(values));
    const writes = [];
    return {
        writes,
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => { writes.push(key); data.set(key, String(value)); },
        removeItem: (key) => data.delete(key),
        value: (key) => data.get(key),
        snapshot: () => Object.fromEntries(data)
    };
}

const v3 = (extra = {}) => JSON.stringify({ version: 3, displaySize: 'small', fontSize: 'large', sectionOrder: ['tools', 'cruiseApps', 'myApps'], ...extra });

test('theme values, Dark default and the unchanged settings schema version', () => {
    assert.deepEqual([...THEMES], ['dark', 'charcoal', 'gray', 'light']);
    assert.equal(DEFAULT_THEME, 'dark');
    assert.equal(SETTINGS_SCHEMA_VERSION, 3, 'the schema version must never move for the theme');
    assert.equal(Object.hasOwn(DEFAULT_SETTINGS, 'theme'), false, 'defaults never inject a theme into saved settings');
    for (const value of [undefined, null, '', 'blue', 'Dark', 'LIGHT', 1, true, {}, ['light']]) assert.equal(resolveTheme(value), 'dark');
    for (const value of THEMES) assert.equal(resolveTheme(value), value);
});

test('normalize keeps only an explicit valid theme; missing or invalid stays absent', () => {
    assert.equal(Object.hasOwn(normalizeSettings({ fontSize: 'large' }), 'theme'), false);
    assert.equal(Object.hasOwn(normalizeSettings({ theme: 'sepia' }), 'theme'), false);
    assert.equal(Object.hasOwn(normalizeSettings({ theme: 7 }), 'theme'), false);
    for (const theme of THEMES) assert.equal(normalizeSettings({ theme }).theme, theme);
});

test('loading old settings never writes a theme back (no mass Cloud Sync updates)', () => {
    for (const raw of [v3(), v3({ theme: 'nope' }), JSON.stringify({ version: 2, displaySize: 'large' })]) {
        const store = storage({ [SETTINGS_STORAGE_KEY]: raw });
        const result = loadSettings(store);
        assert.equal(result.ok, true);
        assert.equal(resolveTheme(result.settings.theme), 'dark');
        assert.deepEqual(store.writes, [], raw);
        assert.equal(store.value(SETTINGS_STORAGE_KEY), raw, 'stored text is untouched');
    }
    const empty = storage();
    assert.equal(resolveTheme(loadSettings(empty).settings.theme), 'dark');
    assert.deepEqual(empty.writes, []);
    // A legacy (pre-version) record still migrates exactly as before: no theme is added.
    const legacy = storage({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ displaySize: 'large' }) });
    loadSettings(legacy);
    assert.equal(Object.hasOwn(JSON.parse(legacy.value(SETTINGS_STORAGE_KEY)), 'theme'), false);
});

test('saving other settings without a theme keeps the exact previous stored shape', () => {
    const store = storage({ [SETTINGS_STORAGE_KEY]: v3() });
    const loaded = loadSettings(store).settings;
    saveSettings({ ...loaded, fontSize: 'small' }, store);
    assert.equal(store.value(SETTINGS_STORAGE_KEY), JSON.stringify({ version: 3, displaySize: 'small', fontSize: 'small', sectionOrder: ['tools', 'cruiseApps', 'myApps'] }));
});

test('an explicit choice saves dark, gray and light and reloads as saved', () => {
    for (const theme of THEMES) {
        const store = storage({ [SETTINGS_STORAGE_KEY]: v3() });
        const saved = saveSettings({ ...loadSettings(store).settings, theme }, store);
        assert.equal(saved.ok, true);
        const stored = JSON.parse(store.value(SETTINGS_STORAGE_KEY));
        assert.equal(stored.theme, theme);
        assert.equal(stored.version, 3);
        assert.equal(stored.fontSize, 'large', 'other settings are kept');
        assert.equal(loadSettings(store).settings.theme, theme);
    }
});

test('reset returns the theme to Dark explicitly, within the existing display-settings reset', () => {
    const handlers = app.slice(app.indexOf('function updateDisplaySettings(next)'), app.indexOf('elements.myAppsForm.addEventListener'));
    assert.match(handlers, /updateDisplaySettings\(\{ \.\.\.DEFAULT_SETTINGS, theme: DEFAULT_THEME \}\)/);
    const store = storage({ [SETTINGS_STORAGE_KEY]: v3({ theme: 'light' }) });
    saveSettings({ ...DEFAULT_SETTINGS, theme: DEFAULT_THEME }, store);
    assert.equal(JSON.parse(store.value(SETTINGS_STORAGE_KEY)).theme, 'dark');
});

test('only an explicit tap stores the theme and the choice applies without reload', () => {
    assert.match(app, /themeChoices: \[\.\.\.document\.querySelectorAll\('button\[data-theme-choice\]'\)\]/);
    assert.match(app, /elements\.themeChoices\.forEach\(\(button\) => button\.addEventListener\('click', async \(\) => \{\n\s*\(await updateDisplaySettings\(\{ \.\.\.homeSettings, theme: button\.dataset\.themeChoice \}\)\);/);
    assert.match(app, /function applyColorTheme\(theme\) \{\n\s*document\.documentElement\.dataset\.theme = theme;\n\s*document\.querySelector\('meta\[name="theme-color"\]'\)\?\.setAttribute\('content', THEME_META_COLORS\[theme\]\);/);
    assert.match(app, /applyColorTheme\(resolveTheme\(homeSettings\.theme\)\);/);
    assert.doesNotMatch(app, /location\.reload\(\)[^\n]*theme|theme[^\n]*location\.reload/);
});

test('Settings UI: カラーテーマ radiogroup reuses the existing choices, right after フォント', () => {
    assert.match(app, /\[\.\.\.elements\.settingsChoices, \.\.\.elements\.fontChoices, \.\.\.elements\.themeChoices\]\.forEach\(\(button\) => \{/);
    assert.match(app, /for \(const choices of \[elements\.settingsChoices, elements\.fontChoices, elements\.themeChoices\]\) choices\.forEach/);
    for (const [name, html] of entries) {
        const font = html.indexOf('id="font-size-title"');
        const theme = html.indexOf('<h2 id="color-theme-title"');
        const order = html.indexOf('id="section-order-title"');
        assert.ok(font > 0 && font < theme && theme < order, `${name}: placed after フォント`);
        const section = html.slice(theme, order);
        assert.match(section, /<h2 id="color-theme-title">カラーテーマ<\/h2>/);
        assert.match(section, /class="settings-choices" role="radiogroup" aria-label="カラーテーマ"/);
        const buttons = [...section.matchAll(/<button type="button" class="settings-choice" data-theme-choice="([a-z]+)" role="radio" aria-checked="(true|false)">([^<]+)<\/button>/g)];
        assert.deepEqual(buttons.map(([, value, , label]) => [value, label]), [['dark', 'ダーク'], ['charcoal', 'チャコール'], ['gray', 'グレー'], ['light', 'ライト']], name);
        assert.deepEqual(buttons.map(([, , checked]) => checked), ['true', 'false', 'false', 'false'], `${name}: Dark is the initial state`);
    }
});

function runBootstrap(html, values, { throwOnRead = false } = {}) {
    const script = html.match(/<script>\s*\/\/ Port color theme before first paint[\s\S]*?<\/script>/)[0].replace(/<\/?script>/g, '');
    const attributes = {};
    const meta = { content: '#090806', setAttribute(key, value) { if (key === 'content') this.content = value; } };
    const context = {
        localStorage: { getItem: (key) => { if (throwOnRead) throw new Error('blocked'); return Object.hasOwn(values, key) ? values[key] : null; } },
        document: {
            documentElement: { setAttribute: (key, value) => { attributes[key] = value; } },
            querySelector: (selector) => (selector === 'meta[name="theme-color"]' ? meta : null)
        },
        JSON
    };
    vm.runInNewContext(script, context);
    return { theme: attributes['data-theme'], meta: meta.content };
}

test('startup bootstrap applies the saved theme before the stylesheet, Dark for anything else', () => {
    for (const [name, html] of entries) {
        const bootstrap = html.indexOf('// Port color theme before first paint');
        assert.ok(bootstrap > 0 && bootstrap < html.indexOf('rel="stylesheet"'), `${name}: before any stylesheet`);
        assert.ok(bootstrap > html.indexOf('<meta name="theme-color"'), `${name}: after the theme-color meta it updates`);
        const cases = [
            [{}, 'dark'], [{ [SETTINGS_STORAGE_KEY]: v3() }, 'dark'], [{ [SETTINGS_STORAGE_KEY]: v3({ theme: 'sepia' }) }, 'dark'],
            [{ [SETTINGS_STORAGE_KEY]: '{not json' }, 'dark'], [{ [SETTINGS_STORAGE_KEY]: 'null' }, 'dark'],
            [{ [SETTINGS_STORAGE_KEY]: v3({ theme: 'dark' }) }, 'dark'], [{ [SETTINGS_STORAGE_KEY]: v3({ theme: 'gray' }) }, 'gray'],
            [{ [SETTINGS_STORAGE_KEY]: v3({ theme: 'light' }) }, 'light'], [{ [SETTINGS_STORAGE_KEY]: v3({ theme: 'charcoal' }) }, 'charcoal'],
            // Another app's settings never influence Port.
            [{ pitchTrainerSettings: JSON.stringify({ theme: 'light' }), 'chordCruise.settings': JSON.stringify({ theme: 'gray' }) }, 'dark']
        ];
        for (const [values, expected] of cases) {
            const result = runBootstrap(html, values);
            assert.equal(result.theme, expected, `${name}: ${JSON.stringify(values)}`);
            assert.equal(result.meta, THEME_META_COLORS[expected], `${name}: theme-color for ${expected}`);
        }
        assert.equal(runBootstrap(html, {}, { throwOnRead: true }).theme, 'dark', `${name}: storage error → Dark`);
        assert.match(html, /<meta name="theme-color" content="#090806">/, `${name}: static meta is still the Dark color`);
        assert.doesNotMatch(html.slice(bootstrap, html.indexOf('</script>', bootstrap)), /localStorage\.getItem\('(?!cruisePort\.settings')/);
    }
    assert.equal(entries[0][1].match(/<script>\s*\/\/ Port color theme[\s\S]*?<\/script>/)[0],
        entries[1][1].match(/<script>\s*\/\/ Port color theme[\s\S]*?<\/script>/)[0], 'Standard and Pro share one bootstrap');
    assert.deepEqual({ ...THEME_META_COLORS }, { dark: '#090806', charcoal: '#424346', gray: '#c8cbd0', light: '#f7f6f2' });
});

test('Cloud Sync carries the theme inside settings/global without any Worker or adapter change', async () => {
    const source = read('./port-sync-adapter.js');
    assert.doesNotMatch(source, /theme/i, 'the adapter is not theme-aware: it moves cruisePort.settings as a whole');
    const local = storage({ [SETTINGS_STORAGE_KEY]: v3({ theme: 'light' }) });
    const context = { crypto: webcrypto, TextEncoder, structuredClone, URL, localStorage: local };
    context.globalThis = context;
    vm.runInNewContext(source, context);
    const sync = context.SoundCruisePortSync;
    const snapshot = sync.readLocalSnapshot(local);
    const settings = snapshot.records.find((item) => item.recordType === 'settings');
    assert.equal(settings.recordId, 'global');
    assert.equal(settings.payload.value.theme, 'light');
    assert.equal(validateRecordPayload('port', 'settings', 'global', JSON.parse(JSON.stringify(settings.payload))), true, 'current Worker accepts it');

    // Another device receives the record and stores the same theme for its next start.
    const other = storage({ [SETTINGS_STORAGE_KEY]: v3({ theme: 'dark' }) });
    await sync.applyRemoteSnapshot(other, fixtureFullSnapshot(snapshot));
    assert.equal(JSON.parse(other.value(SETTINGS_STORAGE_KEY)).theme, 'light');
    // An old payload without a theme stays Dark on the receiving device.
    const old = storage();
    await sync.applyRemoteSnapshot(old, fixtureFullSnapshot({ schemaVersion: 1, records: [{ recordType: 'settings', recordId: 'global', schemaVersion: 1, payload: { id: 'global', value: JSON.parse(v3()) } }] }));
    assert.equal(resolveTheme(JSON.parse(old.value(SETTINGS_STORAGE_KEY)).theme), 'dark');
});

test('the theme is Port-only: other Cruise app settings are never read or written', () => {
    const others = {
        pitchTrainerSettings: JSON.stringify({ instrument: 'piano' }),
        'chordCruise.settings': JSON.stringify({ chordNameSize: 'large' }),
        fretboard_cruise_state: JSON.stringify({ settings: { tempo: 90 } }),
        rhythmCruiseSettings: JSON.stringify({ tapLayout: 'ud' })
    };
    const store = storage({ ...others, [SETTINGS_STORAGE_KEY]: v3() });
    saveSettings({ ...loadSettings(store).settings, theme: 'gray' }, store);
    assert.deepEqual(store.writes, [SETTINGS_STORAGE_KEY]);
    for (const [key, value] of Object.entries(others)) assert.equal(store.value(key), value, key);
    for (const source of [app, read('./settings-store.js'), css, ...entries.map(([, html]) => html)]) {
        assert.doesNotMatch(source, /globalTheme|soundCruise\.theme|prefers-color-scheme/);
    }
});

test('CSS: Dark is the attribute-free default; Gray/Light only override tokens under data-theme', () => {
    const themeStart = css.indexOf(THEME_SECTION_MARKER);
    assert.ok(themeStart > 0);
    const darkPart = css.slice(0, themeStart);
    assert.doesNotMatch(darkPart, /data-theme/, 'no Dark rule depends on the attribute');
    assert.match(css.slice(0, css.indexOf('}\n')), /^:root \{\n    color-scheme: dark;/);
    const regions = assertThemeStructure(css);
    const themePart = regions.themed.map(rule => `${rule.selector} {${rule.body}}`).join('\n');
    for (const theme of ['gray', 'light']) {
        const block = themePart.slice(themePart.indexOf(`:root[data-theme="${theme}"] {`));
        assert.match(block.slice(0, block.indexOf('}')), /color-scheme: light;/, theme);
    }
    for (const [, value] of themePart.matchAll(/--port-gold:\s*([^;]+);/g)) assert.equal(value, '#cdb474', 'brand gold is never re-themed');
    const tokens = darkRootTokens(css);
    assert.equal(tokens['--port-gold'], '#cdb474');
    assert.equal(tokens['--port-bg'], '#080806');
    assert.equal(tokens['--port-accent-rgb'], '205, 180, 116');
});

const themePart = () => css.slice(css.indexOf(THEME_SECTION_MARKER));
const T = ':root:is([data-theme="gray"], [data-theme="light"])';
const ruleBody = (selector) => {
    const part = themePart();
    const start = part.indexOf(`${selector} {`);
    assert.ok(start >= 0, selector);
    return part.slice(start + selector.length + 2, part.indexOf('}', start));
};
const declarations = (body) => Object.fromEntries([...body.matchAll(/([a-z-]+|--port-[a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));

test('Dark CSS matches the fixed pre-integration Port baseline apart from explicit theme-button and NEWS-label rules', () => {
    const dark = css.slice(0, css.indexOf(THEME_SECTION_MARKER));
    const rule = /\/\* カラーテーマ: four labels[\s\S]*?\n\}\n\n/;
    const added = dark.match(rule)[0];
    assert.match(added, /^\/\*[^\n]*\*\/\n\.settings-choices\[aria-label="カラーテーマ"\] \.settings-choice \{\n    font-size: calc\(0\.8rem \* var\(--font-scale\)\);\n    letter-spacing: 0;\n    white-space: nowrap;\n\}\n\n$/, 'only the new theme buttons get a one-line label');
    const newsLabelRules = '.news-heading { display: flex; align-items: center; gap: 10px; flex-wrap: nowrap; }\n.news-heading .view-title { flex: none; white-space: nowrap; }\n.news-test-label { flex: none; color: rgb(var(--port-accent-rgb)); font-size: calc(0.8125rem * var(--font-scale)); font-weight: 500; line-height: 1.5; white-space: nowrap; padding: 2px 7px; border: 1px solid rgba(var(--port-accent-line-rgb), 0.45); border-radius: 4px; background: transparent; box-shadow: none; }\n';
    assert.ok(dark.includes(newsLabelRules));
    // Pinned UI #137 (c1ee3b207d896409b11a076c99d1e1fb5784ef1a) has this exact
    // released Port stylesheet; no product CSS changes are made by this integration.
    assert.equal(createHash('sha256').update(dark.replace(rule, '').replace(newsLabelRules, '')).digest('hex'), 'b516f7ce6f1df74b93b834439c17447b3bafe993145ea33dadfd660e2ae107fd');
});

test('Gray/Light rules only change colors: no sizing, spacing or layout property is themed', () => {
    const themed = assertThemeStructure(css).themed.map(rule => `${rule.selector} {${rule.body}}`).join('\n');
    const allowed = /^(?:--port-[a-z0-9-]+|color|color-scheme|background|background-color|border-color|outline-color|box-shadow|filter|accent-color|border-radius)$/;
    for (const [, name] of themed.matchAll(/^\s*([a-z-]+|--port-[a-z0-9-]+):/gm)) assert.match(name, allowed, name);
    // border-radius is used only to shape the tool icon tile like the Cruise app icons.
    assert.equal([...themed.matchAll(/border-radius:/g)].length, 1);
    assert.match(themed, /#home-view \.tool-card:not\(\.my-app-launch-card\) \.skeleton-icon \{ border-radius: 23%; \}/);
});

test('NEWS is structurally a general rule and retains its complete badge style', () => {
    const regions = assertThemeStructure(css);
    assert.equal(regions.general[0].selector, '.news-hot');
    assert.equal(regions.themed.some(rule => rule.selectors.includes('.news-hot')), false);
});

for (const [name, source, reason] of [
    ['inline themed width after NEWS', css + '\n:root[data-theme="light"] .probe { width: 1px; }', /width/],
    ['inline themed spacing', css + '\n:root[data-theme="gray"] .probe { color: red; padding: 1px; }', /padding/],
    ['mixed scoped and unscoped selector', css + '\n:root[data-theme="light"] .probe, .probe { color: red; }', /\.probe/],
    ['extra themed radius', css + '\n:root[data-theme="light"] .probe { border-radius: 5px; }', /themed tool icon/],
    ['unaccounted general layout rule', css + '\n.probe { width: 1px; }', /general CSS/],
    ['missing general NEWS rule', css.replace(/\.news-hot\{[^}]+\}/, ''), /general CSS/],
    ['changed NEWS layout', css.replace('align-self:flex-end;flex:none;white-space:nowrap;gap:4px;', 'align-self:flex-end;flex:none;white-space:nowrap;gap:40px;'), /NEWS remains/]
]) test(`theme structural guard rejects ${name}`, () => {
    assert.throws(() => assertThemeStructure(source), reason);
});

test('Tool and My Apps icons sit on a Dark plate in Gray/Light with the exact production Dark tokens', () => {
    const body = ruleBody(`${T} :is(#home-view .tool-card .skeleton-icon, .my-app-icon)`);
    const declared = declarations(body);
    for (const [name, value] of Object.entries(darkRootTokens(css))) assert.equal(declared[name], value, name);
    assert.equal(declared['color-scheme'], 'dark');
    assert.equal(declared.background, 'var(--port-surface)', 'plate is the Dark surface #12110f');
    assert.equal(declared.color, 'rgba(var(--port-accent-soft-rgb), 0.68)', 'icon ink equals the Dark .skeleton-icon color');
    for (const layout of ['width', 'height', 'padding', 'margin', 'object-fit', 'border-radius']) {
        assert.equal(Object.hasOwn(declared, layout), false, `${layout}: My Apps sizing and image crop stay as they are`);
    }
    // Specificity beats the transparent home-grid icon rule, so the plate shows on the card.
    assert.match(css, /#home-view\[data-display-size\] \.home-card-grid \.skeleton-icon \{\n    border: 0;\n    background: transparent;/);
});

test('the tuner is no longer Dark-fixed in Gray/Light and follows the theme', () => {
    const part = themePart();
    assert.doesNotMatch(part, /:is\(\.tuner-panel/, 'tuner is not in the Dark-fixed plate list');
    assert.doesNotMatch(part, /\.tuner-panel[^{]*\{[^}]*color-scheme: dark/, 'tuner controls use the light scheme');
    const remap = declarations(ruleBody(`${T} .tuner-panel`));
    assert.deepEqual(remap, {
        '--port-gold-bright': 'var(--port-tuner-accent)',
        '--port-accent-text': 'var(--port-tuner-accent)',
        '--port-accent-text-strong': 'var(--port-tuner-accent)',
        '--port-accent-rgb': 'var(--port-tuner-accent-rgb)',
        '--port-accent-soft-rgb': 'var(--port-tuner-accent-rgb)',
        '--port-accent-switch-rgb': 'var(--port-tuner-accent-rgb)'
    });
    assert.deepEqual(declarations(ruleBody(`${T} .tuner-panel .primary-action`)),
        { 'border-color': 'var(--port-tuner-accent)', color: 'var(--port-tuner-on-accent)', background: 'var(--port-tuner-accent)' });
    assert.match(part, /\.tuner-strings :where\(button\) \{ border-color: rgba\(var\(--port-line-rgb\), 0\.2\); background: var\(--port-field\); \}/);
    assert.match(part, /\.tuner-direction\[data-state="in-tune"\] \{ color: var\(--port-tuner-in-tune\); \}/);
    assert.match(part, /\.notice-error, \.tuner-settings-error, \.tuner-threshold-error,/, 'tuner errors use the theme danger text');
});

const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('Gray/Light tuner tokens: dark neutral accent, semantic green and readable contrast', () => {
    const tokens = (theme) => {
        const part = themePart();
        const all = {};
        for (const [, body] of part.matchAll(new RegExp(`:root\\[data-theme="${theme}"\\] \\{([^}]*)\\}`, 'g'))) Object.assign(all, declarations(body));
        return all;
    };
    for (const [theme, accent, surface, field] of [['gray', '#1d1f23', '#d8dbdf', '#eef0f2'], ['light', '#1c1b18', '#ffffff', '#ffffff']]) {
        const t = tokens(theme);
        assert.equal(t['--port-tuner-accent'], accent, `${theme}: accent is the theme text, not gold`);
        assert.equal(t['--port-surface'], surface);
        assert.ok(contrast(t['--port-tuner-accent'], surface) >= 4.5, `${theme} accent on panel`);
        assert.ok(contrast(t['--port-tuner-accent'], field) >= 4.5, `${theme} accent on strings/select`);
        assert.ok(contrast(t['--port-tuner-on-accent'], t['--port-tuner-accent']) >= 4.5, `${theme} button text`);
        assert.ok(contrast(t['--port-tuner-in-tune'], surface) >= 4.5, `${theme} in-tune green`);
        assert.ok(contrast(t['--port-tuner-in-tune'], field) >= 4.5, `${theme} active string`);
        const [r, g, b] = t['--port-tuner-in-tune-rgb'].split(',').map(Number);
        assert.ok(g > r && g > b, `${theme}: in-tune stays green`);
    }
    assert.match(themePart(), /:root\[data-theme="gray"\] \.tuner-panel \{ --port-danger-text: #7a2029; \}/);
    // Dark keeps its own functional colors.
    const dark = readDarkStyle();
    for (const literal of ['.tuner-direction[data-state="in-tune"] {\n    color: #9fc8a8;', 'border-color: rgba(174, 218, 184, 0.78);', 'color: #e5aca4;']) {
        assert.ok(dark.includes(literal), literal);
    }
});

test('Charcoal: one token block between Dark and Gray; Dark-scheme, bright gold kept, no Gray/Light-only rules', () => {
    const part = themePart();
    const start = part.indexOf(':root[data-theme="charcoal"] {');
    assert.ok(start > 0, 'charcoal token block');
    const body = part.slice(start, part.indexOf('}', start));
    const declared = declarations(body);
    assert.equal(declared['color-scheme'], 'dark');
    for (const name of Object.keys(declared)) assert.match(name, /^(?:color-scheme|--port-[a-z0-9-]+)$/, `${name}: tokens only`);
    for (const name of ['--port-accent-rgb', '--port-gold-bright', '--port-accent-text', '--port-gold']) {
        assert.equal(Object.hasOwn(declared, name), false, `${name}: Charcoal keeps the Dark gold`);
    }
    // Charcoal appears only in its token block and the Port-scoped Sync component block; Gray/Light-only rules
    // (deep gold text, icon plates, tuner remap, status remaps) never apply to it.
    const sync = part.slice(part.indexOf('/* Charcoal: the same Port-scoped Sync component colors'), part.indexOf('/* ── Dark-fixed icon plates'));
    assert.equal([...part.matchAll(/charcoal/g)].length, 1 + [...sync.matchAll(/charcoal/g)].length, 'no other charcoal rules');
    for (const line of sync.split('\n').filter((l) => l.startsWith(':root'))) assert.match(line, /^:root\[data-theme="charcoal"\] /, line);
    assert.doesNotMatch(sync, /accent-text-strong|tuner|plate/);
    // Charcoal text steps: Dark's translucent gold / dim ink drawn opaque on the lifted ground.
    assert.match(sync, /:root\[data-theme="charcoal"\] :is\(\.practice-card-count, \.practice-arrow, \.my-app-external-mark\) \{ color: var\(--port-gold-bright\); \}/);
    assert.match(sync, /:root\[data-theme="charcoal"\] :is\(\.practice-card-memo, \.practice-calendar-weekdays span, \.tempo-slider-limits\) \{ color: rgb\(var\(--port-dim-rgb\)\); \}/);
    assert.match(sync, /:root\[data-theme="charcoal"\] \.news-contact a \{ color: #c8c8ff; \}/);
    const lum = (hex) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const gold = darkRootTokens(css)['--port-gold-bright'];
    for (const surface of [declared['--port-bg'], declared['--port-surface'], declared['--port-panel'], declared['--port-control']]) {
        assert.ok(ratio(declared['--port-text'], surface) >= 4.5, `text on ${surface}`);
        assert.ok(ratio(declared['--port-muted'], surface) >= 4.5, `muted on ${surface}`);
        assert.ok(ratio(gold, surface) >= 4.5, `gold text ${gold} on ${surface}`);
    }
    assert.ok(declared['--port-danger-text'] && ratio(declared['--port-danger-text'], declared['--port-panel']) >= 4.5, 'danger text readable on Charcoal');
    // Lighter than Dark, darker than Gray.
    assert.ok(lum(declared['--port-bg']) > lum(darkRootTokens(css)['--port-bg']) && lum(declared['--port-bg']) < lum('#c8cbd0'));
});

