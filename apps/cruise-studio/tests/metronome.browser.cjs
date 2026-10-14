/* Isolated Chrome, real Web Audio timeline. Test-only instrumentation; no user profile. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
test('Audio Coordinator + Metronome M1 real Chrome',async t=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try {
 const ctx=await browser.newContext({viewport:{width:1440,height:900}});
 await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await ctx.addInitScript(()=>{
  window.__audioQA={contexts:[],events:[],timers:new Set(),bindings:new Map(),storage:[],unhandled:[]};
  window.addEventListener('unhandledrejection',e=>__audioQA.unhandled.push(String(e.reason)));
  const Native=window.AudioContext;
  window.AudioContext=class extends Native {
   constructor(...args){super(...args);this.qaId=__audioQA.contexts.length;__audioQA.contexts.push(this);}
   createOscillator(){const node=super.createOscillator(),context=this;const start=node.start.bind(node),stop=node.stop.bind(node),setFrequency=node.frequency.setValueAtTime.bind(node.frequency);let record,frequency=440;node.frequency.setValueAtTime=(value,when)=>{frequency=value;return setFrequency(value,when);};
    node.start=when=>{record={contextId:context.qaId,when,at:context.currentTime,frequency,cancelled:false,ended:false};__audioQA.events.push(record);start(when);};
    node.stop=when=>{if(record&&when===undefined)record.cancelled=true;stop(when);};
    node.addEventListener('ended',()=>{if(record)record.ended=true;},{once:true});return node;
   }
  };
  const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
  function track(target,type){return (target instanceof Native&&type==='statechange')||target===window&&['pagehide','unload'].includes(type)||target===document&&type==='visibilitychange'||target===navigator.mediaDevices&&type==='devicechange'||target instanceof Element&&target.id.startsWith('studio-metronome')&&['click','change','keydown'].includes(type)||target instanceof Element&&target.id==='shell-metronome-stop'&&type==='click';}
  EventTarget.prototype.addEventListener=function(type,fn,...args){if(track(this,type)){if(!__audioQA.bindings.has(this))__audioQA.bindings.set(this,new Map());const types=__audioQA.bindings.get(this);if(!types.has(type))types.set(type,new Set());types.get(type).add(fn);}return add.call(this,type,fn,...args);};
  EventTarget.prototype.removeEventListener=function(type,fn,...args){__audioQA.bindings.get(this)?.get(type)?.delete(fn);return remove.call(this,type,fn,...args);};
  const set=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window);
  window.setTimeout=(fn,...args)=>{const tracked=String(fn).includes('scheduler(getSettings)');let id;id=set(()=>{__audioQA.timers.delete(id);fn();},...args);if(tracked)__audioQA.timers.add(id);return id;};
  window.clearTimeout=id=>{__audioQA.timers.delete(id);clear(id);};
  for(const method of ['getItem','setItem','removeItem']){const orig=Storage.prototype[method];Storage.prototype[method]=function(key,...args){__audioQA.storage.push({method,key});return orig.call(this,key,...args);};}
 });
 const p=await ctx.newPage(),errors=[],missing=[];p.setDefaultTimeout(5000);
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
 await p.goto(process.env.STUDIO_URL||'http://127.0.0.1:8765/index.html');
 const runtime=()=>p.evaluate(()=>CruiseStudio.metronomeM1.snapshot());
 const running=async()=>{await p.waitForFunction(()=>CruiseStudio.metronomeM1.snapshot().running);};
 const start=async()=>{await p.locator('#studio-metronome-details').evaluate(e=>e.open=true);await p.click('#studio-metronome-start');await running();};
 const stop=()=>p.evaluate(()=>CruiseStudio.metronomeM1.stop());
 const report={};
 await t.test('default memory-only BPM and Dock Auxiliary Tool ownership',async()=>{assert.equal((await runtime()).bpm,120);assert.equal(await p.locator('[data-dock-slot=auxiliary] #studio-metronome-bpm').count(),1);assert.equal(await p.locator('[data-dock-slot=transport] input').count(),0);await p.click('#shell-dock-toggle');assert(await p.locator('#studio-metronome').isVisible());});
 await t.test('real context Start schedules expected count, order, interval and Standard sound',async()=>{
  await start();await p.waitForFunction(()=>__audioQA.contexts.at(-1).currentTime>=1.65);
  const measured=await p.evaluate(()=>{const context=__audioQA.contexts.at(-1),events=__audioQA.events.filter(e=>e.contextId===context.qaId);return {state:context.state,currentTime:context.currentTime,events};});
  const limiter=(await runtime()).engine.outputLimiter;for(const [key,value]of Object.entries({threshold:-3,knee:4,ratio:10,attack:.002,release:.06}))assert(Math.abs(limiter[key]-value)<1e-6);assert.equal(measured.state,'running');assert.equal(measured.events.length,4);assert.equal(new Set(measured.events.map(e=>e.when)).size,4);
  for(let i=1;i<measured.events.length;i++)assert(Math.abs(measured.events[i].when-measured.events[i-1].when-.5)<1e-8);
  assert.deepEqual(measured.events.map(e=>e.frequency),[1500,1200,1200,1200]);assert(measured.events.every(e=>e.when>=e.at-.001));report.timing120=measured;
 });
 await t.test('running BPM change keeps Port transition then exact 240 BPM intervals',async()=>{
  await p.locator('#studio-metronome-bpm').fill('240');await p.locator('#studio-metronome-bpm').press('Tab');await p.waitForFunction(()=>__audioQA.contexts.at(-1).currentTime>=2.8);
  const times=await p.evaluate(()=>__audioQA.events.filter(e=>e.contextId===__audioQA.contexts.at(-1).qaId&&!e.cancelled).map(e=>e.when));
  const tail=times.slice(-4);assert.equal(tail.length,4);for(let i=1;i<tail.length;i++)assert(Math.abs(tail[i]-tail[i-1]-.25)<1e-8);assert.equal(new Set(times).size,times.length);report.timing240=tail;
 });
 for(const workspace of ['sheetCruise','preDtm','series','home'])await t.test(`${workspace} workspace while running keeps dedicated audio`,async()=>{await p.click(`[data-workspace=${workspace}]`);assert.equal((await runtime()).running,true);assert.equal(await p.evaluate(()=>CruiseStudio.shellHost.getCommandContext().transport),null);});
 await t.test('Right pane open/close does not stop',async()=>{await p.click('#shell-inspector');await p.click('#shell-pane-close');assert.equal((await runtime()).running,true);});
 await t.test('Dock collapse preserves running and reachable Stop',async()=>{await p.click('#shell-dock-toggle');assert.equal((await runtime()).running,true);assert(await p.locator('#shell-metronome-stop').isVisible());await p.click('#shell-metronome-stop');assert.equal((await runtime()).running,false);await p.click('#shell-dock-toggle');});
 await t.test('Stop closes context and prevents later scheduled click',async()=>{const before=await p.evaluate(()=>__audioQA.events.length);await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>__audioQA.events.length),before);assert.equal(await p.evaluate(()=>__audioQA.contexts.filter(c=>c.state!=='closed').length),0);assert.equal(await p.evaluate(()=>__audioQA.timers.size),0);});
 await t.test('restart and duplicate Start create one fresh context and one scheduler',async()=>{await start();const n=await p.evaluate(()=>__audioQA.contexts.length);assert(await p.evaluate(()=>CruiseStudio.metronomeM1.start()));assert.equal(await p.evaluate(()=>__audioQA.contexts.length),n);assert.equal(await p.evaluate(()=>__audioQA.timers.size),1);});
 await t.test('4 themes retain audio, token contrast and compact Dock; screenshots',async()=>{
  function lum(rgb){const v=rgb.match(/[\d.]+/g).slice(0,3).map(x=>Number(x)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];}
  report.themes=[];const dir=process.env.QA_ARTIFACT_DIR;if(dir)fs.mkdirSync(dir,{recursive:true});
  for(const theme of ['dark','charcoal','gray','light']){await p.evaluate(id=>CruiseStudio.colorTheme.applyColorTheme(id),theme);assert.equal((await runtime()).running,true);
   const styles=await p.locator('#studio-metronome-bpm').evaluate(e=>({color:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor,outline:getComputedStyle(e).outlineColor,height:document.querySelector('#studio-dock').getBoundingClientRect().height}));const [a,b]=[lum(styles.color),lum(styles.bg)].sort((a,b)=>b-a);assert((a+.05)/(b+.05)>=4.5);assert(styles.height<=900*.32);report.themes.push({theme,contrast:(a+.05)/(b+.05),height:styles.height});
   if(dir)await p.screenshot({path:`${dir}/metronome-${theme}.png`});
  }
 });
 await t.test('compact widths retain reachable BPM/Start/Stop and focus restoration',async()=>{
  for(const [width,height] of [[1440,900],[1024,768],[800,700],[680,700]]){
   await p.setViewportSize({width,height});
   for(const id of ['studio-metronome-bpm','studio-metronome-start','studio-metronome-stop']){
    const box=await p.locator('#'+id).boundingBox();assert(box&&box.x>=0&&box.x+box.width<=width&&box.y+box.height<=height);
   }
  }
  await p.setViewportSize({width:1440,height:900});await p.click('#shell-dock-toggle');await p.click('#shell-metronome-stop');
  assert.equal(await p.evaluate(()=>document.activeElement.id),'shell-dock-toggle');
  await p.click('#shell-dock-toggle');await start();assert.equal(await p.evaluate(()=>document.activeElement.id),'studio-metronome-stop');
 });
 await t.test('Escape preserves audio and Dock; numeric arrows remain local',async()=>{await p.locator('#studio-metronome-bpm').focus();await p.keyboard.press('Escape');assert.equal((await runtime()).running,true);assert(await p.locator('#studio-dock').isVisible());await p.keyboard.press('ArrowDown');await p.keyboard.press('Tab');assert.equal((await runtime()).bpm,239);});
 await t.test('Metronome BPM never dirties or enters Structure project',async()=>{await p.evaluate(()=>{const CS=CruiseStudio;const sample=CS.model.createSampleProject();CS.storage.saveProject(sample);CS.storage.setCurrentProjectId(sample.projectId);window.__m1ProjectId=sample.projectId;CS.sheetCruise.load(sample.projectId);CS.shellHost.navigate('sheetCruise');});const before=await p.evaluate(()=>{const s=CruiseStudio.sessions.getActiveSession();return {dirty:s.dirty,draft:JSON.stringify(s.workingSnapshot())};});await p.locator('#studio-metronome-bpm').fill('137');await p.locator('#studio-metronome-bpm').press('Tab');const after=await p.evaluate(()=>{const s=CruiseStudio.sessions.getActiveSession();return {dirty:s.dirty,draft:JSON.stringify(s.workingSnapshot())};});assert.deepEqual(after,before);});
 await t.test('Cmd/Ctrl S from BPM input commits explicit Editing Session once',async()=>{for(const key of ['Control+s','Meta+s']){await p.evaluate(()=>CruiseStudio.sessions.getActiveSession().draft.songInfo.title+=' saved');await p.locator('#studio-metronome-bpm').focus();await p.keyboard.press(key);await p.waitForFunction(()=>!CruiseStudio.sessions.getActiveSession().dirty);assert.equal((await runtime()).bpm,137);}assert.equal((await runtime()).running,true);});
 await t.test('IME guard prevents BPM-input Save and musical commands',async()=>{const blocked=await p.evaluate(()=>{const s=CruiseStudio.sessions.getActiveSession();s.draft.songInfo.title+=' dirty';const el=document.querySelector('#studio-metronome-bpm');el.focus();el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));const e=new KeyboardEvent('keydown',{key:'s',ctrlKey:true,isComposing:true,bubbles:true,cancelable:true});el.dispatchEvent(e);el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));return {dirty:s.dirty,prevented:e.defaultPrevented};});assert.deepEqual(blocked,{dirty:true,prevented:false});await p.waitForTimeout(20);});
 await t.test('Pre-DTM still consumes working draft with independent project BPM',async()=>{
  await p.evaluate(()=>{const s=CruiseStudio.sessions.getActiveSession();s.draft.songInfo.title='M1 working source';s.draft.songInfo.bpm=123;CruiseStudio.shellHost.navigate('preDtm');});
  await p.click('#pd-reload');await p.selectOption('#pd-project-select',await p.evaluate(()=>__m1ProjectId));
  const result=await p.evaluate(()=>({title:document.querySelector('#pd-song-info').textContent,bpm:CruiseStudio.metronomeM1.snapshot().bpm,dirty:CruiseStudio.sessions.getActiveSession().dirty}));
  assert.match(result.title,/M1 working source/);assert.match(result.title,/123/);assert.equal(result.bpm,137);assert(result.dirty);
 });
 await t.test('modal shields BPM and Save; Escape closes only modal',async()=>{await p.evaluate(()=>{const content=document.createElement('div');content.innerHTML='<h2>音声確認</h2><button>閉じる</button>';CruiseStudio.shellHost.modal.open({title:'音声確認',content});});await p.keyboard.press('Control+s');await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>CruiseStudio.shellHost.modal.getActive()),null);assert.equal((await runtime()).running,true);});
 await t.test('print excludes Dock while running without changing audio',async()=>{await p.evaluate(()=>CruiseStudio.shellHost.navigate('sheetCruise'));await p.emulateMedia({media:'print'});assert.equal(await p.locator('#studio-dock').evaluate(e=>getComputedStyle(e).display),'none');assert.equal((await runtime()).running,true);await p.emulateMedia({media:'screen'});});
 await t.test('visibility hidden alone keeps running; context suspend explicitly interrupts',async()=>{await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal((await runtime()).running,true);await p.evaluate(()=>__audioQA.contexts.at(-1).suspend());await p.waitForFunction(()=>CruiseStudio.metronomeM1.snapshot().status==='interrupted'&&CruiseStudio.audio.snapshot()[0].contextCount===0);assert.equal(await p.evaluate(()=>__audioQA.contexts.at(-1).state),'closed');await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});assert.equal((await runtime()).running,false);});
 await t.test('global stop cleans real engine/context/lease',async()=>{await start();await p.evaluate(()=>CruiseStudio.audio.stopAll());assert.equal((await runtime()).running,false);assert.equal(await p.evaluate(()=>__audioQA.timers.size),0);assert.equal(await p.evaluate(()=>CruiseStudio.audio.snapshot()[0].resourceType),null);});
 await t.test('50 real Start Stop cycles leak no contexts, schedulers or listeners',async()=>{const before=await p.evaluate(()=>({n:__audioQA.contexts.length,listeners:[...__audioQA.bindings.values()].reduce((n,m)=>n+[...m.values()].reduce((n,s)=>n+s.size,0),0)}));for(let i=0;i<50;i++){await start();await stop();}const after=await p.evaluate(()=>({n:__audioQA.contexts.length,listeners:[...__audioQA.bindings.values()].reduce((n,m)=>n+[...m.values()].reduce((n,s)=>n+s.size,0),0),live:__audioQA.contexts.filter(c=>c.state!=='closed').length,timers:__audioQA.timers.size,owned:CruiseStudio.audio.snapshot()[0].contextCount}));assert.equal(after.n-before.n,50);assert.equal(after.listeners,before.listeners);assert.equal(after.live+after.timers+after.owned,0);report.cycles50=after;});
 await t.test('pagehide releases real resources; explicit Start remains available',async()=>{await start();await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));await p.waitForFunction(()=>CruiseStudio.audio.snapshot()[0].resourceType===null);assert.equal((await runtime()).running,false);await start();await stop();});
 await t.test('no M1 storage calls, Port storage or Pro/Account/Sync globals',async()=>{assert.deepEqual(await p.evaluate(()=>__audioQA.storage.filter(x=>/metronome|cruisePort/i.test(x.key))),[]);assert.equal(await p.evaluate(()=>typeof SoundCruisePortSync),'undefined');assert.equal(await p.evaluate(()=>typeof SoundCruiseMultiAppSync),'undefined');assert.equal(await p.locator('#studio-metronome').getByText(/Preset|Pro|Account|Sync|詳細/).count(),0);});
 await t.test('disposed runtime/view remove all own listeners and registrations',async()=>{await p.evaluate(async()=>{CruiseStudio.metronomeView.dispose();await CruiseStudio.metronomeM1.dispose();await CruiseStudio.tunerView.dispose();});assert.equal(await p.evaluate(()=>[...__audioQA.bindings.values()].reduce((n,m)=>n+[...m.values()].reduce((n,s)=>n+s.size,0),0)),0);assert.deepEqual(await p.evaluate(()=>CruiseStudio.audio.snapshot()),[]);});
 await t.test('reload resets BPM to 120 without auto Start',async()=>{await p.reload();assert.equal((await runtime()).bpm,120);assert.equal((await runtime()).running,false);assert.equal(await p.evaluate(()=>__audioQA.contexts.length),0);});
 await t.test('console, application HTTP and unhandled rejection clean',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert.deepEqual(await p.evaluate(()=>__audioQA.unhandled),[]);report.navigatorAudioSession=await p.evaluate(()=>({supported:'audioSession'in navigator}));});
 if(process.env.QA_ARTIFACT_DIR)fs.writeFileSync(process.env.QA_ARTIFACT_DIR+'/audio-report.json',JSON.stringify(report,null,2));
 }finally {await browser.close();}
});
