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

    var CORE_QUALITY_MATCH = [
        { key: 'maj', intervals: [0, 4, 7] },
        { key: 'm', intervals: [0, 3, 7] },
        { key: 'dim', intervals: [0, 3, 6] },
        { key: 'maj7', intervals: [0, 4, 7, 11] },
        { key: '7', intervals: [0, 4, 7, 10] },
        { key: 'm7', intervals: [0, 3, 7, 10] },
        { key: 'm7b5', intervals: [0, 3, 6, 10] }
    ];

    function sameIntervals(a, b) {
        if (a.length !== b.length) return false;
        var i;
        for (i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    /**
     * コード名を自動生成する（音感クルーズPRO generateChordName 準拠、表記は本アプリ基準）。
     * @param {Object} spec { rootPc, third, fifth, seventh, tensions }
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
                else if (seventh === 11) name += 'augM7';
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
                name += '(' + tNames.join(',') + ')';
            }
        }
        return name;
    }

    /**
     * 任意コードを構築する。
     * @param {Object} spec { rootPc, third: 4|3|5|null, fifth: 7|6|8|null, seventh: 10|11|9|null, tensions: number[] }
     * @param {string} customName 手編集された名前（空なら自動生成）
     * @returns {Object} { rootPc, notePcs, intervals, degreeLabelsList, symbol, qualityKey, useFlats, source, spec }
     */
    function buildCustomChord(spec, customName) {
        var theory = window.ChordCruise.theory;
        var core = [0];
        if (spec.third !== null) core.push(spec.third);
        if (spec.fifth !== null) core.push(spec.fifth);
        if (spec.seventh !== null) core.push(spec.seventh);

        var qualityKey = null;
        if ((spec.tensions || []).length === 0) {
            CORE_QUALITY_MATCH.forEach(function (candidate) {
                if (sameIntervals(core, candidate.intervals)) {
                    qualityKey = candidate.key;
                }
            });
        }

        var seenPcs = {};
        var notePcs = [];
        var intervals = [];
        var degreeLabelsList = [];

        core.forEach(function (interval) {
            var pc = (spec.rootPc + interval) % 12;
            if (seenPcs[pc]) return;
            seenPcs[pc] = true;
            notePcs.push(pc);
            intervals.push(interval);
            degreeLabelsList.push(theory.degreeLabels([interval])[0]);
        });

        (spec.tensions || []).forEach(function (tension) {
            var pc = (spec.rootPc + tension) % 12;
            if (seenPcs[pc]) return;
            seenPcs[pc] = true;
            notePcs.push(pc);
            intervals.push(tension % 12);
            degreeLabelsList.push(TENSION_LABELS[tension] || theory.degreeLabels([tension % 12])[0]);
        });

        return {
            rootPc: spec.rootPc,
            notePcs: notePcs,
            intervals: intervals,
            degreeLabelsList: degreeLabelsList,
            symbol: theory.displayChordName((customName && customName.trim()) || generateName(spec)),
            qualityKey: qualityKey,
            useFlats: FLAT_ROOT_PCS.indexOf(spec.rootPc) !== -1,
            source: 'custom',
            spec: spec
        };
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.chordModel = {
        CUSTOM_ROOT_NAMES: CUSTOM_ROOT_NAMES,
        TENSION_LABELS: TENSION_LABELS,
        generateName: generateName,
        buildCustomChord: buildCustomChord
    };
})();
