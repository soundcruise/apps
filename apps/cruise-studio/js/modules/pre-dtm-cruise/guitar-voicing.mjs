import { evaluateBinding } from '../chord/form-snapshot.mjs';
import { createHarmonyTimeline } from '../sheet-cruise/score-harmony.mjs';
// Pure output projection: canonical form qualification is never written or repaired here.
export function enrichGuitarVoicing(project, arrangement, dependencies) {
    const out = JSON.parse(JSON.stringify(arrangement));
    const harmony=createHarmonyTimeline(project),bindings=new Map(project.performance.formBindings.map(b=>[b.chordEventId,b])),qualified=new Map();
    let omitted = 0, count = 0;
    out.bars.forEach((bar, index) => {
        bar.guitarNotes = [];
        for (const hit of bar.guitar) {
            if (hit.stroke === 'mute') { omitted++; continue; }
            let event;try{event=harmony.at(index,hit.tickInBar);}catch{omitted++;continue;}
            const binding = event && bindings.get(event.id);
            if(binding&&!qualified.has(binding.id))qualified.set(binding.id,evaluateBinding(project,binding,dependencies));
            const result = binding && qualified.get(binding.id);
            if (!result?.ready || (event.durationTicks !== undefined && hit.tickInBar >= event.onsetTick + event.durationTicks)) { omitted++; continue; }
            const next = harmony.next(index,hit.tickInBar);
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
