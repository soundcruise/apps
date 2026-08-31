'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var settingsSource = fs.readFileSync(path.join(root, 'js/ui/settings.js'), 'utf8');
var saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');
var librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
var chordBuilderSource = fs.readFileSync(path.join(root, 'js/ui/chord-builder.js'), 'utf8');
var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
var themeSource = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');
var standardSource = fs.readFileSync(path.join(root, 'standard/index.html'), 'utf8');
var proSource = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/index.html'), 'utf8');

function FakeClassList(element) {
    this.element = element;
    this.values = [];
}

FakeClassList.prototype.set = function (value) {
    this.values = String(value || '').split(/\s+/).filter(Boolean);
};
FakeClassList.prototype.contains = function (value) {
    return this.values.indexOf(value) !== -1;
};
FakeClassList.prototype.add = function (value) {
    if (!this.contains(value)) this.values.push(value);
};
FakeClassList.prototype.remove = function (value) {
    this.values = this.values.filter(function (entry) { return entry !== value; });
};
FakeClassList.prototype.toggle = function (value, force) {
    var enabled = typeof force === 'boolean' ? force : !this.contains(value);
    if (enabled) this.add(value);
    else this.remove(value);
    return enabled;
};

function FakeElement(document, id) {
    this.ownerDocument = document;
    this.id = id || '';
    this.attributes = {};
    this.listeners = {};
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.hidden = true;
    this.disabled = false;
    this.checked = false;
    this.value = '';
    this.textContent = '';
    this.classList = new FakeClassList(this);
    this._className = '';
}

Object.defineProperty(FakeElement.prototype, 'className', {
    get: function () { return this._className; },
    set: function (value) {
        this._className = String(value || '');
        this.classList.set(this._className);
    }
});
Object.defineProperty(FakeElement.prototype, 'innerHTML', {
    get: function () { return this._innerHTML || ''; },
    set: function (value) { this._innerHTML = String(value || ''); }
});
FakeElement.prototype.setAttribute = function (name, value) {
    this.attributes[name] = String(value);
};
FakeElement.prototype.getAttribute = function (name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
};
FakeElement.prototype.removeAttribute = function (name) {
    delete this.attributes[name];
};
FakeElement.prototype.addEventListener = function (type, handler) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
};
FakeElement.prototype.appendChild = function (child) {
    child.parentNode = this;
    this.children.push(child);
    this.ownerDocument.register(child);
    return child;
};
FakeElement.prototype.insertBefore = function (child) {
    return this.appendChild(child);
};
FakeElement.prototype.querySelectorAll = function () { return []; };
FakeElement.prototype.querySelector = function () { return new FakeElement(this.ownerDocument); };
FakeElement.prototype.closest = function () { return null; };
FakeElement.prototype.focus = function () { this.ownerDocument.activeElement = this; };
FakeElement.prototype.dispatch = function (type, event) {
    event = event || makeEvent(type);
    event.type = type;
    if (!event.target) event.target = this;
    (this.listeners[type] || []).slice().forEach(function (handler) {
        if (!event.immediateStopped) handler(event);
    });
    if (!event.propagationStopped) this.ownerDocument.dispatchEvent(event);
    return event;
};

function FakeDocument() {
    this.listeners = {};
    this.elements = [];
    this.byId = {};
    this.activeElement = null;
    this.body = new FakeElement(this, 'body');
    this.body.hidden = false;
    this.documentElement = new FakeElement(this, 'html');
    this.register(this.body);
}

