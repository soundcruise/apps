'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var source = fs.readFileSync(path.join(root, 'js/sync/sync-turnstile.js'), 'utf8');

function environment(siteKey) {
    var elements = {};
    var appended = [];
    var body = { appendChild: function (element) { elements[element.id] = element; } };
    var head = {
        appendChild: function (element) {
            appended.push(element);
            elements[element.id] = element;
        }
    };
    function createElement(tagName) {
        var listeners = {};
        return {
            tagName: tagName,
            id: '',
            textContent: '',
            setAttribute: function () {},
            addEventListener: function (name, callback) { listeners[name] = callback; },
            dispatch: function (name) { if (listeners[name]) listeners[name](); }
        };
    }
    var window = {
        __SOUND_CRUISE_SYNC_PRODUCTION_TURNSTILE_SITE_KEY__: siteKey,
        document: {
            body: body,
            head: head,
            createElement: createElement,
            getElementById: function (id) { return elements[id] || null; }
        }
    };
    var context = { window: window, globalThis: window, Promise: Promise, Error: Error };
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'sync-turnstile.js' });
    return { window: window, appended: appended, elements: elements };
}

(async function () {
    var missing = environment('');
    assert.strictEqual(await missing.window.__SOUND_CRUISE_SYNC_GET_TURNSTILE_TOKEN__('sound_cruise_sync_start'), null);
    assert.strictEqual(missing.appended.length, 0, 'missing public site key fails closed without loading Turnstile');

    var invalid = environment('public-site-key');
    assert.strictEqual(await invalid.window.__SOUND_CRUISE_SYNC_GET_TURNSTILE_TOKEN__('unexpected_action'), null);
    assert.strictEqual(invalid.appended.length, 0, 'unknown actions never render a widget');

    var configured = environment('public-site-key');
    var tokenPromise = configured.window.__SOUND_CRUISE_SYNC_GET_TURNSTILE_TOKEN__('sound_cruise_sync_pair');
    assert.strictEqual(configured.appended.length, 1, 'the official API is loaded lazily');
    assert.strictEqual(configured.appended[0].src, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
    var rendered;
    configured.window.turnstile = {
        render: function (_container, options) {
            rendered = options;
            options.callback('verified-token');
            return 'widget-id';
        },
        remove: function () {}
    };
    configured.appended[0].dispatch('load');
    assert.strictEqual(await tokenPromise, 'verified-token');
    assert.strictEqual(rendered.sitekey, 'public-site-key');
    assert.strictEqual(rendered.action, 'sound_cruise_sync_pair');
    assert.strictEqual(rendered.appearance, 'interaction-only');
    assert.strictEqual(rendered.theme, 'auto');
    assert.strictEqual(rendered.retry, 'auto');
    assert.strictEqual(source.includes('console.'), false, 'Turnstile tokens are not logged');

    console.log('sync-production-turnstile: managed interaction-only provider and fail-closed paths passed');
}()).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
