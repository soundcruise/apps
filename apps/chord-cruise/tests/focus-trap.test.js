const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.resolve(__dirname, '../js/ui/focus-trap.js'), 'utf8');
const indexSource = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const settingsSource = fs.readFileSync(path.resolve(__dirname, '../js/ui/settings.js'), 'utf8');
const librarySource = fs.readFileSync(path.resolve(__dirname, '../js/ui/library.js'), 'utf8');
const saveEditorSource = fs.readFileSync(path.resolve(__dirname, '../js/ui/save-editor.js'), 'utf8');
const chordBuilderSource = fs.readFileSync(path.resolve(__dirname, '../js/ui/chord-builder.js'), 'utf8');
const libraryHtmlSource = librarySource;

function createEnvironment() {
    const document = { activeElement: null };
    const context = {
        window: { getComputedStyle(element) { return element.computedStyle || {}; } },
        document,
        Array
    };
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'focus-trap.js' });
    return { document, focusTrap: context.window.ChordCruise.ui.focusTrap };
}

function makeElement(document, options) {
    const attrs = Object.assign({}, options && options.attrs);
    const element = {
        disabled: !!(options && options.disabled),
        hidden: !!(options && options.hidden),
        inert: !!(options && options.inert),
        type: options && options.type ? options.type : '',
        name: options && options.name ? options.name : '',
        checked: !!(options && options.checked),
        isConnected: options && Object.prototype.hasOwnProperty.call(options, 'isConnected') ? options.isConnected : true,
        parentElement: options && options.parentElement ? options.parentElement : null,
        style: Object.assign({}, options && options.style),
        computedStyle: Object.assign({}, options && options.computedStyle),
        focusCount: 0,
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
        },
        setAttribute(name, value) {
            attrs[name] = String(value);
        },
        focus() {
            this.focusCount += 1;
            document.activeElement = this;
        }
    };
    return element;
}

function makeContainer(document, elements) {
    const container = makeElement(document);
    container.querySelectorAll = () => elements;
    return container;
}

function tabEvent(shiftKey) {
    return {
        key: 'Tab',
        shiftKey: !!shiftKey,
        prevented: false,
        preventDefault() { this.prevented = true; }
    };
}

(function focusableFilteringAndWrap() {
    const env = createEnvironment();
    const first = makeElement(env.document);
    const disabled = makeElement(env.document, { disabled: true });
    const skippedTabIndex = makeElement(env.document, { attrs: { tabindex: '-1' } });
    const hidden = makeElement(env.document, { hidden: true });
    const cssHidden = makeElement(env.document, { computedStyle: { display: 'none' } });
    const hiddenAncestor = makeElement(env.document, { attrs: { 'aria-hidden': 'true' } });
    const insideHiddenAncestor = makeElement(env.document, { parentElement: hiddenAncestor });
    const last = makeElement(env.document);
    const container = makeContainer(env.document, [first, disabled, skippedTabIndex, hidden, cssHidden, insideHiddenAncestor, last]);

    assert.deepStrictEqual(env.focusTrap.getFocusableElements(container), [first, last]);
    env.document.activeElement = last;
    const forward = tabEvent(false);
    assert.strictEqual(env.focusTrap.trapFocus(container, forward), true);
    assert.strictEqual(forward.prevented, true);
    assert.strictEqual(env.document.activeElement, first);

    env.document.activeElement = first;
    const backward = tabEvent(true);
    assert.strictEqual(env.focusTrap.trapFocus(container, backward), true);
    assert.strictEqual(backward.prevented, true);
    assert.strictEqual(env.document.activeElement, last);
})();

(function radioGroupsKeepTheirNativeTabStopModel() {
    const env = createEnvironment();
    const radioOne = makeElement(env.document, { type: 'radio', name: 'display-mode' });
    const radioTwo = makeElement(env.document, { type: 'radio', name: 'display-mode', checked: true });
    const radioThree = makeElement(env.document, { type: 'radio', name: 'display-mode' });
    const unrelatedButton = makeElement(env.document);
    const container = makeContainer(env.document, [radioOne, radioTwo, radioThree, unrelatedButton]);
    assert.deepStrictEqual(env.focusTrap.getFocusableElements(container), [radioTwo, unrelatedButton]);
})();

