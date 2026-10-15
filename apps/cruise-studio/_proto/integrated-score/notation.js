/*
 * Integrated Score UI Prototype v1 — 共通レイアウトと紙面描画（モック）
 *
 * - 画面と印刷は同じ layoutScore() の結果（1システムの小節数・改ページ）を使う。
 * - 全段が同じ小節境界と時間位置（anchorX）を共有する。段ごとに別々に整形しない。
 * - 描画結果（SVG文字列）は表示専用。曲データの正本ではない。
 */
(function () {
    'use strict';
    var ISP = window.ISP = window.ISP || {};
    var M = ISP.music, F = ISP.fixture, MD = ISP.model;

    var PAGE = { w: 794, h: 1123, ml: 57, content: 680 };
    var PAGE_TOP = 30, BAND_H = 22, FOOT_H = 64, PAGE_BOTTOM = 18;
    var HEAD_FIRST = 92, HEAD_NEXT = 26, DIAG_H = 100, SECTION_H = 16, SYSTEM_GAP = 14;
    var LANE_H = { chord: 26, stroke: 30, staff: 66, lyrics: 20, doremi: 18, tab: 92, accomp: 42 };
    var S = 7; // 五線の線間
    var MIN_FONT = { lyric: 12, tab: 11, chord: 13, doremi: 11 };

    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function textW(str, size, latin) {
        var w = 0;
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            w += c >= 0x2E80 ? size : (c === 0x2193 || c === 0x2191) ? size * 0.75 : size * (latin || 0.6);
        }
        return w;
    }
    function chordW(label) { return textW(label, MIN_FONT.chord, 0.8); }
    function lanesHave(lanes, id) { return lanes.indexOf(id) >= 0; }

    // ---- 小節に必要な幅（全段を集約） ----
    function onsetNeed(list, pxOf) {
        // list: [{t, item}] sorted; each gap until next onset (or bar end) must hold pxOf(item)
        var need = 0;
        for (var i = 0; i < list.length; i++) {
            var next = i + 1 < list.length ? list[i + 1].t : M.BAR;
            var gap = next - list[i].t;
            if (gap <= 0) continue;
            need = Math.max(need, pxOf(list[i].item) * M.BAR / gap);
        }
        return need;
    }
    function barNeed(song, barIndex, lanes, labels) {
        var bar = song.bars[barIndex];
        var need = 60;
        var notes = bar.melody.filter(function (x) { return !x.rest; }).map(function (x) { return { t: x.t, item: x }; });
        if (lanesHave(lanes, 'staff')) need = Math.max(need, onsetNeed(notes, function (x) { return x.d <= 120 ? 13 : 15; }));
        if (lanesHave(lanes, 'lyrics')) need = Math.max(need, onsetNeed(notes, function (x) { return textW(x.ly, MIN_FONT.lyric) + 5; }));
        if (lanesHave(lanes, 'doremi')) need = Math.max(need, onsetNeed(notes, function (x) {
            return textW(M.doremiLabel(M.parsePitch(x.p), song.key), MIN_FONT.doremi) + 4; }));
        if (lanesHave(lanes, 'chord')) {
            var chords = bar.chords.map(function (c) { return { t: c.t, item: c }; });
            need = Math.max(need, onsetNeed(chords, function (c) {
                return chordW((lanesHave(lanes, 'tab') && labels[c.id]) || c.symbol) + (lanesHave(lanes, 'tab') ? 26 : 10); }));
        }
        var pat = MD.effectivePattern(song, bar).pattern.events.map(function (e) { return { t: e.t, item: e }; });
        if (lanesHave(lanes, 'stroke')) need = Math.max(need, onsetNeed(pat, function (e) { return e.kind === 'ghost' ? 19 : 13; }));
        if (lanesHave(lanes, 'tab')) need = Math.max(need, onsetNeed(pat, function () { return 12; }));
        return Math.ceil(need + 20);
    }

    // フォーム番号（同じコード名で押さえ方が複数あるとき C① C②）
    function formLabels(song) {
        var byChord = {}, labels = {}, order = [];
        MD.allChordEvents(song).forEach(function (x) {
            var res = MD.resolveForm(song, x.ev);
            if (!res.form || res.state === 'pending') return;
            var key = x.ev.symbol;
            byChord[key] = byChord[key] || [];
            if (byChord[key].indexOf(res.formId) < 0) { byChord[key].push(res.formId); order.push({ chord: key, formId: res.formId }); }
        });
        MD.allChordEvents(song).forEach(function (x) {
            var res = MD.resolveForm(song, x.ev);
            var list = byChord[x.ev.symbol];
            if (res.form && res.state !== 'pending' && list && list.length > 1) {
                labels[x.ev.id] = x.ev.symbol + '①②③④⑤'.charAt(list.indexOf(res.formId));
            }
        });
        order.forEach(function (o) {
            var list = byChord[o.chord];
            o.label = list.length > 1 ? o.chord + '①②③④⑤'.charAt(list.indexOf(o.formId)) : o.chord;
        });
        return { labels: labels, diagrams: order };
    }

    // ---- 共通レイアウト ----
    function layoutScore(song, opts) {
        var lanes = opts.lanes;
        var fl = formLabels(song);
        var hasPrefix = lanesHave(lanes, 'staff') || lanesHave(lanes, 'tab') || lanesHave(lanes, 'accomp');
        var needs = song.bars.map(function (b, i) { return barNeed(song, i, lanes, fl.labels); });
        var systems = [], i = 0;
        while (i < song.bars.length) {
            var prefix = hasPrefix ? (systems.length === 0 ? 52 : 34) : 0;
            var avail = PAGE.content - prefix;
            var count = 0, sum = 0;
            while (i + count < song.bars.length && count < opts.barsTarget && sum + needs[i + count] <= avail) {
                sum += needs[i + count]; count += 1;
            }
            if (count === 0) { count = 1; sum = needs[i]; }
            var bars = [], x = prefix;
            var reduced = count < opts.barsTarget && i + count < song.bars.length;
            for (var k = 0; k < count; k++) {
                var w = avail * needs[i + k] / sum;
                bars.push({ index: i + k, x: x, w: w });
                x += w;
            }
            var sectionStarts = bars.some(function (b) {
                var bar = song.bars[b.index];
                return b.index === 0 || song.bars[b.index - 1].section !== bar.section;
            });
            var height = (sectionStarts ? SECTION_H : 0) + lanes.reduce(function (h, id) { return h + LANE_H[id]; }, 0) + SYSTEM_GAP;
            systems.push({ index: systems.length, bars: bars, prefix: prefix, height: height, sectionBand: sectionStarts ? SECTION_H : 0, reduced: reduced });
            i += count;
        }
        // 改ページ（画面のページ枠と印刷で共通）
        var contentH = PAGE.h - PAGE_TOP - BAND_H - FOOT_H - PAGE_BOTTOM;
        var diagH = lanesHave(lanes, 'tab') ? DIAG_H : 0;
        var pages = [], page = null, used = 0;
        systems.forEach(function (sys) {
            var limit = contentH - (pages.length === 0 ? HEAD_FIRST + diagH : HEAD_NEXT);
            if (!page || used + sys.height > limit) {
                page = { index: pages.length, systems: [] }; pages.push(page); used = 0;
                limit = contentH - (page.index === 0 ? HEAD_FIRST + diagH : HEAD_NEXT);
            }
            page.systems.push(sys); sys.page = page.index; used += sys.height;
        });
        return { lanes: lanes, systems: systems, pages: pages, formLabels: fl, diagH: diagH, hasPrefix: hasPrefix };
    }

    // ---- 座標 ----
    function anchorX(bar, t) { return PAGE.ml + bar.x + 10 + t / M.BAR * (bar.w - 20); }

    // ---- SVG部品 ----
    function line(x1, y1, x2, y2, cls, extra) {
        return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) +
            '" class="' + cls + '"' + (extra || '') + '/>';
    }
    function text(x, y, str, cls, anchor, extra) {
        return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" class="' + cls + '"' +
            (anchor ? ' text-anchor="' + anchor + '"' : '') + (extra || '') + '>' + esc(str) + '</text>';
    }
    function noteheadPath(x, y, hollow, whole) {
        var rx = whole ? 5.2 : 4.4, ry = whole ? 3.4 : 3.1;
        var head = '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="' + rx + '" ry="' + ry +
            '" transform="rotate(' + (whole ? -10 : -22) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')" class="' + (hollow ? 'nh-hollow' : 'nh') + '"/>';
        return head;
    }
    function quarterRest(x, yMid) {
        return '<path class="rest-q" d="M' + (x - 1.5) + ' ' + (yMid - 10) + ' l4.5 5.5 l-4 4.5 l4.5 5 l-3.5 0 q-3 1 0.5 5"/>';
    }
    function eighthRest(x, yMid) {
        return '<g class="rest-8"><circle cx="' + (x - 1.8) + '" cy="' + (yMid - 3.5) + '" r="1.9"/>' +
            '<path d="M' + (x - 1.8) + ' ' + (yMid - 2) + ' q2.8 1.2 5 -1.8 l-4 11"/></g>';
    }
    function sixteenthRest(x, yMid) {
        return '<g class="rest-8"><circle cx="' + (x - 0.8) + '" cy="' + (yMid - 3.5) + '" r="1.9"/>' +
            '<circle cx="' + (x - 2.8) + '" cy="' + (yMid + 2.5) + '" r="1.9"/>' +
            '<path d="M' + (x - 0.8) + ' ' + (yMid - 2) + ' q2.8 1.2 5 -1.8 l-6.2 16"/>' +
            '<path d="M' + (x - 2.8) + ' ' + (yMid + 4) + ' q2.8 1.2 5 -1.8"/></g>';
    }
    function restGlyph(value, x, yMid, staffTop) {
        if (value.type === 'whole') return '<rect class="rest-block" x="' + (x - 5) + '" y="' + (staffTop + S) + '" width="10" height="3.6"/>';
        if (value.type === 'half') return '<rect class="rest-block" x="' + (x - 5) + '" y="' + (staffTop + 2 * S - 3.6) + '" width="10" height="3.6"/>';
        if (value.type === 'quarter') return quarterRest(x, yMid);
        if (value.type === 'eighth') return eighthRest(x, yMid);
        return sixteenthRest(x, yMid);
    }
    function flagPath(x, yTip, up, count) {
        var out = '';
        for (var i = 0; i < count; i++) {
            var y = up ? yTip + i * 5 : yTip - i * 5;
            out += up
                ? '<path class="flag" d="M' + x + ' ' + y + ' c0.5 5 7 6.5 6 13 c-0.3 -4.5 -3.5 -7 -6 -8 z"/>'
                : '<path class="flag" d="M' + x + ' ' + y + ' c0.5 -5 7 -6.5 6 -13 c-0.3 4.5 -3.5 7 -6 8 z"/>';
        }
        return out;
    }
    function trebleClef(x, staffTop) {
        // 記号フォント（Apple Symbols / Noto Music 等）の𝄞。Gの線（第2線）に合わせる。
        return '<text class="clef" x="' + x + '" y="' + (staffTop + 3 * S + 9) + '">&#x1D11E;</text>';
    }

    // 拍ごとの連桁グループ（音符の断片のみ）
    function beamGroups(pieces) {
        var groups = [], cur = null;
        pieces.forEach(function (p) {
            var beamable = !p.rest && p.d < 480;
            var beat = Math.floor(p.t / 480);
            if (beamable && cur && cur.beat === beat) { cur.items.push(p); return; }
            cur = beamable ? { beat: beat, items: [p] } : null;
            if (cur) groups.push(cur);
        });
        return groups;
    }

    // ---- 五線 ----
    function renderStaffLane(song, sys, laneTop, ctx) {
        var out = [];
        var staffTop = laneTop + 24, bottom = staffTop + 4 * S, mid = staffTop + 2 * S;
        var x0 = PAGE.ml, x1 = PAGE.ml + PAGE.content;
        for (var i = 0; i < 5; i++) out.push(line(x0, staffTop + i * S, x1, staffTop + i * S, 'staff-line'));
        out.push(trebleClef(x0 + 2, staffTop));
        if (sys.index === 0) {
            out.push(text(x0 + 38, staffTop + S * 2 - 1, '4', 'timesig', 'middle'));
            out.push(text(x0 + 38, staffTop + S * 4 - 1, '4', 'timesig', 'middle'));
        }
        function yOf(p) { return bottom - (M.diatonicIndex(p) - 30) * S / 2; }
        // 自動の音価: 小節単位の括弧線＋「自動」（色に頼らない）
        var autoRun = null;
        function flushAuto() {
            if (!autoRun) return;
            var y = laneTop + 7;
            out.push('<path class="auto-bracket" d="M' + (autoRun.x0 + 3) + ' ' + (y + 5) + ' v-5 H' + (autoRun.x1 - 3) + ' v5"/>');
            out.push('<rect class="auto-tag-bg" x="' + (autoRun.x0 + 6) + '" y="' + (y - 5) + '" width="64" height="11"/>');
            out.push(text(autoRun.x0 + 8, y + 4, '音の長さ：自動', 'auto-tag'));
            autoRun = null;
        }
        sys.bars.forEach(function (b) {
            var bar = song.bars[b.index];
            var bx0 = PAGE.ml + b.x, bx1 = bx0 + b.w;
            if (bar.durState === 'auto' && bar.melody.length) {
                if (autoRun && Math.abs(autoRun.x1 - bx0) < 0.5) autoRun.x1 = bx1; else { flushAuto(); autoRun = { x0: bx0, x1: bx1 }; }
            } else flushAuto();
            // 小節線
            var last = b.index === song.bars.length - 1;
            if (last) {
                out.push(line(bx1 - 4, staffTop, bx1 - 4, bottom, 'barline'));
                out.push('<rect class="barline-final" x="' + (bx1 - 2.5) + '" y="' + staffTop + '" width="2.5" height="' + (4 * S) + '"/>');
            } else out.push(line(bx1, staffTop, bx1, bottom, 'barline'));
            // 音符と休み（導出休符も記譜上は休符として描く）
            var items = bar.melody.slice().sort(function (a, b2) { return a.t - b2.t; });
            var seq = [], cursor = 0;
            items.forEach(function (it) {
                if (it.t > cursor) seq.push({ rest: true, derived: true, t: cursor, d: it.t - cursor });
                seq.push(it); cursor = it.t + it.d;
            });
            if (cursor < M.BAR) seq.push({ rest: true, derived: true, t: cursor, d: M.BAR - cursor });
            var pieces = [];
            seq.forEach(function (it) {
                if (it.rest && it.t === 0 && it.d === M.BAR) { pieces.push({ rest: true, wholeBar: true, t: 0, d: M.BAR, value: M.valueOf(1920) }); return; }
                M.segment(it.t, it.d).forEach(function (p) {
                    pieces.push({ rest: !!it.rest, t: p.t, d: p.d, value: p.value, tieNext: p.tieNext && !it.rest, note: it.rest ? null : it,
                        pitch: it.rest ? null : M.parsePitch(it.p), first: p.t === it.t });
                });
            });
            var groups = beamGroups(pieces);
            var grouped = new Set();
            groups.forEach(function (g) { if (g.items.length > 1) g.items.forEach(function (p) { grouped.add(p); }); });
            function stemUp(list) {
                var avg = list.reduce(function (s, p) { return s + (M.diatonicIndex(p.pitch) - 34); }, 0) / list.length;
                return avg < 0;
            }
            pieces.forEach(function (p, idx) {
                var x = anchorX(b, p.t);
                if (p.rest) {
                    var rx = p.wholeBar ? (bx0 + bx1) / 2 : x;
                    out.push(restGlyph(p.value, rx, mid, staffTop));
                    if (p.value.dots) out.push('<circle class="dot" cx="' + (rx + 6) + '" cy="' + (mid - 3.5) + '" r="1.3"/>');
                    return;
                }
                var y = yOf(p.pitch);
                var di = M.diatonicIndex(p.pitch);
                // 加線
                for (var li = 28; li >= di; li -= 2) out.push(line(x - 7, bottom + (30 - li) * S / 2, x + 7, bottom + (30 - li) * S / 2, 'ledger'));
                for (var lu = 40; lu <= di; lu += 2) out.push(line(x - 7, bottom - (lu - 30) * S / 2, x + 7, bottom - (lu - 30) * S / 2, 'ledger'));
                var hollow = p.value.type === 'half' || p.value.type === 'whole';
                out.push(noteheadPath(x, y, hollow, p.value.type === 'whole'));
                if (p.value.dots) out.push('<circle class="dot" cx="' + (x + 7.5) + '" cy="' + (di % 2 === 0 ? y - S / 2 : y) + '" r="1.4"/>');
                if (p.tieNext && pieces[idx + 1]) {
                    var nx = anchorX(b, pieces[idx + 1].t);
                    var up = M.diatonicIndex(p.pitch) >= 34;
                    var ty = up ? y - 6 : y + 6;
                    out.push('<path class="tie" d="M' + (x + 4) + ' ' + ty + ' Q' + ((x + nx) / 2) + ' ' + (ty + (up ? -6 : 6)) + ' ' + (nx - 4) + ' ' + ty + '"/>');
                }
                p.x = x; p.y = y;
            });
            // 符幹・連桁・旗
            var stemLen = 3.5 * S;
            groups.forEach(function (g) {
                if (g.items.length < 2) return;
                var up = stemUp(g.items);
                var beamY = up ? Math.min.apply(null, g.items.map(function (p) { return p.y; })) - stemLen
                    : Math.max.apply(null, g.items.map(function (p) { return p.y; })) + stemLen;
                g.items.forEach(function (p) {
                    var sx = up ? p.x + 4.1 : p.x - 4.1;
                    out.push(line(sx, p.y, sx, beamY, 'stem'));
                    p.sx = sx;
                });
                var a = g.items[0], z = g.items[g.items.length - 1];
                out.push('<rect class="beam" x="' + a.sx + '" y="' + (up ? beamY : beamY - 3) + '" width="' + (z.sx - a.sx + 1) + '" height="3"/>');
                // 16分の第2連桁（隣が16分なら結ぶ、単独なら短い桁）
                g.items.forEach(function (p, k) {
                    if (p.d > 120) return;
                    var y2 = up ? beamY + 5 : beamY - 8;
                    var nextP = g.items[k + 1], prevP = g.items[k - 1];
                    if (nextP && nextP.d <= 120) out.push('<rect class="beam" x="' + p.sx + '" y="' + y2 + '" width="' + (nextP.sx - p.sx + 1) + '" height="3"/>');
                    else if (!(prevP && prevP.d <= 120)) {
                        var dir = prevP ? -1 : 1;
                        var bx = dir < 0 ? p.sx - 7 : p.sx;
                        out.push('<rect class="beam" x="' + bx + '" y="' + y2 + '" width="7" height="3"/>');
                    }
                });
            });
            pieces.forEach(function (p) {
                if (p.rest || grouped.has(p) || p.value.type === 'whole') return;
                var up = M.diatonicIndex(p.pitch) < 34;
                var sx = up ? p.x + 4.1 : p.x - 4.1;
                var tip = up ? p.y - stemLen : p.y + stemLen;
                out.push(line(sx, p.y, sx, tip, 'stem'));
                if (p.value.type === 'eighth') out.push(flagPath(sx, tip, up, 1));
                if (p.value.type === '16th') out.push(flagPath(sx, tip, up, 2));
            });
            // 歌詞（同じ時間位置。歌詞段が別にあるときはそちらで描く）
            ctx.notePositions[b.index] = pieces.filter(function (p) { return !p.rest && p.first; }).map(function (p) { return { x: p.x, note: p.note }; });
        });
        flushAuto();
        out.push(line(x0, staffTop, x0, bottom, 'barline'));
        return out.join('');
    }

    // ---- ストローク ----
    var STROKE_SYMBOL = { attack: { down: '↓', up: '↑' }, ghost: { down: '(↓)', up: '(↑)' }, dead: '×', sustain: '〜', rest: '・', stop: '止' };
    function strokeSymbol(e) {
        var s = STROKE_SYMBOL[e.kind];
        return typeof s === 'string' ? s : s[e.dir];
    }
    function renderStrokeLane(song, sys, laneTop, ctx) {
        var out = [];
        var prevInherited = null;
        sys.bars.forEach(function (b, k) {
            var bar = song.bars[b.index];
            var eff = MD.effectivePattern(song, bar);
            var tag = null;
            if (!eff.inherited) tag = 'この小節だけ：' + eff.pattern.name;
            else if (k === 0 || prevInherited === false) tag = '曲の基本：' + eff.pattern.name;
            prevInherited = eff.inherited;
            // 小節の幅に収まらないときは短い札にする（紙面の外へはみ出さない）
            if (tag && textW(tag, 8.5, 0.62) > b.w - 10) tag = eff.inherited ? '曲の基本' : 'この小節だけ';
            if (tag) out.push(text(PAGE.ml + b.x + 6, laneTop + 9, tag, eff.inherited ? 'stroke-tag' : 'stroke-tag stroke-tag--own'));
            // N.C.（弾かない）の小節は矢印を描かない
            if (bar.chords.length && bar.chords.every(function (c) { return c.symbol === 'N.C.'; })) {
                out.push(text(anchorX(b, 0), laneTop + 24, 'N.C.（弾かない）', 'stroke-tag stroke-tag--own'));
                return;
            }
            eff.pattern.events.forEach(function (e) {
                var cls = 'stroke stroke--' + e.kind;
                out.push(text(anchorX(b, e.t), laneTop + 24, strokeSymbol(e), cls, 'middle'));
            });
        });
        return out.join('');
    }

    // ---- TAB ----
    function soundingSpans(events) {
        // attack/dead から次の attack/dead/stop/rest まで鳴る。ghost/sustain は継続。
        var spans = [], cur = null;
        events.forEach(function (e) {
            if (e.kind === 'attack' || e.kind === 'dead') {
                if (cur) { cur.d = e.t - cur.t; spans.push(cur); }
                cur = { t: e.t, kind: e.kind, dir: e.dir };
            } else if (e.kind === 'stop' || e.kind === 'rest') {
                if (cur) { cur.d = e.t - cur.t; spans.push(cur); cur = null; }
            }
        });
        if (cur) { cur.d = M.BAR - cur.t; spans.push(cur); }
        return spans;
    }
    function rhythmPieces(events, silentWhole) {
        var spans = silentWhole ? [] : soundingSpans(events);
        var seq = [], cursor = 0;
        spans.forEach(function (s) {
            if (s.t > cursor) seq.push({ rest: true, t: cursor, d: s.t - cursor });
            seq.push(s); cursor = s.t + s.d;
        });
        if (cursor < M.BAR) seq.push({ rest: true, t: cursor, d: M.BAR - cursor });
        var pieces = [];
        seq.forEach(function (it) {
            if (it.rest && it.t === 0 && it.d === M.BAR) { pieces.push({ rest: true, wholeBar: true, t: 0, d: M.BAR, value: M.valueOf(1920) }); return; }
            M.segment(it.t, it.d).forEach(function (p) {
                pieces.push({ rest: !!it.rest, t: p.t, d: p.d, value: p.value, tieNext: p.tieNext && !it.rest, span: it });
            });
        });
        return pieces;
    }
    function renderTabLane(song, sys, laneTop, ctx) {
        var out = [];
        var top = laneTop + 8, gap = 10, bottom = top + 5 * gap;
        var x0 = PAGE.ml, x1 = PAGE.ml + PAGE.content;
        for (var i = 0; i < 6; i++) out.push(line(x0, top + i * gap, x1, top + i * gap, 'tab-line'));
        out.push(text(x0 + 9, top + 15, 'T', 'tab-clef', 'middle'));
        out.push(text(x0 + 9, top + 30, 'A', 'tab-clef', 'middle'));
        out.push(text(x0 + 9, top + 45, 'B', 'tab-clef', 'middle'));
        out.push(line(x0, top, x0, bottom, 'barline'));
        var rTop = bottom + 9, rBottom = bottom + 27;
        sys.bars.forEach(function (b) {
            var bar = song.bars[b.index];
            var bx0 = PAGE.ml + b.x, bx1 = bx0 + b.w;
            var last = b.index === song.bars.length - 1;
            if (last) {
                out.push(line(bx1 - 4, top, bx1 - 4, bottom, 'barline'));
                out.push('<rect class="barline-final" x="' + (bx1 - 2.5) + '" y="' + top + '" width="2.5" height="' + (5 * gap) + '"/>');
            } else out.push(line(bx1, top, bx1, bottom, 'barline'));
            var pat = MD.effectivePattern(song, bar).pattern;
            // コード区間ごとの解決結果
            var spans = [];
            var starts = bar.chords.length ? bar.chords.map(function (c) { return c.t; }) : [0];
            if (starts[0] !== 0) starts.unshift(0);
            starts.forEach(function (t, k) {
                var end = k + 1 < starts.length ? starts[k + 1] : M.BAR;
                var at = MD.chordAt(song, b.index, t);
                spans.push({ t: t, end: end, at: at, res: MD.resolveForm(song, at ? at.ev : null) });
            });
            var allNc = spans.every(function (s) { return s.res.state === 'nc'; });
            spans.forEach(function (s) {
                var state = s.res.state;
                if (state === 'pending' || state === 'missing' || state === 'blank') {
                    var bxA = anchorX(b, s.t) - 7, bxB = s.end >= M.BAR ? bx1 - 4 : anchorX(b, s.end) - 9;
                    var label = state === 'pending' ? '押さえ方を確認 ' + s.at.ev.symbol
                        : state === 'missing' ? '押さえ方なし ' + s.at.ev.symbol : 'コード未指定';
                    out.push('<rect class="tab-box tab-box--' + state + '" x="' + bxA.toFixed(1) + '" y="' + (top - 2) + '" width="' + Math.max(30, bxB - bxA).toFixed(1) + '" height="' + (5 * gap + 4) + '" rx="3"/>');
                    out.push('<rect class="tab-box-label-bg" x="' + (bxA + 3).toFixed(1) + '" y="' + (top + 2 * gap - 1) + '" width="' + Math.min(bxB - bxA - 6, textW(label, 10) + 8).toFixed(1) + '" height="14"/>');
                    out.push(text(bxA + 7, top + 2 * gap + 10, label, 'tab-box-label'));
                    ctx.tabBoxes.push({ barIndex: b.index, state: state, chordId: s.at ? s.at.ev.id : null });
                }
                if (state === 'nc') out.push(text(anchorX(b, s.t), top + 2 * gap + 10, 'N.C.', 'tab-nc'));
            });
            // 打点ごとのフレット
            pat.events.forEach(function (e) {
                if (e.kind !== 'attack' && e.kind !== 'dead') return;
                var s = spans.filter(function (sp) { return sp.t <= e.t && e.t < sp.end; })[0];
                if (!s || !s.res.form || (s.res.state !== 'auto' && s.res.state !== 'pinned')) return;
                var used = M.usedStrings(s.res.form, e.dir);
                var x = anchorX(b, e.t);
                s.res.form.frets.forEach(function (fret, stringIdx) {
                    if (!used[stringIdx]) return;
                    var row = 5 - stringIdx; // 1弦が上
                    var y = top + row * gap;
                    var label = e.kind === 'dead' ? '×' : String(fret);
                    var w = label.length > 1 ? 12 : 7;
                    out.push('<rect class="tab-num-bg" x="' + (x - w / 2 - 0.5) + '" y="' + (y - 5.5) + '" width="' + (w + 1) + '" height="11"/>');
                    out.push(text(x, y + 3.9, label, 'tab-num', 'middle'));
                });
            });
            // リズム（打点の長さ）
            var pieces = rhythmPieces(pat.events, allNc);
            var groups = beamGroups(pieces);
            var grouped = new Set();
            groups.forEach(function (g) { if (g.items.length > 1) g.items.forEach(function (p) { grouped.add(p); }); });
            pieces.forEach(function (p, idx) {
                var x = anchorX(b, p.t);
                p.x = x;
                if (p.rest) {
                    var rx = p.wholeBar ? (bx0 + bx1) / 2 : x;
                    if (p.value.type === 'whole') out.push('<rect class="rest-block" x="' + (rx - 5) + '" y="' + (rTop + 4) + '" width="10" height="3.2"/>');
                    else if (p.value.type === 'half') out.push('<rect class="rest-block" x="' + (rx - 5) + '" y="' + (rTop + 7) + '" width="10" height="3.2"/>');
                    else out.push(restGlyph(p.value, rx, rTop + 10, rTop));
                    return;
                }
                if (p.value.type !== 'whole') out.push(line(x, rTop, x, rBottom, 'stem'));
                if (p.value.type === 'half' || p.value.type === 'whole') out.push('<circle class="nh-hollow" cx="' + x + '" cy="' + (p.value.type === 'whole' ? rTop + 6 : rBottom - 1) + '" r="2.4"/>');
                if (p.value.dots) out.push('<circle class="dot" cx="' + (x + 4) + '" cy="' + (rBottom - 4) + '" r="1.3"/>');
                if (!grouped.has(p) && p.value.type === 'eighth') out.push(flagPath(x, rBottom, false, 1));
                if (!grouped.has(p) && p.value.type === '16th') out.push(flagPath(x, rBottom, false, 2));
                if (p.tieNext && pieces[idx + 1]) {
                    var nx = anchorX(b, pieces[idx + 1].t);
                    out.push('<path class="tie" d="M' + (x + 2) + ' ' + (rTop - 1) + ' Q' + ((x + nx) / 2) + ' ' + (rTop - 6) + ' ' + (nx - 2) + ' ' + (rTop - 1) + '"/>');
                }
            });
            groups.forEach(function (g) {
                if (g.items.length < 2) return;
                var a = g.items[0], z = g.items[g.items.length - 1];
                out.push('<rect class="beam" x="' + a.x + '" y="' + (rBottom - 3) + '" width="' + (z.x - a.x + 1) + '" height="3"/>');
                g.items.forEach(function (p, k) {
                    if (p.d > 120) return;
                    var nextP = g.items[k + 1], prevP = g.items[k - 1];
                    if (nextP && nextP.d <= 120) out.push('<rect class="beam" x="' + p.x + '" y="' + (rBottom - 8) + '" width="' + (nextP.x - p.x + 1) + '" height="3"/>');
                    else if (!(prevP && prevP.d <= 120)) out.push('<rect class="beam" x="' + (prevP ? p.x - 6 : p.x) + '" y="' + (rBottom - 8) + '" width="6" height="3"/>');
                });
            });
        });
        return out.join('');
    }

    // ---- コード段 ----
    function renderChordLane(song, sys, laneTop, ctx, layout, print) {
        var out = [];
        sys.bars.forEach(function (b) {
            var bar = song.bars[b.index];
            if (!bar.chords.length) {
                var carried = MD.chordAt(song, b.index, 0);
                if (carried) out.push(text(anchorX(b, 0) - 4, laneTop + 18, '(' + carried.ev.symbol + ')', 'chord chord--carried'));
                else if (!print) out.push(text(anchorX(b, 0) - 4, laneTop + 18, '空欄', 'chord-blank'));
                return;
            }
            bar.chords.forEach(function (c) {
                // 押さえ方の番号（C①C②）はTABがある譜面だけで使う
                var label = (lanesHave(layout.lanes, 'tab') && layout.formLabels.labels[c.id]) || c.symbol;
                out.push(text(anchorX(b, c.t) - 4, laneTop + 18, label, c.symbol === 'N.C.' ? 'chord chord--nc' : 'chord'));
                ctx.chordBoxes.push({ chordId: c.id, barIndex: b.index, x: anchorX(b, c.t) - 6, y: laneTop + 2, w: chordW(label) + 5, h: 21 });
            });
        });
        return out.join('');
    }

    function renderLyricsLane(song, sys, laneTop, ctx, withStaff) {
        var out = [];
        sys.bars.forEach(function (b) {
            var bar = song.bars[b.index];
            bar.melody.forEach(function (n) {
                if (n.rest || !n.ly) return;
                out.push(text(anchorX(b, n.t), laneTop + 14, n.ly, 'lyric', 'middle'));
            });
        });
        return out.join('');
    }
    function renderDoremiLane(song, sys, laneTop) {
        var out = [];
        sys.bars.forEach(function (b) {
            song.bars[b.index].melody.forEach(function (n) {
                if (n.rest) return;
                out.push(text(anchorX(b, n.t), laneTop + 13, M.doremiLabel(M.parsePitch(n.p), song.key), 'doremi', 'middle'));
            });
        });
        return out.join('');
    }
    function renderAccompLane(sys, laneTop) {
        var x0 = PAGE.ml + sys.prefix, w = PAGE.content - sys.prefix;
        return '<rect class="lane-unavailable" x="' + x0 + '" y="' + (laneTop + 6) + '" width="' + w + '" height="' + (LANE_H.accomp - 12) + '" rx="3"/>' +
            text(x0 + 10, laneTop + 25, '生成不可：ギター伴奏五線はこの工程では作りません（工程5で検証予定）', 'lane-unavailable-text');
    }

    // コード譜（Structure）の升目
    function renderStructureGrid(song, sys, top, height) {
        var out = [];
        sys.bars.forEach(function (b) {
            var bx0 = PAGE.ml + b.x;
            out.push('<rect class="grid-bar" x="' + bx0.toFixed(1) + '" y="' + top + '" width="' + b.w.toFixed(1) + '" height="' + height + '"/>');
            for (var t = 240; t < M.BAR; t += 240) {
                var x = anchorX(b, t) - (b.w - 20) / 16;
                out.push(line(x, top, x, top + height, t % 480 === 0 ? 'grid-beat' : 'grid-eighth'));
            }
        });
        return out.join('');
    }

    // ---- システム全体 ----
    function renderSystem(song, layout, sys, opts) {
        var lanes = layout.lanes, print = !!opts.print;
        var ctx = { notePositions: {}, chordBoxes: [], tabBoxes: [], laneTops: {} };
        var y = 0, out = [];
        if (sys.sectionBand) {
            sys.bars.forEach(function (b) {
                var bar = song.bars[b.index];
                if (b.index === 0 || song.bars[b.index - 1].section !== bar.section) {
                    var sec = song.sections.filter(function (s) { return s.id === bar.section; })[0];
                    out.push('<rect class="section-mark" x="' + (PAGE.ml + b.x) + '" y="2" width="3" height="11"/>');
                    out.push(text(PAGE.ml + b.x + 7, 12, sec.name, 'section-label'));
                }
            });
            y += SECTION_H;
        }
        var structureLanes = ['chord', 'stroke', 'lyrics', 'doremi'];
        var isStructure = !lanesHave(lanes, 'staff') && !lanesHave(lanes, 'tab') && !lanesHave(lanes, 'accomp');
        if (isStructure) {
            var gridH = lanes.filter(function (id) { return structureLanes.indexOf(id) >= 0; }).reduce(function (h, id) { return h + LANE_H[id]; }, 0);
            out.push(renderStructureGrid(song, sys, y, gridH));
        }
        var firstSystemOfPage = opts.firstOfPage;
        lanes.forEach(function (id) {
            ctx.laneTops[id] = y;
            if (firstSystemOfPage && !print || firstSystemOfPage && print) {
                if (id === 'staff' || id === 'tab' || id === 'accomp') {
                    out.push(text(PAGE.ml - 8, y + (id === 'staff' ? 44 : id === 'tab' ? 30 : 24), id === 'staff' ? 'メロディ' : id === 'tab' ? 'ギター' : '伴奏', 'lane-label', 'end'));
                    out.push(text(PAGE.ml - 8, y + (id === 'staff' ? 55 : id === 'tab' ? 41 : 35), id === 'staff' ? '（歌）' : id === 'tab' ? '伴奏TAB' : '五線', 'lane-label lane-label--sub', 'end'));
                }
            }
            if (id === 'chord') out.push(renderChordLane(song, sys, y, ctx, layout, print));
            if (id === 'stroke') out.push(renderStrokeLane(song, sys, y, ctx));
            if (id === 'staff') out.push(renderStaffLane(song, sys, y, ctx));
            if (id === 'lyrics') out.push(renderLyricsLane(song, sys, y, ctx, lanesHave(lanes, 'staff')));
            if (id === 'doremi') out.push(renderDoremiLane(song, sys, y));
            if (id === 'tab') out.push(renderTabLane(song, sys, y, ctx));
            if (id === 'accomp') out.push(renderAccompLane(sys, y));
            y += LANE_H[id];
        });
        var h = sys.height;
        return { svg: '<svg class="system-svg" width="' + PAGE.w + '" height="' + h + '" viewBox="0 0 ' + PAGE.w + ' ' + h + '" aria-hidden="true">' + out.join('') + '</svg>', ctx: ctx };
    }

    // ---- ダイアグラム ----
    function diagramSvg(form, label, opts) {
        var w = 58, h = 84, left = 12, top = 30, sg = 7, fg = 10, frets = 4;
        var fretted = form.frets.filter(function (f) { return f !== null && f > 0; });
        var maxF = fretted.length ? Math.max.apply(null, fretted) : 0;
        var minF = fretted.length ? Math.min.apply(null, fretted) : 0;
        var start = maxF <= 4 ? 1 : minF;
        var out = [];
        out.push(text(w / 2, 13, label, 'diag-name', 'middle'));
        for (var s = 0; s < 6; s++) out.push(line(left + s * sg, top, left + s * sg, top + frets * fg, 'diag-line'));
        for (var f = 0; f <= frets; f++) out.push(line(left, top + f * fg, left + 5 * sg, top + f * fg, f === 0 && start === 1 ? 'diag-nut' : 'diag-line'));
        if (start > 1) out.push(text(left + 5 * sg + 4, top + 7, start + 'fr', 'diag-fr'));
        form.frets.forEach(function (fret, i) {
            var x = left + i * sg;
            if (fret === null) out.push(text(x, top - 4, '×', 'diag-mark', 'middle'));
            else if (fret === 0) out.push('<circle class="diag-open" cx="' + x + '" cy="' + (top - 7) + '" r="2.4"/>');
            else out.push('<circle class="diag-dot" cx="' + x + '" cy="' + (top + (fret - start + 0.5) * fg) + '" r="3.2"/>');
        });
        if (opts && opts.caption) out.push(text(w / 2, h - 2, opts.caption, 'diag-caption', 'middle'));
        return '<svg class="diagram" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label + ' の押さえ方（6弦から ' +
            form.frets.map(function (x) { return x === null ? '×' : x; }).join(' ') + '）') + '">' + out.join('') + '</svg>';
    }

    ISP.notation = {
        PAGE: PAGE, PAGE_TOP: PAGE_TOP, BAND_H: BAND_H, FOOT_H: FOOT_H, PAGE_BOTTOM: PAGE_BOTTOM, HEAD_FIRST: HEAD_FIRST,
        HEAD_NEXT: HEAD_NEXT, DIAG_H: DIAG_H, LANE_H: LANE_H, MIN_FONT: MIN_FONT,
        layoutScore: layoutScore, renderSystem: renderSystem, diagramSvg: diagramSvg, anchorX: anchorX,
        strokeSymbol: strokeSymbol, esc: esc, textW: textW
    };
}());
