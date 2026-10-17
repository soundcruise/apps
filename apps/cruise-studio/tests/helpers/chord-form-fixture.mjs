import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {createChordFormAdapter} from '../../js/modules/chord/form-adapter.mjs';
import {createFormAdoptionService} from '../../js/modules/chord/form-adoption.mjs';
const require=createRequire(import.meta.url), E=require('../../js/core/editing-session.js'), R=require('../../js/core/project-repository.js'), A=require('../../js/core/active-document.js');
export const clone=x=>JSON.parse(JSON.stringify(x));
export function fixture(options={}){
 const realm={window:{CruiseStudio:{},ChordCruise:{},crypto:webcrypto},TextEncoder};
 for(const p of ['../../js/core/music-theory.js','../../js/core/song-model.js','../../../chord-cruise/js/core/music-theory.js','../../../chord-cruise/js/core/caged-forms.js'])vm.runInNewContext(readFileSync(new URL(p,import.meta.url),'utf8'),realm);
 const C=realm.window.CruiseStudio, oldValidator=C.model.validateProject,legacy=clone(C.model.createSampleProject());legacy.projectId='A';
 C.schema2=require('../../js/core/schema2.js');C.model.configureSchema2();
 const api=C.model.schema2,p=options.project?clone(options.project):api.migrate(legacy,JSON.stringify(legacy)).project;
 for(const f of ['modules/pre-dtm-cruise/arrangement-engine.js','modules/pre-dtm-cruise/midi-export.js'])vm.runInNewContext(readFileSync(new URL('../../js/'+f,import.meta.url),'utf8'),realm);
 let mode='',context={workspaceId:'sheetCruise',generation:1},now=p.updatedAt;
 const values=new Map([['cruiseStudio.project.A',JSON.stringify(p)]]), ledger=[];
 const storage={getItem:k=>values.get(k)??null,setItem(k,v){ledger.push({key:k,value:v});if(mode==='quota'||mode==='unknown'&&k==='cruiseStudio.projects.index')throw Error('quota');values.set(k,v);},removeItem(k){ledger.push({key:k,value:null});if(mode==='unknown')throw Error('quota');values.delete(k);}};
 const repository=R.createRepository({storage,model:C.model,snapshot:E.snapshot,locks:{request:(_n,_o,fn)=>fn()},now:()=>now});
 const registry=E.createRegistry({repository,validate:C.model.validateProject,historyLimits:options.limits});
 let owner;function open(id){const s=registry.getOrCreateSession('structure',{type:'project',projectId:id});registry.activateSession(s);owner.bind(s);return s;}
 owner=A.createOwner({registry,repository,validate:C.model.validateProject,snapshot:E.snapshot,openProject:id=>!!open(id)});open('A');
 const deps={chordTheory:realm.window.ChordCruise.theory,caged:realm.window.ChordCruise.caged,parseChordSymbol:C.theory.parseBasicChordSymbol,ownerVersion:'1.21.0'};
 const adapter=createChordFormAdapter(deps),service=createFormAdoptionService({owner,schema:api,adapter,repository,getContext:()=>context,...deps});
 function request(extra={}){const s=owner.getSession(),b=s.draft.bars[0];return {barId:b.id,chordEventId:b.chords[0].id,instrument:{confirmed:true,tuningMidi:[64,59,55,50,45,40],maxAbsoluteFret:24},playedStrings:[1,2,3,4,5],...extra};}
 return {C,api,legacy,oldValidator,realm,repository,registry,owner,adapter,service,deps,values,storage,ledger,open,request,s:()=>owner.getSession(),mode:x=>mode=x,context:x=>context=x,now:x=>now=x,adopt(extra){return service.apply(service.prepare(request(extra)));}};
}
export function state(f){const s=f.s();return JSON.stringify({draft:s.workingSnapshot(),base:s.baseSnapshot,revision:s.baseRevision,history:s.getHistory(),dirty:s.dirty,version:s.snapshotVersion,raw:[...f.values]});}
