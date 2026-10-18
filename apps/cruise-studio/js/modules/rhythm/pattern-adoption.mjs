/* R5 explicit, memory-only adoption orchestration. Not registered in product boot/UI. */
const clone=value=>JSON.parse(JSON.stringify(value));
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function canonical(value){if(!value||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';}
function key(material){const value={...material};delete value.id;return canonical(value);}
const reject=(code,error)=>({ok:false,code,...(error?{error}: {})});
export function createRhythmAdoptionService({owner,schema,rhythmSnapshots,adapter,repository,getContext}){
    const issued=new WeakMap();
    function input(value,fields){schema.assertJson(value);if(!value||Array.isArray(value)||Object.keys(value).some(k=>!fields.includes(k)))throw Error('invalid-input');}
    function target(value){input(value,['kind','barIds']);if(value.kind==='basic'&&Object.keys(value).length===1)return {kind:'basic'};if(value.kind!=='bars'||!Array.isArray(value.barIds)||value.barIds.length<1||value.barIds.length>2048||new Set(value.barIds).size!==value.barIds.length||!value.barIds.every(id=>typeof id==='string'&&id.length>0))throw Error('invalid-target');return {kind:'bars',barIds:value.barIds.slice()};}
    function capture(t,ownOperation=false){
        const session=owner.getSession(),ticket=owner.ticket(),context=getContext(),history=session?.getHistory();
        if(!session||session.draft.schemaVersion!==2||session.destroyed||session.closing||session.inputPending||session.commitInFlight||session.externalUpdatePending||session.conflict||context.blocked||context.workspaceId!=='sheetCruise'||history.textGroup||history.openGroup&&!ownOperation)throw Error('blocked-session');
        const revision=repository.readRevision(session.target);
        if(!revision.ok||revision.revision!==session.baseRevision||!revision.exists&&session.baseRevision!==null)throw Error('external-revision');
        const project=session.workingSnapshot();if(!schema.validate(project).ok)throw Error('invalid-project');
        if(t.kind==='bars'&&!t.barIds.every(id=>project.bars.some(b=>b.id===id)))throw Error('missing-bar');
        return {project,session,sessionId:session.sessionId,projectId:project.projectId,documentGeneration:ticket.generation,workspaceId:context.workspaceId,workspaceGeneration:context.generation,snapshotVersion:session.snapshotVersion,baseRevision:session.baseRevision,historyEpoch:history.epoch};
    }
    function current(frame,t,ownOperation=false){const now=capture(t,ownOperation);for(const k of['session','sessionId','projectId','documentGeneration','workspaceId','workspaceGeneration','snapshotVersion','baseRevision','historyEpoch'])if(frame[k]!==now[k])throw Error('stale-candidate');return now;}
    function issue(frame,t,material,kind,preview){const handle=freeze({ok:true,kind,target:clone(t),preview:preview||null});issued.set(handle,{frame,target:t,material:material&&freeze(clone(material)),key:material&&key(material)});return handle;}
    function prepare(value){try{
        input(value,['patternId','patternRevision','target']);if(value.patternRevision!==1||typeof value.patternId!=='string')throw Error('unsupported-pattern');const t=target(value.target),frame=capture(t);
        if(!adapter||adapter.ok!==true)throw Error('owner-unavailable');const result=adapter.getOfficialPattern(value.patternId,{patternRevision:value.patternRevision});schema.assertJson(result);
        if(!result.ok)throw Error(result.error.code);current(frame,t);
        const material={id:'prepared-rhythm',encoding:'rhythm-owner-cells-v1',snapshot:clone(result.nativeSnapshot),provenance:{origin:'user-set',source:clone(result.source),adapterVersion:1}},r=rhythmSnapshots.readRhythmMaterial(material);
        if(!r.ok)throw Error(r.error.code);return issue(frame,t,r.material,'adopt',r.projection);
    }catch(error){return reject('prepare-rejected',error.message);}}
    function prepareReuse(value){try{input(value,['materialId','target']);const t=target(value.target),frame=capture(t),material=frame.project.materials.rhythms.find(m=>m.id===value.materialId);if(!material)throw Error('missing-material');return issue(frame,t,material,'reuse');}catch(error){return reject('prepare-rejected',error.message);}}
    function prepareClear(value){try{input(value,['barIds']);const t=target({kind:'bars',barIds:value.barIds}),frame=capture(t);return issue(frame,t,null,'clear');}catch(error){return reject('prepare-rejected',error.message);}}
    function apply(handle){
        if(!handle||typeof handle!=='object'||!issued.has(handle))return reject('unissued-candidate');
        const data=issued.get(handle);issued.delete(handle); // failure also invalidates the candidate
        try{
            const now=current(data.frame,data.target),s=now.session;
            let existing=data.material&&now.project.materials.rhythms.find(m=>key(m)===data.key);
            const noChange=handle.kind==='clear'?!now.project.performance.barRhythms.some(b=>data.target.barIds.includes(b.barId)):existing&&(data.target.kind==='basic'?now.project.performance.basicRhythmId===existing.id:data.target.barIds.every(id=>now.project.performance.barRhythms.some(b=>b.barId===id&&b.materialId===existing.id)));
            if(noChange)return {ok:true,recorded:false};
            return s.runOperation(handle.kind==='clear'?'小節リズム指定を解除':'リズム素材を採用',project=>{
                current(data.frame,data.target,true);
                if(handle.kind==='clear'){project.performance.barRhythms=project.performance.barRhythms.filter(b=>!data.target.barIds.includes(b.barId));return;}
                let material=project.materials.rhythms.find(m=>key(m)===data.key);
                if(!material){material=clone(data.material);material.id=schema.newId();project.materials.rhythms.push(material);}
                if(data.target.kind==='basic')project.performance.basicRhythmId=material.id;
                else for(const barId of data.target.barIds){const binding=project.performance.barRhythms.find(b=>b.barId===barId);if(binding)binding.materialId=material.id;else project.performance.barRhythms.push({id:schema.newId(),barId,materialId:material.id});}
                // Session owns full validation, immutable guards, Project/history reservation and publication.
            },{requireUndo:true,preserveAppliedUndo:true});
        }catch(error){return reject('adoption-rejected',error.message);}
    }
    return Object.freeze({prepare,prepareReuse,prepareClear,apply});
}
