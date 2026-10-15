/*
 * Integrated Score UI Prototype v1 — 固定サンプルデータ（fixture）
 *
 * これは画面検証用の手書きサンプルであり、Studioの保存データ・変換Core・
 * Chord Cruise / Rhythm Cruise の実データではない。製品コードからは読み込まれない。
 *
 * 規約（Astra Integrated Score Architecture Contract v1 の考え方に合わせたモック表現）
 * - 4/4、480 PPQ、1小節 = 1920 ticks。
 * - メロディは実音の綴り付きpitch（例 'E4'）。MIDIは表示時に導出する。
 * - コード記号は実音基準。Capo 0 のサンプルなので押さえ方のコード名と同じ。
 * - フォームのフレットは Capo 相対。配列は 6弦→1弦 の順、null は弾かない弦。
 * - durState: 'auto' = 文字入力から自動で割り当てた音価（未確認）、'confirmed' = 確認済み。
 * - ストロークのイベント種別:
 *     attack  … 新しく鳴らす（dir: down/up）
 *     ghost   … 空振り（手は動くが弦に当てない。直前の音は続く）
 *     sustain … 伸ばす（手の動きを記さず、直前の音を続ける）
 *     rest    … 休み（音のない時間）
 *     stop    … 消音（鳴っている音を止める）
 *     dead    … ブラッシング（音程のない打撃。TABは×）
 * - ストロークの使用弦（サンプルの演奏指定）: ダウン = フォームの全弦、アップ = 1〜3弦。
 */
