// Keep the CAGED shape where possible. Search only nearby positions for the
// named bass and missing tones, then check the actual lowest sounding MIDI note.
export function voiceAlteration(original,tuning,capo,required,bass,min,end){
    const midi=n=>tuning[n.string-1]+capo+n.fret;
    const fretted=original.filter(n=>n.fret>0).map(n=>n.fret);
    const first=Math.min(...fretted,end),last=Math.max(...fretted,1);
    const positions=pc=>{
        const out=[];
        for(let string=1;string<=6;string++)for(let fret=min;fret<=end;fret++){
            if(fret && (fret<last-4 || fret>first+4))continue;
            const n={string,fret,finger:null};
            if(midi(n)%12===pc)out.push(n);
        }
        return out;
    };
    let best=null,bestCost=Infinity;
    function complete(notes,low,remaining){
        const missing=remaining.find(pc=>!notes.some(n=>midi(n)%12===pc));
        if(missing!==undefined){
            for(const n of positions(missing)){
                if(midi(n)<low || notes.some(old=>old.string===n.string))continue;
                complete([...notes,n],low,remaining);
            }
            return;
        }
        const frets=notes.filter(n=>n.fret>0).map(n=>n.fret);
        if(Math.max(...frets)-Math.min(...frets)>4)return;
        const kept=notes.filter(n=>original.includes(n)).length;
        const highest=Math.max(0,...frets);
        const reach=Math.max(0,highest-last,first-Math.min(...frets));
        const cost=(original.length-kept)*8+(notes.length-kept)*9+reach*10+highest*.1;
        if(cost<bestCost){bestCost=cost;best=notes;}
    }
    // Dropping duplicate tones can make room for a tension on a
    // fully occupied shape. At most 64 subsets of a six-string instrument.
    for(const lowNote of [...original.filter(n=>midi(n)%12===bass),...positions(bass)]){
        const low=midi(lowNote);
        const upper=original.filter(n=>n.string!==lowNote.string && midi(n)>=low && required.includes(midi(n)%12));
        for(let mask=0;mask<(1<<upper.length);mask++){
            const notes=[lowNote,...upper.filter((_,i)=>mask&(1<<i))];
            if((original.length-notes.filter(n=>original.includes(n)).length)*8>=bestCost)continue;
            if(required.filter(pc=>!notes.some(n=>midi(n)%12===pc)).length>6-notes.length)continue;
            complete(notes,low,required);
        }
    }
    return best;
}
// Older automatic forms omitted the slash bass or the sixth overlay. Resolve
// these on read, keeping the stored project and explicit string choices intact.
export function automaticVoicingSnapshot(event,material,binding){
    const snapshot=material.snapshot;
    if(binding?.mode!=='auto' || material.provenance?.origin!=='owner-recommendation' ||
        material.provenance.sourceSymbol!==event.symbol)return snapshot;
    const match=/^([A-G][#♯b♭]?)([^/]*)(?:\/([A-G][#♯b♭]?))?$/.exec(event.symbol);
    if(!match)return snapshot;
    const [,root,quality,bass]=match;
    const needsSixth=quality==='6'||quality==='m6';
    if(!bass&&!needsSixth)return snapshot;
    const notes=snapshot.strings.filter(n=>n.kind==='note');
    if(!notes.length || notes.length!==binding.playedStrings?.length || !notes.every(n=>binding.playedStrings.includes(n.string)))return snapshot;
    const notePc=name=>({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[name[0]]+({'#':1,'♯':1,b:-1,'♭':-1}[name[1]]||0)+12)%12;
    const bassPc=notePc(bass||root),sixthPc=(notePc(root)+9)%12;
    const midi=n=>snapshot.tuningMidi[n.string-1]+snapshot.capo+n.relativeFret;
    const pcs=new Set(notes.map(n=>midi(n)%12));
    if(Math.min(...notes.map(midi))%12===bassPc&&(!needsSixth||pcs.has(sixthPc)))return snapshot;
    pcs.add(bassPc);
    if(needsSixth)pcs.add(sixthPc);
    const original=notes.map(n=>({...n,fret:n.relativeFret}));
    const generation=material.provenance.generation;
    const revised=voiceAlteration(original,snapshot.tuningMidi,snapshot.capo,[...pcs],bassPc,
        generation.minRelativeFret,generation.maxRelativeFret);
    if(!revised)return null;
    const strings=snapshot.strings.map(({string})=>{
        const note=revised.find(n=>n.string===string);
        return note?{string,kind:'note',relativeFret:note.fret,finger:note.finger,fingeringWarning:!!note.fingeringWarning}:{string,kind:'muted'};
    });
    const barres=snapshot.barres.filter(b=>strings.every(n=>n.string<b.fromString||n.string>b.toString||
        n.kind==='note' && (n.relativeFret>b.relativeFret&&n.string!==b.fromString&&n.string!==b.toString ||
            n.relativeFret===b.relativeFret&&String(n.finger)===String(b.finger))));
    return {...snapshot,strings,barres};
}
