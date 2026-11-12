import {validateChordNames,MAX_BYTES} from './chord-name-transfer.mjs';
export const FORM_FORMAT='sound-cruise/chord-forms';
const formBad=()=>{throw Error('フォームJSONの形式・弦・フレット・楽器条件を確認してください');};
function formRecord(x,keys){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!keys.includes(k)))formBad();}
export function validateTransferForm(s){
    formRecord(s,['capo','tuningMidi','maxAbsoluteFret','strings','barres','playability','ownerWarning']);
    const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
    if(!(s.capo===null||integer(s.capo,0,11))||!(s.maxAbsoluteFret===null||integer(s.maxAbsoluteFret,s.capo??0,36))||!(s.tuningMidi===null||JSON.stringify(s.tuningMidi)==='[64,59,55,50,45,40]'))formBad();
    if(!Array.isArray(s.strings)||s.strings.length!==6||!Array.isArray(s.barres)||s.barres.length>6)formBad();
    for(const [i,n]of s.strings.entries()){formRecord(n,n.kind==='muted'?['string','kind']:['string','kind','relativeFret','finger','fingeringWarning']);if(n.string!==i+1||!['note','muted'].includes(n.kind))formBad();if(n.kind==='note'&&(!integer(n.relativeFret,0,(s.maxAbsoluteFret??36)-(s.capo??0))||![null,1,2,3,4,'T'].includes(n.finger)||typeof n.fingeringWarning!=='boolean'))formBad();}
    if(!s.strings.some(n=>n.kind==='note')||![null,'standard','advanced','limited','unknown'].includes(s.playability)||!(s.ownerWarning===null||typeof s.ownerWarning==='string'&&s.ownerWarning.length<=512))formBad();
    const claims=new Set();for(const b of s.barres){formRecord(b,['finger','relativeFret','fromString','toString']);if(![1,2,3,4,'1','2','3','4'].includes(b.finger)||!integer(b.relativeFret,1,(s.maxAbsoluteFret??36)-(s.capo??0))||!integer(b.fromString,1,5)||!integer(b.toString,b.fromString+1,6))formBad();const key=JSON.stringify(b);if(claims.has(key))formBad();claims.add(key);for(const string of [b.fromString,b.toString]){const n=s.strings[string-1];if(n.kind!=='note'||n.relativeFret!==b.relativeFret||String(n.finger)!==String(b.finger))formBad();}if(s.strings.some(n=>n.kind==='note'&&n.string>b.fromString&&n.string<b.toString&&(n.relativeFret<b.relativeFret||String(n.finger)===String(b.finger)&&n.relativeFret!==b.relativeFret)))formBad();}
    return JSON.parse(JSON.stringify(s));
}
export function makeChordForms(folders,chords){
    for(const c of chords)formRecord(c,['id','folderId','name','form']);
    const names=validateChordNames({format:'sound-cruise/chord-names',version:1,sourceApp:'chord-cruise',folders,chords:chords.map(({id,folderId,name})=>({id,folderId,name}))});
    const value={format:FORM_FORMAT,version:1,sourceApp:'chord-cruise',folders:names.folders,chords:names.chords.map((c,i)=>({...c,form:validateTransferForm(chords[i].form)}))};
    if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_BYTES)formBad();return value;
}
export function parseChordForms(text){if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)formBad();const v=JSON.parse(text);formRecord(v,['format','version','sourceApp','folders','chords']);if(v.format!==FORM_FORMAT||v.version!==1||v.sourceApp!=='chord-cruise'||!Array.isArray(v.chords))formBad();return makeChordForms(v.folders,v.chords);}
// Read only the explicit saved coordinates. Missing string states are not mutes.
export function savedChordForm(c,detectBarres=()=>[]){
    if(!Array.isArray(c.notes)||c.notes.length>6||!Array.isArray(c.mutedStrings)||new Set(c.mutedStrings).size!==c.mutedStrings.length||c.mutedStrings.some(s=>!Number.isInteger(s)||s<1||s>6))formBad();
    if(c.bassFingerings?.length||c.tensionFingerings?.length||c.notes.some(n=>n.pendingDelete))throw Error('ベース／テンションの個別指定や未確定の編集があります。コード名のみを書き出すか、本棚で弦ごとの位置を確認してください');
    const seen=new Set();for(const n of c.notes){if(!Number.isInteger(n.string)||n.string<1||n.string>6||seen.has(n.string)||c.mutedStrings.includes(n.string))formBad();seen.add(n.string);}
    const strings=[1,2,3,4,5,6].map(string=>{const n=c.notes.find(n=>n.string===string);if(n)return {string,kind:'note',relativeFret:n.fret,finger:n.finger??null,fingeringWarning:n.fingeringWarning===true};if(c.mutedStrings.includes(string))return {string,kind:'muted'};formBad();});
    // Historical bookshelf records do not declare capo/tuning/fret limit.
    return validateTransferForm({capo:null,tuningMidi:null,maxAbsoluteFret:null,strings,barres:detectBarres(c.notes).map(b=>({finger:b.finger,relativeFret:b.fret,fromString:b.fromString,toString:b.toString})),playability:'unknown',ownerWarning:'本棚由来の演奏条件を確認してください'});
}
