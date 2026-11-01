import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createSelectionLease,formMessage,readFormTarget,formStringStates} from '../js/modules/chord/form-panel.mjs';
import {fixture,state} from './helpers/chord-form-fixture.mjs';
function setup(){const f=fixture();let c={workspaceId:'sheetCruise',generation:1,blocked:false};const b=f.s().draft.bars[0];let selection={active:true,barId:b.id};const l=createSelectionLease({owner:f.owner,getContext:()=>c,getSelection:()=>selection});return {f,l,bar:b.id,event:b.chords[0].id,setContext:x=>c=x,setSelection:x=>selection=x};}
test('UI lease captures stable event, never symbol/index, without changing Project/Session/raw/history',()=>{const {f,l,bar,event}=setup(),before=state(f),token=l.capture(bar,event);assert(token);assert(l.current(token));assert.equal(l.capture(bar,'missing'),null);assert.equal(l.capture('missing',event),null);assert.equal(state(f),before);assert.equal(f.ledger.length,0);});
for(const [name,patch] of [['snapshot',x=>x.f.s().runOperation('title',p=>p.songInfo.title='new')],['workspace',x=>x.setContext({workspaceId:'sheetCruise',generation:3,blocked:false})],['modal',x=>x.setContext({workspaceId:'sheetCruise',generation:1,blocked:true})],['IME',x=>x.f.s().setInputPending(true)],['bar selection',x=>x.setSelection({active:true,barId:'other'})],['inactive',x=>x.setSelection({active:false,barId:x.bar})],['target deletion',x=>x.f.s().runOperation('remove',p=>{p.bars[0].chords=[];})]])test('UI refuses stale lease: '+name,()=>{const x=setup(),token=x.l.capture(x.bar,x.event);assert(token);patch(x);assert(!x.l.current(token));});
test('A→B→A and Undo→Redo cannot revive a preview',()=>{const x=setup(),token=x.l.capture(x.bar,x.event);x.f.values.set('cruiseStudio.project.B',JSON.stringify({...x.f.s().workingSnapshot(),projectId:'B'}));x.f.open('B');x.f.open('A');assert(!x.l.current(token));const fresh=x.l.capture(x.bar,x.event);assert(fresh);x.f.s().runOperation('edit',p=>p.songInfo.title='undo');x.f.s().undo();x.f.s().redo();assert(!x.l.current(fresh));});
test('UI messages preserve distinct history/capacity/stale refusal',()=>{assert.match(formMessage({error:'undo-budget'}),/Undo/);assert.match(formMessage({error:'quota'}),/保存容量/);assert.match(formMessage({error:'stale-candidate'}),/変わりました.*確認/);});
test('product owner dependency is pure, ordered and exactly versioned, with no UI/storage/gate imports',()=>{const html=readFileSync(new URL('../development.html',import.meta.url),'utf8');assert(html.indexOf('chord-cruise/js/core/music-theory.js')<html.indexOf('chord-cruise/js/core/caged-forms.js'));assert.match(html,/caged-forms.js\?v=1.21.0/);const denied=new Proxy({}, {get(){throw Error('side effect');}}),window={ChordCruise:{},document:denied,localStorage:denied,indexedDB:denied,fetch(){throw Error('network');}},realm=vm.createContext({window,document:denied});for(const name of ['music-theory','caged-forms'])vm.runInContext(readFileSync(new URL('../../chord-cruise/js/core/'+name+'.js',import.meta.url),'utf8'),realm);assert.equal(typeof window.ChordCruise.caged.getCommonForm,'function');assert.deepEqual(Object.keys(window.ChordCruise).sort(),['caged','theory']);});

for(const value of [null,undefined,false])test('empty document normalizes absent Session: '+String(value),()=>{assert.deepEqual(readFormTarget(value,null,null),{s:null,b:null,event:null});});
test('empty bars, absent event, destroyed Session and stale IDs have no inferred target',()=>{const x=setup(),s=x.f.s();assert.equal(readFormTarget(s,null,null).event,null);assert.equal(readFormTarget(s,x.bar,'deleted').event,null);const other=readFormTarget(s,x.bar,x.event);assert.equal(other.event.id,x.event);assert.equal(readFormTarget({draft:s.draft,destroyed:true},x.bar,x.event).s,null);assert.equal(readFormTarget({draft:{schemaVersion:2,bars:[]}},x.bar,x.event).b,null);});


