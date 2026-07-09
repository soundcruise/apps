(function () {
    'use strict';

    /* コード本棚。フォルダ一覧 → フォルダ内一覧 → 保存コード詳細 の3階層。 */

    var FINGER_CYCLE = [null, 'T', 1, 2, 3, 4];
    var FINGER_LABELS = { T: '親', 1: '人', 2: '中', 3: '薬', 4: '小' };

    var view = 'folders';           // 'folders' | 'list' | 'detail'
    var currentFolderId = null;
    var currentChordId = null;

    function storage() { return window.ChordCruise.storage; }
    function theory() { return window.ChordCruise.theory; }

    function contentEl() {
        return document.getElementById('cc-lib-content');
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

    function keyLabel(keyContext) {
        if (!keyContext) return '';
        var useFlats = theory().keyUsesFlats(keyContext.tonicPc, keyContext.mode);
        var name = theory().noteName(keyContext.tonicPc, useFlats);
        if (keyContext.mode === 'minor') name += 'm';
        return name;
    }

    function escapeHtml(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ---- ビュー: フォルダ一覧 ----

    function renderFolders() {
        view = 'folders';
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
        '</div>';

        if (entries.length === 0) {
            html += '<div class="cc-card cc-placeholder-card"><p>このフォルダにはまだコードがありません。「コードを調べる」からCAGEDフォームを保存できます。</p></div>';
        } else {
            html += '<div class="cc-chordcard-list">';
            entries.forEach(function (entry) {
                var rangeText = window.ChordCruise.caged.formatFretRange(entry.fretRange);
                var key = keyLabel(entry.keyContext);
                html += '<button type="button" class="cc-chordcard" data-chord-id="' + entry.id + '">' +
                    '<span class="cc-chordcard-main">' +
                        '<span class="cc-chordcard-name">' + escapeHtml(entry.chordName) + '</span>' +
                        '<span class="cc-chordcard-meta">' +
                            escapeHtml(entry.formName) + '・' + escapeHtml(rangeText) +
                            (key ? '・Key: ' + escapeHtml(key) + (entry.keyContext && entry.keyContext.degreeLabel ? ' (' + escapeHtml(entry.keyContext.degreeLabel) + ')' : '') : '') +
                        '</span>' +
                        (entry.memo ? '<span class="cc-chordcard-memo">' + escapeHtml(entry.memo) + '</span>' : '') +
                    '</span>' +
                    '<span class="cc-folder-card-chevron">›</span>' +
                '</button>';
            });
            html += '</div>';
        }
        contentEl().innerHTML = html;

        Array.prototype.forEach.call(contentEl().querySelectorAll('.cc-chordcard'), function (btn) {
            btn.addEventListener('click', function () {
                currentChordId = btn.dataset.chordId;
                renderDetail();
            });
        });

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

    function detailMarkerLabel(chord, note) {
        var mode = detailDisplayMode();
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

    function renderDetailFretboard(chord) {
        var host = document.getElementById('cc-lib-fb');
        if (!host) return;
        var fb = window.ChordCruise.ui.fretboard;
        var prevScroll = fb.getScrollLeft(host);
        fb.render(host, {
            maxFret: 13,
            markers: chord.notes.map(function (note) {
                return {
                    string: note.string,
                    fret: note.fret,
                    label: detailMarkerLabel(chord, note),
                    role: roleForInterval(note.interval),
                    tappable: true
                };
            }),
            barres: window.ChordCruise.caged.detectBarres(chord.notes),
            mutedStrings: chord.mutedStrings || [],
            rangeHighlight: {
                minFret: chord.fretRange.min,
                maxFret: chord.fretRange.max,
                includesOpen: chord.fretRange.includesOpen
            },
            scrollToFret: typeof prevScroll === 'number' && prevScroll > 0
                ? null
                : Math.round((chord.fretRange.min + chord.fretRange.max) / 2),
            preserveScroll: typeof prevScroll === 'number' && prevScroll > 0 ? prevScroll : null,
            onSlotTap: function (stringNum, fret) {
                var target = null;
                chord.notes.forEach(function (note) {
                    if (note.string === stringNum && note.fret === fret) target = note;
                });
                if (!target) return;
                var pos = FINGER_CYCLE.indexOf(target.finger);
                target.finger = FINGER_CYCLE[(pos + 1) % FINGER_CYCLE.length];
                storage().saveChord(chord);
                renderDetailFretboard(chord);
            }
        });
    }

    function updateLibModeSegments() {
        var mode = detailDisplayMode();
        ['note', 'solfege', 'degree', 'finger'].forEach(function (m) {
            var el = document.getElementById('cc-libmode-' + m);
            if (el) el.classList.toggle('cc-segment-btn--active', mode === m);
        });
    }

    function renderDetail() {
        view = 'detail';
        var chord = storage().loadChord(currentChordId);
        if (!chord) {
            renderList();
            return;
        }
        var rangeText = window.ChordCruise.caged.formatFretRange(chord.fretRange);
        var key = keyLabel(chord.keyContext);

        var html = '<div class="cc-card">' +
            '<div class="cc-detail-head">' +
                '<span class="cc-detail-symbol" id="cc-lib-detail-name">' + escapeHtml(chord.chordName) + '</span>' +
                '<span class="cc-detail-roman">' + escapeHtml(chord.formName) + '・' + escapeHtml(rangeText) +
                    (key ? '・Key: ' + escapeHtml(key) : '') + '</span>' +
            '</div>' +
            '<div class="cc-fb-head">' +
                '<span class="cc-save-label">表示</span>' +
                '<div class="cc-segment" role="group" aria-label="表示切替">' +
                    '<button type="button" class="cc-segment-btn" id="cc-libmode-note">CDE</button>' +
                    '<button type="button" class="cc-segment-btn" id="cc-libmode-solfege">ドレミ</button>' +
                    '<button type="button" class="cc-segment-btn" id="cc-libmode-degree">度数</button>' +
                    '<button type="button" class="cc-segment-btn" id="cc-libmode-finger">運指</button>' +
                '</div>' +
            '</div>' +
            '<div id="cc-lib-fb" class="cc-fb-host"></div>' +
            '<p class="cc-fb-hint">音をタップすると運指が切り替わり、自動で保存されます。</p>' +
        '</div>' +
        '<div class="cc-card">' +
            '<h3 class="cc-card-heading">編集</h3>' +
            '<div class="cc-save-section">' +
                '<label class="cc-field"><span class="cc-field-label">コード名</span>' +
                    '<input type="text" id="cc-lib-chord-name" class="cc-input" maxlength="32" value="' + escapeHtml(chord.chordName) + '"></label>' +
                '<label class="cc-field"><span class="cc-field-label">フォーム名</span>' +
                    '<input type="text" id="cc-lib-form-name" class="cc-input" maxlength="32" value="' + escapeHtml(chord.formName) + '"></label>' +
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

        // 名前・メモ編集
        document.getElementById('cc-lib-save-edit').addEventListener('click', function () {
            chord.chordName = document.getElementById('cc-lib-chord-name').value.trim() || chord.chordName;
            chord.formName = document.getElementById('cc-lib-form-name').value.trim() || chord.formName;
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
            confirmDanger('「' + chord.chordName + '（' + chord.formName + '）」を削除しますか？この操作は取り消せません。', '削除する', function () {
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
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.ui = window.ChordCruise.ui || {};
    window.ChordCruise.ui.library = {
        render: render,
        back: back,
        resetView: resetView
    };
})();
