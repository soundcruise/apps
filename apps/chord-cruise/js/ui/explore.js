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
                '<div id="cc-fretboard-host" class="cc-fb-host"></div>' +
                '<p class="cc-fb-hint" id="cc-fb-hint"></p>' +
            '</div>' +
            '<div class="cc-card" id="cc-chord-detail"></div>';
        section.appendChild(content);
        bindEvents();
    }

    function bindEvents() {
        document.getElementById('cc-key-select').addEventListener('change', function (event) {
            saveSetting({ selectedKey: parseInt(event.target.value, 10) });
            renderChordGrid();
            renderFretboard();
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
            renderFretboard();
            renderDetail();
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

        // 運指表示はCAGEDフォーム表示（STEP 4以降）で有効化する
        document.getElementById('cc-fbmode-finger').addEventListener('click', function () {
            setFbHint('運指表示はCAGEDフォームを選んだときに使えます。');
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

    function setMode(mode) {
        if (getSettings().scaleType === mode) {
            return;
        }
        saveSetting({ scaleType: mode });
        updateKeyOptions();
        updateSegments();
        renderChordGrid();
        renderFretboard();
        renderDetail();
    }

    function setToneMode(toneMode) {
        if (getSettings().chordToneMode === toneMode) {
            return;
        }
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
        updateFbSegments();
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

    function roleForInterval(interval) {
        if (interval === 0) return 'root';
        if (interval === 3 || interval === 4) return 'third';
        if (interval === 6 || interval === 7 || interval === 8) return 'fifth';
        if (interval === 9 || interval === 10 || interval === 11) return 'seventh';
        return 'other';
    }

    function computeChordToneMarkers(chord) {
        var theory = getTheory();
        var settings = getSettings();
        var useFlats = theory.keyUsesFlats(settings.selectedKey, settings.scaleType);
        var mode = settings.fretboardDisplayMode;
        var markers = [];
        var s;
        var f;
        for (s = 1; s <= 6; s++) {
            var openPc = theory.OPEN_STRINGS[6 - s];
            for (f = 0; f <= 13; f++) {
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
                    label = theory.degreeLabels([interval])[0];
                } else {
                    label = theory.noteName(pc, useFlats);
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

    function renderFretboard() {
        var host = document.getElementById('cc-fretboard-host');
        if (!host) {
            return;
        }
        var fb = window.ChordCruise.ui.fretboard;
        var selectedIndex = getState().exploreSelectedChordIndex;
        var chord = (selectedIndex === null || selectedIndex === undefined) ? null : getChords()[selectedIndex];
        var prevScroll = fb.getScrollLeft(host);
        fb.render(host, {
            maxFret: 13,
            markers: chord ? computeChordToneMarkers(chord) : [],
            preserveScroll: typeof prevScroll === 'number' ? prevScroll : null
        });
        setFbHint(chord ? '' : 'コードを選ぶと構成音が指板に表示されます。');
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
        renderFretboard();
        renderDetail();
    }

    window.ChordCruise.ui.explore = {
        render: render
    };
})();
