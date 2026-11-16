import {assertJSON,record,insist,clone,freeze} from './json.mjs';
export const PRESET_FORMAT='sound-cruise/view-preset';
export const MAX_PRESET_BYTES=65536;
export function createPresetCodec(normalizePresentation){
    function verify(input,score){
        assertJSON(input);record(input,['format','formatVersion','name','presentation']);
        insist(input.format===PRESET_FORMAT&&input.formatVersion===1,'unsupported-preset');
        insist(typeof input.name==='string'&&input.name.trim().length>0&&input.name.length<=40&&!/[\u0000-\u001f\u007f]/.test(input.name),'invalid-preset-name');
        record(input.presentation,['version','layout','zoom','flow']);
        const normalized=normalizePresentation({...clone(input.presentation),rows:[]},score);
        const {rows,...presentation}=normalized.value;
        return freeze({format:PRESET_FORMAT,formatVersion:1,name:input.name.trim(),presentation,warnings:normalized.warnings});
    }
    return Object.freeze({
        encode(name,presentation,score){
            const input={format:PRESET_FORMAT,formatVersion:1,name,presentation:{version:1,layout:presentation.layout,zoom:presentation.zoom,flow:presentation.flow}};
            const result=verify(input,score),{warnings,...file}=result,text=JSON.stringify(file)+'\n';
            insist(new TextEncoder().encode(text).length<=MAX_PRESET_BYTES,'preset-budget');return {text,preset:result};
        },
        decode(bytes,score){
            insist(typeof bytes==='string'||bytes instanceof Uint8Array,'invalid-preset-input');
            if(typeof bytes==='string')insist(bytes.length<=MAX_PRESET_BYTES,'preset-budget');
            bytes=typeof bytes==='string'?new TextEncoder().encode(bytes):bytes;
            insist(bytes.byteLength<=MAX_PRESET_BYTES,'preset-budget');
            let input;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('invalid-preset-json');}
            return verify(input,score);
        }
    });
}
