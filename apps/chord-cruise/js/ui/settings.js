(function () {
    'use strict';

    var VALID_SIZES = ['small', 'medium', 'large'];
    var VALID_HIGHLIGHT_MODES = ['all', 'position', 'custom'];
    var DEFAULT_HIGHLIGHTED_FRETS = [0, 3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
    var overlayEl = null;
    var openBtn = null;
    var closeBtn = null;
    var previousFocus = null;

    function normalizeSize(value) {
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

    function applyFretNumberSize(value) {
        var size = normalizeSize(value);
        document.documentElement.setAttribute('data-cc-fret-number-size', size);
        return size;
    }

    function updateControls() {
        if (!overlayEl) return;
        var settings = getSettings();
        var active = normalizeSize(settings.fretNumberSize);
        Array.prototype.forEach.call(overlayEl.querySelectorAll('[data-fret-number-size]'), function (btn) {
            var selected = btn.getAttribute('data-fret-number-size') === active;
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

    function open() {
        if (!overlayEl) return;
        previousFocus = document.activeElement;
        updateControls();
        overlayEl.classList.remove('cc-settings-overlay--hidden');
        overlayEl.setAttribute('aria-hidden', 'false');
        document.body.classList.add('cc-settings-open');
        if (openBtn) openBtn.classList.add('cc-settings-corner-btn--hidden');
        if (closeBtn) closeBtn.focus();
    }

    function close() {
        if (!overlayEl) return;
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

        var initialSize = applyFretNumberSize(getSettings().fretNumberSize);
        getSettings().fretNumberSize = initialSize;
        updateControls();

        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (overlayEl) {
            overlayEl.addEventListener('click', function (event) {
                var choice = event.target.closest('[data-fret-number-size]');
                if (choice) {
                    setFretNumberSize(choice.getAttribute('data-fret-number-size'));
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
                if (event.target === overlayEl) close();
            });
        }
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && overlayEl &&
                !overlayEl.classList.contains('cc-settings-overlay--hidden')) {
                close();
            }
        });
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.ui = window.ChordCruise.ui || {};
    window.ChordCruise.ui.settings = {
        init: init,
        open: open,
        close: close,
        applyFretNumberSize: applyFretNumberSize,
        normalizeSize: normalizeSize,
        normalizeHighlightMode: normalizeHighlightMode,
        normalizeHighlightedFrets: normalizeHighlightedFrets
    };
})();
