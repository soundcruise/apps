/* クルーズスタジオ — pre-dtm.js（Phase 5 MVP骨格）
   プレDTMクルーズ画面: 譜面クルーズと同じ StudioProject を読み込み、
   コード進行からアコギ / ベース / ドラムの生成イベントを確認する。
   音は鳴らさない（生成イベント確認を優先。ADR-013）。
   グローバル名前空間 CruiseStudio.preDtm に登録する。 */
(function () {
    'use strict';

    function CS() { return window.CruiseStudio || {}; }

    var state = {
        project: null,      // 閲覧中の StudioProject（読み取り専用。編集は譜面クルーズで行う）
        arrangement: null   // generateArrangement の結果
    };

    var els = {};

    function q(id) { return document.getElementById(id); }

    function resolveElements() {
        els.projectSelect = q('pd-project-select');
        els.reloadBtn = q('pd-reload');
        els.exportBtn = q('pd-export-json');
        els.gotoSheetBtn = q('pd-goto-sheet');
        els.status = q('pd-status');
        els.empty = q('pd-empty');
        els.emptyGotoSheet = q('pd-empty-goto-sheet');
        els.content = q('pd-content');
        els.songInfo = q('pd-song-info');
        els.parts = q('pd-parts');
        els.warnings = q('pd-warnings');
        els.previewBody = q('pd-preview-body');
    }

    function setStatus(message, isError) {
        if (!els.status) return;
        els.status.textContent = message || '';
        els.status.classList.toggle('is-error', !!isError);
    }

    /* ══════════ プロジェクト読み込み（譜面クルーズと同じ currentProjectId を参照） ══════════ */

    function refreshProjectSelect() {
        var storage = CS().storage;
        var projects = storage.listProjects();
        els.projectSelect.innerHTML = '';
        projects.forEach(function (meta) {
            var opt = document.createElement('option');
            opt.value = meta.projectId;
            opt.textContent = meta.title + (meta.artist ? ' / ' + meta.artist : '');
            els.projectSelect.appendChild(opt);
        });
        if (state.project) els.projectSelect.value = state.project.projectId;
    }

    function showEmptyState() {
        state.project = null;
        state.arrangement = null;
        els.empty.classList.remove('hidden');
        els.content.classList.add('hidden');
        setStatus('');
    }

    function loadAndRender(projectId) {
        var storage = CS().storage;
        var res = storage.loadProject(projectId);
        if (!res.ok) {
            setStatus(res.error, true);
            return false;
        }
        state.project = res.project;
        storage.setCurrentProjectId(res.project.projectId); // 譜面クルーズと共有
        state.arrangement = CS().arrangement.generateArrangement(res.project);
        els.empty.classList.add('hidden');
        els.content.classList.remove('hidden');
        renderAll();
        setStatus('「' + res.project.songInfo.title + '」から伴奏イベントを生成しました');
        return true;
    }

    /**
     * 画面に入る。currentProjectId（譜面クルーズと共通）→ 保存済み先頭 の順で読み込む。
     * どちらもなければ空状態（譜面クルーズでの作成を案内）。
     */
    function enter() {
        var storage = CS().storage;
        refreshProjectSelect();
        var currentId = storage.getCurrentProjectId();
        if (currentId && loadAndRender(currentId)) {
            refreshProjectSelect();
            return;
        }
        var first = storage.listProjects()[0];
        if (first && loadAndRender(first.projectId)) {
            refreshProjectSelect();
            return;
        }
        showEmptyState();
    }

    /* ══════════ 描画 ══════════ */

    function renderAll() {
        renderSongInfo();
        renderParts();
        renderWarnings();
        renderPreviewTable();
    }

    function infoItem(label, value) {
        var item = document.createElement('div');
        item.className = 'pd-info-item';
        var l = document.createElement('span');
        l.className = 'pd-info-label';
        l.textContent = label;
        var v = document.createElement('span');
        v.className = 'pd-info-value';
        v.textContent = value;
        item.appendChild(l);
        item.appendChild(v);
        return item;
    }

    function renderSongInfo() {
        var si = state.project.songInfo;
        var t = state.arrangement.totals;
        els.songInfo.innerHTML = '';
        [
            ['曲名', si.title + (si.artist ? ' / ' + si.artist : '')],
            ['キー', 'ORG ' + si.originalKey + '（' + (si.capo > 0 ? si.capo + 'カポ' + si.playKey : 'Play ' + si.playKey) + '）'],
            ['BPM', String(si.bpm)],
            ['拍子', si.timeSignature.beats + '/' + si.timeSignature.beatUnit],
            ['小節数', String(state.project.bars.length)],
            ['コードあり', t.chordBars + ' 小節']
        ].forEach(function (pair) {
            els.songInfo.appendChild(infoItem(pair[0], pair[1]));
        });
    }

    function renderParts() {
        var t = state.arrangement.totals;
        var enabled = state.arrangement.meta.enabled;
        els.parts.innerHTML = '';
        [
            { icon: '🎸', name: 'アコギ', desc: 'コード×基本ストローク', count: t.guitar, on: enabled.guitar },
            { icon: '🎚️', name: 'ベース', desc: 'ルート音の8分弾き', count: t.bass, on: enabled.bass },
            { icon: '🥁', name: 'ドラム', desc: '基本8ビート', count: t.drums, on: enabled.drums }
        ].forEach(function (part) {
            var card = document.createElement('div');
            card.className = 'pd-part-card' + (part.on ? '' : ' is-off');
            card.innerHTML = '';
            var icon = document.createElement('span');
            icon.className = 'pd-part-icon';
            icon.textContent = part.icon;
            var name = document.createElement('span');
            name.className = 'pd-part-name';
            name.textContent = part.name;
            var desc = document.createElement('span');
            desc.className = 'pd-part-desc';
            desc.textContent = part.desc;
            var count = document.createElement('span');
            count.className = 'pd-part-count';
            count.textContent = part.on ? part.count + ' イベント' : 'OFF';
            card.appendChild(icon);
            card.appendChild(name);
            card.appendChild(desc);
            card.appendChild(count);
            els.parts.appendChild(card);
        });
    }

    function renderWarnings() {
        var warnings = state.arrangement.warnings || [];
        els.warnings.innerHTML = '';
        els.warnings.classList.toggle('hidden', warnings.length === 0);
        warnings.forEach(function (w) {
            var li = document.createElement('li');
            li.textContent = w;
            els.warnings.appendChild(li);
        });
    }

    function sectionNameById(sectionId) {
        var name = '';
        (state.project.sections || []).forEach(function (sec) {
            if (sec.id === sectionId) name = sec.name;
        });
        return name;
    }

    function drumSummary(drums) {
        if (drums.length === 0) return '−';
        var c = { kick: 0, snare: 0, hihat: 0 };
        drums.forEach(function (ev) { if (c[ev.part] !== undefined) c[ev.part]++; });
        return '8ビート（K' + c.kick + ' / S' + c.snare + ' / H' + c.hihat + '）';
    }

    function renderPreviewTable() {
        var model = CS().model;
        els.previewBody.innerHTML = '';
        var lastSectionId = null;

        state.arrangement.bars.forEach(function (arrBar, i) {
            // セクション見出し行
            if (arrBar.sectionId !== lastSectionId) {
                lastSectionId = arrBar.sectionId;
                var secRow = document.createElement('tr');
                secRow.className = 'pd-section-row';
                var secCell = document.createElement('td');
                secCell.colSpan = 5;
                secCell.textContent = sectionNameById(arrBar.sectionId);
                secRow.appendChild(secCell);
                els.previewBody.appendChild(secRow);
            }

            var row = document.createElement('tr');

            var numCell = document.createElement('td');
            numCell.className = 'pd-cell-num';
            numCell.textContent = arrBar.barNumber;
            row.appendChild(numCell);

            var chordCell = document.createElement('td');
            chordCell.className = 'pd-cell-chord' + (arrBar.isCarriedOver ? ' is-carried' : '');
            chordCell.textContent = arrBar.chordSymbol
                ? (arrBar.isCarriedOver ? '（' + arrBar.chordSymbol + '）' : arrBar.chordSymbol)
                : '休';
            if (arrBar.isCarriedOver) chordCell.title = '直前のコードを継続';
            row.appendChild(chordCell);

            var guitarCell = document.createElement('td');
            guitarCell.className = 'pd-cell-pattern';
            guitarCell.textContent = arrBar.guitar.length > 0
                ? CS().arrangement.strumPatternToGlyphs(state.project, state.project.bars[i])
                : '−';
            row.appendChild(guitarCell);

            var bassCell = document.createElement('td');
            bassCell.className = 'pd-cell-bass';
            bassCell.textContent = arrBar.bass.length > 0
                ? 'ルート ' + arrBar.bass[0].noteName + '（8分×' + arrBar.bass.length + '）'
                : '−';
            row.appendChild(bassCell);

            var drumCell = document.createElement('td');
            drumCell.className = 'pd-cell-drums';
            drumCell.textContent = drumSummary(arrBar.drums);
            row.appendChild(drumCell);

            els.previewBody.appendChild(row);
        });
    }

    /* ══════════ 操作 ══════════ */

    function exportArrangementJson() {
        if (!state.arrangement) return;
        var json = JSON.stringify(state.arrangement, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var title = (state.project && state.project.songInfo.title) || 'arrangement';
        a.href = url;
        a.download = 'cruise-studio_arrangement_' + title.replace(/[\\/:*?"<>|\s]+/g, '_') + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setStatus('伴奏イベントをJSONファイルへ書き出しました');
    }

    function init() {
        resolveElements();

        els.projectSelect.addEventListener('change', function () {
            loadAndRender(els.projectSelect.value);
        });
        els.reloadBtn.addEventListener('click', function () {
            enter();
        });
        els.exportBtn.addEventListener('click', exportArrangementJson);

        // 譜面クルーズへの遷移は app.js が担当（モジュール間の直接参照を避ける）
        var goSheet = function () {
            var handler = CS().app && CS().app.openSheetCruise;
            if (handler) handler();
        };
        els.gotoSheetBtn.addEventListener('click', goSheet);
        els.emptyGotoSheet.addEventListener('click', goSheet);
    }

    window.CruiseStudio = window.CruiseStudio || {};
    window.CruiseStudio.preDtm = {
        init: init,
        enter: enter
    };
})();
