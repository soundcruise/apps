'use strict';

var assert = require('assert');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/caged-forms.js');

var theory = window.ChordCruise.theory;
var caged = window.ChordCruise.caged;
var expectedComplexity = {
    maj: 'basic', '6': 'intermediate', sus4: 'basic', '7sus4': 'intermediate', M7sus4: 'intermediate',
    power5: 'basic', no5: 'intermediate', '7no3': 'advanced', maj7no3: 'advanced',
    '7no5': 'intermediate', maj7no5: 'intermediate', m7no5: 'intermediate', m: 'basic',
    m6: 'intermediate', dim: 'intermediate', maj7: 'basic', '7': 'basic', '7b5': 'advanced',
    maj7b5: 'advanced', m7: 'basic', m7b5: 'intermediate', aug: 'advanced',
    mMaj7: 'advanced', maj7sharp5: 'advanced', dim7: 'advanced'
};

assert.deepStrictEqual(Object.keys(theory.QUALITIES), Object.keys(expectedComplexity), 'every registered quality has a complexity classification');

Object.keys(expectedComplexity).forEach(function (qualityKey) {
    var quality = theory.QUALITIES[qualityKey];
    assert.strictEqual(quality.complexity, expectedComplexity[qualityKey], qualityKey + ' complexity is explicit');
    assert(['basic', 'intermediate', 'advanced'].indexOf(quality.complexity) !== -1, qualityKey + ' uses an allowed complexity value');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(quality, 'edition'), false, qualityKey + ' has no edition metadata');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(quality, 'pro'), false, qualityKey + ' has no Pro metadata');
    assert.strictEqual(theory.identifyQuality(quality.intervals), qualityKey, qualityKey + ' interval recognition is unchanged');
    assert.deepStrictEqual(theory.degreeLabelsForQuality(qualityKey, quality.intervals), quality.degreeLabels, qualityKey + ' degree labels are unchanged');
    assert.strictEqual(theory.chordSymbol(0, qualityKey, false), 'C' + quality.symbolSuffix, qualityKey + ' symbol is unchanged');
    ['C', 'A', 'G', 'E', 'D'].forEach(function (shape) {
        assert.strictEqual(caged.getForm(shape, qualityKey, 0, 13, 0).available, true, shape + '/' + qualityKey + ' CAGED availability is unchanged');
    });
});

console.log('quality-complexity: 25 explicit classifications preserve theory metadata and CAGED availability OK');
