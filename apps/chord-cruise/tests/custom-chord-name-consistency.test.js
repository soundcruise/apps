'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/chord-model.js');
require('../js/ui/fretboard.js');

var root = path.join(__dirname, '..');
var theory = window.ChordCruise.theory;
var model = window.ChordCruise.chordModel;
var fretboard = window.ChordCruise.ui.fretboard;
var librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');

var THIRDS = [4, 3, 5, null];
var FIFTHS = [7, 6, 8, null];
var SEVENTHS = [null, 10, 11, 9];
var TENSIONS = [13, 14, 15, 17, 18, 20, 21];

function coreIntervals(spec) {
    return [0, spec.third, spec.fifth, spec.seventh].filter(function (interval) {
        return interval !== null;
    });
}

function coreKey(spec) {
    return [spec.third, spec.fifth, spec.seventh].map(function (value) {
        return value === null ? 'n' : String(value);
    }).join('/');
}

function allTensionSubsets() {
    var subsets = [];
    for (var mask = 0; mask < Math.pow(2, TENSIONS.length); mask++) {
        subsets.push(TENSIONS.filter(function (_, index) { return (mask & (1 << index)) !== 0; }));
    }
    return subsets;
}

/** 文字列fixtureではなく、選択したcoreの意味が名前へ残ることを確認する。 */
function assertCoreMeaning(spec, symbol) {
    var rootName = model.CUSTOM_ROOT_NAMES[spec.rootPc];
    var suffix = symbol.slice(rootName.length);
    var qualityKey = theory.identifyQuality(coreIntervals(spec));

    if (qualityKey) {
        assert.strictEqual(suffix, theory.QUALITIES[qualityKey].symbolSuffix,
            coreKey(spec) + ' keeps canonical quality ' + qualityKey);
        return;
    }

    if (spec.third === 3) assert.strictEqual(suffix.indexOf('m'), 0, coreKey(spec) + ' retains m3');
    if (spec.third === 5) assert(suffix.indexOf('sus4') !== -1, coreKey(spec) + ' retains sus4');
    if (spec.third === null) assert(suffix.indexOf('no3') !== -1, coreKey(spec) + ' retains no3');

    if (spec.fifth === 6) assert(suffix.indexOf('♭5') !== -1, coreKey(spec) + ' retains flat fifth');
    if (spec.fifth === 8) {
        assert(suffix.indexOf('♯5') !== -1 || suffix.indexOf('aug') !== -1,
            coreKey(spec) + ' retains sharp fifth');
    }
    if (spec.fifth === null) assert(suffix.indexOf('no5') !== -1, coreKey(spec) + ' retains explicit no5');

    if (spec.seventh === 9) assert(suffix.indexOf('6') !== -1, coreKey(spec) + ' retains sixth');
    if (spec.seventh === 10) {
        assert(suffix.indexOf('7') !== -1 && suffix.indexOf('M7') === -1,
            coreKey(spec) + ' retains minor seventh');
    }
    if (spec.seventh === 11) assert(suffix.indexOf('M7') !== -1, coreKey(spec) + ' retains major seventh');
}

function spec(third, fifth, seventh, tensions, rootPc) {
    return {
        rootPc: rootPc == null ? 0 : rootPc,
        third: third,
        fifth: fifth,
        seventh: seventh,
        tensions: tensions || [],
        bassPc: null
    };
}

// 監査で確定した必須3ケース。
[
    [spec(3, 8, 10), 'Cm7♯5'],
    [spec(4, 6, 9), 'C6(♭5)'],
    [spec(5, 6, 10), 'C7sus4(♭5)']
].forEach(function (fixture) {
    assert.strictEqual(model.buildCustomChord(fixture[0], '').symbol, fixture[1]);
});

// no5は任意コードで明示された意味として常に保持する。
[
    [spec(4, null, null), 'C(no5)'],
    [spec(3, null, 10), 'Cm7(no5)'],
    [spec(4, null, 9), 'C6(no5)'],
    [spec(null, null, null), 'C(no3,no5)']
].forEach(function (fixture) {
    assert.strictEqual(model.buildCustomChord(fixture[0], '').symbol, fixture[1]);
});

// 既存canonical qualityと、canonicalではないが既存の明確なaug7表記は変えない。
[
    [spec(4, 7, null), 'C'],
    [spec(3, 7, 10), 'Cm7'],
    [spec(4, 7, 10), 'C7'],
    [spec(4, 8, null), 'Caug'],
    [spec(3, 6, null), 'Cdim'],
    [spec(3, 6, 10), 'Cm7♭5'],
    [spec(3, 6, 9), 'Cdim7'],
    [spec(4, 8, 10), 'Caug7']
].forEach(function (fixture) {
    assert.strictEqual(model.buildCustomChord(fixture[0], '').symbol, fixture[1]);
});

