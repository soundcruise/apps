/*
 * Integrated Score UI Prototype v1 — モックの曲状態の解釈（フォーム解決・リズム継承・出力状態）
 *
 * 「おすすめ」はfixtureの固定表で、Chord Cruiseの推奨処理ではない。
 * 出力状態（生成可能／要確認／生成不可）はこのモックの規則で計算した表示用の値。
 */
(function () {
    'use strict';
    var ISP = window.ISP = window.ISP || {};
    var M = ISP.music, F = ISP.fixture;

    var STYLES = {
        chord:  { label: 'コード譜',   lanes: ['chord', 'stroke', 'lyrics', 'doremi'] },
        melody: { label: 'メロディ譜', lanes: ['chord', 'staff', 'lyrics'] },
        guitar: { label: 'ギター譜',   lanes: ['chord', 'stroke', 'tab'] },
        singer: { label: '弾き語り譜', lanes: ['chord', 'staff', 'lyrics', 'stroke', 'tab'] },
        custom: { label: 'カスタム',   lanes: null }
    };
    var CUSTOM_ORDER = ['chord', 'staff', 'lyrics', 'doremi', 'stroke', 'tab', 'accomp'];
    var LANE_LABELS = {
        chord: 'コード', stroke: 'ストローク', staff: 'メロディ（歌）', lyrics: '歌詞', doremi: 'ドレミ',
        tab: 'ギター伴奏 TAB', accomp: 'ギター伴奏 五線'
    };

    function lanesFor(style, custom) {
        if (style !== 'custom') return STYLES[style].lanes.slice();
        return CUSTOM_ORDER.filter(function (id) { return custom[id]; });
    }

    function barIndexOf(song, barId) {
        for (var i = 0; i < song.bars.length; i++) if (song.bars[i].id === barId) return i;
        return -1;
    }
    function allChordEvents(song) {
        var out = [];
        song.bars.forEach(function (bar, i) { bar.chords.forEach(function (c) { out.push({ ev: c, barIndex: i }); }); });
        return out;
    }
    function findChord(song, chordId) {
        var all = allChordEvents(song);
        for (var i = 0; i < all.length; i++) if (all[i].ev.id === chordId) return all[i];
        return null;
    }

    function effectivePattern(song, bar) {
        var id = bar.strum || song.basicPattern;
        var pattern = id.indexOf('custom:') === 0 ? (song.customPatterns || {})[id] : F.patterns[id];
        return { id: id, pattern: pattern, inherited: !bar.strum };
    }

    // 小節内の時刻tで有効なコード。空欄は「未指定」。前コード継続は曲の規則を明示した場合だけ。
    function chordAt(song, barIndex, t) {
        var bar = song.bars[barIndex];
        var hit = null;
        bar.chords.forEach(function (c) { if (c.t <= t) hit = c; });
        if (hit) return { ev: hit, carried: false };
        if (song.emptyChordRule === 'carry') {
            for (var i = barIndex - 1; i >= 0; i--) {
                var prev = song.bars[i].chords;
                if (prev.length) return { ev: prev[prev.length - 1], carried: true };
            }
        }
        return null;
    }

    // フォームの解決。不適合な固定は保持したまま pending（要確認）にする。おすすめで黙って埋めない。
    function resolveForm(song, ev) {
        if (!ev) return { state: 'blank' };
        if (ev.symbol === 'N.C.') return { state: 'nc' };
        var binding = song.formBindings[ev.id];
        if (binding) {
            var form = F.forms[binding.formId];
            if (!M.sameChord(form.chord, ev.symbol)) return { state: 'pending', form: form, formId: binding.formId, binding: binding };
            return { state: binding.pinned ? 'pinned' : 'auto', form: form, formId: binding.formId, binding: binding };
        }
        var rec = F.recommended[ev.symbol];
        if (rec) return { state: 'auto', form: F.forms[rec], formId: rec };
        return { state: 'missing' };
    }

    function sameChordEvents(song, chordId) {
        var target = findChord(song, chordId);
        if (!target) return [];
        return allChordEvents(song).filter(function (x) {
            return x.ev.id !== chordId && M.sameChord(x.ev.symbol, target.ev.symbol);
        });
    }

    function barNumberText(list) {
        // 連続する小節番号を「1–4」にまとめる
        var out = [], start = null, prev = null;
        list.forEach(function (n) {
            if (start === null) { start = prev = n; return; }
            if (n === prev + 1) { prev = n; return; }
            out.push(start === prev ? String(start) : start + '–' + prev); start = prev = n;
        });
        if (start !== null) out.push(start === prev ? String(start) : start + '–' + prev);
        return out.join('・');
    }

    // 出力ごとの状態。items: {barIndex, kind, text}
    function readiness(song) {
        var melodyItems = [], tabItems = [];
        var autoBars = [];
        song.bars.forEach(function (bar, i) {
            if (bar.durState === 'auto' && bar.melody.length) autoBars.push(i + 1);
        });
        if (autoBars.length) melodyItems.push({ barIndex: autoBars[0] - 1, kind: 'auto-duration', bars: autoBars,
            text: barNumberText(autoBars) + '小節：メロディの音の長さは自動で割り当てたもの（未確認）' });
        song.bars.forEach(function (bar, i) {
            var pat = effectivePattern(song, bar).pattern;
            var needsChord = pat.events.some(function (e) { return e.kind === 'attack' || e.kind === 'dead'; });
            if (!needsChord) return;
            var starts = bar.chords.length ? bar.chords : [null];
            if (!bar.chords.length) {
                var carried = chordAt(song, i, 0);
                if (!carried) {
                    tabItems.push({ barIndex: i, kind: 'blank', text: (i + 1) + '小節：コードが空欄のため、ギターの音を決められません' });
                    return;
                }
                starts = [carried.ev];
            } else if (bar.chords[0].t > 0 && !chordAt(song, i, 0)) {
                tabItems.push({ barIndex: i, kind: 'blank', text: (i + 1) + '小節：小節の頭のコードが空欄です' });
            }
            starts.forEach(function (ev) {
                var res = resolveForm(song, ev);
                if (res.state === 'pending') tabItems.push({ barIndex: i, kind: 'pending', chordId: ev.id,
                    text: (i + 1) + '小節：ギターの押さえ方を確認（コードが' + ev.symbol + 'に変わり、前に選んだ' + res.form.chord + 'の押さえ方が合いません）' });
                if (res.state === 'missing') tabItems.push({ barIndex: i, kind: 'missing', chordId: ev.id,
                    text: (i + 1) + '小節：' + ev.symbol + ' の押さえ方がまだありません（このモックのおすすめ表にないコード）' });
            });
        });
        function summarize(items) { return items.length ? 'review' : 'ok'; }
        return {
            melody: { state: summarize(melodyItems), items: melodyItems },
            tab: { state: summarize(tabItems), items: tabItems },
            accomp: { state: 'unavailable', items: [{ barIndex: 0, kind: 'unsupported',
                text: 'ギター伴奏五線：生成不可（伴奏五線は工程5で検証予定。このプロトタイプでは作りません）' }] }
        };
    }

    // 譜面スタイルに含まれる出力だけの状態
    function outputsFor(lanes, ready) {
        var out = [];
        if (lanes.indexOf('staff') >= 0) out.push({ id: 'melody', label: 'メロディ（歌）五線', r: ready.melody });
        if (lanes.indexOf('tab') >= 0) out.push({ id: 'tab', label: 'ギター伴奏 TAB', r: ready.tab });
        if (lanes.indexOf('accomp') >= 0) out.push({ id: 'accomp', label: 'ギター伴奏 五線', r: ready.accomp });
        return out;
    }
    function isFinal(lanes, ready) {
        return outputsFor(lanes, ready).every(function (o) { return o.r.state === 'ok'; });
    }

    ISP.model = {
        STYLES: STYLES, CUSTOM_ORDER: CUSTOM_ORDER, LANE_LABELS: LANE_LABELS, lanesFor: lanesFor,
        barIndexOf: barIndexOf, allChordEvents: allChordEvents, findChord: findChord,
        effectivePattern: effectivePattern, chordAt: chordAt, resolveForm: resolveForm,
        sameChordEvents: sameChordEvents, readiness: readiness, outputsFor: outputsFor, isFinal: isFinal,
        barNumberText: barNumberText
    };
}());
