'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var source = fs.readFileSync(path.join(root, 'js/sync/sync-bootstrap.js'), 'utf8');
var activationSource = fs.readFileSync(path.join(root, 'js/sync/sync-cohort-activation.js'), 'utf8');
var standardHtml = fs.readFileSync(path.join(root, 'standard/index.html'), 'utf8');
var proHtml = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/index.html'), 'utf8');
var fixtureHtml = fs.readFileSync(path.join(root, 'tests/fixtures/sync-pilot-on.html'), 'utf8');

function runBootstrap(hostname, sessionValue, explicitFlag, edition, activationValue) {
    var appendCount = 0;
    var values = sessionValue ? { 'soundCruise.syncPilot.enabled': sessionValue } : {};
    var localValues = activationValue ? { 'chordCruise.syncProductionCohort': activationValue } : {};
    var window = {
        location: { hostname: hostname },
        __SOUND_CRUISE_SYNC_PILOT__: explicitFlag,
        localStorage: {
            getItem: function (key) { return localValues[key] || null; },
            setItem: function (key, value) { localValues[key] = value; }
        },
        sessionStorage: {
            getItem: function (key) { return values[key] || null; },
            setItem: function (key, value) { values[key] = value; },
            removeItem: function (key) { delete values[key]; }
        },
        document: {
            readyState: 'loading',
            documentElement: { getAttribute: function (name) { return name === 'data-app-edition' ? (edition || null) : null; } },
            currentScript: { src: 'https://' + hostname + '/apps/chord-cruise/js/sync/sync-bootstrap.js' },
            createElement: function () { return {}; },
            head: { appendChild: function () { appendCount += 1; } },
            addEventListener: function () {},
            querySelector: function () { return null; },
            querySelectorAll: function () { return []; },
            getElementById: function () { return null; }
        }
    };
    var context = { window: window, Promise: Promise, Object: Object, Error: Error };
    vm.createContext(context);
    vm.runInContext(activationSource, context, { filename: 'sync-cohort-activation.js' });
    vm.runInContext(source, context, { filename: 'sync-bootstrap.js' });
    return { api: window.ChordCruiseSyncPilot, appendCount: appendCount, values: values };
}

async function runProductionLoad(hasCredential) {
    var appended = [];
    var installed = 0;
    var background = 0;
    var watched = 0;
    var client = {
        initialize: async function () { return { enabled: true, ready: true }; },
        openStore: async function () {
            return {
                getMeta: async function (key) {
                    if (key === 'deviceCredential' && hasCredential) return { credential: 'opaque' };
                    if (key === 'datasetState' && hasCredential) return 'ready';
                    return null;
                }
            };
        },
        watchLocalMutations: function () { watched += 1; },
        startBackgroundSync: function () { background += 1; }
    };
    var document = {
        documentElement: { getAttribute: function (name) { return name === 'data-app-edition' ? 'Pro' : null; } },
        currentScript: { src: 'https://soundcruise.jp/apps/chord-cruise/js/sync/sync-bootstrap.js' },
        createElement: function () { return {}; },
        head: {
            appendChild: function (script) {
                appended.push(script.src);
                if (script.src.split('?')[0].endsWith('/sync-client.js')) {
                    window.ChordCruiseSync = { client: { createClient: function () { return client; } } };
                }
                if (script.src.includes('/sync-pairing-ui.js')) {
                    window.ChordCruiseSync.pairingUi = { install: function () { installed += 1; } };
                }
                Promise.resolve().then(script.onload);
            }
        }
    };
    var window = {
        location: { hostname: 'soundcruise.jp' },
        document: document,
        sessionStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} }
    };
    var context = { window: window, globalThis: window, Promise: Promise, Object: Object, Error: Error };
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'sync-bootstrap.js' });
    await window.ChordCruiseSyncPilot.ready;
    return {
        appended: appended,
        get installed() { return installed; },
        background: background,
        watched: watched,
        ensureManagementUi: window.ChordCruiseSyncPilot.ensureManagementUi
    };
}