for(const [symbol,capo,played,midi] of [['C/E',0,[1,2,3,4],[52,55,60,64]],['C/G',0,[1,2,3],[55,60,64]],['D/F#',2,[1,2,3,4],[54,57,62,66]]])test('P2-01 display derives binding strings without modifying snapshot: '+symbol,()=>{
 const f=fixture();assert(f.s().runOperation('fixture chord',p=>{p.bars[0].chords[0].symbol=symbol;p.instrument.capo=capo;}).ok);assert(f.adopt({playedStrings:played}).ok);const p=f.s().workingSnapshot(),b=p.performance.formBindings[0],m=p.materials.forms.find(m=>m.id===b.materialId),before=state(f),rows=formStringStates(m.snapshot,b.playedStrings);assert.deepEqual(f.service.evaluate(p,b).soundingMidi,midi);for(const n of rows){assert.equal(n.playback,n.kind==='muted'?'muted':played.includes(n.string)?'played':'not-played');assert.equal(n.relativeFret,m.snapshot.strings[n.string-1].relativeFret);}assert.equal(state(f),before);assert.equal(rows[4].playback,'not-played');assert.equal(rows[5].playback,'muted');
});
test('P2-01 unknown and owner-muted strings never become sounding strings',()=>{const snapshot={strings:[{string:1,kind:'unknown'},{string:2,kind:'muted'},{string:3,kind:'note',relativeFret:2}]},before=JSON.stringify(snapshot);assert.deepEqual(formStringStates(snapshot,[1,2,3]).map(n=>n.playback),['unknown','muted','played']);assert.equal(formStringStates(snapshot,null)[2].playback,'unconfirmed');assert.equal(JSON.stringify(snapshot),before);});
const requiredReasons=['played-strings-unconfirmed','played-tones-incomplete','played-bass-mismatch','played-string-not-in-form','missing-required-tones','slash-bass-unresolved','root-bass-unresolved','sixth-overlay-unresolved','owner-partial-form','owner-completeness-unconfirmed','string-states-unconfirmed','unintended-tones','playability-unconfirmed','unsupported-quality','unsupported-capo','unsupported-tuning','invalid-physical-fret-bound','invalid-generation-range','owner-version-mismatch','instrument-changed','confirmation-required','undo-budget','project-budget','stale-candidate'];
for(const code of requiredReasons)test('P2-03 Japanese guidance without raw code: '+code,()=>{const message=formMessage(code);assert.match(message,/[ぁ-んァ-ン一-龥]/);assert(!message.includes(code));});
test('P2-03 actual Adapter reason literals all get safe Japanese output',()=>{const source=readFileSync(new URL('../js/modules/chord/form-adapter.mjs',import.meta.url),'utf8');const codes=[...source.matchAll(/(?:unresolved|add|push)\('([a-z-]+)'/g)].map(m=>m[1]);assert(codes.length>=30);for(const c of codes){assert.match(formMessage(c),/[ぁ-んァ-ン一-龥]/);assert(!formMessage(c).includes(c));}});
test('P2-03 multiple reasons retain every refusal and acquisition problems precede string selection',()=>{const reasons=['played-strings-unconfirmed','owner-partial-form','played-tones-incomplete','played-bass-mismatch','played-tones-incomplete'];const before=JSON.stringify(reasons),message=formMessage(reasons);assert(message.indexOf('一部不足')<message.indexOf('鳴らす弦'));assert.match(message,/必要な音.*不足/);assert.match(message,/最低音/);assert.equal(message.split('コードに必要な音').length,2);assert.equal(JSON.stringify(reasons),before);});
test('P2-03 unknown future reason, unknown error and empty diagnostics never leak internals',()=>{for(const x of ['future-reason',{error:'unknown-owner-message'},[],null]){assert.match(formMessage(x),/まだ採用できません/);assert.doesNotMatch(formMessage(x),/future-reason|unknown-owner-message/);}});

// P3-01: Production 9a8add35 / tree bf108558 approved Japanese output baseline.
const inheritedReasons = [
 'toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty',
 'isPrototypeOf', 'propertyIsEnumerable', '__defineGetter__', '__defineSetter__',
 '__lookupGetter__', '__lookupSetter__', 'toLocaleString'
];
const generalReason = 'このフォームはまだ採用できません。使用弦や楽器条件を確認してください。';
for (const code of inheritedReasons) test('P3-01 inherited reason falls back safely: ' + code, () => {
 for (const input of [code, [code], {error: code}, {code}]) {
  const message = formMessage(input);
  assert.equal(typeof message, 'string');
  assert.equal(message, generalReason);
  assert.doesNotMatch(message, /\[native code\]|\[object Object\]/);
  assert(!message.includes(code));
 }
});
// This fixed list and output digest capture all 55 pre-fix messages, rather than
// deriving expected translations from the implementation under test.
const productionReasonCodes = [
 "blocked-session",
 "capacity",
 "confirmation-required",
 "external-revision",
 "input-pending",
 "instrument-changed",
 "instrument-confirmation-required",
 "invalid-binding",
 "invalid-capo",
 "invalid-generation-range",
 "invalid-input",
 "invalid-instrument-fret-bound",
 "invalid-owner-barres",
 "invalid-owner-note",
 "invalid-owner-quality",
 "invalid-owner-recommendation",
 "invalid-owner-response",
 "invalid-physical-fret-bound",
 "invalid-played-strings",
 "invalid-project",
 "invalid-symbol",
 "missing-binding",
 "missing-or-unresolved-chord",
 "missing-required-tones",
 "owner-completeness-unconfirmed",
 "owner-form-unavailable",
 "owner-no-recommendation",
 "owner-or-input-data-error",
 "owner-partial-form",
 "owner-pitch-mismatch",
 "owner-version-mismatch",
 "playability-unconfirmed",
 "played-bass-mismatch",
 "played-string-not-in-form",
 "played-strings-unconfirmed",
 "played-tones-incomplete",
 "project-budget",
 "quota",
 "root-bass-unresolved",
 "sixth-overlay-unresolved",
 "slash-bass-unresolved",
 "stale-candidate",
 "stale-operation",
 "string-states-unconfirmed",
 "undo-budget",
 "unintended-tones",
 "unissued-candidate",
 "unknown-string",
 "unresolved-chord",
 "unsupported-capo",
 "unsupported-owner-tuning",
 "unsupported-quality",
 "unsupported-symbol",
 "unsupported-tuning",
 "unusable-form"
];
test('P3-01 all 55 approved reason messages remain byte-for-byte compatible', () => {
 assert.equal(productionReasonCodes.length, 55);
 const output = productionReasonCodes.map(code => [code, formMessage(code)]);
 assert.equal(createHash('sha256').update(JSON.stringify(output)).digest('hex'),
  'fcb1f25284545352dbb48d39e45d5494aaa7e4bdddd6b8413510df51d829cbb9');
});
test('P3-01 mixed unknown reasons keep existing grouping, newline and deduplication', () => {
 const codes = Object.freeze(['played-tones-incomplete', 'toString', 'played-bass-mismatch',
  'played-tones-incomplete', 'owner-partial-form', 'constructor']);
 const before = [...codes];
 assert.equal(formMessage(codes), [generalReason, formMessage('owner-partial-form'),
  formMessage('played-tones-incomplete'), formMessage('played-bass-mismatch')].join('\n'));
 assert.deepEqual(codes, before);
 assert.equal(formMessage({error:'toString/played-tones-incomplete/constructor/played-bass-mismatch'}),
  [generalReason, formMessage('played-tones-incomplete'), formMessage('played-bass-mismatch')].join('\n'));
});
test('P3-01 inherited names and ordinary unknown reasons deduplicate to one general guide', () => {
 assert.equal(formMessage([...inheritedReasons, 'future-reason', 'unusable-form']), generalReason);
});
test('P3-01 formatting stays pure for Project, Session, raw, history and Object.prototype', () => {
 const f = fixture(), before = state(f), descriptors = Object.getOwnPropertyDescriptors(Object.prototype);
 const codes = Object.freeze([...inheritedReasons, ...productionReasonCodes]);
 for (const code of codes) formMessage(code);
 formMessage(codes);
 assert.equal(state(f), before);
 assert.equal(f.ledger.length, 0);
 assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), descriptors);
});
