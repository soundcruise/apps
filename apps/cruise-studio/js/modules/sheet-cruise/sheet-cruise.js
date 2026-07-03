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
        return window.confirm('保存されていない変更があります。破棄して続けますか？');
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

    /* ══════════ 簡易プレビュー（Phase 3でA4紙面レンダリングに置き換える） ══════════ */

    function renderPreview() {
        var model = CS().model;
        var si = state.project.songInfo;
        els.preview.innerHTML = '';

        // ヘッダー: 曲名 / アーティスト / キー情報（教材コード譜の紙面ヘッダーの簡易版）
        var header = document.createElement('div');
        header.className = 'preview-header';

        var titleRow = document.createElement('div');
        titleRow.className = 'preview-title-row';
        var title = document.createElement('span');
        title.className = 'preview-title';
        title.textContent = si.title || '無題';
        titleRow.appendChild(title);
        if (si.artist) {
            var artist = document.createElement('span');
            artist.className = 'preview-artist';
            artist.textContent = '/ ' + si.artist;
            titleRow.appendChild(artist);
        }
        header.appendChild(titleRow);

        var strumName = '';
        (state.project.strumPatterns || []).forEach(function (pat) {
            if (pat.id === state.project.basicStrumPatternId) strumName = pat.name;
        });

        var meta = document.createElement('div');
        meta.className = 'preview-meta';
        var metaItems = [
            'ORGキー: ' + si.originalKey,
            'Playキー: ' + (si.capo > 0 ? si.capo + 'カポ' + si.playKey : si.playKey),
            'カポ: ' + (si.capo > 0 ? si.capo : 'なし'),
            'BPM: ' + si.bpm,
            '拍子: ' + si.timeSignature.beats + '/' + si.timeSignature.beatUnit
        ];
        if (strumName) metaItems.push('基本ストローク: ' + strumName);
        metaItems.forEach(function (text) {
            var item = document.createElement('span');
            item.className = 'preview-meta-item';
            item.textContent = text;
            meta.appendChild(item);
        });
        header.appendChild(meta);
        els.preview.appendChild(header);

        var barsPerLine = (state.project.sheetSettings && state.project.sheetSettings.barsPerLine) || 2;

        // セクションごとの譜面（コード上段 / 歌詞中段 / ドレミ下段）
        state.project.sections.forEach(function (sec) {
            var bars = model.getSectionBars(state.project, sec.id);

            var label = document.createElement('div');
            label.className = 'preview-section-label';
            label.textContent = sec.name;
            els.preview.appendChild(label);

            // 歌詞もドレミもないセクションはコードのみの詰めた段組にする（前奏など）
            var hasVocal = bars.some(function (bar) {
                return (bar.lyrics && bar.lyrics.length > 0) || (bar.melody && bar.melody.length > 0);
            });
            var cols = hasVocal ? barsPerLine : barsPerLine * 2;

            var grid = document.createElement('div');
            grid.className = 'preview-bars' + (hasVocal ? '' : ' preview-bars--chords-only');
            grid.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';

            bars.forEach(function (bar) {
                var box = document.createElement('div');
                box.className = 'preview-bar';

                var num = document.createElement('span');
                num.className = 'preview-bar-num';
                num.textContent = bar.barNumber;
                box.appendChild(num);

                var chord = document.createElement('span');
                chord.className = 'preview-bar-chord';
                chord.textContent = (bar.chords[0] && bar.chords[0].symbol) || '';
                box.appendChild(chord);

                if (hasVocal) {
                    var lyrics = document.createElement('span');
                    lyrics.className = 'preview-bar-lyrics';
                    lyrics.textContent = model.getBarLyricsText(bar);
                    box.appendChild(lyrics);

                    var doremi = document.createElement('span');
                    doremi.className = 'preview-bar-doremi';
                    CS().theory.melodyEventsToDoremiTokens(bar.melody || []).forEach(function (token) {
                        var note = document.createElement('span');
                        note.className = 'preview-doremi-note' +
                            (token.octave > 0 ? ' is-high' : (token.octave < 0 ? ' is-low' : ''));
                        note.textContent = token.text;
                        doremi.appendChild(note);
                    });
                    box.appendChild(doremi);
                }

                grid.appendChild(box);
            });

            els.preview.appendChild(grid);
        });
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
     * 前回開いていたプロジェクトがあれば復元し、なければ新規作成する。
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
    }

    window.CruiseStudio = window.CruiseStudio || {};
    window.CruiseStudio.sheetCruise = {
        init: init,
        enter: enter,
        canLeave: canLeave
    };
})();
