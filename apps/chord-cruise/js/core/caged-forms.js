(function () {
    'use strict';

    /* CAGEDフォーム辞書（移動可能フォーム）。
       各スロットは { s: 弦番号(1-6), o: ルートフレットからのオフセット, iv: コードルートからの度数(半音) }。
       fingers はバレーポジション基準の標準運指（1=人 2=中 3=薬 4=小 / 'T'=親）。
       openFingers は開放ポジション（rootFret === 0）専用の運指。開放コードでは
       バレー基準の運指が一般的な形と異なるため、こちらを優先適用する。
       開放弦（実フレット0）は描画時に運指なし扱いにする。
       playability は standard / advanced / limited。warning はフォーム選択時だけ表示し、
       保存コードには複製しない。 */

    var SHAPE_ORDER = ['C', 'A', 'G', 'E', 'D'];

    var FORMS = {
        E: {
            rootString: 6,
            qualities: {
                maj: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 2, iv: 7 }, { s: 4, o: 2, iv: 0 }, { s: 3, o: 1, iv: 4 }, { s: 2, o: 0, iv: 7 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 1, 5: 3, 4: 4, 3: 2, 2: 1, 1: 1 },
                    openFingers: { 5: 2, 4: 3, 3: 1 }
                },
                m: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 2, iv: 7 }, { s: 4, o: 2, iv: 0 }, { s: 3, o: 0, iv: 3 }, { s: 2, o: 0, iv: 7 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 1, 5: 3, 4: 4, 3: 1, 2: 1, 1: 1 },
                    openFingers: { 5: 2, 4: 3 }
                },
                '7': {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 2, iv: 7 }, { s: 4, o: 0, iv: 10 }, { s: 3, o: 1, iv: 4 }, { s: 2, o: 0, iv: 7 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 1, 5: 3, 4: 1, 3: 2, 2: 1, 1: 1 },
                    openFingers: { 5: 2, 3: 1 }
                },
                maj7: {
                    /* 中指が4-3弦をミニバレーする形（バレー表示で視認できる） */
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 2, iv: 7 }, { s: 4, o: 1, iv: 11 }, { s: 3, o: 1, iv: 4 }, { s: 2, o: 0, iv: 7 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 1, 5: 3, 4: 2, 3: 2, 2: 1, 1: 1 },
                    openFingers: { 5: 2, 4: 1, 3: 1 }
                },
                m7: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 2, iv: 7 }, { s: 4, o: 0, iv: 10 }, { s: 3, o: 0, iv: 3 }, { s: 2, o: 0, iv: 7 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 1, 5: 3, 4: 1, 3: 1, 2: 1, 1: 1 },
                    openFingers: { 5: 2 }
                },
                m7b5: {
                    /* 6弦=中 4弦=薬 3弦=小 2弦=人（人差し指が最も低いフレット） */
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 4, o: 0, iv: 10 }, { s: 3, o: 0, iv: 3 }, { s: 2, o: -1, iv: 6 }],
                    muted: [5, 1],
                    fingers: { 6: 2, 4: 3, 3: 4, 2: 1 }
                },
                dim: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 1, iv: 6 }, { s: 3, o: 0, iv: 3 }],
                    muted: [4, 2, 1],
                    fingers: { 6: 1, 5: 2, 3: 3 },
                    openFingers: { 5: 1 }
                }
            }
        },
        A: {
            rootString: 5,
            qualities: {
                maj: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 2, iv: 7 }, { s: 3, o: 2, iv: 0 }, { s: 2, o: 2, iv: 4 }, { s: 1, o: 0, iv: 7 }],
                    muted: [6],
                    fingers: { 5: 1, 4: 2, 3: 3, 2: 4, 1: 1 },
                    openFingers: { 4: 1, 3: 2, 2: 3 }
                },
                m: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 2, iv: 7 }, { s: 3, o: 2, iv: 0 }, { s: 2, o: 1, iv: 3 }, { s: 1, o: 0, iv: 7 }],
                    muted: [6],
                    fingers: { 5: 1, 4: 3, 3: 4, 2: 2, 1: 1 },
                    openFingers: { 4: 2, 3: 3, 2: 1 }
                },
                '7': {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 2, iv: 7 }, { s: 3, o: 0, iv: 10 }, { s: 2, o: 2, iv: 4 }, { s: 1, o: 0, iv: 7 }],
                    muted: [6],
                    fingers: { 5: 1, 4: 3, 3: 1, 2: 4, 1: 1 },
                    openFingers: { 4: 2, 2: 3 }
                },
                maj7: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 2, iv: 7 }, { s: 3, o: 1, iv: 11 }, { s: 2, o: 2, iv: 4 }, { s: 1, o: 0, iv: 7 }],
                    muted: [6],
                    fingers: { 5: 1, 4: 3, 3: 2, 2: 4, 1: 1 },
                    openFingers: { 4: 2, 3: 1, 2: 3 }
                },
                m7: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 2, iv: 7 }, { s: 3, o: 0, iv: 10 }, { s: 2, o: 1, iv: 3 }, { s: 1, o: 0, iv: 7 }],
                    muted: [6],
                    fingers: { 5: 1, 4: 3, 3: 1, 2: 2, 1: 1 },
                    openFingers: { 4: 2, 2: 1 }
                },
                m7b5: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 1, iv: 6 }, { s: 3, o: 0, iv: 10 }, { s: 2, o: 1, iv: 3 }],
                    muted: [6, 1],
                    fingers: { 5: 1, 4: 3, 3: 2, 2: 4 },
                    openFingers: { 4: 1, 2: 2 }
                },
                dim: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 1, iv: 6 }, { s: 3, o: 2, iv: 0 }, { s: 2, o: 1, iv: 3 }],
                    muted: [6, 1],
                    fingers: { 5: 1, 4: 2, 3: 4, 2: 3 },
                    openFingers: { 4: 1, 3: 3, 2: 2 }
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
                    fingers: { 6: 3, 5: 2, 4: 1, 3: 1, 2: 1, 1: 4 },
                    openFingers: { 6: 3, 5: 2, 1: 1 }
                },
                '7': {
                    /* 1弦は小指。人差し指は4〜2弦のミニバレー（例: A7 = 5-4-2-2-2-3） */
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: -1, iv: 4 }, { s: 4, o: -3, iv: 7 }, { s: 3, o: -3, iv: 0 }, { s: 2, o: -3, iv: 4 }, { s: 1, o: -2, iv: 10 }],
                    muted: [],
                    fingers: { 6: 3, 5: 2, 4: 1, 3: 1, 2: 1, 1: 4 },
                    openFingers: { 6: 3, 5: 2, 1: 1 }
                },
                m: {
                    /* 実用的なG型マイナーの低音側フォーム（例: Cm = 8-6-5-5-x-x） */
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: -2, iv: 3 }, { s: 4, o: -3, iv: 7 }, { s: 3, o: -3, iv: 0 }],
                    muted: [2, 1],
                    fingers: { 6: 4, 5: 2, 4: 1, 3: 1 },
                    openFingers: { 6: 3, 5: 1 },
                    playability: 'standard',
                    warning: ''
                },
                m7: {
                    /* 完全5度を省略した低音側フォーム（例: Cm7 = 8-6-8-5-x-x） */
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: -2, iv: 3 }, { s: 4, o: 0, iv: 10 }, { s: 3, o: -3, iv: 0 }],
                    muted: [2, 1],
                    fingers: { 6: 3, 5: 2, 4: 4, 3: 1 },
                    openFingers: { 6: 3, 5: 1, 4: 4 },
                    playability: 'limited',
                    warning: '完全5度を省略した実用ボイシングです。'
                },
                m7b5: {
                    /* 3弦ルートの高音側フォーム（例: Cm7♭5 = x-x-8-8-7-8） */
                    slots: [{ s: 4, o: 0, iv: 10 }, { s: 3, o: 0, iv: 3 }, { s: 2, o: -1, iv: 6 }, { s: 1, o: 0, iv: 0 }],
                    muted: [6, 5],
                    fingers: { 4: 2, 3: 3, 2: 1, 1: 4 },
                    playability: 'limited',
                    warning: '低音2弦を省略した実用ボイシングです。'
                },
                dim: {
                    /* 6弦と高音3弦で構成する実用フォーム（例: Cdim = 8-x-x-8-7-8） */
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 3, o: 0, iv: 3 }, { s: 2, o: -1, iv: 6 }, { s: 1, o: 0, iv: 0 }],
                    muted: [5, 4],
                    fingers: { 6: 1, 3: 3, 2: 2, 1: 4 },
                    playability: 'standard',
                    warning: ''
                }
            }
        },
        C: {
            rootString: 5,
            qualities: {
                maj: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -1, iv: 4 }, { s: 3, o: -3, iv: 7 }, { s: 2, o: -2, iv: 0 }, { s: 1, o: -3, iv: 4 }],
                    muted: [6],
                    fingers: { 5: 4, 4: 3, 3: 1, 2: 2, 1: 1 },
                    openFingers: { 5: 3, 4: 2, 2: 1 }
                },
                maj7: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -1, iv: 4 }, { s: 3, o: -3, iv: 7 }, { s: 2, o: -3, iv: 11 }, { s: 1, o: -3, iv: 4 }],
                    muted: [6],
                    fingers: { 5: 3, 4: 2, 3: 1, 2: 1, 1: 1 },
                    openFingers: { 5: 3, 4: 2 }
                },
                '7': {
                    /* ムーバブルC型7は1弦をミュート（x-R-3-♭7-R-x。例: D7 = x-5-4-5-3-x） */
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -1, iv: 4 }, { s: 3, o: 0, iv: 10 }, { s: 2, o: -2, iv: 0 }],
                    muted: [6, 1],
                    fingers: { 5: 3, 4: 2, 3: 4, 2: 1 }
                },
                m: {
                    /* 一般的な3音のC型マイナー（例: Dm = x-5-3-2-x-x） */
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -2, iv: 3 }, { s: 3, o: -3, iv: 7 }],
                    muted: [6, 2, 1],
                    fingers: { 5: 3, 4: 2, 3: 1 },
                    openFingers: { 5: 2, 4: 1 },
                    playability: 'standard',
                    warning: ''
                },
                m7: {
                    /* 完全5度を省略したC型m7（例: Cm7 = x-3-1-3-1-x） */
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -2, iv: 3 }, { s: 3, o: 0, iv: 10 }, { s: 2, o: -2, iv: 0 }],
                    muted: [6, 1],
                    fingers: { 5: 3, 4: 1, 3: 4, 2: 1 },
                    playability: 'limited',
                    warning: '完全5度を省略した実用ボイシングです。'
                },
                m7b5: {
                    /* 人差し指の4〜2弦ミニバレーを使う完全形（例: Cm7♭5 = x-3-1-3-1-2） */
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -2, iv: 3 }, { s: 3, o: 0, iv: 10 }, { s: 2, o: -2, iv: 0 }, { s: 1, o: -1, iv: 6 }],
                    muted: [6],
                    fingers: { 5: 3, 4: 1, 3: 4, 2: 1, 1: 2 },
                    playability: 'advanced',
                    warning: 'ミニバレーを含む、押さえにくい上級者向けの形です。'
                },
                dim: {
                    /* 4フレット幅の3音フォーム（例: Ddim = x-5-3-1-x-x） */
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -2, iv: 3 }, { s: 3, o: -4, iv: 6 }],
                    muted: [6, 2, 1],
                    fingers: { 5: 4, 4: 2, 3: 1 },
                    playability: 'advanced',
                    warning: '4フレット幅のストレッチを含む上級者向けの形です。'
                }
            }
        },
        D: {
            rootString: 4,
            qualities: {
                maj: {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 2, iv: 7 }, { s: 2, o: 3, iv: 0 }, { s: 1, o: 2, iv: 4 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 2, 2: 4, 1: 3 },
                    openFingers: { 3: 1, 2: 3, 1: 2 }
                },
                m: {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 2, iv: 7 }, { s: 2, o: 3, iv: 0 }, { s: 1, o: 1, iv: 3 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 3, 2: 4, 1: 2 },
                    openFingers: { 3: 2, 2: 3, 1: 1 }
                },
                '7': {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 2, iv: 7 }, { s: 2, o: 1, iv: 10 }, { s: 1, o: 2, iv: 4 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 3, 2: 2, 1: 4 },
                    openFingers: { 3: 2, 2: 1, 1: 3 }
                },
                maj7: {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 2, iv: 7 }, { s: 2, o: 2, iv: 11 }, { s: 1, o: 2, iv: 4 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 2, 2: 3, 1: 4 },
                    openFingers: { 3: 1, 2: 1, 1: 1 }
                },
                m7: {
                    /* 人=4弦 / 薬=3弦 / 中=2-1弦ミニバレー（人差し指が最も低いフレット） */
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 2, iv: 7 }, { s: 2, o: 1, iv: 10 }, { s: 1, o: 1, iv: 3 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 3, 2: 2, 1: 2 },
                    openFingers: { 3: 2, 2: 1, 1: 1 }
                },
                m7b5: {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 1, iv: 6 }, { s: 2, o: 1, iv: 10 }, { s: 1, o: 1, iv: 3 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 3, 2: 3, 1: 3 },
                    openFingers: { 3: 1, 2: 1, 1: 1 }
                },
                dim: {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 1, iv: 6 }, { s: 2, o: 3, iv: 0 }, { s: 1, o: 1, iv: 3 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 2, 2: 4, 1: 3 },
                    openFingers: { 3: 1, 2: 3, 1: 2 }
                }
            }
        }
    };

    /**
     * 指定の型・品質・ルート音で実フォームを求める。
     * 表示範囲が0Fを含み、フォーム内の最低フレットが0Fになる場合だけ
     * openFingers を優先適用する。12F以降ではムーバブルフォーム用運指を使う。
     * @returns { available:true, shape, qualityKey, rootFret, notes:[{string,fret,interval,finger}],
     *            mutedStrings, fretRange:{min,max,includesOpen} }
     *          または { available:false, reason:'quality'|'position' }
     */
    function getForm(shapeKey, qualityKey, rootPc, maxFret, minFret) {
        var shape = FORMS[shapeKey];
        var theory = window.ChordCruise.theory;
        if (!shape || !shape.qualities[qualityKey]) {
            return {
                available: false,
                reason: 'quality',
                message: shapeKey + '型では、この品質の実用フォームを登録していません。'
            };
        }
        var def = shape.qualities[qualityKey];
        var openPc = theory.OPEN_STRINGS[6 - shape.rootString];
        var limit = typeof maxFret === 'number' ? maxFret : 13;
        var lowerLimit = typeof minFret === 'number' ? minFret : 0;

        var minOffset = 0;
        var maxOffset = 0;
        def.slots.forEach(function (slot) {
            if (slot.o < minOffset) minOffset = slot.o;
            if (slot.o > maxOffset) maxOffset = slot.o;
        });

        var rootFret = null;
        var f;
        for (f = Math.max(0, lowerLimit - minOffset); f <= limit; f++) {
            if ((openPc + f) % 12 !== ((rootPc % 12) + 12) % 12) continue;
            if (f + minOffset < lowerLimit) continue;
            if (f + maxOffset > limit) continue;
            rootFret = f;
            break;
        }
        if (rootFret === null) {
            return { available: false, reason: 'position' };
        }

        // 開放ポジション（フォーム内の最低フレットが開放弦=0になる配置）では
        // 一般的な開放コード運指を優先する。E/A/D型は rootFret 0、C/G型は rootFret 3 が該当。
        var isOpenPosition = (lowerLimit === 0 && rootFret + minOffset === 0);
        var fingerSource = (isOpenPosition && def.openFingers) ? def.openFingers : def.fingers;

        var minFretUsed = null;
        var maxFretUsed = null;
        var includesOpen = false;
        var notes = def.slots.map(function (slot) {
            var fret = rootFret + slot.o;
            if (fret === 0) {
                includesOpen = true;
            } else {
                if (minFretUsed === null || fret < minFretUsed) minFretUsed = fret;
                if (maxFretUsed === null || fret > maxFretUsed) maxFretUsed = fret;
            }
            var finger = fret === 0 ? null : (fingerSource[slot.s] != null ? fingerSource[slot.s] : null);
            return { string: slot.s, fret: fret, interval: slot.iv, finger: finger };
        });

        return {
            available: true,
            shape: shapeKey,
            qualityKey: qualityKey,
            playability: def.playability || 'standard',
            warning: def.warning || '',
            rootFret: rootFret,
            usedOpenFingers: !!(isOpenPosition && def.openFingers),
            notes: notes,
            mutedStrings: def.muted.slice(),
            fretRange: {
                min: minFretUsed === null ? 0 : minFretUsed,
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

    /**
     * ノート列からバレー（同じ指で同フレットの複数弦を押さえる箇所）を検出する。
     * - 対象: fret > 0 かつ finger が null / undefined / 'T' でないノート
     * - 人差し指(1): 弦が非連続でも最低弦〜最高弦を1本のバレーとしてつなぐ
     * - 中指〜小指(2〜4): 連続する弦のみミニバレーにする（非連続は個別マーカーのまま）
     * 保存済みコードの notes からも導出できる（マイグレーション不要）。
     * @param {Array} notes [{string, fret, finger, ...}]
     * @returns {Array} [{ finger, fret, fromString, toString }]（fromString < toString）
     */
    function detectBarres(notes) {
        var groups = {};
        (notes || []).forEach(function (note) {
            if (!note || typeof note.fret !== 'number' || note.fret <= 0) return;
            var finger = note.finger;
            if (finger === null || finger === undefined || finger === 'T') return;
            var key = finger + '@' + note.fret;
            if (!groups[key]) {
                groups[key] = { finger: finger, fret: note.fret, strings: [] };
            }
            if (groups[key].strings.indexOf(note.string) === -1) {
                groups[key].strings.push(note.string);
            }
        });

        var barres = [];
        Object.keys(groups).forEach(function (key) {
            var group = groups[key];
            if (group.strings.length < 2) return;
            var sorted = group.strings.slice().sort(function (a, b) { return a - b; });

            if (String(group.finger) === '1') {
                // 人差し指: 全体を1本のバレーにする
                barres.push({
                    finger: group.finger,
                    fret: group.fret,
                    fromString: sorted[0],
                    toString: sorted[sorted.length - 1]
                });
                return;
            }

            // 中指〜小指: 連続区間だけをミニバレーにする
            var runStart = sorted[0];
            var prev = sorted[0];
            var i;
            for (i = 1; i <= sorted.length; i++) {
                var current = sorted[i];
                if (current === prev + 1) {
                    prev = current;
                    continue;
                }
                if (prev > runStart) {
                    barres.push({
                        finger: group.finger,
                        fret: group.fret,
                        fromString: runStart,
                        toString: prev
                    });
                }
                runStart = current;
                prev = current;
            }
        });
        return barres;
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.caged = {
        SHAPE_ORDER: SHAPE_ORDER,
        FORMS: FORMS,
        getForm: getForm,
        formatFretRange: formatFretRange,
        detectBarres: detectBarres
    };
})();
