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
    const hasOpenColumn=frets[0]===0,offset=hasOpenColumn||snapshot.barres.some(b=>b.relativeFret===1)||notes.some(n=>n.string===6);
    const options=formDiagramOptions(snapshot,chord,explore,{monochrome,frets,openStringNutOnly:monochrome&&hasOpenColumn,monochromeViewportLeftCrop:monochrome&&hasOpenColumn?12:0,monochromeRightPadding:monochrome&&hasOpenColumn?18:0,monochromeFretNumberYOffset:monochrome&&offset?(snapshot.barres.some(b=>b.fromString===6||b.toString===6)?10:5):0});
    const board=container.ownerDocument.createElement('div');board.className='score-chord-diagram-board';container.append(board);fretboard.render(board,options);
    const width=board.querySelector('.cc-fb-stage').offsetWidth;board.style.width=width+'px';board.style.transformOrigin='0 0';
    function fit(){const usable=Math.max(0,container.clientWidth-32),scale=Math.min(1,usable/Math.max(width,4*fretboard.FRET_W+6)),left=(usable-width*scale)/2;board.style.transform='translateX('+left+'px) scale('+scale+')';container.style.height=board.offsetHeight*scale+16+'px';}
    fit();const observer=new ResizeObserver(fit);observer.observe(container);return ()=>observer.disconnect();
}
