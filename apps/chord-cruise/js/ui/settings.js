(function () {
    'use strict';

    var VALID_SIZES = ['small', 'medium', 'large', 'xlarge'];
    var VALID_HIGHLIGHT_MODES = ['all', 'position', 'custom'];
    var DEFAULT_HIGHLIGHTED_FRETS = [0, 3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
    // この右上設定画面で実際に変更できる表示設定だけを対象にする。
    var DISPLAY_SETTING_KEYS = [
        'chordNameSize',
        'fretNumberSize',
        'fretboardMarkerLabelSize',
        'fretNumberHighlightMode',
        'highlightedFrets',
        'fretboardDisplayMode'
    ];
    var overlayEl = null;
    var openBtn = null;
    var closeBtn = null;
    var previousFocus = null;
    var reloadInProgress = false;

    function normalizeSize(value) {
        return VALID_SIZES.indexOf(value) !== -1 ? value : 'medium';
    }

    function normalizeChordNameSize(value) {
        return VALID_SIZES.indexOf(value) !== -1 ? value : 'medium';
    }

    function normalizeHighlightMode(value) {
        return VALID_HIGHLIGHT_MODES.indexOf(value) !== -1 ? value : 'all';
    }

    function normalizeHighlightedFrets(value) {
        if (!Array.isArray(value)) return DEFAULT_HIGHLIGHTED_FRETS.slice();
        var seen = {};
        return value.filter(function (fret) {
            if (typeof fret !== 'number' || Math.floor(fret) !== fret || fret < 0 || fret > 25 || seen[fret]) {
                return false;
            }
            seen[fret] = true;
            return true;
        }).sort(function (a, b) { return a - b; });
    }

    function getSettings() {
        return window.ChordCruise.state.settings;
    }

    function buildReloadUrl(href, timestamp) {
        var url = new URL(href);
        url.searchParams.set('_r', String(timestamp));
        return url.toString();
    }

    function reloadAppWithCacheBust() {
        if (reloadInProgress) return;
        reloadInProgress = true;
        Array.prototype.forEach.call(document.querySelectorAll('.cc-refresh-app'), function (button) {
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            button.textContent = '更新中…';
        });
        try {
            window.location.replace(buildReloadUrl(window.location.href, Date.now()));
        } catch (err) {
            window.location.reload();
        }
    }

    function applyVersionDisplay() {
        Array.prototype.forEach.call(document.querySelectorAll('.cc-app-version-display'), function (display) {
            display.textContent = 'Ver ' + (window.CHORD_CRUISE_APP_VERSION || '');
        });
    }

    function applyFretNumberSize(value) {
        var size = normalizeSize(value);
        document.documentElement.setAttribute('data-cc-fret-number-size', size);
        return size;
    }

    function applyChordNameSize(value) {
        var size = normalizeChordNameSize(value);
        document.documentElement.setAttribute('data-cc-chord-name-size', size);
        return size;
    }

    function updateControls() {
        if (!overlayEl) return;
        var settings = getSettings();
        var activeChordNameSize = normalizeChordNameSize(settings.chordNameSize);
        Array.prototype.forEach.call(overlayEl.querySelectorAll('[data-chord-name-size]'), function (btn) {
            var selected = btn.getAttribute('data-chord-name-size') === activeChordNameSize;
            btn.classList.toggle('cc-settings-choice--active', selected);
            btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        Array.prototype.forEach.call(overlayEl.querySelectorAll('[data-preview-display-mode]'), function (btn) {
            var selected = btn.getAttribute('data-preview-display-mode') === settings.fretboardDisplayMode;
            btn.classList.toggle('cc-segment-btn--active', selected);
            btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        var active = normalizeSize(settings.fretNumberSize);
        Array.prototype.forEach.call(overlayEl.querySelectorAll('[data-fret-number-size]'), function (btn) {
            var selected = btn.getAttribute('data-fret-number-size') === active;
            btn.classList.toggle('cc-settings-choice--active', selected);
            btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        var activeMarkerLabelSize = normalizeSize(settings.fretboardMarkerLabelSize);
        Array.prototype.forEach.call(overlayEl.querySelectorAll('[data-fretboard-marker-label-size]'), function (btn) {
            var selected = btn.getAttribute('data-fretboard-marker-label-size') === activeMarkerLabelSize;
            btn.classList.toggle('cc-settings-choice--active', selected);
            btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        var activeMode = normalizeHighlightMode(settings.fretNumberHighlightMode);
        Array.prototype.forEach.call(overlayEl.querySelectorAll('[data-fret-highlight-mode]'), function (btn) {
            var selected = btn.getAttribute('data-fret-highlight-mode') === activeMode;
            btn.classList.toggle('cc-settings-choice--active', selected);
            btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        var selectedFrets = normalizeHighlightedFrets(settings.highlightedFrets);
        Array.prototype.forEach.call(overlayEl.querySelectorAll('[data-highlight-fret]'), function (btn) {
            var fret = parseInt(btn.getAttribute('data-highlight-fret'), 10);
            var selected = selectedFrets.indexOf(fret) !== -1;
            btn.classList.toggle('cc-settings-fret-btn--active', selected);
            btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        var customWrap = document.getElementById('cc-settings-custom-frets');
        if (customWrap) customWrap.hidden = activeMode !== 'custom';
    }

    function setFretNumberSize(value) {
        var size = applyFretNumberSize(value);
        getSettings().fretNumberSize = size;
        window.ChordCruise.storage.saveSettings({ fretNumberSize: size });
        updateControls();
        notifyFretboardChange();
    }

    function setChordNameSize(value) {
        var size = applyChordNameSize(value);
        getSettings().chordNameSize = size;
        window.ChordCruise.storage.saveSettings({ chordNameSize: size });
        updateControls();
        notifyFretboardChange();
    }

    function setFretboardMarkerLabelSize(value) {
        var size = normalizeSize(value);
        getSettings().fretboardMarkerLabelSize = size;
        window.ChordCruise.storage.saveSettings({ fretboardMarkerLabelSize: size });
        updateControls();
        notifyFretboardChange();
    }

    function setPreviewDisplayMode(value) {
        var mode = ['note', 'solfege', 'degree', 'finger'].indexOf(value) !== -1 ? value : 'note';
        getSettings().fretboardDisplayMode = mode;
        window.ChordCruise.storage.saveSettings({ fretboardDisplayMode: mode });
        updateControls();
        notifyFretboardChange();
    }

    function notifyFretboardChange() {
        var event;
        if (typeof window.CustomEvent === 'function') {
            event = new window.CustomEvent('chordcruise:fretboard-settings-change');
        } else {
            event = document.createEvent('CustomEvent');
            event.initCustomEvent('chordcruise:fretboard-settings-change', false, false, null);
        }
        document.dispatchEvent(event);
    }

    function setHighlightMode(value) {
        var mode = normalizeHighlightMode(value);
        getSettings().fretNumberHighlightMode = mode;
        window.ChordCruise.storage.saveSettings({ fretNumberHighlightMode: mode });
        updateControls();
        notifyFretboardChange();
    }

    function toggleHighlightedFret(value) {
        var fret = parseInt(value, 10);
        if (fret < 0 || fret > 25 || Math.floor(fret) !== fret) return;
        var selected = normalizeHighlightedFrets(getSettings().highlightedFrets);
        var index = selected.indexOf(fret);
        if (index === -1) selected.push(fret);
        else selected.splice(index, 1);
        selected.sort(function (a, b) { return a - b; });
        getSettings().highlightedFrets = selected;
        window.ChordCruise.storage.saveSettings({ highlightedFrets: selected });
        updateControls();
        notifyFretboardChange();
    }

    function toggleDescription(button) {
        var id = button.getAttribute('data-settings-description');
        var detail = id ? document.getElementById('cc-settings-description-' + id) : null;
        if (!detail) return;
        var expanded = button.getAttribute('aria-expanded') === 'true';
        detail.hidden = expanded;
        button.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        button.textContent = expanded ? '＋ 説明' : '− 説明';
    }

    function setResetConfirmationVisible(visible) {
        var panel = document.getElementById('cc-settings-reset-confirm');
        var trigger = document.getElementById('cc-settings-reset-trigger');
        if (!panel || !trigger) return false;
        panel.hidden = !visible;
        trigger.setAttribute('aria-expanded', visible ? 'true' : 'false');
        return true;
    }

    function showResetResult(message, type) {
        if (window.ChordCruise.ui.toast) {
            window.ChordCruise.ui.toast.show(message, { type: type || 'success' });
        }
    }

    function resetDisplaySettings() {
        var storage = window.ChordCruise.storage;
        var defaults = storage && storage.getSettingsDefaults ? storage.getSettingsDefaults() : null;
        if (!defaults) {
            showResetResult('表示設定を保存できませんでした', 'error');
            return false;
        }
        var next = {};
        DISPLAY_SETTING_KEYS.forEach(function (key) {
            next[key] = Array.isArray(defaults[key]) ? defaults[key].slice() : defaults[key];
        });

        // 1回の部分保存で、右上設定の対象キー以外は保持する。
        if (storage.saveSettings(next) !== true) {
            showResetResult('表示設定を保存できませんでした', 'error');
            return false;
        }

        DISPLAY_SETTING_KEYS.forEach(function (key) {
            getSettings()[key] = Array.isArray(next[key]) ? next[key].slice() : next[key];
        });
        getSettings().fretNumberSize = applyFretNumberSize(getSettings().fretNumberSize);
        getSettings().chordNameSize = applyChordNameSize(getSettings().chordNameSize);
        getSettings().fretboardMarkerLabelSize = normalizeSize(getSettings().fretboardMarkerLabelSize);
        updateControls();
        setResetConfirmationVisible(false);
        notifyFretboardChange();
        showResetResult('表示設定をデフォルトに戻しました');
        return true;
    }

    function buildCustomFretGrid() {
        var grid = document.getElementById('cc-settings-custom-grid');
        if (!grid || grid.children.length) return;
        var fret;
        for (fret = 0; fret <= 25; fret++) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cc-settings-fret-btn';
            btn.setAttribute('data-highlight-fret', String(fret));
            btn.setAttribute('aria-pressed', 'false');
            btn.textContent = String(fret);
            grid.appendChild(btn);
        }
    }

    function previewLabel(note, chord, useFlats) {
        var mode = getSettings().fretboardDisplayMode;
        var theory = window.ChordCruise.theory;
        var openPc = theory.OPEN_STRINGS[6 - note.string];
        var pc = (openPc + note.fret) % 12;
        if (mode === 'solfege') return theory.solfegeName(pc, useFlats);
        if (mode === 'degree') return theory.degreeLabels([note.interval])[0];
        if (mode === 'finger') {
            if (note.finger === 'T') return '親';
            if (note.finger != null) return { 1: '人', 2: '中', 3: '薬', 4: '小' }[note.finger] || '';
            return note.fingeringWarning ? '⚠' : '';
        }
        return theory.noteName(pc, useFlats);
    }

    function previewRole(interval) {
        if (interval === 0) return 'root';
        if (interval === 3 || interval === 4) return 'third';
        if (interval === 6 || interval === 7 || interval === 8) return 'fifth';
        if (interval === 9 || interval === 10 || interval === 11) return 'seventh';
        return 'other';
    }

    function renderPreview() {
        var host = document.getElementById('cc-settings-fretboard-preview');
        if (!host || !window.ChordCruise.caged || !window.ChordCruise.ui.fretboard) return;
        var theory = window.ChordCruise.theory;
        var chord = theory.getDiatonicChords(0, 'major', '3')[0];
        var form = window.ChordCruise.caged.getForm('C', chord.qualityKey, chord.rootPc, 13, 0);
        if (!form || !form.available) return;
        var displayRange = form.displayRange || form.fretRange;
        var useFlats = theory.keyUsesFlats(0, 'major');
        window.ChordCruise.ui.fretboard.render(host, {
            startFret: displayRange.viewportStart,
            endFret: displayRange.viewportEnd,
            markers: form.notes.map(function (note) {
                return {
                    string: note.string,
                    fret: note.fret,
                    label: previewLabel(note, chord, useFlats),
                    role: previewRole(note.interval),
                    fingeringWarning: getSettings().fretboardDisplayMode === 'finger' && note.fingeringWarning === true
                };
            }),
            barres: window.ChordCruise.caged.detectBarres(form.notes),
            mutedStrings: form.mutedStrings,
            rangeHighlight: {
                minFret: displayRange.min,
                maxFret: displayRange.max,
                includesOpen: displayRange.includesOpen
            },
            markerLabelSize: getSettings().fretboardMarkerLabelSize
        });
    }

    function open() {
        if (!overlayEl) return;
        previousFocus = document.activeElement;
        setResetConfirmationVisible(false);
        updateControls();
        renderPreview();
        overlayEl.classList.remove('cc-settings-overlay--hidden');
        overlayEl.setAttribute('aria-hidden', 'false');
        document.body.classList.add('cc-settings-open');
        if (openBtn) openBtn.classList.add('cc-settings-corner-btn--hidden');
        if (closeBtn) closeBtn.focus();
    }

    function close() {
        if (!overlayEl) return;
        setResetConfirmationVisible(false);
        overlayEl.classList.add('cc-settings-overlay--hidden');
        overlayEl.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('cc-settings-open');
        if (openBtn) openBtn.classList.remove('cc-settings-corner-btn--hidden');
        if (previousFocus && typeof previousFocus.focus === 'function') {
            previousFocus.focus();
        } else if (openBtn) {
            openBtn.focus();
        }
    }

    function init() {
        overlayEl = document.getElementById('cc-settings-overlay');
        openBtn = document.getElementById('cc-settings-btn');
        closeBtn = document.getElementById('cc-settings-close');
        buildCustomFretGrid();
        applyVersionDisplay();

        var initialSize = applyFretNumberSize(getSettings().fretNumberSize);
        getSettings().fretNumberSize = initialSize;
        var initialChordNameSize = applyChordNameSize(getSettings().chordNameSize);
        getSettings().chordNameSize = initialChordNameSize;
        getSettings().fretboardMarkerLabelSize = normalizeSize(getSettings().fretboardMarkerLabelSize);
        updateControls();

        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        Array.prototype.forEach.call(document.querySelectorAll('.cc-refresh-app'), function (refreshBtn) {
            refreshBtn.addEventListener('click', reloadAppWithCacheBust);
        });
        if (overlayEl) {
            overlayEl.addEventListener('click', function (event) {
                var choice = event.target.closest('[data-fret-number-size]');
                if (choice) {
                    setFretNumberSize(choice.getAttribute('data-fret-number-size'));
                    return;
                }
                var chordNameChoice = event.target.closest('[data-chord-name-size]');
                if (chordNameChoice) {
                    setChordNameSize(chordNameChoice.getAttribute('data-chord-name-size'));
                    return;
                }
                var markerLabelChoice = event.target.closest('[data-fretboard-marker-label-size]');
                if (markerLabelChoice) {
                    setFretboardMarkerLabelSize(markerLabelChoice.getAttribute('data-fretboard-marker-label-size'));
                    return;
                }
                var previewDisplayMode = event.target.closest('[data-preview-display-mode]');
                if (previewDisplayMode) {
                    setPreviewDisplayMode(previewDisplayMode.getAttribute('data-preview-display-mode'));
                    return;
                }
                var highlightMode = event.target.closest('[data-fret-highlight-mode]');
                if (highlightMode) {
                    setHighlightMode(highlightMode.getAttribute('data-fret-highlight-mode'));
                    return;
                }
                var customFret = event.target.closest('[data-highlight-fret]');
                if (customFret) {
                    toggleHighlightedFret(customFret.getAttribute('data-highlight-fret'));
                    return;
                }
                var descriptionToggle = event.target.closest('[data-settings-description]');
                if (descriptionToggle) {
                    toggleDescription(descriptionToggle);
                    return;
                }
                if (event.target.closest('#cc-settings-reset-trigger')) {
                    if (setResetConfirmationVisible(true)) {
                        var cancelButton = document.querySelector('[data-settings-reset-cancel]');
                        if (cancelButton) cancelButton.focus();
                    }
                    return;
                }
                if (event.target.closest('[data-settings-reset-cancel]')) {
                    setResetConfirmationVisible(false);
                    var resetTrigger = document.getElementById('cc-settings-reset-trigger');
                    if (resetTrigger) resetTrigger.focus();
                    return;
                }
                if (event.target.closest('[data-settings-reset-confirm]')) {
                    resetDisplaySettings();
                    return;
                }
                if (event.target === overlayEl) close();
            });
        }
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && overlayEl &&
                !overlayEl.classList.contains('cc-settings-overlay--hidden')) {
                var confirmation = document.getElementById('cc-settings-reset-confirm');
                if (confirmation && !confirmation.hidden) {
                    setResetConfirmationVisible(false);
                    var resetTrigger = document.getElementById('cc-settings-reset-trigger');
                    if (resetTrigger) resetTrigger.focus();
                    return;
                }
                close();
            }
        });
        document.addEventListener('chordcruise:fretboard-settings-change', renderPreview);
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.ui = window.ChordCruise.ui || {};
    window.ChordCruise.ui.settings = {
        init: init,
        open: open,
        close: close,
        applyFretNumberSize: applyFretNumberSize,
        applyChordNameSize: applyChordNameSize,
        normalizeSize: normalizeSize,
        normalizeChordNameSize: normalizeChordNameSize,
        setPreviewDisplayMode: setPreviewDisplayMode,
        normalizeHighlightMode: normalizeHighlightMode,
        normalizeHighlightedFrets: normalizeHighlightedFrets,
        resetDisplaySettings: resetDisplaySettings,
        buildReloadUrl: buildReloadUrl,
        reloadAppWithCacheBust: reloadAppWithCacheBust
    };
})();
