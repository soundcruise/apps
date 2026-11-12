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
        if(memory.identity!==identity){memory.identity=identity;if(canonical)setChord(canonical.symbol);else{owner.state.exploreCustomChord=null;owner.state.exploreSelectedChordIndex=0;}}
        body.className='score-chord-layout';
        const basic=node('section',undefined,body,'score-chord-basic');
        basic.setAttribute('aria-label','選択中のコードフォームとダイアトニック');
        const basicLayout=node('div',undefined,basic,'score-chord-basic-layout');
        const formView=node('figure',undefined,basicLayout,'score-chord-selected-form');
        const formName=node('figcaption','',formView),diagram=node('div',undefined,formView,'score-chord-diagram');
        const actions=node('div',undefined,body,'cc-control-row score-chord-actions');
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
        const shelf=node('section',undefined,body,'cc-card score-name-transfer');
        const shelfToggle=button('コード本棚を開く',()=>{memory.bookOpen=!memory.bookOpen;showBook();if(!memory.bookOpen)bookRequest?.cancel();},shelf,{'data-book-open':'','aria-expanded':false,title:'取り込んだ本棚から、この画面でコードとフォームを選択'});
        const shelfPanel=node('div',undefined,shelf,'score-book-panel');shelfPanel.dataset.bookPanel='';
        const bookHint=node('p','本棚のコピーはこの画面のメモリ内だけで保持します。コードを選ぶと、選択中のマスへ入力します。',shelfPanel,'cc-fb-hint');
        const importOption=node('label',undefined,shelfPanel);const importForms=node('input',undefined,importOption);importForms.type='checkbox';importForms.dataset.importForms='';importForms.checked=!!memory.withForms;importOption.append(' フォームも取り込み・採用する（カポ0・標準6弦と押さえ方を確認）');
        const tools=node('div',undefined,shelfPanel,'cc-control-row');let bookRequest=null;
        button('本棚を取り込む／更新',()=>{bookRequest?.cancel();const forms=importForms.checked;bookRequest=openBookPicker({catalogue:true,isCurrent:()=>eligible()&&memory.bookOpen&&importForms.checked===forms,onSelect:payload=>{if(!eligible())return false;memory.catalogue=payload;memory.folder='';catalogue();return true;},onStatus:message=>{if(current())status.textContent=message;},withForms:forms});},tools,{'data-book-import':'',title:'初回の読取りだけPro別タブで行い、この画面へコピーする'});
        importForms.addEventListener('change',()=>{memory.withForms=importForms.checked;bookRequest?.cancel();bookRequest=null;});
        const filterLabel=node('label','フォルダ ',shelfPanel),filter=node('select',undefined,filterLabel,'cc-select');filter.dataset.bookFolder='';filter.setAttribute('aria-label','取り込んだ本棚のフォルダ');
        const items=node('div',undefined,shelfPanel,'cc-chord-grid');
        function chooseChord(chord,withForms=importForms.checked){if(!eligible())return false;if(!setChord(chord.name)){status.textContent='この名前はコードとして解釈できません。元のマスを保持しています。';return false;}let m;if(withForms){if(!chord.form){status.textContent='名前のみの本棚です。「フォームも取り込み・採用する」を選んで取り込み直してください';return false;}const snapshot=JSON.parse(JSON.stringify(chord.form));if(snapshot.capo===null)snapshot.capo=0;if(snapshot.tuningMidi===null)snapshot.tuningMidi=[64,59,55,50,45,40];if(snapshot.maxAbsoluteFret===null)snapshot.maxAbsoluteFret=project.instrument.maxAbsoluteFret??22;snapshot.playability='standard';snapshot.ownerWarning=null;m=C.localChordForms.material(snapshot,C.model.schema2.chord(chord.name,project.instrument.capo),'bookshelf',chord.id);}return write(chord.name,m);}
        function catalogue(){filter.replaceChildren();const all=node('option','すべてのフォルダ',filter);all.value='';for(const folder of memory.catalogue?.folders||[]){const option=node('option',folder.name,filter);option.value=folder.id;}filter.value=memory.folder||'';items.replaceChildren();const chords=memory.catalogue?.chords||[];bookHint.textContent=chords.length?chords.length+'件の本棚から選択。元の本棚は変更しません。コピーは再読込で消えます。':'最初に本棚を取り込んでください。以後はこの画面でコードを選べます。';for(const chord of chords){if(memory.folder&&chord.folderId!==memory.folder)continue;const folder=memory.catalogue.folders.find(f=>f.id===chord.folderId);button(chord.name,()=>chooseChord(chord),items,{'data-transfer-chord':chord.id,'aria-label':chord.name+' ／ '+folder.name,title:folder.name+' ／ '+chord.id+(chord.form?'（フォーム付き）':'（名前のみ）')});}}
        filter.addEventListener('change',()=>{memory.folder=filter.value;catalogue();});
        function showBook(){shelfPanel.hidden=!memory.bookOpen;shelfToggle.textContent=memory.bookOpen?'コード本棚を閉じる':'コード本棚を開く';shelfToggle.setAttribute('aria-expanded',String(!!memory.bookOpen));}showBook();
        const fallback=node('details',undefined,shelfPanel);node('summary','JSONファイルから読み込む（予備）',fallback);const label=node('label','JSONファイルを選ぶ',fallback,'cc-btn cc-btn-secondary');const file=node('input',undefined,label);file.type='file';file.accept='.json,application/json';file.dataset.chordNamesImport='';
        file.addEventListener('change',async()=>{const selected=file.files[0],epoch=++importEpoch;if(!selected||!eligible())return;try{if(selected.size>MAX_BYTES)throw Error('JSONファイルが大きすぎます');const text=await selected.text();if(epoch!==importEpoch||!file.isConnected||!eligible())return;const parsed=JSON.parse(text)?.format===FORM_FORMAT?parseChordForms(text):parseChordNames(text);memory.catalogue=parsed;memory.folder='';memory.bookOpen=true;showBook();catalogue();status.textContent=parsed.chords.length+'件を読み込みました。譜面はまだ変更していません。';}catch(e){if(current())status.textContent=e.message;}finally{if(file.isConnected)file.value='';}});catalogue();
        const help=node('details',undefined,shelfPanel);node('summary','読取り専用ブックマークを登録',help);node('p','リンクをブックマークバーへドラッグして登録してください。初回だけ「本棚を取り込む／更新」からProを通常認証し、本棚でブックマークを実行します。選んだ本棚のコピーをこの画面に受け渡します。元の本棚への書込みはありません。',help,'cc-fb-hint');const link=node('a','本棚から譜面へ（読取り専用）',help,'cc-btn cc-btn-secondary');link.href=source.exportBookmarklet;link.dataset.chordExportBookmarklet='';link.addEventListener('click',e=>{e.preventDefault();status.textContent='このリンクをブックマークバーへ登録し、コードクルーズProの本棚上で使ってください。';});
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
            return C.localChordForms.recommend(project,chord.symbol,owner.state.exploreShape,owner.state.settings.highFretMode?{minRelativeFret:12,maxRelativeFret:25}:null);
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
            lastDetailOptions=options;const m=selectedMaterial(),chord=owner.ui.explore.readSelectedChord();if(!m||!chord){const key=JSON.stringify(['native',options]);if(lastDetailHost===root&&lastDetailKey===key&&root.querySelector('.cc-fb-stage'))return;lastDetailHost=root;lastDetailKey=key;return nativeRender(root,options);}
            const mode=owner.state.exploreFretboardDisplayMode||owner.state.settings.fretboardDisplayMode||'finger';
            const key=JSON.stringify([m.snapshot,mode,options.startFret,options.endFret]);if(lastDetailHost===root&&lastDetailKey===key&&root.querySelector('.cc-fb-stage'))return;
            lastDetailHost=root;lastDetailKey=key;const range=savedRange(m,chord),max=m.snapshot.maxAbsoluteFret-m.snapshot.capo;
            nativeRender(root,formDiagramOptions(m.snapshot,chord,owner.ui.explore,{...options,mode,startFret:Math.min(options.startFret??0,range.min),endFret:Math.min(max,Math.max(options.endFret??13,range.max)),rangeHighlight:{minFret:range.min,maxFret:range.max,includesOpen:range.includesOpen},onSlotTap:(s,f)=>editSlot(s,f,true),onEmptySlotTap:(s,f)=>editSlot(s,f,false)}));
            if(mode==='finger')for(const mute of root.querySelectorAll('.cc-fb-mute')){const strings=m.snapshot.strings.filter(n=>n.kind==='muted'),at=[...root.querySelectorAll('.cc-fb-mute')].indexOf(mute),string=strings[at]?.string;if(!string)continue;mute.setAttribute('role','button');mute.tabIndex=0;mute.setAttribute('aria-label',string+'弦のミュートを開放弦へ変更');const activate=e=>{e.preventDefault();e.stopPropagation();editSlot(string,0,false);};mute.addEventListener('click',activate);mute.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')activate(e);});}
        };
        function refreshAdoption(){
            if(selectedMaterial())shadow.getElementById('cc-fbmode-finger')?.classList.remove('cc-segment-btn--disabled');
            const root=shadow.getElementById('cc-fretboard-host');if(root&&lastDetailOptions)owner.ui.fretboard.render(root,lastDetailOptions);
        }
        function chooseRecommended(){
            const chord=owner.ui.explore.readSelectedChord();if(!chord)return;
            const symbol=C.model.schema2.chord(chord.symbol,project.instrument.capo);let m=C.localChordForms.recommend(project,symbol),mode='auto';
            if(!m&&chord.source==='custom'&&base.theory.QUALITIES[chord.qualityKey]){
                // The owner supplies the core CAGED candidate for tensions too.
                // Preserve it as an unconfirmed manual form, never a verified recommendation.
                const core=C.theory.parseBasicChordSymbol(chord.symbol).root+base.theory.QUALITIES[chord.qualityKey].symbolSuffix,candidate=C.localChordForms.recommend(project,C.model.schema2.chord(core,project.instrument.capo));
                if(candidate){const snapshot=JSON.parse(JSON.stringify(candidate.snapshot));snapshot.playability='unknown';snapshot.ownerWarning='任意コードの追加構成音と押さえ方は未確認';m=C.localChordForms.material(snapshot,symbol,'manual',null,candidate.provenance.shape);mode='fixed';}
            }
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
        doc.addEventListener('click',e=>{if(e.target.closest('[data-shape],#cc-high-fret-toggle')){pickedShape=true;const m=selectedMaterial();if(m)adoptMaterial(m);else refreshAdoption();}if(e.target.closest('#cc-custom-chord-btn')){const apply=shadow.getElementById('cc-builder-apply');if(apply)apply.textContent='コード欄に入力';}if(e.target.closest('.cc-chord-btn,.cc-note-chip--link,#cc-builder-apply')){chooseRecommended();}});
        doc.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&!e.altKey&&e.key.toLowerCase()==='z'&&!e.target.matches('input,textarea,[contenteditable]')){e.stopPropagation();if(eligible()&&!session.inputPending)C.shellHost.keyboard.localCommand(e,e.shiftKey?'studio.redo':'studio.undo','sheetCruise');e.preventDefault();return;}if(!((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'))e.stopPropagation();});
        doc.addEventListener('compositionstart',()=>{composing=true;host.classList.add('is-composing');session.setInputPending(true);});doc.addEventListener('compositionend',()=>{composing=false;host.classList.remove('is-composing');session.setInputPending(false);});
        // Owner popups remain inside this editor. Neither global IDs nor Shell theme are changed.
        owner.ui.explore.render();
        const diatonic=shadow.getElementById('cc-chord-grid').closest('.cc-card');diatonic.classList.add('score-chord-diatonic');basicLayout.append(diatonic);
        shadow.querySelector('.cc-explore-controls').append(shadow.querySelector('.cc-custom-chord-row'));
        const formHelp=node('details',undefined,shadow.querySelector('.cc-fb-head'),'score-form-help');const helpButton=node('summary','?',formHelp);helpButton.title='指板の編集方法';helpButton.setAttribute('aria-label','指板の編集方法');helpButton.dataset.formHelp='';node('p','運指表示で指をクリックすると指を変更。空いた位置をクリックすると、その弦の位置を変更します。CAGEDを選ぶとフォームを切り替えます。元に戻す／やり直すが使えます。',formHelp);
        shadow.querySelector('.cc-fb-head .cc-card-heading').after(formHelp);
        sync();const observer=new MutationObserver(sync);for(const scope of [section,diatonic])observer.observe(scope,{childList:true,subtree:true});
        host._disposeOwnerChord=()=>{disposed=true;importEpoch++;events.abort();bookRequest?.cancel();observer.disconnect();viewportObserver.disconnect();disposeDiagram();unsubscribeTheme();if(composing){composing=false;session.setInputPending(false);}host.classList.remove('is-composing');};
        return owner;
    }};
}

