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
   F2a（ADR-028）: 歌詞行をtick位置ごとのセル編集（8/16マス）へ変更。IME 3層ガード付き。
   旧小節グリッドの歌詞inputはreadonly化（クリックでルーペを開く）、まとめて入力の歌詞は
   セル編集への移行に伴い一時停止。bar.lyricsのスキーマ・schemaVersionは変更しない。
   保存/復元/JSON/プレDTM/MIDIの経路・データ構造は変更しない。
   グローバル名前空間 CruiseStudio.sheetCruise に登録する。 */
(function () {
    'use strict';

    function CS() { return window.CruiseStudio || {}; }

    // フォームのキー選択肢（normalizeKeyName が受ける表記に揃える）
    var KEY_OPTIONS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    // プレビューの1行あたり小節数は sheetSettings.barsPerLine（既定2）。
    // 歌詞もドレミもないセクション（前奏などのコードのみ）は2倍詰めで表示する。

    // D3a/F2a: ドックの行順とラベル（コードは1小節1セル、ストローク/歌詞はセル編集、
    // ドレミは通常の文字列入力）
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
        lyricComposingTick: null,  // G2a: IME変換中の歌詞セルslotTick（同時に1つだけの想定。F2a時点はindexで管理していた）
        lyricJustComposed: false,  // F2a: compositionend直後のEnter誤爆ガード（Safari対策）
        // G2b: 歌詞の拍別ローカル解像度（UI一時状態。ADR-030）。bar objectをキーにした
        // WeakMapなので、project/localStorage/appSettingsへは保存されず、JSON読込・
        // 新規project・再読込では新しいbarオブジェクトになるため自然に消える。
        // 小節削除等でbarオブジェクトが参照されなくなればGC対象にもなる。
        // 値: WeakMap<bar, Map<beatIndex, 8|16>>（ローカル指定が無いbeatIndexはMapに存在しない＝自動）
        lyricBeatRes: new WeakMap(),
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

                // F2a: 歌詞は小節ルーペのセル編集へ移行。このinputは表示専用（readonly）にし、
                // クリック/フォーカスで該当小節を選択してルーペを開く。setBarLyricsText()への
                // 書き込み経路はここから完全に断つ（readonlyなのでinputイベントは発火しない）。
                var lyricsInput = document.createElement('input');
                lyricsInput.type = 'text';
                lyricsInput.className = 'bar-lyrics-input';
                lyricsInput.placeholder = '歌詞';
                lyricsInput.readOnly = true;
                lyricsInput.title = '歌詞は小節ルーペのセルで編集します';
                lyricsInput.setAttribute('aria-label', bar.barNumber + '小節目の歌詞（読み取り専用。ルーペで編集）');
                lyricsInput.value = CS().model.getBarLyricsText(bar);
                lyricsInput.addEventListener('focus', function () {
                    selectSheetBar(bar.barNumber);
                    focusOverlayField('lyrics');
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
        if (rowId === 'doremi') return CS().model.getBarDoremiText(bar);
        return '';
    }

    function getOverlayPlaceholder(rowId) {
        if (rowId === 'chord') return 'コードを入力';
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
        // F2aで旧グリッドの歌詞inputのaria-labelへ「（読み取り専用。ルーペで編集）」を
        // 追記した際、ここが完全一致セレクタのままだったため歌詞だけ同期が効かなくなっていた
        // 既存不具合（G2aの検証中に発見）。前方一致にして両方に対応する。
        var input = els.barGrid && els.barGrid.querySelector(
            '.' + className + '[aria-label^="' + barNumber + '小節目の' + labelText + '"]'
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
            if (rowId === 'lyrics') {
                // 歌詞行はinputではなくセルグリッド（.dock-lyrics-grid）。先頭セルへフォーカスする
                var firstLyricCell = field.querySelector('.dock-lyrics-cell');
                if (firstLyricCell) firstLyricCell.focus({ preventScroll: true });
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
        // F2a: 歌詞セルも編集のたびに即保存されているため、ここではフォーカス先だけ伝える
        if (active.classList && active.classList.contains('dock-lyrics-cell')) {
            return 'lyrics';
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

    /* ══════════ G1: 拍グループ構造化（docs/DECISIONS.md ADR-029） ══════════
       行（拍ルーラー/ストローク/歌詞/コード・ドレミ背面線）のタイムライン部分を、
       「拍グループ（均等幅・flex） × 拍内スロット（slotsPerBeatのgrid）」の
       二段構造で組み立てる共通ヘルパー。全行がこの1つの関数だけを経由することで、
       拍・8分・16分の境界線のx座標が行をまたいで完全に一致する。
       G1は見た目とDOM構造だけのリファクタであり、セル数・tick位置・index順序・
       解像度の意味は一切変えない（既存の timelineBoundaryClass をそのまま使う）。 */

    /**
     * 拍グループを container の直下へ組み立てる。buildSlot(globalIndex, slotsPerBeat) が
     * 返すDOM要素を、拍0のスロット0..slotsPerBeat-1 → 拍1のスロット0.. という
     * 既存のフラットなセルindexと完全に同じ順序でDOMへ追加する
     * （querySelectorAll等の取得順・data-cell-indexの意味は不変）。
     */
    function populateBeatGroups(container, res, buildSlot) {
        var beats = getBeats(state.project);
        var slotsPerBeat = res / beats;
        for (var b = 0; b < beats; b++) {
            var group = document.createElement('div');
            group.className = 'beat-group';
            group.dataset.beatIndex = String(b);
            group.style.gridTemplateColumns = 'repeat(' + slotsPerBeat + ', 1fr)';
            for (var s = 0; s < slotsPerBeat; s++) {
                var globalIndex = b * slotsPerBeat + s;
                group.appendChild(buildSlot(globalIndex, slotsPerBeat));
            }
            container.appendChild(group);
        }
    }

    /**
     * コード・ドレミ行（1小節1入力を維持）の背面に敷く、装飾専用の拍/8分/16分縦線。
     * populateBeatGroups() を使うため、拍ルーラー・ストローク・歌詞セルと
     * 完全に同じx座標で線が揃う。クリック・キャレット操作を妨げないよう
     * pointer-events:none・aria-hidden・入力欄より背面（CSS側で z-index 制御）とする。
     */
    function buildTimelineBackground(res) {
        var bg = document.createElement('div');
        bg.className = 'slot-overlay-timeline-bg beat-groups';
        bg.setAttribute('aria-hidden', 'true');
        populateBeatGroups(bg, res, function (globalIndex, slotsPerBeat) {
            var slot = document.createElement('span');
            slot.className = 'slot-overlay-timeline-slot ' +
                timelineBoundaryClass(globalIndex + 1, res, slotsPerBeat);
            return slot;
        });
        return bg;
    }

    /**
     * ルーペ全体（コード/ストローク/歌詞/ドレミの拍ルーラー等）が共有する時間軸の
     * 必要解像度判定はストローク由来のみとする（G2b / ADR-030）。
     * F2a〜G1時点では歌詞のtickも判定に含めていたが、G2bで歌詞行が拍別ローカル解像度を
     * 持てるようになったため、歌詞データを理由に全体設定を16分へ強制することは廃止した
     * （歌詞は「自動」のときヘッダーの全体設定へ追従するだけで、データ由来の自動昇格はしない）。
     */
    function isStrumDataForcedSixteenth(bar) {
        var slots = CS().model.getBarEffectiveStrumSlots(state.project, bar.barNumber);
        return CS().model.barNeedsSixteenthResolution({ strumSlots: slots });
    }

    /**
     * 小節の共有時間軸解像度（8 or 16）。拍ルーラー・ストロークセル・コード/ドレミ背面線・
     * 歌詞の「自動」拍が使う。「データから必要な解像度」（ストローク由来のみ。G2b）と
     * 「ユーザーが一時的に選んだ解像度」（state.dockManualRes。barNumberごとに保持。
     * _proto/slot-editor.js の barResOverride と同じ思想でUI一時状態のみ）の大きい方を使う。
     */
    function getStrumGridResolution(bar) {
        var dataRes = isStrumDataForcedSixteenth(bar) ? 16 : 8;
        var manualRes = (state.dockManualRes[bar.barNumber] === 16) ? 16 : 8;
        return Math.max(dataRes, manualRes);
    }

    function isStrumGridForcedSixteenth(bar) {
        return isStrumDataForcedSixteenth(bar);
    }

    /**
     * 8分ボタンをdisabledにする理由（ツールチップ文言）。G2b: 全体8分ロックは
     * ストローク由来のみに限定した（歌詞由来のロックは廃止。歌詞は拍別ローカル指定または
     * 全体設定への追従のみで、16分位置データによる自動昇格はしない）。
     */
    function getForcedSixteenthReason(bar) {
        var slots = CS().model.getBarEffectiveStrumSlots(state.project, bar.barNumber);
        var strumForced = !!(slots && CS().sheetRenderer.strumNeedsSixteenth(slots));
        if (strumForced) return 'ストロークに16分位置があるため8分表示にはできません';
        return '';
    }

    /* ══════════ G2b: 歌詞の拍別ローカル解像度（docs/DECISIONS.md ADR-030） ══════════
       実効解像度の優先順位は2段階だけ: 1) その拍のローカル指定（state.lyricBeatRes）
       2) ヘッダーの全体8分/16分設定（getStrumGridResolution）。歌詞データのtickを
       理由に自動的に16分へ昇格する処理は行わない（「自動」は必ず全体設定に追従する）。 */

    function getLyricBeatLocalRes(bar, beatIndex) {
        var map = state.lyricBeatRes.get(bar);
        if (!map) return null;
        var v = map.get(beatIndex);
        return (v === 8 || v === 16) ? v : null;
    }

    /**
     * res が null なら自動へ戻す（Mapからローカル指定を削除する）。
     */
    function setLyricBeatLocalRes(bar, beatIndex, res) {
        var map = state.lyricBeatRes.get(bar);
        if (res !== 8 && res !== 16) {
            if (map) map.delete(beatIndex);
            return;
        }
        if (!map) {
            map = new Map();
            state.lyricBeatRes.set(bar, map);
        }
        map.set(beatIndex, res);
    }

    /**
     * 拍beatIndexの実効解像度。ローカル指定があればそれを、無ければ全体設定
     * （globalRes）を返す。
     */
    function getLyricBeatEffectiveRes(bar, globalRes, beatIndex) {
        var local = getLyricBeatLocalRes(bar, beatIndex);
        return local || globalRes;
    }

    /**
     * 拍別ローカル解像度ボタンのクリックサイクル。
     * 全体が8分で自動状態: 自8 → 16 → 8 → 自8
     * 全体が16分で自動状態: 自16 → 8 → 16 → 自16
     * つまり自動からの最初のクリックは必ず全体設定と逆の解像度へ固定し、
     * 見た目が必ず変化するようにする。ローカル固定同士を1往復した後、再度押すと自動へ戻る。
     * @returns {8|16|null} 次の状態（nullは自動へ戻すことを意味する）
     */
    function nextLyricBeatResState(isAuto, local, globalRes) {
        var opposite = (globalRes === 8) ? 16 : 8;
        if (isAuto) return opposite;
        if (local === opposite) return globalRes;
        return null;
    }

    /**
     * 拍内でのセル境界の強弱class（is-beat/is-8th/is-16th/is-barend）を、
     * その拍「だけ」のローカル解像度基準で求める（G2b）。既存の timelineBoundaryClass は
     * 小節全体で単一の解像度を前提にしたグローバルboundary番号を使うため、拍ごとに
     * 解像度が異なりうる歌詞行では使えない。1拍分に閉じた同等ロジックとして実装する
     * （全拍が同じ解像度のときは timelineBoundaryClass と完全に同じ結果になる）。
     */
    function lyricLocalBoundaryClass(slotIndexInBeat, slotsPerBeat, beatRes, isLastBeat) {
        var boundaryWithinBeat = slotIndexInBeat + 1;
        if (boundaryWithinBeat >= slotsPerBeat) {
            return isLastBeat ? 'is-barend' : 'is-beat';
        }
        if (beatRes === 16) {
            return (boundaryWithinBeat % 2 === 0) ? 'is-8th' : 'is-16th';
        }
        return 'is-8th';
    }

    /**
     * ローカル拍ボタン・全体8分/16分ボタンの両方が使う、解像度変更前の安全処理（G2b）。
     * 1) 現在フォーカス中の要素が歌詞セルで、かつIME変換中なら何もせず中止する
     *    （{ok:false}を返す。呼び出し側は解像度状態を変更してはいけない）
     * 2) 歌詞セルがアクティブなら、変更があるときだけG2aの無変更ガード経由で1回だけ
     *    commitする（無変更なら書き込まない。renderPreviewはさせない= skipRender）
     * 3) フォーカス復元用に、そのセルのtick・選択範囲・値をキャプチャして返す
     * 呼び出し側は、続けて解像度状態を変更し、renderSlotOverlayContent()を1回だけ呼び、
     * 戻り値のsnapshotをrestoreLyricCellFocusAfterRender()等でフォーカス復元に使う
     * （G2aのtick中心フォールバック: 同tick→含む→直前→先頭をそのまま再利用する）。
     */
    function prepareLyricResolutionChange(bar) {
        var active = document.activeElement;
        var isLyricCell = !!(active && active.classList && active.classList.contains('dock-lyrics-cell'));
        if (!isLyricCell) return { ok: true, snapshot: null };

        var slotTick = Number(active.dataset.slotTick);
        if (state.lyricComposingTick === slotTick) {
            return { ok: false }; // IME変換中は切替を実行しない
        }
        var snapshot = captureLyricCellFocus(slotTick, active);
        commitLyricCell(bar, active, slotTick, { skipRender: true });
        return { ok: true, snapshot: snapshot };
    }

    /**
     * prepareLyricResolutionChange()とセットで使う、再描画＋フォーカス復元の共通処理。
     */
    function finishLyricResolutionChange(bar, snapshot) {
        var expectedBarNumber = bar.barNumber;
        renderSlotOverlayContent();
        positionSlotOverlay();
        if (snapshot) restoreLyricCellFocusAfterRender(snapshot, expectedBarNumber);
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
        var inherited = !bar.strumOverride; // 基本ストローク継承中（override未作成）はゴースト表示

        var wrap = document.createElement('div');
        wrap.className = 'dock-strum-grid beat-groups' + (inherited ? ' is-inherited' : '');
        wrap.dataset.overlayField = 'strum';
        wrap.title = getStrumGridStatusText(bar);

        populateBeatGroups(wrap, res, function (index, slotsPerBeat) {
            var action = actions[index];
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
            return cell;
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

    /* ══════════ F2a/G2a: 歌詞セル編集（docs/DECISIONS.md ADR-028。tick中心化はG2a） ══════════
       歌詞行を、ストローク行と同じ時間軸のセル（8 or 16マス）に分解して編集する。
       1セル＝1 bar.lyrics イベント。既存のtick:0全文データは自動分割せず先頭セルへ
       そのまま表示する（後方互換）。入力欄は<input>（strumのようなbuttonではなく
       IME変換を受けるテキストフィールド）。IME中は commit / markDirty / 再描画をしない
       3層ガード（keydown isComposing・compositionstartのcomposing状態・
       compositionend直後のjustComposedフラグ）でSafariのEnter誤爆にも対応する。
       G2a: G2b（拍別8分/16分混在）に備え、セルの位置管理をセルindexからtick
       （data-slot-tick / data-slot-ticks）中心へ移した。data-cell-indexは表示順・
       aria-label・互換確認用として残すが、フォーカス復元・ナビゲーション・commit対象の
       正はtickになる。G2aは全セルが一律解像度のため、ユーザーから見た移動順・
       セル数・入力結果はF2a時点と完全に同じ（機能等価リファクタ）。
       あわせて「無変更commit防止」を導入: 表示された初期値（input._initialValue）と
       現在値が一致する場合は setBarLyricSlot・markDirty・renderPreview のいずれも
       呼ばない（G2bで8分セルへ16分イベント2個を集約表示した際、編集せずblurしただけで
       複数イベントが1イベントへ統合されてしまう事故を防ぐための前提整備）。 */

    /**
     * ルーペ内の歌詞セルをDOM順（=tick昇順）の配列として取得する。
     */
    function getOrderedLyricCells() {
        if (!els.slotOverlay) return [];
        var grid = els.slotOverlay.querySelector('.dock-lyrics-grid');
        if (!grid) return [];
        return Array.prototype.slice.call(grid.querySelectorAll('.dock-lyrics-cell'));
    }

    /**
     * 指定tickに対応するセルを安全にフォールバックしながら探す。
     * 1. slotTickが完全一致するセル
     * 2. そのtickを含む範囲 [slotTick, slotTick+slotTicks) のセル
     * 3. それも無ければ、直前（slotTickが最大でtick以下）のセル
     * 4. 最終的に先頭セル
     * G2aでは全セルが一律解像度のため常に1で見つかるが、G2b以降の解像度混在・
     * 切替後にも使えるようこのフォールバック構造にしてある。
     */
    function findLyricCellByTick(cells, tick) {
        if (!cells || cells.length === 0) return null;
        for (var i = 0; i < cells.length; i++) {
            if (Number(cells[i].dataset.slotTick) === tick) return cells[i];
        }
        for (var j = 0; j < cells.length; j++) {
            var st = Number(cells[j].dataset.slotTick);
            var sd = Number(cells[j].dataset.slotTicks);
            if (tick >= st && tick < st + sd) return cells[j];
        }
        var best = null;
        cells.forEach(function (c) {
            var cst = Number(c.dataset.slotTick);
            if (cst <= tick && (!best || cst > Number(best.dataset.slotTick))) best = c;
        });
        return best || cells[0];
    }

    /**
     * currentSlotTickのセルから見て、direction（+1/-1）方向へ隣接するセルのtickを返す。
     * 両端では同じtickを返す（クランプ）。G2aでは全セルが一律解像度で並んでいるため、
     * 見た目の移動順はF2a時点のindex+1/-1と完全に同じになる。
     */
    function getAdjacentLyricCellTick(cells, currentSlotTick, direction) {
        if (!cells || cells.length === 0) return currentSlotTick;
        var idx = -1;
        for (var i = 0; i < cells.length; i++) {
            if (Number(cells[i].dataset.slotTick) === currentSlotTick) { idx = i; break; }
        }
        if (idx === -1) {
            var fallback = findLyricCellByTick(cells, currentSlotTick);
            idx = cells.indexOf(fallback);
            if (idx === -1) idx = 0;
        }
        var targetIdx = Math.max(0, Math.min(cells.length - 1, idx + direction));
        return Number(cells[targetIdx].dataset.slotTick);
    }

    function focusLyricCellByTick(tick) {
        var cells = getOrderedLyricCells();
        var cell = findLyricCellByTick(cells, tick);
        if (!cell) return;
        cell.focus({ preventScroll: true });
        try {
            var v = cell.value;
            cell.setSelectionRange(v.length, v.length);
        } catch (_) {
            // テキスト入力以外に拡張された場合の保険。
        }
    }

    function captureLyricCellFocus(slotTick, input) {
        var active = document.activeElement;
        if (!input || active !== input) return null;
        return {
            slotTick: slotTick,
            slotTicks: Number(input.dataset.slotTicks), // G4後修正: range幅。restoreLyricCellFocus()の
            // value/selection復元をrange一致セルだけに限定するために保持する（ADR-030後修正参照）。
            value: input.value,
            selectionStart: typeof input.selectionStart === 'number' ? input.selectionStart : null,
            selectionEnd: typeof input.selectionEnd === 'number' ? input.selectionEnd : null
        };
    }

    /**
     * expectedBarNumberは「このsnapshot/フォーカス移動の元になったcommit」が
     * 行われた時点で選択されていた小節番号。rAF発火時にstate.selectedBarNumberが
     * それと違っていたら、その間にAlt+矢印などで別の小節へ選択が移っている
     * ということなので、古いコールバックは何もせず捨てる（別小節セルへの誤書き込み防止）。
     * renderPreview()はscheduleOverlayPosition()経由で同じ小節のルーペをもう一度
     * 再描画することがあるため、判定は「再描画されたか」ではなく「選択小節が
     * 変わったか」で行う（同一小節の再描画は正常にフォーカス復元してよいため）。
     *
     * G4後修正（G2b由来の不具合対応）: フォーカス先の決定（findLyricCellByTick()の
     * 同tick→含む範囲→直前→先頭フォールバック）と、value/selectionの復元は別条件で
     * 判断する。フォーカス先はフォールバックしてよいが、value/selectionは
     * 「切替前後でslotTick・slotTicksが完全に一致する、全く同じrangeのセルへ
     * 戻す場合」だけに限定する。解像度切替（拍別ボタン・全体8分/16分ボタン）で
     * セルのrangeが変わった場合、findLyricCellByTick()のフォールバックは
     * 別range（集約セルや分解後セル）へ着地することがあり、そこへ切替前セルの
     * 部分的なvalueを代入すると、再描画で正しくセットされたproject由来の値
     * （集約後の連結文字列や分解後の個別文字列）を上書きしてしまう。この上書きは
     * DOM表示だけでなく、以後のblur/Enter/Tab等でG2aの無変更commit防止
     * （input._initialValueとの比較）を誤って通過させ、setBarLyricSlot()経由で
     * projectデータの一部（例: 集約前の複数イベントの片方）を消してしまう危険がある。
     * rangeが変わった場合は、再描画済みDOMの値（project由来）を正としてそのまま残す。
     */
    function restoreLyricCellFocus(snapshot, expectedBarNumber) {
        if (!snapshot || !els.slotOverlay) return;
        if (typeof expectedBarNumber === 'number' && state.selectedBarNumber !== expectedBarNumber) return;
        var cell = findLyricCellByTick(getOrderedLyricCells(), snapshot.slotTick);
        if (!cell) return;
        cell.focus({ preventScroll: true });
        var sameRange = Number(cell.dataset.slotTick) === snapshot.slotTick &&
            Number(cell.dataset.slotTicks) === snapshot.slotTicks;
        if (!sameRange) return; // range不一致: フォーカスのみ行い、value/selectionはproject由来のまま残す
        if (cell.value !== snapshot.value) cell.value = snapshot.value;
        if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
            try {
                cell.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
            } catch (_) {
                // テキスト入力以外に拡張された場合の保険。
            }
        }
    }

    function restoreLyricCellFocusAfterRender(snapshot, expectedBarNumber) {
        restoreLyricCellFocus(snapshot, expectedBarNumber);
        window.requestAnimationFrame(function () {
            restoreLyricCellFocus(snapshot, expectedBarNumber);
        });
    }

    /**
     * 歌詞セル1つを確定保存する。位置はinputEl.dataset.slotTick/slotTicksから読む
     * （tick中心化。G2a）。model層（setBarLyricSlot）はrenderPreview・markDirty・
     * 保存を一切行わないため、ここでUI層としてそれらを担当する。
     *
     * 無変更commit防止（G2a最重要要件）: inputEl.value が表示時点の初期値
     * （inputEl._initialValue）と完全に同じ場合は、setBarLyricSlot・markDirty・
     * renderPreviewのいずれも呼ばない。書き込みが成功した場合のみ_initialValueを
     * 新しい値へ更新し、以後のblur等での二重commitを防ぐ。この比較はUI層の生の
     * input.value同士で行い、setBarLyricSlot内部で行われるtrim等の正規化は比較の
     * 前段では一切行わない（未編集なのに変更扱いになることを避けるため）。
     *
     * focusTick省略時（連続入力・IME確定など）は同じセルへカーソル位置ごと復元し、
     * 指定時（Enter/Tab/矢印などの明示的な移動）は移動先セルの末尾へフォーカスする。
     * 無変更でfocusTickが指定された場合（例: 何も編集せずTabだけ押した）は、
     * 書き込み・再描画をせずそのセルへ直接フォーカスするだけにとどめる。
     * options.skipRender: trueのときはmodelの更新のみ行い、render・フォーカス移動は
     * 呼び出し側に任せる（Alt+矢印での小節移動の直前など）。
     */
    function commitLyricCell(bar, inputEl, focusTick, options) {
        var opts = options || {};
        var model = CS().model;
        var slotTick = Number(inputEl.dataset.slotTick);
        var slotTicks = Number(inputEl.dataset.slotTicks);
        var changed = inputEl.value !== inputEl._initialValue;

        if (changed) {
            model.setBarLyricSlot(state.project, bar.barNumber, slotTick, slotTicks, inputEl.value);
            inputEl._initialValue = inputEl.value;
            markDirty();
            syncBarGridInput('lyrics', bar.barNumber, model.getBarLyricsText(bar), []);
        }

        if (opts.skipRender) return;

        if (!changed) {
            if (typeof focusTick === 'number' && focusTick !== slotTick) {
                focusLyricCellByTick(focusTick);
            }
            return;
        }

        var snapshot = captureLyricCellFocus(slotTick, inputEl);
        var expectedBarNumber = bar.barNumber;
        renderPreview();
        if (typeof focusTick === 'number' && focusTick !== slotTick) {
            window.requestAnimationFrame(function () {
                if (state.selectedBarNumber !== expectedBarNumber) return;
                focusLyricCellByTick(focusTick);
            });
        } else if (snapshot) {
            restoreLyricCellFocusAfterRender(snapshot, expectedBarNumber);
        }
    }

    /**
     * 歌詞行「小節全体の最終セル」でEnterが押された場合の処理（G4）。
     * 現在のセルを1回だけ確定し（G2aの無変更ガード込み。Alt+←/→と全く同じ
     * commitLyricCell(..., {skipRender:true})パターンを再利用するため、無変更なら
     * setBarLyricSlot/markDirtyを呼ばない）、曲全体の正規順序で次小節へ移動する。
     * 「正規順序」「セクション境界を越える」「1回だけ再描画」「移動先の先頭セルへの
     * フォーカス・キャレット方針」は、既存のgetMoveTarget()/moveSelectedBar()
     * （前へ/次へ・Alt+←/→が使うのと同じ関数）をそのまま再利用することで自動的に満たす。
     * skipRender:trueのcommitLyricCellは新しいrAF/setTimeoutを一切予約しないため、
     * 小節切替後に古いコールバックが誤って動く心配はない。ただ1つ残る非同期処理は
     * 各セルのblurハンドラのsetTimeout(0)だが、実行時にinput.isConnectedを見て
     * 既にDOMから外れていれば何もしないという既存の安全策（F2a以来）で十分に防げる
     * （renderSlotOverlayContent()がinnerHTML='' で古いinputを破棄するため）。
     * 次小節が存在しない場合（曲全体の最終小節）は、小節を移動せず現在のセルへ留まる。
     * 新しい小節・セクションは作らず、moveSelectedBar()を呼ばないため不要な再描画もしない。
     */
    function commitLyricCellAndMoveToNextBar(bar, input, slotTick) {
        commitLyricCell(bar, input, slotTick, { skipRender: true });
        var target = getMoveTarget(1);
        if (!target || target.barNumber === state.selectedBarNumber) {
            setSaveStatus('最後の小節です。次の小節はありません。');
            return;
        }
        moveSelectedBar(1, { focusRowId: 'lyrics' });
    }

    /**
     * 歌詞セルのkeydown。IME 3層ガードの1つ目（isComposing / keyCode 229 /
     * このセルが変換中フラグ中）と、compositionend直後のjustComposedガード（Safari対策で
     * IME確定のEnterがisComposing=falseで届く場合に、セル移動として誤動作させない）。
     * Escapeはここでは何も処理せず、document側の共通Esc階層（ポップオーバー→
     * セル編集解除→ルーペを閉じる）へそのままbubbleさせる。
     */
    function onLyricCellKeydown(event, bar) {
        if (event.key === 'Escape') return; // 既存のEsc優先順位（onDocumentKeydownForLoupe）へ委ねる
        event.stopPropagation();

        var input = event.currentTarget;
        var slotTick = Number(input.dataset.slotTick);

        if (event.isComposing || event.keyCode === 229 || state.lyricComposingTick === slotTick) return;

        var key = event.key;

        if (state.lyricJustComposed && key === 'Enter') {
            // Safari等でIME確定のEnterがisComposing=falseとして届く場合の保険。
            // compositionendで既に確定保存済みのため、ここではセル移動させず消費するだけ。
            event.preventDefault();
            state.lyricJustComposed = false;
            return;
        }

        if (event.altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
            event.preventDefault();
            commitLyricCell(bar, input, slotTick, { skipRender: true });
            moveSelectedBar(key === 'ArrowLeft' ? -1 : 1, { focusRowId: 'lyrics' });
            return;
        }

        var cells = getOrderedLyricCells();

        if (key === 'Enter') {
            event.preventDefault();
            // G4: 小節全体の最終セル（DOM順=tick昇順で最後）でのEnterだけ次小節へ移動する。
            // 各拍の最後ではなく、getOrderedLyricCells()が返す実際の最終DOM要素で判定する
            // ため、mixed resolutionでもセル数・tickのハードコードは不要。
            if (cells.length > 0 && cells[cells.length - 1] === input) {
                commitLyricCellAndMoveToNextBar(bar, input, slotTick);
            } else {
                commitLyricCell(bar, input, getAdjacentLyricCellTick(cells, slotTick, 1));
            }
            return;
        }
        if (key === 'Tab') {
            event.preventDefault();
            var dir = event.shiftKey ? -1 : 1;
            commitLyricCell(bar, input, getAdjacentLyricCellTick(cells, slotTick, dir));
            return;
        }
        if (key === 'ArrowRight') {
            event.preventDefault();
            commitLyricCell(bar, input, getAdjacentLyricCellTick(cells, slotTick, 1));
            return;
        }
        if (key === 'ArrowLeft') {
            event.preventDefault();
            commitLyricCell(bar, input, getAdjacentLyricCellTick(cells, slotTick, -1));
            return;
        }
        if (key === 'Backspace') {
            if (input.value === '') {
                var prevTick = getAdjacentLyricCellTick(cells, slotTick, -1);
                if (prevTick !== slotTick) {
                    event.preventDefault();
                    focusLyricCellByTick(prevTick);
                }
            }
            // 空でなければ通常の文字削除に任せる
            return;
        }
        if (key === 'Delete') {
            event.preventDefault();
            input.value = '';
            commitLyricCell(bar, input, slotTick);
            return;
        }
        // Space・通常の文字入力キーはIMEを妨げないよう素通しする
    }

    /**
     * 歌詞セル1つ分の<input>を組み立てる（G2b: mixed resolution対応のため
     * buildLyricsGridRowから切り出した）。IME 3層ガード・無変更commit防止・
     * tick中心ナビゲーションはF2a/G2aのものをそのまま使う（挙動不変）。
     * isMultiセル（8分セルに複数の16分イベントが集約表示されている等）は、
     * titleへ全文と「編集確定すると統合される」旨の説明を付け加える。
     */
    function buildLyricCellInput(bar, slotTick, slotTicks, cellInfo, boundaryClass, ariaIndex) {
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'dock-lyrics-cell ' + boundaryClass +
            (cellInfo.text ? ' has-content' : '') + (cellInfo.isMulti ? ' is-multi' : '');
        input.value = cellInfo.text;
        input._initialValue = cellInfo.text; // G2a: 無変更commit防止用の表示済み初期値
        input.dataset.slotTick = String(slotTick);
        input.dataset.slotTicks = String(slotTicks);
        input.dataset.cellIndex = String(ariaIndex); // 表示順・aria-label・互換確認用（位置管理の正ではない）
        input.setAttribute('aria-label', bar.barNumber + '小節目 歌詞 ' + (ariaIndex + 1) + 'マス目' +
            (cellInfo.isMulti ? '（複数位置の歌詞が集約表示中）' : ''));
        if (cellInfo.isMulti) {
            input.title = cellInfo.text +
                '\n複数位置の歌詞をまとめて表示中。編集して確定すると、このセルの範囲へ統合されます。';
        } else if (cellInfo.text) {
            input.title = cellInfo.text;
        }

        input.addEventListener('compositionstart', function () {
            state.lyricComposingTick = slotTick;
            input.classList.add('is-composing');
        });
        input.addEventListener('compositionend', function () {
            input.classList.remove('is-composing');
            state.lyricComposingTick = null;
            state.lyricJustComposed = true;
            window.setTimeout(function () { state.lyricJustComposed = false; }, 0);
            commitLyricCell(bar, input, slotTick);
        });
        input.addEventListener('input', function (event) {
            if (event.isComposing || state.lyricComposingTick === slotTick) return;
            commitLyricCell(bar, input, slotTick);
        });
        input.addEventListener('keydown', function (event) {
            onLyricCellKeydown(event, bar);
        });
        input.addEventListener('blur', function () {
            if (state.lyricComposingTick === slotTick) return;
            window.setTimeout(function () {
                // Tab/Enter/矢印等の明示操作が既にこのセルをcommitして再描画済みなら
                // このinputはDOMから外れている（多重commit・再描画によるフォーカス
                // 奪還を防ぐ）。
                if (!input.isConnected) return;
                commitLyricCell(bar, input);
            }, 0);
        });
        input.addEventListener('click', function (event) { event.stopPropagation(); });
        input.addEventListener('mousedown', function (event) { event.stopPropagation(); });

        return input;
    }

    /**
     * 拍beatIndexの右下に置く、歌詞のローカル解像度切替ボタン（G2b）。
     * 自動状態: 「自8」「自16」（全体設定に追従中）。ローカル固定: 「8」「16」。
     * クリックサイクル・安全処理（IME中は無操作・編集中セルの保全）は
     * nextLyricBeatResState() / prepareLyricResolutionChange() を参照。
     */
    function buildLyricBeatResButton(bar, beatIndex, globalRes) {
        var local = getLyricBeatLocalRes(bar, beatIndex);
        var isAuto = (local === null);
        var effectiveRes = local || globalRes;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dock-lyrics-beat-res-btn' + (isAuto ? ' is-auto' : ' is-local');
        // 実機確認後修正: 自動状態の表示（自8/自16）は変更せず、手動固定状態だけ
        // 「手8」「手16」へ変更する（見た目・状態サイクル・内部値は無変更）。
        btn.textContent = isAuto ? ('自' + globalRes) : ('手' + effectiveRes);

        var stateText = isAuto ?
            ('全体設定（' + globalRes + '分）へ自動追従中') :
            ('手動で' + effectiveRes + '分に固定中');
        var next = nextLyricBeatResState(isAuto, local, globalRes);
        var nextText = (next === null) ?
            'クリックで自動（全体設定に追従）へ戻します' :
            ('クリックで手動' + next + '分固定にします');
        var label = (beatIndex + 1) + '拍目の歌詞セル解像度: ' + stateText + '。' + nextText;
        btn.title = label;
        btn.setAttribute('aria-label', label);

        btn.addEventListener('click', function (event) {
            event.stopPropagation();
            switchLyricBeatResolution(bar, beatIndex);
        });
        btn.addEventListener('mousedown', function (event) { event.stopPropagation(); });
        // G2b: pointerdown preventDefaultで編集中セルの先行blurを止める
        // （理由はbuildResolutionToggle()内の同種コメントを参照）。
        btn.addEventListener('pointerdown', function (event) {
            event.preventDefault();
            event.stopPropagation();
        });

        return btn;
    }

    /**
     * 拍別ローカル解像度ボタンのクリック処理本体（G2b）。安全処理→状態変更→
     * 1回だけ再描画→フォーカス復元、の順を厳守する。
     */
    function switchLyricBeatResolution(bar, beatIndex) {
        var prep = prepareLyricResolutionChange(bar);
        if (!prep.ok) return; // IME変換中は何もしない

        var globalRes = getStrumGridResolution(bar);
        var local = getLyricBeatLocalRes(bar, beatIndex);
        var isAuto = (local === null);
        var next = nextLyricBeatResState(isAuto, local, globalRes);
        setLyricBeatLocalRes(bar, beatIndex, next);

        finishLyricResolutionChange(bar, prep.snapshot);
    }

    /**
     * 歌詞行のDOMを組み立てる（G2b: 拍ごとに異なる解像度が混在しうる）。
     * 外側の拍グループ構造（拍の数だけ均等幅）はG1のpopulateBeatGroups()と同じ考え方だが、
     * 拍内のスロット数が拍ごとに変わりうるため、専用のループで組み立てる。
     * 各拍の実効解像度からセルrangeを一括生成し、getBarLyricSlotRanges()（G2a）で
     * まとめて読み出す。8分セルの範囲に複数の16分イベントが入っていれば、tick順に
     * 連結されたテキストとisMultiが返る（bar.lyrics自体は変更しない）。
     * DOM順は必ずslotTick昇順（拍0の左端スロット→…→拍最後の右端スロット）。
     */
    function buildLyricsGridRow(bar, globalRes) {
        var model = CS().model;
        var beats = getBeats(state.project);
        var barTicks = model.getBarLengthTicks(state.project);
        var beatTicks = barTicks / beats;

        var wrap = document.createElement('div');
        wrap.className = 'dock-lyrics-grid beat-groups';
        wrap.dataset.overlayField = 'lyrics';

        var beatResList = [];
        var ranges = [];
        var rangeMeta = [];
        for (var b = 0; b < beats; b++) {
            var beatRes = getLyricBeatEffectiveRes(bar, globalRes, b);
            beatResList.push(beatRes);
            var slotsPerBeat = beatRes / beats;
            var slotTicksInBeat = beatTicks / slotsPerBeat;
            for (var s = 0; s < slotsPerBeat; s++) {
                ranges.push({ slotTick: b * beatTicks + s * slotTicksInBeat, slotTicks: slotTicksInBeat });
                rangeMeta.push({ beatIndex: b, slotIndexInBeat: s, slotsPerBeat: slotsPerBeat, beatRes: beatRes });
            }
        }
        var cellInfos = model.getBarLyricSlotRanges(state.project, bar.barNumber, ranges);

        var cursor = 0;
        var globalCellIndex = 0;
        for (var bi = 0; bi < beats; bi++) {
            var slotsPerBeatForBeat = beatResList[bi] / beats;
            var isLastBeat = (bi === beats - 1);

            var group = document.createElement('div');
            group.className = 'beat-group dock-lyrics-beat-group';
            group.dataset.beatIndex = String(bi);

            var cellsWrap = document.createElement('div');
            cellsWrap.className = 'dock-lyrics-beat-cells';
            cellsWrap.style.gridTemplateColumns = 'repeat(' + slotsPerBeatForBeat + ', 1fr)';

            for (var si = 0; si < slotsPerBeatForBeat; si++) {
                var range = ranges[cursor];
                var cellInfo = cellInfos[cursor];
                var meta = rangeMeta[cursor];
                cursor++;

                var boundaryClass = lyricLocalBoundaryClass(meta.slotIndexInBeat, meta.slotsPerBeat, meta.beatRes, isLastBeat);
                var input = buildLyricCellInput(bar, range.slotTick, range.slotTicks, cellInfo, boundaryClass, globalCellIndex);
                globalCellIndex++;
                cellsWrap.appendChild(input);
            }

            group.appendChild(cellsWrap);
            group.appendChild(buildLyricBeatResButton(bar, bi, globalRes));
            wrap.appendChild(group);
        }
        return wrap;
    }

    function buildBeatRuler(bar, res) {
        var ruler = document.createElement('div');
        ruler.className = 'slot-overlay-ruler';

        var spacer = document.createElement('span');
        spacer.className = 'slot-overlay-ruler-label';
        ruler.appendChild(spacer);

        var track = document.createElement('div');
        track.className = 'slot-overlay-ruler-track beat-groups';
        populateBeatGroups(track, res, function (globalIndex, slotsPerBeat) {
            var cell = document.createElement('span');
            var boundary = globalIndex + 1;
            cell.className = 'slot-overlay-ruler-cell ' + timelineBoundaryClass(boundary, res, slotsPerBeat);
            if (globalIndex % slotsPerBeat === 0) {
                cell.classList.add('is-beat-head');
                cell.textContent = String(Math.floor(globalIndex / slotsPerBeat) + 1) + '拍';
            } else if (res === 8 && slotsPerBeat === 2 && globalIndex % slotsPerBeat === 1) {
                cell.classList.add('is-offbeat-dot');
            }
            return cell;
        });
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
        btn8.title = forced ? getForcedSixteenthReason(bar) : '';
        btn8.addEventListener('click', function (event) {
            event.stopPropagation();
            // G2b: 全体解像度ボタンも歌詞セルの編集中内容を保全してから切り替える
            var prep = prepareLyricResolutionChange(bar);
            if (!prep.ok) return;
            delete state.dockManualRes[bar.barNumber];
            finishLyricResolutionChange(bar, prep.snapshot);
        });

        var btn16 = document.createElement('button');
        btn16.type = 'button';
        btn16.className = 'slot-overlay-res-btn';
        btn16.textContent = '16分';
        btn16.classList.toggle('is-active', res === 16);
        btn16.addEventListener('click', function (event) {
            event.stopPropagation();
            var prep = prepareLyricResolutionChange(bar);
            if (!prep.ok) return;
            state.dockManualRes[bar.barNumber] = 16;
            finishLyricResolutionChange(bar, prep.snapshot);
        });

        [btn8, btn16].forEach(function (b) {
            b.addEventListener('mousedown', function (event) { event.stopPropagation(); });
            // G2b: pointerdownでpreventDefaultし、ボタンへのネイティブフォーカス移動
            // （＝編集中の歌詞セルの先行blur）を止める。これによりclickハンドラ内で
            // document.activeElementがまだ編集中の歌詞セルのままとなり、
            // prepareLyricResolutionChange()が正しく検出・commitできる
            // （先にネイティブblurが起きると、その委譲commitがsetTimeoutの次tickになり、
            // 同期的なrenderSlotOverlayContent()より後回しになって編集内容が消えるため）。
            b.addEventListener('pointerdown', function (event) {
                event.preventDefault();
                event.stopPropagation();
            });
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

        if (kind === 'lyrics') {
            // F2a〜F4暫定: 歌詞はセル編集へ移行したため、まとめて入力からの書き込みは
            // 行わない（UI側でも textarea/ボタンをdisabledにしているが、防御的に二重で止める）。
            state.overlayBulkMessage = {
                type: 'warning',
                text: '歌詞はセル編集に移行しました。まとめて配置は今後の対応予定です。'
            };
            renderSlotOverlayContent();
            return;
        }

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

        // F2a〜F4暫定: 歌詞はセル編集へ移行したため、まとめて入力の歌詞は一時停止する
        // （docs/DECISIONS.md ADR-028）。
        var lyricsNotice = document.createElement('p');
        lyricsNotice.className = 'slot-overlay-bulk-lyrics-notice';
        lyricsNotice.textContent = '歌詞はセル編集に移行しました。まとめて配置は今後の対応予定です。';
        lyricsNotice.hidden = true;

        function updateBulkLyricsDisabledState() {
            var isLyrics = kind.value === 'lyrics';
            text.disabled = isLyrics;
            apply.disabled = isLyrics;
            lyricsNotice.hidden = !isLyrics;
        }
        kind.addEventListener('change', updateBulkLyricsDisabledState);

        var actions = document.createElement('div');
        actions.className = 'slot-overlay-bulk-actions';

        var apply = document.createElement('button');
        apply.type = 'button';
        apply.className = 'slot-overlay-bulk-apply';
        apply.textContent = '現在の小節から反映';
        apply.addEventListener('click', function (event) {
            event.stopPropagation();
            if (kind.value === 'lyrics') return; // F2a〜F4暫定: bulk歌詞は停止中
            applyBulkInput(kind.value, text.value);
        });
        updateBulkLyricsDisabledState();

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
        body.appendChild(lyricsNotice);
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

        // タイムグリッド本文: コード=1小節1セル / ストローク・歌詞=本格セル編集（F2a） /
        // ドレミ=時間軸に揃えた1つの入力欄（tick位置セル分解はF3）
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
            } else if (rowId === 'lyrics') {
                var lyricsWrap = document.createElement('div');
                lyricsWrap.className = 'slot-overlay-row-body slot-overlay-row-body--lyrics';
                lyricsWrap.appendChild(buildLyricsGridRow(bar, res));
                row.appendChild(lyricsWrap);
            } else {
                // コード/ドレミは引き続き小節1入力のまま。背面へG1の拍/8分/16分縦線だけを
                // 装飾として敷く（setBarChord()/setBarDoremiText()経路・入力単位は無変更）
                var rowBody = document.createElement('div');
                rowBody.className = 'slot-overlay-row-body';
                rowBody.appendChild(buildTimelineBackground(res));
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
