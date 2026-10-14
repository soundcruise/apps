/*
 * Integrated Score UI Prototype v1 — 画面状態の制御（モック）
 *
 * - 曲の状態はメモリ上の固定サンプルの複製だけ。localStorage・IndexedDB・ネットワークを使わない。
 * - Undo/Redoは画面状態の模擬（スナップショット）。Studioの正式なEditing Sessionではない。
 * - ルーペは紙面DOMの外にある常設DOM。小節移動・紙面再描画で入力欄を作り直さない。
 */
(function () {
    'use strict';
    var ISP = window.ISP;
    var F = ISP.fixture, M = ISP.music, MD = ISP.model, N = ISP.notation;
    var $ = function (id) { return document.getElementById(id); };
    var esc = N.esc;

    function clone(x) { return JSON.parse(JSON.stringify(x)); }
    var chordSerial = 100;

    // ---------------------------------------------------------------- state
    var state;
    function freshState(keep) {
        return {
            songId: 'main', songs: { main: clone(F.songs.main), dense: clone(F.songs.dense) },
            style: 'chord', custom: { chord: true, staff: true, lyrics: true, doremi: false, stroke: true, tab: true, accomp: false },
            loupe: { open: false, barIndex: 0, res: 8, selectedNote: null }, spacerH: 300,
            inspector: { open: false, mode: 'overview', chordId: null },
            zoom: 'fit', barsTarget: keep ? keep.barsTarget : 4, inspWidth: keep ? keep.inspWidth : 360,
            history: [], future: [], dirty: false, promptDismissed: false, scenario: null, bulk: null, bulkConfirm: false,
            popover: null, layout: null, previewLanes: null
        };
    }
    function song() { return state.songs[state.songId]; }
    function lanes() { return MD.lanesFor(state.style, state.custom); }

    // ---------------------------------------------------------------- 模擬Undo（曲内容と譜面スタイルのスナップショット）
    function snapshot() { return clone({ songs: state.songs, songId: state.songId, style: state.style, custom: state.custom }); }
    function restore(s) { state.songs = s.songs; state.songId = s.songId; state.style = s.style; state.custom = s.custom; }
    function pushHistory(label) {
        state.history.push({ label: label, snap: snapshot() });
        state.future = [];
        state.dirty = true;
    }
    function undo() {
        var entry = state.history.pop();
        if (!entry) return;
        state.future.push({ label: entry.label, snap: snapshot() });
        restore(entry.snap);
        state.bulk = null;
        status('元に戻しました：' + entry.label + '（模擬Undo）');
        afterMutation();
    }
    function redo() {
        var entry = state.future.pop();
        if (!entry) return;
        state.history.push({ label: entry.label, snap: snapshot() });
        restore(entry.snap);
        status('やり直しました：' + entry.label + '（模擬Redo）');
        afterMutation();
    }
    function afterMutation() {
        if (state.loupe.barIndex >= song().bars.length) state.loupe.barIndex = 0;
        render();
        if (state.popover && state.popover.refresh) state.popover.refresh();
    }

    var statusTimer = null;
    function status(text) {
        var el = $('status-msg');
        el.textContent = text;
        clearTimeout(statusTimer);
        statusTimer = setTimeout(function () { el.textContent = ''; }, 6000);
    }

    // ---------------------------------------------------------------- 表示ヘルパー
    function chordPosText(found) {
        return (found.barIndex + 1) + '小節目・' + (found.ev.t / 480 + 1) + '拍目の ' + found.ev.symbol;
    }
    function formStateText(st) {
        return { auto: 'おすすめ（自動）', pinned: '固定（自分で選択）', pending: '要確認', missing: '押さえ方なし', nc: 'N.C.（弾かない）', blank: 'コード未指定' }[st] || st;
    }
    function arrowsText(pattern) {
        var byT = {};
        pattern.events.forEach(function (e) { byT[e.t] = N.strokeSymbol(e); });
        var step = pattern.grid >= 240 ? 240 : 120;
        var beats = [];
        for (var b = 0; b < 4; b++) {
            var cells = [];
            for (var t = b * 480; t < (b + 1) * 480; t += step) cells.push(byT[t] || '・');
            beats.push(cells.join(' '));
        }
        return beats.join('｜');
    }
    function diagramHtml(form, label, caption) {
        return '<span class="insp-diagram">' + N.diagramSvg(form, label, { caption: caption }) + '</span>';
    }
    function cagedText(form) { return form.caged + '型・' + form.position; }

    // ---------------------------------------------------------------- 紙面
    function computeZoom() {
        if (state.zoom !== 'fit') return Number(state.zoom);
        var w = $('stage').clientWidth - 32;
        return Math.max(0.5, Math.min(1.5, w / N.PAGE.w));
    }
    function footnotesFor(page, layoutLanes, ready) {
        var bars = [];
        page.systems.forEach(function (sys) { sys.bars.forEach(function (b) { bars.push(b.index); }); });
        var notes = [];
        MD.outputsFor(layoutLanes, ready).forEach(function (o) {
            o.r.items.forEach(function (it) {
                if (o.id === 'accomp') { if (page.index === 0) notes.push(it.text); return; }
                if (it.kind === 'auto-duration') {
                    var here = it.bars.filter(function (n) { return bars.indexOf(n - 1) >= 0; });
                    if (here.length) notes.push(MD.barNumberText(here) + '小節：メロディの音の長さは自動で割り当てたもの（未確認。括弧線「音の長さ：自動」の範囲）');
                    return;
                }
                if (bars.indexOf(it.barIndex) >= 0) notes.push(it.text + '（点線の枠）');
            });
        });
        if (notes.length > 3) notes = notes.slice(0, 2).concat(['ほか' + (notes.length - 2) + '件（確認一覧はInspectorを参照）']);
        return notes;
    }
    function buildPages(s, layout, opts) {
        var ready = MD.readiness(s);
        var final = MD.isFinal(layout.lanes, ready);
        var html = [];
        var total = layout.pages.length;
        layout.pages.forEach(function (page) {
            html.push('<section class="page' + (opts.print ? ' is-print' : '') + '" data-page="' + page.index + '">');
            html.push('<div class="page-band' + (final ? ' is-final' : '') + '">' + (final ? '' :
                '確認用 — 未確認の箇所を含みます（点線の枠・「音の長さ：自動」の括弧線。下の注記を参照）') + '</div>');
            if (page.index === 0) {
                var basic = F.patterns[s.basicPattern];
                html.push('<header class="sheet-head"><h1 class="sheet-title">' + esc(s.title) + '</h1>' +
                    '<p class="sheet-artist">' + esc(s.artist) + '</p>' +
                    '<div class="sheet-meta"><span>Key <b>' + esc(s.keyLabel) + '</b></span><span>Capo <b>' + (s.capo ? s.capo : 'なし') + '</b></span>' +
                    '<span>♩ = <b>' + s.bpm + '</b></span><span><b>' + s.meter.join('/') + '</b></span>' +
                    (layout.lanes.indexOf('stroke') >= 0 || layout.lanes.indexOf('tab') >= 0 ? '<span>基本ストローク <b>' + esc(basic.name) + '（サンプル）</b></span>' : '') + '</div>' +
                    (opts.print ? '' : '<button type="button" class="hit hit-meta" data-action="keycapo" style="left:0;top:58px;width:200px;height:24px" aria-label="キーとカポを変更（曲情報）"></button>' +
                        ((layout.lanes.indexOf('stroke') >= 0 || layout.lanes.indexOf('tab') >= 0) ? '<button type="button" class="hit hit-meta" data-action="basic-rhythm" style="left:260px;top:58px;width:240px;height:24px" aria-label="曲の基本ストロークを選ぶ"></button>' : '')) +
                    '</header>');
                if (layout.diagH) {
                    html.push('<div class="diagrams" aria-label="この曲のコード"><span class="diagrams-label">この曲のコード</span>');
                    layout.formLabels.diagrams.forEach(function (d) {
                        var pinned = MD.allChordEvents(s).some(function (x) {
                            var r = MD.resolveForm(s, x.ev); return r.formId === d.formId && r.state === 'pinned';
                        });
                        html.push('<span class="diagram-wrap">' + N.diagramSvg(F.forms[d.formId], d.label) +
                            '<span class="diagram-state">' + (!opts.print && pinned ? '固定を含む' : '') + '</span></span>');
                    });
                    html.push('</div>');
                }
            } else {
                html.push('<header class="sheet-head sheet-head--next"><span>' + esc(s.title) + '</span><span>' + (page.index + 1) + ' / ' + total + '</span></header>');
            }
            page.systems.forEach(function (sys, k) {
                var r = N.renderSystem(s, layout, sys, { print: opts.print, firstOfPage: k === 0 });
                html.push('<div class="system" data-sys="' + sys.index + '" style="height:' + sys.height + 'px">' + r.svg);
                if (!opts.print) html.push(hitsHtml(s, layout, sys, r.ctx));
                html.push('</div>');
                if (!opts.print && state.loupe.open && !isDocked() && sysOfBar(layout, state.loupe.barIndex) === sys.index) {
                    html.push('<div class="loupe-spacer" id="loupe-spacer" style="height:' + state.spacerH + 'px" aria-hidden="true"></div>');
                }
            });
            var notes = final ? [] : footnotesFor(page, layout.lanes, ready);
            html.push('<footer class="page-foot"><div class="page-foot-notes">' + notes.map(function (t) { return '<p>※ ' + esc(t) + '</p>'; }).join('') + '</div>' +
                '<div class="page-foot-line"><span>' + esc(F.notice) + '</span><span>' + (page.index + 1) + ' / ' + total + '</span></div></footer>');
            html.push('</section>');
        });
        return { html: html.join(''), final: final, ready: ready };
    }
    function sysOfBar(layout, barIndex) {
        for (var i = 0; i < layout.systems.length; i++) {
            if (layout.systems[i].bars.some(function (b) { return b.index === barIndex; })) return i;
        }
        return -1;
    }
    function hitsHtml(s, layout, sys, ctx) {
        var out = ['<div class="hits">'];
        var L = layout.lanes;
        var top = sys.sectionBand, h = sys.height - sys.sectionBand - 14;
        sys.bars.forEach(function (b) {
            var bar = s.bars[b.index];
            var sec = s.sections.filter(function (x) { return x.id === bar.section; })[0];
            var sel = state.loupe.open && state.loupe.barIndex === b.index;
            out.push('<button type="button" class="hit hit-bar' + (sel ? ' is-selected' : '') + '" data-bar="' + b.index + '" style="left:' + (N.PAGE.ml + b.x) +
                'px;top:' + top + 'px;width:' + b.w + 'px;height:' + h + 'px" aria-label="' + (b.index + 1) + '小節目（' + esc(sec.name) +
                (bar.chords.length ? '・' + esc(bar.chords.map(function (c) { return c.symbol; }).join(' ')) : '・コード空欄') + '）をルーペで開く"' +
                (sel ? ' aria-current="true"' : '') + '></button>');
        });
        if (L.indexOf('stroke') >= 0) {
            sys.bars.forEach(function (b) {
                out.push('<button type="button" class="hit hit-stroke" data-stroke-bar="' + b.index + '" style="left:' + (N.PAGE.ml + b.x + 2) + 'px;top:' + ctx.laneTops.stroke +
                    'px;width:' + (b.w - 4) + 'px;height:' + N.LANE_H.stroke + 'px" aria-label="' + (b.index + 1) + '小節目のストロークを選ぶ"></button>');
            });
        }
        ctx.chordBoxes.forEach(function (c) {
            out.push('<button type="button" class="hit hit-chord" data-chord-name="' + c.chordId + '" style="left:' + c.x + 'px;top:' + c.y + 'px;width:' + c.w + 'px;height:' + c.h +
                'px" aria-label="' + (c.barIndex + 1) + '小節目のコード名を編集"></button>');
            if (L.indexOf('tab') >= 0) {
                var found = MD.findChord(s, c.chordId);
                var res = MD.resolveForm(s, found.ev);
                if (res.state === 'nc') return;
                var text = res.state === 'pinned' ? '固定' : res.state === 'pending' ? '要確認' : res.state === 'missing' ? 'なし' : '';
                out.push('<button type="button" class="form-pill" data-form="' + c.chordId + '" data-state="' + res.state + '" style="left:' + (c.x + c.w + 1) + 'px;top:' + (c.y + 3) +
                    'px" aria-label="' + esc(chordPosText(found)) + ' の押さえ方（' + formStateText(res.state) + '）">' +
                    '<svg viewBox="0 0 9 10" aria-hidden="true"><path d="M1 1h7M1 4h7M1 7h7M2 0v10M4.5 0v10M7 0v10" stroke="currentColor" stroke-width="0.8" fill="none"/></svg>' +
                    (text ? '<span>' + text + '</span>' : '') + '</button>');
            }
        });
        if (L.indexOf('tab') >= 0) {
            sys.bars.forEach(function (b) {
                var bar = s.bars[b.index];
                var starts = bar.chords.length ? bar.chords : [];
                if (!starts.length) {
                    out.push('<button type="button" class="hit hit-tab" data-blank-bar="' + b.index + '" style="left:' + (N.PAGE.ml + b.x + 2) + 'px;top:' + ctx.laneTops.tab +
                        'px;width:' + (b.w - 4) + 'px;height:62px" aria-label="' + (b.index + 1) + '小節目：コードが空欄。コードを入力する"></button>');
                }
                starts.forEach(function (c, k) {
                    if (c.symbol === 'N.C.') return;
                    var x0 = N.anchorX(b, c.t) - 8, x1 = k + 1 < starts.length ? N.anchorX(b, starts[k + 1].t) - 8 : N.PAGE.ml + b.x + b.w - 3;
                    out.push('<button type="button" class="hit hit-tab" data-form="' + c.id + '" style="left:' + x0 + 'px;top:' + ctx.laneTops.tab +
                        'px;width:' + (x1 - x0) + 'px;height:62px" aria-label="' + (b.index + 1) + '小節目 ' + esc(c.symbol) + ' のTAB：押さえ方を選ぶ"></button>');
                });
            });
        }
        out.push('</div>');
        return out.join('');
    }

    function renderPaper() {
        var s = song();
        var L = lanes();
        var layout = N.layoutScore(s, { lanes: L, barsTarget: state.barsTarget });
        state.layout = layout;
        var active = document.activeElement;
        var focusKey = active && active.closest && active.closest('#paper-scale') ? focusKeyOf(active) : null;
        var built = buildPages(s, layout, { print: false });
        $('paper-scale').innerHTML = built.html;
        applyZoom();
        if (focusKey) restoreFocus(focusKey);
        return built;
    }
    function focusKeyOf(el) {
        var attrs = ['data-bar', 'data-form', 'data-chord-name', 'data-stroke-bar', 'data-blank-bar', 'data-action'];
        for (var i = 0; i < attrs.length; i++) if (el.hasAttribute(attrs[i])) return '[' + attrs[i] + '="' + el.getAttribute(attrs[i]) + '"]' + (el.classList.contains('form-pill') ? '.form-pill' : '');
        return null;
    }
    function restoreFocus(key) {
        var el = $('paper-scale').querySelector(key);
        if (el) el.focus({ preventScroll: true });
    }
    function applyZoom() {
        var z = computeZoom();
        state.z = z;
        var scaleEl = $('paper-scale');
        scaleEl.style.transform = 'scale(' + z + ')';
        $('paper-box').style.width = (N.PAGE.w * z) + 'px';
        $('paper-box').style.height = (scaleEl.offsetHeight * z) + 'px';
    }

    // ---------------------------------------------------------------- Toolbar / 状態
    function renderToolbar() {
        var s = song();
        $('song-name').textContent = s.title;
        $('style-name').textContent = MD.STYLES[state.style].label;
        var u = $('undo'), r = $('redo');
        u.disabled = !state.history.length; r.disabled = !state.future.length;
        u.title = state.history.length ? '元に戻す：' + state.history[state.history.length - 1].label + '（⌘Z）' : '元に戻す（⌘Z）';
        r.title = state.future.length ? 'やり直す：' + state.future[state.future.length - 1].label + '（⇧⌘Z）' : 'やり直す（⇧⌘Z）';
        var save = $('save-state');
        save.textContent = state.dirty ? '未保存の変更（模擬）' : '変更なし';
        save.classList.toggle('is-dirty', state.dirty);
    }
    function renderReadiness() {
        var ready = MD.readiness(song());
        var outs = MD.outputsFor(lanes(), ready);
        var html = outs.map(function (o) {
            var r = o.r;
            var mark = r.state === 'ok' ? '✓' : r.state === 'review' ? '△' : '×';
            var word = r.state === 'ok' ? '生成可能' : r.state === 'review' ? '要確認' : '生成不可';
            var detail = '';
            if (r.state === 'review') {
                var auto = r.items.filter(function (x) { return x.kind === 'auto-duration'; })[0];
                var others = r.items.filter(function (x) { return x.kind !== 'auto-duration'; }).length;
                detail = auto ? '自動の音価 ' + auto.bars.length + '小節' : others + 'か所';
            }
            return '<button type="button" class="ready-item" data-state="' + r.state + '" data-output="' + o.id + '">' +
                '<span class="ready-mark" aria-hidden="true">' + mark + '</span><span>' + o.label + '</span><b>' + word + '</b>' +
                (detail ? '<span class="ready-caption">' + detail + ' ›</span>' : (r.state === 'unavailable' ? '<span class="ready-caption">理由 ›</span>' : '')) + '</button>';
        }).join('');
        $('readiness').innerHTML = html;
    }
    function renderPrompt() {
        var s = song();
        var el = $('prompt');
        var blank = MD.readiness(s).tab.items.filter(function (x) { return x.kind === 'blank'; });
        var show = blank.length && !s.emptyChordRule && !state.promptDismissed && lanes().indexOf('tab') >= 0;
        el.hidden = !show;
        if (!show) return;
        el.innerHTML = '<span>' + (blank[0].barIndex + 1) + '小節目のコードが空欄です。この曲では、空欄の小節を「前のコードを続ける」として扱いますか？</span>' +
            '<button type="button" class="pop-button is-primary" data-prompt="carry">続ける（曲の規則にする）</button>' +
            '<button type="button" class="pop-button" data-prompt="later">あとで</button>' +
            '<span class="ready-caption">「N.C.」はルーペのコード欄に入力すると「弾かない」になります。</span>';
    }

    // ---------------------------------------------------------------- ルーペ（常設DOM）
    var loupeEls = null;
    function buildLoupe() {
        var ruler = $('loupe-ruler');
        for (var i = 0; i < 16; i++) {
            var span = document.createElement('span');
            span.textContent = i % 4 === 0 ? (i / 4 + 1) + '拍' : (i % 2 === 0 ? '＋' : '');
            if (i % 4 === 0) span.className = 'is-beat';
            ruler.appendChild(span);
        }
        var chords = [], forms = [], strokes = [], lyrics = [], notes = [];
        for (var b = 0; b < 4; b++) {
            var inp = document.createElement('input');
            inp.className = 'lg-cell-input is-chord'; inp.id = 'lc-' + b; inp.dataset.beat = String(b);
            inp.setAttribute('aria-label', (b + 1) + '拍目のコード'); inp.autocomplete = 'off'; inp.spellcheck = false;
            inp.style.gridColumn = (b * 4 + 1) + ' / span 4';
            $('loupe-chords').appendChild(inp); chords.push(inp);
            var fb = document.createElement('button');
            fb.type = 'button'; fb.className = 'lg-form lg-hidden';
            $('loupe-forms').appendChild(fb); forms.push(fb);
        }
        for (var k = 0; k < 16; k++) {
            var sb = document.createElement('button');
            sb.type = 'button'; sb.className = 'lg-stroke' + (k % 4 === 0 ? ' is-beat' : ''); sb.dataset.slot = String(k);
            $('loupe-strokes').appendChild(sb); strokes.push(sb);
            var li = document.createElement('input');
            li.className = 'lg-cell-input lg-hidden'; li.autocomplete = 'off'; li.spellcheck = false;
            $('loupe-lyrics').appendChild(li); lyrics.push(li);
            var nb = document.createElement('button');
            nb.type = 'button'; nb.className = 'lg-note lg-hidden'; nb.setAttribute('aria-pressed', 'false');
            $('loupe-melody').appendChild(nb); notes.push(nb);
        }
        loupeEls = { chords: chords, forms: forms, strokes: strokes, lyrics: lyrics, notes: notes };
        var composing = false;
        $('loupe').addEventListener('compositionstart', function () { composing = true; });
        $('loupe').addEventListener('compositionend', function () { composing = false; });
        chords.forEach(function (inp) {
            inp.addEventListener('change', function () { applyChordEdit(state.loupe.barIndex, Number(inp.dataset.beat), inp.value.trim()); });
            inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing && !composing) inp.blur(); });
        });
        lyrics.forEach(function (inp) {
            inp.addEventListener('change', function () { if (inp.dataset.note) applyLyricEdit(state.loupe.barIndex, inp.dataset.note, inp.value); });
            inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing && !composing) inp.blur(); });
        });
        forms.forEach(function (fb) { fb.addEventListener('click', function () { openFormPanel(fb.dataset.chord, fb); }); });
        strokes.forEach(function (sb) { sb.addEventListener('click', function () { cycleStroke(state.loupe.barIndex, Number(sb.dataset.slot)); }); });
        notes.forEach(function (nb) {
            nb.addEventListener('click', function () {
                state.loupe.selectedNote = nb.dataset.key;
                fillLoupe();
            });
        });
        $('loupe-prev').addEventListener('click', function () { moveBar(-1); });
        $('loupe-next').addEventListener('click', function () { moveBar(1); });
        $('loupe-close').addEventListener('click', closeLoupe);
        Array.prototype.forEach.call(document.querySelectorAll('[data-res]'), function (b) {
            b.addEventListener('click', function () { state.loupe.res = Number(b.dataset.res); fillLoupe(); positionLoupe(); });
        });
        Array.prototype.forEach.call(document.querySelectorAll('#loupe-dur-tools [data-dur]'), function (b) {
            b.addEventListener('click', function () { applyDuration(Number(b.dataset.dur)); });
        });
        $('loupe-rest-confirm').addEventListener('click', confirmRest);
        $('loupe-confirm').addEventListener('click', confirmDurations);
    }
    function melodySeq(bar) {
        var items = bar.melody.slice().sort(function (a, b) { return a.t - b.t; });
        var seq = [], cursor = 0;
        items.forEach(function (it) {
            if (it.t > cursor) seq.push({ key: 'gap-' + cursor, rest: 'derived', t: cursor, d: it.t - cursor });
            seq.push({ key: it.id, rest: it.rest ? 'explicit' : null, t: it.t, d: it.d, note: it });
            cursor = it.t + it.d;
        });
        if (cursor < M.BAR) seq.push({ key: 'gap-' + cursor, rest: 'derived', t: cursor, d: M.BAR - cursor });
        return seq;
    }
    var DUR_NAME = { 120: '16分', 240: '8分', 360: '付点8分', 480: '4分', 720: '付点4分', 960: '2分', 1440: '付点2分', 1920: '全' };
    function fillLoupe() {
        if (!loupeEls) return;
        var s = song(), i = state.loupe.barIndex, bar = s.bars[i];
        var sec = s.sections.filter(function (x) { return x.id === bar.section; })[0];
        $('loupe-title').textContent = (i + 1) + '小節目';
        $('loupe-section').textContent = sec.name;
        $('loupe-prev').disabled = i === 0;
        $('loupe-next').disabled = i === s.bars.length - 1;
        // コード（拍ごと。値の更新だけ。フォーカス中の入力欄は書き換えない）
        loupeEls.chords.forEach(function (inp, b) {
            var ev = bar.chords.filter(function (c) { return c.t === b * 480; })[0];
            if (document.activeElement !== inp) inp.value = ev ? ev.symbol : '';
            inp.placeholder = b === 0 && !bar.chords.length ? '空欄' : '';
        });
        loupeEls.forms.forEach(function (fb, k) {
            var ev = bar.chords[k];
            if (!ev || ev.symbol === 'N.C.') { fb.classList.add('lg-hidden'); return; }
            var res = MD.resolveForm(s, ev);
            fb.classList.remove('lg-hidden');
            fb.dataset.chord = ev.id; fb.dataset.state = res.state;
            fb.style.gridColumn = (ev.t / 120 + 1) + ' / span 4';
            fb.textContent = ev.symbol + ' の押さえ方：' + (res.state === 'auto' ? 'おすすめ' : res.state === 'pinned' ? '固定 ' + cagedText(res.form) : res.state === 'pending' ? '要確認' : '未取得');
            fb.setAttribute('aria-label', (ev.t / 480 + 1) + '拍目 ' + ev.symbol + ' の押さえ方を選ぶ（' + formStateText(res.state) + '）');
        });
        // ストローク
        var eff = MD.effectivePattern(s, bar);
        var byT = {};
        eff.pattern.events.forEach(function (e) { byT[e.t] = e; });
        var need16 = eff.pattern.events.some(function (e) { return e.t % 240 !== 0; });
        var res16 = state.loupe.res === 16 || need16;
        Array.prototype.forEach.call(document.querySelectorAll('[data-res]'), function (b) {
            b.setAttribute('aria-pressed', String(Number(b.dataset.res) === (res16 ? 16 : 8)));
            b.disabled = need16 && b.dataset.res === '8';
        });
        loupeEls.strokes.forEach(function (sb, k) {
            var t = k * 120, e = byT[t];
            var visible = res16 || k % 2 === 0;
            sb.classList.toggle('lg-hidden', !visible);
            sb.style.gridColumn = (k + 1) + ' / span ' + (res16 ? 1 : 2);
            sb.textContent = e ? N.strokeSymbol(e) : '';
            sb.dataset.kind = e ? e.kind : 'none';
            sb.setAttribute('aria-label', (Math.floor(k / 4) + 1) + '拍目 ' + ['頭', '16分目', '裏', '16分目'][k % 4] + '：' + (e ? strokeWord(e) : '記号なし') + '（クリックで切り替え）');
        });
        $('loupe-stroke-state').textContent = eff.inherited ? '曲の基本：' + eff.pattern.name : 'この小節だけ';
        // 歌詞（音の位置に入力欄を置く。要素は使い回す）
        var notesOnly = bar.melody.filter(function (x) { return !x.rest; }).sort(function (a, b) { return a.t - b.t; });
        loupeEls.lyrics.forEach(function (inp, k) {
            var n = notesOnly[k];
            if (!n) { inp.classList.add('lg-hidden'); inp.dataset.note = ''; return; }
            inp.classList.remove('lg-hidden');
            inp.dataset.note = n.id;
            inp.style.gridColumn = (n.t / 120 + 1) + ' / span ' + Math.max(1, n.d / 120);
            if (document.activeElement !== inp) inp.value = n.ly;
            inp.setAttribute('aria-label', (n.t / 480 + 1).toFixed(2).replace(/\.00$/, '') + '拍目の歌詞');
        });
        // メロディ（音の長さ）
        var seq = melodySeq(bar);
        loupeEls.notes.forEach(function (nb, k) {
            var it = seq[k];
            if (!it) { nb.classList.add('lg-hidden'); return; }
            nb.classList.remove('lg-hidden');
            nb.dataset.key = it.key;
            nb.style.gridColumn = (it.t / 120 + 1) + ' / span ' + Math.max(1, it.d / 120);
            var label = it.rest ? (it.rest === 'explicit' ? '休み' : '（休み）') :
                M.doremiLabel(M.parsePitch(it.note.p), s.key) + ' ' + it.note.p;
            nb.textContent = label + ' · ' + (DUR_NAME[it.d] || it.d + 'tick');
            if (it.rest) nb.dataset.rest = it.rest; else nb.removeAttribute('data-rest');
            nb.setAttribute('aria-pressed', String(state.loupe.selectedNote === it.key));
            nb.setAttribute('aria-label', (it.rest === 'derived' ? '音のない時間（自動の休み）' : it.rest ? '休符' : it.note.p) + '、' + (DUR_NAME[it.d] || it.d) +
                (bar.durState === 'auto' ? '、音の長さは自動（未確認）' : ''));
        });
        $('loupe-dur-state').textContent = !bar.melody.length ? 'メロディなし' : bar.durState === 'auto' ? '音の長さ：自動（未確認）' : '確認済み';
        var sel = seq.filter(function (x) { return x.key === state.loupe.selectedNote; })[0];
        $('loupe-dur-selected').textContent = sel ? '選択中：' + (sel.rest ? (sel.rest === 'derived' ? '音のない時間' : '休符') : sel.note.p) + '（' + (DUR_NAME[sel.d] || sel.d) + '）' : '音を選ぶと長さを変えられます';
        Array.prototype.forEach.call(document.querySelectorAll('#loupe-dur-tools [data-dur]'), function (b) { b.disabled = !sel || !!sel.rest; });
        $('loupe-rest-confirm').disabled = !sel || sel.rest !== 'derived';
        $('loupe-confirm').disabled = !bar.melody.length || bar.durState !== 'auto';
        $('loupe-doremi').value = bar.doremiText || notesOnly.map(function (n) { return M.doremiLabel(M.parsePitch(n.p), s.key); }).join('');
    }
    function strokeWord(e) {
        var d = e.dir === 'up' ? 'アップ' : 'ダウン';
        return { attack: d + 'で鳴らす', ghost: '空振り（' + d + '）', sustain: '伸ばす', rest: '休み', stop: '消音（止める）', dead: 'ブラッシング（音程なし）' }[e.kind];
    }
    function isDocked() { return window.matchMedia('(max-height: 700px)').matches; }
    function openLoupe(barIndex, focusTarget) {
        var wasOpen = state.loupe.open;
        var before = wasOpen ? anchorTopOf(state.loupe.barIndex) : null;
        state.loupe.open = true;
        if (state.loupe.barIndex !== barIndex) state.loupe.selectedNote = null;
        var prevSys = state.layout ? sysOfBar(state.layout, state.loupe.barIndex) : -1;
        state.loupe.barIndex = barIndex;
        $('loupe').hidden = false;
        fillLoupe();
        render();
        var newSys = sysOfBar(state.layout, barIndex);
        // 段が変わったら、選んだ段が画面上の同じ高さに来るようにスクロールを補正する
        if (wasOpen && before !== null && prevSys !== newSys) {
            var after = anchorTopOf(barIndex);
            $('stage').scrollTop += after - before;
            positionLoupe();
        } else ensureLoupeVisible();
        if (focusTarget) focusTarget();
    }
    function anchorTopOf(barIndex) {
        var sysEl = $('paper-scale').querySelector('.system[data-sys="' + sysOfBar(state.layout, barIndex) + '"]');
        return sysEl ? sysEl.getBoundingClientRect().top : null;
    }
    function ensureLoupeVisible() {
        var stage = $('stage'), sr = stage.getBoundingClientRect();
        var sysEl = $('paper-scale').querySelector('.system[data-sys="' + sysOfBar(state.layout, state.loupe.barIndex) + '"]');
        if (!sysEl) return;
        var top = sysEl.getBoundingClientRect().top;
        var bottom = isDocked() ? sysEl.getBoundingClientRect().bottom : $('loupe').getBoundingClientRect().bottom;
        if (top < sr.top + 8 || bottom > sr.bottom - 8) stage.scrollTop += top - sr.top - 24;
        positionLoupe();
    }
    function closeLoupe() {
        var idx = state.loupe.barIndex;
        state.loupe.open = false;
        $('loupe').hidden = true;
        render();
        var btn = $('paper-scale').querySelector('[data-bar="' + idx + '"]');
        if (btn) btn.focus({ preventScroll: true });
    }
    function moveBar(delta) {
        var next = state.loupe.barIndex + delta;
        if (next < 0 || next >= song().bars.length) return;
        openLoupe(next);
    }
    function moveSystem(delta) {
        var cur = sysOfBar(state.layout, state.loupe.barIndex);
        var target = state.layout.systems[cur + delta];
        if (!target) return;
        openLoupe(target.bars[0].index);
    }
    function positionLoupe() {
        var loupe = $('loupe');
        if (!state.loupe.open) { loupe.hidden = true; return; }
        loupe.hidden = false;
        var stage = $('stage');
        var docked = isDocked();
        loupe.classList.toggle('is-docked', docked);
        if (docked) {
            var mr = $('main').getBoundingClientRect();
            loupe.style.left = (mr.left + 8) + 'px';
            loupe.style.width = (mr.width - 16) + 'px';
            loupe.style.top = '';
            stage.style.paddingBottom = (loupe.offsetHeight + 24) + 'px';
            return;
        }
        stage.style.paddingBottom = '';
        var spacer = $('loupe-spacer');
        if (!spacer) return;
        var stageRect = stage.getBoundingClientRect();
        var boxRect = $('paper-box').getBoundingClientRect();
        var width = Math.min(Math.max(boxRect.width - 24, 560), stage.clientWidth - 16);
        var left = boxRect.left - stageRect.left + stage.scrollLeft + (boxRect.width - width) / 2;
        left = Math.max(stage.scrollLeft + 8, left);
        loupe.style.width = width + 'px';
        loupe.style.left = left + 'px';
        var needed = Math.ceil((loupe.offsetHeight + 16) / state.z);
        if (Math.abs(needed - state.spacerH) > 1) {
            state.spacerH = needed;
            spacer.style.height = needed + 'px';
            $('paper-box').style.height = ($('paper-scale').offsetHeight * state.z) + 'px';
        }
        var spRect = spacer.getBoundingClientRect();
        loupe.style.top = (spRect.top - stageRect.top + stage.scrollTop + 8 * state.z) + 'px';
    }

    // ---------------------------------------------------------------- 編集（模擬）
    function applyChordEdit(barIndex, beat, value) {
        var s = song(), bar = s.bars[barIndex];
        var t = beat * 480;
        var ev = bar.chords.filter(function (c) { return c.t === t; })[0];
        if ((ev ? ev.symbol : '') === value) return;
        var label = (barIndex + 1) + '小節目' + (beat + 1) + '拍目のコードを' + (value || '空欄') + 'に';
        pushHistory(label);
        bar = song().bars[barIndex];
        if (!value) {
            bar.chords = bar.chords.filter(function (c) { return c.t !== t; });
            if (ev) delete song().formBindings[ev.id];
        } else if (ev) {
            // 同じコードイベント（IDは維持）。固定済みの押さえ方は残し、合わなければ要確認になる
            bar.chords.forEach(function (c) { if (c.t === t) c.symbol = value; });
        } else {
            chordSerial += 1;
            bar.chords.push({ id: 'cx' + chordSerial, t: t, symbol: value });
            bar.chords.sort(function (a, b) { return a.t - b.t; });
        }
        status(label + 'しました（模擬）');
        render();
        fillLoupe();
    }
    function applyLyricEdit(barIndex, noteId, value) {
        var bar = song().bars[barIndex];
        var n = bar.melody.filter(function (x) { return x.id === noteId; })[0];
        if (!n || n.ly === value) return;
        pushHistory((barIndex + 1) + '小節目の歌詞');
        n = song().bars[barIndex].melody.filter(function (x) { return x.id === noteId; })[0];
        n.ly = value;
        render();
    }
    var CYCLE = ['attack', 'ghost', 'sustain', 'rest', 'stop', 'dead', 'none'];
    function cycleStroke(barIndex, slot) {
        var s = song(), bar = s.bars[barIndex];
        var eff = MD.effectivePattern(s, bar);
        var events = clone(eff.pattern.events);
        var t = slot * 120;
        var cur = events.filter(function (e) { return e.t === t; })[0];
        var kind = cur ? cur.kind : 'none';
        var nextKind = CYCLE[(CYCLE.indexOf(kind) + 1) % CYCLE.length];
        var dir = slot % 2 === 0 ? 'down' : 'up';
        events = events.filter(function (e) { return e.t !== t; });
        if (nextKind !== 'none') events.push(nextKind === 'attack' || nextKind === 'ghost' || nextKind === 'dead' ? { t: t, kind: nextKind, dir: dir } : { t: t, kind: nextKind });
        events.sort(function (a, b) { return a.t - b.t; });
        pushHistory((barIndex + 1) + '小節目のストローク（マス目）');
        s = song();
        s.customPatterns = s.customPatterns || {};
        s.customPatterns['custom:' + bar.id] = { name: 'この小節だけ（マス目で編集）', grid: 120, events: events };
        s.bars[barIndex].strum = 'custom:' + bar.id;
        status((barIndex + 1) + '小節目のストロークを「' + strokeWord(Object.assign({ dir: dir }, { kind: nextKind === 'none' ? 'rest' : nextKind })) + '」に（この小節だけ・模擬）');
        render();
        fillLoupe();
    }
    function applyDuration(dur) {
        var s = song(), i = state.loupe.barIndex, bar = s.bars[i];
        var key = state.loupe.selectedNote;
        var notes = bar.melody.slice().sort(function (a, b) { return a.t - b.t; });
        var idx = -1;
        notes.forEach(function (n, k) { if (n.id === key) idx = k; });
        if (idx < 0) return;
        var target = notes[idx];
        var delta = dur - target.d;
        if (!delta) return;
        // 後ろの音を詰める／押し出す。小節に収まらなければ拒否（丸めない）
        var lastEnd = notes.length ? notes[notes.length - 1].t + notes[notes.length - 1].d : 0;
        if (lastEnd + delta > M.BAR) { status('小節に収まりません。長さは変更していません（丸めません）'); return; }
        try { M.segment(target.t, dur); } catch (e) { status('この位置ではその長さを書けません（拍の途中を越える付点など）。変更していません'); return; }
        pushHistory((i + 1) + '小節目 ' + target.p + ' の長さを' + DUR_NAME[dur] + 'に');
        bar = song().bars[i];
        var list = bar.melody.slice().sort(function (a, b) { return a.t - b.t; });
        var ok = true;
        list.forEach(function (n, k) {
            if (k === idx) n.d = dur;
            if (k > idx) { n.t += delta; try { M.segment(n.t, n.d); } catch (e) { ok = false; } }
        });
        if (!ok) { restore(state.history.pop().snap); status('後ろの音が拍の途中で書けない位置になるため、変更していません'); render(); fillLoupe(); return; }
        status((i + 1) + '小節目 ' + target.p + ' を' + DUR_NAME[dur] + 'にしました（模擬）。確認するまで「自動」の印は残ります');
        render(); fillLoupe();
    }
    function confirmRest() {
        var i = state.loupe.barIndex, bar = song().bars[i];
        var seq = melodySeq(bar).filter(function (x) { return x.key === state.loupe.selectedNote; })[0];
        if (!seq || seq.rest !== 'derived') return;
        pushHistory((i + 1) + '小節目の休み');
        bar = song().bars[i];
        chordSerial += 1;
        bar.melody.push({ id: 'rx' + chordSerial, rest: true, explicit: true, t: seq.t, d: seq.d });
        state.loupe.selectedNote = 'rx' + chordSerial;
        status((i + 1) + '小節目の音のない時間を「休符」として確定しました（模擬）');
        render(); fillLoupe();
    }
    function confirmDurations() {
        var i = state.loupe.barIndex;
        if (song().bars[i].durState !== 'auto') return;
        pushHistory((i + 1) + '小節目の音の長さを確認');
        song().bars[i].durState = 'confirmed';
        status((i + 1) + '小節目の音の長さを確認済みにしました（模擬）');
        render(); fillLoupe();
    }

    // ---------------------------------------------------------------- メニュー
    var menuAnchor = null;
    function openMenu(anchor, items) {
        closePopover();
        var menu = $('menu');
        menu.innerHTML = items.map(function (it, k) {
            if (it.sep) return '<div class="menu-sep" role="separator"></div>';
            if (it.heading) return '<div class="menu-heading">' + esc(it.heading) + '</div>';
            return '<button type="button" class="menu-item" role="' + (it.checked !== undefined ? 'menuitemradio' : 'menuitem') + '" data-k="' + k + '"' +
                (it.checked !== undefined ? ' aria-checked="' + it.checked + '"' : '') + (it.disabled ? ' disabled' : '') + '>' +
                '<span>' + esc(it.label) + '</span>' + (it.note ? '<small>' + esc(it.note) + '</small>' : '') + '</button>';
        }).join('');
        menu.hidden = false;
        var r = anchor.getBoundingClientRect();
        menu.style.top = (r.bottom + 6) + 'px';
        menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
        menuAnchor = anchor;
        anchor.setAttribute('aria-expanded', 'true');
        menu.onclick = function (e) {
            var b = e.target.closest('.menu-item');
            if (!b || b.disabled) return;
            var it = items[Number(b.dataset.k)];
            closeMenu();
            it.run();
        };
        var first = menu.querySelector('.menu-item:not(:disabled)');
        if (first) first.focus();
    }
    function closeMenu() {
        var menu = $('menu');
        if (menu.hidden) return;
        menu.hidden = true;
        if (menuAnchor) { menuAnchor.setAttribute('aria-expanded', 'false'); menuAnchor.focus(); menuAnchor = null; }
    }
    function styleMenu() {
        var defs = [
            ['chord', 'コード・ストローク・歌詞・ドレミ（現行のStructureに近い）'],
            ['melody', 'コード・メロディ（歌）五線・歌詞'],
            ['guitar', 'コード・ストローク・ギター伴奏TAB'],
            ['singer', 'コード・メロディ五線・歌詞・ストローク・ギター伴奏TAB'],
            ['custom', '段を選んで組み合わせる（ギター伴奏五線も選べる）']
        ];
        openMenu($('style-menu-button'), defs.map(function (d) {
            return { label: MD.STYLES[d[0]].label, note: d[1], checked: state.style === d[0], run: function () { setStyle(d[0]); if (d[0] === 'custom') openCustomPanel($('style-menu-button')); } };
        }));
    }
    function setStyle(id) {
        if (state.style === id) return;
        pushHistory('譜面スタイルを' + MD.STYLES[id].label + 'に');
        state.style = id;
        status('譜面スタイルを「' + MD.STYLES[id].label + '」にしました（譜面スタイルは曲の記譜指定として履歴に入ります）');
        render();
    }
    function songMenu() {
        openMenu($('song-menu-button'), [
            { heading: '固定サンプル' },
            { label: '朝のひかり（12小節）', checked: state.songId === 'main', run: function () { switchSong('main'); } },
            { label: '高密度サンプル（4小節）', note: '長い歌詞・1小節4コード・16分の密集', checked: state.songId === 'dense', run: function () { switchSong('dense'); } },
            { sep: true },
            { label: '新しい曲', note: '準備中（このモックでは作成しません）', disabled: true, run: function () {} },
            { heading: 'ファイル／バックアップ' },
            { label: 'バックアップを書き出す', note: '準備中（このモックでは書き出しません）', disabled: true, run: function () {} },
            { label: 'バックアップを読み込む', note: '準備中（このモックでは読み込みません）', disabled: true, run: function () {} }
        ]);
    }
    function switchSong(id) {
        state.songId = id; state.loupe.open = false; state.loupe.barIndex = 0; $('loupe').hidden = true; state.bulk = null;
        render();
    }
    function outputMenu() {
        var ready = MD.readiness(song());
        var L = lanes();
        var final = MD.isFinal(L, ready);
        var count = MD.outputsFor(L, ready).reduce(function (n, o) { return n + (o.r.state === 'ok' ? 0 : o.r.items.length); }, 0);
        var items = [
            { heading: '印刷（プロトタイプの見た目の確認）' },
            final ? { label: '印刷プレビュー（完成譜）', note: '表示中の全出力が確認済み', run: function () { openPrintPreview(null); } }
                : { label: '確認用として印刷プレビュー', note: '未確認の箇所 ' + count + '件を点線・注記付きで印刷', run: function () { openPrintPreview(null); } }
        ];
        if (L.indexOf('tab') >= 0) {
            var noTab = L.filter(function (x) { return x !== 'tab' && x !== 'stroke'; });
            var noTabFinal = MD.isFinal(noTab, ready);
            items.push({ label: 'ギター（ストローク・TAB）を除いて印刷プレビュー', note: noTabFinal ? 'TAB以外は確認済み。完成譜として印刷できます' : 'TAB以外にも未確認の箇所があります（確認用）', run: function () { openPrintPreview(noTab); } });
        }
        items.push({ sep: true });
        items.push({ label: 'MIDI書き出し（Pre-DTM）', note: '現行Pre-DTMのMIDIは新しい演奏モデルとは別。このモックでは対象外', disabled: true, run: function () {} });
        openMenu($('output-menu-button'), items);
    }

    // ---------------------------------------------------------------- ポップオーバー（非モーダル）
    function openPopover(anchor, build, opts) {
        closeMenu();
        var pop = $('popover');
        state.popover = { anchor: anchor, build: build, refresh: function () { fill(false); } };
        pop.classList.toggle('is-wide', !!(opts && opts.wide));
        function fill(first) {
            pop.innerHTML = build();
            pop.hidden = false;
            place();
            if (first) {
                var f = pop.querySelector('[data-autofocus]') || pop.querySelector('button:not(:disabled), input, select');
                if (f) f.focus({ preventScroll: true });
            }
        }
        function place() {
            if (window.matchMedia('(max-width: 800px)').matches) { pop.style.left = ''; pop.style.top = ''; return; }
            var r = anchor && anchor.isConnected ? anchor.getBoundingClientRect() : { left: window.innerWidth / 2 - 220, bottom: 120, top: 120 };
            var w = pop.offsetWidth, h = pop.offsetHeight;
            var insp = $('inspector');
            var maxRight = !insp.hidden && window.innerWidth >= 1280 ? insp.getBoundingClientRect().left - 12 : window.innerWidth - 12;
            var left = Math.max(12, Math.min(r.left, maxRight - w));
            var top = r.bottom + 8;
            if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 8);
            if (top + h > window.innerHeight - 12) top = Math.max(12, window.innerHeight - h - 12);
            pop.style.left = left + 'px'; pop.style.top = top + 'px';
        }
        state.popover.place = place;
        fill(true);
    }
    function closePopover(returnFocus) {
        var pop = $('popover');
        if (pop.hidden) return;
        var anchor = state.popover && state.popover.anchor;
        pop.hidden = true; pop.innerHTML = '';
        state.popover = null; state.bulkConfirm = false;
        if (returnFocus && anchor && anchor.isConnected) anchor.focus({ preventScroll: true });
    }

    // コードフォーム
    function openFormPanel(chordId, anchor) {
        var found0 = MD.findChord(song(), chordId);
        if (!found0) return;
        if (!state.bulk || state.bulk.chordId !== chordId) state.bulk = null;
        state.inspector.chordId = chordId;
        if (state.inspector.open) { state.inspector.mode = 'chord'; renderInspector(); }
        openPopover(anchor, function () { return formPanelHtml(chordId); });
    }
    function formPanelHtml(chordId) {
        var s = song();
        var found = MD.findChord(s, chordId);
        if (!found) return '<p>このコードは削除されました。</p>';
        var ev = found.ev, res = MD.resolveForm(s, ev);
        var recId = F.recommended[ev.symbol];
        var out = [];
        out.push('<div class="pop-head"><div><h2>' + esc(chordPosText(found)) + ' の押さえ方</h2><p>変更は<b>このコードだけ</b>に適用されます（既定）。コード名の変更はルーペのコード欄で行います。</p></div>' +
            '<button type="button" class="pop-close" data-pop="close" aria-label="閉じる">×</button></div>');
        if (res.state === 'pending') {
            out.push('<div class="pending-note" role="note"><p><span class="state-chip" data-state="pending">要確認</span> <span class="state-chip" data-state="pinned">固定</span></p>' +
                '<p>コードが ' + esc(res.form.chord) + ' → ' + esc(ev.symbol) + ' に変わりました。前に選んだ押さえ方（' + esc(res.form.chord) + '・' + esc(cagedText(res.form)) + '）は、このコードに合いません。</p>' +
                '<p class="insp-note">前の押さえ方は消さずに残しています。自動では置き換えません。TABには推測した数字を書かず「押さえ方を確認」と表示しています。</p>' +
                '<div class="pop-current">' + diagramHtml(res.form, res.form.chord, '前の押さえ方') +
                (recId ? diagramHtml(F.forms[recId], ev.symbol, 'おすすめ案') + '<span class="insp-note">おすすめ案はまだ採用していません</span>' : '') + '</div>' +
                '<div class="pop-actions">' + (recId ? '<button type="button" class="pop-button is-primary" data-pop="adopt-rec" data-autofocus>おすすめ（' + esc(ev.symbol) + '）にする</button>' : '') +
                '<button type="button" class="pop-button" disabled title="準備中">押さえ方を直す（準備中）</button>' +
                '<button type="button" class="pop-button" data-pop="close">あとで</button></div></div>');
            return out.join('');
        }
        if (res.state === 'missing') {
            out.push('<div class="pending-note"><p>' + esc(ev.symbol) + ' の押さえ方は、このモックのおすすめ表にありません。TABは「押さえ方なし」と表示し、数字を推測しません。</p>' +
                '<p class="insp-note">正式版ではChord Cruiseの推奨処理から候補を取得します（工程3）。</p></div>');
            return out.join('');
        }
        out.push('<div class="pop-section" style="border-top:0;margin-top:0;padding-top:0"><h3>現在</h3><div class="pop-current">' +
            diagramHtml(res.form, ev.symbol) + '<div><span class="state-chip" data-state="' + res.state + '">' + formStateText(res.state) + '</span>' +
            '<p class="insp-note">' + esc(cagedText(res.form)) + '<br>' + esc(res.binding ? res.binding.note : 'おすすめ（固定サンプル。Chord Cruise接続前）') +
            (res.binding && res.binding.originDeleted ? '<br>元の本棚項目は削除済み。曲の中のコピーなので使い続けられます。' : '') + '</p>' +
            (res.state === 'pinned' && recId ? '<button type="button" class="pop-button" data-pop="adopt-rec">おすすめに戻す（このコードだけ）</button>' : '') + '</div></div></div>');
        var cands = F.cagedCandidates[ev.symbol];
        out.push('<div class="pop-section"><h3>形を変える（CAGED候補・このコードだけ）</h3>');
        if (cands) {
            out.push('<div class="candidates">' + cands.map(function (id) {
                var f = F.forms[id];
                var pressed = res.formId === id;
                return '<button type="button" class="cand" data-pop="cand" data-form-id="' + id + '" aria-pressed="' + pressed + '" aria-label="' + esc(cagedText(f)) + (id === recId ? '（おすすめ）' : '') + 'にする">' +
                    diagramHtml(f, f.caged + '型') + '<span>' + esc(f.position) + '</span><small>' + (id === recId ? 'おすすめ' : '&nbsp;') + '</small></button>';
            }).join('') + '</div>');
        } else out.push('<p class="insp-note">このモックではCAGED候補を C のコードだけに用意しています。</p>');
        out.push('</div>');
        out.push('<div class="pop-section"><h3>ほかの入口</h3><div class="pop-actions">' +
            '<button type="button" class="pop-button" disabled>コード本棚から選ぶ — 準備中（利用範囲が未決）</button>' +
            '<button type="button" class="pop-button" disabled>押さえ方を直す（指板） — 準備中</button>' +
            '<button type="button" class="pop-button" data-pop="inspector">Inspectorで詳しく見る</button></div></div>');
        if (state.bulk && state.bulk.chordId === chordId) out.push(bulkHtml(chordId));
        return out.join('');
    }
    function bulkTargets(chordId) {
        var s = song(), source = MD.findChord(s, chordId);
        var sourceRes = MD.resolveForm(s, source.ev);
        var auto = [], pinned = [];
        MD.sameChordEvents(s, chordId).forEach(function (x) {
            var r = MD.resolveForm(s, x.ev);
            if (r.formId === sourceRes.formId && r.state === sourceRes.state) return;
            (r.state === 'pinned' || r.state === 'pending' ? pinned : auto).push(x);
        });
        return { auto: auto, pinned: pinned, form: sourceRes };
    }
    function bulkHtml(chordId) {
        var s = song(), found = MD.findChord(s, chordId);
        var t = bulkTargets(chordId);
        var formText = t.form.state === 'auto' ? 'おすすめ' : cagedText(t.form.form);
        if (!t.auto.length && !t.pinned.length) return '<div class="bulk"><p>✓ ' + esc(chordPosText(found)) + ' を ' + esc(formText) + ' にしました。同じコードはほかにありません。</p></div>';
        var out = ['<div class="bulk" role="group" aria-label="同じコードへの一括適用"><p>✓ ' + esc(chordPosText(found)) + ' を <b>' + esc(formText) + '</b> にしました。</p>'];
        if (t.auto.length) out.push('<button type="button" class="pop-button is-primary" data-pop="bulk">同じコードにも適用（ほか' + t.auto.length + 'か所：' +
            t.auto.map(function (x) { return (x.barIndex + 1) + '小節'; }).join('・') + '）</button>');
        if (t.pinned.length) {
            out.push('<p class="bulk-excluded">固定済みの ' + t.pinned.length + 'か所（' + t.pinned.map(function (x) { return (x.barIndex + 1) + '小節'; }).join('・') +
                '）は対象外です。自動では変更しません。</p>');
            out.push(state.bulkConfirm
                ? '<p>固定した押さえ方 ' + t.pinned.length + 'か所も ' + esc(formText) + ' に変更します。</p><div class="pop-actions"><button type="button" class="pop-button is-primary" data-pop="bulk-pinned">固定済みも変更する</button><button type="button" class="pop-button" data-pop="bulk-cancel">やめる</button></div>'
                : '<button type="button" class="pop-button" data-pop="bulk-ask">固定済みも含めて変更…</button>');
        }
        out.push('</div>');
        return out.join('');
    }
    function setBinding(s, chordId, formId, source, note) {
        var ev = MD.findChord(s, chordId).ev;
        if (formId === F.recommended[ev.symbol]) delete s.formBindings[chordId];
        else s.formBindings[chordId] = { formId: formId, pinned: true, source: source, note: note };
    }
    function popoverAction(action, el) {
        var pop = state.popover;
        var chordId = state.inspector.chordId;
        if (action === 'close') { closePopover(true); return; }
        if (action === 'inspector') { openInspector('chord'); return; }
        if (action === 'cand') {
            var found = MD.findChord(song(), chordId);
            var formId = el.dataset.formId;
            if (MD.resolveForm(song(), found.ev).formId === formId) return;
            pushHistory((found.barIndex + 1) + '小節目 ' + found.ev.symbol + ' の押さえ方');
            setBinding(song(), chordId, formId, 'caged', 'CAGED候補から選択');
            state.bulk = { chordId: chordId }; state.bulkConfirm = false;
            status((found.barIndex + 1) + '小節目の ' + found.ev.symbol + ' を ' + cagedText(F.forms[formId]) + ' にしました（このコードだけ・模擬）');
            afterMutation();
            var focusBtn = $('popover').querySelector('[data-pop="bulk"]') || $('popover').querySelector('[data-form-id="' + formId + '"]');
            if (focusBtn) focusBtn.focus();
            return;
        }
        if (action === 'adopt-rec') {
            var f2 = MD.findChord(song(), chordId);
            pushHistory((f2.barIndex + 1) + '小節目 ' + f2.ev.symbol + ' をおすすめに');
            delete song().formBindings[chordId];
            state.bulk = { chordId: chordId };
            status((f2.barIndex + 1) + '小節目の ' + f2.ev.symbol + ' をおすすめの押さえ方にしました（明示操作・模擬）');
            afterMutation();
            return;
        }
        if (action === 'bulk' || action === 'bulk-pinned') {
            var t = bulkTargets(chordId);
            var list = action === 'bulk' ? t.auto : t.pinned;
            var src = MD.findChord(song(), chordId);
            pushHistory('同じコード（' + src.ev.symbol + '）' + list.length + 'か所に一括適用' + (action === 'bulk-pinned' ? '（固定済みを含む）' : ''));
            list.forEach(function (x) { setBinding(song(), x.ev.id, t.form.formId, 'bulk', '同じコードへの一括適用（' + (src.barIndex + 1) + '小節目から）'); });
            state.bulkConfirm = false;
            status(list.length + 'か所に一括適用しました（Undo 1回で戻せます・模擬）');
            afterMutation();
            return;
        }
        if (action === 'bulk-ask') { state.bulkConfirm = true; pop.refresh(); var b = $('popover').querySelector('[data-pop="bulk-pinned"]'); if (b) b.focus(); return; }
        if (action === 'bulk-cancel') { state.bulkConfirm = false; pop.refresh(); return; }
        if (action === 'rhythm') { applyRhythm(el.dataset.pattern); return; }
        if (action === 'rhythm-clear') {
            var bi = state.rhythmBar;
            pushHistory((bi + 1) + '小節目のストロークを曲の基本に');
            delete song().bars[bi].strum;
            status((bi + 1) + '小節目の指定を外し、曲の基本に戻しました（模擬）');
            afterMutation();
            return;
        }
        if (action === 'rhythm-loupe') { var rb = state.rhythmBar; closePopover(); openLoupe(rb, function () { var c = loupeEls.strokes[0]; if (c) c.focus(); }); return; }
        if (action === 'legend') { openInspector('legend'); return; }
        if (action === 'kc-apply') { status('このモックではキー・カポの変更を実行しません（確認画面の検証のみ）'); return; }
        if (action === 'custom-done') { closePopover(true); return; }
    }

    // リズム
    function openRhythmPanel(barIndex, scope, anchor) {
        state.rhythmBar = barIndex;
        state.rhythmScope = scope;
        openPopover(anchor, rhythmPanelHtml);
    }
    function rhythmPanelHtml() {
        var s = song(), bi = state.rhythmBar;
        var bar = bi === null ? null : s.bars[bi];
        var eff = bar ? MD.effectivePattern(s, bar) : { id: s.basicPattern, pattern: F.patterns[s.basicPattern], inherited: true };
        var out = [];
        out.push('<div class="pop-head"><div><h2>' + (bar ? (bi + 1) + '小節目のストローク' : '曲の基本ストローク') + '</h2>' +
            '<p>今：' + (bar ? (eff.inherited ? '曲の基本（' + esc(eff.pattern.name) + '）を使用中' : 'この小節だけの指定（' + esc(eff.pattern.name) + '）') : esc(eff.pattern.name)) + '</p></div>' +
            '<button type="button" class="pop-close" data-pop="close" aria-label="閉じる">×</button></div>');
        out.push('<div class="rhythm-cards">' + ['p8', 'p16'].map(function (id) {
            var p = F.patterns[id];
            var pressed = eff.id === id;
            return '<button type="button" class="rhythm-card" data-pop="rhythm" data-pattern="' + id + '" aria-pressed="' + pressed + '"' + (pressed ? '' : '') + '>' +
                '<b>' + esc(p.name) + '</b><span class="arrows" aria-label="' + esc(p.events.map(strokeWord).join('、')) + '">' + esc(arrowsText(p)) + '</span>' +
                '<small>サンプル（Rhythm Cruise公式パターン接続前の固定値）</small></button>';
        }).join('') + '</div>');
        if (bar) {
            out.push('<div class="pop-section"><h3>適用先</h3><div class="scope" role="radiogroup" aria-label="適用先">' +
                '<label><input type="radio" name="rscope" value="bar"' + (state.rhythmScope !== 'song' ? ' checked' : '') + '> この小節だけ（' + (bi + 1) + '小節目）</label>' +
                '<label><input type="radio" name="rscope" value="song"' + (state.rhythmScope === 'song' ? ' checked' : '') + '> 曲の基本（指定のない小節すべて）</label></div></div>');
        }
        out.push('<div class="pop-section"><h3>ほかの入口</h3><div class="pop-actions">' +
            '<button type="button" class="pop-button" disabled>マイリズムから選ぶ — 準備中（利用範囲が未決）</button>' +
            (bar ? '<button type="button" class="pop-button" data-pop="rhythm-loupe">マス目で細かく編集（ルーペ）</button>' : '') +
            (bar && !eff.inherited ? '<button type="button" class="pop-button" data-pop="rhythm-clear">この小節の指定を外す（曲の基本に戻す）</button>' : '') +
            '<button type="button" class="pop-button" data-pop="legend">記号の意味</button></div></div>');
        return out.join('');
    }
    function applyRhythm(id) {
        var s = song(), bi = state.rhythmBar;
        var scope = bi === null ? 'song' : (($('popover').querySelector('input[name="rscope"]:checked') || {}).value || 'bar');
        state.rhythmScope = scope;
        if (scope === 'song') {
            if (s.basicPattern === id) return;
            pushHistory('曲の基本ストロークを' + F.patterns[id].name + 'に');
            song().basicPattern = id;
            status('曲の基本ストロークを「' + F.patterns[id].name + '」にしました。指定のある小節はそのまま（模擬）');
        } else {
            var bar = s.bars[bi];
            if (MD.effectivePattern(s, bar).id === id && bar.strum) return;
            pushHistory((bi + 1) + '小節目のストロークを' + F.patterns[id].name + 'に');
            song().bars[bi].strum = id;
            status((bi + 1) + '小節目だけ「' + F.patterns[id].name + '」にしました（模擬）');
        }
        afterMutation();
    }

    // キー・カポ
    function openKeyCapoPanel(anchor, preset) {
        state.kc = Object.assign({ goal: 'capo-keep-sound', amount: 2 }, preset || {});
        openPopover(anchor, keyCapoHtml, { wide: true });
    }
    function keyCapoHtml() {
        var s = song(), kc = state.kc;
        var goals = [
            ['transpose', '歌いやすい高さにする（曲全体の移調）', 'メロディとコードが同じ幅で上下します。押さえ方も選び直します。'],
            ['capo-keep-sound', '押さえやすくする（聞こえる音はそのまま・カポを使う）', '歌の高さは変わりません。カポの位置に合わせて押さえ方のコード名が変わります。'],
            ['capo-keep-form', 'カポで高くする（押さえ方はそのまま）', '押さえ方は変わりません。歌も伴奏も同じ幅で高くなります（曲全体の移調として扱います）。'],
            ['key-label', 'キーの表記だけ直す（音は変えない）', '音符・コード・押さえ方は動きません。']
        ];
        var out = [];
        out.push('<div class="pop-head"><div><h2>キーとカポ — 何を変えますか？</h2><p>このモックでは変更を実行しません。結果の見え方だけを確認します。</p></div>' +
            '<button type="button" class="pop-close" data-pop="close" aria-label="閉じる">×</button></div>');
        out.push('<div class="kc-goals" role="radiogroup" aria-label="変更の目的">' + goals.map(function (g) {
            return '<label class="kc-goal"><input type="radio" name="kc-goal" value="' + g[0] + '"' + (kc.goal === g[0] ? ' checked' : '') + '><span>' + esc(g[1]) + '</span><small>' + esc(g[2]) + '</small></label>';
        }).join('') + '</div>');
        var amount = '';
        if (kc.goal === 'transpose') {
            var opts = [];
            for (var n = -5; n <= 6; n++) if (n) opts.push('<option value="' + n + '"' + (kc.amount === n ? ' selected' : '') + '>' + (n > 0 ? '+' : '') + n + '半音（Key ' + M.transposeKey(s.key, n) + '）</option>');
            amount = '<label>移調の幅 <select id="kc-amount">' + opts.join('') + '</select></label>';
        } else if (kc.goal === 'key-label') {
            amount = '<label>キーの表記 <select id="kc-amount"><option value="0">C（メジャー）</option><option value="1"' + (kc.amount === 1 ? ' selected' : '') + '>Aマイナー（同じ調号）</option></select></label>';
        } else {
            var copts = [];
            for (var c = 0; c <= 7; c++) copts.push('<option value="' + c + '"' + (kc.amount === c ? ' selected' : '') + '>Capo ' + (c || 'なし') + '</option>');
            amount = '<label>カポ <select id="kc-amount">' + copts.join('') + '</select></label><span class="insp-note">今：Capo ' + (s.capo || 'なし') + '</span>';
        }
        out.push('<div class="pop-section"><div class="kc-amount">' + amount + '</div></div>');
        out.push('<div class="pop-section"><h3>変更前 → 変更後</h3>' + keyCapoPreview() + '</div>');
        out.push('<div class="pop-actions"><button type="button" class="pop-button is-primary" data-pop="kc-apply">この内容で変更（モックでは実行しません）</button>' +
            '<button type="button" class="pop-button" data-pop="close">キャンセル</button></div>');
        return out.join('');
    }
    function keyCapoPreview() {
        var s = song(), kc = state.kc;
        var chords = MD.allChordEvents(s).map(function (x) { return x.ev.symbol; }).filter(function (x) { return x !== 'N.C.'; });
        var seq = chords.slice(0, 11);
        var mel = (s.bars[0].melody || []).filter(function (n) { return !n.rest; }).slice(0, 6).map(function (n) { return n.p; });
        var pinned = MD.allChordEvents(s).filter(function (x) { var r = MD.resolveForm(s, x.ev); return r.state === 'pinned' || r.state === 'pending'; });
        var autoCount = MD.allChordEvents(s).filter(function (x) { return MD.resolveForm(s, x.ev).state === 'auto'; }).length;
        var pinnedText = pinned.map(function (x) { return (x.barIndex + 1) + '小節目 ' + x.ev.symbol; }).join('・');
        function row(label, before, after) {
            return '<tr><th scope="row">' + label + '</th><td>' + esc(before) + '</td><td class="kc-arrow">→</td><td>' + esc(after) + '</td></tr>';
        }
        var rows = [], impact = '', none = false;
        var key = s.key, capo = s.capo;
        if (kc.goal === 'transpose') {
            var n = kc.amount;
            rows.push(row('キー', key, M.transposeKey(key, n)));
            rows.push(row('コード（聞こえる音）', seq.join(' '), seq.map(function (c) { return M.transposeChord(c, key, n); }).join(' ')));
            rows.push(row('押さえ方のコード名', seq.join(' '), seq.map(function (c) { return M.transposeChord(c, key, n); }).join(' ')));
            rows.push(row('メロディ（1小節目）', mel.join(' '), mel.map(function (p) { return M.transposePitchText(p, key, n); }).join(' ')));
            rows.push(row('カポ', capo ? 'Capo ' + capo : 'なし', capo ? 'Capo ' + capo : 'なし（変わりません）'));
            impact = '固定した押さえ方 ' + pinned.length + 'か所（' + pinnedText + '）は「要確認」になります。自動では置き換えません。変更後に「出力の状態」から1か所ずつ確認できます。<br>おすすめ（自動）の ' + autoCount + 'か所は、新しいコードで選び直します。';
        } else if (kc.goal === 'capo-keep-sound') {
            var c = kc.amount, d = c - capo;
            if (!d) { none = true; impact = '今と同じカポ位置です。変更はありません。'; }
            rows.push(row('カポ', capo ? 'Capo ' + capo : 'なし', c ? 'Capo ' + c : 'なし'));
            rows.push(row('コード（聞こえる音）', seq.join(' '), seq.join(' ') + '（変わりません）'));
            rows.push(row('押さえ方のコード名', seq.join(' '), seq.map(function (x) { return M.transposeChord(x, key, -d); }).join(' ')));
            rows.push(row('メロディ（1小節目）', mel.join(' '), mel.join(' ') + '（変わりません）'));
            if (!none) impact = '固定した押さえ方 ' + pinned.length + 'か所（' + pinnedText + '）は「要確認」になります。同じ位置で押さえられる場合もありますが、自動では変更しません。<br>おすすめ（自動）の ' + autoCount + 'か所は、カポ位置に合わせて選び直します。押さえやすさの判定はこのモックでは行いません。';
        } else if (kc.goal === 'capo-keep-form') {
            var c2 = kc.amount, d2 = c2 - capo;
            if (!d2) { none = true; impact = '今と同じカポ位置です。変更はありません。'; }
            rows.push(row('カポ', capo ? 'Capo ' + capo : 'なし', c2 ? 'Capo ' + c2 : 'なし'));
            rows.push(row('押さえ方のコード名', seq.join(' '), seq.join(' ') + '（変わりません）'));
            rows.push(row('コード（聞こえる音）', seq.join(' '), seq.map(function (x) { return M.transposeChord(x, key, d2); }).join(' ')));
            rows.push(row('メロディ（1小節目）', mel.join(' '), mel.map(function (p) { return M.transposePitchText(p, key, d2); }).join(' ')));
            rows.push(row('キー（聞こえる音）', key, M.transposeKey(key, d2)));
            if (!none) impact = '押さえ方は変わらないため、固定した押さえ方 ' + pinned.length + 'か所もそのまま使えます（カポから数えたフレットが同じ）。歌が ' + (d2 > 0 ? d2 + '半音高く' : -d2 + '半音低く') + 'なる点に注意してください。';
        } else {
            rows.push(row('キーの表記', 'C（メジャー）', kc.amount === 1 ? 'Aマイナー' : 'C（メジャー）'));
            rows.push(row('音符・コード・押さえ方', '—', '変わりません'));
            impact = 'メロディ・コード・押さえ方は動きません。ドレミ表示の基準（ド＝C か ラ＝A か）を一緒に変えるかは未決です（U4）。';
            none = kc.amount !== 1;
        }
        return '<table class="kc-table"><tbody>' + rows.join('') + '</tbody></table><p class="kc-impact' + (none ? ' is-none' : '') + '">' + impact + '</p>';
    }

    // カスタムの段
    function openCustomPanel(anchor) {
        openPopover(anchor, function () {
            var defs = [['chord', 'コード'], ['staff', 'メロディ（歌）五線'], ['lyrics', '歌詞'], ['doremi', 'ドレミ'], ['stroke', 'ストローク'], ['tab', 'ギター伴奏 TAB'], ['accomp', 'ギター伴奏 五線（この工程では生成不可）']];
            return '<div class="pop-head"><div><h2>カスタム — 表示する段</h2><p>段の順番は固定です（コード → メロディ → 歌詞 → ストローク → ギター）。</p></div>' +
                '<button type="button" class="pop-close" data-pop="close" aria-label="閉じる">×</button></div>' +
                '<div class="kc-goals">' + defs.map(function (d) {
                    return '<label class="kc-goal"><input type="checkbox" data-custom="' + d[0] + '"' + (state.custom[d[0]] ? ' checked' : '') + '><span>' + esc(d[1]) + '</span></label>';
                }).join('') + '</div><div class="pop-actions"><button type="button" class="pop-button" data-pop="custom-done">閉じる</button></div>';
        });
    }

    // ---------------------------------------------------------------- Inspector
    function openInspector(mode) {
        state.inspector.open = true;
        if (mode) state.inspector.mode = mode;
        render();
        $('insp-close').focus({ preventScroll: true });
    }
    function closeInspector() {
        state.inspector.open = false;
        render();
        $('nav-inspector').focus({ preventScroll: true });
    }
    function renderInspector() {
        var shell = $('shell'), insp = $('inspector');
        shell.dataset.inspector = state.inspector.open ? 'open' : 'closed';
        document.documentElement.style.setProperty('--insp-w', state.inspWidth + 'px');
        insp.hidden = !state.inspector.open;
        $('nav-inspector').setAttribute('aria-expanded', String(state.inspector.open));
        if (!state.inspector.open) return;
        var s = song(), mode = state.inspector.mode;
        var body = [];
        if (mode === 'chord' && state.inspector.chordId && MD.findChord(s, state.inspector.chordId)) {
            var found = MD.findChord(s, state.inspector.chordId), res = MD.resolveForm(s, found.ev);
            $('insp-title').textContent = '押さえ方の詳細';
            body.push('<div class="insp-card"><h3>' + esc(chordPosText(found)) + '</h3><dl>' +
                '<dt>状態</dt><dd>' + formStateText(res.state) + '</dd>' +
                (res.form ? '<dt>形</dt><dd>' + esc(cagedText(res.form)) + '</dd><dt>弦（6→1）</dt><dd>' + res.form.frets.map(function (x) { return x === null ? '×' : x; }).join(' ') + '（Capo相対）</dd>' : '') +
                '<dt>出所</dt><dd>' + esc(res.binding ? res.binding.note : 'おすすめ（固定サンプル）') + '</dd>' +
                (res.binding && res.binding.originDeleted ? '<dt>元の素材</dt><dd>本棚の元項目は削除済み。取り込み時のコピー（出所付き）を使い続けます。元の最新版への更新は差分を見て明示的に行う操作です（このモックでは対象外）。</dd>' : '') +
                '<dt>使用弦</dt><dd>ダウン＝フォームの全弦、アップ＝1〜3弦（サンプルの演奏指定）</dd></dl></div>');
            if (res.form) body.push('<div>' + diagramHtml(res.form, found.ev.symbol) + '</div>');
            body.push('<p class="insp-note">本棚・マイリズム・高度なCAGEDのStandard/Pro範囲は未決（U7）。権限が変わっても、曲に取り込んだ押さえ方は削除・変換しません。</p>');
        } else if (mode === 'legend') {
            $('insp-title').textContent = 'ストローク記号';
            body.push('<div class="legend">' + [
                ['↓ / ↑', 'ダウン／アップで鳴らす（新しい発音）'], ['(↓)', '空振り：手は動くが弦に当てない。直前の音は続く'],
                ['〜', '伸ばす：手の動きを記さず、直前の音を続ける'], ['・', '休み：音のない時間'],
                ['止', '消音：鳴っている音を止める'], ['×', 'ブラッシング：音程のない打撃（TABでは×）']
            ].map(function (r) { return '<b>' + esc(r[0]) + '</b><span>' + esc(r[1]) + '</span>'; }).join('') + '</div>');
            body.push('<p class="insp-note">「空振り」と「休み」と「伸ばす」と「消音」は別の演奏です。同じ記号にまとめません。</p>');
            body.push('<p class="insp-note">紙面のストローク段には「曲の基本：…」または「この小節だけ：…」と文字で示します。</p>');
        } else if (mode === 'bar' ) {
            $('insp-title').textContent = '小節';
        } else {
            $('insp-title').textContent = '確認一覧';
            var ready = MD.readiness(s);
            var outs = MD.outputsFor(lanes(), ready);
            if (!outs.length) body.push('<p class="insp-note">この譜面スタイル（' + MD.STYLES[state.style].label + '）には、五線・TABの出力がありません。</p>');
            outs.forEach(function (o) {
                var word = o.r.state === 'ok' ? '✓ 生成可能' : o.r.state === 'review' ? '△ 要確認' : '× 生成不可';
                body.push('<section><h3>' + o.label + '　' + word + '</h3>' + (o.r.items.length ? '<ul class="insp-list">' + o.r.items.map(function (it) {
                    return '<li><button type="button" data-goto-bar="' + it.barIndex + '"' + (it.chordId ? ' data-goto-chord="' + it.chordId + '"' : '') + '>' + esc(it.text) + '</button></li>';
                }).join('') + '</ul>' : '<p class="insp-note">確認が必要な箇所はありません。</p>') + '</section>');
            });
            body.push('<p class="insp-note">出力ごとに判定します。TABに確認が必要でも、メロディ五線が生成可能ならメロディだけ表示・印刷できます。</p>');
        }
        $('insp-body').innerHTML = body.join('');
    }

    // ---------------------------------------------------------------- 印刷プレビュー
    function openPrintPreview(laneOverride) {
        closeMenu(); closePopover();
        var s = song();
        var L = laneOverride || lanes();
        var layout = N.layoutScore(s, { lanes: L, barsTarget: state.barsTarget });
        var built = buildPages(s, layout, { print: true });
        state.previewHtml = built.html;
        var pages = $('pp-pages');
        pages.innerHTML = '<div class="paper-box"><div class="paper-scale">' + built.html + '</div></div>';
        $('pp-kind').textContent = built.final ? '完成譜' : '確認用（未確認の箇所を含みます）';
        $('pp-kind').classList.toggle('is-final', built.final);
        $('pp-title').textContent = '印刷プレビュー' + (laneOverride ? '（ギターを除く）' : '');
        $('print-preview').hidden = false;
        var z = Math.min(1, (pages.clientWidth - 48) / N.PAGE.w);
        var scaleEl = pages.querySelector('.paper-scale');
        scaleEl.style.transform = 'scale(' + z + ')';
        pages.querySelector('.paper-box').style.width = (N.PAGE.w * z) + 'px';
        pages.querySelector('.paper-box').style.height = (scaleEl.offsetHeight * z) + 'px';
        $('pp-close').focus();
    }
    function closePrintPreview() {
        $('print-preview').hidden = true; state.previewHtml = null;
        $('output-menu-button').focus();
    }
    window.addEventListener('beforeprint', function () {
        var html = state.previewHtml;
        if (!html) {
            var layout = N.layoutScore(song(), { lanes: lanes(), barsTarget: state.barsTarget });
            html = buildPages(song(), layout, { print: true }).html;
        }
        $('print-root').innerHTML = '<div class="paper-box"><div class="paper-scale">' + html + '</div></div>';
    });
    window.addEventListener('afterprint', function () { $('print-root').innerHTML = ''; });

    // ---------------------------------------------------------------- 全体描画
    function render() {
        renderToolbar();
        renderReadiness();
        renderPrompt();
        renderInspector();
        renderPaper();
        positionLoupe();
        if (state.popover && state.popover.place) state.popover.place();
        $('verify-width').textContent = window.innerWidth + 'px × ' + window.innerHeight + 'px';
    }

    // ---------------------------------------------------------------- イベント
    function bind() {
        $('paper-scale').addEventListener('click', function (e) {
            var el = e.target.closest('button');
            if (!el) return;
            if (el.dataset.form) { openFormPanel(el.dataset.form, el); return; }
            if (el.dataset.chordName) {
                var f = MD.findChord(song(), el.dataset.chordName);
                openLoupe(f.barIndex, function () { loupeEls.chords[f.ev.t / 480].focus(); });
                return;
            }
            if (el.dataset.strokeBar) { openRhythmPanel(Number(el.dataset.strokeBar), 'bar', el); return; }
            if (el.dataset.blankBar) { var bb = Number(el.dataset.blankBar); openLoupe(bb, function () { loupeEls.chords[0].focus(); }); return; }
            if (el.dataset.action === 'keycapo') { openKeyCapoPanel(el); return; }
            if (el.dataset.action === 'basic-rhythm') { openRhythmPanel(null, 'song', el); return; }
            if (el.dataset.bar !== undefined) { openLoupe(Number(el.dataset.bar)); }
        });
        $('popover').addEventListener('click', function (e) {
            var el = e.target.closest('[data-pop]');
            if (el) popoverAction(el.dataset.pop, el);
        });
        $('popover').addEventListener('change', function (e) {
            var t = e.target;
            if (t.name === 'kc-goal') {
                state.kc.goal = t.value;
                state.kc.amount = t.value === 'transpose' ? 2 : t.value === 'key-label' ? 1 : 2;
                state.popover.refresh();
                var r = $('popover').querySelector('input[name="kc-goal"][value="' + t.value + '"]'); if (r) r.focus();
            } else if (t.id === 'kc-amount') {
                state.kc.amount = Number(t.value);
                state.popover.refresh();
                var a = $('kc-amount'); if (a) a.focus();
            } else if (t.dataset.custom) {
                var next = Object.assign({}, state.custom);
                next[t.dataset.custom] = t.checked;
                if (!MD.CUSTOM_ORDER.some(function (id) { return next[id]; })) { t.checked = true; status('少なくとも1つの段が必要です'); return; }
                pushHistory('カスタムの段を変更');
                state.custom = next;
                render();
            } else if (t.name === 'rscope') {
                state.rhythmScope = t.value;
            }
        });
        $('prompt').addEventListener('click', function (e) {
            var b = e.target.closest('[data-prompt]');
            if (!b) return;
            if (b.dataset.prompt === 'carry') {
                pushHistory('空欄の小節は前のコードを続ける（曲の規則）');
                song().emptyChordRule = 'carry';
                status('この曲では、空欄の小節を「前のコードを続ける」として扱います（曲の規則・模擬）。紙面には（C）のように括弧で示します');
            } else { state.promptDismissed = true; status('あとで確認します。空欄の小節はTABで「コード未指定」のままです'); }
            render();
        });
        $('readiness').addEventListener('click', function (e) { if (e.target.closest('.ready-item')) openInspector('overview'); });
        $('insp-body').addEventListener('click', function (e) {
            var b = e.target.closest('[data-goto-bar]');
            if (!b) return;
            var bi = Number(b.dataset.gotoBar);
            if (b.dataset.gotoChord) {
                openLoupe(bi);
                var pill = $('paper-scale').querySelector('.form-pill[data-form="' + b.dataset.gotoChord + '"]') ||
                    loupeEls.forms.filter(function (f) { return f.dataset.chord === b.dataset.gotoChord; })[0];
                openFormPanel(b.dataset.gotoChord, pill);
            } else openLoupe(bi, function () { var nb = loupeEls.notes[0]; if (nb) nb.focus(); });
        });
        $('nav-inspector').addEventListener('click', function () { if (state.inspector.open) closeInspector(); else openInspector(state.inspector.mode || 'overview'); });
        $('insp-close').addEventListener('click', closeInspector);
        $('undo').addEventListener('click', undo);
        $('redo').addEventListener('click', redo);
        $('save').addEventListener('click', function () { status('このプロトタイプは保存しません（保存データ・Repositoryへ接続しません）'); });
        $('style-menu-button').addEventListener('click', styleMenu);
        $('song-menu-button').addEventListener('click', songMenu);
        $('output-menu-button').addEventListener('click', outputMenu);
        $('pp-close').addEventListener('click', closePrintPreview);
        $('pp-print').addEventListener('click', function () { window.print(); });
        $('zoom-select').addEventListener('change', function (e) { state.zoom = e.target.value; render(); });
        $('stage').addEventListener('scroll', function () { if (state.popover && state.popover.place) state.popover.place(); }, { passive: true });
        document.addEventListener('mousedown', function (e) {
            if (!$('menu').hidden && !e.target.closest('#menu') && e.target !== menuAnchor && !(menuAnchor && menuAnchor.contains(e.target))) closeMenu();
            var pop = $('popover');
            if (!pop.hidden && !e.target.closest('#popover') && !(state.popover && state.popover.anchor && state.popover.anchor.contains(e.target)) &&
                !e.target.closest('#menu') && !e.target.closest('#verify')) closePopover();
        });
        document.addEventListener('keydown', function (e) {
            var inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
            if (e.key === 'Escape') {
                if (!$('menu').hidden) { closeMenu(); e.preventDefault(); return; }
                if (!$('popover').hidden) { closePopover(true); e.preventDefault(); return; }
                if (!$('print-preview').hidden) { closePrintPreview(); e.preventDefault(); return; }
                if (!$('verify').hidden && document.activeElement.closest('#verify')) { toggleVerify(false); e.preventDefault(); return; }
                if (state.loupe.open && !e.isComposing) { closeLoupe(); e.preventDefault(); return; }
                if (state.inspector.open && window.innerWidth < 1280) { closeInspector(); e.preventDefault(); return; }
            }
            if (e.altKey && !e.metaKey && !e.ctrlKey && /^Arrow/.test(e.key) && (state.loupe.open || (document.activeElement && document.activeElement.classList.contains('hit-bar')))) {
                if (!state.loupe.open) state.loupe.barIndex = Number(document.activeElement.dataset.bar);
                if (e.key === 'ArrowLeft') moveBar(-1);
                if (e.key === 'ArrowRight') moveBar(1);
                if (e.key === 'ArrowUp') moveSystem(-1);
                if (e.key === 'ArrowDown') moveSystem(1);
                e.preventDefault();
                return;
            }
            if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z') && !inField) {
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
            }
        });
        window.addEventListener('resize', function () { render(); });
        $('verify-toggle').addEventListener('click', function () { toggleVerify($('verify').hidden); });
        $('verify-close').addEventListener('click', function () { toggleVerify(false); });
        $('opt-bars').addEventListener('change', function (e) { state.barsTarget = Number(e.target.value); render(); });
        $('opt-insp').addEventListener('change', function (e) { state.inspWidth = Number(e.target.value); render(); });
        $('verify-list').addEventListener('click', function (e) { var b = e.target.closest('[data-scenario]'); if (b) runScenario(b.dataset.scenario); });
        $('verify-extra').addEventListener('click', function (e) {
            var b = e.target.closest('[data-extra]');
            if (!b) return;
            if (b.dataset.extra === 'next-bar') moveBar(1);
            if (b.dataset.extra === 'next-system') moveSystem(1);
            if (b.dataset.extra === 'reset') runScenario(state.scenario || 'S01');
        });
    }
    function toggleVerify(open) {
        $('verify').hidden = !open;
        $('verify-toggle').setAttribute('aria-expanded', String(open));
        if (open) { var cur = $('verify-list').querySelector('[aria-current="true"]') || $('verify-list').querySelector('button'); if (cur) cur.focus(); }
        else $('verify-toggle').focus();
    }

    // ---------------------------------------------------------------- シナリオ S01〜S24
    function pill(chordId) { return $('paper-scale').querySelector('.form-pill[data-form="' + chordId + '"]'); }
    function confirmAllDurations() { song().bars.forEach(function (b) { b.durState = 'confirmed'; }); }
    var SCENARIOS = [
        ['S01', 'コード譜', '現行Structureに近い段構成', function () { state.style = 'chord'; }],
        ['S02', 'メロディ譜', '自動の音価（1–4小節）と確認済み（5–8小節）', function () { state.style = 'melody'; }],
        ['S03', 'ギター譜', 'おすすめ・固定・曲の基本・この小節だけ', function () { state.style = 'guitar'; }],
        ['S04', '弾き語り譜', 'コード・メロディ・歌詞・ストローク・TAB', function () { state.style = 'singer'; }],
        ['S05', 'カスタム', '段の選択とギター伴奏五線（生成不可）', function () { state.style = 'custom'; state.custom.accomp = true; },
            function () { openCustomPanel($('style-menu-button')); }],
        ['S06', '1920px', '弾き語り譜・幅に合わせる（ウィンドウを1920pxに）', function () { state.style = 'singer'; state.zoom = 'fit'; }],
        ['S07', '1280px', '弾き語り譜＋Inspector常設（ウィンドウを1280pxに）', function () { state.style = 'singer'; state.inspector = { open: true, mode: 'overview', chordId: null }; }],
        ['S08', '狭幅 800/600', '弾き語り譜（ウィンドウを800px・600pxに）', function () { state.style = 'singer'; }],
        ['S09', 'ルーペ移動', '2小節目→次の小節→次の段（位置が安定するか）', function () { state.style = 'singer'; },
            function () { openLoupe(1); }],
        ['S10', '音価・休符編集', '4小節目（自動）の長さを直して確認', function () { state.style = 'melody'; },
            function () { openLoupe(3, function () { state.loupe.selectedNote = song().bars[3].melody[1].id; fillLoupe(); var b = loupeEls.notes[1]; if (b) b.focus(); }); }],
        ['S11', 'コードフォーム', '1小節目 C のおすすめとCAGED候補', function () { state.style = 'guitar'; },
            function () { openFormPanel('c01', pill('c01')); }],
        ['S12', '一括適用', '1小節目をA型に → 同じコードへ（固定は対象外）', function () { state.style = 'guitar'; },
            function () { state.inspector.chordId = 'c01'; pushHistory('1小節目 C の押さえ方'); setBinding(song(), 'c01', 'C-A3', 'caged', 'CAGED候補から選択'); state.bulk = { chordId: 'c01' }; render(); openFormPanel('c01', pill('c01')); }],
        ['S13', '手動フォーム要確認', '12小節目のコードを C→Dm（固定は保持）', function () { state.style = 'guitar'; },
            function () { pushHistory('12小節目1拍目のコードをDmに'); song().bars[11].chords[0].symbol = 'Dm'; render(); openFormPanel('c15', pill('c15')); }],
        ['S14', 'リズム選択', '5小節目：基本8分/16分と適用先', function () { state.style = 'guitar'; },
            function () { openRhythmPanel(4, 'bar', $('paper-scale').querySelector('[data-stroke-bar="4"]')); }],
        ['S15', 'ストローク記号', '高密度サンプル3小節目の6種類の記号', function () { state.songId = 'dense'; state.style = 'guitar'; state.loupe.res = 16; state.inspector = { open: true, mode: 'legend', chordId: null }; },
            function () { openLoupe(2, function () { var c = loupeEls.strokes[0]; if (c) c.focus(); }); }],
        ['S16', 'キー・カポ変更', '実音を保つ Capo 2（C→B♭の押さえ方）', function () { state.style = 'singer'; },
            function () { openKeyCapoPanel($('paper-scale').querySelector('[data-action="keycapo"]'), { goal: 'capo-keep-sound', amount: 2 }); }],
        ['S17', '出力状態', 'メロディ✓・TAB要確認・伴奏五線生成不可', function () {
            state.style = 'custom'; state.custom = { chord: true, staff: true, lyrics: true, doremi: false, stroke: true, tab: true, accomp: true };
            confirmAllDurations(); song().bars[11].chords[0].symbol = 'Dm'; state.inspector = { open: true, mode: 'overview', chordId: null }; }],
        ['S18', '空欄コードとN.C.', '10小節目が空欄・11小節目がN.C.', function () {
            state.style = 'guitar'; song().bars[9].chords = []; song().bars[10].chords = [{ id: 'c14', t: 0, symbol: 'N.C.' }]; }],
        ['S19', 'Toolbar', '出力メニュー（印刷・TABを除く・MIDI）', function () { state.style = 'singer'; },
            function () { outputMenu(); }],
        ['S20', '確認用印刷', '弾き語り譜（自動の音価・要確認TABを含む）', function () { state.style = 'singer'; song().bars[11].chords[0].symbol = 'Dm'; },
            function () { openPrintPreview(null); }],
        ['S21', '完成譜印刷', 'メロディ確認済み・TABを除いて完成譜', function () { state.style = 'singer'; confirmAllDurations(); song().bars[11].chords[0].symbol = 'Dm'; },
            function () { openPrintPreview(lanes().filter(function (x) { return x !== 'tab' && x !== 'stroke'; })); }],
        ['S22', '高密度・長い歌詞', '1小節4コード・16分・英語の歌詞（小節数が自動で減る）', function () { state.songId = 'dense'; state.style = 'singer'; }],
        ['S23', 'Undo/Redo', '押さえ方を変更 → 元に戻した直後（やり直し可能）', function () { state.style = 'guitar'; },
            function () { pushHistory('1小節目 C の押さえ方'); setBinding(song(), 'c01', 'C-A3', 'caged', 'CAGED候補から選択'); render(); undo(); }],
        ['S24', '外部素材', '12小節目：本棚から取り込んだ押さえ方（元は削除済み）', function () { state.style = 'guitar'; state.inspector = { open: true, mode: 'chord', chordId: 'c15' }; },
            function () { openFormPanel('c15', pill('c15')); }]
    ];
    function runScenario(id) {
        var def = SCENARIOS.filter(function (x) { return x[0] === id; })[0];
        if (!def) return;
        closeMenu(); closePopover();
        if (!$('print-preview').hidden) { $('print-preview').hidden = true; state.previewHtml = null; }
        var keep = { barsTarget: state.barsTarget, inspWidth: state.inspWidth };
        state = freshState(keep);
        state.scenario = id;
        $('loupe').hidden = true;
        def[3]();
        $('zoom-select').value = state.zoom;
        render();
        $('stage').scrollTop = 0;
        if (def[4]) def[4]();
        renderVerify();
        try { history.replaceState(null, '', '?s=' + id + (state.barsTarget !== 4 ? '&bars=' + state.barsTarget : '')); } catch (e) { /* file:// 等で失敗しても表示は続ける */ }
    }
    function renderVerify() {
        $('verify-list').innerHTML = SCENARIOS.map(function (d) {
            return '<button type="button" data-scenario="' + d[0] + '"' + (state.scenario === d[0] ? ' aria-current="true"' : '') + '><b>' + d[0] + '</b><span>' + esc(d[1]) + '</span><small>' + esc(d[2]) + '</small></button>';
        }).join('');
        var extra = ['<button type="button" data-extra="reset">この状態を最初からやり直す</button>'];
        if (state.scenario === 'S09') extra.push('<button type="button" data-extra="next-bar">次の小節へ（Alt+→）</button><button type="button" data-extra="next-system">次の段へ（Alt+↓）</button>');
        if (['S06', 'S07', 'S08'].indexOf(state.scenario) >= 0) extra.push('<p>この状態はウィンドウ幅で確認します（1920 / 1280 / 800 / 600px）。ブラウザの開発ツールの幅指定も使えます。</p>');
        $('verify-extra').innerHTML = extra.join('');
        $('opt-bars').value = String(state.barsTarget);
        $('opt-insp').value = String(state.inspWidth);
    }

    // ---------------------------------------------------------------- 起動
    function start() {
        state = freshState();
        buildLoupe();
        bind();
        var params = new URLSearchParams(location.search);
        if (params.get('bars') === '2') state.barsTarget = 2;
        if (params.get('insp') === '320') state.inspWidth = 320;
        runScenario(params.get('s') || 'S01');
        if (params.get('verify') === '1') toggleVerify(true);
        window.ISPApp = { runScenario: runScenario, state: function () { return state; }, scenarios: SCENARIOS.map(function (d) { return d[0]; }) };
    }
    start();
}());
