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

Element.prototype.appendChild = function (child) {
    this.children.push(child);
    return child;
};
Element.prototype.setAttribute = function (name, value) { this.attributes[name] = value; };
Element.prototype.addEventListener = function (name, listener) { this.listeners[name] = listener; };
Element.prototype.click = function () { return this.listeners.click(); };

function createDocument() {
    var insertedSection = null;
    var anchor = new Element('div');
    anchor.parentNode = {
        insertBefore: function (section) { insertedSection = section; }
    };
    return {
        getElementById: function () { return null; },
        querySelector: function (selector) {
            return selector === '.cc-settings-refresh-bar' ? anchor : null;
        },
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
                element.testNodes = { status: status, actions: actions, result: result };
            }
            return element;
        },
        insertedSection: function () { return insertedSection; }
    };
}

function loadUi(document) {
    var window = { document: document, navigator: {} };
    var context = { window: window, Promise: Promise, Object: Object, Boolean: Boolean, Number: Number, Date: Date };
    vm.createContext(context);
    vm.runInContext(uiSource, context, { filename: 'sync-pairing-ui.js' });
    return window.ChordCruiseSync.pairingUi;
}

function createStore(seed) {
    var values = new Map(Object.entries(seed));
    return {
        getMeta: async function (key) { return values.get(key); },
        setMeta: async function (key, value) { values.set(key, value); }
    };
}

function buttonWithText(actions, text) {
    return actions.children.find(function (child) { return child.tagName === 'button' && child.textContent === text; });
}

function settle() {
    return new Promise(function (resolve) { setImmediate(resolve); });
}

(async function () {
    var credential = { deviceId: 'device-a', credential: 'credential-a' };
    var store = createStore({
        deviceCredential: credential,
        syncState: 'provisioning',
        datasetState: 'initializing',
        migrationState: 'not_started'
    });
    var starts = 0;
    var migrations = 0;
    var client = {
        openStore: async function () { return store; },
        startIdentity: async function () { starts += 1; return { ok: false }; },
        beginInitialMigration: async function () {
            migrations += 1;
            await store.setMeta('datasetState', 'ready');
            await store.setMeta('migrationState', 'complete');
            await store.setMeta('syncState', 'pilot_ready');
            return { ok: true };
        }
    };

    var firstDocument = createDocument();
    assert.strictEqual(loadUi(firstDocument).install(client), true);
    await settle();
    var firstNodes = firstDocument.insertedSection().testNodes;
    assert.strictEqual(firstNodes.status.textContent, '初回同期の開始が未完了です。');
    assert(firstNodes.result.textContent.includes('復旧コードを安全な場所へ保存済みの場合だけ'));
    assert.strictEqual(Boolean(buttonWithText(firstNodes.actions, '同期をはじめる')), false, 'reload never offers a second identity');
    assert(buttonWithText(firstNodes.actions, '復旧コードを保存していない場合は再発行'), 'unsaved users retain the existing explicit rotation path');

    var secondDocument = createDocument();
    assert.strictEqual(loadUi(secondDocument).install(client), true, 'another reload restores the same resumable state');
    await settle();
    var secondNodes = secondDocument.insertedSection().testNodes;
    assert.strictEqual(starts, 0, 'repeated reload creates no identity or device');
    await buttonWithText(secondNodes.actions, '復旧コードを保存しました。初回同期を再開').click();
    await settle();
    assert.strictEqual(migrations, 1);
    assert.strictEqual(starts, 0);
    assert.strictEqual(await store.getMeta('migrationState'), 'complete');
    assert.strictEqual(secondNodes.status.textContent, '同期済み');
    assert.strictEqual(Boolean(buttonWithText(secondNodes.actions, '復旧コードを保存しました。初回同期を再開')), false,
        'completed migration does not reappear as resumable');

    var uploadingDocument = createDocument();
    var uploadingStore = createStore({
        deviceCredential: credential,
        syncState: 'provisioning',
        datasetState: 'initializing',
        migrationState: 'uploading'
    });
    assert.strictEqual(loadUi(uploadingDocument).install({
        openStore: async function () { return uploadingStore; }
    }), true);
    await settle();
    var uploadingNodes = uploadingDocument.insertedSection().testNodes;
    assert.strictEqual(uploadingNodes.status.textContent, '初回同期を再開できます。');
    assert(buttonWithText(uploadingNodes.actions, '復旧コードを保存しました。初回同期を再開'),
        'network failure followed by reload remains resumable');

    var normalDocument = createDocument();
    var normalStore = createStore({
        deviceCredential: credential,
        syncState: 'pilot_ready',
        datasetState: 'ready',
        migrationState: 'complete'
    });
    assert.strictEqual(loadUi(normalDocument).install({
        openStore: async function () { return normalStore; }
    }), true);
    await settle();
    var normalNodes = normalDocument.insertedSection().testNodes;
    assert.strictEqual(normalNodes.status.textContent, '同期済み', 'normal Sync user stays on the normal branch');
    assert.strictEqual(Boolean(buttonWithText(normalNodes.actions, '復旧コードを保存しました。初回同期を再開')), false,
        'normal Sync user is never offered migration again');

    console.log('sync-pilot-provisioning-resume: reload recovery, explicit Recovery Code guard, and no duplicate identity passed');
}()).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
