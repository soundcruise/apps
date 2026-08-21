'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var TextEncoder = require('util').TextEncoder;

var chordRoot = path.join(__dirname, '..');
var repositoryApps = path.join(chordRoot, '..');
var standardHtml = fs.readFileSync(path.join(chordRoot, 'standard/index.html'), 'utf8');
var proHtml = fs.readFileSync(path.join(chordRoot, 'pro_k7m4q9v2x8/index.html'), 'utf8');
var sharedGatePath = path.join(repositoryApps, 'shared/pro-gate.js');
var sharedGateCssPath = path.join(repositoryApps, 'shared/pro-gate.css');
var sharedGateSource = fs.readFileSync(sharedGatePath, 'utf8');

assert(proHtml.includes('<html lang="ja" data-app-edition="Pro">'), 'Chord Cruise Pro keeps the shared edition convention');
assert(proHtml.includes('<link rel="stylesheet" href="../../shared/pro-gate.css?v=5">'), 'Chord Cruise Pro loads shared gate CSS');
assert(proHtml.includes('<script src="../../shared/pro-gate.js?v=19"></script>'), 'Chord Cruise Pro loads shared gate JS');
assert(fs.existsSync(sharedGatePath), 'Chord Cruise Pro gate JS path resolves');
assert(fs.existsSync(sharedGateCssPath), 'Chord Cruise Pro gate CSS path resolves');

var configPosition = proHtml.indexOf('window.__SOUNDCRUISE_PRO_GATE__');
var gateScriptPosition = proHtml.indexOf('<script src="../../shared/pro-gate.js?v=19"></script>');
var appPosition = proHtml.indexOf('<div id="cc-app"');
assert(configPosition > -1 && configPosition < gateScriptPosition, 'gate config is defined before shared gate JS');
assert(gateScriptPosition < appPosition, 'shared gate boots before the Chord Cruise app markup');
assert(proHtml.includes("appName: 'コードクルーズ'"), 'gate heading uses the Chord Cruise app name');
assert(proHtml.includes('gateVersion: 8'), 'Chord Cruise uses the current shared gate version');
assert(/passwordHash:\s*'[a-f0-9]{64}'/.test(proHtml), 'Chord Cruise config provides a SHA-256 password hash');

assert(!standardHtml.includes('pro-gate.js'), 'Standard does not load the Pro gate JS');
assert(!standardHtml.includes('pro-gate.css'), 'Standard does not load the Pro gate CSS');
assert(!standardHtml.includes('__SOUNDCRUISE_PRO_GATE__'), 'Standard does not define Pro gate config');

assert(sharedGateSource.includes("const SHARED_AUTH_KEY = 'soundCruiseProAuth'"), 'shared gate retains the common auth state key');
assert(sharedGateSource.includes("window.crypto.subtle.digest('SHA-256'"), 'shared gate retains SHA-256 verification');
assert(sharedGateSource.includes("q.get('resetGate') === '1'"), 'shared gate retains URL reset handling');
assert(sharedGateSource.includes('window.__soundCruiseClearGate = clearGateStorage'), 'shared gate exposes the existing reset API');
assert(sharedGateSource.includes("event.data.type !== 'PRO_GATE_INVALIDATE'"), 'shared gate retains service-worker invalidation handling');

var removedKeys = [];
var insertedOverlays = 0;
var gateWindow = {
    __SOUNDCRUISE_PRO_GATE__: {
        passwordHash: 'fa68d2ed5f32f14746be3ce92a07e5dcc7431b3ac4e7717b6947a4054fae5c18',
        gateVersion: 8,
        appName: 'コードクルーズ'
    },
    crypto: { subtle: { digest: function () { return Promise.resolve(new ArrayBuffer(32)); } } },
    TextEncoder: TextEncoder,
    location: { reload: function () {} }
};
var gateContext = {
    window: gateWindow,
    location: { hostname: 'localhost', protocol: 'http:', search: '', pathname: '/pro/index.html', hash: '', href: 'http://localhost/pro/index.html' },
    history: { replaceState: function () {} },
    navigator: {},
    URLSearchParams: URLSearchParams,
    TextEncoder: TextEncoder,
    Uint8Array: Uint8Array,
    ArrayBuffer: ArrayBuffer,
    Promise: Promise,
    Date: Date,
    Number: Number,
    JSON: JSON,
    localStorage: {
        getItem: function (key) {
            return key === 'soundCruiseProAuth' ? JSON.stringify({ v: 1 }) : null;
        },
        setItem: function () {},
        removeItem: function (key) { removedKeys.push(key); }
    },
    document: {
        readyState: 'complete',
        body: {
            classList: { add: function () {}, remove: function () {} },
            insertBefore: function () { insertedOverlays += 1; },
            firstChild: null
        },
        getElementById: function () { return null; },
        createElement: function () { throw new Error('unlocked shared auth must not create a gate overlay'); }
    },
    requestAnimationFrame: function (callback) { callback(); }
};
vm.runInNewContext(sharedGateSource, gateContext, { filename: 'pro-gate.js' });
assert.strictEqual(insertedOverlays, 0, 'valid shared auth bypasses the password overlay');
assert.strictEqual(typeof gateWindow.__soundCruiseClearGate, 'function', 'shared reset API is available to Chord Cruise Pro');
gateWindow.__soundCruiseClearGate();
assert.deepStrictEqual(removedKeys.sort(), [
    'pitchTrainerProGateOk',
    'soundCruiseProAuth',
    'soundcruise_pro_gate_rotation'
].sort(), 'shared reset API clears the existing common and legacy auth keys');

[
    path.join(repositoryApps, 'pitch-cruise/pro_x9v7q2m8/index.html'),
    path.join(repositoryApps, 'fretboard_cruise/pro_a9f4k7q2m8z/index.html'),
    path.join(repositoryApps, 'rhythm-cruise/pro_r4m8k7n2q9x/index.html')
].forEach(function (existingProPath) {
    var existingProHtml = fs.readFileSync(existingProPath, 'utf8');
    assert(existingProHtml.includes('data-app-edition="Pro"'), path.basename(path.dirname(existingProPath)) + ' retains Pro edition markup');
    assert(existingProHtml.includes('shared/pro-gate.css'), path.basename(path.dirname(existingProPath)) + ' retains shared gate CSS');
    assert(
        existingProHtml.includes('shared/pro-gate.js') || existingProHtml.includes('pro-gate-hash.js'),
        path.basename(path.dirname(existingProPath)) + ' retains its existing gate bootstrap'
    );
});

console.log('pro-gate-integration: Chord Cruise Pro shares config/auth/reset conventions without affecting Standard or existing Pro entries OK');
