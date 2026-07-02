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
                    '<div class="cc-segment" role="group" aria-label="スケール切替">' +
                        '<button type="button" class="cc-segment-btn" id="cc-mode-major">メジャー</button>' +
                        '<button type="button" class="cc-segment-btn" id="cc-mode-minor">マイナー</button>' +
                    '</div>' +
                '</div>' +
                '<div class="cc-control-row">' +
                    '<div class="cc-segment" role="group" aria-label="和音数切替">' +
                        '<button type="button" class="cc-segment-btn" id="cc-tone-3">3和音</button>' +
                        '<button type="button" class="cc-segment-btn" id="cc-tone-7">4和音</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="cc-card">' +
                '<h3 class="cc-card-heading">ダイアトニックコード</h3>' +
                '<div class="cc-chord-grid" id="cc-chord-grid"></div>' +
            '</div>' +
            '<div class="cc-card" id="cc-chord-detail"></div>';
        section.appendChild(content);
        bindEvents();
    }

    function bindEvents() {
        document.getElementById('cc-key-select').addEventListener('change', function (event) {
            saveSetting({ selectedKey: parseInt(event.target.value, 10) });
            renderChordGrid();
            renderDetail();
        });

        document.getElementById('cc-mode-major').addEventListener('click', function () {
            setMode('major');
        });

        document.getElementById('cc-mode-minor').addEventListener('click', function () {
            setMode('minor');
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
            getState().exploreSelectedChordIndex = parseInt(btn.dataset.index, 10);
            renderChordGrid();
            renderDetail();
        });
    }

    function setMode(mode) {
        if (getSettings().scaleType === mode) {
            return;
        }
        saveSetting({ scaleType: mode });
        updateKeyOptions();
        updateSegments();
        renderChordGrid();
        renderDetail();
    }

    function setToneMode(toneMode) {
        if (getSettings().chordToneMode === toneMode) {
            return;
        }
        saveSetting({ chordToneMode: toneMode });
        updateSegments();
        renderChordGrid();
        renderDetail();
    }

    function updateKeyOptions() {
        var theory = getTheory();
        var settings = getSettings();
        var select = document.getElementById('cc-key-select');
        var names = settings.scaleType === 'minor' ? theory.MINOR_KEY_OPTIONS : theory.MAJOR_KEY_OPTIONS;
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
            ['cc-mode-major', settings.scaleType === 'major'],
            ['cc-mode-minor', settings.scaleType === 'minor'],
            ['cc-tone-3', settings.chordToneMode === '3'],
            ['cc-tone-7', settings.chordToneMode === '7']
        ];
        pairs.forEach(function (pair) {
            var el = document.getElementById(pair[0]);
            if (el) {
                el.classList.toggle('cc-segment-btn--active', pair[1]);
            }
        });
    }

    function getChords() {
        var settings = getSettings();
        return getTheory().getDiatonicChords(settings.selectedKey, settings.scaleType, settings.chordToneMode);
    }

    function renderChordGrid() {
        var grid = document.getElementById('cc-chord-grid');
        var selectedIndex = getState().exploreSelectedChordIndex;
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
        var selectedIndex = getState().exploreSelectedChordIndex;
        detail.innerHTML = '';

        if (selectedIndex === null || selectedIndex === undefined) {
            var empty = document.createElement('p');
            empty.className = 'cc-detail-empty';
            empty.textContent = 'コードをタップすると構成音が表示されます。';
            detail.appendChild(empty);
            return;
        }

        var chord = getChords()[selectedIndex];
        if (!chord) {
            return;
        }

        var head = document.createElement('div');
        head.className = 'cc-detail-head';

        var symbol = document.createElement('span');
        symbol.className = 'cc-detail-symbol';
        symbol.textContent = chord.symbol;

        var roman = document.createElement('span');
        roman.className = 'cc-detail-roman';
        roman.textContent = chord.roman;

        head.appendChild(symbol);
        head.appendChild(roman);
        detail.appendChild(head);

        detail.appendChild(buildDetailRow('構成音', chord.noteNames));
        detail.appendChild(buildDetailRow('度数', getTheory().degreeLabels(chord.intervals)));
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
        renderDetail();
    }

    window.ChordCruise.ui.explore = {
        render: render
    };
})();
