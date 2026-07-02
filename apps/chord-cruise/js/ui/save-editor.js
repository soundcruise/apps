(function () {
    'use strict';

    /* 保存前編集モーダル。
       表示中のCAGEDフォームを受け取り、保存範囲・運指・名前・メモ・フォルダを
       編集してから localStorage に保存する。 */

    var FINGER_CYCLE = [null, 'T', 1, 2, 3, 4];
    var FINGER_LABELS = { T: '親', 1: '人', 2: '中', 3: '薬', 4: '小' };

    var overlayEl = null;
    var draft = null;
    var onSavedCallback = null;

    function theory() {
        return window.ChordCruise.theory;
    }

    function ensureDom() {
        if (overlayEl) return;
        overlayEl = document.createElement('div');
        overlayEl.className = 'cc-modal-overlay cc-modal-overlay--hidden';
        overlayEl.innerHTML =
            '<div class="cc-modal" role="dialog" aria-label="フォームを保存">' +
                '<div class="cc-modal-head">' +
                    '<h3 class="cc-modal-title">フォームを保存</h3>' +
                    '<button type="button" class="cc-btn cc-btn-secondary cc-btn--small" id="cc-save-cancel">キャンセル</button>' +
                '</div>' +
                '<div id="cc-save-fb" class="cc-fb-host"></div>' +
                '<p class="cc-fb-hint">音をタップすると運指が切り替わります（なし→親→人→中→薬→小）。</p>' +
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
                    '<label class="cc-field"><span class="cc-field-label">コード名</span>' +
                        '<input type="text" id="cc-save-chord-name" class="cc-input" maxlength="32"></label>' +
                    '<label class="cc-field"><span class="cc-field-label">フォーム名</span>' +
                        '<input type="text" id="cc-save-form-name" class="cc-input" maxlength="32"></label>' +
                    '<label class="cc-field"><span class="cc-field-label">メモ</span>' +
                        '<textarea id="cc-save-memo" class="cc-input cc-textarea" rows="2" maxlength="200"></textarea></label>' +
                    '<label class="cc-field"><span class="cc-field-label">保存先フォルダ</span>' +
                        '<select id="cc-save-folder" class="cc-select"></select></label>' +
                '</div>' +
                '<p class="cc-save-error" id="cc-save-error"></p>' +
                '<div class="cc-save-actions">' +
                    '<button type="button" class="cc-btn cc-btn-primary cc-btn--block" id="cc-save-confirm">保存する</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlayEl);

        document.getElementById('cc-save-cancel').addEventListener('click', close);
        overlayEl.addEventListener('click', function (event) {
            if (event.target === overlayEl) close();
        });

        document.getElementById('cc-range-min-minus').addEventListener('click', function () { stepRange('min', -1); });
        document.getElementById('cc-range-min-plus').addEventListener('click', function () { stepRange('min', 1); });
        document.getElementById('cc-range-max-minus').addEventListener('click', function () { stepRange('max', -1); });
        document.getElementById('cc-range-max-plus').addEventListener('click', function () { stepRange('max', 1); });

        document.getElementById('cc-save-include-open').addEventListener('change', function (event) {
            draft.range.includesOpen = !!event.target.checked;
            renderPreview();
            renderRange();
        });

        document.getElementById('cc-save-confirm').addEventListener('click', save);
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
        if (note.fret === 0) {
            return draft.range.includesOpen;
        }
        return note.fret >= draft.range.min && note.fret <= draft.range.max;
    }

    function markerLabel(note) {
        if (note.finger != null) {
            return FINGER_LABELS[note.finger] || '';
        }
        var openPc = theory().OPEN_STRINGS[6 - note.string];
        return theory().noteName((openPc + note.fret) % 12, draft.useFlats);
    }

    function roleForInterval(interval) {
        if (interval === 0) return 'root';
        if (interval === 3 || interval === 4) return 'third';
        if (interval === 6 || interval === 7 || interval === 8) return 'fifth';
        if (interval === 9 || interval === 10 || interval === 11) return 'seventh';
        return 'other';
    }

    function renderPreview() {
        var host = document.getElementById('cc-save-fb');
        var fb = window.ChordCruise.ui.fretboard;
        var prevScroll = fb.getScrollLeft(host);
        var markers = draft.notes.map(function (note) {
            return {
                string: note.string,
                fret: note.fret,
                label: markerLabel(note),
                role: roleForInterval(note.interval),
                dimmed: !noteIncluded(note),
                tappable: true
            };
        });
        fb.render(host, {
            maxFret: 13,
            markers: markers,
            mutedStrings: draft.mutedStrings,
            rangeHighlight: {
                minFret: draft.range.min,
                maxFret: draft.range.max,
                includesOpen: draft.range.includesOpen
            },
            scrollToFret: typeof prevScroll === 'number' && prevScroll > 0
                ? null
                : Math.round((draft.range.min + draft.range.max) / 2),
            preserveScroll: typeof prevScroll === 'number' && prevScroll > 0 ? prevScroll : null,
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
                var pos = FINGER_CYCLE.indexOf(note.finger);
                note.finger = FINGER_CYCLE[(pos + 1) % FINGER_CYCLE.length];
                renderPreview();
            }
        });
    }

    function currentRangeForDisplay() {
        var frets = draft.notes.filter(noteIncluded).map(function (n) { return n.fret; });
        var fretted = frets.filter(function (f) { return f > 0; });
        return {
            min: fretted.length ? Math.min.apply(null, fretted) : 0,
            max: fretted.length ? Math.max.apply(null, fretted) : 0,
            includesOpen: frets.indexOf(0) !== -1
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
        select.value = draft.folderId;
    }

    function setError(text) {
        var el = document.getElementById('cc-save-error');
        el.textContent = text || '';
        el.style.display = text ? '' : 'none';
    }

    function save() {
        var includedNotes = draft.notes.filter(noteIncluded).map(function (note) {
            return { string: note.string, fret: note.fret, interval: note.interval, finger: note.finger };
        });
        if (includedNotes.length === 0) {
            setError('保存範囲に音が1つもありません。範囲を見直してください。');
            return;
        }
        var chordName = document.getElementById('cc-save-chord-name').value.trim() || draft.chordName;
        var formName = document.getElementById('cc-save-form-name').value.trim() || draft.formName;
        var memo = document.getElementById('cc-save-memo').value.trim();
        var folderId = document.getElementById('cc-save-folder').value;

        var record = {
            chordName: chordName,
            formName: formName,
            shape: draft.shape,
            keyContext: draft.keyContext,
            intervals: draft.intervals,
            rootPc: draft.rootPc,
            fretRange: currentRangeForDisplay(),
            notes: includedNotes,
            mutedStrings: draft.mutedStrings,
            memo: memo,
            folderId: folderId
        };
        window.ChordCruise.storage.saveChord(record);
        close();
        if (typeof onSavedCallback === 'function') {
            onSavedCallback(record);
        }
    }

    /**
     * 保存前編集を開く。
     * @param {Object} payload { chord, form, shape, useFlats, onSaved }
     */
    function open(payload) {
        ensureDom();
        var chord = payload.chord;
        var form = payload.form;
        onSavedCallback = payload.onSaved || null;
        draft = {
            chordName: chord.symbol,
            formName: payload.shape + '型',
            shape: payload.shape,
            keyContext: payload.keyContext || null,
            intervals: chord.intervals.slice(),
            rootPc: chord.rootPc,
            useFlats: !!payload.useFlats,
            notes: form.notes.map(function (note) {
                return { string: note.string, fret: note.fret, interval: note.interval, finger: note.finger };
            }),
            mutedStrings: form.mutedStrings.slice(),
            formRange: {
                min: form.fretRange.min,
                max: form.fretRange.max,
                hasOpen: form.fretRange.includesOpen
            },
            range: {
                min: form.fretRange.min,
                max: form.fretRange.max,
                includesOpen: form.fretRange.includesOpen
            },
            memo: '',
            folderId: window.ChordCruise.storage.UNCATEGORIZED_ID
        };
        document.getElementById('cc-save-chord-name').value = draft.chordName;
        document.getElementById('cc-save-form-name').value = draft.formName;
        document.getElementById('cc-save-memo').value = '';
        renderFolders();
        renderRange();
        overlayEl.classList.remove('cc-modal-overlay--hidden');
        renderPreview();
    }

    function close() {
        if (overlayEl) {
            overlayEl.classList.add('cc-modal-overlay--hidden');
        }
        draft = null;
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.ui = window.ChordCruise.ui || {};
    window.ChordCruise.ui.saveEditor = {
        open: open,
        close: close,
        FINGER_LABELS: FINGER_LABELS
    };
})();