FakeDocument.prototype.register = function (element) {
    if (this.elements.indexOf(element) === -1) this.elements.push(element);
    if (element.id) this.byId[element.id] = element;
};
FakeDocument.prototype.createElement = function () {
    var element = new FakeElement(this);
    this.register(element);
    return element;
};
FakeDocument.prototype.getElementById = function (id) {
    if (!this.byId[id]) {
        this.byId[id] = new FakeElement(this, id);
        this.register(this.byId[id]);
    }
    return this.byId[id];
};
FakeDocument.prototype.addEventListener = function (type, handler) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
};
FakeDocument.prototype.dispatchEvent = function (event) {
    (this.listeners[event.type] || []).slice().forEach(function (handler) {
        if (!event.immediateStopped) handler(event);
    });
    return !event.defaultPrevented;
};
FakeDocument.prototype.querySelectorAll = function () { return []; };
FakeDocument.prototype.querySelector = function (selector) {
    if (selector === '.cc-settings-refresh-bar') return null;
    var rules = [
        ['.cc-modal-overlay--confirm:not(.cc-modal-overlay--hidden)', 'cc-modal-overlay--confirm', 'cc-modal-overlay--hidden'],
        ['.cc-modal-overlay:not(.cc-modal-overlay--hidden)', 'cc-modal-overlay', 'cc-modal-overlay--hidden'],
        ['.cc-folder-manage-overlay:not(.cc-folder-manage-overlay--hidden)', 'cc-folder-manage-overlay', 'cc-folder-manage-overlay--hidden'],
        ['.cc-settings-overlay:not(.cc-settings-overlay--hidden)', 'cc-settings-overlay', 'cc-settings-overlay--hidden']
    ];
    for (var index = 0; index < rules.length; index += 1) {
        if (selector.indexOf(rules[index][0]) === -1) continue;
        var found = this.elements.find(function (element) {
            return element.classList.contains(rules[index][1]) && !element.classList.contains(rules[index][2]);
        });
        if (found) return found;
    }
    return null;
};

function makeEvent(type, key) {
    return {
        type: type,
        key: key || '',
        target: null,
        defaultPrevented: false,
        propagationStopped: false,
        immediateStopped: false,
        preventDefault: function () { this.defaultPrevented = true; },
        stopPropagation: function () { this.propagationStopped = true; },
        stopImmediatePropagation: function () {
            this.immediateStopped = true;
            this.propagationStopped = true;
        }
    };
}

function createEnvironment() {
    var document = new FakeDocument();
    var settingsOverlay = document.getElementById('cc-settings-overlay');
    settingsOverlay.className = 'cc-settings-overlay cc-settings-overlay--hidden';
    settingsOverlay.hidden = false;
    var settingsButton = document.getElementById('cc-settings-btn');
    settingsButton.hidden = false;
    var settingsClose = document.getElementById('cc-settings-close');
    settingsClose.hidden = false;
    document.getElementById('cc-settings-reset-confirm').hidden = true;

    var confirmCount = 0;
    var window = {
        ChordCruise: {
            state: {
                settings: {
                    chordNameSize: 'medium',
                    fretNumberSize: 'medium',
                    fretboardMarkerLabelSize: 'medium',
                    fretNumberHighlightMode: 'all',
                    highlightedFrets: [],
                    fretboardDisplayMode: 'finger',
                    degreeNotationFormal: false,
                    cagedTabAutoChange: true
                }
            },
            ui: {
                focusTrap: {
                    trapFocus: function () {},
                    restoreFocus: function (primary, fallback) {
                        if (primary && typeof primary.focus === 'function') primary.focus();
                        else if (fallback && typeof fallback.focus === 'function') fallback.focus();
                    }
                }
            },
            storage: {
                saveSettings: function () { return true; },
                loadOrderedFolders: function () { return []; }
            },
            featureAccess: {
                isProEdition: function () { return false; },
                hasFeature: function () { return false; }
            }
        },
        confirm: function () { confirmCount += 1; return false; },
        location: { href: 'https://example.test/', reload: function () {}, replace: function () {} }
    };
    var context = {
        window: window,
        document: document,
        URL: URL,
        Date: Date,
        JSON: JSON,
        Math: Math,
        Number: Number,
        isFinite: isFinite,
        console: console,
        CustomEvent: function (type) { this.type = type; }
    };
    vm.createContext(context);
    return {
        context: context,
        document: document,
        window: window,
        settingsOverlay: settingsOverlay,
        settingsButton: settingsButton,
        confirmCount: function () { return confirmCount; }
    };
}

