'use strict';

// Chord Cruise color theme (Dark / Gray / Light): storage, settings UI, startup bootstrap,
// Cloud Sync merge semantics and Dark CSS preservation.
var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var webcrypto = crypto.webcrypto;

var root = path.join(__dirname, '..');
var read = function (file) { return fs.readFileSync(path.join(root, file), 'utf8'); };
var storageSource = read('js/core/storage.js');
var settingsSource = read('js/ui/settings.js');
var coreSource = read('js/sync/sync-core.js');
var mergeSource = read('js/sync/sync-merge.js');
var clientSource = read('js/sync/sync-client.js');
var fieldMergeSource = fs.readFileSync(path.join(root, '../shared/sync-account/settings-field-merge.js'), 'utf8');
var css = read('theme.css');
var entries = [['standard', read('standard/index.html')], ['pro', read('pro_k7m4q9v2x8/index.html')]];
var THEME_MARKER = '/* ═══ Color themes: Gray / Light';
var KEY = 'chordCruise.settings';

function memoryStorage(seed) {
    var values = Object.assign({}, seed || {});
    var writes = [];
    return {
        values: values,
        writes: writes,
        api: {
            getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
            setItem: function (key, value) { writes.push(key); values[key] = String(value); },
            removeItem: function (key) { delete values[key]; },
            key: function (index) { return Object.keys(values)[index] || null; },
            get length() { return Object.keys(values).length; }
        }
    };
}

function loadStorage(seed) {
    var store = memoryStorage(seed);
    var context = {
        window: { localStorage: store.api, ChordCruise: { featureAccess: { hasFeature: function () { return false; } } } },
        console: { warn: function () {} }, JSON: JSON, Math: Math, Date: Date
    };
    vm.createContext(context);
    vm.runInContext(storageSource, context, { filename: 'storage.js' });
    return { store: store, context: context, storage: context.window.ChordCruise.storage };
}

function v3(extra) {
    return JSON.stringify(Object.assign({ chordNameSize: 'large', fretNumberSize: 'small' }, extra || {}));
}

// ── Storage ───────────────────────────────────────────────────────────────────────────
(function storageNormalizesThemeWithoutWritingOnLoad() {
    var empty = loadStorage();
    assert.deepStrictEqual(Array.from(empty.storage.VALID_THEMES), ['dark', 'charcoal', 'gray', 'light']);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(empty.storage.getSettingsDefaults(), 'theme'), false,
        'defaults never inject a theme');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(empty.storage.loadSettings(), 'theme'), false, 'missing stays missing');
    assert.deepStrictEqual(empty.store.writes, [], 'loading never writes');

    ['sepia', 'Dark', 1, null, true, ''].forEach(function (value) {
        var env = loadStorage({ 'chordCruise.settings': v3({ theme: value }) });
        assert.strictEqual(Object.prototype.hasOwnProperty.call(env.storage.loadSettings(), 'theme'), false, 'invalid ' + value);
        assert.deepStrictEqual(env.store.writes, [], 'invalid value is not rewritten on load');
    });
    ['dark', 'charcoal', 'gray', 'light'].forEach(function (theme) {
        var env = loadStorage({ 'chordCruise.settings': v3({ theme: theme }) });
        assert.strictEqual(env.storage.loadSettings().theme, theme);
    });

    var old = loadStorage({ 'chordCruise.settings': v3() });
    old.storage.saveSettings({ chordNameSize: 'small' });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(JSON.parse(old.store.values[KEY]), 'theme'), false,
        'saving another setting never adds a theme');
    ['dark', 'charcoal', 'gray', 'light'].forEach(function (theme) {
        var env = loadStorage({ 'chordCruise.settings': v3() });
        assert.strictEqual(env.storage.saveSettings({ theme: theme }), true);
        var saved = JSON.parse(env.store.values[KEY]);
        assert.strictEqual(saved.theme, theme, 'explicit ' + theme + ' is stored');
        assert.strictEqual(saved.chordNameSize, 'large', 'other settings are kept');
    });
}());

