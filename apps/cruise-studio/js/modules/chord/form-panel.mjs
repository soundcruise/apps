import { createChordFormAdapter } from './form-adapter.mjs?v=0.43.0';
import { createFormAdoptionService } from './form-adoption.mjs?v=0.43.0';
import { getAppVersion } from '../../core/component-metadata.mjs?v=0.43.0';

const STANDARD = Object.freeze([64,59,55,50,45,40]);
// Missing/destroyed documents and selections are normal lifecycle states, never booleans.
export function readFormTarget(session, barId, eventId) {
    const s=session && !session.destroyed && session.draft?.schemaVersion===2 ? session : null;
    const b=s && Array.isArray(s.draft.bars) ? s.draft.bars.find(b=>b.id===barId) ?? null : null;
    const event=b && Array.isArray(b.chords) ? b.chords.find(e=>e.id===eventId) ?? null : null;
    return {s,b,event};
}
// UI-only lease. No project copy, history, repository write or recommendation policy.
export function createSelectionLease({owner,getContext,getSelection}) {
    function capture(barId,eventId) {
        const s=owner.getSession(),d=owner.ticket(),c=getContext(),sel=getSelection();
        if(!s||s.destroyed||s.draft?.schemaVersion!==2||!sel?.active||sel.barId!==barId||c.workspaceId!=='sheetCruise'||c.blocked||s.inputPending||s.commitInFlight||s.conflict||s.externalUpdatePending||s.getHistory().openGroup) return null;
        const {event}=readFormTarget(s,barId,eventId);
        return event?Object.freeze({session:s,sessionId:s.sessionId,projectId:s.target.projectId,documentGeneration:d.generation,workspaceGeneration:c.generation,version:s.snapshotVersion,revision:s.baseRevision,barId,eventId}):null;
    }
    function current(old) {
        if(!old)return false;const now=capture(old.barId,old.eventId);
        return !!now&&Object.keys(old).every(k=>now[k]===old[k]);
    }
    return Object.freeze({capture,current});
}
export function formMessage(result) {
    const reason=result?.error||result?.code||'';
    if(/undo-budget|history/.test(reason))return 'Undoの容量が不足しています。履歴と変更前の内容を保持しました。';
    if(/capacity|budget|quota|large/.test(reason))return '保存容量が不足しています。変更前の内容を保持しました。';
    if(/revision|stale|blocked|missing/.test(reason))return '対象または入力状態が変わりました。選び直して確認してください。';
    return 'この使用弦・楽器条件では採用できません。構成音と最低音を確認してください。';
}
export function mountFormPanel({C,document:doc,owner=globalThis.ChordCruise}) {
    const slot=doc.getElementById('studio-form-panel');
    const context=()=>({workspaceId:C.shellHost.getActiveWorkspace(),generation:C.shellHost.getWorkspaceGeneration(),blocked:!!C.shellHost.modal.getActive()||C.shellHost.keyboard.isIMEBlocked({})});
    const adapter=createChordFormAdapter({chordTheory:owner.theory,caged:owner.caged,parseChordSymbol:C.theory.parseBasicChordSymbol,ownerVersion:getAppVersion('chord-cruise')});
    const service=createFormAdoptionService({owner:C.documents,schema:C.model.schema2,adapter,repository:C.repository,getContext:context,chordTheory:owner.theory,parseChordSymbol:C.theory.parseBasicChordSymbol,ownerVersion:getAppVersion('chord-cruise')});
    const lease=createSelectionLease({owner:C.documents,getContext:context,getSelection:C.sheetCruise.getSelectionSnapshot});
    let disposed=false,opened=false,frame=null,shown=null,barId=null,eventId=null,mode='fixed',raf=0,selectionKey='';
    function node(tag,text,parent=slot){const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;parent.appendChild(n);return n;}
    node('h3','押さえ方');
    const empty=node('p','コードを選択してください');empty.id='form-empty';empty.setAttribute('role','status');
    const selectorLabel=node('label','対象コード');const selector=node('select',undefined,selectorLabel);selector.id='form-event';
    const toggle=node('button','押さえ方を開く');toggle.type='button';toggle.id='form-open';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','form-body');
    const body=node('div');body.id='form-body';body.hidden=true;
    const status=node('p','',body);status.id='form-status';status.setAttribute('role','status');
    const diagram=node('div',undefined,body);diagram.className='form-diagram';
    const details=node('p','',body);
    const change=node('button','変更',body);change.type='button';change.id='form-change';
    const remove=node('button','解除',body);remove.type='button';remove.id='form-remove';
    const controls=node('fieldset',undefined,body);node('legend','使用する楽器と弦',controls);
    const instrumentLabel=node('label','',controls),confirmed=node('input',undefined,instrumentLabel);confirmed.type='checkbox';confirmed.id='form-instrument';instrumentLabel.append(' 標準6弦チューニング（1弦→6弦 E B G D A E）を確認');
    const maxLabel=node('label','楽器の物理フレット上限',controls),max=node('input',undefined,maxLabel);max.type='number';max.min='0';max.max='36';max.step='1';max.id='form-max-fret';
    const request=node('button','条件を確認しておすすめを表示',controls);request.type='button';request.id='form-preview';
    const strings=node('fieldset',undefined,controls);node('legend','実際に鳴らす弦を指定',strings);
    const stringInputs=[1,2,3,4,5,6].map(n=>{const l=node('label','',strings),x=node('input',undefined,l);x.type='checkbox';x.dataset.formString=String(n);x.disabled=true;l.append(' '+n+'弦');return x;});
    const warning=node('p','',controls);warning.id='form-warning';warning.setAttribute('role','status');
    const adopt=node('button','このコードに採用',controls);adopt.type='button';adopt.id='form-adopt';adopt.disabled=true;
    node('p','採用はこのコードだけに適用します。保存はStudioの「保存」から。演奏フォームの確認であり、完成TABではありません。',body);
    function clearCandidate(){frame=null;shown=null;adopt.disabled=true;stringInputs.forEach(x=>{x.checked=false;x.disabled=true;});}
    function getTarget(){return readFormTarget(C.documents.getSession(),barId,eventId);}
    function actionable(){return !disposed&&opened&&!slot.closest('[hidden],[inert]')&&!!getTarget().event&&!!lease.capture(barId,eventId);}
    function paint(snapshot,shape,symbol){
        diagram.replaceChildren();if(!snapshot){return;}
        const caption=node('p',symbol+' · '+shape+'型 · カポ '+snapshot.capo,diagram);
        caption.className='form-caption';
        const ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 232 202');svg.setAttribute('role','img');svg.setAttribute('aria-label',symbol+' '+shape+'型。フレットはカポ相対。詳細は下の弦一覧。');
        const notes=snapshot.strings.filter(n=>n.kind==='note'),frets=notes.filter(n=>n.relativeFret>0).map(n=>n.relativeFret),start=Math.max(1,Math.min(...frets,1e3)),count=Math.max(4,Math.max(...frets,start)-start+1),height=132;
        function draw(tag,attrs,text){const n=doc.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;svg.appendChild(n);}
        const x=s=>30+(6-s)*32,y=f=>40+(f-start+0.5)*height/count;
        for(let s=1;s<=6;s++){draw('line',{x1:x(s),x2:x(s),y1:40,y2:172,stroke:'currentColor'});draw('text',{x:x(s),y:194,'text-anchor':'middle'},String(s));}
        for(let f=0;f<=count;f++)draw('line',{x1:30,x2:190,y1:40+f*height/count,y2:40+f*height/count,stroke:'currentColor'});
        draw('text',{x:6,y:54},String(start));
        for(const b of snapshot.barres)draw('line',{x1:x(b.fromString),x2:x(b.toString),y1:y(b.relativeFret),y2:y(b.relativeFret),stroke:'currentColor','stroke-width':9,'stroke-linecap':'round'});
        for(const n of snapshot.strings){if(n.kind!=='note'||n.relativeFret===0)draw('text',{x:x(n.string),y:28,'text-anchor':'middle'},n.kind==='muted'?'×':n.kind==='unknown'?'?':'○');else {draw('circle',{cx:x(n.string),cy:y(n.relativeFret),r:8,fill:'currentColor'});if(n.finger!==null)draw('text',{x:x(n.string),y:y(n.relativeFret)+3,'text-anchor':'middle',class:'form-finger'},String(n.finger));}}
        diagram.appendChild(svg);
        const list=node('ul',undefined,diagram);
        for(const n of snapshot.strings)node('li',n.string+'弦：'+(n.kind==='muted'?'ミュート':n.kind==='unknown'?'未確定':n.relativeFret===0?'開放（カポ位置）':'相対'+n.relativeFret+'／物理'+(snapshot.capo+n.relativeFret)+'フレット'+(n.finger===null?'':'・指'+n.finger)),list);
    }
    function snapshotOf(r){return {capo:r.request.capo,strings:[1,2,3,4,5,6].map(string=>{const n=r.form.notes.find(n=>n.string===string);return n?{...n,kind:'note'}:{string,kind:r.form.mutedStrings.includes(string)?'muted':'unknown'};}),barres:r.form.barres};}
    function render(){
        if(disposed)return;
        const sel=C.sheetCruise.getSelectionSnapshot(),{s,b,event}=getTarget();
        const active=!!(s&&sel.active&&!sel.deleted&&!sel.invalid&&sel.barId);
        if(!active){opened=false;barId=null;eventId=null;clearCandidate();}
        else if(barId!==sel.barId){barId=sel.barId;eventId=null;opened=false;clearCandidate();
            const bar=readFormTarget(s,barId,null).b;if(bar?.chords.length===1)eventId=bar.chords[0].id;
        }else if(eventId&&!event){eventId=null;opened=false;clearCandidate();}
        const bar=readFormTarget(s,barId,null).b,events=bar?.chords||[];
        // An explicit event picker is shared by name/beat labels. Never infer identity from text.
        const key=JSON.stringify(events.map(e=>[e.id,e.symbol,e.onsetTick]));
        if(key!==selectionKey){selectionKey=key;selector.replaceChildren();node('option','コードを選択',selector).value='';for(const e of events)node('option',(sel.barNumbers[0]||'')+'小節・'+(e.onsetTick/480+1)+'拍目 '+e.symbol,selector).value=e.id;}
        empty.hidden=!!eventId;empty.textContent=events.length?'コードを選択してください':'この小節にコードがありません。コードを選択してください。';
        selector.value=eventId||'';selector.disabled=!active||sel.editing;toggle.disabled=!eventId||!active||sel.editing;
        controls.disabled=!eventId||!lease.capture(barId,eventId);remove.disabled=change.disabled=controls.disabled;
        body.hidden=!opened;toggle.textContent=opened?'押さえ方を閉じる':'押さえ方を開く';toggle.setAttribute('aria-expanded',String(opened));
        if(!opened)return;
        const t=getTarget();if(!t.event){opened=false;return render();}
        const binding=t.s.draft.performance.formBindings.find(x=>x.chordEventId===eventId);
        if(frame&&!lease.current(frame)){clearCandidate();warning.textContent='対象が更新されました。条件を確認しておすすめを表示し直してください。';}
        change.hidden=remove.hidden=!binding;remove.disabled=!lease.capture(barId,eventId);change.disabled=remove.disabled;
        controls.hidden=!!binding&&mode!=='recommendation';
        if(binding&&mode!=='recommendation'){
            // Saved data is authoritative. Opening/repainting never re-queries the recommendation.
            const p=t.s.workingSnapshot(),material=p.materials.forms.find(m=>m.id===binding.materialId),evaluation=service.evaluate(p,binding);
            status.textContent=(evaluation.ready?'固定':'要確認')+' · '+selector.selectedOptions[0].textContent;
            details.textContent=evaluation.ready?'このコードに固定した押さえ方です。':'以前の押さえ方を保持しています。'+evaluation.reasons.join(' / ');
            paint(material.snapshot,material.provenance.shape,material.provenance.sourceSymbol);
        }else {status.textContent='おすすめ（未採用） · '+selector.selectedOptions[0].textContent;if(!shown) {diagram.replaceChildren();details.textContent='カポ '+t.s.draft.instrument.capo+'。楽器条件を確認してください。実音コードとカポ相対の押さえ方を分けて表示します。';}}
    }
    function preview(reset=false){
        if(!actionable())return;
        const token=lease.capture(barId,eventId),t=getTarget();
        if(!token||!confirmed.checked||max.value.trim()===''||!Number.isInteger(max.valueAsNumber)){clearCandidate();warning.textContent='入力を確定し、標準チューニングと楽器のフレット上限を明示確認してください。';return;}
        if(reset)clearCandidate();
        if(!reset&&!lease.current(frame)){clearCandidate();warning.textContent='対象が更新されました。おすすめを表示し直してください。';return;}
        const played=stringInputs.filter(x=>x.checked).map(x=>Number(x.dataset.formString));
        const result=adapter.resolve({symbol:t.event.symbol,capo:t.s.draft.instrument.capo,tuningMidi:STANDARD.slice(),maxAbsoluteFret:max.valueAsNumber,...(played.length?{playedStrings:played}:{})});
        frame=token;shown=result;adopt.disabled=true;
        if(!result.display.possible){diagram.replaceChildren();warning.textContent='このコードの基本フォームはまだ対応していません。'+result.display.reasons.join(' / ');stringInputs.forEach(x=>x.disabled=true);return;}
        paint(snapshotOf(result),result.form.shape,result.request.soundingSymbol);
        details.textContent='実音 '+result.request.soundingSymbol+'／カポ '+result.request.capo+'。図のフレット番号はカポから数えます。';
        for(const x of stringInputs)x.disabled=!result.form.notes.some(n=>n.string===Number(x.dataset.formString));
        warning.textContent=result.performance.voicingUsable?'使用弦の構成音と最低音を確認しました。保存はまだ行いません。':'表示できる候補です。演奏に使う弦の確認が必要です。'+result.performance.reasons.join(' / ');
        adopt.disabled=!result.performance.voicingUsable;
    }
    function open(){if(disposed||!lease.capture(barId,eventId))return;mode='fixed';clearCandidate();confirmed.checked=false;const t=getTarget();max.value=t.s?.draft.instrument.maxAbsoluteFret??'';warning.textContent='';opened=!opened;render();}
    toggle.addEventListener('click',open);
    selector.addEventListener('change',()=>{if(disposed)return;eventId=selector.value||null;opened=false;mode='fixed';clearCandidate();render();});
    change.addEventListener('click',()=>{if(!actionable())return;mode='recommendation';clearCandidate();confirmed.checked=false;max.value=getTarget().s.draft.instrument.maxAbsoluteFret??'';warning.textContent='';render();});
    request.addEventListener('click',()=>preview(true));
    confirmed.addEventListener('change',clearCandidate);max.addEventListener('input',clearCandidate);
    for(const x of stringInputs)x.addEventListener('change',()=>preview(false));
    function apply(removal){
        if(!actionable())return;
        if(!removal&&(!lease.current(frame)||!shown?.performance.voicingUsable)){warning.textContent=formMessage({error:'stale-candidate'});adopt.disabled=true;return;}
        const h=removal?service.prepareRemoval({barId,chordEventId:eventId}):service.prepare({barId,chordEventId:eventId,instrument:{confirmed:confirmed.checked,tuningMidi:STANDARD.slice(),maxAbsoluteFret:max.valueAsNumber},playedStrings:stringInputs.filter(x=>x.checked).map(x=>Number(x.dataset.formString))});
        const result=h.ok?service.apply(h):h;
        if(!result.ok){warning.textContent=formMessage(result);return;}
        mode='fixed';clearCandidate();render();warning.textContent=removal?'指定を解除しました。未保存です。':'このコードに採用しました。未保存です。';
    }
    adopt.addEventListener('click',()=>apply(false));remove.addEventListener('click',()=>apply(true));
    // Defer all UI work: no owner query/schema clone on the melody command's synchronous path.
    function schedule(){if(!raf&&!disposed)raf=requestAnimationFrame(()=>{raf=0;render();});}
    let offs=[];
    function connect(){if(disposed||offs.length)return;offs=[C.sheetCruise.subscribeSelection(schedule),C.sessions.subscribe(schedule),C.documents.subscribe(schedule)];render();}
    function disconnect(){offs.forEach(off=>off());offs=[];cancelAnimationFrame(raf);raf=0;}
    function hide(){globalThis.removeEventListener('pagehide',hide);opened=false;clearCandidate();disconnect();render();}
    function show(event){if(event.persisted&&!disposed){globalThis.addEventListener('pagehide',hide,{once:true});connect();}}
    globalThis.addEventListener('pagehide',hide,{once:true});globalThis.addEventListener('pageshow',show);connect();
    return Object.freeze({dispose(){if(disposed)return;disposed=true;disconnect();globalThis.removeEventListener('pagehide',hide);globalThis.removeEventListener('pageshow',show);opened=false;clearCandidate();slot.replaceChildren();}});
}
function initialize(){const C=globalThis.CruiseStudio;if(C?.shellHost&&!C.formPanel)C.formPanel=mountFormPanel({C,document});}
if(typeof document!=='undefined'){if(globalThis.CruiseStudio?.shellHost)initialize();else document.addEventListener('DOMContentLoaded',initialize,{once:true});}
