import {MIN_SCORE_ZOOM,MAX_SCORE_ZOOM,bindScoreZoom,applyScoreTheme,movePlayhead,syncPlaybackButton,installScoreUI,styleAudioButton,styleRepeatButton} from '../../cruise-studio/js/modules/score-ui.mjs';
import {mountFocusMode} from './focus-mode.mjs';
import {bindRangeSelection} from './range-selection.mjs';
import {labelIcon} from './icons.mjs';
import {createScrollSpeed} from '../core/scroll-speed.mjs';
import {createScrollSettings} from './scroll-settings.mjs';
import {printViewerScore,exportIcon} from './pdf-export.mjs';
import {createLibraryUI} from './library.mjs';
import {mountFileMenu} from './file-menu.mjs';
import {bindPlaybackKeys,createLeavePrompt,mountSoundModes,downloadViewerFile} from './interaction.mjs';
import {MAX_FILE_BYTES} from '../core/file-format.mjs';
import {createPresetCodec} from '../core/preset.mjs';
import {createScrollMap,smoothFollow} from '../core/scroll-follow.mjs';
import {createViewerSettings} from './settings.mjs';
import {isPDF} from '../core/pdf-contract.mjs';
import {mountPDFViewer} from './pdf-viewer.mjs';

const messages = {
    'viewer-revision-conflict':'同じ版の異なるファイルが保存されています。譜面クルーズから新しい版を書き出してください。',
    'viewer-storage-unavailable':'端末に保存できません。この画面では引き続き閲覧できます。',
    'viewer-storage-blocked':'別の画面が保存先を使用しています。その画面を閉じて、もう一度お試しください。',
    'viewer-file-missing':'保存したファイルが見つかりません。ファイルを開き直してください。',
    'viewer-stored-file-corrupt':'保存したファイルを確認できません。元のファイルを開き直してください。',
    'file-budget':'ファイルが大きすぎます。13MB以内の閲覧用ファイルを選んでください。'
};
function message(error, operation) {
    return messages[error?.message] || (error?.name === 'QuotaExceededError' ? '端末の保存容量が不足しています。現在の譜面はこの画面に残しています。' :
        operation === 'save' ? '端末に保存できませんでした。現在の譜面はこの画面に残しています。' :
        'ファイルを開けませんでした。ビューワー用JSON（.cruise-score.json）を選んでください。現在の譜面は保持しています。');
}

