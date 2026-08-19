'use strict';

var assert = require('assert');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/caged-forms.js');

var theory = window.ChordCruise.theory;
var caged = window.ChordCruise.caged;
var shapes = ['C', 'A', 'G', 'E', 'D'];
var expected = {
    maj: ['major', 'none', 'fixed', null],
    '6': ['major', 'sixth', 'overlay', 'maj'],
    sus4: ['sus', 'none', 'fixed', null],
    '7sus4': ['sus', 'none', 'fixed', null],
    M7sus4: ['sus', 'none', 'fixed', null],
    power5: ['power', 'none', 'fixed', null],
    no5: ['major', 'no', 'fixed', null],
    '7no3': ['dominant', 'no', 'fixed', null],
    maj7no3: ['major', 'no', 'fixed', null],
    '7no5': ['dominant', 'no', 'fixed', null],
    maj7no5: ['major', 'no', 'fixed', null],
    m7no5: ['minor', 'no', 'fixed', null],
    m: ['minor', 'none', 'fixed', null],
    m6: ['minor', 'sixth', 'overlay', 'm'],
    dim: ['diminished', 'none', 'fixed', null],
    maj7: ['major', 'none', 'fixed', null],
    '7': ['dominant', 'none', 'fixed', null],
    '7b5': ['dominant', 'altered', 'fixed', null],
    maj7b5: ['major', 'altered', 'fixed', null],
    m7: ['minor', 'none', 'fixed', null],
    m7b5: ['minor', 'altered', 'fixed', null],
    aug: ['augmented', 'none', 'fixed', null],
    mMaj7: ['minor', 'none', 'fixed', null],
    maj7sharp5: ['augmented', 'altered', 'fixed', null],
    dim7: ['diminished', 'none', 'fixed', null]
};

assert.deepStrictEqual(Object.keys(theory.QUALITIES), Object.keys(expected), 'all registered qualities have explicit metadata');

Object.keys(expected).forEach(function (qualityKey) {
    var quality = theory.QUALITIES[qualityKey];
    var metadata = expected[qualityKey];
    assert.strictEqual(quality.family, metadata[0], qualityKey + ' family');
    assert.strictEqual(quality.modifier, metadata[1], qualityKey + ' modifier');
    assert.deepStrictEqual(quality.caged, {
        supported: true,
        mode: metadata[2],
        baseQuality: metadata[3]
    }, qualityKey + ' CAGED metadata');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(quality, 'edition'), false, qualityKey + ' deliberately has no edition metadata');
    assert.strictEqual(theory.identifyQuality(quality.intervals), qualityKey, qualityKey + ' quality recognition is unchanged');

    shapes.forEach(function (shape) {
        var form = caged.getForm(shape, qualityKey, 0, 13, 0);
        assert.strictEqual(form.available, true, shape + '/' + qualityKey + ' remains CAGED-available');
        if (quality.caged.mode === 'fixed') {
            assert(caged.FORMS[shape].qualities[qualityKey], shape + '/' + qualityKey + ' has a fixed definition');
        } else {
            assert.strictEqual(caged.FORMS[shape].qualities[qualityKey], undefined, shape + '/' + qualityKey + ' has no dedicated overlay definition');
            assert(caged.FORMS[shape].qualities[quality.caged.baseQuality], shape + '/' + qualityKey + ' base definition exists');
        }
    });
});

console.log('quality-metadata: 25 quality families, modifiers, and CAGED modes preserve theory and FORM availability OK');
