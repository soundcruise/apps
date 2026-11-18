import test from 'node:test';import assert from 'node:assert/strict';
import {chordNotes,singleChordPlan} from '../js/modules/sheet-cruise/chord-audition.mjs';
const deps={parseChord:s=>s==='C'?{root:s,quality:'maj'}:null,qualities:{maj:{intervals:[0,4,7]}},notePc:()=>0};
const form={tuningMidi:[64,59,55,50,45,40],capo:0,strings:[0,1,0,2,3,null].map((f,i)=>f===null?{string:i+1,kind:'muted'}:{string:i+1,kind:'note',relativeFret:f})};
const fixture=()=>({materials:{forms:[{id:'f',snapshot:form}]},performance:{formBindings:[{chordEventId:'c',materialId:'f',playedStrings:[1,2,3,4,5]}]}});
test('registered form determines acoustic notes and mutes without writes',()=>{const p=fixture(),before=JSON.stringify(p),c={id:'c',symbol:'C'};assert.deepEqual(chordNotes(p,c,deps),[48,52,55,60,64]);assert(singleChordPlan(p,c,deps).events.every(e=>e.part==='guitar'));assert.equal(JSON.stringify(p),before);});
test('invalid form conditions and unsupported symbols cannot become another chord',()=>{assert.throws(()=>singleChordPlan(fixture(),{symbol:'unknown'},deps));assert.throws(()=>singleChordPlan(fixture(),{symbol:'C'},deps,{...form,tuningMidi:null}));});
