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

(async function () {
    var off = runBootstrap('127.0.0.1', null, false);
    assert.strictEqual(off.api.enabled, false);
    assert.strictEqual(off.api.defaultEnabled, false);
    assert.strictEqual(off.appendCount, 0, 'OFF loads no sync implementation module');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(await off.api.ready)), { enabled: false });

    var production = runBootstrap('soundcruise.jp', 'enabled', true, 'Pro');
    assert.strictEqual(production.api.enabled, false, 'production cannot be enabled with local-QA overrides');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(production.api.productionRollout)), {
        clientActivationRequired: true,
        endpoint: 'https://sound-cruise-sync.cruise-port-requests.workers.dev',
        enrollmentRequired: true
    });
    assert.strictEqual(production.appendCount, 0);
    assert.strictEqual(production.api.setSessionEnabled(true), false, 'production cannot persist the pilot flag');

    var activatedProduction = runBootstrap('soundcruise.jp', null, false, 'Pro', JSON.stringify({ version: 1, enabled: true }));
    assert.strictEqual(activatedProduction.api.enabled, true, 'versioned container activation enables production Pro lazy loading');
    assert.strictEqual(activatedProduction.appendCount, 1, 'activated Pro begins with only the first lazy implementation module');

    var standardWithCopiedState = runBootstrap('soundcruise.jp', null, false, 'Standard', JSON.stringify({ version: 1, enabled: true }));
    assert.strictEqual(standardWithCopiedState.api.enabled, false, 'copied activation state cannot enable Standard');
    assert.strictEqual(standardWithCopiedState.appendCount, 0);

    assert.strictEqual(standardHtml.includes('../js/sync/'), false, 'Standard loads no Sync module');
    assert.strictEqual(standardHtml.includes('sync-cohort'), false, 'Standard loads no cohort activation controller');
    assert.strictEqual(standardHtml.includes('__SOUND_CRUISE_SYNC_PRODUCTION_TURNSTILE_SITE_KEY__'), false, 'Standard has no production Turnstile configuration');
    assert(proHtml.includes("__SOUND_CRUISE_SYNC_PRODUCTION_TURNSTILE_SITE_KEY__ = '0x4AAAAAAEyUW3_hNe2DPgWr'"), 'Pro has the dedicated public production site key');
    assert(proHtml.includes('../js/sync/sync-turnstile.js?v=1.2.0'), 'Pro loads the production Turnstile provider');
    assert(proHtml.includes('../js/sync/sync-bootstrap.js?v=1.2.0'), 'Pro loads the OFF-first bootstrap');
    assert(proHtml.indexOf('sync-turnstile.js') < proHtml.indexOf('sync-bootstrap.js'), 'Pro installs Turnstile before Sync bootstrap');
    ['sync-core.js', 'sync-db.js', 'sync-merge.js', 'sync-client.js'].forEach(function (fileName) {
        assert.strictEqual(standardHtml.includes(fileName), false, 'Standard never loads ' + fileName);
        assert.strictEqual(proHtml.includes(fileName), false, 'Pro does not eagerly load ' + fileName);
    });
    assert(source.indexOf("loadScript('sync-core.js')") < source.indexOf("loadScript('sync-db.js')"));
    assert(source.indexOf("loadScript('sync-db.js')") < source.indexOf("loadScript('sync-merge.js')"));
    assert(source.indexOf("loadScript('sync-merge.js')") < source.indexOf("loadScript('sync-client.js')"));
    assert(source.includes('client.watchLocalMutations'), 'Pilot ON connects successful local saves to debounced sync');
    assert(source.includes("getMeta('datasetState') === 'ready'"), 'background sync starts only after migration is ready');
    assert.strictEqual(source.includes('beginInitialMigration('), false, 'bootstrap never starts migration without an explicit Pilot action');
    assert(fixtureHtml.includes('window.__SOUND_CRUISE_SYNC_PILOT__ = true'));
    assert(fixtureHtml.includes("'Pilot ready'"));
    assert.strictEqual(standardHtml.includes('tests/fixtures'), false, 'production Standard has no QA fixture route');
    assert.strictEqual(proHtml.includes('tests/fixtures'), false, 'production Pro has no QA fixture route');

    console.log('sync-pilot-feature-flag: default OFF, container-scoped production activation, Standard isolation, and lazy loading passed');
}()).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
