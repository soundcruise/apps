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
export function chordProgressionPlan(project,startIndex,count,deps){
    const seconds=60/project.songInfo.bpm/480,total=seconds*1920;
    if(!Number.isFinite(total)||total<=0||total>60||!Number.isInteger(startIndex)||startIndex<0||![1,2].includes(count)||!project.bars[startIndex])throw Error('BPMや編集する小節を確認してください');
    const events=[],warnings=[],spans=[];let offset=0;
    for(let i=startIndex;i<Math.min(project.bars.length,startIndex+count);i++){
        const chords=project.bars[i].chords.slice().sort((a,b)=>a.onsetTick-b.onsetTick);
        if(!chords.some(c=>c.onsetTick===0))for(let b=i-1;b>=0;b--){const last=project.bars[b].chords.slice().sort((a,b)=>a.onsetTick-b.onsetTick).at(-1);if(last){if(project.bars[b].chords.filter(c=>c.onsetTick===last.onsetTick).length!==1){warnings.push('同じ位置の複数コードは試聴できません');break;}if(last.durationTicks===undefined)chords.unshift({...last,onsetTick:0});break;}}
        for(let j=0;j<chords.length;j++){
            const c=chords[j];if(chords.filter(x=>x.onsetTick===c.onsetTick).length!==1){warnings.push('同じ位置の複数コードは試聴できません');continue;}
            const end=Math.min(1920,chords[j+1]?.onsetTick??1920,c.onsetTick+(c.durationTicks??1920)),duration=(end-c.onsetTick)*seconds;if(duration<=0)continue;
            try{events.push(...voices(chordNotes(project,c,deps),.03+offset+c.onsetTick*seconds,duration,c.onsetTick,c.id).map(e=>({...e,barIndex:i})));}catch(e){warnings.push((i+1)+'小節目：'+e.message);}
        }
        spans.push({index:i,start:offset,end:offset+total});offset+=total;
    }
    if(!events.length)throw Error(warnings[0]||'コードを入力してから再生してください');
    if(events.length>256)throw Error('試聴するコードが多すぎます');
    return {events,spans,duration:offset+.03,secondsPerTick:seconds,warnings:[...new Set(warnings)]};
}
