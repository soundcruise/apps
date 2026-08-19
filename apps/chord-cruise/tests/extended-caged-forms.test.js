'use strict';

var assert = require('assert');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/caged-forms.js');
require('../js/core/chord-model.js');
require('../js/ui/fretboard.js');

var theory = window.ChordCruise.theory;
var caged = window.ChordCruise.caged;
var chordModel = window.ChordCruise.chordModel;
var fretboard = window.ChordCruise.ui.fretboard;
var shapes = ['C', 'A', 'G', 'E', 'D'];
var qualities = ['aug', 'mMaj7', 'maj7sharp5', 'dim7'];
var allQualities = ['maj', 'm', 'dim', 'maj7', '7', 'm7', 'm7b5'].concat(qualities);
var allowedFingers = [1, 2, 3, 4, 'T'];

// 実装から独立した20フォーム固定fixture。s:o/iv/finger、末尾!はwarning。
var FIXTURES = {
    C: {
        aug: ['5:0/0/4', '4:-1/4/3', '3:-2/8/1', '2:-2/0/2', '1:-3/4/null!'],
        mMaj7: ['5:0/0/4', '4:-2/3/2', '3:-3/7/1', '2:-3/11/1', '1:-4/3/null!'],
        maj7sharp5: ['5:0/0/4', '4:-1/4/3', '3:-2/8/2', '2:-3/11/1', '1:-3/4/1'],
        dim7: ['5:0/0/2', '3:-1/9/1', '2:1/3/4', '1:-1/6/1']
    },
    A: {
        aug: ['5:0/0/1', '4:3/8/4', '3:2/0/2', '2:2/4/3', '1:1/8/null!'],
        mMaj7: ['5:0/0/1', '4:2/7/4', '3:1/11/2', '2:1/3/3', '1:0/7/1'],
        maj7sharp5: ['5:0/0/1', '4:3/8/null!', '3:1/11/2', '2:2/4/4', '1:1/8/3'],
        dim7: ['5:0/0/2', '4:1/6/3', '3:-1/9/1', '2:1/3/4']
    },
    G: {
        aug: ['6:0/0/4', '5:-1/4/3', '4:-2/8/2', '3:-3/0/1', '2:-3/4/1', '1:0/0/null!'],
        mMaj7: ['6:0/0/4', '5:-2/3/2', '4:-3/7/1', '3:-3/0/null!', '2:-4/3/null!', '1:-1/11/3'],
        maj7sharp5: ['6:0/0/T', '5:-1/4/2', '4:-2/8/1', '3:-3/0/null!', '2:-3/4/null!', '1:-1/11/3'],
        dim7: ['6:0/0/T', '4:-1/9/1', '3:0/3/3', '2:-1/6/2']
    },
    E: {
        aug: ['6:0/0/1', '5:3/8/4', '4:2/0/3', '3:1/4/2', '2:1/8/null!', '1:0/0/null!'],
        mMaj7: ['6:0/0/1', '5:2/7/3', '4:1/11/2', '3:0/3/1', '2:0/7/1', '1:0/0/1'],
        maj7sharp5: ['6:0/0/1', '5:3/8/null!', '4:1/11/2', '3:1/4/3', '2:1/8/4', '1:0/0/1'],
        dim7: ['6:0/0/2', '5:1/6/4', '4:-1/9/1', '3:0/3/3']
    },
    D: {
        aug: ['4:0/0/1', '3:3/8/3', '2:3/0/4', '1:2/4/2'],
        mMaj7: ['4:0/0/1', '3:2/7/3', '2:2/11/4', '1:1/3/2'],
        maj7sharp5: ['4:0/0/1', '3:3/8/4', '2:2/11/2', '1:2/4/3'],
        dim7: ['4:0/0/1', '3:1/6/3', '2:0/9/2', '1:1/3/4']
    }
};

var EXPECTED_MUTED = {
    C: { aug: [6], mMaj7: [6], maj7sharp5: [6], dim7: [6, 4] },
    A: { aug: [6], mMaj7: [6], maj7sharp5: [6], dim7: [6, 1] },
    G: { aug: [], mMaj7: [], maj7sharp5: [], dim7: [5, 1] },
    E: { aug: [], mMaj7: [], maj7sharp5: [], dim7: [2, 1] },
    D: { aug: [6, 5], mMaj7: [6, 5], maj7sharp5: [6, 5], dim7: [6, 5] }
};

var EXPECTED_OPEN_FINGERS = {
    C: {
        aug: { 5: 4, 4: 3, 3: 1, 2: 2 },
        mMaj7: { 5: 4, 4: 2, 3: 1, 2: 1 },
        maj7sharp5: { 5: 3, 4: 2, 3: 1 },
        dim7: { 5: 1, 2: 2 }
    },
    A: {
        aug: { 4: 4, 3: 2, 2: 3, 1: 1 },
        mMaj7: { 5: 1, 4: 4, 3: 2, 2: 3, 1: 1 },
        maj7sharp5: { 3: 2, 2: 4, 1: 3 },
        dim7: { 5: 1, 4: 2, 2: 3 }
    },
    G: {
        aug: { 6: 3, 5: 2, 4: 1, 1: 4 },
        mMaj7: { 6: 4, 5: 2, 4: 1, 1: 3 },
        maj7sharp5: { 6: 4, 5: 2, 4: 1, 1: 3 },
        dim7: { 6: 1, 3: 2 }
    },
    E: {
        aug: { 5: 4, 4: 3, 3: 1, 2: 2 },
        mMaj7: { 6: 1, 5: 3, 4: 2, 3: 1, 2: 1, 1: 1 },
        maj7sharp5: { 4: 2, 3: 3, 2: 4 },
        dim7: { 6: 1, 5: 3, 3: 2 }
    },
    D: {
        aug: { 3: 2, 2: 3, 1: 1 },
        mMaj7: { 4: 1, 3: 3, 2: 4, 1: 2 },
        maj7sharp5: { 3: 4, 2: 2, 1: 3 },
        dim7: { 3: 1, 1: 2 }
    }
};

// Web資料で照合したCコードの代表TAB。6弦→1弦、xはmute。
var REFERENCE_ROOT_FRETS = { C: 3, A: 3, G: 8, E: 8, D: 10 };
var EXPECTED_TABS = {
    C: {
        aug: 'x,3,2,1,1,0',
        mMaj7: 'x,3,1,0,0,-1',
        maj7sharp5: 'x,3,2,1,0,0',
        dim7: 'x,3,x,2,4,2'
    },
    A: {
        aug: 'x,3,6,5,5,4',
        mMaj7: 'x,3,5,4,4,3',
        maj7sharp5: 'x,3,6,4,5,4',
        dim7: 'x,3,4,2,4,x'
    },
    G: {
        aug: '8,7,6,5,5,8',
        mMaj7: '8,6,5,5,4,7',
        maj7sharp5: '8,7,6,5,5,7',
        dim7: '8,x,7,8,7,x'
    },
    E: {
        aug: '8,11,10,9,9,8',
        mMaj7: '8,10,9,8,8,8',
        maj7sharp5: '8,11,9,9,9,8',
        dim7: '8,9,7,8,x,x'
    },
    D: {
        aug: 'x,x,10,13,13,12',
        mMaj7: 'x,x,10,12,12,11',
        maj7sharp5: 'x,x,10,13,12,12',
        dim7: 'x,x,10,11,10,11'
    }
};