// Host injects read-only music rendering. No Studio globals, editing or Sync here.
export function mountNativeViewer({host, contract, library, renderPaper,createPlayback,requestOpen,playbackChanged=()=>{}, document:doc = host.ownerDocument}) {
    const win = doc.defaultView, events = new win.AbortController();
    const node = (tag,text,parent=host) => { const n=doc.createElement(tag); if(text !== undefined)n.textContent=text;parent.append(n);return n; };
    host.replaceChildren();host.classList.add('sv-viewer');installScoreUI(doc);applyScoreTheme(host);
    const bar=node('div');bar.className='sv-toolbar';
    function button(text,id,parent=bar) {const b=node('button',text,parent);b.type='button';b.dataset.viewerAction=id;return b;}
    const open=button('PDFファイルを取り込む','open'),openJSON=button('ビューワー用JSONを開く','open-json'),files=button('ライブラリ','library'),save=button('この端末に保存','save');
    const display=button('表示','display');
    const fileMenu=mountFileMenu({button,open,files});
    const input=node('input',undefined,bar);input.type='file';input.accept='.cruise-score.json,application/json';input.hidden=true;input.dataset.viewerFile='';
    const pdfInput=node('input',undefined,bar);pdfInput.type='file';pdfInput.accept='.pdf,application/pdf';pdfInput.hidden=true;pdfInput.dataset.viewerPDFImport='';
    const layoutLabel=node('label','',bar),flow=node('select',undefined,layoutLabel);flow.setAttribute('aria-label','譜面の配置');
    for(const [value,text] of [['responsive','画面に合わせる'],['source','元の配置'],['horizontal','横']]){const o=node('option',text,flow);o.value=value;}
    const zoom=node('div',undefined,bar);zoom.className='sv-zoom';zoom.setAttribute('role','group');zoom.setAttribute('aria-label','譜面の拡大縮小');
    const minus=button('−','zoom-out',zoom),percent=button('100%','zoom-reset',zoom),plus=button('＋','zoom-in',zoom);
    minus.setAttribute('aria-label','譜面を縮小');plus.setAttribute('aria-label','譜面を拡大');percent.setAttribute('aria-label','倍率を100%に戻す');
    const state=node('p','');state.className='sv-status';state.setAttribute('role','status');state.dataset.viewerStatus='';
    const viewport=node('div');viewport.className='sv-viewport';viewport.tabIndex=0;viewport.setAttribute('role','region');viewport.setAttribute('aria-label','閲覧専用の譜面');
    const empty=node('div',undefined,viewport);empty.className='sv-empty';node('h2','演奏に使う譜面を開く',empty);
    node('p','「ライブラリ」から譜面を開けます。パソコンにあるPDFやビューワー用JSONは「メニュー」から選べます。',empty);
    const summary=node('p','');summary.className='sv-summary';summary.dataset.viewerSummary='';
    const transport=node('div');transport.className='sv-transport';
    const play=button('▶ 再生','play',transport),start=button('先頭','start',transport),tempoLabel=node('label','BPM',transport),tempo=node('input',undefined,tempoLabel);
    tempo.type='number';tempo.min=20;tempo.max=400;tempo.setAttribute('aria-label','練習テンポ');tempo.dataset.viewerTempo='';
    const audioSettings=button('音設定','playback-settings',transport),scrollButton=button('自動スクロール設定','scroll-settings',transport),scrollReset=button('BPMに戻す','scroll-reset',transport),follow=button('自動追従に戻る','follow',transport),here=button('ここから再生','here',transport);
    follow.hidden=here.hidden=true;transport.append(summary);
    const repeatButton=button('繰り返し','repeat',transport);labelIcon(repeatButton,'loop','繰り返し');repeatButton.setAttribute('aria-pressed','false');styleRepeatButton(repeatButton);
    const focusMode=mountFocusMode(host,bar,{openSettings:()=>display.click()});
    const selectionLabel=node('span','',transport);selectionLabel.className='sv-selection-label';selectionLabel.dataset.viewerSelection='';
    start.hidden=true;start.style.display='none';audioSettings.textContent='音設定';audioSettings.classList.add('sv-audio-settings');
    let exporting=false;const syncExport=exportIcon(doc,bar,async()=>{if(!current||exporting)return;const item=current,args={document:doc,contract,bytes:item.bytes,presentation:item.reader.read().presentation,renderPaper,name:item.libraryTitle,notify:(...value)=>{if(current===item)notice(...value);},isCurrent:()=>active&&!disposed&&current===item};exporting=true;controls();try{const {downloadScorePDF}=await import('./pdf-download.mjs');await downloadScorePDF(args);}catch{notice('PDFを作成できませんでした。',true);}finally{exporting=false;controls();}});
    const exportJSON=button('ビューワー用JSON書き出し','export-json');
    exportJSON.onclick=()=>{if(current)downloadViewerFile(doc,current.bytes,current.libraryTitle);};
    const printButton=button('印刷','print',bar);printButton.dataset.pdfPrint='';printButton.onclick=()=>{if(current)printViewerScore({document:doc,contract,bytes:current.bytes,presentation:current.reader.read().presentation,renderPaper,notify:notice,name:current.libraryTitle});};
    here.hidden=true;here.style.display='none';
    const syncSoundModes=mountSoundModes({parent:transport,button,read:()=>current?.player.snapshot(),change(value){current.player.configure(value);schedulePreferences();controls();viewport.focus({preventScroll:true});}});
    const transportLeft=node('div',undefined,transport),transportCenter=node('div',undefined,transport),transportRight=node('div',undefined,transport);transport.classList.add('sv-centered-transport','sv-clustered-transport');transportLeft.className='sv-transport-left';transportCenter.className='sv-transport-center';transportRight.className='sv-transport-right';tempoLabel.className='sv-tempo-group score-tempo';tempoLabel.setAttribute('role','group');tempoLabel.setAttribute('aria-label','BPM');transportLeft.append(selectionLabel);transportCenter.append(play,repeatButton);transportRight.append(tempoLabel,transport.querySelector('.sv-sound-modes'),transport.querySelector('.sv-sound-select'));transport.replaceChildren(transportLeft,transportCenter,transportRight,start,here,summary);transport.classList.add('score-transport');transport.setAttribute('role','toolbar');transport.setAttribute('aria-label','再生操作');transportCenter.classList.add('score-transport-main');transportRight.classList.add('score-transport-options');play.classList.add('score-play');styleAudioButton(audioSettings);transportRight.append(audioSettings);
    fileMenu.group('ファイル',open,openJSON,fileMenu.mirror(files),fileMenu.mirror(save));
    const viewItems=[fileMenu.mirror(display,'表示設定'),fileMenu.mirror(focusMode.button,'全画面モード')];
    const menuLayout=doc.createElement('label');menuLayout.textContent='配置';const menuFlow=flow.cloneNode(true);menuFlow.setAttribute('aria-label','メニューの配置');menuFlow.onchange=()=>{flow.value=menuFlow.value;flow.dispatchEvent(new win.Event('change'));};menuLayout.append(menuFlow);const menuZoom=zoom.cloneNode(true);for(const [id,source]of [['zoom-out',minus],['zoom-reset',percent],['zoom-in',plus]]){const b=menuZoom.querySelector('[data-viewer-action='+id+']');delete b.dataset.viewerAction;b.onclick=()=>source.click();}menuLayout.className='sv-menu-field';fileMenu.group('表示',...viewItems,menuLayout,fileMenu.field('拡大・縮小',menuZoom));const audioMenu=fileMenu.mirror(audioSettings,'音設定');audioMenu.dataset.viewerAudioMenu='';fileMenu.group('再生',scrollButton,audioMenu);fileMenu.group('書き出し',exportJSON,syncExport.element,printButton);scrollReset.remove();follow.remove();
    const displayMenu=doc.createElement('details'),displaySummary=doc.createElement('summary'),displayBody=doc.createElement('div'),displayChecks=new Map();displayMenu.className='sv-display-menu score-display-menu';displaySummary.textContent='表示';displaySummary.dataset.viewerDisplayToggle='';displaySummary.setAttribute('aria-label','表示');displayMenu.append(displaySummary,displayBody);display.before(displayMenu);
    for(const [flag,label]of [['showTitle','曲名'],['showArtist','アーティスト名'],['showMeta','曲情報'],['showParts','セクション名'],['showNumbers','小節番号'],['chords','コード'],['forms','フォーム'],['strum','ストローク'],['lyrics','歌詞'],['doremi','メロディ'],['formList','フォーム一覧']]){const row=doc.createElement('label'),check=doc.createElement('input');check.type='checkbox';check.dataset.viewerQuickVisible=flag;row.append(check,doc.createTextNode(label));displayBody.append(row);displayChecks.set(flag,check);check.onchange=()=>{if(!current)return;const p=current.reader.read().presentation,layout=structuredClone(p.layout);if(flag.startsWith('show'))layout[flag]=check.checked;else layout.appearance.visibility[flag]=check.checked;change({layout});};}
    display.textContent='詳細設定';display.classList.add('sv-display-detail');displayBody.append(display);displaySummary.onclick=e=>{if(!current){e.preventDefault();return;}fileMenu.close?.();};
    doc.addEventListener('pointerdown',e=>{if(!displayMenu.contains(e.target))displayMenu.open=false;},{signal:events.signal});displayMenu.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();displayMenu.open=false;displaySummary.focus();}});
    let current=null,active=false,disposed=false,ticket=0,dialog=null,preferenceTimer=null,frame=null,resizeFrame=null,externalBusy=false;
    let lastWidth=0,restoreAnchor=null,restoring=false,selectionNode=null,selectionRange=null,selectionKey='',repeat=false,lastIteration=0;
    const horizontal=()=>current?.reader.read().presentation.flow==='horizontal';
    const scrollValue=()=>horizontal()?viewport.scrollLeft:viewport.scrollTop;
    const span=()=>horizontal()?viewport.clientWidth:viewport.clientHeight;
    const scrollMax=()=>horizontal()?viewport.scrollWidth-viewport.clientWidth:viewport.scrollHeight-viewport.clientHeight;
    function scrollTo(value){if(horizontal())viewport.scrollLeft=Math.round(value);else viewport.scrollTop=Math.round(value);}
    let presentationPreview=false,playFrame=null,following=true,geometry=null,barNodes=[],lastFrameTime=0,highlight=null,candidate=null,barGeometry=[];
    const cursor=doc.createElement('span');cursor.className='sv-playhead';cursor.dataset.viewerPlayhead='';cursor.setAttribute('aria-hidden','true');
    let noticeTimer;function notice(text,error=false) {win.clearTimeout(noticeTimer);state.textContent=text;state.dataset.error=String(error);if(!error&&current?.saved)noticeTimer=win.setTimeout(()=>{state.textContent='';},3000);}
    function controls() {
        const p=current?.reader.read().presentation;
        save.disabled=!current||current.saved||current.saving;
        save.hidden=!current||current.saved;save.textContent='この端末に保存';
        flow.disabled=minus.disabled=percent.disabled=plus.disabled=!current;
        if(p){menuFlow.value=p.flow;menuZoom.querySelectorAll('button')[1].textContent=Math.round(p.zoom*100)+'%';flow.value=p.flow;percent.textContent=Math.round(p.zoom*100)+'%';minus.disabled=p.zoom<=MIN_SCORE_ZOOM;plus.disabled=p.zoom>=MAX_SCORE_ZOOM;}
        [minus,percent,plus].forEach((source,i)=>{menuZoom.querySelectorAll('button')[i].disabled=source.disabled;});
        const sound=current?.player.snapshot(),playing=sound&&['playing','counting','loading'].includes(sound.phase);
        open.disabled=openJSON.disabled=files.disabled=!!playing||externalBusy;fileMenu.sync(!!playing||externalBusy);display.disabled=audioSettings.disabled=!current;displaySummary.setAttribute('aria-disabled',String(!current));for(const [flag,check]of displayChecks){check.disabled=!current;if(current){const v=current.reader.read(),settings=v.document.score.notation.settings;check.checked=flag.startsWith('show')?v.presentation.layout[flag]!==false:flag==='formList'?v.presentation.layout.appearance.visibility.formList===true:(v.presentation.layout.appearance.visibility[flag]??settings[({chords:'showChords',lyrics:'showLyrics',strum:'showStrum',doremi:'showDoremi'})[flag]])!==false;}}
        play.disabled=!current||externalBusy||!sound.totalTicks;start.disabled=!current;
        syncPlaybackButton(play,sound?.phase,{disabled:play.disabled});
        tempo.disabled=!current||['loading','counting'].includes(sound.phase);
        if(sound&&doc.activeElement!==tempo)tempo.value=sound.settings.bpm;
        summary.textContent=current?(sound.phase==='counting'?'開始まで '+sound.countBeat+' / '+current.ticksPerBar/480:Math.min(Math.floor(sound.tick/current.ticksPerBar)+1,current.reader.read().document.score.bars.length)+' / '+current.reader.read().document.score.bars.length+'小節')+'　／　閲覧専用':'';
        follow.hidden=true;here.hidden=true;
        syncExport(!!current&&!exporting);exportJSON.disabled=!current||externalBusy;printButton.disabled=!current;syncSoundModes();scrollButton.disabled=!current;scrollReset.hidden=!current||current.scroll.snapshot().mode!=='custom';scrollButton.textContent=current?.scroll.snapshot().mode==='custom'?'自動スクロール設定（カスタム）':'自動スクロール設定';selectionLabel.textContent=current?(playing?'演奏中：'+(sound.barIndex+1)+'小節':'選択：'+((candidate??sound.barIndex)+1)+'小節'):'';
        repeatButton.disabled=!current||!sound.totalTicks||['loading','counting'].includes(sound.phase);repeatButton.setAttribute('aria-pressed',String(repeat));
        selectionLabel.textContent=current?selectionRange?'選択：'+(selectionRange.start+1)+(selectionRange.start===selectionRange.end?'':'–'+(selectionRange.end+1))+'小節':playing?'演奏中：'+(sound.barIndex+1)+'小節':'全曲':'';
        scrollPanel?.refresh();panels?.refresh();
        fileMenu.sync(!!playing||externalBusy);
        const visualTick=current?.player.visualSnapshot().tick;const visible=selectionRange&&(repeat||selectionRange.start!==selectionRange.end||!sound||visualTick<(selectionRange.end+1)*current.ticksPerBar);const key=visible?selectionRange.start+':'+selectionRange.end:'none';if(selectionKey!==key){selectionKey=key;barNodes.forEach((b,i)=>b.classList.toggle('sv-selected',!!visible&&i>=selectionRange.start&&i<=selectionRange.end));}
    }
    function captureAnchor() {
        if(!current||scrollValue()<4)return null;
        const top=horizontal()?viewport.getBoundingClientRect().left+viewport.clientLeft:viewport.getBoundingClientRect().top+viewport.clientTop;
        const bars=current.paper.querySelectorAll('.sheet-bar[data-bar-number]');
        for(const bar of bars){const r=bar.getBoundingClientRect();if((horizontal()?r.right:r.bottom)>top+1){const index=Number(bar.dataset.barNumber)-1;
            return {barId:current.reader.read().document.score.bars[index]?.id,ratio:Math.max(0,Math.min(1,(top-(horizontal()?r.left:r.top))/Math.max(1,horizontal()?r.width:r.height)))};}}
        return null;
    }
    function restore(anchor) {
        if(!current)return;
        if(!anchor){scrollTo(0);return;}
        const index=current.reader.read().document.score.bars.findIndex(b=>b.id===anchor.barId);
        const bar=current.paper.querySelector('.sheet-bar[data-bar-number="'+(index+1)+'"]');
        if(bar){const rect=bar.getBoundingClientRect(),top=horizontal()?viewport.getBoundingClientRect().left+viewport.clientLeft:viewport.getBoundingClientRect().top+viewport.clientTop;scrollTo(scrollValue()+(horizontal()?rect.left:rect.top)-top+Math.max(0,Math.min(1,anchor.ratio||0))*(horizontal()?rect.width:rect.height));}
    }
    function viewAnchor() {return restoreAnchor||captureAnchor();}
    async function persistPreferences() {
        if(!current)return;
        const item=current,doc=item.reader.read().document;
        // The input grid belongs to the immutable revision. Only viewing options need a local copy.
        const {gridRows, ...presentation}=item.reader.read().presentation;
        try {const p=item.player.snapshot();await library.savePreferences(item.entryId,doc.revisionId,{version:1,presentation,anchor:viewAnchor(),scroll:item.scroll.snapshot(),repeat,playback:{...p.settings,tick:p.tick}});return true;}
        catch {if(current===item)notice('閲覧位置と表示設定を保存できませんでした。譜面はそのまま閲覧できます。',true);return false;}
    }
    function schedulePreferences() {win.clearTimeout(preferenceTimer);if(!presentationPreview)preferenceTimer=win.setTimeout(()=>void persistPreferences(),180);}
    host.addEventListener('scorefullscreenchange',()=>{if(current&&active)win.requestAnimationFrame(()=>redraw());},{signal:events.signal});
    function redraw(anchor=viewAnchor()) {
        if(!current||!active)return;
        applyScoreTheme(host,current.reader.read().presentation.layout.appearance.interaction);
        renderPaper(current.reader,current.paper,{width:viewport.clientWidth,interactive:true,layoutHost:host});
        measureGeometry();
        const sound=current.player.visualSnapshot();if(sound.phase==='playing')paintPosition(sound);
        if(current.player.snapshot().phase==='playing'&&following&&current.scroll.snapshot().enabled){
            restoring=false;
            if(current.scroll.snapshot().origin==='viewport')restore(anchor);
            startFollowing(sound);
        }
        else settleAnchor(anchor);controls();
    }
    function measureGeometry(){
        if(!current)return;const viewportRect=viewport.getBoundingClientRect(),top=horizontal()?viewportRect.left+viewport.clientLeft:viewportRect.top+viewport.clientTop;
        // A reused bar may have had its renderer-owned className reset. Rebind
        // the one playback decoration after layout/visibility/rotation changes.
        highlight?.classList.remove('sv-playing');highlight=null;cursor.remove();selectionNode?.classList.remove('sv-selected');selectionNode=null;selectionKey='';
        barNodes=Array.from(current.paper.querySelectorAll('.sheet-bar[data-bar-number]'));
        const paperRect=current.paper.getBoundingClientRect();barGeometry=barNodes.map(e=>{const r=e.getBoundingClientRect();return {left:r.left-paperRect.left,y:r.top-paperRect.top,width:r.width,height:r.height};});
        geometry=createScrollMap(horizontal()?barNodes.map((e,i)=>{const r=e.getBoundingClientRect();return {startTick:i*current.ticksPerBar,top:r.left-top+viewport.scrollLeft,bottom:r.right-top+viewport.scrollLeft};}):Array.from(current.paper.querySelectorAll('.sheet-line[data-line-start]')).filter(e=>Number(e.dataset.lineStart)>0).map(e=>{const r=e.getBoundingClientRect();return {startTick:(Number(e.dataset.lineStart)-1)*current.ticksPerBar,top:r.top-top+viewport.scrollTop,bottom:r.bottom-top+viewport.scrollTop};}),current.player.snapshot().totalTicks);
    }
    // Keep the visual origin separate from the transport. Starting from the
    // viewport must never seek the music or pull the paper to its highlight.
    let viewportOrigin=null;
    function scrollTarget(snapshot){
        const settings=current.scroll.snapshot(),tick=current.scroll.target(snapshot);
        if(settings.origin==='score')return geometry.target(tick,span(),scrollMax(),settings.position);
        if(!viewportOrigin)viewportOrigin={offset:scrollValue(),tick};
        return Math.max(0,Math.min(scrollMax(),viewportOrigin.offset+(tick-viewportOrigin.tick)*geometry.pixelsPerTick));
    }
    function startFollowing(snapshot){
        following=true;viewportOrigin=null;
        if(current.scroll.snapshot().enabled&&geometry)scrollTo(scrollTarget(snapshot));
    }
    let lastControlBar=-1,lastVisualBar=-1,lastCountBeat=-1;
    function stopFrames(){lastControlBar=lastVisualBar=lastCountBeat=-1;if(playFrame!==null)win.cancelAnimationFrame(playFrame);playFrame=null;lastFrameTime=0;highlight?.classList.remove('sv-playing');highlight=null;cursor.remove();}
    function paintPosition(s){
        const bar=barNodes[s.barIndex],r=barGeometry[s.barIndex];
        if(!bar||!r)return;
        if(bar!==highlight){
            highlight?.classList.remove('sv-playing');
            highlight=bar;
            bar.classList.add('sv-playing');
        }
        const ticks=current.ticksPerBar,seconds=ticks*60/(480*(s.outputBpm??s.bpm));
        const nextTick=(s.barIndex+1)*ticks;
        const nextIndex=nextTick<s.range.end?s.barIndex+1:s.range.loop?s.range.start/ticks:-1;
        movePlayhead(cursor,current.paper,{...r,segment:bar,fraction:Math.min(1,s.tickInBar/ticks),seconds,
            nextSegment:()=>barGeometry[nextIndex]&&{...barGeometry[nextIndex],seconds}});
    }
    function animate(time){
        playFrame=null;if(!active||!current)return;const raw=current.player.snapshot(),s=current.player.visualSnapshot();
        if(!['playing','counting','loading'].includes(s.phase)&&raw.phase!=='playing'){stopFrames();if(raw.phase==='ended'){current.scroll.pause();if(!selectionRange)candidate=s.barIndex;restoreAnchor=captureAnchor();schedulePreferences();controls();}return;}
        if(s.phase==='playing'){
            if(lastIteration!==s.iteration){lastIteration=s.iteration;current.scroll.seek(s.tick);if(following)startFollowing(s);}paintPosition(s);
            if(following&&current.scroll.snapshot().enabled&&geometry)scrollTo(smoothFollow(scrollValue(),scrollTarget(s),lastFrameTime?(time-lastFrameTime)/1000:1/60));
        }
        lastFrameTime=time;
        if(raw.barIndex!==lastControlBar || s.barIndex!==lastVisualBar || raw.countBeat!==lastCountBeat){
            controls();lastControlBar=raw.barIndex;lastVisualBar=s.barIndex;lastCountBeat=raw.countBeat;
        }
        playFrame=win.requestAnimationFrame(animate);
    }
    function soundChanged(player){
        if(!current||current.player!==player)return;const s=player.snapshot();controls();
        playbackChanged();
        if(['playing','counting'].includes(s.phase)||s.phase==='ended'&&player.visualSnapshot().phase==='playing'){if(playFrame===null)playFrame=win.requestAnimationFrame(animate);}
        else{stopFrames();current.scroll.pause();if(!selectionRange)candidate=s.barIndex;restoreAnchor=captureAnchor();schedulePreferences();controls();}
        if(s.reason==='interruption')notice('再生が中断されました。同じ位置から再開できます。',true);
        if(s.reason==='audio-busy')notice('ほかの音声を停止してから再生してください。',true);
        if(s.reason==='audio-closing')notice('音声の終了処理中です。少し待ってから再生してください。');
        if(s.reason==='audio-error'||s.reason==='missing-decoded-sample')notice('音を開始できませんでした。もう一度お試しください。',true);
    }
    function settleAnchor(anchor) {
        const item=current;restoring=true;restoreAnchor=anchor;restore(anchor);
        if(frame!==null)win.cancelAnimationFrame(frame);
        frame=win.requestAnimationFrame(()=>{frame=null;if(current===item&&active){restore(anchor);frame=win.requestAnimationFrame(()=>{frame=null;restoring=false;});}else restoring=false;});
    }
    async function openBytes(bytes,{saved=false,entryId,libraryTitle}={}) {
        if(current&&['playing','loading','counting'].includes(current.player.snapshot().phase)){notice('一時停止してから別の譜面を開いてください。',true);return false;}
        bytes=typeof bytes==='string'?new TextEncoder().encode(bytes):new Uint8Array(bytes).slice();
        const request=++ticket,reader=contract.createReader({playbackState:()=>current?.player.snapshot().phase||'paused'});
        try {
            await reader.open(bytes);
            const document=reader.read().document;
            let libraryId=entryId||document.viewerDocumentId;
            if(!saved)try{const existing=(await library.list()).find(row=>row.documentId===document.viewerDocumentId&&row.revisionId===document.revisionId&&row.byteHash===reader.read().byteHash);if(existing){saved=true;libraryId=existing.entryId;libraryTitle=existing.title;}}catch{}
            let preference=null,preferenceFailed=false;
            try {preference=await library.readPreferences(libraryId,document.revisionId);}
            catch {preferenceFailed=true;}
            if(disposed||!active||request!==ticket){reader.dispose();return false;}
            if(preference?.version===1&&preference.presentation)try {reader.setPresentation({...document.defaultPresentation,...preference.presentation});}catch{preferenceFailed=true;}
            const paper=doc.createElement('div');paper.className='sv-paper';
            renderPaper(reader,paper,{width:viewport.clientWidth,interactive:true,layoutHost:host}); // Prepare before removing the preceding score.
            let player;player=createPlayback(document,preference?.playback,()=>soundChanged(player));
            if(current)await persistPreferences();
            if(disposed||!active||request!==ticket){reader.dispose();void player.dispose();return false;}
            const ticksPerBar=document.score.songInfo.timeSignature.beats*480;
            const next={reader,paper,player,ticksPerBar,bytes:bytes.slice(),saved,saving:false,scroll:createScrollSpeed({value:preference?.scroll,bpm:document.score.songInfo.bpm,totalTicks:player.snapshot().totalTicks,ticksPerBar}),entryId:libraryId,libraryTitle:libraryTitle||document.score.songInfo.title||'無題'};
            win.clearTimeout(preferenceTimer);displayMenu.open=false;panels.close();scrollPanel.close();stopFrames();candidate=null;selectionRange=null;selectionKey='';repeat=preference?.repeat===true;lastIteration=0;highlight=null;following=true;
            if(current){void current.player.dispose().catch(()=>notice('音声の終了を確認できませんでした。全停止を実行してください。',true));current.reader.dispose();}current=next;if(repeat&&player.snapshot().totalTicks)player.setRange(0,player.snapshot().totalTicks,true);
            if(Number.isFinite(preference?.playback?.tick))player.seek(Math.max(0,Math.min(player.snapshot().totalTicks,preference.playback.tick)));
            candidate=player.snapshot().barIndex;viewport.replaceChildren(paper);if(active)observer.observe(viewport);restoreAnchor=preference?.anchor||null;redraw(restoreAnchor);
            if(saved)void library.setLast(libraryId,document.revisionId).catch(()=>{});
            const warning=reader.read().warnings.length>0;
            notice(preferenceFailed?'表示設定を復元できなかったため、ファイルの初期表示で開きました。':warning?'譜面を開きました。一部の表示設定を調整しました。':saved?'':'譜面を開きました。「この端末に保存」でライブラリに残せます。',preferenceFailed);
            controls();viewport.focus({preventScroll:true});return true;
        } catch(error) {
            reader.dispose();if(request===ticket&&!disposed){notice(message(error,'open'),true);controls();}return false;
        }
    }
    async function importFile(file) {
        const request=++ticket;
        if(!file)return;
        if(file.size>20*1024*1024){notice('20MiB以内のファイルを選んでください。',true);return;}
        notice('譜面を読み込んでいます…');
        try {const bytes=new Uint8Array(await file.arrayBuffer());if(request!==ticket||!active||disposed)return;await (requestOpen||openBytes)(bytes,{name:file.name,offerPDFLibraryAdd:true});}
        catch(error){if(request===ticket&&!disposed)notice(message(error,'open'),true);}
    }
    open.onclick=()=>pdfInput.click();openJSON.onclick=()=>input.click();
    for(const picker of [input,pdfInput])picker.addEventListener('change',()=>{
        const file=picker.files[0];picker.value='';if(file){libraryUI.close();void importFile(file);}
    });
    async function saveCurrent(){
        const item=current;if(!item)return false;if(item.saved)return true;if(item.saving)return false;
        item.saving=true;controls();notice('端末に保存しています…');
        try {await library.save(item.bytes,{entryId:item.entryId,name:item.libraryTitle});item.saved=true;if(current===item){notice('このブラウザに保存しました。ライブラリから開き直せます。');await persistPreferences();}return true;}
        catch(error){if(current===item)notice(message(error,'save'),true);return false;}
        finally{item.saving=false;controls();}
    }
    save.onclick=()=>void saveCurrent();
    function change(patch) {if(!current)return;const anchor=captureAnchor();current.reader.setPresentation({...current.reader.read().presentation,...patch});redraw(anchor);schedulePreferences();}
    flow.onchange=()=>change({flow:flow.value});
    bindScoreZoom(viewport,{read:()=>current.reader.read().presentation.zoom,write:zoom=>change({zoom}),enabled:()=>active&&!!current,signal:events.signal});
    minus.onclick=()=>change({zoom:Math.max(MIN_SCORE_ZOOM,Math.round((current.reader.read().presentation.zoom-.1)*10)/10)});
    plus.onclick=()=>change({zoom:Math.min(MAX_SCORE_ZOOM,Math.round((current.reader.read().presentation.zoom+.1)*10)/10)});
    percent.onclick=()=>change({zoom:1});
    async function refreshLibraryState(){if(!current)return;const item=current,row=await library.entry(item.entryId);if(current===item){item.saved=!!row&&row.byteHash===item.reader.read().byteHash;item.libraryTitle=row?.title||item.libraryTitle;controls();}}
    const libraryUI=createLibraryUI({host,library,importPDF:()=>pdfInput.click(),open:(bytes,metadata)=>(requestOpen||openBytes)(bytes,metadata),changed:refreshLibraryState,notify:notice});
    files.onclick=()=>void libraryUI.show(files);
    function settingsPreviewAudio(options){const item=current;let player=null,generation=0,dead=false,closing=Promise.resolve();
        const valid=()=>!dead&&active&&current===item&&options.isOpen();
        return {async play(){const ticket=++generation;if(!valid())return;options.changed('loading');const stopGeneration=createPlayback.stopGeneration?.();item.player.pause();await closing;if(ticket!==generation||!valid()||stopGeneration!==createPlayback.stopGeneration?.())return;if(!player)player=createPlayback(item.reader.read().document,{...item.player.snapshot().settings,tick:0},s=>options.changed(['playing','counting','loading'].includes(s.phase)?s.phase:'idle'));player.setRange(0,player.snapshot().totalTicks,false);player.seek(0);try{await player.play();}catch(error){options.changed('idle');options.message(error.message||'音を開始できませんでした');}},stop(){generation++;options.changed('idle');const old=player;player=null;if(old)closing=old.dispose();return closing;},position(){if(!player||player.snapshot().phase!=='playing')return null;const s=player.visualSnapshot();return {barNumber:s.barIndex+1,tick:s.tickInBar,barTicks:item.ticksPerBar,barSeconds:item.ticksPerBar*60/(480*(s.outputBpm??s.bpm)),nextBarNumber:(s.barIndex+1)*item.ticksPerBar<s.range.end?s.barIndex+2:null};},dispose(){dead=true;generation++;const old=player;player=null;if(old)closing=old.dispose();return closing;}};
    }
    const panels=createViewerSettings({host,openScroll:()=>{if(active&&current)scrollPanel.open();},forms:renderPaper.forms,renderPreview:(target,p)=>{if(!current)return;const item=current;renderPaper({read:()=>({...item.reader.read(),presentation:{...item.reader.read().presentation,...p,flow:'source',zoom:1}}),renderWith:(...args)=>item.reader.renderWith(...args)},target,{width:794,interactive:false,layoutHost:host});},createPreviewAudio:settingsPreviewAudio,library,presetCodec:createPresetCodec(contract.normalizePresentation),read:()=>current&&!disposed?current.reader.read():null,change,
        playback:()=>current.player.snapshot(),toggle:()=>play.click(),configure(value){try{if(value.bpm!==undefined)current.player.setTempo(value.bpm);else current.player.configure(value);schedulePreferences();controls();scrollPanel.refresh();}catch{notice('テンポはカウントイン終了後に変更できます。',true);}},
        begin(){presentationPreview=true;win.clearTimeout(preferenceTimer);},finish(accepted){presentationPreview=false;if(accepted&&!disposed){const item=current;void persistPreferences().then(ok=>{if(ok&&!disposed&&current===item)notice('表示設定をこのブラウザに保存しました。');});}},notify:notice});
    display.onclick=()=>{displayMenu.open=false;scrollPanel.close();panels.display(displaySummary);};audioSettings.onclick=()=>{scrollPanel.close();panels.audio(audioSettings);};
    function changeScroll(patch){if(!current)return;const sound=current.player.visualSnapshot();current.scroll.configure(patch,sound);
        following=true;viewportOrigin=null;
        if(current.scroll.snapshot().enabled&&geometry&&(sound.phase==='playing'||selectionRange||patch.mode==='bpm'))startFollowing(sound);
        schedulePreferences();controls();scrollPanel.refresh();}
    const scrollPanel=createScrollSettings({host,read:()=>current.scroll.snapshot(),change:changeScroll,horizontal,setTempo:setPracticeTempo,playback:()=>({...current.player.snapshot(),ticksPerBar:current.ticksPerBar}),toggle:()=>play.click(),following:()=>following,resume:()=>follow.click()});scrollButton.onclick=()=>{panels.close();scrollPanel.open();};scrollReset.onclick=()=>changeScroll({mode:'bpm'});
    play.onclick=()=>{if(!current)return;const p=current.player;if(['playing','counting','loading'].includes(p.snapshot().phase))p.pause();else{if(p.snapshot().phase==='ended'){const at=selectionRange?selectionRange.start*current.ticksPerBar:0;current.scroll.seek(at);p.seek(at);candidate=selectionRange?.start??0;}startFollowing(p.snapshot());void p.play().then(ok=>{if(ok&&current?.player===p&&p.snapshot().warnings.length)notice(p.snapshot().warnings.slice(0,2).join('、'),true);});}};
    start.onclick=()=>{if(current?.player.snapshot().totalTicks){selectionRange=null;current.player.setRange(0,current.player.snapshot().totalTicks,repeat);current.player.seek(0);current.scroll.seek(0);}candidate=null;following=true;restoreAnchor=null;restore(null);controls();schedulePreferences();};
    here.onclick=()=>{if(current&&candidate!==null){current.scroll.seek(candidate*current.ticksPerBar);current.player.seek(candidate*current.ticksPerBar);following=true;candidate=null;startFollowing(current.player.visualSnapshot());void current.player.play();}};
    follow.onclick=()=>{if(current)startFollowing(current.player.visualSnapshot());controls();};
    function setPracticeTempo(value){current.player.setTempo(value);schedulePreferences();controls();}
    tempo.onchange=()=>{try{setPracticeTempo(Number(tempo.value));tempo.removeAttribute('aria-invalid');schedulePreferences();}catch{tempo.setAttribute('aria-invalid','true');notice('テンポは20〜400で入力してください。',true);}};
    function selectRange(a,b,extend=false){if(!current)return;const anchor=extend&&selectionRange?selectionRange.start:a;selectionRange={start:Math.min(anchor,b),end:Math.max(anchor,b)};candidate=selectionRange.start;applyRange();current.player.seek(candidate*current.ticksPerBar);current.scroll.seek(candidate*current.ticksPerBar);lastIteration=0;following=true;
        const prefs=current.scroll.snapshot();
        if(prefs.enabled&&prefs.origin==='score'&&prefs.position!=='smooth')startFollowing(current.player.visualSnapshot());
        viewport.focus({preventScroll:true});controls();schedulePreferences();}
    function applyRange(){const p=current.player,total=p.snapshot().totalTicks;return p.setRange(selectionRange?selectionRange.start*current.ticksPerBar:0,selectionRange&&(repeat||selectionRange.end>selectionRange.start)?(selectionRange.end+1)*current.ticksPerBar:total,repeat);}
    function clearRange(){if(!current||!current.player.snapshot().totalTicks)return;selectionRange=null;current.player.setRange(0,current.player.snapshot().totalTicks,repeat);controls();schedulePreferences();}
    repeatButton.onclick=()=>{if(!current)return;repeat=!repeat;const p=current.player,playing=['playing','counting'].includes(p.snapshot().phase);applyRange();if(playing)void p.play();controls();schedulePreferences();viewport.focus({preventScroll:true});};
    const unbindRange=bindRangeSelection(viewport,{bars:()=>barNodes,enabled:()=>!!current&&!panels.isOpen&&['paused','ended'].includes(current.player.snapshot().phase),select:selectRange,clear:clearRange});
    viewport.addEventListener('scroll',()=>{if(restoring||current?.player.snapshot().phase==='playing'&&following)return;restoreAnchor=captureAnchor();schedulePreferences();},{passive:true,signal:events.signal});
    function manual(){restoring=false;if(current&&['playing','counting'].includes(current.player.snapshot().phase)){following=false;controls();}if(frame!==null){win.cancelAnimationFrame(frame);frame=null;}}
    for(const name of ['wheel','touchstart','pointerdown'])viewport.addEventListener(name,manual,{passive:true,signal:events.signal});
    viewport.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(e.key))manual();},{signal:events.signal});
    const observer=new win.ResizeObserver(()=>{
        if(!active||!current||!viewport.clientWidth||lastWidth===viewport.clientWidth)return;
        lastWidth=viewport.clientWidth;const anchor=captureAnchor();
        if(resizeFrame!==null)win.cancelAnimationFrame(resizeFrame);
        resizeFrame=win.requestAnimationFrame(()=>{resizeFrame=null;redraw(anchor);});
    });
    // Viewer focus never activates an editor save/undo/IME command through a host.
    host.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&['s','z','y'].includes(e.key.toLowerCase())&&!e.isComposing){e.preventDefault();e.stopPropagation();}},{signal:events.signal});
    const unbindKeys=bindPlaybackKeys(host,{active:()=>active&&!!current&&!!current.player.snapshot().totalTicks&&!panels.isOpen,toggle:()=>play.click(),select(delta){if(!['paused','ended'].includes(current.player.snapshot().phase))return;const index=Math.max(0,Math.min(barNodes.length-1,(candidate??current.player.snapshot().barIndex)+delta));selectRange(index,index);restoreAnchor={barId:current.reader.read().document.score.bars[index].id,ratio:0};restore(restoreAnchor);controls();schedulePreferences();}});
    doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='hidden'&&current)void current.player.suspend('visibility').catch(()=>notice('音声を停止できませんでした。全停止を実行してください。',true));},{signal:events.signal});
    win.addEventListener('pagehide',()=>{if(current){void persistPreferences();void current.player.suspend('pagehide').catch(()=>{});}},{signal:events.signal});
    controls();
    let initialized=false;
    return Object.freeze({
        async activate(){active=true;lastWidth=viewport.clientWidth;
            if(current){observer.observe(viewport);redraw(restoreAnchor);return;}
            if(initialized)return;initialized=true;
            const activationTicket=ticket;
            try {const last=await library.getLast()||(await library.list())[0];if(last&&active&&!current&&activationTicket===ticket){const file=await library.read(last.entryId||last.documentId,last.revisionId);if(active&&activationTicket===ticket)await (requestOpen||openBytes)(file.bytes,{name:file.name,saved:true,entryId:file.entry?.entryId,libraryTitle:file.entry?.title});}}
            catch(error){if(active)notice(message(error,'open'),true);}
        },
        deactivate(){if(!active)return;displayMenu.open=false;renderPaper.closeForms?.();observer.disconnect();focusMode.exit();panels.close();scrollPanel.close();current?.player.pause('workspace');if(current)void current.player.suspend('workspace').catch(()=>notice('音声を停止できませんでした。全停止を実行してください。',true));stopFrames();restoreAnchor=viewAnchor();void persistPreferences();active=false;restoring=false;ticket++;dialog?.close();libraryUI.close();win.clearTimeout(preferenceTimer);
            if(frame!==null)win.cancelAnimationFrame(frame);if(resizeFrame!==null)win.cancelAnimationFrame(resizeFrame);frame=resizeFrame=null;},
        dispose(){this.deactivate();disposed=true;win.clearTimeout(noticeTimer);fileMenu.dispose();focusMode.dispose();unbindRange();unbindKeys();events.abort();observer.disconnect();if(current)void current.player.dispose();current?.reader.dispose();host.replaceChildren();},
        openBytes,notice,saveCurrent,hasUnsaved:()=>!!current&&!current.saved,setBusy(value){externalBusy=value;controls();},read:()=>current?{...current.reader.read(),entryId:current.entryId,libraryTitle:current.libraryTitle,selection:candidate,selectionRange:selectionRange?{...selectionRange}:null,repeat,scroll:current.scroll.snapshot()}:null,playback:()=>current?.player.snapshot()||null
    });
}

