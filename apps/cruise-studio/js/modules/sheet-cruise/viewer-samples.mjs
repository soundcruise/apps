import {trimSampleAttack} from '../../../../score-viewer/core/sample-attack.mjs';
// Same bundled sample banks and synthesis/envelopes as Sheet Cruise. Fixed
// application URLs only; no sound/font URLs from a viewer file are loaded.
export function createViewerSamples(C,doc=document){
    const pending=new Map(),decoded=new WeakMap();
    function bank(part){
        const key=part==='guitar'?'guitarSamples':'pianoSamples';if(C[key])return Promise.resolve(C[key]);
        if(!pending.has(key))pending.set(key,new Promise((resolve,reject)=>{
            const script=doc.createElement('script');let timer;
            const finish=ok=>{clearTimeout(timer);script.onload=script.onerror=null;if(ok)resolve(C[key]);else{script.remove();pending.delete(key);reject(Error('音源を読み込めませんでした'));}};
            script.src=new URL(part==='guitar'?'../../../vendor/guitar/acoustic-bank.js':'../../../vendor/piano/salamander-bank.js',import.meta.url).href;
            script.onload=()=>finish(!!C[key]);script.onerror=()=>finish(false);timer=setTimeout(()=>finish(false),10000);doc.head.append(script);
        }));return pending.get(key);
    }
    return async function loadSample(ctx,midi,part){
        let cache=decoded.get(ctx);if(!cache){cache=new Map();decoded.set(ctx,cache);}
        if(['click','count','mute'].includes(part)){
            const key=part+':'+midi;if(cache.has(key))return cache.get(key);
            const mute=part==='mute',buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*(mute?.085:.06)),ctx.sampleRate),data=buffer.getChannelData(0);
            let seed=9137,previous=0;
            for(let i=0;i<data.length;i++){
                if(mute){seed=(seed*1664525+1013904223)>>>0;const noise=seed/2147483648-1;data[i]=(noise-previous)*.5*Math.exp(-i/(ctx.sampleRate*.018));previous=noise;}
                else{const t=i/ctx.sampleRate;data[i]=Math.sin(2*Math.PI*(midi===84?1500:1000)*t)*Math.min(1,t/.001)*Math.exp(-t/.009);}
            }
            const value={midi:mute?60:midi,buffer};cache.set(key,value);return value;
        }
        const source=await bank(part),sample=source.samples.reduce((best,s)=>Math.abs(s.midi-midi)<Math.abs(best.midi-midi)?s:best),key=part+':'+sample.midi;
        if(!cache.has(key)){
            const binary=atob(sample.mp3),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
            cache.set(key,ctx.decodeAudioData(bytes.buffer).then(buffer=>({midi:sample.midi,buffer:trimSampleAttack(ctx,buffer)})).catch(error=>{cache.delete(key);throw error;}));
        }
        return cache.get(key);
    };
}