// augのFINGERINGは、弦・フレット・指番号を明示する教材と一致するslotだけを採用する。
// sourceShapeでxの弦はFORMから消さず、warningStringsとして運指表示だけ⚠️にする。
var AUG_SOURCE_BACKED_FINGERING = {
    C: {
        source: 'https://everythingmusic.com/learn/guitar/chords/c/augmented',
        sourceShape: 'x,3,2,1,1,x',
        fingers: { 5: 4, 4: 3, 3: 1, 2: 2 },
        omitted: [1],
        openSourceShape: 'x,3,2,1,1,0'
    },
    A: {
        source: 'https://everythingmusic.com/learn/guitar/chords/c/augmented',
        sourceShape: 'x,3,6,5,5,x',
        fingers: { 5: 1, 4: 4, 3: 2, 2: 3 },
        omitted: [1],
        openSource: 'https://www.fretjam.com/augmented-guitar-chords.html',
        openSourceShape: 'x,0,3,2,2,1'
    },
    G: {
        source: 'https://everythingmusic.com/learn/guitar/chords/c/augmented',
        sourceShape: '8,7,6,5,5,x',
        fingers: { 6: 4, 5: 3, 4: 2, 3: 1, 2: 1 },
        omitted: [1],
        openSource: 'https://www.fretjam.com/augmented-guitar-chords.html',
        openSourceShape: '3,2,1,0,0,3'
    },
    E: {
        source: 'https://www.tabs4acoustic.com/en/Caug-guitar-chord%2C918.html',
        sourceShape: '8,11,10,9,x,x',
        fingers: { 6: 1, 5: 4, 4: 3, 3: 2 },
        omitted: [2, 1],
        openSource: 'https://everythingmusic.com/learn/guitar/chords/e/augmented',
        openSourceShape: '0,3,2,1,1,0'
    },
    D: {
        source: 'https://everythingmusic.com/learn/guitar/chords/c/augmented',
        sourceShape: 'x,x,10,13,13,12',
        fingers: { 4: 1, 3: 3, 2: 4, 1: 2 },
        omitted: [],
        openSource: 'https://www.fretjam.com/augmented-guitar-chords.html',
        openSourceShape: 'x,x,0,3,3,2'
    }
};

// GuitarLessons365の指番号入りCAGED sequenceを共通のFINGERING sourceにする。
// G型だけは教材が8654xxを採用し、理論FORM 865547の3〜1弦を正確には支持しない。
// C型1弦とG型3〜1弦はFORMへ残し、推測fingerを付けず運指表示だけwarningにする。
var MMAJ7_SOURCE_BACKED_FINGERING = {
    C: {
        source: 'https://www.guitarlessons365.com/scores/guitarchordmasterypt1/minMaj7Aug7min7b5CAGED.pdf',
        sourceShape: 'x,15,13,12,12,x',
        formShape: 'x,15,13,12,12,11',
        fingers: { 5: 4, 4: 2, 3: 1, 2: 1 },
        unsupported: [1]
    },
    A: {
        source: 'https://www.guitarlessons365.com/scores/guitarchordmasterypt1/minMaj7Aug7min7b5CAGED.pdf',
        sourceShape: 'x,3,5,4,4,3',
        formShape: 'x,3,5,4,4,3',
        fingers: { 5: 1, 4: 4, 3: 2, 2: 3, 1: 1 },
        unsupported: []
    },
    G: {
        source: 'user-verified',
        sourceShape: '8,6,5,4,x,x',
        formShape: '8,6,5,5,4,7',
        fingers: { 6: 4, 5: 2, 4: 1, 1: 3 },
        unsupported: [3, 2]
    },
    E: {
        source: 'https://www.guitarlessons365.com/scores/guitarchordmasterypt1/minMaj7Aug7min7b5CAGED.pdf',
        sourceShape: '8,10,9,8,8,8',
        formShape: '8,10,9,8,8,8',
        fingers: { 6: 1, 5: 3, 4: 2, 3: 1, 2: 1, 1: 1 },
        unsupported: []
    },
    D: {
        source: 'https://www.guitarlessons365.com/scores/guitarchordmasterypt1/minMaj7Aug7min7b5CAGED.pdf',
        sourceShape: 'x,x,10,12,12,11',
        formShape: 'x,x,10,12,12,11',
        fingers: { 4: 1, 3: 3, 2: 4, 1: 2 },
        unsupported: []
    }
};

// M7♯5はユーザーの実ギター確認結果をsource of truthとする。
// 推奨指を確定できなかった4slotはFORMから削らず、運指表示だけwarningにする。
var MAJ7SHARP5_USER_VERIFIED_FINGERING = {
    C: {
        formShape: 'x,15,14,13,12,12',
        fingers: { 5: 4, 4: 3, 3: 2, 2: 1, 1: 1 },
        openFingers: { 5: 3, 4: 2, 3: 1 },
        barres: [{ finger: 1, fret: 12, fromString: 1, toString: 2 }],
        openBarres: [],
        warnings: []
    },
    A: {
        formShape: 'x,3,6,4,5,4',
        fingers: { 5: 1, 3: 2, 2: 4, 1: 3 },
        openFingers: { 3: 2, 2: 4, 1: 3 },
        barres: [],
        openBarres: [],
        warnings: [4]
    },
    G: {
        formShape: '8,7,6,5,5,7',
        fingers: { 6: 'T', 5: 2, 4: 1, 1: 3 },
        openFingers: { 6: 4, 5: 2, 4: 1, 1: 3 },
        barres: [],
        openBarres: [],
        warnings: [3, 2]
    },
    E: {
        formShape: '8,11,9,9,9,8',
        fingers: { 6: 1, 4: 2, 3: 3, 2: 4, 1: 1 },
        openFingers: { 4: 2, 3: 3, 2: 4 },
        barres: [{ finger: 1, fret: 8, fromString: 1, toString: 6 }],
        openBarres: [],
        warnings: [5]
    },
    D: {
        formShape: 'x,x,10,13,12,12',
        fingers: { 4: 1, 3: 4, 2: 2, 1: 3 },
        openFingers: { 3: 4, 2: 2, 1: 3 },
        barres: [],
        openBarres: [],
        warnings: []
    }
};

// dim7は対称和音の一般的な4音コンパクトvoicingを5つの型名で保持する。
// 明示指番号のある資料を優先し、C/E型だけは同一指異フレットなし・2F以内を実配置で検証する。
var DIM7_SOURCE_BACKED_FINGERING = {
    C: { source: 'https://www.elgitar.com/dim7', formShape: 'x,3,x,2,4,2', fingers: { 5: 2, 3: 1, 2: 4, 1: 1 }, openFingers: { 5: 1, 2: 2 } },
    A: { source: 'https://www.all-guitar-chords.com/index.php/chords/index/c/dim7', formShape: 'x,3,4,2,4,x', fingers: { 5: 2, 4: 3, 3: 1, 2: 4 }, openFingers: { 5: 1, 4: 2, 2: 3 } },
    G: { source: 'user-verified', formShape: '8,x,7,8,7,x', fingers: { 6: 'T', 4: 1, 3: 3, 2: 2 }, openFingers: { 6: 1, 3: 2 } },
    E: { source: 'https://www.guitar-chord.org/cdim7.html', formShape: '8,9,7,8,x,x', fingers: { 6: 2, 5: 4, 4: 1, 3: 3 }, openFingers: { 6: 1, 5: 3, 3: 2 } },
    D: { source: 'https://www.all-guitar-chords.com/index.php/chords/index/c/dim7', formShape: 'x,x,10,11,10,11', fingers: { 4: 1, 3: 3, 2: 2, 1: 4 }, openFingers: { 3: 1, 1: 2 } }
};