// Each format owns its reader, transport and controls. Switch only after the
// replacement has parsed and drawn successfully; the preceding file stays live.
export function mountViewer(options){
    const {host,library}=options,doc=host.ownerDocument;host.replaceChildren();host.classList.add('sv-format-host','sv-viewer');
    const nativeHost=doc.createElement('div'),pdfHost=doc.createElement('div');host.append(nativeHost,pdfHost);pdfHost.hidden=true;
    let active=false,disposed=false,currentKind='score',generation=0,pdf,replacing=false,leavePermit=null,leavePending=false;
    const askLeave=createLeavePrompt(host);
    async function confirmLeave(){if(!owner()?.hasUnsaved())return true;const previous=owner(),stamp=generation,choice=await askLeave();if(previous!==owner()||stamp!==generation||disposed)return false;if(choice==='save')return await previous.saveCurrent();return choice==='discard';}
    function requestLeave(next){if(leavePermit===generation){leavePermit=null;return false;}if(!owner()?.hasUnsaved())return false;if(!leavePending){leavePending=true;void confirmLeave().then(ok=>{leavePending=false;if(ok){leavePermit=generation;next();}}).catch(()=>{leavePending=false;});}return true;}
    const beforeUnload=e=>{if(active&&owner()?.hasUnsaved()){e.preventDefault();e.returnValue='';}};doc.defaultView.addEventListener('beforeunload',beforeUnload);
    const changed=()=>options.onPlaybackState?.(owner()?.playback()||null);
    const native=mountNativeViewer({...options,host:nativeHost,requestOpen:openBytes,playbackChanged:changed});
    const owner=()=>currentKind==='pdf'?pdf:native;
    async function openBytes(input,metadata={}){
        if(disposed||!active)return false;
        const preceding=owner(),state=preceding?.playback();
        if(state&&['playing','loading','counting'].includes(state.phase)){preceding.notice('一時停止してから別の譜面を開いてください。',true);return false;}
        if(!await confirmLeave())return false;
        if(disposed||!active)return false;
        const bytes=typeof input==='string'?new TextEncoder().encode(input):new Uint8Array(input).slice(),kind=isPDF(bytes)||/\.pdf$/i.test(metadata.name||'')?'pdf':'score',ticket=++generation;
        pdf?.cancel();preceding.setBusy(true);preceding.notice('譜面を読み込んでいます…');
        try{
            let ok;
            if(kind==='pdf'){
                if(!pdf)pdf=mountPDFViewer({host:pdfHost,library,requestOpen:openBytes,playbackChanged:changed});
                ok=await pdf.openBytes(bytes,{...metadata,isCurrent:()=>active&&!disposed&&ticket===generation});
                if(!ok&&currentKind!=='pdf')native.notice(pdfHost.querySelector('[data-pdf-status]')?.textContent||'PDFを開けませんでした。',true);
            }else{
                if(currentKind==='pdf')await native.activate();
                if(ticket!==generation||!active||disposed)return false;
                ok=await native.openBytes(bytes,metadata);
                if(!ok&&currentKind==='pdf')pdf.notice(nativeHost.querySelector('[data-viewer-status]')?.textContent||'譜面を開けませんでした。',true);
            }
            if(!ok||ticket!==generation||!active||disposed)return false;
            if(currentKind!==kind){preceding.deactivate();currentKind=kind;nativeHost.hidden=kind!=='score';pdfHost.hidden=kind!=='pdf';await owner().activate();}
            else if(kind==='pdf')pdf.activate();
            changed();
            if(kind==='pdf'&&metadata.saved){const r=pdf.read();void library.setLast(r.entryId||'pdf:'+r.byteHash,r.byteHash).catch(()=>{});}
            if(kind==='pdf'&&metadata.offerPDFLibraryAdd)void pdf.offerLibraryAdd();
            return true;
        }finally{if(ticket===generation||!active)preceding.setBusy(false);if(currentKind==='pdf')native.deactivate();}
    }
    return Object.freeze({async activate(){active=true;if(currentKind==='pdf')pdf.activate();else await native.activate();},
        deactivate(){active=false;generation++;pdf?.cancel();owner()?.setBusy(false);owner()?.deactivate();changed();},
        dispose(){active=false;disposed=true;doc.defaultView.removeEventListener('beforeunload',beforeUnload);generation++;native.dispose();pdf?.dispose();host.replaceChildren();},
        requestLeave,confirmLeave,hasUnsaved:()=>!!owner()?.hasUnsaved(),saveCurrent:()=>owner()?.saveCurrent(),
        readDeviceSettings:()=>library.readDeviceSettings(),saveDeviceSettings:value=>library.saveDeviceSettings(value),
        async withReplacement(run){
            if(replacing||!active||disposed||['playing','counting','loading'].includes(owner()?.playback()?.phase))throw Error('sync-playing');
            replacing=true;owner()?.setBusy(true);try{return await run();}finally{replacing=false;owner()?.setBusy(false);}
        },
        openBytes,read:()=>owner()?.read()||null,playback:()=>owner()?.playback()||null});
}
