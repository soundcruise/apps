'use strict';

// Rhythm Cruise color theme (Dark / Charcoal / Gray / Light): bootstrap, settings contract, generated
// theme layer scope, Dark-fixed functional panels and Cloud Sync (writer) behaviour.
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var read = function (file) { return fs.readFileSync(path.join(root, file), 'utf8'); };
var script = read('script.js');
var layer = read('theme-colors.css');
var pages = [['standard', read('standard/index.html')], ['pro', read('pro_r4m8k7n2q9x/index.html')]];
var BOOT_RE = /<script>\s*\/\/ Rhythm color theme before first paint[\s\S]*?<\/script>/;
var SCOPE = ':root:is([data-theme="charcoal"], [data-theme="gray"], [data-theme="light"])';
var SCOPE_RE = /^:root(\[data-theme="(charcoal|gray|light)"\]|:is\((\[data-theme="(charcoal|gray|light)"\](, )?)+\))/;

function runBootstrap(html, value, throwOnRead) {
    var code = html.match(BOOT_RE)[0].replace(/<\/?script>/g, '');
    var attrs = {};
    var head = [];
    vm.runInNewContext(code, {
        JSON: JSON,
        localStorage: { getItem: function (key) { if (throwOnRead) throw new Error('blocked'); return key === 'rhythmCruiseSettings' ? value : null; } },
        document: {
            documentElement: { setAttribute: function (n, v) { attrs[n] = v; } },
            head: { appendChild: function (node) { head.push(node); } },
            createElement: function () { return { attrs: {}, setAttribute: function (n, v) { this.attrs[n] = v; } }; }
        }
    });
    return { theme: attrs['data-theme'], meta: head[0] ? head[0].attrs.content : null };
}
var saved = function (extra) { return JSON.stringify(Object.assign({ threshold: 0.03, tapLayout: 'lr' }, extra)); };

// ── Pages: bootstrap before stylesheets, layer last, settings card (no new tab) ──────────────────
pages.forEach(function (entry) {
    var name = entry[0], html = entry[1];
    var at = html.indexOf('// Rhythm color theme before first paint');
    assert(at > 0 && at < html.indexOf('rel="stylesheet"'), name + ': bootstrap precedes stylesheets');
    var links = (html.match(/<link[^>]*rel="stylesheet"[^>]*>/g) || []).filter(function (l) { return l.indexOf('fonts.googleapis.com') < 0; });
    assert(links[links.length - 1].indexOf('../theme-colors.css?v=') >= 0, name + ': theme layer is the last local stylesheet');
    assert(html.indexOf('<meta name="theme-color" content="#070b11">') >= 0, name + ': Dark theme-color meta unchanged');
    [[null, 'dark', null], [saved({}), 'dark', null], [saved({ theme: 'sepia' }), 'dark', null], ['{x', 'dark', null],
        [saved({ theme: 'dark' }), 'dark', null], [saved({ theme: 'charcoal' }), 'charcoal', '#424346'],
        [saved({ theme: 'gray' }), 'gray', '#c8cbd0'], [saved({ theme: 'light' }), 'light', '#f6f4ef']].forEach(function (c) {
        var r = runBootstrap(html, c[0]);
        assert.strictEqual(r.theme, c[1], name + ' ' + c[0]);
        assert.strictEqual(r.meta, c[2], name + ' meta');
    });
    assert.strictEqual(runBootstrap(html, null, true).theme, 'dark');
    assert.strictEqual(html.match(BOOT_RE)[0], pages[0][1].match(BOOT_RE)[0], name + ': same bootstrap');
    var card = html.slice(html.indexOf('id="rc-theme-card"'), html.indexOf('id="settings-reset-all-wrap"'));
    var buttons = [];
    card.replace(/data-theme-choice="([a-z]+)" aria-pressed="(true|false)">([^<]+)</g, function (m, v, p, l) { buttons.push([v, p, l]); });
    assert.deepStrictEqual(buttons, [['dark', 'true', 'ダーク'], ['charcoal', 'false', 'チャコール'], ['gray', 'false', 'グレー'], ['light', 'false', 'ライト']],
        name + ': カラーテーマ card sits in the shared area above 全てを初期化する');
    assert.strictEqual((html.match(/class="settings-tab[ "]/g) || []).length, 4, name + ': no settings tab was added');
});