function loadModules(env) {
    var instrumentedSettings = settingsSource.replace(
        'window.ChordCruise.ui.settings = {',
        'window.ChordCruise.ui.__modalSettingsTest = {' +
            'isOpen: function () { return isVisible(overlayEl, "cc-settings-overlay--hidden"); },' +
            'syncModalAvailability: syncModalAvailability' +
        '};\n    window.ChordCruise.ui.settings = {'
    );
    vm.runInContext(instrumentedSettings, env.context, { filename: 'settings.js' });
    env.window.ChordCruise.ui.settings.init();

    var instrumentedSave = saveEditorSource.replace(
        'window.ChordCruise.ui.saveEditor = {',
        'window.ChordCruise.ui.__modalSaveTest = {' +
            'ensureDom: ensureDom,' +
            'setDraft: function (value) { draft = value; initialSnapshot = "different"; },' +
            'getDraft: function () { return draft; },' +
            'getOverlay: function () { return overlayEl; }' +
        '};\n    window.ChordCruise.ui.saveEditor = {'
    );
    vm.runInContext(instrumentedSave, env.context, { filename: 'save-editor.js' });
    env.window.ChordCruise.ui.__modalSaveTest.ensureDom();

    var instrumentedLibrary = librarySource.replace(
        'window.ChordCruise.ui.library = {',
        'window.ChordCruise.ui.__modalLibraryTest = {' +
            'confirmDanger: confirmDanger,' +
            'getConfirmOverlay: function () { return confirmOverlay; }' +
        '};\n    window.ChordCruise.ui.library = {'
    );
    vm.runInContext(instrumentedLibrary, env.context, { filename: 'library.js' });
}

function editDraft() {
    return {
        mode: 'edit',
        range: { min: 0, max: 3, includesOpen: true },
        notes: [],
        mutedStrings: [],
        bassFingerings: [],
        tensionPcs: [],
        tensionFingerings: []
    };
}

