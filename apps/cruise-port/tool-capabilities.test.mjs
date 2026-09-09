import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveCapo, effectiveMetronome, mergeMetronomeSettings } from './tool-capabilities.js';
import { getCapabilities } from './cruise-port-capabilities.js';
import { METRONOME_DEFAULTS, saveMetronomeSettings, loadMetronomeSettings } from './metronome-store.js';
const standard = getCapabilities('standard'), pro = getCapabilities('pro');
const stored = { ...METRONOME_DEFAULTS, bpm: 120, meter: '6/8', rhythm: 'eighth', sound: 'rim', volume: 80, accents: [true, false] };
test('capo is projected, never destructively normalized by Standard', () => {
    assert.equal(effectiveCapo(5, standard), 0); assert.equal(effectiveCapo(5, pro), 5);
});
test('Standard meter rhythm accents sound and volume come from formal defaults', () => {
    assert.deepEqual(effectiveMetronome(stored, standard), { ...METRONOME_DEFAULTS, bpm: 120 });
    assert.deepEqual(effectiveMetronome(stored, pro), stored);
    const value = effectiveMetronome(stored, pro);value.accents[0]=false;
    assert.equal(stored.accents[0],true);
});
test('Standard BPM save retains every Pro field and Pro restores the merged value', () => {
    const effective = { ...effectiveMetronome(stored, standard), bpm: 140 };
    const merged = mergeMetronomeSettings(stored, effective, standard);
    assert.deepEqual(merged, { ...stored, bpm: 140 });
    assert.deepEqual(effectiveMetronome(merged, pro), { ...stored, bpm: 140 });
});
test('preset apply cannot bypass Standard projection or overwrite previous Pro details', () => {
    const preset = { ...stored, bpm: 155, sound: 'analog', meter: '3/4', accents: [false,true,false] };
    const effective = effectiveMetronome(preset, standard);
    assert.deepEqual(effective, { ...METRONOME_DEFAULTS, bpm: 155 });
    assert.deepEqual(mergeMetronomeSettings(stored, effective, standard), { ...stored, bpm: 155 });
});
test('merge still uses existing store conflict detection', () => {
    const values = new Map([['cruisePort.metronome', JSON.stringify(stored)]]);
    const storage = { getItem: k=>values.get(k)??null, setItem: (k,v)=>values.set(k,v) };
    loadMetronomeSettings(storage);
    assert.equal(saveMetronomeSettings(mergeMetronomeSettings(stored,{...METRONOME_DEFAULTS,bpm:140},standard),storage).ok,true);
    values.set('cruisePort.metronome',JSON.stringify({...stored,bpm:150}));
    assert.equal(saveMetronomeSettings(mergeMetronomeSettings(stored,{...METRONOME_DEFAULTS,bpm:160},standard),storage).ok,false);
    assert.equal(JSON.parse(values.get('cruisePort.metronome')).bpm,150);
});