(function middleFocusAndEmptyDialogRemainSafe() {
    const env = createEnvironment();
    const first = makeElement(env.document);
    const middle = makeElement(env.document);
    const last = makeElement(env.document);
    const container = makeContainer(env.document, [first, middle, last]);
    env.document.activeElement = middle;
    const middleTab = tabEvent(false);
    assert.strictEqual(env.focusTrap.trapFocus(container, middleTab), false);
    assert.strictEqual(middleTab.prevented, false);
    assert.strictEqual(env.document.activeElement, middle);

    const empty = makeContainer(env.document, []);
    const emptyTab = tabEvent(false);
    assert.strictEqual(env.focusTrap.trapFocus(empty, emptyTab), true);
    assert.strictEqual(emptyTab.prevented, true);
    assert.strictEqual(empty.getAttribute('tabindex'), '-1');
    assert.strictEqual(env.document.activeElement, empty);
})();

(function nestedDialogAndFocusReturnUseOnlyValidTargets() {
    const env = createEnvironment();
    const lowerDialogButton = makeElement(env.document);
    const nestedFirst = makeElement(env.document);
    const nestedLast = makeElement(env.document);
    const nestedDialog = makeContainer(env.document, [nestedFirst, nestedLast]);
    env.document.activeElement = nestedLast;
    const nestedTab = tabEvent(false);
    env.focusTrap.trapFocus(nestedDialog, nestedTab);
    assert.strictEqual(env.document.activeElement, nestedFirst, 'nested dialog keeps Tab within the top dialog');
    assert.strictEqual(lowerDialogButton.focusCount, 0);

    const disconnected = makeElement(env.document, { isConnected: false });
    const fallback = makeElement(env.document);
    assert.strictEqual(env.focusTrap.restoreFocus(disconnected, fallback), true);
    assert.strictEqual(env.document.activeElement, fallback);
})();

(function dialogModulesUseTheSharedHelperWithoutRepeatedOpenListeners() {
    assert(indexSource.indexOf('js/ui/focus-trap.js?v=0.25.0') !== -1, 'focus helper is loaded before the dialog modules');
    [settingsSource, librarySource, saveEditorSource, chordBuilderSource].forEach((moduleSource) => {
        assert(moduleSource.indexOf('focusTrap().trapFocus') !== -1, 'dialog module delegates Tab handling to the shared helper');
    });
    assert.strictEqual((librarySource.match(/folderManageSheet\.addEventListener\('keydown'/g) || []).length, 1);
    assert.strictEqual((librarySource.match(/libraryDisplaySheet\.addEventListener\('keydown'/g) || []).length, 1);
})();

(function dangerousDialogsExposeAccessibleNamesAndDescriptions() {
    assert(libraryHtmlSource.indexOf('role="alertdialog" aria-modal="true" aria-labelledby="cc-confirm-title" aria-describedby="cc-confirm-description"') !== -1);
    assert(libraryHtmlSource.indexOf('id="cc-confirm-title"') !== -1);
    assert(libraryHtmlSource.indexOf('id="cc-confirm-description"') !== -1);
    assert(libraryHtmlSource.indexOf("'フォルダを削除'") !== -1);
    assert(libraryHtmlSource.indexOf("'コードを削除'") !== -1);
    assert(indexSource.indexOf('aria-labelledby="cc-settings-reset-confirm-title"') !== -1);
    assert(indexSource.indexOf('aria-describedby="cc-settings-reset-confirm-description"') !== -1);
    assert(indexSource.indexOf('id="cc-settings-reset-confirm-title"') !== -1);
    assert(indexSource.indexOf('id="cc-settings-reset-confirm-description"') !== -1);
    assert.strictEqual((libraryHtmlSource.match(/id="cc-confirm-title"/g) || []).length, 1);
    assert.strictEqual((libraryHtmlSource.match(/id="cc-confirm-description"/g) || []).length, 1);
    assert.strictEqual((indexSource.match(/id="cc-settings-reset-confirm-title"/g) || []).length, 1);
    assert.strictEqual((indexSource.match(/id="cc-settings-reset-confirm-description"/g) || []).length, 1);
})();

console.log('focus-trap: focusable filtering, Tab wrapping, empty dialogs, nested dialogs, and focus return OK');
