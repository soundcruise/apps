/* クルーズスタジオ — sheet-renderer.js（v0.18.0でstrumNeedsSixteenthを公開。
   F2a/ADR-028で歌詞のtick配置表示に対応し、barNeedsSixteenthはsong-model.jsの
   共通関数（barNeedsSixteenthResolution）へ委譲するよう変更。それ以外は無変更）
   StudioProject → A4固定紙面DOM のレンダラー（ADR-016）。
   「譜面は曲データのビュー」（APP_CONCEPT.md 4章）の紙面実装。

   構造: .sheet-page（A4ページ）> ヘッダー / セクション見出し / .sheet-line（譜面行）> .sheet-bar（小節セル）
   - 画面では theme.css が 794×1123px（A4@96dpi）で表示し、印刷では print.css が 210mm へ寄せる
   - 1行の小節数は sheetSettings.barsPerLine（歌詞・ドレミなしのセクションは2倍詰め）
   - bars[].lineBreakAfter は現状未使用（手動改行UIの導入時に使う。ADR-016）
   - 現状は1ページに全内容を流し、印刷時の改ページはCSS（break-inside/break-after）に任せる。
     将来の複数ページ分割は、この render() がページ配列を返す形に拡張する
   - タイミンググリッド（S1a）: sheetSettings.showTimingGrid がONのとき、各小節セルの
     背面に .sheet-bar-grid（拍・8分・16分の縦線）を敷く。紙面DOMの一部なので
     印刷/PDFにもそのまま反映される（OFFなら要素自体を生成しない）
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
     * showTimingGrid / timingGridResolution は表示専用の追加フィールドのため、
     * 欠損していてもここで既定値（ON・8分）に補完する（schemaVersionは1のまま）。
     */
    function resolveShowSettings(project) {
        var s = (project && project.sheetSettings) || {};
        return {
            chords: s.showChords !== false,
            lyrics: s.showLyrics !== false,
            doremi: s.showDoremi !== false,
            strum: s.showStrum !== false,
            barsPerLine: (typeof s.barsPerLine === 'number' && s.barsPerLine > 0) ? s.barsPerLine : 2,
            timingGrid: s.showTimingGrid !== false,
            gridResolution: (s.timingGridResolution === 16) ? 16 : 8
        };
    }

    function basicStrumName(project) {
        var name = '';
        (project.strumPatterns || []).forEach(function (pat) {
            if (pat.id === project.basicStrumPatternId) name = pat.name;
        });
        return name;
    }

    function resolveBarStrum(project, bar) {
        var model = CS().model;
        var slots = model.getBarEffectiveStrumSlots(project, bar.barNumber);
        if (!Array.isArray(slots) || slots.length === 0) return null;
        return {
            slots: slots,
            barTicks: model.getBarLengthTicks(project),
            needs16: strumNeedsSixteenth(slots)
        };
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

    /* ══════════ タイミンググリッド（S1a） ══════════ */

    /**
     * 16分位置（120tick粒度）のイベントを含む小節か。
     * 含む場合、全体設定が8分でもその小節だけ16分グリッドで表示する
     * （分割状態はデータに持たず、tickから導出する方針）。
     * 判定ロジック自体は song-model.js の barNeedsSixteenthResolution へ委譲する
     * （F2a / ADR-028。strum/lyrics/歌詞セルの解像度判定と共有し、挙動は変えない）。
     */
    function barNeedsSixteenth(bar, strumSlots) {
        return CS().model.barNeedsSixteenthResolution({
            lyrics: bar.lyrics,
            chords: bar.chords,
            melody: bar.melody,
            strumSlots: strumSlots
        });
    }

    /**
     * 小節セルの背面に敷くグリッド線要素を作る。
     * 線の濃淡は theme.css / print.css 側で
     * 小節線（セル枠）＞ 拍線（is-beat）＞ 8分線（is-8th）＞ 16分線（is-16th）とする。
     * @param {number} beats 拍数（4/4なら4）
     * @param {number} resolution 8 または 16
     */
    function buildTimingGrid(beats, resolution) {
        var slotsPerBeat = resolution / 4;            // 8分=2 / 16分=4
        var slots = beats * slotsPerBeat;
        var grid = el('div', 'sheet-bar-grid');
        grid.setAttribute('aria-hidden', 'true');
        grid.style.gridTemplateColumns = 'repeat(' + slots + ', 1fr)';
        for (var s = 0; s < slots; s++) {
            var span = el('span');
            // 各マスの右端の線の種類（最後のマスの右端は小節線なので線なし）
            var boundary = s + 1;
            if (boundary < slots) {
                if (boundary % slotsPerBeat === 0) {
                    span.className = 'is-beat';
                } else if (resolution === 16 && boundary % 2 === 0) {
                    span.className = 'is-8th';
                } else {
                    span.className = (resolution === 16) ? 'is-16th' : 'is-8th';
                }
            }
            grid.appendChild(span);
        }
        return grid;
    }

    /* ══════════ ストローク段（R1。ADR-018） ══════════ */

    /**
     * ストロークslot列に16分位置（120tick粒度）の要素があるか。
     * ある場合、全小節のグリッドを16分表示に引き上げる（基本ストロークは曲全体共通のため）。
     */
    function strumNeedsSixteenth(slots) {
        if (!Array.isArray(slots)) return false;
        return slots.some(function (ev) {
            return (ev.tick % 240 !== 0) || ((ev.durationTicks || 240) % 240 !== 0);
        });
    }

    /**
     * ストローク段（↓↑x・〜の文字表示）を作る。
     * マス数はパターン自身の粒度（8 or 16）で決める。グリッド線が16分でも
     * 8分ストロークは8マスのまま表示する（同じ幅の等分なので拍位置は揃う）。
     * 正しい休符記号・タイ曲線の記譜描画は将来フェーズ（VexFlow導入時）。
     */
    function strumGlyphClass(text) {
        if (text === '・') return 'is-rest';
        if (text === '〜') return 'is-sustain';
        if (text === 'x') return 'is-mute';
        return 'is-stroke';
    }

    function buildStrumRow(slots, barTicks) {
        var res = strumNeedsSixteenth(slots) ? 16 : 8;
        var slotTicks = barTicks / res;
        var glyphs = { down: '↓', up: '↑', mute: 'x' };

        var cells = [];
        for (var c = 0; c < res; c++) cells.push('・');
        slots.forEach(function (ev) {
            var idx = Math.round(ev.tick / slotTicks);
            if (idx < 0 || idx >= res) return;
            cells[idx] = glyphs[ev.action] || '・';
            var len = Math.max(1, Math.round((ev.durationTicks || slotTicks) / slotTicks));
            for (var e = 1; e < len && idx + e < res; e++) cells[idx + e] = '〜';
        });

        var row = el('span', 'sheet-bar-strum sheet-bar-row sheet-bar-strum--' + res);
        row.style.gridTemplateColumns = 'repeat(' + res + ', 1fr)';
        cells.forEach(function (text) {
            row.appendChild(el('span', strumGlyphClass(text), text));
        });
        return row;
    }

    /* ══════════ 歌詞段（F2a / ADR-028: tick配置対応） ══════════ */

    /**
     * 歌詞段のDOMを作る。互換仕様: tick:0の単一イベントだけの小節（または歌詞なし）は
     * 従来どおり全文を1つのspanで表示する（既存プロジェクトの見た目・自動保存し直しをしない）。
     * それ以外（複数イベント、またはtick!==0を含む）は、小節の必要解像度に合わせた
     * 時間軸グリッドへ、各イベントのtick位置ごとに配置する。
     */
    function buildLyricsRow(bar, resolution, barTicksLen) {
        var events = Array.isArray(bar.lyrics) ? bar.lyrics : [];
        var isLegacySingleFull = events.length <= 1 && (events.length === 0 || events[0].tick === 0);
        if (isLegacySingleFull) {
            return el('span', 'sheet-bar-lyrics sheet-bar-row', CS().model.getBarLyricsText(bar));
        }

        var slotTicks = barTicksLen / resolution;
        var cells = [];
        for (var i = 0; i < resolution; i++) cells.push('');
        events.slice().sort(function (a, b) { return a.tick - b.tick; }).forEach(function (ev) {
            if (!ev || typeof ev.tick !== 'number') return;
            var idx = Math.floor(ev.tick / slotTicks);
            if (idx < 0) idx = 0;
            if (idx >= resolution) idx = resolution - 1;
            cells[idx] += ev.text || '';
        });

        var row = el('span', 'sheet-bar-lyrics sheet-bar-row sheet-bar-lyrics--timed');
        row.style.gridTemplateColumns = 'repeat(' + resolution + ', 1fr)';
        cells.forEach(function (text) {
            row.appendChild(el('span', null, text));
        });
        return row;
    }

    /* ══════════ 小節セル ══════════ */

    function buildBarCell(bar, show, hasVocal, beats, strum) {
        var theory = CS().theory;
        var model = CS().model;
        var cell = el('div', 'sheet-bar');
        cell.dataset.barNumber = String(bar.barNumber);
        cell.tabIndex = 0;
        cell.setAttribute('role', 'button');
        cell.setAttribute('aria-label', bar.barNumber + '小節目を選択');

        // タイミンググリッドの解像度。表示ON/OFFに関わらず、歌詞のtick配置にも同じ基準を使う
        // （F2a / ADR-028: 見えないグリッド線であっても歌詞の列位置が基準からズレないように）
        var timeRes = (show.gridResolution === 16 || barNeedsSixteenth(bar, strum && strum.slots) ||
            (strum && strum.needs16)) ? 16 : 8;

        if (show.timingGrid) {
            cell.appendChild(buildTimingGrid(beats, timeRes));
        }

        cell.appendChild(el('span', 'sheet-bar-num', String(bar.barNumber)));

        // 各段に共通クラス .sheet-bar-row を付ける。段と段の間の区切り横線は
        // CSS（.sheet-bar-row + .sheet-bar-row）が引く。将来ストローク段を
        // 追加するときも、同じく .sheet-bar-row を付ければ区切り線が自動で付く
        if (show.chords) {
            var chord = el('span', 'sheet-bar-chord sheet-bar-row',
                (bar.chords[0] && bar.chords[0].symbol) || '');
            cell.appendChild(chord);
        }

        // ストローク段: コード段の直下。小節別上書きがあればそれを優先し、
        // なければユーザー入力済みの基本ストロークを継承する
        if (strum && strum.slots) {
            cell.appendChild(buildStrumRow(strum.slots, strum.barTicks));
        }

        if (hasVocal && show.lyrics) {
            cell.appendChild(buildLyricsRow(bar, timeRes, beats * model.TICKS_PER_BEAT));
        }

        if (hasVocal && show.doremi) {
            var doremi = el('span', 'sheet-bar-doremi sheet-bar-row');
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
        var ts = project.songInfo && project.songInfo.timeSignature;
        var beats = (ts && typeof ts.beats === 'number' && ts.beats > 0) ? ts.beats : 4;

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
                    var strum = show.strum ? resolveBarStrum(project, bar) : null;
                    line.appendChild(buildBarCell(bar, show, hasVocal, beats, strum));
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
        resolveShowSettings: resolveShowSettings,
        // D3a: 下部ドックのタイムグリッド解像度判定（8分/16分）が紙面と同じ基準を使うための公開。
        // ロジック自体は無変更（紙面のストローク段描画とドックのセル表示解像度の両方から使う）
        strumNeedsSixteenth: strumNeedsSixteenth
    };
})();
