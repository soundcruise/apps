import {parseChordNames,MAX_BYTES} from './chord-name-transfer.mjs';
import {createChordFormAdapter} from '../chord/form-adapter.mjs?v=0.88.1';
import {createFormAdoptionService} from '../chord/form-adoption.mjs?v=0.88.1';
import {getAppVersion} from '../../core/component-metadata.mjs?v=0.88.1';
import {drawChordForm} from './chord-form-diagram.mjs';

// Exact owner UI in a shadow tree; the local host injects the generated source.
// Its settings are memory-only. It cannot reach native Chord/Studio storage.
export function createOwnerChordPicker(C,base){
    const sessions=new WeakMap();
    const adapter=createChordFormAdapter({chordTheory:base.theory,caged:base.caged,parseChordSymbol:C.theory.parseBasicChordSymbol,ownerVersion:getAppVersion('chord-cruise')});
    const service=createFormAdoptionService({owner:C.documents,schema:C.model.schema2,adapter,repository:C.repository,getContext:()=>({workspaceId:C.shellHost.getActiveWorkspace(),generation:C.shellHost.getWorkspaceGeneration(),blocked:!!C.shellHost.modal.getActive()||C.shellHost.keyboard.isIMEBlocked({})}),chordTheory:base.theory,parseChordSymbol:C.theory.parseBasicChordSymbol,ownerVersion:getAppVersion('chord-cruise')});
    return {mount(host,target){
        const {session,bar,tick,project}=target,source=C.localChordOwner;
        let memory=sessions.get(session);if(!memory){memory={catalogue:null};sessions.set(session,memory);}
        const events=new AbortController();
        const shadow=host.shadowRoot||host.attachShadow({mode:'open'});shadow.replaceChildren();host.textContent='';host.className='score-owner-chord-picker';host.setAttribute('aria-label','コードを調べる');
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
            const parsed=C.theory.parseBasicChordSymbol(name),root=parsed&&base.theory.parseSpelledNoteName(parsed.root),quality=parsed&&Object.keys(base.theory.QUALITIES).find(k=>k===parsed.quality||base.theory.QUALITIES[k].symbolSuffix===parsed.quality);
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
        const advanced=button('コードクルーズ',()=>{memory.advanced=!memory.advanced;setAdvanced();},actions,{title:'任意コードやコードフォームの編集','aria-expanded':false,'data-chord-advanced':''});
        function setAdvanced(){host.classList.toggle('score-chord-advanced',!!memory.advanced);advanced.setAttribute('aria-expanded',String(!!memory.advanced));}
        setAdvanced();
        const section=node('section');section.id='cc-screen-explore';
        const status=node('p','',body,'cc-fb-hint');status.setAttribute('role','status');
        owner.ui.toast={show:message=>{status.textContent=message;}};
        function write(name){
            if(!eligible())return false;
            if(!C.theory.parseBasicChordSymbol(name)){status.textContent='コード名として入力できない名前です。元のマスを保持しています。';return false;}
            session.finishTextGroup();const ok=target.write(name);session.finishTextGroup();if(!ok)status.textContent='入力対象・コード表記・保存状態を確認してください。';return ok;
        }
        const shelf=node('section',undefined,body,'cc-card score-name-transfer');node('h3','コード本棚から入力',shelf,'cc-card-heading');
        const tools=node('div',undefined,shelf,'cc-control-row');const label=node('label','コード名JSONを読み込む',tools,'cc-btn cc-btn-secondary');const file=node('input',undefined,label);file.type='file';file.accept='.json,application/json';file.dataset.chordNamesImport='';
        node('p','取込みは一時一覧です。フォームは取り込まず、選んだコード名だけをマスへ入力します。',shelf,'cc-fb-hint');const items=node('div',undefined,shelf,'cc-chord-grid');
        function catalogue(){items.replaceChildren();for(const chord of memory.catalogue?.chords||[]){const folder=memory.catalogue.folders.find(f=>f.id===chord.folderId);button(chord.name,()=>{if(!setChord(chord.name)){status.textContent='この名前はコードとして解釈できません。元のマスを保持しています。';return;}write(chord.name);},items,{'data-transfer-chord':chord.id,'aria-label':chord.name+' ／ '+folder.name,title:folder.name+' ／ '+chord.id});}}
        file.addEventListener('change',async()=>{const selected=file.files[0],epoch=++importEpoch;if(!selected||!eligible())return;try{if(selected.size>MAX_BYTES)throw Error('JSONファイルが大きすぎます');const text=await selected.text();if(epoch!==importEpoch||!file.isConnected||!eligible())return;const parsed=parseChordNames(text);memory.catalogue=parsed;catalogue();status.textContent=parsed.chords.length+'件を読み込みました。譜面はまだ変更していません。';}catch(e){if(current())status.textContent=e.message;}finally{if(file.isConnected)file.value='';}});catalogue();
        const help=node('details',undefined,shelf);node('summary','本棚からJSONを書き出す',help);node('p','下のボタンをブックマークバーへドラッグして登録し、通常のコードクルーズProで本棚を開いてから、そのブックマークを押してください。選んだコード名だけをファイルへ書き出します。本棚への書込みや外部通信はありません。',help,'cc-fb-hint');const link=node('a','本棚のコード名をJSON書出し',help,'cc-btn cc-btn-secondary');link.href=source.exportBookmarklet;link.dataset.chordExportBookmarklet='';link.addEventListener('click',e=>{e.preventDefault();status.textContent='このリンクをブックマークバーへ登録し、コードクルーズProの本棚上で使ってください。';});
        const formArea=node('section',undefined,body,'cc-card score-chord-adoption');formArea.setAttribute('aria-label','譜面へのフォーム採用');const formStatus=node('p','',formArea,'cc-fb-hint');
        let disposeDiagram=()=>{};
        function refreshDiagram(){
            const chord=owner.ui.explore.readSelectedChord();if(!chord)return;
            const binding=canonical?.symbol===chord.symbol&&project.performance.formBindings.find(b=>b.chordEventId===canonical.id),material=binding&&project.materials.forms.find(m=>m.id===binding.materialId);
            let snapshot=material?.snapshot;
            if(!snapshot){const r=adapter.resolve({symbol:chord.symbol,capo:project.instrument.capo,tuningMidi:[64,59,55,50,45,40],maxAbsoluteFret:project.instrument.maxAbsoluteFret??22});if(r.display.possible){const f=r.form;snapshot={capo:r.request.capo,tuningMidi:r.request.tuningMidi,strings:[1,2,3,4,5,6].map(string=>{const n=f.notes.find(n=>n.string===string);return n?{...n,kind:'note'}:{string,kind:f.mutedStrings.includes(string)?'muted':'unknown'};}),barres:f.barres||[]};}}
            formName.textContent=chord.symbol;diagram.setAttribute('aria-label',chord.symbol+'のコードフォーム');
            diagram.dataset.chordDiagramTick=tick;if(material)diagram.dataset.formMaterial=material.id;else delete diagram.dataset.formMaterial;
            disposeDiagram();disposeDiagram=drawChordForm(owner.ui.fretboard,diagram,snapshot,chord,owner.ui.explore);
        }
        function refreshAdoption(){
            formArea.querySelectorAll('label,button').forEach(n=>n.remove());const chord=owner.ui.explore.readSelectedChord(),form=owner.ui.explore.readCurrentForm();if(!chord||!form){formStatus.textContent='CAGED型を選ぶと、既存の検証条件でフォーム採用を確認できます。';return;}
            const played=form.notes.map(n=>n.string),shape=owner.state.exploreShape;let candidate=null;
            const max=project.instrument.maxAbsoluteFret??22,capo=project.instrument.capo;
            for(let min=0;min<=max-capo&&!candidate;min++)for(const width of [4,5,13]){const generation={minRelativeFret:min,maxRelativeFret:Math.min(min+width,max-capo)},r=adapter.resolve({symbol:chord.symbol,capo,tuningMidi:[64,59,55,50,45,40],maxAbsoluteFret:max,generation,playedStrings:played});if(r.performance.voicingUsable&&r.form?.shape===shape&&JSON.stringify(r.form.notes.map(n=>[n.string,n.relativeFret]).sort())===JSON.stringify(form.notes.map(n=>[n.string,n.fret]).sort())){candidate={generation,r};break;}}
            if(!candidate){formStatus.textContent='表示した型は、現在のカポ・楽器・既存の採用条件を満たす候補と一致しないため表示のみです。';return;}
            const l=node('label',undefined,formArea),check=node('input',undefined,l);check.type='checkbox';check.dataset.chordInstrument='';l.append(' 標準6弦チューニングと物理フレット上限 '+max+' を確認');
            const adopt=button('このコードにフォームを採用',()=>{if(!check.checked||canonical?.symbol!==chord.symbol)return;session.finishTextGroup();const h=service.prepare({barId:bar.id,chordEventId:canonical.id,instrument:{confirmed:true,tuningMidi:[64,59,55,50,45,40],maxAbsoluteFret:max},playedStrings:played,generation:candidate.generation}),result=h.ok?service.apply(h):h;if(result.ok)target.changed();else formStatus.textContent='採用できませんでした。元の内容を保持しています。';},formArea,{'data-chord-adopt':''});adopt.disabled=true;check.addEventListener('change',()=>{adopt.disabled=!eligible()||!check.checked||canonical?.symbol!==chord.symbol;});formStatus.textContent=canonical?.symbol===chord.symbol?'このコードだけに採用します。保存は「保存」から。':'コード欄に入力したコードを選択してください。';
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
        doc.addEventListener('click',e=>{if(e.target.closest('#cc-custom-chord-btn')){const apply=shadow.getElementById('cc-builder-apply');if(apply)apply.textContent='コード欄に入力';}if(e.target.closest('.cc-chord-btn,.cc-note-chip--link,#cc-builder-apply')){const chord=owner.ui.explore.readSelectedChord();if(chord)write(chord.symbol);}});
        doc.addEventListener('keydown',e=>{if(!((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'))e.stopPropagation();});
        doc.addEventListener('compositionstart',()=>{composing=true;host.classList.add('is-composing');session.setInputPending(true);});doc.addEventListener('compositionend',()=>{composing=false;host.classList.remove('is-composing');session.setInputPending(false);});
        // Owner popups remain inside this editor. Neither global IDs nor Shell theme are changed.
        owner.ui.explore.render();
        const diatonic=shadow.getElementById('cc-chord-grid').closest('.cc-card');diatonic.classList.add('score-chord-diatonic');basicLayout.append(diatonic);
        shadow.querySelector('.cc-explore-controls').append(shadow.querySelector('.cc-custom-chord-row'));
        sync();const observer=new MutationObserver(sync);for(const scope of [section,diatonic])observer.observe(scope,{childList:true,subtree:true});
        host._disposeOwnerChord=()=>{disposed=true;importEpoch++;events.abort();observer.disconnect();disposeDiagram();unsubscribeTheme();if(composing){composing=false;session.setInputPending(false);}host.classList.remove('is-composing');};
        return owner;
    }};
}

const layoutCSS=`
:host{display:block;padding:16px;border:1px solid var(--cc-border);border-radius:var(--cc-radius-lg);font-family:'Outfit','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;color:var(--cc-text);background-color:var(--cc-bg);}
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
.score-chord-basic-layout{display:grid;grid-template-columns:minmax(200px,340px) minmax(0,1fr);gap:16px;align-items:center;}
.score-chord-selected-form{margin:0;min-width:0;}
.score-chord-selected-form figcaption{font-size:24px;font-weight:700;text-align:center;color:var(--cc-accent-text);margin-bottom:8px;}
.score-chord-diagram{width:100%;overflow:hidden;}
.score-chord-diagram .cc-fb-scroll{overflow:hidden;}
.score-chord-diatonic{margin:0;padding:12px;min-width:0;}
.score-chord-diatonic .cc-diatonic-head{margin-bottom:8px;}
.score-chord-actions{display:flex;flex-wrap:wrap;gap:10px;}
.score-chord-actions button{min-height:36px;padding:8px 14px;font-size:14px;border-radius:8px;}
.score-chord-actions [data-chord-advanced]{margin-left:auto;}
:host(:not(.score-chord-advanced)) :is(#cc-screen-explore,.cc-custom-chord-row,.score-name-transfer,.score-chord-adoption){display:none;}
:host(.score-chord-advanced) #cc-screen-explore{grid-column:1/-1;}
#cc-save-btn-row{display:none!important;}
@container(max-width:580px){.score-chord-basic-layout{grid-template-columns:minmax(0,1fr);}.score-chord-selected-form{width:100%;max-width:340px;justify-self:center;}}
`;