// ── Settings contract ────────────────────────────────────────────────────────────────────────
assert(/const RHYTHM_THEMES = \['dark', 'charcoal', 'gray', 'light'\];/.test(script));
assert(/state\.theme = s\.theme; \/\/ 保存値はそのまま保持/.test(script), 'loadSettings keeps the raw stored value');
assert(/theme: state\.theme, \/\/ 明示的に選ばれたときだけ値がある/.test(script), 'saveSettings rebuilds with the theme explicitly');
var load = script.slice(script.indexOf('function loadSettings() {'), script.indexOf('function saveSettings() {'));
assert(!/localStorage\.setItem|saveSettings\(\)/.test(load), 'loading never writes');
assert(script.indexOf('RHYTHM_CRUISE_RESET_LOCAL_STORAGE_KEYS = [\n    SETTINGS_KEY,') >= 0, '全てを初期化する clears the theme with the settings (→ Dark)');

// applyRhythmTheme behaviour
(function () {
    var start = script.indexOf('const RHYTHM_THEMES');
    var end = script.indexOf('/* マイク設定プリセット');
    var nodes = [];
    var darkMeta = { attrs: { content: '#070b11' } };
    nodes.push(darkMeta);
    var buttons = ['dark', 'charcoal', 'gray', 'light'].map(function (t) {
        return { t: t, cls: {}, attrs: {}, getAttribute: function () { return this.t; }, setAttribute: function (n, v) { this.attrs[n] = v; },
            classList: { toggle: function (c, on) { this.on = on; } } };
    });
    var doc = {
        documentElement: { attrs: {}, setAttribute: function (n, v) { this.attrs[n] = v; } },
        head: { insertBefore: function (m, ref) { nodes.splice(nodes.indexOf(ref), 0, m); }, querySelector: function () { return darkMeta; } },
        querySelector: function () { return nodes.filter(function (n) { return n !== darkMeta; })[0] || null; },
        querySelectorAll: function () { return buttons; },
        createElement: function () { return { attrs: {}, setAttribute: function (n, v) { this.attrs[n] = v; }, remove: function () { nodes.splice(nodes.indexOf(this), 1); } }; }
    };
    var ctx = vm.createContext({ document: doc });
    vm.runInContext(script.slice(start, end) + '\nthis.apply = applyRhythmTheme; this.resolve = resolveRhythmTheme;', ctx);
    ctx.apply('light');
    assert.strictEqual(doc.documentElement.attrs['data-theme'], 'light');
    assert.strictEqual(nodes[0].attrs.content, '#f6f4ef', 'theme meta precedes the Dark meta');
    assert.strictEqual(buttons[3].attrs['aria-pressed'], 'true');
    ctx.apply('dark');
    assert.deepStrictEqual(nodes, [darkMeta]);
    [undefined, 'Light', 'sepia', 1].forEach(function (v) { assert.strictEqual(ctx.resolve(v), 'dark'); });
}());

