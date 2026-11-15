// One read-only harmony timeline for audio and MIDI. An explicit end or an
// unresolved/newer event is a boundary, never a reason to revive older harmony.
export function createHarmonyTimeline(project){
    const rows=project.bars.map(b=>b.chords.slice().sort((a,b)=>a.onsetTick-b.onsetTick));
    const carried=[];let previous=[];
    rows.forEach((row,i)=>{carried[i]=previous;if(row.length)previous=row;});
    return {
        at(index,tick){
            const local=rows[index].filter(c=>c.onsetTick<=tick),source=local.length?local:carried[index],event=source.at(-1);
            if(!event)return null;
            if(source.filter(c=>c.onsetTick===event.onsetTick).length>1)throw Error('同じ位置の複数コードは試聴未対応です');
            if(local.length)return event.durationTicks!==undefined&&tick>=event.onsetTick+event.durationTicks?null:event;
            return event.durationTicks===undefined?event:null;
        },
        next(index,tick){return rows[index].find(c=>c.onsetTick>tick)?.onsetTick??1920;}
    };
}
