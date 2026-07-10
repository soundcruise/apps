/* クルーズスタジオ — sheet-cruise.js（Phase 2B / R2、UI再編D1/D2/D3a/F1でレイアウトのみ改修）
   譜面クルーズ画面: プロジェクト選択・曲情報フォーム・キー関係チェック・
   セクション管理・小節グリッド（1小節1コード入力）・簡易プレビュー・保存。
   歌詞・ドレミ入力とA4紙面プレビューは Phase 2C / Phase 3。
   D1（docs/DECISIONS.md ADR-025）: 曲情報・セクション・表示設定・小節グリッドは
   上部ドロワー（#sc-editor-drawer）へ移動。
   D2 MVP（同ADR-025）: 小節上の極小overlay（S1b〜R2）を画面下部の横長ドックへ移設。
   D3a（同ADR-025 / ADR-026）: 巨大な縦積みフォーム型ドックを、選択小節と同じ時間軸を持つ
   コンパクトなタイムグリッド・ドックへ変更（「選択小節のX線写真」）。本格セル編集は
   ストローク行のみ。コードは1小節1セル、歌詞・ドレミは見た目だけ時間軸へ揃え、
   入力方式は現行の小節単位文字列入力のまま（tick位置セル分解はD3bで扱う）。
   まとめて入力はヘッダーのボタンから開くポップオーバー化。
   F1（ADR-027）: D3aのタイムグリッド編集はそのまま、表示方式を bottom固定の黒いドックから
   紙面デザイン（アイボリー・墨色・アンバー枠）の「フローティング小節ルーペ」へ変更。
   x/y自由配置・タイトルバードラッグ・右下ハンドルでの比例リサイズ・
   cruiseStudio.appSettings（barLoupeキー）への位置/幅保存を追加。
   保存/復元/JSON/プレDTM/MIDIの経路・データ構造は変更しない。
   グローバル名前空間 CruiseStudio.sheetCruise に登録する。 */
