'use strict';

var assert = require('assert');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/caged-forms.js');

var theory = window.ChordCruise.theory;
var caged = window.ChordCruise.caged;
var shapes = ['C', 'A', 'G', 'E', 'D'];
var expected = {
    maj: ['major', 'none', 'basic', 'fixed', null],
    '6': ['major', 'sixth', 'intermediate', 'overlay', 'maj'],
    sus4: ['sus', 'none', 'basic', 'fixed', null],
    '7sus4': ['sus', 'none', 'intermediate', 'fixed', null],
    M7sus4: ['sus', 'none', 'intermediate', 'fixed', null],
    power5: ['power', 'none', 'basic', 'fixed', null],
    no5: ['major', 'no', 'intermediate', 'fixed', null],
    '7no3': ['dominant', 'no', 'advanced', 'fixed', null],
    maj7no3: ['major', 'no', 'advanced', 'fixed', null],
    '7no5': ['dominant', 'no', 'intermediate', 'fixed', null],
    maj7no5: ['major', 'no', 'intermediate', 'fixed', null],
    m7no5: ['minor', 'no', 'intermediate', 'fixed', null],
    m: ['minor', 'none', 'basic', 'fixed', null],
    m6: ['minor', 'sixth', 'intermediate', 'overlay', 'm'],
    dim: ['diminished', 'none', 'intermediate', 'fixed', null],
    maj7: ['major', 'none', 'basic', 'fixed', null],
    '7': ['dominant', 'none', 'basic', 'fixed', null],
    '7b5': ['dominant', 'altered', 'advanced', 'fixed', null],
    maj7b5: ['major', 'altered', 'advanced', 'fixed', null],
    m7: ['minor', 'none', 'basic', 'fixed', null],
    m7b5: ['minor', 'altered', 'intermediate', 'fixed', null],
    aug: ['augmented', 'none', 'advanced', 'fixed', null],
    mMaj7: ['minor', 'none', 'advanced', 'fixed', null],
    maj7sharp5: ['augmented', 'altered', 'advanced', 'fixed', null],
    dim7: ['diminished', 'none', 'advanced', 'fixed', null]
};

assert.deepStrictEqual(Object.keys(theory.QUALITIES), Object.keys(expected), 'all registered qualities have explicit metadata');

Object.keys(expected).forEach(function (qualityKey) {
    var quality = theory.QUALITIES[qualityKey];
    var metadata = expected[qualityKey];
    assert.strictEqual(quality.family, metadata[0], qualityKey + ' family');
    assert.strictEqual(quality.modifier, metadata[1], qualityKey + ' modifier');
    assert.strictEqual(quality.complexity, metadata[2], qualityKey + ' complexity');
    assert.deepStrictEqual(quality.caged, {
        supported: true,
        mode: metadata[3],
        baseQuality: metadata[4]
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

console.log('quality-metadata: 25 quality families, modifiers, complexities, and CAGED modes preserve theory and FORM availability OK');
