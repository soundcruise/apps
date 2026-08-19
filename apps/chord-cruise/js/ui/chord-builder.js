(function () {
    'use strict';

    /* 任意コード作成モーダル。
       UI構成・選択肢は音感クルーズPROの「コードを作る」と操作感を統一。
       転回形はコードクルーズの指板表示（構成音表示／CAGEDフォーム）では
       意味を持たないため省略している。 */

    var overlayEl = null;
    var nameUserEdited = false;
    var onApplyCallback = null;
    var previousFocus = null;

    function model() {
        return window.ChordCruise.chordModel;
    }

    function focusTrap() {
        return window.ChordCruise.ui && window.ChordCruise.ui.focusTrap;
    }

    function ensureDom() {
        if (overlayEl) return;
        var rootOptions = model().CUSTOM_ROOT_NAMES.map(function (name, pc) {
            return '<option value="' + pc + '"' + (pc === 0 ? ' selected' : '') + '>' + name + '</option>';
        }).join('');

        overlayEl = document.createElement('div');
        overlayEl.className = 'cc-modal-overlay cc-modal-overlay--hidden';
        overlayEl.innerHTML =
            '<div class="cc-modal" role="dialog" aria-modal="true" aria-label="コードを作る">' +
                '<div class="cc-modal-head">' +
                    '<h3 class="cc-modal-title">コードを作る</h3>' +
                    '<button type="button" class="cc-btn cc-btn-secondary cc-btn--small" id="cc-builder-cancel">キャンセル</button>' +
                '</div>' +
                '<input type="text" id="cc-builder-name" class="cc-input cc-builder-name" maxlength="64" autocomplete="off" spellcheck="false" aria-label="名前（タップして編集できます）">' +
                '<div class="cc-builder-grid">' +
                    '<label class="cc-field cc-builder-field--wide"><span class="cc-field-label">ルート音</span>' +
                        '<select id="cc-builder-root" class="cc-select">' + rootOptions + '</select></label>' +
                    '<label class="cc-field"><span class="cc-field-label">3度 (3rd)</span>' +
                        '<select id="cc-builder-third" class="cc-select">' +
                            '<option value="4" selected>Major (M3)</option>' +
                            '<option value="3">Minor (m3)</option>' +
                            '<option value="5">Sus4 (P4)</option>' +
                            '<option value="null">None</option>' +
                        '</select></label>' +
                    '<label class="cc-field"><span class="cc-field-label">5度 (5th)</span>' +
                        '<select id="cc-builder-fifth" class="cc-select">' +
                            '<option value="7" selected>P5</option>' +
                            '<option value="6">♭5</option>' +
                            '<option value="8">♯5</option>' +
                            '<option value="null">None</option>' +
                        '</select></label>' +
                    '<label class="cc-field cc-builder-field--wide"><span class="cc-field-label">7度 (7th)</span>' +
                        '<select id="cc-builder-seventh" class="cc-select">' +
                            '<option value="null" selected>None (Triad)</option>' +
                            '<option value="10">m7</option>' +
                            '<option value="11">M7</option>' +
                            '<option value="9">dim7 (6th)</option>' +
                        '</select></label>' +
                    '<label class="cc-field cc-builder-field--wide"><span class="cc-field-label">ベース音</span>' +
                        '<select id="cc-builder-bass" class="cc-select" aria-label="分数コードのベース音"><option value="">通常</option></select></label>' +
                    '<div class="cc-field cc-builder-field--wide">' +
                        '<span class="cc-field-label">テンション</span>' +
                        '<div class="cc-builder-tensions">' +
                            '<label class="cc-tension-label"><input type="checkbox" value="13" class="cc-tension-checkbox"><span>♭9</span></label>' +
                            '<label class="cc-tension-label"><input type="checkbox" value="14" class="cc-tension-checkbox"><span>9</span></label>' +
                            '<label class="cc-tension-label"><input type="checkbox" value="15" class="cc-tension-checkbox"><span>♯9</span></label>' +
                            '<label class="cc-tension-label"><input type="checkbox" value="17" class="cc-tension-checkbox"><span>11</span></label>' +
                            '<label class="cc-tension-label"><input type="checkbox" value="18" class="cc-tension-checkbox"><span>♯11</span></label>' +
                            '<label class="cc-tension-label"><input type="checkbox" value="20" class="cc-tension-checkbox"><span>♭13</span></label>' +
                            '<label class="cc-tension-label"><input type="checkbox" value="21" class="cc-tension-checkbox"><span>13</span></label>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="cc-save-actions">' +
                    '<button type="button" class="cc-btn cc-btn-secondary cc-btn--block" id="cc-builder-reset">リセット</button>' +
                    '<button type="button" class="cc-btn cc-btn-primary cc-btn--block" id="cc-builder-apply">指板に表示</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlayEl);

        document.getElementById('cc-builder-cancel').addEventListener('click', close);
        document.getElementById('cc-builder-reset').addEventListener('click', function () {
            applyInitialSpec(defaultInitialSpec());
        });
        overlayEl.addEventListener('click', function (event) {
            if (event.target === overlayEl) close();
        });
        overlayEl.addEventListener('keydown', function (event) {
            var dialog = overlayEl.querySelector('[role="dialog"]');
            if (focusTrap()) focusTrap().trapFocus(dialog || overlayEl, event);
        });

        // 名前の手編集を検知（音感クルーズPROと同じ挙動: 手で触ったら自動更新しない）
        var nameInput = document.getElementById('cc-builder-name');
        nameInput.addEventListener('input', function () {
            nameUserEdited = nameInput.value.trim() !== '';
            if (!nameUserEdited) {
                refreshName();
            }
        });

        ['cc-builder-root', 'cc-builder-third', 'cc-builder-fifth', 'cc-builder-seventh'].forEach(function (id) {
            document.getElementById(id).addEventListener('change', refreshSpecControls);
        });
        Array.prototype.forEach.call(overlayEl.querySelectorAll('.cc-tension-checkbox'), function (checkbox) {
            checkbox.addEventListener('change', refreshSpecControls);
        });
        document.getElementById('cc-builder-bass').addEventListener('change', refreshName);

        document.getElementById('cc-builder-apply').addEventListener('click', function () {
            var chord = model().buildCustomChord(readSpec(), nameUserEdited ? document.getElementById('cc-builder-name').value : '');
            close();
            if (typeof onApplyCallback === 'function') {
                onApplyCallback(chord);
            }
        });
    }

    function readUpperSpec() {
        function readValue(id) {
            var value = document.getElementById(id).value;
            return value === 'null' ? null : parseInt(value, 10);
        }
        var tensions = Array.prototype.map.call(
            overlayEl.querySelectorAll('.cc-tension-checkbox:checked'),
            function (checkbox) { return parseInt(checkbox.value, 10); }
        );
        return {
            rootPc: parseInt(document.getElementById('cc-builder-root').value, 10),
            third: readValue('cc-builder-third'),
            fifth: readValue('cc-builder-fifth'),
            seventh: readValue('cc-builder-seventh'),
            tensions: tensions
        };
    }

    function readSpec() {
        var spec = readUpperSpec();
        var bassValue = document.getElementById('cc-builder-bass').value;
        spec.bassPc = bassValue === '' ? null : parseInt(bassValue, 10);
        return spec;
    }

    function refreshBassOptions() {
        var select = document.getElementById('cc-builder-bass');
        var spec = readUpperSpec();
        var previousValue = select.value;
        var chordTones = model().bassCandidates(spec);
        var otherBassTones = model().nonChordBassCandidates(spec);
        function optionsFor(pcs) {
            return pcs.map(function (pc) {
                return '<option value="' + pc + '">' + model().bassNoteName(pc) + '</option>';
            }).join('');
        }
        select.innerHTML = '<option value="">通常</option>' +
            '<optgroup label="構成音">' + optionsFor(chordTones) + '</optgroup>' +
            '<optgroup label="その他のベース音">' + optionsFor(otherBassTones) + '</optgroup>';
        var selectable = chordTones.concat(otherBassTones);
        select.value = selectable.indexOf(parseInt(previousValue, 10)) !== -1 ? previousValue : '';
    }

    function refreshSpecControls() {
        refreshBassOptions();
        refreshName();
    }

    function refreshName() {
        if (nameUserEdited) return;
        document.getElementById('cc-builder-name').value = model().buildCustomChord(readSpec(), '').symbol;
    }

    function defaultInitialSpec() {
        return { rootPc: 0, third: 4, fifth: 7, seventh: null, tensions: [], bassPc: null };
    }

    function initialSpecForChord(chord) {
        if (!chord || typeof chord.rootPc !== 'number') {
            return defaultInitialSpec();
        }

        // 任意コードは selector の元データを保持しているため、表示名を解析せず
        // spec を最優先して完全に復元する。
        if (chord.source === 'custom' && chord.spec) {
            return normalizeInitialSpec({
                rootPc: chord.spec.rootPc,
                third: chord.spec.third,
                fifth: chord.spec.fifth,
                seventh: chord.spec.seventh,
                tensions: tensionIntervalsForChord(chord),
                bassPc: chord.spec.bassPc
            });
        }

        var intervals = intervalsForChord(chord);
        if (!intervals) return defaultInitialSpec();
        function selectedInterval(candidates) {
            for (var i = 0; i < candidates.length; i += 1) {
                if (intervals.indexOf(candidates[i]) !== -1) return candidates[i];
            }
            return null;
        }
        return normalizeInitialSpec({
            rootPc: chord.rootPc,
            third: selectedInterval([4, 3, 5]),
            fifth: selectedInterval([7, 6, 8]),
            seventh: selectedInterval([10, 11, 9]),
            tensions: tensionIntervalsForChord(chord),
            bassPc: chord.bassPc
        });
    }

    function intervalsForChord(chord) {
        var theory = window.ChordCruise.theory;
        if (chord.qualityKey && theory && theory.QUALITIES && theory.QUALITIES[chord.qualityKey] &&
                Array.isArray(theory.QUALITIES[chord.qualityKey].intervals)) {
            return theory.QUALITIES[chord.qualityKey].intervals;
        }
        if (Array.isArray(chord.coreIntervals)) return chord.coreIntervals;
        if (Array.isArray(chord.intervals)) return chord.intervals;
        return null;
    }

    function tensionIntervalsForChord(chord) {
        if (chord.spec && Array.isArray(chord.spec.tensions)) return chord.spec.tensions.slice();
        if (Array.isArray(chord.tensionIntervals)) return chord.tensionIntervals.slice();
        if (Array.isArray(chord.tensionPcs) && typeof chord.rootPc === 'number' &&
                typeof model().tensionIntervalsForPcs === 'function') {
            return model().tensionIntervalsForPcs(chord.rootPc, chord.tensionPcs);
        }
        return [];
    }

    function normalizeInitialSpec(spec) {
        var fallback = defaultInitialSpec();
        if (!spec || typeof spec.rootPc !== 'number') return fallback;
        var rootPc = ((spec.rootPc % 12) + 12) % 12;
        var bassPc = typeof spec.bassPc === 'number' ? ((spec.bassPc % 12) + 12) % 12 : null;
        return {
            rootPc: rootPc,
            third: [3, 4, 5, null].indexOf(spec.third) !== -1 ? spec.third : fallback.third,
            fifth: [6, 7, 8, null].indexOf(spec.fifth) !== -1 ? spec.fifth : fallback.fifth,
            seventh: [9, 10, 11, null].indexOf(spec.seventh) !== -1 ? spec.seventh : fallback.seventh,
            tensions: Array.isArray(spec.tensions) ? spec.tensions.slice() : [],
            bassPc: bassPc === rootPc ? null : bassPc
        };
    }

    function applyInitialSpec(spec) {
        var initialSpec = normalizeInitialSpec(spec);
        document.getElementById('cc-builder-root').value = String(initialSpec.rootPc);
        document.getElementById('cc-builder-third').value = initialSpec.third === null ? 'null' : String(initialSpec.third);
        document.getElementById('cc-builder-fifth').value = initialSpec.fifth === null ? 'null' : String(initialSpec.fifth);
        document.getElementById('cc-builder-seventh').value = initialSpec.seventh === null ? 'null' : String(initialSpec.seventh);
        Array.prototype.forEach.call(overlayEl.querySelectorAll('.cc-tension-checkbox'), function (checkbox) {
            checkbox.checked = initialSpec.tensions.indexOf(parseInt(checkbox.value, 10)) !== -1;
        });
        nameUserEdited = false;
        refreshSpecControls();
        document.getElementById('cc-builder-bass').value = initialSpec.bassPc === null ? '' : String(initialSpec.bassPc);
        refreshName();
    }

    function open(options) {
        ensureDom();
        previousFocus = document.activeElement;
        onApplyCallback = options && options.onApply;
        applyInitialSpec(options && options.initialSpec);
        overlayEl.classList.remove('cc-modal-overlay--hidden');
        var dialog = overlayEl.querySelector('[role="dialog"]');
        if (focusTrap()) focusTrap().focusFirst(dialog || overlayEl);
    }

    function close() {
        if (overlayEl) {
            overlayEl.classList.add('cc-modal-overlay--hidden');
        }
        var returnFocus = previousFocus;
        previousFocus = null;
        if (focusTrap()) focusTrap().restoreFocus(returnFocus);
        else if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.ui = window.ChordCruise.ui || {};
    window.ChordCruise.ui.chordBuilder = {
        open: open,
        close: close,
        initialSpecForChord: initialSpecForChord,
        defaultInitialSpec: defaultInitialSpec
    };
})();