function slotSpec(def) {
    return def.slots.map(function (slot) {
        var finger = def.fingers[slot.s] == null ? 'null' : String(def.fingers[slot.s]);
        return slot.s + ':' + slot.o + '/' + slot.iv + '/' + finger + (slot.fingeringWarning ? '!' : '');
    });
}

function requiredIntervals(qualityKey) {
    return theory.QUALITIES[qualityKey].intervals.slice().sort(function (a, b) { return a - b; });
}

var fixtureCount = 0;
shapes.forEach(function (shape) {
    assert.strictEqual(Object.keys(caged.FORMS[shape].qualities).length, 18, shape + ' supports the existing qualities plus seventh no5 derivatives');
    qualities.forEach(function (quality) {
        var def = caged.FORMS[shape].qualities[quality];
        assert.deepStrictEqual(slotSpec(def), FIXTURES[shape][quality], shape + '/' + quality + ' fixed slots');
        assert.deepStrictEqual(
            Array.from(new Set(def.slots.map(function (slot) { return slot.iv; }))).sort(function (a, b) { return a - b; }),
            requiredIntervals(quality),
            shape + '/' + quality + ' interval coverage'
        );
        assert(def.slots.some(function (slot) { return slot.iv === 0; }), shape + '/' + quality + ' has a root slot');
        assert(def.slots.length >= 3 && def.slots.length <= 6, shape + '/' + quality + ' uses the fixed theoretical form strings');
        var usedStrings = {};
        var fingerOffsets = {};
        def.slots.forEach(function (slot) {
            assert(!usedStrings[slot.s], shape + '/' + quality + ' string is unique');
            usedStrings[slot.s] = true;
            var finger = def.fingers[slot.s];
            if (slot.fingeringWarning) {
                assert.strictEqual(finger, undefined, shape + '/' + quality + ' warning has no finger');
            } else {
                assert(allowedFingers.indexOf(finger) !== -1, shape + '/' + quality + ' valid finger');
                if (!fingerOffsets[finger]) fingerOffsets[finger] = [];
                fingerOffsets[finger].push(slot.o);
            }
        });
        Object.keys(fingerOffsets).forEach(function (finger) {
            assert.strictEqual(new Set(fingerOffsets[finger]).size, 1, shape + '/' + quality + ' finger ' + finger + ' stays on one fret');
        });
        (def.muted || []).forEach(function (stringNum) {
            assert(!usedStrings[stringNum], shape + '/' + quality + ' mute does not overlap a note');
        });
        assert.deepStrictEqual(def.muted, EXPECTED_MUTED[shape][quality], shape + '/' + quality + ' fixed muted strings');
        for (var stringNum = 1; stringNum <= 6; stringNum += 1) {
            assert(usedStrings[stringNum] || def.muted.indexOf(stringNum) !== -1, shape + '/' + quality + ' accounts for every string');
        }
        Object.keys(fingerOffsets).forEach(function (finger) {
            if (finger === '1' || finger === 'T' || fingerOffsets[finger].length < 2) return;
            var fingerSlots = def.slots.filter(function (slot) {
                return String(def.fingers[slot.s]) === finger;
            }).sort(function (a, b) { return a.s - b.s; });
            for (var i = 1; i < fingerSlots.length; i += 1) {
                var previous = fingerSlots[i - 1];
                var current = fingerSlots[i];
                for (var coveredString = previous.s + 1; coveredString < current.s; coveredString += 1) {
                    var coveringSlot = def.slots.find(function (slot) { return slot.s === coveredString; });
                    assert(
                        coveringSlot && coveringSlot.o > previous.o,
                        shape + '/' + quality + ' non-index mini-barre gap is fretted higher by another finger'
                    );
                }
            }
        });
        var offsets = def.slots.map(function (slot) { return slot.o; });
        var span = Math.max.apply(null, offsets) - Math.min.apply(null, offsets);
        assert(span <= 4, shape + '/' + quality + ' span <= 4F');
        if (span === 4) assert.strictEqual(def.playability, 'advanced', shape + '/' + quality + ' labels its 4F span advanced');
        assert.deepStrictEqual(def.openFingers, EXPECTED_OPEN_FINGERS[shape][quality], shape + '/' + quality + ' fixed open fingering');
        var lowestRoot = def.slots.filter(function (slot) { return slot.iv === 0; }).sort(function (a, b) { return b.s - a.s; })[0];
        if (!lowestRoot.fingeringWarning) {
            assert(allowedFingers.indexOf(def.fingers[lowestRoot.s]) !== -1, shape + '/' + quality + ' lowest root has a recommended finger');
        }
        fixtureCount += 1;
    });
});
assert.strictEqual(fixtureCount, 20);

shapes.forEach(function (shape) {
    qualities.forEach(function (quality) {
        var def = caged.FORMS[shape].qualities[quality];
        var fretsByString = {};
        def.slots.forEach(function (slot) {
            fretsByString[slot.s] = REFERENCE_ROOT_FRETS[shape] + slot.o;
        });
        var tab = [6, 5, 4, 3, 2, 1].map(function (stringNum) {
            return fretsByString[stringNum] == null ? 'x' : String(fretsByString[stringNum]);
        }).join(',');
        assert.strictEqual(tab, EXPECTED_TABS[shape][quality], shape + '/' + quality + ' source-backed representative TAB');
    });
});

shapes.forEach(function (shape) {
    var def = caged.FORMS[shape].qualities.aug;
    var sourceFixture = AUG_SOURCE_BACKED_FINGERING[shape];
    assert.deepStrictEqual(def.fingers, sourceFixture.fingers, shape + '/aug uses only source-backed movable fingers');
    assert.deepStrictEqual(def.warningStrings || [], sourceFixture.omitted, shape + '/aug keeps source omissions as warning slots');
    assert(sourceFixture.source.indexOf('https://') === 0, shape + '/aug keeps a traceable source URL');
    sourceFixture.omitted.forEach(function (stringNum) {
        assert(def.slots.some(function (slot) {
            return slot.s === stringNum && slot.fingeringWarning === true;
        }), shape + '/aug keeps source-omitted string ' + stringNum + ' as a warning FORM slot');
        assert.strictEqual(def.muted.indexOf(stringNum), -1, shape + '/aug does not convert source omission to mute');
    });
});
assert.strictEqual(
    shapes.reduce(function (count, shape) {
        return count + AUG_SOURCE_BACKED_FINGERING[shape].omitted.length;
    }, 0),
    5,
    'aug has five source-omitted FORM slots in movable positions'
);

shapes.forEach(function (shape) {
    var def = caged.FORMS[shape].qualities.mMaj7;
    var sourceFixture = MMAJ7_SOURCE_BACKED_FINGERING[shape];
    var formRootFret = shape === 'C' ? 15 : REFERENCE_ROOT_FRETS[shape];
    var formFretsByString = {};
    def.slots.forEach(function (slot) { formFretsByString[slot.s] = formRootFret + slot.o; });
    var formShape = [6, 5, 4, 3, 2, 1].map(function (stringNum) {
        return formFretsByString[stringNum] == null ? 'x' : String(formFretsByString[stringNum]);
    }).join(',');
    assert.strictEqual(formShape, sourceFixture.formShape, shape + '/mMaj7 retains the complete theoretical FORM');
    assert.deepStrictEqual(def.fingers, sourceFixture.fingers, shape + '/mMaj7 uses only source-backed movable fingers');
    assert.deepStrictEqual(def.warningStrings || [], sourceFixture.unsupported, shape + '/mMaj7 keeps unsupported source slots as warnings');
    assert(sourceFixture.source === 'user-verified' || sourceFixture.source.indexOf('https://') === 0, shape + '/mMaj7 keeps a traceable source or user verification');
    sourceFixture.unsupported.forEach(function (stringNum) {
        assert(def.slots.some(function (slot) {
            return slot.s === stringNum && slot.fingeringWarning === true;
        }), shape + '/mMaj7 keeps unsupported string ' + stringNum + ' as a warning FORM slot');
        assert.strictEqual(def.muted.indexOf(stringNum), -1, shape + '/mMaj7 does not convert source omission to mute');
    });
});
assert.strictEqual(
    shapes.reduce(function (count, shape) {
        return count + MMAJ7_SOURCE_BACKED_FINGERING[shape].unsupported.length;
    }, 0),
    3,
    'mMaj7 has three FORM slots without source-backed fingering after the user-verified G shape update'
);

