// Strummed accompaniment holds harmony across bars. MIDI can still use
// the explicit duration carried by imported chord events.
export function createHarmonyTimeline(project,{holdForStrums=false}={}){
    const rows=project.bars.map(b=>b.chords.filter(c=>!holdForStrums || c.symbol?.trim()).sort((a,b)=>a.onsetTick-b.onsetTick));
    const carried=[];let previous=[];
    rows.forEach((row,i)=>{carried[i]=previous;if(row.length)previous=row;});
    return {
        at(index,tick){
            const local=rows[index].filter(c=>c.onsetTick<=tick),source=local.length?local:carried[index],event=source.at(-1);
            if(!event)return null;
            if(source.filter(c=>c.onsetTick===event.onsetTick).length>1)throw Error('同じ位置の複数コードは試聴未対応です');
            if(local.length)return !holdForStrums&&event.durationTicks!==undefined&&tick>=event.onsetTick+event.durationTicks?null:event;
            return holdForStrums||event.durationTicks===undefined?event:null;
        },
        next(index,tick){return rows[index].find(c=>c.onsetTick>tick)?.onsetTick??((project.songInfo?.timeSignature?.beats??4)*480);}
    };
}
