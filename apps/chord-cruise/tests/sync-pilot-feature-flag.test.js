'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var source = fs.readFileSync(path.join(root, 'js/sync/sync-bootstrap.js'), 'utf8');
var standardHtml = fs.readFileSync(path.join(root, 'standard/index.html'), 'utf8');
var proHtml = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/index.html'), 'utf8');
var fixtureHtml = fs.readFileSync(path.join(root, 'tests/fixtures/sync-pilot-on.html'), 'utf8');

function runBootstrap(hostname, sessionValue, explicitFlag) {
    var appendCount = 0;
    var values = sessionValue ? { 'soundCruise.syncPilot.enabled': sessionValue } : {};
    var window = {
        location: { hostname: hostname },
        __SOUND_CRUISE_SYNC_PILOT__: explicitFlag,
        sessionStorage: {
            getItem: function (key) { return values[key] || null; },
            setItem: function (key, value) { values[key] = value; },
            removeItem: function (key) { delete values[key]; }
        },
        document: {
            currentScript: { src: 'https://' + hostname + '/apps/chord-cruise/js/sync/sync-bootstrap.js' },
            createElement: function () { return {}; },
            head: { appendChild: function () { appendCount += 1; } }
        }
    };
    var context = { window: window, Promise: Promise, Object: Object, Error: Error };
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'sync-bootstrap.js' });
    return { api: window.ChordCruiseSyncPilot, appendCount: appendCount, values: values };
}

(async function () {
    var off = runBootstrap('127.0.0.1', null, false);
    assert.strictEqual(off.api.enabled, false);
    assert.strictEqual(off.api.defaultEnabled, false);
    assert.strictEqual(off.appendCount, 0, 'OFF loads no sync implementation module');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(await off.api.ready)), { enabled: false });

    var production = runBootstrap('soundcruise.jp', 'enabled', true);
    assert.strictEqual(production.api.enabled, false, 'P1 cannot be enabled on production even with both overrides');
    assert.strictEqual(production.appendCount, 0);
    assert.strictEqual(production.api.setSessionEnabled(true), false, 'production cannot persist the pilot flag');

    assert(standardHtml.includes('../js/sync/sync-bootstrap.js?v=1.1.0'), 'Standard loads only the OFF-first bootstrap');
    assert(proHtml.includes('../js/sync/sync-bootstrap.js?v=1.1.0'), 'Pro loads only the OFF-first bootstrap');
    ['sync-core.js', 'sync-db.js', 'sync-merge.js', 'sync-client.js'].forEach(function (fileName) {
        assert.strictEqual(standardHtml.includes(fileName), false, 'Standard does not eagerly load ' + fileName);
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

    console.log('sync-pilot-feature-flag: default OFF, production lockout, and lazy module loading passed');
}()).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
