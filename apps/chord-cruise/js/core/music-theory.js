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

    /*
     * 7音スケール定義。Phase 1では既存UIと保存値を完全互換にするため、
     * 公開するIDは major / minor のまま維持する。Romanもv0.21.6の表示を
     * 固定し、将来の全大文字化や新scale追加とは分離する。
     */
    var SCALES = {
        major: {
            id: 'major',
            label: 'メジャー',
            intervals: [0, 2, 4, 5, 7, 9, 11],
            degreeLabels: ['1', '2', '3', '4', '5', '6', '7'],
            legacyRoman3: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
            legacyRoman7: ['IM7', 'iim7', 'iiim7', 'IVM7', 'V7', 'vim7', 'viim7♭5']
        },
        minor: { // ナチュラルマイナー（エオリアン）
            id: 'minor',
            label: 'マイナー',
            intervals: [0, 2, 3, 5, 7, 8, 10],
            degreeLabels: ['1', '2', '♭3', '4', '5', '♭6', '♭7'],
            legacyRoman3: ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'],
            legacyRoman7: ['im7', 'iim7♭5', 'IIIM7', 'ivm7', 'vm7', 'VIM7', 'VII7']
        }
    };

    function sameIntervals(left, right) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
            return false;
        }
        var i;
        for (i = 0; i < left.length; i++) {
            if (left[i] !== right[i]) return false;
        }
        return true;
    }

    /** 7音scaleのdegreeから1・3・5（・7）を積み、コードルート基準の半音間隔を返す。 */
    function stackScaleChordIntervals(scaleIntervals, degreeIndex, noteCount) {
        if (!Array.isArray(scaleIntervals) || scaleIntervals.length !== 7) {
            throw new Error('Diatonic chord generation requires a seven-note scale.');
        }
        if (degreeIndex < 0 || degreeIndex >= scaleIntervals.length || Math.floor(degreeIndex) !== degreeIndex) {
            throw new Error('Scale degree index is out of range.');
        }
        if (noteCount !== 3 && noteCount !== 4) {
            throw new Error('Diatonic chord note count must be 3 or 4.');
        }

        var root = scaleIntervals[degreeIndex];
        var result = [];
        var chordToneIndex;
        for (chordToneIndex = 0; chordToneIndex < noteCount; chordToneIndex++) {
            var scaleIndex = degreeIndex + chordToneIndex * 2;
            var octave = Math.floor(scaleIndex / scaleIntervals.length) * 12;
            var absoluteInterval = scaleIntervals[scaleIndex % scaleIntervals.length] + octave;
            result.push(absoluteInterval - root);
        }
        return result;
    }

    /** 生成intervalを既存QUALITIESと完全一致で照合する。未対応qualityはnull。 */
    function identifyQuality(intervals) {
        var qualityKey;
        for (qualityKey in QUALITIES) {
            if (Object.prototype.hasOwnProperty.call(QUALITIES, qualityKey) &&
                sameIntervals(intervals, QUALITIES[qualityKey].intervals)) {
                return qualityKey;
            }
        }
        return null;
    }

    function buildDiatonicDefinition(scale) {
        var triadQualities = [];
        var seventhQualities = [];
        var degreeIndex;
        for (degreeIndex = 0; degreeIndex < scale.intervals.length; degreeIndex++) {
            var triadQuality = identifyQuality(stackScaleChordIntervals(scale.intervals, degreeIndex, 3));
            var seventhQuality = identifyQuality(stackScaleChordIntervals(scale.intervals, degreeIndex, 4));
            if (!triadQuality || !seventhQuality) {
                throw new Error('Unsupported diatonic quality in scale: ' + scale.id + ', degree: ' + degreeIndex);
            }
            triadQualities.push(triadQuality);
            seventhQualities.push(seventhQuality);
        }
        return {
            rootIntervals: scale.intervals.slice(),
            triadQualities: triadQualities,
            seventhQualities: seventhQualities,
            roman3: scale.legacyRoman3.slice(),
            roman7: scale.legacyRoman7.slice()
        };
    }

    // 既存公開APIを維持しながら、quality配列はscale intervalsから自動生成する。
    var DIATONIC = {
        major: buildDiatonicDefinition(SCALES.major),
        minor: buildDiatonicDefinition(SCALES.minor)
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
        SCALES: SCALES,
        DIATONIC: DIATONIC,
        stackScaleChordIntervals: stackScaleChordIntervals,
        identifyQuality: identifyQuality,
        keyUsesFlats: keyUsesFlats,
        noteName: noteName,
        solfegeName: solfegeName,
        chordSymbol: chordSymbol,
        displayChordName: displayChordName,
        getDiatonicChords: getDiatonicChords,
        degreeLabels: degreeLabels
    };
})();
