// Read-only acoustic reference projection. Never adopts a form or writes timing.
export function chordNotes(project,chord,deps,explicitForm){
    if(!chord||chord.unresolved)throw Error('コードを確認してください');
    const binding=project.performance.formBindings.find(b=>b.chordEventId===chord.id);
    const form=explicitForm||project.materials.forms.find(m=>m.id===binding?.materialId)?.snapshot;
    if(form){
        if(!Array.isArray(form.tuningMidi)||form.tuningMidi.length!==6||!Number.isInteger(form.capo))throw Error('フォームの楽器条件を確認してください');
        const notes=form.strings.filter(n=>n.kind==='note').map(n=>form.tuningMidi[n.string-1]+form.capo+n.relativeFret);
        if(!notes.length||notes.some(n=>!Number.isInteger(n)||n<21||n>108))throw Error('フォームの音域を確認してください');return notes.sort((a,b)=>a-b);
    }
    const parsed=deps.parseChord(chord.symbol),quality=parsed&&Object.keys(deps.qualities).find(k=>k===parsed.quality||deps.qualities[k].symbolSuffix===parsed.quality);
    if(!quality)throw Error('このコードの試聴用フォームを確認してください');
    const root=deps.notePc(parsed.root),bass=deps.notePc(parsed.bass||parsed.root),low=40+(bass-4+12)%12;
    return [...new Set([low,...deps.qualities[quality].intervals.map(i=>{let n=48+root+i;while(n<low)n+=12;return n;})])].sort((a,b)=>a-b);
}
function voices(notes,start,duration,tick,id){
    const spread=Math.min(.012,duration*.2/Math.max(1,notes.length-1));
    return notes.map((midi,i)=>({part:'guitar',midi,start:start+i*spread,duration:duration-i*spread,gain:.075,tick,sourceEventId:id}));
}
export function singleChordPlan(project,chord,deps,form){return {events:voices(chordNotes(project,chord,deps,form),.03,1.6,0,chord.id),warnings:[]};}
// Fill only true gaps. Explicit rests and sustained strokes own their intervals.
export function fillBlankStrums(slots,chordTicks,barTicks=1920){
    const original=slots.map(s=>({...s})),fallback=original.some(s=>s.tick%240||(s.durationTicks!==undefined&&s.durationTicks%240))?120:240;
    const candidates=[...new Set([0,480,960,1440,...chordTicks])].filter(t=>Number.isInteger(t)&&t>=0&&t<barTicks).sort((a,b)=>a-b);
    const added=candidates.filter(t=>!original.some(s=>t>=s.tick&&t<s.tick+(s.durationTicks??fallback))).map(t=>({tick:t,action:'down',fallback:true}));
    const all=[...original,...added].sort((a,b)=>a.tick-b.tick);
    return all.map((s,i)=>s.fallback?{...s,durationTicks:(all[i+1]?.tick??barTicks)-s.tick}:s);
}