(function () {
    'use strict';

    function CS() { return window.CruiseStudio || {}; }

    // フォームのキー選択肢（normalizeKeyName が受ける表記に揃える）
    var KEY_OPTIONS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    // プレビューの1行あたり小節数は sheetSettings.barsPerLine（既定2）。
    // 歌詞もドレミもないセクション（前奏などのコードのみ）は2倍詰めで表示する。

    // D3a: ドックの行順とラベル（コード/ストロークは特別扱い、歌詞/ドレミは通常の文字列入力）
    var DOCK_ROW_ORDER = ['chord', 'strum', 'lyrics', 'doremi'];
    var DOCK_ROW_LABELS = { chord: 'コード', strum: 'ストローク', lyrics: '歌詞', doremi: 'ドレミ' };

    // D3a: ストロークセルのクリック循環順（空/restから開始）
    var STRUM_CELL_CYCLE = ['down', 'up', 'mute', 'rest'];
    var STRUM_GLYPHS = { down: '↓', up: '↑', mute: 'x', rest: '・', sustain: '〜' };

    // F1: フローティング小節ルーペのサイズ定数（docs/DECISIONS.md ADR-027）
    var LOUPE_BASE_WIDTH = 960;     // --bar-loupe-scale = 現在幅 / この値
    var LOUPE_DEFAULT_WIDTH = 960;
    var LOUPE_MIN_WIDTH = 680;
    var LOUPE_MAX_WIDTH = 1240;
    var LOUPE_MAX_WIDTH_MARGIN = 32;  // 最大幅は min(1240, viewportWidth - 32)
    var LOUPE_TOP_MARGIN = 8;         // topは8px以上
    var LOUPE_SIDE_VISIBLE = 120;     // 左右は最低120pxを画面内へ残す
    var LOUPE_HEADER_RESERVE = 56;    // タイトルバーが画面内に残るための下限余白
    var LOUPE_NARROW_BREAKPOINT = 680; // これ未満はPCファーストの安全フォールバック
    var LOUPE_NARROW_MARGIN = 28;
    var LOUPE_MOVE_STEP = 16;         // Alt+Shift+矢印キーでの移動量(px)
    var LOUPE_APP_SETTING_KEY = 'barLoupe';

    var state = {
        project: null,   // 編集中の StudioProject
        dirty: false,    // 未保存の変更があるか（TOP復帰時の中断確認に使う）
        selectedBarNumber: null,
        overlayFrame: null,
        overlayComposingRowId: null,
        overlayBulkComposing: false,
        overlayBulkMessage: null,
        overlayWarnings: {},
        dockManualRes: {},     // D3a: barNumber → 16（ユーザーが一時的に選んだ16分表示。保存しない）
        dockBulkOpen: false,   // D3a: まとめて入力ポップオーバーの開閉状態（UI一時状態）
        lastAutoScrollBar: null, // D3a: 自動スクロールを選択が変わった時だけ行うための直前値
        loupe: { x: 0, y: 0, width: LOUPE_DEFAULT_WIDTH } // F1: ルーペの位置/幅。UI状態のみ（projectに保存しない）
    };

    var els = {};

    function q(id) { return document.getElementById(id); }

    function resolveElements() {
        els.editorDrawer = q('sc-editor-drawer');
        els.barGridDrawer = q('sc-bar-grid-drawer');
        els.projectSelect = q('sc-project-select');
        els.newProjectBtn = q('sc-new-project');
        els.title = q('sc-title');
        els.artist = q('sc-artist');
        els.originalKey = q('sc-original-key');
        els.playKey = q('sc-play-key');
        els.capo = q('sc-capo');
        els.bpm = q('sc-bpm');
        els.timeSig = q('sc-time-sig');
        els.keyCheck = q('sc-key-check');
        els.saveBtn = q('sc-save');
        els.saveStatus = q('sc-save-status');
        els.printBtn = q('sc-print');
        els.exportBtn = q('sc-export-json');
        els.importInput = q('sc-import-json');
        els.sectionList = q('sc-section-list');
        els.addSectionBtn = q('sc-add-section');
        els.barGrid = q('sc-bar-grid');
        els.preview = q('sc-preview');
        els.scaleBox = q('sc-sheet-scale-box');
        els.slotOverlay = q('sc-slot-overlay');
        els.showChords = q('sc-show-chords');
        els.showLyrics = q('sc-show-lyrics');
        els.showDoremi = q('sc-show-doremi');
        els.showStrum = q('sc-show-strum');
        els.showGrid = q('sc-show-grid');
        els.gridResolution = q('sc-grid-resolution');
        els.basicStrum = q('sc-basic-strum');
    }

    function fillKeySelect(select) {
        select.innerHTML = '';
        KEY_OPTIONS.forEach(function (key) {
            var opt = document.createElement('option');
            opt.value = key;
            opt.textContent = key;
            select.appendChild(opt);
        });
    }

    /**
     * キー名を KEY_OPTIONS の表記へ寄せる（'C#' → 'Db' 等の異名同音も吸収する）。
     */
    function toOptionKey(keyName) {
        var theory = CS().theory;
        var semi = theory.keyToSemitone(keyName);
        if (semi === null) return null;
        for (var i = 0; i < KEY_OPTIONS.length; i++) {
            if (theory.keyToSemitone(KEY_OPTIONS[i]) === semi) return KEY_OPTIONS[i];
        }
        return null;
    }

    function setSelectKey(select, keyName) {
        select.value = toOptionKey(keyName) || 'C';
    }

    function setSaveStatus(message, isError) {
        if (!els.saveStatus) return;
        els.saveStatus.textContent = message || '';
        els.saveStatus.classList.toggle('is-error', !!isError);
    }

    function markDirty() {
        state.dirty = true;
        setSaveStatus('未保存の変更があります');
    }

    /* ══════════ プロジェクト管理 ══════════ */

    function refreshProjectSelect() {
        var storage = CS().storage;
        var projects = storage.listProjects();
        els.projectSelect.innerHTML = '';

        if (!state.project) return;

        var currentInList = projects.some(function (meta) {
            return meta.projectId === state.project.projectId;
        });
        // 未保存の新規プロジェクトは先頭に仮エントリとして出す
        if (!currentInList) {
            var draft = document.createElement('option');
            draft.value = state.project.projectId;
            draft.textContent = (state.project.songInfo.title || '無題') + '（未保存）';
            els.projectSelect.appendChild(draft);
        }
        projects.forEach(function (meta) {
            var opt = document.createElement('option');
            opt.value = meta.projectId;
            opt.textContent = meta.title + (meta.artist ? ' / ' + meta.artist : '');
            els.projectSelect.appendChild(opt);
        });
        els.projectSelect.value = state.project.projectId;
    }

    function renderAll() {
        renderForm();
        renderDisplayToggles();
        renderSections();
        renderBarGrid();
        renderPreview();
        refreshProjectSelect();
    }

    function setProject(project, options) {
        state.project = project;
        state.dirty = !!(options && options.dirty);
        state.selectedBarNumber = null;
        CS().storage.setCurrentProjectId(project.projectId);
        renderAll();
        setSaveStatus((options && options.statusMessage) || '');
    }

    function confirmDiscardIfDirty() {
        if (!state.dirty) return true;
        if (!window.confirm('保存されていない変更があります。破棄して続けますか？')) {
            return false;
        }
        // 破棄に同意したので未保存扱いを解除する（beforeunloadガードとの整合。
        // 次に画面へ入るときは enter() が保存済みデータから読み直す）
        state.dirty = false;
        return true;
    }

    function openProject(projectId) {
        var res = CS().storage.loadProject(projectId);
        if (!res.ok) {
            setSaveStatus(res.error, true);
            refreshProjectSelect(); // 選択を現状へ戻す
            return;
        }
        setProject(res.project, { statusMessage: '「' + res.project.songInfo.title + '」を開きました' });
    }

    function createNewProject() {
        if (!confirmDiscardIfDirty()) {
            refreshProjectSelect();
            return;
        }
        var project = CS().model.createEmptyProject();
        setProject(project, { dirty: true, statusMessage: '新規プロジェクトを作成しました（未保存）' });
    }

    /* ══════════ 曲情報フォーム ══════════ */

    function renderForm() {
        var si = state.project.songInfo;
        els.title.value = si.title || '';
        els.artist.value = si.artist || '';
        setSelectKey(els.originalKey, si.originalKey);
        setSelectKey(els.playKey, si.playKey);
        els.capo.value = si.capo;
        els.bpm.value = si.bpm;
        els.timeSig.value = si.timeSignature.beats + '/' + si.timeSignature.beatUnit;
        // 基本ストローク: slotsから記号列を再生成して表示（slotsが正。ADR-018）
        els.basicStrum.value = CS().model.getBasicStrumText(state.project);
        els.basicStrum.classList.remove('is-invalid');
        els.basicStrum.title = '';
        updateKeyCheck();
    }

    function readFormIntoProject() {
        var si = state.project.songInfo;
        si.title = els.title.value.trim() || '無題のプロジェクト';
        si.artist = els.artist.value.trim();
        si.originalKey = els.originalKey.value;
        si.playKey = els.playKey.value;

        var capo = parseInt(els.capo.value, 10);
        si.capo = (isNaN(capo) ? 0 : Math.min(11, Math.max(0, capo)));

        var bpm = parseInt(els.bpm.value, 10);
        si.bpm = (isNaN(bpm) ? 100 : Math.min(400, Math.max(20, bpm)));

        var sig = (els.timeSig.value || '4/4').split('/');
        si.timeSignature = {
            beats: parseInt(sig[0], 10) || 4,
            beatUnit: parseInt(sig[1], 10) || 4
        };
    }

    function onFieldChange() {
        readFormIntoProject();
        markDirty();
        updateKeyCheck();
        renderPreview();
    }

    /**
     * 基本ストローク入力（R1）。記号をslotsへ正規化して strumPatterns に保存する。
     * 入力欄の値は打鍵中には書き換えない（次の renderForm 時に正規化表示される）。
     */
    function onBasicStrumInput() {
        var res = CS().model.setBasicStrumText(state.project, els.basicStrum.value);
        els.basicStrum.classList.toggle('is-invalid', res.warnings.length > 0);
        els.basicStrum.title = res.warnings.join(' / ');
        markDirty();
        renderPreview();
    }

    /**
     * Playキー + カポ = ORGキー の関係チェック（DATA_MODEL.md 3章）。
     * ズレていても保存は妨げない（例外的な使い方を許容する）。
     */
    function updateKeyCheck() {
        var theory = CS().theory;
        var si = state.project.songInfo;
        var derived = theory.capoToOriginalKey(si.playKey, si.capo);

        if (derived === null) {
            els.keyCheck.textContent = 'キーまたはカポの値を確認してください';
            els.keyCheck.className = 'key-check is-warning';
            return;
        }
        if (theory.isKeyRelationConsistent(si.playKey, si.capo, si.originalKey)) {
            els.keyCheck.textContent = '✓ Playキー ' + si.playKey +
                (si.capo > 0 ? ' + カポ' + si.capo : '') + ' = ORGキー ' + si.originalKey;
            els.keyCheck.className = 'key-check is-ok';
        } else {
            els.keyCheck.textContent = '⚠ Playキー ' + si.playKey + ' + カポ' + si.capo +
                ' は実音 ' + derived + ' になり、ORGキー ' + si.originalKey +
                ' と一致しません（意図した設定ならこのまま保存できます）';
            els.keyCheck.className = 'key-check is-warning';
        }
    }

    /* ══════════ セクション管理 ══════════ */

    function renderSections() {
        var model = CS().model;
        els.sectionList.innerHTML = '';

        state.project.sections.forEach(function (sec) {
            var row = document.createElement('div');
            row.className = 'section-row';

            var nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'section-name-input';
            nameInput.value = sec.name;
            nameInput.setAttribute('aria-label', 'セクション名');
            nameInput.addEventListener('change', function () {
                model.renameSection(state.project, sec.id, nameInput.value);
                nameInput.value = state.project.sections.filter(function (s) { return s.id === sec.id; })[0].name;
                markDirty();
                renderBarGrid();
                renderPreview();
            });

            var countWrap = document.createElement('label');
            countWrap.className = 'section-bar-count-wrap';
            var countLabel = document.createElement('span');
            countLabel.textContent = '小節';
            var countInput = document.createElement('input');
            countInput.type = 'number';
            countInput.className = 'section-bar-count';
            countInput.min = '1';
            countInput.max = '64';
            countInput.step = '1';
            countInput.value = model.getSectionBarCount(state.project, sec.id);
            countInput.addEventListener('change', function () {
                model.setSectionBarCount(state.project, sec.id, parseInt(countInput.value, 10));
                countInput.value = model.getSectionBarCount(state.project, sec.id); // クランプ結果を反映
                markDirty();
                renderBarGrid();
                renderPreview();
            });
            countWrap.appendChild(countLabel);
            countWrap.appendChild(countInput);

            var deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'btn-mini btn-danger';
            deleteBtn.textContent = '削除';
            deleteBtn.addEventListener('click', function () {
                var barCount = model.getSectionBarCount(state.project, sec.id);
                if (!window.confirm('セクション「' + sec.name + '」（' + barCount + '小節）を削除しますか？')) return;
                var res = model.removeSection(state.project, sec.id);
                if (!res.ok) {
                    setSaveStatus(res.error, true);
                    return;
                }
                markDirty();
                renderSections();
                renderBarGrid();
                renderPreview();
            });

            row.appendChild(nameInput);
            row.appendChild(countWrap);
            row.appendChild(deleteBtn);
            els.sectionList.appendChild(row);
        });
    }

    function onAddSection() {
        CS().model.addSection(state.project, '新しいセクション', 4);
        markDirty();
        renderSections();
        renderBarGrid();
        renderPreview();
    }

    /* ══════════ 小節グリッド（1小節1コード: ADR-008） ══════════ */

    /**
     * コード入力欄の簡易検証。解釈できない表記は警告表示にするが入力は禁止しない。
     */
    function validateChordInput(input) {
        var theory = CS().theory;
        var value = input.value.trim();
        var invalid = (value !== '' && theory.parseBasicChordSymbol(value) === null);
        input.classList.toggle('is-invalid', invalid);
        input.title = invalid ? '解釈できないコード表記です（このまま保存はできます）' : '';
    }

    function renderBarGrid() {
        var model = CS().model;
        els.barGrid.innerHTML = '';

        state.project.sections.forEach(function (sec) {
            var bars = model.getSectionBars(state.project, sec.id);

            var sectionBlock = document.createElement('div');
            sectionBlock.className = 'bar-grid-section';

            var heading = document.createElement('div');
            heading.className = 'bar-grid-section-head';
            var headName = document.createElement('span');
            headName.className = 'bar-grid-section-name';
            headName.textContent = sec.name;
            var headRange = document.createElement('span');
            headRange.className = 'bar-grid-section-range';
            if (bars.length > 0) {
                headRange.textContent = bars[0].barNumber + '〜' + bars[bars.length - 1].barNumber + '小節';
            }
            heading.appendChild(headName);
            heading.appendChild(headRange);
            sectionBlock.appendChild(heading);

            var cells = document.createElement('div');
            cells.className = 'bar-grid-cells';

            bars.forEach(function (bar) {
                // .bar-cell: コード/歌詞/ドレミの3行構成（将来は拍位置入力へ拡張）
                var cell = document.createElement('div');
                cell.className = 'bar-cell';

                var num = document.createElement('span');
                num.className = 'bar-cell-num';
                num.textContent = bar.barNumber;

                var chordInput = document.createElement('input');
                chordInput.type = 'text';
                chordInput.className = 'bar-chord-input';
                chordInput.placeholder = 'コード';
                chordInput.setAttribute('aria-label', bar.barNumber + '小節目のコード');
                chordInput.value = (bar.chords[0] && bar.chords[0].symbol) || '';
                validateChordInput(chordInput);
                chordInput.addEventListener('input', function () {
                    CS().model.setBarChord(state.project, bar.barNumber, chordInput.value);
                    validateChordInput(chordInput);
                    markDirty();
                    renderPreview();
                });

                var lyricsInput = document.createElement('input');
                lyricsInput.type = 'text';
                lyricsInput.className = 'bar-lyrics-input';
                lyricsInput.placeholder = '歌詞';
                lyricsInput.setAttribute('aria-label', bar.barNumber + '小節目の歌詞');
                lyricsInput.value = CS().model.getBarLyricsText(bar);
                lyricsInput.addEventListener('input', function () {
                    CS().model.setBarLyricsText(state.project, bar.barNumber, lyricsInput.value);
                    markDirty();
                    renderPreview();
                });

                var doremiInput = document.createElement('input');
                doremiInput.type = 'text';
                doremiInput.className = 'bar-doremi-input';
                doremiInput.placeholder = 'ドレミ';
                doremiInput.setAttribute('aria-label', bar.barNumber + '小節目のドレミ');
                doremiInput.value = CS().model.getBarDoremiText(bar);
                doremiInput.addEventListener('input', function () {
                    var res = CS().model.setBarDoremiText(state.project, bar.barNumber, doremiInput.value);
                    doremiInput.classList.toggle('is-invalid', res.warnings.length > 0);
                    doremiInput.title = res.warnings.join(' / ');
                    markDirty();
                    renderPreview();
                });

                cell.appendChild(num);
                cell.appendChild(chordInput);
                cell.appendChild(lyricsInput);
                cell.appendChild(doremiInput);
                cells.appendChild(cell);
            });

            sectionBlock.appendChild(cells);
            els.barGrid.appendChild(sectionBlock);
        });
    }

    /* ══════════ A4紙面プレビュー（sheet-renderer.js が紙面DOMを構築。ADR-016） ══════════ */

    function renderPreview() {
        CS().sheetRenderer.render(state.project, els.scaleBox);
        updateSheetScale();
        syncSheetSelection();
        // 画面切替直後は clientWidth が 0 のことがあるため、表示後にもう一度合わせる
        scheduleOverlayPosition();
    }

    /**
     * A4紙面（794px幅）をプレビューペインの幅に合わせて縮小表示する。
     * transform はレイアウト寸法に影響しないため、ビューポートの高さはJSで確保する。
     */
    function updateSheetScale() {
        if (!els.preview || !els.scaleBox) return;
        var available = els.preview.clientWidth;
        if (!available) return;
        var scale = Math.min(1, available / 794);
        els.scaleBox.style.transform = 'scale(' + scale + ')';
        els.preview.style.height = Math.ceil(els.scaleBox.offsetHeight * scale) + 'px';
        positionSlotOverlay();
    }

    /* ══════════ S1b/S1c: A4紙面上の小節選択と編集overlay ══════════ */

    function getSheetBarByNumber(barNumber) {
        if (!els.scaleBox || !barNumber) return null;
        return els.scaleBox.querySelector('.sheet-bar[data-bar-number="' + barNumber + '"]');
    }

    function getSelectedBar() {
        if (!state.project || !state.selectedBarNumber) return null;
        return state.project.bars.filter(function (bar) {
            return bar.barNumber === state.selectedBarNumber;
        })[0] || null;
    }

    /**
     * D2: ドックヘッダーに表示するセクション名（分かる場合のみ）。
     */
    function getBarSectionName(bar) {
        if (!bar || !state.project || !Array.isArray(state.project.sections)) return '';
        var sec = state.project.sections.filter(function (s) { return s.id === bar.sectionId; })[0];
        return sec ? sec.name : '';
    }

    /**
     * D2: ドックの「閉じる」ボタン。選択解除してドックを閉じる
     * （紙面の小節を再クリックすれば同じ小節がまた選択され、ドックも再表示される）。
     */
    function deselectBar() {
        if (!state.selectedBarNumber) return;
        state.selectedBarNumber = null;
        state.overlayWarnings = {};
        state.overlayBulkMessage = null;
        syncSheetSelection();
    }

    function getOverlayFieldValue(rowId, bar) {
        if (rowId === 'chord') return (bar.chords[0] && bar.chords[0].symbol) || '';
        if (rowId === 'lyrics') return CS().model.getBarLyricsText(bar);
        if (rowId === 'doremi') return CS().model.getBarDoremiText(bar);
        return '';
    }

    function getOverlayPlaceholder(rowId) {
        if (rowId === 'chord') return 'コードを入力';
        if (rowId === 'lyrics') return '歌詞を入力';
        if (rowId === 'doremi') return 'ドレミを入力';
        return '';
    }

    function getOverlayNote(rowId) {
        var warnings = state.overlayWarnings[rowId] || [];
        if (warnings.length > 0) return { text: warnings.join(' / '), tone: 'warning' };
        return null;
    }

    function buildOverlayNote(rowId, bar) {
        var noteInfo = getOverlayNote(rowId, bar);
        if (!noteInfo) return null;
        var note = document.createElement('span');
        note.className = 'slot-overlay-row-note slot-overlay-row-note--' + noteInfo.tone;
        note.textContent = noteInfo.text;
        return note;
    }

    function captureOverlayFocus(rowId, input) {
        var active = document.activeElement;
        if (!input || active !== input) return null;
        return {
            rowId: rowId,
            value: input.value,
            selectionStart: typeof input.selectionStart === 'number' ? input.selectionStart : null,
            selectionEnd: typeof input.selectionEnd === 'number' ? input.selectionEnd : null
        };
    }

    function restoreOverlayFocus(snapshot) {
        if (!snapshot || !els.slotOverlay) return;
        var field = els.slotOverlay.querySelector('[data-overlay-field="' + snapshot.rowId + '"]');
        if (!field) return;
        field.focus({ preventScroll: true });
        if (field.value !== snapshot.value) field.value = snapshot.value;
        if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
            try {
                field.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
            } catch (_) {
                // テキスト入力以外に拡張された場合の保険。
            }
        }
    }

    function restoreOverlayFocusAfterRender(snapshot) {
        restoreOverlayFocus(snapshot);
        window.requestAnimationFrame(function () {
            restoreOverlayFocus(snapshot);
        });
    }

    function syncBarGridInput(rowId, barNumber, value, warnings) {
        if (rowId === 'strum') return;
        var className = rowId === 'chord' ? 'bar-chord-input' :
            (rowId === 'lyrics' ? 'bar-lyrics-input' : 'bar-doremi-input');
        var labelText = rowId === 'chord' ? 'コード' :
            (rowId === 'lyrics' ? '歌詞' : 'ドレミ');
        var input = els.barGrid && els.barGrid.querySelector(
            '.' + className + '[aria-label="' + barNumber + '小節目の' + labelText + '"]'
        );
        if (!input) return;
        input.value = value;
        if (rowId === 'chord') {
            validateChordInput(input);
        } else if (rowId === 'doremi') {
            input.classList.toggle('is-invalid', !!(warnings && warnings.length));
            input.title = (warnings || []).join(' / ');
        }
    }

    function applyOverlayFieldChange(rowId, input, options) {
        var bar = getSelectedBar();
        if (!bar || !input) return;
        var isComposing = options && options.composing;
        var skipRender = options && options.skipRender;
        var warnings = [];

        if (rowId === 'chord') {
            CS().model.setBarChord(state.project, bar.barNumber, input.value);
            validateChordInput(input);
            state.overlayWarnings[rowId] = input.classList.contains('is-invalid') ?
                [input.title] : [];
        } else if (rowId === 'lyrics') {
            CS().model.setBarLyricsText(state.project, bar.barNumber, input.value);
            state.overlayWarnings[rowId] = [];
        } else if (rowId === 'doremi') {
            warnings = CS().model.setBarDoremiText(state.project, bar.barNumber, input.value).warnings;
            state.overlayWarnings[rowId] = warnings;
            input.classList.toggle('is-invalid', warnings.length > 0);
            input.title = warnings.join(' / ');
        } else {
            return;
        }

        markDirty();
        syncBarGridInput(rowId, bar.barNumber, input.value, warnings);
        if (isComposing || skipRender) return;

        var snapshot = captureOverlayFocus(rowId, input);
        renderPreview();
        restoreOverlayFocusAfterRender(snapshot);
    }

    function buildOverlayInput(rowDef, bar) {
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'slot-overlay-input';
        input.placeholder = getOverlayPlaceholder(rowDef.id, bar);
        input.value = getOverlayFieldValue(rowDef.id, bar);
        input.dataset.overlayField = rowDef.id;
        input.setAttribute('aria-label', bar.barNumber + '小節目の' + rowDef.label);
        if (rowDef.id === 'chord') {
            validateChordInput(input);
        } else if (rowDef.id === 'doremi') {
            var warnings = state.overlayWarnings[rowDef.id] || [];
            input.classList.toggle('is-invalid', warnings.length > 0);
            input.title = warnings.join(' / ');
        }

        input.addEventListener('compositionstart', function () {
            state.overlayComposingRowId = rowDef.id;
        });
        input.addEventListener('compositionend', function () {
            state.overlayComposingRowId = null;
            applyOverlayFieldChange(rowDef.id, input);
        });
        input.addEventListener('input', function (event) {
            applyOverlayFieldChange(rowDef.id, input, {
                composing: !!(event.isComposing || state.overlayComposingRowId === rowDef.id)
            });
        });
        input.addEventListener('keydown', function (event) {
            event.stopPropagation();
            if (event.isComposing || state.overlayComposingRowId === rowDef.id) return;
            if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
            event.preventDefault();
            applyOverlayFieldChange(rowDef.id, input, { skipRender: true });
            moveSelectedBar(event.key === 'ArrowLeft' ? -1 : 1, { focusRowId: rowDef.id });
        });
        input.addEventListener('click', function (event) {
            event.stopPropagation();
        });
        input.addEventListener('mousedown', function (event) {
            event.stopPropagation();
        });
        return input;
    }

    function getSelectedBarIndex() {
        if (!state.project || !state.selectedBarNumber) return -1;
        for (var i = 0; i < state.project.bars.length; i++) {
            if (state.project.bars[i].barNumber === state.selectedBarNumber) return i;
        }
        return -1;
    }

    function getMoveTarget(delta) {
        if (!state.project || !Array.isArray(state.project.bars) || state.project.bars.length === 0) return null;
        var index = getSelectedBarIndex();
        if (index < 0) return null;
        var nextIndex = Math.max(0, Math.min(state.project.bars.length - 1, index + delta));
        return state.project.bars[nextIndex] || null;
    }

    function focusOverlayField(rowId) {
        if (!rowId || !els.slotOverlay) return;
        window.requestAnimationFrame(function () {
            var field = els.slotOverlay.querySelector('[data-overlay-field="' + rowId + '"]');
            if (!field) return;
            if (rowId === 'strum') {
                // strum行はinputではなくセルグリッド（.dock-strum-grid）。先頭セルへフォーカスする
                var firstCell = field.querySelector('.dock-strum-cell');
                if (firstCell) firstCell.focus({ preventScroll: true });
                return;
            }
            field.focus({ preventScroll: true });
        });
    }

    function moveSelectedBar(delta, options) {
        var target = getMoveTarget(delta);
        if (!target || target.barNumber === state.selectedBarNumber) return;
        state.selectedBarNumber = target.barNumber;
        state.overlayWarnings = {};
        state.overlayBulkMessage = null;
        syncSheetSelection();
        if (options && options.focusRowId) focusOverlayField(options.focusRowId);
    }

    function commitActiveOverlayInput(options) {
        if (!els.slotOverlay) return null;
        var active = document.activeElement;
        if (!active) return null;
        if (active.dataset && active.dataset.overlayField) {
            applyOverlayFieldChange(active.dataset.overlayField, active, options || { skipRender: true });
            return active.dataset.overlayField;
        }
        // D3a: ストロークセルは編集のたびに即保存されているため、ここではフォーカス先だけ伝える
        if (active.classList && active.classList.contains('dock-strum-cell')) {
            return 'strum';
        }
        return null;
    }

    function buildOverlayNavButton(label, delta) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'slot-overlay-nav-btn';
        button.textContent = label;
        button.disabled = !getMoveTarget(delta) || getMoveTarget(delta).barNumber === state.selectedBarNumber;
        button.addEventListener('click', function (event) {
            event.stopPropagation();
            var focusRowId = commitActiveOverlayInput({ skipRender: true });
            moveSelectedBar(delta, { focusRowId: focusRowId });
        });
        button.addEventListener('mousedown', function (event) {
            event.stopPropagation();
        });
        button.addEventListener('keydown', function (event) {
            event.stopPropagation();
        });
        return button;
    }

    /* ══════════ D3a: 下部ドックのタイムグリッド（拍ルーラー・ストロークセル編集） ══════════
       Fable5レビュー「選択小節のX線写真」方針。紙面と同じ段順（コード/ストローク/歌詞/ドレミ）を
       選択小節の時間軸のまま横に拡大する。本格的にセル編集するのはストローク行のみ。
       コードは1小節1コードの大きな1セル、歌詞・ドレミは見た目だけ時間軸に揃えた1つの入力欄
       （tick位置セルへの分解はD3bで扱う）。 */

    function getBeats(project) {
        var ts = project && project.songInfo && project.songInfo.timeSignature;
        return (ts && typeof ts.beats === 'number' && ts.beats > 0) ? ts.beats : 4;
    }

    /**
     * 境界線（セル右端）の強弱class。紙面のタイミンググリッド（sheet-renderer.js内の
     * buildTimingGridと同じ判定基準）に合わせる: 小節端 ＞ 拍頭 ＞ 8分位置 ＞ 16分位置。
     */
    function timelineBoundaryClass(boundary, res, slotsPerBeat) {
        if (boundary >= res) return 'is-barend';
        if (boundary % slotsPerBeat === 0) return 'is-beat';
        if (res === 16) return (boundary % 2 === 0) ? 'is-8th' : 'is-16th';
        return 'is-8th';
    }

    /**
     * 小節のストローク表示解像度（8 or 16）。
     * 「データから必要な解像度」（16分位置のslotsを含むか）と
     * 「ユーザーが一時的に選んだ解像度」（state.dockManualRes。barNumberごとに保持。
     * _proto/slot-editor.js の barResOverride と同じ思想でUI一時状態のみ）の大きい方を使う。
     */
    function getStrumGridResolution(bar) {
        var slots = CS().model.getBarEffectiveStrumSlots(state.project, bar.barNumber);
        var dataRes = (slots && CS().sheetRenderer.strumNeedsSixteenth(slots)) ? 16 : 8;
        var manualRes = (state.dockManualRes[bar.barNumber] === 16) ? 16 : 8;
        return Math.max(dataRes, manualRes);
    }

    function isStrumGridForcedSixteenth(bar) {
        var slots = CS().model.getBarEffectiveStrumSlots(state.project, bar.barNumber);
        return !!(slots && CS().sheetRenderer.strumNeedsSixteenth(slots));
    }

    /**
     * 実効ストロークslots（override優先、無ければ基本継承）を、指定解像度のセル配列へ変換する。
     * 各要素は 'rest' | 'down' | 'up' | 'mute' | 'sustain'（直前セルの伸ばし継続）。
     */
    function buildStrumGridActions(bar, res) {
        var model = CS().model;
        var barTicks = model.getBarLengthTicks(state.project);
        var slotTicks = barTicks / res;
        var slots = model.getBarEffectiveStrumSlots(state.project, bar.barNumber) || [];
        var actions = [];
        for (var i = 0; i < res; i++) actions.push('rest');
        slots.forEach(function (ev) {
            var idx = Math.round(ev.tick / slotTicks);
            if (idx < 0 || idx >= res) return;
            if (ev.action === 'down' || ev.action === 'up' || ev.action === 'mute') actions[idx] = ev.action;
            var len = Math.max(1, Math.round((ev.durationTicks || slotTicks) / slotTicks));
            for (var e = 1; e < len && idx + e < res; e++) {
                if (actions[idx + e] === 'rest') actions[idx + e] = 'sustain';
            }
        });
        return actions;
    }

    /**
     * セル配列から保存用のslots配列を作る。連続する'sustain'は直前の実音セルの
     * durationTicksを延長する（既存のテキスト入力パーサーと同じ「直前を伸ばす」思想）。
     */
    function buildStrumSlotsFromActions(res, actions) {
        var barTicks = CS().model.getBarLengthTicks(state.project);
        var slotTicks = barTicks / res;
        var slots = [];
        var i = 0;
        while (i < res) {
            var action = actions[i];
            if (action === 'down' || action === 'up' || action === 'mute') {
                var dur = slotTicks;
                var j = i + 1;
                while (j < res && actions[j] === 'sustain') { dur += slotTicks; j++; }
                slots.push({ tick: i * slotTicks, action: action, accent: false, durationTicks: dur });
                i = j;
            } else {
                i++;
            }
        }
        return slots;
    }

    function nextStrumCellAction(current) {
        var idx = STRUM_CELL_CYCLE.indexOf(current);
        if (idx === -1) return 'down'; // rest / sustain / 未設定 は down から開始
        return STRUM_CELL_CYCLE[(idx + 1) % STRUM_CELL_CYCLE.length];
    }

    function focusStrumCellAfterRender(index) {
        window.requestAnimationFrame(function () {
            if (!els.slotOverlay) return;
            var cell = els.slotOverlay.querySelector('.dock-strum-cell[data-cell-index="' + index + '"]');
            if (cell) cell.focus({ preventScroll: true });
        });
    }

    function focusStrumCellByIndex(index) {
        if (!els.slotOverlay) return;
        var grid = els.slotOverlay.querySelector('.dock-strum-grid');
        if (!grid) return;
        var cells = grid.querySelectorAll('.dock-strum-cell');
        if (cells.length === 0) return;
        var clamped = Math.max(0, Math.min(cells.length - 1, index));
        cells[clamped].focus({ preventScroll: true });
    }

    /**
     * ストロークセル1つを変更して保存する。基本ストローク継承中（override未作成）の
     * 小節は、現在の継承内容を丸ごとコピーしたうえで1セルだけ変えた形で
     * setBarStrumSlots() に渡す＝これが「最初の編集で小節専用override化」になる。
     */
    function applyStrumCellAction(bar, res, index, action, focusIndex) {
        var actions = buildStrumGridActions(bar, res);
        if (index < 0 || index >= actions.length) return;
        actions[index] = action;
        var slots = buildStrumSlotsFromActions(res, actions);
        CS().model.setBarStrumSlots(state.project, bar.barNumber, slots);
        markDirty();
        renderPreview();
        focusStrumCellAfterRender(typeof focusIndex === 'number' ? focusIndex : index);
    }

    /**
     * 「基本に戻す」。override を外して基本ストロークの継承へ戻す
     * （setBarStrumSlotsに空配列を渡すと override=null になる既存挙動を利用）。
     */
    function resetBarStrumOverride(bar) {
        CS().model.setBarStrumSlots(state.project, bar.barNumber, []);
        markDirty();
        renderPreview();
    }

    function onStrumCellKeydown(event, bar, res, index, currentAction) {
        if (event.isComposing) return;
        var key = event.key;

        if (event.altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
            event.preventDefault();
            moveSelectedBar(key === 'ArrowLeft' ? -1 : 1, { focusRowId: 'strum' });
            return;
        }
        if (key === 'ArrowRight') {
            event.preventDefault();
            focusStrumCellByIndex(index + 1);
            return;
        }
        if (key === 'ArrowLeft') {
            event.preventDefault();
            focusStrumCellByIndex(index - 1);
            return;
        }
        if (key === 'd' || key === 'D') {
            event.preventDefault();
            applyStrumCellAction(bar, res, index, 'down');
            return;
        }
        if (key === 'u' || key === 'U') {
            event.preventDefault();
            applyStrumCellAction(bar, res, index, 'up');
            return;
        }
        if (key === 'x' || key === 'X') {
            event.preventDefault();
            applyStrumCellAction(bar, res, index, 'mute');
            return;
        }
        if (key === ' ' || key === 'Spacebar') {
            // ネイティブのbutton click（=セル循環）を誘発しないよう、rest確定はこちらで処理する
            event.preventDefault();
            applyStrumCellAction(bar, res, index, 'rest');
            return;
        }
        if (key === 'Delete' || key === 'Backspace') {
            event.preventDefault();
            applyStrumCellAction(bar, res, index, 'rest');
            return;
        }
        if (key === 'Enter') {
            event.preventDefault();
            applyStrumCellAction(bar, res, index, nextStrumCellAction(currentAction), index + 1);
            return;
        }
        // Tab / Shift+Tab はブラウザ標準のフォーカス移動に任せる（セルはbuttonなので隣へ自然に移る）
        event.stopPropagation();
    }

    function buildStrumGridRow(bar, res) {
        var actions = buildStrumGridActions(bar, res);
        var slotsPerBeat = res / getBeats(state.project);
        var inherited = !bar.strumOverride; // 基本ストローク継承中（override未作成）はゴースト表示

        var wrap = document.createElement('div');
        wrap.className = 'dock-strum-grid' + (inherited ? ' is-inherited' : '');
        wrap.dataset.overlayField = 'strum';
        wrap.title = getStrumGridStatusText(bar);
        wrap.style.gridTemplateColumns = 'repeat(' + res + ', 1fr)';

        actions.forEach(function (action, index) {
            var cell = document.createElement('button');
            cell.type = 'button';
            var boundary = index + 1;
            cell.className = 'dock-strum-cell is-' + action + ' ' +
                timelineBoundaryClass(boundary, res, slotsPerBeat);
            cell.textContent = STRUM_GLYPHS[action] || '・';
            cell.dataset.cellIndex = String(index);
            cell.setAttribute('aria-label', bar.barNumber + '小節目 ストローク ' +
                (index + 1) + 'マス目（' + (STRUM_GLYPHS[action] || '・') + '）');
            cell.addEventListener('click', function (event) {
                event.stopPropagation();
                applyStrumCellAction(bar, res, index, nextStrumCellAction(action));
            });
            cell.addEventListener('mousedown', function (event) { event.stopPropagation(); });
            cell.addEventListener('keydown', function (event) {
                onStrumCellKeydown(event, bar, res, index, action);
            });
            wrap.appendChild(cell);
        });
        return wrap;
    }

    /**
     * ストローク行の状態メモ（基本継承中 / override中 / 空）。
     * 行の高さを消費しないよう、常時表示のテキストではなく title（ツールチップ）にする。
     * ゴースト表示（.is-inherited）と「基本に戻す」ボタンの有無で視覚的にも状態が分かる。
     */
    function getStrumGridStatusText(bar) {
        var basic = CS().model.getBasicStrumText(state.project);
        if (bar.strumOverride) return '小節別に編集中（基本ストロークとは別内容）。「基本に戻す」で継承へ戻せます';
        if (basic) return '基本ストロークを継承表示中。セルを編集すると小節専用になります';
        return 'まだ何も入力されていません。セルをクリックまたはキーボードで入力できます';
    }

    function buildBeatRuler(bar, res) {
        var beats = getBeats(state.project);
        var slotsPerBeat = res / beats;

        var ruler = document.createElement('div');
        ruler.className = 'slot-overlay-ruler';

        var spacer = document.createElement('span');
        spacer.className = 'slot-overlay-ruler-label';
        ruler.appendChild(spacer);

        var track = document.createElement('div');
        track.className = 'slot-overlay-ruler-track';
        track.style.gridTemplateColumns = 'repeat(' + res + ', 1fr)';
        for (var i = 0; i < res; i++) {
            var cell = document.createElement('span');
            var boundary = i + 1;
            cell.className = 'slot-overlay-ruler-cell ' + timelineBoundaryClass(boundary, res, slotsPerBeat);
            if (i % slotsPerBeat === 0) {
                cell.classList.add('is-beat-head');
                cell.textContent = String(Math.floor(i / slotsPerBeat) + 1);
            } else if (res === 8 && slotsPerBeat === 2 && i % slotsPerBeat === 1) {
                cell.classList.add('is-offbeat-dot');
            }
            track.appendChild(cell);
        }
        ruler.appendChild(track);
        return ruler;
    }

    function buildResolutionToggle(bar) {
        var res = getStrumGridResolution(bar);
        var forced = isStrumGridForcedSixteenth(bar);

        var wrap = document.createElement('div');
        wrap.className = 'slot-overlay-res-toggle';

        var btn8 = document.createElement('button');
        btn8.type = 'button';
        btn8.className = 'slot-overlay-res-btn';
        btn8.textContent = '8分';
        btn8.classList.toggle('is-active', res === 8);
        btn8.disabled = forced;
        btn8.title = forced ? 'ストロークに16分位置があるため8分表示にはできません' : '';
        btn8.addEventListener('click', function (event) {
            event.stopPropagation();
            delete state.dockManualRes[bar.barNumber];
            renderSlotOverlayContent();
            positionSlotOverlay();
        });

        var btn16 = document.createElement('button');
        btn16.type = 'button';
        btn16.className = 'slot-overlay-res-btn';
        btn16.textContent = '16分';
        btn16.classList.toggle('is-active', res === 16);
        btn16.addEventListener('click', function (event) {
            event.stopPropagation();
            state.dockManualRes[bar.barNumber] = 16;
            renderSlotOverlayContent();
            positionSlotOverlay();
        });

        [btn8, btn16].forEach(function (b) {
            b.addEventListener('mousedown', function (event) { event.stopPropagation(); });
        });

        wrap.appendChild(btn8);
        wrap.appendChild(btn16);
        return wrap;
    }

    /* ══════════ D3a: 自動スクロール（選択小節がドック裏へ隠れないようにする） ══════════ */

    function scrollSelectedBarIntoDockView(barNumber) {
        var cell = getSheetBarByNumber(barNumber);
        if (!cell || !els.slotOverlay || els.slotOverlay.classList.contains('hidden')) return;
        var dockRect = els.slotOverlay.getBoundingClientRect();
        var cellRect = cell.getBoundingClientRect();
        var margin = 16;
        if (cellRect.bottom > dockRect.top - margin) {
            window.scrollBy({ top: cellRect.bottom - (dockRect.top - margin), behavior: 'smooth' });
        } else if (cellRect.top < 0) {
            window.scrollBy({ top: cellRect.top - margin, behavior: 'smooth' });
        }
    }

    /**
     * 選択小節が変わった時だけ自動スクロールする（入力中の再描画毎には行わない）。
     */
    function maybeAutoScrollToSelection() {
        if (state.selectedBarNumber === state.lastAutoScrollBar) return;
        state.lastAutoScrollBar = state.selectedBarNumber;
        if (!state.selectedBarNumber) return;
        var barNumber = state.selectedBarNumber;
        window.requestAnimationFrame(function () {
            scrollSelectedBarIntoDockView(barNumber);
        });
    }

    /* ══════════ F1: フローティング小節ルーペの位置・サイズ（docs/DECISIONS.md ADR-027） ══════════
       「選択小節そのものを拡大した、紙面の上に浮かぶもう一枚の紙」。
       position: fixed のまま bottom固定をやめ、x/y座標で自由配置する。
       位置・幅はUI状態としてのみ扱い、projectデータ・schemaVersionには影響しない。
       cruiseStudio.appSettings の barLoupe キーへ保存する（storage.getAppSetting/setAppSetting）。 */

    function isNarrowViewport() {
        return window.innerWidth < LOUPE_NARROW_BREAKPOINT;
    }

    /**
     * ルーペ幅のクランプ。狭い画面（680px未満）では画面幅に合わせた固定幅を強制する
     * （PCファースト。モバイル最適化は大規模には行わない）。
     */
    function clampLoupeWidth(width) {
        var vw = window.innerWidth;
        if (isNarrowViewport()) {
            return Math.max(280, vw - LOUPE_NARROW_MARGIN);
        }
        var maxW = Math.min(LOUPE_MAX_WIDTH, vw - LOUPE_MAX_WIDTH_MARGIN);
        var minW = Math.min(LOUPE_MIN_WIDTH, maxW);
        var w = (typeof width === 'number' && isFinite(width)) ? width : LOUPE_DEFAULT_WIDTH;
        return Math.max(minW, Math.min(maxW, w));
    }

    /**
     * 水平位置のクランプ。左右は最低120px程度を画面内へ残せば足り、
     * 完全に画面外へ出ることだけを防ぐ（タイトルバーの端を掴んで引き戻せる状態を保つ）。
     */
    function clampLoupeX(x, width) {
        var vw = window.innerWidth;
        var minX = LOUPE_SIDE_VISIBLE - width;
        var maxX = vw - LOUPE_SIDE_VISIBLE;
        if (minX > maxX) return Math.round((vw - width) / 2);
        var v = (typeof x === 'number' && isFinite(x)) ? x : (vw - width) / 2;
        return Math.round(Math.max(minX, Math.min(maxX, v)));
    }

    /**
     * 垂直位置のクランプ。topは8px以上、下端はタイトルバー（閉じるボタン含む）が
     * 必ず画面内に残る位置までに制限する。
     */
    function clampLoupeY(y) {
        var vh = window.innerHeight;
        var minY = LOUPE_TOP_MARGIN;
        var maxY = Math.max(minY, vh - LOUPE_HEADER_RESERVE);
        var v = (typeof y === 'number' && isFinite(y)) ? y : minY;
        return Math.round(Math.max(minY, Math.min(maxY, v)));
    }

    function loadLoupeSettings() {
        var storage = CS().storage;
        if (!storage || !storage.getAppSetting) return null;
        var saved = storage.getAppSetting(LOUPE_APP_SETTING_KEY);
        if (!saved || typeof saved !== 'object') return null;
        if (typeof saved.x !== 'number' || typeof saved.y !== 'number' || typeof saved.width !== 'number' ||
            !isFinite(saved.x) || !isFinite(saved.y) || !isFinite(saved.width)) {
            return null; // 壊れた値・異常値は無視して初期値へ戻す
        }
        return { x: saved.x, y: saved.y, width: saved.width };
    }

    function saveLoupeSettings() {
        var storage = CS().storage;
        if (!storage || !storage.setAppSetting) return;
        storage.setAppSetting(LOUPE_APP_SETTING_KEY, {
            x: state.loupe.x, y: state.loupe.y, width: state.loupe.width
        });
    }

    /**
     * 起動時に1度だけ呼ぶ。保存済み位置があれば復元（現在の画面サイズへクランプ）、
     * なければ初期位置（水平中央・垂直はやや下寄り）を計算する。
     */
    function initLoupeGeometry() {
        var saved = loadLoupeSettings();
        var width = clampLoupeWidth(saved ? saved.width : LOUPE_DEFAULT_WIDTH);
        var x, y;
        if (saved) {
            x = clampLoupeX(saved.x, width);
            y = clampLoupeY(saved.y);
        } else {
            x = clampLoupeX((window.innerWidth - width) / 2, width);
            y = clampLoupeY(window.innerHeight * 0.52);
        }
        state.loupe = { x: x, y: y, width: width };
    }

    /**
     * state.loupe を実DOMへ反映する。#sc-slot-overlay はrenderSlotOverlayContent()が
     * innerHTML='' で子要素だけを作り直すため、この関数はルート要素自身のインラインstyle
     * （left/top/width/--bar-loupe-scale）を書くだけでよく、再描画のたびに呼んでも安全。
     */
    function applyLoupeGeometry() {
        if (!els.slotOverlay) return;
        els.slotOverlay.style.left = state.loupe.x + 'px';
        els.slotOverlay.style.top = state.loupe.y + 'px';
        els.slotOverlay.style.width = state.loupe.width + 'px';
        els.slotOverlay.style.setProperty('--bar-loupe-scale', String(state.loupe.width / LOUPE_BASE_WIDTH));
        els.slotOverlay.classList.toggle('slot-overlay--narrow', isNarrowViewport());
    }

    /**
     * ウィンドウリサイズ時の再クランプ（幅→位置の順）。幅が変わった場合はappSettingsも
     * 補正後の値へ更新する（仕様上「更新してよい」とされているため、ずれを溜め込まない）。
     */
    function reclampLoupeOnResize() {
        if (!els.slotOverlay) return;
        var newWidth = clampLoupeWidth(state.loupe.width);
        var widthChanged = newWidth !== state.loupe.width;
        state.loupe.width = newWidth;
        state.loupe.x = clampLoupeX(state.loupe.x, newWidth);
        state.loupe.y = clampLoupeY(state.loupe.y);
        applyLoupeGeometry();
        if (widthChanged) saveLoupeSettings();
    }

    // ドラッグを開始しない要素（ボタン・入力欄・ポップオーバー・リサイズハンドル等）
    var LOUPE_DRAG_IGNORE_SELECTOR =
        'button, input, select, textarea, a, .slot-overlay-bulk-popover, .slot-overlay-resize-handle';

    function onLoupeHeaderPointerDown(event) {
        if (event.button !== undefined && event.button !== 0) return;
        if (event.target.closest && event.target.closest(LOUPE_DRAG_IGNORE_SELECTOR)) return;
        event.preventDefault();
        var header = event.currentTarget;
        var pointerId = event.pointerId;
        var startX = event.clientX;
        var startY = event.clientY;
        var originX = state.loupe.x;
        var originY = state.loupe.y;
        try { header.setPointerCapture(pointerId); } catch (_) { /* ignore */ }
        document.body.classList.add('loupe-dragging');

        function onMove(e) {
            if (e.pointerId !== pointerId) return;
            state.loupe.x = clampLoupeX(originX + (e.clientX - startX), state.loupe.width);
            state.loupe.y = clampLoupeY(originY + (e.clientY - startY));
            applyLoupeGeometry();
        }
        function onUp(e) {
            if (e.pointerId !== pointerId) return;
            try { header.releasePointerCapture(pointerId); } catch (_) { /* ignore */ }
            header.removeEventListener('pointermove', onMove);
            header.removeEventListener('pointerup', onUp);
            header.removeEventListener('pointercancel', onUp);
            document.body.classList.remove('loupe-dragging');
            saveLoupeSettings();
        }
        header.addEventListener('pointermove', onMove);
        header.addEventListener('pointerup', onUp);
        header.addEventListener('pointercancel', onUp);
    }

    /**
     * タイトルバーへのキーボード移動代替: Alt+Shift+矢印で16pxずつ移動する。
     */
    function onLoupeHeaderKeydown(event) {
        if (event.isComposing) return;
        if (!event.altKey || !event.shiftKey) return;
        var dx = 0, dy = 0;
        if (event.key === 'ArrowLeft') dx = -LOUPE_MOVE_STEP;
        else if (event.key === 'ArrowRight') dx = LOUPE_MOVE_STEP;
        else if (event.key === 'ArrowUp') dy = -LOUPE_MOVE_STEP;
        else if (event.key === 'ArrowDown') dy = LOUPE_MOVE_STEP;
        else return;
        event.preventDefault();
        state.loupe.x = clampLoupeX(state.loupe.x + dx, state.loupe.width);
        state.loupe.y = clampLoupeY(state.loupe.y + dy);
        applyLoupeGeometry();
        saveLoupeSettings();
    }

    /**
     * 右下ハンドルでの比例リサイズ。幅だけをドラッグで変え、--bar-loupe-scaleの更新を通じて
     * フォントサイズ・行高さ・セル等がCSS側で比例拡大縮小する（高さは内容に応じた自動のまま）。
     */
    function onLoupeResizePointerDown(event) {
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        var handle = event.currentTarget;
        var pointerId = event.pointerId;
        var startX = event.clientX;
        var startWidth = state.loupe.width;
        try { handle.setPointerCapture(pointerId); } catch (_) { /* ignore */ }
        document.body.classList.add('loupe-resizing');

        function onMove(e) {
            if (e.pointerId !== pointerId) return;
            var newWidth = clampLoupeWidth(startWidth + (e.clientX - startX));
            state.loupe.width = newWidth;
            state.loupe.x = clampLoupeX(state.loupe.x, newWidth);
            applyLoupeGeometry();
        }
        function onUp(e) {
            if (e.pointerId !== pointerId) return;
            try { handle.releasePointerCapture(pointerId); } catch (_) { /* ignore */ }
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.removeEventListener('pointercancel', onUp);
            document.body.classList.remove('loupe-resizing');
            saveLoupeSettings();
        }
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onUp);
    }

    function buildLoupeResizeHandle() {
        var handle = document.createElement('div');
        handle.className = 'slot-overlay-resize-handle';
        handle.setAttribute('aria-hidden', 'true');
        handle.addEventListener('pointerdown', onLoupeResizePointerDown);
        return handle;
    }

    /**
     * まとめて入力ポップオーバーがルーペ上側・右寄せで画面外へはみ出す場合、
     * 下側・左寄せへ反転させる。
     */
    function positionBulkPopover() {
        var popover = els.slotOverlay && els.slotOverlay.querySelector('.slot-overlay-bulk-popover');
        if (!popover) return;
        popover.classList.remove('is-flip-down', 'is-flip-left');
        if (popover.getBoundingClientRect().top < 8) {
            popover.classList.add('is-flip-down');
        }
        if (popover.getBoundingClientRect().left < 8) {
            popover.classList.add('is-flip-left');
        }
    }

    function tokenizeBulkChords(text) {
        return String(text || '')
            .replace(/(^|\s)\/(?=\s|$)/g, ' ')
            .split(/\s+/)
            .map(function (token) { return token.trim(); })
            .filter(Boolean);
    }

    function linesForBulkText(text) {
        return String(text || '').replace(/\r\n?/g, '\n').split('\n');
    }

    function bulkValues(kind, text) {
        if (kind === 'chord') return tokenizeBulkChords(text);
        return linesForBulkText(text);
    }

    function applyBulkInput(kind, text) {
        var bar = getSelectedBar();
        if (!bar) return;

        var values = bulkValues(kind, text);
        var start = getSelectedBarIndex();
        var available = state.project.bars.length - start;
        var count = Math.min(values.length, available);
        var warnings = [];
        var theory = CS().theory;

        if (values.length === 0) {
            state.overlayBulkMessage = { type: 'warning', text: '入力がありません' };
            renderSlotOverlayContent();
            return;
        }
        if (values.length > available) {
            warnings.push('小節数を超えた ' + (values.length - available) + '件は反映しませんでした');
        }

        for (var i = 0; i < count; i++) {
            var barNumber = state.project.bars[start + i].barNumber;
            var value = values[i];
            if (kind === 'chord') {
                CS().model.setBarChord(state.project, barNumber, value);
                if (String(value || '').trim() && theory.parseBasicChordSymbol(value) === null) {
                    warnings.push(barNumber + '小節目: 解釈できないコード表記です');
                }
            } else if (kind === 'lyrics') {
                CS().model.setBarLyricsText(state.project, barNumber, value);
            } else if (kind === 'doremi') {
                CS().model.setBarDoremiText(state.project, barNumber, value).warnings.forEach(function (warning) {
                    warnings.push(barNumber + '小節目: ' + warning);
                });
            }
        }

        markDirty();
        state.overlayBulkMessage = {
            type: warnings.length ? 'warning' : 'ok',
            text: count + '小節に反映しました' + (warnings.length ? ' / ' + warnings.join(' / ') : '')
        };
        renderBarGrid();
        renderPreview();
    }

    /**
     * D3a: 「まとめて入力」をヘッダーのボタンから開くポップオーバーにする
     * （常設右カラムは廃止。ドックの通常高さ・幅は消費しない）。
     * 中身（コード/歌詞/ドレミのまとめて入力）はD2までのロジックをそのまま再利用する。
     */
    function buildBulkInputPanel() {
        var panel = document.createElement('div');
        panel.className = 'slot-overlay-bulk-popover';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'まとめて入力');

        var body = document.createElement('div');
        body.className = 'slot-overlay-bulk-body';

        var kind = document.createElement('select');
        kind.className = 'slot-overlay-bulk-kind';
        [
            ['chord', 'コード'],
            ['lyrics', '歌詞'],
            ['doremi', 'ドレミ']
        ].forEach(function (pair) {
            var option = document.createElement('option');
            option.value = pair[0];
            option.textContent = pair[1];
            kind.appendChild(option);
        });

        var text = document.createElement('textarea');
        text.className = 'slot-overlay-bulk-text';
        text.rows = 3;
        text.placeholder = '現在の小節から順に反映';
        text.setAttribute('aria-label', 'まとめて入力');

        var actions = document.createElement('div');
        actions.className = 'slot-overlay-bulk-actions';

        var apply = document.createElement('button');
        apply.type = 'button';
        apply.className = 'slot-overlay-bulk-apply';
        apply.textContent = '現在の小節から反映';
        apply.addEventListener('click', function (event) {
            event.stopPropagation();
            applyBulkInput(kind.value, text.value);
        });

        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'slot-overlay-bulk-close';
        close.textContent = '閉じる';
        close.addEventListener('click', function (event) {
            event.stopPropagation();
            state.dockBulkOpen = false;
            renderSlotOverlayContent();
        });

        actions.appendChild(apply);
        actions.appendChild(close);
        body.appendChild(kind);
        body.appendChild(text);
        body.appendChild(actions);

        if (state.overlayBulkMessage) {
            var message = document.createElement('p');
            message.className = 'slot-overlay-bulk-message is-' + state.overlayBulkMessage.type;
            message.textContent = state.overlayBulkMessage.text;
            body.appendChild(message);
        }

        panel.appendChild(body);
        panel.addEventListener('compositionstart', function () {
            state.overlayBulkComposing = true;
        });
        panel.addEventListener('compositionend', function () {
            state.overlayBulkComposing = false;
        });
        panel.addEventListener('keydown', function (event) {
            event.stopPropagation();
        });
        panel.addEventListener('click', function (event) {
            event.stopPropagation();
        });
        panel.addEventListener('mousedown', function (event) {
            event.stopPropagation();
        });
        return panel;
    }

    function buildBulkToggleButton() {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'slot-overlay-bulk-toggle';
        btn.textContent = 'まとめて入力';
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', state.dockBulkOpen ? 'true' : 'false');
        btn.addEventListener('click', function (event) {
            event.stopPropagation();
            state.dockBulkOpen = !state.dockBulkOpen;
            renderSlotOverlayContent();
        });
        btn.addEventListener('mousedown', function (event) { event.stopPropagation(); });
        return btn;
    }

    /**
     * D3a: まとめて入力ポップオーバーの外側クリック / Escapeで閉じる。
     * init() で一度だけ登録するグローバルリスナー（ドックは毎描画で作り直されるため）。
     */
    function onDocumentClickForBulkPopover(event) {
        if (!state.dockBulkOpen || !els.slotOverlay) return;
        var popover = els.slotOverlay.querySelector('.slot-overlay-bulk-popover');
        var toggleBtn = els.slotOverlay.querySelector('.slot-overlay-bulk-toggle');
        if (popover && popover.contains(event.target)) return;
        if (toggleBtn && toggleBtn.contains(event.target)) return;
        state.dockBulkOpen = false;
        renderSlotOverlayContent();
    }

    /**
     * F1: Escapeの優先順位を整理する（既存挙動を壊さない範囲で）。
     * 1. まとめて入力ポップオーバーが開いていれば、それを閉じる
     * 2. ルーペ内の入力欄・ストロークセルにフォーカスがあれば、それを外す（セル編集解除）
     * 3. それ以外は選択小節を解除してルーペを閉じる（既存のdeselectBar）
     * ルーペ自体はフォーカストラップを持たない非モーダルなツールパレットとして扱う。
     */
    function onDocumentKeydownForLoupe(event) {
        if (event.key !== 'Escape' || event.isComposing) return;
        if (state.dockBulkOpen) {
            state.dockBulkOpen = false;
            renderSlotOverlayContent();
            return;
        }
        var active = document.activeElement;
        var isEditingInLoupe = active && els.slotOverlay && els.slotOverlay.contains(active) &&
            (active.tagName === 'INPUT' || (active.classList && active.classList.contains('dock-strum-cell')));
        if (isEditingInLoupe) {
            active.blur();
            return;
        }
        if (!state.selectedBarNumber) return;
        deselectBar();
    }

    /**
     * D3a: 画面下部の編集ドック本体を組み立てる（「選択小節のX線写真」）。
     * 紙面と同じ段順（コード/ストローク/歌詞/ドレミ）を、選択小節と同じ時間軸のまま
     * コンパクトなタイムグリッドとして表示する。本格セル編集はストローク行のみ。
     * ヘッダーは1行に集約: 小節番号・セクション名・前へ/次へ・8分/16分・
     * （override中のみ）基本に戻す・まとめて入力・Alt+←/→ヒント・閉じる。
     */
    function renderSlotOverlayContent() {
        if (!els.slotOverlay) return;
        els.slotOverlay.innerHTML = '';

        var bar = getSelectedBar();
        if (!bar) {
            els.slotOverlay.classList.add('hidden');
            els.slotOverlay.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('dock-open');
            return;
        }

        var head = document.createElement('div');
        head.className = 'slot-overlay-head';
        // F1: タイトルバーはドラッグ領域。button/input/select/textarea/a等の上では
        // onLoupeHeaderPointerDown内のセレクタ判定でドラッグを開始しない
        head.tabIndex = 0;
        head.addEventListener('pointerdown', onLoupeHeaderPointerDown);
        head.addEventListener('keydown', onLoupeHeaderKeydown);

        var headMain = document.createElement('div');
        headMain.className = 'slot-overlay-head-main';
        var title = document.createElement('span');
        title.className = 'slot-overlay-title';
        title.textContent = bar.barNumber + '小節目';
        headMain.appendChild(title);
        var sectionName = getBarSectionName(bar);
        if (sectionName) {
            var sectionBadge = document.createElement('span');
            sectionBadge.className = 'slot-overlay-section';
            sectionBadge.textContent = sectionName;
            headMain.appendChild(sectionBadge);
        }

        var headActions = document.createElement('div');
        headActions.className = 'slot-overlay-head-actions';

        var nav = document.createElement('div');
        nav.className = 'slot-overlay-nav';
        nav.appendChild(buildOverlayNavButton('← 前へ', -1));
        nav.appendChild(buildOverlayNavButton('次へ →', 1));
        headActions.appendChild(nav);

        headActions.appendChild(buildResolutionToggle(bar));

        if (bar.strumOverride) {
            var resetBtn = document.createElement('button');
            resetBtn.type = 'button';
            resetBtn.className = 'slot-overlay-reset-btn';
            resetBtn.textContent = '基本に戻す';
            resetBtn.title = 'ストロークの小節別上書きをやめて、基本ストロークの継承へ戻します';
            resetBtn.addEventListener('click', function (event) {
                event.stopPropagation();
                resetBarStrumOverride(bar);
            });
            resetBtn.addEventListener('mousedown', function (event) { event.stopPropagation(); });
            headActions.appendChild(resetBtn);
        }

        headActions.appendChild(buildBulkToggleButton());

        var hint = document.createElement('span');
        hint.className = 'slot-overlay-hint';
        hint.textContent = 'Alt+←/→で移動';
        headActions.appendChild(hint);

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'slot-overlay-close';
        closeBtn.textContent = '✕';
        closeBtn.setAttribute('aria-label', '小節ルーペを閉じる');
        closeBtn.addEventListener('click', function (event) {
            event.stopPropagation();
            deselectBar();
        });
        closeBtn.addEventListener('mousedown', function (event) {
            event.stopPropagation();
        });
        headActions.appendChild(closeBtn);

        head.appendChild(headMain);
        head.appendChild(headActions);
        els.slotOverlay.appendChild(head);

        // 拍ルーラー（コード/ストローク/歌詞/ドレミの共通時間軸）
        var res = getStrumGridResolution(bar);
        els.slotOverlay.appendChild(buildBeatRuler(bar, res));

        // タイムグリッド本文: コード=1小節1セル / ストローク=本格セル編集 /
        // 歌詞・ドレミ=時間軸に揃えた1つの入力欄（tick位置セル分解はD3b）
        var grid = document.createElement('div');
        grid.className = 'slot-overlay-grid';

        DOCK_ROW_ORDER.forEach(function (rowId) {
            var rowDef = { id: rowId, label: DOCK_ROW_LABELS[rowId] };
            var row = document.createElement('div');
            row.className = 'slot-overlay-row slot-overlay-row--' + rowId;

            var rowLabel = document.createElement('span');
            rowLabel.className = 'slot-overlay-row-label';
            rowLabel.textContent = rowDef.label;
            row.appendChild(rowLabel);

            if (rowId === 'strum') {
                var strumWrap = document.createElement('div');
                strumWrap.className = 'slot-overlay-row-body slot-overlay-row-body--strum';
                strumWrap.appendChild(buildStrumGridRow(bar, res));
                row.appendChild(strumWrap);
            } else {
                var rowBody = document.createElement('div');
                rowBody.className = 'slot-overlay-row-body';
                rowBody.appendChild(buildOverlayInput(rowDef, bar));
                var note = buildOverlayNote(rowId, bar);
                if (note) rowBody.appendChild(note);
                row.appendChild(rowBody);
            }
            grid.appendChild(row);
        });

        els.slotOverlay.appendChild(grid);

        if (state.dockBulkOpen) {
            els.slotOverlay.appendChild(buildBulkInputPanel());
            window.requestAnimationFrame(positionBulkPopover);
        }

        // F1: 右下ハンドル（比例リサイズ）。狭い画面ではCSS側で非表示にする
        els.slotOverlay.appendChild(buildLoupeResizeHandle());

        els.slotOverlay.classList.remove('hidden');
        els.slotOverlay.setAttribute('aria-hidden', 'false');
        els.slotOverlay.setAttribute('aria-label', bar.barNumber + '小節目の編集');
        document.body.classList.add('dock-open');
        applyLoupeGeometry();
    }

    function syncSheetSelection() {
        if (!els.scaleBox) return;
        var selectedExists = false;
        Array.prototype.forEach.call(els.scaleBox.querySelectorAll('.sheet-bar[data-bar-number]'), function (cell) {
            var barNumber = parseInt(cell.dataset.barNumber, 10);
            var selected = barNumber === state.selectedBarNumber;
            if (selected) selectedExists = true;
            cell.classList.toggle('is-selected', selected);
            cell.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        if (state.selectedBarNumber && !selectedExists) {
            state.selectedBarNumber = null;
        }
        renderSlotOverlayContent();
        positionSlotOverlay();
        maybeAutoScrollToSelection();
    }

    /**
     * D2: 下部ドックは画面下部に固定表示するため座標計算は不要（CSSのposition:fixedに任せる）。
     * ただし、選択中の小節が紙面上から消えた場合（セクション削除・小節数変更等）は
     * 安全側でドックを閉じる。
     */
    function positionSlotOverlay() {
        if (!els.slotOverlay || els.slotOverlay.classList.contains('hidden')) return;
        var cell = getSheetBarByNumber(state.selectedBarNumber);
        if (!cell) {
            els.slotOverlay.classList.add('hidden');
            els.slotOverlay.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('dock-open');
        }
    }

    function scheduleOverlayPosition() {
        if (state.overlayFrame) window.cancelAnimationFrame(state.overlayFrame);
        state.overlayFrame = window.requestAnimationFrame(function () {
            state.overlayFrame = null;
            updateSheetScale();
            syncSheetSelection();
            reclampLoupeOnResize(); // F1: ウィンドウサイズ変更のたびにルーペの位置・幅も再クランプする
        });
    }

    function selectSheetBar(barNumber) {
        if (!state.project || !barNumber) return;
        var exists = state.project.bars.some(function (bar) {
            return bar.barNumber === barNumber;
        });
        if (!exists) return;
        if (state.selectedBarNumber !== barNumber) {
            state.overlayBulkMessage = null;
        }
        state.selectedBarNumber = barNumber;
        syncSheetSelection();
    }

    function onPreviewClick(event) {
        var cell = event.target.closest && event.target.closest('.sheet-bar[data-bar-number]');
        if (!cell || cell.classList.contains('sheet-bar--empty')) return;
        selectSheetBar(parseInt(cell.dataset.barNumber, 10));
    }

    function onPreviewKeydown(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        var cell = event.target.closest && event.target.closest('.sheet-bar[data-bar-number]');
        if (!cell || cell.classList.contains('sheet-bar--empty')) return;
        event.preventDefault();
        selectSheetBar(parseInt(cell.dataset.barNumber, 10));
    }

    /* ══════════ 表示トグル（sheetSettings.showChords / showStrum / showLyrics /
       showDoremi / showTimingGrid / timingGridResolution） ══════════ */

    function renderDisplayToggles() {
        var show = CS().sheetRenderer.resolveShowSettings(state.project);
        els.showChords.checked = show.chords;
        els.showStrum.checked = show.strum;
        els.showLyrics.checked = show.lyrics;
        els.showDoremi.checked = show.doremi;
        els.showGrid.checked = show.timingGrid;
        els.gridResolution.value = String(show.gridResolution);
        els.gridResolution.disabled = !show.timingGrid;
    }

    function onDisplayToggleChange() {
        if (!state.project.sheetSettings) {
            state.project.sheetSettings = CS().model.getDefaultSheetSettings();
        }
        state.project.sheetSettings.showChords = els.showChords.checked;
        state.project.sheetSettings.showStrum = els.showStrum.checked;
        state.project.sheetSettings.showLyrics = els.showLyrics.checked;
        state.project.sheetSettings.showDoremi = els.showDoremi.checked;
        state.project.sheetSettings.showTimingGrid = els.showGrid.checked;
        state.project.sheetSettings.timingGridResolution =
            (els.gridResolution.value === '16') ? 16 : 8;
        els.gridResolution.disabled = !els.showGrid.checked;
        markDirty();
        renderPreview();
    }

    /* ══════════ 印刷・JSON入出力 ══════════ */

    /**
     * ブラウザ印刷（PDF保存）。print.css が譜面プレビューだけを印刷対象にする（ADR-010）。
     */
    function printSheet() {
        readFormIntoProject();
        renderPreview();
        window.print();
    }

    function downloadCurrentProjectJson() {
        readFormIntoProject();
        var json = CS().storage.exportProjectJson(state.project);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var title = state.project.songInfo.title || 'project';
        a.href = url;
        a.download = 'cruise-studio_' + title.replace(/[\\/:*?"<>|\s]+/g, '_') + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setSaveStatus('JSONファイルへ書き出しました');
    }

    function onImportJsonFile(event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        if (!confirmDiscardIfDirty()) return;
        var reader = new FileReader();
        reader.onload = function () {
            var res = CS().storage.importProjectJson(String(reader.result));
            if (!res.ok) {
                setSaveStatus(res.error, true);
                return;
            }
            var warnText = res.warnings.length ? '（警告: ' + res.warnings.join(' / ') + '）' : '';
            setProject(res.project, {
                dirty: true,
                statusMessage: 'JSONを読み込みました（未保存）' + warnText
            });
        };
        reader.onerror = function () {
            setSaveStatus('ファイルの読み取りに失敗しました', true);
        };
        reader.readAsText(file);
    }

    /* ══════════ 保存 ══════════ */

    function save() {
        readFormIntoProject();
        var model = CS().model;
        var storage = CS().storage;

        var check = model.validateProject(state.project);
        if (!check.ok) {
            setSaveStatus('保存できません: ' + check.errors.join(' / '), true);
            return;
        }
        var res = storage.saveProject(state.project);
        if (!res.ok) {
            setSaveStatus(res.error, true);
            return;
        }
        state.dirty = false;
        refreshProjectSelect();
        setSaveStatus('保存しました（' + state.project.songInfo.title + '）');
    }

    /* ══════════ 画面ライフサイクル（app.js から呼ばれる） ══════════ */

    /**
     * 譜面クルーズ画面に入る。
     * currentProjectId → 最新の保存済みプロジェクト → 新規作成 の順で開く
     * （TOPのサンプル作成直後などに別の新規が開かないようにする）。
     */
    function enter() {
        var storage = CS().storage;
        var currentId = storage.getCurrentProjectId();
        if (currentId) {
            var res = storage.loadProject(currentId);
            if (res.ok) {
                setProject(res.project);
                return;
            }
        }
        var latest = storage.listProjects()[0];
        if (latest) {
            var res2 = storage.loadProject(latest.projectId);
            if (res2.ok) {
                setProject(res2.project);
                return;
            }
        }
        setProject(CS().model.createEmptyProject(), { dirty: true, statusMessage: '新規プロジェクトを作成しました（未保存）' });
    }

    /**
     * 画面を離れてよいか（未保存なら中断確認: DESIGN_SYSTEM.md 5章の鉄則）。
     */
    function canLeave() {
        return confirmDiscardIfDirty();
    }

    function init() {
        resolveElements();
        fillKeySelect(els.originalKey);
        fillKeySelect(els.playKey);

        // F1: フローティング小節ルーペの初期位置/幅（appSettingsに保存済みなら復元）と
        // 非モーダルなツールパレットとしての静的a11y属性
        initLoupeGeometry();
        if (els.slotOverlay) {
            els.slotOverlay.setAttribute('role', 'dialog');
            els.slotOverlay.setAttribute('aria-modal', 'false');
        }

        els.projectSelect.addEventListener('change', function () {
            var selectedId = els.projectSelect.value;
            if (state.project && selectedId === state.project.projectId) return;
            if (!confirmDiscardIfDirty()) {
                refreshProjectSelect();
                return;
            }
            openProject(selectedId);
        });
        els.newProjectBtn.addEventListener('click', createNewProject);

        [els.title, els.artist, els.capo, els.bpm].forEach(function (el) {
            el.addEventListener('input', onFieldChange);
        });
        [els.originalKey, els.playKey, els.timeSig].forEach(function (el) {
            el.addEventListener('change', onFieldChange);
        });

        els.addSectionBtn.addEventListener('click', onAddSection);
        els.saveBtn.addEventListener('click', save);
        els.printBtn.addEventListener('click', printSheet);
        els.exportBtn.addEventListener('click', downloadCurrentProjectJson);
        els.importInput.addEventListener('change', onImportJsonFile);

        els.basicStrum.addEventListener('input', onBasicStrumInput);

        [els.showChords, els.showStrum, els.showLyrics, els.showDoremi,
         els.showGrid, els.gridResolution].forEach(function (el) {
            el.addEventListener('change', onDisplayToggleChange);
        });

        // ペイン幅の変化に合わせてA4紙面のスケールを追従させる
        window.addEventListener('resize', scheduleOverlayPosition);
        els.preview.addEventListener('click', onPreviewClick);
        els.preview.addEventListener('keydown', onPreviewKeydown);

        // D1: ドロワー開閉でプレビュー領域の高さが変わり、overlay位置がズレうるため再計算する
        if (els.editorDrawer) els.editorDrawer.addEventListener('toggle', scheduleOverlayPosition);
        if (els.barGridDrawer) els.barGridDrawer.addEventListener('toggle', scheduleOverlayPosition);

        // D3a/F1: まとめて入力ポップオーバーの外側クリックで閉じる。Escapeは
        // ポップオーバー→セル編集解除→ルーペを閉じる、の優先順位で処理する
        // （ドックは毎描画で作り直すため、要素にではなくdocumentへ一度だけ登録する）
        document.addEventListener('click', onDocumentClickForBulkPopover);
        document.addEventListener('keydown', onDocumentKeydownForLoupe);

        // ブラウザのタブ閉じ / リロード / URL移動に対する未保存ガード。
        // 画面内のTOP/戻る/モジュール移動は既存の中断確認（canLeave）が担当する。
        window.addEventListener('beforeunload', function (e) {
            if (!state.dirty) return;
            e.preventDefault();
            e.returnValue = ''; // ブラウザ標準の確認ダイアログを出す
        });
    }

    window.CruiseStudio = window.CruiseStudio || {};
    window.CruiseStudio.sheetCruise = {
        init: init,
        enter: enter,
        canLeave: canLeave
    };
})();
