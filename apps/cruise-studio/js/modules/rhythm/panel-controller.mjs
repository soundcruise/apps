/* UI candidate lifetime only. The existing R5 service remains the sole adoption owner. */
import {createRhythmAdoptionService} from './pattern-adoption.mjs?v=0.47.10';
export function selectionBarIds(selection,project){
    if(!selection?.active||selection.invalid||selection.deleted||selection.editing||!selection.barId||selection.barNumbers?.length!==1)return [];
    return project.bars.some(b=>b.id===selection.barId)?[selection.barId]:[];
}
export function createRhythmPanelController({owner,schema,rhythmSnapshots,repository,getContext,getSelection,loader}){
    let adapter=null,candidate=null,service=null,kind='basic',opened=false,source=null;
    const build=()=>createRhythmAdoptionService({owner,schema,rhythmSnapshots,repository,getContext,adapter});service=build();
    function frame(){const s=owner.getSession(),context=getContext(),p=s?.draft,selection=getSelection();
        if(!opened||!s||p.schemaVersion!==2||s.destroyed||s.closing||s.inputPending||s.commitInFlight||s.externalUpdatePending||s.conflict||context.blocked||context.workspaceId!=='sheetCruise')return null;
        const history=s.getHistory();if(history.textGroup||history.openGroup)return null;
        const bars=selectionBarIds(selection,p);if(kind==='bars'&&!bars.length)return null;
        return {session:s,version:s.snapshotVersion,documentGeneration:owner.ticket().generation,workspaceGeneration:context.generation,revision:s.baseRevision,selection:JSON.stringify([selection.barId,selection.barNumbers,selection.invalid,selection.deleted]),target:JSON.stringify(kind==='basic'?{kind:'basic'}:{kind:'bars',barIds:bars})};
    }
    function equal(a,b){return !!a&&!!b&&Object.keys(a).every(k=>a[k]===b[k]);}
    function invalidate(){candidate=null;}
    return Object.freeze({
        open(){opened=true;invalidate();},close(){opened=false;invalidate();},setTarget(value){kind=value==='bars'?'bars':'basic';invalidate();},invalidate,
        async load(){const r=await loader.load();if(r.ok){adapter=r.adapter;source=r;service=build();invalidate();}return r;},
        official(){return source;},eligible(){return !!frame();},target(){const f=frame();return f?JSON.parse(f.target):null;},
        prepareOfficial(patternId,patternRevision){invalidate();const f=frame();if(!f)return {ok:false,code:'blocked-session'};const h=service.prepare({patternId,patternRevision,target:JSON.parse(f.target)});if(h.ok)candidate={frame:f,handle:h};return h;},
        prepareReuse(materialId){invalidate();const f=frame();if(!f)return {ok:false,code:'blocked-session'};const h=service.prepareReuse({materialId,target:JSON.parse(f.target)});if(h.ok)candidate={frame:f,handle:h};return h;},
        current(){return !!candidate&&equal(candidate.frame,frame());},
        apply(){const saved=candidate;invalidate();if(!saved||!equal(saved.frame,frame()))return {ok:false,code:'stale-candidate'};return service.apply(saved.handle);},
        clear(){invalidate();const f=frame();if(!f)return {ok:false,code:'blocked-session'};const t=JSON.parse(f.target);if(t.kind!=='bars')return {ok:false,code:'invalid-target'};return service.apply(service.prepareClear({barIds:t.barIds}));}
    });
}
