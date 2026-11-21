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
        const selected=shape||recommendation.shape,raw=base.caged.getForm(selected,quality,formRoot,end,min,{variant:generation?.formVariant});if(!raw?.available)return null;
        // Explicit owner warnings are removed from this candidate, never silently played.
        // Missing strings must have an explicit owner mute, not an invented state.
        const notes=raw.notes.filter(n=>!n.fingeringWarning),removed=raw.notes.filter(n=>n.fingeringWarning).map(n=>n.string);
        if(!notes.length||[1,2,3,4,5,6].some(s=>!raw.notes.some(n=>n.string===s)&&!raw.mutedStrings.includes(s)))return null;
        const snapshot={capo,tuningMidi:(p.instrument.tuning||STANDARD).slice(),maxAbsoluteFret:max,
            strings:[1,2,3,4,5,6].map(string=>{const n=notes.find(n=>n.string===string);return n?{string,kind:'note',relativeFret:n.fret,finger:n.finger??null,fingeringWarning:false}:{string,kind:'muted'};}),
            barres:base.caged.detectBarres(notes).map(b=>({finger:b.finger,relativeFret:b.fret,fromString:b.fromString,toString:b.toString})),
            playability:raw.playability??'unknown',ownerWarning:raw.formVariant==='fm7-open'?null:(raw.warning||null)};
        if(removed.length)snapshot.ownerWarning='注意付きの弦を省略。構成音と演奏条件は要確認';
        if(raw.hasOutOfRangeNotes!==false||raw.omittedNoteCount!==0||!Array.isArray(raw.outOfRangeNotes)||raw.outOfRangeNotes.length)snapshot.ownerWarning='元フォームに範囲外または未確認の音があります';
        const overridden=shape&&shape!==recommendation?.shape;
        const result=material(snapshot,symbol,overridden?'manual':'owner-recommendation',null,selected,overridden?null:recommendation?.source||'recommended');
        result.provenance.generation={minRelativeFret:min,maxRelativeFret:end};return result;
    }
    function storeMaterial(project, material) {
        const key=contentKey(material);
        const prior=project.materials.forms.find(form=>contentKey(form)===key);
        if(prior)return prior;
        const stored={...clone(material),id:schema.newId()};
        project.materials.forms.push(stored);
        return stored;
    }
    // A display edit can share the musical material with other events. Keep their
    // original diagram, played strings, playback confirmation and binding mode.
    function setDisplayRange(session,eventId,materialId,range) {
        return session.runOperation('フォームの表示範囲',p=>{
            const binding=p.performance.formBindings.find(b=>b.chordEventId===eventId);
            if(!binding||binding.materialId!==materialId)throw Error('対象のフォームが変わりました');
            const copy=clone(p.materials.forms.find(m=>m.id===materialId));
            if(range)copy.snapshot.displayRange=range;
            else delete copy.snapshot.displayRange;
            binding.materialId=storeMaterial(p,copy).id;
        },{requireUndo:true,preserveAppliedUndo:true});
    }
    function install(p,event,m,mode='fixed',selectedStrings){
        const prior=p.performance.formBindings.find(b=>b.chordEventId===event.id);
        const stored=storeMaterial(p,m);
        const playedStrings=selectedStrings===undefined?stored.snapshot.strings.filter(n=>n.kind==='note').map(n=>n.string):selectedStrings.slice();
        const b={id:prior?.id||schema.newId(),chordEventId:event.id,materialId:stored.id,playedStrings,mode,confirmation:{status:'confirmed',basisKey:basisKey(p,event,stored,playedStrings)}};
        p.performance.formBindings=p.performance.formBindings.filter(x=>x.chordEventId!==event.id);p.performance.formBindings.push(b);
        // Session draft arrays clone inserted objects; update the attached binding.
        const installed=p.performance.formBindings.find(x=>x.id===b.id);
        const result=evaluateBinding(p,installed,{schema,chordTheory:base.theory,parseChordSymbol:C.theory.parseBasicChordSymbol});
        if(!result.ready)installed.confirmation={status:'unconfirmed',basisKey:null};
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
    function reconcile(p,before){if(p.schemaVersion!==2)return;const instrumentChanged=JSON.stringify(p.instrument)!==JSON.stringify(before.instrument);const old=new Map(before.bars.flatMap(b=>b.chords).map(e=>[e.id,e.symbol]));for(const e of p.bars.flatMap(b=>b.chords)){const exists=p.performance.formBindings.some(b=>b.chordEventId===e.id);if(instrumentChanged||(old.has(e.id)?old.get(e.id)!==e.symbol:!exists))syncEvent(p,e);}}
    function adopt(session,barId,eventId,m,selectedStrings){
        try{
            const c=C.shellHost.getCommandContext(),raw=C.repository.readRevision(session.target);
            if(C.documents.getSession()!==session||session.destroyed||session.inputPending||session.commitInFlight||session.conflict||session.externalUpdatePending||C.shellHost.getActiveWorkspace()!=='sheetCruise'||c.activeModal||C.shellHost.modal.getActive()||C.shellHost.keyboard.isIMEBlocked({})||!raw.ok||raw.revision!==session.baseRevision)throw Error('編集対象・保存状態を確認してください');
            if(!authorize(session))throw Error('楽器条件の確認をキャンセルしました');
            schema.assertJson(m);const copy=clone(m);session.finishTextGroup();
            return session.runOperation('コードフォームを固定',p=>{const e=p.bars.find(b=>b.id===barId)?.chords.find(e=>e.id===eventId);if(!e||e.symbol!==copy.provenance.sourceSymbol)throw Error('コードの選択が変わりました');
                initialize(p);if(p.instrument.capo!==copy.snapshot.capo||JSON.stringify(p.instrument.tuning)!==JSON.stringify(copy.snapshot.tuningMidi)||p.instrument.maxAbsoluteFret!==copy.snapshot.maxAbsoluteFret)throw Error('フォームとProjectの楽器条件が一致しません');
                install(p,e,copy,'fixed',selectedStrings);const valid=schema.validate(p);if(!valid.ok)throw Error(valid.errors.join('/'));},{requireUndo:true,preserveAppliedUndo:true});
        }catch(e){return {ok:false,error:e.message};}
    }
    function replaceCatalogueForms(session,ids,symbol,replacement,range){
        const revision=C.repository.readRevision(session.target);
        if(C.documents.getSession()!==session||session.destroyed||session.inputPending||session.commitInFlight||
           session.conflict||session.externalUpdatePending||C.shellHost.getActiveWorkspace()!=='sheetCruise'||
           !revision.ok||revision.revision!==session.baseRevision)return {ok:false,error:'編集対象が変わりました。開き直してください。'};
        if(!authorize(session))return {ok:false,error:'楽器条件の確認をキャンセルしました。'};
        return session.runOperation('コードとフォームを一括変更',p=>{
            const playKey=schema.readStructureProjection(p).songInfo.playKey;
            const wanted=new Set(ids),bindings=new Map(p.performance.formBindings.map(b=>[b.chordEventId,b]));
            const forms=new Map(p.materials.forms.map(m=>[m.id,m])),groups=new Map(),copies=new Map();
            initialize(p);
            for(const bar of p.bars)for(const event of bar.chords){
                if(!wanted.delete(event.id))continue;
                const binding=bindings.get(event.id),old=forms.get(binding?.materialId);
                if(!old)throw Error('対象のフォームが見つかりません。');
                const originalId=old.id;
                // A rename retains each occurrence's muted notes and played-string selection.
                const sourceKey=replacement?'replacement':originalId;
                let stored=copies.get(sourceKey);
                if(!stored){
                    const source=replacement||old;
                    if(source.snapshot.capo!==p.instrument.capo||source.snapshot.maxAbsoluteFret!==p.instrument.maxAbsoluteFret||
                        JSON.stringify(source.snapshot.tuningMidi)!==JSON.stringify(p.instrument.tuning))throw Error('曲とフォームの楽器条件が異なります。');
                    const next=!replacement&&symbol===event.symbol?clone(old):material(source.snapshot,symbol,'manual',null,source.provenance.shape);
                    if(range!==undefined){
                        if(range)next.snapshot.displayRange=range;else delete next.snapshot.displayRange;
                    }
                    stored=storeMaterial(p,next);
                    copies.set(sourceKey,stored);
                }
                binding.materialId=stored.id;
                // A display-only change keeps the original musical binding and its confirmation.
                if(!replacement&&symbol===event.symbol)continue;
                if(event.symbol!==symbol){
                    event.symbol=symbol;event.unresolved=false;
                    event.provenance={origin:'user-set',sourceBasis:{playKey,capo:p.instrument.capo}};
                }
                if(replacement)binding.playedStrings=stored.snapshot.strings.filter(n=>n.kind==='note').map(n=>n.string);
                binding.mode='fixed';
                binding.confirmation={status:'confirmed',basisKey:basisKey(p,event,stored,binding.playedStrings)};
                const key=JSON.stringify([stored.id,binding.playedStrings]);
                if(!groups.has(key))groups.set(key,[]);
                groups.get(key).push(binding);
            }
            if(wanted.size)throw Error('編集対象のコードが変わりました。');
            for(const group of groups.values()){
                const result=evaluateBinding(p,group[0],{schema,chordTheory:base.theory,parseChordSymbol:C.theory.parseBasicChordSymbol});
                if(!result.ready)for(const binding of group)binding.confirmation={status:'unconfirmed',basisKey:null};
            }
        },{requireUndo:true,preserveAppliedUndo:true});
    }
    function configureStrings(session,barId,eventId,playedStrings,remove=false){
        try{const c=C.shellHost.getCommandContext(),raw=C.repository.readRevision(session.target);if(C.documents.getSession()!==session||session.destroyed||session.inputPending||session.commitInFlight||session.conflict||session.externalUpdatePending||C.shellHost.getActiveWorkspace()!=='sheetCruise'||c.activeModal||C.shellHost.modal.getActive()||C.shellHost.keyboard.isIMEBlocked({})||!raw.ok||raw.revision!==session.baseRevision)throw Error('編集対象・入力状態を確認してください');
            return session.runOperation(remove?'コードフォームを解除':'鳴らす弦を変更',p=>{const event=p.bars.find(b=>b.id===barId)?.chords.find(e=>e.id===eventId),binding=p.performance.formBindings.find(b=>b.chordEventId===eventId);if(!event||!binding)throw Error('対象コードのフォームが変わりました');if(remove){p.performance.formBindings=p.performance.formBindings.filter(b=>b.id!==binding.id);return;}
                const m=p.materials.forms.find(m=>m.id===binding.materialId);binding.playedStrings=playedStrings.slice();binding.confirmation={status:'unconfirmed',basisKey:null};const key=basisKey(p,event,m,playedStrings);binding.confirmation={status:'confirmed',basisKey:key};const result=evaluateBinding(p,binding,{schema,chordTheory:base.theory,parseChordSymbol:C.theory.parseBasicChordSymbol});if(!result.ready)binding.confirmation={status:'unconfirmed',basisKey:null};const valid=schema.validate(p);if(!valid.ok)throw Error(valid.errors.join('/'));
            },{requireUndo:true});
        }catch(e){return {ok:false,error:e.message};}
    }
    // Presets carry a portable shape and string selection, never a foreign material ID.
    function installPreset(project,event,form) {
        initialize(project);
        const m=clone(form.material), snap=m.snapshot;
        if (JSON.stringify(snap.tuningMidi)!==JSON.stringify(project.instrument.tuning))
            throw Error('保存したフォームと曲のチューニングが異なります');
        const from=C.theory.parseBasicChordSymbol(form.playSymbol);
        const to=C.theory.parseBasicChordSymbol(schema.chord(event.symbol,-project.instrument.capo));
        if (!from || !to || from.quality!==to.quality) throw Error('保存したフォームのコードを確認してください');
        const delta=(C.theory.keyToSemitone(to.root)-C.theory.keyToSemitone(from.root)+12)%12;
        const limit=project.instrument.maxAbsoluteFret-project.instrument.capo;
        const notes=snap.strings.filter(n=>n.kind==='note');
        const shift=[delta,delta-12,delta+12,-24+delta].sort((a,b)=>Math.abs(a)-Math.abs(b))
            .find(s=>notes.every(n=>n.relativeFret+s>=0 && n.relativeFret+s<=limit));
        if (shift===undefined) throw Error('このキーでは保存したフォームが指板に収まりません');
        for(const n of notes) {
            n.relativeFret+=shift;
            if(n.relativeFret===0)n.finger=null;
        }
        snap.barres=snap.barres.map(b=>({...b,relativeFret:b.relativeFret+shift})).filter(b=>b.relativeFret>0);
        if(snap.displayRange){
            if(limit>0)snap.displayRange={min:Math.max(1,Math.min(limit,snap.displayRange.min+shift)),max:Math.max(1,Math.min(limit,snap.displayRange.max+shift))};
            else delete snap.displayRange;
        }
        snap.capo=project.instrument.capo;snap.maxAbsoluteFret=project.instrument.maxAbsoluteFret;
        m.provenance.sourceSymbol=event.symbol;
        if (shift || m.provenance.generation.maxRelativeFret>limit) m.provenance.generation={minRelativeFret:0,maxRelativeFret:limit};
        delete m.id;
        install(project,event,m,'fixed',form.playedStrings);
        if (form.confirmed===false) {
            const binding=project.performance.formBindings.find(b=>b.chordEventId===event.id);
            binding.confirmation={status:'unconfirmed',basisKey:null};
        }
    }
    function duplicateBinding(project, original, event, binding, material) {
        const confirmed = binding.confirmation.status === 'confirmed' &&
            binding.confirmation.basisKey === basisKey(project, original, material, binding.playedStrings);
        return {
            ...clone(binding),
            id: schema.newId(),
            chordEventId: event.id,
            confirmation: confirmed
                ? {status:'confirmed', basisKey:basisKey(project, event, material, binding.playedStrings)}
                : {status:'unconfirmed', basisKey:null}
        };
    }
    return Object.freeze({replaceCatalogueForms,setDisplayRange,configureStrings,duplicateBinding,installPreset,material,recommend,install,initialize,authorize,syncEvent,reconcile,adopt,evaluate:(p,b)=>evaluateBinding(p,b,{schema,chordTheory:base.theory,parseChordSymbol:C.theory.parseBasicChordSymbol})});
}
