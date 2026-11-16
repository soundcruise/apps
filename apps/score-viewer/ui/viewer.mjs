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
        'ファイルを開けませんでした。譜面クルーズの「ビューワー用に書き出す」で保存したファイルを選んでください。現在の譜面は保持しています。');
}

// Host injects read-only music rendering. No Studio globals, editing or Sync here.
export function mountNativeViewer({host, contract, library, renderPaper,createPlayback,requestOpen,playbackChanged=()=>{}, document:doc = host.ownerDocument}) {
    const win = doc.defaultView, events = new win.AbortController();
    const node = (tag,text,parent=host) => { const n=doc.createElement(tag); if(text !== undefined)n.textContent=text;parent.append(n);return n; };
    host.replaceChildren();host.classList.add('sv-viewer');
    const bar=node('div');bar.className='sv-toolbar';
    function button(text,id,parent=bar) {const b=node('button',text,parent);b.type='button';b.dataset.viewerAction=id;return b;}
    const open=button('ファイルを開く','open'),files=button('ライブラリ','library'),save=button('この端末に保存','save');
    const display=button('表示','display');
    const input=node('input',undefined,bar);input.type='file';input.accept='.cruise-score.json,.pdf,application/json,application/pdf';input.hidden=true;input.dataset.viewerFile='';
    const layoutLabel=node('label','配置',bar),flow=node('select',undefined,layoutLabel);flow.setAttribute('aria-label','譜面の配置');
    for(const [value,text] of [['responsive','画面に合わせる'],['source','元の配置']]){const o=node('option',text,flow);o.value=value;}
    const zoom=node('div',undefined,bar);zoom.className='sv-zoom';zoom.setAttribute('role','group');zoom.setAttribute('aria-label','譜面の拡大縮小');
    const minus=button('−','zoom-out',zoom),percent=button('100%','zoom-reset',zoom),plus=button('＋','zoom-in',zoom);
    minus.setAttribute('aria-label','譜面を縮小');plus.setAttribute('aria-label','譜面を拡大');percent.setAttribute('aria-label','倍率を100%に戻す');
    const state=node('p','');state.className='sv-status';state.setAttribute('role','status');state.dataset.viewerStatus='';
    const viewport=node('div');viewport.className='sv-viewport';viewport.tabIndex=0;viewport.setAttribute('role','region');viewport.setAttribute('aria-label','閲覧専用の譜面');
    const empty=node('div',undefined,viewport);empty.className='sv-empty';node('h2','演奏に使う譜面を開く',empty);
    node('p','譜面クルーズから書き出したファイル、またはPDFを選んでください。保存した譜面は、このブラウザのライブラリから開けます。',empty);
    const summary=node('p','');summary.className='sv-summary';summary.dataset.viewerSummary='';
    const transport=node('div');transport.className='sv-transport';
    const play=button('▶ 再生','play',transport),start=button('先頭','start',transport),tempoLabel=node('label','BPM',transport),tempo=node('input',undefined,tempoLabel);
    tempo.type='number';tempo.min=20;tempo.max=400;tempo.setAttribute('aria-label','練習テンポ');tempo.dataset.viewerTempo='';
    const audioSettings=button('再生設定','playback-settings',transport),follow=button('現在の演奏位置へ','follow',transport),here=button('ここから再生','here',transport);
    follow.hidden=here.hidden=true;transport.append(summary);
    let current=null,active=false,disposed=false,ticket=0,dialog=null,preferenceTimer=null,frame=null,resizeFrame=null,externalBusy=false;
    let lastWidth=0,restoreAnchor=null,restoring=false;
    let presentationPreview=false,playFrame=null,following=true,geometry=null,barNodes=[],lastFrameTime=0,highlight=null,candidate=null;
    const cursor=doc.createElement('span');cursor.className='sv-playhead';cursor.dataset.viewerPlayhead='';cursor.setAttribute('aria-hidden','true');
    function notice(text,error=false) {state.textContent=text;state.dataset.error=String(error);}
    function controls() {
        const p=current?.reader.read().presentation;
        save.disabled=!current||current.saved||current.saving;
        save.textContent=current?.saved?'端末に保存済み':'この端末に保存';
        flow.disabled=minus.disabled=percent.disabled=plus.disabled=!current;
        if(p){flow.value=p.flow;percent.textContent=Math.round(p.zoom*100)+'%';minus.disabled=p.zoom<=.5;plus.disabled=p.zoom>=3;}
        const sound=current?.player.snapshot(),playing=sound&&['playing','counting','loading'].includes(sound.phase);
        open.disabled=files.disabled=!!playing||externalBusy;display.disabled=audioSettings.disabled=!current;
        play.disabled=!current||externalBusy||sound.phase==='ended'||!sound.totalTicks;start.disabled=!current;
        play.textContent=sound?.phase==='loading'?'■ 中止':sound?.phase==='counting'?'■ カウント中':sound?.phase==='playing'?'Ⅱ 一時停止':'▶ 再生';
        tempo.disabled=!current||['loading','counting'].includes(sound.phase);
        if(sound&&doc.activeElement!==tempo)tempo.value=sound.settings.bpm;
        summary.textContent=current?(sound.phase==='counting'?'開始まで '+sound.countBeat+' / 4':Math.min(Math.floor(sound.tick/1920)+1,current.reader.read().document.score.bars.length)+' / '+current.reader.read().document.score.bars.length+'小節')+'　／　閲覧専用':'';
        follow.hidden=!current||following;here.hidden=!current||candidate===null||!!playing||externalBusy;
    }
    function captureAnchor() {
        if(!current||viewport.scrollTop<4)return null;
        const top=viewport.getBoundingClientRect().top+viewport.clientTop;
        const bars=current.paper.querySelectorAll('.sheet-bar[data-bar-number]');
        for(const bar of bars){const r=bar.getBoundingClientRect();if(r.bottom>top+1){const index=Number(bar.dataset.barNumber)-1;
            return {barId:current.reader.read().document.score.bars[index]?.id,ratio:Math.max(0,Math.min(1,(top-r.top)/Math.max(1,r.height)))};}}
        return null;
    }
    function restore(anchor) {
        if(!current)return;
        if(!anchor){viewport.scrollTop=0;return;}
        const index=current.reader.read().document.score.bars.findIndex(b=>b.id===anchor.barId);
        const bar=current.paper.querySelector('.sheet-bar[data-bar-number="'+(index+1)+'"]');
        if(bar){const rect=bar.getBoundingClientRect(),top=viewport.getBoundingClientRect().top+viewport.clientTop;
            viewport.scrollTop+=rect.top-top+Math.max(0,Math.min(1,anchor.ratio||0))*rect.height;}
    }
    function viewAnchor() {return restoreAnchor||captureAnchor();}
    async function persistPreferences() {
        if(!current)return;
        const item=current,doc=item.reader.read().document;
        try {const p=item.player.snapshot();await library.savePreferences(doc.viewerDocumentId,doc.revisionId,{version:1,presentation:item.reader.read().presentation,anchor:viewAnchor(),playback:{...p.settings,tick:p.tick}});return true;}
        catch {if(current===item)notice('閲覧位置と表示設定を保存できませんでした。譜面はそのまま閲覧できます。',true);return false;}
    }
    function schedulePreferences() {win.clearTimeout(preferenceTimer);if(!presentationPreview)preferenceTimer=win.setTimeout(()=>void persistPreferences(),180);}
    function redraw(anchor=viewAnchor()) {
        if(!current||!active)return;
        renderPaper(current.reader,current.paper,{width:viewport.clientWidth});
        measureGeometry();
        const sound=current.player.snapshot();if(sound.phase==='playing')paintPosition(sound);
        if(current.player.snapshot().phase==='playing'&&following){restoring=false;viewport.scrollTop=geometry.target(current.player.snapshot().tick,viewport.clientHeight,viewport.scrollHeight-viewport.clientHeight);}
        else settleAnchor(anchor);controls();
    }
    function measureGeometry(){
        if(!current)return;const top=viewport.getBoundingClientRect().top+viewport.clientTop;
        // A reused bar may have had its renderer-owned className reset. Rebind
        // the one playback decoration after layout/visibility/rotation changes.
        highlight?.classList.remove('sv-playing');highlight=null;cursor.remove();
        barNodes=Array.from(current.paper.querySelectorAll('.sheet-bar[data-bar-number]'));
        geometry=createScrollMap(Array.from(current.paper.querySelectorAll('.sheet-line[data-line-start]')).filter(e=>Number(e.dataset.lineStart)>0).map(e=>{const r=e.getBoundingClientRect();return {startTick:(Number(e.dataset.lineStart)-1)*1920,top:r.top-top+viewport.scrollTop,bottom:r.bottom-top+viewport.scrollTop};}),current.player.snapshot().totalTicks);
    }
    function stopFrames(){if(playFrame!==null)win.cancelAnimationFrame(playFrame);playFrame=null;lastFrameTime=0;highlight?.classList.remove('sv-playing');highlight=null;cursor.remove();}
    function paintPosition(s){
        const bar=barNodes[s.barIndex];if(bar&&bar!==highlight){highlight?.classList.remove('sv-playing');highlight=bar;bar.classList.add('sv-playing');bar.append(cursor);}cursor.style.left=Math.min(100,s.tickInBar/1920*100)+'%';
    }
    function animate(time){
        playFrame=null;if(!active||!current)return;const s=current.player.snapshot();
        if(!['playing','counting'].includes(s.phase)){stopFrames();return;}
        if(s.phase==='playing'){
            paintPosition(s);
            if(following&&geometry)viewport.scrollTop=smoothFollow(viewport.scrollTop,geometry.target(s.tick,viewport.clientHeight,viewport.scrollHeight-viewport.clientHeight),lastFrameTime?(time-lastFrameTime)/1000:1/60);
        }
        lastFrameTime=time;controls();playFrame=win.requestAnimationFrame(animate);
    }
    function soundChanged(player){
        if(!current||current.player!==player)return;const s=player.snapshot();controls();
        playbackChanged();
        if(['playing','counting'].includes(s.phase)){if(playFrame===null)playFrame=win.requestAnimationFrame(animate);}
        else{stopFrames();restoreAnchor=captureAnchor();schedulePreferences();}
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
    async function openBytes(bytes,{saved=false}={}) {
        if(current&&['playing','loading','counting'].includes(current.player.snapshot().phase)){notice('一時停止してから別の譜面を開いてください。',true);return false;}
        bytes=typeof bytes==='string'?new TextEncoder().encode(bytes):new Uint8Array(bytes).slice();
        const request=++ticket,reader=contract.createReader({playbackState:()=>current?.player.snapshot().phase||'paused'});
        try {
            await reader.open(bytes);
            const document=reader.read().document;
            let preference=null,preferenceFailed=false;
            try {preference=await library.readPreferences(document.viewerDocumentId,document.revisionId);}
            catch {preferenceFailed=true;}
            if(disposed||!active||request!==ticket){reader.dispose();return false;}
            if(preference?.version===1&&preference.presentation)try {reader.setPresentation(preference.presentation);}catch{preferenceFailed=true;}
            const paper=doc.createElement('div');paper.className='sv-paper';
            renderPaper(reader,paper,{width:viewport.clientWidth}); // Prepare before removing the preceding score.
            let player;player=createPlayback(document,preference?.playback,()=>soundChanged(player));
            const next={reader,paper,player,bytes:bytes.slice(),saved,saving:false};
            win.clearTimeout(preferenceTimer);panels.close();stopFrames();candidate=null;highlight=null;following=true;
            if(current){void current.player.dispose().catch(()=>notice('音声の終了を確認できませんでした。全停止を実行してください。',true));current.reader.dispose();}current=next;
            if(Number.isFinite(preference?.playback?.tick))player.seek(Math.max(0,Math.min(player.snapshot().totalTicks,preference.playback.tick)));
            viewport.replaceChildren(paper);restoreAnchor=preference?.anchor||null;redraw(restoreAnchor);
            if(saved)void library.setLast(document.viewerDocumentId,document.revisionId).catch(()=>{});
            const warning=reader.read().warnings.length>0;
            notice(preferenceFailed?'表示設定を復元できなかったため、ファイルの初期表示で開きました。':warning?'譜面を開きました。一部の表示設定を調整したか、登録フォームがないコードがあります。':saved?'端末に保存した譜面を開きました。':'譜面を開きました。「この端末に保存」でライブラリに残せます。',preferenceFailed);
            controls();return true;
        } catch(error) {
            reader.dispose();if(request===ticket&&!disposed){notice(message(error,'open'),true);controls();}return false;
        }
    }
    async function importFile(file) {
        const request=++ticket;
        if(!file)return;
        if(file.size>20*1024*1024){notice('20MiB以内のファイルを選んでください。',true);return;}
        notice('譜面を読み込んでいます…');
        try {const bytes=new Uint8Array(await file.arrayBuffer());if(request!==ticket||!active||disposed)return;await (requestOpen||openBytes)(bytes,{name:file.name});}
        catch(error){if(request===ticket&&!disposed)notice(message(error,'open'),true);}
    }
    open.onclick=()=>input.click();input.addEventListener('change',()=>{const file=input.files[0];input.value='';if(file)void importFile(file);});
    save.onclick=async()=>{
        const item=current;if(!item||item.saving||item.saved)return;
        item.saving=true;controls();notice('端末に保存しています…');
        try {await library.save(item.bytes);item.saved=true;if(current===item){notice('このブラウザに保存しました。ライブラリから開き直せます。');await persistPreferences();}}
        catch(error){if(current===item)notice(message(error,'save'),true);}
        finally{item.saving=false;controls();}
    };
    function change(patch) {if(!current)return;const anchor=viewAnchor();current.reader.setPresentation({...current.reader.read().presentation,...patch});redraw(anchor);schedulePreferences();}
    flow.onchange=()=>change({flow:flow.value});
    minus.onclick=()=>change({zoom:Math.max(.5,Math.round((current.reader.read().presentation.zoom-.1)*10)/10)});
    plus.onclick=()=>change({zoom:Math.min(3,Math.round((current.reader.read().presentation.zoom+.1)*10)/10)});
    percent.onclick=()=>change({zoom:1});
    files.onclick=async()=>{
        if(dialog)return;
        const d=doc.createElement('dialog');dialog=d;d.className='sv-library';d.setAttribute('aria-label','端末の譜面ライブラリ');
        node('h2','譜面ライブラリ',d);node('p','このブラウザに保存した譜面',d);
        const list=node('div',undefined,d);list.className='sv-library-list';list.textContent='読み込んでいます…';
        const close=button('閉じる','library-close',d);close.onclick=()=>d.close();
        d.addEventListener('keydown',e=>e.stopPropagation());
        d.addEventListener('close',()=>{d.remove();if(dialog===d)dialog=null;files.focus({preventScroll:true});});
        host.append(d);d.showModal();
        try {const rows=await library.list();if(dialog!==d)return;list.replaceChildren();
            if(!rows.length)node('p','まだ保存した譜面はありません。',list);
            for(const row of rows){const b=button('','library-open',list);node('strong',row.title,b);node('span',row.artist||row.bars+'小節',b);
                b.onclick=async()=>{b.disabled=true;try{const file=await library.read(row.documentId);if(!d.open||dialog!==d||!active)return;d.close();await (requestOpen||openBytes)(file.bytes,{name:file.name,saved:true});}
                    catch(error){notice(message(error,'open'),true);d.close();}finally{b.disabled=false;}};}
        }catch(error){list.textContent=message(error,'save');}
    };
    const panels=createViewerSettings({host,library,presetCodec:createPresetCodec(contract.normalizePresentation),read:()=>current&&!disposed?current.reader.read():null,change,
        playback:()=>current.player.snapshot(),configure(value){try{if(value.bpm!==undefined)current.player.setTempo(value.bpm);else current.player.configure(value);schedulePreferences();controls();}catch{notice('テンポはカウントイン終了後に変更できます。',true);}},
        begin(){presentationPreview=true;win.clearTimeout(preferenceTimer);},finish(accepted){presentationPreview=false;if(accepted&&!disposed){const item=current;void persistPreferences().then(ok=>{if(ok&&!disposed&&current===item)notice('表示設定をこのブラウザに保存しました。');});}},notify:notice});
    display.onclick=()=>panels.display(display);audioSettings.onclick=()=>panels.audio(audioSettings);
    play.onclick=()=>{if(!current)return;const p=current.player;if(['playing','counting','loading'].includes(p.snapshot().phase))p.pause();else{following=true;if(geometry)viewport.scrollTop=geometry.target(p.snapshot().tick,viewport.clientHeight,viewport.scrollHeight-viewport.clientHeight);void p.play().then(ok=>{if(ok&&current?.player===p&&p.snapshot().warnings.length)notice(p.snapshot().warnings.slice(0,2).join('、'),true);});}};
    start.onclick=()=>{current?.player.seek(0);candidate=null;following=true;restoreAnchor=null;restore(null);controls();schedulePreferences();};
    here.onclick=()=>{if(current&&candidate!==null){current.player.seek(candidate*1920);following=true;candidate=null;if(geometry)viewport.scrollTop=geometry.target(current.player.snapshot().tick,viewport.clientHeight,viewport.scrollHeight-viewport.clientHeight);void current.player.play();}};
    follow.onclick=()=>{following=true;if(current&&geometry)viewport.scrollTop=geometry.target(current.player.snapshot().tick,viewport.clientHeight,viewport.scrollHeight-viewport.clientHeight);controls();};
    tempo.onchange=()=>{try{current.player.setTempo(Number(tempo.value));tempo.removeAttribute('aria-invalid');schedulePreferences();}catch{tempo.setAttribute('aria-invalid','true');notice('テンポは20〜400で入力してください。',true);}};
    viewport.addEventListener('click',e=>{const b=e.target.closest('.sheet-bar[data-bar-number]');if(b&&current?.player.snapshot().phase==='paused'){candidate=Number(b.dataset.barNumber)-1;here.textContent=(candidate+1)+'小節目から再生';controls();}},{signal:events.signal});
    viewport.addEventListener('scroll',()=>{if(restoring||current?.player.snapshot().phase==='playing'&&following)return;restoreAnchor=captureAnchor();schedulePreferences();},{passive:true,signal:events.signal});
    function manual(){restoring=false;if(current&&['playing','counting'].includes(current.player.snapshot().phase)){following=false;controls();}if(frame!==null){win.cancelAnimationFrame(frame);frame=null;}}
    for(const name of ['wheel','touchstart','pointerdown'])viewport.addEventListener(name,manual,{passive:true,signal:events.signal});
    viewport.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(e.key))manual();},{signal:events.signal});
    const observer=new win.ResizeObserver(()=>{
        if(!active||!current||!viewport.clientWidth||lastWidth===viewport.clientWidth)return;
        lastWidth=viewport.clientWidth;const anchor=restoreAnchor||captureAnchor();
        if(resizeFrame!==null)win.cancelAnimationFrame(resizeFrame);
        resizeFrame=win.requestAnimationFrame(()=>{resizeFrame=null;redraw(anchor);});
    });observer.observe(viewport);
    // Viewer focus never activates an editor save/undo/IME command through a host.
    host.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&['s','z','y'].includes(e.key.toLowerCase())&&!e.isComposing){e.preventDefault();e.stopPropagation();}},{signal:events.signal});
    host.addEventListener('keydown',e=>{if(e.isComposing||e.keyCode===229||e.repeat||e.ctrlKey||e.metaKey||e.altKey||panels.isOpen||!current||e.target.closest('input,select,textarea,button,summary,[contenteditable]'))return;
        if(e.code==='Space'||e.key===' '){e.preventDefault();e.stopPropagation();play.click();}
        else if(['ArrowLeft','ArrowRight'].includes(e.key)&&current.player.snapshot().phase==='paused'){e.preventDefault();const s=current.player.snapshot(),index=Math.max(0,Math.min(barNodes.length-1,s.barIndex+(e.key==='ArrowRight'?1:-1)));current.player.seek(index*1920);restoreAnchor={barId:current.reader.read().document.score.bars[index].id,ratio:0};restore(restoreAnchor);}
    },{signal:events.signal});
    doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='hidden'&&current)void current.player.suspend('visibility').catch(()=>notice('音声を停止できませんでした。全停止を実行してください。',true));},{signal:events.signal});
    win.addEventListener('pagehide',()=>{if(current){void persistPreferences();void current.player.suspend('pagehide').catch(()=>{});}},{signal:events.signal});
    controls();
    let initialized=false;
    return Object.freeze({
        async activate(){active=true;lastWidth=viewport.clientWidth;
            if(current){redraw(restoreAnchor);return;}
            if(initialized)return;initialized=true;
            const activationTicket=ticket;
            try {const last=await library.getLast();if(last&&active&&!current&&activationTicket===ticket){const file=await library.read(last.documentId,last.revisionId);if(active&&activationTicket===ticket)await (requestOpen||openBytes)(file.bytes,{name:file.name,saved:true});}}
            catch(error){if(active)notice(message(error,'open'),true);}
        },
        deactivate(){if(!active)return;panels.close();current?.player.pause('workspace');if(current)void current.player.suspend('workspace').catch(()=>notice('音声を停止できませんでした。全停止を実行してください。',true));stopFrames();restoreAnchor=viewAnchor();void persistPreferences();active=false;restoring=false;ticket++;dialog?.close();win.clearTimeout(preferenceTimer);
            if(frame!==null)win.cancelAnimationFrame(frame);if(resizeFrame!==null)win.cancelAnimationFrame(resizeFrame);frame=resizeFrame=null;},
        dispose(){this.deactivate();disposed=true;events.abort();observer.disconnect();if(current)void current.player.dispose();current?.reader.dispose();host.replaceChildren();},
        openBytes,notice,setBusy(value){externalBusy=value;controls();},read:()=>current?.reader.read()||null,playback:()=>current?.player.snapshot()||null
    });
}

