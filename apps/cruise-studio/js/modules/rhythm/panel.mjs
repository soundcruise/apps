/* DOM interaction boundary only; Session/revision/capacity remain R5-owned. */
export function canInteractWithRhythmPanel({panel,target=panel,opened,disposed,workspaceId,modalBlocked,imeBlocked}){
    if(!opened||disposed||workspaceId!=='sheetCruise'||modalBlocked||imeBlocked||!panel?.isConnected||!target?.isConnected||!panel.contains(target))return false;
    for(let element=target;element;element=element.parentElement){
        if(element.hasAttribute('inert')||element.hasAttribute('hidden'))return false;
        const style=element.ownerDocument.defaultView.getComputedStyle(element);
        if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.contentVisibility==='hidden')return false;
    }
    return target.checkVisibility({checkVisibilityCSS:true,checkOpacity:true,contentVisibilityAuto:true});
}
// Element references are UI lifecycle state, never Project/Session authority.
export function rhythmPanelAncestors(panel){const chain=[];for(let e=panel;e;e=e.parentElement)chain.push(e);return chain;}
export function sameRhythmPanelAncestors(a,b){return a.length===b.length&&a.every((element,i)=>element===b[i]);}
export function rhythmPanelObservation(targets,previous=[]){
    const chains=targets.map(rhythmPanelAncestors);
    return {chains,elements:[...new Set(chains.flat())],changed:chains.length!==previous.length||chains.some((chain,i)=>!sameRhythmPanelAncestors(chain,previous[i]))};
}
// UI source ownership is separate from DOM operability and R5 eligibility.
export function isCurrentRhythmOfficialSource({opened,disposed,request,generation,buttons,catalog,button,patternId}){
    return !!(opened&&!disposed&&generation===request&&buttons.includes(button)&&catalog.contains(button)&&button.dataset.patternId===patternId);
}
export function rhythmMessage(result){const messages={'owner-source-mismatch':'公式データを確認できません。新しい採用は行えません。','owner-unavailable':'公式リズムは現在取得できません。保存済み素材は利用できます。','stale-candidate':'編集状態や対象が変わりました。もう一度リズムを選んでください。','external-revision':'保存済みの曲が更新されています。編集中の内容は保持しています。','blocked-session':'入力・保存・競合の状態を確認してから選び直してください。','undo-budget':'Undoの容量が不足しています。内容と履歴は保持しました。','project-budget':'保存容量が不足しています。内容は保持しました。'};const code=[result?.error,result?.code].find(x=>typeof x==='string'&&Object.hasOwn(messages,x));return code?messages[code]:'リズムを設定できませんでした。内容は保持しています。もう一度確認してください。';}
export function mountRhythmPanel({C,document:doc,loader}){
    const slot=doc.getElementById('studio-rhythm-panel');if(!slot)return null;
    let interactionTarget=null;
    const permitted=target=>canInteractWithRhythmPanel({panel:slot,target,opened,disposed,workspaceId:C.shellHost.getActiveWorkspace(),modalBlocked:!!C.shellHost.modal.getActive(),imeBlocked:C.shellHost.keyboard.isIMEBlocked({})});
    const context=()=>({workspaceId:C.shellHost.getActiveWorkspace(),generation:C.shellHost.getWorkspaceGeneration(),blocked:!permitted(interactionTarget||adopt)});
    function interacting(target,action){const previous=interactionTarget;interactionTarget=target;try{return action();}finally{interactionTarget=previous;}}
    let control=null,selectionBarIds=null,initialization=null,offs=[],shownTarget=null,officialButtons=[];
    function connect(){if(!offs.length){offs=[C.sessions.subscribe(changed),C.documents.subscribe(changed),C.sheetCruise.subscribeSelection(changed)];globalThis.addEventListener('pagehide',hide);watchInteraction();}}
    function disconnect(){offs.forEach(off=>off());offs=[];globalThis.removeEventListener('pagehide',hide);stopInteraction();}
    function initializeControl(){if(!initialization)initialization=Promise.all([import('./owner-loader.mjs?v=0.48.0'),import('./panel-controller.mjs?v=0.48.0')]).then(([l,c])=>{selectionBarIds=c.selectionBarIds;control=c.createRhythmPanelController({owner:C.documents,schema:C.model.schema2,rhythmSnapshots:C.rhythmSnapshots,repository:C.repository,getContext:context,getSelection:C.sheetCruise.getSelectionSnapshot,loader:loader||l.createOwnerLoader()});});return initialization;}
    let opened=false,disposed=false,raf=0,request=0,preview=null,chosen=null,previewKey='',savedKey='',notice='',offlineCache=null,compositionTimer=null;
    const node=(tag,text,parent=slot)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;parent.append(n);return n;};
    const toggle=node('button','リズムを選ぶ');toggle.type='button';toggle.id='rhythm-open';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','rhythm-body');
    const body=node('div');body.id='rhythm-body';body.hidden=true;
    const label=node('label','対象',body),target=node('select',undefined,label);target.id='rhythm-target';node('option','曲全体の基本リズム',target).value='basic';node('option','選択した小節のリズム',target).value='bars';
    const targetName=node('p','',body);targetName.id='rhythm-target-name';const current=node('p','',body);current.id='rhythm-current';
    const status=node('p','',body);status.id='rhythm-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const catalog=node('div',undefined,body);catalog.id='rhythm-official';const retry=node('button','公式リズムを読み込む',body);retry.type='button';retry.id='rhythm-retry';
    const savedLabel=node('label','この曲の保存済み素材',body),saved=node('select',undefined,savedLabel);saved.id='rhythm-saved';
    const grid=node('div',undefined,body);grid.id='rhythm-preview';grid.setAttribute('role','group');grid.setAttribute('aria-label','リズムの確認');
    const legend=node('p','↓ ダウン ／ ↑ アップ ／ ・ 休み ／ 〜 前の音を続ける',body);legend.className='rhythm-note';
    const adopt=node('button','このリズムを採用',body);adopt.type='button';adopt.id='rhythm-adopt';adopt.disabled=true;
    const clear=node('button','基本リズムに戻す',body);clear.type='button';clear.id='rhythm-clear';
    node('p','採用は未保存の編集です。保存はStudioの「保存」から。リズムの指定であり、使用弦などは未設定です。',body).className='rhythm-note';
    function forget(){control?.invalidate();preview=null;chosen=null;saved.value='';previewKey='';adopt.disabled=true;}
    function schedule(){if(opened&&!raf&&!disposed)raf=requestAnimationFrame(()=>{raf=0;render();});}
    function changed(){if(disposed||!opened)return;if(preview)notice='編集状態や対象が変わりました。もう一度リズムを選んでください。';forget();schedule();}
    function paint(value){
        const key=JSON.stringify(value);if(key===previewKey)return;previewKey=key;grid.replaceChildren();
        if(!value)return;
        node('p',value.name,grid);
        if(!value.projection){node('p','旧ストローク素材です。既存のストローク表示で確認できます。',grid);return;}
        const row=node('div',undefined,grid);row.className='rhythm-cells';row.style.setProperty('--rhythm-cells',value.projection.events.length);
        for(const e of value.projection.events){const n=node('span',e.sound==='attack'?(e.direction==='down'?'↓':'↑'):e.sound==='rest'?'・':'〜',row);n.dataset.sound=e.sound;n.dataset.direction=e.direction||'';n.dataset.onset=String(e.onsetTick);n.dataset.span=String(e.spanTicks);n.setAttribute('aria-label',(e.onsetTick/480+1)+'拍：'+(e.sound==='attack'?(e.direction==='down'?'ダウン':'アップ'):e.sound==='rest'?'休み':'前の音を続ける'));if(e.onsetTick%480===0)n.classList.add('rhythm-beat');}
    }
    function materialPreview(material){
        const key=JSON.stringify(material);if(offlineCache?.key===key)return offlineCache.value;
        if(material.encoding==='studio-strum-v1')return {name:material.snapshot.name,projection:null};
        const r=C.rhythmSnapshots.readRhythmMaterial(material);if(!r.ok)return null;
        const value={name:r.material.snapshot.name,projection:r.projection};offlineCache={key,value};return value;
    }
    function render(){
        if(disposed)return;toggle.setAttribute('aria-expanded',String(opened));toggle.textContent=opened?'リズムを閉じる':'リズムを選ぶ';if(!opened)return;if(!control){status.textContent='リズムを準備しています…';adopt.disabled=clear.disabled=true;return;}
        if(context().workspaceId!=='sheetCruise'){close();return;}
        const s=C.documents.getSession(),p=s?.draft;if(!s||p.schemaVersion!==2){forget();current.textContent='曲を開いてください。';adopt.disabled=clear.disabled=saved.disabled=target.disabled=true;for(const b of catalog.querySelectorAll('button'))b.disabled=true;return;}
        target.disabled=false;saved.disabled=!control.eligible();
        const bars=selectionBarIds(C.sheetCruise.getSelectionSnapshot(),p),numbers=bars.map(id=>p.bars.findIndex(b=>b.id===id)+1);
        targetName.textContent=target.value==='basic'?'曲全体の基本リズム':numbers.length?numbers.join('・')+'小節目':'小節を選択してください';
        const binding=target.value==='bars'&&bars.length?p.performance.barRhythms.find(b=>b.barId===bars[0]):null;
        const materialId=binding?.materialId||p.performance.basicRhythmId,material=p.materials.rhythms.find(m=>m.id===materialId);
        current.textContent=(target.value==='basic'?'基本：':binding?'小節指定：':'基本を継承：')+(material?.snapshot.name||'未指定')+(s.dirty?'（未保存）':'');current.dataset.materialId=materialId;
        const key=JSON.stringify(p.materials.rhythms.map(m=>[m.id,m.encoding,m.snapshot.name]));if(savedKey!==key){savedKey=key;saved.replaceChildren();node('option','保存済み素材を選ぶ',saved).value='';for(const m of p.materials.rhythms){const o=node('option',m.snapshot.name+'（'+(m.encoding==='rhythm-owner-cells-v1'?'公式':'旧ストローク')+'）',saved);o.value=m.id;}}
        if(preview&&(!permitted(adopt)||!control.current())){forget();notice='編集状態や対象が変わりました。もう一度リズムを選んでください。';}
        adopt.disabled=!permitted(adopt)||!interacting(adopt,()=>control.current()&&control.eligible());if(shownTarget!==target.value){shownTarget=target.value;clear.hidden=target.value!=='bars';}clear.disabled=!permitted(clear)||!interacting(clear,()=>control.eligible());
        for(const b of catalog.querySelectorAll('button')){b.disabled=!control.eligible();b.setAttribute('aria-pressed',String(chosen===b.dataset.patternId));const used=material?.encoding==='rhythm-owner-cells-v1'&&material.snapshot.patternId===b.dataset.patternId;b.dataset.adopted=String(used);b.querySelector('span').textContent=used?' 採用済み':'';}
        status.textContent=notice;paint(preview||(material&&materialPreview(material)));
    }
    async function load(){const token=++request;catalog.replaceChildren();officialButtons=[];flushInteraction();retry.disabled=true;notice='公式リズムを確認しています…';render();const r=await control.load();if(disposed||!opened||token!==request)return;retry.disabled=false;
        if(!r.ok){notice=rhythmMessage(r);render();return;}
        for(const [gridName,title]of [['eighth','8ビート'],['sixteenth','16ビート']]){const group=node('fieldset',undefined,catalog);node('legend',title,group);for(const pattern of r.patterns.filter(p=>p.grid===gridName)){const b=node('button',pattern.name,group);officialButtons.push(b);b.type='button';b.dataset.patternId=pattern.patternId;node('span','',b);b.addEventListener('click',()=>{if(!isCurrentRhythmOfficialSource({opened,disposed,request,generation:token,buttons:officialButtons,catalog,button:b,patternId:pattern.patternId}))return;flushInteraction();if(!permitted(b)){changed();return;}saved.value='';const h=interacting(b,()=>control.prepareOfficial(pattern.patternId,pattern.patternRevision));preview=h.ok?{name:pattern.name,projection:h.preview}:null;chosen=h.ok?pattern.patternId:null;notice=h.ok?'未採用の候補です。対象を確認して採用してください。':rhythmMessage(h);render();});}}
        flushInteraction();notice='公式リズムを選んで確認できます。';retry.hidden=true;render();
    }
    function close(){flushInteraction();opened=false;body.hidden=true;++request;officialButtons=[];control?.close();disconnect();forget();clearTimeout(compositionTimer);compositionTimer=null;cancelAnimationFrame(raf);raf=0;render();}
    toggle.addEventListener('click',async()=>{if(opened){close();return;}opened=true;body.hidden=false;retry.disabled=true;const token=++request;notice='';render();try{await initializeControl();if(disposed||!opened||token!==request)return;control.open();connect();control.setTarget(target.value);render();await load();}catch(_){notice='リズムを準備できませんでした。内容は保持しています。';status.textContent=notice;}});retry.addEventListener('click',()=>{if(permitted(retry))load();else changed();});
    target.addEventListener('change',()=>{control?.setTarget(target.value);forget();notice='';render();});
    saved.addEventListener('change',()=>{const id=saved.value;flushInteraction();if(!permitted(saved)){changed();return;}forget();const m=C.documents.getSession()?.draft.materials.rhythms.find(m=>m.id===id);if(m){const h=interacting(saved,()=>control.prepareReuse(m.id));preview=h.ok?materialPreview(m):null;if(h.ok)saved.value=id;notice=h.ok?'保存済み素材の候補です。対象を確認して採用してください。':rhythmMessage(h);}render();});
    adopt.addEventListener('click',()=>{if(flushInteraction()||!permitted(adopt)){changed();return;}const focusTarget=chosen?[...catalog.querySelectorAll('button')].find(b=>b.dataset.patternId===chosen):saved;const s=C.documents.getSession(),result=interacting(adopt,()=>control.apply());if(result.ok&&result.recorded)requestAnimationFrame(()=>{if(!disposed&&s===C.documents.getSession()&&context().workspaceId==='sheetCruise')C.sheetCruise.refreshRhythmView();});forget();notice=result.ok?(result.recorded?'リズムを設定しました。未保存です。':'すでに同じリズムが設定されています。'):rhythmMessage(result);render();if(result.ok&&focusTarget&&!focusTarget.disabled)focusTarget.focus({preventScroll:true});});
    clear.addEventListener('click',()=>{if(flushInteraction()||!permitted(clear)){changed();return;}const s=C.documents.getSession(),result=interacting(clear,()=>control.clear());if(result.ok&&result.recorded)requestAnimationFrame(()=>{if(!disposed&&s===C.documents.getSession()&&context().workspaceId==='sheetCruise')C.sheetCruise.refreshRhythmView();});forget();notice=result.ok?(result.recorded?'基本リズムに戻しました。未保存です。':'すでに基本リズムを継承しています。'):rhythmMessage(result);render();});
    const escape=e=>{if(e.key==='Escape'&&opened&&!context().blocked){e.preventDefault();e.stopPropagation();close();toggle.focus();}};slot.addEventListener('keydown',escape);
    const external=e=>{if(e.key?.startsWith('cruiseStudio.project'))changed();},focus=()=>{if(opened){changed();}},composition=event=>{if(!opened)return;changed();if(event.type==='compositionend'){clearTimeout(compositionTimer);compositionTimer=setTimeout(()=>{compositionTimer=null;schedule();},0);}};
    globalThis.addEventListener('storage',external);globalThis.addEventListener('focus',focus);doc.addEventListener('focusin',schedule);doc.addEventListener('compositionstart',composition,true);doc.addEventListener('compositionend',composition,true);
    const interactionChanges=records=>records.some(r=>r.type==='childList'||r.oldValue!==r.target.getAttribute(r.attributeName));
    let interactionChains=[],connectedChains=new Map();
    const interactionTargets=()=>[slot,body,adopt,clear,saved,...officialButtons];
    const interactionObserver=new MutationObserver(records=>flushInteraction(records));
    // One shared childList-only observer avoids enabling attribute subtree observation
    // when a reconnection anchor also belongs to an operable action's ancestor chain.
    const reconnectionObserver=new MutationObserver(records=>flushInteraction(records));
    const pendingInteraction=()=>[...interactionObserver.takeRecords(),...reconnectionObserver.takeRecords()];
    // Explicit operation boundaries and observer deliveries only; never Session/render polling.
    function flushInteraction(delivered=[]){
        if(!opened||disposed)return false;
        const records=[...delivered,...pendingInteraction()],observation=rhythmPanelObservation(interactionTargets(),interactionChains);
        const invalidated=observation.changed||interactionChanges(records);
        if(invalidated)changed();
        if(observation.changed)watchInteraction(observation); // Current action chains BEFORE preparing a handle.
        return invalidated;
    }
    function stopInteraction(){
        const pending=pendingInteraction();
        if(opened&&interactionChanges(pending))changed();
        interactionObserver.disconnect();reconnectionObserver.disconnect();interactionChains=[];connectedChains=new Map();
    }
    function watchInteraction(observation=rhythmPanelObservation(interactionTargets())){
        // Both observers' pending records must be processed before disconnect.
        const previous=connectedChains;stopInteraction();interactionChains=observation.chains;
        const attributes={attributes:true,attributeOldValue:true,attributeFilter:['inert','hidden','style','class','open']};
        const current=new Set(observation.elements),witnesses=new Set(),anchors=new Set();
        for(const element of current)interactionObserver.observe(element,{...attributes,childList:true});
        for(const chain of interactionChains){
            const target=chain[0],connected=target.isConnected?chain:previous.get(target)||[];connectedChains.set(target,connected);
            if(target.isConnected)continue;
            for(const element of connected)if(!current.has(element))witnesses.add(element);
            const anchor=connected.find(element=>element.isConnected&&element!==doc.body&&element!==doc.documentElement);
            if(anchor)anchors.add(anchor);
        }
        for(const element of witnesses)interactionObserver.observe(element,{childList:true});
        for(const anchor of anchors)reconnectionObserver.observe(anchor,{childList:true,subtree:true});
    }
    const hide=()=>close();render();
    return Object.freeze({dispose(){if(disposed)return;close();disposed=true;disconnect();globalThis.removeEventListener('storage',external);globalThis.removeEventListener('focus',focus);globalThis.removeEventListener('pagehide',hide);doc.removeEventListener('focusin',schedule);doc.removeEventListener('compositionstart',composition,true);doc.removeEventListener('compositionend',composition,true);slot.removeEventListener('keydown',escape);slot.replaceChildren();}});
}
function initialize(){const C=globalThis.CruiseStudio;if(C?.shellHost&&!C.rhythmPanel)C.rhythmPanel=mountRhythmPanel({C,document});}
if(typeof document!=='undefined'){if(globalThis.CruiseStudio?.shellHost)initialize();else document.addEventListener('DOMContentLoaded',initialize,{once:true});}
