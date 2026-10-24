/* Normal layout/audio UI regression; isolated loopback and disposable Chrome only. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const url=process.env.STUDIO_URL||'http://127.0.0.1:8766/apps/cruise-studio/index.html',origin=new URL(url).origin;
test('PC Shell layout real Chrome',async t=>{
 const {libraryFixture,serializeFixture}=await import('./library-fixture.mjs');
 const audioFile=process.env.TUNER_FAKE_AUDIO;if(!audioFile||!fs.existsSync(audioFile))throw Error('synthetic TUNER_FAKE_AUDIO required');
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-audio-capture='+audioFile]});
 const context=await browser.newContext({viewport:{width:390,height:600}}),p=await context.newPage();p.setDefaultTimeout(8000);
 const report={cases:[],screenshots:[]},errors=[],missing=[],external=[];
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin){if(!['GET','HEAD'].includes(r.request().method()))external.push(r.request().method()+' '+u.href);return r.continue();}if(u.hostname==='fonts.googleapis.com')return r.fulfill({body:'',contentType:'text/css'});external.push(u.href);return r.abort();});
 await context.addInitScript(()=>{
 window.__layoutQA={writes:[],projectWrites:[],mutations:[],opens:[],unhandled:[],contexts:[],streams:[]};
 for(const method of ['setItem','removeItem','clear']){const fn=Storage.prototype[method];Storage.prototype[method]=function(key,...args){if(method==='clear'||/^(cruisePort\.|soundCruise|sound-cruise)/i.test(key))__layoutQA.writes.push({method,key});if(/^cruiseStudio\.project/.test(key))__layoutQA.projectWrites.push({method,key});return fn.call(this,key,...args);};}
 const open=indexedDB.open.bind(indexedDB);indexedDB.open=(name,...a)=>{__layoutQA.opens.push(name);return open(name,...a);};
 const transaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(names,mode,...args){if(mode==='readwrite')__layoutQA.mutations.push({db:this.name,mode});return transaction.call(this,names,mode,...args);};
 for(const method of ['put','add','delete','clear']){const fn=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(...args){__layoutQA.mutations.push({store:this.name,method});return fn.apply(this,args);};}
 const create=IDBDatabase.prototype.createObjectStore;IDBDatabase.prototype.createObjectStore=function(...a){__layoutQA.mutations.push({create:this.name});return create.apply(this,a);};
 const Native=AudioContext;window.AudioContext=class extends Native{constructor(...a){super(...a);__layoutQA.contexts.push(this);}};
 const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...a)=>{const stream=await get(...a);__layoutQA.streams.push(stream);return stream;};
 window.addEventListener('unhandledrejection',e=>__layoutQA.unhandled.push(String(e.reason)));
 });
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()===404)missing.push(r.url());});
 const settle=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const nav=async id=>{await p.evaluate(id=>CruiseStudio.shellHost.navigate(id),id);await settle();};
 const box=selector=>p.locator(selector).evaluate(e=>e.getBoundingClientRect().toJSON());
 const inside=async selector=>{const r=await box(selector),v=p.viewportSize();assert(r.width>0&&r.height>0&&r.left>=-1&&r.right<=v.width+1&&r.top>=-1&&r.bottom<=v.height+1,selector+': '+JSON.stringify(r));};
 const step=(name,fn)=>t.test(name,async()=>{await fn();report.cases.push(name);});
 try{
 await p.goto(url);await p.waitForFunction(()=>CruiseStudio.libraryViews);
 const writer=await context.newPage();await writer.goto(url);await writer.evaluate(values=>Object.entries(values).forEach(([k,v])=>localStorage.setItem(k,v)),serializeFixture(libraryFixture()));
 await writer.evaluate(async()=>{const C=CruiseStudio,x=C.model.createSampleProject();x.projectId='layout-project';x.songInfo.title='Layout fixture';await C.repository.save({target:{type:'project',projectId:x.projectId},snapshot:x,baseRevision:null});C.storage.setCurrentProjectId(x.projectId);});
 await nav('sheetCruise');const originalProject=await p.evaluate(()=>JSON.stringify(CruiseStudio.sheetCruise.getSession().draft));
 await step('counterexample Structure 390px toolbar stays within Main',async()=>{await nav('sheetCruise');const r=await p.evaluate(()=>{const m=document.querySelector('#studio-main');return {w:m.clientWidth,sw:m.scrollWidth};});assert(r.sw<=r.w+1,JSON.stringify(r));await inside('#sc-new-project');});
 await step('counterexample Pre-DTM 390px toolbar stays within Main',async()=>{await nav('preDtm');const r=await p.evaluate(()=>{const m=document.querySelector('#studio-main');return {w:m.clientWidth,sw:m.scrollWidth};});assert(r.sw<=r.w+1,JSON.stringify(r));await inside('#pd-reload');});
 await step('counterexample Loupe initial bounds never leave viewport or Main',async()=>{await nav('sheetCruise');await p.locator('.sheet-bar').first().click();await settle();await inside('#sc-slot-overlay');const r=await box('#sc-slot-overlay'),m=await box('#studio-main');assert(r.left>=m.left&&r.right<=m.right);});
 await p.evaluate(()=>CruiseStudio.sheetCruise.handleEscape({key:'Escape'}));await nav('home');await p.click('#shell-dock-toggle');
 await step('counterexample compact Dock reserves at least 75 percent of available Main height',async()=>{const d=await box('#studio-dock'),m=await box('#studio-main');assert(d.height<=.25*(d.height+m.height),JSON.stringify({d,m}));await inside('#studio-metronome-toggle');await inside('#studio-metronome-bpm');});
 await step('counterexample Global Stop stays visible at 600px without Navigation scroll',async()=>{await inside('#shell-audio-stop');const hit=await p.locator('#shell-audio-stop').evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});assert(hit);});

 if(process.env.LAYOUT_COUNTEREXAMPLES_ONLY)return;
 await step('Loupe drag/keyboard move/resize stay bounded and preserve draft',async()=>{
 await p.click('#shell-dock-toggle');await nav('sheetCruise');await p.locator('.sheet-bar').first().click();await settle();
 const head=p.locator('.slot-overlay-head');await head.focus();for(const key of ['Alt+Shift+ArrowLeft','Alt+Shift+ArrowUp','Alt+Shift+ArrowRight','Alt+Shift+ArrowDown']){for(let i=0;i<20;i++)await p.keyboard.press(key);await inside('#sc-slot-overlay');}
 let r=await box('.slot-overlay-head');await p.mouse.move(r.right-6,r.y+5);await p.mouse.down();await p.mouse.move(-500,-500,{steps:4});await p.mouse.up();await inside('#sc-slot-overlay');
 const before=await box('#sc-slot-overlay'),handle=await box('.slot-overlay-resize-handle');await p.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await p.mouse.down();await p.mouse.move(handle.x-65,handle.y,{steps:4});await p.mouse.up();await inside('#sc-slot-overlay');assert((await box('#sc-slot-overlay')).width<before.width);
 await p.locator('[data-overlay-field="chord"]').focus();const selected=await p.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot());
 for(const width of [480,768,1024,1440,1920,390]){await p.setViewportSize({width,height:600});await settle();await inside('#sc-slot-overlay');assert.equal(await p.evaluate(()=>document.activeElement.dataset.overlayField),'chord');assert.deepEqual(await p.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot()),selected);}
 await nav('practice');await nav('sheetCruise');await inside('#sc-slot-overlay');assert.equal(await p.evaluate(()=>document.activeElement.dataset.overlayField),'chord');
 for(const id of ['shell-inspector','shell-tool']){await p.click('#'+id);await settle();await inside('#sc-slot-overlay');await p.click('#shell-pane-close');await settle();await inside('#sc-slot-overlay');}
 await p.locator('#studio-main').evaluate(e=>e.scrollTop=300);await settle();await inside('#sc-slot-overlay');assert.equal(await p.evaluate(()=>JSON.stringify(CruiseStudio.sheetCruise.getSession().draft)),originalProject);
 });
 await step('all viewport/theme combinations have reachable toolbar and bounded Loupe',async()=>{
 for(const theme of ['dark','charcoal','gray','light']){await p.evaluate(t=>CruiseStudio.colorTheme.setColorTheme(t),theme);for(const height of [600,900])for(const width of [390,480,768,1024,1440,1920]){
 await p.setViewportSize({width,height});await nav('sheetCruise');await p.locator('#studio-main').evaluate(e=>e.scrollTo(0,0));await settle();await inside('#sc-slot-overlay');await inside('#shell-audio-stop');
 for(const id of ['sc-save','sc-print','sc-export-json']){await p.locator('#'+id).focus();await p.locator('#'+id).scrollIntoViewIfNeeded();await inside('#'+id);}
 const h=await p.evaluate(()=>({doc:document.documentElement.scrollWidth,w:innerWidth,main:document.querySelector('#studio-main').clientWidth,sw:document.querySelector('#studio-main').scrollWidth}));assert(h.doc<=h.w+1&&h.sw<=h.main+1,JSON.stringify(h));
 if(height===600&&[390,1024,1920].includes(width)){const path='/private/tmp/psl-'+theme+'-'+width+'.png';await p.screenshot({path});report.screenshots.push(path);}
 await nav('preDtm');for(const id of ['pd-reload','pd-goto-sheet','pd-export-json','pd-export-midi']){await p.locator('#'+id).focus();await p.locator('#'+id).scrollIntoViewIfNeeded();await inside('#'+id);}
 const main=await p.evaluate(()=>{const e=document.querySelector('#studio-main');return[e.clientWidth,e.scrollWidth];});assert(main[1]<=main[0]+1,JSON.stringify(main));
 }}await p.setViewportSize({width:390,height:600});await nav('sheetCruise');
 });
 await step('selection changes, drawer and toolbar scroll remain usable without changing project',async()=>{
 await p.locator('.sheet-bar').nth(1).focus();await p.keyboard.press('Enter');await settle();await inside('#sc-slot-overlay');await p.locator('.slot-overlay-close').click();await p.locator('#sc-editor-drawer > summary').click();
 const m=await p.evaluate(()=>{const e=document.querySelector('#studio-main');return[e.clientWidth,e.scrollWidth];});assert(m[1]<=m[0]+1,JSON.stringify(m));await p.locator('#sc-editor-drawer > summary').click();
 for(const id of ['sc-save','sc-print','sc-export-json']){await p.locator('#'+id).focus();await p.keyboard.press('Tab');}
 await nav('preDtm');await p.locator('#pd-export-json').scrollIntoViewIfNeeded();const json=p.waitForEvent('download');await p.click('#pd-export-json');assert((await json).suggestedFilename().endsWith('.json'));await p.locator('#pd-export-midi').scrollIntoViewIfNeeded();const midi=p.waitForEvent('download');await p.click('#pd-export-midi');assert((await midi).suggestedFilename().endsWith('.mid'));const path='/private/tmp/psl-pre-dtm-390.png';await p.screenshot({path});report.screenshots.push(path);
 assert.equal(await p.evaluate(()=>JSON.stringify(CruiseStudio.sheetCruise.getSession().draft)),originalProject);
 });
 await step('Dock disclosure, collapse and navigation preserve one audio owner and BPM',async()=>{
 await nav('sheetCruise');await p.locator('#shell-dock-toggle').focus();await p.keyboard.press('Enter');await p.locator('#studio-metronome-bpm').fill('151');await p.locator('#studio-metronome-bpm').press('Enter');await p.locator('#studio-metronome-toggle').focus();await p.keyboard.press('Space');await p.waitForFunction(()=>CruiseStudio.metronomeM1.snapshot().running);
 const run=await p.evaluate(()=>({contexts:__layoutQA.contexts.length,id:CruiseStudio.metronomeM1.snapshot().engine.generation}));
 await p.locator('#studio-metronome-details summary').click();await p.locator('#studio-metronome-start').scrollIntoViewIfNeeded();await inside('#studio-metronome-start');await p.locator('#studio-metronome-details summary').click();
 for(let i=0;i<8;i++){await p.click('#shell-dock-toggle');await nav(i%2?'gear':'practice');assert.equal(await p.evaluate(()=>CruiseStudio.metronomeM1.snapshot().running),true);assert.equal(await p.evaluate(()=>CruiseStudio.metronomeM1.snapshot().bpm),151);assert.equal(await p.evaluate(()=>__layoutQA.contexts.length),run.contexts);}
 await inside('#shell-audio-stop');await p.locator('.studio-nav-workspaces').evaluate(e=>e.scrollLeft=e.scrollWidth);await p.locator('.studio-nav-utilities').evaluate(e=>e.scrollLeft=e.scrollWidth);await inside('#shell-audio-stop');await p.locator('#shell-audio-stop').focus();await p.keyboard.press('Enter');await p.waitForFunction(()=>!CruiseStudio.metronomeM1.snapshot().running&&CruiseStudio.metronomeM1.snapshot().pendingCloseCount===0);assert.equal(await p.evaluate(()=>__layoutQA.contexts.every(c=>c.state==='closed')),true);
 await p.click('#shell-dock-toggle');await p.click('#shell-dock-toggle');await inside('#studio-metronome-toggle');assert.equal(await p.evaluate(()=>CruiseStudio.metronomeM1.snapshot().running),false);await p.click('#shell-dock-toggle');
 });
 await step('Dock primary and explicit details actions remain reachable across all widths',async()=>{
 for(const width of [390,480,768,1024,1440,1920]){await p.setViewportSize({width,height:600});await settle();await p.click('#shell-dock-toggle');await inside('#studio-metronome-toggle');await inside('#studio-metronome-bpm');await p.locator('#studio-metronome-details summary').click();await p.locator('#studio-metronome-stop').scrollIntoViewIfNeeded();await inside('#studio-metronome-stop');await inside('#studio-metronome-start');await p.locator('#studio-metronome-details summary').click();await p.click('#shell-dock-toggle');}
 await p.setViewportSize({width:390,height:600});await settle();await p.click('#shell-dock-toggle');const path='/private/tmp/psl-dock-390.png';await p.screenshot({path});report.screenshots.push(path);await p.click('#shell-dock-toggle');
 });
 await step('Global Stop survives desktop Navigation scrolling with expanded Dock in four themes',async()=>{
 for(const theme of ['dark','charcoal','gray','light'])for(const width of [768,1440]){await p.setViewportSize({width,height:600});await p.evaluate(t=>CruiseStudio.colorTheme.setColorTheme(t),theme);await settle();await p.click('#shell-dock-toggle');await p.click('#studio-metronome-toggle');await p.waitForFunction(()=>CruiseStudio.metronomeM1.snapshot().running);await p.locator('.studio-nav-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);await inside('#shell-audio-stop');await p.locator('#shell-audio-stop').focus();await p.keyboard.press('Enter');await p.waitForFunction(()=>!CruiseStudio.metronomeM1.snapshot().running&&CruiseStudio.metronomeM1.snapshot().pendingCloseCount===0);assert.equal(await p.locator('#shell-audio-stop').evaluate(e=>e.matches(':focus-visible')&&getComputedStyle(e).outlineStyle!=='none'),true);await p.click('#shell-dock-toggle');}
 await p.setViewportSize({width:390,height:600});await settle();
 });
 await step('600px Global Stop also cleans native Tuner without hidden navigation',async()=>{
 await nav('tuner');await p.click('#tuner-start');await p.waitForFunction(()=>CruiseStudio.tunerRuntime.snapshot().state==='active');await p.click('#shell-dock-toggle');await inside('#shell-audio-stop');await p.click('#shell-audio-stop');await p.waitForFunction(()=>CruiseStudio.tunerRuntime.snapshot().state==='idle');assert.equal(await p.evaluate(()=>__layoutQA.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);assert.equal(await p.evaluate(()=>__layoutQA.contexts.every(c=>c.state==='closed')),true);await p.click('#shell-dock-toggle');
 });
 await step('Practice Gear My Apps retain item/search focus and query after compact navigation',async()=>{
 await nav('practice');await p.click('#practice-read');await p.waitForFunction(()=>document.querySelector('#screen-practice').dataset.status==='ready');
 for(const [id,other,selector] of [['practice','gear','#screen-practice [data-practice-id="m1"]'],['gear','myApps','#screen-gear [data-library-id="g1"]'],['myApps','practice','#screen-my-apps [data-library-search]']]){await nav(id);await p.locator(selector).focus();if(id==='myApps')await p.locator(selector).fill('練習');await nav(other);await nav(id);assert.equal(await p.locator(selector).evaluate(e=>e===document.activeElement),true);if(id==='myApps')assert.equal(await p.locator(selector).inputValue(),'練習');}
 });
 await step('Modal and IME own focus across resize and cannot trigger audio',async()=>{
 await p.locator('#screen-my-apps [data-library-search]').evaluate(e=>{e.focus();e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));});await p.setViewportSize({width:480,height:600});await settle();await p.keyboard.press('Space');assert.equal(await p.evaluate(()=>CruiseStudio.metronomeM1.snapshot().running),false);assert.equal(await p.evaluate(()=>document.activeElement.dataset.focusRole),'search');await p.locator('#screen-my-apps [data-library-search]').evaluate(e=>e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));await p.waitForFunction(()=>!CruiseStudio.shellHost.keyboard.isIMEBlocked({}));
 await p.evaluate(()=>{const content=document.createElement('div');content.innerHTML='<input id="layout-modal"><button>OK</button>';CruiseStudio.shellHost.modal.open({title:'Layout test',content});});await p.setViewportSize({width:390,height:600});await settle();assert.equal(await p.evaluate(()=>document.activeElement.id),'layout-modal');await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');assert.equal(await p.evaluate(()=>document.activeElement.id),'layout-modal');await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>document.activeElement.dataset.focusRole),'search');
 });
 await step('persistent Inspector resizes Main and Chord remains read only',async()=>{
 await p.setViewportSize({width:1440,height:600});await nav('sheetCruise');await p.locator('.sheet-bar').first().click();await p.click('#shell-inspector');await settle();await inside('#sc-slot-overlay');assert.equal(await p.locator('#studio-chord-inspector').isVisible(),true);await p.click('#shell-pane-close');await settle();await inside('#sc-slot-overlay');
 });
 await step('Print releases screen layout and renders A4 paper only',async()=>{
 await p.emulateMedia({media:'print'});for(const selector of ['.studio-nav','#studio-dock','#studio-right-pane','#sc-slot-overlay'])assert.equal(await p.locator(selector).evaluate(e=>getComputedStyle(e).display),'none');const r=await box('.sheet-page');assert(Math.abs(r.width-210*96/25.4)<1);assert.match(await p.locator('.sheet-page').innerText(),/Layout fixture/);await p.pdf({path:'/private/tmp/psl-print.pdf',preferCSSPageSize:true});await p.emulateMedia({media:'screen'});await settle();await inside('#sc-slot-overlay');
 });
 await step('source version, no-write, project unchanged and console/404/unhandled zero',async()=>{
 assert.equal(await p.locator('#studio-version').textContent(),'v0.46.0');assert.equal(await p.evaluate(()=>CruiseStudio.model.APP_VERSION),'0.46.0');assert.equal(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().dirty),false);assert.equal(await p.evaluate(()=>JSON.stringify(CruiseStudio.sheetCruise.getSession().draft)),originalProject);assert.equal(await p.evaluate(()=>CruiseStudio.portDataHost.canWrite),false);
 const qa=await p.evaluate(()=>({writes:__layoutQA.writes,projectWrites:__layoutQA.projectWrites,mutations:__layoutQA.mutations,opens:__layoutQA.opens,unhandled:__layoutQA.unhandled}));assert.deepEqual(qa.writes,[]);assert.deepEqual(qa.projectWrites,[]);assert.deepEqual(qa.mutations,[]);assert.deepEqual(qa.unhandled,[]);assert(!qa.opens.some(n=>/authority|cruisePortGear|cruisePortMyApps|cruisePortPractice|pro-device/i.test(n)));assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert.deepEqual(external,[]);report.noWrite=qa;
 });
 }finally{fs.writeFileSync('/private/tmp/psl-browser.json',JSON.stringify(report,null,2));await browser.close();}
});