// ── Generated layer: scope, functional panels, judgement colors ──────────────────────────────
(function () {
    var body = layer.replace(/\/\*[\s\S]*?\*\//g, '');
    var depth = 0, selector = '';
    for (var i = 0; i < body.length; i++) {
        var ch = body[i];
        if (ch === '{') {
            var sel = selector.trim();
            if (!/^@(media|supports|keyframes)/.test(sel) && !/^((from|to|\d+(\.\d+)?%)\s*,?\s*)+$/.test(sel)) {
                sel.split(/,\s*(?![^()]*\))/).forEach(function (part) {
                    var p = part.trim();
                    assert(p.indexOf(SCOPE) === 0 || SCOPE_RE.test(p), 'layer selector is theme-scoped: ' + p.slice(0, 100));
                });
            }
            depth += 1; selector = '';
        } else if (ch === '}') { depth -= 1; selector = ''; } else if (ch === ';' && depth > 0) { selector = ''; } else { selector += ch; }
    }
    assert(!/data-theme="dark"|prefers-color-scheme/.test(layer));
    assert(!/--early-color:|--just-color:|--late-color:/.test(layer), 'judgement colors are never themed');
    assert(/\.lane-wrap,[\s\S]*?\.review-wrap \{\n    background-color: #090d13 !important;/.test(layer), 'lanes and review keep their Dark ground');
    assert(/\.lane-wrap,[\s\S]*?\.pce-vex-scroll \{\n    color-scheme: normal;\n    --bg-color: #120f0c;/.test(layer), 'functional panels keep Dark surface tokens');
    assert(/\.result-graph-scroll,[\s\S]*?\.pce-vex-scroll \{\n    background-color: #10141a !important;/.test(layer), 'graphs and score editor keep their Dark ground');
}());

// ── Cloud Sync writer: explicit theme sent, unset never sent, received theme adopted, absence keeps it ──
(async function () {
    var source = read('sync/rhythm-sync-adapter.js');
    var events = [];
    var context = vm.createContext({ crypto: require('crypto').webcrypto, TextEncoder: TextEncoder, structuredClone: structuredClone, URL: URL, console: console,
        Event: function (type) { this.type = type; }, dispatchEvent: function (event) { events.push(event.type); } });
    vm.runInContext(source, context);
    var api = context.SoundCruiseRhythmSync;
    assert.deepStrictEqual(Array.from(api.SYNC_CAPABILITIES), ['settings_theme_v1']);
    assert.deepStrictEqual(Array.from(api.SYNC_OPTIONAL_SETTINGS), ['theme']);
    assert(api.SYNC_SETTINGS.indexOf('theme') < 0, 'theme has no default, so it stays out of the default-based list');
    var mem = function (settings) {
        var values = new Map([['rhythmCruiseSettings', JSON.stringify(settings)]]);
        return { values: values, storage: { getItem: function (k) { return values.has(k) ? values.get(k) : null; }, setItem: function (k, v) { values.set(k, String(v)); }, removeItem: function (k) { values.delete(k); } },
            settings: function () { return JSON.parse(values.get('rhythmCruiseSettings')); } };
    };
    var sent = function (settings) {
        var record = api.normalizeLocalSnapshot(api.readLocalSnapshot(mem(settings).storage)).records.find(function (r) { return r.recordType === 'settings'; });
        return record ? record.payload.values : undefined;
    };
    assert.deepStrictEqual(Array.from(new api.RhythmSyncAdapter({ storage: mem({}).storage }).syncCapabilities), ['settings_theme_v1']);
    assert.strictEqual(sent({ theme: 'charcoal', tapLayout: 'ud' }).theme, 'charcoal');
    assert.strictEqual(sent({ theme: 'dark', tapLayout: 'ud' }).theme, 'dark', 'an explicit Dark (after reset) is sent');
    assert.strictEqual(sent({ tapLayout: 'ud' }).theme, undefined, 'unset is never sent as dark');
    assert.strictEqual(sent({ tapLayout: 'ud', themeCloudMirror: 'light' }).theme, 'light', 'mirror stands in for an unset theme');
    assert.strictEqual(sent({ theme: 'gray', tapLayout: 'ud', themeCloudMirror: 'light' }).theme, 'gray');
    assert.strictEqual(sent({ theme: 'sepia', tapLayout: 'ud' }).theme, undefined);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(sent({ theme: 'gray' }))), { theme: 'gray' }, 'a theme-only settings record');
    assert.strictEqual(sent({}), undefined, 'nothing to send: no settings record');
    var remote = function (values) { return { appId: 'rhythm', schemaVersion: 1, records: [{ recordType: 'settings', recordId: 'settings', schemaVersion: 1, payload: { id: 'settings', values: values } }] }; };
    ['dark', 'charcoal', 'gray', 'light'].forEach(function (theme) { api.validateSnapshot(remote({ tapLayout: 'ud', theme: theme })); });
    assert.throws(function () { api.validateSnapshot(remote({ tapLayout: 'ud', theme: 'sepia' })); });
    var merged = api.mergeSnapshots(remote({ tapLayout: 'ud' }), remote({ tapLayout: 'ud', theme: 'gray' }));
    assert.strictEqual(merged.conflicts.length, 0);
    assert.strictEqual(merged.snapshot.records.find(function (r) { return r.recordType === 'settings'; }).payload.values.theme, 'gray', 'remote theme survives');
    var device = mem({ theme: 'charcoal', tapLayout: 'ud', threshold: 0.05 });
    await new api.RhythmSyncAdapter({ storage: device.storage }).applyRemoteSnapshot(remote({ tapLayout: 'ud', theme: 'light' }));
    assert.strictEqual(device.settings().theme, 'light', 'a received theme becomes the device theme');
    assert.strictEqual(device.settings().themeCloudMirror, undefined);
    assert.strictEqual(device.settings().threshold, 0.05, 'device-only settings are untouched');
    assert.deepStrictEqual(events, ['sound-cruise-rhythm-sync-applied'], 'the open app is told to re-read the theme');
    var mirrored = mem({ tapLayout: 'ud', themeCloudMirror: 'gray' });
    await new api.RhythmSyncAdapter({ storage: mirrored.storage }).applyRemoteSnapshot(remote({ tapLayout: 'ud', theme: 'gray' }));
    assert.strictEqual(mirrored.settings().theme, 'gray', 'the mirror is adopted as the explicit theme');
    assert.strictEqual(mirrored.settings().themeCloudMirror, undefined, 'and retired');
    // App side: the listener re-reads only the theme; the display falls back to the kept cloud theme.
    assert(script.indexOf("window.addEventListener('sound-cruise-rhythm-sync-applied', hydrateRhythmSyncedSettings);") > 0, 'synced settings (theme included) are re-read after a Cloud Sync apply');
    assert(/state\.theme = s\.theme; \/\/ display only[^\n]*\n    applyRhythmTheme\(rhythmThemeOf\(s\)\);/.test(script), 'the theme is refreshed right away');
    assert(/applyRhythmTheme\(rhythmThemeOf\(s\)\);/.test(script.slice(script.indexOf('function loadSettings()'))), 'load shows the device theme');
    console.log('theme: Cloud Sync writer OK (explicit sent, unset never sent, received adopted, absence keeps it)');
}()).catch(function (error) { console.error(error); process.exit(1); });

// ── Information pages ────────────────────────────────────────────────────────────────────────────
// Normal information / help pages follow the app theme with the same bootstrap and a page-group layer.
// Their content is untouched: removing the bootstrap and the layer link gives the original file.
// Pro acquisition pages stay Dark and byte-identical. The microphone diagrams stay Dark objects.
(function () {
    var crypto = require('crypto');
    var sha256 = function (text) { return crypto.createHash('sha256').update(text).digest('hex'); };
    var INFO_PAGES = {
        'info.html': ['./theme-colors-info.css', 'bdbcca3ff4d2d0c5f94c15b34535a75e621c171cc6666992a84f7065d133547f'],
        'terms.html': ['./theme-colors-legal.css', '7180771fb19f7bd0d78d427fc9519299892a31d8e0028dd99a41703efbb5a0fe'],
        'privacy.html': ['./theme-colors-legal.css', 'b53df1059a9a3a5e1bd94682a13f03a110af010d9f2ad05cb8445c558432a033'],
        'usage.html': ['./theme-colors-help.css', '46e6bd4a09e2e4f066f8948b851e83c135ce8e79a4f845b08701a86069524d3b'],
        'mic-correction-help.html': ['./theme-colors-help.css', '4088e435b8799aa0197e7a9fa3168de1d442c9a2fce2bb583c2a7a7bed1382b3'],
        'click-input-help.html': ['./theme-colors-click-help.css', '3f9b035f2d03903410fee9775cc88387708f2f4a8f89d0febd95d5754871cce5'],
        'mic-restart-help.html': ['./theme-colors-mic-help.css', '5593fd5838dfbc2bf37d40646b711ae2946f9105a5137c97bed0eaf3d72b9bad']
    };
    var DARK_PAGES = {
        'pro-access.html': '0adc9147d138a10cff56e4f7602a0a2958907a05b317bfa9befe116cca23a2c1',
        'iphone-safari-guide.html': 'e9ae187776fae0f407c76b30a0272318f5fe8c91cea5bbd7c890983af93c496c'
    };
    var appBoot = pages[0][1].match(BOOT_RE)[0].replace(/\n\s+/g, '\n');
    Object.keys(INFO_PAGES).forEach(function (file) {
        var html = read(file);
        var boot = html.match(BOOT_RE);
        assert(boot, file);
        assert.strictEqual(boot[0].replace(/\n\s+/g, '\n'), appBoot, file + ': same bootstrap as the app');
        assert(html.indexOf(boot[0]) < html.indexOf('rel="stylesheet"'), file + ': bootstrap before any stylesheet');
        var darkMeta = html.indexOf('<meta name="theme-color"');
        assert(darkMeta < 0 || html.indexOf(boot[0]) < darkMeta, file + ': themed meta is added ahead of the Dark one');
        var link = html.match(/\n *<link rel="stylesheet" href="(\.\/theme-colors-[a-z-]+\.css)\?v=([\d.]+)">/);
        assert(link && link[1] === INFO_PAGES[file][0], file + ': loads ' + INFO_PAGES[file][0]);
        [[null, 'dark', null], ['{broken', 'dark', null], [saved({ theme: 'sepia' }), 'dark', null], [saved({ theme: 'dark' }), 'dark', null],
            [saved({ theme: 'charcoal' }), 'charcoal', '#424346'], [saved({ theme: 'gray' }), 'gray', '#c8cbd0'],
            [saved({ theme: 'light' }), 'light', '#f6f4ef']].forEach(function (c) {
            assert.deepStrictEqual(runBootstrap(html, c[0]), { theme: c[1], meta: c[2] }, file + ' ' + c[0]);
        });
        assert.strictEqual(runBootstrap(html, null, true).theme, 'dark', file + ': storage error is Dark');
        var original = html.replace(new RegExp('\\n *' + BOOT_RE.source), '').replace(link[0], '');
        assert.strictEqual(sha256(original), INFO_PAGES[file][1], file + ': text, links and navigation unchanged');
        var css = read(link[1].slice(2));
        css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map(function (b) { return b.trim().replace(/^@media[^{]*\{\s*/, ''); })
            .filter(function (b) { return b.indexOf('{') > 0 && b.indexOf('@keyframes') !== 0 && !/^(from|to|\d)/.test(b); })
            .forEach(function (block) {
                block.slice(0, block.indexOf('{')).split(/,\n/).forEach(function (sel) { assert(SCOPE_RE.test(sel.trim()), link[1] + ': ' + sel.trim().slice(0, 80)); });
            });
    });
    var clickLayer = read('theme-colors-click-help.css');
    assert(clickLayer.indexOf(SCOPE + ':not(:has(> body.pro-gate-active)) .click-help-figure {\n    background-color: #1d1b1a !important;\n}') > 0, 'diagrams keep the measured Dark ground');
    assert(/\.click-help-figure text \{\n    fill: #fdf6ee;/.test(clickLayer), 'diagram labels keep their Dark ink');
    Object.keys(DARK_PAGES).forEach(function (file) {
        assert.strictEqual(sha256(read(file)), DARK_PAGES[file], file + ': Pro acquisition page stays Dark and unchanged');
    });
    console.log('theme: information pages follow the theme; content and Pro acquisition pages unchanged OK');
}());
