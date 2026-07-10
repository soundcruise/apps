(function () {
    'use strict';

    /* コードクルーズ専用指板レンダラー。
       寸法・配色は指板クルーズのデフォルト表示（フラット投影）を再現した値。
       既存アプリのコードには依存しない。 */

    var FRET_W = 65;            // 1フレット列の幅（指板クルーズと同値）
    var TOP_Y = 15;             // ネック上端
    var STRING_GAP = 30;        // 弦間隔
    var STRING_AREA = 180;      // 弦域の高さ
    var BOARD_BOTTOM = TOP_Y + STRING_AREA;   // 195
    var STRIP_H = 34;           // フレット番号帯
    var SVG_H = BOARD_BOTTOM + 5 + STRIP_H;   // 234
    var EDGE_H = 3;             // ネック上下端の黒縁
    var MARKER_D = 30;          // マーカー直径
    var STRING_WIDTHS = [1.1, 1.3, 1.6, 2.0, 2.4, 2.8]; // 1弦→6弦
    var INLAY_SINGLE = [3, 5, 7, 9, 15, 17, 19, 21];
    var INLAY_DOUBLE = [12, 24];
    var POSITION_FRETS = [0, 3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

    var uidCounter = 0;

    function colCenter(fret, startFret) {
        return (fret - startFret) * FRET_W + FRET_W / 2;
    }

    function stringY(stringNum) {
        return TOP_Y + STRING_GAP / 2 + (stringNum - 1) * STRING_GAP;
    }

    function buildDefs(uid) {
        return '<defs>' +
            '<linearGradient id="cc-wood-' + uid + '" x1="0%" y1="0%" x2="100%" y2="0%">' +
                '<stop offset="0%" stop-color="#17100b"/>' +
                '<stop offset="14%" stop-color="#2d1e14"/>' +
                '<stop offset="33%" stop-color="#3f2a1a"/>' +
                '<stop offset="52%" stop-color="#5a3a23"/>' +
                '<stop offset="68%" stop-color="#442b1b"/>' +
                '<stop offset="84%" stop-color="#2c1c12"/>' +
                '<stop offset="100%" stop-color="#18110c"/>' +
            '</linearGradient>' +
            '<linearGradient id="cc-fretwire-' + uid + '" x1="0%" y1="0%" x2="100%" y2="0%">' +
                '<stop offset="0%" stop-color="#777"/>' +
                '<stop offset="18%" stop-color="#b8b8b8"/>' +
                '<stop offset="38%" stop-color="#f2f2f2"/>' +
                '<stop offset="50%" stop-color="#ffffff"/>' +
                '<stop offset="64%" stop-color="#dfdfdf"/>' +
                '<stop offset="82%" stop-color="#9a9a9a"/>' +
                '<stop offset="100%" stop-color="#5e5e5e"/>' +
            '</linearGradient>' +
            '<linearGradient id="cc-nut-' + uid + '" x1="0%" y1="0%" x2="100%" y2="0%">' +
                '<stop offset="0%" stop-color="#c7c1b0"/>' +
                '<stop offset="35%" stop-color="#ece6d6"/>' +
                '<stop offset="55%" stop-color="#faf4e6"/>' +
                '<stop offset="78%" stop-color="#dcd5c5"/>' +
                '<stop offset="100%" stop-color="#b9b3a4"/>' +
            '</linearGradient>' +
        '</defs>';
    }

    function shouldHighlightFret(fret, mode, highlightedFrets) {
        if (['all', 'position', 'custom'].indexOf(mode) === -1) mode = 'all';
        if (mode === 'all') return true;
        if (mode === 'custom') return highlightedFrets.indexOf(fret) !== -1;
        return POSITION_FRETS.indexOf(fret) !== -1;
    }

    function buildBoardSvg(uid, startFret, endFret, rangeHighlight, highlightMode, highlightedFrets) {
        var width = (endFret - startFret + 1) * FRET_W;
        var hasOpenColumn = startFret === 0;
        var boardX = hasOpenColumn ? FRET_W : 0;
        var svg = '<svg class="cc-fb-svg" width="' + width + '" height="' + SVG_H + '" viewBox="0 0 ' + width + ' ' + SVG_H + '" aria-hidden="true">';
        svg += buildDefs(uid);

        // 開放弦列のうっすらした下地
        if (hasOpenColumn) {
            svg += '<rect x="0" y="' + TOP_Y + '" width="' + FRET_W + '" height="' + STRING_AREA + '" fill="rgba(255,255,255,0.03)" rx="4"/>';
        }

        // 指板の木目＋上下の縁
        svg += '<rect x="' + boardX + '" y="' + (TOP_Y + EDGE_H) + '" width="' + (width - boardX) + '" height="' + (STRING_AREA - EDGE_H * 2) + '" fill="url(#cc-wood-' + uid + ')"/>';
        svg += '<rect x="' + boardX + '" y="' + TOP_Y + '" width="' + (width - boardX) + '" height="' + EDGE_H + '" fill="rgba(255,244,220,0.28)"/>';
        svg += '<rect x="' + boardX + '" y="' + (BOARD_BOTTOM - EDGE_H) + '" width="' + (width - boardX) + '" height="' + EDGE_H + '" fill="rgba(8,6,4,0.92)"/>';

        // 保存範囲などのハイライト（includesOpen のとき開放弦列も含める）
        if (rangeHighlight && typeof rangeHighlight.minFret === 'number' && typeof rangeHighlight.maxFret === 'number') {
            var visibleMin = Math.max(startFret, rangeHighlight.minFret);
            var visibleMax = Math.min(endFret, rangeHighlight.maxFret);
            if (visibleMin <= visibleMax) {
                var hx = (visibleMin - startFret) * FRET_W;
                var hw = (visibleMax - visibleMin + 1) * FRET_W;
                svg += '<rect x="' + hx + '" y="' + TOP_Y + '" width="' + hw + '" height="' + STRING_AREA + '" fill="rgba(212,175,55,0.14)" stroke="rgba(232,201,122,0.55)" stroke-width="1.5" rx="6"/>';
            }
            if (hasOpenColumn && rangeHighlight.includesOpen) {
                svg += '<rect x="2" y="' + TOP_Y + '" width="' + (FRET_W - 4) + '" height="' + STRING_AREA + '" fill="rgba(212,175,55,0.10)" stroke="rgba(232,201,122,0.4)" stroke-width="1.2" stroke-dasharray="5 4" rx="6"/>';
            }
        }

        // ポジションマーク（インレイ）
        INLAY_SINGLE.forEach(function (f) {
            if (f < startFret || f > endFret) return;
            svg += '<circle cx="' + colCenter(f, startFret) + '" cy="' + (TOP_Y + STRING_AREA / 2) + '" r="5.5" fill="rgba(235,220,190,0.5)"/>';
        });
        INLAY_DOUBLE.forEach(function (f) {
            if (f < startFret || f > endFret) return;
            svg += '<circle cx="' + colCenter(f, startFret) + '" cy="' + (TOP_Y + STRING_AREA / 2 - 30) + '" r="5.5" fill="rgba(235,220,190,0.5)"/>';
            svg += '<circle cx="' + colCenter(f, startFret) + '" cy="' + (TOP_Y + STRING_AREA / 2 + 30) + '" r="5.5" fill="rgba(235,220,190,0.5)"/>';
        });

        // フレットワイヤー（実フレット番号を表示列へ写像する）
        var f;
        for (f = Math.max(1, startFret); f <= endFret; f++) {
            var wx = (f - startFret + 1) * FRET_W;
            svg += '<rect x="' + (wx - 2) + '" y="' + TOP_Y + '" width="4" height="' + STRING_AREA + '" fill="url(#cc-fretwire-' + uid + ')" rx="1.5"/>';
        }

        // ナット
        if (hasOpenColumn) {
            svg += '<rect x="' + (FRET_W - 4) + '" y="' + TOP_Y + '" width="8" height="' + STRING_AREA + '" fill="url(#cc-nut-' + uid + ')" rx="2"/>';
        }

        // 弦（1弦=上、6弦=下）
        var s;
        for (s = 1; s <= 6; s++) {
            var y = stringY(s);
            var color = s <= 2 ? '#e8e8e8' : '#d6cdbb';
            svg += '<rect x="0" y="' + (y - STRING_WIDTHS[s - 1] / 2) + '" width="' + width + '" height="' + STRING_WIDTHS[s - 1] + '" fill="' + color + '" opacity="0.92"/>';
        }

        // フレット番号帯
        var stripY = BOARD_BOTTOM + 5;
        svg += '<rect x="0" y="' + stripY + '" width="' + width + '" height="' + STRIP_H + '" fill="rgba(0,0,0,0.35)" rx="6"/>';
        for (f = startFret; f <= endFret; f++) {
            var highlighted = shouldHighlightFret(f, highlightMode, highlightedFrets);
            svg += '<text class="cc-fb-fret-number' + (highlighted ? ' cc-fb-fret-number--highlighted' : '') + '" x="' + colCenter(f, startFret) + '" y="' + (stripY + 22) + '" text-anchor="middle" font-weight="600">' + f + '</text>';
        }

        svg += '</svg>';
        return svg;
    }

    /**
     * 指板を描画する。
     * @param {HTMLElement} host 描画先
     * @param {Object} options
     *   startFret / endFret 表示する実フレット範囲（既定 0〜13）
     *   markers        [{ string:1-6, fret:実フレット番号, label, role, dimmed, finger }]
     *   barres         [{ finger, fret, fromString, toString }] バレー表示（マーカー背面の縦長カプセル）
     *   mutedStrings   ミュート弦番号の配列（開放弦列に ✕ を表示）
     *   rangeHighlight { minFret, maxFret, includesOpen } | null
     *   scrollToFret   このフレットが中央付近に来るよう初期スクロール（null で先頭）
     *   preserveScroll 再描画時に維持したい scrollLeft（null で無効）
     *   onSlotTap      function(stringNum, fret) マーカータップ時（運指編集用）
     */
    function render(host, options) {
        if (!host) return;
        var opts = options || {};
        var startFret = typeof opts.startFret === 'number' ? opts.startFret : 0;
        var endFret = typeof opts.endFret === 'number'
            ? opts.endFret
            : (typeof opts.maxFret === 'number' ? opts.maxFret : 13);
        if (endFret < startFret) endFret = startFret;
        var markers = opts.markers || [];
        var mutedStrings = opts.mutedStrings || [];
        var settings = window.ChordCruise && window.ChordCruise.state && window.ChordCruise.state.settings;
        var highlightMode = opts.fretNumberHighlightMode || (settings && settings.fretNumberHighlightMode) || 'all';
        var highlightedFrets = Array.isArray(opts.highlightedFrets)
            ? opts.highlightedFrets
            : (settings && Array.isArray(settings.highlightedFrets) ? settings.highlightedFrets : POSITION_FRETS);
        var uid = ++uidCounter;
        var width = (endFret - startFret + 1) * FRET_W;

        var html = '<div class="cc-fb-scroll">';
        html += '<div class="cc-fb-stage" style="width:' + width + 'px;height:' + SVG_H + 'px;">';
        html += buildBoardSvg(uid, startFret, endFret, opts.rangeHighlight || null, highlightMode, highlightedFrets);
        html += '<div class="cc-fb-markers"></div>';
        html += '</div></div>';
        host.innerHTML = html;

        var markerLayer = host.querySelector('.cc-fb-markers');

        // バレーはマーカーより先に描画し、丸マーカーをカプセルの上に重ねる
        (opts.barres || []).forEach(function (barre) {
            if (barre.fret < startFret || barre.fret > endFret) return;
            var topString = Math.min(barre.fromString, barre.toString);
            var bottomString = Math.max(barre.fromString, barre.toString);
            if (topString < 1 || bottomString > 6 || topString === bottomString) return;
            var topY = stringY(topString);
            var bottomY = stringY(bottomString);
            var el = document.createElement('div');
            el.className = 'cc-fb-barre';
            el.style.left = colCenter(barre.fret, startFret) + 'px';
            el.style.top = (topY - MARKER_D / 2 - 2) + 'px';
            el.style.height = (bottomY - topY + MARKER_D + 4) + 'px';
            markerLayer.appendChild(el);
        });

        markers.forEach(function (m) {
            if (m.fret < startFret || m.fret > endFret || m.string < 1 || m.string > 6) return;
            var el = document.createElement('div');
            var cls = 'cc-fb-marker cc-fb-marker--' + (m.role || 'other');
            if (m.dimmed) cls += ' cc-fb-marker--dimmed';
            if (m.tappable) cls += ' cc-fb-marker--tappable';
            el.className = cls;
            el.style.left = colCenter(m.fret, startFret) + 'px';
            el.style.top = stringY(m.string) + 'px';
            el.textContent = m.label != null ? m.label : '';
            el.dataset.string = String(m.string);
            el.dataset.fret = String(m.fret);
            markerLayer.appendChild(el);
        });

        mutedStrings.forEach(function (s) {
            if (s < 1 || s > 6) return;
            var el = document.createElement('div');
            el.className = 'cc-fb-mute';
            el.style.left = colCenter(startFret, startFret) + 'px';
            el.style.top = stringY(s) + 'px';
            el.textContent = '✕';
            markerLayer.appendChild(el);
        });

        if (typeof opts.onSlotTap === 'function') {
            markerLayer.addEventListener('click', function (event) {
                var marker = event.target.closest('.cc-fb-marker');
                if (!marker) return;
                opts.onSlotTap(parseInt(marker.dataset.string, 10), parseInt(marker.dataset.fret, 10));
            });
        }

        var scroll = host.querySelector('.cc-fb-scroll');
        if (typeof opts.preserveScroll === 'number' && opts.preserveScroll >= 0) {
            scroll.scrollLeft = opts.preserveScroll;
        } else if (typeof opts.scrollToFret === 'number') {
            scroll.scrollLeft = Math.max(0, colCenter(opts.scrollToFret, startFret) - scroll.clientWidth / 2);
        }
    }

    function getScrollLeft(host) {
        var scroll = host ? host.querySelector('.cc-fb-scroll') : null;
        return scroll ? scroll.scrollLeft : null;
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.ui = window.ChordCruise.ui || {};
    window.ChordCruise.ui.fretboard = {
        render: render,
        getScrollLeft: getScrollLeft,
        FRET_W: FRET_W,
        POSITION_FRETS: POSITION_FRETS.slice()
    };
})();
