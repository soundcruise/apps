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
        var s = (project?.schemaVersion===2?project.notation?.settings:project?.sheetSettings) || {};
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

    function resolveBarStrum(project, bar) {
        var model = CS().model;
        var slots = model.getBarEffectiveStrumSlots(project, bar.barNumber);
        if(slots&&slots.ok===false)return {unsupported:true,name:slots.name};
        var pattern=(project.strumPatterns||[]).find(p=>p.id===(bar.strumOverride||project.basicStrumPatternId));
        if (!Array.isArray(slots) || (!slots.length && !pattern?.cellStarts && !pattern?.leadingSustainTicks)) return null;
        const barTicks=model.getBarLengthTicks(project);
        let cellStarts=pattern?.cellStarts;
        if(pattern?.inputGrid || (!cellStarts && pattern?.leadingSustainTicks)){
            const grid=model.strumInputGrid(pattern,barTicks);
            cellStarts=model.strumCellStarts(grid.unit,grid.beats,barTicks);
        }
        return {
            slots: slots,
            cellStarts,
            leadingSustainTicks: pattern?.leadingSustainTicks,
            barTicks,
            needs16: strumNeedsSixteenth(slots)
        };
    }

    /* ══════════ 紙面ヘッダー ══════════ */

    function buildHeader(project) {
        var si = project.songInfo;
        var header = el('div', 'sheet-header');

        var titleRow = el('div', 'sheet-title-row');
        var title=el('span','sheet-title',si.title||'無題');title.dataset.paperEdit='title';titleRow.appendChild(title);
        {
            var artist=el('span','sheet-artist'+(si.artist?'':' sheet-artist--empty'));artist.appendChild(el('span','sheet-artist-separator','/ '));var artistValue=el('span','sheet-artist-value',si.artist||'アーティスト名を追加');artistValue.dataset.paperEdit='artist';artist.appendChild(artistValue);titleRow.appendChild(artist);
        }
        header.appendChild(titleRow);

        var meta = el('div', 'sheet-meta');
        var items = [
            ['ORGキー', si.originalKey],
            ['Playキー', si.capo > 0 ? si.capo + 'カポ' + si.playKey : si.playKey],
            ['BPM', String(si.bpm)],
            ['拍子', si.timeSignature.beats + '/' + si.timeSignature.beatUnit]
        ];
        items.forEach(function (pair) {
            var item = el('span', 'sheet-meta-item');
            item.dataset.metaField=({'ORGキー':'originalKey','Playキー':'playKey','BPM':'bpm','拍子':'timeSignature'})[pair[0]];
            item.appendChild(el('span', 'sheet-meta-label', pair[0] + ': '));
            var value=el('span','sheet-meta-value',pair[1]);item.dataset.paperEdit=({'ORGキー':'instrument','Playキー':'instrument','BPM':'bpm','拍子':'timeSignature'})[pair[0]];item.appendChild(value);
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
        var names={1920:['restWhole','全休符'],960:['restHalf','2分休符'],480:['restQuarter','4分休符'],240:['rest8th','8分休符'],120:['rest16th','16分休符'],60:['rest32nd','32分休符'],30:['rest64th','64分休符']};
        var dotted=!names[ticks]&&names[ticks/1.5],definition=names[ticks]||dotted;
        if(!definition){var parts=CS().melodyNotation?.segment(0,ticks);if(parts?.ok){var group=el('span','music-rest-group');parts.segments.forEach(function(part){group.appendChild(createStrumRestSymbol(part.durationTicks));});return group;}var unknown=el('span','strum-rest-label','');unknown.title='休符（音価の譜面表記は未確定：'+ticks+'tick）';unknown.setAttribute('aria-label',unknown.title);unknown.dataset.unresolvedRestTicks=ticks;unknown.style.display='inline-block';unknown.style.minWidth='.4em';unknown.style.height='.6em';return unknown;}
        if(!VF){var fallback=el('span','strum-rest-label',({restWhole:'𝄻',restHalf:'𝄼',restQuarter:'𝄽',rest8th:'𝄾',rest16th:'𝄿',rest32nd:'𝅀',rest64th:'𝅁'})[definition[0]]+(dotted?'·':''));fallback.setAttribute('aria-label',definition[1]);return fallback;}
        if(!restOutlines[ticks]){
            var glyph=new VF.Glyph(definition[0],60),m=glyph.getMetrics(),commands=[];
            var pen={beginPath:function(){},moveTo:function(x,y){commands.push('M'+x+' '+y);},lineTo:function(x,y){commands.push('L'+x+' '+y);},quadraticCurveTo:function(a,b,x,y){commands.push('Q'+a+' '+b+' '+x+' '+y);},bezierCurveTo:function(a,b,c,d,x,y){commands.push('C'+a+' '+b+' '+c+' '+d+' '+x+' '+y);},fill:function(){}};
            VF.Glyph.renderOutline(pen,m.outline,m.scale,0,0);
            var box=VF.Glyph.getOutlineBoundingBox(m.outline,m.scale,0,0);
            restOutlines[ticks]={path:commands.join(' '),box:[box.getX()-1,box.getY()-1,box.getW()+2,box.getH()+2].join(' ')};
        }
        var ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
        svg.setAttribute('viewBox',restOutlines[ticks].box);svg.setAttribute('width','.65em');svg.setAttribute('height','.85em');svg.style.verticalAlign='middle';
        svg.setAttribute('data-rest-ticks',ticks);svg.setAttribute('role','img');svg.setAttribute('aria-label',(dotted?'付点':'')+definition[1]);
        path.setAttribute('d',restOutlines[ticks].path);path.setAttribute('fill','currentColor');svg.appendChild(path);if(dotted){var group=el('span','music-rest-dotted');group.append(svg,el('span','','·'));return group;}return svg;
    }

    function createStrumArrow(direction){
        var ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
        svg.setAttribute('viewBox','0 0 16 24');svg.setAttribute('width','.75em');svg.setAttribute('height','1.1em');svg.setAttribute('data-strum-arrow',direction);svg.setAttribute('aria-hidden','true');
        path.setAttribute('d',direction==='up'?'M8 21V3M3 8L8 3L13 8':'M8 3V21M3 16L8 21L13 16');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.65');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.appendChild(path);return svg;
    }
    function hasInnerStroke(starts,tick) {
        return starts.some((slot,index)=>slot.tick!==tick && !(slot.action==='rest' &&
            starts[index-1]?.action==='rest' && starts[index-1].tick+starts[index-1].durationTicks===slot.tick));
    }
    function renderStrumCell(cell, action, ticks) {
        if (action === 'rest') cell.replaceChildren(createStrumRestSymbol(ticks));
        else if (action === 'down' || action === 'up') cell.replaceChildren(createStrumArrow(action));
        else cell.textContent = action === 'mute' ? 'x' : action === 'sustain' ? '〜' : '';
    }

    var defaultOctaveColors=['#50555f','#8a633c','#197547','#245b91','#c43c39','#b96a08','#7747b2','#bf3b8a','#087d99'],octaveColors=defaultOctaveColors.slice();
    function setOctaveColors(colors){octaveColors=defaultOctaveColors.map(function(color,i){return Array.isArray(colors)&&/^#[0-9a-f]{6}$/i.test(colors[i])?colors[i]:color;});}
    function getOctaveColors(){return octaveColors.slice();}
    function octaveColor(octave){return octaveColors[Math.max(0,Math.min(8,octave))];}

    // Empty = no event, rest = explicit rest + duration, sustain = previous stroke duration.
    function buildPresetStrumRow(slots, barTicks, starts, leadingSustainTicks) {
        const row=el('span','sheet-bar-strum sheet-bar-row sheet-preset-strum');
        const boundaries=new Set(starts.filter(t=>t<barTicks));
        // A later edit can add a stroke inside a previously applied cell.
        let previous=null;
        for (const slot of slots) {
            if (slot.tick>=barTicks) break;
            if (slot.action!=='rest' || previous?.action!=='rest' ||
                previous.tick+(previous.durationTicks||0)!==slot.tick) boundaries.add(slot.tick);
            previous=slot;
        }
        const ticks=[...boundaries,barTicks].sort((a,b)=>a-b);
        const widths=[];
        let i=-1;
        for(let n=0;n<ticks.length-1;n++){
            const start=ticks[n], width=ticks[n+1]-start;
            while(i+1<slots.length && slots[i+1].tick<=start)i++;
            const event=slots[i];
            let action=start<leadingSustainTicks?'sustain':'empty';
            if(event?.tick===start)action=event.action;
            else if(event && event.tick+(event.durationTicks||0)>start)
                action=event.action==='rest'?'rest':event.action==='mute'?'empty':'sustain';
            const cell=el('span','is-'+action+(['down','up'].includes(action)?' is-stroke':''));
            cell.dataset.strumState=action;cell.dataset.slotTick=start;cell.dataset.slotTicks=width;
            if(action==='rest')cell.style.color='#746e65';
            const end=ticks[n+1];
            if(end<barTicks) cell.classList.add(end%480===0?'is-beat':end%240===0?'is-8th':'is-16th');
            renderStrumCell(cell,action,width);
            row.appendChild(cell);widths.push('minmax(0,'+width+'fr)');
        }
        row.style.gridTemplateColumns=widths.join(' ');
        return row;
    }

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
        cells.forEach(function(value,index){
            var cell=el('span','is-'+value.state+(['down','up'].includes(value.state)?' is-stroke':''),['rest','down','up'].includes(value.state)?'':value.text);cell.dataset.strumState=value.state;cell.dataset.slotTick=index*slotTicks;cell.dataset.slotTicks=slotTicks;
            cell.title=value.state==='empty'?'未入力':value.state==='rest'?'休符':value.state==='sustain'?'伸ばし':value.text;
            if(value.state==='rest'){cell.style.color='#746e65';cell.appendChild(createStrumRestSymbol(slotTicks));}else if(['down','up'].includes(value.state))cell.appendChild(createStrumArrow(value.state));
            row.appendChild(cell);
        });
        return row;
    }

    /* ══════════ 歌詞段（F2a / ADR-028: tick配置対応） ══════════ */

    // All text rows share the displayed time grid; rendering never edits event timing.
    function buildTimedTextRow(className,events,resolution,barTicksLen){
        var row=el('span',className+' sheet-bar-row');
        Object.assign(row.style,{display:'grid',gridTemplateColumns:'repeat('+resolution+',minmax(0,1fr))',gap:'0',marginLeft:'calc(-1 * var(--sheet-bar-pad-x))',marginRight:'calc(-1 * var(--sheet-bar-pad-x))',fontSize:'13.5px',fontWeight:'600',letterSpacing:'0',minHeight:'1.5em'});
        var texts=Array.from({length:resolution},function(){return [];});
        events.forEach(function(e){var i=Math.floor(e.tick/barTicksLen*resolution);if(i>=0&&i<resolution)texts[i].push(e);
            if(e.durationTicks&&e.octave!==undefined)for(var n=i+1;n<resolution&&n*barTicksLen/resolution<e.tick+e.durationTicks;n++)texts[n].push({text:'〜',octave:e.octave});
        });
        const vocal=className.includes('lyrics')||className.includes('doremi');
        function gcd(a,b){while(b){const r=a%b;a=b;b=r;}return a;}
        texts.forEach(function(items,i){
            const cell=el('span','sheet-timed-cell');
            let unit=items.length===1&&items[0].durationTicks?items[0].durationTicks:barTicksLen/resolution;
            for(const e of items)if(e.durationTicks)unit=gcd(unit,e.durationTicks);
            for(const e of items){
                const suffix=e.durationTicks&&e.durationTicks<=barTicksLen/resolution?'〜'.repeat(Math.min(16,Math.max(e.held?1:0,e.durationTicks/unit-1))):'';
                const token=el('span','',e.text+suffix);
                if(e.restTicks){token.replaceChildren(createStrumRestSymbol(e.restTicks));token.style.color='#746e65';}
                else if(className==='sheet-bar-doremi' && e.text?.startsWith('ファ')){
                    const syllable=el('span','sheet-note-fa');
                    syllable.append(el('span','','フ'),el('span','','ァ'));
                    token.replaceChildren(syllable,e.text.slice(2)+suffix);
                }
                else if(vocal && /.[ぁぃぅぇぉっゃゅょァィゥェォッャュョ]/u.test(token.textContent)){
                    const chunks=token.textContent.split(/(.[ぁぃぅぇぉっゃゅょァィゥェォッャュョ])/u);
                    token.replaceChildren(...chunks.map((text,index)=>index%2?el('span','sheet-kana-pair',text):text));
                }
                if(e.octave!==undefined){token.style.color=octaveColor(e.octave);token.dataset.noteOctave=e.octave;token.title='オクターブ '+e.octave;}
                cell.appendChild(token);
            }
            if(items.length){
                cell.style.width='max-content';
            }
            if(vocal && items.length){
                // A short syllable stays centered on its onset. Only longer text borrows empty slots.
                let end=i+1;
                while(end<resolution&&!texts[end].length)end++;
                cell.style.maxWidth=((end-i)*100)+'%';
            }
            cell.dataset.slotTick=i*barTicksLen/resolution;
            cell.style.textAlign='center';
            cell.style.position='relative';
            cell.style.minWidth=items.length?'100%':'0';
            if(!vocal)cell.style.whiteSpace='nowrap';
            row.appendChild(cell);
        });
        return row;
    }
    function buildLyricsRow(bar,resolution,barTicksLen){
        return buildTimedTextRow('sheet-bar-lyrics sheet-bar-lyrics--timed',(bar.lyrics||[]).map(function(e){return {tick:e.tick,text:e.text||''};}),resolution,barTicksLen);
    }

    /* ══════════ 小節セル ══════════ */

    function buildBarCell(bar, show, hasVocal, beats, strum,viewResolution,octaveForNote,songInfo,rests,heldForNote,formRow) {
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

        var grid = show.timingGrid ? buildTimingGrid(beats, timeRes) : null;
        if (grid) cell.appendChild(grid);

        var rowIndex=1;function appendRow(row){row.style.gridRow=String(rowIndex++);cell.appendChild(row);}
        appendRow(el('span', 'sheet-bar-num', String(bar.barNumber)));
        var unsupportedStrum=!!strum?.unsupported;

        // 各段に共通クラス .sheet-bar-row を付ける。段と段の間の区切り横線は
        // CSS（.sheet-bar-row + .sheet-bar-row）が引く。将来ストローク段を
        // 追加するときも、同じく .sheet-bar-row を付ければ区切り線が自動で付く
        if (show.chords) {
            var chord=buildTimedTextRow('sheet-bar-chord',(bar.chords||[]).map(function(e){return {tick:e.tick,text:e.symbol};}),timeRes,beats*model.TICKS_PER_BEAT);
            chord.style.fontSize='17.5px';chord.style.fontWeight='800';
            chord.querySelectorAll('.sheet-timed-cell').forEach(function(e){if(e.textContent)e.classList.add('sheet-chord-event');});
            appendRow(chord);
        }

        if(show.forms)appendRow(formRow||el('div','sheet-bar-row sheet-bar-forms'));

        // ストローク段: コード段の直下。小節別上書きがあればそれを優先し、
        // なければユーザー入力済みの基本ストロークを継承する
        // Keep the empty stroke band so lyrics/notes align with neighboring bars.
        // This adds no rhythm events; blank-stroke playback remains a projection.
        if (show.strum) {
            // The stroke lane draws its own boundaries. End and resume the shared
            // grid at its row edges so the bar highlight shows through every lane.
            if (grid && strum?.cellStarts && !unsupportedStrum) {
                grid.style.gridRowEnd=String(rowIndex);
                if (hasVocal && (show.lyrics || show.doremi)) {
                    var lowerGrid=buildTimingGrid(beats,timeRes);
                    lowerGrid.style.gridRowStart=String(rowIndex+1);
                    lowerGrid.style.display='var(--sheet-lower-grid-display,none)';
                    grid.after(lowerGrid);
                }
            }
            appendRow(unsupportedStrum?el('div','sheet-bar-row sheet-bar-strum',strum.name+'：採用リズムの印刷は未対応'):strum?.cellStarts?buildPresetStrumRow(strum.slots,beats*model.TICKS_PER_BEAT,strum.cellStarts,strum.leadingSustainTicks):buildStrumRow(strum?.slots || [], strum?.barTicks || beats * model.TICKS_PER_BEAT, timeRes));
        }

        // A vocal onset has its own time position regardless of the guitar subdivision.
        function vocalResolution(events) {
            return show.gridResolution===16 || events.some(e=>e.tick%240) ? 16 : 8;
        }
        if (hasVocal && show.lyrics) {
            appendRow(buildLyricsRow(bar, vocalResolution(bar.lyrics), beats * model.TICKS_PER_BEAT));
        }

        if (hasVocal && show.doremi) {
            var tokens=theory.melodyEventsToDoremiTokens((bar.melody||[]).map(function(e){return Object.assign({},e,{durationTicks:1});}));
            var ordered=(bar.melody||[]).slice().sort(function(a,b){return a.tick-b.tick;});
            var doremi=buildTimedTextRow('sheet-bar-doremi',ordered.map(function(e,i){var octave=octaveForNote?octaveForNote(bar.barNumber,e.tick):undefined;if(octave===undefined){var midi=theory.melodyEventToMidiNote(e,songInfo.playKey,songInfo.capo);octave=midi===null?undefined:Math.floor(midi/12)-1;}return {tick:e.tick,text:tokens[i].text.replace(/[↑↓]/g,''),octave:octave,durationTicks:e.durationTicks,held:!!heldForNote&&heldForNote(bar.barNumber,e.tick)};}).concat((rests||[]).map(function(e){return {tick:e.onsetTick,restTicks:e.durationTicks};})),vocalResolution(ordered.concat((rests||[]).map(e=>({tick:e.onsetTick})))),beats*model.TICKS_PER_BEAT);
            doremi.style.color='var(--paper-doremi)';
            appendRow(doremi);
        }
        cell.style.gridRow='1 / span '+(rowIndex-1);return cell;
    }

    /* ══════════ 本体 ══════════ */

    /**
     * StudioProject をA4紙面DOMとしてレンダリングし、container を置き換える。
     * @returns {HTMLElement} 生成した .sheet-page（複数ページ化する将来は配列先頭）
     */
    function render(project, container, options) {
        var readOnly=options?.readOnly===true;
        var canonical=project.schemaVersion===2?project:null;
        var heldForNote=options?.heldForNote||function(number,tick){var e=canonical?.bars[number-1].melody.find(function(e){return e.onsetTick===tick;});return e?.provenance.timing.onset.origin==='auto-assigned'&&e?.provenance.timing.duration.origin==='user-set';};
        var restsForBar=options&&options.restsForBar?options.restsForBar:function(number){return canonical?canonical.bars[number-1].melody.filter(function(e){return e.kind==='rest';}):[];};
        if(project.schemaVersion===2) project=options?.structureView?.sourceSchemaVersion===2&&options.structureView.projectId===project.projectId?options.structureView:CS().model.toStructureView(project);
        else if(project.schemaVersion!==1&&project.purpose!=='structure-read') throw Error('unsupported-schema');
        var model = CS().model;
        var show = Object.assign(resolveShowSettings(project),options?.visibility||{});
        var ts = project.songInfo && project.songInfo.timeSignature;
        var beats = (ts && typeof ts.beats === 'number' && ts.beats > 0) ? ts.beats : 4;

        // Reflow is opt-in for browser-local line geometry changes only. Editing,
        // project switching and track changes still build new bar contents.
        var retained=options?.reuseBars?new Map(Array.from(container.querySelectorAll('.sheet-bar[data-bar-number]'),function(node){return [Number(node.dataset.barNumber),node];})):null;
        var canReuse=!!retained&&!!options.contentKey&&container.firstElementChild?._sourceKey===options.contentKey&&container.firstElementChild?._readOnly===readOnly&&retained.size===project.bars.length&&project.bars.every(function(bar){return retained.has(bar.barNumber);});
        var heads=new Map(),page;
        if(canReuse){
            page=container.firstElementChild;
            page.querySelectorAll('.sheet-section-heading').forEach(function(node){heads.set(node.querySelector('[data-section-id]').dataset.sectionId,node);});
            // Preserve presentation caches on the page and header while moving bars.
            Array.from(page.children).forEach(function(node){if(!node.classList.contains('sheet-header'))node.remove();});
        }else{container.innerHTML='';page=el('div','sheet-page');page.appendChild(buildHeader(project));}
        page._sourceKey=options?.contentKey;
        page._readOnly=readOnly;

        project.sections.forEach(function (sec) {
            var bars = model.getSectionBars(project, sec.id);


            var slots=canonical&&CS().structureOperations?.scoreSlots?CS().structureOperations.scoreSlots(canonical,sec.id):bars.map(function(b){return {id:'bar-'+b.barNumber,barNumber:b.barNumber,sectionId:sec.id};});
            var label=el('div','sheet-section-label',sec.name);label.dataset.sectionId=sec.id;label.dataset.paperEdit='section';label.tabIndex=0;label.setAttribute('role','button');label.title='セクション編集を開く';
            var sectionHead=heads.get(sec.id)||el('div','sheet-section-heading');if(!heads.has(sec.id))sectionHead.appendChild(label);if(!readOnly&&options?.editableSlots&&!heads.has(sec.id)){var play=el('button','sheet-section-play','▶ ここから');play.type='button';play.dataset.playSection=sec.id;play.setAttribute('aria-label',sec.name+'から再生');sectionHead.appendChild(play);}page.appendChild(sectionHead);
            const section=options?.sectionRules?.find(r=>r.sectionId===sec.id);
            const lineShow={...show,forms:!!options?.formsForBar && (show.forms??options?.defaultForms??true),...section?.visibility};
            const hasVocal=lineShow.lyrics||lineShow.doremi,hasForms=lineShow.forms&&!!options?.formsForBar;
            const requested=section?.barsPerLine??options?.barsPerLine;
            const cols=Number.isInteger(requested)&&requested>=1&&requested<=8?requested:Math.min(8,(hasVocal||hasForms?1:2)*show.barsPerLine);
            for(var i=0;i<slots.length||i===0;){
                var first=slots[i],firstReal=slots.slice(i).find(function(s){return !s.empty;}),rule=options?.lineLayoutForSlot?.(first?.id,firstReal?.barNumber)||options?.lineLayoutForBar?.(firstReal?.barNumber),capacity=rule?.columns>=1&&rule.columns<=8?rule.columns:cols,baseUsed=rule?.used>0?Math.min(rule.used,capacity):capacity;
                var fill=canonical?.extensions?.scoreLayoutV1?.fills.find(function(f){return f.anchorId===first?.id&&f.columns===capacity&&f.baseUsed===baseUsed;}),used=fill?fill.used:baseUsed;
                var line=el('div','sheet-line'+(hasVocal?'':' sheet-line--compact'));line.style.gridTemplateColumns='repeat('+capacity+', 1fr)';line.dataset.lineStart=firstReal?.barNumber||0;line.dataset.lineAnchor=first?.id||'empty-'+sec.id;line.dataset.lineCapacity=capacity;line.dataset.lineBaseUsed=baseUsed;if(rule)line.dataset.lineCustom='';
                var lineSlots=slots.slice(i,i+used);line.dataset.lineUsed=lineSlots.length;
                var formRows=hasForms?lineSlots.map(function(s){return s.empty||canReuse?null:options.formsForBar(s.barNumber);}):[];
                var rowCount=1+Number(!!lineShow.chords)+Number(!!lineShow.forms)+Number(!!lineShow.strum)+Number(!!lineShow.lyrics)+Number(!!lineShow.doremi);line.style.setProperty('--sheet-row-count',rowCount);
                var nextReal=slots.slice(i+lineSlots.length).find(function(s){return !s.empty;});
                function emptyCell(descriptor){var empty=el('div','sheet-bar sheet-bar--empty');empty.style.gridRow='1 / span '+rowCount;empty.dataset.emptySlot=JSON.stringify(descriptor);empty.setAttribute('role',options?.editableSlots?'button':'img');empty.setAttribute('aria-label','空き枠（再生なし。編集開始・貼り付けで小節に戻す）');if(options?.editableSlots){empty.tabIndex=0;empty.dataset.editableEmpty='';}return empty;}
                lineSlots.forEach(function(slot,index){if(slot.empty){line.appendChild(emptyCell({id:slot.id,sectionId:sec.id}));return;}var bar=bars.find(function(b){return b.barNumber===slot.barNumber;}),strum=lineShow.strum?resolveBarStrum(project,bar):null;const cell=(canReuse&&retained.get(bar.barNumber))||buildBarCell(bar,lineShow,!!(lineShow.lyrics||lineShow.doremi),beats,strum,options?.resolutionForBar?options.resolutionForBar(bar):null,options?.octaveForNote,project.songInfo,restsForBar(bar.barNumber),heldForNote,formRows[index]);
                    if(section?.sizes){
                        for(const [key,size] of Object.entries(section.sizes))cell.style.setProperty('--sc-section-'+key,size+'px');
                        if(section.sizes.formScale&&formRows[index])formRows[index].dataset.sectionFormScale=section.sizes.formScale;
                    }
                    line.appendChild(cell);
                });
                for(var pad=lineSlots.length;pad<capacity;pad++)line.appendChild(emptyCell({sectionId:sec.id,beforeBarId:nextReal?nextReal.barId:null,anchorId:first?.id||null,columns:capacity,baseUsed:baseUsed,liveUsed:lineSlots.length,padIndex:pad-lineSlots.length,precedingHoleIds:slots.slice(0,i+lineSlots.length).filter(function(s){return s.empty;}).map(function(s){return s.id;})}));
                page.appendChild(line);i+=Math.max(1,lineSlots.length);
            }
        });

        if(readOnly){
            // A separate viewer never inherits the editor's activation attributes.
            // Do not reuse editable nodes when changing mode, even with the same key.
            page.setAttribute('data-score-readonly','true');
            page.querySelectorAll('.sheet-artist--empty').forEach(function(node){node.remove();});
            page.querySelectorAll('[data-paper-edit],[data-editable-empty],[data-empty-slot],[tabindex],[contenteditable],[draggable],[aria-haspopup]').forEach(function(node){
                ['data-paper-edit','data-editable-empty','data-empty-slot','tabindex','contenteditable','draggable','aria-haspopup'].forEach(function(name){node.removeAttribute(name);});
            });
            page.querySelectorAll('[role="button"]').forEach(function(node){node.setAttribute('role','group');node.removeAttribute('title');});
            page.querySelectorAll('.sheet-bar[data-bar-number]').forEach(function(node){node.setAttribute('aria-label',node.dataset.barNumber+'小節目');});
            page.querySelectorAll('.sheet-bar--empty').forEach(function(node){node.setAttribute('role','img');node.setAttribute('aria-label','空き枠（再生なし）');});
        }
        page.querySelectorAll?.('.sc-form-list').forEach(function(e){e.remove();});if(options?.formsList)page.appendChild(options.formsList);
        if(page.parentNode!==container)container.appendChild(page);
        return page;
    }

    window.CruiseStudio = window.CruiseStudio || {};
    window.CruiseStudio.sheetRenderer = {
        render: render,
        resolveShowSettings: resolveShowSettings,
        // D3a: 下部ドックのタイムグリッド解像度判定（8分/16分）が紙面と同じ基準を使うための公開。
        // ロジック自体は無変更（紙面のストローク段描画とドックのセル表示解像度の両方から使う）
        createStrumRestSymbol: createStrumRestSymbol,
        createStrumArrow: createStrumArrow,
        renderStrumCell: renderStrumCell,
        hasInnerStroke: hasInnerStroke,
        octaveColor: octaveColor,
        setOctaveColors: setOctaveColors,
        getOctaveColors: getOctaveColors,
        strumNeedsSixteenth: strumNeedsSixteenth
    };
})();
