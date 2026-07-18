(function () {
    'use strict';

    /* コード本棚。フォルダ一覧 → フォルダ内一覧 → 保存コード詳細 の3階層。 */

    var FINGER_CYCLE = [null, 'T', 1, 2, 3, 4];
    var FINGER_LABELS = { T: '親', 1: '人', 2: '中', 3: '薬', 4: '小' };

    var view = 'folders';           // 'folders' | 'list' | 'detail'
    var currentFolderId = null;
    var currentChordId = null;
    var currentDetailChord = null;
    var detailMonochrome = false;
    var folderSortMode = false;
    var entrySortMode = false;
    var entrySortFolderId = null;
    var folderShelfColumns = 4;
    var folderManageSheet = null;
    var folderManageReturnFocus = null;
    var libraryDisplaySheet = null;
    var libraryDisplayReturnFocus = null;
    // 表示設定シートだけの一時UI状態。保存設定には含めない。
    var libraryDisplayActiveTab = 'display';
    var currentListChords = [];

    function storage() { return window.ChordCruise.storage; }
    function theory() { return window.ChordCruise.theory; }
    function displayChordName(name) { return theory().displayChordName(name); }
    function chordFormName(chord) {
        if (chord && chord.formName) return chord.formName;
        if (chord && chord.shape) return chord.shape + '型';
        return 'フォーム';
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

    function libraryCardTextSize(key) {
        var settings = window.ChordCruise.state && window.ChordCruise.state.settings;
        var value = settings && settings[key];
        return ['small', 'medium', 'large', 'xlarge'].indexOf(value) !== -1 ? value : 'medium';
    }

    function libraryCardTextScale(size, columns) {
        var normalizedColumns = normalizeLibraryColumns(columns);
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

    function libraryCardTextSizeLabel(size) {
        return { small: '小', medium: '中', large: '大', xlarge: '特大' }[size] || '中';
    }

    function libraryDisplayModeLabel(mode) {
        return { note: 'CDE', solfege: 'ドレミ', degree: '度数', finger: '運指' }[mode] || '運指';
    }

    function libraryDisplaySummary() {
        return libraryDisplayModeLabel(libraryCardDisplayMode()) + '・' + (libraryCardMonochrome() ? '白黒' : 'カラー');
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

    // ---- 確認モーダル（危険操作用） ----

    var confirmOverlay = null;
    var confirmHandler = null;

    function confirmDanger(message, okLabel, onOk) {
        if (!confirmOverlay) {
            confirmOverlay = document.createElement('div');
            confirmOverlay.className = 'cc-modal-overlay cc-modal-overlay--hidden';
            confirmOverlay.innerHTML =
                '<div class="cc-confirm-card" role="alertdialog">' +
                    '<p class="cc-confirm-message" id="cc-confirm-message"></p>' +
                    '<div class="cc-confirm-actions">' +
                        '<button type="button" class="cc-btn cc-btn-danger" id="cc-confirm-ok"></button>' +
                        '<button type="button" class="cc-btn cc-btn-secondary" id="cc-confirm-cancel">キャンセル</button>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(confirmOverlay);
            document.getElementById('cc-confirm-cancel').addEventListener('click', function () {
                confirmOverlay.classList.add('cc-modal-overlay--hidden');
                confirmHandler = null;
            });
            document.getElementById('cc-confirm-ok').addEventListener('click', function () {
                confirmOverlay.classList.add('cc-modal-overlay--hidden');
                var handler = confirmHandler;
                confirmHandler = null;
                if (handler) handler();
            });
        }
        document.getElementById('cc-confirm-message').textContent = message;
        document.getElementById('cc-confirm-ok').textContent = okLabel;
        confirmHandler = onOk;
        confirmOverlay.classList.remove('cc-modal-overlay--hidden');
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

    function buildChordThumbnailGridHtml(chords, requestedColumns, sorting) {
        var columns = normalizeLibraryColumns(requestedColumns);
        var html = '<div class="cc-chordthumb-grid' + (sorting ? ' cc-chordthumb-grid--sorting' : '') + '" id="cc-chordthumb-grid" data-library-columns="' + columns + '" data-library-chord-name-size="' + libraryCardTextSize('libraryCardChordNameSize') + '"' +
            (sorting ? ' role="list" aria-label="保存コードの並び順"' : '') + '>';
        chords.forEach(function (chord, index) {
            var displayName = displayChordName(chord.chordName);
            var cardStart = sorting
                ? '<div class="cc-chordthumb-card cc-chordthumb-card--sorting" data-chord-id="' + escapeHtml(chord.id) + '" role="listitem" aria-label="' + escapeHtml(displayName) + 'の並び替え">'
                : '<button type="button" class="cc-chordthumb-card" data-chord-id="' + escapeHtml(chord.id) + '" aria-label="' + escapeHtml(displayName) + 'の指板を開く">';
            html += cardStart +
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

    function buildLibraryDisplaySettingsButtonHtml(disabled) {
        return '<button type="button" class="cc-btn cc-btn-secondary cc-btn--small cc-library-display-trigger" id="cc-library-display-trigger" aria-haspopup="dialog" aria-expanded="false"' +
            (disabled ? ' disabled aria-disabled="true"' : '') + '>' +
            '<span>表示設定</span><small id="cc-library-display-summary">' + escapeHtml(libraryDisplaySummary()) + '</small></button>';
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
        return (folder.builtin ? ' is-builtin' : ' is-custom') + (count === 0 ? ' is-empty' : '') +
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
                    (folder.builtin ? '<span class="cc-folder-card-state cc-folder-card-state--fixed">先頭固定</span>' : '') +
                    (count === 0 ? '<span class="cc-folder-card-state cc-folder-card-state--empty">空</span>' : '') +
                '</span>' +
            '</span>' +
            (showChevron ? '<span class="cc-folder-card-chevron" aria-hidden="true">›</span>' : '');
    }

    function folderAriaLabel(folder, count) {
        return folder.name + '、' + count + '件' + (folder.builtin ? '、先頭固定' : '') + (count === 0 ? '、空のフォルダ' : '') + '、開く';
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
            var fixed = folder.id === storage().UNCATEGORIZED_ID;
            var previousLabel = folderShelfColumns >= 5 ? '←' : '← 前へ';
            var nextLabel = folderShelfColumns >= 5 ? '→' : '後へ →';
            return '<div class="cc-sort-row cc-folder-card cc-folder-card--sorting cc-folder-card--design-a cc-folder-card--book-a3 ' +
                folderModifierClasses(folder, count) + '" role="listitem" aria-label="' + escapeHtml(folder.name + '、' + count + '件、並び替え') + '">' +
                folderCardInnerHtml(folder, count, false) +
                (fixed
                    ? ''
                    : '<span class="cc-sort-row-actions">' +
                        sortStepButtonHtml('folder', folder.id, -1, index <= 1, folder.name + 'を前の位置へ移動', previousLabel) +
                        sortStepButtonHtml('folder', folder.id, 1, index >= total - 1, folder.name + 'を後の位置へ移動', nextLabel) +
                      '</span>') +
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

    var FOLDER_COLOR_OPTIONS = [
        ['forest', '深緑'], ['burgundy', '深紅'], ['navy', '紺'], ['umber', '琥珀'],
        ['charcoal', '炭'], ['teal', '青緑'], ['violet', '紫'], ['russet', '赤茶'],
        ['leather', '革茶'], ['black-leather', '黒革'], ['wine', 'ワイン'], ['black-gold', '黒金']
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
        if (returnFocus && folderManageReturnFocus && typeof folderManageReturnFocus.focus === 'function') {
            folderManageReturnFocus.focus();
        }
        folderManageReturnFocus = null;
    }

    function ensureLibraryDisplaySheet() {
        if (libraryDisplaySheet) return libraryDisplaySheet;
        libraryDisplaySheet = document.createElement('div');
        libraryDisplaySheet.className = 'cc-folder-manage-overlay cc-folder-manage-overlay--hidden cc-library-display-overlay';
        libraryDisplaySheet.addEventListener('click', function (event) {
            if (event.target === libraryDisplaySheet) closeLibraryDisplaySheet(true);
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && libraryDisplaySheet && !libraryDisplaySheet.classList.contains('cc-folder-manage-overlay--hidden')) {
                closeLibraryDisplaySheet(true);
            }
        });
        document.body.appendChild(libraryDisplaySheet);
        return libraryDisplaySheet;
    }

    function closeLibraryDisplaySheet(returnFocus) {
        if (!libraryDisplaySheet) return;
        var currentTrigger = document.getElementById('cc-library-display-trigger');
        if (currentTrigger) currentTrigger.setAttribute('aria-expanded', 'false');
        libraryDisplaySheet.classList.add('cc-folder-manage-overlay--hidden');
        libraryDisplaySheet.innerHTML = '';
        document.body.classList.remove('cc-library-display-open');
        libraryDisplayActiveTab = 'display';
        var trigger = libraryDisplayReturnFocus;
        libraryDisplayReturnFocus = null;
        if (returnFocus && trigger && typeof trigger.focus === 'function') trigger.focus();
    }

    function libraryTextSizeChoicesHtml(key, label) {
        var selectedSize = libraryCardTextSize(key);
        var labelId = 'cc-library-' + key + '-label';
        var html = '<div class="cc-library-text-size-row">' +
            '<h5 id="' + labelId + '">' + label + '</h5>' +
            '<div class="cc-library-display-grid cc-library-display-grid--four" role="radiogroup" aria-labelledby="' + labelId + '">';
        ['small', 'medium', 'large', 'xlarge'].forEach(function (size) {
            var selected = size === selectedSize;
            html += '<button type="button" class="cc-library-display-choice cc-library-display-choice--size' + (selected ? ' is-selected' : '') + '" data-library-card-text-size-key="' + key + '" data-library-card-text-size="' + size + '" role="radio" aria-checked="' + (selected ? 'true' : 'false') + '">' + libraryCardTextSizeLabel(size) + '</button>';
        });
        return html + '</div></div>';
    }

    function normalizeLibraryDisplayTab(value) {
        return value === 'text-size' ? 'text-size' : 'display';
    }

    function libraryDisplayTabsHtml(activeTab) {
        var tabs = [
            { value: 'display', label: '表示' },
            { value: 'text-size', label: '文字サイズ' }
        ];
        var html = '<div class="cc-library-display-tabs" role="tablist" aria-label="表示設定の分類">';
        tabs.forEach(function (tab) {
            var selected = activeTab === tab.value;
            html += '<button type="button" class="cc-library-display-tab' + (selected ? ' is-selected' : '') + '" id="cc-library-display-tab-' + tab.value + '" data-library-display-tab="' + tab.value + '" role="tab" aria-selected="' + (selected ? 'true' : 'false') + '" aria-controls="cc-library-display-panel-' + tab.value + '" tabindex="' + (selected ? '0' : '-1') + '">' + tab.label + '</button>';
        });
        return html + '</div>';
    }

    function libraryDisplayChoicesHtml() {
        var mode = libraryCardDisplayMode();
        var monochrome = libraryCardMonochrome();
        var activeTab = normalizeLibraryDisplayTab(libraryDisplayActiveTab);
        var html = '<div class="cc-folder-manage-sheet cc-library-display-sheet" role="dialog" aria-modal="true" aria-labelledby="cc-library-display-title">' +
            '<div class="cc-folder-manage-grabber" aria-hidden="true"></div>' +
            '<div class="cc-folder-manage-heading"><h3 id="cc-library-display-title" tabindex="-1">表示設定</h3><p>このフォルダ内のコード一覧にまとめて適用します。</p></div>' +
            libraryDisplayTabsHtml(activeTab) +
            '<div id="cc-library-display-panel-display" class="cc-library-display-panel" role="tabpanel" aria-labelledby="cc-library-display-tab-display"' + (activeTab === 'display' ? '' : ' hidden') + '>' +
            '<section class="cc-library-display-section" aria-labelledby="cc-library-display-mode-label">' +
                '<h4 id="cc-library-display-mode-label">丸の表示</h4>' +
                '<div class="cc-library-display-grid" role="radiogroup" aria-labelledby="cc-library-display-mode-label">';
        ['note', 'solfege', 'degree', 'finger'].forEach(function (value) {
            var selected = value === mode;
            html += '<button type="button" class="cc-library-display-choice' + (selected ? ' is-selected' : '') + '" data-library-card-display-mode="' + value + '" role="radio" aria-checked="' + (selected ? 'true' : 'false') + '">' + libraryDisplayModeLabel(value) + '</button>';
        });
        html += '</div></section>' +
            '<section class="cc-library-display-section" aria-labelledby="cc-library-display-color-label">' +
                '<h4 id="cc-library-display-color-label">配色</h4>' +
                '<div class="cc-library-display-grid cc-library-display-grid--two" role="radiogroup" aria-labelledby="cc-library-display-color-label">' +
                    '<button type="button" class="cc-library-display-choice' + (!monochrome ? ' is-selected' : '') + '" data-library-card-monochrome="false" role="radio" aria-checked="' + (!monochrome ? 'true' : 'false') + '">カラー</button>' +
                    '<button type="button" class="cc-library-display-choice' + (monochrome ? ' is-selected' : '') + '" data-library-card-monochrome="true" role="radio" aria-checked="' + (monochrome ? 'true' : 'false') + '">白黒</button>' +
                '</div>' +
            '</section>' +
            '</div>' +
            '<div id="cc-library-display-panel-text-size" class="cc-library-display-panel" role="tabpanel" aria-labelledby="cc-library-display-tab-text-size"' + (activeTab === 'text-size' ? '' : ' hidden') + '>' +
                '<section class="cc-library-display-section cc-library-display-section--text-size" aria-label="文字サイズ">' +
                    libraryTextSizeChoicesHtml('libraryCardChordNameSize', 'コード名') +
                    libraryTextSizeChoicesHtml('libraryCardFretNumberSize', 'フレット番号') +
                    libraryTextSizeChoicesHtml('libraryCardMarkerLabelSize', '音名') +
                '</section>' +
            '</div>' +
            '<button type="button" class="cc-folder-manage-cancel" data-library-display-action="close">完了</button>' +
        '</div>';
        return html;
    }

    function redrawLibraryDisplaySheet(focusTab) {
        if (!libraryDisplaySheet) return;
        libraryDisplaySheet.innerHTML = libraryDisplayChoicesHtml();
        bindLibraryDisplaySheet();
        if (focusTab) {
            var tab = libraryDisplaySheet.querySelector('[data-library-display-tab="' + libraryDisplayActiveTab + '"]');
            if (tab) tab.focus();
        }
    }

    function updateLibraryDisplaySummary() {
        var summary = document.getElementById('cc-library-display-summary');
        if (summary) summary.textContent = libraryDisplaySummary();
    }

    function applyLibraryCardTextSizes() {
        var grid = document.getElementById('cc-chordthumb-grid');
        if (grid) grid.setAttribute('data-library-chord-name-size', libraryCardTextSize('libraryCardChordNameSize'));
    }

    function restoreListScroll(previousY) {
        if (previousY !== null && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(function () {
                if (Math.abs(window.scrollY - previousY) > 1) window.scrollTo(0, previousY);
            });
        }
    }

    function refreshLibraryCardTextSizes() {
        if (view !== 'list') return;
        var previousY = typeof window.scrollY === 'number' ? window.scrollY : null;
        applyLibraryCardTextSizes();
        updateLibraryDisplaySummary();
        restoreListScroll(previousY);
    }

    function refreshListThumbnails() {
        if (view !== 'list') return;
        var previousY = typeof window.scrollY === 'number' ? window.scrollY : null;
        applyLibraryCardTextSizes();
        renderListThumbnails(currentListChords, {
            displayMode: libraryCardDisplayMode(),
            monochrome: libraryCardMonochrome()
        });
        updateLibraryDisplaySummary();
        restoreListScroll(previousY);
    }

    function bindLibraryDisplaySheet() {
        if (!libraryDisplaySheet) return;
        Array.prototype.forEach.call(libraryDisplaySheet.querySelectorAll('[data-library-display-tab]'), function (tab) {
            tab.addEventListener('click', function () {
                libraryDisplayActiveTab = normalizeLibraryDisplayTab(tab.getAttribute('data-library-display-tab'));
                redrawLibraryDisplaySheet(true);
            });
            tab.addEventListener('keydown', function (event) {
                var tabs = Array.prototype.slice.call(libraryDisplaySheet.querySelectorAll('[data-library-display-tab]'));
                var index = tabs.indexOf(tab);
                var nextIndex = index;
                if (event.key === 'ArrowLeft') nextIndex = (index + tabs.length - 1) % tabs.length;
                else if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
                else if (event.key === 'Home') nextIndex = 0;
                else if (event.key === 'End') nextIndex = tabs.length - 1;
                else return;
                event.preventDefault();
                libraryDisplayActiveTab = normalizeLibraryDisplayTab(tabs[nextIndex].getAttribute('data-library-display-tab'));
                redrawLibraryDisplaySheet(true);
            });
        });
        Array.prototype.forEach.call(libraryDisplaySheet.querySelectorAll('[data-library-card-display-mode]'), function (button) {
            button.addEventListener('click', function () {
                var mode = button.getAttribute('data-library-card-display-mode');
                if (['note', 'solfege', 'degree', 'finger'].indexOf(mode) === -1) return;
                window.ChordCruise.state.settings.libraryCardDisplayMode = mode;
                storage().saveSettings({ libraryCardDisplayMode: mode });
                redrawLibraryDisplaySheet(false);
                refreshListThumbnails();
            });
        });
        Array.prototype.forEach.call(libraryDisplaySheet.querySelectorAll('[data-library-card-monochrome]'), function (button) {
            button.addEventListener('click', function () {
                var monochrome = button.getAttribute('data-library-card-monochrome') === 'true';
                window.ChordCruise.state.settings.libraryCardMonochrome = monochrome;
                storage().saveSettings({ libraryCardMonochrome: monochrome });
                redrawLibraryDisplaySheet(false);
                refreshListThumbnails();
            });
        });
        Array.prototype.forEach.call(libraryDisplaySheet.querySelectorAll('[data-library-card-text-size]'), function (button) {
            button.addEventListener('click', function () {
                var key = button.getAttribute('data-library-card-text-size-key');
                var size = button.getAttribute('data-library-card-text-size');
                if (['libraryCardChordNameSize', 'libraryCardFretNumberSize', 'libraryCardMarkerLabelSize'].indexOf(key) === -1 ||
                    ['small', 'medium', 'large', 'xlarge'].indexOf(size) === -1) return;
                window.ChordCruise.state.settings[key] = size;
                var partial = {};
                partial[key] = size;
                storage().saveSettings(partial);
                redrawLibraryDisplaySheet(false);
                if (key === 'libraryCardChordNameSize') {
                    refreshLibraryCardTextSizes();
                } else {
                    refreshListThumbnails();
                }
            });
        });
        var closeButton = libraryDisplaySheet.querySelector('[data-library-display-action="close"]');
        if (closeButton) closeButton.addEventListener('click', function () { closeLibraryDisplaySheet(true); });
    }

    function openLibraryDisplaySheet(trigger) {
        if (entrySortMode) return;
        libraryDisplayActiveTab = 'display';
        libraryDisplayReturnFocus = trigger || null;
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
        var sheet = ensureLibraryDisplaySheet();
        sheet.innerHTML = libraryDisplayChoicesHtml();
        sheet.classList.remove('cc-folder-manage-overlay--hidden');
        document.body.classList.add('cc-library-display-open');
        bindLibraryDisplaySheet();
        var title = document.getElementById('cc-library-display-title');
        if (title) title.focus();
    }

    function folderManageColorChoicesHtml(folder) {
        var selected = storage().folderColorKey(folder);
        var html = '<div class="cc-folder-color-grid" role="group" aria-label="フォルダの色">';
        FOLDER_COLOR_OPTIONS.forEach(function (option) {
            var key = option[0];
            var active = key === selected;
            html += '<button type="button" class="cc-folder-color-choice cc-folder-color-' + key + (active ? ' is-selected' : '') + '" data-folder-color-key="' + key + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
                '<span class="cc-folder-color-swatch" aria-hidden="true"></span><span>' + option[1] + '</span></button>';
        });
        return html + '</div>';
    }

    function folderManageMenuHtml(folder, count) {
        var buttons = '';
        if (!folder.builtin) {
            buttons += '<button type="button" class="cc-folder-manage-action" data-folder-manage-action="rename">フォルダ名を編集</button>' +
                '<button type="button" class="cc-folder-manage-action" data-folder-manage-action="copy">フォルダをコピー</button>';
        }
        buttons += '<button type="button" class="cc-folder-manage-action" data-folder-manage-action="color">フォルダの色を変更</button>';
        if (!folder.builtin) {
            buttons += '<button type="button" class="cc-folder-manage-action cc-folder-manage-action--danger" data-folder-manage-action="delete">フォルダを削除</button>';
        }
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
        var focusTarget = sheet.querySelector('input, button');
        if (focusTarget) focusTarget.focus();
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
                    if (!copied) return toast('フォルダをコピーできませんでした', 'error');
                    closeFolderManageSheet(false);
                    renderFolders();
                    toast('フォルダをコピーしました');
                    return;
                }
                if (action === 'delete') {
                    var count = chordCountIn(id, buildFolderCountMap());
                    closeFolderManageSheet(false);
                    var deleteMessage = count > 0
                        ? 'フォルダ「' + folder.name + '」を削除しますか？このフォルダと、中にある' + count + '件のコードを完全に削除します。この操作は元に戻せません。'
                        : 'フォルダ「' + folder.name + '」を削除しますか？この空のフォルダを削除します。この操作は元に戻せません。';
                    confirmDanger(deleteMessage, '完全に削除', function () {
                        if (!storage().deleteFolder(id)) return toast('フォルダを削除できませんでした', 'error');
                        renderFolders();
                        toast(count > 0 ? 'フォルダとコードを完全に削除しました' : '空のフォルダを削除しました');
                    });
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
        closeLibraryDisplaySheet(false);
        view = 'folders';
        currentDetailChord = null;
        currentListChords = [];
        detailMonochrome = false;
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
            storage().createFolder(name);
            renderFolders();
        });
    }

    // ---- ビュー: フォルダ内一覧 ----

    function renderList() {
        closeFolderManageSheet(false);
        closeLibraryDisplaySheet(false);
        view = 'list';
        currentDetailChord = null;
        detailMonochrome = false;
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
                    buildLibraryDisplaySettingsButtonHtml(entrySortMode) +
                    '<button type="button" class="cc-btn cc-btn-secondary cc-btn--small" id="cc-entry-sort-toggle" aria-pressed="' +
                        (entrySortMode ? 'true' : 'false') + '"' + (chords.length < 2 && !entrySortMode ? ' disabled' : '') + '>' +
                        (entrySortMode ? '完了' : '並び替え') + '</button>' +
                '</div>' +
            '</div>' +
            buildLibraryColumnsControlHtml(columns) +
            (entrySortMode ? '<p class="cc-sort-mode-note">各カードの矢印を押すたびに並び順を保存します。</p>' : '') +
        '</div>';

        if (chords.length === 0) {
            html += '<div class="cc-card cc-placeholder-card"><p>このフォルダにはまだコードがありません。「コードを調べる」からCAGEDフォームを保存できます。</p></div>';
        } else {
            html += buildChordThumbnailGridHtml(chords, columns, entrySortMode);
        }
        contentEl().innerHTML = html;

        document.getElementById('cc-entry-sort-toggle').addEventListener('click', function () {
            closeLibraryDisplaySheet(false);
            entrySortMode = !entrySortMode;
            entrySortFolderId = entrySortMode ? folder.id : null;
            renderList();
        });

        var displayTrigger = document.getElementById('cc-library-display-trigger');
        if (displayTrigger && !entrySortMode) {
            displayTrigger.addEventListener('click', function () {
                openLibraryDisplaySheet(displayTrigger);
            });
        }

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

        if (chords.length) {
            renderListThumbnails(chords);
            document.getElementById('cc-chordthumb-grid').addEventListener('click', function (event) {
                var card = event.target.closest('.cc-chordthumb-card');
                if (!card) return;
                currentChordId = card.dataset.chordId;
                renderDetail();
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

    function detailDisplayMode() {
        var mode = window.ChordCruise.state.settings.fretboardDisplayMode;
        return ['note', 'solfege', 'degree', 'finger'].indexOf(mode) !== -1 ? mode : 'note';
    }

    function detailMarkerLabel(chord, note, requestedMode) {
        var mode = requestedMode || detailDisplayMode();
        if (mode === 'finger') {
            if (note.finger != null) return FINGER_LABELS[note.finger] || '';
            return note.fingeringWarning === true ? '⚠' : '';
        }
        var openPc = theory().OPEN_STRINGS[6 - note.string];
        var pc = (openPc + note.fret) % 12;
        if (mode === 'solfege') return theory().solfegeName(pc, chordUseFlats(chord));
        if (mode === 'degree') return theory().degreeLabels([note.interval])[0];
        return theory().noteName(pc, chordUseFlats(chord));
    }

    function roleForInterval(interval) {
        if (interval === 0) return 'root';
        if (interval === 3 || interval === 4) return 'third';
        if (interval === 6 || interval === 7 || interval === 8) return 'fifth';
        if (interval === 9 || interval === 10 || interval === 11) return 'seventh';
        return 'other';
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
        return {
            frets: frets,
            markers: notes.map(function (note) {
                return {
                    string: note.string,
                    fret: note.fret,
                    label: detailMarkerLabel(chord, note, mode),
                    role: roleForInterval(note.interval),
                    fingeringWarning: mode === 'finger' && note.fingeringWarning === true && note.finger == null,
                    tappable: !!opts.tappable
                };
            }),
            barres: window.ChordCruise.caged.detectBarres(notes),
            mutedStrings: Array.isArray(chord.mutedStrings) ? chord.mutedStrings : [],
            monochrome: !!opts.monochrome,
            fretNumberHighlightMode: 'all',
            // 詳細画面だけが使うhost単位の設定。静的な一覧SVGには渡さない。
            markerLabelSize: opts.markerLabelSize
        };
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
        var fretNumberScale = typeof opts.fretNumberScale === 'number'
            ? opts.fretNumberScale
            : libraryCardTextScale(libraryCardTextSize('libraryCardFretNumberSize'), columns);
        var markerLabelScale = typeof opts.markerLabelScale === 'number'
            ? opts.markerLabelScale
            : libraryCardTextScale(libraryCardTextSize('libraryCardMarkerLabelSize'), columns);
        var byId = {};
        chords.forEach(function (chord) { byId[chord.id] = chord; });
        Array.prototype.forEach.call(contentEl().querySelectorAll('[data-chord-thumb]'), function (host) {
            var chord = byId[host.getAttribute('data-chord-thumb')];
            if (!chord) return;
            var diagramOptions = savedDiagramOptions(chord, { thumbnail: true, mode: mode, monochrome: monochrome });
            diagramOptions.svgClass = 'cc-fb-svg cc-fb-static-svg cc-chordthumb-svg';
            diagramOptions.fretNumberScale = fretNumberScale;
            diagramOptions.markerLabelScale = markerLabelScale;
            // 固定高の一覧カードだけは、上下のマーカー外周とフレット番号用にSVG内の安全余白を確保する。
            // 画面の指板・詳細・PNGはこの指定を持たないため、従来の座標と寸法のままになる。
            if (monochrome) {
                diagramOptions.svgPadding = {
                    top: 14,
                    right: 4,
                    bottom: 18,
                    left: 4,
                    fillMonochromeBackground: true
                };
            }
            host.classList.toggle('cc-chordthumb-board--monochrome', monochrome);
            host.innerHTML = window.ChordCruise.ui.fretboard.buildStaticSvg(diagramOptions);
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
        diagramOptions.scrollToFret = chord.fretRange
            ? Math.round((chord.fretRange.min + chord.fretRange.max) / 2)
            : null;
        diagramOptions.preserveScroll = typeof prevScroll === 'number' && prevScroll > 0 ? prevScroll : null;
        diagramOptions.onSlotTap = function (stringNum, fret) {
            var target = null;
            (chord.notes || []).forEach(function (note) {
                if (note.string === stringNum && note.fret === fret) target = note;
            });
            if (!target) return;
            if (target.fingeringWarning === true && target.finger == null) {
                target.finger = 'T';
                target.fingeringWarning = false;
                storage().saveChord(chord);
                renderDetailFretboard(chord);
                return;
            }
            var pos = FINGER_CYCLE.indexOf(target.finger);
            target.finger = FINGER_CYCLE[(pos + 1) % FINGER_CYCLE.length];
            if (target.finger != null) target.fingeringWarning = false;
            storage().saveChord(chord);
            renderDetailFretboard(chord);
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
        if (!button || button.disabled) return Promise.resolve(null);
        button.disabled = true;
        button.textContent = '書き出し中…';
        setExportStatus('', false);
        var rangeText = window.ChordCruise.caged.formatFretRange(chord.fretRange);
        var diagramOptions = savedDiagramOptions(chord, {
            mode: detailDisplayMode(),
            monochrome: detailMonochrome
        });
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
            button.textContent = '書き出し';
            return result;
        });
    }

    function renderDetail() {
        closeLibraryDisplaySheet(false);
        view = 'detail';
        entrySortMode = false;
        entrySortFolderId = null;
        currentListChords = [];
        detailMonochrome = false;
        setContentLayout('detail');
        var chord = storage().loadChord(currentChordId);
        if (!chord) {
            renderList();
            return;
        }
        currentDetailChord = chord;
        var displayName = displayChordName(chord.chordName);
        var displayFormName = chordFormName(chord);

        var html = '<div class="cc-card">' +
            '<div class="cc-fb-head">' +
                '<span class="cc-save-label">表示</span>' +
                '<div class="cc-segment" role="group" aria-label="表示切替">' +
                    '<button type="button" class="cc-segment-btn" id="cc-libmode-note">CDE</button>' +
                    '<button type="button" class="cc-segment-btn" id="cc-libmode-solfege">ドレミ</button>' +
                    '<button type="button" class="cc-segment-btn" id="cc-libmode-degree">度数</button>' +
                    '<button type="button" class="cc-segment-btn" id="cc-libmode-finger">運指</button>' +
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
                '<button type="button" class="cc-btn cc-btn-secondary cc-lib-export-btn" id="cc-lib-export-btn">書き出し</button>' +
                '<button type="button" class="cc-btn cc-btn-secondary cc-lib-edit-btn" id="cc-lib-edit-btn">編集</button>' +
            '</div>' +
            '<p class="cc-lib-export-status" id="cc-lib-export-status" style="display:none;"></p>' +
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
                window.ChordCruise.storage.saveSettings({ fretboardDisplayMode: mode });
                window.ChordCruise.state.settings.fretboardDisplayMode = mode;
                updateLibModeSegments();
                renderDetailFretboard(chord);
            });
        });
        updateLibModeSegments();
        renderDetailFretboard(chord);
        updateMonochromeControl();

        document.getElementById('cc-lib-monochrome-toggle').addEventListener('click', function () {
            detailMonochrome = !detailMonochrome;
            updateMonochromeControl();
            renderDetailFretboard(chord);
        });
        document.getElementById('cc-lib-export-btn').addEventListener('click', function () {
            exportCurrentChord(chord);
        });
        document.getElementById('cc-lib-edit-btn').addEventListener('click', function () {
            window.ChordCruise.ui.saveEditor.openExisting({
                chord: chord,
                onSaved: function (record) {
                    currentChordId = record.id;
                    renderDetail();
                }
            });
        });

        // 名前・メモ編集
        document.getElementById('cc-lib-save-edit').addEventListener('click', function () {
            chord.chordName = displayChordName(
                document.getElementById('cc-lib-chord-name').value.trim() || chord.chordName
            );
            chord.formName = document.getElementById('cc-lib-form-name').value.trim() || displayFormName;
            chord.memo = document.getElementById('cc-lib-memo').value.trim();
            storage().saveChord(chord);
            document.getElementById('cc-lib-detail-name').textContent = chord.chordName;
            var hint = document.getElementById('cc-lib-edit-hint');
            hint.style.display = '';
            setTimeout(function () { hint.style.display = 'none'; }, 1800);
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
            chord.folderId = moveSelect.value;
            storage().saveChord(chord);
        });

        // 削除
        document.getElementById('cc-lib-delete').addEventListener('click', function () {
            confirmDanger('「' + displayChordName(chord.chordName) + '（' + chordFormName(chord) + '）」を削除しますか？この操作は取り消せません。', '削除する', function () {
                storage().deleteChord(chord.id);
                renderList();
            });
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
        closeLibraryDisplaySheet(false);
        view = 'folders';
        currentDetailChord = null;
        currentListChords = [];
        detailMonochrome = false;
        folderSortMode = false;
        entrySortMode = false;
        entrySortFolderId = null;
    }

    document.addEventListener('chordcruise:fretboard-settings-change', function () {
        if (view === 'detail' && currentDetailChord) {
            renderDetailFretboard(currentDetailChord);
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
        libraryCardTextScale: libraryCardTextScale
    };
})();
