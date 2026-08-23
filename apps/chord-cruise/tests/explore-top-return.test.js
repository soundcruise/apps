'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var source = fs.readFileSync(path.join(__dirname, '..', 'js/ui/explore.js'), 'utf8');
var buttonIndex = source.indexOf('id="cc-explore-home-btn"');
var fretboardCardEnd = source.indexOf("'<div class=\"cc-save-section\" id=\"cc-quality-analysis\" hidden></div>' +");

assert(buttonIndex > fretboardCardEnd, 'the Explore home button is generated after the fretboard card content');
assert(source.includes('class="cc-btn cc-btn-secondary cc-btn--block" id="cc-explore-home-btn">トップに戻る'), 'the bottom return uses the existing secondary block-button style');
assert(source.includes("document.getElementById('cc-nav-top').click();"), 'the bottom return delegates to the existing app-level TOP navigation');

console.log('explore-top-return: bottom return button reuses the existing TOP navigation OK');
