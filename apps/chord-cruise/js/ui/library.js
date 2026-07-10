(function () {
    'use strict';

    /* コード本棚。フォルダ一覧 → フォルダ内一覧 → 保存コード詳細 の3階層。 */

    var FINGER_CYCLE = [null, 'T', 1, 2, 3, 4];
    var FINGER_LABELS = { T: '親', 1: '人', 2: '中', 3: '薬', 4: '小' };

    var view = 'folders';           // 'folders' | 'list' | 'detail'
    var currentFolderId = null;
    var currentChordId = null;
    var currentDetailChord = null;
    var detailMonochrome = false;

    function storage() { return window.ChordCruise.storage; }
    function theory() { return window.ChordCruise.theory; }
    function displayChordName(name) { return theory().displayChordName(name); }
    function chordFormName(chord) {
        if (chord && chord.formName) return chord.formName;
        if (chord && chord.shape) return chord.shape + '型';
        return 'フォーム';
    }

    function normalizeLibraryColumns(value) {
        return [1, 2, 3, 4].indexOf(value) !== -1 ? value : 4;
    }

    function currentLibraryColumns() {
        var settings = window.ChordCruise.state && window.ChordCruise.state.settings;
        return normalizeLibraryColumns(settings && settings.libraryColumns);
    }

    function contentEl() {
        return document.getElementById('cc-lib-content');
    }

    function setContentLayout(layout) {
        var content = contentEl();
        if (content) content.className = 'cc-lib-content cc-lib-content--' + layout;
    }

    function buildSkeleton(section) {
        if (document.getElementById('cc-lib-content')) return;
        var header = section.querySelector('.cc-page-header');
        section.innerHTML = '';
        if (header) section.appendChild(header);
        var content = document.createElement('div');
        content.id = 'cc-lib-content';
        content.className = 'cc-lib-content';
        section.appendChild(content);
    }

    // ---- 確認モーダル（危険操作用） ----

    var confirmOverlay = null;
    var confirmHandler = null;

    function confirmDanger(message, okLabel, onOk) {
        if (!confirmOverlay) {
            confirmOverlay = document.createElement('div');
            confirmOverlay.className = 'cc-modal-overlay cc-modal-overlay--hidden';
            confirmOverlay.innerHTML =
                '<div class="cc-confirm-card" role="alertdialog">' +
                    '<p class="cc-confirm-message" id="cc-confirm-message"></p>' +
                    '<div class="cc-confirm-actions">' +
                        '<button type="button" class="cc-btn cc-btn-danger" id="cc-confirm-ok"></button>' +
                        '<button type="button" class="cc-btn cc-btn-secondary" id="cc-confirm-cancel">キャンセル</button>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(confirmOverlay);
            document.getElementById('cc-confirm-cancel').addEventListener('click', function () {
                confirmOverlay.classList.add('cc-modal-overlay--hidden');
                confirmHandler = null;
            });
            document.getElementById('cc-confirm-ok').addEventListener('click', function () {
                confirmOverlay.classList.add('cc-modal-overlay--hidden');
                var handler = confirmHandler;
                confirmHandler = null;
                if (handler) handler();
            });
        }
        document.getElementById('cc-confirm-message').textContent = message;
        document.getElementById('cc-confirm-ok').textContent = okLabel;
        confirmHandler = onOk;
        confirmOverlay.classList.remove('cc-modal-overlay--hidden');
    }

    // ---- 共通ヘルパー ----

    function folderById(id) {
        var found = null;
        storage().loadFolders().forEach(function (folder) {
            if (folder.id === id) found = folder;
        });
        return found;
    }

    function chordCountIn(folderId) {
        return storage().loadChordIndex().filter(function (entry) {
            return entry.folderId === folderId;
        }).length;
    }

    function escapeHtml(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function buildChordThumbnailGridHtml(chords, requestedColumns) {
        var columns = normalizeLibraryColumns(requestedColumns);
        var html = '<div class="cc-chordthumb-grid" id="cc-chordthumb-grid" data-library-columns="' + columns + '">';
        chords.forEach(function (chord) {
            var displayName = displayChordName(chord.chordName);
            html += '<button type="button" class="cc-chordthumb-card" data-chord-id="' + escapeHtml(chord.id) + '" aria-label="' + escapeHtml(displayChordName(chord.chordName)) + 'の指板を開く">' +
                '<span class="cc-chordthumb-name" title="' + escapeHtml(displayName) + '">' + escapeHtml(displayName) + '</span>' +
                '<span class="cc-chordthumb-board" data-chord-thumb="' + escapeHtml(chord.id) + '" aria-hidden="true"></span>' +
            '</button>';
        });
        return html + '</div>';
    }

    function buildLibraryColumnsControlHtml(columns) {
        var html = '<div class="cc-lib-columns-control">' +
            '<span class="cc-save-label">表示</span>' +
            '<div class="cc-segment cc-lib-columns-segment" role="group" aria-label="コード一覧の列数">';
        [1, 2, 3, 4].forEach(function (value) {
            html += '<button type="button" class="cc-segment-btn' + (columns === value ? ' cc-segment-btn--active' : '') + '" data-library-columns-choice="' + value + '" aria-pressed="' + (columns === value ? 'true' : 'false') + '">' + value + '列</button>';
        });
        return html + '</div></div>';
    }

    function applyLibraryColumns(columns) {
        var normalized = normalizeLibraryColumns(columns);
        var grid = document.getElementById('cc-chordthumb-grid');
        if (grid) grid.setAttribute('data-library-columns', String(normalized));
        Array.prototype.forEach.call(contentEl().querySelectorAll('[data-library-columns-choice]'), function (button) {
            var selected = parseInt(button.getAttribute('data-library-columns-choice'), 10) === normalized;
            button.classList.toggle('cc-segment-btn--active', selected);
            button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        return normalized;
    }

    // ---- ビュー: フォルダ一覧 ----

    function renderFolders() {
        view = 'folders';
        currentDetailChord = null;
        detailMonochrome = false;
        setContentLayout('folders');
        var folders = storage().loadFolders().slice().sort(function (a, b) {
            return (a.order || 0) - (b.order || 0);
        });
        var html = '<div class="cc-card">' +
            '<h3 class="cc-card-heading">フォルダ</h3>' +
            '<div class="cc-folder-list">';
        folders.forEach(function (folder) {
            html += '<button type="button" class="cc-folder-card" data-folder-id="' + folder.id + '">' +
                '<span class="cc-folder-card-icon">📁</span>' +
                '<span class="cc-folder-card-body">' +
                    '<span class="cc-folder-card-name">' + escapeHtml(folder.name) + '</span>' +
                    '<span class="cc-folder-card-count">' + chordCountIn(folder.id) + '件</span>' +
                '</span>' +
                '<span class="cc-folder-card-chevron">›</span>' +
            '</button>';
        });
        html += '</div>' +
            '<div class="cc-inline-create" id="cc-folder-create-area">' +
                '<button type="button" class="cc-btn cc-btn-secondary cc-btn--block" id="cc-folder-create-btn">＋ フォルダを作成</button>' +
                '<div class="cc-inline-input-row cc-inline-input-row--hidden" id="cc-folder-create-row">' +
                    '<input type="text" class="cc-input" id="cc-folder-create-input" placeholder="フォルダ名" maxlength="24">' +
                    '<button type="button" class="cc-btn cc-btn-primary cc-btn--small" id="cc-folder-create-ok">作成</button>' +
                    '<button type="button" class="cc-btn cc-btn-secondary cc-btn--small" id="cc-folder-create-cancel">やめる</button>' +
                '</div>' +
            '</div>' +
        '</div>';
        contentEl().innerHTML = html;

        Array.prototype.forEach.call(contentEl().querySelectorAll('.cc-folder-card'), function (btn) {
            btn.addEventListener('click', function () {
                currentFolderId = btn.dataset.folderId;
                renderList();
            });
        });
        document.getElementById('cc-folder-create-btn').addEventListener('click', function () {
            document.getElementById('cc-folder-create-btn').style.display = 'none';
            document.getElementById('cc-folder-create-row').classList.remove('cc-inline-input-row--hidden');
            document.getElementById('cc-folder-create-input').focus();
        });
        document.getElementById('cc-folder-create-cancel').addEventListener('click', renderFolders);
        document.getElementById('cc-folder-create-ok').addEventListener('click', function () {
            var name = document.getElementById('cc-folder-create-input').value.trim();
            if (!name) return;
            storage().createFolder(name);
            renderFolders();
        });
    }

    // ---- ビュー: フォルダ内一覧 ----

    function renderList() {
        view = 'list';
        currentDetailChord = null;
        detailMonochrome = false;
        setContentLayout('list');
        var folder = folderById(currentFolderId);
        if (!folder) {
            renderFolders();
            return;
        }
        var entries = storage().loadChordIndex().filter(function (entry) {
            return entry.folderId === folder.id;
        }).sort(function (a, b) {
            return String(b.updatedAt).localeCompare(String(a.updatedAt));
        });
        var chords = entries.map(function (entry) {
            return storage().loadChord(entry.id);
        }).filter(function (chord) { return !!chord; });
        var columns = currentLibraryColumns();

        var html = '<div class="cc-card cc-lib-folder-head">' +
            '<div class="cc-lib-folder-title-row">' +
                '<h3 class="cc-card-heading">📁 ' + escapeHtml(folder.name) + '</h3>' +
                (!folder.builtin
                    ? '<div class="cc-lib-folder-actions">' +
                        '<button type="button" class="cc-btn cc-btn-secondary cc-btn--small" id="cc-folder-rename-btn">改名</button>' +
                        '<button type="button" class="cc-btn cc-btn-danger cc-btn--small" id="cc-folder-delete-btn">削除</button>' +
                      '</div>'
                    : '') +
            '</div>' +
            '<div class="cc-inline-input-row cc-inline-input-row--hidden" id="cc-folder-rename-row">' +
                '<input type="text" class="cc-input" id="cc-folder-rename-input" maxlength="24">' +
                '<button type="button" class="cc-btn cc-btn-primary cc-btn--small" id="cc-folder-rename-ok">変更</button>' +
                '<button type="button" class="cc-btn cc-btn-secondary cc-btn--small" id="cc-folder-rename-cancel">やめる</button>' +
            '</div>' +
            buildLibraryColumnsControlHtml(columns) +
        '</div>';

        if (chords.length === 0) {
            html += '<div class="cc-card cc-placeholder-card"><p>このフォルダにはまだコードがありません。「コードを調べる」からCAGEDフォームを保存できます。</p></div>';
        } else {
            html += buildChordThumbnailGridHtml(chords, columns);
        }
        contentEl().innerHTML = html;

        Array.prototype.forEach.call(contentEl().querySelectorAll('[data-library-columns-choice]'), function (button) {
            button.addEventListener('click', function () {
                var nextColumns = applyLibraryColumns(parseInt(button.getAttribute('data-library-columns-choice'), 10));
                window.ChordCruise.state.settings.libraryColumns = nextColumns;
                storage().saveSettings({ libraryColumns: nextColumns });
            });
        });

        if (chords.length) {
            renderListThumbnails(chords);
            document.getElementById('cc-chordthumb-grid').addEventListener('click', function (event) {
                var card = event.target.closest('.cc-chordthumb-card');
                if (!card) return;
                currentChordId = card.dataset.chordId;
                renderDetail();
            });
        }

        if (!folder.builtin) {
            document.getElementById('cc-folder-rename-btn').addEventListener('click', function () {
                var row = document.getElementById('cc-folder-rename-row');
                row.classList.remove('cc-inline-input-row--hidden');
                var input = document.getElementById('cc-folder-rename-input');
                input.value = folder.name;
                input.focus();
            });
            document.getElementById('cc-folder-rename-cancel').addEventListener('click', renderList);
            document.getElementById('cc-folder-rename-ok').addEventListener('click', function () {
                var name = document.getElementById('cc-folder-rename-input').value.trim();
                if (!name) return;
                storage().renameFolder(folder.id, name);
                renderList();
            });
            document.getElementById('cc-folder-delete-btn').addEventListener('click', function () {
                confirmDanger(
                    'フォルダ「' + folder.name + '」を削除しますか？中のコードは「未分類」に移動します。',
                    '削除する',
                    function () {
                        storage().deleteFolder(folder.id);
                        renderFolders();
                    }
                );
            });
        }
    }

    // ---- ビュー: 保存コード詳細 ----

    function chordUseFlats(chord) {
        if (chord.keyContext) {
            return theory().keyUsesFlats(chord.keyContext.tonicPc, chord.keyContext.mode);
        }
        return false;
    }

    function detailDisplayMode() {
        var mode = window.ChordCruise.state.settings.fretboardDisplayMode;
        return ['note', 'solfege', 'degree', 'finger'].indexOf(mode) !== -1 ? mode : 'note';
    }

    function detailMarkerLabel(chord, note, requestedMode) {
        var mode = requestedMode || detailDisplayMode();
        if (mode === 'finger') {
            return note.finger != null ? (FINGER_LABELS[note.finger] || '') : '';
        }
        var openPc = theory().OPEN_STRINGS[6 - note.string];
        var pc = (openPc + note.fret) % 12;
        if (mode === 'solfege') return theory().solfegeName(pc, chordUseFlats(chord));
        if (mode === 'degree') return theory().degreeLabels([note.interval])[0];
        return theory().noteName(pc, chordUseFlats(chord));
    }

    function roleForInterval(interval) {
        if (interval === 0) return 'root';
        if (interval === 3 || interval === 4) return 'third';
        if (interval === 6 || interval === 7 || interval === 8) return 'fifth';
        if (interval === 9 || interval === 10 || interval === 11) return 'seventh';
        return 'other';
    }

    /** 保存範囲だけから表示列を作る。開放列と離れた範囲も余計なフレットを挟まない。 */
    function savedFrets(chord) {
        var range = chord && chord.fretRange ? chord.fretRange : {};
        var notes = chord && Array.isArray(chord.notes) ? chord.notes : [];
        var includesOpen = typeof range.includesOpen === 'boolean'
            ? range.includesOpen
            : notes.some(function (note) { return note && note.fret === 0; });
        var min = typeof range.min === 'number' && Math.floor(range.min) === range.min ? range.min : null;
        var max = typeof range.max === 'number' && Math.floor(range.max) === range.max ? range.max : null;
        var hasExplicitRange = min !== null && max !== null && max >= min;
        var frets = [];
        if (includesOpen) frets.push(0);
        if (hasExplicitRange) {
            var fret;
            for (fret = Math.max(1, min); fret <= max; fret++) frets.push(fret);
        }
        if (!hasExplicitRange) {
            notes.forEach(function (note) {
                if (!note || typeof note.fret !== 'number' || note.fret < 0) return;
                if (note.fret === 0 && !includesOpen) return;
                if (frets.indexOf(note.fret) === -1) frets.push(note.fret);
            });
            frets.sort(function (a, b) { return a - b; });
        }
        if (!frets.length) frets.push(includesOpen ? 0 : Math.max(1, min || 1));
        return frets;
    }

    function notesInSavedRange(chord, frets) {
        return (Array.isArray(chord.notes) ? chord.notes : []).filter(function (note) {
            return note && frets.indexOf(note.fret) !== -1;
        });
    }

    function thumbnailMarkerLabel(chord, note) {
        if (note.finger != null) return String(note.finger);
        return theory().degreeLabels([note.interval])[0];
    }

    /** 詳細・一覧・書き出しが同じ保存範囲と座標データを使う。 */
    function savedDiagramOptions(chord, options) {
        var opts = options || {};
        var frets = savedFrets(chord);
        var notes = notesInSavedRange(chord, frets);
        var mode = opts.mode || detailDisplayMode();
        return {
            frets: frets,
            markers: notes.map(function (note) {
                return {
                    string: note.string,
                    fret: note.fret,
                    label: opts.thumbnail
                        ? thumbnailMarkerLabel(chord, note)
                        : detailMarkerLabel(chord, note, mode),
                    role: roleForInterval(note.interval),
                    tappable: !!opts.tappable
                };
            }),
            barres: window.ChordCruise.caged.detectBarres(notes),
            mutedStrings: Array.isArray(chord.mutedStrings) ? chord.mutedStrings : [],
            monochrome: !!opts.monochrome,
            fretNumberHighlightMode: 'all'
        };
    }

    function renderListThumbnails(chords) {
        var byId = {};
        chords.forEach(function (chord) { byId[chord.id] = chord; });
        Array.prototype.forEach.call(contentEl().querySelectorAll('[data-chord-thumb]'), function (host) {
            var chord = byId[host.getAttribute('data-chord-thumb')];
            if (!chord) return;
            var diagramOptions = savedDiagramOptions(chord, { thumbnail: true, monochrome: false });
            diagramOptions.svgClass = 'cc-fb-svg cc-fb-static-svg cc-chordthumb-svg';
            host.innerHTML = window.ChordCruise.ui.fretboard.buildStaticSvg(diagramOptions);
        });
    }

    function renderDetailFretboard(chord) {
        var host = document.getElementById('cc-lib-fb');
        if (!host) return;
        var card = document.getElementById('cc-lib-diagram-card');
        if (card) card.classList.toggle('cc-lib-diagram-card--monochrome', detailMonochrome);
        var fb = window.ChordCruise.ui.fretboard;
        var prevScroll = fb.getScrollLeft(host);
        var diagramOptions = savedDiagramOptions(chord, {
            mode: detailDisplayMode(),
            monochrome: detailMonochrome,
            tappable: true
        });
        diagramOptions.scrollToFret = chord.fretRange
            ? Math.round((chord.fretRange.min + chord.fretRange.max) / 2)
            : null;
        diagramOptions.preserveScroll = typeof prevScroll === 'number' && prevScroll > 0 ? prevScroll : null;
        diagramOptions.onSlotTap = function (stringNum, fret) {
            var target = null;
            (chord.notes || []).forEach(function (note) {
                if (note.string === stringNum && note.fret === fret) target = note;
            });
            if (!target) return;
            var pos = FINGER_CYCLE.indexOf(target.finger);
            target.finger = FINGER_CYCLE[(pos + 1) % FINGER_CYCLE.length];
            storage().saveChord(chord);
            renderDetailFretboard(chord);
        };
        fb.render(host, diagramOptions);
    }

    function updateLibModeSegments() {
        var mode = detailDisplayMode();
        ['note', 'solfege', 'degree', 'finger'].forEach(function (m) {
            var el = document.getElementById('cc-libmode-' + m);
            if (el) el.classList.toggle('cc-segment-btn--active', mode === m);
        });
    }

    function updateMonochromeControl() {
        var toggle = document.getElementById('cc-lib-monochrome-toggle');
        if (!toggle) return;
        toggle.classList.toggle('cc-switch--on', detailMonochrome);
        toggle.setAttribute('aria-checked', detailMonochrome ? 'true' : 'false');
        var state = document.getElementById('cc-lib-monochrome-state');
        if (state) state.textContent = detailMonochrome ? 'ON' : 'OFF';
    }

    function setExportStatus(text, isError) {
        var status = document.getElementById('cc-lib-export-status');
        if (!status) return;
        status.textContent = text || '';
        status.classList.toggle('cc-lib-export-status--error', !!isError);
        status.style.display = text ? '' : 'none';
    }

    function exportCurrentChord(chord) {
        var button = document.getElementById('cc-lib-export-btn');
        if (!button || button.disabled) return Promise.resolve(null);
        button.disabled = true;
        button.textContent = '書き出し中…';
        setExportStatus('', false);
        var rangeText = window.ChordCruise.caged.formatFretRange(chord.fretRange);
        var diagramOptions = savedDiagramOptions(chord, {
            mode: detailDisplayMode(),
            monochrome: detailMonochrome
        });
        return window.ChordCruise.ui.chordExport.exportPng({
            chordName: displayChordName(chord.chordName),
            formName: chordFormName(chord),
            fretRange: chord.fretRange,
            rangeText: rangeText,
            diagramOptions: diagramOptions
        }).then(function (result) {
            var suffix = result.method === 'new-tab' ? '（新しいタブに表示）' : '';
            setExportStatus(result.filename + ' を作成しました ' + result.width + '×' + result.height + 'px' + suffix, false);
            return result;
        }).catch(function (err) {
            setExportStatus(err && err.message ? err.message : 'PNGを書き出せませんでした。', true);
            return null;
        }).then(function (result) {
            button.disabled = false;
            button.textContent = '書き出し';
            return result;
        });
    }

    function renderDetail() {
        view = 'detail';
        detailMonochrome = false;
        setContentLayout('detail');
        var chord = storage().loadChord(currentChordId);
        if (!chord) {
            renderList();
            return;
        }
        currentDetailChord = chord;
        var displayName = displayChordName(chord.chordName);
        var displayFormName = chordFormName(chord);

        var html = '<div class="cc-card">' +
            '<div class="cc-fb-head">' +
                '<span class="cc-save-label">表示</span>' +
                '<div class="cc-segment" role="group" aria-label="表示切替">' +
                    '<button type="button" class="cc-segment-btn" id="cc-libmode-note">CDE</button>' +
                    '<button type="button" class="cc-segment-btn" id="cc-libmode-solfege">ドレミ</button>' +
                    '<button type="button" class="cc-segment-btn" id="cc-libmode-degree">度数</button>' +
                    '<button type="button" class="cc-segment-btn" id="cc-libmode-finger">運指</button>' +
                '</div>' +
            '</div>' +
            '<div class="cc-lib-diagram-card" id="cc-lib-diagram-card">' +
                '<div class="cc-lib-diagram-title" id="cc-lib-detail-name">' + escapeHtml(displayName) + '</div>' +
                '<div id="cc-lib-fb" class="cc-fb-host cc-lib-exact-fb"></div>' +
            '</div>' +
            '<p class="cc-fb-hint">音をタップすると運指が切り替わり、自動で保存されます。</p>' +
            '<div class="cc-lib-diagram-actions">' +
                '<div class="cc-lib-monochrome-control">' +
                    '<span class="cc-lib-action-label">白黒 <strong id="cc-lib-monochrome-state">OFF</strong></span>' +
                    '<button type="button" id="cc-lib-monochrome-toggle" class="cc-switch" role="switch" aria-checked="false" aria-label="指板図を白黒表示">' +
                        '<span class="cc-switch-knob" aria-hidden="true"></span>' +
                    '</button>' +
                '</div>' +
                '<button type="button" class="cc-btn cc-btn-secondary cc-lib-export-btn" id="cc-lib-export-btn">書き出し</button>' +
                '<button type="button" class="cc-btn cc-btn-secondary cc-lib-edit-btn" id="cc-lib-edit-btn">編集</button>' +
            '</div>' +
            '<p class="cc-lib-export-status" id="cc-lib-export-status" style="display:none;"></p>' +
        '</div>' +
        '<div class="cc-card">' +
            '<h3 class="cc-card-heading">編集</h3>' +
            '<div class="cc-save-section">' +
                '<label class="cc-field"><span class="cc-field-label">コード名</span>' +
                    '<input type="text" id="cc-lib-chord-name" class="cc-input" maxlength="32" value="' + escapeHtml(displayName) + '"></label>' +
                '<label class="cc-field"><span class="cc-field-label">フォーム名</span>' +
                    '<input type="text" id="cc-lib-form-name" class="cc-input" maxlength="32" value="' + escapeHtml(displayFormName) + '"></label>' +
                '<label class="cc-field"><span class="cc-field-label">メモ</span>' +
                    '<textarea id="cc-lib-memo" class="cc-input cc-textarea" rows="2" maxlength="200">' + escapeHtml(chord.memo || '') + '</textarea></label>' +
                '<button type="button" class="cc-btn cc-btn-primary cc-btn--block" id="cc-lib-save-edit">変更を保存</button>' +
                '<p class="cc-fb-hint cc-lib-edit-hint" id="cc-lib-edit-hint" style="display:none;">保存しました。</p>' +
            '</div>' +
            '<div class="cc-save-section">' +
                '<label class="cc-field"><span class="cc-field-label">フォルダ移動</span>' +
                    '<select id="cc-lib-folder-move" class="cc-select"></select></label>' +
            '</div>' +
        '</div>' +
        '<div class="cc-card cc-danger-zone">' +
            '<h3 class="cc-card-heading cc-danger-heading">危険操作</h3>' +
            '<button type="button" class="cc-btn cc-btn-danger cc-btn--block" id="cc-lib-delete">このコードを削除</button>' +
        '</div>';
        contentEl().innerHTML = html;

        // 表示切替
        ['note', 'solfege', 'degree', 'finger'].forEach(function (mode) {
            document.getElementById('cc-libmode-' + mode).addEventListener('click', function () {
                window.ChordCruise.storage.saveSettings({ fretboardDisplayMode: mode });
                window.ChordCruise.state.settings.fretboardDisplayMode = mode;
                updateLibModeSegments();
                renderDetailFretboard(chord);
            });
        });
        updateLibModeSegments();
        renderDetailFretboard(chord);
        updateMonochromeControl();

        document.getElementById('cc-lib-monochrome-toggle').addEventListener('click', function () {
            detailMonochrome = !detailMonochrome;
            updateMonochromeControl();
            renderDetailFretboard(chord);
        });
        document.getElementById('cc-lib-export-btn').addEventListener('click', function () {
            exportCurrentChord(chord);
        });
        document.getElementById('cc-lib-edit-btn').addEventListener('click', function () {
            window.ChordCruise.ui.saveEditor.openExisting({
                chord: chord,
                onSaved: function (record) {
                    currentChordId = record.id;
                    renderDetail();
                }
            });
        });

        // 名前・メモ編集
        document.getElementById('cc-lib-save-edit').addEventListener('click', function () {
            chord.chordName = displayChordName(
                document.getElementById('cc-lib-chord-name').value.trim() || chord.chordName
            );
            chord.formName = document.getElementById('cc-lib-form-name').value.trim() || displayFormName;
            chord.memo = document.getElementById('cc-lib-memo').value.trim();
            storage().saveChord(chord);
            document.getElementById('cc-lib-detail-name').textContent = chord.chordName;
            var hint = document.getElementById('cc-lib-edit-hint');
            hint.style.display = '';
            setTimeout(function () { hint.style.display = 'none'; }, 1800);
        });

        // フォルダ移動（即時反映）
        var moveSelect = document.getElementById('cc-lib-folder-move');
        storage().loadFolders().slice().sort(function (a, b) {
            return (a.order || 0) - (b.order || 0);
        }).forEach(function (folder) {
            var option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            moveSelect.appendChild(option);
        });
        moveSelect.value = chord.folderId;
        moveSelect.addEventListener('change', function () {
            chord.folderId = moveSelect.value;
            storage().saveChord(chord);
        });

        // 削除
        document.getElementById('cc-lib-delete').addEventListener('click', function () {
            confirmDanger('「' + displayChordName(chord.chordName) + '（' + chordFormName(chord) + '）」を削除しますか？この操作は取り消せません。', '削除する', function () {
                storage().deleteChord(chord.id);
                renderList();
            });
        });
    }

    // ---- 公開API ----

    function render() {
        var section = document.getElementById('cc-screen-library');
        if (!section) return;
        buildSkeleton(section);
        if (view === 'detail' && currentChordId) {
            renderDetail();
        } else if (view === 'list' && currentFolderId) {
            renderList();
        } else {
            renderFolders();
        }
    }

    /** 戻るボタン用。内部で一階層戻れたら true を返す。 */
    function back() {
        if (view === 'detail') {
            renderList();
            return true;
        }
        if (view === 'list') {
            renderFolders();
            return true;
        }
        return false;
    }

    /** TOPへ戻ったときは次回フォルダ一覧から */
    function resetView() {
        view = 'folders';
        currentDetailChord = null;
        detailMonochrome = false;
    }

    document.addEventListener('chordcruise:fretboard-settings-change', function () {
        if (view === 'detail' && currentDetailChord) {
            renderDetailFretboard(currentDetailChord);
        }
    });

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.ui = window.ChordCruise.ui || {};
    window.ChordCruise.ui.library = {
        render: render,
        back: back,
        resetView: resetView,
        savedFrets: savedFrets,
        savedDiagramOptions: savedDiagramOptions,
        buildChordThumbnailGridHtml: buildChordThumbnailGridHtml,
        normalizeLibraryColumns: normalizeLibraryColumns
    };
})();
