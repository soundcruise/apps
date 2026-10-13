import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createAdapter}=require('../js/modules/chord/read-model.js');
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
function owner(){const window={ChordCruise:{},CruiseStudio:{},requestAnimationFrame:()=>1,cancelAnimationFrame(){}};const context=vm.createContext({window,document:{},console});
 for(const file of ['../../chord-cruise/js/core/music-theory.js','../../chord-cruise/js/core/chord-model.js','../js/core/music-theory.js','../js/core/song-model.js'])vm.runInContext(read(file),context);
 return {window,context,adapter:createAdapter({chordTheory:window.ChordCruise.theory,chordModel:window.ChordCruise.chordModel,studioTheory:window.CruiseStudio.theory})};}
const f=owner(),selection=s=>({active:true,barNumbers:[1],chords:[{tick:0,symbol:s}],dirty:false,editing:false,deleted:false});
for(const [symbol,notes,degrees] of [['C',['C','E','G'],['1','3','5']],['Cm',['C','E♭','G'],['1','♭3','5']],['C7',['C','E','G','B♭'],['1','3','5','♭7']],['Cmaj7',['C','E','G','B'],['1','3','5','7']],['CM7',['C','E','G','B'],['1','3','5','7']],['Cm7',['C','E♭','G','B♭'],['1','♭3','5','♭7']],['Csus4',['C','F','G'],['1','4','5']],['Cadd9',['C','E','G','D'],['1','3','5','9']],['F#maj7',['F♯','A♯','C♯','E♯'],['1','3','5','7']],['Dbm',['D♭','F♭','A♭'],['1','♭3','5']]])test(`formal owner spelling ${symbol}`,()=>{const r=f.adapter.analyze(symbol);assert.equal(r.status,'ready');assert.deepEqual(plain(r.notes),notes);assert.deepEqual(plain(r.degrees),degrees);});
for(const [symbol,bass]of[['C/E','E'],['Am7/G','G'],['C/D','D'],['Cadd9/Bb','B♭']])test(`slash ${symbol} preserves upper chord and explicit bass`,()=>{const r=f.adapter.analyze(symbol);assert.equal(r.status,'ready');assert.equal(r.bass.name,bass);assert.equal(r.symbol,symbol);});
for(const symbol of ['Cbanana','Cdim7','Caug','C7b5','C m7','C /E','C//E','c7','H7','Cadd#9','C9','Cmaj77','<img src=x>'])test(`unsupported input never converted: ${symbol}`,()=>{const r=f.adapter.analyze(symbol);assert.equal(r.status,'unsupported');assert.equal(r.symbol,symbol);assert.equal(r.notes,undefined);});
for(const [status,change]of[['inactive',s=>s.active=false],['unselected',s=>s.barNumbers=[]],['empty',s=>s.chords=[]],['multiple',s=>s.barNumbers=[1,2]],['multiple',s=>s.chords.push({tick:480,symbol:'G'})],['deleted',s=>s.deleted=true]])test(`selection ${status} clears old chord detail`,()=>{const s=selection('C');change(s);const r=f.adapter.read(s);assert.equal(r.status,status);assert.equal(r.notes,undefined);});
test('draft, editing and external-pending flags remain separate; projection is immutable',()=>{const s=selection('Cm7');s.dirty=s.externalUpdatePending=true;const before=JSON.stringify(s),r=f.adapter.read(s);assert(r.dirty&&!r.editing&&r.externalUpdatePending);assert(Object.isFrozen(r)&&Object.isFrozen(r.notes));assert.equal(JSON.stringify(s),before);});
test('actual Structure read API consumes selected session draft without mutation or repository reload',()=>{
 const e=owner();const source=read('../js/modules/sheet-cruise/sheet-cruise.js').replace('var projectViews = new Map();','window.__fixture = function(session, bar) { state.session=session; state.selectedBarNumber=bar; }; var projectViews = new Map();');vm.runInContext(source,e.context);
 const project=e.window.CruiseStudio.model.createSampleProject(),session={sessionId:'s1',draft:project,dirty:false,inputPending:false,externalUpdatePending:null,conflict:null};
 e.window.__fixture(session,1);const api=e.window.CruiseStudio.sheetCruise;api.activate();const before=JSON.stringify(project);const initial=api.getSelectionSnapshot();assert.equal(initial.barNumbers[0],1);assert(Object.isFrozen(initial.chords));assert.equal(JSON.stringify(project),before);
 project.bars[0].chords=[{tick:0,symbol:'Dm7'}];session.dirty=true;assert.equal(api.getSelectionSnapshot().chords[0].symbol,'Dm7');assert.equal(e.adapter.read(api.getSelectionSnapshot()).symbol,'Dm7');api.deactivate();assert.equal(e.adapter.read(api.getSelectionSnapshot()).status,'inactive');api.activate();assert.equal(e.adapter.read(api.getSelectionSnapshot()).symbol,'Dm7');
 // Save acknowledgement changes only the source flags; external pending keeps draft.
 session.dirty=false;assert.equal(e.adapter.read(api.getSelectionSnapshot()).dirty,false);session.externalUpdatePending={snapshot:{bars:[]}};assert.equal(e.adapter.read(api.getSelectionSnapshot()).symbol,'Dm7');assert.equal(e.adapter.read(api.getSelectionSnapshot()).externalUpdatePending,true);
 // Removing the selected bar cannot resurrect its previous chord.
 project.bars=project.bars.filter(b=>b.barNumber!==1);assert.equal(e.adapter.read(api.getSelectionSnapshot()).status,'deleted');
});
test('Standard/Pro inventory is checked against released pure feature policy',()=>{
 const e=owner();e.window.document={documentElement:{dataset:{}}};vm.runInContext(read('../../chord-cruise/js/core/feature-access.js'),e.context);const access=e.window.ChordCruise.featureAccess;
 assert.equal(access.hasFeature('customChordCreate'),true);assert.equal(access.hasFeature('customChordFretboardView'),true);
 for(const key of ['customChordSave','unlimitedLibrary','advancedQuality','advancedCaged','advancedExport'])assert.equal(access.hasFeature(key),false);
 for(const key of ['maj','m','7','maj7','m7','sus4'])assert(access.canAccessQuality(key));assert.equal(access.canAccessQuality('dim7'),false);
 // Explicit task scope excludes every fretboard/form path even where owner Standard permits it.
 assert.doesNotMatch(read('../js/modules/chord/inspector.js'),/caged|fretboard|saveChord|featureAccess|keydown/i);
});
test('owner modules register pure APIs without document, storage, DB, network or credentials',()=>{
 const denied=new Proxy({}, {get(){throw Error('side effect');}}),window={ChordCruise:{},document:denied,localStorage:denied,indexedDB:denied,fetch(){throw Error('network');}};
 const context=vm.createContext({window,document:denied});for(const file of ['music-theory.js','chord-model.js']){const source=read('../../chord-cruise/js/core/'+file);assert.doesNotMatch(source,/\b(localStorage|indexedDB|fetch|SoundCruise|addEventListener)\b|^import /m);vm.runInContext(source,context);}assert.equal(typeof window.ChordCruise.theory.spellChordNotes,'function');
});
test('adapter invokes released owner spelling and add9 construction; no parallel theory',()=>{
 const e=owner(),t=e.window.ChordCruise.theory,m=e.window.ChordCruise.chordModel;let spelled=0,built=0;
 const adapter=createAdapter({studioTheory:e.window.CruiseStudio.theory,chordTheory:{...t,spellChordNotes(options){spelled++;return t.spellChordNotes(options);}},chordModel:{...m,buildCustomChord(options){built++;return m.buildCustomChord(options);}}});adapter.analyze('C');adapter.analyze('Cadd9');assert.equal(spelled,2);assert.equal(built,1);
});
test('HTML imports only owner pure modules; no Chord UI/storage/feature or Pro gate import',()=>{const html=read('../index.html'),refs=[...html.matchAll(/src="([^\"]*chord-cruise[^\"]*)"/g)].map(m=>m[1]);assert.deepEqual(refs,['../chord-cruise/js/core/music-theory.js?v=1.20.1','../chord-cruise/js/core/chord-model.js?v=1.20.1']);assert.doesNotMatch(read('../js/modules/chord/read-model.js')+read('../js/modules/chord/inspector.js'),/localStorage|indexedDB|fetch|SoundCruise|saveChord|ensure|provision/);});
test('Inspector uses four-theme semantic tokens and no interactive controls or print changes',()=>{const html=read('../index.html'),section=html.slice(html.indexOf('<section id="studio-chord-inspector"'),html.indexOf('</section>',html.indexOf('<section id="studio-chord-inspector"')));assert.doesNotMatch(section,/<input|<button|<select|contenteditable/);const css=read('../shell.css');assert.match(css,/#studio-chord-inspector/);assert.match(css,/var\(--studio-text-primary\)/);assert.match(css,/overflow-wrap: anywhere/);});

test('IME-owned draft is shown without interpreting a partial chord',()=>{const s=selection('C');s.editing=true;const r=f.adapter.read(s);assert.equal(r.status,'editing');assert.equal(r.symbol,'C');assert.equal(r.notes,undefined);});
