import { createChordFormAdapter } from './form-adapter.mjs?v=0.55.0';
import { createFormAdoptionService } from './form-adoption.mjs?v=0.55.0';
import { getAppVersion } from '../../core/component-metadata.mjs?v=0.55.0';

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
// Presentation only: owner snapshot geometry and binding playback remain separate.
export function formStringStates(snapshot, playedStrings = null) {
    return snapshot.strings.map(n => {
        const playback = n.kind === 'muted' ? 'muted' : n.kind !== 'note' ? 'unknown' :
            playedStrings === null ? 'unconfirmed' : playedStrings.includes(n.string) ? 'played' : 'not-played';
        const label = { played:'鳴らす', 'not-played':'鳴らさない', muted:'ミュート', unknown:'未確定', unconfirmed:'使用弦未指定' }[playback];
        return { ...n, playback, label };
    });
}
const REASON_MESSAGES = Object.freeze({
    'played-strings-unconfirmed':'鳴らす弦を選んでください。',
    'played-tones-incomplete':'コードに必要な音が不足しています。鳴らす弦を確認してください。',
    'played-bass-mismatch':'最低音が指定したコードと異なります。低い弦の選択を確認してください。',
    'played-string-not-in-form':'このフォームで鳴らせない弦が選択されています。使用弦を確認してください。',
    'missing-required-tones':'この押さえ方では、コードに必要な音が揃っていません。現在の候補は採用できません。',
    'slash-bass-unresolved':'指定したベース音の条件を確認できません。',
    'root-bass-unresolved':'ルート音が最低音になる条件を確認できません。',
    'sixth-overlay-unresolved':'このコードの追加音が不足しています。現在の基本フォームでは採用できません。',
    'owner-partial-form':'フォームの情報が一部不足しています。現在の候補は採用できません。',
    'owner-completeness-unconfirmed':'フォームの完全性を確認できません。現在の候補は採用できません。',
    'string-states-unconfirmed':'弦の状態を確認できません。現在の候補は採用できません。',
    'unintended-tones':'コードに含まれない音があります。現在の候補は採用できません。',
    'playability-unconfirmed':'この押さえ方の演奏条件を確認できません。現在の候補は採用できません。',
    'unsupported-quality':'このコードの基本フォームはまだ対応していません。',
    'invalid-symbol':'コード表記を確認してください。現在の候補は採用できません。',
    'unsupported-symbol':'コード表記を確認してください。現在の候補は採用できません。',
    'unresolved-chord':'コード表記が未確定です。入力を確認してください。',
    'unsupported-capo':'カポ位置を確認してください。対応するのは0〜11フレットです。',
    'invalid-capo':'カポ位置を確認してください。対応するのは0〜11フレットです。',
    'unsupported-tuning':'初版は標準6弦チューニングのみ対応しています。楽器条件を確認してください。',
    'unsupported-owner-tuning':'現在の楽器条件ではフォームを取得できません。',
    'invalid-physical-fret-bound':'楽器の物理フレット上限を確認してください。カポ位置以上、36以下の整数を入力してください。',
    'invalid-instrument-fret-bound':'楽器の物理フレット上限を確認してください。',
    'invalid-generation-range':'この楽器条件ではフォームを取得できません。フレット上限を確認してください。',
    'invalid-played-strings':'このフォームで鳴らせる弦を選んでください。',
    'instrument-confirmation-required':'標準チューニングと楽器のフレット上限を確認してください。',
    'instrument-changed':'採用時と楽器条件が異なります。以前の押さえ方を保持しています。条件を確認して再採用してください。',
    'confirmation-required':'コードまたは演奏条件が変わりました。以前の押さえ方を確認し、必要なら再採用してください。',
    'owner-no-recommendation':'このコードの基本フォームはまだ用意されていません。',
    'owner-form-unavailable':'この楽器条件に合う基本フォームがありません。',
    'invalid-owner-quality':'フォーム情報を正しく取得できません。おすすめを表示し直してください。',
    'invalid-owner-recommendation':'フォーム情報を正しく取得できません。おすすめを表示し直してください。',
    'invalid-owner-response':'フォーム情報を正しく取得できません。おすすめを表示し直してください。',
    'invalid-owner-note':'弦やフレットの情報を確認できません。現在の候補は採用できません。',
    'owner-pitch-mismatch':'フォームの音を確認できません。現在の候補は採用できません。',
    'invalid-owner-barres':'バレーの情報を確認できません。現在の候補は採用できません。',
    'owner-or-input-data-error':'フォーム情報を確認できません。楽器条件を確認し、おすすめを表示し直してください。',
    'owner-version-mismatch':'この候補を確認できません。おすすめを表示し直してください。',
    'unusable-form':'このフォームはまだ採用できません。使用弦や楽器条件を確認してください。',
    'undo-budget':'Undoの容量が不足しています。変更前の内容と履歴は保持しました。',
    'project-budget':'保存容量が不足しています。変更前の内容は保持しました。',
    'quota':'保存容量が不足しています。変更前の内容は保持しました。',
    'capacity':'保存容量が不足しています。変更前の内容は保持しました。',
    'stale-candidate':'コードまたは編集状態が変わりました。もう一度確認してください。',
    'stale-operation':'コードまたは編集状態が変わりました。もう一度確認してください。',
    'external-revision':'保存済みの曲が更新されています。編集中の内容を保持しています。Structureの案内を確認してください。',
    'blocked-session':'入力・保存・競合の状態を確認してください。変更前の内容は保持しました。',
    'input-pending':'文字の変換や入力を確定してから、もう一度確認してください。',
    'missing-or-unresolved-chord':'対象のコードを確認できません。コードを選び直してください。',
    'invalid-project':'曲の内容を確認できません。Structureの案内を確認してください。',
    'invalid-binding':'固定した押さえ方の指定を確認できません。',
    'missing-binding':'固定した押さえ方が見つかりません。対象コードを選び直してください。',
    'unknown-string':'弦の状態が未確定です。現在の候補は採用できません。',
    'unissued-candidate':'この候補は利用できません。おすすめを表示し直してください。',
    'invalid-input':'入力条件を確認してください。変更前の内容は保持しました。'
});
const GENERAL_REASON = 'このフォームはまだ採用できません。使用弦や楽器条件を確認してください。';
export function formMessage(result) {
    const raw = Array.isArray(result) ? result : typeof result === 'string' ? [result] :
        [result?.error || result?.code || ''];
    const codes = [...new Set(raw.flatMap(x => typeof x === 'string' ? x.split('/') : ['']))];
    // Acquisition/whole-form failures precede fixable string-selection diagnostics.
    const order = code => code.startsWith('played-') ? 1 : 0;
    return [...new Set(codes.sort((a,b)=>order(a)-order(b)).map(code => Object.hasOwn(REASON_MESSAGES, code) ? REASON_MESSAGES[code] : GENERAL_REASON))].join('\n') || GENERAL_REASON;
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
    const warning=node('p','',body);warning.id='form-warning';warning.hidden=true;warning.setAttribute('role','status');warning.setAttribute('aria-live','polite');warning.setAttribute('aria-atomic','true');
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

    const adopt=node('button','このコードに採用',controls);adopt.type='button';adopt.id='form-adopt';adopt.disabled=true;
    node('p','採用はこのコードだけに適用します。保存はStudioの「保存」から。演奏フォームの確認であり、完成TABではありません。',body);
    let notice=null;
    function noticeIdentity(){const s=C.documents.getSession(),d=C.documents.ticket(),c=context();return {session:s,documentGeneration:d.generation,workspaceGeneration:c.generation,barId,eventId,version:s?.snapshotVersion,revision:s?.baseRevision};}
    function clearNotice(){notice=null;warning.textContent='';warning.hidden=true;}
    function refreshNotice(){
        if(!notice)return;
        const now=noticeIdentity();
        if(!opened||Object.keys(now).some(k=>now[k]!==notice.identity[k])){clearNotice();return;}
        const s=now.session;
        warning.textContent=notice.action ? notice.action+(s?.dirty ? (s.commitError?'保存できませんでした。未保存の変更は保持しています。':'未保存です。') : '') : notice.text;
        warning.hidden=!warning.textContent;
    }
    function announce(text,action=null){notice={identity:noticeIdentity(),text,action};refreshNotice();}
    function clearCandidate(){frame=null;shown=null;adopt.disabled=true;stringInputs.forEach(x=>{x.checked=false;x.disabled=true;});}
    function getTarget(){return readFormTarget(C.documents.getSession(),barId,eventId);}
    function actionable(){return !disposed&&opened&&!slot.closest('[hidden],[inert]')&&!!getTarget().event&&!!lease.capture(barId,eventId);}
    function paint(snapshot,shape,symbol,playedStrings=null){
        diagram.replaceChildren();if(!snapshot){return;}
        const caption=node('p',symbol+' · '+shape+'型 · カポ '+snapshot.capo,diagram);
        caption.className='form-caption';
        const ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 232 202');svg.setAttribute('role','img');svg.setAttribute('aria-label',symbol+' '+shape+'型。フレットはカポ相対。詳細は下の弦一覧。');
        const notes=snapshot.strings.filter(n=>n.kind==='note'),frets=notes.filter(n=>n.relativeFret>0).map(n=>n.relativeFret),start=Math.max(1,Math.min(...frets,1e3)),count=Math.max(4,Math.max(...frets,start)-start+1),height=132;
        function draw(tag,attrs,text,parent=svg){const n=doc.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;parent.appendChild(n);return n;}
        const x=s=>30+(6-s)*32,y=f=>40+(f-start+0.5)*height/count;
        for(let s=1;s<=6;s++){draw('line',{x1:x(s),x2:x(s),y1:40,y2:172,stroke:'currentColor'});draw('text',{x:x(s),y:194,'text-anchor':'middle'},String(s));}
        for(let f=0;f<=count;f++)draw('line',{x1:30,x2:190,y1:40+f*height/count,y2:40+f*height/count,stroke:'currentColor'});
        draw('text',{x:6,y:54},String(start));
        for(const b of snapshot.barres)draw('line',{x1:x(b.fromString),x2:x(b.toString),y1:y(b.relativeFret),y2:y(b.relativeFret),stroke:'currentColor','stroke-width':9,'stroke-linecap':'round'});
        const states=formStringStates(snapshot,playedStrings);
        for(const n of states){
            const g=draw('g',{'data-diagram-string':n.string,'data-playback':n.playback,class:n.playback==='not-played'?'form-note-unplayed':''});
            if(n.playback==='played'||n.playback==='not-played')draw('text',{x:x(n.string),y:13,'text-anchor':'middle',class:'form-play-marker'},n.playback==='played'?'●':'―',g);
            if(n.kind!=='note'||n.relativeFret===0)draw('text',{x:x(n.string),y:28,'text-anchor':'middle'},n.kind==='muted'?'×':n.kind==='unknown'?'?':'○',g);
            else {draw('circle',{cx:x(n.string),cy:y(n.relativeFret),r:8,fill:'currentColor'},undefined,g);if(n.finger!==null)draw('text',{x:x(n.string),y:y(n.relativeFret)+3,'text-anchor':'middle',class:'form-finger'},String(n.finger),g);}
        }
        diagram.appendChild(svg);
        if(playedStrings!==null)node('p','● 鳴らす ／ ― 鳴らさない ／ × 元フォームのミュート',diagram).className='form-play-legend';
        const list=node('ul',undefined,diagram);
        for(const n of states){
            const position=n.kind!=='note'?'':n.relativeFret===0?'・開放（カポ位置）':'・相対'+n.relativeFret+'／物理'+(snapshot.capo+n.relativeFret)+'フレット'+(n.finger===null?'':'・指'+n.finger);
            const item=node('li',n.string+'弦：'+n.label+position,list);item.dataset.listString=String(n.string);item.dataset.playback=n.playback;
        }
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
        refreshNotice();
        if(!opened)return;
        const t=getTarget();if(!t.event){opened=false;return render();}
        const binding=t.s.draft.performance.formBindings.find(x=>x.chordEventId===eventId);
        if(frame&&!lease.current(frame)){clearCandidate();announce(formMessage('stale-candidate'));}
        change.hidden=remove.hidden=!binding;remove.disabled=!lease.capture(barId,eventId);change.disabled=remove.disabled;
        controls.hidden=!!binding&&mode!=='recommendation';
        if(binding&&mode!=='recommendation'){
            // Saved data is authoritative. Opening/repainting never re-queries the recommendation.
            const p=t.s.workingSnapshot(),material=p.materials.forms.find(m=>m.id===binding.materialId),evaluation=service.evaluate(p,binding);
            status.textContent=(evaluation.ready?'固定':'要確認')+' · '+selector.selectedOptions[0].textContent;
            details.textContent=evaluation.ready?'このコードに固定した押さえ方です。':'以前の押さえ方を保持しています。'+formMessage(evaluation.reasons);
            paint(material.snapshot,material.provenance.shape,material.provenance.sourceSymbol,binding.playedStrings);
        }else {status.textContent='おすすめ（未採用） · '+selector.selectedOptions[0].textContent;if(!shown) {diagram.replaceChildren();details.textContent='カポ '+t.s.draft.instrument.capo+'。楽器条件を確認してください。実音コードとカポ相対の押さえ方を分けて表示します。';}}
    }
    function preview(reset=false){
        if(!actionable())return;
        const token=lease.capture(barId,eventId),t=getTarget();
        if(!token||!confirmed.checked||max.value.trim()===''||!Number.isInteger(max.valueAsNumber)){clearCandidate();announce('入力を確定し、標準チューニングと楽器のフレット上限を明示確認してください。');return;}
        if(reset)clearCandidate();
        if(!reset&&!lease.current(frame)){clearCandidate();announce(formMessage('stale-candidate'));return;}
        const played=stringInputs.filter(x=>x.checked).map(x=>Number(x.dataset.formString));
        const result=adapter.resolve({symbol:t.event.symbol,capo:t.s.draft.instrument.capo,tuningMidi:STANDARD.slice(),maxAbsoluteFret:max.valueAsNumber,...(played.length?{playedStrings:played}:{})});
        frame=token;shown=result;adopt.disabled=true;
        if(!result.display.possible){diagram.replaceChildren();announce(formMessage(result.display.reasons));stringInputs.forEach(x=>x.disabled=true);return;}
        paint(snapshotOf(result),result.form.shape,result.request.soundingSymbol,result.request.playedStrings);
        details.textContent='実音 '+result.request.soundingSymbol+'／カポ '+result.request.capo+'。図のフレット番号はカポから数えます。';
        for(const x of stringInputs)x.disabled=!result.form.notes.some(n=>n.string===Number(x.dataset.formString));
        announce(result.performance.voicingUsable?'使用弦の構成音と最低音を確認しました。保存はまだ行いません。':formMessage(result.performance.reasons));
        adopt.disabled=!result.performance.voicingUsable;
    }
    function open(){if(disposed||!lease.capture(barId,eventId))return;mode='fixed';clearCandidate();confirmed.checked=false;const t=getTarget();max.value=t.s?.draft.instrument.maxAbsoluteFret??'';clearNotice();opened=!opened;render();}
    toggle.addEventListener('click',open);
    selector.addEventListener('change',()=>{if(disposed)return;clearNotice();eventId=selector.value||null;opened=false;mode='fixed';clearCandidate();render();});
    change.addEventListener('click',()=>{if(!actionable())return;mode='recommendation';clearCandidate();confirmed.checked=false;max.value=getTarget().s.draft.instrument.maxAbsoluteFret??'';clearNotice();render();});
    request.addEventListener('click',()=>preview(true));
    const resetPreview=()=>{clearCandidate();clearNotice();};
    confirmed.addEventListener('change',resetPreview);max.addEventListener('input',resetPreview);
    for(const x of stringInputs)x.addEventListener('change',()=>preview(false));
    function apply(removal){
        if(!actionable())return;
        if(!removal&&(!lease.current(frame)||!shown?.performance.voicingUsable)){announce(formMessage('stale-candidate'));adopt.disabled=true;return;}
        const h=removal?service.prepareRemoval({barId,chordEventId:eventId}):service.prepare({barId,chordEventId:eventId,instrument:{confirmed:confirmed.checked,tuningMidi:STANDARD.slice(),maxAbsoluteFret:max.valueAsNumber},playedStrings:stringInputs.filter(x=>x.checked).map(x=>Number(x.dataset.formString))});
        const result=h.ok?service.apply(h):h;
        if(!result.ok){announce(formMessage(result));return;}
        mode='fixed';clearCandidate();render();announce('',removal?'押さえ方の指定を解除しました。':'このコードに採用しました。');
    }
    adopt.addEventListener('click',()=>apply(false));remove.addEventListener('click',()=>apply(true));
    // Defer all UI work: no owner query/schema clone on the melody command's synchronous path.
    function schedule(){if(!raf&&!disposed)raf=requestAnimationFrame(()=>{raf=0;render();});}
    let offs=[];
    function connect(){if(disposed||offs.length)return;offs=[C.sheetCruise.subscribeSelection(schedule),C.sessions.subscribe(schedule),C.documents.subscribe(schedule)];render();}
    function disconnect(){offs.forEach(off=>off());offs=[];cancelAnimationFrame(raf);raf=0;}
    function hide(){globalThis.removeEventListener('pagehide',hide);opened=false;clearCandidate();clearNotice();disconnect();render();}
    function show(event){if(event.persisted&&!disposed){globalThis.addEventListener('pagehide',hide,{once:true});connect();}}
    globalThis.addEventListener('pagehide',hide,{once:true});globalThis.addEventListener('pageshow',show);connect();
    return Object.freeze({dispose(){if(disposed)return;disposed=true;disconnect();globalThis.removeEventListener('pagehide',hide);globalThis.removeEventListener('pageshow',show);opened=false;clearCandidate();slot.replaceChildren();}});
}
function initialize(){const C=globalThis.CruiseStudio;if(C?.shellHost&&!C.formPanel)C.formPanel=mountFormPanel({C,document});}
if(typeof document!=='undefined'){if(globalThis.CruiseStudio?.shellHost)initialize();else document.addEventListener('DOMContentLoaded',initialize,{once:true});}
