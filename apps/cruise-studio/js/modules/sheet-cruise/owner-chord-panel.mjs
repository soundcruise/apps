import {singleChordPlan,chordNotes,fillBlankStrums} from './chord-audition.mjs';
import {readBookSource,bookSourceCurrent} from './book-source.mjs';
import {openBookPicker} from './book-bridge.mjs';
import {parseChordNames,MAX_BYTES} from './chord-name-transfer.mjs';
import {parseChordForms,FORM_FORMAT} from './chord-form-transfer.mjs';
import {ownerQuality} from '../chord/form-snapshot.mjs?v=0.88.1';
import {formMessage} from '../chord/form-panel.mjs?v=0.88.1';
import {drawChordForm,formDiagramOptions} from './chord-form-diagram.mjs';

// Exact owner UI in a shadow tree; the local host injects the generated source.
// Its settings are memory-only. It cannot reach native Chord/Studio storage.
export function createOwnerChordPicker(C,base){
    const sessions=new WeakMap();
    return {mount(host,target){
        const {session,bar,tick,project}=target,source=C.localChordOwner;
        let memory=sessions.get(session);if(!memory){memory={catalogue:null};sessions.set(session,memory);}
        const events=new AbortController();
        const shadow=host.shadowRoot||host.attachShadow({mode:'open'});shadow.replaceChildren();host.textContent='';host.className='score-owner-chord-picker';host.setAttribute('aria-label','コードを調べる');
        // The beat grid may deliberately scroll wider than its viewport. Keep
        // this card inside the visible viewport, without trapping fixed dialogs.
        const viewport=host.closest('.editor-score-scroll');
        function fitViewport(){if(viewport?.clientWidth){const margin=parseFloat(getComputedStyle(host).marginLeft)||0;host.style.maxWidth=Math.max(0,viewport.clientWidth-margin)+'px';}}
        fitViewport();const viewportObserver=new ResizeObserver(fitViewport);if(viewport)viewportObserver.observe(viewport);
        const style=document.createElement('style');
        // Only document-root selectors are localized; all owner component rules are identical.
        style.textContent=source.ownerCSS.replace(/:root/g,':host').replace(/(^|[},\s])html(?=[\s.[#:])/gm,'$1:host').replace(/(^|[},\s])body(?=[\s.{[:])/gm,'$1:host').replace(/:host(\[[^\]]+\])/g,':host($1)')+layoutCSS;
        shadow.append(style);const body=document.createElement('div');shadow.append(body);
        const doc={createElement:document.createElement.bind(document),createElementNS:document.createElementNS.bind(document),createTextNode:document.createTextNode.bind(document),getElementById:id=>shadow.getElementById(id),querySelector:s=>shadow.querySelector(s),querySelectorAll:s=>shadow.querySelectorAll(s),body,documentElement:host,get activeElement(){return shadow.activeElement;},addEventListener:(type,listener,options)=>shadow.addEventListener(type,listener,{...(typeof options==='boolean'?{capture:options}:options),signal:events.signal}),removeEventListener:shadow.removeEventListener.bind(shadow)};
        const noStorage=()=>{throw Error('Owner UI has no native storage capability');};
        const win={document:doc,ChordCruise:{theory:base.theory,chordModel:base.chordModel,caged:base.caged,ui:{},featureAccess:{isProEdition:()=>C.entryAuth.isAuthorized(),canAccessQuality:()=>C.entryAuth.isAuthorized(),canAccessCaged:()=>C.entryAuth.isAuthorized()}},localStorage:{getItem:noStorage,setItem:noStorage,removeItem:noStorage},getComputedStyle:window.getComputedStyle.bind(window),requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),setTimeout:window.setTimeout.bind(window),clearTimeout:window.clearTimeout.bind(window)};
        const owner=source.createOwnerUI(win,doc),defaults=owner.storage.getSettingsDefaults();
        if(!memory.ui)memory.ui={settings:defaults,exploreSelectedChordIndex:0,exploreShape:'',exploreCustomChord:null};
        // Follow the score on every mount; preview settings never rewrite songInfo.
        const scoreKey=base.theory.parseSpelledNoteName(project.songInfo.originalKey);
        if(scoreKey)memory.ui.settings.selectedKey=scoreKey.pc;
        owner.state=memory.ui;owner.storage={saveSettings:next=>{Object.assign(owner.state.settings,next);return true;}};
        let disposed=false,composing=false,importEpoch=0;
        const current=()=>!disposed&&host.isConnected&&target.current();
        const eligible=()=>current()&&!composing&&target.eligible();
        function followTheme(){
            host.dataset.theme=C.colorTheme.getColorTheme();
            const tokens=getComputedStyle(document.documentElement);
            // Owner translucent fills use RGB channels; project the same Studio palette.
            for(const [ownerToken,studioToken] of Object.entries({'accent':'accent','accent-bright':'accent-bright','accent-line':'accent-text','champagne':'accent-text','line':'accent','ink':'text-primary','neutral':'text-secondary','chrome':'surface','overlay-bg':'app-bg'})){
                const value=tokens.getPropertyValue('--studio-'+studioToken).trim(),hex=/^#([\da-f]{6})$/i.exec(value),rgb=/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
                const channels=hex?[0,2,4].map(i=>parseInt(hex[1].slice(i,i+2),16)):rgb?.slice(1,4);
                if(channels)host.style.setProperty('--cc-'+ownerToken+'-rgb',channels.join(', '));
            }
        }
        followTheme();const unsubscribeTheme=C.colorTheme.subscribeColorTheme(followTheme);
        function node(tag,text,parent=body,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;parent.append(n);return n;}
        function button(text,run,parent,attrs={}){const b=node('button',text,parent,'cc-btn cc-btn-secondary');b.type='button';for(const[k,v]of Object.entries(attrs))b.setAttribute(k,String(v));b.addEventListener('pointerdown',e=>e.preventDefault());b.addEventListener('click',()=>{if(b.isConnected&&eligible())run();});return b;}
        function setChord(name){
            const parsed=C.theory.parseBasicChordSymbol(name),root=parsed&&base.theory.parseSpelledNoteName(parsed.root),quality=parsed&&ownerQuality(base.theory,parsed.quality);
            if(!root)return false;
            if(!quality&&parsed.quality==='add9'){
                owner.state.exploreCustomChord=base.chordModel.buildCustomChord({rootPc:root.pc,third:4,fifth:7,seventh:null,tensions:[14],bassPc:parsed.bass?base.theory.parseSpelledNoteName(parsed.bass)?.pc:null});owner.state.exploreCustomChord.symbol=name;owner.state.exploreSelectedChordIndex=null;return true;
            }
            if(!quality){
                // Keep a builder's actual intervals while it is open. On reload,
                // a manual snapshot can still be drawn/edited without inventing a quality.
                if(owner.state.exploreCustomChord?.symbol===name)return true;
                const event=bar.chords.find(e=>e.onsetTick===tick&&e.symbol===name),binding=event&&project.performance.formBindings.find(b=>b.chordEventId===event.id),m=binding&&project.materials.forms.find(m=>m.id===binding.materialId);
                if(!m)return false;
                const pcs=[...new Set(m.snapshot.strings.filter(n=>n.kind==='note').map(n=>(m.snapshot.tuningMidi[n.string-1]+m.snapshot.capo+n.relativeFret)%12))],intervals=pcs.map(pc=>(pc-root.pc+12)%12).sort((a,b)=>a-b);
                owner.state.exploreCustomChord={symbol:name,source:'custom',rootPc:root.pc,rootName:parsed.root,qualityKey:null,intervals,notePcs:pcs,bassPc:parsed.bass?base.theory.parseSpelledNoteName(parsed.bass)?.pc:null};owner.state.exploreSelectedChordIndex=null;return true;
            }
            const definition=base.theory.QUALITIES[quality];owner.state.exploreCustomChord={symbol:name,source:'custom',rootPc:root.pc,rootName:parsed.root,qualityKey:quality,intervals:definition.intervals.slice(),notePcs:definition.intervals.map(n=>(root.pc+n)%12),bassPc:parsed.bass?base.theory.parseSpelledNoteName(parsed.bass)?.pc:null};owner.state.exploreSelectedChordIndex=null;return true;
        }
        const canonical=bar.chords.find(e=>e.onsetTick===tick),identity=bar.id+':'+tick+':'+(canonical?.symbol||'');
        if(memory.identity!==identity){memory.identity=identity;if(canonical){setChord(canonical.symbol);const binding=project.performance.formBindings.find(b=>b.chordEventId===canonical.id),saved=binding&&project.materials.forms.find(m=>m.id===binding.materialId);if(saved?.provenance.shape){owner.state.exploreShape=saved.provenance.shape;owner.state.exploreFretboardDisplayMode='finger';}}else{owner.state.exploreCustomChord=null;owner.state.exploreSelectedChordIndex=0;}}
        body.className='score-chord-layout';
        const basic=node('section',undefined,body,'score-chord-basic');
        basic.setAttribute('aria-label','選択中のコードフォームとダイアトニック');
        const basicLayout=node('div',undefined,basic,'score-chord-basic-layout');
        const formView=node('figure',undefined,basicLayout,'score-chord-selected-form');
        const formName=node('figcaption','',formView),diagram=node('div',undefined,formView,'score-chord-diagram');
        const soundDeps={parseChord:C.theory.parseBasicChordSymbol,qualities:base.theory.QUALITIES,notePc:C.theory.keyToSemitone};
        function audition(name,snapshot){if(!eligible())return;try{target.preview?.(singleChordPlan(project,{symbol:name},soundDeps,snapshot),'chord');}catch(e){status.textContent=e.message;}}
        function auditionSelected(){const chord=owner.ui.explore.readSelectedChord();if(chord)audition(chord.symbol,(selectedMaterial()||C.localChordForms?.recommend(project,chord.symbol))?.snapshot);}
        button('▶',auditionSelected,formView,{'data-chord-audition':'selected','aria-label':'表示中のコードを試聴',title:'表示中の押さえ方をアコギで試聴'}).classList.add('score-form-play');
        const harmony=node('div',undefined,basicLayout,'score-chord-harmony');
        const progression=button('▶ コード進行を再生',()=>{try{target.progression?.({notes:chord=>chordNotes(project,chord,soundDeps),fillBlank:fillBlankStrums});}catch(e){status.textContent=e.message;}},harmony,{'data-chord-progression':'',title:'編集中の1／2小節のコードとストロークを試聴。空欄は拍の表とコード変化で発音','aria-pressed':false});
        function refreshPlayback(){const state=target.previewState?.(),active=state?.scope==='chords'&&state.phase!=='idle',text=active?'■ 停止':'▶ コード進行を再生';if(progression.textContent!==text)progression.textContent=text;progression.setAttribute('aria-pressed',String(!!active));}
        const unsubscribePreview=target.subscribePreview?.(refreshPlayback);refreshPlayback();
        const actions=node('div',undefined,basicLayout,'cc-control-row score-chord-actions');
        const advanced=button('詳細設定',()=>{memory.advanced=!memory.advanced;setAdvanced();},actions,{title:'任意コードやコードフォームの編集','aria-expanded':false,'data-chord-advanced':''});
        function setAdvanced(){host.classList.toggle('score-chord-advanced',!!memory.advanced);advanced.setAttribute('aria-expanded',String(!!memory.advanced));}
        setAdvanced();
        const section=node('section');section.id='cc-screen-explore';
        const status=node('p','',body,'cc-fb-hint');status.setAttribute('role','status');
        owner.ui.toast={show:message=>{status.textContent=message;}};
        function write(name,formMaterial,formMode){
            if(!eligible())return false;
            if(!C.theory.parseBasicChordSymbol(name)){status.textContent='コード名として入力できない名前です。元のマスを保持しています。';return false;}
            session.finishTextGroup();const ok=target.write(name,formMaterial,formMode);session.finishTextGroup();if(!ok)status.textContent='入力対象・コード表記・保存状態を確認してください。';return ok;
        }
        const provider=C.localBookSource;
        if(memory.source&&(memory.sourceProvider!==provider||!bookSourceCurrent(provider,memory.source))){memory.catalogue=null;memory.source=null;memory.folder='';}
        const shelf=node('section',undefined,body,'cc-card score-name-transfer');
        let bookRequest=null,readRequest=null,readEpoch=0,bookDiagrams=[],bookScrollRAF=null,revealOnRead=false;
        function revealBook(){if(bookScrollRAF!==null)cancelAnimationFrame(bookScrollRAF);bookScrollRAF=requestAnimationFrame(()=>{bookScrollRAF=null;if(!current()||!memory.bookOpen)return;const editor=host.closest('#sc-slot-overlay');for(let scroller=host.parentElement;scroller;scroller=scroller.parentElement){if(scroller.scrollHeight<=scroller.clientHeight+1||!/(auto|scroll)/.test(getComputedStyle(scroller).overflowY))continue;const a=scroller.getBoundingClientRect(),b=shelf.getBoundingClientRect(),head=scroller===editor?editor.querySelector('.slot-overlay-head')?.offsetHeight||0:0;scroller.scrollTop+=b.top-a.top-head-8;break;}});}
        function cancelRead(){readEpoch++;readRequest?.abort();readRequest=null;}
        const shelfToggle=button('コード本棚を開く',()=>{memory.bookOpen=!memory.bookOpen;showBook();if(memory.bookOpen){revealOnRead=true;revealBook();}if(!memory.bookOpen){bookRequest?.cancel();cancelRead();}else if(provider&&!memory.source)loadBook();},actions,{'data-book-open':'','aria-expanded':false,title:'同じ編集カードで本棚のコードとフォームを選択'});
        const shelfPanel=node('div',undefined,shelf,'score-book-panel');shelfPanel.dataset.bookPanel='';
        const bookHint=node('p','',shelfPanel,'cc-fb-hint');bookHint.setAttribute('role','status');
        const sourceTools=node('div',undefined,shelfPanel,'cc-control-row');
        if(provider){node('strong',provider.kind==='mock'?'模擬アカウントの本棚 / 実アカウント未接続':'同期済みの本棚',sourceTools,'score-book-source');}
        sourceTools.after(bookHint);
        const update=provider&&button('再試行',()=>loadBook(),sourceTools,{'data-book-refresh':'',title:'本棚を読み直す。譜面や元本棚は変更しません'});
        if(update)update.hidden=true;
        const legacy=node('details',undefined,shelfPanel);node('summary','従来の取込み方法（予備）',legacy);legacy.open=!provider;legacy.hidden=!!provider;
        const importOption=node('label',undefined,legacy);const importForms=node('input',undefined,importOption);importForms.type='checkbox';importForms.dataset.importForms='';importForms.checked=!!memory.withForms;importOption.append(' フォームも取り込み・採用する（カポ0・標準6弦と押さえ方を確認）');
        const tools=node('div',undefined,legacy,'cc-control-row');
        button('別タブの本棚から取り込む（従来方式）',()=>{if(provider)return;bookRequest?.cancel();const forms=importForms.checked;bookRequest=openBookPicker({catalogue:true,isCurrent:()=>eligible()&&memory.bookOpen&&importForms.checked===forms,onSelect:payload=>{if(!eligible())return false;cancelRead();memory.catalogue=payload;memory.source=null;memory.folder='';catalogue();return true;},onStatus:message=>{if(current())status.textContent=message;},withForms:forms});},tools,{'data-book-import':'',title:'初回の読取りだけPro別タブで行い、この画面へコピーする'});
        importForms.addEventListener('change',()=>{memory.withForms=importForms.checked;bookRequest?.cancel();bookRequest=null;});
        const filterLabel=node('label','フォルダ ',shelfPanel),filter=node('select',undefined,filterLabel,'cc-select');filter.dataset.bookFolder='';filter.setAttribute('aria-label','本棚のフォルダ');
        filterLabel.hidden=!!provider;
        const books=node('div',undefined,shelfPanel,'cc-folder-list cc-folder-list--shelf cc-folder-list--shelf-a3 score-book-folders');books.dataset.bookFolders='';books.setAttribute('aria-label','本棚を選択');books.dataset.folderShelfColumns='4';
        const bookNav=node('div',undefined,shelfPanel,'cc-control-row');bookNav.dataset.bookNav='';
        button('← 本棚へ戻る',()=>{memory.folder='';catalogue();},bookNav,{'data-book-back':'',title:'本の一覧へ戻る。譜面は変更しません'});
        const bookName=node('strong','',bookNav);bookName.dataset.bookName='';
        const items=node('div',undefined,shelfPanel,'score-book-grid');items.dataset.bookCodes='';
        function clearSource(){cancelRead();if(update)update.disabled=false;shelfPanel.removeAttribute('aria-busy');memory.catalogue=null;memory.source=null;memory.folder='';catalogue();if(update)update.hidden=false;bookHint.textContent='本棚の接続・内容が変わりました。再試行して選び直してください。';}
        async function loadBook(){
            cancelRead();bookRequest?.cancel();memory.catalogue=null;memory.source=null;catalogue();
            const controller=new AbortController(),epoch=readEpoch,version=session.snapshotVersion;readRequest=controller;
            update.disabled=true;shelfPanel.setAttribute('aria-busy','true');bookHint.textContent='本棚を読み込んでいます…';
            try{
                const result=await readBookSource(provider,{signal:controller.signal,isCurrent:()=>C.localBookSource===provider&&eligible()&&memory.bookOpen&&epoch===readEpoch&&session.snapshotVersion===version});
                memory.sourceProvider=provider;memory.catalogue=result.catalogue;memory.source={generation:result.generation,revision:result.revision};memory.folder='';catalogue();if(revealOnRead){revealOnRead=false;revealBook();}
            }catch{if(current()&&epoch===readEpoch){memory.catalogue=null;memory.source=null;catalogue();update.hidden=false;bookHint.textContent='本棚を読み込めませんでした。接続・編集先を確認し、再試行してください。';}}
            finally{if(current()&&epoch===readEpoch){update.disabled=false;shelfPanel.removeAttribute('aria-busy');readRequest=null;}}
        }
        function chooseChord(chord,withForms=memory.source?true:importForms.checked){
            if(!eligible())return false;
            if(memory.source&&(C.localBookSource!==provider||memory.sourceProvider!==provider||!bookSourceCurrent(provider,memory.source))){clearSource();return false;}
            if(!C.theory.parseBasicChordSymbol(chord.name)){status.textContent='コード名として入力できない名前です。元のマスを保持しています。';return false;}
            let m;
            try{if(withForms){if(!chord.form){status.textContent='名前のみの本棚です。「フォームも取り込み・採用する」を選んで取り込み直してください';return false;}
                const snapshot=JSON.parse(JSON.stringify(chord.form));if(snapshot.capo===null)snapshot.capo=0;if(snapshot.tuningMidi===null)snapshot.tuningMidi=[64,59,55,50,45,40];if(snapshot.maxAbsoluteFret===null)snapshot.maxAbsoluteFret=project.instrument.maxAbsoluteFret??22;snapshot.playability='standard';snapshot.ownerWarning=null;
                m=C.localChordForms.material(snapshot,C.model.schema2.chord(chord.name,project.instrument.capo),'bookshelf',chord.id);
            }
            }catch{status.textContent='フォームの名前・楽器条件を確認してください。元のマスを保持しています。';return false;}
            if(!setChord(chord.name)){status.textContent='この名前はコードとして解釈できません。元のマスを保持しています。';return false;}
            return write(chord.name,m);
        }
        function catalogue(){
            bookDiagrams.forEach(dispose=>dispose());bookDiagrams=[];
            filter.replaceChildren();const all=node('option','すべてのフォルダ',filter);all.value='';
            const folders=memory.catalogue?.folders||[],chords=memory.catalogue?.chords||[];
            if(memory.folder&&!folders.some(f=>f.id===memory.folder))memory.folder='';
            for(const folder of folders){const option=node('option',folder.name,filter);option.value=folder.id;}
            filter.value=memory.folder||'';items.replaceChildren();books.replaceChildren();
            const selected=folders.find(f=>f.id===memory.folder);
            books.hidden=!provider||!!selected;bookNav.hidden=!provider||!selected;items.hidden=!!provider&&!selected;
            bookName.textContent=selected?.name||'';if(update)update.hidden=true;
            bookHint.textContent=provider?(folders.length?'':'本棚を読み込んでいます…'):(chords.length?chords.length+'件。コード図を選ぶと選択中のマスへ入力します。':'この開発版は同期アカウントの本棚に未接続です。予備の取込み方法を利用できます。');
            if(provider&&!selected){
                // Only the owner's book presentation, with no management or Sync UI.
                for(let start=0;start<folders.length;start+=4){
                    const row=node('div',undefined,books,'cc-folder-shelf-row');
                    for(const folder of folders.slice(start,start+4)){
                        const count=chords.filter(c=>c.folderId===folder.id).length;
                        const card=button('',()=>{memory.folder=folder.id;catalogue();},row,{'data-book-folder-open':folder.id,'aria-label':folder.name+'、'+count+'件',title:folder.name});
                        card.className='cc-folder-card cc-folder-card--design-a cc-folder-card--book-a3';
                        node('span',undefined,card,'cc-folder-card-icon');const body=node('span',undefined,card,'cc-folder-card-body'),name=node('span',undefined,body,'cc-folder-card-name');name.setAttribute('aria-hidden','true');
                        for(const character of Array.from(folder.name))node('span',character==='ー'?'':character,name,'cc-spine-char'+(character==='ー'?' cc-spine-char--prolonged':''));
                        const meta=node('span',undefined,body,'cc-folder-card-meta');node('span',count+'件',meta,'cc-folder-card-count');
                    }
                    const board=node('div',undefined,row,'cc-folder-shelf-board');board.setAttribute('aria-hidden','true');
                }
                return;
            }
            let visible=0;
            for(const chord of chords){
                if(memory.folder&&chord.folderId!==memory.folder)continue;
                visible++;const folder=memory.catalogue.folders.find(f=>f.id===chord.folderId);
                const wrapper=node('div',undefined,items,'score-book-chord');
                const card=button('',()=>chooseChord(chord),wrapper,{'data-transfer-chord':chord.id,'aria-label':chord.name+' ／ '+folder.name,title:folder.name+' ／ '+chord.id+(chord.form?'（フォーム付き）':'（名前のみ）')});card.classList.add('score-book-choose');
                button('▶',()=>{if(memory.source&&(C.localBookSource!==provider||!bookSourceCurrent(provider,memory.source))){clearSource();return;}audition(chord.name,chord.form);},wrapper,{'data-chord-audition':chord.id,'aria-label':chord.name+'を試聴',title:'この押さえ方を試聴（譜面へ入力しません）'}).classList.add('score-form-play');
                node('strong',chord.name,card);const preview=node('div',undefined,card,'score-book-diagram');preview.setAttribute('aria-hidden','true');
                const parsed=C.theory.parseBasicChordSymbol(chord.name),root=parsed&&base.theory.parseSpelledNoteName(parsed.root);
                if(chord.form&&root){const snapshot=JSON.parse(JSON.stringify(chord.form));snapshot.capo??=0;snapshot.tuningMidi??=[64,59,55,50,45,40];bookDiagrams.push(drawChordForm(owner.ui.fretboard,preview,snapshot,{rootPc:root.pc},owner.ui.explore));}
                else preview.textContent='コード名のみ';
                if(!provider)node('small',folder.name,card);
            }
            if(chords.length&&!visible)node('p','このフォルダにはコードがありません。',items,'cc-fb-hint');
        }
        filter.addEventListener('change',()=>{memory.folder=filter.value;catalogue();});
        function showBook(){shelf.hidden=!memory.bookOpen;shelfToggle.textContent=memory.bookOpen?'コード本棚を閉じる':'コード本棚を開く';shelfToggle.setAttribute('aria-expanded',String(!!memory.bookOpen));if(!memory.bookOpen){shelfPanel.removeAttribute('aria-busy');if(update)update.disabled=false;}}showBook();
        const fallback=node('details',undefined,legacy);node('summary','JSONファイルから読み込む（予備）',fallback);const label=node('label','JSONファイルを選ぶ',fallback,'cc-btn cc-btn-secondary');const file=node('input',undefined,label);file.type='file';file.accept='.json,application/json';file.dataset.chordNamesImport='';
        file.addEventListener('change',async()=>{const selected=file.files[0],epoch=++importEpoch;if(!selected||!eligible())return;try{if(selected.size>MAX_BYTES)throw Error('JSONファイルが大きすぎます');const text=await selected.text();if(epoch!==importEpoch||!file.isConnected||!eligible())return;const parsed=JSON.parse(text)?.format===FORM_FORMAT?parseChordForms(text):parseChordNames(text);cancelRead();memory.source=null;memory.catalogue=parsed;memory.folder='';memory.bookOpen=true;showBook();catalogue();status.textContent=parsed.chords.length+'件を読み込みました。譜面はまだ変更していません。';}catch(e){if(current())status.textContent=e.message;}finally{if(file.isConnected)file.value='';}});catalogue();
        const help=node('details',undefined,legacy);node('summary','読取り専用ブックマークを登録',help);node('p','従来方式を使う場合だけ、リンクをブックマークバーへ登録し、別タブのコード本棚で実行します。',help,'cc-fb-hint');const link=node('a','本棚から譜面へ（読取り専用）',help,'cc-btn cc-btn-secondary');link.href=source.exportBookmarklet;link.dataset.chordExportBookmarklet='';link.addEventListener('click',e=>{e.preventDefault();status.textContent='このリンクをブックマークバーへ登録し、コードクルーズProの本棚上で使ってください。';});
        shelfPanel.append(legacy);
        const unsubscribeBook=provider?.subscribe?.(()=>{if(current())clearSource();});
        let disposeDiagram=()=>{};
        function refreshDiagram(){
            const chord=owner.ui.explore.readSelectedChord();if(!chord)return;
            const binding=canonical?.symbol===chord.symbol&&project.performance.formBindings.find(b=>b.chordEventId===canonical.id),material=binding&&project.materials.forms.find(m=>m.id===binding.materialId);
            const displayMaterial=material||C.localChordForms?.recommend(project,chord.symbol);const snapshot=displayMaterial?.snapshot;
            formName.textContent=chord.symbol;diagram.setAttribute('aria-label',chord.symbol+'のコードフォーム');
            diagram.dataset.chordDiagramTick=tick;if(material)diagram.dataset.formMaterial=material.id;else delete diagram.dataset.formMaterial;
            disposeDiagram();disposeDiagram=drawChordForm(owner.ui.fretboard,diagram,snapshot,chord,owner.ui.explore,true,displayMaterial?savedRange(displayMaterial,chord):null);
        }
        let pickedShape=false,lastDetailOptions=null,lastDetailHost=null,lastDetailKey='';
        const nativeRender=owner.ui.fretboard.render.bind(owner.ui.fretboard);
        function selectedMaterial(){
            const chord=owner.ui.explore.readSelectedChord();if(!chord)return null;
            const binding=canonical&&project.performance.formBindings.find(b=>b.chordEventId===canonical.id),saved=canonical?.symbol===chord.symbol&&project.materials.forms.find(m=>m.id===binding?.materialId);
            if(!pickedShape&&saved)return saved;
            if(!owner.state.exploreShape)return null;
            return candidateFor(chord,owner.state.exploreShape,owner.state.settings.highFretMode?{minRelativeFret:12,maxRelativeFret:25}:null);
        }
        function savedRange(m,chord){
            const notes=m.snapshot.strings.filter(n=>n.kind==='note'),frets=notes.map(n=>n.relativeFret),includesOpen=frets.includes(0);
            let range={min:frets.length?Math.min(...frets):1,max:frets.length?Math.max(...frets):1,includesOpen};
            const shape=m.provenance.shape,quality=ownerQuality(base.theory,C.theory.parseBasicChordSymbol(chord.symbol)?.quality),g=m.provenance.generation;
            if(shape&&quality){const raw=base.caged.getForm(shape,quality,(chord.rootPc-m.snapshot.capo+12)%12,g.maxRelativeFret,g.minRelativeFret);const actual=JSON.stringify(notes.map(n=>[n.string,n.relativeFret]).sort()),original=raw.available&&JSON.stringify(raw.notes.filter(n=>!n.fingeringWarning).map(n=>[n.string,n.fret]).sort());if(actual===original)range=raw.displayRange||raw.fretRange;}
            const relativeChord={...chord,rootPc:(chord.rootPc-m.snapshot.capo+12)%12,bassPc:chord.bassPc==null?null:(chord.bassPc-m.snapshot.capo+12)%12};
            return owner.ui.saveEditor.readAutomaticSaveRange(relativeChord,{displayRange:range});
        }
        function adoptMaterial(m){
            if(!eligible()||!m)return false;const chord=owner.ui.explore.readSelectedChord();
            const authored=C.localChordForms.material(m.snapshot,chord.symbol,'manual',null,m.provenance.shape);
            if(canonical?.symbol!==chord.symbol)return write(chord.symbol,authored);
            const result=C.localChordForms.adopt(session,bar.id,canonical.id,authored);if(result.ok)target.changed();else status.textContent=formMessage(result);return result.ok;
        }
        function editSlot(string,fret,cycle){
            if(!eligible())return;const m=selectedMaterial();if(!m||!Number.isInteger(fret)||fret<0||fret+m.snapshot.capo>m.snapshot.maxAbsoluteFret)return;
            const edited=JSON.parse(JSON.stringify(m)),old=edited.snapshot.strings[string-1];if(!old)return;
            if(cycle&&old.kind==='note'&&old.relativeFret===fret){const next=owner.ui.saveEditor.cycleStoredNote({fret,finger:old.finger,fingeringWarning:old.fingeringWarning});edited.snapshot.strings[string-1]=next.deleted?{string,kind:'muted'}:{string,kind:'note',relativeFret:fret,finger:next.finger,fingeringWarning:next.fingeringWarning};}
            else edited.snapshot.strings[string-1]={string,kind:'note',relativeFret:fret,finger:fret===0?null:'T',fingeringWarning:false};
            if(!edited.snapshot.strings.some(n=>n.kind==='note')){status.textContent='フォームには少なくとも1音を残してください。元の内容を保持しています。';return;}
            edited.snapshot.barres=base.caged.detectBarres(edited.snapshot.strings.filter(n=>n.kind==='note').map(n=>({string:n.string,fret:n.relativeFret,finger:n.finger}))).map(b=>({finger:b.finger,relativeFret:b.fret,fromString:b.fromString,toString:b.toString}));
            edited.snapshot.playability='unknown';edited.snapshot.ownerWarning='変更した押さえ方は未確認';adoptMaterial(edited);
        }
        owner.ui.fretboard.render=(root,options)=>{
            if(root.id!=='cc-fretboard-host')return nativeRender(root,options);
            root.dataset.scoreFingerMode=String((owner.state.exploreFretboardDisplayMode||owner.state.settings.fretboardDisplayMode||'finger')==='finger');
            lastDetailOptions=options;const m=selectedMaterial(),chord=owner.ui.explore.readSelectedChord();if(!m||!chord){const key=JSON.stringify(['native',options]);if(lastDetailHost===root&&lastDetailKey===key&&root.querySelector('.cc-fb-stage'))return;lastDetailHost=root;lastDetailKey=key;return nativeRender(root,options);}
            const mode=owner.state.exploreFretboardDisplayMode||owner.state.settings.fretboardDisplayMode||'finger';
            const overlays=(options.markers||[]).filter(n=>n.isOverlay&&(n.isTensionCandidate||n.isBassCandidate));
            const key=JSON.stringify([m.snapshot,mode,options.startFret,options.endFret,overlays]);if(lastDetailHost===root&&lastDetailKey===key&&root.querySelector('.cc-fb-stage'))return;
            lastDetailHost=root;lastDetailKey=key;const range=savedRange(m,chord),max=m.snapshot.maxAbsoluteFret-m.snapshot.capo;
            const rendered=formDiagramOptions(m.snapshot,chord,owner.ui.explore,{...options,mode,startFret:Math.min(options.startFret??0,range.min),endFret:Math.min(max,Math.max(options.endFret??13,range.max)),rangeHighlight:{minFret:range.min,maxFret:range.max,includesOpen:range.includesOpen},onSlotTap:(s,f)=>editSlot(s,f,true),onEmptySlotTap:(s,f)=>editSlot(s,f,false)});
            for(const n of overlays)if(!rendered.markers.some(m=>m.string===n.string&&m.fret===n.fret))rendered.markers.push({...n,tappable:mode==='finger',ariaLabel:n.string+'弦 '+n.fret+'フレットの候補を選択'});
            nativeRender(root,rendered);
            if(mode==='finger')for(const mute of root.querySelectorAll('.cc-fb-mute')){const strings=m.snapshot.strings.filter(n=>n.kind==='muted'),at=[...root.querySelectorAll('.cc-fb-mute')].indexOf(mute),string=strings[at]?.string;if(!string)continue;mute.setAttribute('role','button');mute.tabIndex=0;mute.setAttribute('aria-label',string+'弦のミュートを開放弦へ変更');const activate=e=>{e.preventDefault();e.stopPropagation();editSlot(string,0,false);};mute.addEventListener('click',activate);mute.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')activate(e);});}
        };
        function refreshAdoption(){
            if(selectedMaterial())shadow.getElementById('cc-fbmode-finger')?.classList.remove('cc-segment-btn--disabled');
            const root=shadow.getElementById('cc-fretboard-host');if(root&&lastDetailOptions)owner.ui.fretboard.render(root,lastDetailOptions);
        }
        function candidateFor(chord,shape=null,generation=null){
            const symbol=C.model.schema2.chord(chord.symbol,project.instrument.capo);let m=C.localChordForms.recommend(project,symbol,shape,generation);
            if(!m&&chord.source==='custom'&&base.theory.QUALITIES[chord.qualityKey]){
                const core=C.theory.parseBasicChordSymbol(chord.symbol).root+base.theory.QUALITIES[chord.qualityKey].symbolSuffix,candidate=C.localChordForms.recommend(project,C.model.schema2.chord(core,project.instrument.capo),shape,generation);
                if(candidate){const snapshot=JSON.parse(JSON.stringify(candidate.snapshot));snapshot.playability='unknown';snapshot.ownerWarning='任意コードの追加構成音と押さえ方は未確認';m=C.localChordForms.material(snapshot,symbol,'manual',null,candidate.provenance.shape);}
            }return m;
        }
        function chooseRecommended(){
            const chord=owner.ui.explore.readSelectedChord();if(!chord)return;
            const m=candidateFor(chord),mode=m?.provenance.origin==='owner-recommendation'?'auto':'fixed';
            pickedShape=false;owner.state.settings.highFretMode=false;owner.state.exploreShape=m?.provenance.shape||null;owner.state.exploreFretboardDisplayMode=m?'finger':'note';
            // An explicit chord choice replaces the previous fixed binding, in
            // the same Session operation as its name; old materials stay immutable.
            if(m)write(chord.symbol,m,mode);else write(chord.symbol,undefined,'auto');
        }
        function sync(){
            if(!current())return;
            // The source's bookshelf save button has no local capability.
            shadow.getElementById('cc-save-form-btn')?.remove();
            for(const button of shadow.querySelectorAll('.cc-chord-btn')){const chord=base.theory.getDiatonicChords(owner.state.settings.selectedKey,owner.state.settings.scaleType,owner.state.settings.chordToneMode)[Number(button.dataset.index)];if(chord)button.dataset.chordSymbol=chord.symbol;}
            for(const [id,value]of [['cc-tone-3','3'],['cc-tone-7','7']])shadow.getElementById(id)?.setAttribute('data-chord-tones',value);
            shadow.getElementById('cc-custom-chord-btn')?.setAttribute('data-chord-custom','');for(const b of shadow.querySelectorAll('[data-shape]'))b.dataset.chordShape=b.dataset.shape;
            for(const value of ['finger','note','solfege','degree'])shadow.getElementById('cc-fbmode-'+value)?.setAttribute('data-chord-view',value);
            const customRow=shadow.querySelector('.cc-custom-chord-row'),notice=shadow.querySelector('[data-custom-chord-notice]');if(customRow&&notice){if(customRow.nextElementSibling!==notice)customRow.after(notice);notice.hidden=!memory.builderSymbol||memory.builderSymbol!==owner.ui.explore.readSelectedChord()?.symbol;}
            refreshDiagram();refreshAdoption();
        }
        doc.addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();});
        doc.addEventListener('click',e=>{if(!eligible()){e.preventDefault();e.stopImmediatePropagation();return;}if(e.target.closest('#cc-fbmode-finger')&&selectedMaterial()){
            // Imported/manual snapshots need no CAGED shape in order to edit fingers.
            e.preventDefault();e.stopImmediatePropagation();owner.state.exploreFretboardDisplayMode='finger';owner.state.exploreFretboardPresentationInitialized=true;
            for(const mode of ['finger','note','solfege','degree'])shadow.getElementById('cc-fbmode-'+mode)?.classList.toggle('cc-segment-btn--active',mode==='finger');refreshAdoption();
        }},true);
        // These are explicit musical choices, after the owner handlers updated
        // selectedChord. Opening, mounting, scale/key changes never insert a code.
        doc.addEventListener('click',e=>{if(e.target.closest('[data-shape],#cc-high-fret-toggle')){pickedShape=true;const m=selectedMaterial();if(m)adoptMaterial(m);else refreshAdoption();}if(e.target.closest('#cc-custom-chord-btn')){const apply=shadow.getElementById('cc-builder-apply');if(apply)apply.textContent='コード欄に入力';}if(e.target.closest('.cc-chord-btn,.cc-note-chip--link,#cc-builder-apply')){memory.builderSymbol=e.target.closest('#cc-builder-apply')?owner.ui.explore.readSelectedChord()?.symbol:null;chooseRecommended();}});
        doc.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&!e.altKey&&e.key.toLowerCase()==='z'&&!e.target.matches('input,textarea,[contenteditable]')){e.stopPropagation();if(eligible()&&!session.inputPending)C.shellHost.keyboard.localCommand(e,e.shiftKey?'studio.redo':'studio.undo','sheetCruise');e.preventDefault();return;}if(!((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'))e.stopPropagation();});
        doc.addEventListener('compositionstart',()=>{composing=true;host.classList.add('is-composing');session.setInputPending(true);});doc.addEventListener('compositionend',()=>{composing=false;host.classList.remove('is-composing');session.setInputPending(false);});
        // Owner popups remain inside this editor. Neither global IDs nor Shell theme are changed.
        owner.ui.explore.render();
        const diatonic=shadow.getElementById('cc-chord-grid').closest('.cc-card');diatonic.classList.add('score-chord-diatonic');harmony.append(diatonic);basicLayout.append(actions);
        shadow.querySelector('.cc-explore-controls').append(shadow.querySelector('.cc-custom-chord-row'));
        const formHelp=node('details',undefined,shadow.querySelector('.cc-fb-head'),'score-form-help');const helpButton=node('summary','?',formHelp);helpButton.title='指板の編集方法';helpButton.setAttribute('aria-label','指板の編集方法');helpButton.dataset.formHelp='';node('p','運指表示で指をクリックすると指を変更。空いた位置をクリックすると、その弦の位置を変更します。CAGEDを選ぶとフォームを切り替えます。元に戻す／やり直すが使えます。',formHelp);
        shadow.querySelector('.cc-fb-head .cc-card-heading').after(formHelp);
        button('▶',auditionSelected,shadow.querySelector('.cc-fb-head'),{'data-chord-audition':'detail','aria-label':'詳細設定のコードを試聴',title:'表示中の押さえ方をアコギで試聴'}).classList.add('score-detail-play');
        const customNotice=node('p','構成音を表示中です。指板をクリックして押さえ方を決めてください。',shadow.querySelector('.cc-explore-controls'),'score-custom-notice');customNotice.dataset.customChordNotice='';customNotice.hidden=memory.builderSymbol!==canonical?.symbol;
        if(memory.bookOpen&&provider&&!memory.catalogue)loadBook();
        sync();const observer=new MutationObserver(sync);for(const scope of [section,diatonic])observer.observe(scope,{childList:true,subtree:true});
        host._disposeOwnerChord=()=>{disposed=true;importEpoch++;events.abort();unsubscribePreview?.();if(bookScrollRAF!==null)cancelAnimationFrame(bookScrollRAF);cancelRead();unsubscribeBook?.();bookDiagrams.forEach(dispose=>dispose());bookRequest?.cancel();observer.disconnect();viewportObserver.disconnect();disposeDiagram();unsubscribeTheme();if(composing){composing=false;session.setInputPending(false);}host.classList.remove('is-composing');};
        return owner;
    }};
}

const layoutCSS=`
:host{box-sizing:border-box;display:block;padding:18px;border:1px solid var(--cc-border);border-radius:var(--cc-radius-lg);font-family:'Outfit','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;color:var(--cc-text);background-color:var(--cc-bg);}
:host([data-theme]){--cc-bg:var(--studio-panel);--cc-surface:var(--studio-surface);--cc-surface-raised:var(--studio-control);--cc-border:var(--studio-border-default);--cc-border-strong:var(--studio-border-strong);--cc-gold:var(--studio-accent);--cc-gold-bright:var(--studio-accent-bright);--cc-accent-text:var(--studio-accent-text);--cc-champagne:var(--studio-accent-text);--cc-text:var(--studio-text-primary);--cc-text-muted:var(--studio-text-muted);--cc-text-faint:var(--studio-text-secondary);--cc-sheet-top:var(--studio-elevated);--cc-sheet-bottom:var(--studio-surface-deep);--cc-card-top:var(--studio-control);--cc-card-bottom:var(--studio-panel);--cc-danger:var(--studio-danger);--cc-danger-text:var(--studio-danger);--cc-danger-text-soft:var(--studio-danger);--cc-notice-text:var(--studio-warning);color-scheme:var(--studio-color-scheme);}
#cc-screen-explore{container-type:inline-size;}
#cc-explore-content{margin-top:0;display:grid;grid-template-columns:minmax(210px,1fr) minmax(0,2fr);gap:14px;}
#cc-explore-content>.cc-card{margin:0;min-width:0;}
.cc-explore-controls{grid-column:1;grid-row:1;}
.cc-fb-card{grid-column:2;grid-row:1;}
.cc-explore-home-row{display:none!important;}
.score-name-transfer{margin-top:14px;}
.score-book-panel{display:grid;gap:12px;margin-top:14px;}
.score-book-panel[hidden]{display:none;}
.score-name-transfer input[type=file]{display:none;}
.score-name-transfer .cc-chord-grid .cc-btn{min-width:0;overflow-wrap:anywhere;}
@container(max-width:700px){#cc-explore-content{grid-template-columns:minmax(0,1fr);}#cc-explore-content>.cc-card{grid-column:1;grid-row:auto;}}
.score-chord-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start;}
.score-chord-layout>p,.score-chord-layout>.score-chord-actions,.score-chord-layout>.score-name-transfer{grid-column:1/-1;margin:0;}
.score-chord-layout>p:empty{display:none;}
.score-chord-basic{container-type:inline-size;min-width:0;}
.score-chord-basic-layout{display:grid;grid-template-columns:252px minmax(0,1fr);gap:14px;align-items:center;}
.score-chord-selected-form{position:relative;grid-column:1;grid-row:1/3;align-self:start;margin:0;min-width:0;max-width:252px;width:100%;box-sizing:border-box;padding-top:4px;border-radius:6px;background:#fff;}
.score-chord-selected-form figcaption{font-size:26px;font-weight:700;line-height:1.05;text-align:center;color:#111;margin:0;}
.score-chord-diagram{box-sizing:border-box;padding:0 12px 8px;width:100%;overflow:hidden;background:#fff;border-radius:6px;}
.score-chord-diagram .cc-fb-scroll{overflow:visible;}
.score-chord-diatonic{grid-column:2;grid-row:1;margin:0;padding:14px;min-width:0;}
.score-chord-diatonic .cc-diatonic-head{margin-bottom:8px;}
.score-chord-harmony{grid-column:2;grid-row:1;display:flex;flex-direction:column;gap:8px;min-width:0;}
.score-chord-harmony>[data-chord-progression]{align-self:flex-start;min-height:32px;padding:6px 12px;font-size:13px;}
.score-chord-actions{grid-column:2;grid-row:2;align-self:start;display:flex;flex-wrap:wrap;gap:10px;margin-top:0;}
.score-chord-actions button{min-height:36px;padding:8px 14px;font-size:14px;border-radius:8px;}
.score-chord-actions [data-chord-advanced]{margin-left:auto;}
:host(:not(.score-chord-advanced)) :is(#cc-screen-explore,.cc-custom-chord-row){display:none;}
:host(.score-chord-advanced) #cc-screen-explore{grid-column:1/-1;}
#cc-save-btn-row{display:none!important;}
.score-chord-diatonic #cc-chord-grid{grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;}
.score-chord-diatonic{overflow:auto;}
.score-chord-diatonic .cc-chord-btn{padding:7px 3px;border-radius:9px;}
.score-chord-diatonic .cc-chord-btn-symbol{font-size:clamp(10px,1.6cqi,14px);white-space:nowrap;}
.score-chord-diatonic .cc-chord-btn-roman{font-size:10px;}
.score-chord-diatonic .cc-card-heading{font-size:13px;}
.score-chord-diatonic .cc-segment-btn{font-size:12px;padding:7px 12px;}
.score-form-help{position:relative;margin-left:8px;margin-right:auto;}
.score-form-help summary{list-style:none;display:grid;place-items:center;width:28px;height:28px;border:1px solid var(--cc-border-strong);border-radius:50%;cursor:pointer;}
.score-form-help p{position:absolute;z-index:2;left:0;top:32px;width:min(280px,60vw);padding:12px;border:1px solid var(--cc-border);border-radius:10px;background:var(--cc-surface-raised);font-size:13px;line-height:1.7;box-shadow:0 5px 20px #0004;}
.score-name-transfer{grid-column:1/-1;margin:0;padding:16px;min-width:0;}
.score-name-transfer[hidden]{display:none;}
.score-name-transfer label{line-height:1.7;}
.score-book-panel{display:grid;gap:14px;min-width:0;}
.score-book-panel>.cc-fb-hint,.score-book-panel>.cc-control-row{margin:0;}
.score-book-panel>.cc-fb-hint:empty{display:none;}
.score-book-panel :is([data-book-folders],[data-book-nav],[data-book-codes],[data-book-refresh],label)[hidden]{display:none;}
.score-book-folders{max-width:480px;margin:0;}
.score-book-folders .cc-folder-shelf-row{grid-template-columns:repeat(auto-fill,minmax(90px,110px));grid-template-rows:none;gap:8px;}
.score-book-folders .cc-folder-card{height:190px;}
.score-book-folders .cc-folder-card--design-a .cc-folder-card-name{font-size:17px;}
.score-book-folders .cc-folder-card:focus-visible{outline:3px solid var(--cc-gold);outline-offset:3px;}
.score-book-source{font-size:13px;color:var(--cc-ink);}
.score-book-panel>details{font-size:12px;}
.score-book-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px;align-items:start;}
.score-book-chord{position:relative;min-width:0;border:1px solid var(--cc-border-strong);border-radius:12px;padding-bottom:34px;overflow:hidden;}
.score-book-choose.cc-btn{display:flex;flex-direction:column;gap:8px;width:100%;min-width:0;padding:12px;border:0;border-radius:0;background:transparent;text-align:center;white-space:normal;}
.score-form-play.cc-btn{position:absolute;left:6px;bottom:4px;padding:4px 7px;min-width:28px;min-height:26px;font-size:13px;line-height:1;border-radius:6px;background:#fff;color:#304755;border-color:#8998a4;}
.score-custom-notice{font-size:13px;line-height:1.6;color:var(--cc-danger-text);margin:8px 0 0;}
.score-custom-notice[hidden]{display:none;}
:is(.score-chord-diagram,.score-book-diagram,#cc-fretboard-host[data-score-finger-mode=true]) .cc-fb-marker{--cc-fb-marker-label-size:18px;}
:is(.score-chord-diagram,.score-book-diagram,#cc-fretboard-host) .cc-fb-fret-number{font-size:19px;transform:translateY(5px);}
:is(.score-chord-diagram,.score-book-diagram,#cc-fretboard-host) svg{overflow:visible;}
#cc-fretboard-host .cc-fb-stage{margin-bottom:8px;}
.score-book-chord:focus-visible{outline:3px solid var(--cc-accent);outline-offset:3px;}
.score-book-chord strong{font-size:18px;}
.score-book-chord small{font-size:11px;font-weight:400;}
.score-book-diagram{padding:0 4px 8px;width:100%;box-sizing:border-box;overflow:hidden;background:#fff;border-radius:6px;color:#111;}
.score-book-diagram .cc-fb-scroll{overflow:visible;}
.score-book-diagram .cc-fb-stage{pointer-events:none;}
.score-book-diagram .cc-fb-stage button{pointer-events:none;}

@container(max-width:680px){.score-chord-basic-layout{grid-template-columns:minmax(0,1fr);}.score-chord-selected-form{grid-row:1;grid-column:1;width:252px;justify-self:center;}.score-chord-harmony{grid-column:1;grid-row:2;}.score-chord-diatonic{grid-column:1;grid-row:2;}.score-chord-actions{grid-column:1;grid-row:3;margin-top:0;}}
`;