// 監査で抽出した27 coreと、製品仕様で明示された追加no5 10 coreを固定する。
var AUDIT_27 = [
    '4/6/9', '4/8/9', '3/6/11',
    '3/8/n', '3/8/10', '3/8/11', '3/8/9',
    '5/7/9',
    '5/6/n', '5/6/10', '5/6/11', '5/6/9',
    '5/8/n', '5/8/10', '5/8/11', '5/8/9',
    '5/n/9', 'n/7/9',
    'n/6/n', 'n/6/10', 'n/6/11', 'n/6/9',
    'n/8/n', 'n/8/10', 'n/8/11', 'n/8/9',
    'n/n/9'
];
var AUDIT_NO5_10 = [
    '4/n/9',
    '3/n/n', '3/n/11', '3/n/9',
    '5/n/n', '5/n/10', '5/n/11',
    'n/n/n', 'n/n/10', 'n/n/11'
];
assert.strictEqual(AUDIT_27.length, 27);
assert.strictEqual(AUDIT_NO5_10.length, 10);

var coreCount = 0;
var audit27Count = 0;
var auditNo5Count = 0;
THIRDS.forEach(function (third) {
    FIFTHS.forEach(function (fifth) {
        SEVENTHS.forEach(function (seventh) {
            var current = spec(third, fifth, seventh);
            var chord = model.buildCustomChord(current, '');
            assertCoreMeaning(current, chord.symbol);
            assert.deepStrictEqual(chord.coreIntervals, coreIntervals(current), coreKey(current) + ' keeps selected core intervals');
            assert.strictEqual(chord.qualityKey, theory.identifyQuality(coreIntervals(current)), coreKey(current) + ' keeps quality detection');
            if (AUDIT_27.indexOf(coreKey(current)) !== -1) {
                assertCoreMeaning(current, chord.symbol);
                audit27Count += 1;
            }
            if (AUDIT_NO5_10.indexOf(coreKey(current)) !== -1) {
                assertCoreMeaning(current, chord.symbol);
                auditNo5Count += 1;
            }
            coreCount += 1;
        });
    });
});
assert.strictEqual(coreCount, 64, 'all 64 core combinations are checked semantically');
assert.strictEqual(audit27Count, 27, 'all 27 audit mismatches now retain their selected meaning');
assert.strictEqual(auditNo5Count, 10, 'all 10 additional explicit-no5 cases retain no5');

// 64 core × tension 7種の全subset × 全12 root = 98,304 spec。
var tensionSubsets = allTensionSubsets();
var matrixCount = 0;
for (var rootPc = 0; rootPc < 12; rootPc++) {
    THIRDS.forEach(function (third) {
        FIFTHS.forEach(function (fifth) {
            SEVENTHS.forEach(function (seventh) {
                tensionSubsets.forEach(function (tensions) {
                    var current = spec(third, fifth, seventh, tensions, rootPc);
                    var chord = model.buildCustomChord(current, '');
                    var coreName = model.generateName(spec(third, fifth, seventh, [], rootPc));
                    assertCoreMeaning(current, coreName);
                    assert.deepStrictEqual(chord.coreIntervals, coreIntervals(current), coreKey(current) + ' does not change core intervals');
                    assert.deepStrictEqual(chord.tensionIntervals, tensions, coreKey(current) + ' does not change selected tensions');
                    assert.strictEqual(chord.symbol.indexOf(model.CUSTOM_ROOT_NAMES[rootPc]), 0, 'root spelling is retained');
                    tensions.forEach(function (tension) {
                        assert(chord.symbol.indexOf(model.TENSION_LABELS[tension]) !== -1,
                            coreKey(current) + ' retains tension ' + model.TENSION_LABELS[tension]);
                    });
                    matrixCount += 1;
                });
            });
        });
    });
}
assert.strictEqual(matrixCount, 98304, 'the complete requested spec matrix is checked');

// 手入力名は自動命名を通らず、slash bassは修正済みupper nameの後ろへだけ付く。
assert.strictEqual(model.buildCustomChord(spec(3, 8, 10), '手入力コード名').symbol, '手入力コード名');
var slashSpec = spec(3, 8, 10);
slashSpec.bassPc = 7;
assert.strictEqual(model.buildCustomChord(slashSpec, '').symbol, 'Cm7♯5/G');

// Library / folder PNG / individual SVGは保存済みchordNameを受け取るだけで、独自命名をしない。
assert(librarySource.indexOf('displayChordName(chord.chordName)') !== -1);
assert(librarySource.indexOf('escapeHtml(displayChordName(chord.chordName))') !== -1);
assert.strictEqual(librarySource.indexOf('generateName('), -1);
var corrected = model.buildCustomChord(spec(3, 8, 10), '');
var exportSvg = fretboard.buildExportSvg(corrected.symbol, {
    frets: [0, 1, 2, 3], markers: [], barres: [], mutedStrings: []
}).svg;
assert(exportSvg.indexOf('>Cm7♯5</text>') !== -1, 'individual SVG/PNG title receives the corrected generated name');

console.log('custom-chord-name-consistency: 64 core, 27 audit, 10 explicit no5, 98,304 specs, canonical/manual/slash/export invariants OK');
