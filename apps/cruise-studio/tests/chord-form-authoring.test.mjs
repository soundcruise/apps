import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,clone,state} from './helpers/chord-form-fixture.mjs';
import {createFormAuthoring} from '../js/modules/chord/form-authoring.mjs';
import {makeChordForms,parseChordForms,savedChordForm} from '../js/modules/sheet-cruise/chord-form-transfer.mjs';
const ok=r=>assert(r.ok,JSON.stringify(r));
test('instrument consent is memory-only per Session and exact unresolved conditions; cancellation is never cached',()=>{
 const {f,a}=setup(),s=f.s();s.draft.instrument.tuning=null;delete s.draft.instrument.maxAbsoluteFret;let calls=0,accept=true;const prior=globalThis.window;globalThis.window={confirm:()=>{calls++;return accept;}};
 try{const before=state(f);assert(a.authorize(s));assert(a.authorize(s));assert.equal(calls,1);assert.equal(state(f),before);s.draft.instrument.capo=1;accept=false;assert(!a.authorize(s));assert(!a.authorize(s));assert.equal(calls,3);accept=true;assert(a.authorize(s));assert(a.authorize(s));assert.equal(calls,4);const second=fixture().s();second.draft.instrument.tuning=null;delete second.draft.instrument.maxAbsoluteFret;assert(a.authorize(second));assert.equal(calls,5);}finally{if(prior===undefined)delete globalThis.window;else globalThis.window=prior;}
});
function setup(options){const f=fixture(options),a=createFormAuthoring(f.C,f.realm.window.ChordCruise);return {f,a};}
function enter(f,a,name){return f.s().runOperation('Synthetic code entry',p=>{const e=p.bars[0].chords[0];e.symbol=name;a.syncEvent(p,e);});}
test('unconfirmed manual insertion updates the attached Session Proxy and retains exact warning data through Undo and save',async()=>{
 const {f,a}=setup();ok(enter(f,a,'C'));const before=f.s().workingSnapshot(),snapshot=clone(before.materials.forms[0].snapshot);snapshot.playability='unknown';snapshot.ownerWarning='Synthetic unconfirmed form';const m=a.material(snapshot,'Cadd9','manual',null,'C');ok(f.s().runOperation('Synthetic custom form',p=>{const e=p.bars[0].chords[0];e.symbol='Cadd9';a.install(p,e,m,'fixed');}));const edited=f.s().workingSnapshot(),binding=edited.performance.formBindings[0];assert.equal(binding.confirmation.status,'unconfirmed');assert.equal(binding.confirmation.basisKey,null);assert(!a.evaluate(edited,binding).ready);ok(f.s().undo());assert.deepEqual(f.s().workingSnapshot(),before);ok(f.s().redo());assert.deepEqual(f.s().workingSnapshot(),edited);ok(await f.s().commit());assert.equal(f.s().draft.performance.formBindings[0].confirmation.status,'unconfirmed');assert.equal(f.s().draft.materials.forms.at(-1).snapshot.ownerWarning,'Synthetic unconfirmed form');
});
test('opening old Project does not migrate forms, instrument, draft or raw storage',()=>{const f=fixture(),before=state(f);createFormAuthoring(f.C,f.realm.window.ChordCruise);assert.equal(state(f),before);ok(f.api.validate(f.s().draft));});
test('automatic C and changed Dm use owner forms in one undo each, immutable materials, save and JSON',async()=>{const {f,a}=setup(),before=f.s().workingSnapshot(),history=f.s().getHistory().cursor;ok(enter(f,a,'C'));const first=f.s().workingSnapshot();assert.equal(first.performance.formBindings[0].mode,'auto');assert.equal(first.materials.forms[0].encoding,'studio-chord-form-v2');assert.equal(f.s().getHistory().cursor,history+1);assert(a.evaluate(first,first.performance.formBindings[0]).ready);assert.deepEqual(first.materials.forms[0].snapshot.strings.map(n=>n.kind==='note'?n.relativeFret:'x'),[0,1,0,2,3,'x']);ok(enter(f,a,'Dm'));assert.deepEqual(f.s().draft.materials.forms[0],first.materials.forms[0]);ok(f.s().undo());assert.deepEqual(f.s().workingSnapshot(),first);ok(f.s().undo());assert.deepEqual(f.s().workingSnapshot(),before);ok(f.s().redo());ok(f.s().redo());ok(await f.s().commit());const saved=f.repository.read(f.s().target).snapshot;assert.deepEqual(JSON.parse(JSON.stringify(saved)),f.s().workingSnapshot());});
test('manual and legacy fixed forms survive name edits; incomplete manual tones remain unconfirmed',()=>{const {f,a}=setup();ok(enter(f,a,'C'));let m=a.material(f.s().draft.materials.forms[0].snapshot,'C','manual');ok(f.s().runOperation('Manual fixed',p=>a.install(p,p.bars[0].chords[0],m,'fixed')));const before=clone(f.s().draft.materials);ok(enter(f,a,'G'));assert.deepEqual(f.s().draft.materials,before);assert.equal(f.s().draft.performance.formBindings[0].mode,'fixed');assert(!a.evaluate(f.s().draft,f.s().draft.performance.formBindings[0]).ready);
 const old=fixture();ok(old.adopt());const api=createFormAuthoring(old.C,old.realm.window.ChordCruise),v1=clone(old.s().draft.materials.forms[0]);ok(enter(old,api,'Dm'));assert.deepEqual(old.s().draft.materials.forms[0],v1);assert.equal(old.s().draft.performance.formBindings[0].mode,'fixed');
 const p=clone(f.s().draft),snap=clone(m.snapshot);snap.strings[1].relativeFret=2;snap.barres=[];m=a.material(snap,'G','manual');a.install(p,p.bars[0].chords[0],m,'fixed');ok(f.api.validate(p));assert.equal(p.performance.formBindings[0].confirmation.status,'unconfirmed');assert(!a.evaluate(p,p.performance.formBindings[0]).ready);
});
test('Bm flat5 uses owner A shape and omits warning strings without asserting readiness',()=>{const {f,a}=setup(),m=a.recommend(f.s().draft,'Bm♭5');assert(m);assert.equal(m.provenance.shape,'A');assert(m.snapshot.strings.every(n=>n.kind==='muted'||!n.fingeringWarning));assert(m.snapshot.ownerWarning);const high=a.recommend(f.s().draft,'C','E',{minRelativeFret:12,maxRelativeFret:25});assert(high);assert.equal(high.provenance.origin,'manual');assert(high.snapshot.strings.every(n=>n.kind==='muted'||n.relativeFret>=12&&n.relativeFret<=22));ok(enter(f,a,'Bm♭5'));assert(!a.evaluate(f.s().draft,f.s().draft.performance.formBindings[0]).ready);});
test('v1 provenance restrictions stay strict and v2 cannot forge auto mode for manual or bookshelf data',()=>{const {f,a}=setup();ok(f.adopt());const old=clone(f.s().draft);old.materials.forms[0].provenance.origin='manual';assert(!f.api.validate(old).ok);const p=clone(f.s().draft),m=a.material(p.materials.forms[0].snapshot,'C','manual');a.install(p,p.bars[0].chords[0],m,'fixed');ok(f.api.validate(p));p.performance.formBindings[0].mode='auto';assert(!f.api.validate(p).ok);});
test('forms transfer retains explicit strings and fingers, rejects missing states credentials duplicate IDs and invalid barres',()=>{const {f,a}=setup(),s=a.recommend(f.s().draft,'F').snapshot,folder=[{id:'f',name:'Synthetic'}],chord={id:'one',folderId:'f',name:'F',form:s};const payload=makeChordForms(folder,[chord]);assert.deepEqual(parseChordForms(JSON.stringify(payload)),payload);assert.equal(payload.chords[0].form.barres.length>0,true);for(const bad of [{...payload,token:'forbidden'},{...payload,version:2},{...payload,chords:[chord,chord]},{...payload,chords:[{...chord,form:{...s,strings:s.strings.slice(1)}}]},{...payload,chords:[{...chord,form:{...s,barres:[{finger:4,relativeFret:1,fromString:1,toString:6}]}}]}])assert.throws(()=>parseChordForms(JSON.stringify(bad)));assert.throws(()=>savedChordForm({notes:[],mutedStrings:[]}));assert.throws(()=>savedChordForm({notes:[{string:7,fret:1}],mutedStrings:[1,2,3,4,5,6]}));assert.throws(()=>savedChordForm({notes:[],mutedStrings:[1,2,3,4,5,6],bassFingerings:[{string:6,fret:0}]}));assert.throws(()=>parseChordForms(' '.repeat(262145)));});
test('manual adoption guards active Session, revision, IME and failed save preserves old raw',async()=>{const {f,a}=setup();ok(enter(f,a,'C'));f.C.documents=f.owner;f.C.repository=f.repository;f.C.shellHost={getCommandContext:()=>({}),getActiveWorkspace:()=> 'sheetCruise',modal:{getActive:()=>null},keyboard:{isIMEBlocked:()=>false}};const b=f.s().draft.bars[0],m=a.material(f.s().draft.materials.forms[0].snapshot,'C','manual');f.s().setInputPending(true);let before=state(f);assert(!a.adopt(f.s(),b.id,b.chords[0].id,m).ok);assert.equal(state(f),before);f.s().setInputPending(false);ok(a.adopt(f.s(),b.id,b.chords[0].id,m));assert.equal(f.s().draft.performance.formBindings[0].mode,'fixed');const raw=[...f.values];f.mode('quota');assert(!(await f.s().commit()).ok);assert(f.s().dirty);assert.deepEqual([...f.values],raw);});
test('manual finger adoption keeps an explicit muted subset, preserves other immutable forms and validates the final binding',()=>{const {f,a}=setup({limits:{maxEntries:1}});ok(enter(f,a,'C'));f.C.documents=f.owner;f.C.repository=f.repository;f.C.shellHost={getCommandContext:()=>({}),getActiveWorkspace:()=> 'sheetCruise',modal:{getActive:()=>null},keyboard:{isIMEBlocked:()=>false}};const before=f.s().workingSnapshot(),bar=before.bars[0],snapshot=clone(before.materials.forms[0].snapshot);snapshot.strings.find(n=>n.kind==='note'&&n.relativeFret>0).finger=4;const material=a.material(snapshot,'C','manual');ok(a.adopt(f.s(),bar.id,bar.chords[0].id,material,[2,3,4,5]));assert.equal(f.s().getHistory().evictedCount,1);const after=f.s().workingSnapshot();assert.deepEqual(after.bars,before.bars);assert.deepEqual(after.materials.forms.slice(0,before.materials.forms.length),before.materials.forms);assert.deepEqual(after.performance.formBindings[0].playedStrings,[2,3,4,5]);ok(f.api.validate(after));ok(f.s().undo());assert.deepEqual(f.s().workingSnapshot(),before);ok(f.s().redo());assert.deepEqual(f.s().workingSnapshot(),after);const prior=state(f);assert(!a.adopt(f.s(),bar.id,bar.chords[0].id,material,[]).ok);assert.equal(state(f),prior);});

