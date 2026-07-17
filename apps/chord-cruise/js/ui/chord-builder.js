(function () {
    'use strict';

    /* 任意コード作成モーダル。
       UI構成・選択肢は音感クルーズPROの「コードを作る」と操作感を統一。
       転回形はコードクルーズの指板表示（構成音表示／CAGEDフォーム）では
       意味を持たないため省略している。 */

    var overlayEl = null;
    var nameUserEdited = false;
    var onApplyCallback = null;

    function model() {
        return window.ChordCruise.chordModel;
    }

    function ensureDom() {
        if (overlayEl) return;
        var rootOptions = model().CUSTOM_ROOT_NAMES.map(function (name, pc) {
            return '<option value="' + pc + '"' + (pc === 0 ? ' selected' : '') + '>' + name + '</option>';
        }).join('');

        overlayEl = document.createElement('div');
        overlayEl.className = 'cc-modal-overlay cc-modal-overlay--hidden';
        overlayEl.innerHTML =
            '<div class="cc-modal" role="dialog" aria-label="コードを作る">' +
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
                    '<button type="button" class="cc-btn cc-btn-primary cc-btn--block" id="cc-builder-apply">指板に表示</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlayEl);

        document.getElementById('cc-builder-cancel').addEventListener('click', close);
        overlayEl.addEventListener('click', function (event) {
            if (event.target === overlayEl) close();
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
            document.getElementById(id).addEventListener('change', refreshName);
        });
        Array.prototype.forEach.call(overlayEl.querySelectorAll('.cc-tension-checkbox'), function (checkbox) {
            checkbox.addEventListener('change', refreshName);
        });

        document.getElementById('cc-builder-apply').addEventListener('click', function () {
            var chord = model().buildCustomChord(readSpec(), nameUserEdited ? document.getElementById('cc-builder-name').value : '');
            close();
            if (typeof onApplyCallback === 'function') {
                onApplyCallback(chord);
            }
        });
    }

    function readSpec() {
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

    function refreshName() {
        if (nameUserEdited) return;
        document.getElementById('cc-builder-name').value = model().generateName(readSpec());
    }

    function open(options) {
        ensureDom();
        onApplyCallback = options && options.onApply;
        // フォーム初期化
        document.getElementById('cc-builder-root').value = '0';
        document.getElementById('cc-builder-third').value = '4';
        document.getElementById('cc-builder-fifth').value = '7';
        document.getElementById('cc-builder-seventh').value = 'null';
        Array.prototype.forEach.call(overlayEl.querySelectorAll('.cc-tension-checkbox'), function (checkbox) {
            checkbox.checked = false;
        });
        nameUserEdited = false;
        refreshName();
        overlayEl.classList.remove('cc-modal-overlay--hidden');
    }

    function close() {
        if (overlayEl) {
            overlayEl.classList.add('cc-modal-overlay--hidden');
        }
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.ui = window.ChordCruise.ui || {};
    window.ChordCruise.ui.chordBuilder = {
        open: open,
        close: close
    };
})();