const layoutCSS=`
:host{box-sizing:border-box;display:block;padding:18px;border:1px solid var(--cc-border);border-radius:var(--cc-radius-lg);font-family:'Outfit','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;color:var(--cc-text);background-color:var(--cc-bg);}
:host([data-theme]){--cc-bg:var(--studio-panel);--cc-surface:var(--studio-surface);--cc-surface-raised:var(--studio-control);--cc-border:var(--studio-border-default);--cc-border-strong:var(--studio-border-strong);--cc-gold:var(--studio-accent);--cc-gold-bright:var(--studio-accent-bright);--cc-accent-text:var(--studio-accent-text);--cc-champagne:var(--studio-accent-text);--cc-text:var(--studio-text-primary);--cc-text-muted:var(--studio-text-muted);--cc-text-faint:var(--studio-text-secondary);--cc-sheet-top:var(--studio-elevated);--cc-sheet-bottom:var(--studio-surface-deep);--cc-card-top:var(--studio-control);--cc-card-bottom:var(--studio-panel);--cc-danger:var(--studio-danger);--cc-danger-text:var(--studio-danger);--cc-danger-text-soft:var(--studio-danger);--cc-notice-text:var(--studio-warning);color-scheme:var(--studio-color-scheme);}
#cc-screen-explore{container-type:inline-size;}
#cc-explore-content{display:grid;grid-template-columns:minmax(210px,1fr) minmax(0,2fr);gap:14px;}
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
.score-chord-selected-form{margin:0;min-width:0;max-width:252px;width:100%;box-sizing:border-box;padding-top:12px;border-radius:6px;background:#fff;}
.score-chord-selected-form figcaption{font-size:18px;font-weight:700;text-align:center;color:#111;margin:0 0 8px;}
.score-chord-diagram{box-sizing:border-box;padding:12px 16px;width:100%;overflow:hidden;background:#fff;border-radius:6px;}
.score-chord-diagram .cc-fb-scroll{overflow:hidden;}
.score-chord-diatonic{margin:0;padding:14px;min-width:0;}
.score-chord-diatonic .cc-diatonic-head{margin-bottom:8px;}
.score-chord-actions{display:flex;flex-wrap:wrap;gap:10px;}
.score-chord-actions button{min-height:36px;padding:8px 14px;font-size:14px;border-radius:8px;}
.score-chord-actions [data-chord-advanced]{margin-left:auto;}
:host(:not(.score-chord-advanced)) :is(#cc-screen-explore,.cc-custom-chord-row,.score-name-transfer){display:none;}
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
.score-name-transfer label{line-height:1.7;}
@container(max-width:680px){.score-chord-basic-layout{grid-template-columns:minmax(0,1fr);}.score-chord-selected-form{width:252px;justify-self:center;}}
`;
