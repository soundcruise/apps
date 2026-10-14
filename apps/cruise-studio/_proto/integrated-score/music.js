/*
 * Integrated Score UI Prototype v1 — 音楽表示用の小さな純関数群（モック専用）
 *
 * Studioの正式な変換Core・Chord Cruise・Rhythm Cruiseの代わりではない。
 * 固定サンプルを矛盾なく表示するための最小限の計算だけを持つ。
 */
(function () {
    'use strict';
    var ISP = window.ISP = window.ISP || {};
    var BAR = 1920;
    var STEP_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
    var STEP_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    var DOREMI = ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ'];
    var OPEN_STRINGS = [40, 45, 50, 55, 59, 64]; // 6弦→1弦 E2 A2 D3 G3 B3 E4

    function parsePitch(text) {
        var m = /^([A-G])([#♯b♭]*)(-?\d)$/.exec(text);
        if (!m) throw new Error('invalid pitch ' + text);
        var alter = 0;
        m[2].split('').forEach(function (c) { alter += (c === '#' || c === '♯') ? 1 : -1; });
        return { step: m[1], alter: alter, octave: Number(m[3]) };
    }
    function midiOf(p) { return 12 * (p.octave + 1) + STEP_SEMI[p.step] + p.alter; }
    function diatonicIndex(p) { return p.octave * 7 + STEP_INDEX[p.step]; }
    function accidental(alter) { return alter > 0 ? '♯'.repeat(alter) : alter < 0 ? '♭'.repeat(-alter) : ''; }
    function pitchName(p) { return p.step + accidental(p.alter) + p.octave; }

    // Cメジャー基準の階名（このサンプルはKey C）。C4〜B4は記号なし、C5以上は↑、C4未満は↓。
    function doremiLabel(p, key) {
        var keyStep = STEP_INDEX[(key || 'C').charAt(0)];
        var idx = (STEP_INDEX[p.step] - keyStep + 7) % 7;
        var mark = p.octave >= 5 ? '↑' : p.octave <= 3 ? '↓' : '';
        return DOREMI[idx] + accidental(p.alter) + mark;
    }

    // ---- コード記号 ----
    function parseChord(symbol) {
        if (!symbol) return null;
        if (symbol === 'N.C.') return { nc: true };
        var m = /^([A-G])([#♯b♭]?)([^/]*)(?:\/([A-G])([#♯b♭]?))?$/.exec(symbol);
        if (!m) return { text: symbol, unknown: true };
        function acc(c) { return c === '#' || c === '♯' ? 1 : c === 'b' || c === '♭' ? -1 : 0; }
        return { root: m[1], rootAlter: acc(m[2]), quality: m[3] || '',
            bass: m[4] || null, bassAlter: m[4] ? acc(m[5]) : 0 };
    }
    // 「同じコード」= root・quality・bass が一致（文字列一致ではない）。楽器条件はサンプルでは全曲共通。
    function sameChord(a, b) {
        var x = parseChord(a), y = parseChord(b);
        if (!x || !y || x.nc || y.nc || x.unknown || y.unknown) return false;
        return x.root === y.root && x.rootAlter === y.rootAlter && x.quality === y.quality &&
            x.bass === y.bass && x.bassAlter === y.bassAlter;
    }

    // ---- 移調（綴りを保つ）----
    // 調名のpitch class → このモックで使う長調名
    var KEY_BY_PC = { 0: 'C', 1: 'D♭', 2: 'D', 3: 'E♭', 4: 'E', 5: 'F', 6: 'F♯', 7: 'G', 8: 'A♭', 9: 'A', 10: 'B♭', 11: 'B' };
    function keyInfo(name) {
        var p = parsePitch(name.replace('♯', '#').replace('♭', 'b') + '4');
        return { step: p.step, alter: p.alter, pc: ((STEP_SEMI[p.step] + p.alter) % 12 + 12) % 12 };
    }
    function transposeKey(name, semis) {
        var info = keyInfo(name);
        return KEY_BY_PC[(((info.pc + semis) % 12) + 12) % 12];
    }
    // 調の文字差（letter shift）で綴りを決め、半音差で変化記号を決める
    function shiftSpelled(step, alter, octave, letterShift, semis) {
        var fromIndex = STEP_INDEX[step];
        var raw = fromIndex + letterShift;
        var newOctave = octave + Math.floor(raw / 7);
        var newStep = LETTERS[((raw % 7) + 7) % 7];
        var targetMidi = 12 * (octave + 1) + STEP_SEMI[step] + alter + semis;
        var newAlter = targetMidi - (12 * (newOctave + 1) + STEP_SEMI[newStep]);
        return { step: newStep, alter: newAlter, octave: newOctave };
    }
    // semis（-11〜+11）の方向に合わせて、調名の文字差を上下どちらへ数えるかを決める
    function keyShift(fromKey, semis) {
        var toKey = transposeKey(fromKey, semis);
        var a = keyInfo(fromKey), b = keyInfo(toKey);
        var letterShift = ((STEP_INDEX[b.step] - STEP_INDEX[a.step]) % 7 + 7) % 7;
        if (semis < 0 && letterShift > 0) letterShift -= 7;
        return { letterShift: letterShift, semis: semis, toKey: toKey };
    }
    function transposePitchText(text, fromKey, semis) {
        var s = keyShift(fromKey, semis);
        var p = parsePitch(text);
        return pitchName(shiftSpelled(p.step, p.alter, p.octave, s.letterShift, semis));
    }
    function transposeChord(symbol, fromKey, semis) {
        var c = parseChord(symbol);
        if (!c || c.nc || c.unknown) return symbol;
        var s = keyShift(fromKey, semis);
        var root = shiftSpelled(c.root, c.rootAlter, 4, s.letterShift, s.semis);
        var out = root.step + accidental(root.alter) + c.quality;
        if (c.bass) {
            var bass = shiftSpelled(c.bass, c.bassAlter, 4, s.letterShift, s.semis);
            out += '/' + bass.step + accidental(bass.alter);
        }
        return out;
    }

    // ---- 時間・音価 ----
    var VALUES = [
        { d: 1920, type: 'whole', dots: 0 }, { d: 1440, type: 'half', dots: 1 }, { d: 960, type: 'half', dots: 0 },
        { d: 720, type: 'quarter', dots: 1 }, { d: 480, type: 'quarter', dots: 0 }, { d: 360, type: 'eighth', dots: 1 },
        { d: 240, type: 'eighth', dots: 0 }, { d: 120, type: '16th', dots: 0 }
    ];
    function valueOf(d) { for (var i = 0; i < VALUES.length; i++) if (VALUES[i].d === d) return VALUES[i]; return null; }
    // 拍頭から書ける長い音価（4/4の一般的な書き方）
    function allowedOnBeat(t, d) {
        if (d < 480) return true;
        if (d === 480) return true;
        if (d === 720) return t % 960 === 0;
        if (d === 960) return true;
        if (d === 1440) return t === 0 || t === 480;
        if (d === 1920) return t === 0;
        return false;
    }
    // 1つの音（または休み）を、拍の境界に応じて記譜用の断片へ分ける。音のIDは1つのまま。
    // 表せない長さは丸めずに例外にする（モックのfixtureで検出するため）。
    function segment(t, d) {
        var pieces = [];
        var end = t + d;
        if (t < 0 || end > BAR || d <= 0) throw new Error('duration outside bar');
        while (t < end) {
            var limit = t % 480 === 0 ? end - t : Math.min((Math.floor(t / 480) + 1) * 480, end) - t;
            var pick = null;
            for (var i = 0; i < VALUES.length; i++) {
                var v = VALUES[i];
                if (v.d > limit) continue;
                if (t % 480 === 0 && !allowedOnBeat(t, v.d)) continue;
                if (t % 480 !== 0 && v.dots && (t % 480) + v.d > 480) continue;
                pick = v; break;
            }
            if (!pick) throw new Error('unrepresentable duration at ' + t);
            pieces.push({ t: t, d: pick.d });
            t += pick.d;
        }
        pieces.forEach(function (p, i) { p.tieNext = i < pieces.length - 1; p.value = valueOf(p.d); });
        return pieces;
    }

    // ---- フォーム ----
    function formMidi(form, capo) {
        return form.frets.map(function (fret, i) { return fret === null ? null : OPEN_STRINGS[i] + (capo || 0) + fret; });
    }
    // 使用弦（サンプル指定）: down = 全弦、up = 1〜3弦。戻り値は 6弦→1弦 の真偽配列
    function usedStrings(form, dir) {
        return form.frets.map(function (fret, i) { return fret !== null && (dir !== 'up' || i >= 3); });
    }

    ISP.music = {
        BAR: BAR, parsePitch: parsePitch, midiOf: midiOf, diatonicIndex: diatonicIndex, pitchName: pitchName,
        accidental: accidental, doremiLabel: doremiLabel, parseChord: parseChord, sameChord: sameChord,
        transposeKey: transposeKey, transposePitchText: transposePitchText, transposeChord: transposeChord,
        keyInfo: keyInfo, valueOf: valueOf, segment: segment, formMidi: formMidi, usedStrings: usedStrings,
        OPEN_STRINGS: OPEN_STRINGS
    };
}());