(function modalLayeringAndEscapeUseActualEventDispatch() {
    var env = createEnvironment();
    loadModules(env);
    var settings = env.window.ChordCruise.ui.settings;
    var settingsTest = env.window.ChordCruise.ui.__modalSettingsTest;
    var saveTest = env.window.ChordCruise.ui.__modalSaveTest;
    var saveOverlay = saveTest.getOverlay();

    saveTest.setDraft(editDraft());
    saveOverlay.classList.remove('cc-modal-overlay--hidden');
    assert.strictEqual(settingsTest.syncModalAvailability(), true, 'open modal blocks settings');
    assert.strictEqual(env.settingsButton.disabled, true, 'settings button is disabled');
    assert.strictEqual(env.settingsButton.getAttribute('aria-hidden'), 'true', 'settings button leaves the accessibility tree');
    assert.strictEqual(settings.open(), false, 'settings cannot open over Save Editor');

    saveOverlay.classList.add('cc-modal-overlay--hidden');
    settingsTest.syncModalAvailability();
    env.document.activeElement = env.settingsButton;
    assert.strictEqual(settings.open(), true, 'settings opens on a normal screen');
    saveOverlay.classList.remove('cc-modal-overlay--hidden');
    settingsTest.syncModalAvailability();

    var firstEscape = makeEvent('keydown', 'Escape');
    env.document.dispatchEvent(firstEscape);
    assert.strictEqual(firstEscape.defaultPrevented, true, 'the top layer consumes Escape');
    assert.strictEqual(settingsTest.isOpen(), false, 'first Escape closes only settings in a legacy overlap');
    assert.strictEqual(saveOverlay.classList.contains('cc-modal-overlay--hidden'), false, 'Save Editor remains open');
    assert.strictEqual(saveTest.getDraft() !== null, true, 'unsaved draft remains');
    assert.strictEqual(env.confirmCount(), 0, 'the background editor did not process the same Escape');

    var secondEscape = makeEvent('keydown', 'Escape');
    env.document.dispatchEvent(secondEscape);
    assert.strictEqual(env.confirmCount(), 1, 'the next Escape reaches the unsaved editor once');
    assert.strictEqual(saveTest.getDraft() !== null, true, 'canceling discard preserves the unsaved draft');
    assert.strictEqual(saveOverlay.classList.contains('cc-modal-overlay--hidden'), false, 'editor remains visible after cancel');

    var bubbledClicks = 0;
    env.document.addEventListener('click', function () { bubbledClicks += 1; });
    saveOverlay.dispatch('click', makeEvent('click'));
    assert.strictEqual(bubbledClicks, 0, 'modal backdrop does not click through');
    assert.strictEqual(saveTest.getDraft() !== null, true, 'backdrop discard cancel preserves draft');

    env.window.ChordCruise.ui.__modalLibraryTest.confirmDanger(
        '削除しますか？', '削除する', function () {}, env.settingsButton, '確認'
    );
    var confirmOverlay = env.window.ChordCruise.ui.__modalLibraryTest.getConfirmOverlay();
    assert.strictEqual(confirmOverlay.classList.contains('cc-modal-overlay--hidden'), false, 'nested confirm is visible');
    var confirmEscape = makeEvent('keydown', 'Escape');
    var beforeNestedConfirm = env.confirmCount();
    env.document.dispatchEvent(confirmEscape);
    assert.strictEqual(confirmOverlay.classList.contains('cc-modal-overlay--hidden'), true, 'Escape closes only nested confirm');
    assert.strictEqual(saveOverlay.classList.contains('cc-modal-overlay--hidden'), false, 'nested confirm keeps Save Editor');
    assert.strictEqual(env.confirmCount(), beforeNestedConfirm, 'background unsaved confirmation is not invoked');

    saveOverlay.classList.add('cc-modal-overlay--hidden');
    settingsTest.syncModalAvailability();
    env.document.activeElement = env.settingsButton;
    settings.open();
    var resetConfirm = env.document.getElementById('cc-settings-reset-confirm');
    resetConfirm.hidden = false;
    env.document.dispatchEvent(makeEvent('keydown', 'Escape'));
    assert.strictEqual(resetConfirm.hidden, true, 'first Escape closes settings nested confirmation');
    assert.strictEqual(settingsTest.isOpen(), true, 'settings remains after its nested confirmation closes');
    env.document.dispatchEvent(makeEvent('keydown', 'Escape'));
    assert.strictEqual(settingsTest.isOpen(), false, 'next Escape closes settings');
    assert.strictEqual(env.document.activeElement, env.settingsButton, 'focus returns to settings opener');
}());

(function structureAndResponsiveRulesStayShared() {
    assert(themeSource.indexOf('z-index: 1000;') !== -1, 'normal modal sits above fixed settings controls');
    assert(themeSource.indexOf('.cc-modal-overlay--confirm') !== -1 && themeSource.indexOf('z-index: 2400;') !== -1,
        'nested confirmation has an explicit foreground layer');
    assert(themeSource.indexOf('.cc-toast-host {') !== -1 && themeSource.indexOf('z-index: 2600;') !== -1,
        'modal feedback remains visible above the modal stack');
    assert(themeSource.indexOf('body:has(.cc-modal-overlay:not(.cc-modal-overlay--hidden)) .cc-settings-corner-btn') !== -1,
        'CSS immediately hides settings while a modal is open');
    [standardSource, proSource].forEach(function (html) {
        assert(html.indexOf('id="cc-settings-btn"') !== -1, 'both editions retain the same settings control');
        assert(html.indexOf('id="cc-settings-overlay"') !== -1, 'both editions retain the same settings panel');
    });
    [320, 375, 390, 430].forEach(function (width) {
        assert(width >= 320 && themeSource.indexOf('.cc-modal-overlay {') !== -1 && themeSource.indexOf('inset: 0;') !== -1,
            width + 'px uses the viewport-fixed modal layer');
    });
    assert(chordBuilderSource.indexOf("event.stopPropagation") !== -1, 'arbitrary chord backdrop prevents click-through');
    assert(exploreSource.indexOf('__chordCruiseModalHandled') !== -1, 'Explore bottom sheet consumes one Escape');
}());

console.log('modal layering tests passed');