// Each format owns its reader, transport and controls. Switch only after the
// replacement has parsed and drawn successfully; the preceding file stays live.
export function mountViewer(options){
    const {host,library}=options,doc=host.ownerDocument;host.replaceChildren();host.classList.add('sv-format-host','sv-viewer');
    const nativeHost=doc.createElement('div'),pdfHost=doc.createElement('div');host.append(nativeHost,pdfHost);pdfHost.hidden=true;
    let active=false,disposed=false,currentKind='score',generation=0,pdf,replacing=false;
    const changed=()=>options.onPlaybackState?.(owner()?.playback()||null);
    const native=mountNativeViewer({...options,host:nativeHost,requestOpen:openBytes,playbackChanged:changed});
    const owner=()=>currentKind==='pdf'?pdf:native;
    async function openBytes(input,metadata={}){
        if(disposed||!active)return false;
        const preceding=owner(),state=preceding?.playback();
        if(state&&['playing','loading','counting'].includes(state.phase)){preceding.notice('一時停止してから別の譜面を開いてください。',true);return false;}
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
            if(kind==='pdf'&&metadata.saved){const r=pdf.read();void library.setLast('pdf:'+r.byteHash,r.byteHash).catch(()=>{});}
            return true;
        }finally{if(ticket===generation||!active)preceding.setBusy(false);if(currentKind==='pdf')native.deactivate();}
    }
    return Object.freeze({async activate(){active=true;if(currentKind==='pdf')pdf.activate();else await native.activate();},
        deactivate(){active=false;generation++;pdf?.cancel();owner()?.setBusy(false);owner()?.deactivate();changed();},
        dispose(){active=false;disposed=true;generation++;native.dispose();pdf?.dispose();host.replaceChildren();},
        readDeviceSettings:()=>library.readDeviceSettings(),saveDeviceSettings:value=>library.saveDeviceSettings(value),
        async withReplacement(run){
            if(replacing||!active||disposed||['playing','counting','loading'].includes(owner()?.playback()?.phase))throw Error('sync-playing');
            replacing=true;owner()?.setBusy(true);try{return await run();}finally{replacing=false;owner()?.setBusy(false);}
        },
        openBytes,read:()=>owner()?.read()||null,playback:()=>owner()?.playback()||null});
}
