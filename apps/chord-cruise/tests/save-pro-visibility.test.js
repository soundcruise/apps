'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var themeSource = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');
var saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');

assert(themeSource.includes('.cc-save-section[hidden]'), 'save sections explicitly hide hidden Pro notices');
assert(themeSource.includes('.cc-save-section[hidden] {\n    display: none;\n}'), 'hidden save sections override the flex layout');
assert(saveEditorSource.includes('<div class="cc-save-section" id="cc-save-pro-notice" hidden>'), 'custom-save Pro notice starts hidden');
assert(saveEditorSource.includes('setCustomSaveProNotice(false);'), 'ordinary save flow hides the custom-save Pro notice');
assert(saveEditorSource.includes('setCustomSaveProNotice(true);'), 'custom-save rejection reveals the Pro notice');
assert(saveEditorSource.includes("draft.source === 'custom' && !canSaveCustomChord()"), 'only custom saves trigger the Pro notice gate');

console.log('save-pro-visibility: hidden Standard save notice stays hidden and custom-save rejection can reveal it OK');
