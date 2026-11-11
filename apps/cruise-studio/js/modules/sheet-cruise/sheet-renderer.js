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
        return /^[↓↑xX・.．〜～\s]+$/.test(name)?name.replace(/[・.．]/g,' ').trim():name;
    }

    function resolveBarStrum(project, bar) {
        var model = CS().model;
        var slots = model.getBarEffectiveStrumSlots(project, bar.barNumber);
        if(slots&&slots.ok===false)return {unsupported:true,name:slots.name};
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

    // Use the bundled Bravura outlines: no OS music-font or network dependency.
    var restOutlines={};
    function createStrumRestSymbol(ticks){
        var VF=window.Vex&&window.Vex.Flow;
        if(!VF||![120,240].includes(ticks))return el('span','strum-rest-label',ticks===120?'16分休符':ticks===240?'8分休符':'休符');
        if(!restOutlines[ticks]){
            var glyph=new VF.Glyph(ticks===120?'rest16th':'rest8th',60),m=glyph.getMetrics(),commands=[];
            var pen={beginPath:function(){},moveTo:function(x,y){commands.push('M'+x+' '+y);},lineTo:function(x,y){commands.push('L'+x+' '+y);},quadraticCurveTo:function(a,b,x,y){commands.push('Q'+a+' '+b+' '+x+' '+y);},bezierCurveTo:function(a,b,c,d,x,y){commands.push('C'+a+' '+b+' '+c+' '+d+' '+x+' '+y);},fill:function(){}};
            VF.Glyph.renderOutline(pen,m.outline,m.scale,0,0);
            var box=VF.Glyph.getOutlineBoundingBox(m.outline,m.scale,0,0);
            restOutlines[ticks]={path:commands.join(' '),box:[box.getX()-1,box.getY()-1,box.getW()+2,box.getH()+2].join(' ')};
        }
        var ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
        svg.setAttribute('viewBox',restOutlines[ticks].box);svg.setAttribute('width','.9em');svg.setAttribute('height','1.3em');svg.style.verticalAlign='middle';
        svg.setAttribute('data-rest-ticks',ticks);svg.setAttribute('role','img');svg.setAttribute('aria-label',ticks===120?'16分休符':'8分休符');
        path.setAttribute('d',restOutlines[ticks].path);path.setAttribute('fill','currentColor');svg.appendChild(path);return svg;
    }

    // Empty = no event, rest = explicit rest + duration, sustain = previous stroke duration.
    function buildStrumRow(slots, barTicks, viewResolution) {
        var res=Math.max(strumNeedsSixteenth(slots)?16:8,viewResolution===16?16:8);
        var slotTicks=barTicks/res,glyphs={down:'↓',up:'↑',mute:'x'};
        var cells=Array.from({length:res},function(){return {text:'',state:'empty'};});
        slots.forEach(function(ev){
            var idx=Math.round(ev.tick/slotTicks);if(idx<0||idx>=res)return;
            var len=Math.max(1,Math.round((ev.durationTicks||slotTicks)/slotTicks));
            for(var n=0;n<len&&idx+n<res;n++){
                var rest=ev.action==='rest';
                cells[idx+n]=rest?{text:slotTicks===120?'𝄿':'𝄾',state:'rest'}:n?{text:'〜',state:'sustain'}:{text:glyphs[ev.action]||'',state:ev.action};
            }
        });
        var row=el('span','sheet-bar-strum sheet-bar-row sheet-bar-strum--'+res);
        row.style.gridTemplateColumns='repeat('+res+',1fr)';
        cells.forEach(function(value){
            var cell=el('span','is-'+value.state+(['down','up'].includes(value.state)?' is-stroke':''),value.state==='rest'?'':value.text);cell.dataset.strumState=value.state;
            cell.title=value.state==='empty'?'未入力':value.state==='rest'?'休符':value.state==='sustain'?'伸ばし':value.text;
            if(value.state==='rest'){cell.style.color='var(--paper-strum-stroke)';cell.appendChild(createStrumRestSymbol(slotTicks));}
            row.appendChild(cell);
        });
        return row;
    }

    /* ══════════ 歌詞段（F2a / ADR-028: tick配置対応） ══════════ */

    // All text rows share the displayed time grid; rendering never edits event timing.
    function buildTimedTextRow(className,events,resolution,barTicksLen){
        var row=el('span',className+' sheet-bar-row');
        Object.assign(row.style,{display:'grid',gridTemplateColumns:'repeat('+resolution+',minmax(0,1fr))',gap:'0',marginLeft:'calc(-1 * var(--sheet-bar-pad-x))',marginRight:'calc(-1 * var(--sheet-bar-pad-x))',fontSize:'13.5px',fontWeight:'600',letterSpacing:'0',minHeight:'1.5em'});
        var texts=Array(resolution).fill('');
        events.forEach(function(e){var i=Math.floor(e.tick/barTicksLen*resolution);if(i>=0&&i<resolution)texts[i]+=e.text;});
        texts.forEach(function(text,i){var cell=el('span','sheet-timed-cell',text);cell.dataset.slotTick=i*barTicksLen/resolution;Object.assign(cell.style,{textAlign:'center',minWidth:'0',whiteSpace:'nowrap',position:'relative'});row.appendChild(cell);});
        return row;
    }
    function buildLyricsRow(bar,resolution,barTicksLen){
        return buildTimedTextRow('sheet-bar-lyrics sheet-bar-lyrics--timed',(bar.lyrics||[]).map(function(e){return {tick:e.tick,text:e.text||''};}),resolution,barTicksLen);
    }

    /* ══════════ 小節セル ══════════ */

    function buildBarCell(bar, show, hasVocal, beats, strum,viewResolution) {
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
        if(viewResolution===8||viewResolution===16)timeRes=viewResolution;

        if (show.timingGrid) {
            cell.appendChild(buildTimingGrid(beats, timeRes));
        }

        cell.appendChild(el('span', 'sheet-bar-num', String(bar.barNumber)));
        if(strum&&strum.unsupported){cell.appendChild(el('div','sheet-bar-row',strum.name+'：採用リズムの印刷は未対応'));strum=null;}

        // 各段に共通クラス .sheet-bar-row を付ける。段と段の間の区切り横線は
        // CSS（.sheet-bar-row + .sheet-bar-row）が引く。将来ストローク段を
        // 追加するときも、同じく .sheet-bar-row を付ければ区切り線が自動で付く
        if (show.chords) {
            var chord=buildTimedTextRow('sheet-bar-chord',(bar.chords||[]).map(function(e){return {tick:e.tick,text:e.symbol};}),timeRes,beats*model.TICKS_PER_BEAT);
            chord.style.fontSize='17.5px';chord.style.fontWeight='800';
            chord.querySelectorAll('.sheet-timed-cell').forEach(function(e){if(e.textContent)e.classList.add('sheet-chord-event');});
            cell.appendChild(chord);
        }

        // ストローク段: コード段の直下。小節別上書きがあればそれを優先し、
        // なければユーザー入力済みの基本ストロークを継承する
        if (strum && strum.slots) {
            cell.appendChild(buildStrumRow(strum.slots, strum.barTicks, timeRes));
        }

        if (hasVocal && show.lyrics) {
            cell.appendChild(buildLyricsRow(bar, timeRes, beats * model.TICKS_PER_BEAT));
        }

        if (hasVocal && show.doremi) {
            var tokens=theory.melodyEventsToDoremiTokens((bar.melody||[]).map(function(e){return Object.assign({},e,{durationTicks:1});}));
            var ordered=(bar.melody||[]).slice().sort(function(a,b){return a.tick-b.tick;});
            var doremi=buildTimedTextRow('sheet-bar-doremi',ordered.map(function(e,i){return {tick:e.tick,text:tokens[i].text};}),timeRes,beats*model.TICKS_PER_BEAT);
            doremi.style.color='var(--paper-doremi)';
            cell.appendChild(doremi);
        }
        return cell;
    }

    /* ══════════ 本体 ══════════ */

    /**
     * StudioProject をA4紙面DOMとしてレンダリングし、container を置き換える。
     * @returns {HTMLElement} 生成した .sheet-page（複数ページ化する将来は配列先頭）
     */
    function render(project, container, options) {
        if(project.schemaVersion===2) project=CS().model.toStructureView(project);
        else if(project.schemaVersion!==1&&project.purpose!=='structure-read') throw Error('unsupported-schema');
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
                    line.appendChild(buildBarCell(bar, show, hasVocal, beats, strum, options&&options.resolutionForBar?options.resolutionForBar(bar):null));
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
        createStrumRestSymbol: createStrumRestSymbol,
        strumNeedsSixteenth: strumNeedsSixteenth
    };
})();