// ── Settings UI ───────────────────────────────────────────────────────────────────────
function fakeButton(attribute, value) {
    var attrs = {}; attrs[attribute] = value;
    var classes = new Set();
    return {
        attrs: attrs,
        classes: classes,
        getAttribute: function (name) { return attrs[name]; },
        setAttribute: function (name, next) { attrs[name] = String(next); },
        classList: { toggle: function (name, on) { if (on) classes.add(name); else classes.delete(name); } },
        closest: function (selector) { return selector === '[' + attribute + ']' ? this : null; }
    };
}

function loadSettingsUi(seed) {
    var env = loadStorage(seed);
    var buttons = ['dark', 'charcoal', 'gray', 'light'].map(function (value) { return fakeButton('data-theme-choice', value); });
    var htmlAttrs = {};
    var head = { children: [], appendChild: function (node) { this.children.push(node); node.parent = this; } };
    var clickHandler = null;
    var overlay = {
        addEventListener: function (type, handler) { if (type === 'click') clickHandler = handler; },
        querySelectorAll: function (selector) { return selector === '[data-theme-choice]' ? buttons : []; },
        classList: { add: function () {}, remove: function () {} },
        setAttribute: function () {}
    };
    env.context.window.ChordCruise.state = { settings: env.storage.loadSettings() };
    env.context.window.ChordCruise.ui = { toast: { show: function () {} } };
    env.context.window.CustomEvent = function (type) { this.type = type; };
    env.context.document = {
        head: head,
        body: { classList: { add: function () {}, remove: function () {} } },
        documentElement: { setAttribute: function (name, value) { htmlAttrs[name] = value; } },
        addEventListener: function () {},
        dispatchEvent: function () {},
        getElementById: function (id) { return id === 'cc-settings-overlay' ? overlay : null; },
        querySelectorAll: function () { return []; },
        querySelector: function (selector) {
            if (selector !== 'meta[data-cc-theme-color]') return null;
            return head.children.find(function (node) { return node.attrs['data-cc-theme-color'] !== undefined; }) || null;
        },
        createElement: function () {
            return {
                attrs: {},
                setAttribute: function (name, value) { this.attrs[name] = String(value); },
                remove: function () { var list = this.parent.children; list.splice(list.indexOf(this), 1); }
            };
        }
    };
    vm.runInContext(settingsSource, env.context, { filename: 'settings.js' });
    var api = env.context.window.ChordCruise.ui.settings;
    api.init();
    return {
        env: env, api: api, buttons: buttons, htmlAttrs: htmlAttrs, head: head,
        tap: function (value) { clickHandler({ target: buttons.find(function (b) { return b.attrs['data-theme-choice'] === value; }) }); },
        pressed: function () { return buttons.map(function (b) { return b.attrs['aria-pressed']; }); },
        meta: function () { return head.children[0] ? head.children[0].attrs.content : null; }
    };
}

(function settingsUiAppliesThemeInstantlyAndStoresOnlyExplicitChoices() {
    var ui = loadSettingsUi({ 'chordCruise.settings': v3() });
    assert.strictEqual(ui.htmlAttrs['data-theme'], 'dark', 'missing theme renders Dark');
    assert.strictEqual(ui.meta(), null, 'Dark adds no theme-color meta (unchanged page)');
    assert.deepStrictEqual(ui.pressed(), ['true', 'false', 'false', 'false']);
    assert.deepStrictEqual(ui.env.store.writes, [], 'opening the app and settings never writes the theme');

    ui.tap('light');
    assert.strictEqual(ui.htmlAttrs['data-theme'], 'light', 'applies without reload');
    assert.strictEqual(ui.meta(), '#f7f5ef');
    assert.strictEqual(JSON.parse(ui.env.store.values[KEY]).theme, 'light');
    assert.deepStrictEqual(ui.pressed(), ['false', 'false', 'false', 'true']);
    assert(ui.buttons[3].classes.has('cc-settings-choice--active'));

    ui.tap('charcoal');
    assert.strictEqual(ui.htmlAttrs['data-theme'], 'charcoal');
    assert.strictEqual(ui.meta(), '#424346');
    assert.strictEqual(JSON.parse(ui.env.store.values[KEY]).theme, 'charcoal');
    assert.deepStrictEqual(ui.pressed(), ['false', 'true', 'false', 'false']);

    ui.tap('gray');
    assert.strictEqual(ui.htmlAttrs['data-theme'], 'gray');
    assert.strictEqual(ui.meta(), '#c8cbd0');
    assert.strictEqual(JSON.parse(ui.env.store.values[KEY]).theme, 'gray');

    ui.tap('dark');
    assert.strictEqual(ui.htmlAttrs['data-theme'], 'dark');
    assert.strictEqual(ui.meta(), null, 'switching back to Dark removes the meta again');
    assert.strictEqual(JSON.parse(ui.env.store.values[KEY]).theme, 'dark', 'an explicit Dark is stored');

    var invalid = loadSettingsUi({ 'chordCruise.settings': v3({ theme: 'blue' }) });
    assert.strictEqual(invalid.htmlAttrs['data-theme'], 'dark', 'invalid theme renders Dark');
}());

