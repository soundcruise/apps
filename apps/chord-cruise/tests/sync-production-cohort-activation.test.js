'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var source = fs.readFileSync(path.join(root, 'js/sync/sync-cohort-activation.js'), 'utf8');
var bootstrapSource = fs.readFileSync(path.join(root, 'js/sync/sync-bootstrap.js'), 'utf8');
var standardHtml = fs.readFileSync(path.join(root, 'standard/index.html'), 'utf8');
var proHtml = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/index.html'), 'utf8');
var activationHtml = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/sync-cohort.html'), 'utf8');
var STORAGE_KEY = 'chordCruise.syncProductionCohort';

function storage(initial) {
    var values = Object.assign({}, initial || {});
    var writes = [];
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem: function (key, value) { values[key] = String(value); writes.push({ key: key, value: String(value) }); },
        removeItem: function (key) { delete values[key]; },
        values: values,
        writes: writes
    };
}

function loadActivation(localStorage, edition) {
    var listeners = {};
    var rootElement = { getAttribute: function (name) { return name === 'data-app-edition' ? edition : null; } };
    var document = {
        readyState: 'loading',
        documentElement: rootElement,
        addEventListener: function (name, callback) { listeners[name] = callback; },
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; },
        getElementById: function () { return null; }
    };
    var window = {
        document: document,
        localStorage: localStorage,
        location: { assign: function () {}, replace: function () {} }
    };
    vm.runInNewContext(source, { window: window, globalThis: window, JSON: JSON, Object: Object, Array: Array, Date: Date }, { filename: 'sync-cohort-activation.js' });
    return window.ChordCruiseSyncCohortActivation;
}

function loadPrivateEntry() {
    var ready;
    var click;
    var assigned = [];
    var display = { addEventListener: function (name, callback) { if (name === 'click') click = callback; } };
    var document = {
        readyState: 'loading',
        documentElement: { getAttribute: function (name) { return name === 'data-app-edition' ? 'Pro' : null; } },
        addEventListener: function (name, callback) { if (name === 'DOMContentLoaded') ready = callback; },
        querySelector: function () { return null; },
        querySelectorAll: function (selector) { return selector === '.cc-app-version-display' ? [display] : []; },
        getElementById: function () { return null; }
    };
    var window = {
        document: document,
        localStorage: storage(),
        location: { assign: function (url) { assigned.push(url); }, replace: function () {} }
    };
    vm.runInNewContext(source, { window: window, globalThis: window, JSON: JSON, Object: Object, Array: Array, Date: Date }, { filename: 'sync-cohort-activation.js' });
    ready();
    return { click: function () { click(); }, assigned: assigned };
}

function runBootstrap(options) {
    var appended = [];
    var session = options.session || {};
    var document = {
        documentElement: { getAttribute: function (name) { return name === 'data-app-edition' ? options.edition : null; } },
        currentScript: { src: 'https://soundcruise.jp/apps/chord-cruise/js/sync/sync-bootstrap.js' },
        createElement: function () { return {}; },
        head: { appendChild: function (script) { appended.push(script.src); } }
    };
    var window = {
        location: { hostname: 'soundcruise.jp', search: options.search || '' },
        document: document,
        __SOUND_CRUISE_SYNC_PILOT__: options.explicitFlag,
        ChordCruiseSyncCohortActivation: options.activation,
        sessionStorage: {
            getItem: function (key) { return session[key] || null; },
            setItem: function (key, value) { session[key] = value; },
            removeItem: function (key) { delete session[key]; }
        }
    };
    vm.runInNewContext(bootstrapSource, { window: window, globalThis: window, Promise: Promise, Object: Object, Error: Error }, { filename: 'sync-bootstrap.js' });
    return { api: window.ChordCruiseSyncPilot, appended: appended };
}

