/* Offline comparison from the real Web Audio scheduler and the unchanged sample bank.
   Run with NODE_PATH pointing to Playwright. No live browser profile or account. */
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..'),studio=path.join(root,'apps/cruise-studio');
const baseline='ece208672f3f8ed815687666dc5ddeb6685930bd';
const output=path.resolve(process.argv[2]||path.join(studio,'docs/acoustic-review-20261115'));
function segment(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);if(a<0||b<=a)throw Error('source boundary changed');return source.slice(a,b);}
function wav(samples,rate=44100){const b=Buffer.alloc(44+samples.length*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(32,34);b.write('data',36);b.writeUInt32LE(samples.length*4,40);samples.forEach((x,i)=>b.writeFloatLE(x,44+i*4));return b;}
const run=(...args)=>execFileSync('ffmpeg',['-hide_banner','-nostats',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
function loudness(file){
 const r=require('node:child_process').spawnSync('ffmpeg',['-hide_banner','-nostats','-i',file,'-af','loudnorm=I=-28:TP=-1:LRA=11:print_format=json','-f','null','-'],{encoding:'utf8'});if(r.status)throw Error(r.stderr);return JSON.parse(r.stderr.slice(r.stderr.lastIndexOf('{'),r.stderr.lastIndexOf('}')+1));}
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const old=execFileSync('git',['show',baseline+':apps/cruise-studio/js/modules/sheet-cruise/sheet-cruise.js'],{cwd:root,encoding:'utf8'}),current=fs.readFileSync(path.join(studio,'js/modules/sheet-cruise/sheet-cruise.js'),'utf8');
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const context=await browser.newContext();const origin='http://acoustic.fixture.invalid';
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Offline acoustic QA</title>'});
   const f=path.resolve(root,'.'+u.pathname);if(!f.startsWith(root+path.sep))return route.abort();return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(f)});});
  const page=await context.newPage();await page.goto(origin);await page.evaluate(()=>window.CruiseStudio={});
  await page.addScriptTag({url:origin+'/apps/cruise-studio/js/core/audio-coordinator.js'});
  await page.addScriptTag({url:origin+'/apps/cruise-studio/vendor/guitar/acoustic-bank.js'});
  const raw=await page.evaluate(async sources=>{
   const {buildSongPreviewPlan}=await import('/apps/cruise-studio/js/modules/sheet-cruise/score-playback.mjs');
   const {chordNotes}=await import('/apps/cruise-studio/js/modules/sheet-cruise/chord-audition.mjs');
   const make=(id,frets)=>({id,snapshot:{capo:0,tuningMidi:[64,59,55,50,45,40],strings:frets.map((f,i)=>f===null?{string:i+1,kind:'muted'}:{string:i+1,kind:'note',relativeFret:f})}});
   const forms=[make('C',[0,1,0,2,3,null]),make('G',[3,0,0,0,2,3])];
   const groups=[['down','down','down','down'],['up','up','up','up'],['down','up','down','up'],['down','rest','up','mute']];
   const p={songInfo:{bpm:100},materials:{forms},performance:{formBindings:[]},bars:[]};
   for(let i=0;i<8;i++){
    const chords=[{id:'c'+i,symbol:'C',onsetTick:0}];if(i>=6)chords.push({id:'g'+i,symbol:'G',onsetTick:960});
    for(const c of chords)p.performance.formBindings.push({chordEventId:c.id,materialId:c.symbol,playedStrings:c.symbol==='C'?[1,2,3,4,5]:[1,2,3,4,5,6]});
    p.bars.push({melody:[],chords});
   }
   const deps={pitchMidi:n=>n,parseChord:s=>({root:s,quality:'maj'}),qualities:{maj:{intervals:[0,4,7]}},notePc:n=>n==='C'?0:7,
    rhythm:(p,i)=>({encoding:'studio-strum-v1',slots:groups[Math.floor(i/2)].map((action,n)=>({tick:n*480,action,durationTicks:240}))})};
   // Old sound is given the SAME registered form to isolate articulation from the known voicing bug.
   const oldBuild=new Function(sources.oldPlan+';return buildSongPreviewPlan;')();
   const plans={old:oldBuild(p,{...deps,chordNotes:c=>chordNotes(p,c,deps)}),new:buildSongPreviewPlan(p,deps),
    'old-normal':oldBuild(p,deps)};
   const out={};
   for(const [name,plan] of Object.entries(plans)){
    const ctx=new OfflineAudioContext(1,Math.ceil((plan.duration+.1)*44100),44100);let state='running';
    const facade={get state(){return state;},get currentTime(){return ctx.currentTime;},destination:ctx.destination,
     resume:async()=>{},close:async()=>{state='closed';},createBufferSource:()=>ctx.createBufferSource(),createGain:()=>ctx.createGain()};
    const cache=new Map();
    async function loadSample(_ctx,midi,part){
     if(part==='mute'){
      const b=ctx.createBuffer(1,Math.ceil(44100*.085),44100),d=b.getChannelData(0);let seed=9137,previous=0;
      for(let j=0;j<d.length;j++){seed=(seed*1664525+1013904223)>>>0;const noise=seed/2147483648-1;d[j]=(noise-previous)*.5*Math.exp(-j/(44100*.018));previous=noise;}return {midi:60,buffer:b};
     }
     const sample=CruiseStudio.guitarSamples.samples.reduce((best,s)=>Math.abs(s.midi-midi)<Math.abs(best.midi-midi)?s:best);
     if(!cache.has(sample.midi))cache.set(sample.midi,ctx.decodeAudioData(Uint8Array.from(atob(sample.mp3),s=>s.charCodeAt(0)).buffer).then(buffer=>({buffer,midi:sample.midi})));
     return cache.get(sample.midi);
    }
    const create=new Function((name==='new'?sources.newRuntime:sources.oldRuntime)+';return createPianoAudition;')();
    // Each comparison uses the actual coordinator implementation in a separate instance.
    const coordinator=CruiseStudio.audioCoordinator.createCoordinator();
    const runtime=create({coordinator,createContext:()=>facade,setTimer:()=>1,clearTimer:()=>{},loadSample});
    const result=await runtime.playEvents(plan.events,()=>true,plan.duration);if(!result.ok)throw Error(JSON.stringify(result));
    const buffer=await ctx.startRendering();out[name]={samples:Array.from(buffer.getChannelData(0)),events:plan.events.length,duration:plan.duration};
    await runtime.stop();
   }
   return out;
  },{oldPlan:segment(old,'    function buildBarPreviewPlan(','    function buildBarPlayButton('),oldRuntime:segment(old,'    function createPianoAudition(','    // End short pitch audition.'),newRuntime:segment(current,'    function createPianoAudition(','    // End short pitch audition.')});
  const metrics={baseline,candidate:'0.127.0-dev.1',engine:await browser.version(),sampleRate:44100,bpm:100,
   renderer:'Real production scheduler, OfflineAudioContext; no reverb/compressor. Constant gain per segment to -28 LUFS.',sections:[]};
  const sectionNames=['down','up','alternating','rest-mute-change'],all={old:[],new:[]};
  for(let i=0;i<4;i++){
   const record={name:sectionNames[i],files:{}};const length=Math.round(4.8*44100);
   let pair=[];
   for(const kind of ['old','new']){
    const samples=raw[kind].samples.slice(Math.round(.03*44100)+i*length,Math.round(.03*44100)+(i+1)*length),tmp=path.join(output,'.raw-'+kind+'.wav');fs.writeFileSync(tmp,wav(samples));
    const measured=loudness(tmp),gainDb=-28-Number(measured.input_i),gain=10**(gainDb/20),adjusted=samples.map(n=>n*gain);
    if(adjusted.reduce((m,n)=>Math.max(m,Math.abs(n)),0)>1)throw Error('clipping');
    const matched=path.join(output,'.matched-'+kind+'.wav');fs.writeFileSync(matched,wav(adjusted));const verified=loudness(matched);
    record.files[kind]={integratedLufs:Number(verified.input_i),truePeakDbtp:Number(verified.input_tp),gainDb,events:raw[kind].events};
    if(Math.abs(Number(verified.input_i)+28)>.15||Number(verified.input_tp)>-1)throw Error('level mismatch');
    all[kind]=all[kind].concat(adjusted);pair=pair.concat(adjusted,new Array(22050).fill(0));fs.unlinkSync(tmp);fs.unlinkSync(matched);
   }
   const pairWav=path.join(output,'.pair.wav');fs.writeFileSync(pairWav,wav(pair));run('-y','-i',pairWav,'-codec:a','libmp3lame','-b:a','192k',path.join(output,sectionNames[i]+'-old-then-new.mp3'));fs.unlinkSync(pairWav);metrics.sections.push(record);
  }
  for(const kind of ['old','new']){const file=path.join(output,'.'+kind+'.wav');fs.writeFileSync(file,wav(all[kind]));run('-y','-i',file,'-codec:a','libmp3lame','-b:a','192k',path.join(output,kind+'-matched.mp3'));fs.unlinkSync(file);}
  // A separate, clearly labelled legacy normal-playback example documents the pitch mismatch.
  const oldNormal=path.join(output,'.normal.wav');fs.writeFileSync(oldNormal,wav(raw['old-normal'].samples.slice(Math.round(.03*44100),Math.round(4.83*44100))));
  const measure=loudness(oldNormal);run('-y','-i',oldNormal,'-af','volume='+(-28-Number(measure.input_i))+'dB','-codec:a','libmp3lame','-b:a','192k',path.join(output,'old-normal-voicing-bug.mp3'));fs.unlinkSync(oldNormal);
  fs.writeFileSync(path.join(output,'audio-metrics.json'),JSON.stringify(metrics,null,2)+'\n');console.log(JSON.stringify({output,files:7,sections:metrics.sections}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
