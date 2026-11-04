import { evaluateBinding } from '../chord/form-snapshot.mjs';
// Pure output projection: canonical form qualification is never written or repaired here.
export function enrichGuitarVoicing(project, arrangement, dependencies) {
    const out = JSON.parse(JSON.stringify(arrangement));
    let omitted = 0, count = 0;
    out.bars.forEach((bar, index) => {
        const source = project.bars[index];
        bar.guitarNotes = [];
        for (const hit of bar.guitar) {
            if (hit.stroke === 'mute') { omitted++; continue; }
            const event = source.chords.filter(e => e.onsetTick <= hit.tickInBar).sort((a,b)=>b.onsetTick-a.onsetTick)[0];
            const binding = event && project.performance.formBindings.find(b=>b.chordEventId===event.id);
            const result = binding && evaluateBinding(project, binding, dependencies);
            if (!result?.ready || (event.durationTicks !== undefined && hit.tickInBar >= event.onsetTick + event.durationTicks)) { omitted++; continue; }
            const next = source.chords.filter(e=>e.onsetTick>hit.tickInBar).reduce((n,e)=>Math.min(n,e.onsetTick),1920);
            const end = Math.min(next, event.durationTicks === undefined ? 1920 : event.onsetTick + event.durationTicks);
            for (const midi of new Set(result.soundingMidi)) bar.guitarNotes.push({part:'guitar',midi,absoluteTick:hit.absoluteTick,durationTicks:Math.min(hit.durationTicks,end-hit.tickInBar),velocity:hit.velocity});
        }
        count += bar.guitarNotes.length;
    });
    if (count) out.meta.midiExportTargets = [...out.meta.midiExportTargets,'guitar'];
    if (omitted) out.warnings.push('ギターMIDI: フォーム未確認・対象外ストローク '+omitted+'件を出力しません。譜面でフォームを確認してください。');
    return out;
}
if (globalThis.window?.CruiseStudio) window.CruiseStudio.guitarVoicing = {
    enrich(project, arrangement) { const C=window.CruiseStudio;return enrichGuitarVoicing(project,arrangement,{schema:C.model.schema2,chordTheory:window.ChordCruise.theory,parseChordSymbol:C.theory.parseBasicChordSymbol}); }
};
