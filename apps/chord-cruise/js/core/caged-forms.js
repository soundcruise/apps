(function () {
    'use strict';

    /* CAGEDフォーム辞書（移動可能フォーム）。
       各スロットは { s: 弦番号(1-6), o: ルートフレットからのオフセット, iv: コードルートからの度数(半音) }。
       fingers はバレーポジション基準の標準運指（1=人 2=中 3=薬 4=小 / 'T'=親）。
       開放弦（実フレット0）は描画時に運指なし扱いにする。
       C型・G型のマイナー系は実用性が乏しいため意図的に未収録。 */

    var SHAPE_ORDER = ['C', 'A', 'G', 'E', 'D'];

    var FORMS = {
        E: {
            rootString: 6,
            qualities: {
                maj: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 2, iv: 7 }, { s: 4, o: 2, iv: 0 }, { s: 3, o: 1, iv: 4 }, { s: 2, o: 0, iv: 7 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 1, 5: 3, 4: 4, 3: 2, 2: 1, 1: 1 }
                },
                m: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 2, iv: 7 }, { s: 4, o: 2, iv: 0 }, { s: 3, o: 0, iv: 3 }, { s: 2, o: 0, iv: 7 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 1, 5: 3, 4: 4, 3: 1, 2: 1, 1: 1 }
                },
                '7': {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 2, iv: 7 }, { s: 4, o: 0, iv: 10 }, { s: 3, o: 1, iv: 4 }, { s: 2, o: 0, iv: 7 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 1, 5: 3, 4: 1, 3: 2, 2: 1, 1: 1 }
                },
                maj7: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 2, iv: 7 }, { s: 4, o: 1, iv: 11 }, { s: 3, o: 1, iv: 4 }, { s: 2, o: 0, iv: 7 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 1, 5: 3, 4: 2, 3: 2, 2: 1, 1: 1 }
                },
                m7: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 2, iv: 7 }, { s: 4, o: 0, iv: 10 }, { s: 3, o: 0, iv: 3 }, { s: 2, o: 0, iv: 7 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 1, 5: 3, 4: 1, 3: 1, 2: 1, 1: 1 }
                },
                m7b5: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 4, o: 0, iv: 10 }, { s: 3, o: 0, iv: 3 }, { s: 2, o: -1, iv: 6 }],
                    muted: [5, 1],
                    fingers: { 6: 1, 4: 3, 3: 4, 2: 2 }
                },
                dim: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 1, iv: 6 }, { s: 3, o: 0, iv: 3 }],
                    muted: [4, 2, 1],
                    fingers: { 6: 1, 5: 2, 3: 3 }
                }
            }
        },
        A: {
            rootString: 5,
            qualities: {
                maj: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 2, iv: 7 }, { s: 3, o: 2, iv: 0 }, { s: 2, o: 2, iv: 4 }, { s: 1, o: 0, iv: 7 }],
                    muted: [6],
                    fingers: { 5: 1, 4: 2, 3: 3, 2: 4, 1: 1 }
                },
                m: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 2, iv: 7 }, { s: 3, o: 2, iv: 0 }, { s: 2, o: 1, iv: 3 }, { s: 1, o: 0, iv: 7 }],
                    muted: [6],
                    fingers: { 5: 1, 4: 3, 3: 4, 2: 2, 1: 1 }
                },
                '7': {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 2, iv: 7 }, { s: 3, o: 0, iv: 10 }, { s: 2, o: 2, iv: 4 }, { s: 1, o: 0, iv: 7 }],
                    muted: [6],
                    fingers: { 5: 1, 4: 3, 3: 1, 2: 4, 1: 1 }
                },
                maj7: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 2, iv: 7 }, { s: 3, o: 1, iv: 11 }, { s: 2, o: 2, iv: 4 }, { s: 1, o: 0, iv: 7 }],
                    muted: [6],
                    fingers: { 5: 1, 4: 3, 3: 2, 2: 4, 1: 1 }
                },
                m7: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 2, iv: 7 }, { s: 3, o: 0, iv: 10 }, { s: 2, o: 1, iv: 3 }, { s: 1, o: 0, iv: 7 }],
                    muted: [6],
                    fingers: { 5: 1, 4: 3, 3: 1, 2: 2, 1: 1 }
                },
                m7b5: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 1, iv: 6 }, { s: 3, o: 0, iv: 10 }, { s: 2, o: 1, iv: 3 }],
                    muted: [6, 1],
                    fingers: { 5: 1, 4: 3, 3: 2, 2: 4 }
                },
                dim: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 1, iv: 6 }, { s: 3, o: 2, iv: 0 }, { s: 2, o: 1, iv: 3 }],
                    muted: [6, 1],
                    fingers: { 5: 1, 4: 2, 3: 4, 2: 3 }
                }
            }
        },
        G: {
            rootString: 6,
            qualities: {
                maj: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: -1, iv: 4 }, { s: 4, o: -3, iv: 7 }, { s: 3, o: -3, iv: 0 }, { s: 2, o: -3, iv: 4 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 3, 5: 2, 4: 1, 3: 1, 2: 1, 1: 4 }
                },
                maj7: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: -1, iv: 4 }, { s: 4, o: -3, iv: 7 }, { s: 3, o: -3, iv: 0 }, { s: 2, o: -3, iv: 4 }, { s: 1, o: -1, iv: 11 }],
                    muted: [],
                    fingers: { 6: 3, 5: 2, 4: 1, 3: 1, 2: 1, 1: 4 }
                },
                '7': {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: -1, iv: 4 }, { s: 4, o: -3, iv: 7 }, { s: 3, o: -3, iv: 0 }, { s: 2, o: -3, iv: 4 }, { s: 1, o: -2, iv: 10 }],
                    muted: [],
                    fingers: { 6: 3, 5: 2, 4: 1, 3: 1, 2: 1, 1: 1 }
                }
            }
        },
        C: {
            rootString: 5,
            qualities: {
                maj: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -1, iv: 4 }, { s: 3, o: -3, iv: 7 }, { s: 2, o: -2, iv: 0 }, { s: 1, o: -3, iv: 4 }],
                    muted: [6],
                    fingers: { 5: 4, 4: 3, 3: 1, 2: 2, 1: 1 }
                },
                maj7: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -1, iv: 4 }, { s: 3, o: -3, iv: 7 }, { s: 2, o: -3, iv: 11 }, { s: 1, o: -3, iv: 4 }],
                    muted: [6],
                    fingers: { 5: 3, 4: 2, 3: 1, 2: 1, 1: 1 }
                },
                '7': {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -1, iv: 4 }, { s: 3, o: 0, iv: 10 }, { s: 2, o: -2, iv: 0 }, { s: 1, o: -3, iv: 4 }],
                    muted: [6],
                    fingers: { 5: 3, 4: 2, 3: 4, 2: 1, 1: 1 }
                }
            }
        },
        D: {
            rootString: 4,
            qualities: {
                maj: {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 2, iv: 7 }, { s: 2, o: 3, iv: 0 }, { s: 1, o: 2, iv: 4 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 2, 2: 4, 1: 3 }
                },
                m: {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 2, iv: 7 }, { s: 2, o: 3, iv: 0 }, { s: 1, o: 1, iv: 3 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 3, 2: 4, 1: 2 }
                },
                '7': {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 2, iv: 7 }, { s: 2, o: 1, iv: 10 }, { s: 1, o: 2, iv: 4 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 3, 2: 2, 1: 4 }
                },
                maj7: {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 2, iv: 7 }, { s: 2, o: 2, iv: 11 }, { s: 1, o: 2, iv: 4 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 2, 2: 3, 1: 4 }
                },
                m7: {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 2, iv: 7 }, { s: 2, o: 1, iv: 10 }, { s: 1, o: 1, iv: 3 }],
                    muted: [6, 5],
                    fingers: { 4: 2, 3: 3, 2: 1, 1: 1 }
                },
                m7b5: {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 1, iv: 6 }, { s: 2, o: 1, iv: 10 }, { s: 1, o: 1, iv: 3 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 3, 2: 3, 1: 3 }
                },
                dim: {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 1, iv: 6 }, { s: 2, o: 3, iv: 0 }, { s: 1, o: 1, iv: 3 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 2, 2: 4, 1: 3 }
                }
            }
        }
    };

    /**
     * 指定の型・品質・ルート音で実フォームを求める。
     * @returns { available:true, shape, qualityKey, rootFret, notes:[{string,fret,interval,finger}],
     *            mutedStrings, fretRange:{min,max,includesOpen} }
     *          または { available:false, reason:'quality'|'position' }
     */
    function getForm(shapeKey, qualityKey, rootPc, maxFret) {
        var shape = FORMS[shapeKey];
        var theory = window.ChordCruise.theory;
        if (!shape || !shape.qualities[qualityKey]) {
            return { available: false, reason: 'quality' };
        }
        var def = shape.qualities[qualityKey];
        var openPc = theory.OPEN_STRINGS[6 - shape.rootString];
        var limit = typeof maxFret === 'number' ? maxFret : 13;

        var minOffset = 0;
        var maxOffset = 0;
        def.slots.forEach(function (slot) {
            if (slot.o < minOffset) minOffset = slot.o;
            if (slot.o > maxOffset) maxOffset = slot.o;
        });

        var rootFret = null;
        var f;
        for (f = 0; f <= limit; f++) {
            if ((openPc + f) % 12 !== ((rootPc % 12) + 12) % 12) continue;
            if (f + minOffset < 0) continue;
            if (f + maxOffset > limit) continue;
            rootFret = f;
            break;
        }
        if (rootFret === null) {
            return { available: false, reason: 'position' };
        }

        var minFret = null;
        var maxFretUsed = null;
        var includesOpen = false;
        var notes = def.slots.map(function (slot) {
            var fret = rootFret + slot.o;
            if (fret === 0) {
                includesOpen = true;
            } else {
                if (minFret === null || fret < minFret) minFret = fret;
                if (maxFretUsed === null || fret > maxFretUsed) maxFretUsed = fret;
            }
            var finger = fret === 0 ? null : (def.fingers[slot.s] != null ? def.fingers[slot.s] : null);
            return { string: slot.s, fret: fret, interval: slot.iv, finger: finger };
        });

        return {
            available: true,
            shape: shapeKey,
            qualityKey: qualityKey,
            rootFret: rootFret,
            notes: notes,
            mutedStrings: def.muted.slice(),
            fretRange: {
                min: minFret === null ? 0 : minFret,
                max: maxFretUsed === null ? 0 : maxFretUsed,
                includesOpen: includesOpen
            }
        };
    }

    /** フォームのフレット範囲を「1〜3F＋開放」形式の文字列にする */
    function formatFretRange(fretRange) {
        if (!fretRange) return '';
        var base;
        if (fretRange.max === 0 && fretRange.includesOpen) {
            return '開放のみ';
        }
        if (fretRange.min === fretRange.max) {
            base = fretRange.min + 'F';
        } else {
            base = fretRange.min + '〜' + fretRange.max + 'F';
        }
        return fretRange.includesOpen ? base + '＋開放' : base;
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.caged = {
        SHAPE_ORDER: SHAPE_ORDER,
        FORMS: FORMS,
        getForm: getForm,
        formatFretRange: formatFretRange
    };
})();
