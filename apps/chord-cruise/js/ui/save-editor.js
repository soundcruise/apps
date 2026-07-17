(function () {
    'use strict';

    /* 保存前編集・保存コード編集モーダル。
       保存済みコードの編集では元データを複製して扱い、上書き／別名保存が
       確定するまで localStorage を変更しない。 */

    var EDIT_CYCLE = [null, 'T', 1, 2, 3, 4, 'warning', 'delete'];
    var FINGER_LABELS = { T: '親', 1: '人', 2: '中', 3: '薬', 4: '小' };
    var DISPLAY_MODES = ['note', 'solfege', 'degree', 'finger'];

    var overlayEl = null;
    var draft = null;
    var initialSnapshot = null;
    var onSavedCallback = null;
    var saveInProgress = false;

    function theory() {
        return window.ChordCruise.theory;
    }

    function clone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function ensureDom() {
        if (overlayEl) return;
        overlayEl = document.createElement('div');
        overlayEl.className = 'cc-modal-overlay cc-modal-overlay--hidden';
        overlayEl.innerHTML =
            '<div class="cc-modal" role="dialog" aria-modal="true" aria-labelledby="cc-save-title">' +
                '<div class="cc-modal-head">' +
                    '<h3 class="cc-modal-title" id="cc-save-title">フォームを保存</h3>' +
                    '<button type="button" class="cc-btn cc-btn-secondary cc-btn--small" id="cc-save-cancel">キャンセル</button>' +
                '</div>' +
                '<div class="cc-fb-head cc-save-display-head">' +
                    '<span class="cc-save-label">表示</span>' +
                    '<div class="cc-segment" role="group" aria-label="表示切替">' +
                        '<button type="button" class="cc-segment-btn" id="cc-savemode-note">CDE</button>' +
                        '<button type="button" class="cc-segment-btn" id="cc-savemode-solfege">ドレミ</button>' +
                        '<button type="button" class="cc-segment-btn" id="cc-savemode-degree">度数</button>' +
                        '<button type="button" class="cc-segment-btn" id="cc-savemode-finger">運指</button>' +
                    '</div>' +
                '</div>' +
                '<div id="cc-save-fb" class="cc-fb-host"></div>' +
                '<p class="cc-fb-hint" id="cc-save-edit-hint"></p>' +
                '<div class="cc-save-section">' +
                    '<div class="cc-save-row">' +
                        '<span class="cc-save-label">保存範囲</span>' +
                        '<span class="cc-save-range-label" id="cc-save-range-label"></span>' +
                    '</div>' +
                    '<div class="cc-save-steppers">' +
                        '<div class="cc-stepper">' +
                            '<span class="cc-stepper-label">下限</span>' +
                            '<button type="button" class="cc-stepper-btn" id="cc-range-min-minus">−</button>' +
                            '<span class="cc-stepper-value" id="cc-range-min-val"></span>' +
                            '<button type="button" class="cc-stepper-btn" id="cc-range-min-plus">＋</button>' +
                        '</div>' +
                        '<div class="cc-stepper">' +
                            '<span class="cc-stepper-label">上限</span>' +
                            '<button type="button" class="cc-stepper-btn" id="cc-range-max-minus">−</button>' +
                            '<span class="cc-stepper-value" id="cc-range-max-val"></span>' +
                            '<button type="button" class="cc-stepper-btn" id="cc-range-max-plus">＋</button>' +
                        '</div>' +
                    '</div>' +
                    '<label class="cc-save-open-row" id="cc-save-open-row">' +
                        '<input type="checkbox" id="cc-save-include-open"> 開放弦を含める' +
                    '</label>' +
                '</div>' +
                '<div class="cc-save-section">' +
                    '<label class="cc-field"><span class="cc-field-label">保存先フォルダ</span>' +
                        '<select id="cc-save-folder" class="cc-select"></select></label>' +
                    '<div class="cc-save-folder-create" id="cc-save-folder-create">' +
                        '<button type="button" class="cc-btn cc-btn-secondary cc-btn--small" id="cc-save-folder-create-toggle">＋ 新規フォルダ</button>' +
                        '<div class="cc-inline-input-row cc-inline-input-row--hidden" id="cc-save-folder-create-row">' +
                            '<input type="text" id="cc-save-folder-create-input" class="cc-input" placeholder="新しいフォルダ名" maxlength="24">' +
                            '<button type="button" class="cc-btn cc-btn-primary cc-btn--small" id="cc-save-folder-create-ok">作成</button>' +
                            '<button type="button" class="cc-btn cc-btn-secondary cc-btn--small" id="cc-save-folder-create-cancel">キャンセル</button>' +
                        '</div>' +
                        '<p class="cc-save-folder-error" id="cc-save-folder-error" role="status"></p>' +
                    '</div>' +
                    '<label class="cc-field"><span class="cc-field-label">名前</span>' +
                        '<input type="text" id="cc-save-chord-name" class="cc-input" maxlength="32"></label>' +
                    '<label class="cc-field"><span class="cc-field-label">フォーム名</span>' +
                        '<input type="text" id="cc-save-form-name" class="cc-input" maxlength="32"></label>' +
                    '<label class="cc-field"><span class="cc-field-label">メモ</span>' +
                        '<textarea id="cc-save-memo" class="cc-input cc-textarea" rows="2" maxlength="200"></textarea></label>' +
                '</div>' +
                '<p class="cc-save-error" id="cc-save-error"></p>' +
                '<div class="cc-save-actions">' +
                    '<button type="button" class="cc-btn cc-btn-primary cc-btn--block" id="cc-save-confirm">保存する</button>' +
                    '<button type="button" class="cc-btn cc-btn-secondary cc-btn--block cc-save-bottom-cancel" id="cc-save-cancel-bottom">キャンセル</button>' +
                    '<div class="cc-save-edit-actions cc-save-edit-actions--hidden" id="cc-save-edit-actions">' +
                        '<button type="button" class="cc-btn cc-btn-primary" id="cc-save-overwrite">上書き保存</button>' +
                        '<button type="button" class="cc-btn cc-btn-secondary" id="cc-save-copy">別名で保存</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlayEl);

        document.getElementById('cc-save-cancel').addEventListener('click', requestClose);
        document.getElementById('cc-save-cancel-bottom').addEventListener('click', cancelNewSave);
        overlayEl.addEventListener('click', function (event) {
            if (event.target === overlayEl) requestClose();
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && draft) requestClose();
        });

        document.getElementById('cc-range-min-minus').addEventListener('click', function () { stepRange('min', -1); });
        document.getElementById('cc-range-min-plus').addEventListener('click', function () { stepRange('min', 1); });
        document.getElementById('cc-range-max-minus').addEventListener('click', function () { stepRange('max', -1); });
        document.getElementById('cc-range-max-plus').addEventListener('click', function () { stepRange('max', 1); });

        document.getElementById('cc-save-include-open').addEventListener('change', function (event) {
            if (!draft) return;
            draft.range.includesOpen = !!event.target.checked;
            renderPreview();
            renderRange();
        });

        DISPLAY_MODES.forEach(function (mode) {
            document.getElementById('cc-savemode-' + mode).addEventListener('click', function () {
                if (!draft) return;
                draft.displayMode = mode;
                updateDisplaySegments();
                renderPreview();
            });
        });

        document.getElementById('cc-save-confirm').addEventListener('click', saveNew);
        document.getElementById('cc-save-overwrite').addEventListener('click', saveOverwrite);
        document.getElementById('cc-save-copy').addEventListener('click', saveCopy);
        document.getElementById('cc-save-folder-create-toggle').addEventListener('click', function () {
            document.getElementById('cc-save-folder-create-toggle').style.display = 'none';
            document.getElementById('cc-save-folder-create-row').classList.remove('cc-inline-input-row--hidden');
            document.getElementById('cc-save-folder-create-input').focus();
        });
        document.getElementById('cc-save-folder-create-cancel').addEventListener('click', resetFolderCreate);
        document.getElementById('cc-save-folder-create-ok').addEventListener('click', createFolderFromEditor);
        document.addEventListener('chordcruise:fretboard-settings-change', function () {
            if (draft) renderPreview();
        });
    }

    function stepRange(edge, delta) {
        if (!draft) return;
        var r = draft.range;
        var limit = draft.formRange;
        if (edge === 'min') {
            r.min = Math.min(Math.max(r.min + delta, limit.min), r.max);
        } else {
            r.max = Math.max(Math.min(r.max + delta, limit.max), r.min);
        }
        renderPreview();
        renderRange();
    }

    function noteIncluded(note) {
        if (note.fret === 0) return draft.range.includesOpen;
        return note.fret >= draft.range.min && note.fret <= draft.range.max;
    }

    function normalizeFinger(finger) {
        return EDIT_CYCLE.indexOf(finger) >= 1 && EDIT_CYCLE.indexOf(finger) <= 5 ? finger : null;
    }

    function draftNote(note) {
        var warning = !!(note && note.fingeringWarning === true && normalizeFinger(note.finger) === null);
        return {
            string: note.string,
            fret: note.fret,
            interval: note.interval,
            finger: normalizeFinger(note.finger),
            fingeringWarning: warning,
            pendingDelete: false,
            warningStartsCycle: warning
        };
    }

    function noteEditState(note) {
        if (note.pendingDelete) return 'delete';
        if (note.fingeringWarning && note.finger === null) return 'warning';
        return normalizeFinger(note.finger);
    }

    function applyEditState(note, state) {
        note.pendingDelete = state === 'delete';
        note.fingeringWarning = state === 'warning';
        note.finger = EDIT_CYCLE.indexOf(state) >= 1 && EDIT_CYCLE.indexOf(state) <= 5 ? state : null;
        note.warningStartsCycle = false;
    }

    function cycleNote(note) {
        var current = noteEditState(note);
        if (note.fret === 0) {
            applyEditState(note, current === 'delete' ? null : 'delete');
            return;
        }
        if (current === 'warning' && note.warningStartsCycle) {
            applyEditState(note, 'T');
            return;
        }
        var index = EDIT_CYCLE.indexOf(current);
        applyEditState(note, EDIT_CYCLE[(index + 1) % EDIT_CYCLE.length]);
    }

    function notePc(note) {
        var openPc = theory().OPEN_STRINGS[6 - note.string];
        return (openPc + note.fret) % 12;
    }

    function markerLabel(note) {
        if (note.pendingDelete) return '消';
        if (draft.displayMode === 'finger') {
            if (note.finger != null) return FINGER_LABELS[note.finger] || '';
            return note.fingeringWarning ? '⚠' : '';
        }
        if (draft.displayMode === 'solfege') return theory().solfegeName(notePc(note), draft.useFlats);
        if (draft.displayMode === 'degree') return theory().degreeLabels([note.interval])[0];
        return theory().noteName(notePc(note), draft.useFlats);
    }

    function roleForInterval(interval) {
        if (interval === 0) return 'root';
        if (interval === 3 || interval === 4) return 'third';
        if (interval === 6 || interval === 7 || interval === 8) return 'fifth';
        if (interval === 9 || interval === 10 || interval === 11) return 'seventh';
        return 'other';
    }

    function updateDisplaySegments() {
        if (!draft) return;
        DISPLAY_MODES.forEach(function (mode) {
            var button = document.getElementById('cc-savemode-' + mode);
            button.classList.toggle('cc-segment-btn--active', draft.displayMode === mode);
        });
    }

    function renderPreview() {
        if (!draft) return;
        var host = document.getElementById('cc-save-fb');
        var fb = window.ChordCruise.ui.fretboard;
        var shouldAutoCenter = draft.autoCenterPending === true;
        var prevScroll = shouldAutoCenter ? null : fb.getScrollLeft(host);
        var markers = draft.notes.map(function (note) {
            return {
                string: note.string,
                fret: note.fret,
                label: markerLabel(note),
                role: roleForInterval(note.interval),
                dimmed: !noteIncluded(note),
                pendingDelete: note.pendingDelete && noteIncluded(note),
                fingeringWarning: draft.displayMode === 'finger' && note.fingeringWarning && !note.pendingDelete,
                tappable: true
            };
        });
        var barres = window.ChordCruise.caged.detectBarres(draft.notes.filter(function (note) {
            return noteIncluded(note) && !note.pendingDelete;
        }));
        fb.render(host, {
            startFret: draft.startFret,
            endFret: draft.endFret,
            markers: markers,
            barres: barres,
            mutedStrings: draft.mutedStrings,
            rangeHighlight: {
                minFret: draft.range.min,
                maxFret: draft.range.max,
                includesOpen: draft.range.includesOpen
            },
            preserveScroll: typeof prevScroll === 'number' ? prevScroll : null,
            onSlotTap: function (stringNum, fret) {
                var note = null;
                var i;
                for (i = 0; i < draft.notes.length; i++) {
                    if (draft.notes[i].string === stringNum && draft.notes[i].fret === fret) {
                        note = draft.notes[i];
                        break;
                    }
                }
                if (!note || !noteIncluded(note)) return;
                cycleNote(note);
                renderPreview();
            }
        });
        if (shouldAutoCenter) {
            var activeDraft = draft;
            var centerFret = draft.range.includesOpen
                ? 0
                : (draft.range.min + draft.range.max) / 2;
            draft.autoCenterPending = false;
            var schedule = typeof window.requestAnimationFrame === 'function'
                ? window.requestAnimationFrame
                : function (callback) { return window.setTimeout(callback, 0); };
            schedule(function () {
                if (draft !== activeDraft) return;
                fb.centerOnFret(host, centerFret, {
                    startFret: draft.startFret,
                    endFret: draft.endFret
                });
            });
        }
    }

    function currentRangeForDisplay() {
        // 新規フォームの連続表示範囲（0〜3Fなど）を保持する。
        // 実音がない中間フレットを詰めず、既存保存データの明示範囲はopenExistingでそのまま渡される。
        return {
            min: draft.range.min,
            max: draft.range.max,
            includesOpen: draft.range.includesOpen
        };
    }

    function renderRange() {
        document.getElementById('cc-save-range-label').textContent =
            window.ChordCruise.caged.formatFretRange(currentRangeForDisplay());
        document.getElementById('cc-range-min-val').textContent = draft.range.min + 'F';
        document.getElementById('cc-range-max-val').textContent = draft.range.max + 'F';
        document.getElementById('cc-save-open-row').style.display = draft.formRange.hasOpen ? '' : 'none';
        document.getElementById('cc-save-include-open').checked = draft.range.includesOpen;
        setError('');
    }

    function renderFolders() {
        var select = document.getElementById('cc-save-folder');
        var folders = window.ChordCruise.storage.loadFolders();
        select.innerHTML = '';
        folders.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }).forEach(function (folder) {
            var option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            select.appendChild(option);
        });
        var exists = folders.some(function (folder) { return folder.id === draft.folderId; });
        select.value = exists ? draft.folderId : window.ChordCruise.storage.UNCATEGORIZED_ID;
    }

    function setFolderError(text) {
        var element = document.getElementById('cc-save-folder-error');
        if (!element) return;
        element.textContent = text || '';
        element.style.display = text ? 'block' : 'none';
    }

    function resetFolderCreate() {
        var toggle = document.getElementById('cc-save-folder-create-toggle');
        var row = document.getElementById('cc-save-folder-create-row');
        var input = document.getElementById('cc-save-folder-create-input');
        if (toggle) toggle.style.display = '';
        if (row) row.classList.add('cc-inline-input-row--hidden');
        if (input) input.value = '';
        setFolderError('');
    }

    function createFolderFromEditor() {
        if (!draft) return;
        var input = document.getElementById('cc-save-folder-create-input');
        var name = input.value.trim();
        if (!name) {
            setFolderError('フォルダ名を入力してください。');
            input.focus();
            return;
        }
        var folders = window.ChordCruise.storage.loadFolders();
        if (folders.some(function (folder) { return folder.name === name; })) {
            setFolderError('同じ名前のフォルダがあります。');
            input.focus();
            return;
        }
        var folder = window.ChordCruise.storage.createFolder(name);
        if (!folder) {
            setFolderError('フォルダを作成できませんでした。');
            return;
        }
        draft.folderId = folder.id;
        renderFolders();
        resetFolderCreate();
        if (window.ChordCruise.ui.toast) {
            window.ChordCruise.ui.toast.show('フォルダを作成しました', { type: 'success' });
        }
    }

    function setError(text) {
        var element = document.getElementById('cc-save-error');
        element.textContent = text || '';
        element.style.display = text ? '' : 'none';
    }

    function currentFieldValues() {
        if (!draft) return null;
        return {
            chordName: document.getElementById('cc-save-chord-name').value.trim(),
            formName: document.getElementById('cc-save-form-name').value.trim(),
            memo: document.getElementById('cc-save-memo').value.trim(),
            folderId: document.getElementById('cc-save-folder').value,
            range: clone(draft.range),
            notes: clone(draft.notes),
            mutedStrings: clone(draft.mutedStrings)
        };
    }

    function snapshot() {
        return JSON.stringify(currentFieldValues());
    }

    function hasUnsavedChanges() {
        return !!draft && initialSnapshot !== null && snapshot() !== initialSnapshot;
    }

    function requestClose() {
        if (!draft) return;
        if (draft.mode === 'edit' && hasUnsavedChanges() &&
                !window.confirm('編集中の変更を破棄しますか？')) {
            return;
        }
        close();
    }

    // 新規保存フォーム直下のキャンセルは、入力内容を保存せず即座に閉じる。
    // 作成確定済みのフォルダは storage 上の独立データなので削除しない。
    function cancelNewSave() {
        if (!draft || draft.mode !== 'new') return;
        close();
    }

    function buildRecord(copyMode) {
        var includedNotes = draft.notes.filter(function (note) {
            return noteIncluded(note) && !note.pendingDelete;
        }).map(function (note) {
            return {
                string: note.string,
                fret: note.fret,
                interval: note.interval,
                finger: normalizeFinger(note.finger),
                fingeringWarning: note.fingeringWarning === true && normalizeFinger(note.finger) === null
            };
        });
        if (includedNotes.length === 0) {
            setError('音が1つも残っていないため保存できません。消去状態または保存範囲を見直してください。');
            return null;
        }

        var values = currentFieldValues();
        var record = draft.original ? clone(draft.original) : {};
        record.chordName = theory().displayChordName(values.chordName || draft.chordName);
        record.formName = values.formName || draft.formName;
        record.shape = draft.shape;
        record.keyContext = clone(draft.keyContext);
        record.intervals = clone(draft.intervals);
        record.rootPc = draft.rootPc;
        record.fretRange = currentRangeForDisplay();
        record.notes = includedNotes;
        record.mutedStrings = clone(draft.mutedStrings);
        draft.notes.forEach(function (note) {
            if (!noteIncluded(note) || !note.pendingDelete) return;
            if (record.mutedStrings.indexOf(note.string) === -1) record.mutedStrings.push(note.string);
        });
        record.mutedStrings.sort(function (a, b) { return a - b; });
        record.memo = values.memo;
        record.folderId = values.folderId || window.ChordCruise.storage.UNCATEGORIZED_ID;

        if (copyMode === 'copy') {
            delete record.id;
            delete record.createdAt;
            delete record.updatedAt;
            delete record.schemaVersion;
        }
        return record;
    }

    function finishSave(record, mode) {
        if (saveInProgress) return;
        saveInProgress = true;
        var callback = onSavedCallback;
        var saved = window.ChordCruise.storage.saveChord(record);
        if (!saved) {
            saveInProgress = false;
            setError('保存に失敗しました。ブラウザの保存領域を確認してください。');
            return;
        }
        close();
        if (window.ChordCruise.ui.toast) {
            window.ChordCruise.ui.toast.show('保存しました', { type: 'success' });
        }
        if (typeof callback === 'function') callback(saved, mode);
        saveInProgress = false;
    }

    function saveNew() {
        if (!draft || draft.mode !== 'new') return;
        var record = buildRecord('copy');
        if (record) finishSave(record, 'new');
    }

    function saveOverwrite() {
        if (!draft || draft.mode !== 'edit') return;
        var record = buildRecord('overwrite');
        if (!record) return;
        record.id = draft.original.id;
        record.createdAt = draft.original.createdAt;
        finishSave(record, 'overwrite');
    }

    function saveCopy() {
        if (!draft || draft.mode !== 'edit') return;
        var record = buildRecord('copy');
        if (record) finishSave(record, 'copy');
    }

    function defaultDisplayMode() {
        var settings = window.ChordCruise.state && window.ChordCruise.state.settings;
        var mode = settings && settings.fretboardDisplayMode;
        return DISPLAY_MODES.indexOf(mode) !== -1 ? mode : 'note';
    }

    function setModeUi(mode) {
        var editing = mode === 'edit';
        document.getElementById('cc-save-title').textContent = editing ? '保存コードを編集' : 'フォームを保存';
        document.getElementById('cc-save-edit-hint').textContent = editing
            ? '音をタップすると、運指・⚠️・消去を切り替えられます。上書き保存または別名で保存すると確定します。'
            : '音をタップすると、運指・⚠️・消去を切り替えられます。変更は保存するまで確定しません。';
        document.getElementById('cc-save-confirm').style.display = editing ? 'none' : '';
        document.getElementById('cc-save-cancel-bottom').style.display = editing ? 'none' : '';
        document.getElementById('cc-save-edit-actions').classList.toggle('cc-save-edit-actions--hidden', !editing);
    }

    function showEditor() {
        document.getElementById('cc-save-chord-name').value = draft.chordName;
        document.getElementById('cc-save-form-name').value = draft.formName;
        document.getElementById('cc-save-memo').value = draft.memo;
        renderFolders();
        resetFolderCreate();
        setModeUi(draft.mode);
        updateDisplaySegments();
        renderRange();
        overlayEl.classList.remove('cc-modal-overlay--hidden');
        renderPreview();
        initialSnapshot = snapshot();
    }

    /** 新規フォームの保存前編集を開く。 */
    function open(payload) {
        ensureDom();
        var chord = payload.chord;
        var form = payload.form;
        var displayRange = form.displayRange || form.fretRange;
        onSavedCallback = payload.onSaved || null;
        saveInProgress = false;
        draft = {
            mode: 'new',
            original: null,
            chordName: chord.symbol,
            formName: payload.shape + '型',
            shape: payload.shape,
            keyContext: clone(payload.keyContext || null),
            intervals: chord.intervals.slice(),
            rootPc: chord.rootPc,
            useFlats: !!payload.useFlats,
            displayMode: defaultDisplayMode(),
            notes: form.notes.map(draftNote),
            mutedStrings: form.mutedStrings.slice(),
            startFret: typeof payload.startFret === 'number' ? payload.startFret : (form.fretRange.min >= 12 ? 12 : 0),
            endFret: typeof payload.endFret === 'number' ? payload.endFret : (form.fretRange.min >= 12 ? 25 : 13),
            formRange: {
                min: displayRange.min,
                max: displayRange.max,
                hasOpen: displayRange.includesOpen
            },
            range: {
                min: displayRange.min,
                max: displayRange.max,
                includesOpen: displayRange.includesOpen
            },
            memo: '',
            folderId: window.ChordCruise.storage.UNCATEGORIZED_ID,
            autoCenterPending: true
        };
        showEditor();
    }

    /** 保存済みコードを複製し、元データへ触れずに編集を開始する。 */
    function openExisting(payload) {
        ensureDom();
        var original = clone(payload.chord || {});
        var notes = Array.isArray(original.notes) ? clone(original.notes).filter(function (note) {
            return note && typeof note.string === 'number' && typeof note.fret === 'number';
        }) : [];
        var range = original.fretRange || {};
        var fretted = notes.filter(function (note) { return note && note.fret > 0; }).map(function (note) { return note.fret; });
        var inferredMin = fretted.length ? Math.min.apply(null, fretted) : 0;
        var inferredMax = fretted.length ? Math.max.apply(null, fretted) : inferredMin;
        var min = typeof range.min === 'number' ? range.min : inferredMin;
        var max = typeof range.max === 'number' ? range.max : inferredMax;
        if (max < min) max = min;
        var includesOpen = typeof range.includesOpen === 'boolean'
            ? range.includesOpen
            : notes.some(function (note) { return note && note.fret === 0; });
        var keyContext = original.keyContext || null;
        var useFlats = keyContext && typeof keyContext.tonicPc === 'number'
            ? theory().keyUsesFlats(keyContext.tonicPc, keyContext.mode)
            : /♭/.test(original.chordName || '');
        var shape = original.shape || '';
        var highFret = min >= 12 && !includesOpen;

        onSavedCallback = payload.onSaved || null;
        saveInProgress = false;
        draft = {
            mode: 'edit',
            original: original,
            chordName: theory().displayChordName(original.chordName || ''),
            formName: original.formName || (shape ? shape + '型' : 'フォーム'),
            shape: shape,
            keyContext: clone(keyContext),
            intervals: Array.isArray(original.intervals) ? original.intervals.slice() : [],
            rootPc: typeof original.rootPc === 'number' ? original.rootPc : null,
            useFlats: !!useFlats,
            displayMode: defaultDisplayMode(),
            notes: notes.map(draftNote),
            mutedStrings: Array.isArray(original.mutedStrings) ? original.mutedStrings.slice() : [],
            startFret: highFret ? 12 : 0,
            endFret: highFret ? 25 : 13,
            formRange: { min: min, max: max, hasOpen: includesOpen },
            range: { min: min, max: max, includesOpen: includesOpen },
            memo: original.memo || '',
            folderId: original.folderId || window.ChordCruise.storage.UNCATEGORIZED_ID,
            autoCenterPending: true
        };
        showEditor();
    }

    function close() {
        resetFolderCreate();
        if (overlayEl) overlayEl.classList.add('cc-modal-overlay--hidden');
        draft = null;
        initialSnapshot = null;
        onSavedCallback = null;
        saveInProgress = false;
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.ui = window.ChordCruise.ui || {};
    window.ChordCruise.ui.saveEditor = {
        open: open,
        openExisting: openExisting,
        close: close,
        hasUnsavedChanges: hasUnsavedChanges,
        FINGER_LABELS: FINGER_LABELS
    };
})();
