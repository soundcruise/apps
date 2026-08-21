'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var standardDirectory = path.join(root, 'standard');
var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
var themeSource = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');
var standardHtml = fs.readFileSync(path.join(standardDirectory, 'index.html'), 'utf8');
var proHtml = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8', 'index.html'), 'utf8');

assert(exploreSource.includes('id="cc-high-fret-help-toggle"'), 'High-fret help uses a dedicated button');
assert(exploreSource.includes('aria-controls="cc-high-fret-note"'), 'High-fret help identifies its controlled description');
assert(exploreSource.includes('id="cc-high-fret-note" hidden'), 'High-fret description starts hidden');
assert(exploreSource.includes("help.hidden = !expanded"), 'High-fret help toggles description visibility');
assert(!exploreSource.includes('コードを選ぶと構成音が指板に表示されます。'), 'The redundant idle fretboard hint is removed');
assert(themeSource.includes('.cc-high-fret-help-toggle'), 'The help control has a Chord Cruise-specific style');
assert(standardHtml.includes('保存したコードフォームを見る'), 'Standard home uses the revised library description');
assert(proHtml.includes('保存したコードフォームを見る'), 'Pro home uses the revised library description');

console.log('high-fret-help: collapsible help and Standard/Pro library copy OK');
