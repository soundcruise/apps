import {parseChordForms} from './chord-form-transfer.mjs';
import {MAX_BYTES} from './chord-name-transfer.mjs';

// A presentation-only read contract. No credentials, storage or transport live here.
const fail=()=>{throw Error('本棚の接続・内容が変わりました。更新して選び直してください。');};
const text=v=>typeof v==='string'&&v.length>0&&v.length<=128;
function state(source){
    const value=source.getState();
    if(!value||value.phase!=='ready'||!text(value.generation)||!text(value.revision))fail();
    return {generation:value.generation,revision:value.revision};
}
export function bookSourceCurrent(source,stamp){
    try{const now=state(source);return now.generation===stamp.generation&&now.revision===stamp.revision;}catch{return false;}
}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export async function readBookSource(source,{signal,isCurrent=()=>true}={}){
    const before=state(source);
    if(signal?.aborted||!isCurrent())fail();
    const result=await source.read({signal});
    if(signal?.aborted||!isCurrent()||!bookSourceCurrent(source,before))fail();
    if(!result||Object.keys(result).length!==3||!['generation','revision','catalogue'].every(k=>Object.hasOwn(result,k))||result.generation!==before.generation||result.revision!==before.revision)fail();
    const json=JSON.stringify(result.catalogue);
    if(typeof json!=='string'||new TextEncoder().encode(json).length>MAX_BYTES)fail();
    // Reuse the existing strict name/form boundary; strip nothing silently.
    return freeze({...before,catalogue:parseChordForms(json)});
}
