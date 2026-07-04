/* クルーズスタジオ — sheet-renderer.js（v0.7.0）
   StudioProject → A4固定紙面DOM のレンダラー（ADR-016）。
   「譜面は曲データのビュー」（APP_CONCEPT.md 4章）の紙面実装。

   構造: .sheet-page（A4ページ）> ヘッダー / セクション見出し / .sheet-line（譜面行）> .sheet-bar（小節セル）
   - 画面では theme.css が 794×1123px（A4@96dpi）で表示し、印刷では print.css が 210mm へ寄せる
   - 1行の小節数は sheetSettings.barsPerLine（歌詞・ドレミなしのセクションは2倍詰め）
   - bars[].lineBreakAfter は現状未使用（手動改行UIの導入時に使う。ADR-016）
   - 現状は1ページに全内容を流し、印刷時の改ページはCSS（break-inside/break-after）に任せる。
     将来の複数ページ分割は、この render() がページ配列を返す形に拡張する
   グローバル名前空間 CruiseStudio.sheetRenderer に登録する。 */
(function () {
    'use strict';

    function CS() { return window.CruiseStudio || {}; }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    /**
     * 表示設定の欠損補完（古い保存データでも安全に読む）。
     */
    function resolveShowSettings(project) {
        var s = (project && project.sheetSettings) || {};
        return {
            chords: s.showChords !== false,
            lyrics: s.showLyrics !== false,
            doremi: s.showDoremi !== false,
            barsPerLine: (typeof s.barsPerLine === 'number' && s.barsPerLine > 0) ? s.barsPerLine : 2
        };
    }

    function basicStrumName(project) {
        var name = '';
        (project.strumPatterns || []).forEach(function (pat) {
            if (pat.id === project.basicStrumPatternId) name = pat.name;
        });
        return name;
    }

    /* ══════════ 紙面ヘッダー ══════════ */

    function buildHeader(project) {
        var si = project.songInfo;
        var header = el('div', 'sheet-header');

        var titleRow = el('div', 'sheet-title-row');
        titleRow.appendChild(el('span', 'sheet-title', si.title || '無題'));
        if (si.artist) {
            titleRow.appendChild(el('span', 'sheet-artist', '/ ' + si.artist));
        }
        header.appendChild(titleRow);

        var meta = el('div', 'sheet-meta');
        var items = [
            ['ORGキー', si.originalKey],
            ['Playキー', si.capo > 0 ? si.capo + 'カポ' + si.playKey : si.playKey],
            ['カポ', si.capo > 0 ? String(si.capo) : 'なし'],
            ['BPM', String(si.bpm)],
            ['拍子', si.timeSignature.beats + '/' + si.timeSignature.beatUnit]
        ];
        var strum = basicStrumName(project);
        if (strum) items.push(['基本ストローク', strum]);
        items.forEach(function (pair) {
            var item = el('span', 'sheet-meta-item');
            item.appendChild(el('span', 'sheet-meta-label', pair[0] + ': '));
            item.appendChild(el('span', 'sheet-meta-value', pair[1]));
            meta.appendChild(item);
        });
        header.appendChild(meta);
        return header;
    }

    /* ══════════ 小節セル ══════════ */

    function buildBarCell(bar, show, hasVocal) {
        var theory = CS().theory;
        var model = CS().model;
        var cell = el('div', 'sheet-bar');

        cell.appendChild(el('span', 'sheet-bar-num', String(bar.barNumber)));

        if (show.chords) {
            var chord = el('span', 'sheet-bar-chord',
                (bar.chords[0] && bar.chords[0].symbol) || '');
            cell.appendChild(chord);
        }

        if (hasVocal && show.lyrics) {
            cell.appendChild(el('span', 'sheet-bar-lyrics', model.getBarLyricsText(bar)));
        }

        if (hasVocal && show.doremi) {
            var doremi = el('span', 'sheet-bar-doremi');
            theory.melodyEventsToDoremiTokens(bar.melody || []).forEach(function (token) {
                var note = el('span', 'sheet-doremi-note' +
                    (token.octave > 0 ? ' is-high' : (token.octave < 0 ? ' is-low' : '')), token.text);
                doremi.appendChild(note);
            });
            cell.appendChild(doremi);
        }
        return cell;
    }

    /* ══════════ 本体 ══════════ */

    /**
     * StudioProject をA4紙面DOMとしてレンダリングし、container を置き換える。
     * @returns {HTMLElement} 生成した .sheet-page（複数ページ化する将来は配列先頭）
     */
    function render(project, container) {
        var model = CS().model;
        var show = resolveShowSettings(project);

        container.innerHTML = '';
        var page = el('div', 'sheet-page');
        page.appendChild(buildHeader(project));

        project.sections.forEach(function (sec) {
            var bars = model.getSectionBars(project, sec.id);
            if (bars.length === 0) return;

            page.appendChild(el('div', 'sheet-section-label', sec.name));

            // 歌詞もドレミも出ないセクション（前奏など）は2倍詰めのコード段にする
            var hasVocal = bars.some(function (bar) {
                return (show.lyrics && bar.lyrics && bar.lyrics.length > 0) ||
                    (show.doremi && bar.melody && bar.melody.length > 0);
            });
            var cols = hasVocal ? show.barsPerLine : show.barsPerLine * 2;

            // 譜面行（.sheet-line）単位で組む: 印刷時に行の途中で改ページさせない
            for (var i = 0; i < bars.length; i += cols) {
                var line = el('div', 'sheet-line' + (hasVocal ? '' : ' sheet-line--compact'));
                line.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
                var lineBars = bars.slice(i, i + cols);
                lineBars.forEach(function (bar) {
                    line.appendChild(buildBarCell(bar, show, hasVocal));
                });
                // 行末まで小節線を揃えるための空セル
                for (var pad = lineBars.length; pad < cols; pad++) {
                    line.appendChild(el('div', 'sheet-bar sheet-bar--empty'));
                }
                page.appendChild(line);
            }
        });

        container.appendChild(page);
        return page;
    }

    window.CruiseStudio = window.CruiseStudio || {};
    window.CruiseStudio.sheetRenderer = {
        render: render,
        resolveShowSettings: resolveShowSettings
    };
})();
