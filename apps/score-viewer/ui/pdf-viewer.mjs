import {MIN_SCORE_ZOOM,MAX_SCORE_ZOOM,bindScoreZoom,bindOutsideDismiss,applyScoreTheme,syncPlaybackButton} from '../../cruise-studio/js/modules/score-ui.mjs';
import {mountFocusMode} from './focus-mode.mjs';
import {printPDFDocument} from './pdf-print.mjs';
import {exportIcon} from './pdf-export.mjs';
import {createLibraryUI} from './library.mjs';
import {chooseExportName} from './export-dialogs.mjs';
import {mountFileMenu} from './file-menu.mjs';
import {bindPlaybackKeys,downloadViewerFile} from './interaction.mjs';
import {createPDFLoader} from '../core/pdf-loader.mjs';
import {createPDFClock,MAX_PDF_BYTES,normalizePDFSettings} from '../core/pdf-contract.mjs';
import {createPDFPaper} from './pdf-paper.mjs';

const errors={'pdf-byte-limit':'PDFは20MiB以内で開いてください。','pdf-page-limit':'PDFは200ページまで対応しています。','pdf-password':'パスワード付き・暗号化PDFは未対応です。保護のないPDFを選んでください。','pdf-page-size':'ページの寸法が対応範囲を超えています。','pdf-load-timeout':'PDFの読み込みに時間がかかりすぎたため中止しました。'};
export function mountPDFViewer({host,library,requestOpen,playbackChanged=()=>{},document:doc=host.ownerDocument}){
    const win=doc.defaultView,loader=createPDFLoader(),abort=new win.AbortController();host.className='sv-viewer';applyScoreTheme(host);
    const node=(tag,text,parent=host)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;parent.append(e);return e;};
    const toolbar=node('div');toolbar.className='sv-toolbar';
    const button=(label,id,parent=toolbar)=>{const e=node('button',label,parent);e.type='button';e.dataset.pdfAction=id;return e;};
    const open=button('PDFファイルを取り込む','open'),openJSON=button('ビューワー用JSONを開く','open-json'),files=button('ライブラリ','library'),save=button('ライブラリに追加','save');
    const fileMenu=mountFileMenu({button,open,files});
    const input=node('input',undefined,toolbar);input.type='file';input.hidden=true;input.accept='.pdf,application/pdf';input.dataset.pdfFile='';
    const jsonInput=node('input',undefined,toolbar);jsonInput.type='file';jsonInput.hidden=true;jsonInput.accept='.cruise-score.json,application/json';jsonInput.dataset.pdfJSONImport='';
    const name=node('strong','',toolbar);name.className='sv-pdf-title';
    const zoomGroup=node('div',undefined,toolbar);zoomGroup.className='sv-zoom';zoomGroup.setAttribute('role','group');zoomGroup.setAttribute('aria-label','PDFの拡大縮小');
    const minus=button('−','zoom-out',zoomGroup),fit=button('幅合わせ','fit',zoomGroup),plus=button('＋','zoom-in',zoomGroup);
    const focusMode=mountFocusMode(host,toolbar);
    const status=node('p','');status.className='sv-status';status.setAttribute('role','status');status.dataset.pdfStatus='';
    const viewport=node('div');viewport.className='sv-viewport sv-pdf-viewport';viewport.tabIndex=0;viewport.setAttribute('aria-label','閲覧専用のPDF');viewport.setAttribute('role','region');
    const transport=node('div');transport.className='sv-transport';
    const play=button('▶ 自動送り','play',transport),start=button('先頭','start',transport),settingsButton=button('自動スクロール設定','settings',transport),here=button('この位置から','here',transport),follow=button('自動追従に戻る','follow',transport);
    const previous=button('‹','previous',transport),pageLabel=node('label','ページ',transport),pageInput=node('input',undefined,pageLabel),next=button('›','next',transport),summary=node('span','',transport);
    previous.setAttribute('aria-label','前のページ');next.setAttribute('aria-label','次のページ');pageInput.type='number';pageInput.min=1;pageInput.setAttribute('aria-label','移動先のページ');pageInput.dataset.pdfPageInput='';summary.className='sv-summary';
    let selectedPage=null,selectedMarker=null;
    const positionLabel=node('span','',transport);positionLabel.className='sv-selection-label';positionLabel.dataset.pdfSelection='';
    start.hidden=true;start.style.display='none';here.hidden=true;here.style.display='none';
    const syncExport=exportIcon(doc,toolbar,()=>{if(current)downloadViewerFile(doc,current.data.bytes,current.libraryTitle,true);});
    const printButton=button('印刷','print',toolbar);printButton.dataset.pdfPrint='';printButton.onclick=()=>{if(current)printPDFDocument({document:doc,pdf:current.data.pdf,sizes:current.data.sizes,name:current.libraryTitle,notify:notice});};
    transport.classList.add('sv-centered-transport');const left=node('div',undefined,transport),center=node('div',undefined,transport),right=node('div',undefined,transport);left.className='sv-transport-left sv-pdf-paging';center.className='sv-transport-center';right.className='sv-transport-right';left.append(previous,pageLabel,next,summary);center.append(play);transport.replaceChildren(left,center,right,start,here,positionLabel);fileMenu.group('ファイル',open,openJSON,fileMenu.mirror(files),fileMenu.mirror(save));const menuZoom=zoomGroup.cloneNode(true);for(const [id,source]of [['zoom-out',minus],['fit',fit],['zoom-in',plus]]){const b=menuZoom.querySelector('[data-pdf-action='+id+']');delete b.dataset.pdfAction;b.onclick=()=>source.click();}fileMenu.group('表示',fileMenu.mirror(focusMode.button,'全画面モード'),fileMenu.field('拡大・縮小',menuZoom));fileMenu.group('再生',settingsButton);fileMenu.group('書き出し',syncExport.element,printButton);fileMenu.group('ページ',fileMenu.mirror(previous,'前のページ'),fileMenu.mirror(next,'次のページ'));follow.remove();
    let current=null,active=false,busy=false,disposed=false,frame=null,scrollFrame=null,resizeFrame=null,saveTimer=null,dialog=null,following=true,lastWidth=0,anchor=null,restoring=false,loadNumber=0,fileTicket=0;
    let libraryPrompt=null,librarySave=null;
    let noticeTimer;const notice=(text,error=false)=>{win.clearTimeout(noticeTimer);status.textContent=text;status.dataset.error=error;if(!error&&current?.saved)noticeTimer=win.setTimeout(()=>{status.textContent='';},3000);};
    function viewPosition(){return current?current.paper.positionAt(viewport.scrollTop):0;}
    function capture(){return {position:viewPosition(),x:viewport.scrollLeft/Math.max(1,viewport.scrollWidth-viewport.clientWidth)};}
    function controls(){if(!current)return;const s=current.clock.snapshot(),moving=s.phase==='playing';
        open.disabled=openJSON.disabled=files.disabled=busy||moving;fileMenu.sync(busy||moving);save.disabled=busy||current.saved||current.saving;save.hidden=current.saved;
        syncExport(true);printButton.disabled=busy||moving;syncPlaybackButton(play,s.phase,{disabled:busy||current.paper.hasErrors(),idle:'▶ 自動送り'});const preview=dialog?.querySelector('[data-pdf-setting-play]');if(preview)syncPlaybackButton(preview,s.phase,{disabled:play.disabled,idle:'▶ 自動送り'});play.disabled=busy||current.paper.hasErrors();minus.disabled=busy||current.zoom<=MIN_SCORE_ZOOM;plus.disabled=busy||current.zoom>=MAX_SCORE_ZOOM;
        const resume=dialog?.querySelector('[data-scroll-resume]');if(resume)resume.hidden=!current.autoScroll||following;menuZoom.querySelectorAll('button')[1].textContent=current.zoom===1?'幅合わせ':Math.round(current.zoom*100)+'%';fit.textContent=current.zoom===1?'幅合わせ':Math.round(current.zoom*100)+'%';follow.hidden=following||!moving;
        const page=Math.min(current.data.sizes.length,Math.floor(moving?s.position:anchor?.position??viewPosition())+1);if(doc.activeElement!==pageInput)pageInput.value=page;pageInput.max=current.data.sizes.length;
        const showMarker=!moving||(current.autoScroll&&!current.fromViewport&&current.positionInView>0);const selected=!showMarker?null:current.paper.root.querySelector('[data-pdf-page="'+(s.pageIndex+1)+'"]');if(selected!==selectedPage){selectedPage?.classList.remove('sv-selected');selectedMarker?.remove();selectedPage=selected;selectedMarker=null;}if(selectedPage){selectedPage.classList.add('sv-selected');if(!selectedMarker?.isConnected){selectedMarker=node('span','',selectedPage);selectedMarker.className='sv-pdf-selection';}selectedMarker.style.top=(s.position===s.pages?1:s.ratio)*100+'%';}
        positionLabel.textContent=(moving?'送り中：':'選択：')+(s.pageIndex+1)+'ページ';
        summary.textContent='/ '+current.data.sizes.length+'　PDF・閲覧専用';previous.disabled=page<=1;next.disabled=page>=current.data.sizes.length;[minus,fit,plus].forEach((source,i)=>{menuZoom.querySelectorAll('button')[i].disabled=source.disabled;});fileMenu.sync(busy||moving);
    }
    function stopFrame(){if(frame!==null)win.cancelAnimationFrame(frame);frame=null;}
    function scheduleSave(){win.clearTimeout(saveTimer);saveTimer=win.setTimeout(()=>void persist(),180);}
    async function persist(){if(!current)return;const item=current;try{await library.savePreferences(item.entryId,item.data.hash,{version:1,kind:'pdf',zoom:item.zoom,anchor:anchor||capture(),position:item.clock.snapshot().position,autoScroll:item.autoScroll,fromViewport:item.fromViewport,positionInView:item.positionInView,settings:item.clock.snapshot().settings});return true;}catch{if(current===item)notice('PDFの閲覧設定を保存できませんでした。現在の表示はそのまま残しています。',true);return false;}}
    function pause(){current?.clock.pause();stopFrame();controls();playbackChanged();scheduleSave();}
    let viewportLeadIn=0;
    function followClock(position){
        // The first page has a top margin before PDF position zero.
        const inset=current.fromViewport?viewportLeadIn:current.positionInView*Math.max(0,viewport.clientHeight-3);
        viewport.scrollTop=current.paper.topAt(position)-inset;
        anchor=capture();
    }
    function syncClockToScreen(){
        const wasPlaying=current.clock.snapshot().phase==='playing';
        const position=viewPosition();
        viewportLeadIn=current.paper.topAt(position)-viewport.scrollTop;
        current.clock.seek(position);
        if(wasPlaying)current.clock.play();
    }
    function animate(){frame=null;if(!active||!current)return;const s=current.clock.snapshot();if(s.phase!=='playing'){pause();return;}
        if(following&&current.autoScroll){followClock(s.position);}
        current.paper.update(viewport.scrollTop,viewport.clientHeight);controls();frame=win.requestAnimationFrame(animate);
    }
    function restore(value){if(!current)return;restoring=true;anchor=value;viewport.scrollTop=current.paper.topAt(value?.position||0);viewport.scrollLeft=(value?.x||0)*Math.max(0,viewport.scrollWidth-viewport.clientWidth);
        win.requestAnimationFrame(()=>{restoring=false;});}
    function redraw(){if(!current||!active)return;const s=current.clock.snapshot(),at=anchor||capture();
        current.paper.layout(viewport.clientWidth,current.zoom,win.devicePixelRatio);if(s.phase==='playing'&&following&&current.autoScroll)followClock(s.position);else restore(at);current.paper.update(viewport.scrollTop,viewport.clientHeight);controls();}
    async function openBytes(bytes,{name,saved=false,entryId,libraryTitle,isCurrent=()=>true}={}){
        let data=null,paper=null;
        try{
            data=await loader.open(bytes,{name});if(!isCurrent()||disposed){await data.dispose();return false;}
            let libraryId=entryId||'pdf:'+data.hash;if(!saved)try{const existing=(await library.list()).find(row=>row.kind==='pdf'&&row.byteHash===data.hash);if(existing){saved=true;libraryId=existing.entryId;libraryTitle=existing.title;}}catch{}
            let pref=null;try{pref=await library.readPreferences(libraryId,data.hash);}catch{}
            if(!isCurrent()||disposed){await data.dispose();return false;}
            paper=createPDFPaper({document:doc,pdf:data.pdf,sizes:data.sizes,onError:i=>{if(current?.paper===paper){pause();notice((i+1)+'ページを表示できませんでした。ページ内の「再試行」を押してください。',true);}},onRendered:()=>controls()});
            const zoom=Number.isFinite(pref?.zoom)?Math.max(MIN_SCORE_ZOOM,Math.min(MAX_SCORE_ZOOM,pref.zoom)):1;
            paper.layout(viewport.clientWidth||host.parentElement.clientWidth||800,zoom,win.devicePixelRatio);await paper.render(0);
            if(!isCurrent()||disposed){paper.dispose();await data.dispose();return false;}
            const clock=createPDFClock({pages:data.sizes.length,now:()=>win.performance.now()/1000,settings:{...(pref?.settings||{}),configured:true}});
            if(Number.isFinite(pref?.position))clock.seek(Math.max(0,Math.min(data.sizes.length,pref.position)));
            if(current)await persist();if(!isCurrent()||disposed){paper.dispose();await data.dispose();return false;}
            stopFrame();closeDialog();if(current){current.paper.dispose();void current.data.dispose().catch(()=>{});}
            selectedPage?.classList.remove('sv-selected');selectedMarker?.remove();selectedPage=selectedMarker=null;current={data,paper,clock,zoom,autoScroll:pref?.autoScroll!==false,fromViewport:pref?.fromViewport===true,positionInView:[0,.5,1].includes(pref?.positionInView)?pref.positionInView:0,saved,saving:false,entryId:libraryId,libraryTitle:libraryTitle||data.name};loadNumber++;following=true;nameElement();viewport.replaceChildren(paper.root);anchor=validAnchor(pref?.anchor,data.sizes.length);restore(anchor);controls();
            notice(saved?'':'PDFを開きました。「ライブラリに追加」であとから開き直せます。');viewport.focus({preventScroll:true});return true;
        }catch(error){paper?.dispose();if(data)await data.dispose().catch(()=>{});if(isCurrent()&&!disposed)notice(errors[error.message]||'PDFを開けませんでした。現在の譜面は保持しています。',true);return false;}
    }
    function validAnchor(value,pages){return {position:Number.isFinite(value?.position)?Math.max(0,Math.min(pages,value.position)):0,x:Number.isFinite(value?.x)?Math.max(0,Math.min(1,value.x)):0};}
    function nameElement(){name.textContent=current.libraryTitle;name.title=current.libraryTitle;}
    function closeDialog(){dialog?.close();}
    function modal(title){if(dialog)return null;const d=node('dialog');dialog=d;d.className='sv-settings sv-scroll-settings';d.setAttribute('aria-label',title);const h=node('header',undefined,d);node('h2',title,h);const close=button('閉じる','dialog-close',h);close.onclick=()=>d.close();d.addEventListener('keydown',e=>e.stopPropagation());d.addEventListener('close',()=>{if(dialog===d)dialog=null;d.remove();settingsButton.focus({preventScroll:true});});return {d,h};}
    function settings(){if(!current)return;const ui=modal('PDFの自動スクロール設定');if(!ui)return;const {d,h}=ui;d.classList.add('sv-modeless');d.dataset.viewerNonmodal='';const preview=button('▶ 自動送り','settings-play',h);preview.dataset.pdfSettingPlay='';preview.onclick=()=>play.click();const initial=current.clock.snapshot().settings;
        const help=button('?','settings-help',h),note=node('p','自動スクロールをOFFにしても、演奏位置の時計は進みます。「今の画面から流す」は現在の表示位置から開始します。「さらに詳細」の「拍数で送る」で、送り用BPMとページの拍数を指定できます。',d);note.className='sv-settings-note';note.hidden=true;help.setAttribute('aria-label','自動スクロール設定のヘルプ');help.setAttribute('aria-expanded','false');help.onclick=()=>{note.hidden=!note.hidden;help.setAttribute('aria-expanded',String(!note.hidden));};
        const autoLabel=node('label','自動スクロール',d),auto=node('input',undefined,autoLabel);auto.type='checkbox';auto.checked=current.autoScroll;auto.dataset.autoScroll='';autoLabel.className='sv-auto-scroll';autoLabel.prepend(auto);const content=node('div',undefined,d);content.hidden=!current.autoScroll;
        auto.onchange=()=>{current.autoScroll=auto.checked;if(auto.checked&&current.fromViewport)syncClockToScreen();following=true;content.hidden=!auto.checked;controls();scheduleSave();};const resume=button('スクロール再開','scroll-resume',d);resume.dataset.scrollResume='';resume.hidden=!current.autoScroll||following;resume.onclick=()=>follow.click();
        const originLabel=node('label','スクロールの開始位置',content),origin=node('select',undefined,originLabel);
        originLabel.className='sv-scroll-origin';
        for(const [key,text] of [['clock','選んだ演奏位置から'],['viewport','今の画面から流す']])node('option',text,origin).value=key;
        origin.value=current.fromViewport?'viewport':'clock';
        const placementLabel=node('label','選択位置の表示',content),position=node('select',undefined,placementLabel);
        placementLabel.className='sv-scroll-origin';placementLabel.hidden=current.fromViewport;
        for(const [key,text] of [[0,'上側'],[.5,'中央'],[1,'下側']])node('option',text,position).value=key;
        position.value=current.positionInView;
        position.onchange=()=>{current.positionInView=Number(position.value);followClock(current.clock.snapshot().position);controls();scheduleSave();};
        origin.onchange=()=>{
            current.fromViewport=origin.value==='viewport';placementLabel.hidden=current.fromViewport;
            if(current.fromViewport&&current.autoScroll&&current.clock.snapshot().phase==='playing')syncClockToScreen();
            controls();scheduleSave();
        };
        const speedLabel=node('label','送り速度',content),speed=node('input',undefined,speedLabel),speedValue=node('output','',speedLabel);speed.type='range';speed.min=0;speed.max=100;speed.dataset.pdfSpeed='';speed.setAttribute('aria-label','PDFの送り速度');const sec=initial.mode==='seconds'?initial.seconds:initial.beats*60/initial.bpm;speed.value=Math.max(0,Math.min(100,100*Math.log(120/sec)/Math.log(16)));const ticks=node('div',undefined,content);ticks.className='sv-speed-ticks';for(const text of ['遅い','普通','速い'])node('span',text,ticks);
        const advanced=node('details',undefined,content);advanced.dataset.pdfAdvanced='';node('summary','さらに詳細',advanced);const fields=node('div',undefined,advanced);
        const label=(text)=>node('label',text,fields),mode=node('select',undefined,label('送り方'));
        mode.dataset.pdfMode='';for(const [value,text]of [['seconds','時間で送る'],['beats','拍数で送る']]){const o=node('option',text,mode);o.value=value;}mode.value=initial.mode;
        function number(text,key,min,max,value){const input=node('input',undefined,label(text));input.type='number';input.min=min;input.max=max;input.step='any';input.value=value;input.required=true;input.dataset.pdfSetting=key;return input;}
        const seconds=number('1ページの秒数','seconds',1,3600,initial.seconds),bpm=number('送り用BPM','bpm',20,400,initial.bpm),beats=number('1ページの拍数','beats',1,1024,initial.beats);
        const at=Math.min(current.data.sizes.length-1,Math.floor(viewPosition())),override=number((at+1)+'ページだけの拍数（空欄で共通）','page-beats',1,1024,initial.pageBeats[at]||'');override.required=false;
        speedValue.textContent=Math.round(sec)+'秒／ページ';speed.oninput=()=>{const value=120*Math.pow(1/16,Number(speed.value)/100);seconds.value=String(Math.round(value*100)/100);current.clock.configure({configured:true,mode:'seconds',seconds:Number(seconds.value)});controls();scheduleSave();mode.value='seconds';speedValue.textContent=Math.round(value)+'秒／ページ';sync();};
        const sync=()=>{seconds.parentElement.hidden=mode.value!=='seconds';bpm.parentElement.hidden=beats.parentElement.hidden=override.parentElement.hidden=mode.value!=='beats';};mode.onchange=sync;sync();
        const message=node('p','',d);message.setAttribute('role','status');const apply=button('完了','settings-save',h);
        apply.onclick=()=>{const visible=mode.value==='seconds'?[seconds]:[bpm,beats,override];if(visible.some(e=>!e.checkValidity())){visible.find(e=>!e.checkValidity()).reportValidity();return;}
            const pageBeats={...initial.pageBeats};if(override.value)pageBeats[at]=Number(override.value);else delete pageBeats[at];
            current.clock.configure(normalizePDFSettings({configured:true,mode:mode.value,seconds:Number(seconds.value),bpm:Number(bpm.value),beats:Number(beats.value),pageBeats},current.data.sizes.length));controls();d.close();void persist().then(ok=>{if(ok)notice('PDFの自動スクロール設定をこのブラウザに保存しました。');});};
        bindOutsideDismiss(d);d.show();
    }
    open.onclick=()=>input.click();openJSON.onclick=()=>jsonInput.click();
    for(const picker of [input,jsonInput])picker.onchange=async()=>{
        const request=++fileTicket,file=picker.files[0];picker.value='';if(!file)return;
        libraryUI.close();
        if(file.size>MAX_PDF_BYTES){notice('20MiB以内のファイルを選んでください。',true);return;}
        try{
            const bytes=new Uint8Array(await file.arrayBuffer());
            if(request===fileTicket&&active&&!disposed)await requestOpen(bytes,{name:file.name,offerPDFLibraryAdd:true});
        }catch{if(request===fileTicket&&active)notice('ファイルを読み込めませんでした。',true);}
    };
    const libraryUI=createLibraryUI({host,library,importPDF:()=>input.click(),open:requestOpen,async changed(){if(!current)return;const item=current,row=await library.entry(item.entryId);if(current===item){item.saved=!!row&&row.byteHash===item.data.hash;item.libraryTitle=row?.title||item.libraryTitle;nameElement();controls();}},notify:notice});
    files.onclick=()=>void libraryUI.show(files);
    function offerLibraryAdd(){
        const item=current;if(!active||!item||item.saved||libraryPrompt)return;
        const d=node('dialog');libraryPrompt=d;d.className='sv-library sv-export-choice';
        d.setAttribute('aria-label','PDFをライブラリに追加しますか？');
        node('h2','PDFをライブラリに追加しますか？',d);
        node('p',item.libraryTitle,d).className='sv-export-name';
        const footer=node('footer',undefined,d);
        const later=button('今は追加しない','library-later',footer);
        const add=button('ライブラリに追加','library-add',footer);add.className='sv-primary';
        let accepted=false;
        later.onclick=()=>d.close();add.onclick=()=>{accepted=true;d.close();};
        d.addEventListener('keydown',e=>e.stopPropagation());
        d.addEventListener('close',()=>{
            libraryPrompt=null;d.remove();
            if(accepted&&active&&current===item)void saveCurrent();
        },{once:true});
        bindOutsideDismiss(d);d.showModal();later.focus();
    }
    async function saveCurrent(){
        const item=current;if(!item||!active)return false;if(item.saved)return true;if(item.saving)return false;
        const attempt=new win.AbortController();librarySave=attempt;item.saving=true;controls();
        const canSave=()=>active&&!disposed&&current===item&&!attempt.signal.aborted;
        try{
            const [entries,folders]=await Promise.all([library.list(),library.listFolders()]);
            if(!canSave())return false;
            const options=await chooseExportName(doc,{name:item.libraryTitle,entries,folders,addToLibrary:true,
                signal:attempt.signal,createFolder:(name,parent)=>library.createFolder(name,parent)});
            if(!options||!canSave())return false;
            const row=await library.savePDF(item.data.bytes,{name:item.data.name,pages:item.data.sizes.length},{...options,canSave});
            item.saved=true;item.entryId=row.entryId;item.libraryTitle=row.title;
            if(canSave()){nameElement();await persist();notice('PDFをライブラリに追加しました。');}
            return true;
        }catch(error){
            if(canSave())notice(error.message==='viewer-name-conflict'?'同じ名前のファイルがあります。名前を確認してください。':'ライブラリに追加できませんでした。PDFは引き続き閲覧できます。',true);
            return false;
        }finally{if(librarySave===attempt)librarySave=null;item.saving=false;controls();}
    }
    save.onclick=()=>void saveCurrent();
    play.onclick=()=>{if(!current)return;if(current.clock.snapshot().phase==='playing'){pause();return;}if(current.autoScroll&&current.fromViewport)syncClockToScreen();else if(current.clock.snapshot().phase==='ended')current.clock.seek(0);following=true;current.clock.play();controls();playbackChanged();frame=win.requestAnimationFrame(animate);};
    function jump(position){pause();current.clock.seek(position);following=true;restore({position,x:capture().x});current.paper.update(viewport.scrollTop,viewport.clientHeight);controls();scheduleSave();}
    start.onclick=()=>jump(0);here.onclick=()=>{jump(viewPosition());play.click();};follow.onclick=()=>{following=true;if(current.fromViewport)syncClockToScreen();followClock(current.clock.snapshot().position);controls();};
    settingsButton.onclick=settings;previous.onclick=()=>jump(Math.max(0,Math.floor(viewPosition())-1));next.onclick=()=>jump(Math.min(current.data.sizes.length-1,Math.floor(viewPosition())+1));
    pageInput.onchange=()=>{if(pageInput.checkValidity())jump(Number(pageInput.value)-1);};
    const setZoom=value=>{if(!current)return;anchor=capture();current.zoom=Math.max(MIN_SCORE_ZOOM,Math.min(MAX_SCORE_ZOOM,Math.round(value*100)/100));redraw();scheduleSave();};minus.onclick=()=>setZoom(current.zoom-.1);plus.onclick=()=>setZoom(current.zoom+.1);fit.onclick=()=>setZoom(1);
    function manual(){restoring=false;anchor=null;if(current?.clock.snapshot().phase==='playing'){following=false;controls();}}
    for(const name of ['wheel','pointerdown','touchstart'])viewport.addEventListener(name,manual,{passive:true,signal:abort.signal});
    viewport.addEventListener('scroll',()=>{if(!current||!active)return;if(!restoring&&!(following&&current.clock.snapshot().phase==='playing')){anchor=capture();scheduleSave();}if(scrollFrame===null)scrollFrame=win.requestAnimationFrame(()=>{scrollFrame=null;current?.paper.update(viewport.scrollTop,viewport.clientHeight);controls();});},{passive:true,signal:abort.signal});
    host.addEventListener('keydown',e=>{if(!e.isComposing&&(e.ctrlKey||e.metaKey)&&['s','z','y'].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();}},{signal:abort.signal});
    const unbindKeys=bindPlaybackKeys(host,{active:()=>active&&!!current,toggle:()=>play.click()});
    viewport.addEventListener('click',e=>{const page=e.target.closest('[data-pdf-page]');if(!page||!current||current.clock.snapshot().phase==='playing')return;const rect=page.getBoundingClientRect(),index=Number(page.dataset.pdfPage)-1,ratio=Math.max(0,Math.min(.999,(e.clientY-rect.top)/rect.height));current.clock.seek(index+ratio);selectedPage?.classList.remove('sv-selected');selectedMarker?.remove();selectedPage=page;page.classList.add('sv-selected');selectedMarker=node('span','',page);selectedMarker.className='sv-pdf-selection';selectedMarker.style.top=ratio*100+'%';following=true;viewport.focus({preventScroll:true});controls();scheduleSave();},{signal:abort.signal});
    bindScoreZoom(viewport,{read:()=>current.zoom,write:setZoom,enabled:()=>active&&!!current,signal:abort.signal});
    const observer=new win.ResizeObserver(()=>{if(!active||!current||!viewport.clientWidth||lastWidth===viewport.clientWidth)return;lastWidth=viewport.clientWidth;if(resizeFrame!==null)win.cancelAnimationFrame(resizeFrame);resizeFrame=win.requestAnimationFrame(()=>{resizeFrame=null;redraw();});});
    doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='hidden')pause();},{signal:abort.signal});win.addEventListener('pagehide',()=>{pause();void persist();},{signal:abort.signal});
    return {openBytes,notice,saveCurrent,offerLibraryAdd,hasUnsaved:()=>!!current&&!current.saved,setBusy(value){busy=value;controls();},cancel:()=>loader.cancel(),
        activate(){active=true;if(current)observer.observe(viewport);lastWidth=viewport.clientWidth;redraw();},
        deactivate(){observer.disconnect();focusMode.exit();active=false;libraryPrompt?.close();librarySave?.abort();fileTicket++;loader.cancel();pause();anchor=current?capture():null;void persist();closeDialog();libraryUI.close();win.clearTimeout(saveTimer);if(scrollFrame!==null)win.cancelAnimationFrame(scrollFrame);if(resizeFrame!==null)win.cancelAnimationFrame(resizeFrame);scrollFrame=resizeFrame=null;},
        dispose(){focusMode.dispose();this.deactivate();disposed=true;win.clearTimeout(noticeTimer);fileMenu.dispose();unbindKeys();abort.abort();observer.disconnect();current?.paper.dispose();void current?.data.dispose().catch(()=>{});host.replaceChildren();},
        read:()=>current?{kind:'pdf',entryId:current.entryId,loadNumber,name:current.data.name,byteHash:current.data.hash,pages:current.data.sizes.length,zoom:current.zoom,anchor:anchor||capture(),stats:current.paper.stats()}:null,
        playback:()=>current?.clock.snapshot()||null};
}
