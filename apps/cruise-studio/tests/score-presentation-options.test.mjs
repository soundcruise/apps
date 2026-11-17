import test from 'node:test';import assert from 'node:assert/strict';
import {METRONOME_SOUNDS,metronomeSample,normalizeMetronomeSound} from '../js/modules/score-audio.mjs';
import {normalizeLayout} from '../js/modules/sheet-cruise/paper-layout.mjs';
import {createPaperForms,registeredPaperForms} from '../js/modules/sheet-cruise/paper-forms.mjs';
import {viewerFixture} from './helpers/viewer-fixture.mjs';
import {createPresetCodec} from '../../score-viewer/core/preset.mjs';
test('metronome sounds are bounded, deterministic, distinct and cached per context without URLs',()=>{
 const ctx={sampleRate:48000,createBuffer(c,length,rate){const data=new Float32Array(length);return {duration:length/rate,getChannelData:()=>data};}},waves=[];
 for(const key of Object.keys(METRONOME_SOUNDS)){const sample=metronomeSample(ctx,84,key);assert.equal(sample,metronomeSample(ctx,84,key));assert.equal(sample.midi,84);assert.equal(sample.buffer.duration,.06);const a=sample.buffer.getChannelData(0);assert(a.every(Number.isFinite));assert(Math.max(...a.map(Math.abs))<=1);assert(a.some(v=>Math.abs(v)>.1));waves.push(Array.from(a));}
 assert.notDeepEqual(waves[0],waves[1]);assert.notDeepEqual(waves[0],waves[2]);assert.equal(normalizeMetronomeSound('https://external.invalid/audio'),'click');assert.equal(normalizeMetronomeSound(null),'click');
});
test('presentation colors and catalogue visibility survive shared presets while unsafe CSS is rejected',()=>{
 const {contract,score}=viewerFixture(),layout=normalizeLayout({appearance:{interaction:{highlight:'#3355aa',playhead:'#aa3344',url:'evil'},visibility:{formList:true}}});assert.deepEqual(layout.appearance.interaction,{highlight:'#3355aa',playhead:'#aa3344'});assert.equal(layout.appearance.visibility.formList,true);
 const invalid=normalizeLayout({appearance:{interaction:{highlight:'url(evil)',playhead:'red'}}});assert.equal(invalid.appearance.interaction,undefined);
 const p=contract.normalizePresentation({layout},score).value,codec=createPresetCodec(contract.normalizePresentation),preset=codec.decode(codec.encode('色と一覧',p,score).text,score);assert.deepEqual(preset.presentation.layout.appearance.interaction,layout.appearance.interaction);assert.equal(preset.presentation.layout.appearance.visibility.formList,true);
});
test('form catalogue deduplicates matching registered forms while retaining different fingering and leaving music unchanged',()=>{
 const {score}=viewerFixture(),forms=createPaperForms({},{}),before=JSON.stringify(score),entries=registeredPaperForms(score).flat(),list=forms.catalogue(score);assert(list.length<entries.length);assert.equal(new Set(list.map(e=>JSON.stringify([e.symbol,e.snapshot]))).size,list.length);assert.equal(JSON.stringify(score),before);
 const next=structuredClone(score),binding=next.performance.formBindings[0],material=structuredClone(next.materials.forms.find(f=>f.id===binding.materialId));material.id='different-finger';material.snapshot.strings.find(s=>s.kind==='note'&&s.relativeFret>0).finger=4;next.materials.forms.push(material);binding.materialId=material.id;assert(forms.catalogue(next).length>=list.length);assert.equal(JSON.stringify(score),before);
});
test('catalogue size and highlight transparency round-trip in shared presets without altering source music',()=>{
 const {contract,score}=viewerFixture(),before=JSON.stringify(score),codec=createPresetCodec(contract.normalizePresentation);
 const layout=normalizeLayout({formListScale:145,appearance:{interaction:{opacity:.35},visibility:{formList:true}}}),p=contract.normalizePresentation({layout},score).value;
 const saved=codec.decode(codec.encode('一覧サイズと透過率',p,score).text,score);assert.equal(saved.presentation.layout.formListScale,145);assert.equal(saved.presentation.layout.appearance.interaction.opacity,.35);assert.equal(JSON.stringify(score),before);
 assert.equal(normalizeLayout({formListScale:1000}).formListScale,160);assert.equal(normalizeLayout({appearance:{interaction:{opacity:Infinity}}}).appearance.interaction,undefined);
});
test('hi-hat is distinct and compression raises click body while bounding output peaks',()=>{
 const ctx={sampleRate:48000,createBuffer(c,n){const a=new Float32Array(n);return {getChannelData:()=>a};}},a=metronomeSample(ctx,84,'click').buffer.getChannelData(0),hat=metronomeSample(ctx,84,'hihat').buffer.getChannelData(0);
 assert.equal(normalizeMetronomeSound('hihat'),'hihat');assert.notDeepEqual(a,hat);
 let oldEnergy=0,newEnergy=0;for(let i=0;i<a.length;i++){const t=i/ctx.sampleRate,old=Math.sin(2*Math.PI*1500*t)*Math.min(1,t/.001)*Math.exp(-t/.009);oldEnergy+=old*old;newEnergy+=a[i]*a[i];}
 assert(newEnergy>oldEnergy*2);assert(Math.max(...a.map(Math.abs))<=.921);assert(hat.some(v=>Math.abs(v)>.5));
});
