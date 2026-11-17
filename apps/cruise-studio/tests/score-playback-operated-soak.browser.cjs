// Real wall-clock Web Audio soak; use SCORE_SOAK_SECONDS=1800 for 30 minutes.
// Audio renders normally into a final silent gain; this is not a listening test.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const seconds=Number(process.env.SCORE_SOAK_SECONDS||60),actionPeriod=Number(process.env.SCORE_ACTION_PERIOD||60),origin='http://127.0.0.1:18874';
test('editor and viewer operated playback soak', {timeout:(seconds+120)*1000},async()=>{
 const {viewerFixture}=await import('./helpers/viewer-fixture.mjs'),f=viewerFixture();f.score.songInfo.bpm=120;
 const file=await f.contract.codec.encode(f.score,f.metadata),browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const runs=[],faults=[],actions=[];
 try{for(const editor of [true,false]){
  const c=await browser.newContext({viewport:{width:1280,height:900}});await c.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){faults.push(r.request().url());return r.abort();}return r.continue();});
  await c.addInitScript(()=>{
   window.__audioProbe={contexts:[],created:0,live:0,peak:0,clicks:[],samples:[],misses:0};const Base=window.AudioContext||window.webkitAudioContext;
   window.AudioContext=class extends Base{
    constructor(...args){super(...args);__audioProbe.contexts.push(this);__audioProbe.clicks=[];this.__silent=super.createGain();this.__silent.gain.value=0;this.__silent.connect(this.destination);}
    createGain(){const gain=super.createGain(),connect=gain.connect.bind(gain);gain.connect=(target,...rest)=>connect(target===this.destination?this.__silent:target,...rest);return gain;}
    createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n),disconnect=n.disconnect.bind(n);let started=false,finished=false;const release=()=>{if(started&&!finished){finished=true;__audioProbe.live--;}};n.disconnect=(...a)=>{release();return disconnect(...a);};n.start=(at,...rest)=>{started=true;const p=__audioProbe;p.created++;p.live++;p.peak=Math.max(p.peak,p.live);n.addEventListener('ended',release,{once:true});if(n.buffer?.duration===.06){p.clicks.push(at);if(p.clicks.length>100)p.clicks.shift();}return start(at,...rest);};return n;}
   };
  });
  const p=await c.newPage();p.on('pageerror',e=>faults.push(e.message));p.setDefaultTimeout(15000);await p.goto(origin+(editor?'':'/apps/score-viewer/local/'));await p.waitForFunction(editor?()=>document.documentElement.dataset.studioEntry==='ready':()=>!!window.CruiseViewer);
  if(editor){await p.click('#open-sheet-cruise');await p.locator('#sc-import-json').setInputFiles({name:'soak.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f.score))});await p.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,f.score.projectId);await p.click('#sc-playback-settings');await p.locator('#sc-count-in').uncheck();await p.locator('#sc-metronome').check();await p.click('[data-playback-done]');await p.locator('#sc-sheet-scale-box .sheet-bar').first().click({position:{x:3,y:3}});await p.click('#sc-repeat');await p.click('#sc-song-preview');}
  else{await p.evaluate(t=>CruiseViewer.view.openBytes(t),file.text);await p.locator('[data-viewer-action=playback-settings]').click();await p.locator('[data-viewer-playback=countIn]').uncheck();await p.getByRole('button',{name:'完了',exact:true}).click();await p.click('[data-viewer-action=repeat]');await p.click('[data-viewer-action=play]');}
  try{await p.locator(editor?'#sc-sheet-scale-box>[data-score-playhead]':'[data-viewer-playhead]').waitFor();}catch(e){console.log(await p.evaluate(()=>({status:document.querySelector('#sc-save-status')?.textContent,body:document.body.textContent.slice(-700),audio:CruiseStudio.audio.snapshot(),created:__audioProbe.created,errors:__audioProbe.contexts.map(c=>c.state)})));throw e;}
  await p.evaluate(editor=>{window.__soakEditor=editor;window.__soakTransition=false;window.__soakCollect=()=>{const p=__audioProbe,c=p.contexts.at(-1),cursor=document.querySelector(__soakEditor?'#sc-sheet-scale-box>[data-score-playhead]':'[data-viewer-playhead]'),bar=document.querySelector(__soakEditor?'.sc-playing-bar':'.sv-playing');if(__soakTransition)return;if(!c||!cursor||!bar){p.misses++;return;}const r=bar.getBoundingClientRect(),x=cursor.getBoundingClientRect().left,frac=(x-r.left)/r.width,stamp=c.getOutputTimestamp?.(),time=stamp?.performanceTime>0?stamp.contextTime+(performance.now()-stamp.performanceTime)/1000:c.currentTime-(c.baseLatency||0)-(c.outputLatency||0),beat=p.clicks.filter(t=>t<=time).at(-1);const bpm=__soakEditor?Number(document.querySelector('#sc-practice-tempo').value):CruiseViewer.view.playback().settings.bpm,beatSeconds=60/bpm,phase=beat===undefined?null:((time-beat)%beatSeconds),visual=(frac*4*beatSeconds)%beatSeconds;let error=phase===null?null:visual-phase;if(error!==null)error-=Math.round(error/beatSeconds)*beatSeconds;p.samples.push({at:performance.now(),current:c.currentTime,errorMs:error===null?null:error*1000,live:p.live,created:p.created,cursors:document.querySelectorAll(__soakEditor?'#sc-sheet-scale-box [data-score-playhead]':'[data-viewer-playhead]').length,heap:performance.memory?.usedJSHeapSize||null});if(p.samples.length>4000)p.samples.shift();};setInterval(__soakCollect,1000);},editor);
  runs.push({p,c,editor,source:await p.evaluate(editor=>editor?JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot()):CruiseViewer.view.read().byteHash,editor)});
 }
 const started=Date.now();let lastAction=0;
 for(let step=0;Date.now()-started<seconds*1000;step++){
  await new Promise(r=>setTimeout(r,10000));const elapsed=(Date.now()-started)/1000,round=Math.floor(elapsed/actionPeriod);
  if(round>lastAction){lastAction=round;
   for(const {p,editor}of runs){await p.evaluate(()=>__soakTransition=true);const button=editor?'#sc-song-preview':'[data-viewer-action=play]';
    if(round%3===0){const tempo=p.locator(editor?'#sc-practice-tempo':'[data-viewer-tempo]');await tempo.fill(String([100,160,120][Math.floor(round/3)%3]));await tempo.press('Tab');await p.locator(editor?'#sc-sheet-scale-box>[data-score-playhead]':'[data-viewer-playhead]').waitFor();}
    await p.click(button);await p.locator(editor?'#sc-sheet-scale-box>[data-score-playhead]':'[data-viewer-playhead]').waitFor({state:'hidden'});
    await p.waitForTimeout(round%2===0?1200:200);
    if(round%5===0){const prefix=editor?'#sc-sheet-scale-box':'.sv-paper';await p.locator(prefix+' .sheet-page').click({position:{x:15,y:130}});await p.locator(prefix+' .sheet-bar[data-bar-number="1"]').click({position:{x:3,y:3}});if(round%10===5)await p.locator(prefix+' .sheet-bar[data-bar-number="2"]').click({position:{x:3,y:3},modifiers:['Shift']});const repeat=p.locator(editor?'#sc-repeat':'[data-viewer-action=repeat]');if(await repeat.getAttribute('aria-pressed')!=='true')await repeat.click();}
    await p.click(button);await p.locator(editor?'#sc-sheet-scale-box>[data-score-playhead]':'[data-viewer-playhead]').waitFor();await p.waitForTimeout(800);await p.evaluate(()=>__soakTransition=false);actions.push({round,editor,elapsed:(Date.now()-started)/1000});
   }
  }
  if(step%6===5){const progress=[];for(const {p,editor}of runs)progress.push({editor,...await p.evaluate(()=>({samples:__audioProbe.samples.length,created:__audioProbe.created,live:__audioProbe.live,misses:__audioProbe.misses}))});console.log(JSON.stringify({elapsed:Math.round((Date.now()-started)/1000),actions:actions.length,progress}));}
 }
 const results=[];for(const {p,editor,source}of runs){const r=await p.evaluate(()=>({samples:__audioProbe.samples,created:__audioProbe.created,peak:__audioProbe.peak,misses:__audioProbe.misses,contexts:__audioProbe.contexts.map(c=>c.state)}));assert(r.created>100);assert.equal(r.misses,0);assert.equal(await p.evaluate(editor=>editor?JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot()):CruiseViewer.view.read().byteHash,editor),source);assert(r.samples.length>=seconds*.65);assert(r.samples.every(s=>s.cursors===1));assert(r.peak<256);results.push({editor,...r});await p.click(editor?'#sc-song-preview':'[data-viewer-action=play]');if(!editor)await p.evaluate(()=>CruiseViewer.view.deactivate());await p.waitForFunction(()=>__audioProbe.contexts.every(c=>c.state==='closed'));}
 assert.deepEqual(faults,[]);fs.writeFileSync(process.env.SCORE_SOAK_OUT||'/private/tmp/score-playback-operated-soak.json',JSON.stringify({seconds,actions,elapsed:(Date.now()-started)/1000,results},null,2));
 }finally{await browser.close();}
});
