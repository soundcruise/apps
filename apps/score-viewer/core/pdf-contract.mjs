import {insist} from './json.mjs';
export const MAX_PDF_BYTES=20*1024*1024,MAX_PDF_PAGES=200;
export function isPDF(bytes){return bytes?.length>=5&&[37,80,68,70,45].every((v,i)=>bytes[i]===v);}
export function pdfBytes(input){const bytes=new Uint8Array(input).slice();insist(bytes.length<=MAX_PDF_BYTES,'pdf-byte-limit');insist(isPDF(bytes),'invalid-pdf');return bytes;}
export async function pdfHash(bytes){return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');}
export function pdfName(value){return (typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,180):'')||'譜面.pdf';}

export function normalizePDFSettings(value={},pages=0){
    value=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    const number=(v,min,max,fallback)=>Number.isFinite(v)&&v>=min&&v<=max?v:fallback;
    const overrides={};for(const [key,v]of Object.entries(value.pageBeats||{}))if(/^\d+$/.test(key)&&Number(key)<pages&&Number.isFinite(v)&&v>=1&&v<=1024)overrides[key]=v;
    return {configured:value.configured===true,mode:value.mode==='beats'?'beats':'seconds',seconds:number(value.seconds,1,3600,30),bpm:number(value.bpm,20,400,100),beats:number(value.beats,1,1024,32),pageBeats:overrides};
}
// PDF positions are page + fraction, independent of canvas size, zoom or DPR.
// No musical interpretation: performance.now is the silent monotonic clock.
export function createPDFClock({pages,now,settings={}}){
    insist(Number.isInteger(pages)&&pages>0&&pages<=MAX_PDF_PAGES,'pdf-page-limit');
    let options=normalizePDFSettings(settings,pages),position=0,anchor=0,phase='paused',last=-Infinity;
    const time=()=>{const t=now();insist(Number.isFinite(t)&&t>=last,'non-monotonic-clock');last=t;return t;};
    const duration=i=>options.mode==='seconds'?options.seconds:(options.pageBeats[i]||options.beats)*60/options.bpm;
    function sample(t){if(phase!=='playing')return position;let p=position,elapsed=t-anchor;while(p<pages){const i=Math.floor(p),left=(1-(p-i))*duration(i);if(elapsed<left)return p+elapsed/duration(i);elapsed-=left;p=i+1;}position=pages;phase='ended';return pages;}
    function snapshot(){const p=sample(time());return {phase,position:p,pageIndex:Math.min(pages-1,Math.floor(p)),ratio:p===pages?1:p%1,pages,settings:structuredClone(options)};}
    function pause(){position=sample(time());if(phase==='playing')phase='paused';return snapshot();}
    return Object.freeze({snapshot,play(){insist(options.configured,'pdf-settings-required');const t=time();if(phase!=='playing'&&position<pages){anchor=t;phase='playing';}return snapshot();},pause,
        seek(p){insist(Number.isFinite(p)&&p>=0&&p<=pages,'invalid-pdf-position');pause();position=p;phase=p===pages?'ended':'paused';return snapshot();},
        configure(patch){const playing=phase==='playing';pause();options=normalizePDFSettings({...options,...patch},pages);if(playing){anchor=time();phase='playing';}return snapshot();}});
}