shapes.forEach(function (shape) {
    var def = caged.FORMS[shape].qualities.maj7sharp5;
    var sourceFixture = MAJ7SHARP5_USER_VERIFIED_FINGERING[shape];
    var formRootFret = shape === 'C' ? 15 : REFERENCE_ROOT_FRETS[shape];
    var formFretsByString = {};
    def.slots.forEach(function (slot) { formFretsByString[slot.s] = formRootFret + slot.o; });
    var formShape = [6, 5, 4, 3, 2, 1].map(function (stringNum) {
        return formFretsByString[stringNum] == null ? 'x' : String(formFretsByString[stringNum]);
    }).join(',');
    assert.strictEqual(formShape, sourceFixture.formShape, shape + '/M7♯5 retains the complete theoretical FORM');
    assert.deepStrictEqual(def.fingers, sourceFixture.fingers, shape + '/M7♯5 uses the user-verified movable fingering');
    assert.deepStrictEqual(def.openFingers, sourceFixture.openFingers, shape + '/M7♯5 keeps an independent open-position fingering');
    assert.deepStrictEqual(def.warningStrings || [], sourceFixture.warnings, shape + '/M7♯5 warns only on user-rejected fingering slots');
    sourceFixture.warnings.forEach(function (stringNum) {
        assert(def.slots.some(function (slot) {
            return slot.s === stringNum && slot.fingeringWarning === true;
        }), shape + '/M7♯5 retains warning string ' + stringNum + ' as a FORM slot');
        assert.strictEqual(def.muted.indexOf(stringNum), -1, shape + '/M7♯5 does not convert warning string to mute');
    });
    var form = caged.getForm(shape, 'maj7sharp5', 0, shape === 'C' ? 25 : 13, shape === 'C' ? 12 : 0);
    assert.deepStrictEqual(caged.detectBarres(form.notes), sourceFixture.barres, shape + '/M7♯5 barre is contiguous or validly overridden at a higher fret');
    assert.strictEqual(form.notes.filter(function (note) { return note.fingeringWarning; }).length, sourceFixture.warnings.length, shape + '/M7♯5 produces only user-verified warnings');
    assert.strictEqual(!!form.warning, sourceFixture.warnings.length > 0, shape + '/M7♯5 warning card matches warning slots');
});
assert.strictEqual(
    shapes.reduce(function (count, shape) {
        return count + MAJ7SHARP5_USER_VERIFIED_FINGERING[shape].warnings.length;
    }, 0),
    4,
    'M7♯5 has the four user-verified warning slots'
);
assert.strictEqual(
    shapes.reduce(function (count, shape) {
        return count + caged.FORMS[shape].qualities.maj7sharp5.slots.length;
    }, 0),
    26,
    'M7♯5 retains all 26 theoretical FORM slots despite four fingering warnings'
);

shapes.forEach(function (shape) {
    var def = caged.FORMS[shape].qualities.dim7;
    var sourceFixture = DIM7_SOURCE_BACKED_FINGERING[shape];
    assert.deepStrictEqual(def.fingers, sourceFixture.fingers, shape + '/dim7 uses the audited movable fingering');
    assert.deepStrictEqual(def.openFingers, sourceFixture.openFingers, shape + '/dim7 keeps an independent open fingering');
    assert.strictEqual(def.slots.length, 4, shape + '/dim7 keeps the compact four-note FORM');
    assert.strictEqual(new Set(def.slots.map(function (slot) { return slot.iv; })).size, 4, shape + '/dim7 contains all four chord tones exactly once');
    assert.strictEqual(def.slots.some(function (slot) { return slot.fingeringWarning; }), false, shape + '/dim7 has a complete audited fingering');
    assert(sourceFixture.source === 'user-verified' || sourceFixture.source.indexOf('https://') === 0, shape + '/dim7 keeps a traceable source or user verification');
    assert.strictEqual(EXPECTED_TABS[shape].dim7, sourceFixture.formShape, shape + '/dim7 fixture records the retained FORM');
});