(function resetReturnsThemeToExplicitDark() {
    assert(/var DISPLAY_SETTING_KEYS = \[\n\s*'theme',/.test(settingsSource), 'theme is part of the display settings reset');
    assert(settingsSource.includes('next.theme = DEFAULT_THEME;'), 'reset saves an explicit Dark');
    var ui = loadSettingsUi({ 'chordCruise.settings': v3({ theme: 'light' }) });
    assert.strictEqual(ui.htmlAttrs['data-theme'], 'light');
    var resetSource = settingsSource.slice(settingsSource.indexOf('function resetDisplaySettings'), settingsSource.indexOf('function buildCustomFretGrid'));
    assert(resetSource.includes('applyTheme(getSettings().theme);'), 'reset applies the theme immediately');
}());

// ── HTML: settings markup and startup bootstrap ───────────────────────────────────────
function runBootstrap(html, values, throwOnRead) {
    var script = html.match(/<script>\s*\/\/ Chord color theme before first paint[\s\S]*?<\/script>/)[0].replace(/<\/?script>/g, '');
    var attrs = {};
    var head = [];
    vm.runInNewContext(script, {
        JSON: JSON,
        localStorage: { getItem: function (key) { if (throwOnRead) throw new Error('blocked'); return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; } },
        document: {
            documentElement: { setAttribute: function (name, value) { attrs[name] = value; } },
            head: { appendChild: function (node) { head.push(node); } },
            createElement: function () { return { attrs: {}, setAttribute: function (n, v) { this.attrs[n] = v; } }; }
        }
    });
    return { theme: attrs['data-theme'], meta: head[0] ? head[0].attrs.content : null };
}

entries.forEach(function (entry) {
    var name = entry[0], html = entry[1];
    var bootstrap = html.indexOf('// Chord color theme before first paint');
    assert(bootstrap > 0 && bootstrap < html.indexOf('rel="stylesheet"'), name + ': bootstrap runs before any stylesheet');
    assert.doesNotMatch(html.slice(bootstrap, html.indexOf('</script>', bootstrap)), /localStorage\.getItem\('(?!chordCruise\.settings')/,
        name + ': reads only chordCruise.settings');
    [
        [{}, 'dark', null], [{ 'chordCruise.settings': v3() }, 'dark', null],
        [{ 'chordCruise.settings': v3({ theme: 'sepia' }) }, 'dark', null], [{ 'chordCruise.settings': '{oops' }, 'dark', null],
        [{ 'chordCruise.settings': v3({ theme: 'dark' }) }, 'dark', null],
        [{ 'chordCruise.settings': v3({ theme: 'charcoal' }) }, 'charcoal', '#424346'],
        [{ 'chordCruise.settings': v3({ theme: 'gray' }) }, 'gray', '#c8cbd0'],
        [{ 'chordCruise.settings': v3({ theme: 'light' }) }, 'light', '#f7f5ef'],
        [{ pitchTrainerSettings: JSON.stringify({ theme: 'light' }), 'cruisePort.settings': JSON.stringify({ theme: 'gray' }) }, 'dark', null]
    ].forEach(function (testCase) {
        var result = runBootstrap(html, testCase[0]);
        assert.strictEqual(result.theme, testCase[1], name + ' ' + JSON.stringify(testCase[0]));
        assert.strictEqual(result.meta, testCase[2], name + ' meta ' + testCase[1]);
    });
    assert.strictEqual(runBootstrap(html, {}, true).theme, 'dark', name + ': storage error is Dark');

    var card = html.indexOf('id="cc-settings-appearance-title"');
    assert(card > 0 && card < html.indexOf('id="cc-settings-fretboard-title"'), name + ': カラーテーマ leads the display settings');
    var section = html.slice(card, html.indexOf('id="cc-settings-fretboard-title"'));
    assert(section.includes('<span class="cc-settings-item-label">カラーテーマ</span>'));
    assert(section.includes('class="cc-settings-choices cc-settings-choices--four" role="group" aria-label="カラーテーマ"'));
    var buttons = Array.from(section.matchAll(/<button type="button" class="cc-settings-choice" data-theme-choice="([a-z]+)" aria-pressed="(true|false)">([^<]+)<\/button>/g));
    assert.deepStrictEqual(buttons.map(function (m) { return [m[1], m[2], m[3]]; }),
        [['dark', 'true', 'ダーク'], ['charcoal', 'false', 'チャコール'], ['gray', 'false', 'グレー'], ['light', 'false', 'ライト']], name + ': four theme choices');
});
assert.strictEqual(entries[0][1].match(/<script>\s*\/\/ Chord color theme[\s\S]*?<\/script>/)[0],
    entries[1][1].match(/<script>\s*\/\/ Chord color theme[\s\S]*?<\/script>/)[0], 'Standard and Pro share one bootstrap');

// Information pages follow the same theme contract with the same bootstrap; their content is unchanged.
var BOOTSTRAP_RE = /<script>\s*\/\/ Chord color theme[\s\S]*?<\/script>/;
var INFO_PAGE_HASHES = {
    // sha256 of each page without the theme bootstrap and with ?v= normalized (1.17.0 content).
    'info.html': '1cce0238df108ddddf6f1293758564b88744b23a565f6c9c985cf7216109aba3',
    'usage.html': 'faafa6ce7fabed29c579e0c1c329b3211c650e3d680a5ecb635357a9114b2256',
    'terms.html': 'cf49bb380f916d9e5c8b5e21a6fab8c54f538f2860915c8dadf4293dc0dcff8b',
    'privacy.html': 'ccdfa364b18cf310a74c7a1b9181c37219b2c312e6fba607ee4d81bba2977fe5'
};
Object.keys(INFO_PAGE_HASHES).forEach(function (file) {
    var html = read(file);
    var bootstrap = html.indexOf('// Chord color theme before first paint');
    assert(bootstrap > 0 && bootstrap < html.indexOf('rel="stylesheet"'), file + ': bootstrap runs before any stylesheet');
    assert.strictEqual(html.match(BOOTSTRAP_RE)[0], entries[0][1].match(BOOTSTRAP_RE)[0], file + ': same bootstrap as the app');
    [
        [{}, 'dark', null], [{ 'chordCruise.settings': v3() }, 'dark', null],
        [{ 'chordCruise.settings': v3({ theme: 'sepia' }) }, 'dark', null], [{ 'chordCruise.settings': '{oops' }, 'dark', null],
        [{ 'chordCruise.settings': v3({ theme: 'dark' }) }, 'dark', null],
        [{ 'chordCruise.settings': v3({ theme: 'charcoal' }) }, 'charcoal', '#424346'],
        [{ 'chordCruise.settings': v3({ theme: 'gray' }) }, 'gray', '#c8cbd0'],
        [{ 'chordCruise.settings': v3({ theme: 'light' }) }, 'light', '#f7f5ef'],
        [{ 'cruisePort.settings': JSON.stringify({ theme: 'light' }) }, 'dark', null]
    ].forEach(function (testCase) {
        var result = runBootstrap(html, testCase[0]);
        assert.strictEqual(result.theme, testCase[1], file + ' ' + JSON.stringify(testCase[0]));
        assert.strictEqual(result.meta, testCase[2], file + ' meta ' + testCase[1]);
    });
    assert.strictEqual(runBootstrap(html, {}, true).theme, 'dark', file + ': storage error is Dark');
    var rest = html.replace(new RegExp(BOOTSTRAP_RE.source + '\\n'), '').replace(/\?v=\d+\.\d+\.\d+/g, '?v=X');
    assert.strictEqual(crypto.createHash('sha256').update(rest).digest('hex'), INFO_PAGE_HASHES[file], file + ': text, links and navigation unchanged');
});
assert(!BOOTSTRAP_RE.test(read('pro-access.html')), 'the PRO access page keeps the Dark Pro gate styling');

// ── CSS: Dark default, color-only themes, fixed objects ───────────────────────────────
(function cssKeepsDarkAndOnlyRecolorsGrayLight() {
    var themeStart = css.indexOf(THEME_MARKER);
    assert(themeStart > 0);
    var dark = css.slice(0, themeStart);
    var themes = css.slice(themeStart);
    assert(!/data-theme/.test(dark), 'no Dark rule depends on data-theme');
    assert(!/prefers-color-scheme|globalTheme/.test(css), 'no OS-theme or cross-app theme');
    var allowed = /^(?:--cc-[a-z0-9-]+|color|color-scheme|background|background-color|background-clip|-webkit-background-clip|border-color|outline-color|box-shadow)$/;
    Array.from(themes.matchAll(/^\s*([a-z-]+|--cc-[a-z0-9-]+):/gm)).forEach(function (m) { assert(allowed.test(m[1]), 'Gray/Light change colors only: ' + m[1]); });
    themes.replace(/\/\*[\s\S]*?\*\//g, '').split('}').forEach(function (chunk) {
        chunk = chunk.replace(/^\s*@media \(hover: hover\) \{/, '');
        var open = chunk.indexOf('{');
        if (open < 0) return;
        var list = [], depth = 0, current = '';
        Array.from(chunk.slice(0, open)).forEach(function (ch) {
            if (ch === '(') depth += 1;
            if (ch === ')') depth -= 1;
            if (ch === ',' && depth === 0) { list.push(current); current = ''; } else current += ch;
        });
        list.push(current);
        list.forEach(function (selector) {
            selector = selector.trim();
            if (!selector) return;
            assert(/^:root(?:\[data-theme="(?:charcoal|gray|light)"\]|:is\((?:\[data-theme="charcoal"\], )?\[data-theme="gray"\], \[data-theme="light"\]\))/.test(selector), selector);
        });
    });
    // Information pages: only colors and shadows are themed; the gold PRO button and badges keep their gold.
    ['.cc-info-lead', '.cc-info-link-card:not(.cc-info-pro-access-button)', '.cc-info-youtube-confirm', ':is(.cc-info-card, .cc-legal-card)',
        ':is(.cc-info-section p, .cc-info-section li, .cc-legal-card p, .cc-legal-card li)'].forEach(function (selector) {
        assert(themes.includes('[data-theme="light"]) ' + selector + ' {'), 'info pages theme ' + selector);
    });
    assert(!/cc-info-pro-access-button \{[^}]*background/.test(themes) && !/cc-info-new-badge \{[^}]*background/.test(themes), 'gold PRO button and New badge keep their gold');
    assert(!/cc-info-youtube-confirm__btn--open/.test(themes), 'YouTube open button keeps its gold');
    assert(!/\.cc-info-link-card(?::hover)? \{/.test(themes), 'link-card recolors never reach the gold PRO access button');
    // Dark token values are the production literals 1:1.
    var rootDecls = css.slice(css.indexOf(':root {') + 7, css.indexOf('}\n'));
    var rootTokens = {};
    Array.from(rootDecls.matchAll(/(--cc-[a-z0-9-]+):\s*([^;]+);/g)).forEach(function (m) { rootTokens[m[1]] = m[2].trim(); });
    assert.strictEqual(rootTokens['--cc-bg'], '#0b0a09');
    assert.strictEqual(rootTokens['--cc-gold'], '#d4af37');
    assert.strictEqual(rootTokens['--cc-accent-rgb'], '212, 175, 55');
    assert.strictEqual(rootTokens['--cc-card-top'], '#20211f');
    assert(!/--cc-gold:/.test(themes.replace(/--cc-gold: #d4af37;/g, '')), 'brand gold is never re-themed');
    // Fretboard and bookshelf objects redeclare the exact Dark tokens in every theme.
    var fixedStart = themes.indexOf(':is(.cc-fb-marker, .cc-fb-barre, .cc-folder-card--design-a, .cc-folder-shelf-board) {');
    assert(fixedStart > 0, 'markers, barre, books and shelf are fixed objects');
    var fixed = themes.slice(fixedStart, themes.indexOf('}', fixedStart));
    Object.keys(rootTokens).forEach(function (name) {
        if (/^--cc-(?:radius|fret-number-size|chord-name-size|accent-text)/.test(name)) return;
        assert(fixed.includes(name + ': ' + rootTokens[name] + ';'), 'fixed object keeps ' + name);
    });
    // Functional fretboard colors and folder/book materials are not themed at all.
    ['--cc-fb-root', '--cc-fb-third', '--cc-fb-fifth', '--cc-fb-seventh', '--cc-book-main', '--cc-book-deep'].forEach(function (name) {
        assert(!themes.includes(name + ':'), name + ' is not themed');
    });
    assert(!/cc-fb-marker--(?:root|third|fifth|sixth|seventh|non-chord|other)/.test(themes), 'marker colors are untouched');
    assert(!/--monochrome/.test(themes.replace(/:not\(\.cc-fb-host--monochrome\)/g, '')), 'monochrome diagrams are untouched');

    // Charcoal: one token block between Dark and Gray; a dark scheme that keeps Dark's gold and inks.
    var CGL = ':root:is([data-theme="charcoal"], [data-theme="gray"], [data-theme="light"])';
    var cStart = themes.indexOf(':root[data-theme="charcoal"] {');
    assert(cStart > 0, 'charcoal token block');
    var cBody = themes.slice(cStart, themes.indexOf('}', cStart));
    var cTokens = {};
    Array.from(cBody.matchAll(/^\s*([a-z-]+|--cc-[a-z0-9-]+):\s*([^;]+);/gm)).forEach(function (m) { cTokens[m[1]] = m[2].trim(); });
    assert.strictEqual(cTokens['color-scheme'], 'dark');
    ['--cc-gold', '--cc-gold-bright', '--cc-accent-rgb', '--cc-accent-bright-rgb', '--cc-accent-line-rgb', '--cc-accent-text', '--cc-champagne',
        '--cc-notice-text', '--cc-danger-text', '--cc-danger-text-soft', '--cc-danger'].forEach(function (name) {
        assert(!(name in cTokens), name + ': Charcoal keeps the Dark value');
    });
    var lum = function (hex) {
        return [1, 3, 5].map(function (i) { var v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
            .reduce(function (sum, v, i) { return sum + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
    };
    var ratio = function (a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    assert(lum(cTokens['--cc-bg']) > lum(rootTokens['--cc-bg']) && lum(cTokens['--cc-bg']) < lum('#c8cbd0'), 'Charcoal sits between Dark and Gray');
    [cTokens['--cc-bg'], cTokens['--cc-surface'], cTokens['--cc-surface-raised']].forEach(function (ground) {
        assert(ratio(cTokens['--cc-text'], ground) >= 6, 'text on ' + ground);
        assert(ratio(cTokens['--cc-text-muted'], ground) >= 4.5, 'muted on ' + ground);
        assert(ratio(rootTokens['--cc-gold-bright'], ground) >= 4.5, 'Dark gold text on ' + ground);
        // Faint is a deliberate dim step (Dark: about 3.1 on its page); Charcoal keeps it brighter than that.
        assert(ratio(cTokens['--cc-text-faint'], ground) >= (ground === cTokens['--cc-surface-raised'] ? 3.5 : 4.5), 'faint on ' + ground);
    });
    // Token-driven rules shared with Gray/Light: fixed objects, Sync components, scrims and info-page wells.
    assert(themes.includes(CGL + ' :is(.cc-fb-marker, .cc-fb-barre, .cc-folder-card--design-a, .cc-folder-shelf-board) {'), 'objects stay Dark in Charcoal');
    assert(themes.includes(CGL + ' :is(.sound-cruise-sync-settings-card, .sound-cruise-sync-setup, .sound-cruise-sync-help,'), 'Sync components follow Charcoal');
    assert(themes.includes(CGL + ' :is(.cc-modal-overlay, .cc-folder-manage-overlay) { background: var(--cc-overlay); }'));
    assert(themes.includes(CGL + ' .cc-info-link-card:not(.cc-info-pro-access-button) { background: rgba(var(--cc-well-rgb), 0.7); }'));
    // Light-page-only rules (inked title, deep gold, white inset highlights, light text steps) never apply to Charcoal.
    ['.cc-home-title', '.cc-refresh-btn', '.cc-app-version-display', '.cc-action-card', '.cc-info-lead', '.cc-fb-mute'].forEach(function (selector) {
        assert(!new RegExp('charcoal[^{]*' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(themes), selector + ' is Gray/Light only');
    });
}());

(function exportAndDrawingLogicUntouchedByTheme() {
    var exportSource = read('js/ui/chord-export.js');
    var fretboardSource = read('js/ui/fretboard.js');
    [exportSource, fretboardSource].forEach(function (source) {
        assert(!/data-theme|theme-color|cc-accent-text/.test(source), 'export and fretboard drawing do not read the theme');
    });
}());

// ── Cloud Sync: initial join, merge and remote apply ──────────────────────────────────
function loadMerge() {
    var window = { crypto: webcrypto };
    var context = { window: window, crypto: webcrypto, TextEncoder: TextEncoder, JSON: JSON, Object: Object, Number: Number, Uint8Array: Uint8Array, Date: Date, Promise: Promise };
    context.globalThis = window;
    vm.createContext(context);
    vm.runInContext(coreSource, context, { filename: 'sync-core.js' });
    vm.runInContext(fieldMergeSource, context, { filename: 'settings-field-merge.js' });
    vm.runInContext(mergeSource, context, { filename: 'sync-merge.js' });
    return window.ChordCruiseSync;
}

function settingsRecord(payload) { return { recordType: 'settings', recordId: 'default', schemaVersion: 1, payload: payload }; }
function cloudOf(local) {
    return {
        ok: true, appId: 'chord', datasetState: 'ready', schemaVersion: 1, recordCount: local.counts.total,
        manifestHash: local.manifestHash, cursor: 'scc1.MQ',
        records: local.records.map(function (item, index) { return Object.assign({}, JSON.parse(JSON.stringify(item)), { revision: index + 1, deletedAt: null, changeSeq: index + 1 }); })
    };
}

(async function cloudSyncCarriesThemePerChordDevice() {
    var sync = loadMerge();
    var base = JSON.parse(JSON.stringify(sync.merge.DEFAULT_SETTINGS));
    assert.strictEqual(base.theme, 'dark', 'merge defaults treat Dark as the unsaved default');
    var withTheme = function (theme) { var s = JSON.parse(JSON.stringify(base)); if (theme === undefined) delete s.theme; else s.theme = theme; return s; };
    var snap = function (payload) { return sync.merge.buildSnapshot([settingsRecord(payload)], webcrypto); };
    var cloud = async function (payload) { return sync.merge.validateCloudSnapshot(cloudOf(await snap(payload)), webcrypto); };
    var themeOf = function (plan) { return plan.finalSnapshot.records.find(function (r) { return r.recordType === 'settings'; }).payload.theme; };

    // Initial join: unsaved and explicit Dark stay "no meaningful local data" (unchanged first-join UX).
    assert.strictEqual(sync.merge.hasMeaningfulLocalData(await snap(withTheme(undefined))), false);
    assert.strictEqual(sync.merge.hasMeaningfulLocalData(await snap(withTheme('dark'))), false, 'explicit Dark after reset');
    assert.strictEqual(sync.merge.hasMeaningfulLocalData(await snap(withTheme('light'))), true, 'a real choice is local data');
    var join = await sync.merge.planMerge({ local: await snap(withTheme('dark')), cloud: await cloud(withTheme('gray')), shadow: [], sessionId: 'join' }, webcrypto);
    assert.strictEqual(join.localState, 'empty');
    assert.strictEqual(join.conflicts.length, 0);
    assert.strictEqual(themeOf(join), 'gray', 'a new device takes the account theme');

    // Old cloud payload without a theme keeps the device's own choice; missing anywhere is Dark.
    var oldPayload = await sync.merge.planMerge({ local: await snap(withTheme('light')), cloud: await cloud(withTheme(undefined)), shadow: [], sessionId: 'old' }, webcrypto);
    assert.strictEqual(oldPayload.conflicts.length, 0);
    assert.strictEqual(themeOf(oldPayload), 'light');

    // Steady sync is record-based: a theme change alters the settings payload hash, so the device
    // pushes it, and a device whose settings still match its shadow applies the cloud record as-is.
    var hashOf = async function (payload) { return (await snap(payload)).records[0].payloadHash; };
    assert.notStrictEqual(await hashOf(withTheme('light')), await hashOf(withTheme(undefined)), 'Light is pushed');
    assert.notStrictEqual(await hashOf(withTheme('gray')), await hashOf(withTheme('light')), 'Gray is pushed');
    assert.notStrictEqual(await hashOf(withTheme('dark')), await hashOf(withTheme('gray')), 'Dark is pushed');

    // When both devices changed settings, the 3-way field merge keeps each theme choice per field.
    var used = function (theme) { var payload = withTheme(theme); payload.chordNameSize = 'large'; return payload; };
    var step = async function (local, remote, shadow) {
        var plan = await sync.merge.planMerge({ local: await snap(local), cloud: await cloud(remote), shadow: (await snap(shadow)).records, sessionId: 'ab' }, webcrypto);
        assert.strictEqual(plan.conflicts.length, 0, JSON.stringify(plan.conflicts).slice(0, 300));
        return themeOf(plan);
    };
    assert.strictEqual(await step(used('light'), used(undefined), used(undefined)), 'light', 'A pushes Light over an old payload');
    assert.strictEqual(await step(used(undefined), used('light'), used(undefined)), 'light', 'B receives Light');
    assert.strictEqual(await step(used('gray'), used('light'), used('light')), 'gray', 'B chooses Gray');
    assert.strictEqual(await step(used('light'), used('gray'), used('light')), 'gray', 'A receives Gray');
    assert.strictEqual(await step(used('dark'), used('gray'), used('gray')), 'dark', 'B chooses Dark');
    assert.strictEqual(await step(used('gray'), used('dark'), used('gray')), 'dark', 'A receives Dark');
    assert.strictEqual(await step(used('charcoal'), used('dark'), used('dark')), 'charcoal', 'B chooses Charcoal');
    assert.strictEqual(await step(used('dark'), used('charcoal'), used('dark')), 'charcoal', 'A receives Charcoal');
    assert.notStrictEqual(await hashOf(withTheme('charcoal')), await hashOf(withTheme('dark')), 'Charcoal is pushed');

    // Remote apply writes the settings record as-is into chordCruise.settings, and storage keeps it.
    assert(clientSource.includes("if (byType.settings[0]) setJsonIfChanged('chordCruise.settings', byType.settings[0].payload);"));
    var applied = loadStorage({ 'chordCruise.settings': JSON.stringify(withTheme('gray')) });
    assert.strictEqual(applied.storage.loadSettings().theme, 'gray');
    applied = loadStorage({ 'chordCruise.settings': JSON.stringify(withTheme('charcoal')) });
    assert.strictEqual(applied.storage.loadSettings().theme, 'charcoal');

    // Cross-app independence: only chordCruise.* is ever written.
    var others = { 'cruisePort.settings': '{"theme":"light"}', pitchTrainerSettings: '{"instrument":"piano"}', fretboard_cruise_state: '{"settings":{"tempo":90}}', rhythmCruiseSettings: '{"tapLayout":"ud"}' };
    var ui = loadSettingsUi(Object.assign({ 'chordCruise.settings': v3() }, others));
    ui.tap('light');
    ui.tap('gray');
    assert.deepStrictEqual(ui.env.store.writes.filter(function (key) { return key.indexOf('chordCruise.') !== 0; }), []);
    Object.keys(others).forEach(function (key) { assert.strictEqual(ui.env.store.values[key], others[key], key); });

    console.log('theme: Dark/Charcoal/Gray/Light storage, UI, bootstrap, info pages, CSS objects and per-app Cloud Sync OK');
}()).catch(function (error) { console.error(error); process.exit(1); });
