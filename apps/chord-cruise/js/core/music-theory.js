(function () {
    'use strict';

    // 音名
    var NOTES_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    var NOTES_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
    var OPEN_STRINGS = [4, 9, 2, 7, 11, 4]; // 6弦→1弦 (E A D G B E)。STEP 3で使用

    // ドレミ（固定ド）
    var SOLFEGE_SHARP = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ'];
    var SOLFEGE_FLAT = ['ド', 'レ♭', 'レ', 'ミ♭', 'ミ', 'ファ', 'ソ♭', 'ソ', 'ラ♭', 'ラ', 'シ♭', 'シ'];

    // キーの♭系判定（コード表記にフラットを使うキー）
    var FLAT_MAJOR_TONICS = [5, 10, 3, 8, 1]; // F, B♭, E♭, A♭, D♭
    var FLAT_MINOR_TONICS = [2, 7, 0, 5, 10, 3]; // Dm, Gm, Cm, Fm, B♭m, E♭m

    // キー選択肢（selectに出す表示名）
    var MAJOR_KEY_OPTIONS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
    var MINOR_KEY_OPTIONS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];

    // コード品質（コードルートからの半音間隔）
    var QUALITIES = {
        'maj': { suffix: '', intervals: [0, 4, 7] },
        'm': { suffix: 'm', intervals: [0, 3, 7] },
        'dim': { suffix: 'dim', intervals: [0, 3, 6] },
        'maj7': { suffix: 'M7', intervals: [0, 4, 7, 11] },
        '7': { suffix: '7', intervals: [0, 4, 7, 10] },
        'm7': { suffix: 'm7', intervals: [0, 3, 7, 10] },
        'm7b5': { suffix: 'm7♭5', intervals: [0, 3, 6, 10] }
    };

    // ダイアトニック定義
    var DIATONIC = {
        major: {
            rootIntervals: [0, 2, 4, 5, 7, 9, 11],
            triadQualities: ['maj', 'm', 'm', 'maj', 'maj', 'm', 'dim'],
            seventhQualities: ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'],
            roman3: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
            roman7: ['IM7', 'iim7', 'iiim7', 'IVM7', 'V7', 'vim7', 'viim7♭5']
        },
        minor: { // ナチュラルマイナー
            rootIntervals: [0, 2, 3, 5, 7, 8, 10],
            triadQualities: ['m', 'dim', 'maj', 'm', 'm', 'maj', 'maj'],
            seventhQualities: ['m7', 'm7b5', 'maj7', 'm7', 'm7', 'maj7', '7'],
            roman3: ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'],
            roman7: ['im7', 'iim7♭5', 'IIIM7', 'ivm7', 'vm7', 'VIM7', 'VII7']
        }
    };

    // コードルート基準の度数表示
    var DEGREE_LABELS = {
        0: '1',
        1: '♭2',
        2: '2',
        3: '♭3',
        4: '3',
        5: '4',
        6: '♭5',
        7: '5',
        8: '♯5',
        9: '6',
        10: '♭7',
        11: '7'
    };

    function keyUsesFlats(tonicPc, mode) {
        var tonics = mode === 'minor' ? FLAT_MINOR_TONICS : FLAT_MAJOR_TONICS;
        return tonics.indexOf(tonicPc) !== -1;
    }

    function noteName(pc, useFlats) {
        var names = useFlats ? NOTES_FLAT : NOTES_SHARP;
        return names[((pc % 12) + 12) % 12];
    }

    function solfegeName(pc, useFlats) {
        var names = useFlats ? SOLFEGE_FLAT : SOLFEGE_SHARP;
        return names[((pc % 12) + 12) % 12];
    }

    function chordSymbol(rootPc, qualityKey, useFlats) {
        return noteName(rootPc, useFlats) + QUALITIES[qualityKey].suffix;
    }

    /** 旧保存データを変更せず、ユーザー表示時だけ maj7 を M7 に正規化する。 */
    function displayChordName(name) {
        return String(name == null ? '' : name).replace(/maj7/gi, 'M7');
    }

    function getDiatonicChords(tonicPc, mode, toneMode) {
        var def = DIATONIC[mode];
        var useFlats = keyUsesFlats(tonicPc, mode);
        var qualities = toneMode === '7' ? def.seventhQualities : def.triadQualities;
        var romans = toneMode === '7' ? def.roman7 : def.roman3;
        var result = [];
        var i;
        for (i = 0; i < 7; i++) {
            var rootPc = (tonicPc + def.rootIntervals[i]) % 12;
            var qualityKey = qualities[i];
            var intervals = QUALITIES[qualityKey].intervals.slice();
            // 減三和音の内部品質は dim のまま、ダイアトニック3和音の表示だけを m♭5 にする。
            var symbol = (toneMode !== '7' && qualityKey === 'dim')
                ? noteName(rootPc, useFlats) + 'm♭5'
                : chordSymbol(rootPc, qualityKey, useFlats);
            var notePcs = intervals.map(function (interval) {
                return (rootPc + interval) % 12;
            });
            var noteNames = notePcs.map(function (pc) {
                return noteName(pc, useFlats);
            });
            result.push({
                index: i,
                roman: romans[i],
                rootPc: rootPc,
                qualityKey: qualityKey,
                symbol: symbol,
                intervals: intervals,
                notePcs: notePcs,
                noteNames: noteNames
            });
        }
        return result;
    }

    function degreeLabels(intervals) {
        return intervals.map(function (interval) {
            return DEGREE_LABELS[((interval % 12) + 12) % 12];
        });
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.theory = {
        NOTES_SHARP: NOTES_SHARP,
        NOTES_FLAT: NOTES_FLAT,
        OPEN_STRINGS: OPEN_STRINGS,
        SOLFEGE_SHARP: SOLFEGE_SHARP,
        SOLFEGE_FLAT: SOLFEGE_FLAT,
        FLAT_MAJOR_TONICS: FLAT_MAJOR_TONICS,
        FLAT_MINOR_TONICS: FLAT_MINOR_TONICS,
        MAJOR_KEY_OPTIONS: MAJOR_KEY_OPTIONS,
        MINOR_KEY_OPTIONS: MINOR_KEY_OPTIONS,
        QUALITIES: QUALITIES,
        DIATONIC: DIATONIC,
        keyUsesFlats: keyUsesFlats,
        noteName: noteName,
        solfegeName: solfegeName,
        chordSymbol: chordSymbol,
        displayChordName: displayChordName,
        getDiatonicChords: getDiatonicChords,
        degreeLabels: degreeLabels
    };
})();
