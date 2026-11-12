import {contentKey,basisKey,evaluateBinding,ownerQuality} from './form-snapshot.mjs';
import {getAppVersion} from '../../core/component-metadata.mjs';
export const STANDARD=[64,59,55,50,45,40];
const clone=x=>JSON.parse(JSON.stringify(x));
// Explicitly installed by the isolated local entry. All edits use the active Session.
export function createFormAuthoring(C,base){
    const schema=C.model.schema2,ownerVersion=getAppVersion('chord-cruise'),instrumentConsent=new WeakMap();
    function material(snapshot,symbol,origin='manual',externalMaterialId=null,shape=null,recommendationSource=null){
        return {encoding:'studio-chord-form-v2',snapshot:clone(snapshot),provenance:{origin,ownerApp:'chord-cruise',ownerVersion,adapterVersion:'3',sourceSymbol:symbol,shape,recommendationSource,generation:{minRelativeFret:0,maxRelativeFret:snapshot.maxAbsoluteFret-snapshot.capo},externalMaterialId}};
    }
    function recommend(p,symbol,shape=null,generation=null){
        const parsed=C.theory.parseBasicChordSymbol(symbol);if(!parsed)return null;
        const root=base.theory.parseSpelledNoteName(parsed.root);if(!root)return null;
        const quality=ownerQuality(base.theory,parsed.quality);if(!quality)return null;
        const capo=p.instrument.capo,max=p.instrument.maxAbsoluteFret??22,formRoot=(root.pc-capo+12)%12;
        const min=generation?.minRelativeFret??0,end=Math.min(generation?.maxRelativeFret??13,max-capo);if(!Number.isInteger(min)||!Number.isInteger(end)||min<0||end<min)return null;
        const recommendation=base.caged.getCommonForm(quality,formRoot,end,min);if(!recommendation&&!shape)return null;
        const selected=shape||recommendation.shape,raw=base.caged.getForm(selected,quality,formRoot,end,min);if(!raw?.available)return null;
        // Explicit owner warnings are removed from this candidate, never silently played.
        // Missing strings must have an explicit owner mute, not an invented state.
        const notes=raw.notes.filter(n=>!n.fingeringWarning),removed=raw.notes.filter(n=>n.fingeringWarning).map(n=>n.string);
        if(!notes.length||[1,2,3,4,5,6].some(s=>!raw.notes.some(n=>n.string===s)&&!raw.mutedStrings.includes(s)))return null;
        const snapshot={capo,tuningMidi:(p.instrument.tuning||STANDARD).slice(),maxAbsoluteFret:max,
            strings:[1,2,3,4,5,6].map(string=>{const n=notes.find(n=>n.string===string);return n?{string,kind:'note',relativeFret:n.fret,finger:n.finger??null,fingeringWarning:false}:{string,kind:'muted'};}),
            barres:base.caged.detectBarres(notes).map(b=>({finger:b.finger,relativeFret:b.fret,fromString:b.fromString,toString:b.toString})),
            playability:raw.playability??'unknown',ownerWarning:raw.warning||null};
        if(removed.length)snapshot.ownerWarning='注意付きの弦を省略。構成音と演奏条件は要確認';
        if(raw.hasOutOfRangeNotes!==false||raw.omittedNoteCount!==0||!Array.isArray(raw.outOfRangeNotes)||raw.outOfRangeNotes.length)snapshot.ownerWarning='元フォームに範囲外または未確認の音があります';
        const overridden=shape&&shape!==recommendation?.shape;
        const result=material(snapshot,symbol,overridden?'manual':'owner-recommendation',null,selected,overridden?null:recommendation?.source||'recommended');
        result.provenance.generation={minRelativeFret:min,maxRelativeFret:end};return result;
    }
    function install(p,event,m,mode='fixed'){
        const prior=p.performance.formBindings.find(b=>b.chordEventId===event.id),key=contentKey(m);
        let stored=p.materials.forms.find(x=>contentKey(x)===key);if(!stored){stored={id:schema.newId(),...clone(m)};p.materials.forms.push(stored);}
        const playedStrings=stored.snapshot.strings.filter(n=>n.kind==='note').map(n=>n.string);
        const b={id:prior?.id||schema.newId(),chordEventId:event.id,materialId:stored.id,playedStrings,mode,confirmation:{status:'confirmed',basisKey:basisKey(p,event,stored,playedStrings)}};
        p.performance.formBindings=p.performance.formBindings.filter(x=>x.chordEventId!==event.id);p.performance.formBindings.push(b);
        const result=evaluateBinding(p,b,{schema,chordTheory:base.theory,parseChordSymbol:C.theory.parseBasicChordSymbol});
        if(!result.ready)b.confirmation={status:'unconfirmed',basisKey:null};
        return result;
    }
    function initialize(p){if(p.instrument.tuning===null)p.instrument.tuning=STANDARD.slice();if(p.instrument.maxAbsoluteFret===undefined)p.instrument.maxAbsoluteFret=22;}
    function authorize(session){
        const i=session.draft.instrument;if(i.tuning!==null&&i.maxAbsoluteFret!==undefined||session.baseRevision===null)return true;
        // Consent is scoped to this Session and the exact unresolved conditions.
        // Never persist a new setting or mutate the Project just to hide a prompt.
        const key=JSON.stringify([session.draft.projectId,i.capo,i.tuning,i.maxAbsoluteFret??null]);if(instrumentConsent.get(session)===key)return true;
        const defaults=[i.tuning===null?'標準6弦':null,i.maxAbsoluteFret===undefined?'22フレット':null].filter(Boolean).join('・');
        if(!window.confirm('このProjectの未登録の楽器条件に、'+defaults+'を使いますか？ 既存の設定・フォームは保持します。'))return false;
        instrumentConsent.set(session,key);return true;
    }
    function syncEvent(p,event){
        const previous=p.performance.formBindings.find(b=>b.chordEventId===event.id);if(previous&&previous.mode!=='auto')return;
        const m=event.unresolved?null:recommend(p,event.symbol);
        if(m){initialize(p);install(p,event,m,'auto');}else p.performance.formBindings=p.performance.formBindings.filter(b=>b.chordEventId!==event.id);
    }
    function reconcile(p,before){if(p.schemaVersion!==2)return;const old=new Map(before.bars.flatMap(b=>b.chords).map(e=>[e.id,e.symbol]));for(const e of p.bars.flatMap(b=>b.chords)){const exists=p.performance.formBindings.some(b=>b.chordEventId===e.id);if(old.has(e.id)?old.get(e.id)!==e.symbol:!exists)syncEvent(p,e);}}
    function adopt(session,barId,eventId,m){
        try{
            const c=C.shellHost.getCommandContext(),raw=C.repository.readRevision(session.target);
            if(C.documents.getSession()!==session||session.destroyed||session.inputPending||session.commitInFlight||session.conflict||session.externalUpdatePending||C.shellHost.getActiveWorkspace()!=='sheetCruise'||c.activeModal||C.shellHost.modal.getActive()||C.shellHost.keyboard.isIMEBlocked({})||!raw.ok||raw.revision!==session.baseRevision)throw Error('編集対象・保存状態を確認してください');
            if(!authorize(session))throw Error('楽器条件の確認をキャンセルしました');
            schema.assertJson(m);const copy=clone(m);session.finishTextGroup();
            return session.runOperation('コードフォームを固定',p=>{const e=p.bars.find(b=>b.id===barId)?.chords.find(e=>e.id===eventId);if(!e||e.symbol!==copy.provenance.sourceSymbol)throw Error('コードの選択が変わりました');
                initialize(p);if(p.instrument.capo!==copy.snapshot.capo||JSON.stringify(p.instrument.tuning)!==JSON.stringify(copy.snapshot.tuningMidi)||p.instrument.maxAbsoluteFret!==copy.snapshot.maxAbsoluteFret)throw Error('フォームとProjectの楽器条件が一致しません');
                install(p,e,copy,'fixed');const valid=schema.validate(p);if(!valid.ok)throw Error(valid.errors.join('/'));},{requireUndo:true,preserveAppliedUndo:true});
        }catch(e){return {ok:false,error:e.message};}
    }
    return Object.freeze({material,recommend,install,initialize,authorize,syncEvent,reconcile,adopt,evaluate:(p,b)=>evaluateBinding(p,b,{schema,chordTheory:base.theory,parseChordSymbol:C.theory.parseBasicChordSymbol})});
}
