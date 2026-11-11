// Name-only transfer v1. No storage, form snapshots, authentication or Sync data.
export const FORMAT='sound-cruise/chord-names';
export const MAX_BYTES=262144,MAX_CHORDS=512;
const bad=()=>{throw Error('コード名JSONの形式・件数・文字数を確認してください');};
function record(x,keys){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!keys.includes(k)))bad();}
function text(x,max){if(typeof x!=='string'||!x.trim()||x.length>max||/[\u0000-\u001f\u007f]/.test(x))bad();return x;}
export function validateChordNames(value){
    record(value,['format','version','sourceApp','folders','chords']);
    if(value.format!==FORMAT||value.version!==1||value.sourceApp!=='chord-cruise'||!Array.isArray(value.folders)||!Array.isArray(value.chords)||!value.chords.length||value.chords.length>MAX_CHORDS||value.folders.length>MAX_CHORDS)bad();
    const folders=new Set(),ids=new Set();
    const cleanFolders=value.folders.map(f=>{record(f,['id','name']);const id=text(f.id,128);if(folders.has(id))bad();folders.add(id);return {id,name:text(f.name,128)};});
    const chords=value.chords.map(c=>{record(c,['id','folderId','name']);const id=text(c.id,128),folderId=text(c.folderId,128);if(ids.has(id)||!folders.has(folderId))bad();ids.add(id);return {id,folderId,name:text(c.name,64)};});
    return {format:FORMAT,version:1,sourceApp:'chord-cruise',folders:cleanFolders,chords};
}
export function parseChordNames(source){if(typeof source!=='string'||new TextEncoder().encode(source).length>MAX_BYTES)bad();let value;try{value=JSON.parse(source);}catch{bad();}return validateChordNames(value);}
export function makeChordNames(folders,chords){const value=validateChordNames({format:FORMAT,version:1,sourceApp:'chord-cruise',folders,chords});if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_BYTES)bad();return value;}
