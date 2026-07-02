/* クルーズスタジオ — music-theory.js
   キー・カポ・階名変換の土台（Phase 1）。
   本格的なコード解析・MIDI変換は Phase 4 以降で拡張する。
   グローバル名前空間 CruiseStudio.theory に登録する。 */
(function () {
    'use strict';

    // 半音インデックス（C=0）。シャープ/フラット両表記を受ける
    var KEY_TO_SEMITONE = {
        'C': 0, 'B#': 0,
        'C#': 1, 'DB': 1,
        'D': 2,
        'D#': 3, 'EB': 3,
        'E': 4, 'FB': 4,
        'F': 5, 'E#': 5,
        'F#': 6, 'GB': 6,
        'G': 7,
        'G#': 8, 'AB': 8,
        'A': 9,
        'A#': 10, 'BB': 10,
        'B': 11, 'CB': 11
    };

    // 半音→表記名（シャープ優先。フラット表記の選択は将来対応: TODO）
    var SEMITONE_TO_NAME = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    // 長音階の度数→半音オフセット（step 0=ド ... 6=シ）
    var MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

    // 中心オクターブ（octave=0）のドを C4 相当に置く基準MIDIノート
    var CENTER_DO_MIDI = 60;

    /**
     * キー名を正規化する。'db' → 'Db'、'c#' → 'C#'。
     * 不正な入力は null を返す。
     */
    function normalizeKeyName(name) {
        if (typeof name !== 'string') return null;
        var s = name.trim();
        if (!s) return null;
        var m = s.match(/^([A-Ga-g])([#b♯♭]?)$/);
        if (!m) return null;
        var root = m[1].toUpperCase();
        var acc = m[2].replace('♯', '#').replace('♭', 'b');
        var key = root + acc;
        if (!(key.toUpperCase() in KEY_TO_SEMITONE)) return null;
        return key;
    }

    /**
     * キー名 → 半音インデックス（C=0〜B=11）。不正なら null。
     */
    function keyToSemitone(key) {
        var k = normalizeKeyName(key);
        if (k === null) return null;
        var v = KEY_TO_SEMITONE[k.toUpperCase()];
        return (typeof v === 'number') ? v : null;
    }

    /**
     * 音名を delta 半音だけ移調して音名で返す（シャープ表記優先）。
     * 例: transposeNote('C', 2) → 'D'
     */
    function transposeNote(noteName, delta) {
        var s = keyToSemitone(noteName);
        if (s === null || typeof delta !== 'number' || !isFinite(delta)) return null;
        var t = ((s + Math.round(delta)) % 12 + 12) % 12;
        return SEMITONE_TO_NAME[t];
    }

    /**
     * Playキー + カポ → ORGキー（実音キー）。
     * 例: capoToOriginalKey('C', 2) → 'D'（2カポC = 実音D）
     */
    function capoToOriginalKey(playKey, capo) {
        var c = (typeof capo === 'number' && isFinite(capo)) ? Math.round(capo) : null;
        if (c === null || c < 0 || c > 11) return null;
        return transposeNote(playKey, c);
    }

    /**
     * playKey / capo / originalKey の整合を確認する。
     * DATA_MODEL.md: keyToSemitone(playKey) + capo ≡ keyToSemitone(originalKey) (mod 12)
     */
    function isKeyRelationConsistent(playKey, capo, originalKey) {
        var org = capoToOriginalKey(playKey, capo);
        var expected = keyToSemitone(originalKey);
        if (org === null || expected === null) return false;
        return keyToSemitone(org) === expected;
    }

    /**
     * 基本的なコード記号のパース。
     * 例: 'Am7/G' → { root:'A', quality:'m7', bass:'G' }
     * 対応: ルート音 + 任意のクオリティ文字列 + 任意のオンコード。
     * TODO(Phase 4): quality の構成音展開（m7 → [0,3,7,10] 等）。MIDI生成で必要になる。
     * TODO(Phase 4): テンション括弧表記 C7(9,13) や dim/aug の網羅的検証。
     */
    function parseBasicChordSymbol(symbol) {
        if (typeof symbol !== 'string') return null;
        var s = symbol.trim();
        if (!s) return null;
        var m = s.match(/^([A-G][#b♯♭]?)([^/]*)(?:\/([A-G][#b♯♭]?))?$/);
        if (!m) return null;
        var root = normalizeKeyName(m[1]);
        if (root === null) return null;
        var bass = null;
        if (m[3]) {
            bass = normalizeKeyName(m[3]);
            if (bass === null) return null;
        }
        return {
            root: root,
            quality: (m[2] || '').trim(),   // '' はメジャートライアド
            bass: bass                       // null = ルートと同じ
        };
    }

    /**
     * 階名メロディイベント → 実音MIDIノート番号。
     * DATA_MODEL.md 5章の式に従う。範囲外・不正入力は null。
     * TODO(Phase 4): マイナーキー基準の階名（ラ=主音）を採用するか検討。
     */
    function melodyEventToMidiNote(ev, playKey, capo) {
        if (!ev || typeof ev.step !== 'number') return null;
        var keySemi = keyToSemitone(playKey);
        if (keySemi === null) return null;
        var step = Math.round(ev.step);
        if (step < 0 || step > 6) return null;
        var alter = (typeof ev.alter === 'number') ? Math.round(ev.alter) : 0;
        var octave = (typeof ev.octave === 'number') ? Math.round(ev.octave) : 0;
        var c = (typeof capo === 'number' && isFinite(capo)) ? Math.round(capo) : 0;
        var note = CENTER_DO_MIDI + keySemi + c + MAJOR_SCALE[step] + alter + octave * 12;
        if (note < 0 || note > 127) return null;
        return note;
    }

    window.CruiseStudio = window.CruiseStudio || {};
    window.CruiseStudio.theory = {
        MAJOR_SCALE: MAJOR_SCALE.slice(),
        CENTER_DO_MIDI: CENTER_DO_MIDI,
        normalizeKeyName: normalizeKeyName,
        keyToSemitone: keyToSemitone,
        transposeNote: transposeNote,
        capoToOriginalKey: capoToOriginalKey,
        isKeyRelationConsistent: isKeyRelationConsistent,
        parseBasicChordSymbol: parseBasicChordSymbol,
        melodyEventToMidiNote: melodyEventToMidiNote
    };
})();
