/* クルーズスタジオ — midi-export.js（v0.6.0）
   伴奏イベント列 → SMF（Standard MIDI File）Type 1 の最小エンコーダ。
   外部ライブラリなしの自前バイナリ実装（ADR-015）。

   トラック構成:
     Track 0: メタ（トラック名 / テンポ / 拍子）
     Track 1: ベース（ch1 / Electric Bass (finger)）
     Track 2: ドラム（ch10 / GMドラムマップ）
   アコギはボイシング展開（コード→実音ノート）が未実装のため書き出し対象外。

   inspectSmf() は生成バイト列の簡易パーサ（自己検証用）。
   グローバル名前空間 CruiseStudio.midi に登録する。 */
(function () {
    'use strict';

    var BASS_CHANNEL = 0;    // ch1
    var DRUM_CHANNEL = 9;    // ch10（GMドラム）
    var BASS_PROGRAM = 33;   // GM: Electric Bass (finger)

    /* ══════════ バイト列ヘルパー ══════════ */

    function pushStr(bytes, str) {
        for (var i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i) & 0x7f);
    }

    function pushUint32(bytes, v) {
        bytes.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    }

    function pushUint16(bytes, v) {
        bytes.push((v >>> 8) & 0xff, v & 0xff);
    }

    /**
     * SMFの可変長数値（Variable Length Quantity）。
     */
    function pushVarLen(bytes, value) {
        var v = Math.max(0, Math.round(value));
        var buffer = v & 0x7f;
        while ((v >>= 7) > 0) {
            buffer <<= 8;
            buffer |= ((v & 0x7f) | 0x80);
        }
        for (;;) {
            bytes.push(buffer & 0xff);
            if (buffer & 0x80) buffer >>= 8;
            else break;
        }
    }

    function pushMetaText(bytes, type, text) {
        var data = [];
        try {
            var encoded = new TextEncoder().encode(String(text || ''));
            for (var i = 0; i < encoded.length; i++) data.push(encoded[i]);
        } catch (_) { /* テキストなしで続行 */ }
        pushVarLen(bytes, 0);
        bytes.push(0xff, type);
        pushVarLen(bytes, data.length);
        data.forEach(function (b) { bytes.push(b); });
    }

    function wrapTrack(eventBytes) {
        var bytes = [];
        pushStr(bytes, 'MTrk');
        pushUint32(bytes, eventBytes.length);
        return bytes.concat(eventBytes);
    }

    /* ══════════ トラック生成 ══════════ */

    /**
     * メタトラック（トラック名 / テンポ / 拍子 / EOT）。
     */
    function buildMetaTrack(meta) {
        var ev = [];
        pushMetaText(ev, 0x03, meta.title || 'Cruise Studio');
        // テンポ: FF 51 03（μ秒/4分音符）
        var bpm = (typeof meta.bpm === 'number' && meta.bpm > 0) ? meta.bpm : 120;
        var mpqn = Math.round(60000000 / bpm);
        pushVarLen(ev, 0);
        ev.push(0xff, 0x51, 0x03, (mpqn >>> 16) & 0xff, (mpqn >>> 8) & 0xff, mpqn & 0xff);
        // 拍子: FF 58 04 nn dd cc bb（ddは分母のlog2）
        var ts = meta.timeSignature || { beats: 4, beatUnit: 4 };
        var dd = Math.round(Math.log(ts.beatUnit || 4) / Math.LN2);
        pushVarLen(ev, 0);
        ev.push(0xff, 0x58, 0x04, ts.beats || 4, dd, 24, 8);
        // End of Track
        pushVarLen(ev, 0);
        ev.push(0xff, 0x2f, 0x00);
        return wrapTrack(ev);
    }

    /**
     * ノートイベント列（{absoluteTick, durationTicks, midi, velocity}）からトラックを作る。
     * 同時刻はNote Off優先で並べ、音の重なり事故を避ける。
     */
    function buildNoteTrack(name, channel, program, noteEvents) {
        var moments = [];
        noteEvents.forEach(function (ev) {
            if (typeof ev.midi !== 'number') return;
            var start = Math.max(0, Math.round(ev.absoluteTick));
            var dur = Math.max(1, Math.round(ev.durationTicks || 60));
            var vel = Math.min(127, Math.max(1, Math.round(ev.velocity || 96)));
            var note = Math.min(127, Math.max(0, Math.round(ev.midi)));
            moments.push({ tick: start, order: 1, bytes: [0x90 | channel, note, vel] });        // Note On
            moments.push({ tick: start + dur, order: 0, bytes: [0x80 | channel, note, 0x40] }); // Note Off
        });
        moments.sort(function (a, b) {
            return (a.tick - b.tick) || (a.order - b.order);
        });

        var ev = [];
        pushMetaText(ev, 0x03, name);
        if (typeof program === 'number') {
            pushVarLen(ev, 0);
            ev.push(0xc0 | channel, program & 0x7f);
        }
        var lastTick = 0;
        moments.forEach(function (m) {
            pushVarLen(ev, m.tick - lastTick);
            lastTick = m.tick;
            m.bytes.forEach(function (b) { ev.push(b); });
        });
        pushVarLen(ev, 0);
        ev.push(0xff, 0x2f, 0x00);
        return wrapTrack(ev);
    }

    /* ══════════ 公開API ══════════ */

    /**
     * 伴奏生成結果（generateArrangementの戻り値）からSMF Type 1のバイト列を作る。
     * 書き出し対象: ベース / ドラム（meta.midiExportTargets）。
     * @returns {{ok: boolean, bytes: Uint8Array|null, stats: object, error: string|null}}
     */
    function buildMidiFile(arrangement) {
        if (!arrangement || !arrangement.ok) {
            return { ok: false, bytes: null, stats: {}, error: '伴奏データがありません' };
        }
        var flat = CS_arrangementFlatten(arrangement);
        var bassNotes = flat.bass.filter(function (ev) { return typeof ev.midi === 'number'; });
        var drumNotes = flat.drums.filter(function (ev) { return typeof ev.midi === 'number'; });
        if (bassNotes.length === 0 && drumNotes.length === 0) {
            return { ok: false, bytes: null, stats: {}, error: 'MIDI書き出し対象（ベース/ドラム）のイベントがありません。パートON/OFFとコード入力を確認してください' };
        }

        var division = (arrangement.meta && arrangement.meta.ticksPerBeat) || 480;
        var tracks = [buildMetaTrack(arrangement.meta || {})];
        if (bassNotes.length > 0) tracks.push(buildNoteTrack('Bass', BASS_CHANNEL, BASS_PROGRAM, bassNotes));
        if (drumNotes.length > 0) tracks.push(buildNoteTrack('Drums', DRUM_CHANNEL, null, drumNotes));

        var bytes = [];
        pushStr(bytes, 'MThd');
        pushUint32(bytes, 6);
        pushUint16(bytes, 1);              // format 1
        pushUint16(bytes, tracks.length);  // ntrks
        pushUint16(bytes, division);       // TPQN
        tracks.forEach(function (t) { bytes = bytes.concat(t); });

        return {
            ok: true,
            bytes: new Uint8Array(bytes),
            stats: {
                format: 1,
                tracks: tracks.length,
                division: division,
                bassNotes: bassNotes.length,
                drumNotes: drumNotes.length,
                byteLength: bytes.length
            },
            error: null
        };
    }

    function CS_arrangementFlatten(arrangement) {
        var arr = window.CruiseStudio && window.CruiseStudio.arrangement;
        return arr.flattenEvents(arrangement);
    }

    /**
     * 生成したSMFバイト列の簡易検証パーサ（自己チェック用）。
     * チャンク構造・ヘッダ値・Note On数を確認する。
     */
    function inspectSmf(bytes) {
        function str(offset, len) {
            var s = '';
            for (var i = 0; i < len; i++) s += String.fromCharCode(bytes[offset + i]);
            return s;
        }
        function u32(o) { return (bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]; }
        function u16(o) { return (bytes[o] << 8) | bytes[o + 1]; }

        if (!bytes || bytes.length < 14 || str(0, 4) !== 'MThd' || u32(4) !== 6) {
            return { ok: false, error: 'MThdヘッダが不正です' };
        }
        var format = u16(8);
        var ntrks = u16(10);
        var division = u16(12);
        var offset = 14;
        var trackCount = 0;
        var noteOnCount = 0;
        while (offset + 8 <= bytes.length) {
            if (str(offset, 4) !== 'MTrk') {
                return { ok: false, error: 'MTrkチャンクが不正です (offset ' + offset + ')' };
            }
            var len = u32(offset + 4);
            var body = offset + 8;
            for (var i = body; i < body + len - 1; i++) {
                if ((bytes[i] & 0xf0) === 0x90 && bytes[i + 2] > 0) noteOnCount++;
            }
            trackCount++;
            offset = body + len;
        }
        if (offset !== bytes.length) {
            return { ok: false, error: 'チャンク長がファイル末尾と一致しません' };
        }
        if (trackCount !== ntrks) {
            return { ok: false, error: 'ヘッダのトラック数(' + ntrks + ')と実トラック数(' + trackCount + ')が不一致です' };
        }
        return { ok: true, format: format, ntrks: ntrks, division: division, noteOnCount: noteOnCount, byteLength: bytes.length };
    }

    window.CruiseStudio = window.CruiseStudio || {};
    window.CruiseStudio.midi = {
        buildMidiFile: buildMidiFile,
        inspectSmf: inspectSmf
    };
})();
