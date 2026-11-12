import {parseChordNames,MAX_BYTES} from './chord-name-transfer.mjs';
import {parseChordForms,FORM_FORMAT} from './chord-form-transfer.mjs';
import {ownerQuality} from '../chord/form-snapshot.mjs?v=0.88.1';
import {formMessage} from '../chord/form-panel.mjs?v=0.88.1';
import {drawChordForm} from './chord-form-diagram.mjs';

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
            if(!root||!quality)return false;
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
        function write(name,formMaterial){
            if(!eligible())return false;
            if(!C.theory.parseBasicChordSymbol(name)){status.textContent='コード名として入力できない名前です。元のマスを保持しています。';return false;}
            session.finishTextGroup();const ok=target.write(name,formMaterial);session.finishTextGroup();if(!ok)status.textContent='入力対象・コード表記・保存状態を確認してください。';return ok;
        }
        const shelf=node('section',undefined,body,'cc-card score-name-transfer');node('h3','コード本棚から入力',shelf,'cc-card-heading');
        const tools=node('div',undefined,shelf,'cc-control-row');const label=node('label','本棚JSONを読み込む',tools,'cc-btn cc-btn-secondary');const file=node('input',undefined,label);file.type='file';file.accept='.json,application/json';file.dataset.chordNamesImport='';
        const importOption=node('label',undefined,shelf);const importForms=node('input',undefined,importOption);importForms.type='checkbox';importForms.dataset.importForms='';importOption.append(' フォームも固定して取り込む（元フォームはカポ0・標準6弦として、Projectの楽器条件と押さえ方を確認）');node('p','読み込んだだけでは譜面を変更しません。選択で入力します。',shelf,'cc-fb-hint');const items=node('div',undefined,shelf,'cc-chord-grid');
        function catalogue(){items.replaceChildren();for(const chord of memory.catalogue?.chords||[]){const folder=memory.catalogue.folders.find(f=>f.id===chord.folderId);button(chord.name,()=>{if(!setChord(chord.name)){status.textContent='この名前はコードとして解釈できません。元のマスを保持しています。';return;}let m;if(importForms.checked){if(!chord.form){status.textContent='名前のみのJSONです。フォーム付きJSONを読み込んでください';return;}const snapshot=JSON.parse(JSON.stringify(chord.form));if(snapshot.capo===null)snapshot.capo=0;if(snapshot.tuningMidi===null)snapshot.tuningMidi=[64,59,55,50,45,40];if(snapshot.maxAbsoluteFret===null)snapshot.maxAbsoluteFret=project.instrument.maxAbsoluteFret??22;snapshot.playability='standard';snapshot.ownerWarning=null;m=C.localChordForms.material(snapshot,C.model.schema2.chord(chord.name,project.instrument.capo),'bookshelf',chord.id);}write(chord.name,m);},items,{'data-transfer-chord':chord.id,'aria-label':chord.name+' ／ '+folder.name,title:folder.name+' ／ '+chord.id});}}
        file.addEventListener('change',async()=>{const selected=file.files[0],epoch=++importEpoch;if(!selected||!eligible())return;try{if(selected.size>MAX_BYTES)throw Error('JSONファイルが大きすぎます');const text=await selected.text();if(epoch!==importEpoch||!file.isConnected||!eligible())return;const parsed=JSON.parse(text)?.format===FORM_FORMAT?parseChordForms(text):parseChordNames(text);memory.catalogue=parsed;catalogue();status.textContent=parsed.chords.length+'件を読み込みました。譜面はまだ変更していません。';}catch(e){if(current())status.textContent=e.message;}finally{if(file.isConnected)file.value='';}});catalogue();
        const help=node('details',undefined,shelf);node('summary','本棚からJSONを書き出す',help);node('p','下のボタンをブックマークバーへドラッグして登録し、通常のコードクルーズProで本棚を開いてから、そのブックマークを押してください。選んだコード名だけをファイルへ書き出します。本棚への書込みや外部通信はありません。',help,'cc-fb-hint');const link=node('a','本棚のコード名をJSON書出し',help,'cc-btn cc-btn-secondary');link.href=source.exportBookmarklet;link.dataset.chordExportBookmarklet='';link.addEventListener('click',e=>{e.preventDefault();status.textContent='このリンクをブックマークバーへ登録し、コードクルーズProの本棚上で使ってください。';});
        const formArea=node('section',undefined,body,'cc-card score-chord-adoption');formArea.setAttribute('aria-label','譜面へのフォーム採用');const formStatus=node('p','',formArea,'cc-fb-hint');
        let disposeDiagram=()=>{};
        function refreshDiagram(){
            const chord=owner.ui.explore.readSelectedChord();if(!chord)return;
            const binding=canonical?.symbol===chord.symbol&&project.performance.formBindings.find(b=>b.chordEventId===canonical.id),material=binding&&project.materials.forms.find(m=>m.id===binding.materialId);
            let snapshot=material?.snapshot;
            if(!snapshot)snapshot=C.localChordForms?.recommend(project,chord.symbol)?.snapshot;
            formName.textContent=chord.symbol;diagram.setAttribute('aria-label',chord.symbol+'のコードフォーム');
            diagram.dataset.chordDiagramTick=tick;if(material)diagram.dataset.formMaterial=material.id;else delete diagram.dataset.formMaterial;
            disposeDiagram();disposeDiagram=drawChordForm(owner.ui.fretboard,diagram,snapshot,chord,owner.ui.explore);
        }
        let editingSnapshot=null,disposeManual=()=>{},pickedShape=false;
        const manual=node('div',undefined,formArea,'score-form-manual');
        function openManual(){
            const chord=owner.ui.explore.readSelectedChord();if(!canonical||canonical.symbol!==chord?.symbol){formStatus.textContent='先にコードを選んでください';return;}
            const selected=C.localChordForms.recommend(project,chord.symbol,owner.state.exploreShape||null,owner.state.settings.highFretMode?{minRelativeFret:12,maxRelativeFret:25}:null),binding=project.performance.formBindings.find(b=>b.chordEventId===canonical.id),saved=project.materials.forms.find(m=>m.id===binding?.materialId);
            const m=pickedShape?selected:saved||selected;editingSnapshot=m?JSON.parse(JSON.stringify(m.snapshot)):{capo:project.instrument.capo,tuningMidi:(project.instrument.tuning||[64,59,55,50,45,40]).slice(),maxAbsoluteFret:project.instrument.maxAbsoluteFret??22,strings:[1,2,3,4,5,6].map(string=>({string,kind:'muted'})),barres:[],playability:'unknown',ownerWarning:null};editingSnapshot.playability='unknown';editingSnapshot.ownerWarning='手動フォームの押さえ方は未確認';paintManual();
        }
        function paintManual(){
            disposeManual();manual.replaceChildren();const chord=owner.ui.explore.readSelectedChord();
            const preview=node('div',undefined,manual,'score-manual-preview');disposeManual=drawChordForm(owner.ui.fretboard,preview,editingSnapshot,chord,owner.ui.explore,false);
            const row=node('div',undefined,manual,'score-form-strings');
            for(const n of editingSnapshot.strings){const label=node('label',n.string+'弦',row),fret=node('select',undefined,label);fret.dataset.formFret=n.string;fret.setAttribute('aria-label',n.string+'弦のフレット');for(const value of ['x',...Array.from({length:editingSnapshot.maxAbsoluteFret-editingSnapshot.capo+1},(_,i)=>i)]){const o=node('option',value==='x'?'×':String(value),fret);o.value=value;}fret.value=n.kind==='note'?n.relativeFret:'x';const finger=node('select',undefined,label);finger.dataset.formFinger=n.string;finger.setAttribute('aria-label',n.string+'弦の指');for(const value of ['',1,2,3,4,'T']){const o=node('option',value===''?'—':owner.ui.explore.readFingerLabel(value),finger);o.value=value;}finger.value=n.kind==='note'?(n.finger??''):'';
                function change(){const value=fret.value,selected=finger.value;editingSnapshot.strings[n.string-1]=value==='x'?{string:n.string,kind:'muted'}:{string:n.string,kind:'note',relativeFret:Number(value),finger:selected==='T'?'T':selected?Number(selected):null,fingeringWarning:false};editingSnapshot.barres=base.caged.detectBarres(editingSnapshot.strings.filter(n=>n.kind==='note').map(n=>({string:n.string,fret:n.relativeFret,finger:n.finger}))).map(b=>({finger:b.finger,relativeFret:b.fret,fromString:b.fromString,toString:b.toString}));paintManual();}
                fret.addEventListener('change',change);finger.addEventListener('change',change);
            }
            const l=node('label',undefined,manual),confirmed=node('input',undefined,l);confirmed.type='checkbox';confirmed.dataset.formHumanConfirmed='';l.append(' この押さえ方を確認（構成音の不足・不一致は別途検証します）');
            button('フォームを固定して反映',()=>{const snapshot=JSON.parse(JSON.stringify(editingSnapshot));if(confirmed.checked){snapshot.playability='standard';snapshot.ownerWarning=null;}const m=C.localChordForms.material(snapshot,canonical.symbol,'manual'),r=C.localChordForms.adopt(session,bar.id,canonical.id,m);if(r.ok)target.changed();else formStatus.textContent=formMessage(r);},manual,{'data-form-fixed':''});
            node('p','編集中はプレビューです。固定して反映すると1回のUndoで戻せます。',manual,'cc-fb-hint');
        }
        function refreshAdoption(){
            if(editingSnapshot)return;
            formArea.querySelectorAll(':scope>button').forEach(n=>n.remove());
            const binding=canonical&&project.performance.formBindings.find(b=>b.chordEventId===canonical.id);
            if(binding){const r=C.localChordForms.evaluate(project,binding);formStatus.textContent=(binding.mode==='auto'?'自動フォーム':'固定フォーム')+(r.ready?'':'・要確認：'+formMessage(r.reasons));}else formStatus.textContent='フォームは未確定です。必要な押さえ方を編集できます。';
            button('フォームを編集',openManual,formArea,{'data-form-edit':''});
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
        doc.addEventListener('click',e=>{if(!eligible()){e.preventDefault();e.stopImmediatePropagation();}},true);
        // These are explicit musical choices, after the owner handlers updated
        // selectedChord. Opening, mounting, scale/key changes never insert a code.
        doc.addEventListener('click',e=>{if(e.target.closest('[data-shape]'))pickedShape=true;if(e.target.closest('#cc-custom-chord-btn')){const apply=shadow.getElementById('cc-builder-apply');if(apply)apply.textContent='コード欄に入力';}if(e.target.closest('.cc-chord-btn,.cc-note-chip--link,#cc-builder-apply')){const chord=owner.ui.explore.readSelectedChord();if(chord)write(chord.symbol);}});
        doc.addEventListener('keydown',e=>{if(!((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'))e.stopPropagation();});
        doc.addEventListener('compositionstart',()=>{composing=true;host.classList.add('is-composing');session.setInputPending(true);});doc.addEventListener('compositionend',()=>{composing=false;host.classList.remove('is-composing');session.setInputPending(false);});
        // Owner popups remain inside this editor. Neither global IDs nor Shell theme are changed.
        owner.ui.explore.render();
        const diatonic=shadow.getElementById('cc-chord-grid').closest('.cc-card');diatonic.classList.add('score-chord-diatonic');basicLayout.append(diatonic);
        shadow.querySelector('.cc-explore-controls').append(shadow.querySelector('.cc-custom-chord-row'));
        sync();const observer=new MutationObserver(sync);for(const scope of [section,diatonic])observer.observe(scope,{childList:true,subtree:true});
        host._disposeOwnerChord=()=>{disposed=true;importEpoch++;events.abort();observer.disconnect();viewportObserver.disconnect();disposeDiagram();disposeManual();unsubscribeTheme();if(composing){composing=false;session.setInputPending(false);}host.classList.remove('is-composing');};
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
.score-name-transfer input[type=file]{display:none;}
.score-name-transfer .cc-chord-grid .cc-btn{min-width:0;overflow-wrap:anywhere;}
@container(max-width:700px){#cc-explore-content{grid-template-columns:minmax(0,1fr);}#cc-explore-content>.cc-card{grid-column:1;grid-row:auto;}}
.score-chord-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start;}
.score-chord-layout>p,.score-chord-layout>.score-chord-actions,.score-chord-layout>.score-name-transfer,.score-chord-layout>.score-chord-adoption{grid-column:1/-1;margin:0;}
.score-chord-layout>p:empty{display:none;}
.score-chord-basic{container-type:inline-size;min-width:0;}
.score-chord-basic-layout{display:grid;grid-template-columns:160px minmax(0,1fr);gap:20px;align-items:center;}
.score-chord-selected-form{margin:0;min-width:0;}
.score-chord-selected-form figcaption{font-size:18px;font-weight:700;text-align:center;color:var(--cc-accent-text);margin-bottom:8px;}
.score-chord-diagram{width:100%;overflow:hidden;background:#fff;border-radius:6px;}
.score-chord-diagram .cc-fb-scroll{overflow:hidden;}
.score-chord-diatonic{margin:0;padding:14px;min-width:0;}
.score-chord-diatonic .cc-diatonic-head{margin-bottom:8px;}
.score-chord-actions{display:flex;flex-wrap:wrap;gap:10px;}
.score-chord-actions button{min-height:36px;padding:8px 14px;font-size:14px;border-radius:8px;}
.score-chord-actions [data-chord-advanced]{margin-left:auto;}
:host(:not(.score-chord-advanced)) :is(#cc-screen-explore,.cc-custom-chord-row,.score-name-transfer,.score-chord-adoption){display:none;}
:host(.score-chord-advanced) #cc-screen-explore{grid-column:1/-1;}
#cc-save-btn-row{display:none!important;}
.score-chord-diatonic #cc-chord-grid{grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;}
.score-chord-diatonic{overflow:auto;}
.score-chord-diatonic .cc-chord-btn{padding:7px 3px;border-radius:9px;}
.score-chord-diatonic .cc-chord-btn-symbol{font-size:clamp(10px,1.6cqi,14px);white-space:nowrap;}
.score-chord-diatonic .cc-chord-btn-roman{font-size:10px;}
.score-chord-diatonic .cc-card-heading{font-size:13px;}
.score-chord-diatonic .cc-segment-btn{font-size:12px;padding:7px 12px;}
.score-form-strings{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:12px 0;}
.score-form-strings label{display:grid;gap:5px;min-width:0;}
.score-form-strings select{width:100%;min-width:0;padding:6px;font:inherit;font-size:12px;color:var(--cc-text);background:var(--cc-surface);border:1px solid var(--cc-border);border-radius:6px;}
.score-manual-preview{max-width:320px;width:100%;}
.score-form-manual button{margin-top:12px;}
.score-name-transfer label,.score-form-manual label{line-height:1.7;}
@container(max-width:680px){.score-chord-basic-layout{grid-template-columns:minmax(0,1fr);}.score-chord-selected-form{width:160px;justify-self:center;}}
`;