(async function () {
    var off = runBootstrap('127.0.0.1', null, false);
    assert.strictEqual(off.api.enabled, false);
    assert.strictEqual(off.api.defaultEnabled, false);
    assert.strictEqual(off.appendCount, 0, 'OFF loads no sync implementation module');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(await off.api.ready)), { enabled: false });

    var production = runBootstrap('soundcruise.jp', 'enabled', true, 'Pro');
    assert.strictEqual(production.api.enabled, true, 'official production Pro loads Sync without a cohort activation');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(production.api.productionRollout)), {
        clientActivationRequired: false,
        endpoint: 'https://sound-cruise-sync.cruise-port-requests.workers.dev',
        enrollmentRequired: false,
        legacyNewAdmissionEnabled: false
    });
    assert.strictEqual(production.appendCount, 1, 'official production Pro starts lazy loading with the first implementation module');
    assert.strictEqual(production.api.setSessionEnabled(true), false, 'production cannot persist the pilot flag');

    var freshProduction = await runProductionLoad(false);
    assert.deepStrictEqual(freshProduction.appended.map(function (url) { return url.split('/').pop().split('?')[0]; }),
        ['sync-core.js', 'sync-db.js', 'sync-merge.js', 'sync-client.js']);
    assert(freshProduction.appended.some(function (url) { return url.endsWith('/sync-client.js?v=1.12.1'); }),
        'the newly changed client module is cache-busted');
    assert.strictEqual(freshProduction.installed, 0, 'a new production Chord user sees no Legacy Sync entry');
    assert.strictEqual(freshProduction.background, 0);
    assert.strictEqual(await freshProduction.ensureManagementUi(), true,
        'Account orchestration can expose management UI after persisting a new credential');
    assert.strictEqual(freshProduction.installed, 1);
    assert.strictEqual(await freshProduction.ensureManagementUi(), true);
    assert.strictEqual(freshProduction.appended.filter(function (url) {
        return url.includes('/sync-pairing-ui.js');
    }).length, 1, 'management UI is lazy-loaded only once');

    var existingProduction = await runProductionLoad(true);
    assert(existingProduction.appended.some(function (url) { return url.includes('/sync-pairing-ui.js'); }),
        'an existing credential retains the Legacy management UI');
    assert.strictEqual(existingProduction.installed, 1);
    assert.strictEqual(existingProduction.background, 1, 'existing ready identities keep runtime Sync');
    assert.strictEqual(existingProduction.watched, 1, 'existing local saves remain watched');

    var missingActivationProduction = runBootstrap('soundcruise.jp', null, false, 'Pro');
    assert.strictEqual(missingActivationProduction.api.enabled, true, 'missing legacy activation state does not hide official production Sync');
    assert.strictEqual(missingActivationProduction.appendCount, 1);

    var disabledActivationProduction = runBootstrap('soundcruise.jp', null, false, 'Pro', JSON.stringify({ version: 1, enabled: false }));
    assert.strictEqual(disabledActivationProduction.api.enabled, true, 'disabled legacy activation state does not hide official production Sync');
    assert.strictEqual(disabledActivationProduction.appendCount, 1);

    var standardWithCopiedState = runBootstrap('soundcruise.jp', null, false, 'Standard', JSON.stringify({ version: 1, enabled: true }));
    assert.strictEqual(standardWithCopiedState.api.enabled, false, 'copied activation state cannot enable Standard');
    assert.strictEqual(standardWithCopiedState.appendCount, 0);

    assert.strictEqual(standardHtml.includes('../js/sync/'), false, 'Standard loads no Sync module');
    assert.strictEqual(standardHtml.includes('sync-cohort'), false, 'Standard loads no cohort activation controller');
    assert.strictEqual(standardHtml.includes('__SOUND_CRUISE_SYNC_PRODUCTION_TURNSTILE_SITE_KEY__'), false, 'Standard has no production Turnstile configuration');
    assert(proHtml.includes("__SOUND_CRUISE_SYNC_PRODUCTION_TURNSTILE_SITE_KEY__ = '0x4AAAAAAEyUW3_hNe2DPgWr'"), 'Pro has the dedicated public production site key');
    assert(proHtml.includes('../js/sync/sync-turnstile.js?v=1.12.1'), 'Pro loads the production Turnstile provider');
    assert(proHtml.includes('../js/sync/sync-bootstrap.js?v=1.12.1'), 'Pro loads the OFF-first bootstrap');
    assert(proHtml.indexOf('sync-turnstile.js') < proHtml.indexOf('sync-bootstrap.js'), 'Pro installs Turnstile before Sync bootstrap');
    ['sync-core.js', 'sync-db.js', 'sync-merge.js', 'sync-client.js'].forEach(function (fileName) {
        assert.strictEqual(standardHtml.includes(fileName), false, 'Standard never loads ' + fileName);
        assert.strictEqual(proHtml.includes(fileName), false, 'Pro does not eagerly load ' + fileName);
    });
    assert(source.indexOf("loadScript('sync-core.js')") < source.indexOf("loadScript('sync-db.js')"));
    assert(source.indexOf("loadScript('sync-db.js')") < source.indexOf("loadScript('sync-merge.js')"));
    assert(source.indexOf("loadScript('sync-merge.js')") < source.indexOf("loadScript('sync-client.js?v=1.12.1')"));
    assert(source.includes('client.watchLocalMutations'), 'Pilot ON connects successful local saves to debounced sync');
    assert(source.includes("getMeta('datasetState') === 'ready'"), 'background sync starts only after migration is ready');
    assert(source.includes("getMeta('deviceCredential')"), 'production checks the existing device before exposing legacy controls');
    assert(source.includes('!PRODUCTION_ROLLOUT.legacyNewAdmissionEnabled'), 'new legacy admission is hidden independently of existing runtime');
    assert.strictEqual(source.includes('beginInitialMigration('), false, 'bootstrap never starts migration without an explicit Pilot action');
    assert(fixtureHtml.includes('window.__SOUND_CRUISE_SYNC_PILOT__ = true'));
    assert(fixtureHtml.includes("'Pilot ready'"));
    assert.strictEqual(standardHtml.includes('tests/fixtures'), false, 'production Standard has no QA fixture route');
    assert.strictEqual(proHtml.includes('tests/fixtures'), false, 'production Pro has no QA fixture route');

    console.log('sync-pilot-feature-flag: official Pro enablement, Standard isolation, and lazy loading passed');
}()).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
