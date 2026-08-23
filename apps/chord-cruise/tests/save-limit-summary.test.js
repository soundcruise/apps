'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var source = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');

assert(source.includes('cc-save-limit-summary'), 'save dialog contains a dedicated limit summary above actions');
assert(source.includes('保存上限'), 'summary has a user-facing heading');
assert(source.includes('フォルダ：'), 'summary reports total folder usage');
assert(source.includes('このフォルダ：'), 'summary reports selected folder usage');
assert(source.includes('function renderSaveLimitSummary'), 'summary is recalculated from current storage state');
assert(source.includes('if (limits.unlimited)'), 'Pro hides the Standard-only summary');
assert(source.includes("href=\"../pro-access.html\""), 'summary keeps the Standard-relative Pro access route');
assert(source.includes("cc-save-folder').addEventListener('change'"), 'changing folders refreshes the summary');
assert(source.includes("select.disabled = folders.length === 0;"), 'an empty folder state disables the save destination selector');
assert(source.includes("保存するにはフォルダを作成してください。"), 'an empty folder state explains how to restore saving');
assert(source.includes("(folders[0] ? folders[0].id : '')"), 'a deleted last-save folder falls back only to an existing folder');

console.log('save-limit-summary: Standard save usage and Pro access link render above save actions, Pro remains hidden');
