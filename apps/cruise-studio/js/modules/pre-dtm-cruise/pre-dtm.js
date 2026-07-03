/* クルーズスタジオ — pre-dtm.js（v0.6.0）
   プレDTMクルーズ画面: 譜面クルーズと同じ StudioProject を読み込み、
   伴奏設定（パートON/OFF・パターン・アクセント）を変えて伴奏イベントを再生成し、
   伴奏JSON / SMF(.mid) を書き出す。音はまだ鳴らさない（ADR-013 / ADR-015）。

   伴奏設定は曲データではなくアプリ設定（cruiseStudio.appSettings）に保存する（ADR-014）。
   グローバル名前空間 CruiseStudio.preDtm に登録する。 */
(function () {
    'use strict';

    function CS() { return window.CruiseStudio || {}; }

    var SETTINGS_KEY = 'preDtmSettings'; // cruiseStudio.appSettings 内のキー

    var state = {
        project: null,      // 閲覧中の StudioProject（読み取り専用。編集は譜面クルーズで行う）
        settings: null,     // 伴奏設定（normalizeSettings済み）
        arrangement: null   // generateArrangement の結果
    };

    var els = {};

    function q(id) { return document.getElementById(id); }

    function resolveElements() {
        els.projectSelect = q('pd-project-select');
        els.reloadBtn = q('pd-reload');
        els.exportJsonBtn = q('pd-export-json');
        els.exportMidiBtn = q('pd-export-midi');
        els.gotoSheetBtn = q('pd-goto-sheet');
        els.status = q('pd-status');
        els.empty = q('pd-empty');
        els.emptyGotoSheet = q('pd-empty-goto-sheet');
        els.content = q('pd-content');
        els.songInfo = q('pd-song-info');
        els.parts = q('pd-parts');
        els.warnings = q('pd-warnings');
        els.previewBody = q('pd-preview-body');
        els.onGuitar = q('pd-on-guitar');
        els.onBass = q('pd-on-bass');
        els.onDrums = q('pd-on-drums');
        els.guitarPattern = q('pd-guitar-pattern');
        els.guitarAccent = q('pd-guitar-accent');
        els.bassPattern = q('pd-bass-pattern');
        els.drumsPattern = q('pd-drums-pattern');
    }

    function setStatus(message, isError) {
        if (!els.status) return;
        els.status.textContent = message || '';
        els.status.classList.toggle('is-error', !!isError);
    }

    /* ══════════ 伴奏設定（アプリ設定として保存: ADR-014） ══════════ */

    function loadSettings() {
        var saved = CS().storage.getAppSetting(SETTINGS_KEY);
        state.settings = CS().arrangement.normalizeSettings(saved);
    }

    function saveSettings() {
        CS().storage.setAppSetting(SETTINGS_KEY, state.settings);
    }

    function fillSelect(select, options) {
        select.innerHTML = '';
        options.forEach(function (item) {
            var opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.name;
            select.appendChild(opt);
        });
    }

    function syncSettingsUI() {
        var s = state.settings;
        els.onGuitar.checked = s.parts.guitar;
        els.onBass.checked = s.parts.bass;
        els.onDrums.checked = s.parts.drums;
        els.guitarPattern.value = s.guitar.pattern;
        els.guitarAccent.value = s.guitar.accent;
        els.bassPattern.value = s.bass.pattern;
        els.drumsPattern.value = s.drums.pattern;
    }

    function readSettingsFromUI() {
        state.settings = CS().arrangement.normalizeSettings({
            parts: {
                guitar: els.onGuitar.checked,
                bass: els.onBass.checked,
                drums: els.onDrums.checked
            },
            guitar: { pattern: els.guitarPattern.value, accent: els.guitarAccent.value },
            bass: { pattern: els.bassPattern.value },
            drums: { pattern: els.drumsPattern.value }
        });
    }

    function onSettingChange() {
        readSettingsFromUI();
        saveSettings();
        if (state.project) {
            regenerate();
            setStatus('設定を反映して再生成しました');
        }
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

    function regenerate() {
        state.arrangement = CS().arrangement.generateArrangement(state.project, state.settings);
        renderAll();
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
        els.empty.classList.add('hidden');
        els.content.classList.remove('hidden');
        regenerate();
        setStatus('「' + res.project.songInfo.title + '」から伴奏イベントを生成しました');
        return true;
    }

    /**
     * 画面に入る。currentProjectId（譜面クルーズと共通）→ 保存済み先頭 の順で読み込む。
     * どちらもなければ空状態（譜面クルーズでの作成を案内）。
     */
    function enter() {
        loadSettings();
        syncSettingsUI();
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

    function patternName(list, id) {
        var name = id;
        list.forEach(function (item) { if (item.id === id) name = item.name; });
        return name;
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
        var arr = CS().arrangement;
        var t = state.arrangement.totals;
        var s = state.arrangement.settings;
        els.parts.innerHTML = '';
        [
            {
                icon: '🎸', name: 'アコギ', on: s.parts.guitar, count: t.guitar,
                desc: patternName(arr.GUITAR_PATTERNS, s.guitar.pattern) +
                    ' / アクセント: ' + patternName(arr.GUITAR_ACCENTS, s.guitar.accent),
                midi: 'MIDI対象外（ボイシング対応後）'
            },
            {
                icon: '🎚️', name: 'ベース', on: s.parts.bass, count: t.bass,
                desc: patternName(arr.BASS_PATTERNS, s.bass.pattern),
                midi: 'MIDI書き出し対象（ch1）'
            },
            {
                icon: '🥁', name: 'ドラム', on: s.parts.drums, count: t.drums,
                desc: patternName(arr.DRUM_PATTERNS, s.drums.pattern),
                midi: 'MIDI書き出し対象（ch10）'
            }
        ].forEach(function (part) {
            var card = document.createElement('div');
            card.className = 'pd-part-card' + (part.on ? '' : ' is-off');
            var icon = document.createElement('span');
            icon.className = 'pd-part-icon';
            icon.textContent = part.icon;
            var name = document.createElement('span');
            name.className = 'pd-part-name';
            name.textContent = part.name;
            var desc = document.createElement('span');
            desc.className = 'pd-part-desc';
            desc.textContent = part.desc;
            var midi = document.createElement('span');
            midi.className = 'pd-part-midi';
            midi.textContent = part.midi;
            var count = document.createElement('span');
            count.className = 'pd-part-count';
            count.textContent = part.on ? part.count + ' イベント' : 'OFF';
            card.appendChild(icon);
            card.appendChild(name);
            card.appendChild(desc);
            card.appendChild(midi);
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

    function bassSummary(bass) {
        if (bass.length === 0) return '−';
        var root = '';
        var fifth = '';
        bass.forEach(function (ev) {
            if (ev.role === 'root' && !root) root = ev.noteName;
            if (ev.role === 'fifth' && !fifth) fifth = ev.noteName;
        });
        var label = fifth ? ('ルート＋5度 ' + root + '/' + fifth) : ('ルート ' + root);
        return label + '（×' + bass.length + '）';
    }

    function drumSummary(drums) {
        if (drums.length === 0) return '−';
        var c = { kick: 0, snare: 0, hihat: 0 };
        drums.forEach(function (ev) { if (c[ev.role] !== undefined) c[ev.role]++; });
        return 'K' + c.kick + ' / S' + c.snare + ' / H' + c.hihat;
    }

    function renderPreviewTable() {
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
                ? CS().arrangement.strumPatternToGlyphs(state.project, state.project.bars[i], state.settings)
                : '−';
            row.appendChild(guitarCell);

            var bassCell = document.createElement('td');
            bassCell.className = 'pd-cell-bass';
            bassCell.textContent = bassSummary(arrBar.bass);
            row.appendChild(bassCell);

            var drumCell = document.createElement('td');
            drumCell.className = 'pd-cell-drums';
            drumCell.textContent = drumSummary(arrBar.drums);
            row.appendChild(drumCell);

            els.previewBody.appendChild(row);
        });
    }

    /* ══════════ 書き出し ══════════ */

    function downloadBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function safeFileName(title, suffix) {
        var base = String(title || 'arrangement').replace(/[\\/:*?"<>|\s]+/g, '_');
        return 'cruise-studio_' + base + suffix;
    }

    /**
     * 伴奏JSON書き出し（DAW前の設計図。MIDI変換可能な情報を完全に含む）。
     */
    function exportArrangementJson() {
        if (!state.arrangement || !state.project) return;
        var arr = state.arrangement;
        var flat = CS().arrangement.flattenEvents(arr);
        var payload = {
            type: 'cruise-studio-arrangement',
            appVersion: CS().model.APP_VERSION,
            projectId: arr.meta.projectId,
            songTitle: arr.meta.title,
            artist: arr.meta.artist || '',
            bpm: arr.meta.bpm,
            timeSignature: arr.meta.timeSignature,
            ticksPerBeat: arr.meta.ticksPerBeat,
            originalKey: arr.meta.originalKey,
            playKey: arr.meta.playKey,
            capo: arr.meta.capo,
            settings: arr.settings,
            midiExportTargets: arr.meta.midiExportTargets,
            parts: {
                guitar: { enabled: arr.settings.parts.guitar, events: arr.totals.guitar, midiExport: false },
                bass: { enabled: arr.settings.parts.bass, events: arr.totals.bass, midiExport: true },
                drums: { enabled: arr.settings.parts.drums, events: arr.totals.drums, midiExport: true }
            },
            generatedEvents: flat,
            warnings: arr.warnings,
            generatedAt: arr.meta.generatedAt
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        downloadBlob(blob, safeFileName(arr.meta.title, '_arrangement.json'));
        setStatus('伴奏イベントをJSONファイルへ書き出しました');
    }

    /**
     * SMF(.mid) 書き出し（対象: ベース / ドラム。ADR-015）。
     */
    function exportMidi() {
        if (!state.arrangement || !state.project) return;
        var midi = CS().midi;
        var result = midi.buildMidiFile(state.arrangement);
        if (!result.ok) {
            setStatus(result.error, true);
            return;
        }
        // 自己検証: 生成バイト列の構造チェック
        var check = midi.inspectSmf(result.bytes);
        if (!check.ok) {
            setStatus('MIDI生成の内部検証に失敗しました: ' + check.error, true);
            return;
        }
        var blob = new Blob([result.bytes], { type: 'audio/midi' });
        downloadBlob(blob, safeFileName(state.arrangement.meta.title, '.mid'));
        setStatus('.mid を書き出しました（' + result.stats.tracks + 'トラック / ベース' +
            result.stats.bassNotes + '音 / ドラム' + result.stats.drumNotes + '音）');
    }

    /* ══════════ 初期化 ══════════ */

    function init() {
        resolveElements();

        var arr = CS().arrangement;
        fillSelect(els.guitarPattern, arr.GUITAR_PATTERNS);
        fillSelect(els.guitarAccent, arr.GUITAR_ACCENTS);
        fillSelect(els.bassPattern, arr.BASS_PATTERNS);
        fillSelect(els.drumsPattern, arr.DRUM_PATTERNS);
        loadSettings();
        syncSettingsUI();

        [els.onGuitar, els.onBass, els.onDrums,
         els.guitarPattern, els.guitarAccent, els.bassPattern, els.drumsPattern
        ].forEach(function (el) {
            el.addEventListener('change', onSettingChange);
        });

        els.projectSelect.addEventListener('change', function () {
            loadAndRender(els.projectSelect.value);
        });
        els.reloadBtn.addEventListener('click', function () {
            enter();
        });
        els.exportJsonBtn.addEventListener('click', exportArrangementJson);
        els.exportMidiBtn.addEventListener('click', exportMidi);

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