test('FM7 authoring takes the shared common E rule, keeps the formal alternative and never rewrites fixed saved forms when opened',()=>{const {f,a}=setup();ok(enter(f,a,'FM7'));const p=f.s().workingSnapshot(),binding=p.performance.formBindings[0],m=p.materials.forms.find(m=>m.id===binding.materialId);assert.equal(m.provenance.shape,'E');assert.deepEqual(m.snapshot.strings.map(n=>n.kind==='note'?n.relativeFret:'x'),[0,1,2,3,'x','x']);assert.equal(m.snapshot.ownerWarning,null);assert(a.evaluate(p,binding).ready);const formal=a.recommend(p,'FM7','E',{formVariant:'formal'});assert.equal(formal.snapshot.strings.filter(n=>n.kind==='note').length,6);ok(f.s().runOperation('Formal E selection',draft=>a.install(draft,draft.bars[0].chords[0],formal,'fixed')));const before=state(f);createFormAuthoring(f.C,f.realm.window.ChordCruise);assert.equal(state(f),before);assert.equal(a.recommend({...p,instrument:{...p.instrument,capo:1}},'FM7','E').snapshot.capo,1);});

test('portable preset forms follow Play key and capo, retaining the source fingering, mute and string set', () => {
    const {f,a}=setup();
    ok(enter(f,a,'F'));
    const target=clone(f.s().workingSnapshot()), material=clone(target.materials.forms[0]);
    const preset={material,playSymbol:'F',playedStrings:[1,2,3,4],confirmed:false};
    const saved=clone(preset), event=target.bars[0].chords[0];
    target.instrument.capo=2;
    event.symbol='A'; // Sounding A, Play G: two frets above the saved F.
    a.installPreset(target,event,preset);
    const binding=target.performance.formBindings[0];
    const form=target.materials.forms.find(m=>m.id===binding.materialId);
    ok(f.api.validate(target));
    assert.equal(form.snapshot.capo,2);
    assert.equal(form.provenance.sourceSymbol,'A');
    assert.deepEqual(binding.playedStrings,saved.playedStrings);
    assert.equal(binding.confirmation.status,'unconfirmed');
    assert.deepEqual(form.snapshot.strings,saved.material.snapshot.strings.map(n=>
        n.kind==='note'?{...n,relativeFret:n.relativeFret+2}:n));
    assert.deepEqual(form.snapshot.barres,saved.material.snapshot.barres.map(b=>({...b,relativeFret:b.relativeFret+2})));
    assert.deepEqual(preset,saved);
    target.instrument.tuning[5]-=2;
    assert.throws(()=>a.installPreset(target,event,preset),/チューニング/);
});

