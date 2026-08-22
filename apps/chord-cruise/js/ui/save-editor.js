(function () {
    'use strict';

    /* 保存前編集・保存コード編集モーダル。
       保存済みコードの編集では元データを複製して扱い、上書き／別名保存が
       確定するまで localStorage を変更しない。 */

    var EDIT_CYCLE = [null, 'T', 1, 2, 3, 4, 'warning', 'delete'];
    var ADDED_NOTE_CYCLE = ['T', 1, 2, 3, 4];
    var FINGER_LABELS = { T: '親', 1: '人', 2: '中', 3: '薬', 4: '小' };
    var DISPLAY_MODES = ['finger', 'note', 'solfege', 'degree'];

    var overlayEl = null;
    var draft = null;
    var initialSnapshot = null;
    var onSavedCallback = null;
    var saveInProgress = false;
    var previousFocus = null;

    function theory() {
        return window.ChordCruise.theory;
    }

    function focusTrap() {
        return window.ChordCruise.ui && window.ChordCruise.ui.focusTrap;
    }

    function storageErrorMessage(fallback) {
        var storage = window.ChordCruise.storage;
        var code = storage && typeof storage.getLastError === 'function' ? storage.getLastError() : null;
        if (code === 'standard-folder-limit') return 'Standard版ではフォルダは3個まで保存できます。';
        if (code === 'standard-folder-chord-limit') return 'Standard版では1フォルダ10個まで保存できます。';
        return fallback;
    }

    function canSaveCustomChord() {
        var featureAccess = window.ChordCruise && window.ChordCruise.featureAccess;
        return !!(featureAccess && typeof featureAccess.hasFeature === 'function' &&
            featureAccess.hasFeature('customChordSave'));
    }

    function isProEdition() {
        var featureAccess = window.ChordCruise && window.ChordCruise.featureAccess;
        return !!(featureAccess && typeof featureAccess.isProEdition === 'function' && featureAccess.isProEdition());
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
                        '<button type="button" class="cc-segment-btn" id="cc-savemode-finger">運指</button>' +
                        '<button type="button" class="cc-segment-btn" id="cc-savemode-note">CDE</button>' +
                        '<button type="button" class="cc-segment-btn" id="cc-savemode-solfege">ドレミ</button>' +
                        '<button type="button" class="cc-segment-btn" id="cc-savemode-degree">度数</button>' +
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
                        (isProEdition() ? '' :
                            '<a class="cc-save-folder-pro-link" id="cc-save-folder-pro-link" href="../pro-access.html" target="_blank" rel="noopener" hidden>Pro版の入手方法</a>') +
                    '</div>' +
                    '<label class="cc-field"><span class="cc-field-label">名前</span>' +
                        '<input type="text" id="cc-save-chord-name" class="cc-input" maxlength="32"></label>' +
                    '<label class="cc-field"><span class="cc-field-label">フォーム名</span>' +
                        '<input type="text" id="cc-save-form-name" class="cc-input" maxlength="32"></label>' +
                    '<label class="cc-field"><span class="cc-field-label">メモ</span>' +
                        '<textarea id="cc-save-memo" class="cc-input cc-textarea" rows="2" maxlength="200"></textarea></label>' +
                '</div>' +
                '<p class="cc-save-error" id="cc-save-error"></p>' +
                (isProEdition() ? '' :
                    '<a class="cc-save-folder-pro-link" id="cc-save-limit-pro-link" href="../pro-access.html" target="_blank" rel="noopener" hidden>Pro版の入手方法</a>' +
                    '<div class="cc-save-section" id="cc-save-pro-notice" hidden>' +
                        '<p class="cc-fb-hint">作成したコードを保存するにはPro版が必要です。</p>' +
                        '<a class="cc-btn cc-btn-primary cc-btn--block" href="../pro-access.html" target="_blank" rel="noopener">Pro版の入手方法</a>' +
                    '</div>') +
                '<section class="cc-save-limit-summary" id="cc-save-limit-summary" aria-labelledby="cc-save-limit-title" hidden>' +
                    '<strong id="cc-save-limit-title">保存上限</strong>' +
                    '<span id="cc-save-folder-limit-count"></span>' +
                    '<span id="cc-save-chord-limit-count"></span>' +
                    (isProEdition() ? '' : '<a href="../pro-access.html" target="_blank" rel="noopener">Pro版の入手方法</a>') +
                '</section>' +
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
        overlayEl.addEventListener('keydown', function (event) {
            var dialog = overlayEl.querySelector('[role="dialog"]');
            if (focusTrap()) focusTrap().trapFocus(dialog || overlayEl, event);
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
        document.getElementById('cc-save-folder').addEventListener('change', function (event) {
            if (!draft) return;
            draft.folderId = event.target.value;
            renderSaveLimitSummary();
        });
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
        // 初期範囲はFORMの実音から決めるが、手動調整は現在の表示域で自由に行える。
        var limit = { min: draft.startFret, max: draft.endFret };
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

    function deletedDraftNote(note) {
        var draftDeleted = draftNote(note);
        draftDeleted.pendingDelete = true;
        return draftDeleted;
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

    // 空スロットに追加した音は、既存recordのnotes要素と同じ形で保持する。
    // コード名・quality・intervals自体はPhase1では変更しない。
    function addDraftNoteAtSlot(stringNum, fret) {
        if (!draft || stringNum < 1 || stringNum > 6 || fret < 0 || !isFinite(fret)) return false;
        if (draft.notes.some(function (note) { return note.string === stringNum && note.fret === fret; })) return false;
        if (typeof draft.rootPc !== 'number') return false;

        var mutedBeforeAdd = draft.mutedStrings.indexOf(stringNum) !== -1;
        var interval = (theory().OPEN_STRINGS[6 - stringNum] + fret - draft.rootPc + 12) % 12;
        draft.notes.push({
            string: stringNum,
            fret: fret,
            interval: interval,
            finger: 'T',
            fingeringWarning: false,
            pendingDelete: false,
            warningStartsCycle: false,
            addedInEditor: true,
            restoreMuteOnRemove: mutedBeforeAdd
        });
        draft.mutedStrings = draft.mutedStrings.filter(function (value) { return value !== stringNum; });
        if (fret === 0) {
            draft.range.includesOpen = true;
            draft.formRange.hasOpen = true;
        } else {
            draft.range.min = Math.min(draft.range.min, fret);
            draft.range.max = Math.max(draft.range.max, fret);
        }
        return true;
    }

    function cycleAddedDraftNote(note) {
        var index = ADDED_NOTE_CYCLE.indexOf(normalizeFinger(note.finger));
        if (index === -1) {
            note.finger = ADDED_NOTE_CYCLE[0];
            note.fingeringWarning = false;
            note.pendingDelete = false;
            return;
        }
        if (index < ADDED_NOTE_CYCLE.length - 1) {
            note.finger = ADDED_NOTE_CYCLE[index + 1];
            return;
        }
        var noteIndex = draft.notes.indexOf(note);
        if (noteIndex !== -1) draft.notes.splice(noteIndex, 1);
        if (note.restoreMuteOnRemove && draft.mutedStrings.indexOf(note.string) === -1) {
            draft.mutedStrings.push(note.string);
            draft.mutedStrings.sort(function (a, b) { return a - b; });
        }
    }

    function markerLabel(note, spelledNoteNames) {
        if (note.pendingDelete) return '';
        if (draft.displayMode === 'finger') {
            if (note.finger != null) return FINGER_LABELS[note.finger] || '';
            return note.fingeringWarning ? '⚠' : '';
        }
        if (draft.displayMode === 'solfege') {
            var solfegeIndex = draft.intervals.indexOf(note.interval);
            return theory().solfegeNameForSpelling(spelledNoteNames && spelledNoteNames[solfegeIndex]) || theory().solfegeName(notePc(note), draft.useFlats);
        }
        if (draft.displayMode === 'degree') {
            var qualityKey = theory().identifyQuality(draft.intervals);
            var intervalIndex = draft.intervals.indexOf(note.interval);
            var labels = theory().degreeLabelsForQuality(qualityKey, draft.intervals);
            return intervalIndex !== -1 ? labels[intervalIndex] : theory().degreeLabels([note.interval])[0];
        }
        var noteIndex = draft.intervals.indexOf(note.interval);
        if (spelledNoteNames && noteIndex !== -1 && spelledNoteNames[noteIndex]) {
            return spelledNoteNames[noteIndex];
        }
        return theory().noteName(notePc(note), draft.useFlats);
    }

    function fingeringAccessibleLabel(note) {
        var position = note.fret === 0 ? '開放弦' : note.fret + 'フレット';
        var state;
        if (note.pendingDelete) state = '消去予定';
        else if (note.fingeringWarning && note.finger == null) state = '運指警告';
        else if (note.finger != null) state = (FINGER_LABELS[note.finger] || '') + '指';
        else state = '運指未設定';
        return note.string + '弦 ' + position + '、現在 ' + state + '。運指を変更';
    }

    function roleForInterval(interval) {
        if (interval === 0) return 'root';
        if (interval === 3 || interval === 4 || interval === 5) return 'third';
        if (interval === 6 || interval === 7 || interval === 8) return 'fifth';
        if (interval === 9 || interval === 10 || interval === 11) return 'seventh';
        return 'other';
    }

    function roleForDraftInterval(interval) {
        // Phase2: フォーム編集で追加した、元コード構成外の音は保存形式を増やさず
        // 既存の構成intervalとの差分から表示専用roleを復元する。
        if (draft.intervals.indexOf(interval) === -1) return 'non-chord';
        var qualityKey = theory().identifyQuality(draft.intervals);
        return (qualityKey === '6' || qualityKey === 'm6') && interval === 9 ? 'sixth' : roleForInterval(interval);
    }

    function validBassPc(value) {
        return typeof value === 'number' && Math.floor(value) === value && value >= 0 && value <= 11 ? value : null;
    }

    /** フォーム近傍でExploreが提示するBass候補だけを保存範囲へ含める。遠方の同音は含めない。 */
    function rangeWithBassCandidates(chord, displayRange) {
        var range = {
            min: displayRange.min,
            max: displayRange.max,
            includesOpen: displayRange.includesOpen
        };
        var bassPc = validBassPc(chord && chord.bassPc);
        if (bassPc !== null) {
            var contextStart = Math.max(0, range.min - 1);
            var contextEnd = range.max + 1;
            var candidates = window.ChordCruise.chordModel.bassOverlayNotes({
                bassPc: bassPc, rootPc: chord.rootPc, intervals: chord.intervals,
                startFret: contextStart, endFret: contextEnd, targetStrings: [6, 5, 4]
            });
            candidates.forEach(function (candidate) {
                if (candidate.fret === 0) range.includesOpen = true;
                else {
                    range.min = Math.min(range.min, candidate.fret);
                    range.max = Math.max(range.max, candidate.fret);
                }
            });
        }
        return range;
    }

    /** 開放弦を含む自動保存範囲は、コード図として読める最低3フレットまで確保する。 */
    function minimumOpenSaveRange(range) {
        if (!range || !range.includesOpen) return range;
        return {
            min: range.min,
            max: Math.max(range.max, 3),
            includesOpen: true
        };
    }

    /** 6th保存前編集では、基底FORM notesを保ったまま6度候補を編集可能noteとして加える。 */
    function notesWithSixthCandidates(chord, form, displayRange) {
        var notes = form.notes.map(draftNote);
        if (!chord || (chord.qualityKey !== '6' && chord.qualityKey !== 'm6')) return notes;
        var bySlot = {};
        notes.forEach(function (note) { bySlot[note.string + ':' + note.fret] = true; });
        var overlayOptions = {
            rootPc: chord.rootPc,
            startFret: displayRange.min,
            endFret: displayRange.max,
            targetStrings: [3, 2, 1]
        };
        var sixthCandidates = window.ChordCruise.chordModel.sixthOverlayNotes(overlayOptions);
        if (chord.qualityKey === 'm6' && !sixthCandidates.length) {
            overlayOptions.targetStrings = [5];
            sixthCandidates = window.ChordCruise.chordModel.sixthOverlayNotes(overlayOptions);
        }
        sixthCandidates.forEach(function (candidate) {
            var key = candidate.string + ':' + candidate.fret;
            if (bySlot[key]) return;
            notes.push(draftNote(candidate));
            bySlot[key] = true;
        });
        return notes;
    }

    function normalizeBassFingerings(value) {
        if (!Array.isArray(value)) return [];
        var seen = {};
        return value.filter(function (entry) {
            if (!entry || [4, 5, 6].indexOf(entry.string) === -1 || typeof entry.fret !== 'number' || entry.fret < 0 || Math.floor(entry.fret) !== entry.fret) return false;
            if (EDIT_CYCLE.indexOf(entry.finger) === -1 || entry.finger === 'warning' || entry.finger === 'delete') return false;
            var key = entry.string + ':' + entry.fret;
            if (seen[key]) return false;
            seen[key] = true;
            return entry.finger !== null || entry.fingeringWarning === true || entry.pendingDelete === true;
        }).map(function (entry) {
            return { string: entry.string, fret: entry.fret, finger: entry.finger, fingeringWarning: entry.fingeringWarning === true && entry.finger === null, pendingDelete: entry.pendingDelete === true };
        });
    }

    function bassFingeringFor(stringNum, fret) {
        return draft.bassFingerings.filter(function (entry) { return entry.string === stringNum && entry.fret === fret; })[0] || null;
    }

    function bassFingeringAccessibleLabel(note) {
        var entry = bassFingeringFor(note.string, note.fret);
        var state = entry && entry.pendingDelete ? '消去予定' : (entry && entry.finger != null ? (FINGER_LABELS[entry.finger] || '') + '指' : (entry && entry.fingeringWarning ? '運指警告' : '未指定'));
        return note.string + '弦 ' + (note.fret === 0 ? '開放弦' : note.fret + 'フレット') + '、ベース候補、現在 ' + state + '。運指を変更';
    }

    function cycleBassFingering(stringNum, fret) {
        var entry = bassFingeringFor(stringNum, fret) || { string: stringNum, fret: fret, finger: null, fingeringWarning: false, pendingDelete: false, warningStartsCycle: false };
        cycleNote(entry);
        var state = noteEditState(entry);
        draft.bassFingerings = draft.bassFingerings.filter(function (item) { return item.string !== stringNum || item.fret !== fret; });
        if (state !== null) {
            draft.bassFingerings.push({ string: stringNum, fret: fret, finger: entry.finger, fingeringWarning: entry.fingeringWarning === true && entry.finger === null, pendingDelete: entry.pendingDelete === true });
        }
    }

    function normalizeTensionPcs(rootPc, value) {
        return window.ChordCruise.chordModel.tensionIntervalsForPcs(rootPc, value).map(function (interval) {
            return (rootPc + interval) % 12;
        });
    }

    function normalizeTensionFingerings(value, tensionPcs) {
        if (!Array.isArray(value)) return [];
        var seen = {};
        return value.filter(function (entry) {
            if (!entry || [1, 2, 3].indexOf(entry.string) === -1 || typeof entry.fret !== 'number' || entry.fret < 0 || Math.floor(entry.fret) !== entry.fret || tensionPcs.indexOf(entry.pc) === -1) return false;
            if (EDIT_CYCLE.indexOf(entry.finger) === -1 || entry.finger === 'warning' || entry.finger === 'delete') return false;
            var key = entry.string + ':' + entry.fret + ':' + entry.pc;
            if (seen[key]) return false;
            seen[key] = true;
            return entry.finger !== null || entry.fingeringWarning === true || entry.pendingDelete === true;
        }).map(function (entry) {
            return { string: entry.string, fret: entry.fret, pc: entry.pc, finger: entry.finger, fingeringWarning: entry.fingeringWarning === true && entry.finger === null, pendingDelete: entry.pendingDelete === true };
        });
    }

    function tensionFingeringFor(stringNum, fret, pc) {
        return draft.tensionFingerings.filter(function (entry) { return entry.string === stringNum && entry.fret === fret && entry.pc === pc; })[0] || null;
    }

    function tensionFingeringAccessibleLabel(note) {
        var entry = tensionFingeringFor(note.string, note.fret, note.pc);
        var state = entry && entry.pendingDelete ? '消去予定' : (entry && entry.finger != null ? (FINGER_LABELS[entry.finger] || '') + '指' : (entry && entry.fingeringWarning ? '運指警告' : '未指定'));
        return note.string + '弦 ' + (note.fret === 0 ? '開放弦' : note.fret + 'フレット') + '、テンション候補、現在 ' + state + '。運指を変更';
    }

    function cycleTensionFingering(stringNum, fret, pc) {
        var entry = tensionFingeringFor(stringNum, fret, pc) || { string: stringNum, fret: fret, pc: pc, finger: null, fingeringWarning: false, pendingDelete: false, warningStartsCycle: false };
        cycleNote(entry);
        var state = noteEditState(entry);
        draft.tensionFingerings = draft.tensionFingerings.filter(function (item) { return item.string !== stringNum || item.fret !== fret || item.pc !== pc; });
        if (state !== null) {
            draft.tensionFingerings.push({ string: stringNum, fret: fret, pc: pc, finger: entry.finger, fingeringWarning: entry.fingeringWarning === true && entry.finger === null, pendingDelete: entry.pendingDelete === true });
        }
    }

    function tensionFingeringsForRecord() {
        return draft.tensionFingerings.filter(function (entry) {
            return !draft.notes.some(function (note) { return note.string === entry.string && note.fret === entry.fret; });
        });
    }

    function bassSpelledNoteName(note) {
        var index = draft.intervals.indexOf(note.interval);
        var degreeLabel = index !== -1
            ? draft.degreeLabels[index]
            : window.ChordCruise.chordModel.bassDegreeLabel(note.interval);
        try {
            return theory().spellBassNote({
                rootPc: draft.rootPc,
                rootName: window.ChordCruise.chordModel.CUSTOM_ROOT_NAMES[draft.rootPc],
                bassPc: note.pc,
                bassInterval: note.interval,
                bassDegreeLabel: degreeLabel,
                keyContext: draft.keyContext
            });
        } catch (error) {
            return window.ChordCruise.chordModel.bassNoteName(note.pc);
        }
    }

    function bassOverlayLabel(note, spelledNoteNames) {
        if (draft.displayMode === 'finger') return '';
        var spelled = bassSpelledNoteName(note);
        if (draft.displayMode === 'solfege') return theory().solfegeNameForSpelling(spelled) || theory().solfegeName(note.pc, window.ChordCruise.chordModel.bassUsesFlats(note.pc));
        if (draft.displayMode === 'degree') {
            var index = draft.intervals.indexOf(note.interval);
            var labels = theory().degreeLabelsForQuality(theory().identifyQuality(draft.intervals), draft.intervals);
            return index !== -1 ? labels[index] : window.ChordCruise.chordModel.bassDegreeLabel(note.interval);
        }
        return spelled;
    }

    function mergeBassOverlay(markers, spelledNoteNames) {
        if (draft.bassPc === null) return markers;
        var overlays = window.ChordCruise.chordModel.bassOverlayNotes({
            bassPc: draft.bassPc, rootPc: draft.rootPc, intervals: draft.intervals,
            startFret: draft.startFret, endFret: draft.endFret, targetStrings: [6, 5, 4]
        });
        var bySlot = {};
        markers.forEach(function (marker) { bySlot[marker.string + ':' + marker.fret] = marker; });
        overlays.forEach(function (note) {
            if (!noteIncluded(note)) return;
            var key = note.string + ':' + note.fret;
            if (bySlot[key]) { bySlot[key].isBassCandidate = true; return; }
            var marker = {
                string: note.string, fret: note.fret, label: bassOverlayLabel(note, spelledNoteNames),
                role: roleForInterval(note.interval), isOverlay: true, overlayType: 'bass',
                isBassCandidate: true, finger: (bassFingeringFor(note.string, note.fret) || {}).finger || null,
                fingeringWarning: !!((bassFingeringFor(note.string, note.fret) || {}).fingeringWarning),
                pendingDelete: !!((bassFingeringFor(note.string, note.fret) || {}).pendingDelete),
                tappable: draft.displayMode === 'finger', ariaLabel: bassFingeringAccessibleLabel(note)
            };
            if (draft.displayMode === 'finger') marker.label = marker.pendingDelete ? '' : (marker.finger != null ? (FINGER_LABELS[marker.finger] || '') : (marker.fingeringWarning ? '⚠' : ''));
            markers.push(marker);
            bySlot[key] = marker;
        });
        return markers;
    }

    function tensionOverlayLabel(note, spelledNoteNames) {
        if (draft.displayMode === 'finger') return '';
        var noteIndex = draft.intervals.indexOf(note.interval);
        var spelled = spelledNoteNames && spelledNoteNames[noteIndex];
        if (draft.displayMode === 'solfege') return theory().solfegeNameForSpelling(spelled) || theory().solfegeName(note.pc, draft.useFlats);
        if (draft.displayMode === 'degree') return window.ChordCruise.chordModel.TENSION_LABELS[note.tension] || theory().degreeLabels([note.interval])[0];
        if (spelled) return spelled;
        return theory().noteName(note.pc, draft.useFlats);
    }

    function mergeTensionOverlay(markers, spelledNoteNames) {
        if (!draft.tensionPcs.length) return markers;
        var tensionIntervals = window.ChordCruise.chordModel.tensionIntervalsForPcs(draft.rootPc, draft.tensionPcs);
        var overlays = window.ChordCruise.chordModel.tensionOverlayNotes({
            rootPc: draft.rootPc, tensionIntervals: tensionIntervals,
            startFret: draft.startFret, endFret: draft.endFret
        });
        var bySlot = {};
        markers.forEach(function (marker) { bySlot[marker.string + ':' + marker.fret] = marker; });
        overlays.forEach(function (note) {
            if (!noteIncluded(note)) return;
            var key = note.string + ':' + note.fret;
            if (bySlot[key]) { bySlot[key].isTensionCandidate = true; return; }
            var entry = tensionFingeringFor(note.string, note.fret, note.pc) || {};
            var marker = {
                string: note.string, fret: note.fret, label: tensionOverlayLabel(note, spelledNoteNames),
                role: roleForInterval(note.interval), isOverlay: true, overlayType: 'tension', isTensionCandidate: true,
                finger: entry.finger || null, fingeringWarning: !!entry.fingeringWarning,
                pendingDelete: !!entry.pendingDelete, tappable: draft.displayMode === 'finger', ariaLabel: tensionFingeringAccessibleLabel(note)
            };
            if (draft.displayMode === 'finger') marker.label = marker.pendingDelete ? '' : (marker.finger != null ? (FINGER_LABELS[marker.finger] || '') : (marker.fingeringWarning ? '⚠' : ''));
            markers.push(marker);
            bySlot[key] = marker;
        });
        return markers;
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
        var spelledNoteNames;
        try {
            spelledNoteNames = theory().spellChordNotes({
                rootPc: draft.rootPc,
                rootName: window.ChordCruise.chordModel.CUSTOM_ROOT_NAMES[draft.rootPc],
                qualityKey: draft.qualityKey,
                intervals: draft.intervals,
                degreeLabels: draft.degreeLabels,
                keyContext: draft.keyContext
            });
        } catch (error) {
            spelledNoteNames = theory().diatonicNoteNamesForContext(
                draft.keyContext,
                draft.rootPc,
                draft.intervals
            );
        }
        var markers = draft.notes.map(function (note) {
            return {
                string: note.string,
                fret: note.fret,
                label: markerLabel(note, spelledNoteNames),
                role: roleForDraftInterval(note.interval),
                dimmed: !noteIncluded(note),
                pendingDelete: note.pendingDelete && noteIncluded(note),
                fingeringWarning: draft.displayMode === 'finger' && note.fingeringWarning && !note.pendingDelete,
                tappable: noteIncluded(note),
                ariaLabel: fingeringAccessibleLabel(note)
            };
        });
        markers = mergeBassOverlay(markers, spelledNoteNames);
        markers = mergeTensionOverlay(markers, spelledNoteNames);
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
                if (!note) {
                    if (draft.displayMode !== 'finger') return;
                    if (stringNum <= 3) {
                        var tensionEntry = window.ChordCruise.chordModel.tensionOverlayNotes({
                            rootPc: draft.rootPc,
                            tensionIntervals: window.ChordCruise.chordModel.tensionIntervalsForPcs(draft.rootPc, draft.tensionPcs),
                            startFret: fret, endFret: fret
                        }).filter(function (candidate) { return candidate.string === stringNum; })[0];
                        if (tensionEntry) cycleTensionFingering(stringNum, fret, tensionEntry.pc);
                    } else {
                        cycleBassFingering(stringNum, fret);
                    }
                } else {
                    if (!noteIncluded(note)) return;
                    if (note.addedInEditor) cycleAddedDraftNote(note);
                    else cycleNote(note);
                }
                renderPreview();
                renderRange();
            },
            onEmptySlotTap: function (stringNum, fret) {
                if (!addDraftNoteAtSlot(stringNum, fret)) return;
                renderPreview();
                renderRange();
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
        var folders = window.ChordCruise.storage.loadOrderedFolders();
        select.innerHTML = '';
        folders.forEach(function (folder) {
            var option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            select.appendChild(option);
        });
        var exists = folders.some(function (folder) { return folder.id === draft.folderId; });
        select.value = exists ? draft.folderId : window.ChordCruise.storage.UNCATEGORIZED_ID;
        draft.folderId = select.value;
        renderSaveLimitSummary();
    }

    /** Standard版の保存画面だけに、現在のフォルダ・コード保存上限を表示する。 */
    function renderSaveLimitSummary() {
        var host = document.getElementById('cc-save-limit-summary');
        var storage = window.ChordCruise.storage;
        if (!host || !draft || !storage || typeof storage.getLibraryLimits !== 'function') return;
        var limits = storage.getLibraryLimits();
        if (isProEdition()) {
            host.hidden = true;
            return;
        }
        if (limits.unlimited) {
            host.hidden = true;
            return;
        }
        var folders = storage.loadFolders();
        var folderId = document.getElementById('cc-save-folder').value || draft.folderId;
        var chords = storage.loadChordIndex();
        var customFolderCount = folders.filter(function (folder) { return folder && !folder.builtin; }).length;
        var chordCount = chords.filter(function (entry) { return entry && entry.folderId === folderId; }).length;
        document.getElementById('cc-save-folder-limit-count').textContent =
            'フォルダ：' + customFolderCount + ' / ' + limits.maxCustomFolders;
        document.getElementById('cc-save-chord-limit-count').textContent =
            'このフォルダ：' + chordCount + ' / ' + limits.maxChordsPerFolder;
        host.hidden = false;
    }

    function preferredSaveFolderId() {
        var settings = window.ChordCruise.state && window.ChordCruise.state.settings;
        var preferred = settings && settings.lastSaveFolderId;
        var folders = window.ChordCruise.storage.loadOrderedFolders();
        return folders.some(function (folder) { return folder.id === preferred; })
            ? preferred
            : window.ChordCruise.storage.UNCATEGORIZED_ID;
    }

    function rememberSaveFolder(folderId) {
        if (!folderId) return;
        if (window.ChordCruise.storage.saveSettings({ lastSaveFolderId: folderId }) === true &&
            window.ChordCruise.state && window.ChordCruise.state.settings) {
            window.ChordCruise.state.settings.lastSaveFolderId = folderId;
        }
    }

    function setFolderError(text) {
        var element = document.getElementById('cc-save-folder-error');
        var proLink = document.getElementById('cc-save-folder-pro-link');
        if (!element) return;
        element.textContent = text || '';
        element.style.display = text ? 'block' : 'none';
        if (proLink) {
            var code = window.ChordCruise.storage && window.ChordCruise.storage.getLastError
                ? window.ChordCruise.storage.getLastError() : null;
            proLink.hidden = isProEdition() || !text || code !== 'standard-folder-limit';
        }
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
            setFolderError(storageErrorMessage('フォルダを作成できませんでした。'));
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
        var proLink = document.getElementById('cc-save-limit-pro-link');
        element.textContent = text || '';
        element.style.display = text ? '' : 'none';
        if (proLink) {
            var code = window.ChordCruise.storage && window.ChordCruise.storage.getLastError
                ? window.ChordCruise.storage.getLastError() : null;
            proLink.hidden = isProEdition() || !text || code !== 'standard-folder-chord-limit';
        }
    }

    function setCustomSaveProNotice(visible) {
        var element = document.getElementById('cc-save-pro-notice');
        if (element) element.hidden = !visible || isProEdition();
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
            mutedStrings: clone(draft.mutedStrings),
            bassFingerings: clone(draft.bassFingerings),
            tensionPcs: clone(draft.tensionPcs),
            tensionFingerings: clone(draft.tensionFingerings)
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
        var deletedNotes = draft.notes.filter(function (note) {
            return noteIncluded(note) && note.pendingDelete;
        }).map(function (note) {
            return {
                string: note.string,
                fret: note.fret,
                interval: note.interval,
                finger: normalizeFinger(note.finger),
                fingeringWarning: note.fingeringWarning === true && normalizeFinger(note.finger) === null,
                pendingDelete: true
            };
        });
        var record = draft.original ? clone(draft.original) : {};
        record.chordName = theory().displayChordName(values.chordName || draft.chordName);
        record.formName = values.formName || draft.formName;
        record.shape = draft.shape;
        record.keyContext = clone(draft.keyContext);
        record.intervals = clone(draft.intervals);
        var qualityKey = theory().identifyQuality(draft.intervals);
        if (qualityKey === '6') record.qualityKey = '6';
        else if (qualityKey === 'm6') record.qualityKey = 'm6';
        record.rootPc = draft.rootPc;
        if (draft.bassPc !== null) record.bassPc = draft.bassPc;
        else delete record.bassPc;
        if (draft.bassFingerings.length) record.bassFingerings = clone(draft.bassFingerings);
        else delete record.bassFingerings;
        if (draft.tensionPcs.length) record.tensionPcs = clone(draft.tensionPcs);
        else delete record.tensionPcs;
        var tensionFingerings = tensionFingeringsForRecord();
        if (tensionFingerings.length) record.tensionFingerings = clone(tensionFingerings);
        else delete record.tensionFingerings;
        record.fretRange = currentRangeForDisplay();
        record.notes = includedNotes;
        if (deletedNotes.length) record.deletedNotes = deletedNotes;
        else delete record.deletedNotes;
        record.mutedStrings = clone(draft.mutedStrings);
        draft.deletedNoteStrings.forEach(function (stringNum) {
            var stillDeleted = deletedNotes.some(function (note) { return note.string === stringNum; });
            if (!stillDeleted) record.mutedStrings = record.mutedStrings.filter(function (value) { return value !== stringNum; });
        });
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
        setError('');
        setCustomSaveProNotice(false);
        if (draft.source === 'custom' && !canSaveCustomChord()) {
            setCustomSaveProNotice(true);
            return;
        }
        saveInProgress = true;
        var callback = onSavedCallback;
        var saved = window.ChordCruise.storage.saveChord(record, { source: draft.source });
        if (!saved) {
            saveInProgress = false;
            if (window.ChordCruise.storage.getLastError() === 'custom-chord-save-pro-required') {
                setCustomSaveProNotice(true);
                return;
            }
            setError(storageErrorMessage('保存に失敗しました。ブラウザの保存領域を確認してください。'));
            return;
        }
        rememberSaveFolder(saved.folderId);
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
            ? '音のない場所をタップすると追加できます。既存の音はタップすると運指・⚠️・消去を切り替えられます。上書き保存または別名で保存すると確定します。'
            : '音のない場所をタップすると追加できます。既存の音はタップすると運指・⚠️・消去を切り替えられます。変更は保存するまで確定しません。';
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
        setCustomSaveProNotice(false);
        setModeUi(draft.mode);
        updateDisplaySegments();
        renderRange();
        overlayEl.classList.remove('cc-modal-overlay--hidden');
        renderPreview();
        initialSnapshot = snapshot();
        var dialog = overlayEl.querySelector('[role="dialog"]');
        if (focusTrap()) focusTrap().focusFirst(dialog || overlayEl);
    }

    /** 新規フォームの保存前編集を開く。 */
    function open(payload) {
        ensureDom();
        previousFocus = document.activeElement;
        var chord = payload.chord;
        var form = payload.form;
        var displayRange = form.displayRange || form.fretRange;
        var saveRange = minimumOpenSaveRange(rangeWithBassCandidates(chord, displayRange));
        var tensionPcs = window.ChordCruise.chordModel.tensionPcsForIntervals(chord.rootPc, chord.tensionIntervals || []);
        onSavedCallback = payload.onSaved || null;
        saveInProgress = false;
        draft = {
            mode: 'new',
            source: chord.source === 'custom' ? 'custom' : 'diatonic',
            original: null,
            chordName: chord.symbol,
            formName: payload.shape + '型',
            shape: payload.shape,
            keyContext: clone(payload.keyContext || null),
            intervals: chord.intervals.slice(),
            qualityKey: chord.qualityKey || null,
            degreeLabels: Array.isArray(chord.degreeLabelsList)
                ? chord.degreeLabelsList.slice()
                : theory().degreeLabelsForQuality(chord.qualityKey, chord.intervals),
            rootPc: chord.rootPc,
            bassPc: validBassPc(chord.bassPc),
            bassFingerings: [],
            tensionPcs: tensionPcs,
            tensionFingerings: [],
            useFlats: !!payload.useFlats,
            displayMode: defaultDisplayMode(),
            notes: notesWithSixthCandidates(chord, form, displayRange),
            mutedStrings: form.mutedStrings.slice(),
            deletedNoteStrings: [],
            startFret: typeof payload.startFret === 'number' ? payload.startFret : (form.fretRange.min >= 12 ? 12 : 0),
            endFret: typeof payload.endFret === 'number' ? payload.endFret : (form.fretRange.min >= 12 ? 25 : 13),
            formRange: {
                min: saveRange.min,
                max: saveRange.max,
                hasOpen: saveRange.includesOpen
            },
            range: {
                min: saveRange.min,
                max: saveRange.max,
                includesOpen: saveRange.includesOpen
            },
            memo: '',
            folderId: preferredSaveFolderId(),
            autoCenterPending: true
        };
        showEditor();
    }

    /** 保存済みコードを複製し、元データへ触れずに編集を開始する。 */
    function openExisting(payload) {
        ensureDom();
        previousFocus = document.activeElement;
        var original = clone(payload.chord || {});
        var notes = Array.isArray(original.notes) ? clone(original.notes).filter(function (note) {
            return note && typeof note.string === 'number' && typeof note.fret === 'number';
        }) : [];
        var deletedNotes = Array.isArray(original.deletedNotes) ? clone(original.deletedNotes).filter(function (note) {
            return note && note.pendingDelete === true && typeof note.string === 'number' && typeof note.fret === 'number' && !notes.some(function (active) { return active.string === note.string && active.fret === note.fret; });
        }) : [];
        var editableNotes = notes.concat(deletedNotes);
        var range = original.fretRange || {};
        var fretted = editableNotes.filter(function (note) { return note && note.fret > 0; }).map(function (note) { return note.fret; });
        var inferredMin = fretted.length ? Math.min.apply(null, fretted) : 0;
        var inferredMax = fretted.length ? Math.max.apply(null, fretted) : inferredMin;
        var min = typeof range.min === 'number' ? range.min : inferredMin;
        var max = typeof range.max === 'number' ? range.max : inferredMax;
        if (max < min) max = min;
        var includesOpen = typeof range.includesOpen === 'boolean'
            ? range.includesOpen
            : editableNotes.some(function (note) { return note && note.fret === 0; });
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
            source: original.keyContext ? 'diatonic' : 'custom',
            original: original,
            chordName: theory().displayChordName(original.chordName || ''),
            formName: original.formName || (shape ? shape + '型' : 'フォーム'),
            shape: shape,
            keyContext: clone(keyContext),
            intervals: Array.isArray(original.intervals) ? original.intervals.slice() : [],
            qualityKey: original.qualityKey || theory().identifyQuality(Array.isArray(original.intervals) ? original.intervals : []),
            degreeLabels: Array.isArray(original.degreeLabelsList)
                ? original.degreeLabelsList.slice()
                : theory().degreeLabelsForQuality(original.qualityKey || theory().identifyQuality(Array.isArray(original.intervals) ? original.intervals : []), Array.isArray(original.intervals) ? original.intervals : []),
            rootPc: typeof original.rootPc === 'number' ? original.rootPc : null,
            bassPc: validBassPc(original.bassPc),
            bassFingerings: normalizeBassFingerings(original.bassFingerings),
            tensionPcs: normalizeTensionPcs(typeof original.rootPc === 'number' ? original.rootPc : null, original.tensionPcs),
            tensionFingerings: normalizeTensionFingerings(original.tensionFingerings, normalizeTensionPcs(typeof original.rootPc === 'number' ? original.rootPc : null, original.tensionPcs)).filter(function (entry) {
                return !editableNotes.some(function (note) { return note.string === entry.string && note.fret === entry.fret; });
            }),
            useFlats: !!useFlats,
            displayMode: defaultDisplayMode(),
            notes: notes.map(draftNote).concat(deletedNotes.map(deletedDraftNote)),
            mutedStrings: Array.isArray(original.mutedStrings) ? original.mutedStrings.slice() : [],
            deletedNoteStrings: deletedNotes.map(function (note) { return note.string; }),
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
        var returnFocus = previousFocus;
        resetFolderCreate();
        if (overlayEl) overlayEl.classList.add('cc-modal-overlay--hidden');
        draft = null;
        initialSnapshot = null;
        onSavedCallback = null;
        saveInProgress = false;
        previousFocus = null;
        if (focusTrap()) focusTrap().restoreFocus(returnFocus);
        else if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
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
