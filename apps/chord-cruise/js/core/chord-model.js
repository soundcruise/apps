(function () {
    'use strict';

    /* 任意コードのモデル。
       選択肢の値体系（3度=4/3/5、5度=7/6/8、7度=10/11/9、テンション=13〜21）は
       音感クルーズPROの「コードを作る」と互換の考え方（ルートからの半音数）。 */

    // 任意コードのルート表記（音感クルーズPROと同じ慣用ミックス表記）
    var CUSTOM_ROOT_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
    var FLAT_ROOT_PCS = [3, 8, 10]; // E♭, A♭, B♭ はフラット表記系
    // Bassはコードルートやキーの綴りと独立して、A♯/D♯/G♯を慣用的な♭表記にする。
    // F♯など既存のslash表記を変えないため、全てを♭へ機械変換はしない。
    var BASS_NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
    var BASS_FLAT_PCS = [3, 8, 10];
    var BASS_DEGREE_LABELS = {
        0: '1', 1: '♭9', 2: '9', 3: '♯9', 4: '3', 5: '11',
        6: '♯11', 7: '5', 8: '♭13', 9: '13', 10: '♭7', 11: '7'
    };

    var TENSION_LABELS = {
        13: '♭9',
        14: '9',
        15: '♯9',
        17: '11',
        18: '♯11',
        20: '♭13',
        21: '13'
    };

    function tensionIntervalsForPcs(rootPc, pcs) {
        var normalizedRoot = typeof rootPc === 'number' ? ((rootPc % 12) + 12) % 12 : null;
        var seen = {};
        if (normalizedRoot === null || !Array.isArray(pcs)) return [];
        return Object.keys(TENSION_LABELS).map(function (value) { return Number(value); }).filter(function (interval) {
            var pc = (normalizedRoot + interval) % 12;
            if (pcs.indexOf(pc) === -1 || seen[pc]) return false;
            seen[pc] = true;
            return true;
        });
    }

    function tensionPcsForIntervals(rootPc, intervals) {
        var normalizedRoot = typeof rootPc === 'number' ? ((rootPc % 12) + 12) % 12 : null;
        var seen = {};
        if (normalizedRoot === null || !Array.isArray(intervals)) return [];
        return intervals.filter(function (interval) { return Object.prototype.hasOwnProperty.call(TENSION_LABELS, interval); }).sort(function (a, b) { return a - b; }).map(function (interval) {
            return (normalizedRoot + interval) % 12;
        }).filter(function (pc) {
            if (seen[pc]) return false;
            seen[pc] = true;
            return true;
        });
    }

    function normalizedInterval(value) {
        return typeof value === 'number' && isFinite(value)
            ? ((value % 12) + 12) % 12
            : null;
    }

    function qualityMatchesDisplayedIntervals(quality, displayedIntervals) {
        return !!quality && quality.intervals.every(function (interval) {
            return displayedIntervals.indexOf(normalizedInterval(interval)) !== -1;
        });
    }

    /**
     * core qualityと追加tensionを分離し、表示対象intervalごとの意味付き度数を復元する。
     * FORM音はquality固有表記を優先し、同じpitch classのtensionがあっても上書きしない。
     */
    function semanticDegreeLabels(options) {
        var opts = options || {};
        var theory = window.ChordCruise && window.ChordCruise.theory;
        var intervals = Array.isArray(opts.intervals) ? opts.intervals.map(normalizedInterval) : [];
        var preservedLabels = Array.isArray(opts.degreeLabels) ? opts.degreeLabels : null;
        if (preservedLabels && preservedLabels.length === intervals.length) return preservedLabels.slice();
        if (!theory || !theory.QUALITIES) return [];

        var tensionLabelsByInterval = {};
        (Array.isArray(opts.tensionIntervals) ? opts.tensionIntervals : []).forEach(function (tension) {
            var interval = normalizedInterval(tension);
            if (interval === null || !Object.prototype.hasOwnProperty.call(TENSION_LABELS, tension)) return;
            tensionLabelsByInterval[interval] = TENSION_LABELS[tension];
        });

        var qualityKey = opts.qualityKey;
        var quality = qualityKey && theory.QUALITIES[qualityKey];
        if (!qualityMatchesDisplayedIntervals(quality, intervals)) {
            qualityKey = null;
            quality = null;
            Object.keys(theory.QUALITIES).forEach(function (candidateKey) {
                var candidate = theory.QUALITIES[candidateKey];
                if (!qualityMatchesDisplayedIntervals(candidate, intervals)) return;
                var candidateIntervals = candidate.intervals.map(normalizedInterval);
                var extrasAreTensions = intervals.every(function (interval) {
                    return candidateIntervals.indexOf(interval) !== -1 ||
                        Object.prototype.hasOwnProperty.call(tensionLabelsByInterval, interval);
                });
                if (!extrasAreTensions || (quality && quality.intervals.length >= candidate.intervals.length)) return;
                qualityKey = candidateKey;
                quality = candidate;
            });
        }

        var coreLabelsByInterval = {};
        if (quality) {
            theory.degreeLabelsForQuality(qualityKey, quality.intervals).forEach(function (label, index) {
                coreLabelsByInterval[normalizedInterval(quality.intervals[index])] = label;
            });
        }
        return intervals.map(function (interval) {
            if (Object.prototype.hasOwnProperty.call(coreLabelsByInterval, interval)) {
                return coreLabelsByInterval[interval];
            }
            if (Object.prototype.hasOwnProperty.call(tensionLabelsByInterval, interval)) {
                return tensionLabelsByInterval[interval];
            }
            return theory.degreeLabels([interval])[0];
        });
    }

    function coreIntervalsForSpec(spec) {
        var intervals = [0];
        [spec.third, spec.fifth, spec.seventh].forEach(function (interval) {
            if (interval !== null && interval !== undefined) intervals.push(interval);
        });
        return intervals;
    }

    /** 完全一致する既存qualityは、そのcanonical表記を変更せず利用する。 */
    function canonicalCoreSuffix(spec) {
        var theory = window.ChordCruise && window.ChordCruise.theory;
        if (!theory || typeof theory.identifyQuality !== 'function' || !theory.QUALITIES) return null;
        var qualityKey = theory.identifyQuality(coreIntervalsForSpec(spec));
        var quality = qualityKey ? theory.QUALITIES[qualityKey] : null;
        return quality && typeof quality.symbolSuffix === 'string' ? quality.symbolSuffix : null;
    }

    function seventhSuffix(seventh) {
        if (seventh === 9) return '6';
        if (seventh === 10) return '7';
        if (seventh === 11) return 'M7';
        return '';
    }

    /**
     * canonical qualityに一致しないcoreだけを構成的に表す。
     * 省略・変化音を一般的なqualityへ丸めず、任意コードで明示された意味を名前に残す。
     */
    function nonCanonicalCoreSuffix(spec) {
        var third = spec.third;
        var fifth = spec.fifth;
        var seventh = spec.seventh;
        var suffix = seventhSuffix(seventh);
        var fifthModifier = fifth === 6 ? '♭5' : (fifth === 8 ? '♯5' : (fifth === null ? 'no5' : ''));

        if (third === 3) {
            suffix = 'm' + suffix;
            return fifthModifier === 'no5'
                ? suffix + '(no5)'
                : suffix + fifthModifier;
        }

        if (third === 5) {
            suffix += 'sus4';
            return fifthModifier ? suffix + '(' + fifthModifier + ')' : suffix;
        }

        if (third === null) {
            var omissions = ['no3'];
            if (fifthModifier) omissions.push(fifthModifier);
            return suffix + '(' + omissions.join(',') + ')';
        }

        // Caug7は既存表記のままで、M3/♯5/m7を過不足なく表せる。
        if (fifth === 8 && seventh === 10) return 'aug7';
        return fifthModifier ? suffix + '(' + fifthModifier + ')' : suffix;
    }

    /**
     * コード名を自動生成する。canonical qualityを優先し、そこから外れる明示構成は省略しない。
     * @param {Object} spec { rootPc, third, fifth, seventh, tensions, bassPc? }
     */
    function generateName(spec) {
        var name = CUSTOM_ROOT_NAMES[spec.rootPc] || 'C';
        var seventh = spec.seventh;
        var tensions = spec.tensions || [];
        var canonicalSuffix = canonicalCoreSuffix(spec);

        name += canonicalSuffix !== null ? canonicalSuffix : nonCanonicalCoreSuffix(spec);

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

    function normalizedRootPc(spec) {
        var rootPc = spec && spec.rootPc;
        return typeof rootPc === 'number' && isFinite(rootPc)
            ? ((rootPc % 12) + 12) % 12
            : null;
    }

    /** slash bass専用の慣用表記。コード本体の綴りは変更しない。 */
    function bassNoteName(pc) {
        var normalized = typeof pc === 'number' && isFinite(pc) ? ((pc % 12) + 12) % 12 : null;
        return normalized === null ? '' : BASS_NOTE_NAMES[normalized];
    }

    function bassUsesFlats(pc) {
        var normalized = typeof pc === 'number' && isFinite(pc) ? ((pc % 12) + 12) % 12 : null;
        return normalized !== null && BASS_FLAT_PCS.indexOf(normalized) !== -1;
    }

    function bassDegreeLabel(interval) {
        return BASS_DEGREE_LABELS[((interval % 12) + 12) % 12];
    }

    /** upper chordとtensionの構成音から、root positionと同義のrootを除いたslash bass候補を返す。 */
    function bassCandidates(spec) {
        var rootPc = normalizedRootPc(spec);
        if (rootPc === null) return [];
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
            if (pc === rootPc || seen[pc]) return;
            seen[pc] = true;
            candidates.push(pc);
        });
        return candidates;
    }

    /** 構成音以外で選択できるslash bass。rootは通常状態と同義なので含めない。 */
    function nonChordBassCandidates(spec) {
        var rootPc = normalizedRootPc(spec);
        if (rootPc === null) return [];
        var chordTones = bassCandidates(spec);
        var candidates = [];
        for (var pc = 0; pc < 12; pc++) {
            if (pc !== rootPc && chordTones.indexOf(pc) === -1) candidates.push(pc);
        }
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

    /** Major CAGEDへ追加する6度候補。tension/13とは分離し、interval 9をdegree 6として返す。 */
    function sixthOverlayNotes(options) {
        var opts = options || {};
        var theory = window.ChordCruise.theory;
        var rootPc = typeof opts.rootPc === 'number' ? ((opts.rootPc % 12) + 12) % 12 : null;
        var startFret = typeof opts.startFret === 'number' ? opts.startFret : 0;
        var endFret = typeof opts.endFret === 'number' ? opts.endFret : -1;
        var targetStrings = Array.isArray(opts.targetStrings) ? opts.targetStrings : [3, 2, 1];
        var sixthPc = rootPc === null ? null : (rootPc + 9) % 12;
        var notes = [];
        if (rootPc === null || endFret < startFret) return notes;
        targetStrings.forEach(function (stringNum) {
            if ([1, 2, 3, 4, 5, 6].indexOf(stringNum) === -1) return;
            var openPc = theory.OPEN_STRINGS[6 - stringNum];
            for (var fret = startFret; fret <= endFret; fret++) {
                if ((openPc + fret) % 12 !== sixthPc) continue;
                notes.push({
                    type: 'sixth', overlayType: 'sixth', string: stringNum, fret: fret,
                    pc: sixthPc, interval: 9, degreeLabel: '6',
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
        // root bassは通常状態と同義。構成音外もbassPcだけでsemanticに扱う。
        var validBassPc = bassPc !== null && bassPc !== normalizedRootPc(spec) ? bassPc : null;
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
            symbol += '/' + bassNoteName(validBassPc);
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
        BASS_NOTE_NAMES: BASS_NOTE_NAMES,
        TENSION_LABELS: TENSION_LABELS,
        tensionIntervalsForPcs: tensionIntervalsForPcs,
        tensionPcsForIntervals: tensionPcsForIntervals,
        semanticDegreeLabels: semanticDegreeLabels,
        generateName: generateName,
        bassCandidates: bassCandidates,
        nonChordBassCandidates: nonChordBassCandidates,
        bassNoteName: bassNoteName,
        bassUsesFlats: bassUsesFlats,
        bassDegreeLabel: bassDegreeLabel,
        bassOverlayNotes: bassOverlayNotes,
        tensionOverlayNotes: tensionOverlayNotes,
        sixthOverlayNotes: sixthOverlayNotes,
        buildCustomChord: buildCustomChord
    };
})();
