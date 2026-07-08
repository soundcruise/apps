/* クルーズスタジオ — sheet-cruise.js（Phase 2B）
   譜面クルーズ画面: プロジェクト選択・曲情報フォーム・キー関係チェック・
   セクション管理・小節グリッド（1小節1コード入力）・簡易プレビュー・保存。
   歌詞・ドレミ入力とA4紙面プレビューは Phase 2C / Phase 3。
   グローバル名前空間 CruiseStudio.sheetCruise に登録する。 */
(function () {
    'use strict';

    function CS() { return window.CruiseStudio || {}; }

    // フォームのキー選択肢（normalizeKeyName が受ける表記に揃える）
    var KEY_OPTIONS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    // プレビューの1行あたり小節数は sheetSettings.barsPerLine（既定2）。
    // 歌詞もドレミもないセクション（前奏などのコードのみ）は2倍詰めで表示する。

    var state = {
        project: null,   // 編集中の StudioProject
        dirty: false     // 未保存の変更があるか（TOP復帰時の中断確認に使う）
    };

    var els = {};

    function q(id) { return document.getElementById(id); }

    function resolveElements() {
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
        // 画面切替直後は clientWidth が 0 のことがあるため、表示後にもう一度合わせる
        window.requestAnimationFrame(updateSheetScale);
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
        window.addEventListener('resize', updateSheetScale);

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
