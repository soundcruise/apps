// One adapter for the original owner renderer; gestures never write outside Session.
export function formDiagramOptions(snapshot,chord,explore,{monochrome=false,mode='finger',onSlotTap,onEmptySlotTap,...options}={}){
    return {...options,monochrome,markers:snapshot.strings.filter(n=>n.kind==='note').map(n=>{
        const midi=snapshot.tuningMidi[n.string-1]+snapshot.capo+n.relativeFret,pc=(midi%12+12)%12,interval=(pc-chord.rootPc+12)%12;
        const label=mode==='finger'?explore.readFingerLabel(n.finger)||(n.fingeringWarning?'⚠':''):explore.readMarkerLabel(chord,pc,interval,n.finger,n.fingeringWarning);
        return {string:n.string,fret:n.relativeFret,label,role:explore.readMarkerRole(chord,interval),fingeringWarning:mode==='finger'&&!!n.fingeringWarning,tappable:!!onSlotTap&&mode==='finger',ariaLabel:n.string+'弦 '+n.relativeFret+'フレット、'+(label||'指未指定')+'。クリックで指を変更'};
    }),mutedStrings:snapshot.strings.filter(n=>n.kind==='muted').map(n=>n.string),barres:snapshot.barres.map(b=>({...b,fret:b.relativeFret})),markerLabelSize:'medium',onSlotTap:mode==='finger'?onSlotTap:undefined,onEmptySlotTap:mode==='finger'?onEmptySlotTap:undefined};
}
export function drawChordForm(fretboard,container,snapshot,chord,explore,monochrome=true,saveRange=null){
    container.replaceChildren();if(!snapshot){container.textContent='フォーム候補がありません';return ()=>{};}
    const notes=snapshot.strings.filter(n=>n.kind==='note'),fretsOfNotes=notes.map(n=>n.relativeFret),includesOpen=fretsOfNotes.includes(0);
    const range=saveRange||{min:fretsOfNotes.length?Math.min(...fretsOfNotes):1,max:Math.max(includesOpen?3:1,...fretsOfNotes),includesOpen};
    const frets=[];if(range.includesOpen)frets.push(0);for(let f=Math.max(1,range.min);f<=range.max;f++)frets.push(f);
    const options=formDiagramOptions(snapshot,chord,explore,{monochrome,frets});
    const board=container.ownerDocument.createElement('div');board.className='score-chord-diagram-board';container.append(board);fretboard.render(board,options);
    const width=fretboard.createModel(options).width;board.style.width=width+'px';board.style.transformOrigin='0 0';
    function fit(){const scale=Math.min(1,container.clientWidth/Math.max(width,4*fretboard.FRET_W)),left=(container.clientWidth-width*scale)/2;board.style.transform='translateX('+left+'px) scale('+scale+')';container.style.height=board.offsetHeight*scale+'px';}
    fit();const observer=new ResizeObserver(fit);observer.observe(container);return ()=>observer.disconnect();
}
