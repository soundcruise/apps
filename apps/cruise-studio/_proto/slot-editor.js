/* 譜面スロット編集プロトタイプ（Phase S0）
   目的: 案C（A4譜面選択＋専用スロットエディタ）の操作感確認。
   - データはメモリ内のサンプルプロジェクトのみ。localStorage には一切書かない
     （storage.js を読み込んでいないため、cruiseStudio.* キーへの書き込み経路が存在しない）
   - 本番コア（music-theory / song-model / sheet-renderer）は読み取り参照
   - 検証しやすいよう window.__proto に内部状態を公開する（プロトタイプ限定） */
(function () {
    'use strict';

    var CS = window.CruiseStudio;
    var model = CS.model;
    var theory = CS.theory;
    var renderer = CS.sheetRenderer;

    var SHEET_WIDTH = 794;
    var DOREMI_NAMES = ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ'];
    var EXT_CHARS = '〜～ーｰ-−';

    var state = {
        project: model.createSampleProject(),  // メモリ内のみ。保存しない
        globalRes: 8,          // 全体グリッド（8 or 16）
        barResOverride: {},    // 小節番号 → 16（「選択小節だけ16分に展開」。UI状態のみ）
        selectedBar: null,     // 選択中の小節番号
        activeRow: 'lyrics',   // 'lyrics' | 'doremi'
        activeSlot: 0
    };

    var els = {};
    var barCells = [];         // 紙面上の .sheet-bar（barNumber順）
    var slotInputs = { lyrics: [], doremi: [] };

    function q(id) { return document.getElementById(id); }

    function setStatus(message) {
        els.status.textContent = message || '';
    }

    function getBar(barNumber) {
        return state.project.bars[barNumber - 1];
    }

    function barTicks() {
        return model.getBarLengthTicks(state.project);
    }

    /* ══════════ 解像度（8分/16分） ══════════ */

    // データから導出: 16分位置(120tick単位)のイベントがあれば、その小節は16分表示が必要
    function barNeedsSixteenth(bar) {
        var needs = false;
        (bar.lyrics || []).forEach(function (ev) {
            if (ev.tick % 240 !== 0) needs = true;
        });
        (bar.melody || []).forEach(function (ev) {
            if (ev.tick % 240 !== 0 || (ev.durationTicks || 0) % 240 !== 0) needs = true;
        });
        return needs;
    }

    function resForBar(barNumber) {
        if (state.barResOverride[barNumber] === 16) return 16;
        var bar = getBar(barNumber);
        if (bar && barNeedsSixteenth(bar)) return 16;
        return state.globalRes;
    }

    function stepForRes(res) {
        return barTicks() / res;
    }

    /* ══════════ A4紙面の描画・選択 ══════════ */

    function renderSheet() {
        renderer.render(state.project, els.scaleBox);
        // レンダラーはセクション順＝bars順でセルを出すので、順番でbarNumberに対応づける
        barCells = Array.prototype.slice.call(
            els.scaleBox.querySelectorAll('.sheet-bar:not(.sheet-bar--empty)'));
        applySelectionToSheet();
        applyScale();
    }

    function applySelectionToSheet() {
        barCells.forEach(function (cell, i) {
            var barNumber = i + 1;
            cell.classList.toggle('proto-selected', barNumber === state.selectedBar);
            var old = cell.querySelector('.proto-grid-overlay');
            if (old) old.remove();
            if (barNumber === state.selectedBar) {
                var res = resForBar(barNumber);
                var overlay = document.createElement('div');
                overlay.className = 'proto-grid-overlay';
                overlay.style.gridTemplateColumns = 'repeat(' + res + ', 1fr)';
                for (var s = 0; s < res; s++) overlay.appendChild(document.createElement('span'));
                cell.appendChild(overlay);
            }
        });
    }

    function applyScale() {
        var available = els.viewport.clientWidth;
        if (!available) return;
        var scale = Math.min(1, available / SHEET_WIDTH);
        els.scaleBox.style.transform = 'scale(' + scale + ')';
        els.viewport.style.height = Math.ceil(els.scaleBox.offsetHeight * scale) + 'px';
    }

    function selectBar(barNumber, focusSlotIndex, focusRow) {
        if (!getBar(barNumber)) return;
        state.selectedBar = barNumber;
        state.activeSlot = focusSlotIndex || 0;
        if (focusRow) state.activeRow = focusRow;
        applySelectionToSheet();
        rebuildEditor();
        var input = slotInputs[state.activeRow][state.activeSlot];
        if (input) input.focus();
        setStatus(barNumber + '小節目を選択（' + resForBar(barNumber) + '分グリッド）');
    }

    function clearSelection() {
        state.selectedBar = null;
        applySelectionToSheet();
        rebuildEditor();
        setStatus('選択を解除しました');
    }

    /* ══════════ スロット⇔イベントの読み書き ══════════ */

    function slotRange(slot, step) {
        return { start: slot * step, end: (slot + 1) * step };
    }

    function getLyricSlotText(bar, slot, step) {
        var r = slotRange(slot, step);
        return (bar.lyrics || [])
            .filter(function (ev) { return ev.tick >= r.start && ev.tick < r.end; })
            .sort(function (a, b) { return a.tick - b.tick; })
            .map(function (ev) { return ev.text; })
            .join('');
    }

    function setLyricSlot(bar, slot, step, text) {
        var r = slotRange(slot, step);
        bar.lyrics = (bar.lyrics || []).filter(function (ev) {
            return !(ev.tick >= r.start && ev.tick < r.end);
        });
        var t = String(text || '').trim();
        if (t) bar.lyrics.push({ tick: r.start, text: t });
        bar.lyrics.sort(function (a, b) { return a.tick - b.tick; });
    }

    function formatMelodyEvent(ev) {
        var text = DOREMI_NAMES[Math.min(6, Math.max(0, ev.step))] || '';
        var alter = ev.alter || 0;
        for (var a = 0; a < alter; a++) text += '♯';
        for (var b = 0; b > alter; b--) text += '♭';
        var oct = ev.octave || 0;
        for (var u = 0; u < oct; u++) text += '↑';
        for (var d = 0; d > oct; d--) text += '↓';
        return text;
    }

    // スロット表示: 音の開始マス=音名 / 伸ばし継続マス='〜' / 空=''
    function getMelodySlotDisplay(bar, slot, step) {
        var r = slotRange(slot, step);
        var starting = null;
        var covering = null;
        (bar.melody || []).forEach(function (ev) {
            if (ev.tick >= r.start && ev.tick < r.end) starting = ev;
            else if (ev.tick < r.start && ev.tick + (ev.durationTicks || 0) > r.start) covering = ev;
        });
        if (starting) return { text: formatMelodyEvent(starting), cont: false };
        if (covering) return { text: '〜', cont: true };
        return { text: '', cont: false };
    }

    function truncateOverlapping(bar, tick) {
        (bar.melody || []).forEach(function (ev) {
            if (ev.tick < tick && ev.tick + (ev.durationTicks || 0) > tick) {
                ev.durationTicks = tick - ev.tick;
            }
        });
    }

    function removeMelodyInRange(bar, start, end) {
        bar.melody = (bar.melody || []).filter(function (ev) {
            return !(ev.tick >= start && ev.tick < end);
        });
    }

    function isExtensionOnly(text) {
        if (!text) return false;
        for (var i = 0; i < text.length; i++) {
            if (EXT_CHARS.indexOf(text[i]) === -1) return false;
        }
        return true;
    }

    /**
     * ドレミスロットの書き込み。
     * '' / '・' = このマスを休符化 / '〜' = 直前の音をこのマスまで伸ばす /
     * 音名（伸ばし記号付き可）= このマスから配置。
     * @returns {string} 警告（なければ ''）
     */
    function setMelodySlot(bar, slot, step, text) {
        var r = slotRange(slot, step);
        var t = String(text || '').trim();

        removeMelodyInRange(bar, r.start, r.end);

        if (t === '' || t === '・') {
            truncateOverlapping(bar, r.start);
            bar.melody.sort(function (a, b) { return a.tick - b.tick; });
            return '';
        }

        if (isExtensionOnly(t)) {
            var prev = null;
            (bar.melody || []).forEach(function (ev) {
                if (ev.tick < r.start && (!prev || ev.tick > prev.tick)) prev = ev;
            });
            if (prev) {
                prev.durationTicks = r.end - prev.tick;
                bar.melody.sort(function (a, b) { return a.tick - b.tick; });
                return '';
            }
            return '伸ばす対象の音がありません';
        }

        var parsed = theory.parseDoremiString(t);
        if (parsed.notes.length === 0) {
            return '解釈できない入力です: ' + t;
        }
        var note = parsed.notes[0];
        var dur = step * (1 + note.extensions);
        if (r.start + dur > barTicks()) dur = barTicks() - r.start; // 小節内に収める（タイは本実装で）
        truncateOverlapping(bar, r.start);
        removeMelodyInRange(bar, r.start, r.start + dur);
        bar.melody.push({
            tick: r.start,
            durationTicks: dur,
            step: note.step,
            alter: note.alter,
            octave: note.octave
        });
        bar.melody.sort(function (a, b) { return a.tick - b.tick; });
        var warn = (parsed.notes.length > 1) ? '1マスには1音のみ配置します（先頭の音を使用）' : '';
        return parsed.warnings.concat(warn ? [warn] : []).join(' / ');
    }

    /* ══════════ スロットエディタUI ══════════ */

    function rebuildEditor() {
        els.slotRows.innerHTML = '';
        slotInputs = { lyrics: [], doremi: [] };

        if (!state.selectedBar) {
            els.editorLabel.textContent = '譜面の小節をクリックして選択してください';
            return;
        }
        var bar = getBar(state.selectedBar);
        var res = resForBar(state.selectedBar);
        var step = stepForRes(res);
        els.editorLabel.textContent = state.selectedBar + '小節目（' + res + '分・' + res + 'マス）';

        [
            { key: 'lyrics', label: '歌詞' },
            { key: 'doremi', label: 'ドレミ' }
        ].forEach(function (rowDef) {
            var row = document.createElement('div');
            row.className = 'proto-slot-row';
            var label = document.createElement('span');
            label.className = 'proto-slot-row-label';
            label.textContent = rowDef.label;
            row.appendChild(label);

            var slots = document.createElement('div');
            slots.className = 'proto-slots';
            slots.style.gridTemplateColumns = 'repeat(' + res + ', 1fr)';

            var slotsPerBeat = res / state.project.songInfo.timeSignature.beats;
            for (var s = 0; s < res; s++) {
                var input = document.createElement('input');
                input.type = 'text';
                input.className = 'proto-slot' + (rowDef.key === 'doremi' ? ' proto-slot--doremi' : '');
                if (s % slotsPerBeat === 0) input.classList.add('is-beat-head');
                input.dataset.row = rowDef.key;
                input.dataset.slot = String(s);
                input.setAttribute('aria-label',
                    state.selectedBar + '小節目 ' + rowDef.label + ' ' + (s + 1) + 'マス目');

                if (rowDef.key === 'lyrics') {
                    input.value = getLyricSlotText(bar, s, step);
                } else {
                    var display = getMelodySlotDisplay(bar, s, step);
                    input.value = display.text;
                    if (display.cont) input.classList.add('is-cont');
                }

                input.addEventListener('keydown', onSlotKeydown);
                input.addEventListener('focus', onSlotFocus);
                slots.appendChild(input);
                slotInputs[rowDef.key].push(input);
            }
            row.appendChild(slots);
            els.slotRows.appendChild(row);
        });
    }

    // 値だけ更新（フォーカスとDOMを保つ。コミット後の再同期用）
    function refreshEditorValues() {
        if (!state.selectedBar) return;
        var bar = getBar(state.selectedBar);
        var res = resForBar(state.selectedBar);
        // 解像度がデータ起因で変わった場合（16分位置に置いた等）は作り直す
        if (slotInputs.lyrics.length !== res) {
            var row = state.activeRow;
            var slot = state.activeSlot;
            rebuildEditor();
            applySelectionToSheet();
            var input = slotInputs[row][Math.min(slot, res - 1)];
            if (input) input.focus();
            return;
        }
        var step = stepForRes(res);
        slotInputs.lyrics.forEach(function (input, s) {
            input.value = getLyricSlotText(bar, s, step);
        });
        slotInputs.doremi.forEach(function (input, s) {
            var display = getMelodySlotDisplay(bar, s, step);
            input.value = display.text;
            input.classList.toggle('is-cont', display.cont);
        });
    }

    function commitSlot(input) {
        if (!state.selectedBar) return;
        var bar = getBar(state.selectedBar);
        var res = resForBar(state.selectedBar);
        var step = stepForRes(res);
        var slot = parseInt(input.dataset.slot, 10);
        var warn = '';
        if (input.dataset.row === 'lyrics') {
            setLyricSlot(bar, slot, step, input.value);
        } else {
            warn = setMelodySlot(bar, slot, step, input.value);
        }
        input.classList.toggle('is-invalid', !!warn);
        if (warn) setStatus('⚠ ' + warn);
        renderSheet();
        refreshEditorValues();
    }

    function focusSlot(row, slot) {
        var res = resForBar(state.selectedBar);
        if (slot >= res) {
            // 小節末 → 次の小節の先頭へ
            if (getBar(state.selectedBar + 1)) {
                selectBar(state.selectedBar + 1, 0, row);
                setStatus('→ ' + state.selectedBar + '小節目へ移動');
            }
            return;
        }
        if (slot < 0) {
            // 小節頭 → 前の小節の末尾へ
            if (getBar(state.selectedBar - 1)) {
                var prevRes = resForBar(state.selectedBar - 1);
                selectBar(state.selectedBar - 1, prevRes - 1, row);
                setStatus('← ' + state.selectedBar + '小節目へ移動');
            }
            return;
        }
        state.activeRow = row;
        state.activeSlot = slot;
        var input = slotInputs[row][slot];
        if (input) {
            input.focus();
            input.select();
        }
    }

    function onSlotFocus(e) {
        state.activeRow = e.target.dataset.row;
        state.activeSlot = parseInt(e.target.dataset.slot, 10);
    }

    function onSlotKeydown(e) {
        // 日本語IME: 変換中/確定のEnter・矢印はスロット移動に使わない
        if (e.isComposing || e.keyCode === 229) return;

        var input = e.target;
        var row = input.dataset.row;
        var slot = parseInt(input.dataset.slot, 10);

        if (e.key === 'Enter') {
            e.preventDefault();
            commitSlot(input);
            focusSlot(row, slot + 1);
        } else if (e.key === 'Tab') {
            e.preventDefault();
            commitSlot(input);
            focusSlot(row, slot + (e.shiftKey ? -1 : 1));
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (e.altKey) { moveContent(1); return; }
            commitSlot(input);
            focusSlot(row, slot + 1);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (e.altKey) { moveContent(-1); return; }
            commitSlot(input);
            focusSlot(row, slot - 1);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            commitSlot(input);
            focusSlot(row === 'lyrics' ? 'doremi' : 'lyrics', slot);
        } else if (e.key === 'Escape') {
            input.blur();
        }
    }

    /* ══════════ 簡易移動（Alt+←→ / ボタン。隣のマスと内容を入れ替え） ══════════ */

    function moveContent(dir) {
        if (!state.selectedBar) return;
        var bar = getBar(state.selectedBar);
        var res = resForBar(state.selectedBar);
        var step = stepForRes(res);
        var src = state.activeSlot;
        var dst = src + dir;
        if (dst < 0 || dst >= res) {
            setStatus('小節の端です（小節をまたぐ移動は本実装で検討）');
            return;
        }
        if (state.activeRow === 'lyrics') {
            var a = getLyricSlotText(bar, src, step);
            var b = getLyricSlotText(bar, dst, step);
            if (!a && !b) { setStatus('移動する内容がありません'); return; }
            setLyricSlot(bar, src, step, b);
            setLyricSlot(bar, dst, step, a);
        } else {
            var ra = slotRange(src, step);
            var rb = slotRange(dst, step);
            var evA = (bar.melody || []).filter(function (ev) { return ev.tick >= ra.start && ev.tick < ra.end; })[0] || null;
            var evB = (bar.melody || []).filter(function (ev) { return ev.tick >= rb.start && ev.tick < rb.end; })[0] || null;
            if (!evA && !evB) { setStatus('移動する内容がありません'); return; }
            if (evA) evA.tick = rb.start;
            if (evB) evB.tick = ra.start;
            // 移動後に小節からはみ出す伸ばしは切り詰める
            (bar.melody || []).forEach(function (ev) {
                if (ev.tick + (ev.durationTicks || 0) > barTicks()) {
                    ev.durationTicks = barTicks() - ev.tick;
                }
            });
            bar.melody.sort(function (x, y) { return x.tick - y.tick; });
        }
        renderSheet();
        refreshEditorValues();
        focusSlot(state.activeRow, dst);
        setStatus((state.activeRow === 'lyrics' ? '歌詞' : 'ドレミ') + 'を' + (dir > 0 ? '右' : '左') + 'へ移動しました');
    }

    /* ══════════ まとめて入力（自動分解） ══════════ */

    var SMALL_KANA = 'ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ';

    /**
     * 歌詞の自動分解。
     * スペース・「/」があれば明示区切り、なければモーラ分解
     * （小書き仮名は直前に結合、「っ」「ん」は独立、漢字は1文字1マス）。
     * 「・」=休符、「ー」「〜」=伸ばし（マスを消費して空ける）。
     * @returns {Array<{type:'text'|'rest'|'extend', value?:string}>}
     */
    function tokenizeLyrics(text) {
        var s = String(text || '').replace(/\n/g, ' ');
        var tokens = [];
        if (/[ 　\/／]/.test(s)) {
            s.split(/[ 　\/／]+/).forEach(function (seg) {
                if (!seg) return;
                if (seg === '・') tokens.push({ type: 'rest' });
                else if (isExtensionOnly(seg)) tokens.push({ type: 'extend' });
                else tokens.push({ type: 'text', value: seg });
            });
            return tokens;
        }
        for (var i = 0; i < s.length; i++) {
            var ch = s[i];
            if (ch === '・') { tokens.push({ type: 'rest' }); continue; }
            if (EXT_CHARS.indexOf(ch) !== -1) { tokens.push({ type: 'extend' }); continue; }
            if (SMALL_KANA.indexOf(ch) !== -1 && tokens.length > 0 &&
                tokens[tokens.length - 1].type === 'text') {
                tokens[tokens.length - 1].value += ch; // きゃ・しゅ・ちょ等は直前に結合
                continue;
            }
            tokens.push({ type: 'text', value: ch }); // っ・ん・漢字・その他は1文字1マス
        }
        return tokens;
    }

    /**
     * ドレミの自動分解。「・」=休符、それ以外は parseDoremiString に委譲
     * （音名・♯♭・↑↓・伸ばしは本番パーサの解釈をそのまま使う）。
     * @returns {{tokens: Array<{type:'rest'}|{type:'note', note:object}>, warnings: string[]}}
     */
    function tokenizeDoremi(text) {
        var s = String(text || '').replace(/\n/g, ' ');
        var tokens = [];
        var warnings = [];
        var buffer = '';
        function flush() {
            if (!buffer) return;
            var parsed = theory.parseDoremiString(buffer);
            warnings = warnings.concat(parsed.warnings);
            parsed.notes.forEach(function (note) { tokens.push({ type: 'note', note: note }); });
            buffer = '';
        }
        for (var i = 0; i < s.length; i++) {
            if (s[i] === '・') { flush(); tokens.push({ type: 'rest' }); }
            else buffer += s[i];
        }
        flush();
        return { tokens: tokens, warnings: warnings };
    }

    // 配置カーソル: 開始小節から順に流し、入った小節のその行は上書き（wipe-on-enter）
    function makePlacementCursor(rowKey) {
        var barNumber = state.selectedBar || 1;
        var wiped = {};
        var cursor = { barNumber: barNumber, slot: 0, done: false };
        cursor.ensureBar = function () {
            var bar = getBar(cursor.barNumber);
            if (!bar) { cursor.done = true; return null; }
            if (!wiped[cursor.barNumber]) {
                if (rowKey === 'lyrics') bar.lyrics = [];
                else bar.melody = [];
                wiped[cursor.barNumber] = true;
            }
            return bar;
        };
        cursor.advance = function (n) {
            cursor.slot += n;
            var res = resForBar(cursor.barNumber);
            while (cursor.slot >= res) {
                cursor.slot -= res;
                cursor.barNumber++;
                if (!getBar(cursor.barNumber)) { cursor.done = true; return; }
                res = resForBar(cursor.barNumber);
            }
        };
        return cursor;
    }

    function applyBulkLyrics() {
        var tokens = tokenizeLyrics(els.bulkLyrics.value);
        if (tokens.length === 0) { setStatus('配置する歌詞がありません'); return; }
        var cursor = makePlacementCursor('lyrics');
        var placed = 0;
        tokens.forEach(function (token) {
            if (cursor.done) return;
            var bar = cursor.ensureBar();
            if (!bar) return;
            var step = stepForRes(resForBar(cursor.barNumber));
            if (token.type === 'text') {
                setLyricSlot(bar, cursor.slot, step, token.value);
                placed++;
            }
            // rest / extend はマスを空けたまま送る
            cursor.advance(1);
        });
        renderSheet();
        rebuildEditor();
        setStatus('歌詞を' + placed + 'マスに配置しました' + (cursor.done ? '（最終小節で打ち切り）' : ''));
    }

    function applyBulkDoremi() {
        var result = tokenizeDoremi(els.bulkDoremi.value);
        if (result.tokens.length === 0) { setStatus('配置するドレミがありません'); return; }
        var cursor = makePlacementCursor('doremi');
        var placed = 0;
        result.tokens.forEach(function (token) {
            if (cursor.done) return;
            var bar = cursor.ensureBar();
            if (!bar) return;
            var res = resForBar(cursor.barNumber);
            var step = stepForRes(res);
            if (token.type === 'rest') {
                cursor.advance(1);
                return;
            }
            var lengthSlots = 1 + token.note.extensions;
            // 小節をまたぐ伸ばしは小節内で切る（タイは本実装で検討）
            var remain = res - cursor.slot;
            var useSlots = Math.min(lengthSlots, remain);
            bar.melody.push({
                tick: cursor.slot * step,
                durationTicks: useSlots * step,
                step: token.note.step,
                alter: token.note.alter,
                octave: token.note.octave
            });
            bar.melody.sort(function (a, b) { return a.tick - b.tick; });
            placed++;
            cursor.advance(lengthSlots);
        });
        renderSheet();
        rebuildEditor();
        var warnText = result.warnings.length ? '（' + result.warnings.join(' / ') + '）' : '';
        setStatus('ドレミを' + placed + '音配置しました' + warnText + (cursor.done ? '（最終小節で打ち切り）' : ''));
    }

    /* ══════════ ツールバー ══════════ */

    function setGlobalRes(res) {
        state.globalRes = res;
        els.res8.classList.toggle('is-active', res === 8);
        els.res16.classList.toggle('is-active', res === 16);
        applySelectionToSheet();
        rebuildEditor();
        setStatus('全体グリッドを' + res + '分にしました');
    }

    function toggleExpandBar() {
        if (!state.selectedBar) { setStatus('先に小節を選択してください'); return; }
        var n = state.selectedBar;
        if (state.barResOverride[n] === 16) {
            delete state.barResOverride[n];
            setStatus(n + '小節目の16分展開を解除しました（データに16分があれば16分のまま）');
        } else {
            state.barResOverride[n] = 16;
            setStatus(n + '小節目だけ16分に展開しました');
        }
        applySelectionToSheet();
        rebuildEditor();
        var input = slotInputs[state.activeRow][0];
        if (input) input.focus();
    }

    function exportJson() {
        var json = JSON.stringify(state.project, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'proto-slot-editor-project.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setStatus('プロトタイプのプロジェクトJSONを書き出しました（本番には保存していません）');
    }

    /* ══════════ 初期化 ══════════ */

    function init() {
        els.viewport = q('sheet-viewport');
        els.scaleBox = q('sheet-scale-box');
        els.slotRows = q('slot-rows');
        els.editorLabel = q('editor-bar-label');
        els.status = q('proto-status');
        els.res8 = q('res-8');
        els.res16 = q('res-16');
        els.bulkLyrics = q('bulk-lyrics');
        els.bulkDoremi = q('bulk-doremi');

        // 紙面クリック → 小節選択（クリック委譲。transform scale越しでも座標はブラウザが解決する）
        els.scaleBox.addEventListener('click', function (e) {
            var cell = e.target.closest('.sheet-bar');
            if (!cell || cell.classList.contains('sheet-bar--empty')) return;
            var index = barCells.indexOf(cell);
            if (index === -1) return;
            selectBar(index + 1);
        });

        els.res8.addEventListener('click', function () { setGlobalRes(8); });
        els.res16.addEventListener('click', function () { setGlobalRes(16); });
        q('expand-bar').addEventListener('click', toggleExpandBar);
        q('export-json').addEventListener('click', exportJson);
        q('move-left').addEventListener('click', function () { moveContent(-1); });
        q('move-right').addEventListener('click', function () { moveContent(1); });
        q('apply-lyrics').addEventListener('click', applyBulkLyrics);
        q('apply-doremi').addEventListener('click', applyBulkDoremi);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && document.activeElement &&
                !document.activeElement.classList.contains('proto-slot')) {
                if (state.selectedBar) clearSelection();
            }
        });
        window.addEventListener('resize', applyScale);

        renderSheet();
        rebuildEditor();
        setStatus('小節をクリックして選択してください');

        // 検証用（プロトタイプ限定の公開）
        window.__proto = {
            state: state,
            tokenizeLyrics: tokenizeLyrics,
            tokenizeDoremi: tokenizeDoremi,
            selectBar: selectBar,
            resForBar: resForBar
        };
        console.log('[Proto S0] slot-editor ready（localStorageには保存しません）');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
