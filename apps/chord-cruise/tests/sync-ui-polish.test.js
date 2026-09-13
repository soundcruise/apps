'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var ui = fs.readFileSync(path.join(root, 'js/sync/sync-pairing-ui.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');
var standard = fs.readFileSync(path.join(root, 'standard/index.html'), 'utf8');
var pro = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/index.html'), 'utf8');

assert(ui.includes('data-sync-open'), 'Pro settings expose one compact Sync entry row');
assert(ui.includes('data-sync-screen'), 'the Sync controls live in a dedicated subview');
assert(ui.includes('別の端末を追加'), 'pairing uses device-oriented wording');
assert(!ui.includes('別のアプリと同期'), 'the misleading pairing wording is removed');
assert(ui.includes('復旧コードを更新'), 'Recovery Code rotation uses explicit wording');
assert(ui.includes('クラウド上の同期データを削除'), 'Cloud Delete has explicit cloud scope');
assert(ui.includes('危険な操作'), 'Cloud Delete is separated into a danger section');
assert(ui.includes('Step 1 / 4') && ui.includes('Step 2 / 4') && ui.includes('Step 3 / 4'), 'Recovery exposes its staged flow');
assert(ui.includes('新しい復旧コードを確認') && ui.includes('保存しました。復旧を確定'), 'Recovery separates code review from final commit');
assert(ui.includes('クラウド同期とは？') && ui.includes('運営者へ送らないでください'), 'compact safety help is available');
assert(ui.includes("if (busy || element.disabled)"), 'duplicate submissions are prevented');
assert(ui.includes("setStatus('同期一時停止'"), 'a runtime pause has one canonical status');
assert(css.includes('.cc-sync-screen') && css.includes('.cc-sync-action-group--danger'), 'the dedicated screen and danger spacing are styled');
assert(pro.includes('sync-bootstrap.js?v='), 'Sync bootstrap remains Pro-only');
assert(!standard.includes('sync-bootstrap.js?v='), 'Standard remains free of Sync UI');

console.log('sync-ui-polish: compact entry, canonical states, staged recovery, safety grouping, help, and Standard isolation passed');
