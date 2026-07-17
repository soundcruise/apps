(function () {
    'use strict';

    /* コードクルーズ専用指板レンダラー。
       寸法・配色は指板クルーズのデフォルト表示（フラット投影）を再現した値。
       既存アプリのコードには依存しない。 */

    var FRET_W = 65;            // 1フレット列の幅（指板クルーズと同値）
    var TOP_Y = 22;             // ネック上端（白黒マーカー／バレーのstroke用に上端7pxを確保）
    var STRING_GAP = 30;        // 弦間隔
    var STRING_AREA = 180;      // 弦域の高さ
    var BOARD_BOTTOM = TOP_Y + STRING_AREA;   // 202
    var NUMBER_AREA_H = 34;     // 背景なしのフレット番号表示領域
    var SVG_H = BOARD_BOTTOM + 5 + NUMBER_AREA_H;   // 241
    var EDGE_H = 3;             // ネック上下端の黒縁
    var MARKER_D = 30;          // マーカー直径
    var MUTE_HALF = 8.5;        // ミュート線の中心から端まで（stroke込みで約20px四方）
    var MUTE_STROKE = 3;
    var STRING_WIDTHS = [1.1, 1.3, 1.6, 2.0, 2.4, 2.8]; // 1弦→6弦
    var INLAY_SINGLE = [3, 5, 7, 9, 15, 17, 19, 21];
    var INLAY_DOUBLE = [12, 24];
    var POSITION_FRETS = [0, 3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

    var uidCounter = 0;

    function normalizeFrets(options) {
        var opts = options || {};
        var frets = [];
        var seen = {};
        if (Array.isArray(opts.frets)) {
            opts.frets.forEach(function (fret) {
                if (typeof fret !== 'number' || Math.floor(fret) !== fret || fret < 0 || seen[fret]) return;
                seen[fret] = true;
                frets.push(fret);
            });
            frets.sort(function (a, b) { return a - b; });
        }
        if (frets.length) return frets;

        var startFret = typeof opts.startFret === 'number' ? opts.startFret : 0;
        var endFret = typeof opts.endFret === 'number'
            ? opts.endFret
            : (typeof opts.maxFret === 'number' ? opts.maxFret : 13);
        if (endFret < startFret) endFret = startFret;
        var fret;
        for (fret = startFret; fret <= endFret; fret++) frets.push(fret);
        return frets;
    }

    function fretIndex(fret, frets) {
        return frets.indexOf(fret);
    }

    function colCenter(fret, frets) {
        var index = fretIndex(fret, frets);
        return index === -1 ? null : index * FRET_W + FRET_W / 2;
    }

    function stringY(stringNum, monochrome) {
        if (monochrome) {
            return TOP_Y + (stringNum - 1) * (STRING_AREA / 5);
        }
        return TOP_Y + STRING_GAP / 2 + (stringNum - 1) * STRING_GAP;
    }

    function fretPosition(fret, frets) {
        var exact = colCenter(fret, frets);
        if (exact !== null) return exact;
        var i;
        for (i = 0; i < frets.length - 1; i++) {
            if (fret > frets[i] && fret < frets[i + 1]) {
                var ratio = (fret - frets[i]) / (frets[i + 1] - frets[i]);
                return (i + 0.5 + ratio) * FRET_W;
            }
        }
        return fret <= frets[0] ? FRET_W / 2 : (frets.length - 0.5) * FRET_W;
    }

    function buildDefs(uid, monochrome) {
        if (monochrome) {
            return '<defs>' +
                '<linearGradient id="cc-wood-' + uid + '" x1="0%" y1="0%" x2="100%" y2="0%">' +
                    '<stop offset="0%" stop-color="#f8f8f8"/>' +
                    '<stop offset="50%" stop-color="#e5e5e5"/>' +
                    '<stop offset="100%" stop-color="#f4f4f4"/>' +
                '</linearGradient>' +
                '<linearGradient id="cc-fretwire-' + uid + '" x1="0%" y1="0%" x2="100%" y2="0%">' +
                    '<stop offset="0%" stop-color="#222"/>' +
                    '<stop offset="50%" stop-color="#777"/>' +
                    '<stop offset="100%" stop-color="#222"/>' +
                '</linearGradient>' +
                '<linearGradient id="cc-nut-' + uid + '" x1="0%" y1="0%" x2="100%" y2="0%">' +
                    '<stop offset="0%" stop-color="#111"/>' +
                    '<stop offset="50%" stop-color="#555"/>' +
                    '<stop offset="100%" stop-color="#111"/>' +
                '</linearGradient>' +
            '</defs>';
        }
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

    function buildBoardSvg(uid, frets, rangeHighlight, highlightMode, highlightedFrets, monochrome, staticStyles, svgClass) {
        var width = frets.length * FRET_W;
        var hasOpenColumn = frets[0] === 0;
        var boardX = hasOpenColumn ? FRET_W : 0;
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" class="' + (svgClass || 'cc-fb-svg') + '" width="' + width + '" height="' + SVG_H + '" viewBox="0 0 ' + width + ' ' + SVG_H + '" aria-hidden="true">';
        svg += buildDefs(uid, monochrome);

        if (monochrome) {
            // 白黒図は全面を白にし、上下の装飾的なネック外周線を描画しない。
            svg += '<rect class="cc-fb-mono-board" x="0" y="' + TOP_Y + '" width="' + width + '" height="' + STRING_AREA + '" fill="#ffffff"/>';
        } else {
            // 開放弦列のうっすらした下地
            if (hasOpenColumn) {
                svg += '<rect x="0" y="' + TOP_Y + '" width="' + FRET_W + '" height="' + STRING_AREA + '" fill="rgba(255,255,255,0.03)" rx="4"/>';
            }

            // 指板の木目＋上下の縁（カラー表示のみ）
            svg += '<rect x="' + boardX + '" y="' + (TOP_Y + EDGE_H) + '" width="' + (width - boardX) + '" height="' + (STRING_AREA - EDGE_H * 2) + '" fill="url(#cc-wood-' + uid + ')"/>';
            svg += '<rect x="' + boardX + '" y="' + TOP_Y + '" width="' + (width - boardX) + '" height="' + EDGE_H + '" fill="rgba(255,244,220,0.28)"/>';
            svg += '<rect x="' + boardX + '" y="' + (BOARD_BOTTOM - EDGE_H) + '" width="' + (width - boardX) + '" height="' + EDGE_H + '" fill="rgba(8,6,4,0.92)"/>';
        }

        // 保存範囲などのハイライト。開放フォームでは0F〜formEndを連続範囲として扱う。
        if (!monochrome && rangeHighlight && typeof rangeHighlight.minFret === 'number' && typeof rangeHighlight.maxFret === 'number') {
            frets.forEach(function (fret, index) {
                var included = fret >= rangeHighlight.minFret && fret <= rangeHighlight.maxFret;
                if (!included) return;
                svg += '<rect x="' + (index * FRET_W) + '" y="' + TOP_Y + '" width="' + FRET_W + '" height="' + STRING_AREA + '" fill="rgba(212,175,55,0.14)" stroke="rgba(232,201,122,0.55)" stroke-width="1.5" rx="6"/>';
            });
        }

        // ポジションマーク（インレイ）
        if (!monochrome) {
            INLAY_SINGLE.forEach(function (f) {
                var center = colCenter(f, frets);
                if (center === null) return;
                svg += '<circle class="cc-fb-position-mark" cx="' + center + '" cy="' + (TOP_Y + STRING_AREA / 2) + '" r="5.5" fill="rgba(235,220,190,0.5)"/>';
            });
            INLAY_DOUBLE.forEach(function (f) {
                var center = colCenter(f, frets);
                if (center === null) return;
                svg += '<circle class="cc-fb-position-mark" cx="' + center + '" cy="' + (TOP_Y + STRING_AREA / 2 - 30) + '" r="5.5" fill="rgba(235,220,190,0.5)"/>';
                svg += '<circle class="cc-fb-position-mark" cx="' + center + '" cy="' + (TOP_Y + STRING_AREA / 2 + 30) + '" r="5.5" fill="rgba(235,220,190,0.5)"/>';
            });
        }

        // フレットワイヤー（実フレット番号を表示列へ写像する）
        if (monochrome) {
            frets.forEach(function (f, index) {
                if (f === 0 || index === frets.length - 1) return;
                var wx = (index + 1) * FRET_W;
                svg += '<rect class="cc-fb-mono-fret" x="' + (wx - 1) + '" y="' + TOP_Y + '" width="2" height="' + STRING_AREA + '" fill="#333333"/>';
            });
            // 切り出した図の左右境界。右端は最終フレット線と兼用し二重描画しない。
            svg += '<rect class="cc-fb-mono-boundary" x="0" y="' + TOP_Y + '" width="2" height="' + STRING_AREA + '" fill="#333333"/>';
            svg += '<rect class="cc-fb-mono-boundary" x="' + (width - 2) + '" y="' + TOP_Y + '" width="2" height="' + STRING_AREA + '" fill="#333333"/>';
        } else {
            frets.forEach(function (f, index) {
                if (f === 0) return;
                var wx = (index + 1) * FRET_W;
                svg += '<rect x="' + (wx - 2) + '" y="' + TOP_Y + '" width="4" height="' + STRING_AREA + '" fill="url(#cc-fretwire-' + uid + ')" rx="1.5"/>';
            });
        }

        // ナット
        if (hasOpenColumn) {
            svg += '<rect x="' + (FRET_W - 4) + '" y="' + TOP_Y + '" width="8" height="' + STRING_AREA + '" fill="url(#cc-nut-' + uid + ')" rx="2"/>';
        }

        // 弦（1弦=上、6弦=下）
        var s;
        for (s = 1; s <= 6; s++) {
            var y = stringY(s, monochrome);
            var color = monochrome ? '#333333' : (s <= 2 ? '#e8e8e8' : '#d6cdbb');
            svg += '<rect x="0" y="' + (y - STRING_WIDTHS[s - 1] / 2) + '" width="' + width + '" height="' + STRING_WIDTHS[s - 1] + '" fill="' + color + '" opacity="0.92"/>';
        }

        // フレット番号（背景帯は描画せず、周囲と同じ背景に文字だけを置く）
        var stripY = BOARD_BOTTOM + 5;
        frets.forEach(function (f) {
            var highlighted = shouldHighlightFret(f, highlightMode, highlightedFrets);
            var staticStyle = staticStyles
                ? ' style="font-family:Arial,sans-serif;font-size:13px;fill:' + (monochrome ? '#111111' : (highlighted ? '#f0e0b8' : '#9a978f')) + '"'
                : '';
            svg += '<text class="cc-fb-fret-number' + (highlighted ? ' cc-fb-fret-number--highlighted' : '') + '" x="' + colCenter(f, frets) + '" y="' + (stripY + 22) + '" text-anchor="middle" font-weight="600"' + staticStyle + '>' + f + '</text>';
        });

        svg += '</svg>';
        return svg;
    }

    function resolveHighlightSettings(opts) {
        var settings = window.ChordCruise && window.ChordCruise.state && window.ChordCruise.state.settings;
        return {
            mode: opts.fretNumberHighlightMode || (settings && settings.fretNumberHighlightMode) || 'all',
            frets: Array.isArray(opts.highlightedFrets)
                ? opts.highlightedFrets
                : (settings && Array.isArray(settings.highlightedFrets) ? settings.highlightedFrets : POSITION_FRETS)
        };
    }

    /** 画面・サムネイル・書き出しで共有する座標モデルを作る。 */
    function createModel(options) {
        var opts = options || {};
        var monochrome = !!opts.monochrome;
        var frets = normalizeFrets(opts);
        var markers = [];
        var barres = [];
        var mutedStrings = [];

        (opts.markers || []).forEach(function (marker) {
            var x = colCenter(marker.fret, frets);
            if (x === null || marker.string < 1 || marker.string > 6) return;
            markers.push({
                string: marker.string,
                fret: marker.fret,
                x: x,
                y: stringY(marker.string, monochrome),
                label: marker.label != null ? String(marker.label) : '',
                role: marker.role || 'other',
                dimmed: !!marker.dimmed,
                pendingDelete: !!marker.pendingDelete,
                fingeringWarning: !!marker.fingeringWarning,
                tappable: !!marker.tappable
            });
        });

        (opts.barres || []).forEach(function (barre) {
            var x = colCenter(barre.fret, frets);
            var topString = Math.min(barre.fromString, barre.toString);
            var bottomString = Math.max(barre.fromString, barre.toString);
            if (x === null || topString < 1 || bottomString > 6 || topString === bottomString) return;
            var topY = stringY(topString, monochrome);
            var bottomY = stringY(bottomString, monochrome);
            barres.push({
                finger: barre.finger,
                fret: barre.fret,
                fromString: topString,
                toString: bottomString,
                x: x,
                y: topY - MARKER_D / 2 - 2,
                height: bottomY - topY + MARKER_D + 4
            });
        });

        (opts.mutedStrings || []).forEach(function (stringNum) {
            if (stringNum < 1 || stringNum > 6 || mutedStrings.indexOf(stringNum) !== -1) return;
            mutedStrings.push(stringNum);
        });

        return {
            frets: frets,
            width: frets.length * FRET_W,
            height: SVG_H,
            hasOpenColumn: frets[0] === 0,
            markers: markers,
            barres: barres,
            mutedStrings: mutedStrings,
            muteX: colCenter(frets[0], frets),
            rangeHighlight: opts.rangeHighlight || null,
            monochrome: monochrome,
            highlight: resolveHighlightSettings(opts)
        };
    }

    function escapeXml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function markerPalette(role, monochrome, isOpen) {
        if (monochrome) {
            if (isOpen) return { fill: '#ffffff', stroke: '#111111', text: '#111111', strokeWidth: 2 };
            return { fill: '#111111', stroke: '#111111', text: '#ffffff', strokeWidth: 2 };
        }
        if (role === 'root') return { fill: '#ff4f6e', stroke: '#ff4f6e', text: '#ffffff', strokeWidth: 0 };
        if (role === 'third') return { fill: '#ffd93d', stroke: '#ffd93d', text: '#141311', strokeWidth: 0 };
        if (role === 'fifth') return { fill: '#4f9cf9', stroke: '#4f9cf9', text: '#ffffff', strokeWidth: 0 };
        if (role === 'seventh') return { fill: '#ffffff', stroke: '#ffffff', text: '#141311', strokeWidth: 0 };
        return { fill: '#555555', stroke: '#555555', text: '#eeeeee', strokeWidth: 0 };
    }

    function buildStaticOverlay(model) {
        var svg = '';
        model.barres.forEach(function (barre) {
            svg += '<rect x="' + (barre.x - 18) + '" y="' + barre.y + '" width="36" height="' + barre.height + '" rx="18" fill="' + (model.monochrome ? '#d8d8d8' : 'rgba(255,252,244,0.16)') + '" stroke="' + (model.monochrome ? '#111111' : 'rgba(255,255,255,0.38)') + '" stroke-width="1.5"/>';
        });
        // ミュートは先頭表示列の中央へ置き、丸マーカーと同程度の太い2本線で描く。
        model.mutedStrings.forEach(function (stringNum) {
            var centerY = stringY(stringNum, model.monochrome);
            var color = model.monochrome ? '#111111' : '#d4cec2';
            svg += '<g class="cc-fb-static-mute" stroke="' + color + '" stroke-width="' + MUTE_STROKE + '" stroke-linecap="round">' +
                '<line x1="' + (model.muteX - MUTE_HALF) + '" y1="' + (centerY - MUTE_HALF) + '" x2="' + (model.muteX + MUTE_HALF) + '" y2="' + (centerY + MUTE_HALF) + '"/>' +
                '<line x1="' + (model.muteX + MUTE_HALF) + '" y1="' + (centerY - MUTE_HALF) + '" x2="' + (model.muteX - MUTE_HALF) + '" y2="' + (centerY + MUTE_HALF) + '"/>' +
            '</g>';
        });
        model.markers.forEach(function (marker) {
            var palette = markerPalette(marker.role, model.monochrome, marker.fret === 0);
            var fontSize = marker.fingeringWarning ? 15 : (marker.label.length > 3 ? 9 : (marker.label.length > 2 ? 10 : 12));
            var opacity = marker.dimmed || marker.pendingDelete ? 0.32 : 1;
            var dash = marker.pendingDelete ? ' stroke-dasharray="4 3"' : '';
            var strokeWidth = marker.pendingDelete ? Math.max(2, palette.strokeWidth) : palette.strokeWidth;
            var stroke = marker.pendingDelete ? palette.text : palette.stroke;
            svg += '<g opacity="' + opacity + '">' +
                '<circle cx="' + marker.x + '" cy="' + marker.y + '" r="15" fill="' + palette.fill + '" stroke="' + stroke + '" stroke-width="' + strokeWidth + '"' + dash + '/>' +
                '<text x="' + marker.x + '" y="' + (marker.y + 4) + '" text-anchor="middle" style="font-family:Arial,sans-serif;font-size:' + fontSize + 'px;font-weight:700;fill:' + palette.text + '">' + escapeXml(marker.label) + '</text>' +
            '</g>';
        });
        return svg;
    }

    /** 編集操作を持たない軽量SVG。サムネイルとPNG元データで共用する。 */
    function buildStaticSvg(options) {
        var opts = options || {};
        var model = createModel(opts);
        var uid = ++uidCounter;
        var svg = buildBoardSvg(
            uid,
            model.frets,
            model.rangeHighlight,
            model.highlight.mode,
            model.highlight.frets,
            model.monochrome,
            true,
            opts.svgClass || 'cc-fb-svg cc-fb-static-svg'
        );
        return svg.replace('</svg>', buildStaticOverlay(model) + '</svg>');
    }

    function buildExportSvg(title, diagramOptions) {
        var options = diagramOptions || {};
        var model = createModel(options);
        var nameSize = ['small', 'medium', 'large', 'xlarge'].indexOf(options.chordNameSize) !== -1
            ? options.chordNameSize
            : ((window.ChordCruise.state && window.ChordCruise.state.settings && window.ChordCruise.state.settings.chordNameSize) || 'medium');
        var titleSize = { small: 18, medium: 22, large: 26, xlarge: 30 }[nameSize] || 22;
        var outerWidth = Math.max(260, model.width + 32);
        var diagramY = titleSize + 28;
        var outerHeight = diagramY + SVG_H + 16;
        var diagramX = Math.round((outerWidth - model.width) / 2);
        var diagram = buildStaticSvg(options).replace('<svg ', '<svg x="' + diagramX + '" y="' + diagramY + '" ');
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + outerWidth + '" height="' + outerHeight + '" viewBox="0 0 ' + outerWidth + ' ' + outerHeight + '">' +
            '<rect width="100%" height="100%" fill="' + (options.monochrome ? '#ffffff' : '#141311') + '"/>' +
            '<text x="' + diagramX + '" y="' + (titleSize + 6) + '" style="font-family:Arial,&quot;Hiragino Sans&quot;,sans-serif;font-size:' + titleSize + 'px;font-weight:700;fill:' + (options.monochrome ? '#111111' : '#f0e0b8') + '">' + escapeXml(title) + '</text>' +
            diagram +
        '</svg>';
        return { svg: svg, width: outerWidth, height: outerHeight, scale: 2 };
    }

    /**
     * 指板を描画する。
     * @param {HTMLElement} host 描画先
     * @param {Object} options
     *   frets           表示する実フレット列。指定時は startFret / endFret より優先
     *   startFret / endFret 連続表示する実フレット範囲（既定 0〜13）
     *   markers        [{ string:1-6, fret:実フレット番号, label, role, dimmed, finger }]
     *   barres         [{ finger, fret, fromString, toString }] バレー表示（マーカー背面の縦長カプセル）
     *   mutedStrings   ミュート弦番号の配列（開放列または指板左端に ✕ を表示）
     *   rangeHighlight { minFret, maxFret, includesOpen } | null
     *   scrollToFret   このフレットが中央付近に来るよう初期スクロール（null で先頭）
     *   preserveScroll 再描画時に維持したい scrollLeft（null で無効）
     *   onSlotTap      function(stringNum, fret) マーカータップ時（運指編集用）
     */
    function render(host, options) {
        if (!host) return;
        var opts = options || {};
        var model = createModel(opts);
        var uid = ++uidCounter;
        if (host.classList) host.classList.toggle('cc-fb-host--monochrome', model.monochrome);

        var html = '<div class="cc-fb-scroll">';
        html += '<div class="cc-fb-stage" style="width:' + model.width + 'px;height:' + SVG_H + 'px;">';
        html += buildBoardSvg(uid, model.frets, model.rangeHighlight, model.highlight.mode, model.highlight.frets, model.monochrome, false);
        html += '<div class="cc-fb-markers"></div>';
        html += '</div></div>';
        host.innerHTML = html;

        var markerLayer = host.querySelector('.cc-fb-markers');

        // バレーはマーカーより先に描画し、丸マーカーをカプセルの上に重ねる
        model.barres.forEach(function (barre) {
            var el = document.createElement('div');
            el.className = 'cc-fb-barre';
            el.style.left = barre.x + 'px';
            el.style.top = barre.y + 'px';
            el.style.height = barre.height + 'px';
            markerLayer.appendChild(el);
        });

        model.mutedStrings.forEach(function (s) {
            var el = document.createElement('div');
            el.className = 'cc-fb-mute';
            el.style.left = model.muteX + 'px';
            el.style.top = stringY(s, model.monochrome) + 'px';
            el.setAttribute('aria-hidden', 'true');
            markerLayer.appendChild(el);
        });

        model.markers.forEach(function (m) {
            var el = document.createElement('div');
            var cls = 'cc-fb-marker cc-fb-marker--' + (m.role || 'other');
            if (m.fret === 0) cls += ' cc-fb-marker--open';
            if (m.dimmed) cls += ' cc-fb-marker--dimmed';
            if (m.pendingDelete) cls += ' cc-fb-marker--pending-delete';
            if (m.fingeringWarning) cls += ' cc-fb-marker--warning';
            if (m.tappable) cls += ' cc-fb-marker--tappable';
            el.className = cls;
            el.style.left = m.x + 'px';
            el.style.top = m.y + 'px';
            el.textContent = m.label != null ? m.label : '';
            el.dataset.string = String(m.string);
            el.dataset.fret = String(m.fret);
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
            setScrollCenter(scroll, model.frets, opts.scrollToFret);
        }
    }

    function setScrollCenter(scroll, frets, fret) {
        if (!scroll || !frets.length) return null;
        var center = fretPosition(fret, frets);
        var maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
        var next = Math.min(maxScroll, Math.max(0, center - scroll.clientWidth / 2));
        scroll.scrollLeft = next;
        return next;
    }

    /** 描画後の実測幅を使い、指定フレットを可能な範囲で中央へ寄せる。 */
    function centerOnFret(host, fret, options) {
        var scroll = host ? host.querySelector('.cc-fb-scroll') : null;
        if (!scroll) return null;
        return setScrollCenter(scroll, normalizeFrets(options || {}), fret);
    }

    function getScrollLeft(host) {
        var scroll = host ? host.querySelector('.cc-fb-scroll') : null;
        return scroll ? scroll.scrollLeft : null;
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.ui = window.ChordCruise.ui || {};
    window.ChordCruise.ui.fretboard = {
        render: render,
        createModel: createModel,
        buildStaticSvg: buildStaticSvg,
        buildExportSvg: buildExportSvg,
        centerOnFret: centerOnFret,
        getScrollLeft: getScrollLeft,
        FRET_W: FRET_W,
        POSITION_FRETS: POSITION_FRETS.slice()
    };
})();