test('recommended slash bass and written tensions agree with the notes actually played',async()=>{
 const {f,a}=setup();
 const {chordNotes}=await import('../js/modules/sheet-cruise/chord-audition.mjs');
 const {registeredPaperForms}=await import('../js/modules/sheet-cruise/paper-forms.mjs');
 for(const capo of [0,2])for(const [play,lowest] of [['G/B',11],['C/E',4],['F/A',9],['C/D',2],['C/F#',6],['C7(9)',0],['C6',0],['Am6',9]]){
  const p=clone(f.s().workingSnapshot());p.instrument.capo=capo;
  const event=p.bars[0].chords[0];event.symbol=f.api.chord(play,capo);
  a.syncEvent(p,event);ok(f.api.validate(p));const binding=p.performance.formBindings.find(b=>b.chordEventId===event.id);
  assert(binding,play);
  const notes=chordNotes(p,event,{}),paper=registeredPaperForms(p)[0].find(e=>e.eventId===event.id).snapshot;
  assert.equal(notes[0]%12,(lowest+capo)%12,play);
  const sounding=paper.strings.filter(n=>n.kind==='note').map(n=>paper.tuningMidi[n.string-1]+capo+n.relativeFret).sort((a,b)=>a-b);
  assert.deepEqual(notes,sounding);
  if(play.endsWith('6'))assert(notes.some(n=>(n-capo+12)%12===(lowest+9)%12));
  if(play==='C7(9)')assert.deepEqual([...new Set(notes.map(n=>(n-capo)%12))].sort((a,b)=>a-b),[0,2,4,7,10]);
 }
});

