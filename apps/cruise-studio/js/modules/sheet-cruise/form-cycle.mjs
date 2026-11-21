import {automaticVoicingSnapshot} from '../chord/form-voicing.mjs';
// Same cycle as the Chord owner's stored-note editor, scoped to a single diagram.
export function cycleFormNote(note){
 if(note.fret===0)return {finger:null,fingeringWarning:false,deleted:true};
 const states=[null,'T',1,2,3,4,'warning','delete'];
 const current=note.fingeringWarning&&note.finger===null?'warning':['T',1,2,3,4].includes(note.finger)?note.finger:null,next=states[(states.indexOf(current)+1)%states.length];
 return {finger:['T',1,2,3,4].includes(next)?next:null,fingeringWarning:next==='warning',deleted:next==='delete'};
}
export function playedSnapshot(snapshot,played){
 if(!Array.isArray(played)||!snapshot.strings.some(n=>n.kind==='note'&&!played.includes(n.string)))return snapshot;
 return {...snapshot,strings:snapshot.strings.map(n=>n.kind==='note'&&!played.includes(n.string)?{string:n.string,kind:'muted'}:n),barres:snapshot.barres.filter(b=>snapshot.strings.every(n=>n.string<b.fromString||n.string>b.toString||played.includes(n.string)))};
}
export function boundSnapshot(event,material,binding){
 const snapshot=automaticVoicingSnapshot(event,material,binding);
 return snapshot===material.snapshot?playedSnapshot(snapshot,binding.playedStrings):snapshot;
}
export function validBarres(snapshot){return snapshot.barres.filter(b=>[b.fromString,b.toString].every(string=>{const n=snapshot.strings[string-1];return n.kind==='note'&&n.relativeFret===b.relativeFret&&String(n.finger)===String(b.finger);})&&!snapshot.strings.some(n=>n.kind==='note'&&n.string>b.fromString&&n.string<b.toString&&(n.relativeFret<b.relativeFret||String(n.finger)===String(b.finger)&&n.relativeFret!==b.relativeFret)));}

// Some saved fingerings have no explicit barre. Higher fretted notes can
// sound above an index barre, while open or muted strings break an inferred span.
export function diagramBarres(snapshot){
    let bars=validBarres(snapshot);
    const isIndex=note=>note.kind==='note' && note.finger===1 && note.relativeFret>0;
    const frets=new Set(snapshot.strings.filter(isIndex).map(note=>note.relativeFret));
    for(const fret of frets){
        let endpoints=[];
        function finishSpan(){
            if(endpoints.length>=2){
                const fromString=endpoints[0],toString=endpoints[endpoints.length-1];
                const matching=bar=>Number(bar.finger)===1 && bar.relativeFret===fret;
                if(!bars.some(bar=>matching(bar) && bar.fromString<=fromString && bar.toString>=toString)){
                    bars=bars.filter(bar=>!(matching(bar) && bar.fromString>=fromString && bar.toString<=toString));
                    bars.push({finger:1,relativeFret:fret,fromString,toString});
                }
            }
            endpoints=[];
        }
        for(const note of snapshot.strings){
            if(isIndex(note) && note.relativeFret===fret)endpoints.push(note.string);
            else if(note.kind!=='note' || note.relativeFret<=fret || note.finger===1)finishSpan();
        }
        finishSpan();
    }
    return bars;
}