var scenarioCount = 0;
var extendedScenarioCount = 0;
var partialCount = 0;
var barreCount = 0;
[{ start: 0, end: 13 }, { start: 12, end: 25 }].forEach(function (range) {
    allQualities.forEach(function (quality) {
        for (var rootPc = 0; rootPc < 12; rootPc += 1) {
            shapes.forEach(function (shape) {
                var form = caged.getForm(shape, quality, rootPc, range.end, range.start);
                assert.strictEqual(form.available, true, shape + '/' + quality + '/' + rootPc + ' available');
                assert.deepStrictEqual(caged.getForm(shape, quality, rootPc, range.end, range.start), form, 'deterministic form');
                form.notes.forEach(function (note) {
                    var actualPc = (theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12;
                    assert.strictEqual(actualPc, (rootPc + note.interval) % 12, 'actual pitch matches interval');
                    assert(note.fret >= range.start && note.fret <= range.end, 'note remains in viewport');
                });
                if (!form.hasOutOfRangeNotes) {
                    assert(form.notes.some(function (note) { return note.interval === 0; }), 'full form keeps a root marker');
                } else {
                    partialCount += 1;
                }
                barreCount += caged.detectBarres(form.notes).length;
                scenarioCount += 1;
                if (qualities.indexOf(quality) !== -1) extendedScenarioCount += 1;
            });
        }
    });
});
assert.strictEqual(scenarioCount, 1320, '12 roots × 11 qualities × 2 ranges × 5 shapes');
assert.strictEqual(extendedScenarioCount, 480, '12 roots × 4 qualities × 2 ranges × 5 shapes');
assert(partialCount > 0, 'range-edge partial forms are exercised');

// Phase D後のユーザー実機確認: m7♭5はE/D型だけ運指を更新する。
// FORM slot・mute・C/A/G型・openFingersは変更せず、E型5弦だけ運指表示を⚠️にする。
var M7B5_FIXED_DEFINITIONS = {
    C: ['5:0/0/3', '4:-2/3/1', '3:0/10/4', '2:-2/0/1', '1:-1/6/2'],
    A: ['5:0/0/1', '4:1/6/3', '3:0/10/2', '2:1/3/4', '1:-1/6/null!'],
    G: ['6:0/0/null!', '5:-2/3/null!', '4:-4/6/1', '3:-3/0/2', '2:-4/3/1', '1:-2/10/4'],
    E: ['6:0/0/T', '5:1/6/null!', '4:0/10/2', '3:0/3/3', '2:-1/6/1', '1:0/0/4'],
    D: ['4:0/0/1', '3:1/6/2', '2:1/10/3', '1:1/3/4']
};
var M7B5_OPEN_FINGERS = {
    C: undefined,
    A: { 5: 1, 4: 3, 3: 1, 2: 4 },
    G: undefined,
    E: undefined,
    D: { 3: 1, 2: 1, 1: 1 }
};
shapes.forEach(function (shape) {
    var def = caged.FORMS[shape].qualities.m7b5;
    assert.deepStrictEqual(slotSpec(def), M7B5_FIXED_DEFINITIONS[shape], shape + '/m7♭5 keeps the audited FORM/fingering split');
    assert.deepStrictEqual(def.openFingers, M7B5_OPEN_FINGERS[shape], shape + '/m7♭5 open fingering is unchanged');
});
assert.deepStrictEqual(caged.FORMS.E.qualities.m7b5.warningStrings, [5], 'E/m7♭5 warns only the retained fifth-string FORM slot');
assert.strictEqual(caged.FORMS.D.qualities.m7b5.warningStrings, undefined, 'D/m7♭5 has no warning slots');
['E', 'D'].forEach(function (shape) {
    for (var rootPc = 0; rootPc < 12; rootPc += 1) {
        [[0, 13], [12, 25]].forEach(function (range) {
            var form = caged.getForm(shape, 'm7b5', rootPc, range[1], range[0]);
            assert.strictEqual(form.available, true, shape + '/m7♭5 root ' + rootPc + ' is available in its range');
            assert.deepStrictEqual(
                form.notes.map(function (note) { return note.interval; }).sort(function (a, b) { return a - b; }),
                (shape === 'E' ? [0, 0, 3, 6, 6, 10] : [0, 3, 6, 10]),
                shape + '/m7♭5 preserves visible FORM intervals'
            );
            var warnings = form.notes.filter(function (note) { return note.fingeringWarning; });
            if (shape === 'E') {
                assert.strictEqual(warnings.length, 1, 'E/m7♭5 has exactly one warning');
                assert.strictEqual(warnings[0].string, 5, 'E/m7♭5 warning remains on fifth string');
            } else {
                assert.strictEqual(warnings.length, 0, 'D/m7♭5 remains warning-free');
            }
        });
    }
});
var cM7b5E = caged.getForm('E', 'm7b5', 0, 13, 0);
var cM7b5D = caged.getForm('D', 'm7b5', 0, 13, 0);
assert.deepStrictEqual(caged.detectBarres(cM7b5E.notes), [], 'E/m7♭5 user fingering needs no barre');
assert.deepStrictEqual(caged.detectBarres(cM7b5D.notes), [], 'D/m7♭5 user fingering needs no barre');
assert(barreCount > 0, 'barres remain detected across all extended-quality scenarios');

// 各固定フォームが0Fへ接する配置でopenFingersを使い、開放弦のfingerをnullにする。
shapes.forEach(function (shape) {
    qualities.forEach(function (quality) {
        var def = caged.FORMS[shape].qualities[quality];
        var minOffset = Math.min.apply(null, def.slots.map(function (slot) { return slot.o; }));
        var openRootFret = -minOffset;
        var rootPc = (theory.OPEN_STRINGS[6 - caged.FORMS[shape].rootString] + openRootFret) % 12;
        var form = caged.getForm(shape, quality, rootPc, 13, 0);
        assert.strictEqual(form.available, true);
        assert.strictEqual(form.usedOpenFingers, true, shape + '/' + quality + ' uses openFingers');
        assert(form.notes.some(function (note) { return note.fret === 0; }), shape + '/' + quality + ' contains an open string');
        form.notes.filter(function (note) { return note.fret === 0; }).forEach(function (note) {
            assert.strictEqual(note.finger, null, 'open string has no finger');
        });
    });
});

// M7♯5の開放形も、開放弦はfinger:null、未確定slotだけはwarningとして保持する。
shapes.forEach(function (shape) {
    var def = caged.FORMS[shape].qualities.maj7sharp5;
    var minOffset = Math.min.apply(null, def.slots.map(function (slot) { return slot.o; }));
    var openRootFret = -minOffset;
    var rootPc = (theory.OPEN_STRINGS[6 - caged.FORMS[shape].rootString] + openRootFret) % 12;
    var form = caged.getForm(shape, 'maj7sharp5', rootPc, 13, 0);
    assert.strictEqual(form.usedOpenFingers, true, shape + '/M7♯5 uses the independent open fingering');
    var expectedWarningCount = form.notes.filter(function (note) {
        return MAJ7SHARP5_USER_VERIFIED_FINGERING[shape].warnings.indexOf(note.string) !== -1 && note.fret > 0;
    }).length;
    assert.strictEqual(form.notes.filter(function (note) { return note.fingeringWarning; }).length, expectedWarningCount, shape + '/M7♯5 open position keeps only fretted warning slots');
    form.notes.filter(function (note) { return note.fret > 0; }).forEach(function (note) {
        if (note.fingeringWarning) {
            assert.strictEqual(note.finger, null, shape + '/M7♯5 warning slot has no inferred finger');
        } else {
            assert(allowedFingers.indexOf(note.finger) !== -1, shape + '/M7♯5 open fretted slot has a valid finger');
        }
    });
    assert.deepStrictEqual(
        caged.detectBarres(form.notes),
        MAJ7SHARP5_USER_VERIFIED_FINGERING[shape].openBarres,
        shape + '/M7♯5 open barre is physically contiguous or validly overridden'
    );
});

// 各aug開放形は別の明示運指sourceと一致し、開放弦を含めwarningを残さない。
// C型1弦は開放、A/G/E/D型もsource diagramの開放形をそのまま使う。
shapes.forEach(function (shape) {
    var def = caged.FORMS[shape].qualities.aug;
    var minOffset = Math.min.apply(null, def.slots.map(function (slot) { return slot.o; }));
    var openRootFret = -minOffset;
    var rootPc = (theory.OPEN_STRINGS[6 - caged.FORMS[shape].rootString] + openRootFret) % 12;
    var form = caged.getForm(shape, 'aug', rootPc, 13, 0);
    assert.strictEqual(form.usedOpenFingers, true, shape + '/aug uses the source-backed open fingering');
    assert.strictEqual(form.notes.some(function (note) { return note.fingeringWarning; }), false, shape + '/aug open position has no unsupported finger warning');
    assert.strictEqual(form.warning, '', shape + '/aug open position hides the fingering warning card');
});

// C型はCaug開放形では1弦が開放だが、同じFORMを高音域へ移動すると、
// source diagramで省略される1弦だけが運指警告になる。
var cAugCHigh = caged.getForm('C', 'aug', 0, 25, 12);
var cAugCHighFirstString = cAugCHigh.notes.find(function (note) { return note.string === 1; });
assert(cAugCHighFirstString, 'high Caug C-shape keeps its first-string FORM note');
assert.strictEqual(cAugCHighFirstString.interval, 4);
assert.strictEqual(cAugCHighFirstString.finger, null);
assert.strictEqual(cAugCHighFirstString.fingeringWarning, true);
assert.strictEqual(cAugCHigh.mutedStrings.indexOf(1), -1);
assert(cAugCHigh.warning.indexOf('参照した運指では同時に演奏しない') !== -1, 'movable source omission shows the source-backed warning');

['dim7'].forEach(function (quality) {
    shapes.forEach(function (shape) {
        var def = caged.FORMS[shape].qualities[quality];
        assert(!def.slots.some(function (slot) { return slot.fingeringWarning === true; }), shape + '/' + quality + ' has no forced warning note');
        assert(!def.warningStrings || def.warningStrings.length === 0, shape + '/' + quality + ' has no warning-only string');
    });
});
assert.deepStrictEqual(caged.FORMS.G.qualities.mMaj7.fingers, { 6: 4, 5: 2, 4: 1, 1: 3 }, 'G/mMaj7 uses the user-verified fingering without an inferred thumb');
assert.strictEqual(caged.FORMS.G.qualities.aug.fingers[6], 4, 'G/aug low root uses the source diagram pinky, not an inferred thumb');
assert.deepStrictEqual(caged.FORMS.G.qualities.dim7.fingers, { 6: 'T', 4: 1, 3: 3, 2: 2 }, 'G/dim7 uses the user-verified thumb, index, ring, middle fingering');
assert.strictEqual(caged.FORMS.E.qualities.mMaj7.fingers[6], 1, 'E/mMaj7 source diagram uses an index-finger barre, not an inferred thumb');
assert.strictEqual(caged.FORMS.G.qualities.maj7sharp5.fingers[6], 'T', 'G/M7♯5 retains the user-verified thumb root');
assert.strictEqual(caged.FORMS.E.qualities.maj7sharp5.fingers[6], 1, 'E/M7♯5 uses an index barre and does not add an unnecessary thumb');

// augはFORMを運指都合で縮めない。Caug G型の1弦rootを含め、理論slotは
// mutedStringsから独立して全表示modeへ渡せるデータとして残す。
var cAugG = caged.getForm('G', 'aug', 0, 13, 0);
assert.strictEqual(cAugG.available, true);
var cAugGHighRoot = cAugG.notes.find(function (note) { return note.string === 1; });
assert(cAugGHighRoot, 'Caug G-shape keeps the first-string theoretical root');
assert.strictEqual(cAugGHighRoot.interval, 0);
assert.strictEqual(cAugGHighRoot.finger, null);
assert.strictEqual(cAugGHighRoot.fingeringWarning, true);
assert.strictEqual(cAugG.mutedStrings.indexOf(1), -1, 'first string is not muted for fingering convenience');
assert.deepStrictEqual(
    cAugG.notes.map(function (note) { return note.interval; }),
    [0, 4, 8, 0, 4, 0],
    'Caug G-shape retains all six theoretical intervals'
);

// Caug 5型は同じFORMをCDE／ドレミ／度数／運指へ渡す。運指表示だけが
// finger / fingeringWarningを解釈し、他モードからslotを除外しない。
var C_AUG_VIEW_FIXTURES = {
    C: {
        cde: ['C', 'E', 'G♯', 'C', 'E'],
        solfege: ['ド', 'ミ', 'ソ♯', 'ド', 'ミ'],
        degree: ['1', '3', '♯5', '1', '3'],
        finger: ['小', '薬', '人', '中', ''],
        barres: []
    },
    A: {
        cde: ['C', 'G♯', 'C', 'E', 'G♯'],
        solfege: ['ド', 'ソ♯', 'ド', 'ミ', 'ソ♯'],
        degree: ['1', '♯5', '1', '3', '♯5'],
        finger: ['人', '小', '中', '薬', '⚠'],
        barres: []
    },
    G: {
        cde: ['C', 'E', 'G♯', 'C', 'E', 'C'],
        solfege: ['ド', 'ミ', 'ソ♯', 'ド', 'ミ', 'ド'],
        degree: ['1', '3', '♯5', '1', '3', '1'],
        finger: ['小', '薬', '中', '人', '人', '⚠'],
        barres: [{ finger: 1, fret: 5, fromString: 2, toString: 3 }]
    },
    E: {
        cde: ['C', 'G♯', 'C', 'E', 'G♯', 'C'],
        solfege: ['ド', 'ソ♯', 'ド', 'ミ', 'ソ♯', 'ド'],
        degree: ['1', '♯5', '1', '3', '♯5', '1'],
        finger: ['人', '小', '薬', '中', '⚠', '⚠'],
        barres: []
    },
    D: {
        cde: ['C', 'G♯', 'C', 'E'],
        solfege: ['ド', 'ソ♯', 'ド', 'ミ'],
        degree: ['1', '♯5', '1', '3'],
        finger: ['人', '薬', '小', '中'],
        barres: []
    }
};
var fingerLabels = { 1: '人', 2: '中', 3: '薬', 4: '小', T: '親' };

var C_M7B5_VIEW_FIXTURES = {
    E: {
        cde: ['C', 'F♯', 'A♯', 'D♯', 'F♯', 'C'],
        solfege: ['ド', 'ファ♯', 'ラ♯', 'レ♯', 'ファ♯', 'ド'],
        degree: ['1', '♭5', '♭7', '♭3', '♭5', '1'],
        finger: ['親', '⚠', '中', '薬', '人', '小']
    },
    D: {
        cde: ['C', 'F♯', 'A♯', 'D♯'],
        solfege: ['ド', 'ファ♯', 'ラ♯', 'レ♯'],
        degree: ['1', '♭5', '♭7', '♭3'],
        finger: ['人', '中', '薬', '小']
    }
};
['E', 'D'].forEach(function (shape) {
    var form = caged.getForm(shape, 'm7b5', 0, 13, 0);
    var cde = form.notes.map(function (note) {
        return theory.noteName((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, false);
    });
    var solfege = form.notes.map(function (note) {
        return theory.solfegeName((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, false);
    });
    var degree = form.notes.map(function (note) {
        return theory.degreeLabelsForQuality('m7b5', [0, 3, 6, 10])[[0, 3, 6, 10].indexOf(note.interval)];
    });
    var finger = form.notes.map(function (note) {
        return note.fingeringWarning ? '⚠' : (fingerLabels[note.finger] || '');
    });
    assert.deepStrictEqual(cde, C_M7B5_VIEW_FIXTURES[shape].cde, shape + '/m7♭5 CDE retains every FORM sound');
    assert.deepStrictEqual(solfege, C_M7B5_VIEW_FIXTURES[shape].solfege, shape + '/m7♭5 solfege retains every FORM sound');
    assert.deepStrictEqual(degree, C_M7B5_VIEW_FIXTURES[shape].degree, shape + '/m7♭5 degree retains every FORM sound');
    assert.deepStrictEqual(finger, C_M7B5_VIEW_FIXTURES[shape].finger, shape + '/m7♭5 fingering uses the user-verified result');
});
shapes.forEach(function (shape) {
    var form = caged.getForm(shape, 'aug', 0, 13, 0);
    var cde = form.notes.map(function (note) {
        return theory.noteName((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, false);
    });
    var solfege = form.notes.map(function (note) {
        return theory.solfegeName((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, false);
    });
    var degree = form.notes.map(function (note) {
        return theory.degreeLabelsForQuality('aug', [0, 4, 8])[[0, 4, 8].indexOf(note.interval)];
    });
    var finger = form.notes.map(function (note) {
        if (note.finger != null) return fingerLabels[note.finger] || '';
        return note.fingeringWarning ? '⚠' : '';
    });
    assert.deepStrictEqual(cde, C_AUG_VIEW_FIXTURES[shape].cde, shape + '/aug CDE keeps every FORM slot');
    assert.deepStrictEqual(solfege, C_AUG_VIEW_FIXTURES[shape].solfege, shape + '/aug solfege keeps every FORM slot');
    assert.deepStrictEqual(degree, C_AUG_VIEW_FIXTURES[shape].degree, shape + '/aug degree keeps every FORM slot');
    assert.deepStrictEqual(finger, C_AUG_VIEW_FIXTURES[shape].finger, shape + '/aug fingering uses the same FORM slots');
    assert.deepStrictEqual(caged.detectBarres(form.notes), C_AUG_VIEW_FIXTURES[shape].barres, shape + '/aug fixed barre detection');
});

// PNGは本棚と同じdiagram markerをsource SVGへ渡す。G型の6slotが
// 各表示modeのラベルのまま書き出し経路に残ることを固定する。
var cAugGFrets = [5, 6, 7, 8];
['cde', 'solfege', 'degree', 'finger'].forEach(function (mode) {
    var labels = C_AUG_VIEW_FIXTURES.G[mode];
    var markers = cAugG.notes.map(function (note, index) {
        return { string: note.string, fret: note.fret, label: labels[index], role: note.interval === 0 ? 'root' : 'other' };
    });
    var pngSource = fretboard.buildExportSvg('Caug', {
        frets: cAugGFrets,
        markers: markers,
        barres: caged.detectBarres(cAugG.notes),
        mutedStrings: cAugG.mutedStrings
    }).svg;
    labels.forEach(function (label) {
        assert(pngSource.indexOf('>' + label + '</text>') !== -1, 'Caug G-shape PNG keeps ' + mode + ' label ' + label);
    });
});

// CmM7も5型の完全FORMをCDE／ドレミ／度数／運指へ共通で渡す。
// C型だけは1弦♭3まで収まる高音側の同一形（root 15F）を使い、通常域の範囲外省略と混同しない。
var C_MMAJ7_VIEW_FIXTURES = {
    C: {
        cde: ['C', 'D♯', 'G', 'B', 'D♯'],
        solfege: ['ド', 'レ♯', 'ソ', 'シ', 'レ♯'],
        degree: ['1', '♭3', '5', '7', '♭3'],
        finger: ['小', '中', '人', '人', '⚠'],
        barres: [{ finger: 1, fret: 12, fromString: 2, toString: 3 }]
    },
    A: {
        cde: ['C', 'G', 'B', 'D♯', 'G'],
        solfege: ['ド', 'ソ', 'シ', 'レ♯', 'ソ'],
        degree: ['1', '5', '7', '♭3', '5'],
        finger: ['人', '小', '中', '薬', '人'],
        barres: [{ finger: 1, fret: 3, fromString: 1, toString: 5 }]
    },
    G: {
        cde: ['C', 'D♯', 'G', 'C', 'D♯', 'B'],
        solfege: ['ド', 'レ♯', 'ソ', 'ド', 'レ♯', 'シ'],
        degree: ['1', '♭3', '5', '1', '♭3', '7'],
        finger: ['小', '中', '人', '⚠', '⚠', '薬'],
        barres: []
    },
    E: {
        cde: ['C', 'G', 'B', 'D♯', 'G', 'C'],
        solfege: ['ド', 'ソ', 'シ', 'レ♯', 'ソ', 'ド'],
        degree: ['1', '5', '7', '♭3', '5', '1'],
        finger: ['人', '薬', '中', '人', '人', '人'],
        barres: [{ finger: 1, fret: 8, fromString: 1, toString: 6 }]
    },
    D: {
        cde: ['C', 'G', 'B', 'D♯'],
        solfege: ['ド', 'ソ', 'シ', 'レ♯'],
        degree: ['1', '5', '7', '♭3'],
        finger: ['人', '薬', '小', '中'],
        barres: []
    }
};
var cMmaj7Forms = {};
shapes.forEach(function (shape) {
    var form = shape === 'C'
        ? caged.getForm(shape, 'mMaj7', 0, 25, 0)
        : caged.getForm(shape, 'mMaj7', 0, 13, 0);
    cMmaj7Forms[shape] = form;
    var cde = form.notes.map(function (note) {
        return theory.noteName((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, false);
    });
    var solfege = form.notes.map(function (note) {
        return theory.solfegeName((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, false);
    });
    var degree = form.notes.map(function (note) {
        return theory.degreeLabelsForQuality('mMaj7', [0, 3, 7, 11])[[0, 3, 7, 11].indexOf(note.interval)];
    });
    var finger = form.notes.map(function (note) {
        if (note.finger != null) return fingerLabels[note.finger] || '';
        return note.fingeringWarning ? '⚠' : '';
    });
    assert.deepStrictEqual(cde, C_MMAJ7_VIEW_FIXTURES[shape].cde, shape + '/mMaj7 CDE keeps every FORM slot');
    assert.deepStrictEqual(solfege, C_MMAJ7_VIEW_FIXTURES[shape].solfege, shape + '/mMaj7 solfege keeps every FORM slot');
    assert.deepStrictEqual(degree, C_MMAJ7_VIEW_FIXTURES[shape].degree, shape + '/mMaj7 degree keeps every FORM slot');
    assert.deepStrictEqual(finger, C_MMAJ7_VIEW_FIXTURES[shape].finger, shape + '/mMaj7 fingering uses the same FORM slots');
    assert.deepStrictEqual(caged.detectBarres(form.notes), C_MMAJ7_VIEW_FIXTURES[shape].barres, shape + '/mMaj7 source-backed barre detection');
});

// 保存PNGの元SVGでも、G型の6slotと運指warningを含む全modeラベルを失わない。
var cMmaj7G = cMmaj7Forms.G;
['cde', 'solfege', 'degree', 'finger'].forEach(function (mode) {
    var labels = C_MMAJ7_VIEW_FIXTURES.G[mode];
    var markers = cMmaj7G.notes.map(function (note, index) {
        return { string: note.string, fret: note.fret, label: labels[index], role: note.interval === 0 ? 'root' : 'other' };
    });
    var pngSource = fretboard.buildExportSvg('CmM7', {
        frets: [4, 5, 6, 7, 8],
        markers: markers,
        barres: caged.detectBarres(cMmaj7G.notes),
        mutedStrings: cMmaj7G.mutedStrings
    }).svg;
    labels.forEach(function (label) {
        assert(pngSource.indexOf('>' + label + '</text>') !== -1, 'CmM7 G-shape PNG keeps ' + mode + ' label ' + label);
    });
});

// CM7♯5も5型の理論FORMをCDE／ドレミ／度数／運指へ全slot渡す。
// 実機で推奨指を確定できなかった4slotだけを、運指表示で⚠にする。
var C_MAJ7SHARP5_VIEW_FIXTURES = {
    C: {
        cde: ['C', 'E', 'G♯', 'B', 'E'],
        solfege: ['ド', 'ミ', 'ソ♯', 'シ', 'ミ'],
        degree: ['1', '3', '♯5', '7', '3'],
        finger: ['薬', '中', '人', '', ''],
        barres: []
    },
    A: {
        cde: ['C', 'G♯', 'B', 'E', 'G♯'],
        solfege: ['ド', 'ソ♯', 'シ', 'ミ', 'ソ♯'],
        degree: ['1', '♯5', '7', '3', '♯5'],
        finger: ['人', '⚠', '中', '小', '薬'],
        barres: []
    },
    G: {
        cde: ['C', 'E', 'G♯', 'C', 'E', 'B'],
        solfege: ['ド', 'ミ', 'ソ♯', 'ド', 'ミ', 'シ'],
        degree: ['1', '3', '♯5', '1', '3', '7'],
        finger: ['親', '中', '人', '⚠', '⚠', '薬'],
        barres: []
    },
    E: {
        cde: ['C', 'G♯', 'B', 'E', 'G♯', 'C'],
        solfege: ['ド', 'ソ♯', 'シ', 'ミ', 'ソ♯', 'ド'],
        degree: ['1', '♯5', '7', '3', '♯5', '1'],
        finger: ['人', '⚠', '中', '薬', '小', '人'],
        barres: [{ finger: 1, fret: 8, fromString: 1, toString: 6 }]
    },
    D: {
        cde: ['C', 'G♯', 'B', 'E'],
        solfege: ['ド', 'ソ♯', 'シ', 'ミ'],
        degree: ['1', '♯5', '7', '3'],
        finger: ['人', '小', '中', '薬'],
        barres: []
    }
};
var cMaj7Sharp5Forms = {};
shapes.forEach(function (shape) {
    var form = shape === 'C'
        ? caged.getForm(shape, 'maj7sharp5', 0, 25, 0)
        : caged.getForm(shape, 'maj7sharp5', 0, 13, 0);
    cMaj7Sharp5Forms[shape] = form;
    var cde = form.notes.map(function (note) {
        return theory.noteName((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, false);
    });
    var solfege = form.notes.map(function (note) {
        return theory.solfegeName((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, false);
    });
    var degree = form.notes.map(function (note) {
        return theory.degreeLabelsForQuality('maj7sharp5', [0, 4, 8, 11])[[0, 4, 8, 11].indexOf(note.interval)];
    });
    var finger = form.notes.map(function (note) {
        if (note.finger != null) return fingerLabels[note.finger] || '';
        return note.fingeringWarning ? '⚠' : '';
    });
    assert.deepStrictEqual(cde, C_MAJ7SHARP5_VIEW_FIXTURES[shape].cde, shape + '/M7♯5 CDE keeps every FORM slot');
    assert.deepStrictEqual(solfege, C_MAJ7SHARP5_VIEW_FIXTURES[shape].solfege, shape + '/M7♯5 solfege keeps every FORM slot');
    assert.deepStrictEqual(degree, C_MAJ7SHARP5_VIEW_FIXTURES[shape].degree, shape + '/M7♯5 degree keeps every FORM slot');
    assert.deepStrictEqual(finger, C_MAJ7SHARP5_VIEW_FIXTURES[shape].finger, shape + '/M7♯5 uses the user-verified fingering');
    assert.deepStrictEqual(caged.detectBarres(form.notes), C_MAJ7SHARP5_VIEW_FIXTURES[shape].barres, shape + '/M7♯5 detects only the retained barre');
});
var cMaj7Sharp5G = cMaj7Sharp5Forms.G;
['cde', 'solfege', 'degree', 'finger'].forEach(function (mode) {
    var labels = C_MAJ7SHARP5_VIEW_FIXTURES.G[mode];
    var markers = cMaj7Sharp5G.notes.map(function (note, index) {
        return { string: note.string, fret: note.fret, label: labels[index], role: note.interval === 0 ? 'root' : 'other' };
    });
    var pngSource = fretboard.buildExportSvg('CM7♯5', {
        frets: [5, 6, 7, 8],
        markers: markers,
        barres: caged.detectBarres(cMaj7Sharp5G.notes),
        mutedStrings: cMaj7Sharp5G.mutedStrings
    }).svg;
    labels.forEach(function (label) {
        assert(pngSource.indexOf('>' + label + '</text>') !== -1, 'CM7♯5 G-shape PNG keeps ' + mode + ' label ' + label);
    });
});

// Cdim7 5型も同じ4つのFORM音をCDE／ドレミ／度数／運指へ渡す。
var C_DIM7_VIEW_FIXTURES = {
    C: { cde: ['C', 'A', 'D♯', 'F♯'], solfege: ['ド', 'ラ', 'レ♯', 'ファ♯'], degree: ['1', '♭♭7', '♭3', '♭5'], finger: ['中', '人', '小', '人'], barres: [{ finger: 1, fret: 2, fromString: 1, toString: 3 }] },
    A: { cde: ['C', 'F♯', 'A', 'D♯'], solfege: ['ド', 'ファ♯', 'ラ', 'レ♯'], degree: ['1', '♭5', '♭♭7', '♭3'], finger: ['中', '薬', '人', '小'], barres: [] },
    G: { cde: ['C', 'A', 'D♯', 'F♯'], solfege: ['ド', 'ラ', 'レ♯', 'ファ♯'], degree: ['1', '♭♭7', '♭3', '♭5'], finger: ['親', '人', '薬', '中'], barres: [] },
    E: { cde: ['C', 'F♯', 'A', 'D♯'], solfege: ['ド', 'ファ♯', 'ラ', 'レ♯'], degree: ['1', '♭5', '♭♭7', '♭3'], finger: ['中', '小', '人', '薬'], barres: [] },
    D: { cde: ['C', 'F♯', 'A', 'D♯'], solfege: ['ド', 'ファ♯', 'ラ', 'レ♯'], degree: ['1', '♭5', '♭♭7', '♭3'], finger: ['人', '薬', '中', '小'], barres: [] }
};
var cDim7Forms = {};
shapes.forEach(function (shape) {
    var form = caged.getForm(shape, 'dim7', 0, 13, 0);
    cDim7Forms[shape] = form;
    var cde = form.notes.map(function (note) {
        return theory.noteName((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, false);
    });
    var solfege = form.notes.map(function (note) {
        return theory.solfegeName((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, false);
    });
    var degree = form.notes.map(function (note) {
        return theory.degreeLabelsForQuality('dim7', [0, 3, 6, 9])[[0, 3, 6, 9].indexOf(note.interval)];
    });
    var finger = form.notes.map(function (note) { return fingerLabels[note.finger] || ''; });
    assert.deepStrictEqual(cde, C_DIM7_VIEW_FIXTURES[shape].cde, shape + '/dim7 CDE keeps every FORM slot');
    assert.deepStrictEqual(solfege, C_DIM7_VIEW_FIXTURES[shape].solfege, shape + '/dim7 solfege keeps every FORM slot');
    assert.deepStrictEqual(degree, C_DIM7_VIEW_FIXTURES[shape].degree, shape + '/dim7 degree uses the double-flat seventh');
    assert.deepStrictEqual(finger, C_DIM7_VIEW_FIXTURES[shape].finger, shape + '/dim7 uses the audited fingering');
    assert.deepStrictEqual(caged.detectBarres(form.notes), C_DIM7_VIEW_FIXTURES[shape].barres, shape + '/dim7 detects only physical barres');
});

var dimChord = chordModel.buildCustomChord({ rootPc: 0, third: 3, fifth: 6, seventh: 9, tensions: [] }, '');
assert.strictEqual(dimChord.qualityKey, 'dim7');
assert.deepStrictEqual(dimChord.degreeLabelsList, ['1', '♭3', '♭5', '♭♭7']);
var dimForm = cDim7Forms.G;
var dimMarkers = dimForm.notes.map(function (note) {
    var noteIndex = dimChord.intervals.indexOf(note.interval);
    return { string: note.string, fret: note.fret, label: dimChord.degreeLabelsList[noteIndex], role: 'seventh' };
});
var dimSvg = fretboard.buildStaticSvg({ frets: [7, 8], markers: dimMarkers });
var dimPngSvg = fretboard.buildExportSvg('Cdim7', { frets: [7, 8], markers: dimMarkers, barres: caged.detectBarres(dimForm.notes), mutedStrings: dimForm.mutedStrings }).svg;
assert(dimSvg.indexOf('>♭♭7</text>') !== -1, 'HTML/static SVG supports double-flat seventh');
assert(dimPngSvg.indexOf('>♭♭7</text>') !== -1, 'PNG source SVG supports double-flat seventh');
assert(dimSvg.indexOf('font-size:10px') !== -1, 'three-character marker uses compact static size');

console.log('extended-caged-forms: 20 fixtures, ' + scenarioCount + ' total scenarios, ' + extendedScenarioCount + ' new scenarios, ' + partialCount + ' partials OK');
