(function () {
    'use strict';

    // 音名
    var NOTES_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    var NOTES_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
    var NOTE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    var NATURAL_NOTE_PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
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
        // suffixは既存呼び出しとの互換用。新規利用ではsymbolSuffix / romanSuffixを明示する。
        'maj': { suffix: '', symbolSuffix: '', romanSuffix: '', intervals: [0, 4, 7], degreeLabels: ['1', '3', '5'] },
        // Major CAGEDの構成音を保ち、6度を追加する派生quality。
        '6': { suffix: '6', symbolSuffix: '6', romanSuffix: '6', intervals: [0, 4, 7, 9], degreeLabels: ['1', '3', '5', '6'] },
        'sus4': { suffix: 'sus4', symbolSuffix: 'sus4', romanSuffix: 'sus4', intervals: [0, 5, 7], degreeLabels: ['1', '4', '5'] },
        // 既存7th CAGEDの3度slotを4度へ置換する派生quality。
        '7sus4': { suffix: '7sus4', symbolSuffix: '7sus4', romanSuffix: '7sus4', intervals: [0, 5, 7, 10], degreeLabels: ['1', '4', '5', '♭7'] },
        // 既存M7 CAGEDの3度slotを4度へ置換する派生quality。
        'M7sus4': { suffix: 'M7sus4', symbolSuffix: 'M7sus4', romanSuffix: 'M7sus4', intervals: [0, 5, 7, 11], degreeLabels: ['1', '4', '5', '7'] },
        // Major CAGEDの3度slotだけを除外する派生quality。一般的な省略Power chordではなく、
        // 既存CAGED上で1・5度の配置を確認するために使う。
        'power5': { suffix: '5', symbolSuffix: '5', romanSuffix: '5', intervals: [0, 7], degreeLabels: ['1', '5'] },
        // Major CAGEDの5度slotだけを除外する派生quality。一般的な省略voicingではなく、
        // 既存CAGED上で1・3度の配置を確認するために使う。
        'no5': { suffix: '(no5)', symbolSuffix: '(no5)', romanSuffix: '(no5)', intervals: [0, 4], degreeLabels: ['1', '3'] },
        // 既存7th CAGEDの5度slotだけを除外する派生quality。
        '7no5': { suffix: '7(no5)', symbolSuffix: '7(no5)', romanSuffix: '7(no5)', intervals: [0, 4, 10], degreeLabels: ['1', '3', '♭7'] },
        // 既存M7 CAGEDの5度slotだけを除外する派生quality。
        'maj7no5': { suffix: 'M7(no5)', symbolSuffix: 'M7(no5)', romanSuffix: 'M7(no5)', intervals: [0, 4, 11], degreeLabels: ['1', '3', '7'] },
        // 既存m7 CAGEDの5度slotだけを除外する派生quality。
        'm7no5': { suffix: 'm7(no5)', symbolSuffix: 'm7(no5)', romanSuffix: 'm7(no5)', intervals: [0, 3, 10], degreeLabels: ['1', '♭3', '♭7'] },
        'm': { suffix: 'm', symbolSuffix: 'm', romanSuffix: 'm', intervals: [0, 3, 7], degreeLabels: ['1', '♭3', '5'] },
        // Minor CAGEDの構成音を保ち、6度を追加する派生quality。
        'm6': { suffix: 'm6', symbolSuffix: 'm6', romanSuffix: 'm6', intervals: [0, 3, 7, 9], degreeLabels: ['1', '♭3', '5', '6'] },
        'dim': { suffix: 'dim', symbolSuffix: 'dim', romanSuffix: '°', intervals: [0, 3, 6], degreeLabels: ['1', '♭3', '♭5'] },
        'maj7': { suffix: 'M7', symbolSuffix: 'M7', romanSuffix: 'M7', intervals: [0, 4, 7, 11], degreeLabels: ['1', '3', '5', '7'] },
        '7': { suffix: '7', symbolSuffix: '7', romanSuffix: '7', intervals: [0, 4, 7, 10], degreeLabels: ['1', '3', '5', '♭7'] },
        '7b5': { suffix: '7♭5', symbolSuffix: '7♭5', romanSuffix: '7♭5', intervals: [0, 4, 6, 10], degreeLabels: ['1', '3', '♭5', '♭7'] },
        'm7': { suffix: 'm7', symbolSuffix: 'm7', romanSuffix: 'm7', intervals: [0, 3, 7, 10], degreeLabels: ['1', '♭3', '5', '♭7'] },
        'm7b5': { suffix: 'm7♭5', symbolSuffix: 'm7♭5', romanSuffix: 'm7♭5', intervals: [0, 3, 6, 10], degreeLabels: ['1', '♭3', '♭5', '♭7'] },
        'aug': { suffix: 'aug', symbolSuffix: 'aug', romanSuffix: 'aug', intervals: [0, 4, 8], degreeLabels: ['1', '3', '♯5'] },
        'mMaj7': { suffix: 'mM7', symbolSuffix: 'mM7', romanSuffix: 'mM7', intervals: [0, 3, 7, 11], degreeLabels: ['1', '♭3', '5', '7'] },
        'maj7sharp5': { suffix: 'M7♯5', symbolSuffix: 'M7♯5', romanSuffix: 'M7♯5', intervals: [0, 4, 8, 11], degreeLabels: ['1', '3', '♯5', '7'] },
        'dim7': { suffix: 'dim7', symbolSuffix: 'dim7', romanSuffix: '°7', intervals: [0, 3, 6, 9], degreeLabels: ['1', '♭3', '♭5', '♭♭7'] }
    };

    /*
     * 7音スケール定義。Phase Cではハーモニック／メロディックマイナーも
     * core APIへ追加する。UIの選択肢と保存許可値は別の明示リストで管理する。
     * Romanはqualityをsuffixで示し、度数部分を全大文字に統一する。
     */
    var SCALES = {
        major: {
            id: 'major',
            label: 'メジャー / イオニアン',
            tonicFamily: 'major',
            intervals: [0, 2, 4, 5, 7, 9, 11],
            degreeLabels: ['1', '2', '3', '4', '5', '6', '7'],
            roman3: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII°'],
            roman7: ['IM7', 'IIm7', 'IIIm7', 'IVM7', 'V7', 'VIm7', 'VIIm7♭5']
        },
        dorian: {
            id: 'dorian',
            label: 'ドリアン',
            tonicFamily: 'major',
            intervals: [0, 2, 3, 5, 7, 9, 10],
            degreeLabels: ['1', '2', '♭3', '4', '5', '6', '♭7'],
            roman3: ['I', 'II', 'III', 'IV', 'V', 'VI°', 'VII'],
            roman7: ['Im7', 'IIm7', 'IIIM7', 'IV7', 'Vm7', 'VIm7♭5', 'VIIM7']
        },
        phrygian: {
            id: 'phrygian',
            label: 'フリジアン',
            tonicFamily: 'major',
            intervals: [0, 1, 3, 5, 7, 8, 10],
            degreeLabels: ['1', '♭2', '♭3', '4', '5', '♭6', '♭7'],
            roman3: ['I', 'II', 'III', 'IV', 'V°', 'VI', 'VII'],
            roman7: ['Im7', 'IIM7', 'III7', 'IVm7', 'Vm7♭5', 'VIM7', 'VIIm7']
        },
        lydian: {
            id: 'lydian',
            label: 'リディアン',
            tonicFamily: 'major',
            intervals: [0, 2, 4, 6, 7, 9, 11],
            degreeLabels: ['1', '2', '3', '♯4', '5', '6', '7'],
            roman3: ['I', 'II', 'III', 'IV°', 'V', 'VI', 'VII'],
            roman7: ['IM7', 'II7', 'IIIm7', 'IVm7♭5', 'VM7', 'VIm7', 'VIIm7']
        },
        mixolydian: {
            id: 'mixolydian',
            label: 'ミクソリディアン',
            tonicFamily: 'major',
            intervals: [0, 2, 4, 5, 7, 9, 10],
            degreeLabels: ['1', '2', '3', '4', '5', '6', '♭7'],
            roman3: ['I', 'II', 'III°', 'IV', 'V', 'VI', 'VII'],
            roman7: ['I7', 'IIm7', 'IIIm7♭5', 'IVM7', 'Vm7', 'VIm7', 'VIIM7']
        },
        minor: { // ナチュラルマイナー（エオリアン）
            id: 'minor',
            label: 'マイナー / エオリアン',
            tonicFamily: 'minor',
            intervals: [0, 2, 3, 5, 7, 8, 10],
            degreeLabels: ['1', '2', '♭3', '4', '5', '♭6', '♭7'],
            roman3: ['I', 'II°', 'III', 'IV', 'V', 'VI', 'VII'],
            roman7: ['Im7', 'IIm7♭5', 'IIIM7', 'IVm7', 'Vm7', 'VIM7', 'VII7']
        },
        locrian: {
            id: 'locrian',
            label: 'ロクリアン',
            tonicFamily: 'major',
            intervals: [0, 1, 3, 5, 6, 8, 10],
            degreeLabels: ['1', '♭2', '♭3', '4', '♭5', '♭6', '♭7'],
            roman3: ['I°', 'II', 'III', 'IV', 'V', 'VI', 'VII'],
            roman7: ['Im7♭5', 'IIM7', 'IIIm7', 'IVm7', 'VM7', 'VI7', 'VIIm7']
        },
        'harmonic-minor': {
            id: 'harmonic-minor',
            label: 'ハーモニックマイナー',
            tonicFamily: 'minor',
            intervals: [0, 2, 3, 5, 7, 8, 11],
            degreeLabels: ['1', '2', '♭3', '4', '5', '♭6', '7'],
            roman3: ['Im', 'II°', 'IIIaug', 'IVm', 'V', 'VI', 'VII°'],
            roman7: ['ImM7', 'IIm7♭5', 'IIIM7♯5', 'IVm7', 'V7', 'VIM7', 'VII°7']
        },
        'melodic-minor': {
            id: 'melodic-minor',
            label: 'メロディックマイナー',
            tonicFamily: 'minor',
            // 上行形のみを固定採用する。下降時にNatural Minorへ切り替えない。
            intervals: [0, 2, 3, 5, 7, 9, 11],
            degreeLabels: ['1', '2', '♭3', '4', '5', '6', '7'],
            roman3: ['Im', 'IIm', 'IIIaug', 'IV', 'V', 'VI°', 'VII°'],
            roman7: ['ImM7', 'IIm7', 'IIIM7♯5', 'IV7', 'V7', 'VIm7♭5', 'VIIm7♭5']
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
            roman3: scale.roman3.slice(),
            roman7: scale.roman7.slice()
        };
    }

    // 既存公開APIを維持しながら、quality配列はscale intervalsから自動生成する。
    var DIATONIC = {
        major: buildDiatonicDefinition(SCALES.major),
        dorian: buildDiatonicDefinition(SCALES.dorian),
        phrygian: buildDiatonicDefinition(SCALES.phrygian),
        lydian: buildDiatonicDefinition(SCALES.lydian),
        mixolydian: buildDiatonicDefinition(SCALES.mixolydian),
        minor: buildDiatonicDefinition(SCALES.minor),
        locrian: buildDiatonicDefinition(SCALES.locrian),
        'harmonic-minor': buildDiatonicDefinition(SCALES['harmonic-minor']),
        'melodic-minor': buildDiatonicDefinition(SCALES['melodic-minor'])
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

    function normalizePc(pc) {
        return ((pc % 12) + 12) % 12;
    }

    /** Unicodeの単一グリフへ依存せず、♯／♭を必要数だけ連ねる。 */
    function formatAccidental(offset) {
        var amount = Math.abs(offset);
        var symbol = offset < 0 ? '♭' : '♯';
        var result = '';
        var i;
        for (i = 0; i < amount; i++) result += symbol;
        return result;
    }

    /** C♯、D♭、F♯♯のような理論音名をletter・accidental・pitch classへ分解する。 */
    function parseSpelledNoteName(value) {
        var match = /^([A-Ga-g])([♯♭#b]*)$/.exec(String(value == null ? '' : value).trim());
        if (!match) return null;

        var letter = match[1].toUpperCase();
        var accidentalText = match[2];
        var accidental = 0;
        var i;
        for (i = 0; i < accidentalText.length; i++) {
            accidental += accidentalText[i] === '♯' || accidentalText[i] === '#' ? 1 : -1;
        }
        return {
            letter: letter,
            accidental: accidental,
            pc: normalizePc(NATURAL_NOTE_PCS[letter] + accidental),
            name: letter + formatAccidental(accidental)
        };
    }

    /** 現在の12トニック選択体系をscaleのtonic familyへ明示的に対応させる。 */
    function tonicNameFor(tonicPc, scaleId) {
        var scale = SCALES[scaleId];
        if (!scale) return null;
        var names = scale.tonicFamily === 'minor' ? MINOR_KEY_OPTIONS : MAJOR_KEY_OPTIONS;
        return names[normalizePc(tonicPc)];
    }

    function accidentalOffsetForPc(letter, pc) {
        var offset = normalizePc(pc - NATURAL_NOTE_PCS[letter]);
        return offset > 6 ? offset - 12 : offset;
    }

    /**
     * トニックの文字を起点に各度で必ず次のletterへ進め、scaleのpitch classへ
     * 合う臨時記号を決定する。未登録scaleはoptions.scaleを渡して純粋関数として検証できる。
     */
    function spellScaleNotes(options) {
        options = options || {};
        var scale = options.scale || SCALES[options.scaleId];
        if (!scale || !Array.isArray(scale.intervals) || scale.intervals.length !== 7) {
            throw new Error('Scale spelling requires a seven-note scale.');
        }

        if (typeof options.tonicPc !== 'number' || !isFinite(options.tonicPc) || Math.floor(options.tonicPc) !== options.tonicPc) {
            throw new Error('Scale spelling requires an integer tonicPc.');
        }
        var tonicPc = normalizePc(options.tonicPc);
        var tonicName = options.tonicName || tonicNameFor(tonicPc, options.scaleId || scale.id);
        var parsedTonic = parseSpelledNoteName(tonicName);
        if (!parsedTonic || parsedTonic.pc !== tonicPc) {
            throw new Error('Scale spelling requires a tonic name matching tonicPc.');
        }

        var tonicLetterIndex = NOTE_LETTERS.indexOf(parsedTonic.letter);
        return scale.intervals.map(function (interval, degreeIndex) {
            var pc = normalizePc(tonicPc + interval);
            var letter = NOTE_LETTERS[(tonicLetterIndex + degreeIndex) % NOTE_LETTERS.length];
            var accidental = accidentalOffsetForPc(letter, pc);
            return {
                degreeIndex: degreeIndex,
                degreeLabel: scale.degreeLabels ? scale.degreeLabels[degreeIndex] : null,
                pc: pc,
                letter: letter,
                accidental: accidental,
                name: letter + formatAccidental(accidental)
            };
        });
    }

    /** 保存schemaを増やさず、既存key contextとintervalsから表示用音名だけを再計算する。 */
    function diatonicNoteNamesForContext(keyContext, rootPc, intervals) {
        if (!keyContext || !SCALES[keyContext.mode] || !Array.isArray(intervals)) return null;
        if (typeof keyContext.tonicPc !== 'number' || typeof rootPc !== 'number') return null;

        var scaleNotes = spellScaleNotes({ tonicPc: keyContext.tonicPc, scaleId: keyContext.mode });
        var namesByPc = {};
        scaleNotes.forEach(function (scaleNote) {
            namesByPc[scaleNote.pc] = scaleNote.name;
        });
        return intervals.map(function (interval) {
            return namesByPc[normalizePc(rootPc + interval)] || null;
        });
    }

    function chordRootName(rootPc, rootName) {
        var parsedRoot = parseSpelledNoteName(rootName);
        if (parsedRoot && parsedRoot.pc === rootPc) return parsedRoot.name;

        // 任意コードの既存root選択（C♯ / E♭ / F♯ / A♭ / B♭）と同じ慣用ミックス。
        var useFlats = [3, 8, 10].indexOf(rootPc) !== -1;
        return noteName(rootPc, useFlats);
    }

    function degreeNumber(degreeLabel) {
        var match = /(\d+)/.exec(String(degreeLabel == null ? '' : degreeLabel));
        return match ? Number(match[1]) : null;
    }

    /**
     * コード構成音をrootの文字と度数に沿って綴る、表示用の純粋関数。
     * keyContext内の音はscale spellingを優先し、非scale音はdegreeのletterと
     * 実pitch classから臨時記号を決定する。既存noteName()の呼び出し経路は変更しない。
     */
    function spellChordNotes(options) {
        options = options || {};
        if (typeof options.rootPc !== 'number' || !isFinite(options.rootPc) || Math.floor(options.rootPc) !== options.rootPc) {
            throw new Error('Chord spelling requires an integer rootPc.');
        }

        var rootPc = normalizePc(options.rootPc);
        var quality = QUALITIES[options.qualityKey];
        var intervals = Array.isArray(options.intervals)
            ? options.intervals.slice()
            : (quality ? quality.intervals.slice() : null);
        var labels = Array.isArray(options.degreeLabels)
            ? options.degreeLabels.slice()
            : (quality && intervals && sameIntervals(intervals, quality.intervals)
                ? quality.degreeLabels.slice()
                : (intervals ? degreeLabels(intervals) : null));

        if (!intervals || !labels || intervals.length !== labels.length) {
            throw new Error('Chord spelling requires matching intervals and degreeLabels.');
        }
        intervals.forEach(function (interval) {
            if (typeof interval !== 'number' || !isFinite(interval) || Math.floor(interval) !== interval) {
                throw new Error('Chord spelling intervals must be integers.');
            }
        });

        var contextNamesByPc = {};
        var contextRootName = null;
        var keyContext = options.keyContext;
        if (keyContext && SCALES[keyContext.mode] &&
            typeof keyContext.tonicPc === 'number' && isFinite(keyContext.tonicPc) &&
            Math.floor(keyContext.tonicPc) === keyContext.tonicPc) {
            spellScaleNotes({ tonicPc: keyContext.tonicPc, scaleId: keyContext.mode }).forEach(function (scaleNote) {
                contextNamesByPc[scaleNote.pc] = scaleNote.name;
                if (scaleNote.pc === rootPc) contextRootName = scaleNote.name;
            });
        }

        var resolvedRootName = contextRootName || chordRootName(rootPc, options.rootName);
        var parsedRoot = parseSpelledNoteName(resolvedRootName);
        var rootLetterIndex = NOTE_LETTERS.indexOf(parsedRoot.letter);

        return intervals.map(function (interval, index) {
            var pc = normalizePc(rootPc + interval);
            var number = degreeNumber(labels[index]);
            if (!number || number < 1) {
                throw new Error('Chord spelling requires numbered degree labels.');
            }
            var letter = NOTE_LETTERS[(rootLetterIndex + number - 1) % NOTE_LETTERS.length];
            var contextualName = contextNamesByPc[pc];
            var parsedContextName = parseSpelledNoteName(contextualName);

            // 同じpitch classでもdegreeが要求するletterと異なる場合はコード構造を優先する。
            if (parsedContextName && parsedContextName.letter === letter) return parsedContextName.name;
            return letter + formatAccidental(accidentalOffsetForPc(letter, pc));
        });
    }

    /**
     * slash Bassをupper chordとは別roleのまま理論綴りする。
     * bassIntervalはrootからの音程で、bassPcとの一致を必ず検証する。
     */
    function spellBassNote(options) {
        options = options || {};
        if (typeof options.rootPc !== 'number' || !isFinite(options.rootPc) || Math.floor(options.rootPc) !== options.rootPc ||
            typeof options.bassPc !== 'number' || !isFinite(options.bassPc) || Math.floor(options.bassPc) !== options.bassPc) {
            throw new Error('Bass spelling requires integer rootPc and bassPc.');
        }

        var rootPc = normalizePc(options.rootPc);
        var bassPc = normalizePc(options.bassPc);
        var inferredInterval = normalizePc(bassPc - rootPc);
        var bassInterval = options.bassInterval === undefined || options.bassInterval === null
            ? inferredInterval
            : options.bassInterval;
        if (typeof bassInterval !== 'number' || !isFinite(bassInterval) || Math.floor(bassInterval) !== bassInterval ||
            normalizePc(bassInterval) !== inferredInterval) {
            throw new Error('Bass spelling requires bassInterval to match bassPc.');
        }

        var inferredDegrees = {
            0: '1', 1: '♭9', 2: '9', 3: '♯9', 4: '3', 5: '11',
            6: '♯11', 7: '5', 8: '♭13', 9: '13', 10: '♭7', 11: '7'
        };
        var degreeLabel = options.bassDegreeLabel == null
            ? inferredDegrees[inferredInterval]
            : options.bassDegreeLabel;
        if (!degreeNumber(degreeLabel)) {
            throw new Error('Bass spelling requires a numbered bassDegreeLabel.');
        }

        return spellChordNotes({
            rootPc: rootPc,
            rootName: options.rootName,
            intervals: [bassInterval],
            degreeLabels: [degreeLabel],
            keyContext: options.keyContext || null
        })[0];
    }

    /** spellChordNotes()の結果を保ったまま、ドレミ表記だけへ変換する。 */
    function solfegeNameForSpelling(name) {
        var parsed = parseSpelledNoteName(name);
        if (!parsed) return null;
        var names = { C: 'ド', D: 'レ', E: 'ミ', F: 'ファ', G: 'ソ', A: 'ラ', B: 'シ' };
        return names[parsed.letter] + formatAccidental(parsed.accidental);
    }

    function solfegeName(pc, useFlats) {
        var names = useFlats ? SOLFEGE_FLAT : SOLFEGE_SHARP;
        return names[((pc % 12) + 12) % 12];
    }

    function chordSymbol(rootPc, qualityKey, useFlats) {
        return noteName(rootPc, useFlats) + QUALITIES[qualityKey].symbolSuffix;
    }

    /** 旧保存データを変更せず、ユーザー表示時だけ maj7 を M7 に正規化する。 */
    function displayChordName(name) {
        return String(name == null ? '' : name).replace(/maj7/gi, 'M7');
    }

    function getDiatonicChords(tonicPc, mode, toneMode) {
        var def = DIATONIC[mode];
        var scaleNotes = spellScaleNotes({ tonicPc: tonicPc, scaleId: mode });
        var qualities = toneMode === '7' ? def.seventhQualities : def.triadQualities;
        var romans = toneMode === '7' ? def.roman7 : def.roman3;
        var result = [];
        var i;
        for (i = 0; i < 7; i++) {
            var rootPc = (tonicPc + def.rootIntervals[i]) % 12;
            var rootName = scaleNotes[i].name;
            var qualityKey = qualities[i];
            var intervals = QUALITIES[qualityKey].intervals.slice();
            // 減三和音の内部品質は dim のまま、ダイアトニック3和音の表示だけを m♭5 にする。
            var symbol = (toneMode !== '7' && qualityKey === 'dim')
                ? rootName + 'm♭5'
                : rootName + QUALITIES[qualityKey].symbolSuffix;
            var notePcs = intervals.map(function (interval) {
                return (rootPc + interval) % 12;
            });
            var noteNames = intervals.map(function (_interval, chordToneIndex) {
                return scaleNotes[(i + chordToneIndex * 2) % scaleNotes.length].name;
            });
            result.push({
                index: i,
                roman: romans[i],
                rootPc: rootPc,
                rootName: rootName,
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

    /**
     * canonical qualityが分かる場合だけ、品質固有の度数表記を返す。
     * 例: dim7の9半音は一般的な「6」ではなく、構成上の「♭♭7」として扱う。
     * 未知のinterval列は既存の半音基準表示へ安全にfallbackする。
     */
    function degreeLabelsForQuality(qualityKey, intervals) {
        var quality = QUALITIES[qualityKey];
        if (quality && sameIntervals(intervals, quality.intervals)) {
            return quality.degreeLabels.slice();
        }
        return degreeLabels(intervals);
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
        formatAccidental: formatAccidental,
        parseSpelledNoteName: parseSpelledNoteName,
        tonicNameFor: tonicNameFor,
        spellScaleNotes: spellScaleNotes,
        diatonicNoteNamesForContext: diatonicNoteNamesForContext,
        spellChordNotes: spellChordNotes,
        spellBassNote: spellBassNote,
        solfegeNameForSpelling: solfegeNameForSpelling,
        solfegeName: solfegeName,
        chordSymbol: chordSymbol,
        displayChordName: displayChordName,
        getDiatonicChords: getDiatonicChords,
        degreeLabels: degreeLabels,
        degreeLabelsForQuality: degreeLabelsForQuality
    };
})();
