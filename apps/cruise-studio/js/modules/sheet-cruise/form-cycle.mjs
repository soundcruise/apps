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
export function validBarres(snapshot){return snapshot.barres.filter(b=>[b.fromString,b.toString].every(string=>{const n=snapshot.strings[string-1];return n.kind==='note'&&n.relativeFret===b.relativeFret&&String(n.finger)===String(b.finger);})&&!snapshot.strings.some(n=>n.kind==='note'&&n.string>b.fromString&&n.string<b.toString&&(n.relativeFret<b.relativeFret||String(n.finger)===String(b.finger)&&n.relativeFret!==b.relativeFret)));}
