(function () {
    'use strict';

    /* コード本棚。フォルダ一覧 → フォルダ内一覧 → 保存コード詳細 の3階層。 */

    var FINGER_CYCLE = [null, 'T', 1, 2, 3, 4];
    var BASS_FINGER_CYCLE = [null, 'T', 1, 2, 3, 4, 'warning', 'delete'];
    var FINGER_LABELS = { T: '親', 1: '人', 2: '中', 3: '薬', 4: '小' };

    var view = 'folders';           // 'folders' | 'list' | 'detail'
    var currentFolderId = null;
    var currentChordId = null;
    var currentDetailChord = null;
    var detailMonochrome = false;
    // 一覧から詳細を開いた瞬間だけ一覧の表示モードを引き継ぐ。一覧・右上設定は変更しない。
    var detailDisplayModeOverride = null;
    var folderSortMode = false;
    var entrySortMode = false;
    var entrySortFolderId = null;
    var folderShelfColumns = 4;
    var folderManageSheet = null;
    var folderManageReturnFocus = null;
    var chordManageSheet = null;
    var chordManageReturnFocus = null;
    var currentListChords = [];

    function storage() { return window.ChordCruise.storage; }
    function theory() { return window.ChordCruise.theory; }
    function featureAccess() { return window.ChordCruise.featureAccess; }
    function canExport() {
        var access = featureAccess();
        return !!(access && typeof access.hasFeature === 'function' && access.hasFeature('advancedExport'));
    }
    function isProEdition() {
        var access = featureAccess();
        return !!(access && typeof access.isProEdition === 'function' && access.isProEdition());
    }
    function displayChordName(name) { return theory().displayChordName(name); }
    function storageErrorMessage(fallback) {
        var code = typeof storage().getLastError === 'function' ? storage().getLastError() : null;
        if (code === 'standard-folder-limit') return 'Standard版ではフォルダは3個まで保存できます。';
        if (code === 'standard-folder-chord-limit') return 'Standard版では1フォルダ10個まで保存できます。';
        return fallback;
    }
    function showFolderLimitProLink() {
        var link = document.getElementById('cc-folder-pro-link');
        var code = typeof storage().getLastError === 'function' ? storage().getLastError() : null;
        if (link) link.hidden = isProEdition() || (code !== 'standard-folder-limit' && code !== 'standard-folder-chord-limit');
    }
    function chordFormName(chord) {
        if (chord && chord.formName) return chord.formName;
        if (chord && chord.shape) return chord.shape + '型';
        return 'フォーム';
    }

    var QUALITY_FAMILY_LABELS = {
        major: 'メジャー', minor: 'マイナー', dominant: 'ドミナント', diminished: 'ディミニッシュ',
        augmented: 'オーギュメント', sus: 'サス', power: 'パワー'
    };
    var QUALITY_MODIFIER_LABELS = {
        none: 'なし', sixth: '6th追加', no: '構成音省略', altered: '変化音'
    };

    function qualityAnalysisHtml(chord) {
        var qualityKey = chord && (chord.qualityKey || theory().identifyQuality(chord.intervals || []));
        var quality = qualityKey && theory().QUALITIES[qualityKey];
        if (!quality || quality.complexity !== 'advanced') return '';
        if (!isProEdition() && (!featureAccess() || !featureAccess().canAccessQuality(qualityKey))) {
            return '<div class="cc-save-section" id="cc-lib-quality-analysis">' +
                '<h4 class="cc-card-heading">コード分析</h4>' +
                '<p class="cc-fb-hint">このコードの詳細分析はPro版で利用できます。</p>' +
                '<a class="cc-btn cc-btn-primary cc-btn--block" href="../pro-access.html" target="_blank" rel="noopener">Pro版の入手方法</a>' +
            '</div>';
        }
        return '<div class="cc-save-section" id="cc-lib-quality-analysis">' +
            '<h4 class="cc-card-heading">コード分析</h4>' +
            '<div class="cc-detail-row"><span class="cc-detail-label">分類</span><span class="cc-detail-text">' + escapeHtml(QUALITY_FAMILY_LABELS[quality.family] || quality.family) + '</span></div>' +
            '<div class="cc-detail-row"><span class="cc-detail-label">構成変化</span><span class="cc-detail-text">' + escapeHtml(QUALITY_MODIFIER_LABELS[quality.modifier] || quality.modifier) + '</span></div>' +
            '<div class="cc-detail-row"><span class="cc-detail-label">複雑度</span><span class="cc-detail-text">Advanced</span></div>' +
        '</div>';
    }

    function normalizeLibraryColumns(value) {
        return [1, 2, 3, 4].indexOf(value) !== -1 ? value : 4;
    }

    function currentLibraryColumns() {
        var settings = window.ChordCruise.state && window.ChordCruise.state.settings;
        return normalizeLibraryColumns(settings && settings.libraryColumns);
    }

    function currentFolderShelfColumns() {
        var settings = window.ChordCruise.state && window.ChordCruise.state.settings;
        var value = settings && settings.folderShelfColumns;
        return [2, 3, 4, 5, 6].indexOf(value) !== -1 ? value : 4;
    }

    function libraryCardDisplayMode() {
        var settings = window.ChordCruise.state && window.ChordCruise.state.settings;
        var mode = settings && settings.libraryCardDisplayMode;
        return ['note', 'solfege', 'degree', 'finger'].indexOf(mode) !== -1 ? mode : 'finger';
    }

    function libraryCardMonochrome() {
        var settings = window.ChordCruise.state && window.ChordCruise.state.settings;
        return !!(settings && settings.libraryCardMonochrome === true);
    }

    function globalDisplaySize(key) {
        var settings = window.ChordCruise.state && window.ChordCruise.state.settings;
        var value = settings && settings[key];
        return ['xsmall', 'small', 'medium', 'large', 'xlarge'].indexOf(value) !== -1 ? value : 'medium';
    }

    function libraryCardTextScale(size, columns) {
        var normalizedColumns = normalizeLibraryColumns(columns);
        if (size === 'xsmall') return 0.76;
        if (size === 'small') return 0.85;
        if (size === 'xlarge') {
            if (normalizedColumns === 4) return 1.09;
            if (normalizedColumns === 3) return 1.15;
            if (normalizedColumns === 2) return 1.22;
            return 1.25;
        }
        if (size !== 'large') return 1;
        if (normalizedColumns === 4) return 1.06;
        if (normalizedColumns === 3) return 1.09;
        return 1.12;
    }

    // 一覧カード専用。13px基準の静的SVGへ渡す固定倍率を、設定値×列数で明示する。
    // すべてnormalizeStaticTextScale()の許容範囲内に収め、サイズ順の逆転を防ぐ。
    var LIBRARY_FRET_NUMBER_SCALES = {
        xsmall: { 1: 1.12, 2: 1.10, 3: 1.04, 4: 0.98 },
        small:  { 1: 1.25, 2: 1.22, 3: 1.15, 4: 1.09 },
        medium: { 1: 1.36, 2: 1.34, 3: 1.27, 4: 1.20 },
        large:  { 1: 1.48, 2: 1.46, 3: 1.39, 4: 1.31 },
        xlarge: { 1: 1.60, 2: 1.58, 3: 1.51, 4: 1.42 }
    };

    function libraryCardFretNumberScale(size, columns) {
        var normalizedSize = ['xsmall', 'small', 'medium', 'large', 'xlarge'].indexOf(size) !== -1 ? size : 'medium';
        return LIBRARY_FRET_NUMBER_SCALES[normalizedSize][normalizeLibraryColumns(columns)];
    }

    function libraryDisplayModeLabel(mode) {
        return { note: 'CDE', solfege: 'ドレミ', degree: '度数', finger: '運指' }[mode] || '運指';
    }

    function contentEl() {
        return document.getElementById('cc-lib-content');
    }

    function setContentLayout(layout) {
        var content = contentEl();
        if (content) content.className = 'cc-lib-content cc-lib-content--' + layout;
    }

    function buildSkeleton(section) {
        if (document.getElementById('cc-lib-content')) return;
        var header = section.querySelector('.cc-page-header');
        section.innerHTML = '';
        if (header) section.appendChild(header);
        var content = document.createElement('div');
        content.id = 'cc-lib-content';
        content.className = 'cc-lib-content';
        section.appendChild(content);
    }

    // ---- 共通確認モーダル（削除・書き出し） ----

    var confirmOverlay = null;
    var confirmHandler = null;
    var confirmReturnFocus = null;

    function focusTrap() {
        return window.ChordCruise.ui && window.ChordCruise.ui.focusTrap;
    }

    function closeDangerConfirm(returnFocus) {
        if (!confirmOverlay) return;
        confirmOverlay.classList.add('cc-modal-overlay--hidden');
        confirmHandler = null;
        var opener = confirmReturnFocus;
        confirmReturnFocus = null;
        if (returnFocus && focusTrap()) focusTrap().restoreFocus(opener);
        else if (returnFocus && opener && typeof opener.focus === 'function') opener.focus();
    }

    function confirmDanger(message, okLabel, onOk, returnFocus, title, options) {
        if (!confirmOverlay) {
            confirmOverlay = document.createElement('div');
            confirmOverlay.className = 'cc-modal-overlay cc-modal-overlay--hidden';
            confirmOverlay.innerHTML =
                '<div class="cc-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="cc-confirm-title" aria-describedby="cc-confirm-description">' +
                    '<h2 class="cc-confirm-title" id="cc-confirm-title"></h2>' +
                    '<p class="cc-confirm-message" id="cc-confirm-description"></p>' +
                    '<div class="cc-confirm-actions">' +
                        '<button type="button" class="cc-btn cc-btn-danger" id="cc-confirm-ok"></button>' +
                        '<button type="button" class="cc-btn cc-btn-secondary" id="cc-confirm-cancel">キャンセル</button>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(confirmOverlay);
            document.getElementById('cc-confirm-cancel').addEventListener('click', function () {
                closeDangerConfirm(true);
            });
            document.getElementById('cc-confirm-ok').addEventListener('click', function () {
                var handler = confirmHandler;
                closeDangerConfirm(false);
                if (handler) handler();
            });
            confirmOverlay.addEventListener('keydown', function (event) {
                var dialog = confirmOverlay.querySelector('[role="alertdialog"]');
                if (focusTrap()) focusTrap().trapFocus(dialog || confirmOverlay, event);
            });
            document.addEventListener('keydown', function (event) {
                if (event.key === 'Escape' && confirmOverlay && !confirmOverlay.classList.contains('cc-modal-overlay--hidden')) {
                    closeDangerConfirm(true);
                }
            });
        }
        document.getElementById('cc-confirm-title').textContent = title || '確認';
        document.getElementById('cc-confirm-description').textContent = message;
        var okButton = document.getElementById('cc-confirm-ok');
        okButton.textContent = okLabel;
        okButton.className = 'cc-btn ' + (options && options.danger === false ? 'cc-btn-primary' : 'cc-btn-danger');
        confirmHandler = onOk;
        confirmReturnFocus = returnFocus || document.activeElement;
        confirmOverlay.classList.remove('cc-modal-overlay--hidden');
        var cancelButton = document.getElementById('cc-confirm-cancel');
        if (cancelButton) cancelButton.focus();
    }

    function confirmExport(returnFocus, onOk) {
        confirmDanger('書き出しを実行しますか？', '書き出し', onOk, returnFocus, '書き出しの確認', { danger: false });
    }

    // ---- 共通ヘルパー ----

    function folderById(id) {
        var found = null;
        storage().loadOrderedFolders().forEach(function (folder) {
            if (folder.id === id) found = folder;
        });
        return found;
    }

    function buildFolderCountMap() {
        var counts = Object.create(null);
        storage().loadChordIndex().forEach(function (entry) {
            counts[entry.folderId] = (counts[entry.folderId] || 0) + 1;
        });
        return counts;
    }

    function chordCountIn(folderId, counts) {
        return counts && counts[folderId] ? counts[folderId] : 0;
    }

    function escapeHtml(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function cloneChordRecord(chord) {
        return JSON.parse(JSON.stringify(chord));
    }

    function buildChordThumbnailGridHtml(chords, requestedColumns, sorting) {
        var columns = normalizeLibraryColumns(requestedColumns);
        var html = '<div class="cc-chordthumb-grid' + (sorting ? ' cc-chordthumb-grid--sorting' : '') + '" id="cc-chordthumb-grid" data-library-columns="' + columns + '" data-library-chord-name-size="' + globalDisplaySize('chordNameSize') + '"' +
            (sorting ? ' role="list" aria-label="保存コードの並び順"' : '') + '>';
        chords.forEach(function (chord, index) {
            var displayName = displayChordName(chord.chordName);
            var cardStart = sorting
                ? '<div class="cc-chordthumb-card cc-chordthumb-card--sorting" data-chord-id="' + escapeHtml(chord.id) + '" role="listitem" aria-label="' + escapeHtml(displayName) + 'の並び替え">'
                : '<button type="button" class="cc-chordthumb-card" data-chord-id="' + escapeHtml(chord.id) + '" aria-label="' + escapeHtml(displayName) + 'の指板を開く">';
            var cardHtml = cardStart +
                '<span class="cc-chordthumb-name" title="' + escapeHtml(displayName) + '">' + escapeHtml(displayName) + '</span>' +
                '<span class="cc-chordthumb-board" data-chord-thumb="' + escapeHtml(chord.id) + '" aria-hidden="true"></span>' +
                (sorting
                    ? '<span class="cc-chordthumb-sort-actions">' +
                        '<span class="cc-chordthumb-sort-form">' + escapeHtml(chordFormName(chord)) + '</span>' +
                        '<span class="cc-chordthumb-sort-buttons">' +
                            sortCardStepButtonHtml(chord.id, -1, index === 0, displayName + 'を上へ移動') +
                            sortCardStepButtonHtml(chord.id, 1, index === chords.length - 1, displayName + 'を下へ移動') +
                        '</span></span>' +
                      '</div>'
                    : '</button>');
            html += sorting
                ? cardHtml
                : '<div class="cc-chord-card-wrap">' + cardHtml +
                    '<button type="button" class="cc-chord-card-menu" data-chord-manage-id="' + escapeHtml(chord.id) + '" aria-label="' + escapeHtml(displayName) + 'を管理" title="コードを管理">…</button>' +
                  '</div>';
        });
        return html + '</div>';
    }

    function buildLibraryColumnsControlHtml(columns) {
        var html = '<div class="cc-lib-columns-control">' +
            '<span class="cc-save-label">表示</span>' +
            '<div class="cc-segment cc-lib-columns-segment" role="group" aria-label="コード一覧の列数">';
        [1, 2, 3, 4].forEach(function (value) {
            html += '<button type="button" class="cc-segment-btn' + (columns === value ? ' cc-segment-btn--active' : '') + '" data-library-columns-choice="' + value + '" aria-pressed="' + (columns === value ? 'true' : 'false') + '">' + value + '列</button>';
        });
        return html + '</div></div>';
    }

    function buildLibraryCardDisplayControlsHtml() {
        var mode = libraryCardDisplayMode();
        var monochrome = libraryCardMonochrome();
        var html = '<div class="cc-lib-list-display-controls" aria-label="コード一覧の表示設定">' +
            '<div class="cc-lib-list-display-row">' +
                '<span class="cc-save-label">丸の表示</span>' +
                '<div class="cc-segment cc-lib-list-mode-segment" role="group" aria-label="コード一覧の丸の表示">';
        ['finger', 'note', 'solfege', 'degree'].forEach(function (value) {
            var selected = value === mode;
            html += '<button type="button" class="cc-segment-btn' + (selected ? ' cc-segment-btn--active' : '') + '" data-library-card-display-mode="' + value + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' + libraryDisplayModeLabel(value) + '</button>';
        });
        return html + '</div></div>' +
            '<div class="cc-lib-list-display-row cc-lib-list-monochrome-row">' +
                '<div class="cc-lib-monochrome-control">' +
                    '<span class="cc-save-label">白黒 <strong id="cc-library-card-monochrome-state">' + (monochrome ? 'ON' : 'OFF') + '</strong></span>' +
                    '<button type="button" class="cc-switch' + (monochrome ? ' cc-switch--on' : '') + '" id="cc-library-card-monochrome-toggle" role="switch" aria-checked="' + (monochrome ? 'true' : 'false') + '" aria-label="コード一覧を白黒で表示">' +
                        '<span class="cc-switch-knob" aria-hidden="true"></span>' +
                    '</button>' +
                '</div>' +
                (canExport()
                    ? '<button type="button" class="cc-btn cc-btn-secondary cc-export-icon-btn" id="cc-library-folder-export-btn" aria-label="フォルダ一覧を書き出す" title="書き出し">' + downloadIconSvg() + '</button>'
                    : '') +
            '</div>' +
            (canExport()
                ? '<p class="cc-lib-export-status cc-lib-list-export-status" id="cc-library-folder-export-status" style="display:none;"></p>'
                : '') +
            '</div>';
    }

    function downloadIconSvg() {
        return '<svg class="cc-download-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path d="M12 3v11m0 0 4-4m-4 4-4-4M5 19h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';
    }

    function sortError() {
        if (window.ChordCruise.ui.toast) {
            window.ChordCruise.ui.toast.show('並び順を保存できませんでした', { type: 'error' });
        }
    }

    function sortStepButtonHtml(kind, id, direction, disabled, label, visibleLabel) {
        return '<button type="button" class="cc-sort-step-btn" data-' + kind + '-sort-step="' + direction + '" data-sort-id="' +
            escapeHtml(id) + '" aria-label="' + escapeHtml(label) + '"' + (disabled ? ' disabled' : '') + '>' +
            escapeHtml(visibleLabel || (direction < 0 ? '↑ 上へ' : '↓ 下へ')) + '</button>';
    }

    function sortCardStepButtonHtml(id, direction, disabled, label) {
        return '<button type="button" class="cc-chordthumb-sort-step" data-entry-sort-step="' + direction + '" data-sort-id="' +
            escapeHtml(id) + '" aria-label="' + escapeHtml(label) + '" title="' + escapeHtml(label) + '"' + (disabled ? ' disabled' : '') + '>' +
            (direction < 0 ? '↑' : '↓') + '</button>';
    }

    function folderModifierClasses(folder, count) {
        return ' is-custom' + (count === 0 ? ' is-empty' : '') +
            ' cc-folder-color-' + storage().folderColorKey(folder);
    }

    function folderListClasses(sorting) {
        return 'cc-' + (sorting ? 'sort-list' : 'folder-list') + ' cc-folder-list--shelf cc-folder-list--shelf-a3';
    }

    function folderShelfAttributes() {
        return ' data-folder-shelf-columns="' + folderShelfColumns + '"';
    }

    function spineTitleHtml(name) {
        var html = '<span class="cc-folder-card-name" aria-hidden="true">';
        Array.from(String(name || '')).forEach(function (character) {
            html += character === 'ー'
                ? '<span class="cc-spine-char cc-spine-char--prolonged" aria-hidden="true"></span>'
                : '<span class="cc-spine-char">' + escapeHtml(character) + '</span>';
        });
        return html + '</span>';
    }

    function folderCardInnerHtml(folder, count, showChevron) {
        return '<span class="cc-folder-card-icon" aria-hidden="true"></span>' +
            '<span class="cc-folder-card-body">' +
                spineTitleHtml(folder.name) +
                '<span class="cc-folder-card-meta">' +
                    '<span class="cc-folder-card-count">' + count + '件</span>' +
                    (count === 0 ? '<span class="cc-folder-card-state cc-folder-card-state--empty">空</span>' : '') +
                '</span>' +
            '</span>' +
            (showChevron ? '<span class="cc-folder-card-chevron" aria-hidden="true">›</span>' : '');
    }

    function folderAriaLabel(folder, count) {
        return folder.name + '、' + count + '件' + (count === 0 ? '、空のフォルダ' : '') + '、開く';
    }

    function buildFolderShelfColumnsHtml() {
        var html = '<div class="cc-folder-shelf-columns"><span class="cc-folder-shelf-columns-label">本棚の列数</span><div class="cc-folder-shelf-columns-options" role="group" aria-label="本棚の列数">';
        [2, 3, 4, 5, 6].forEach(function (columns) {
            var selected = folderShelfColumns === columns;
            html += '<button type="button" class="cc-folder-shelf-columns-btn' + (selected ? ' is-selected' : '') + '" data-folder-shelf-columns-choice="' + columns + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' + columns + '</button>';
        });
        return html + '</div></div>';
    }

    function folderSortCardHtml(folder, index, count, total) {
            var previousLabel = folderShelfColumns >= 5 ? '←' : '← 前へ';
            var nextLabel = folderShelfColumns >= 5 ? '→' : '後へ →';
            return '<div class="cc-sort-row cc-folder-card cc-folder-card--sorting cc-folder-card--design-a cc-folder-card--book-a3 ' +
                folderModifierClasses(folder, count) + '" role="listitem" aria-label="' + escapeHtml(folder.name + '、' + count + '件、並び替え') + '">' +
                folderCardInnerHtml(folder, count, false) +
                '<span class="cc-sort-row-actions">' +
                    sortStepButtonHtml('folder', folder.id, -1, index <= 0, folder.name + 'を前の位置へ移動', previousLabel) +
                    sortStepButtonHtml('folder', folder.id, 1, index >= total - 1, folder.name + 'を後の位置へ移動', nextLabel) +
                '</span>' +
            '</div>';
    }

    function folderCardHtml(folder, count) {
        return '<div class="cc-folder-card-wrap">' +
            '<button type="button" class="cc-folder-card cc-folder-card--design-a cc-folder-card--book-a3' +
                folderModifierClasses(folder, count) + '" data-folder-id="' + escapeHtml(folder.id) + '" aria-label="' +
                escapeHtml(folderAriaLabel(folder, count)) + '" title="' + escapeHtml(folder.name) + '">' +
                folderCardInnerHtml(folder, count, true) +
            '</button>' +
            '<button type="button" class="cc-folder-card-menu" data-folder-manage-id="' + escapeHtml(folder.id) + '" aria-label="' + escapeHtml(folder.name) + 'を管理" title="フォルダを管理">…</button>' +
        '</div>';
    }

    function buildFolderShelfRowsHtml(folders, countMap, sorting) {
        var html = '';
        for (var first = 0; first < folders.length; first += folderShelfColumns) {
            var row = folders.slice(first, first + folderShelfColumns);
            html += '<div class="cc-folder-shelf-row"' + folderShelfAttributes() + '>';
            row.forEach(function (folder, rowIndex) {
                var count = chordCountIn(folder.id, countMap);
                html += sorting ? folderSortCardHtml(folder, first + rowIndex, count, folders.length) : folderCardHtml(folder, count);
            });
            html += '<div class="cc-folder-shelf-board" aria-hidden="true"></div></div>';
        }
        return html;
    }

    function buildFolderSortRowsHtml(folders, countMap) {
        return '<div class="' + folderListClasses(true) + '"' + folderShelfAttributes() + ' role="list" aria-label="フォルダの並び順">' +
            buildFolderShelfRowsHtml(folders, countMap, true) + '</div>';
    }

    var FOLDER_COLOR_CATEGORIES = [
        {
            label: 'クラシック',
            options: [
                ['black-leather', '黒革'], ['leather', '革茶'], ['black-gold', '黒金'],
                ['umber', '琥珀'], ['burgundy', '深紅'], ['wine', 'ワイン'],
                ['navy', '紺'], ['forest', '深緑'], ['charcoal', '炭']
            ]
        },
        {
            label: 'スタンダード',
            options: [
                ['red', '赤'], ['orange', 'オレンジ'], ['yellow', '黄'],
                ['green', '緑'], ['blue', '青'], ['pink', 'ピンク'],
                ['teal', '青緑'], ['violet', '紫'], ['russet', '赤茶']
            ]
        },
        {
            label: 'パステル',
            options: [
                ['pastel-pink', 'パステルピンク'], ['pastel-blue', 'パステルブルー'], ['pastel-purple', 'パステルパープル'],
                ['pastel-green', 'パステルグリーン'], ['pastel-yellow', 'パステルイエロー'], ['pastel-orange', 'パステルオレンジ']
            ]
        }
    ];

    function toast(message, type) {
        if (window.ChordCruise.ui.toast) {
            window.ChordCruise.ui.toast.show(message, { type: type || 'success' });
        }
    }

    function ensureFolderManageSheet() {
        if (folderManageSheet) return folderManageSheet;
        folderManageSheet = document.createElement('div');
        folderManageSheet.className = 'cc-folder-manage-overlay cc-folder-manage-overlay--hidden';
        folderManageSheet.addEventListener('click', function (event) {
            if (event.target === folderManageSheet) closeFolderManageSheet(true);
        });
        folderManageSheet.addEventListener('keydown', function (event) {
            var dialog = folderManageSheet.querySelector('[role="dialog"]');
            if (focusTrap()) focusTrap().trapFocus(dialog || folderManageSheet, event);
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && folderManageSheet && !folderManageSheet.classList.contains('cc-folder-manage-overlay--hidden')) {
                closeFolderManageSheet(true);
            }
        });
        document.body.appendChild(folderManageSheet);
        return folderManageSheet;
    }

    function setManagingFolderCard(id, active) {
        var content = contentEl();
        if (!content) return;
        Array.prototype.forEach.call(content.querySelectorAll('[data-folder-id]'), function (card) {
            if (card.getAttribute('data-folder-id') === id) card.classList.toggle('is-managing', active);
        });
    }

    function closeFolderManageSheet(returnFocus) {
        if (!folderManageSheet) return;
        setManagingFolderCard(folderManageSheet.dataset.folderId, false);
        folderManageSheet.classList.add('cc-folder-manage-overlay--hidden');
        document.body.classList.remove('cc-folder-manage-open');
        folderManageSheet.innerHTML = '';
        if (returnFocus && focusTrap()) focusTrap().restoreFocus(folderManageReturnFocus);
        else if (returnFocus && folderManageReturnFocus && typeof folderManageReturnFocus.focus === 'function') folderManageReturnFocus.focus();
        folderManageReturnFocus = null;
    }

    function ensureChordManageSheet() {
        if (chordManageSheet) return chordManageSheet;
        chordManageSheet = document.createElement('div');
        chordManageSheet.className = 'cc-folder-manage-overlay cc-folder-manage-overlay--hidden';
        chordManageSheet.addEventListener('click', function (event) {
            if (event.target === chordManageSheet) closeChordManageSheet(true);
        });
        chordManageSheet.addEventListener('keydown', function (event) {
            var dialog = chordManageSheet.querySelector('[role="dialog"]');
            if (focusTrap()) focusTrap().trapFocus(dialog || chordManageSheet, event);
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && chordManageSheet && !chordManageSheet.classList.contains('cc-folder-manage-overlay--hidden')) {
                closeChordManageSheet(true);
            }
        });
        document.body.appendChild(chordManageSheet);
        return chordManageSheet;
    }

    function setManagingChordCard(id, active) {
        var content = contentEl();
        if (!content) return;
        Array.prototype.forEach.call(content.querySelectorAll('[data-chord-id]'), function (card) {
            if (card.getAttribute('data-chord-id') === id) card.classList.toggle('is-managing', active);
        });
    }

    function closeChordManageSheet(returnFocus) {
        if (!chordManageSheet) return;
        setManagingChordCard(chordManageSheet.dataset.chordId, false);
        chordManageSheet.classList.add('cc-folder-manage-overlay--hidden');
        document.body.classList.remove('cc-folder-manage-open');
        chordManageSheet.innerHTML = '';
        if (returnFocus && focusTrap()) focusTrap().restoreFocus(chordManageReturnFocus);
        else if (returnFocus && chordManageReturnFocus && typeof chordManageReturnFocus.focus === 'function') chordManageReturnFocus.focus();
        chordManageReturnFocus = null;
    }

    function chordManageMenuHtml(chord) {
        var otherFolders = storage().loadOrderedFolders().filter(function (folder) {
            return folder.id !== chord.folderId;
        });
        var copyElsewhereDisabled = otherFolders.length === 0 ? ' disabled' : '';
        var displayName = displayChordName(chord.chordName);
        return '<div class="cc-folder-manage-sheet" role="dialog" aria-modal="true" aria-labelledby="cc-chord-manage-title">' +
            '<div class="cc-folder-manage-grabber" aria-hidden="true"></div>' +
            '<div class="cc-folder-manage-heading"><h3 id="cc-chord-manage-title">' + escapeHtml(displayName) + '</h3><p>' + escapeHtml(chordFormName(chord)) + '</p></div>' +
            '<div class="cc-folder-manage-actions">' +
                '<button type="button" class="cc-folder-manage-action" data-chord-manage-action="view">コードを見る</button>' +
                '<button type="button" class="cc-folder-manage-action" data-chord-manage-action="edit">編集</button>' +
                '<button type="button" class="cc-folder-manage-action" data-chord-manage-action="copy">複製</button>' +
                '<button type="button" class="cc-folder-manage-action" data-chord-manage-action="copy-folder"' + copyElsewhereDisabled + '>別のフォルダに複製</button>' +
                '<button type="button" class="cc-folder-manage-action cc-folder-manage-action--danger" data-chord-manage-action="delete">削除</button>' +
            '</div>' +
            '<button type="button" class="cc-folder-manage-cancel" data-chord-manage-action="close">キャンセル</button>' +
        '</div>';
    }

    function chordManageCopyFolderHtml(chord) {
        var displayName = displayChordName(chord.chordName);
        var targets = storage().loadOrderedFolders().filter(function (folder) {
            return folder.id !== chord.folderId;
        });
        var choices = targets.length
            ? targets.map(function (folder) {
                return '<button type="button" class="cc-folder-manage-action" data-chord-manage-action="copy-to-folder" data-target-folder-id="' + escapeHtml(folder.id) + '">' + escapeHtml(folder.name) + '</button>';
            }).join('')
            : '<p class="cc-fb-hint">複製先になる別のフォルダがありません。</p>';
        return '<div class="cc-folder-manage-sheet" role="dialog" aria-modal="true" aria-labelledby="cc-chord-manage-title">' +
            '<div class="cc-folder-manage-grabber" aria-hidden="true"></div>' +
            '<div class="cc-folder-manage-heading"><h3 id="cc-chord-manage-title">別のフォルダに複製</h3><p>' + escapeHtml(displayName) + 'の複製先を選択</p></div>' +
            '<div class="cc-folder-manage-actions">' + choices + '</div>' +
            '<button type="button" class="cc-folder-manage-cancel" data-chord-manage-action="menu">戻る</button>' +
        '</div>';
    }

    function chordCopyRecord(chord, folderId) {
        var copy = cloneChordRecord(chord);
        delete copy.id;
        delete copy.createdAt;
        delete copy.updatedAt;
        delete copy.schemaVersion;
        copy.folderId = folderId || chord.folderId;
        return copy;
    }

    function saveChordCopy(chord, folderId) {
        return storage().saveChord(chordCopyRecord(chord, folderId));
    }

    function showChordManagePane(chordId, pane) {
        var chord = storage().loadChord(chordId);
        if (!chord) {
            closeChordManageSheet(false);
            return;
        }
        var sheet = ensureChordManageSheet();
        sheet.dataset.chordId = chord.id;
        sheet.dataset.pane = pane || 'menu';
        sheet.innerHTML = pane === 'copy-folder' ? chordManageCopyFolderHtml(chord) : chordManageMenuHtml(chord);
        bindChordManageSheet();
        var dialog = sheet.querySelector('[role="dialog"]');
        if (focusTrap()) focusTrap().focusFirst(dialog || sheet);
        else {
            var focusTarget = sheet.querySelector('button');
            if (focusTarget) focusTarget.focus();
        }
    }

    function openChordManageSheet(chordId, trigger) {
        chordManageReturnFocus = trigger || null;
        var sheet = ensureChordManageSheet();
        setManagingChordCard(chordId, true);
        sheet.classList.remove('cc-folder-manage-overlay--hidden');
        document.body.classList.add('cc-folder-manage-open');
        showChordManagePane(chordId, 'menu');
    }

    function bindChordManageSheet() {
        if (!chordManageSheet) return;
        Array.prototype.forEach.call(chordManageSheet.querySelectorAll('[data-chord-manage-action]'), function (button) {
            button.addEventListener('click', function () {
                var chordId = chordManageSheet.dataset.chordId;
                var chord = storage().loadChord(chordId);
                var action = button.getAttribute('data-chord-manage-action');
                if (action === 'close') return closeChordManageSheet(true);
                if (!chord) return closeChordManageSheet(false);
                if (action === 'menu' || action === 'copy-folder') return showChordManagePane(chordId, action === 'menu' ? 'menu' : 'copy-folder');
                if (action === 'view') {
                    closeChordManageSheet(false);
                    openDetailFromList(chordId);
                    return;
                }
                if (action === 'edit') {
                    closeChordManageSheet(false);
                    window.ChordCruise.ui.saveEditor.openExisting({
                        chord: chord,
                        onSaved: function () { renderList(); }
                    });
                    return;
                }
                if (action === 'copy' || action === 'copy-to-folder') {
                    var targetFolderId = action === 'copy-to-folder' ? button.getAttribute('data-target-folder-id') : chord.folderId;
                    var copied = saveChordCopy(chord, targetFolderId);
                    if (!copied) return toast(storageErrorMessage('コードを複製できませんでした'), 'error');
                    closeChordManageSheet(false);
                    renderList();
                    toast(action === 'copy' ? 'コードを複製しました' : '別のフォルダにコードを複製しました');
                    return;
                }
                if (action === 'delete') {
                    var returnFocus = chordManageReturnFocus;
                    closeChordManageSheet(false);
                    confirmDanger('「' + displayChordName(chord.chordName) + '（' + chordFormName(chord) + '）」を削除しますか？この操作は取り消せません。', '削除する', function () {
                        if (!storage().deleteChord(chord.id)) {
                            toast('コードを削除できませんでした', 'error');
                            if (focusTrap()) focusTrap().restoreFocus(returnFocus);
                            return;
                        }
                        renderList();
                        toast('コードを削除しました');
                    }, returnFocus, 'コードを削除');
                }
            });
        });
    }

    function applyLibraryCardTextSizes() {
        var grid = document.getElementById('cc-chordthumb-grid');
        if (grid) grid.setAttribute('data-library-chord-name-size', globalDisplaySize('chordNameSize'));
    }

    function restoreListScroll(previousY) {
        if (previousY !== null && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(function () {
                if (Math.abs(window.scrollY - previousY) > 1) window.scrollTo(0, previousY);
            });
        }
    }

    function refreshListThumbnails() {
        if (view !== 'list') return;
        var previousY = typeof window.scrollY === 'number' ? window.scrollY : null;
        applyLibraryCardTextSizes();
        renderListThumbnails(currentListChords, {
            displayMode: libraryCardDisplayMode(),
            monochrome: libraryCardMonochrome()
        });
        updateLibraryCardDisplayControls();
        restoreListScroll(previousY);
    }

    function updateLibraryCardDisplayControls() {
        var mode = libraryCardDisplayMode();
        var monochrome = libraryCardMonochrome();
        Array.prototype.forEach.call(contentEl().querySelectorAll('[data-library-card-display-mode]'), function (button) {
            var selected = button.getAttribute('data-library-card-display-mode') === mode;
            button.classList.toggle('cc-segment-btn--active', selected);
            button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        var toggle = document.getElementById('cc-library-card-monochrome-toggle');
        if (toggle) {
            toggle.classList.toggle('cc-switch--on', monochrome);
            toggle.setAttribute('aria-checked', monochrome ? 'true' : 'false');
        }
        var state = document.getElementById('cc-library-card-monochrome-state');
        if (state) state.textContent = monochrome ? 'ON' : 'OFF';
    }

    function bindLibraryCardDisplayControls() {
        Array.prototype.forEach.call(contentEl().querySelectorAll('[data-library-card-display-mode]'), function (button) {
            button.addEventListener('click', function () {
                var mode = button.getAttribute('data-library-card-display-mode');
                if (['note', 'solfege', 'degree', 'finger'].indexOf(mode) === -1) return;
                window.ChordCruise.state.settings.libraryCardDisplayMode = mode;
                storage().saveSettings({ libraryCardDisplayMode: mode });
                refreshListThumbnails();
            });
        });
        var toggle = document.getElementById('cc-library-card-monochrome-toggle');
        if (toggle) toggle.addEventListener('click', function () {
            var monochrome = !libraryCardMonochrome();
            window.ChordCruise.state.settings.libraryCardMonochrome = monochrome;
            storage().saveSettings({ libraryCardMonochrome: monochrome });
            refreshListThumbnails();
        });
    }

    function folderManageColorChoicesHtml(folder) {
        var selected = storage().folderColorKey(folder);
        var html = '<div class="cc-folder-color-categories">';
        FOLDER_COLOR_CATEGORIES.forEach(function (category) {
            html += '<section class="cc-folder-color-category" aria-label="' + category.label + 'カラー">' +
                '<h4 class="cc-folder-color-category-title">' + category.label + '</h4>' +
                '<div class="cc-folder-color-grid" role="group" aria-label="' + category.label + 'カラー">';
            category.options.forEach(function (option) {
                var key = option[0];
                var active = key === selected;
                html += '<button type="button" class="cc-folder-color-choice cc-folder-color-' + key + (active ? ' is-selected' : '') + '" data-folder-color-key="' + key + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
                    '<span class="cc-folder-color-swatch" aria-hidden="true"></span><span>' + option[1] + '</span></button>';
            });
            html += '</div></section>';
        });
        return html + '</div>';
    }

    function folderManageMenuHtml(folder, count) {
        var buttons = '';
        buttons += '<button type="button" class="cc-folder-manage-action" data-folder-manage-action="rename">フォルダ名を編集</button>' +
            '<button type="button" class="cc-folder-manage-action" data-folder-manage-action="copy">フォルダをコピー</button>';
        buttons += '<button type="button" class="cc-folder-manage-action" data-folder-manage-action="color">フォルダの色を変更</button>';
        buttons += '<button type="button" class="cc-folder-manage-action cc-folder-manage-action--danger" data-folder-manage-action="delete">フォルダを削除</button>';
        return '<div class="cc-folder-manage-sheet" role="dialog" aria-modal="true" aria-labelledby="cc-folder-manage-title">' +
            '<div class="cc-folder-manage-grabber" aria-hidden="true"></div>' +
            '<div class="cc-folder-manage-heading"><h3 id="cc-folder-manage-title">' + escapeHtml(folder.name) + '</h3><p>' + count + '件のコード</p></div>' +
            '<div class="cc-folder-manage-actions">' + buttons + '</div>' +
            '<button type="button" class="cc-folder-manage-cancel" data-folder-manage-action="close">キャンセル</button>' +
        '</div>';
    }

    function folderManageRenameHtml(folder) {
        return '<div class="cc-folder-manage-sheet" role="dialog" aria-modal="true" aria-labelledby="cc-folder-manage-title">' +
            '<div class="cc-folder-manage-grabber" aria-hidden="true"></div>' +
            '<div class="cc-folder-manage-heading"><h3 id="cc-folder-manage-title">フォルダ名を編集</h3></div>' +
            '<label class="cc-folder-manage-label" for="cc-folder-manage-name">フォルダ名</label>' +
            '<input class="cc-input" id="cc-folder-manage-name" maxlength="24" value="' + escapeHtml(folder.name) + '">' +
            '<div class="cc-folder-manage-confirm-actions"><button type="button" class="cc-btn cc-btn-primary" data-folder-manage-action="rename-save">変更する</button><button type="button" class="cc-btn cc-btn-secondary" data-folder-manage-action="menu">戻る</button></div>' +
        '</div>';
    }

    function folderManageColorHtml(folder) {
        return '<div class="cc-folder-manage-sheet" role="dialog" aria-modal="true" aria-labelledby="cc-folder-manage-title">' +
            '<div class="cc-folder-manage-grabber" aria-hidden="true"></div>' +
            '<div class="cc-folder-manage-heading"><h3 id="cc-folder-manage-title">フォルダの色を変更</h3><p>本棚の背表紙の色を選びます。</p></div>' +
            folderManageColorChoicesHtml(folder) +
            '<button type="button" class="cc-folder-manage-cancel" data-folder-manage-action="menu">戻る</button>' +
        '</div>';
    }

    function showFolderManagePane(folderId, pane) {
        var folder = folderById(folderId);
        if (!folder) {
            closeFolderManageSheet(false);
            return;
        }
        var count = chordCountIn(folder.id, buildFolderCountMap());
        var sheet = ensureFolderManageSheet();
        sheet.dataset.folderId = folder.id;
        sheet.dataset.pane = pane || 'menu';
        sheet.innerHTML = pane === 'rename' ? folderManageRenameHtml(folder) : pane === 'color' ? folderManageColorHtml(folder) : folderManageMenuHtml(folder, count);
        bindFolderManageSheet();
        var dialog = sheet.querySelector('[role="dialog"]');
        if (focusTrap()) focusTrap().focusFirst(dialog || sheet);
        else {
            var focusTarget = sheet.querySelector('input, button');
            if (focusTarget) focusTarget.focus();
        }
    }

    function openFolderManageSheet(folderId, trigger) {
        folderManageReturnFocus = trigger || null;
        var sheet = ensureFolderManageSheet();
        setManagingFolderCard(folderId, true);
        sheet.classList.remove('cc-folder-manage-overlay--hidden');
        document.body.classList.add('cc-folder-manage-open');
        showFolderManagePane(folderId, 'menu');
    }

    function bindFolderManageSheet() {
        var sheet = folderManageSheet;
        if (!sheet) return;
        Array.prototype.forEach.call(sheet.querySelectorAll('[data-folder-manage-action]'), function (button) {
            button.addEventListener('click', function () {
                var id = sheet.dataset.folderId;
                var folder = folderById(id);
                var action = button.getAttribute('data-folder-manage-action');
                if (action === 'close') return closeFolderManageSheet(true);
                if (!folder) return closeFolderManageSheet(false);
                if (action === 'menu' || action === 'rename' || action === 'color') return showFolderManagePane(id, action === 'menu' ? 'menu' : action);
                if (action === 'rename-save') {
                    var name = document.getElementById('cc-folder-manage-name').value.trim();
                    if (!name || !storage().renameFolder(id, name)) return;
                    closeFolderManageSheet(false);
                    renderFolders();
                    toast('フォルダ名を変更しました');
                    return;
                }
                if (action === 'copy') {
                    var copied = storage().copyFolder(id);
                    if (!copied) return toast(storageErrorMessage('フォルダをコピーできませんでした'), 'error');
                    closeFolderManageSheet(false);
                    renderFolders();
                    toast('フォルダをコピーしました');
                    return;
                }
                if (action === 'delete') {
                    var count = chordCountIn(id, buildFolderCountMap());
                    var returnFocus = folderManageReturnFocus;
                    closeFolderManageSheet(false);
                    var deleteMessage = count > 0
                        ? 'フォルダ「' + folder.name + '」を削除しますか？このフォルダと、中にある' + count + '件のコードを完全に削除します。この操作は元に戻せません。'
                        : 'フォルダ「' + folder.name + '」を削除しますか？この空のフォルダを削除します。この操作は元に戻せません。';
                    confirmDanger(deleteMessage, '完全に削除', function () {
                        if (!storage().deleteFolder(id)) {
                            toast('フォルダを削除できませんでした', 'error');
                            if (focusTrap()) focusTrap().restoreFocus(returnFocus);
                            return;
                        }
                        renderFolders();
                        toast(count > 0 ? 'フォルダとコードを完全に削除しました' : '空のフォルダを削除しました');
                    }, returnFocus, 'フォルダを削除');
                }
            });
        });
        Array.prototype.forEach.call(sheet.querySelectorAll('[data-folder-color-key]'), function (button) {
            button.addEventListener('click', function () {
                var id = sheet.dataset.folderId;
                if (!storage().setFolderColor(id, button.getAttribute('data-folder-color-key'))) return toast('色を変更できませんでした', 'error');
                closeFolderManageSheet(false);
                renderFolders();
                toast('フォルダの色を変更しました');
            });
        });
    }


    function buildChordSortRowsHtml(chords) {
        var html = '<div class="cc-sort-list" role="list" aria-label="保存コードの並び順">';
        chords.forEach(function (chord, index) {
            var name = displayChordName(chord.chordName);
            html += '<div class="cc-sort-row" role="listitem">' +
                '<span class="cc-sort-row-main"><span class="cc-sort-row-name">' + escapeHtml(name) + '</span>' +
                '<span class="cc-sort-row-meta">' + escapeHtml(chordFormName(chord)) + '</span></span>' +
                '<span class="cc-sort-row-actions">' +
                    sortStepButtonHtml('entry', chord.id, -1, index === 0, name + 'を上へ移動') +
                    sortStepButtonHtml('entry', chord.id, 1, index === chords.length - 1, name + 'を下へ移動') +
                '</span>' +
            '</div>';
        });
        return html + '</div>';
    }

    function applyLibraryColumns(columns) {
        var normalized = normalizeLibraryColumns(columns);
        var grid = document.getElementById('cc-chordthumb-grid');
        if (grid) grid.setAttribute('data-library-columns', String(normalized));
        Array.prototype.forEach.call(contentEl().querySelectorAll('[data-library-columns-choice]'), function (button) {
            var selected = parseInt(button.getAttribute('data-library-columns-choice'), 10) === normalized;
            button.classList.toggle('cc-segment-btn--active', selected);
            button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        return normalized;
    }

    // ---- ビュー: フォルダ一覧 ----

    function renderFolders() {
        view = 'folders';
        currentDetailChord = null;
        currentListChords = [];
        detailMonochrome = false;
        detailDisplayModeOverride = null;
        entrySortMode = false;
        entrySortFolderId = null;
        setContentLayout('folders');
        folderShelfColumns = currentFolderShelfColumns();
        var folders = storage().loadOrderedFolders();
        var countMap = buildFolderCountMap();
        var html = '<div class="cc-card">' +
            '<div class="cc-lib-sort-head"><h3 class="cc-card-heading">フォルダ</h3>' +
                '<button type="button" class="cc-btn cc-btn-secondary cc-btn--small" id="cc-folder-sort-toggle" aria-pressed="' +
                    (folderSortMode ? 'true' : 'false') + '">' + (folderSortMode ? '完了' : '並び替え') + '</button></div>' +
            buildFolderShelfColumnsHtml() +
            '<div id="cc-folder-shelf-panel" aria-label="フォルダ本棚">';
        if (folderSortMode) {
            html += '<p class="cc-sort-mode-note">移動ボタンを押すたびに並び順を保存します。</p>' + buildFolderSortRowsHtml(folders, countMap);
        } else {
            html += '<div class="' + folderListClasses(false) + '"' + folderShelfAttributes() + '>' +
                buildFolderShelfRowsHtml(folders, countMap, false) + '</div>';
        }
        html += '</div>' + (folderSortMode ? '' :
            '<div class="cc-inline-create" id="cc-folder-create-area">' +
                '<button type="button" class="cc-btn cc-btn-secondary cc-btn--block" id="cc-folder-create-btn">＋ フォルダを作成</button>' +
                '<div class="cc-inline-input-row cc-inline-input-row--hidden" id="cc-folder-create-row">' +
                    '<input type="text" class="cc-input" id="cc-folder-create-input" placeholder="フォルダ名" maxlength="24">' +
                    '<button type="button" class="cc-btn cc-btn-primary cc-btn--small" id="cc-folder-create-ok">作成</button>' +
                    '<button type="button" class="cc-btn cc-btn-secondary cc-btn--small" id="cc-folder-create-cancel">やめる</button>' +
                '</div>' +
                (isProEdition() ? '' :
                    '<a class="cc-save-folder-pro-link" id="cc-folder-pro-link" href="../pro-access.html" target="_blank" rel="noopener" hidden>Pro版の入手方法</a>') +
            '</div>') +
        '</div>';
        contentEl().innerHTML = html;

        document.getElementById('cc-folder-sort-toggle').addEventListener('click', function () {
            folderSortMode = !folderSortMode;
            renderFolders();
        });

        Array.prototype.forEach.call(contentEl().querySelectorAll('[data-folder-shelf-columns-choice]'), function (button) {
            button.addEventListener('click', function () {
                var columns = parseInt(button.getAttribute('data-folder-shelf-columns-choice'), 10);
                if ([2, 3, 4, 5, 6].indexOf(columns) === -1) return;
                folderShelfColumns = columns;
                window.ChordCruise.state.settings.folderShelfColumns = columns;
                storage().saveSettings({ folderShelfColumns: columns });
                renderFolders();
            });
        });

        if (folderSortMode) {
            Array.prototype.forEach.call(contentEl().querySelectorAll('[data-folder-sort-step]'), function (button) {
                button.addEventListener('click', function () {
                    var moved = storage().moveFolder(
                        button.getAttribute('data-sort-id'),
                        parseInt(button.getAttribute('data-folder-sort-step'), 10)
                    );
                    if (!moved) {
                        sortError();
                        return;
                    }
                    renderFolders();
                });
            });
            return;
        }

        Array.prototype.forEach.call(contentEl().querySelectorAll('.cc-folder-card[data-folder-id]'), function (btn) {
            btn.addEventListener('click', function () {
                currentFolderId = btn.dataset.folderId;
                renderList();
            });
        });
        Array.prototype.forEach.call(contentEl().querySelectorAll('[data-folder-manage-id]'), function (button) {
            button.addEventListener('click', function (event) {
                event.stopPropagation();
                openFolderManageSheet(button.getAttribute('data-folder-manage-id'), button);
            });
        });
        document.getElementById('cc-folder-create-btn').addEventListener('click', function () {
            document.getElementById('cc-folder-create-btn').style.display = 'none';
            document.getElementById('cc-folder-create-row').classList.remove('cc-inline-input-row--hidden');
            document.getElementById('cc-folder-create-input').focus();
        });
        document.getElementById('cc-folder-create-cancel').addEventListener('click', renderFolders);
        document.getElementById('cc-folder-create-ok').addEventListener('click', function () {
            var name = document.getElementById('cc-folder-create-input').value.trim();
            if (!name) return;
            if (!storage().createFolder(name)) {
                toast(storageErrorMessage('フォルダを作成できませんでした'), 'error');
                showFolderLimitProLink();
                return;
            }
            renderFolders();
        });
    }

    // ---- ビュー: フォルダ内一覧 ----

    function renderList() {
        closeFolderManageSheet(false);
        closeChordManageSheet(false);
        view = 'list';
        currentDetailChord = null;
        detailMonochrome = false;
        detailDisplayModeOverride = null;
        folderSortMode = false;
        setContentLayout('list');
        var folder = folderById(currentFolderId);
        if (!folder) {
            renderFolders();
            return;
        }
        if (entrySortFolderId !== folder.id) {
            entrySortMode = false;
            entrySortFolderId = null;
        }
        var entries = storage().loadOrderedChordIndex(folder.id);
        var chords = entries.map(function (entry) {
            return storage().loadChord(entry.id);
        }).filter(function (chord) { return !!chord; });
        currentListChords = chords;
        var columns = currentLibraryColumns();

        var html = '<div class="cc-card cc-lib-folder-head">' +
            '<div class="cc-lib-folder-title-row">' +
                '<h3 class="cc-card-heading">📁 ' + escapeHtml(folder.name) + '</h3>' +
                '<div class="cc-lib-folder-actions">' +
                    '<button type="button" class="cc-btn cc-btn-secondary cc-btn--small" id="cc-entry-sort-toggle" aria-pressed="' +
                        (entrySortMode ? 'true' : 'false') + '"' + (chords.length < 2 && !entrySortMode ? ' disabled' : '') + '>' +
                        (entrySortMode ? '完了' : '並び替え') + '</button>' +
                '</div>' +
            '</div>' +
            buildLibraryColumnsControlHtml(columns) +
            (entrySortMode ? '' : buildLibraryCardDisplayControlsHtml()) +
            (entrySortMode ? '<p class="cc-sort-mode-note">各カードの矢印を押すたびに並び順を保存します。</p>' : '') +
        '</div>';

        if (chords.length === 0) {
            html += '<div class="cc-card cc-placeholder-card"><p>このフォルダにはまだコードがありません。「コードを調べる」からCAGEDフォームを保存できます。</p></div>';
        } else {
            html += buildChordThumbnailGridHtml(chords, columns, entrySortMode);
        }
        contentEl().innerHTML = html;

        document.getElementById('cc-entry-sort-toggle').addEventListener('click', function () {
            entrySortMode = !entrySortMode;
            entrySortFolderId = entrySortMode ? folder.id : null;
            renderList();
        });

        if (entrySortMode) {
            renderListThumbnails(chords);
            Array.prototype.forEach.call(contentEl().querySelectorAll('[data-entry-sort-step]'), function (button) {
                button.addEventListener('click', function () {
                    var moved = storage().moveChord(
                        button.getAttribute('data-sort-id'),
                        folder.id,
                        parseInt(button.getAttribute('data-entry-sort-step'), 10)
                    );
                    if (!moved) {
                        sortError();
                        return;
                    }
                    renderList();
                });
            });
            return;
        }

        Array.prototype.forEach.call(contentEl().querySelectorAll('[data-library-columns-choice]'), function (button) {
            button.addEventListener('click', function () {
                var nextColumns = applyLibraryColumns(parseInt(button.getAttribute('data-library-columns-choice'), 10));
                window.ChordCruise.state.settings.libraryColumns = nextColumns;
                storage().saveSettings({ libraryColumns: nextColumns });
            });
        });
        bindLibraryCardDisplayControls();
        var folderExportButton = document.getElementById('cc-library-folder-export-btn');
        if (folderExportButton) {
            folderExportButton.disabled = chords.length === 0;
            folderExportButton.addEventListener('click', function () {
                confirmExport(folderExportButton, function () {
                    exportCurrentFolder(folder, currentListChords);
                });
            });
        }

        if (chords.length) {
            renderListThumbnails(chords);
            document.getElementById('cc-chordthumb-grid').addEventListener('click', function (event) {
                var menu = event.target.closest('[data-chord-manage-id]');
                if (menu) {
                    event.preventDefault();
                    event.stopPropagation();
                    openChordManageSheet(menu.getAttribute('data-chord-manage-id'), menu);
                    return;
                }
                var card = event.target.closest('.cc-chordthumb-card');
                if (!card) return;
                openDetailFromList(card.dataset.chordId);
            });
        }

    }

    // ---- ビュー: 保存コード詳細 ----

    function chordUseFlats(chord) {
        if (chord && chord.keyContext && typeof chord.keyContext.tonicPc === 'number') {
            return theory().keyUsesFlats(chord.keyContext.tonicPc, chord.keyContext.mode);
        }
        return /♭/.test(chord && chord.chordName ? chord.chordName : '');
    }

    /** 保存schemaを増やさず、semantic interval情報から表示用degreeを復元する。 */
    function savedDegreeLabels(chord) {
        var intervals = chord && Array.isArray(chord.intervals) ? chord.intervals.slice() : [];
        var tensionIntervals = window.ChordCruise.chordModel.tensionIntervalsForPcs(
            chord && chord.rootPc,
            savedTensionPcs(chord)
        );
        var tensionLabelsByInterval = {};
        tensionIntervals.forEach(function (interval) {
            tensionLabelsByInterval[interval % 12] = window.ChordCruise.chordModel.TENSION_LABELS[interval] || theory().degreeLabels([interval % 12])[0];
        });
        var coreIntervals = intervals.filter(function (interval) {
            return !Object.prototype.hasOwnProperty.call(tensionLabelsByInterval, interval);
        });
        var qualityKey = chord && chord.qualityKey;
        if (!qualityKey || !theory().QUALITIES[qualityKey] ||
            !theory().QUALITIES[qualityKey].intervals.every(function (interval, index) { return coreIntervals[index] === interval; }) ||
            theory().QUALITIES[qualityKey].intervals.length !== coreIntervals.length) {
            qualityKey = theory().identifyQuality(coreIntervals);
        }
        var coreLabels = theory().degreeLabelsForQuality(qualityKey, coreIntervals);
        var coreIndex = 0;
        return intervals.map(function (interval) {
            if (Object.prototype.hasOwnProperty.call(tensionLabelsByInterval, interval)) {
                return tensionLabelsByInterval[interval];
            }
            return coreLabels[coreIndex++];
        });
    }

    /** chordNameを解析せず、保存recordの構造だけから表示用音名を再計算する。 */
    function savedSpelledNoteNames(chord) {
        if (!chord || typeof chord.rootPc !== 'number' || !Array.isArray(chord.intervals)) return null;
        try {
            return theory().spellChordNotes({
                rootPc: chord.rootPc,
                rootName: window.ChordCruise.chordModel.CUSTOM_ROOT_NAMES[chord.rootPc],
                qualityKey: chord.qualityKey || theory().identifyQuality(chord.intervals),
                intervals: chord.intervals,
                degreeLabels: savedDegreeLabels(chord),
                keyContext: chord.keyContext || null
            });
        } catch (error) {
            return null;
        }
    }

    function detailDisplayMode() {
        if (['note', 'solfege', 'degree', 'finger'].indexOf(detailDisplayModeOverride) !== -1) {
            return detailDisplayModeOverride;
        }
        var mode = window.ChordCruise.state.settings.fretboardDisplayMode;
        return ['note', 'solfege', 'degree', 'finger'].indexOf(mode) !== -1 ? mode : 'note';
    }

    function detailMarkerLabel(chord, note, requestedMode, spelledNoteNames) {
        var mode = requestedMode || detailDisplayMode();
        if (mode === 'finger') {
            if (note.finger != null) return FINGER_LABELS[note.finger] || '';
            return note.fingeringWarning === true ? '⚠' : '';
        }
        var openPc = theory().OPEN_STRINGS[6 - note.string];
        var pc = (openPc + note.fret) % 12;
        var noteIndex = Array.isArray(chord.intervals) ? chord.intervals.indexOf(note.interval) : -1;
        var spelled = spelledNoteNames && spelledNoteNames[noteIndex];
        if (mode === 'solfege') return theory().solfegeNameForSpelling(spelled) || theory().solfegeName(pc, chordUseFlats(chord));
        if (mode === 'degree') {
            var qualityKey = theory().identifyQuality(chord.intervals);
            var intervalIndex = Array.isArray(chord.intervals) ? chord.intervals.indexOf(note.interval) : -1;
            var labels = theory().degreeLabelsForQuality(qualityKey, chord.intervals || []);
            return intervalIndex !== -1 ? labels[intervalIndex] : theory().degreeLabels([note.interval])[0];
        }
        if (spelledNoteNames && noteIndex !== -1 && spelledNoteNames[noteIndex]) {
            return spelledNoteNames[noteIndex];
        }
        return theory().noteName(pc, chordUseFlats(chord));
    }

    function detailFingeringAccessibleLabel(note) {
        var position = note.fret === 0 ? '開放弦' : note.fret + 'フレット';
        var state;
        if (note.fingeringWarning === true && note.finger == null) state = '運指警告';
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

    function roleForChordInterval(chord, interval) {
        // 保存recordのintervalsは元コードの構成音を保持する。notesだけにある音は
        // 編集で追加された非構成音として、schemaを増やさず表示専用roleへ分ける。
        if (chord && Array.isArray(chord.intervals) && chord.intervals.indexOf(interval) === -1) return 'non-chord';
        var qualityKey = chord && (chord.qualityKey || theory().identifyQuality(chord.intervals || []));
        if (qualityKey === '6' && interval === 9) return 'sixth';
        if (qualityKey === 'm6' && interval === 9) return 'sixth';
        return roleForInterval(interval);
    }

    function roleForBassOverlay(overlay) {
        if (!overlay || overlay.chordToneIndex === null) return 'non-chord';
        var role = roleForInterval(overlay.interval);
        return role === 'third' || role === 'fifth' ? role : 'non-chord';
    }

    function savedBassPc(chord) {
        return chord && typeof chord.bassPc === 'number' && Math.floor(chord.bassPc) === chord.bassPc && chord.bassPc >= 0 && chord.bassPc <= 11
            ? chord.bassPc
            : null;
    }

    function savedTensionPcs(chord) {
        var rootPc = chord && chord.rootPc;
        var chordModel = window.ChordCruise.chordModel;
        if (!chordModel || typeof chordModel.tensionIntervalsForPcs !== 'function' || typeof chordModel.tensionPcsForIntervals !== 'function') return [];
        return chordModel.tensionPcsForIntervals(
            rootPc,
            chordModel.tensionIntervalsForPcs(rootPc, chord && chord.tensionPcs)
        );
    }

    function bassFingeringFor(chord, stringNum, fret) {
        var entries = chord && Array.isArray(chord.bassFingerings) ? chord.bassFingerings : [];
        return entries.filter(function (entry) {
            return entry && [4, 5, 6].indexOf(entry.string) !== -1 && entry.string === stringNum && typeof entry.fret === 'number' && Math.floor(entry.fret) === entry.fret && entry.fret === fret && FINGER_CYCLE.indexOf(entry.finger) !== -1;
        })[0] || null;
    }

    function tensionFingeringFor(chord, stringNum, fret, pc) {
        var entries = chord && Array.isArray(chord.tensionFingerings) ? chord.tensionFingerings : [];
        return entries.filter(function (entry) {
            return entry && [1, 2, 3].indexOf(entry.string) !== -1 && entry.string === stringNum && typeof entry.fret === 'number' && Math.floor(entry.fret) === entry.fret && entry.fret === fret && entry.pc === pc && FINGER_CYCLE.indexOf(entry.finger) !== -1;
        })[0] || null;
    }

    function savedBassFingeringLabel(chord, overlay) {
        var entry = bassFingeringFor(chord, overlay.string, overlay.fret);
        if (!entry) return '';
        if (entry.pendingDelete === true) return '';
        if (entry.finger != null) return FINGER_LABELS[entry.finger] || '';
        return entry.fingeringWarning === true ? '⚠' : '';
    }

    function savedBassAccessibleLabel(chord, overlay) {
        var entry = bassFingeringFor(chord, overlay.string, overlay.fret);
        var state = entry && entry.pendingDelete === true ? '消去予定' : (entry && entry.finger != null ? (FINGER_LABELS[entry.finger] || '') + '指' : (entry && entry.fingeringWarning ? '運指警告' : '未指定'));
        return overlay.string + '弦 ' + (overlay.fret === 0 ? '開放弦' : overlay.fret + 'フレット') + '、ベース候補、現在 ' + state + '。運指を変更';
    }

    function savedTensionFingeringLabel(chord, overlay) {
        var entry = tensionFingeringFor(chord, overlay.string, overlay.fret, overlay.pc);
        if (!entry || entry.pendingDelete === true) return '';
        if (entry.finger != null) return FINGER_LABELS[entry.finger] || '';
        return entry.fingeringWarning === true ? '⚠' : '';
    }

    function savedTensionAccessibleLabel(chord, overlay) {
        var entry = tensionFingeringFor(chord, overlay.string, overlay.fret, overlay.pc);
        var state = entry && entry.pendingDelete === true ? '消去予定' : (entry && entry.finger != null ? (FINGER_LABELS[entry.finger] || '') + '指' : (entry && entry.fingeringWarning ? '運指警告' : '未指定'));
        return overlay.string + '弦 ' + (overlay.fret === 0 ? '開放弦' : overlay.fret + 'フレット') + '、テンション候補、現在 ' + state + '。運指を変更';
    }

    function savedBassSpelledNoteName(chord, overlay) {
        var degreeIndex = (chord.intervals || []).indexOf(overlay.interval);
        var degreeLabels = savedDegreeLabels(chord);
        var degreeLabel = degreeIndex !== -1
            ? degreeLabels[degreeIndex]
            : window.ChordCruise.chordModel.bassDegreeLabel(overlay.interval);
        try {
            return theory().spellBassNote({
                rootPc: chord.rootPc,
                rootName: window.ChordCruise.chordModel.CUSTOM_ROOT_NAMES[chord.rootPc],
                bassPc: overlay.pc,
                bassInterval: overlay.interval,
                bassDegreeLabel: degreeLabel,
                keyContext: chord.keyContext || null
            });
        } catch (error) {
            return window.ChordCruise.chordModel.bassNoteName(overlay.pc);
        }
    }

    function bassMarkerLabel(chord, overlay, mode, spelledNoteNames) {
        if (mode === 'finger') return '';
        var spelled = savedBassSpelledNoteName(chord, overlay);
        if (mode === 'solfege') return theory().solfegeNameForSpelling(spelled) || theory().solfegeName(overlay.pc, window.ChordCruise.chordModel.bassUsesFlats(overlay.pc));
        if (mode === 'degree') {
            var degreeIndex = (chord.intervals || []).indexOf(overlay.interval);
            var degreeLabels = theory().degreeLabelsForQuality(theory().identifyQuality(chord.intervals), chord.intervals || []);
            return degreeIndex !== -1 ? degreeLabels[degreeIndex] : window.ChordCruise.chordModel.bassDegreeLabel(overlay.interval);
        }
        return spelled;
    }

    function mergeSavedBassOverlay(chord, frets, markers, mode, spelledNoteNames, editable) {
        var bassPc = savedBassPc(chord);
        if (bassPc === null) return markers;
        var min = Math.min.apply(null, frets);
        var max = Math.max.apply(null, frets);
        var overlays = window.ChordCruise.chordModel.bassOverlayNotes({
            bassPc: bassPc, rootPc: chord.rootPc, intervals: chord.intervals || [],
            startFret: min, endFret: max, targetStrings: [6, 5, 4]
        }).filter(function (note) { return frets.indexOf(note.fret) !== -1; });
        var bySlot = {};
        markers.forEach(function (marker) { bySlot[marker.string + ':' + marker.fret] = marker; });
        overlays.forEach(function (overlay) {
            var key = overlay.string + ':' + overlay.fret;
            var bassEntry = bassFingeringFor(chord, overlay.string, overlay.fret);
            // 通常の本棚／SVG／PNGは保存済み削除候補を描画しない。編集画面だけが復元する。
            if (bassEntry && bassEntry.pendingDelete === true) return;
            if (bySlot[key]) { bySlot[key].isBassCandidate = true; return; }
            var marker = {
                string: overlay.string, fret: overlay.fret,
                label: mode === 'finger' ? savedBassFingeringLabel(chord, overlay) : bassMarkerLabel(chord, overlay, mode, spelledNoteNames),
                role: roleForBassOverlay(overlay), isOverlay: true, overlayType: 'bass',
                isBassCandidate: true, finger: (bassEntry || {}).finger || null,
                fingeringWarning: !!((bassEntry || {}).fingeringWarning),
                pendingDelete: false,
                tappable: editable && mode === 'finger', ariaLabel: editable && mode === 'finger' ? savedBassAccessibleLabel(chord, overlay) : ''
            };
            markers.push(marker);
            bySlot[key] = marker;
        });
        return markers;
    }

    function tensionMarkerLabel(chord, overlay, mode, spelledNoteNames) {
        if (mode === 'finger') return '';
        var noteIndex = (chord.intervals || []).indexOf(overlay.interval);
        var spelled = spelledNoteNames && spelledNoteNames[noteIndex];
        if (mode === 'solfege') return theory().solfegeNameForSpelling(spelled) || theory().solfegeName(overlay.pc, chordUseFlats(chord));
        if (mode === 'degree') return window.ChordCruise.chordModel.TENSION_LABELS[overlay.tension] || theory().degreeLabels([overlay.interval])[0];
        if (spelled) return spelled;
        return theory().noteName(overlay.pc, chordUseFlats(chord));
    }

    function mergeSavedTensionOverlay(chord, frets, markers, mode, spelledNoteNames, editable) {
        var tensionPcs = savedTensionPcs(chord);
        if (!tensionPcs.length) return markers;
        var min = Math.min.apply(null, frets);
        var max = Math.max.apply(null, frets);
        var overlays = window.ChordCruise.chordModel.tensionOverlayNotes({
            rootPc: chord.rootPc,
            tensionIntervals: window.ChordCruise.chordModel.tensionIntervalsForPcs(chord.rootPc, tensionPcs),
            startFret: min, endFret: max
        }).filter(function (note) { return frets.indexOf(note.fret) !== -1; });
        var bySlot = {};
        markers.forEach(function (marker) { bySlot[marker.string + ':' + marker.fret] = marker; });
        overlays.forEach(function (overlay) {
            var key = overlay.string + ':' + overlay.fret;
            var tensionEntry = tensionFingeringFor(chord, overlay.string, overlay.fret, overlay.pc);
            if (tensionEntry && tensionEntry.pendingDelete === true) return;
            if (bySlot[key]) { bySlot[key].isTensionCandidate = true; return; }
            markers.push({
                string: overlay.string, fret: overlay.fret, pc: overlay.pc,
                label: mode === 'finger' ? savedTensionFingeringLabel(chord, overlay) : tensionMarkerLabel(chord, overlay, mode, spelledNoteNames),
                role: roleForInterval(overlay.interval), isOverlay: true, overlayType: 'tension',
                isTensionCandidate: true, finger: (tensionEntry || {}).finger || null,
                fingeringWarning: !!((tensionEntry || {}).fingeringWarning), pendingDelete: false,
                tappable: editable && mode === 'finger', ariaLabel: editable && mode === 'finger' ? savedTensionAccessibleLabel(chord, overlay) : ''
            });
            bySlot[key] = markers[markers.length - 1];
        });
        return markers;
    }

    /** 保存範囲だけから表示列を作る。開放列と離れた範囲も余計なフレットを挟まない。 */
    function savedFrets(chord) {
        var range = chord && chord.fretRange ? chord.fretRange : {};
        var notes = chord && Array.isArray(chord.notes) ? chord.notes : [];
        var includesOpen = typeof range.includesOpen === 'boolean'
            ? range.includesOpen
            : notes.some(function (note) { return note && note.fret === 0; });
        var min = typeof range.min === 'number' && Math.floor(range.min) === range.min ? range.min : null;
        var max = typeof range.max === 'number' && Math.floor(range.max) === range.max ? range.max : null;
        var hasExplicitRange = min !== null && max !== null && max >= min;
        var frets = [];
        if (includesOpen) frets.push(0);
        if (hasExplicitRange) {
            var fret;
            for (fret = Math.max(1, min); fret <= max; fret++) frets.push(fret);
        }
        if (!hasExplicitRange) {
            notes.forEach(function (note) {
                if (!note || typeof note.fret !== 'number' || note.fret < 0) return;
                if (note.fret === 0 && !includesOpen) return;
                if (frets.indexOf(note.fret) === -1) frets.push(note.fret);
            });
            frets.sort(function (a, b) { return a - b; });
        }
        if (!frets.length) frets.push(includesOpen ? 0 : Math.max(1, min || 1));
        return frets;
    }

    function notesInSavedRange(chord, frets) {
        return (Array.isArray(chord.notes) ? chord.notes : []).filter(function (note) {
            return note && note.pendingDelete !== true && frets.indexOf(note.fret) !== -1;
        });
    }

    /** 詳細・一覧・書き出しが同じ保存範囲と座標データを使う。 */
    function savedDiagramOptions(chord, options) {
        var opts = options || {};
        var frets = savedFrets(chord);
        var notes = notesInSavedRange(chord, frets);
        var mode = opts.mode || detailDisplayMode();
        var spelledNoteNames = savedSpelledNoteNames(chord) || theory().diatonicNoteNamesForContext(
            chord.keyContext,
            chord.rootPc,
            chord.intervals
        );
        var markers = notes.map(function (note) {
            return {
                string: note.string,
                fret: note.fret,
                label: detailMarkerLabel(chord, note, mode, spelledNoteNames),
                role: roleForChordInterval(chord, note.interval),
                fingeringWarning: mode === 'finger' && note.fingeringWarning === true && note.finger == null,
                tappable: !!opts.tappable,
                ariaLabel: opts.tappable ? detailFingeringAccessibleLabel(note) : ''
            };
        });
        markers = mergeSavedBassOverlay(chord, frets, markers, mode, spelledNoteNames, !!opts.tappable);
        markers = mergeSavedTensionOverlay(chord, frets, markers, mode, spelledNoteNames, !!opts.tappable);
        return {
            frets: frets,
            markers: markers,
            barres: window.ChordCruise.caged.detectBarres(notes),
            mutedStrings: Array.isArray(chord.mutedStrings) ? chord.mutedStrings : [],
            monochrome: !!opts.monochrome,
            fretNumberHighlightMode: 'all',
            // 詳細画面だけが使うhost単位の設定。静的な一覧SVGには渡さない。
            markerLabelSize: opts.markerLabelSize
        };
    }

    function hasFirstFretBarre(diagramOptions) {
        return Array.isArray(diagramOptions && diagramOptions.barres) && diagramOptions.barres.some(function (barre) {
            return barre && barre.fret === 1;
        });
    }

    // 白黒一覧では最下弦の丸マーカーが番号帯へ最も近づく。Bass overlayなどの
    // 二重リングもmarkersへ統合済みなので、見た目の種別ではなく表示マーカーで判定する。
    function hasSixthStringMarker(diagramOptions) {
        return Array.isArray(diagramOptions && diagramOptions.markers) && diagramOptions.markers.some(function (marker) {
            return marker && marker.string === 6;
        });
    }

    /** 一覧表示とフォルダPNGが同じ表示条件・安全余白を使う。 */
    function listDiagramOptions(chord, options) {
        var opts = options || {};
        var columns = normalizeLibraryColumns(opts.columns);
        var mode = ['note', 'solfege', 'degree', 'finger'].indexOf(opts.displayMode) !== -1
            ? opts.displayMode
            : libraryCardDisplayMode();
        var monochrome = typeof opts.monochrome === 'boolean' ? opts.monochrome : libraryCardMonochrome();
        var diagramOptions = savedDiagramOptions(chord, { thumbnail: true, mode: mode, monochrome: monochrome });
        diagramOptions.svgClass = 'cc-fb-svg cc-fb-static-svg cc-chordthumb-svg';
        diagramOptions.fretNumberScale = typeof opts.fretNumberScale === 'number'
            ? opts.fretNumberScale
            : libraryCardFretNumberScale(globalDisplaySize('fretNumberSize'), columns);
        diagramOptions.markerLabelScale = typeof opts.markerLabelScale === 'number'
            ? opts.markerLabelScale
            : libraryCardTextScale(globalDisplaySize('fretboardMarkerLabelSize'), columns);
        var hasOpenColumn = diagramOptions.frets[0] === 0;
        var needsFretNumberOffset = hasOpenColumn || hasFirstFretBarre(diagramOptions) || hasSixthStringMarker(diagramOptions);
        if (monochrome && hasOpenColumn) {
            diagramOptions.openStringNutOnly = true;
            diagramOptions.monochromeViewportLeftCrop = 12;
            diagramOptions.svgPadding = {
                top: 14,
                right: 22,
                bottom: 18,
                left: 4,
                fillMonochromeBackground: true
            };
        }
        diagramOptions.monochromeFretNumberYOffset = monochrome && needsFretNumberOffset ? 5 : 0;
        return diagramOptions;
    }

    function renderListThumbnails(chords, options) {
        var opts = options || {};
        var grid = document.getElementById('cc-chordthumb-grid');
        var columns = normalizeLibraryColumns(parseInt(grid && grid.getAttribute('data-library-columns'), 10));
        var mode = ['note', 'solfege', 'degree', 'finger'].indexOf(opts.displayMode) !== -1
            ? opts.displayMode
            : libraryCardDisplayMode();
        var monochrome = typeof opts.monochrome === 'boolean'
            ? opts.monochrome
            : libraryCardMonochrome();
        var byId = {};
        chords.forEach(function (chord) { byId[chord.id] = chord; });
        Array.prototype.forEach.call(contentEl().querySelectorAll('[data-chord-thumb]'), function (host) {
            var chord = byId[host.getAttribute('data-chord-thumb')];
            if (!chord) return;
            var diagramOptions = listDiagramOptions(chord, {
                columns: columns,
                displayMode: mode,
                monochrome: monochrome,
                fretNumberScale: opts.fretNumberScale,
                markerLabelScale: opts.markerLabelScale
            });
            host.classList.toggle('cc-chordthumb-board--monochrome', monochrome);
            var card = host.closest('.cc-chordthumb-card');
            if (card) card.classList.toggle('cc-chordthumb-card--monochrome', monochrome);
            host.innerHTML = window.ChordCruise.ui.fretboard.buildStaticSvg(diagramOptions);
        });
    }

    function folderExportCardSize(columns) {
        return {
            width: { 1: 520, 2: 420, 3: 320, 4: 260 }[columns],
            height: { 1: 290, 2: 270, 3: 225, 4: 190 }[columns]
        };
    }

    function folderExportTitleSize(size, columns) {
        var value = { xsmall: 16, small: 18, medium: 20, large: 22, xlarge: 28 }[size] || 20;
        var scale = { 1: 1.48, 2: 1.24, 3: 1.12, 4: 0.87 }[normalizeLibraryColumns(columns)];
        return Math.round(value * scale);
    }

    function positionNestedSvg(svg, x, y, width, height) {
        return String(svg)
            .replace(/\swidth="[^"]*"/, ' width="' + width + '"')
            .replace(/\sheight="[^"]*"/, ' height="' + height + '"')
            .replace(/\spreserveAspectRatio="[^"]*"/, '')
            .replace('<svg ', '<svg x="' + x + '" y="' + y + '" preserveAspectRatio="xMidYMid meet" ');
    }

    function buildFolderExportSvg(folder, chords) {
        var columns = currentLibraryColumns();
        var mode = libraryCardDisplayMode();
        var monochrome = libraryCardMonochrome();
        var size = folderExportCardSize(columns);
        var gap = 12;
        var outerPadding = 24;
        var headingHeight = 54;
        var rowCount = Math.max(1, Math.ceil(chords.length / columns));
        var width = outerPadding * 2 + size.width * columns + gap * (columns - 1);
        var height = outerPadding * 2 + headingHeight + size.height * rowCount + gap * (rowCount - 1);
        var darkBackground = '#0b0a09';
        var cardBackground = monochrome ? '#ffffff' : '#191713';
        var cardStroke = monochrome ? '#9a9a9a' : '#65552f';
        var titleColor = monochrome ? '#111111' : '#f0e0b8';
        var nameSize = folderExportTitleSize(globalDisplaySize('chordNameSize'), columns);
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' +
            '<rect width="100%" height="100%" fill="' + (monochrome ? '#ffffff' : darkBackground) + '"/>' +
            '<text x="' + (width / 2) + '" y="' + (outerPadding + 27) + '" text-anchor="middle" style="font-family:Arial,&quot;Hiragino Sans&quot;,sans-serif;font-size:26px;font-weight:700;fill:' + titleColor + '">' + escapeHtml(folder.name) + '</text>';
        chords.forEach(function (chord, index) {
            var column = index % columns;
            var row = Math.floor(index / columns);
            var x = outerPadding + column * (size.width + gap);
            var y = outerPadding + headingHeight + row * (size.height + gap);
            var diagramOptions = listDiagramOptions(chord, {
                columns: columns,
                displayMode: mode,
                monochrome: monochrome
            });
            var cardSvg = window.ChordCruise.ui.fretboard.buildStaticSvg(diagramOptions);
            svg += '<rect x="' + x + '" y="' + y + '" width="' + size.width + '" height="' + size.height + '" rx="10" fill="' + cardBackground + '" stroke="' + cardStroke + '"/>' +
                (monochrome ? '<rect x="' + (x + 6) + '" y="' + (y + 6) + '" width="' + (size.width - 12) + '" height="' + (nameSize + 12) + '" rx="5" fill="#ffffff"/>' : '') +
                '<text x="' + (x + size.width / 2) + '" y="' + (y + nameSize + 8) + '" text-anchor="middle" style="font-family:Arial,&quot;Hiragino Sans&quot;,sans-serif;font-size:' + nameSize + 'px;font-weight:700;fill:' + titleColor + '">' + escapeHtml(displayChordName(chord.chordName)) + '</text>' +
                positionNestedSvg(cardSvg, x + 8, y + nameSize + 17, size.width - 16, size.height - nameSize - 25);
        });
        svg += '</svg>';
        // Proは保存数が無制限のため、長い1列一覧でもCanvas上限を超えにくい倍率へ抑える。
        return { svg: svg, width: width, height: height, scale: Math.min(2, 16000 / width, 16000 / height) };
    }

    function setFolderExportStatus(text, isError) {
        var status = document.getElementById('cc-library-folder-export-status');
        if (!status) return;
        status.textContent = text || '';
        status.classList.toggle('cc-lib-export-status--error', !!isError);
        status.style.display = text ? '' : 'none';
    }

    function exportCurrentFolder(folder, chords) {
        var button = document.getElementById('cc-library-folder-export-btn');
        if (!button || button.disabled || !canExport() || !chords.length) return Promise.resolve(null);
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        setFolderExportStatus('', false);
        var exportSvg = buildFolderExportSvg(folder, chords);
        var filename = window.ChordCruise.ui.chordExport.safePart(folder.name) + '_コード本棚.png';
        return window.ChordCruise.ui.chordExport.exportSvgPng(exportSvg, filename).then(function (result) {
            var suffix = result.method === 'new-tab' ? '（新しいタブに表示）' : '';
            setFolderExportStatus(result.filename + ' を作成しました ' + result.width + '×' + result.height + 'px' + suffix, false);
            return result;
        }).catch(function (err) {
            setFolderExportStatus(err && err.message ? err.message : 'PNGを書き出せませんでした。', true);
            return null;
        }).then(function (result) {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            return result;
        });
    }

    function renderDetailFretboard(chord) {
        var host = document.getElementById('cc-lib-fb');
        if (!host) return;
        var card = document.getElementById('cc-lib-diagram-card');
        if (card) card.classList.toggle('cc-lib-diagram-card--monochrome', detailMonochrome);
        var fb = window.ChordCruise.ui.fretboard;
        var prevScroll = fb.getScrollLeft(host);
        var diagramOptions = savedDiagramOptions(chord, {
            mode: detailDisplayMode(),
            monochrome: detailMonochrome,
            tappable: true,
            markerLabelSize: (window.ChordCruise.state && window.ChordCruise.state.settings && window.ChordCruise.state.settings.fretboardMarkerLabelSize) || 'medium'
        });
        // 本棚詳細の白黒ONかつ開放弦フォームだけは、開放弦列を0フレット枠ではなくナットとして表示する。
        var detailHasOpenColumn = diagramOptions.frets[0] === 0;
        var detailNeedsFretNumberOffset = detailHasOpenColumn || hasFirstFretBarre(diagramOptions) || hasSixthStringMarker(diagramOptions);
        diagramOptions.openStringNutOnly = detailMonochrome && detailHasOpenColumn;
        diagramOptions.monochromeViewportLeftCrop = detailMonochrome && detailHasOpenColumn ? 12 : 0;
        diagramOptions.monochromeFretNumberYOffset = detailMonochrome && detailNeedsFretNumberOffset ? 5 : 0;
        diagramOptions.monochromeRightPadding = detailMonochrome && detailHasOpenColumn ? 18 : 0;
        diagramOptions.scrollToFret = chord.fretRange
            ? Math.round((chord.fretRange.min + chord.fretRange.max) / 2)
            : null;
        diagramOptions.preserveScroll = typeof prevScroll === 'number' && prevScroll > 0 ? prevScroll : null;
        diagramOptions.onSlotTap = function (stringNum, fret) {
            var source = currentDetailChord && currentDetailChord.id === chord.id ? currentDetailChord : chord;
            var candidate = cloneChordRecord(source);
            var target = null;
            (candidate.notes || []).forEach(function (note) {
                if (note.string === stringNum && note.fret === fret) target = note;
            });
            if (!target) {
                var overlay = diagramOptions.markers.filter(function (marker) {
                    return marker.isOverlay && (marker.isBassCandidate || marker.isTensionCandidate) && marker.string === stringNum && marker.fret === fret;
                })[0];
                if (!overlay) return;
                var existing = overlay.isBassCandidate
                    ? bassFingeringFor(candidate, stringNum, fret)
                    : tensionFingeringFor(candidate, stringNum, fret, overlay.pc);
                var currentState = existing && existing.pendingDelete ? 'delete' : (existing && existing.fingeringWarning ? 'warning' : (existing ? existing.finger : null));
                var nextState = BASS_FINGER_CYCLE[(BASS_FINGER_CYCLE.indexOf(currentState) + 1) % BASS_FINGER_CYCLE.length];
                if (overlay.isBassCandidate) {
                    candidate.bassFingerings = (candidate.bassFingerings || []).filter(function (entry) {
                        return !(entry && entry.string === stringNum && entry.fret === fret);
                    });
                    if (nextState !== null) {
                        candidate.bassFingerings.push({
                            string: stringNum, fret: fret,
                            finger: nextState === 'warning' || nextState === 'delete' ? null : nextState,
                            fingeringWarning: nextState === 'warning', pendingDelete: nextState === 'delete'
                        });
                    }
                    if (!candidate.bassFingerings.length) delete candidate.bassFingerings;
                } else {
                    candidate.tensionFingerings = (candidate.tensionFingerings || []).filter(function (entry) {
                        return !(entry && entry.string === stringNum && entry.fret === fret && entry.pc === overlay.pc);
                    });
                    if (nextState !== null) {
                        candidate.tensionFingerings.push({
                            string: stringNum, fret: fret, pc: overlay.pc,
                            finger: nextState === 'warning' || nextState === 'delete' ? null : nextState,
                            fingeringWarning: nextState === 'warning', pendingDelete: nextState === 'delete'
                        });
                    }
                    if (!candidate.tensionFingerings.length) delete candidate.tensionFingerings;
                }
            } else {
                if (target.fingeringWarning === true && target.finger == null) {
                    target.finger = 'T';
                    target.fingeringWarning = false;
                } else {
                    var pos = FINGER_CYCLE.indexOf(target.finger);
                    target.finger = FINGER_CYCLE[(pos + 1) % FINGER_CYCLE.length];
                    if (target.finger != null) target.fingeringWarning = false;
                }
            }
            var saved = storage().saveChord(candidate);
            if (!saved) {
                toast('運指を保存できませんでした', 'error');
                return;
            }
            currentDetailChord = saved;
            renderDetailFretboard(saved);
        };
        fb.render(host, diagramOptions);
    }

    function updateLibModeSegments() {
        var mode = detailDisplayMode();
        ['note', 'solfege', 'degree', 'finger'].forEach(function (m) {
            var el = document.getElementById('cc-libmode-' + m);
            if (el) el.classList.toggle('cc-segment-btn--active', mode === m);
        });
    }

    function updateMonochromeControl() {
        var toggle = document.getElementById('cc-lib-monochrome-toggle');
        if (!toggle) return;
        toggle.classList.toggle('cc-switch--on', detailMonochrome);
        toggle.setAttribute('aria-checked', detailMonochrome ? 'true' : 'false');
        var state = document.getElementById('cc-lib-monochrome-state');
        if (state) state.textContent = detailMonochrome ? 'ON' : 'OFF';
    }

    function setExportStatus(text, isError) {
        var status = document.getElementById('cc-lib-export-status');
        if (!status) return;
        status.textContent = text || '';
        status.classList.toggle('cc-lib-export-status--error', !!isError);
        status.style.display = text ? '' : 'none';
    }

    function exportCurrentChord(chord) {
        var button = document.getElementById('cc-lib-export-btn');
        if (!button || button.disabled || !canExport()) return Promise.resolve(null);
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        setExportStatus('', false);
        var rangeText = window.ChordCruise.caged.formatFretRange(chord.fretRange);
        var diagramOptions = savedDiagramOptions(chord, {
            mode: detailDisplayMode(),
            monochrome: detailMonochrome
        });
        // 白黒かつ開放弦フォームの書き出しも本棚プレビューと同じく、開放弦列を
        // 0フレット枠ではなくナットとして扱う。カラーと0Fなしフォームは従来どおり。
        var exportHasOpenColumn = diagramOptions.frets[0] === 0;
        var exportNeedsFretNumberOffset = exportHasOpenColumn || hasFirstFretBarre(diagramOptions) || hasSixthStringMarker(diagramOptions);
        diagramOptions.openStringNutOnly = detailMonochrome && exportHasOpenColumn;
        diagramOptions.monochromeViewportLeftCrop = detailMonochrome && exportHasOpenColumn ? 12 : 0;
        diagramOptions.monochromeFretNumberYOffset = detailMonochrome && exportNeedsFretNumberOffset ? 5 : 0;
        if (detailMonochrome && exportHasOpenColumn) {
            diagramOptions.svgPadding = { right: 18 };
        }
        return window.ChordCruise.ui.chordExport.exportPng({
            chordName: displayChordName(chord.chordName),
            formName: chordFormName(chord),
            fretRange: chord.fretRange,
            rangeText: rangeText,
            diagramOptions: diagramOptions
        }).then(function (result) {
            var suffix = result.method === 'new-tab' ? '（新しいタブに表示）' : '';
            setExportStatus(result.filename + ' を作成しました ' + result.width + '×' + result.height + 'px' + suffix, false);
            return result;
        }).catch(function (err) {
            setExportStatus(err && err.message ? err.message : 'PNGを書き出せませんでした。', true);
            return null;
        }).then(function (result) {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            return result;
        });
    }

    function openDetailFromList(chordId) {
        currentChordId = chordId;
        detailDisplayModeOverride = libraryCardDisplayMode();
        detailMonochrome = libraryCardMonochrome();
        renderDetail(true);
    }

    function renderDetail(preserveInitialDisplay) {
        view = 'detail';
        entrySortMode = false;
        entrySortFolderId = null;
        currentListChords = [];
        if (!preserveInitialDisplay) {
            detailDisplayModeOverride = null;
            detailMonochrome = false;
        }
        setContentLayout('detail');
        var chord = storage().loadChord(currentChordId);
        if (!chord) {
            renderList();
            return;
        }
        currentDetailChord = chord;
        var displayName = displayChordName(chord.chordName);
        var displayFormName = chordFormName(chord);
        var detailExportHtml = canExport()
            ? '<button type="button" class="cc-btn cc-btn-secondary cc-export-icon-btn cc-lib-export-btn" id="cc-lib-export-btn" aria-label="コードを書き出す" title="書き出し">' + downloadIconSvg() + '</button>'
            : '';
        var detailExportStatusHtml = canExport()
            ? '<p class="cc-lib-export-status" id="cc-lib-export-status" style="display:none;"></p>'
            : '';

        var html = '<div class="cc-card">' +
            '<div class="cc-fb-head">' +
                '<span class="cc-save-label">表示</span>' +
                '<div class="cc-segment" role="group" aria-label="表示切替">' +
                    '<button type="button" class="cc-segment-btn" id="cc-libmode-finger">運指</button>' +
                    '<button type="button" class="cc-segment-btn" id="cc-libmode-note">CDE</button>' +
                    '<button type="button" class="cc-segment-btn" id="cc-libmode-solfege">ドレミ</button>' +
                    '<button type="button" class="cc-segment-btn" id="cc-libmode-degree">度数</button>' +
                '</div>' +
            '</div>' +
            '<div class="cc-lib-diagram-card" id="cc-lib-diagram-card">' +
                '<div class="cc-lib-diagram-title cc-fretboard-chord-name" id="cc-lib-detail-name" title="' + escapeHtml(displayName) + '">' + escapeHtml(displayName) + '</div>' +
                '<div id="cc-lib-fb" class="cc-fb-host cc-lib-exact-fb"></div>' +
            '</div>' +
            '<p class="cc-fb-hint">音をタップすると運指が切り替わり、自動で保存されます。</p>' +
            '<div class="cc-lib-diagram-actions">' +
                '<div class="cc-lib-monochrome-control">' +
                    '<span class="cc-lib-action-label">白黒 <strong id="cc-lib-monochrome-state">OFF</strong></span>' +
                    '<button type="button" id="cc-lib-monochrome-toggle" class="cc-switch" role="switch" aria-checked="false" aria-label="指板図を白黒表示">' +
                        '<span class="cc-switch-knob" aria-hidden="true"></span>' +
                    '</button>' +
                '</div>' +
                '<button type="button" class="cc-btn cc-btn-secondary cc-lib-edit-btn" id="cc-lib-edit-btn">編集</button>' +
                detailExportHtml +
            '</div>' +
            detailExportStatusHtml +
            qualityAnalysisHtml(chord) +
        '</div>' +
        '<div class="cc-card">' +
            '<h3 class="cc-card-heading">編集</h3>' +
            '<div class="cc-save-section">' +
                '<label class="cc-field"><span class="cc-field-label">名前</span>' +
                    '<input type="text" id="cc-lib-chord-name" class="cc-input" maxlength="32" value="' + escapeHtml(displayName) + '"></label>' +
                '<label class="cc-field"><span class="cc-field-label">フォーム名</span>' +
                    '<input type="text" id="cc-lib-form-name" class="cc-input" maxlength="32" value="' + escapeHtml(displayFormName) + '"></label>' +
                '<label class="cc-field"><span class="cc-field-label">メモ</span>' +
                    '<textarea id="cc-lib-memo" class="cc-input cc-textarea" rows="2" maxlength="200">' + escapeHtml(chord.memo || '') + '</textarea></label>' +
                '<button type="button" class="cc-btn cc-btn-primary cc-btn--block" id="cc-lib-save-edit">変更を保存</button>' +
                '<p class="cc-fb-hint cc-lib-edit-hint" id="cc-lib-edit-hint" style="display:none;">保存しました。</p>' +
            '</div>' +
            '<div class="cc-save-section">' +
                '<label class="cc-field"><span class="cc-field-label">フォルダ移動</span>' +
                    '<select id="cc-lib-folder-move" class="cc-select"></select></label>' +
            '</div>' +
        '</div>' +
        '<div class="cc-card cc-danger-zone">' +
            '<h3 class="cc-card-heading cc-danger-heading">危険操作</h3>' +
            '<button type="button" class="cc-btn cc-btn-danger cc-btn--block" id="cc-lib-delete">このコードを削除</button>' +
        '</div>';
        contentEl().innerHTML = html;

        // 表示切替
        ['note', 'solfege', 'degree', 'finger'].forEach(function (mode) {
            document.getElementById('cc-libmode-' + mode).addEventListener('click', function () {
                detailDisplayModeOverride = mode;
                window.ChordCruise.storage.saveSettings({ fretboardDisplayMode: mode });
                window.ChordCruise.state.settings.fretboardDisplayMode = mode;
                updateLibModeSegments();
                renderDetailFretboard(currentDetailChord || chord);
            });
        });
        updateLibModeSegments();
        renderDetailFretboard(chord);
        updateMonochromeControl();

        document.getElementById('cc-lib-monochrome-toggle').addEventListener('click', function () {
            detailMonochrome = !detailMonochrome;
            updateMonochromeControl();
            renderDetailFretboard(currentDetailChord || chord);
        });
        var detailExportButton = document.getElementById('cc-lib-export-btn');
        if (detailExportButton) detailExportButton.addEventListener('click', function () {
            confirmExport(detailExportButton, function () {
                exportCurrentChord(currentDetailChord || chord);
            });
        });
        document.getElementById('cc-lib-edit-btn').addEventListener('click', function () {
            window.ChordCruise.ui.saveEditor.openExisting({
                chord: currentDetailChord || chord,
                onSaved: function (record) {
                    currentChordId = record.id;
                    renderDetail();
                }
            });
        });

        // 名前・メモ編集
        document.getElementById('cc-lib-save-edit').addEventListener('click', function () {
            var current = currentDetailChord || chord;
            var candidate = cloneChordRecord(current);
            candidate.chordName = displayChordName(
                document.getElementById('cc-lib-chord-name').value.trim() || current.chordName
            );
            candidate.formName = document.getElementById('cc-lib-form-name').value.trim() || chordFormName(current);
            candidate.memo = document.getElementById('cc-lib-memo').value.trim();
            var saved = storage().saveChord(candidate);
            if (!saved) {
                toast(storageErrorMessage('変更を保存できませんでした'), 'error');
                return;
            }
            currentDetailChord = saved;
            document.getElementById('cc-lib-detail-name').textContent = displayChordName(saved.chordName);
            var hint = document.getElementById('cc-lib-edit-hint');
            hint.style.display = '';
            setTimeout(function () { hint.style.display = 'none'; }, 1800);
            toast('変更を保存しました');
        });

        // フォルダ移動（即時反映）
        var moveSelect = document.getElementById('cc-lib-folder-move');
        storage().loadOrderedFolders().forEach(function (folder) {
            var option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            moveSelect.appendChild(option);
        });
        moveSelect.value = chord.folderId;
        moveSelect.addEventListener('change', function () {
            var current = currentDetailChord || chord;
            var previousFolderId = current.folderId;
            var candidate = cloneChordRecord(current);
            candidate.folderId = moveSelect.value;
            var saved = storage().saveChord(candidate);
            if (!saved) {
                moveSelect.value = previousFolderId;
                toast(storageErrorMessage('フォルダを移動できませんでした'), 'error');
                return;
            }
            currentDetailChord = saved;
            toast('フォルダを移動しました');
        });

        // 削除
        document.getElementById('cc-lib-delete').addEventListener('click', function () {
            var current = currentDetailChord || chord;
            var deleteButton = document.getElementById('cc-lib-delete');
            confirmDanger('「' + displayChordName(current.chordName) + '（' + chordFormName(current) + '）」を削除しますか？この操作は取り消せません。', '削除する', function () {
                var current = currentDetailChord || chord;
                if (!storage().deleteChord(current.id)) {
                    toast('コードを削除できませんでした', 'error');
                    if (focusTrap()) focusTrap().restoreFocus(deleteButton);
                    return;
                }
                renderList();
                toast('コードを削除しました');
            }, deleteButton, 'コードを削除');
        });
    }

    // ---- 公開API ----

    function render() {
        var section = document.getElementById('cc-screen-library');
        if (!section) return;
        buildSkeleton(section);
        if (view === 'detail' && currentChordId) {
            renderDetail();
        } else if (view === 'list' && currentFolderId) {
            renderList();
        } else {
            renderFolders();
        }
    }

    /** 戻るボタン用。内部で一階層戻れたら true を返す。 */
    function back() {
        if (view === 'detail') {
            renderList();
            return true;
        }
        if (view === 'list') {
            renderFolders();
            return true;
        }
        return false;
    }

    /** TOPへ戻ったときは次回フォルダ一覧から */
    function resetView() {
        view = 'folders';
        currentDetailChord = null;
        currentListChords = [];
        detailMonochrome = false;
        detailDisplayModeOverride = null;
        folderSortMode = false;
        entrySortMode = false;
        entrySortFolderId = null;
    }

    document.addEventListener('chordcruise:fretboard-settings-change', function () {
        if (view === 'detail' && currentDetailChord) {
            renderDetailFretboard(currentDetailChord);
        } else if (view === 'list') {
            refreshListThumbnails();
        }
    });

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.ui = window.ChordCruise.ui || {};
    window.ChordCruise.ui.library = {
        render: render,
        back: back,
        resetView: resetView,
        savedFrets: savedFrets,
        savedDiagramOptions: savedDiagramOptions,
        buildChordThumbnailGridHtml: buildChordThumbnailGridHtml,
        buildFolderSortRowsHtml: buildFolderSortRowsHtml,
        buildChordSortRowsHtml: buildChordSortRowsHtml,
        normalizeLibraryColumns: normalizeLibraryColumns,
        libraryCardTextScale: libraryCardTextScale,
        libraryCardFretNumberScale: libraryCardFretNumberScale
    };
})();
