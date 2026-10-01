'use strict';

// Rhythm Cruise color theme (Dark / Charcoal / Gray / Light): bootstrap, settings contract, generated
// theme layer scope, Dark-fixed functional panels and local-only Cloud Sync behaviour.
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

// ── Cloud Sync: local only ──────────────────────────────────────────────────────────────────
(async function () {
    var source = read('sync/rhythm-sync-adapter.js');
    var context = vm.createContext({ crypto: require('crypto').webcrypto, TextEncoder: TextEncoder, structuredClone: structuredClone, URL: URL, console: console, Event: function () {}, dispatchEvent: function () {} });
    vm.runInContext(source, context);
    var api = context.SoundCruiseRhythmSync;
    assert(api.SYNC_SETTINGS.indexOf('theme') < 0, 'theme is not sent');
    var values = new Map([['rhythmCruiseSettings', saved({ theme: 'charcoal' })]]);
    var storage = { getItem: function (k) { return values.has(k) ? values.get(k) : null; }, setItem: function (k, v) { values.set(k, String(v)); }, removeItem: function (k) { values.delete(k); } };
    assert(JSON.stringify(api.normalizeLocalSnapshot(api.readLocalSnapshot(storage))).indexOf('"theme"') < 0, 'theme never enters the sync snapshot');
    await new api.RhythmSyncAdapter({ storage: storage }).applyRemoteSnapshot({ appId: 'rhythm', schemaVersion: 1, records: [] });
    assert.strictEqual(JSON.parse(values.get('rhythmCruiseSettings')).theme, 'charcoal', 'remote apply keeps the local theme');
    console.log('theme: Dark/Charcoal/Gray/Light bootstrap, settings, layer scope, functional panels and local-only sync OK');
}()).catch(function (error) { console.error(error); process.exit(1); });

// ── Reader-first: received theme is accepted, never sent, never deleted, local theme kept ──────
(async function () {
    var source = read('sync/rhythm-sync-adapter.js');
    var context = vm.createContext({ crypto: require('crypto').webcrypto, TextEncoder: TextEncoder, structuredClone: structuredClone, URL: URL, console: console, Event: function () {}, dispatchEvent: function () {} });
    vm.runInContext(source, context);
    var api = context.SoundCruiseRhythmSync;
    var remote = function (values) { return { appId: 'rhythm', schemaVersion: 1, records: [{ recordType: 'settings', recordId: 'settings', schemaVersion: 1, payload: { id: 'settings', values: values } }] }; };
    ['dark', 'charcoal', 'gray', 'light'].forEach(function (theme) { api.validateSnapshot(remote({ tapLayout: 'ud', theme: theme })); });
    assert.throws(function () { api.validateSnapshot(remote({ tapLayout: 'ud', theme: 'sepia' })); });
    var merged = api.mergeSnapshots(remote({ tapLayout: 'ud' }), remote({ tapLayout: 'ud', theme: 'gray' }));
    assert.strictEqual(merged.conflicts.length, 0);
    assert.strictEqual(merged.snapshot.records.find(function (r) { return r.recordType === 'settings'; }).payload.values.theme, 'gray', 'remote theme survives');
    var values = new Map([['rhythmCruiseSettings', JSON.stringify({ theme: 'charcoal', tapLayout: 'ud' })]]);
    var storage = { getItem: function (k) { return values.has(k) ? values.get(k) : null; }, setItem: function (k, v) { values.set(k, String(v)); }, removeItem: function (k) { values.delete(k); } };
    var adapter = new api.RhythmSyncAdapter({ storage: storage });
    assert(JSON.stringify(api.normalizeLocalSnapshot(api.readLocalSnapshot(storage))).indexOf('"theme"') < 0, 'device theme is never sent');
    await adapter.applyRemoteSnapshot(remote({ tapLayout: 'ud', theme: 'light' })); // no apply / manifest mismatch
    var after = JSON.parse(values.get('rhythmCruiseSettings'));
    assert.strictEqual(after.theme, 'charcoal', 'local theme kept');
    assert.strictEqual(after.themeCloudMirror, 'light', 'received theme mirrored verbatim');
    var echoed = api.normalizeLocalSnapshot(api.readLocalSnapshot(storage)).records.find(function (r) { return r.recordType === 'settings'; });
    assert.strictEqual(echoed.payload.values.theme, 'light', 'local snapshot echoes only the cloud value');
    after.theme = 'gray'; values.set('rhythmCruiseSettings', JSON.stringify(after));
    assert.strictEqual(api.normalizeLocalSnapshot(api.readLocalSnapshot(storage)).records.find(function (r) { return r.recordType === 'settings'; }).payload.values.theme, 'light');
    await adapter.applyRemoteSnapshot(remote({ tapLayout: 'ud' }));
    assert.strictEqual(JSON.parse(values.get('rhythmCruiseSettings')).themeCloudMirror, undefined, 'mirror cleared when cloud has no theme');
    assert.strictEqual(JSON.parse(values.get('rhythmCruiseSettings')).theme, 'gray');
    console.log('theme: reader-first receive OK (accepts 4 values, never sends, never deletes)');
}()).catch(function (error) { console.error(error); process.exit(1); });

