// Shared sample onset and output-device timing; no transport or storage ownership.
// Presentation reads the output device position; scheduling keeps currentTime.
// https://webaudio.github.io/web-audio-api/#dom-audiocontext-getoutputtimestamp
export function outputContextTime(context,performanceTime){
 const current=context?.currentTime||0;
 try{const s=context.getOutputTimestamp?.();if(s&&Number.isFinite(s.contextTime)&&s.contextTime>=0&&Number.isFinite(s.performanceTime)&&s.performanceTime>0&&Math.abs(performanceTime-s.performanceTime)<2000){const at=s.contextTime+(performanceTime-s.performanceTime)/1000;if(at>=0&&at<=current+.02)return Math.min(current,at);}}catch{}
 const latency=[context?.baseLatency,context?.outputLatency].reduce((sum,n)=>sum+(Number.isFinite(n)&&n>0?n:0),0);return Math.max(0,current-Math.min(2,latency));
}

// Bundled MP3s include encoder/sample lead-in. Remove only the inaudible prefix;
// never delay the transport or alter pitch/strum spacing to hide that prefix.
export function attackFrame(buffer){
 const limit=Math.min(buffer.length,Math.ceil(buffer.sampleRate*.25));let peak=0;
 for(let ch=0;ch<buffer.numberOfChannels;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<limit;i++)peak=Math.max(peak,Math.abs(data[i]));}
 if(peak<.0001)return 0;const threshold=Math.max(.00001,peak*.0025);let first=limit;
 for(let ch=0;ch<buffer.numberOfChannels;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<Math.min(limit,first);i++)if(Math.abs(data[i])>=threshold){first=i;break;}}
 return first===limit?0:Math.max(0,first-Math.ceil(buffer.sampleRate*.001));
}
export function trimSampleAttack(context,buffer){const start=attackFrame(buffer);if(!start)return buffer;const trimmed=context.createBuffer(buffer.numberOfChannels,buffer.length-start,buffer.sampleRate);for(let ch=0;ch<buffer.numberOfChannels;ch++)trimmed.getChannelData(ch).set(buffer.getChannelData(ch).subarray(start));return trimmed;}

// A changed fingering damps quickly. A common note can ring until the pick
// reaches its string, just as it does between strokes within a chord.
// Measured pick lead relative to a grid-aligned click, including muted strokes.
// Allow a newly resumed audio output to settle before the first short count click.
// Both transports add this to their normal 30 ms scheduling lead, once per count-in.
export const COUNT_IN_OUTPUT_SETTLE_SECONDS = .12;
// At 400 BPM a beat lasts 150 ms. Leave a distinct gap even at that tempo.
export const COUNT_IN_PULSE_SECONDS = .115;
export const GUITAR_LEAD_SECONDS = .010;
export const CONNECTED_STRUM_RELEASE = .008;

export function stringDampTime(beat, nextPick, samePitch, followingCut) {
    // Limit overlap between different pitches to the start of the new stroke.
    return Math.min(nextPick, followingCut, samePitch ? Infinity : beat + .012);
}

export const METRONOME_SOUNDS=Object.freeze({click:'クリック',wood:'ウッド',beep:'電子音',hihat:'ハイハット'});
export const normalizeMetronomeSound=value=>Object.hasOwn(METRONOME_SOUNDS,value)?value:'click';
const beatBuffers=new WeakMap();
export function metronomeSample(context,midi,tone='click',part='click'){
 const counting=part==='count';
 tone=normalizeMetronomeSound(tone);let cache=beatBuffers.get(context);if(!cache){cache=new Map();beatBuffers.set(context,cache);}const key=part+':'+tone+':'+midi;if(cache.has(key))return cache.get(key);
 const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*(counting?COUNT_IN_PULSE_SECONDS:.06)),context.sampleRate),data=buffer.getChannelData(0),high=midi===84;
 let seed=9137;
 let previous=0;
 for(let i=0;i<data.length;i++){const t=i/context.sampleRate,a=Math.min(1,t/.001);
  // Retain the attack and pitch of each timbre. A slower decay leaves an
  // audible body if a speaker attenuates the initial transient.
  const decayTime=counting?t*.32:t;
  let raw;
  if(tone==='wood'){seed=(seed*1664525+1013904223)>>>0;raw=a*Math.exp(-decayTime/.009)*(.7*Math.sin(2*Math.PI*(high?1900:1250)*t)+.3*(seed/2147483648-1));}
  else if(tone==='hihat'){seed=(seed*1664525+1013904223)>>>0;const noise=seed/2147483648-1,hp=noise-.88*previous;previous=noise;const metal=[1,1.342,1.784,2.112].reduce((v,r)=>v+Math.sin(2*Math.PI*(high?4200:3300)*r*t),0)/4;raw=a*Math.exp(-decayTime/.018)*(.65*hp+.35*metal);}
  else raw=Math.sin(2*Math.PI*(tone==='beep'?(high?1200:800):(high?1500:1000))*t)*a*Math.exp(-decayTime/(tone==='beep'?.024:.018));
  // Peak-safe soft limiting increases the beat's body without compressing music.
  data[i]=.92*Math.tanh(raw*3);
 }
 const sample={midi,buffer};cache.set(key,sample);return sample;
}
