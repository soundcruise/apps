'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
var themeSource = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');

assert(exploreSource.includes('id="cc-caged-notices" hidden'), 'CAGED notices start hidden when there are no warnings');
assert(exploreSource.includes("+ (cagedNoticeExpanded[kind] ? ' cc-caged-notice--expanded' : '');"), 'expanded notices receive a layout class without changing their existing detail state');
assert(exploreSource.includes('notices.hidden = !(fingeringText || rangeText);'), 'the notice container is shown only when at least one warning exists');
assert(themeSource.includes('.cc-caged-notices[hidden] {\n    display: none;'), 'an empty warning container takes no vertical space');
assert(themeSource.includes('.cc-caged-notices {\n    margin: -4px 0 12px;\n    display: flex;'), 'visible notices are arranged in a compact horizontal row');
assert(themeSource.includes('.cc-caged-notice[hidden] {\n    display: none;'), 'empty warning items remain hidden inside a visible warning row');
assert(themeSource.includes('.cc-caged-notice--expanded {\n    flex: 1 0 100%;'), 'expanded warning details may use a full row');
assert(themeSource.includes('.cc-caged-notice-toggle {\n    width: auto;\n    min-height: 32px;'), 'warning summaries are compact tap targets');
assert(themeSource.includes('.cc-caged-notice-detail {\n    flex: 1 0 100%;'), 'expanded details remain readable at full slot width');

console.log('caged-notice-slot: hidden-without-warning row, compact warning chips, and expandable full-width detail OK');
