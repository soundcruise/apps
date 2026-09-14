'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var uiSource = fs.readFileSync(path.join(root, 'js/sync/sync-pairing-ui.js'), 'utf8');

function Element(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this._textContent = '';
}

Object.defineProperty(Element.prototype, 'textContent', {
    get: function () { return this._textContent; },
    set: function (value) {
        this._textContent = String(value);
        if (value === '') this.children = [];
    }
});

Element.prototype.appendChild = function (child) { this.children.push(child); return child; };
Element.prototype.setAttribute = function (name, value) { this.attributes[name] = String(value); };
Element.prototype.getAttribute = function (name) { return this.attributes[name] || null; };
Element.prototype.removeAttribute = function (name) { delete this.attributes[name]; };
Element.prototype.addEventListener = function (name, listener) { this.listeners[name] = listener; };
Element.prototype.click = function () { return this.listeners.click(); };

function descendants(element) {
    return element.children.reduce(function (all, child) {
        return all.concat(child, descendants(child));
    }, []);
}

function byAttribute(element, name, value) {
    return descendants(element).find(function (child) { return child.getAttribute(name) === value; });
}

function createDocument() {
    var insertedSection = null;
    var anchor = new Element('div');
    anchor.parentNode = { insertBefore: function (section) { insertedSection = section; } };
    return {
        getElementById: function () { return null; },
        querySelector: function (selector) { return selector === '.cc-settings-refresh-bar' ? anchor : null; },
        createElement: function (tagName) {
            var element = new Element(tagName);
            if (tagName === 'section') {
                var status = new Element('p');
                var actions = new Element('div');
                var result = new Element('p');
                element.querySelector = function (selector) {
                    return {
                        '[data-sync-pairing-status]': status,
                        '[data-sync-pairing-actions]': actions,
                        '[data-sync-pairing-result]': result
                    }[selector] || null;
                };
                element.testNodes = { actions: actions };
            }
            return element;
        },
        insertedSection: function () { return insertedSection; }
    };
}

function loadUi(document) {
    var window = {
        document: document,
        navigator: {},
        SoundCruiseSyncAccount: {
            core: {
                createSensitiveInputController: function (input) {
                    var retryValue = null;
                    return {
                        take: function () {
                            if (input.value) retryValue = input.value;
                            input.value = '';
                            input.removeAttribute('value');
                            return retryValue;
                        },
                        resolve: function () { retryValue = null; input.value = ''; },
                        reject: function () { retryValue = null; input.value = ''; return false; }
                    };
                }
            }
        },
        __SOUND_CRUISE_SYNC_GET_TURNSTILE_TOKEN__: function () { return 'test-token'; }
    };
    var context = { window: window, Promise: Promise, Object: Object, Boolean: Boolean, Number: Number, Date: Date };
    vm.createContext(context);
    vm.runInContext(uiSource, context, { filename: 'sync-pairing-ui.js' });
    return window.ChordCruiseSync.pairingUi;
}

function createStore() {
    return {
        getMeta: async function () { return null; }
    };
}

(async function () {
    var document = createDocument();
    var commits = 0;
    var prepared = {
        ok: true,
        displayRecoveryCode: '',
        summary: {
            appId: 'chord', chordCount: 3, folderCount: 1,
            recordCount: 6, activeDeviceCount: 2, updatedAt: 123456
        }
    };
    var client = {
        openStore: async function () { return createStore(); },
        prepareRecovery: async function () { return prepared; },
        commitRecovery: async function () { commits += 1; return { ok: true, localState: 'empty' }; }
    };

    assert.strictEqual(loadUi(document).install(client), true);
    await new Promise(function (resolve) { setImmediate(resolve); });
    var section = document.insertedSection();
    var actions = section.testNodes.actions;

    await byAttribute(actions, 'data-sync-recovery-action', 'open').click();
    assert.strictEqual(section.getAttribute('data-sync-recovery-phase'), 'input');
    var recoveryInput = byAttribute(actions, 'data-sync-sensitive', 'recovery-code-input');
    assert(recoveryInput, 'Recovery input is marked sensitive');
    recoveryInput.value = 'ABCD-EFGH-JKMP-QRST-WXYZ';
    assert(byAttribute(actions, 'data-sync-recovery-action', 'prepare'), 'prepare is individually addressable');

    await byAttribute(actions, 'data-sync-recovery-action', 'prepare').click();
    assert.strictEqual(section.getAttribute('data-sync-recovery-phase'), 'summary');
    ['app', 'chords', 'folders', 'records', 'devices', 'updated-at'].forEach(function (name) {
        assert(byAttribute(actions, 'data-sync-recovery-summary', name), name + ' is individually addressable');
    });
    assert(byAttribute(actions, 'data-sync-recovery-action', 'continue'), 'summary continuation is individually addressable');

    await byAttribute(actions, 'data-sync-recovery-action', 'continue').click();
    assert.strictEqual(section.getAttribute('data-sync-recovery-phase'), 'new-code');
    assert(byAttribute(actions, 'data-sync-sensitive', 'recovery-code'), 'Recovery output is marked sensitive');
    assert(byAttribute(actions, 'data-sync-recovery-action', 'confirm-saved'), 'save confirmation is individually addressable');

    await byAttribute(actions, 'data-sync-recovery-action', 'confirm-saved').click();
    assert.strictEqual(commits, 1, 'confirm-saved is the Recovery commit trigger');
    assert.strictEqual(section.getAttribute('data-sync-recovery-phase'), 'complete');
    assert.strictEqual(section.getAttribute('data-sync-sensitive'), null, 'the root never receives a secret value');
    assert.strictEqual(byAttribute(actions, 'data-sync-sensitive', 'recovery-code'), undefined,
        'saved Recovery plaintext is removed before commit completion');
    console.log('sync-sensitive-selector-contract: Recovery phases, scoped actions, summaries, and sensitive markers passed');
}()).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
