(function () {
    'use strict';

    /* 任意コードのモデル。
       選択肢の値体系（3度=4/3/5、5度=7/6/8、7度=10/11/9、テンション=13〜21）は
       音感クルーズPROの「コードを作る」と互換の考え方（ルートからの半音数）。 */

    // 任意コードのルート表記（音感クルーズPROと同じ慣用ミックス表記）
    var CUSTOM_ROOT_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
    var FLAT_ROOT_PCS = [3, 8, 10]; // E♭, A♭, B♭ はフラット表記系

    var TENSION_LABELS = {
        13: '♭9',
        14: '9',
        15: '♯9',
        17: '11',
        18: '♯11',
        20: '♭13',
        21: '13'
    };

    /**
     * コード名を自動生成する（音感クルーズPRO generateChordName 準拠、表記は本アプリ基準）。
     * @param {Object} spec { rootPc, third, fifth, seventh, tensions, bassPc? }
     */
    function generateName(spec) {
        var name = CUSTOM_ROOT_NAMES[spec.rootPc] || 'C';
        var third = spec.third;
        var fifth = spec.fifth;
        var seventh = spec.seventh;
        var tensions = spec.tensions || [];

        if (third === 3) {
            // マイナー系
            if (fifth === 6 && seventh === 9) name += 'dim7';
            else if (fifth === 6 && seventh === 10) name += 'm7♭5';
            else if (fifth === 6) name += 'dim';
            else if (seventh === 9) name += 'm6';
            else if (seventh === 10) name += 'm7';
            else if (seventh === 11) name += 'mM7';
            else name += 'm';
        } else if (third === 5) {
            // sus4系
            if (seventh === 10) name += '7sus4';
            else if (seventh === 11) name += 'M7sus4';
            else name += 'sus4';
        } else if (third === 4) {
            // メジャー系
            if (fifth === 8) {
                if (seventh === 10) name += 'aug7';
                else if (seventh === 11) name += 'M7♯5';
                else name += 'aug';
            } else {
                if (seventh === 9) name += '6';
                else if (seventh === 10) name += '7';
                else if (seventh === 11) name += 'M7';
                else if (seventh === null && fifth === null) name += '(power)';
                else if (fifth === 6) name += '(♭5)';
            }
        } else {
            // 3度なし
            if (fifth === 7 && seventh === null && tensions.length === 0) {
                name += '5';
            } else {
                if (seventh === 10) name += '7';
                else if (seventh === 11) name += 'M7';
                name += '(omit3)';
            }
        }

        if (tensions.length > 0) {
            var tNames = tensions.map(function (t) {
                return TENSION_LABELS[t] || '';
            }).filter(function (t) { return t !== ''; });
            if (tNames.length > 0) {
                // 7thを含まない三和音の9/11/13は、7thを含むC9等と混同しないadd表記にする。
                name += seventh === null
                    ? 'add' + tNames.join(',')
                    : '(' + tNames.join(',') + ')';
            }
        }
        return name;
    }

    function normalizedBassPc(spec) {
        var bassPc = spec && spec.bassPc;
        if (typeof bassPc !== 'number' || !isFinite(bassPc) || Math.floor(bassPc) !== bassPc) {
            return null;
        }
        return ((bassPc % 12) + 12) % 12;
    }

    /** upper chordの構成音から、root positionと同義のrootを除いたslash bass候補を返す。 */
    function bassCandidates(spec) {
        var rootPc = spec && spec.rootPc;
        if (typeof rootPc !== 'number' || !isFinite(rootPc)) return [];
        var candidates = [];
        var seen = {};
        var intervals = [0];
        [spec.third, spec.fifth, spec.seventh].forEach(function (interval) {
            if (interval !== null && interval !== undefined) intervals.push(interval);
        });
        (spec.tensions || []).forEach(function (interval) {
            intervals.push(interval);
        });
        intervals.forEach(function (interval) {
            var pc = ((rootPc + interval) % 12 + 12) % 12;
            if (pc === ((rootPc % 12) + 12) % 12 || seen[pc]) return;
            seen[pc] = true;
            candidates.push(pc);
        });
        return candidates;
    }

    /**
     * 既存FORMに追加するbass候補。完成voicingや運指を決めず、候補位置だけ返す。
     * 将来はtype: 'tension'を同じoverlay配列に加えられるようtypeを明示する。
     */
    function bassOverlayNotes(options) {
        var opts = options || {};
        var theory = window.ChordCruise.theory;
        var bassPc = normalizedBassPc(opts);
        var rootPc = typeof opts.rootPc === 'number' ? ((opts.rootPc % 12) + 12) % 12 : null;
        var startFret = typeof opts.startFret === 'number' ? opts.startFret : 0;
        var endFret = typeof opts.endFret === 'number' ? opts.endFret : -1;
        var targetStrings = Array.isArray(opts.targetStrings) ? opts.targetStrings : [6, 5, 4];
        var intervals = Array.isArray(opts.intervals) ? opts.intervals : [];
        var notes = [];
        var stringIndex;
        var fret;
        if (bassPc === null || rootPc === null || endFret < startFret) return notes;
        targetStrings.forEach(function (stringNum) {
            if ([4, 5, 6].indexOf(stringNum) === -1) return;
            var openPc = theory.OPEN_STRINGS[6 - stringNum];
            for (fret = startFret; fret <= endFret; fret++) {
                if ((openPc + fret) % 12 !== bassPc) continue;
                var interval = (bassPc - rootPc + 12) % 12;
                stringIndex = intervals.indexOf(interval);
                notes.push({
                    type: 'bass',
                    overlayType: 'bass',
                    string: stringNum,
                    fret: fret,
                    pc: bassPc,
                    interval: interval,
                    chordToneIndex: stringIndex === -1 ? null : stringIndex,
                    finger: null,
                    fingeringWarning: false
                });
            }
        });
        return notes;
    }

    /** CAGED FORMへ追加する高音側tension候補。完成voicingや運指は決めない。 */
    function tensionOverlayNotes(options) {
        var opts = options || {};
        var theory = window.ChordCruise.theory;
        var rootPc = typeof opts.rootPc === 'number' ? ((opts.rootPc % 12) + 12) % 12 : null;
        var tensions = Array.isArray(opts.tensionIntervals) ? opts.tensionIntervals : [];
        var startFret = typeof opts.startFret === 'number' ? opts.startFret : 0;
        var endFret = typeof opts.endFret === 'number' ? opts.endFret : -1;
        var notes = [];
        var fret;
        if (rootPc === null || endFret < startFret) return notes;
        [3, 2, 1].forEach(function (stringNum) {
            var openPc = theory.OPEN_STRINGS[6 - stringNum];
            for (fret = startFret; fret <= endFret; fret++) {
                var pc = (openPc + fret) % 12;
                var tension = tensions.filter(function (value) {
                    return typeof value === 'number' && ((rootPc + value) % 12 + 12) % 12 === pc;
                })[0];
                if (tension === undefined) continue;
                notes.push({
                    type: 'tension', overlayType: 'tension', string: stringNum, fret: fret,
                    pc: pc, interval: tension % 12, tension: tension,
                    finger: null, fingeringWarning: false
                });
            }
        });
        return notes;
    }

    /**
     * 任意コードを構築する。
     * @param {Object} spec { rootPc, third: 4|3|5|null, fifth: 7|6|8|null, seventh: 10|11|9|null, tensions: number[], bassPc?: number }
     * @param {string} customName 手編集された名前（空なら自動生成）
     * @returns {Object} { rootPc, notePcs, intervals, degreeLabelsList, symbol, qualityKey, useFlats, source, spec }
     */
    function buildCustomChord(spec, customName) {
        var theory = window.ChordCruise.theory;
        var bassPc = normalizedBassPc(spec);
        var validBassPc = bassPc !== null && bassCandidates(spec).indexOf(bassPc) !== -1 ? bassPc : null;
        var core = [0];
        if (spec.third !== null) core.push(spec.third);
        if (spec.fifth !== null) core.push(spec.fifth);
        if (spec.seventh !== null) core.push(spec.seventh);

        // CAGEDとquality判定はupper chordだけをsourceにし、tensionはoverlayとして扱う。
        var qualityKey = theory.identifyQuality(core);

        var seenPcs = {};
        var notePcs = [];
        var intervals = [];
        var degreeLabelsList = [];

        var coreDegreeLabels = theory.degreeLabelsForQuality(qualityKey, core);
        core.forEach(function (interval, coreIndex) {
            var pc = (spec.rootPc + interval) % 12;
            if (seenPcs[pc]) return;
            seenPcs[pc] = true;
            notePcs.push(pc);
            intervals.push(interval);
            degreeLabelsList.push(coreDegreeLabels[coreIndex]);
        });

        (spec.tensions || []).forEach(function (tension) {
            var pc = (spec.rootPc + tension) % 12;
            if (seenPcs[pc]) return;
            seenPcs[pc] = true;
            notePcs.push(pc);
            intervals.push(tension % 12);
            degreeLabelsList.push(TENSION_LABELS[tension] || theory.degreeLabels([tension % 12])[0]);
        });

        var upperName = (customName && customName.trim()) || generateName(spec);
        var symbol = theory.displayChordName(upperName);
        if (validBassPc !== null) {
            symbol += '/' + theory.noteName(validBassPc, FLAT_ROOT_PCS.indexOf(spec.rootPc) !== -1);
        }

        return {
            rootPc: spec.rootPc,
            notePcs: notePcs,
            intervals: intervals,
            coreIntervals: core.slice(),
            tensionIntervals: (spec.tensions || []).slice(),
            degreeLabelsList: degreeLabelsList,
            symbol: symbol,
            qualityKey: qualityKey,
            useFlats: FLAT_ROOT_PCS.indexOf(spec.rootPc) !== -1,
            source: 'custom',
            bassPc: validBassPc,
            spec: {
                rootPc: spec.rootPc,
                third: spec.third,
                fifth: spec.fifth,
                seventh: spec.seventh,
                tensions: (spec.tensions || []).slice(),
                bassPc: validBassPc
            }
        };
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.chordModel = {
        CUSTOM_ROOT_NAMES: CUSTOM_ROOT_NAMES,
        TENSION_LABELS: TENSION_LABELS,
        generateName: generateName,
        bassCandidates: bassCandidates,
        bassOverlayNotes: bassOverlayNotes,
        tensionOverlayNotes: tensionOverlayNotes,
        buildCustomChord: buildCustomChord
    };
})();