(function () {
    'use strict';
    var ISP = window.ISP = window.ISP || {};

    function deepFreeze(value) {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.freeze(value);
            Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
        }
        return value;
    }

    // ---- フォーム（サンプルのおすすめ・CAGED候補・固定済み）----
    // frets: [6弦, 5弦, 4弦, 3弦, 2弦, 1弦]（Capo相対）
    var forms = {
        'C-open':  { chord: 'C',   frets: [null, 3, 2, 0, 1, 0], caged: 'C', position: '開放' },
        'C-A3':    { chord: 'C',   frets: [null, 3, 5, 5, 5, 3], caged: 'A', position: '3フレット' },
        'C-G5':    { chord: 'C',   frets: [8, 7, 5, 5, 5, 8],    caged: 'G', position: '5フレット' },
        'C-E8':    { chord: 'C',   frets: [8, 10, 10, 9, 8, 8],  caged: 'E', position: '8フレット' },
        'C-D10':   { chord: 'C',   frets: [null, null, 10, 12, 13, 12], caged: 'D', position: '10フレット' },
        'C-open3': { chord: 'C',   frets: [null, 3, 2, 0, 1, 3], caged: 'C', position: '開放・1弦3フレット' },
        'G-open':  { chord: 'G',   frets: [3, 2, 0, 0, 0, 3],    caged: 'G', position: '開放' },
        'G-E3':    { chord: 'G',   frets: [3, 5, 5, 4, 3, 3],    caged: 'E', position: '3フレット' },
        'Am-open': { chord: 'Am',  frets: [null, 0, 2, 2, 1, 0], caged: 'A', position: '開放' },
        'F-E1':    { chord: 'F',   frets: [1, 3, 3, 2, 1, 1],    caged: 'E', position: '1フレット' },
        'Em-open': { chord: 'Em',  frets: [0, 2, 2, 0, 0, 0],    caged: 'E', position: '開放' },
        'Dm7-open':{ chord: 'Dm7', frets: [null, null, 0, 2, 1, 1], caged: 'D', position: '開放' },
        'Dm-open': { chord: 'Dm',  frets: [null, null, 0, 2, 3, 1], caged: 'D', position: '開放' },
        'G7-open': { chord: 'G7',  frets: [3, 2, 0, 0, 0, 1],    caged: 'G', position: '開放' }
    };

    // コード名 → サンプルのおすすめフォーム（Chord Cruise接続前の固定値）
    var recommended = {
        'C': 'C-open', 'G': 'G-open', 'Am': 'Am-open', 'F': 'F-E1', 'Em': 'Em-open',
        'Dm7': 'Dm7-open', 'Dm': 'Dm-open', 'G7': 'G7-open'
    };

    // コード名 → CAGED候補（サンプル。表示順は C A G E D）
    var cagedCandidates = {
        'C': ['C-open', 'C-A3', 'C-G5', 'C-E8', 'C-D10']
    };

    // ---- ストロークパターン（サンプル。Rhythm公式パターン接続前の固定値）----
    function ev(t, kind, dir) { return dir ? { t: t, kind: kind, dir: dir } : { t: t, kind: kind }; }
    var patterns = {
        // 8分・王道: ↓ (↑) ↓ ↑ (↓) ↑ ↓ ↑
        p8: {
            name: '8分・王道', grid: 240, sample: true,
            events: [ev(0, 'attack', 'down'), ev(240, 'ghost', 'up'), ev(480, 'attack', 'down'), ev(720, 'attack', 'up'),
                ev(960, 'ghost', 'down'), ev(1200, 'attack', 'up'), ev(1440, 'attack', 'down'), ev(1680, 'attack', 'up')]
        },
        // 16分・王道（Rhythm Cruise の「16分王道のストローク」と同じ打点の並びをサンプルとして記述）
        p16: {
            name: '16分・王道', grid: 120, sample: true,
            events: [ev(0, 'attack', 'down'), ev(120, 'ghost', 'up'), ev(240, 'ghost', 'down'), ev(360, 'ghost', 'up'),
                ev(480, 'attack', 'down'), ev(600, 'ghost', 'up'), ev(720, 'attack', 'down'), ev(840, 'attack', 'up'),
                ev(960, 'ghost', 'down'), ev(1080, 'attack', 'up'), ev(1200, 'attack', 'down'), ev(1320, 'ghost', 'up'),
                ev(1440, 'attack', 'down'), ev(1560, 'ghost', 'up'), ev(1680, 'attack', 'down'), ev(1800, 'attack', 'up')]
        },
        // 全音符で鳴らし続ける（この小節だけの指定の例）
        ring: {
            name: '1回鳴らして伸ばす', grid: 480, sample: true,
            events: [ev(0, 'attack', 'down'), ev(480, 'sustain'), ev(960, 'sustain'), ev(1440, 'sustain')]
        },
        // 記号サンプル（16分カッティング）: 6種類の記号をすべて含む
        symbols: {
            name: '記号サンプル（16分カッティング）', grid: 120, sample: true,
            events: [ev(0, 'attack', 'down'), ev(120, 'attack', 'up'), ev(240, 'dead', 'down'), ev(360, 'attack', 'up'),
                ev(480, 'attack', 'down'), ev(600, 'ghost', 'up'), ev(720, 'attack', 'down'), ev(840, 'stop'),
                ev(960, 'rest'), ev(1080, 'rest'), ev(1200, 'attack', 'down'), ev(1320, 'sustain'),
                ev(1440, 'attack', 'down'), ev(1560, 'attack', 'up'), ev(1680, 'dead', 'down'), ev(1800, 'attack', 'up')]
        }
    };

    // ---- メロディ記述ヘルパー ----
    var noteSerial = 0;
    function n(pitch, t, d, lyric) { noteSerial += 1; return { id: 'n' + noteSerial, p: pitch, t: t, d: d, ly: lyric || '' }; }
    function r(t, d) { noteSerial += 1; return { id: 'r' + noteSerial, rest: true, explicit: true, t: t, d: d }; }
    function ch(id, t, symbol) { return { id: id, t: t, symbol: symbol }; }

    // ---- 曲1: 朝のひかり（このプロトタイプのための書き下ろし。既存曲ではない）----
    var main = {
        id: 'main', title: '朝のひかり', artist: 'Cruise Studio 固定サンプル',
        key: 'C', keyLabel: 'C', capo: 0, bpm: 92, meter: [4, 4], basicPattern: 'p8',
        emptyChordRule: null,
        sections: [{ id: 's-a', name: 'Aメロ' }, { id: 's-b', name: 'サビ' }, { id: 's-o', name: 'アウトロ' }],
        bars: [
            // Aメロ: ドレミの文字入力から自動で割り当てた音価（未確認）
            { id: 'b01', section: 's-a', durState: 'auto', doremiText: 'ミミソ〜ラソミ〜', chords: [ch('c01', 0, 'C')],
              melody: [n('E4', 0, 240, 'あ'), n('E4', 240, 240, 'さ'), n('G4', 480, 480, 'の'), n('A4', 960, 240, 'ひ'), n('G4', 1200, 240, 'か'), n('E4', 1440, 480, 'り')] },
            { id: 'b02', section: 's-a', durState: 'auto', doremiText: 'レレソ〜シラソ〜', chords: [ch('c02', 0, 'G')],
              melody: [n('D4', 0, 240, 'ま'), n('D4', 240, 240, 'ど'), n('G4', 480, 480, 'を'), n('B4', 960, 240, 'あ'), n('A4', 1200, 240, 'け'), n('G4', 1440, 480, 'て')] },
            { id: 'b03', section: 's-a', durState: 'auto', doremiText: 'ド↑シラ〜ミソラ〜', chords: [ch('c03', 0, 'Am')],
              melody: [n('C5', 0, 240, 'き'), n('B4', 240, 240, 'み'), n('A4', 480, 480, 'の'), n('E4', 960, 240, 'な'), n('G4', 1200, 240, 'ま'), n('A4', 1440, 480, 'え')] },
            { id: 'b04', section: 's-a', durState: 'auto', doremiText: 'ファ〜ラソファ〜', chords: [ch('c04', 0, 'F')],
              melody: [n('F4', 0, 480, 'よ'), n('A4', 480, 240, 'ん'), n('G4', 720, 240, 'で'), n('F4', 960, 480, 'み')] },
            // サビ: ルーペで音価を確認済み（付点・2分・明示休符を含む）
            { id: 'b05', section: 's-b', durState: 'confirmed', chords: [ch('c05', 0, 'F'), ch('c06', 960, 'G')],
              melody: [n('A4', 0, 480, 'そ'), n('A4', 480, 240, 'ら'), n('C5', 720, 240, 'へ'), n('B4', 960, 720, 'と'), n('G4', 1680, 240, 'ど')] },
            { id: 'b06', section: 's-b', durState: 'confirmed', chords: [ch('c07', 0, 'Em'), ch('c08', 960, 'Am')],
              melody: [n('G4', 0, 480, 'け'), n('E4', 480, 240, 'こ'), n('G4', 720, 240, 'の'), n('A4', 960, 480, 'う'), n('C5', 1440, 240, 'た'), n('B4', 1680, 240, 'を')] },
            { id: 'b07', section: 's-b', durState: 'confirmed', chords: [ch('c09', 0, 'Dm7'), ch('c10', 960, 'G')],
              melody: [n('A4', 0, 480, 'い'), n('A4', 480, 240, 'つ'), n('F4', 720, 240, 'か'), n('G4', 960, 240, 'き'), n('A4', 1200, 240, 'み'), n('B4', 1440, 480, 'に')] },
            { id: 'b08', section: 's-b', durState: 'confirmed', chords: [ch('c11', 0, 'C')],
              melody: [n('C5', 0, 240, 'と'), n('B4', 240, 240, 'ど'), n('C5', 480, 960, 'く'), r(1440, 480)] },
            // アウトロ: メロディなし（休み）
            { id: 'b09', section: 's-o', durState: 'confirmed', chords: [ch('c12', 0, 'C')], melody: [] },
            { id: 'b10', section: 's-o', durState: 'confirmed', chords: [ch('c13', 0, 'G')], melody: [] },
            { id: 'b11', section: 's-o', durState: 'confirmed', chords: [ch('c14', 0, 'F')], melody: [] },
            { id: 'b12', section: 's-o', durState: 'confirmed', chords: [ch('c15', 0, 'C')], melody: [], strum: 'ring' }
        ],
        // 演奏指定（モック）: 未記載のイベントは「おすすめ（自動）」
        formBindings: {
            c10: { formId: 'G-E3', pinned: true, source: 'caged', note: 'CAGED候補から選択' },
            c15: { formId: 'C-open3', pinned: true, source: 'shelf', note: 'コード本棚「いつもの押さえ方」から取り込み', originDeleted: true }
        }
    };

    // ---- 曲2: 高密度サンプル（S22: 長い歌詞・1小節4コード・16分の密集）----
    var dense = {
        id: 'dense', title: '高密度サンプル', artist: 'Cruise Studio 固定サンプル（読みやすさの検証用）',
        key: 'C', keyLabel: 'C', capo: 0, bpm: 108, meter: [4, 4], basicPattern: 'p8',
        emptyChordRule: null,
        sections: [{ id: 'd-a', name: '密集の例' }],
        bars: [
            { id: 'd01', section: 'd-a', durState: 'confirmed',
              chords: [ch('dc1', 0, 'C'), ch('dc2', 480, 'Am'), ch('dc3', 960, 'Dm7'), ch('dc4', 1440, 'G7')],
              melody: [n('C5', 0, 120, 'あ'), n('B4', 120, 120, 'し'), n('A4', 240, 120, 'た'), n('G4', 360, 120, 'の'),
                  n('A4', 480, 120, 'こ'), n('G4', 600, 120, 'と'), n('F4', 720, 120, 'は'), n('E4', 840, 120, 'あ'),
                  n('F4', 960, 120, 'し'), n('E4', 1080, 120, 'た'), n('D4', 1200, 120, 'に'), n('C4', 1320, 120, 'ま'),
                  n('D4', 1440, 480, 'かせて')] },
            { id: 'd02', section: 'd-a', durState: 'confirmed', chords: [ch('dc5', 0, 'Am'), ch('dc6', 960, 'F')],
              melody: [n('E4', 0, 240, 'Good'), n('G4', 240, 240, 'mor-'), n('A4', 480, 240, 'ning'), n('C5', 720, 240, 'sun-'),
                  n('B4', 960, 240, 'shine'), n('A4', 1200, 240, 'ひ'), n('G4', 1440, 240, 'か'), n('E4', 1680, 240, 'り')] },
            { id: 'd03', section: 'd-a', durState: 'confirmed', chords: [ch('dc7', 0, 'Am')], melody: [], strum: 'symbols' },
            { id: 'd04', section: 'd-a', durState: 'confirmed', chords: [ch('dc8', 0, 'C')],
              melody: [n('C5', 0, 1920, 'へ')], strum: 'p16' }
        ],
        formBindings: {}
    };

    ISP.fixture = deepFreeze({
        forms: forms,
        recommended: recommended,
        cagedCandidates: cagedCandidates,
        patterns: patterns,
        songs: { main: main, dense: dense },
        notice: 'Integrated Score UI Prototype v1 — 固定サンプル（音楽変換・保存・Undoは模擬です）'
    });
}());
