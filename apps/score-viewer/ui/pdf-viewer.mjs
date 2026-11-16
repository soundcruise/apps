import {createPDFLoader} from '../core/pdf-loader.mjs';
import {createPDFClock,MAX_PDF_BYTES,normalizePDFSettings} from '../core/pdf-contract.mjs';
import {createPDFPaper} from './pdf-paper.mjs';

const errors={'pdf-byte-limit':'PDFは20MiB以内で開いてください。','pdf-page-limit':'PDFは200ページまで対応しています。','pdf-password':'パスワード付き・暗号化PDFは未対応です。保護のないPDFを選んでください。','pdf-page-size':'ページの寸法が対応範囲を超えています。','pdf-load-timeout':'PDFの読み込みに時間がかかりすぎたため中止しました。'};
export function mountPDFViewer({host,library,requestOpen,playbackChanged=()=>{},document:doc=host.ownerDocument}){
    const win=doc.defaultView,loader=createPDFLoader(),abort=new win.AbortController();host.className='sv-viewer';
    const node=(tag,text,parent=host)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;parent.append(e);return e;};
    const toolbar=node('div');toolbar.className='sv-toolbar';
    const button=(label,id,parent=toolbar)=>{const e=node('button',label,parent);e.type='button';e.dataset.pdfAction=id;return e;};
    const open=button('ファイルを開く','open'),files=button('ライブラリ','library'),save=button('この端末に保存','save');
    const input=node('input',undefined,toolbar);input.type='file';input.hidden=true;input.accept='.pdf,.cruise-score.json,application/pdf,application/json';input.dataset.pdfFile='';
    const name=node('strong','',toolbar);name.className='sv-pdf-title';
    const zoomGroup=node('div',undefined,toolbar);zoomGroup.className='sv-zoom';zoomGroup.setAttribute('role','group');zoomGroup.setAttribute('aria-label','PDFの拡大縮小');
    const minus=button('−','zoom-out',zoomGroup),fit=button('幅合わせ','fit',zoomGroup),plus=button('＋','zoom-in',zoomGroup);
    const status=node('p','');status.className='sv-status';status.setAttribute('role','status');status.dataset.pdfStatus='';
    const viewport=node('div');viewport.className='sv-viewport sv-pdf-viewport';viewport.tabIndex=0;viewport.setAttribute('aria-label','閲覧専用のPDF');viewport.setAttribute('role','region');
    const transport=node('div');transport.className='sv-transport';
    const play=button('▶ 自動送り','play',transport),start=button('先頭','start',transport),settingsButton=button('送り設定','settings',transport),here=button('この位置から','here',transport),follow=button('送り位置へ戻る','follow',transport);
    const previous=button('‹','previous',transport),pageLabel=node('label','ページ',transport),pageInput=node('input',undefined,pageLabel),next=button('›','next',transport),summary=node('span','',transport);
    previous.setAttribute('aria-label','前のページ');next.setAttribute('aria-label','次のページ');pageInput.type='number';pageInput.min=1;pageInput.setAttribute('aria-label','移動先のページ');pageInput.dataset.pdfPageInput='';summary.className='sv-summary';
    let current=null,active=false,busy=false,disposed=false,frame=null,scrollFrame=null,resizeFrame=null,saveTimer=null,dialog=null,following=true,lastWidth=0,anchor=null,restoring=false,loadNumber=0,fileTicket=0;
    const notice=(text,error=false)=>{status.textContent=text;status.dataset.error=error;};
    function viewPosition(){return current?current.paper.positionAt(viewport.scrollTop):0;}
    function capture(){return {position:viewPosition(),x:viewport.scrollLeft/Math.max(1,viewport.scrollWidth-viewport.clientWidth)};}
    function controls(){if(!current)return;const s=current.clock.snapshot(),moving=s.phase==='playing';
        open.disabled=files.disabled=busy||moving;save.disabled=busy||current.saved||current.saving;save.textContent=current.saved?'端末に保存済み':'この端末に保存';
        play.textContent=moving?'Ⅱ 一時停止':'▶ 自動送り';play.disabled=busy||s.phase==='ended'||current.paper.hasErrors();minus.disabled=busy||current.zoom<=.5;plus.disabled=busy||current.zoom>=3;
        fit.textContent=current.zoom===1?'幅合わせ':Math.round(current.zoom*100)+'%';follow.hidden=following||!moving;
        const page=Math.min(current.data.sizes.length,Math.floor(moving?s.position:anchor?.position??viewPosition())+1);if(doc.activeElement!==pageInput)pageInput.value=page;pageInput.max=current.data.sizes.length;
        summary.textContent='/ '+current.data.sizes.length+'　PDF・閲覧専用';previous.disabled=page<=1;next.disabled=page>=current.data.sizes.length;
    }
    function stopFrame(){if(frame!==null)win.cancelAnimationFrame(frame);frame=null;}
    function scheduleSave(){win.clearTimeout(saveTimer);saveTimer=win.setTimeout(()=>void persist(),180);}
    async function persist(){if(!current)return;const item=current;try{await library.savePreferences('pdf:'+item.data.hash,item.data.hash,{version:1,kind:'pdf',zoom:item.zoom,anchor:anchor||capture(),position:item.clock.snapshot().position,settings:item.clock.snapshot().settings});return true;}catch{if(current===item)notice('PDFの閲覧設定を保存できませんでした。現在の表示はそのまま残しています。',true);return false;}}
    function pause(){current?.clock.pause();stopFrame();controls();playbackChanged();scheduleSave();}
    function animate(){frame=null;if(!active||!current)return;const s=current.clock.snapshot();if(s.phase!=='playing'){pause();return;}
        if(following){viewport.scrollTop=current.paper.topAt(s.position);anchor={position:s.position,x:capture().x};}
        current.paper.update(viewport.scrollTop,viewport.clientHeight);controls();frame=win.requestAnimationFrame(animate);
    }
    function restore(value){if(!current)return;restoring=true;anchor=value;viewport.scrollTop=current.paper.topAt(value?.position||0);viewport.scrollLeft=(value?.x||0)*Math.max(0,viewport.scrollWidth-viewport.clientWidth);
        win.requestAnimationFrame(()=>{restoring=false;});}
    function redraw(){if(!current||!active)return;const s=current.clock.snapshot(),at=s.phase==='playing'&&following?{position:s.position,x:capture().x}:anchor||capture();
        current.paper.layout(viewport.clientWidth,current.zoom,win.devicePixelRatio);restore(at);current.paper.update(viewport.scrollTop,viewport.clientHeight);controls();}
    async function openBytes(bytes,{name,saved=false,isCurrent=()=>true}={}){
        let data=null,paper=null;
        try{
            data=await loader.open(bytes,{name});if(!isCurrent()||disposed){await data.dispose();return false;}
            let pref=null;try{pref=await library.readPreferences('pdf:'+data.hash,data.hash);}catch{}
            if(!isCurrent()||disposed){await data.dispose();return false;}
            paper=createPDFPaper({document:doc,pdf:data.pdf,sizes:data.sizes,onError:i=>{if(current?.paper===paper){pause();notice((i+1)+'ページを表示できませんでした。ページ内の「再試行」を押してください。',true);}},onRendered:()=>controls()});
            const zoom=Number.isFinite(pref?.zoom)?Math.max(.5,Math.min(3,pref.zoom)):1;
            paper.layout(viewport.clientWidth||host.parentElement.clientWidth||800,zoom,win.devicePixelRatio);await paper.render(0);
            if(!isCurrent()||disposed){paper.dispose();await data.dispose();return false;}
            const clock=createPDFClock({pages:data.sizes.length,now:()=>win.performance.now()/1000,settings:pref?.settings});
            if(Number.isFinite(pref?.position))clock.seek(Math.max(0,Math.min(data.sizes.length,pref.position)));
            stopFrame();closeDialog();if(current){current.paper.dispose();void current.data.dispose().catch(()=>{});}
            current={data,paper,clock,zoom,saved,saving:false};loadNumber++;following=true;nameElement();viewport.replaceChildren(paper.root);anchor=validAnchor(pref?.anchor,data.sizes.length);restore(anchor);controls();
            notice('PDF：表示項目の切替・文字だけの拡大・伴奏再生はできません。送り速度は「送り設定」で調整できます。');return true;
        }catch(error){paper?.dispose();if(data)await data.dispose().catch(()=>{});if(isCurrent()&&!disposed)notice(errors[error.message]||'PDFを開けませんでした。現在の譜面は保持しています。',true);return false;}
    }
    function validAnchor(value,pages){return {position:Number.isFinite(value?.position)?Math.max(0,Math.min(pages,value.position)):0,x:Number.isFinite(value?.x)?Math.max(0,Math.min(1,value.x)):0};}
    function nameElement(){name.textContent=current.data.name;name.title=current.data.name;}
    function closeDialog(){dialog?.close();}
    function modal(title){if(dialog)return null;const d=node('dialog');dialog=d;d.className='sv-settings';d.setAttribute('aria-label',title);const h=node('header',undefined,d);node('h2',title,h);const close=button('閉じる','dialog-close',h);close.onclick=()=>d.close();d.addEventListener('keydown',e=>e.stopPropagation());d.addEventListener('close',()=>{if(dialog===d)dialog=null;d.remove();settingsButton.focus({preventScroll:true});});return {d,h};}
    function settings(){if(!current)return;const ui=modal('PDFの送り設定');if(!ui)return;const {d,h}=ui,initial=current.clock.snapshot().settings;
        node('p','ページ内を等速で送ります。小節・反復・音符の位置は自動認識しません。',d);
        const label=(text)=>node('label',text,d),mode=node('select',undefined,label('送り方'));
        mode.dataset.pdfMode='';for(const [value,text]of [['seconds','時間で送る'],['beats','拍数で送る']]){const o=node('option',text,mode);o.value=value;}mode.value=initial.mode;
        function number(text,key,min,max,value){const input=node('input',undefined,label(text));input.type='number';input.min=min;input.max=max;input.value=value;input.required=true;input.dataset.pdfSetting=key;return input;}
        const seconds=number('1ページの秒数','seconds',1,3600,initial.seconds),bpm=number('送り用BPM','bpm',20,400,initial.bpm),beats=number('1ページの拍数','beats',1,1024,initial.beats);
        const at=Math.min(current.data.sizes.length-1,Math.floor(viewPosition())),override=number((at+1)+'ページだけの拍数（空欄で共通）','page-beats',1,1024,initial.pageBeats[at]||'');override.required=false;
        const sync=()=>{seconds.parentElement.hidden=mode.value!=='seconds';bpm.parentElement.hidden=beats.parentElement.hidden=override.parentElement.hidden=mode.value!=='beats';};mode.onchange=sync;sync();
        const message=node('p','',d);message.setAttribute('role','status');const apply=button('保存','settings-save',h);
        apply.onclick=()=>{const visible=mode.value==='seconds'?[seconds]:[bpm,beats,override];if(visible.some(e=>!e.checkValidity())){visible.find(e=>!e.checkValidity()).reportValidity();return;}
            const pageBeats={...initial.pageBeats};if(override.value)pageBeats[at]=Number(override.value);else delete pageBeats[at];
            current.clock.configure(normalizePDFSettings({configured:true,mode:mode.value,seconds:Number(seconds.value),bpm:Number(bpm.value),beats:Number(beats.value),pageBeats},current.data.sizes.length));controls();d.close();void persist().then(ok=>{if(ok)notice('PDFの送り設定をこのブラウザに保存しました。');});};
        d.showModal();
    }
    open.onclick=()=>input.click();input.onchange=async()=>{const request=++fileTicket,file=input.files[0];input.value='';if(!file)return;if(file.size>MAX_PDF_BYTES){notice('20MiB以内のファイルを選んでください。',true);return;}try{const bytes=new Uint8Array(await file.arrayBuffer());if(request===fileTicket&&active&&!disposed)await requestOpen(bytes,{name:file.name});}catch{if(request===fileTicket&&active)notice('ファイルを読み込めませんでした。',true);}};
    files.onclick=async()=>{const ui=modal('端末の譜面ライブラリ');if(!ui)return;const list=node('div','読み込んでいます…',ui.d);list.className='sv-library-list';ui.d.showModal();try{const rows=await library.list();if(dialog!==ui.d)return;list.replaceChildren();for(const row of rows){const b=button((row.kind==='pdf'?'PDF　':'譜面　')+row.title,'library-open',list);b.onclick=async()=>{try{const file=await library.read(row.documentId);if(dialog!==ui.d||!active)return;ui.d.close();await requestOpen(file.bytes,{name:file.name,saved:true});}catch{notice('保存したファイルを開けませんでした。',true);}};}if(!rows.length)list.textContent='まだ保存した譜面はありません。';}catch{list.textContent='ライブラリを読み込めませんでした。';}};
    save.onclick=async()=>{const item=current;if(!item||item.saved||item.saving)return;item.saving=true;controls();try{await library.savePDF(item.data.bytes,{name:item.data.name,pages:item.data.sizes.length});item.saved=true;await persist();if(current===item)notice('PDFをこのブラウザに保存しました。');}catch{notice('端末に保存できませんでした。現在のPDFは残しています。',true);}finally{item.saving=false;controls();}};
    play.onclick=()=>{if(!current)return;if(current.clock.snapshot().phase==='playing'){pause();return;}if(!current.clock.snapshot().settings.configured){settings();return;}following=true;current.clock.play();controls();playbackChanged();frame=win.requestAnimationFrame(animate);};
    function jump(position){pause();current.clock.seek(position);following=true;restore({position,x:capture().x});current.paper.update(viewport.scrollTop,viewport.clientHeight);controls();scheduleSave();}
    start.onclick=()=>jump(0);here.onclick=()=>{jump(viewPosition());play.click();};follow.onclick=()=>{following=true;restore({position:current.clock.snapshot().position,x:capture().x});controls();};
    settingsButton.onclick=settings;previous.onclick=()=>jump(Math.max(0,Math.floor(viewPosition())-1));next.onclick=()=>jump(Math.min(current.data.sizes.length-1,Math.floor(viewPosition())+1));
    pageInput.onchange=()=>{if(pageInput.checkValidity())jump(Number(pageInput.value)-1);};
    const setZoom=value=>{if(!current)return;anchor=capture();current.zoom=Math.max(.5,Math.min(3,Math.round(value*10)/10));redraw();scheduleSave();};minus.onclick=()=>setZoom(current.zoom-.1);plus.onclick=()=>setZoom(current.zoom+.1);fit.onclick=()=>setZoom(1);
    function manual(){restoring=false;anchor=null;if(current?.clock.snapshot().phase==='playing'){following=false;controls();}}
    for(const name of ['wheel','pointerdown','touchstart'])viewport.addEventListener(name,manual,{passive:true,signal:abort.signal});
    viewport.addEventListener('scroll',()=>{if(!current||!active)return;if(!restoring&&!(following&&current.clock.snapshot().phase==='playing')){anchor=capture();scheduleSave();}if(scrollFrame===null)scrollFrame=win.requestAnimationFrame(()=>{scrollFrame=null;current?.paper.update(viewport.scrollTop,viewport.clientHeight);controls();});},{passive:true,signal:abort.signal});
    host.addEventListener('keydown',e=>{if(!e.isComposing&&(e.ctrlKey||e.metaKey)&&['s','z','y'].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();}},{signal:abort.signal});
    host.addEventListener('keydown',e=>{if(e.isComposing||e.keyCode===229||e.repeat||e.ctrlKey||e.metaKey||e.altKey||dialog||e.target.closest('input,button,select,textarea,[contenteditable]'))return;if(e.code==='Space'||e.key===' '){e.preventDefault();e.stopPropagation();play.click();}else if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(e.key))manual();},{signal:abort.signal});
    const observer=new win.ResizeObserver(()=>{if(!active||!current||!viewport.clientWidth||lastWidth===viewport.clientWidth)return;lastWidth=viewport.clientWidth;if(resizeFrame!==null)win.cancelAnimationFrame(resizeFrame);resizeFrame=win.requestAnimationFrame(()=>{resizeFrame=null;redraw();});});observer.observe(viewport);
    doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='hidden')pause();},{signal:abort.signal});win.addEventListener('pagehide',()=>{pause();void persist();},{signal:abort.signal});
    return {openBytes,notice,setBusy(value){busy=value;controls();},cancel:()=>loader.cancel(),
        activate(){active=true;lastWidth=viewport.clientWidth;redraw();},
        deactivate(){active=false;fileTicket++;loader.cancel();pause();anchor=current?capture():null;void persist();closeDialog();win.clearTimeout(saveTimer);if(scrollFrame!==null)win.cancelAnimationFrame(scrollFrame);if(resizeFrame!==null)win.cancelAnimationFrame(resizeFrame);scrollFrame=resizeFrame=null;},
        dispose(){this.deactivate();disposed=true;abort.abort();observer.disconnect();current?.paper.dispose();void current?.data.dispose().catch(()=>{});host.replaceChildren();},
        read:()=>current?{kind:'pdf',loadNumber,name:current.data.name,byteHash:current.data.hash,pages:current.data.sizes.length,zoom:current.zoom,anchor:anchor||capture(),stats:current.paper.stats()}:null,
        playback:()=>current?.clock.snapshot()||null};
}