test('old automatic inversions are corrected on paper and in playback without changing the source or a fixed form',async()=>{
 const {f,a}=setup(),p=clone(f.s().workingSnapshot());const e=p.bars[0].chords[0];e.symbol='G/B';a.initialize(p);
 const old=a.recommend(p,'G');old.provenance.sourceSymbol=e.symbol;a.install(p,e,old,'auto');
 const binding=p.performance.formBindings.find(b=>b.chordEventId===e.id);
 const {chordNotes}=await import('../js/modules/sheet-cruise/chord-audition.mjs');
 const {registeredPaperForms}=await import('../js/modules/sheet-cruise/paper-forms.mjs');
 const before=JSON.stringify(p);
 assert.equal(chordNotes(p,e,{})[0]%12,11);assert.equal(registeredPaperForms(p)[0][0].snapshot.strings[5].kind,'muted');
 assert.equal(JSON.stringify(p),before);
 binding.mode='fixed';assert.equal(chordNotes(p,e,{})[0]%12,7);assert.equal(registeredPaperForms(p)[0][0].snapshot.strings[5].kind,'note');
});

test('the native shelf display range survives form transfer, including old records with no range',()=>{
 const record={notes:[{string:1,fret:5,finger:1}],mutedStrings:[2,3,4,5,6],fretRange:{min:3,max:8}};
 const snapshot=savedChordForm(record);
 const file=makeChordForms([{id:'folder',name:'本棚'}],[{id:'form',name:'A',folderId:'folder',form:snapshot}]);
 assert.deepEqual(parseChordForms(JSON.stringify(file)).chords[0].form.displayRange,{min:3,max:8});
 delete record.fretRange;assert(!Object.hasOwn(savedChordForm(record),'displayRange'));
});

