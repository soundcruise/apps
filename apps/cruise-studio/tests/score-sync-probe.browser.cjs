// Compare rendered cursor against actual click reservations and device timestamp.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,webkit}=require('playwright'),origin='http://127.0.0.1:18874';
for(const engine of ['chrome','webkit'])test('cursor follows absolute musical position and signed sync offset: '+engine,async()=>{
 const {viewerFixture}=await import('./helpers/viewer-fixture.mjs'),f=viewerFixture();f.score.songInfo.bpm=120;const file=await f.contract.codec.encode(f.score,f.metadata);
 const b=await(engine==='chrome'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch()),results=[];
 try{for(const editor of [true,false]){
 const c=await b.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await c.addInitScript(()=>{window.__sync={};const Base=AudioContext;window.AudioContext=class extends Base{
 constructor(...a){super(...a);__sync.ctx=this;this.silent=super.createGain();this.silent.gain.value=0;this.silent.connect(this.destination);}
 createGain(){const n=super.createGain(),connect=n.connect.bind(n);n.connect=(t,...a)=>connect(t===this.destination?this.silent:t,...a);return n;}
 createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n);n.start=(t,...a)=>{if(n.buffer?.duration===.06&&__sync.origin===undefined)__sync.origin=t;return start(t,...a);};return n;}
 };});
 try{await p.goto(origin+(editor?'':'/apps/score-viewer/local/'));await p.waitForFunction(editor?()=>document.documentElement.dataset.studioEntry==='ready':()=>!!window.CruiseViewer);
 if(editor){await p.click('#open-sheet-cruise');await p.locator('#sc-import-json').setInputFiles({name:'sync.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f.score))});await p.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,f.score.projectId);await p.click('#sc-playback-settings');await p.locator('#sc-count-in').uncheck();await p.locator('#sc-metronome').check();await p.click('[data-playback-done]');await p.locator('#sc-sheet-scale-box .sheet-bar').first().click({position:{x:3,y:3}});await p.click('#sc-repeat');await p.click('#sc-song-preview');await p.click('#sc-playback-settings');}
 else{await p.evaluate(t=>CruiseViewer.view.openBytes(t),file.text);await p.click('[data-viewer-action=playback-settings]');await p.locator('[data-viewer-playback=countIn]').uncheck();await p.click('[data-viewer-audio-play]');}
 await p.waitForFunction(()=>__sync.origin!==undefined);
 for(const delay of [0,200,-200]){
 await p.locator(editor?'[data-playback-delay]':'[data-viewer-delay]').evaluate((el,n)=>{el.value=n;el.dispatchEvent(new Event('input',{bubbles:true}));},delay);
 await p.waitForTimeout(250);
 const samples=await p.evaluate(async({editor,delay})=>{const samples=[],period=editor?2:24;for(let i=0;i<60;i++){await new Promise(r=>requestAnimationFrame(r));const cursor=document.querySelector(editor?'#sc-sheet-scale-box>[data-score-playhead]':'[data-viewer-playhead]'),bar=document.querySelector(editor?'.sc-playing-bar':'.sv-playing'),ctx=__sync.ctx;if(!bar||!cursor)continue;const r=bar.getBoundingClientRect(),frac=(cursor.getBoundingClientRect().left-r.left)/r.width,index=Number(bar.dataset.barNumber)-1,stamp=ctx.getOutputTimestamp?.();const output=stamp?.performanceTime>0?stamp.contextTime+(performance.now()-stamp.performanceTime)/1000:Math.max(0,ctx.currentTime-(ctx.baseLatency||0)-(ctx.outputLatency||0));let wanted=Math.max(0,output-__sync.origin-delay/1000)%period,at=(editor?0:index*2)+frac*2,error=at-wanted;error-=Math.round(error/period)*period;samples.push(error*1000);}return samples;},{editor,delay});
 assert(samples.length>50);const errors=samples.map(Math.abs).sort((a,b)=>a-b),p95=errors[Math.floor(errors.length*.95)];assert(p95<90,JSON.stringify({engine,editor,delay,p95}));results.push({editor,delay,p95AbsoluteMs:p95,medianSignedMs:samples.slice().sort((a,b)=>a-b)[Math.floor(samples.length/2)]});
 }
 await p.evaluate(()=>CruiseStudio.audio.stopAll());assert.deepEqual(errors,[]);
 }finally{await c.close();}
 }fs.writeFileSync('/private/tmp/score-sync-'+engine+'.json',JSON.stringify(results,null,2));
 }finally{await b.close();}
});
