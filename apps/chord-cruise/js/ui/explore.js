(function () {
    'use strict';

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.ui = window.ChordCruise.ui || {};

    function getTheory() {
        return window.ChordCruise.theory;
    }

    function getState() {
        return window.ChordCruise.state;
    }

    function getSettings() {
        return getState().settings;
    }

    function saveSetting(partial) {
        var settings = getSettings();
        var key;
        for (key in partial) {
            if (Object.prototype.hasOwnProperty.call(partial, key)) {
                settings[key] = partial[key];
            }
        }
        window.ChordCruise.storage.saveSettings(partial);
    }

    var cagedNoticeExpanded = { fingering: false, range: false };
    var cagedNoticeState = {
        fingering: { type: '', text: '' },
        range: { type: 'range', text: '' }
    };
    // SCALES 自体をラベルの正式sourceとしつつ、UIの表示順は明示的に固定する。
    var SCALE_SELECTION_ORDER = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'harmonic-minor', 'melodic-minor', 'locrian'];
    var scaleSheet = null;
    var scaleSheetReturnFocus = null;

    function focusTrap() {
        return window.ChordCruise.ui && window.ChordCruise.ui.focusTrap;
    }

    function scaleDefinition(scaleType) {
        var theory = getTheory();
        return theory.SCALES[scaleType] || theory.SCALES.major;
    }

    function isSelectableScale(scaleType) {
        return SCALE_SELECTION_ORDER.indexOf(scaleType) !== -1 && !!getTheory().SCALES[scaleType];
    }

    function scaleLabel(scaleType) {
        return scaleDefinition(scaleType).label;
    }

    function showScaleSaveError() {
        if (window.ChordCruise.ui.toast) {
            window.ChordCruise.ui.toast.show('スケール設定を保存できませんでした', { type: 'error' });
        }
    }

    function buildSkeleton(section) {
        var content = document.getElementById('cc-explore-content');
        if (content) {
            return;
        }
        var header = section.querySelector('.cc-page-header');
        section.innerHTML = '';
        if (header) {
            section.appendChild(header);
        }
        content = document.createElement('div');
        content.id = 'cc-explore-content';
        content.className = 'cc-explore-content';
        content.innerHTML =
            '<div class="cc-card cc-explore-controls">' +
                '<div class="cc-control-row">' +
                    '<span class="cc-control-label">キー</span>' +
                    '<select id="cc-key-select" class="cc-select"></select>' +
                '</div>' +
                '<div class="cc-control-row cc-scale-control-row">' +
                    '<span class="cc-control-label">スケール</span>' +
                    '<button type="button" class="cc-scale-selector" id="cc-scale-selector" aria-haspopup="dialog" aria-expanded="false" aria-controls="cc-scale-sheet">' +
                        '<span class="cc-scale-selector-value" id="cc-scale-selector-value"></span>' +
                        '<span class="cc-scale-selector-chevron" aria-hidden="true">⌄</span>' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="cc-card">' +
                '<div class="cc-diatonic-head">' +
                    '<h3 class="cc-card-heading">ダイアトニックコード</h3>' +
                    '<div class="cc-segment cc-diatonic-tone-switch" role="group" aria-label="和音数切替">' +
                        '<button type="button" class="cc-segment-btn" id="cc-tone-3">3和音</button>' +
                        '<button type="button" class="cc-segment-btn" id="cc-tone-7">4和音</button>' +
                    '</div>' +
                '</div>' +
                '<div class="cc-chord-grid" id="cc-chord-grid"></div>' +
                '<div class="cc-custom-chord-row">' +
                    '<button type="button" class="cc-btn cc-btn-secondary cc-btn--block" id="cc-custom-chord-btn">＋ 任意コードを作る</button>' +
                '</div>' +
            '</div>' +
            '<div class="cc-card cc-fb-card">' +
                '<div class="cc-fb-head">' +
                    '<h3 class="cc-card-heading">指板</h3>' +
                    '<div class="cc-segment" role="group" aria-label="指板表示切替">' +
                        '<button type="button" class="cc-segment-btn" id="cc-fbmode-note">CDE</button>' +
                        '<button type="button" class="cc-segment-btn" id="cc-fbmode-solfege">ドレミ</button>' +
                        '<button type="button" class="cc-segment-btn" id="cc-fbmode-degree">度数</button>' +
                        '<button type="button" class="cc-segment-btn cc-segment-btn--disabled" id="cc-fbmode-finger">運指</button>' +
                    '</div>' +
                '</div>' +
                '<div class="cc-caged-row" id="cc-caged-row" role="group" aria-label="CAGEDフォーム切替">' +
                    '<button type="button" class="cc-caged-btn" data-shape="">全体</button>' +
                    '<button type="button" class="cc-caged-btn" data-shape="C" aria-label="C型"><span class="cc-caged-btn-label">C型</span><span class="cc-caged-btn-root" aria-hidden="true">(5弦R)</span></button>' +
                    '<button type="button" class="cc-caged-btn" data-shape="A" aria-label="A型"><span class="cc-caged-btn-label">A型</span><span class="cc-caged-btn-root" aria-hidden="true">(5弦R)</span></button>' +
                    '<button type="button" class="cc-caged-btn" data-shape="G" aria-label="G型"><span class="cc-caged-btn-label">G型</span><span class="cc-caged-btn-root" aria-hidden="true">(6弦R)</span></button>' +
                    '<button type="button" class="cc-caged-btn" data-shape="E" aria-label="E型"><span class="cc-caged-btn-label">E型</span><span class="cc-caged-btn-root" aria-hidden="true">(6弦R)</span></button>' +
                    '<button type="button" class="cc-caged-btn" data-shape="D" aria-label="D型"><span class="cc-caged-btn-label">D型</span><span class="cc-caged-btn-root" aria-hidden="true">(4弦R)</span></button>' +
                '</div>' +
                '<div class="cc-caged-notices" id="cc-caged-notices">' +
                    '<div class="cc-caged-notice" id="cc-caged-notice-fingering" hidden>' +
                        '<button type="button" class="cc-caged-notice-toggle" id="cc-caged-notice-toggle-fingering" aria-expanded="false" aria-controls="cc-caged-notice-detail-fingering">' +
                            '<span id="cc-caged-notice-label-fingering">⚠️ 運指</span>' +
                            '<span class="cc-caged-notice-chevron" id="cc-caged-notice-chevron-fingering" aria-hidden="true">⌄</span>' +
                        '</button>' +
                        '<div class="cc-caged-notice-detail" id="cc-caged-notice-detail-fingering" role="status" hidden></div>' +
                    '</div>' +
                    '<div class="cc-caged-notice cc-caged-notice--range" id="cc-caged-notice-range" hidden>' +
                        '<button type="button" class="cc-caged-notice-toggle" id="cc-caged-notice-toggle-range" aria-expanded="false" aria-controls="cc-caged-notice-detail-range">' +
                            '<span>△ フォーム</span>' +
                            '<span class="cc-caged-notice-chevron" id="cc-caged-notice-chevron-range" aria-hidden="true">⌄</span>' +
                        '</button>' +
                        '<div class="cc-caged-notice-detail" id="cc-caged-notice-detail-range" role="status" hidden></div>' +
                    '</div>' +
                '</div>' +
                '<div class="cc-fretboard-chord-name cc-explore-fretboard-name" id="cc-explore-fretboard-name" aria-live="polite" hidden></div>' +
                '<div id="cc-fretboard-host" class="cc-fb-host"></div>' +
                '<div class="cc-high-fret-row">' +
                    '<span class="cc-high-fret-copy">' +
                        '<span class="cc-high-fret-label">ハイフレット</span>' +
                        '<span class="cc-high-fret-note">ONにすると12〜25フレットを表示します</span>' +
                    '</span>' +
                    '<button type="button" id="cc-high-fret-toggle" class="cc-switch" role="switch" aria-checked="false" aria-label="ハイフレット表示">' +
                        '<span class="cc-switch-knob" aria-hidden="true"></span>' +
                    '</button>' +
                '</div>' +
                '<p class="cc-fb-hint" id="cc-fb-hint"></p>' +
                '<div class="cc-save-btn-row" id="cc-save-btn-row">' +
                    '<button type="button" class="cc-btn cc-btn-primary cc-btn--block" id="cc-save-form-btn" disabled aria-describedby="cc-fb-hint">保存する</button>' +
                '</div>' +
            '</div>' +
            '';
        section.appendChild(content);
        bindEvents();
    }

    function bindEvents() {
        document.getElementById('cc-key-select').addEventListener('change', function (event) {
            resetCagedNotice();
            saveSetting({ selectedKey: parseInt(event.target.value, 10) });
            renderChordGrid();
            renderFretboard();
            renderDetail();
        });

        document.getElementById('cc-scale-selector').addEventListener('click', function (event) {
            openScaleSheet(event.currentTarget);
        });

        document.getElementById('cc-tone-3').addEventListener('click', function () {
            setToneMode('3');
        });

        document.getElementById('cc-tone-7').addEventListener('click', function () {
            setToneMode('7');
        });

        document.getElementById('cc-chord-grid').addEventListener('click', function (event) {
            var btn = event.target.closest('.cc-chord-btn');
            if (!btn) {
                return;
            }
            getState().exploreCustomChord = null;
            getState().exploreSelectedChordIndex = parseInt(btn.dataset.index, 10);
            resetCagedNotice();
            renderChordGrid();
            renderFretboard();
            renderDetail();
        });

        document.getElementById('cc-custom-chord-btn').addEventListener('click', function () {
            window.ChordCruise.ui.chordBuilder.open({
                onApply: function (chord) {
                    getState().exploreCustomChord = chord;
                    getState().exploreSelectedChordIndex = null;
                    resetCagedNotice();
                    renderChordGrid();
                    renderFretboard();
                    renderDetail();
                }
            });
        });

        ['note', 'solfege', 'degree'].forEach(function (mode) {
            document.getElementById('cc-fbmode-' + mode).addEventListener('click', function () {
                if (getSettings().fretboardDisplayMode === mode) {
                    return;
                }
                saveSetting({ fretboardDisplayMode: mode });
                updateFbSegments();
                renderFretboard();
            });
        });

        // 運指表示はCAGEDフォーム表示中のみ有効
        document.getElementById('cc-fbmode-finger').addEventListener('click', function () {
            if (!currentForm()) {
                setFbHint('運指表示はCAGEDフォームを選んだときに使えます。');
                return;
            }
            if (getSettings().fretboardDisplayMode === 'finger') {
                return;
            }
            saveSetting({ fretboardDisplayMode: 'finger' });
            updateFbSegments();
            renderFretboard();
        });

        document.getElementById('cc-save-form-btn').addEventListener('click', function () {
            var chord = selectedChord();
            var form = currentForm();
            // Phase E1ではbassPcを保存recordへ入れないため、slashを通常コードとして保存しない。
            if (!chord || !form || chord.bassPc != null) {
                return;
            }
            var settings = getSettings();
            window.ChordCruise.ui.saveEditor.open({
                chord: chord,
                form: form,
                shape: getState().exploreShape,
                startFret: fretWindow().start,
                endFret: fretWindow().end,
                useFlats: chordUseFlats(chord),
                keyContext: chord.source === 'custom' ? null : {
                    tonicPc: settings.selectedKey,
                    mode: settings.scaleType,
                    degreeLabel: chord.roman
                },
                onSaved: function () {
                    setFbHint('保存しました。コード本棚で確認できます。');
                }
            });
        });

        document.getElementById('cc-caged-row').addEventListener('click', function (event) {
            var btn = event.target.closest('.cc-caged-btn');
            if (!btn) {
                return;
            }
            var shape = btn.dataset.shape || null;
            if (shape && !selectedChord()) {
                setFbHint('先にコードを選んでください。');
                return;
            }
            getState().exploreShape = shape;
            resetCagedNotice();
            updateCagedButtons();
            renderFretboard();
        });

        ['fingering', 'range'].forEach(function (kind) {
            document.getElementById('cc-caged-notice-toggle-' + kind).addEventListener('click', function () {
                if (!cagedNoticeState[kind].text) return;
                cagedNoticeExpanded[kind] = !cagedNoticeExpanded[kind];
                setCagedNotice(kind, cagedNoticeState[kind].type, cagedNoticeState[kind].text);
            });
        });

        document.getElementById('cc-high-fret-toggle').addEventListener('click', function () {
            var enabled = !getSettings().highFretMode;
            resetCagedNotice();
            saveSetting({ highFretMode: enabled });
            updateHighFretToggle();
            renderFretboard();
        });

        document.addEventListener('chordcruise:fretboard-settings-change', function () {
            if (document.getElementById('cc-fretboard-host')) {
                renderFretboard();
            }
        });
    }

    function setFbHint(text) {
        var hint = document.getElementById('cc-fb-hint');
        if (!hint) {
            return;
        }
        hint.textContent = text || '';
        hint.style.display = text ? '' : 'none';
    }

    function resetCagedNotice() {
        cagedNoticeExpanded.fingering = false;
        cagedNoticeExpanded.range = false;
    }

    function setCagedNotice(kind, type, text) {
        var notice = document.getElementById('cc-caged-notice-' + kind);
        if (!notice) return;
        var toggle = document.getElementById('cc-caged-notice-toggle-' + kind);
        var detail = document.getElementById('cc-caged-notice-detail-' + kind);
        var label = document.getElementById('cc-caged-notice-label-' + kind);
        var chevron = document.getElementById('cc-caged-notice-chevron-' + kind);
        cagedNoticeState[kind].type = type || '';
        cagedNoticeState[kind].text = text || '';
        if (!cagedNoticeState[kind].text) cagedNoticeExpanded[kind] = false;
        notice.className = 'cc-caged-notice' + (type ? ' cc-caged-notice--' + type : '');
        notice.hidden = !cagedNoticeState[kind].text;
        if (!toggle || !detail || !chevron) return;
        if (label) label.textContent = type === 'unavailable' ? '△ フォーム' : '⚠️ 運指';
        toggle.setAttribute('aria-expanded', cagedNoticeExpanded[kind] ? 'true' : 'false');
        chevron.textContent = cagedNoticeExpanded[kind] ? '⌃' : '⌄';
        detail.textContent = cagedNoticeState[kind].text;
        detail.hidden = !cagedNoticeExpanded[kind];
    }

    function setCagedNotices(fingeringType, fingeringText, rangeText) {
        setCagedNotice('fingering', fingeringType, fingeringText);
        setCagedNotice('range', 'range', rangeText);
    }

    function commitScaleType(scaleType) {
        var settings = getSettings();
        if (!isSelectableScale(scaleType)) {
            return false;
        }
        if (settings.scaleType === scaleType) {
            return true;
        }
        // stateを先に変えない。localStorageへの保存が成功してから同じ値を反映する。
        if (window.ChordCruise.storage.saveSettings({ scaleType: scaleType }) !== true) {
            showScaleSaveError();
            return false;
        }
        settings.scaleType = scaleType;
        return true;
    }

    function setScaleType(scaleType) {
        var changed = getSettings().scaleType !== scaleType;
        if (!commitScaleType(scaleType)) {
            return false;
        }
        if (!changed) {
            return true;
        }
        resetCagedNotice();
        updateKeyOptions();
        updateSegments();
        renderChordGrid();
        renderFretboard();
        renderDetail();
        return true;
    }

    function scaleSheetChoicesHtml() {
        var selectedScale = getSettings().scaleType;
        var html = '<div class="cc-folder-manage-sheet cc-scale-sheet" id="cc-scale-sheet" role="dialog" aria-modal="true" aria-labelledby="cc-scale-sheet-title">' +
            '<div class="cc-folder-manage-grabber" aria-hidden="true"></div>' +
            '<div class="cc-scale-sheet-heading">' +
                '<h3 id="cc-scale-sheet-title">スケールを選択</h3>' +
                '<button type="button" class="cc-scale-sheet-close" data-scale-sheet-action="close" aria-label="スケール選択を閉じる">閉じる</button>' +
            '</div>' +
            '<div class="cc-scale-sheet-options" role="radiogroup" aria-labelledby="cc-scale-sheet-title">';
        SCALE_SELECTION_ORDER.forEach(function (scaleType) {
            var selected = scaleType === selectedScale;
            html += '<button type="button" class="cc-scale-sheet-choice' + (selected ? ' is-selected' : '') + '" data-scale-type="' + scaleType + '" role="radio" aria-checked="' + (selected ? 'true' : 'false') + '">' + scaleLabel(scaleType) + '</button>';
        });
        return html + '</div></div>';
    }

    function ensureScaleSheet() {
        if (scaleSheet) {
            return scaleSheet;
        }
        scaleSheet = document.createElement('div');
        // 本棚の既存bottom sheet基盤・配色・focus trapの流儀に合わせる。
        scaleSheet.className = 'cc-folder-manage-overlay cc-folder-manage-overlay--hidden cc-scale-sheet-overlay';
        scaleSheet.addEventListener('click', function (event) {
            if (event.target === scaleSheet) {
                closeScaleSheet(true);
            }
        });
        scaleSheet.addEventListener('keydown', function (event) {
            var dialog = scaleSheet.querySelector('[role="dialog"]');
            if (focusTrap()) {
                focusTrap().trapFocus(dialog || scaleSheet, event);
            }
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && scaleSheet && !scaleSheet.classList.contains('cc-folder-manage-overlay--hidden')) {
                closeScaleSheet(true);
            }
        });
        document.body.appendChild(scaleSheet);
        return scaleSheet;
    }

    function closeScaleSheet(returnFocus) {
        if (!scaleSheet) {
            return;
        }
        var selector = document.getElementById('cc-scale-selector');
        if (selector) {
            selector.setAttribute('aria-expanded', 'false');
        }
        scaleSheet.classList.add('cc-folder-manage-overlay--hidden');
        scaleSheet.innerHTML = '';
        var opener = scaleSheetReturnFocus;
        scaleSheetReturnFocus = null;
        if (returnFocus && focusTrap()) {
            focusTrap().restoreFocus(opener, selector);
        } else if (returnFocus && opener && typeof opener.focus === 'function') {
            opener.focus();
        }
    }

    function bindScaleSheet() {
        if (!scaleSheet) {
            return;
        }
        Array.prototype.forEach.call(scaleSheet.querySelectorAll('[data-scale-type]'), function (button) {
            button.addEventListener('click', function () {
                if (setScaleType(button.getAttribute('data-scale-type'))) {
                    closeScaleSheet(true);
                }
            });
        });
        var closeButton = scaleSheet.querySelector('[data-scale-sheet-action="close"]');
        if (closeButton) {
            closeButton.addEventListener('click', function () {
                closeScaleSheet(true);
            });
        }
    }

    function openScaleSheet(trigger) {
        var sheet = ensureScaleSheet();
        scaleSheetReturnFocus = trigger || document.getElementById('cc-scale-selector');
        if (scaleSheetReturnFocus) {
            scaleSheetReturnFocus.setAttribute('aria-expanded', 'true');
        }
        sheet.innerHTML = scaleSheetChoicesHtml();
        sheet.classList.remove('cc-folder-manage-overlay--hidden');
        bindScaleSheet();
        var selected = sheet.querySelector('[data-scale-type="' + getSettings().scaleType + '"]');
        if (selected && typeof selected.focus === 'function') {
            selected.focus();
        } else if (focusTrap()) {
            focusTrap().focusFirst(sheet.querySelector('[role="dialog"]') || sheet);
        }
    }

    function setToneMode(toneMode) {
        if (getSettings().chordToneMode === toneMode) {
            return;
        }
        resetCagedNotice();
        saveSetting({ chordToneMode: toneMode });
        updateSegments();
        renderChordGrid();
        renderFretboard();
        renderDetail();
    }

    function updateKeyOptions() {
        var theory = getTheory();
        var settings = getSettings();
        var select = document.getElementById('cc-key-select');
        var names = scaleDefinition(settings.scaleType).tonicFamily === 'minor'
            ? theory.MINOR_KEY_OPTIONS
            : theory.MAJOR_KEY_OPTIONS;
        select.innerHTML = '';
        var pc;
        for (pc = 0; pc < 12; pc++) {
            var option = document.createElement('option');
            option.value = String(pc);
            option.textContent = names[pc];
            select.appendChild(option);
        }
        select.value = String(settings.selectedKey);
    }

    function updateSegments() {
        var settings = getSettings();
        var pairs = [
            ['cc-tone-3', settings.chordToneMode === '3'],
            ['cc-tone-7', settings.chordToneMode === '7']
        ];
        pairs.forEach(function (pair) {
            var el = document.getElementById(pair[0]);
            if (el) {
                el.classList.toggle('cc-segment-btn--active', pair[1]);
            }
        });
        updateScaleSelector();
        updateFbSegments();
    }

    function updateScaleSelector() {
        var selector = document.getElementById('cc-scale-selector');
        var value = document.getElementById('cc-scale-selector-value');
        var label = scaleLabel(getSettings().scaleType);
        if (value) {
            value.textContent = label;
        }
        if (selector) {
            selector.setAttribute('aria-label', 'スケール: ' + label);
        }
    }

    function updateFbSegments() {
        var mode = getSettings().fretboardDisplayMode;
        ['note', 'solfege', 'degree', 'finger'].forEach(function (m) {
            var el = document.getElementById('cc-fbmode-' + m);
            if (el) {
                el.classList.toggle('cc-segment-btn--active', mode === m);
            }
        });
    }

    function fretWindow() {
        return getSettings().highFretMode
            ? { start: 12, end: 25 }
            : { start: 0, end: 13 };
    }

    function updateHighFretToggle() {
        var toggle = document.getElementById('cc-high-fret-toggle');
        if (!toggle) return;
        var enabled = getSettings().highFretMode === true;
        toggle.classList.toggle('cc-switch--on', enabled);
        toggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
    }

    function roleForInterval(interval) {
        if (interval === 0) return 'root';
        if (interval === 3 || interval === 4) return 'third';
        if (interval === 6 || interval === 7 || interval === 8) return 'fifth';
        if (interval === 9 || interval === 10 || interval === 11) return 'seventh';
        return 'other';
    }

    function computeChordToneMarkers(chord) {
        var theory = getTheory();
        var useFlats = chordUseFlats(chord);
        var mode = getSettings().fretboardDisplayMode;
        var markers = [];
        var range = fretWindow();
        var s;
        var f;
        for (s = 1; s <= 6; s++) {
            var openPc = theory.OPEN_STRINGS[6 - s];
            for (f = range.start; f <= range.end; f++) {
                var pc = (openPc + f) % 12;
                var idx = chord.notePcs.indexOf(pc);
                if (idx === -1) {
                    continue;
                }
                var interval = chord.intervals[idx];
                var label;
                if (mode === 'solfege') {
                    label = theory.solfegeName(pc, useFlats);
                } else if (mode === 'degree') {
                    label = chordDegreeLabel(chord, idx);
                } else {
                    label = chordNoteName(chord, idx, pc, useFlats);
                }
                markers.push({
                    string: s,
                    fret: f,
                    label: label,
                    role: roleForInterval(interval)
                });
            }
        }
        return markers;
    }

    var FINGER_LABELS = { T: '親', 1: '人', 2: '中', 3: '薬', 4: '小' };

    function selectedChord() {
        if (getState().exploreCustomChord) {
            return getState().exploreCustomChord;
        }
        var selectedIndex = getState().exploreSelectedChordIndex;
        return (selectedIndex === null || selectedIndex === undefined) ? null : getChords()[selectedIndex];
    }

    /** 表示中コードの♭/♯表記（任意コードはコード固有、ダイアトニックはキー基準） */
    function chordUseFlats(chord) {
        if (chord && chord.source === 'custom') {
            return chord.useFlats;
        }
        var settings = getSettings();
        return getTheory().keyUsesFlats(settings.selectedKey, settings.scaleType);
    }

    /** interval のラベル（任意コードはテンション表記を保持） */
    function chordDegreeLabel(chord, noteIndex) {
        if (chord.degreeLabelsList) {
            return chord.degreeLabelsList[noteIndex];
        }
        return getTheory().degreeLabelsForQuality(chord.qualityKey, chord.intervals)[noteIndex];
    }

    /** ダイアトニックはscale spellingを使い、任意コードは従来の♭/♯判定を維持する。 */
    function chordNoteName(chord, noteIndex, pc, useFlats) {
        if (chord && chord.source !== 'custom' && chord.noteNames && chord.noteNames[noteIndex]) {
            return chord.noteNames[noteIndex];
        }
        return getTheory().noteName(pc, useFlats);
    }

    /** 選択中の型のフォーム。未選択・未対応時は null */
    function currentForm() {
        var shape = getState().exploreShape;
        var chord = selectedChord();
        if (!shape || !chord) {
            return null;
        }
        var range = fretWindow();
        var form = window.ChordCruise.caged.getForm(shape, chord.qualityKey, chord.rootPc, range.end, range.start);
        return form.available ? form : null;
    }

    function markerLabelFor(chord, pc, interval, finger, fingeringWarning, useFlats) {
        var theory = getTheory();
        var mode = getSettings().fretboardDisplayMode;
        if (mode === 'finger') {
            if (finger != null) return FINGER_LABELS[finger] || '';
            return fingeringWarning ? '⚠' : '';
        }
        if (mode === 'solfege') {
            return theory.solfegeName(pc, useFlats);
        }
        if (mode === 'degree') {
            var intervalIndex = chord.intervals.indexOf(interval);
            var qualityLabels = theory.degreeLabelsForQuality(chord.qualityKey, chord.intervals);
            return intervalIndex !== -1 ? qualityLabels[intervalIndex] : theory.degreeLabels([interval])[0];
        }
        var noteIndex = chord.intervals.indexOf(interval);
        return chordNoteName(chord, noteIndex, pc, useFlats);
    }

    function computeFormMarkers(chord, form) {
        var theory = getTheory();
        var useFlats = chordUseFlats(chord);
        return form.notes.map(function (note) {
            var openPc = theory.OPEN_STRINGS[6 - note.string];
            var pc = (openPc + note.fret) % 12;
            return {
                string: note.string,
                fret: note.fret,
                label: markerLabelFor(chord, pc, note.interval, note.finger, note.fingeringWarning, useFlats),
                role: roleForInterval(note.interval),
                fingeringWarning: getSettings().fretboardDisplayMode === 'finger' && note.fingeringWarning === true
            };
        });
    }

    function bassOverlayMarkerLabel(chord, overlay, useFlats) {
        var theory = getTheory();
        var mode = getSettings().fretboardDisplayMode;
        if (mode === 'finger') return '';
        if (mode === 'solfege') return theory.solfegeName(overlay.pc, useFlats);
        if (mode === 'degree') {
            return overlay.chordToneIndex !== null
                ? chordDegreeLabel(chord, overlay.chordToneIndex)
                : theory.degreeLabels([overlay.interval])[0];
        }
        return chordNoteName(chord, overlay.chordToneIndex, overlay.pc, useFlats);
    }

    /**
     * FORM markerを変更せずbass overlayを重ねる。重複slotは既存markerに金枠フラグだけを付与する。
     * 将来tension overlayも同じoverlayNotes配列をmergeできるよう、typeを保持する。
     */
    function mergeBassOverlayMarkers(chord, markers, range) {
        if (!chord || chord.bassPc == null) return markers;
        var overlayNotes = window.ChordCruise.chordModel.bassOverlayNotes({
            bassPc: chord.bassPc,
            rootPc: chord.rootPc,
            intervals: chord.intervals,
            startFret: range.start,
            endFret: range.end,
            targetStrings: [6, 5, 4]
        });
        var existingBySlot = {};
        markers.forEach(function (marker) {
            existingBySlot[marker.string + ':' + marker.fret] = marker;
        });
        var useFlats = chordUseFlats(chord);
        overlayNotes.forEach(function (overlay) {
            var key = overlay.string + ':' + overlay.fret;
            if (existingBySlot[key]) {
                existingBySlot[key].isBassCandidate = true;
                existingBySlot[key].overlayType = overlay.type;
                return;
            }
            var marker = {
                string: overlay.string,
                fret: overlay.fret,
                label: bassOverlayMarkerLabel(chord, overlay, useFlats),
                role: roleForInterval(overlay.interval),
                isOverlay: true,
                overlayType: overlay.type,
                isBassCandidate: true,
                finger: null,
                fingeringWarning: false
            };
            markers.push(marker);
            existingBySlot[key] = marker;
        });
        return markers;
    }

    function updateCagedButtons() {
        var row = document.getElementById('cc-caged-row');
        if (!row) {
            return;
        }
        var chord = selectedChord();
        var activeShape = getState().exploreShape || '';
        var range = fretWindow();
        var featured = chord
            ? window.ChordCruise.caged.getCommonForm(chord.qualityKey, chord.rootPc, range.end, range.start)
            : null;
        Array.prototype.forEach.call(row.querySelectorAll('.cc-caged-btn'), function (btn) {
            var shape = btn.dataset.shape;
            btn.classList.toggle('cc-caged-btn--active', shape === activeShape);
            var na = false;
            if (shape && chord) {
                na = !window.ChordCruise.caged.getForm(shape, chord.qualityKey, chord.rootPc, range.end, range.start).available;
            }
            btn.classList.toggle('cc-caged-btn--na', na);
            var isFeatured = !!(shape && featured && featured.shape === shape && !na);
            btn.classList.toggle('cc-caged-btn--featured', isFeatured);
            btn.classList.toggle('cc-caged-btn--recommended', isFeatured && featured.source === 'recommended');
            if (isFeatured) {
                btn.title = shape + '型：' + featured.label;
            } else {
                btn.removeAttribute('title');
            }
        });
    }

    function renderFretboard() {
        var host = document.getElementById('cc-fretboard-host');
        if (!host) {
            return;
        }
        var fb = window.ChordCruise.ui.fretboard;
        var caged = window.ChordCruise.caged;
        var chord = selectedChord();
        var shape = getState().exploreShape;
        var prevScroll = fb.getScrollLeft(host);
        var hint = '';
        var markers = [];
        var barres = [];
        var mutedStrings = [];
        var rangeHighlight = null;
        var scrollToFret = null;
        var form = null;
        var range = fretWindow();
        var noticeType = '';
        var noticeText = '';
        var rangeNoticeText = '';
        var chordName = document.getElementById('cc-explore-fretboard-name');

        if (chordName) {
            chordName.textContent = chord ? chord.symbol : '';
            chordName.title = chord ? chord.symbol : '';
            chordName.hidden = !chord;
        }

        if (!chord) {
            hint = 'コードを選ぶと構成音が指板に表示されます。';
        } else if (shape) {
            var result = caged.getForm(shape, chord.qualityKey, chord.rootPc, range.end, range.start);
            if (result.available) {
                form = result;
                var displayRange = form.displayRange || form.fretRange;
                markers = computeFormMarkers(chord, form);
                barres = caged.detectBarres(form.notes);
                mutedStrings = form.mutedStrings;
                rangeHighlight = {
                    minFret: displayRange.min,
                    maxFret: displayRange.max,
                    includesOpen: displayRange.includesOpen
                };
                // 開放フォームだけは0F側を初期表示し、ムーバブルフォームは従来どおり中央寄せする。
                scrollToFret = displayRange.includesOpen
                    ? displayRange.viewportStart
                    : Math.round((form.fretRange.min + form.fretRange.max) / 2);
                hint = shape + '型 ' + chord.symbol + '（' + caged.formatFretRange(displayRange) + '）';
                if (form.warning) {
                    noticeType = form.playability;
                    noticeText = form.warning;
                }
                if (form.hasOutOfRangeNotes) {
                    rangeNoticeText = 'このフォームには表示範囲外の音があるため、表示できる音だけを表示しています。';
                }
            } else if (result.reason === 'quality') {
                markers = computeChordToneMarkers(chord);
                hint = (chord.source === 'custom' && !chord.qualityKey)
                    ? 'このコードは現在、全体表示のみ対応しています。'
                    : shape + '型の' + chord.symbol + 'は実用フォーム未収録のため、全体表示にしています。';
                noticeType = 'unavailable';
                noticeText = (chord.source === 'custom' && !chord.qualityKey)
                    ? 'このコードは品質が辞書と完全一致しないため、型フォームを表示していません。'
                    : (result.message || '一般的な運指では成立しないため、この型は表示していません。');
            } else {
                markers = computeChordToneMarkers(chord);
                hint = shape + '型の' + chord.symbol + 'は表示範囲' + range.start + '〜' + range.end + 'Fに収まらないため、全体表示にしています。';
                noticeType = 'unavailable';
                noticeText = 'このフォームは現在の表示範囲に収まらないため、全体表示にしています。';
            }
        } else {
            markers = computeChordToneMarkers(chord);
            if (chord) {
                hint = 'CAGED型を選ぶと、現在表示中のフォームを保存できます。';
            }
        }

        // 運指モードのままフォームが無くなった場合はCDE表示へ戻す
        if (getSettings().fretboardDisplayMode === 'finger' && !form) {
            saveSetting({ fretboardDisplayMode: 'note' });
            updateFbSegments();
            if (chord && !shape) {
                markers = computeChordToneMarkers(chord);
            } else if (form) {
                markers = computeFormMarkers(chord, form);
            }
        }

        if (chord && chord.bassPc != null) {
            markers = mergeBassOverlayMarkers(chord, markers, range);
            hint += getSettings().fretboardDisplayMode === 'finger'
                ? ' 金枠は追加ベース音の候補です。運指は表示していません。押さえやすい位置を選び、その音より低い弦は鳴らさないでください。'
                : ' 金枠の音を最低音として使います。選んだ音より低い弦は鳴らしません。';
            hint += ' 分数コードの保存は今後対応予定です。';
        }

        var fingerBtn = document.getElementById('cc-fbmode-finger');
        if (fingerBtn) {
            fingerBtn.classList.toggle('cc-segment-btn--disabled', !form);
        }

        var saveButton = document.getElementById('cc-save-form-btn');
        if (saveButton) {
            var canSaveForm = !!form && !(chord && chord.bassPc != null);
            saveButton.disabled = !canSaveForm;
            saveButton.title = canSaveForm
                ? '現在表示中のCAGEDフォームを保存前編集で確認します'
                : (chord && chord.bassPc != null
                    ? '分数コードの保存は今後対応予定です'
                    : (chord ? 'CAGED型を選ぶと保存できます' : 'コードを選ぶと保存できます'));
        }

        fb.render(host, {
            startFret: range.start,
            endFret: range.end,
            markers: markers,
            barres: barres,
            mutedStrings: mutedStrings,
            rangeHighlight: rangeHighlight,
            scrollToFret: scrollToFret,
            preserveScroll: (form && scrollToFret !== null) ? null : (typeof prevScroll === 'number' ? prevScroll : null),
            markerLabelSize: getSettings().fretboardMarkerLabelSize
        });
        setFbHint(hint);
        setCagedNotices(noticeType, noticeText, rangeNoticeText);
        updateHighFretToggle();
        updateCagedButtons();
    }

    function getChords() {
        var settings = getSettings();
        return getTheory().getDiatonicChords(settings.selectedKey, settings.scaleType, settings.chordToneMode);
    }

    function renderChordGrid() {
        var grid = document.getElementById('cc-chord-grid');
        var selectedIndex = getState().exploreCustomChord ? null : getState().exploreSelectedChordIndex;
        grid.innerHTML = '';
        getChords().forEach(function (chord) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cc-chord-btn' + (chord.index === selectedIndex ? ' cc-chord-btn--active' : '');
            btn.dataset.index = String(chord.index);

            var roman = document.createElement('span');
            roman.className = 'cc-chord-btn-roman';
            roman.textContent = chord.roman;

            var symbol = document.createElement('span');
            symbol.className = 'cc-chord-btn-symbol';
            symbol.textContent = chord.symbol;

            btn.appendChild(roman);
            btn.appendChild(symbol);
            grid.appendChild(btn);
        });
    }

    function renderDetail() {
        var detail = document.getElementById('cc-chord-detail');
        if (!detail) {
            return;
        }
        var chord = selectedChord();
        detail.innerHTML = '';

        if (!chord) {
            var empty = document.createElement('p');
            empty.className = 'cc-detail-empty';
            empty.textContent = 'コードをタップすると構成音が表示されます。';
            detail.appendChild(empty);
            return;
        }

        var head = document.createElement('div');
        head.className = 'cc-detail-head';

        var symbol = document.createElement('span');
        symbol.className = 'cc-detail-symbol';
        symbol.textContent = chord.symbol;

        var roman = document.createElement('span');
        roman.className = 'cc-detail-roman';
        roman.textContent = chord.source === 'custom' ? '任意コード' : chord.roman;

        head.appendChild(symbol);
        head.appendChild(roman);
        detail.appendChild(head);

        var useFlats = chordUseFlats(chord);
        var noteNames = chord.noteNames || chord.notePcs.map(function (pc) {
            return getTheory().noteName(pc, useFlats);
        });
        var degrees = chord.notePcs.map(function (pc, idx) {
            return chordDegreeLabel(chord, idx);
        });

        detail.appendChild(buildDetailRow('構成音', noteNames));
        detail.appendChild(buildDetailRow('度数', degrees));

        // ダイアトニックコードには役割・雰囲気・よく行くコードの説明を出す
        if (chord.source !== 'custom') {
            var settings = getSettings();
            var info = window.ChordCruise.chordInfo.getInfo(settings.scaleType, chord.index);
            detail.appendChild(buildDetailTextRow('役割', chord.roman));
            if (info) {
                detail.appendChild(buildDetailTextRow('雰囲気', info.mood));
                var chords = getChords();
                var row = document.createElement('div');
                row.className = 'cc-detail-row';
                var label = document.createElement('span');
                label.className = 'cc-detail-label';
                label.textContent = 'よく行くコード';
                row.appendChild(label);
                var valuesEl = document.createElement('span');
                valuesEl.className = 'cc-detail-values';
                info.goesTo.forEach(function (degreeIndex) {
                    var target = chords[degreeIndex];
                    if (!target) return;
                    var chip = document.createElement('button');
                    chip.type = 'button';
                    chip.className = 'cc-note-chip cc-note-chip--link';
                    chip.textContent = target.symbol;
                    chip.addEventListener('click', function () {
                        getState().exploreCustomChord = null;
                        getState().exploreSelectedChordIndex = degreeIndex;
                        resetCagedNotice();
                        renderChordGrid();
                        renderFretboard();
                        renderDetail();
                    });
                    valuesEl.appendChild(chip);
                });
                row.appendChild(valuesEl);
                detail.appendChild(row);
            }
        }
    }

    function buildDetailTextRow(labelText, text) {
        var row = document.createElement('div');
        row.className = 'cc-detail-row';
        var label = document.createElement('span');
        label.className = 'cc-detail-label';
        label.textContent = labelText;
        row.appendChild(label);
        var value = document.createElement('span');
        value.className = 'cc-detail-text';
        value.textContent = text;
        row.appendChild(value);
        return row;
    }

    function buildDetailRow(labelText, values) {
        var row = document.createElement('div');
        row.className = 'cc-detail-row';

        var label = document.createElement('span');
        label.className = 'cc-detail-label';
        label.textContent = labelText;
        row.appendChild(label);

        var valuesEl = document.createElement('span');
        valuesEl.className = 'cc-detail-values';
        values.forEach(function (value) {
            var chip = document.createElement('span');
            chip.className = 'cc-note-chip';
            chip.textContent = value;
            valuesEl.appendChild(chip);
        });
        row.appendChild(valuesEl);

        return row;
    }

    function render() {
        var section = document.getElementById('cc-screen-explore');
        if (!section) {
            return;
        }
        var state = getState();
        if (state.exploreSelectedChordIndex === undefined) {
            state.exploreSelectedChordIndex = null;
        }
        buildSkeleton(section);
        updateKeyOptions();
        updateSegments();
        renderChordGrid();
        renderFretboard();
        renderDetail();
    }

    window.ChordCruise.ui.explore = {
        render: render,
        // 他画面からも同じ保存成功後反映の経路を利用できるようにする。
        setScaleType: setScaleType
    };
})();