test('explicit bass and tension fingerings replace only their strings, without changing the native record',()=>{
 const record={bassPc:7,tensionPcs:[2],fretRange:{min:1,max:15},mutedStrings:[1,6],
  notes:[{string:2,fret:1,finger:1},{string:3,fret:0},{string:4,fret:2,finger:2},{string:5,fret:3,finger:3}],
  bassFingerings:[{string:6,fret:3,finger:'T'},{string:4,fret:5,finger:1,pendingDelete:true}],
  tensionFingerings:[{string:2,fret:3,pc:2,finger:4}]};
 const before=structuredClone(record),form=savedChordForm(record);
 assert.deepEqual(form.strings.map(n=>n.kind==='muted'?null:[n.relativeFret,n.finger]),[null,[3,4],[0,null],[2,2],[3,3],[3,'T']]);
 assert.deepEqual(record,before);
 const alternate={string:6,fret:15,finger:1};
 assert.throws(()=>savedChordForm({...record,bassFingerings:[...record.bassFingerings,alternate]}),/6弦/);
 assert.deepEqual(savedChordForm({...record,bassFingerings:[...record.bassFingerings,{...alternate,pendingDelete:true}]}),form);
});

test('changing fingers keeps unplayed fretted notes and string selection through undo rollover',()=>{
    const {f,a}=setup({limits:{maxEntries:1}}),session=f.s();
    ok(enter(f,a,'C'));
    ok(session.runOperation('play a subset',p=>{
        const binding=p.performance.formBindings[0];
        binding.playedStrings=[2,3,4];
        binding.confirmation={status:'unconfirmed',basisKey:null};
    }));
    const before=session.workingSnapshot(),event=before.bars[0].chords[0];
    ok(a.changeFingers(session,[event.id],[{string:2,relativeFret:1,finger:4}]));
    const after=session.workingSnapshot(),binding=after.performance.formBindings[0];
    const material=after.materials.forms.find(m=>m.id===binding.materialId);
    const original=before.materials.forms.find(m=>m.id===before.performance.formBindings[0].materialId);
    assert.deepEqual(binding.playedStrings,[2,3,4]);
    assert.deepEqual(binding.confirmation,before.performance.formBindings[0].confirmation);
    assert.deepEqual(material.snapshot.strings,original.snapshot.strings.map(n=>n.string===2?{...n,finger:4}:n));
    assert.deepEqual(after.bars,before.bars);
    ok(session.undo());assert.deepEqual(session.workingSnapshot(),before);
    ok(session.redo());assert.deepEqual(session.workingSnapshot(),after);
});
