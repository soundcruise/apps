import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),N=require('../js/core/melody-notation.js'),M=require('../js/core/common-music-model.js'),S=require('../js/core/structure-conversion.js'),E=require('../js/core/editing-session.js'),A=require('../js/core/active-document.js');
const realm={window:{CruiseStudio:{},ChordCruise:{}}};
for(const name of ['cruise-studio/js/core/music-theory.js','cruise-studio/js/core/song-model.js','chord-cruise/js/core/music-theory.js'])vm.runInNewContext(readFileSync(new URL('../../'+name,import.meta.url),'utf8'),realm);
const C=realm.window.CruiseStudio,T=realm.window.ChordCruise.theory,clone=x=>JSON.parse(JSON.stringify(x)),conv=M.createConverter({studioTheory:C.theory,chordTheory:T,validate:C.model.validateProject});
function project(){const p=clone(C.model.createSampleProject());p.projectId='A';p.bars=p.bars.slice(0,1);p.bars[0].melody=[{tick:0,durationTicks:480,step:0,alter:0,octave:0}];p.bars[0].lyrics=[{tick:120,text:'あした'}];return p;}
function frame(p){return {source:'working',project:p,sessionId:'s',version:'v1',baseRevision:null,token:{projectId:p.projectId,sessionId:'s',generation:1},workspaceId:'sheetCruise',workspaceGeneration:1};}
function convert(p){return conv.convert(frame(p));}
for(const [key,step,alter,octave,letter,acc,oct,midi] of [['C',0,0,0,'C',0,4,60],['G',6,0,0,'F',1,5,78],['Db',0,0,0,'D',-1,4,61],['C',0,1,0,'C',1,4,61],['C',1,-1,0,'D',-1,4,61],['C',0,0,-1,'C',0,3,48]])test('spelled staff pitch '+[key,step,alter,octave],()=>{const p=project();p.songInfo.originalKey=p.songInfo.playKey=key;Object.assign(p.bars[0].melody[0],{step,alter,octave});const score=N.project(convert(p));assert(score.ok);assert.deepEqual(score.measures[0].tokens[0].pitch,{step:letter,alter:acc,octave:oct,midi});});
test('capo uses actual concert pitch; chords retain original Play-key symbol',()=>{const p=project();Object.assign(p.songInfo,{playKey:'C',originalKey:'D',capo:2});const r=N.project(convert(p));assert.equal(r.key,'D');assert.equal(r.measures[0].tokens[0].pitch.midi,62);assert.equal(r.chordBasis,'Playキー（フォーム）');});
test('gaps become rests and preserve exact attack positions',()=>{const p=project();p.bars[0].melody[0].tick=240;const r=N.project(convert(p));assert(r.ok);const ts=r.measures[0].tokens;assert.equal(ts[0].kind,'rest');assert.equal(ts.find(x=>x.kind==='note').onsetTick,240);assert.equal(ts.reduce((s,x)=>s+x.durationTicks,0),1920);assert(ts.some(x=>x.tieTo!==null));});
test('dotted quarter remains exact; nonstandard length decomposes with ties',()=>{assert.deepEqual(N.segment(0,720).segments.map(x=>[x.duration,x.dots,x.durationTicks]),[['q',1,720]]);const p=project();p.bars[0].melody[0].durationTicks=600;const r=N.project(convert(p));assert(r.ok);const n=r.measures[0].tokens.filter(x=>x.kind==='note');assert.deepEqual(n.map(x=>x.durationTicks),[480,120]);assert.equal(n[0].tieTo,1);assert.equal(n[1].tieFrom,0);});
for(const [onset,dur] of [[0,160],[1,120],[0,0],[0,-1],[0,1921],[0,1.5]])test('unsupported duration is explicit '+onset+'/'+dur,()=>assert.equal(N.segment(onset,dur).ok,false));
for(const change of [p=>p.songInfo.timeSignature.beats=3,p=>p.bars[0].melody[0].step=7,p=>p.bars[0].melody[0].durationTicks=0,p=>p.strumPatterns[0].lengthTicks=960])test('fatal conversion never authorizes partial staff '+change.toString(),()=>{const p=project();change(p);const r=convert(p);assert(!r.ok);assert(!N.project(r).ok);});
test('lyrics keep original time and text; no note-syllable mapping',()=>{const r=N.project(convert(project()));assert.deepEqual(r.measures[0].lyrics,[{tick:120,text:'あした'}]);assert(!Object.hasOwn(r.measures[0].lyrics[0],'noteId'));});
test('lyric fractional timing is fatal, never rounded',()=>{const p=project();p.bars[0].lyrics[0].tick=0.5;assert(!convert(p).ok);});
test('legacy timing always labelled at bar level, never confirmed',()=>{const r=N.project(convert(project()));assert(r.measures[0].autoTiming);assert.match(r.measures[0].timingLabel,/自動.*由来未確認/);assert(!Object.hasOwn(r.measures[0].tokens[0],'confirmed'));});
test('input and output immutability, exact source identity',()=>{const r=convert(project()),before=JSON.stringify(r),s=N.project(r);assert.equal(JSON.stringify(r),before);assert.deepEqual(s.source,r.model.source);assert(Object.isFrozen(s.measures[0].tokens[0].pitch));assert.throws(()=>s.measures[0].tokens[0].pitch.midi=1);assert.notEqual(s.source,r.model.source);});
test('malformed voice and density budgets reject explicitly',()=>{const r=clone(convert(project()));r.model.measures[0].voices.melody.events[0].onsetTick=1;assert(!N.project(r).ok);const p=project();p.bars[0].lyrics[0].text='x'.repeat(2049);assert.equal(N.project(convert(p)).code,'preview-text-budget');const long=clone(convert(project()));long.model.measures=Array(257).fill(long.model.measures[0]);assert.equal(N.project(long).code,'preview-budget');});
test('projection initializes without DOM/storage/network/Chord/Rhythm mutation capabilities',()=>{const ctx={CruiseStudio:{}};for(const k of ['document','localStorage','indexedDB','fetch','navigator','ChordCruise','RhythmCruise'])Object.defineProperty(ctx,k,{get(){throw Error('forbidden '+k);}});vm.runInNewContext(readFileSync(new URL('../js/core/melody-notation.js',import.meta.url),'utf8'),ctx);assert(ctx.CruiseStudio.melodyNotation.project(convert(project())).ok);});
test('issued result stale after edit, Undo, A/B/A; projection never touches saved/base/history or repository',()=>{
 const values=new Map([['A',project()],['B',{...project(),projectId:'B'}]]);let writes=0;
 const repo={read(t){const p=values.get(t.projectId);return{ok:true,exists:!!p,snapshot:E.snapshot(p),revision:JSON.stringify(p)};},readRevision(t){const p=values.get(t.projectId);return{ok:true,exists:!!p,revision:JSON.stringify(p)};},subscribe(){return()=>{};},save(){writes++;throw Error('write');}};
 const registry=E.createRegistry({repository:repo,validate:C.model.validateProject});let owner;
 function open(id){const s=registry.getOrCreateSession('structure',{type:'project',projectId:id});registry.activateSession(s);owner.bind(s);return true;}
 owner=A.createOwner({registry,repository:repo,validate:C.model.validateProject,snapshot:E.snapshot,openProject:open});open('A');
 const service=S.createService({owner,repository:repo,model:M,converter:conv,getContext:()=>({workspaceId:'sheetCruise',generation:1})});
 const session=owner.getSession(),state=()=>JSON.stringify({draft:session.workingSnapshot(),base:session.baseSnapshot,revision:session.baseRevision,history:session.getHistory(),dirty:session.dirty});
 const old=service.convert(),before=state();assert(N.project(old).ok);assert(service.isCurrent(old));assert.equal(state(),before);
 session.runOperation('pitch',d=>d.bars[0].melody[0].step=2);assert(!service.isCurrent(old));const fresh=service.convert();session.undo();assert(!service.isCurrent(old));assert(!service.isCurrent(fresh));assert.equal(N.project(service.convert()).measures[0].tokens[0].pitch.midi,60);
 owner.select('B');const b=service.convert();owner.select('A');assert(!service.isCurrent(b));assert(!service.isCurrent(old));assert.equal(writes,0);
});
test('shared anchors satisfy musical and adjacent text constraints without moving time',()=>{
 const notes=[{tick:0,left:18,right:24},{tick:240,left:0,right:24},{tick:480,left:12,right:24}];
 const rows=[[{tick:0,width:180},{tick:480,width:170}],[{tick:120,width:220},{tick:240,width:190}]];
 const before=JSON.stringify([notes,rows]),l=N.layout(notes,rows,90),x=t=>l.anchors.find(a=>a.tick===t).x;
 assert(x(480)-x(0)>=192);assert(x(240)-x(120)>=232);assert(x(1920)-x(240)>=202);
 assert(x(240)-x(0)>=36);assert.equal(JSON.stringify([notes,rows]),before);assert(Object.isFrozen(l.anchors));
 const wide=N.layout(notes,rows,90,l.width+200);assert.equal(wide.width,l.width+200);assert(wide.anchors.every((a,i)=>i===0||a.x>wide.anchors[i-1].x));
});
test('unsupported tuplet keeps source bar for an actionable diagnostic',()=>{const p=project();p.bars[0].melody[0].durationTicks=160;const r=N.project(convert(p));assert.equal(r.code,'unsupported-duration-grid');assert.equal(r.barNumber,1);});
test('session rejection and valid schema1 conversion diagnostics use separate public input paths',()=>{
 const p=project(),revision=JSON.stringify(p);let writes=0;
 const repository={read(){return {ok:true,exists:true,snapshot:E.snapshot(p),revision};},readRevision(){return {ok:true,exists:true,revision};},subscribe(){return()=>{};},canWrite(){return true;},save(){writes++;throw Error('unexpected write');}};
 const registry=E.createRegistry({repository,validate:C.model.validateProject}),session=registry.getOrCreateSession('structure',{type:'project',projectId:p.projectId});registry.activateSession(session);
 const state=()=>JSON.stringify({draft:session.workingSnapshot(),base:session.baseSnapshot,baseRevision:session.baseRevision,history:session.getHistory(),dirty:session.dirty,version:session.snapshotVersion});
 const before=state(),rejected=session.runOperation('bad step',d=>d.bars[0].melody[0].step=7);
 assert.equal(rejected.ok,false);assert.equal(rejected.code,'validation');assert.equal(state(),before);
 const accepted=session.runOperation('public text entry',d=>C.model.setBarDoremiText(d,1,'ド↑↑↑↑↑↑ レ↑↑↑↑↑↑'));
 assert(accepted.ok);assert(C.model.validateProject(session.workingSnapshot()).ok);
 const converted=convert(session.workingSnapshot());assert.equal(converted.ok,false);
 const duplicate=converted.diagnostics.filter(d=>d.code==='invalid-melody-pitch');assert.equal(duplicate.length,2);assert(duplicate.every(d=>d.severity==='fatal'&&d.sourceLocation.barIndex===0));
 assert.equal(N.project(converted).ok,false);assert.equal(writes,0);assert.equal(session.baseRevision,revision);assert.deepEqual(session.baseSnapshot,E.snapshot(p));
});
