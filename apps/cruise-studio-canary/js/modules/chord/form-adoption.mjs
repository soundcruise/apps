import { CHORD_FORM_ADAPTER_VERSION } from './form-adapter.mjs';
import { materialFromResult, contentKey, basisKey, evaluateBinding, freezeData } from './form-snapshot.mjs';
const clone = x => JSON.parse(JSON.stringify(x));
const reject = (code, error) => ({ ok: false, code, ...(error ? { error } : {}) });
// Host injects the released v2 adapter and existing active document/Session/Repository.
// Issued handles are memory-only capabilities for this service, not Pro authorization.
export function createFormAdoptionService({ owner, schema, adapter, repository, getContext, chordTheory, parseChordSymbol, ownerVersion }) {
    if (typeof ownerVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(ownerVersion) || CHORD_FORM_ADAPTER_VERSION !== '2') throw TypeError('Explicit released owner/adapter version required');
    const issued = new WeakMap();
    function capture(barId, chordEventId, ownOperation = false, resolvedRequired = true) {
        const s = owner.getSession(), doc = owner.ticket(), c = getContext();
        if (!s || s.draft.schemaVersion !== 2 || s.destroyed || s.inputPending || s.commitInFlight || s.externalUpdatePending || s.conflict ||
            c.blocked || c.workspaceId !== 'sheetCruise' || s.getHistory().openGroup && !ownOperation) throw Error('blocked-session');
        const raw = repository.readRevision(s.target);
        if (!raw.ok || raw.revision !== s.baseRevision || !raw.exists && s.baseRevision !== null) throw Error('external-revision');
        const p = s.workingSnapshot(), check = schema.validate(p);
        if (!check.ok) throw Error('invalid-project');
        const b = p.bars.find(b => b.id === barId), event = b?.chords.find(e => e.id === chordEventId);
        if (!event || resolvedRequired && event.unresolved) throw Error('missing-or-unresolved-chord');
        return { project: p, event, session: s, sessionId: s.sessionId, projectId: p.projectId, documentGeneration: doc.generation,
            workspaceGeneration: c.generation, workspaceId: c.workspaceId, snapshotVersion: s.snapshotVersion, baseRevision: s.baseRevision, barId, chordEventId, resolvedRequired };
    }
    function current(old, ownOperation = false) {
        const now = capture(old.barId, old.chordEventId, ownOperation, old.resolvedRequired);
        for (const k of ['session','sessionId','projectId','documentGeneration','workspaceGeneration','workspaceId','snapshotVersion','baseRevision'])
            if (now[k] !== old[k]) throw Error('stale-candidate');
        return now;
    }
    function prepare(input) {
        try {
            schema.assertJson(input);
            if (!input || Object.keys(input).some(k => !['barId','chordEventId','instrument','playedStrings','generation'].includes(k))) throw Error('invalid-input');
            const frame = capture(input.barId,input.chordEventId), instrument = input.instrument;
            if (!instrument || Object.keys(instrument).some(k => !['confirmed','tuningMidi','maxAbsoluteFret'].includes(k)) || instrument.confirmed !== true) throw Error('instrument-confirmation-required');
            const result = adapter.resolve({ symbol: frame.event.symbol, capo: frame.project.instrument.capo,
                tuningMidi: instrument.tuningMidi, maxAbsoluteFret: instrument.maxAbsoluteFret, playedStrings: input.playedStrings,
                ...(input.generation ? { generation: input.generation } : {}) });
            const material = materialFromResult(result);
            if (material.provenance.ownerVersion !== ownerVersion || material.provenance.adapterVersion !== CHORD_FORM_ADAPTER_VERSION) throw Error('owner-version-mismatch');
            const handle = freezeData({ ok: true, kind: 'adopt', preview: result });
            issued.set(handle,{ frame, material: freezeData(material), playedStrings: result.request.playedStrings.slice().sort((a,b)=>a-b) });
            return handle;
        } catch (error) { return reject('prepare-rejected',error.message); }
    }
    function prepareRemoval(input) {
        try { schema.assertJson(input);const frame=capture(input.barId,input.chordEventId,false,false), handle=freezeData({ok:true,kind:'remove'});issued.set(handle,{frame});return handle; }
        catch(error){return reject('prepare-rejected',error.message);}
    }
    function apply(handle) {
        if (!handle || typeof handle !== 'object' || !issued.has(handle)) return reject('unissued-candidate');
        try {
            const data=issued.get(handle), now=current(data.frame), s=now.session;
            const result=s.runOperation(handle.kind === 'remove' ? 'フォーム指定を解除' : 'コードフォームを採用',p=>{
                current(data.frame, true); // All late work finished before the synchronous operation.
                const event=p.bars.find(b=>b.id===now.barId).chords.find(e=>e.id===now.chordEventId);
                if(handle.kind === 'remove') { p.performance.formBindings=p.performance.formBindings.filter(b=>b.chordEventId!==event.id);return; }
                const fresh=clone(data.material), key=contentKey(fresh);
                let material=p.materials.forms.find(m=>contentKey(m)===key);
                if(!material){material={id:schema.newId(),...fresh};p.materials.forms.push(material);}
                p.instrument.tuning=fresh.snapshot.tuningMidi.slice();p.instrument.maxAbsoluteFret=fresh.snapshot.maxAbsoluteFret;
                const previous=p.performance.formBindings.find(b=>b.chordEventId===event.id);
                const binding={id:previous?previous.id:schema.newId(),chordEventId:event.id,materialId:material.id,playedStrings:data.playedStrings.slice(),mode:'fixed',confirmation:{status:'confirmed',basisKey:basisKey(p,event,material,data.playedStrings)}};
                p.performance.formBindings=p.performance.formBindings.filter(b=>b.chordEventId!==event.id);p.performance.formBindings.push(binding);
                const check=schema.validate(p);if(!check.ok)throw Error(check.errors.join('/'));
                const readiness=evaluateBinding(p,binding,{schema,chordTheory,parseChordSymbol});if(!readiness.ready)throw Error(readiness.reasons.join('/'));
            },{requireUndo:true,preserveAppliedUndo:true});
            if(result.ok)issued.delete(handle);
            return result;
        } catch(error){return reject('adoption-rejected',error.message);}
    }
    return Object.freeze({prepare,prepareRemoval,apply,evaluate:(project,binding)=>evaluateBinding(project,binding,{schema,chordTheory,parseChordSymbol})});
}