(async function () {
    var emptyStorage = storage();
    var empty = loadActivation(emptyStorage, 'Pro');
    assert.strictEqual(empty.isEnabled(), false, 'missing activation state fails closed');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(empty.readState())), { version: 1, enabled: false });

    var malformed = loadActivation(storage({ [STORAGE_KEY]: '{bad json' }), 'Pro');
    assert.strictEqual(malformed.isEnabled(), false, 'invalid JSON fails closed');
    var unknown = loadActivation(storage({ [STORAGE_KEY]: JSON.stringify({ version: 2, enabled: true }) }), 'Pro');
    assert.strictEqual(unknown.isEnabled(), false, 'unknown activation version fails closed');
    var invalidShape = loadActivation(storage({ [STORAGE_KEY]: JSON.stringify({ version: 1, enabled: 'true' }) }), 'Pro');
    assert.strictEqual(invalidShape.isEnabled(), false, 'malformed activation fields fail closed');

    var safariStorage = storage({ chordCruiseLibrary: 'local-data', soundCruiseSyncSentinel: 'credential-and-outbox-untouched' });
    var safari = loadActivation(safariStorage, 'Pro');
    assert.strictEqual(safari.setEnabled(true), true);
    assert.strictEqual(safari.isEnabled(), true);
    assert.deepStrictEqual(JSON.parse(safariStorage.values[STORAGE_KEY]), { version: 1, enabled: true });
    assert.strictEqual(loadActivation(safariStorage, 'Pro').isEnabled(), true, 'activation survives reload in the same container');

    var pwaStorage = storage();
    var pwa = loadActivation(pwaStorage, 'Pro');
    assert.strictEqual(pwa.isEnabled(), false, 'a separate container does not inherit Safari activation');
    assert.strictEqual(pwa.setEnabled(true), true);
    assert.strictEqual(safari.isEnabled(), true, 'PWA activation does not alter Safari state');

    assert.strictEqual(safari.setEnabled(false), true);
    assert.strictEqual(safari.isEnabled(), false);
    assert.strictEqual(safariStorage.values.chordCruiseLibrary, 'local-data', 'deactivation preserves local Chord data');
    assert.strictEqual(safariStorage.values.soundCruiseSyncSentinel, 'credential-and-outbox-untouched', 'deactivation does not touch Sync state');
    assert.deepStrictEqual(safariStorage.writes.map(function (write) { return write.key; }), [STORAGE_KEY, STORAGE_KEY], 'activation only writes its own state key');

    var inactiveProduction = runBootstrap({ edition: 'Pro', activation: safari });
    assert.strictEqual(inactiveProduction.api.enabled, true, 'official Pro ignores a disabled legacy activation state');
    assert.strictEqual(inactiveProduction.appended.length, 1, 'official Pro starts lazy Sync loading');

    var activeProduction = runBootstrap({ edition: 'Pro', activation: pwa });
    assert.strictEqual(activeProduction.api.enabled, true, 'legacy activation remains harmless for official production Pro');
    assert.strictEqual(activeProduction.appended.length, 1);
    assert(activeProduction.appended[0].endsWith('/sync-core.js'));

    var missingActivationProduction = runBootstrap({ edition: 'Pro' });
    assert.strictEqual(missingActivationProduction.api.enabled, true, 'official Pro does not require activation state to exist');
    assert.strictEqual(missingActivationProduction.appended.length, 1);

    var standardBypass = runBootstrap({ edition: 'Standard', activation: pwa, explicitFlag: true, session: { 'soundCruise.syncPilot.enabled': 'enabled' }, search: '?sync=1' });
    assert.strictEqual(standardBypass.api.enabled, false, 'Standard cannot use a copied activation state');
    assert.strictEqual(standardBypass.appended.length, 0);
    var productionBypass = runBootstrap({ edition: 'Pro', activation: safari, explicitFlag: true, session: { 'soundCruise.syncPilot.enabled': 'enabled' }, search: '?sync=1' });
    assert.strictEqual(productionBypass.api.enabled, true, 'official production Pro is enabled independently of query, session, and local-QA globals');
    assert.strictEqual(productionBypass.appended.length, 1);

    assert.strictEqual(standardHtml.includes('sync-cohort'), false, 'Standard has no activation route reference or controller');
    assert(proHtml.includes('../js/sync/sync-cohort-activation.js?v=1.10.11'), 'Pro loads only the small activation controller');
    assert(proHtml.indexOf('sync-cohort-activation.js') < proHtml.indexOf('sync-bootstrap.js'), 'activation state is available before bootstrap');
    assert.strictEqual(proHtml.includes('クラウド同期 先行テスト'), false, 'normal Pro UI does not expose the cohort entry');
    assert(activationHtml.includes('data-app-edition="Pro"'));
    assert(activationHtml.includes('data-sync-cohort-page'));
    assert(activationHtml.includes('../../shared/pro-gate.js?v=21'), 'activation route uses the formal Pro gate');
    assert(activationHtml.includes('id="sync-cohort-enable"'));
    assert(activationHtml.includes('id="sync-cohort-disable"'));
    assert.strictEqual(source.includes('location.search'), false, 'activation controller has no query-parameter path');
    assert.strictEqual(source.includes('sessionStorage'), false, 'activation controller has no session bypass');
    assert.strictEqual(source.includes('indexedDB'), false, 'activation/deactivation never touches Sync IndexedDB');
    assert.strictEqual(source.includes('console.'), false, 'activation state and navigation are not logged');

    var privateEntry = loadPrivateEntry();
    for (var tap = 0; tap < 6; tap += 1) privateEntry.click();
    assert.strictEqual(privateEntry.assigned.length, 0, 'normal taps do not reveal or open the cohort route');
    privateEntry.click();
    assert.deepStrictEqual(privateEntry.assigned, ['./sync-cohort.html'], 'seven deliberate version taps open the same-container route');

    console.log('sync-production-cohort-activation: legacy activation safety, official Pro enablement, Standard isolation, and safe deactivation passed');
}()).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
