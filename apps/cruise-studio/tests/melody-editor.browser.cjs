/* M2/M3 uses disposable local projects and actual Inspector controls, never product credentials. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const url=process.env.STUDIO_URL,origin=new URL(url).origin;
test('Melody duration/rest Inspector M2/M3',async t=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),ctx=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),p=await ctx.newPage();
 const errors=[],http=[],external=[],geometry=[],ledger=[],phases=[];let auditStart=0;
 await ctx.exposeBinding('__m2Audit',(_source,e)=>{if(e.kind!=='barrier')ledger.push({...e,sequence:ledger.length});return ledger.length;});
 await ctx.addInitScript(()=>{const documentId=crypto.randomUUID();window.__m2Flush=()=>__m2Audit({kind:'barrier'});
  for(const method of ['setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(key,...args){const entry={kind:'storage',documentId,method,key:method==='clear'?'*':String(key),value:method==='setItem'?String(args[0]):null,previous:method==='clear'?null:this.getItem(key),time:Date.now(),stack:new Error().stack};try{const r=original.call(this,key,...args);entry.ok=true;return r;}finally{__m2Audit(entry).catch(()=>{});}};}
  for(const method of ['open','deleteDatabase']){const original=indexedDB[method].bind(indexedDB);indexedDB[method]=(...args)=>{__m2Audit({kind:'idb',documentId,method,key:String(args[0]),time:Date.now(),stack:new Error().stack}).catch(()=>{});return original(...args);};}
 });
 const flush=()=>p.evaluate(()=>__m2Flush());
 const persist=()=>{if(process.env.STAFF_QA_DIR)fs.writeFileSync(process.env.STAFF_QA_DIR+'/m2-storage-ledger.json',JSON.stringify({auditStart,phases,ledger},null,2));};
 async function phase(name,fn,verify=rows=>assert.deepEqual(rows,[],name+' must not write')){await flush();const record={name,start:ledger.length};phases.push(record);try{const value=await fn();await flush();record.end=ledger.length;verify(ledger.slice(record.start,record.end),record);record.pass=true;return value;}finally{await flush();record.end=ledger.length;persist();}}
 const audited=(rows,record)=>{for(const e of rows)assert(phases.some(child=>child!==record&&child.pass&&child.start<=e.sequence&&child.end>e.sequence),'Every write must belong to a validated child phase');};
 const run=(name,fn,verify)=>t.test(name,()=>phase(name,fn,verify));
 const abWrites=rows=>{assert.deepEqual(rows.map(e=>[e.kind,e.method,e.key,e.value]),[['storage','setItem','cruiseStudio.currentProjectId','M2-B'],['storage','setItem','cruiseStudio.currentProjectId','M2-A']]);};
 async function resize(width){await phase('viewport resize '+width,async()=>{await p.setViewportSize({width,height:1000});await p.waitForTimeout(80);await ready();},rows=>{assert(rows.length<=1);for(const e of rows){assert.equal(e.kind,'storage');assert.equal(e.method,'setItem');assert.equal(e.key,'cruiseStudio.appSettings');assert.match(e.stack,/reclampLoupeOnResize/);const value=JSON.parse(e.value),before=JSON.parse(e.previous||'{}');assert.deepEqual({...value,barLoupe:null},{...before,barLoupe:null});assert.deepEqual(Object.keys(value.barLoupe).sort(),['width','x','y']);for(const n of Object.values(value.barLoupe))assert(Number.isFinite(n));assert(value.barLoupe.width>0);geometry.push({resize:width,savedLoupe:value.barLoupe});}});}

 await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin&&r.request().method()==='GET')return r.continue();if(u.hostname==='fonts.googleapis.com')return r.fulfill({body:'',contentType:'text/css'});external.push(u.href);return r.abort();});
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)http.push(r.url());});
 const panel=p.locator('#sc-melody-inspector'),first=()=>p.locator('[data-melody-target][data-event-id]:not([data-event-id=""])').first();
 const ready=()=>p.waitForFunction(()=>document.querySelector('.melody-page')?.dataset.ready==='true'&&CruiseStudio.sheetCruise.getStaffMetrics().source?.snapshotVersion===CruiseStudio.documents.getSession().snapshotVersion);
 const state=async()=>{await flush();const data=await p.evaluate(()=>{const s=CruiseStudio.documents.getSession();return{draft:s.workingSnapshot(),base:s.baseSnapshot,revision:s.baseRevision,dirty:s.dirty,history:s.getHistory(),raw:localStorage.getItem('cruiseStudio.project.M2-A')};});return {...data,writes:ledger.slice(auditStart).map(e=>[e.method,e.key])};};
 async function reset(){await p.evaluate(()=>CruiseStudio.documents.getSession().replaceDraft(structuredClone(__m2Base)));await ready();}
 const click=async text=>{await panel.getByRole('button',{name:text,exact:true}).click();await ready();};
 try{
 await p.goto(url);await p.waitForFunction(()=>!!window.CruiseStudio?.melodyInspector);
 await p.evaluate(()=>{const C=CruiseStudio;for(const id of ['M2-A','M2-B']){const d=C.model.createLegacySampleProject();d.projectId=id;d.songInfo.title=id;d.songInfo.originalKey=d.songInfo.playKey='C';d.songInfo.capo=0;d.bars[0].melody=[{tick:240,durationTicks:180,step:0,alter:0,octave:0},{tick:960,durationTicks:480,step:1,alter:0,octave:0}];localStorage.setItem('cruiseStudio.project.'+id,' \n'+JSON.stringify(d)+'\n');}C.storage.setCurrentProjectId('M2-A');C.shellHost.navigate('sheetCruise');window.__m2Base=structuredClone(C.documents.getSession().workingSnapshot());});
 await flush();auditStart=ledger.length;
 await p.selectOption('#sc-score-style','melody');await ready();
 await run('note ID selection, accessible highlight and Inspector outside paper',async()=>{
  await first().click();assert(await panel.isVisible());assert.match(await panel.locator('#sc-melody-target').innerText(),/1小節目.*240 tick.*C4/);assert.equal(await first().getAttribute('aria-pressed'),'true');assert.equal(await first().getAttribute('role'),'button');
  assert(await panel.evaluate(e=>!e.closest('#sc-preview')));assert.match(await panel.innerText(),/由来未確認/);assert.deepEqual((await state()).writes,[]);
 });
 await run('normal centre/paint clicks map exact event IDs, hit regions never overlap',async()=>{
  const groups=p.locator('.melody-measure').first().locator('[data-melody-target]');
  for(let i=0;i<await groups.count();i++){const g=groups.nth(i),expected=await g.getAttribute('data-event-id'),gap=await g.getAttribute('data-gap');await g.click();const v=await p.evaluate(()=>{const v=CruiseStudio.melodyInspector.controller.view();return {id:v?.eventId,gap:v?.gap};});assert.equal(v.id,expected||null);if(gap)assert.equal(v.gap.onsetTick+':'+v.gap.durationTicks,gap);}
  await first().click();const target=first();await target.scrollIntoViewIfNeeded();
  const point=await target.evaluate(g=>{const h=g.querySelector('.vf-notehead path')||g.querySelector('path'),r=h.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,expected:g.dataset.eventId,received:document.elementFromPoint(x,y).closest('[data-melody-target]')?.dataset.eventId};});assert.equal(point.received,point.expected);await p.mouse.click(point.x,point.y);assert.equal(await p.evaluate(()=>CruiseStudio.melodyInspector.controller.view()?.eventId),point.expected);
  const boxes=await groups.evaluateAll(gs=>gs.map(g=>{const r=g.querySelector('.melody-hit').getBBox();return {left:r.x,right:r.x+r.width};}));for(let i=1;i<boxes.length;i++)assert(boxes[i-1].right<=boxes[i].left+0.01);
  assert(await p.locator('#sc-slot-overlay').evaluate(e=>e.classList.contains('hidden')),'note click never bubbles into Loupe');
 });
 await run('duration shortening preserves next onset, creates gap, one Undo/Redo',async()=>{
  const before=await state();await p.selectOption('#sc-melody-duration','120');await ready();let s=await state();assert.equal(s.draft.bars[0].melody[0].durationTicks,120);assert.deepEqual(s.draft.bars[0].melody[1],before.draft.bars[0].melody[1]);assert.equal(s.history.cursor,before.history.cursor+1);assert.deepEqual(s.base,before.base);assert.equal(s.revision,before.revision);
  await p.locator('#sc-undo').click();await ready();assert.deepEqual((await state()).draft,before.draft);await p.locator('#sc-redo').click();await ready();assert.equal((await state()).draft.bars[0].melody[0].durationTicks,120);
 });
 await run('120/240/480/720 converge with stable selection, pitch and timing provenance',async()=>{
  await reset();await first().click();const before=await state(),event=before.draft.bars[0].melody[0];
  for(const duration of [120,240,480,720]){await p.selectOption('#sc-melody-duration',String(duration));await ready();const now=await state(),e=now.draft.bars[0].melody[0];assert.equal(e.id,event.id);assert.equal(e.onsetTick,event.onsetTick);assert.equal(e.durationTicks,duration);assert.deepEqual(e.pitch,event.pitch);assert.deepEqual(e.provenance.timing.duration,{origin:'user-set',confirmed:true});assert.equal(await p.evaluate(()=>CruiseStudio.melodyInspector.controller.view()?.eventId),event.id);assert.equal(await p.evaluate(()=>document.activeElement.dataset.eventId),event.id);assert.equal(await first().getAttribute('aria-pressed'),'true');}
  assert.equal((await state()).history.cursor,before.history.cursor+4);
 });
 await run('last note extends exactly to bar end without shifting onset',async()=>{
  await reset();const e=(await state()).draft.bars[0].melody[1];await p.locator('[data-event-id="'+e.id+'"]').first().click();await p.selectOption('#sc-melody-duration','960');await ready();const actual=(await state()).draft.bars[0].melody[1];assert.equal(actual.id,e.id);assert.equal(actual.onsetTick+actual.durationTicks,1920);assert.equal(actual.onsetTick,960);
 });
 await run('reentrant focus edit retires old paint and converges on newest snapshot',async()=>{
  await reset();await first().click();const before=await state();
  await p.evaluate(()=>{window.__focusEdits=0;const f=e=>{if(e.target.matches('.vf-stavenote')&&!e.target.hasAttribute('data-melody-target')){document.removeEventListener('focusin',f,true);__focusEdits++;const select=document.querySelector('#sc-melody-duration');select.value='720';select.dispatchEvent(new Event('change',{bubbles:true}));}};document.addEventListener('focusin',f,true);});
  await p.selectOption('#sc-melody-duration','120');await ready();assert.equal(await p.evaluate(()=>__focusEdits),1);const now=await state();assert.equal(now.draft.bars[0].melody[0].durationTicks,720);assert.equal(now.history.cursor,before.history.cursor+2);assert.equal(await p.locator('[data-event-id="'+now.draft.bars[0].melody[0].id+'"]').count(),2);
  const metric=await p.evaluate(()=>CruiseStudio.sheetCruise.getStaffMetrics());await p.waitForTimeout(100);assert.deepEqual(await p.evaluate(()=>CruiseStudio.sheetCruise.getStaffMetrics()),metric,'render settles without a repeating loop');
 });
 await run('overlap and bar crossing refuse draft/history/raw and explain locally',async()=>{
  await reset();await first().click();for(const d of ['960','1920']){const before=await state();await p.selectOption('#sc-melody-duration',d);await ready();assert.deepEqual(await state(),before);assert.match(await p.locator('#sc-melody-error').innerText(),/変更は適用していません/);}
 });
 await run('non-ripple onset move preserves later note; invalid onset refuses atomically',async()=>{
  await reset();await first().click();await p.locator('#sc-melody-onset').fill('480');await click('開始位置を変更');assert.equal((await state()).draft.bars[0].melody[0].onsetTick,480);assert.equal((await state()).draft.bars[0].melody[1].onsetTick,960);
  const before=await state();await p.locator('#sc-melody-onset').fill('481');await click('開始位置を変更');assert.deepEqual(await state(),before);
 });
 await run('note to rest discards pitch; rest to note requires explicit pitch',async()=>{
  await reset();await first().click();const original=(await state()).draft.bars[0].melody[0];await click('休符にする');let s=await state();assert.equal(s.draft.bars[0].melody[0].kind,'rest');assert(!('pitch'in s.draft.bars[0].melody[0]));
  const before=await state();await panel.getByRole('button',{name:'指定した音符にする',exact:true}).click();assert.deepEqual(await state(),before);assert.match(await p.locator('#sc-melody-error').innerText(),/明示指定/);
  await p.selectOption('#sc-melody-pitch-step','F');await p.selectOption('#sc-melody-pitch-alter','1');await p.locator('#sc-melody-pitch-octave').fill('5');await click('指定した音符にする');s=await state();assert.deepEqual(s.draft.bars[0].melody[0].pitch,{step:'F',alter:1,octave:5});assert.equal(s.draft.bars[0].melody[0].id,original.id);assert.equal(s.draft.bars[0].melody[0].onsetTick,original.onsetTick);
 });
 await run('gap selection alone is no-write; confirm gap inserts exact explicit rest',async()=>{
  await reset();const before=await state();await p.locator('[data-melody-target][data-gap="0:240"]').first().click();assert.match(await panel.innerText(),/空き時間/);assert.deepEqual(await state(),before);await click('空き全体を休符として確認');const s=await state(),r=s.draft.bars[0].melody.find(e=>e.kind==='rest');assert.equal(r.onsetTick,0);assert.equal(r.durationTicks,240);assert(r.provenance.timing.onset.confirmed&&r.provenance.timing.duration.confirmed);assert.equal(s.history.cursor,before.history.cursor+1);
 });
 await run('insert selected rest length, resize and delete back to gap',async()=>{
  await reset();await p.locator('[data-melody-target][data-gap="0:240"]').first().click();await p.selectOption('#sc-melody-duration','120');await click('選んだ長さの休符を挿入');let s=await state();const r=s.draft.bars[0].melody.find(e=>e.kind==='rest');assert.equal(r.durationTicks,120);
  await p.selectOption('#sc-melody-duration','240');await ready();assert.equal((await state()).draft.bars[0].melody.find(e=>e.id===r.id).durationTicks,240);await click('削除して空き時間に戻す');assert(!(await state()).draft.bars[0].melody.some(e=>e.id===r.id));assert(await p.locator('[data-gap="0:240"]').count()>0);assert(await panel.isHidden());
 });
 await run('partial confirmation differs from whole-bar explicit confirmation',async()=>{
  await reset();await first().click();await click('開始位置だけ確認');let s=await state(),ev=s.draft.bars[0].melody[0];assert(ev.provenance.timing.onset.confirmed);assert(!ev.provenance.timing.duration.confirmed);assert.match(await panel.locator('.melody-editor-status').innerText(),/小節の時間：未確認/);
  await click('空きを休符にして小節を確認');s=await state();assert(s.draft.bars[0].melody.every(e=>e.provenance.timing.onset.confirmed&&e.provenance.timing.duration.confirmed));assert.equal(await p.locator('.melody-measure').first().getAttribute('data-timing-confirmed'),'true');await p.locator('#sc-undo').click();await ready();assert.equal(await p.locator('.melody-measure').first().getAttribute('data-timing-confirmed'),'false');
 });
 await run('tied notation fragments select one canonical event and one operation',async()=>{
  await reset();await first().click();await p.selectOption('#sc-melody-duration','720');await ready();const id=(await state()).draft.bars[0].melody[0].id,frags=p.locator('[data-event-id="'+id+'"]');assert(await frags.count()>1);await frags.last().click();assert.equal(await frags.first().getAttribute('aria-pressed'),'true');assert.equal(await frags.last().getAttribute('aria-pressed'),'true');assert.match(await panel.innerText(),/240 tick/);
 });
 await run('unchanged SVG adopts fresh identity without redraw after other-bar edit',async()=>{
  await reset();await p.evaluate(()=>{window.__sameSvg=document.querySelectorAll('.melody-svg svg')[1];const s=CruiseStudio.documents.getSession();s.runOperation('other bar title',d=>d.songInfo.title='Fresh source');});await ready();assert(await p.evaluate(()=>__sameSvg===document.querySelectorAll('.melody-svg svg')[1]));await p.locator('.melody-measure').nth(1).locator('[data-melody-target]').first().click();assert(await panel.isVisible());assert.match(await panel.innerText(),/2小節目/);
 });
 await run('arrow keys and Enter own selection; Escape returns focus, native Undo untouched',async()=>{
  await reset();await first().focus();await first().press('Enter');assert(await panel.locator('h3').evaluate(e=>e===document.activeElement));await panel.locator('h3').press('Escape');assert(await panel.isHidden());assert(await p.evaluate(()=>document.activeElement.hasAttribute('data-melody-target')));
  await first().focus();const identity=await p.evaluate(()=>({ticket:CruiseStudio.documents.ticket(),version:CruiseStudio.documents.getSession().snapshotVersion}));await first().press('ArrowRight');assert(await panel.isVisible());assert(await p.evaluate(()=>document.activeElement.getAttribute('aria-pressed')==='true'));
  const gap=await p.evaluate(()=>{const v=CruiseStudio.melodyInspector.controller.view();return {event:v.eventId,gap:v.gap,bar:v.barId};});assert.equal(gap.event,null);assert.deepEqual(gap.gap,{onsetTick:420,durationTicks:540});assert.equal(await p.locator('#sc-melody-onset').count(),0);assert.match(await panel.innerText(),/未確認の空き時間/);assert.deepEqual(await p.evaluate(()=>({ticket:CruiseStudio.documents.ticket(),version:CruiseStudio.documents.getSession().snapshotVersion})),identity);
  // Native-input Undo belongs to an explicit note Inspector, not a gap Inspector.
  await first().click();assert.equal(await p.locator('#sc-melody-onset').count(),1);
  const before=await state();await p.locator('#sc-melody-onset').focus();await p.locator('#sc-melody-onset').press('Meta+z');assert.deepEqual((await state()).draft,before.draft);assert.deepEqual((await state()).history,before.history);
 });
 await run('keyboard note/rest/gap order, reverse and bar boundary preserve identity and raw',async()=>{
  await reset();await p.evaluate(()=>{const C=CruiseStudio,s=C.documents.getSession(),d=structuredClone(__m2Base),sample=d.bars[0].melody[0];d.bars[0].melody=[{...structuredClone(sample),id:'kbd-note-0',onsetTick:0,durationTicks:240},{...structuredClone(sample),id:'kbd-note-1',onsetTick:240,durationTicks:240},{id:'kbd-rest',kind:'rest',onsetTick:480,durationTicks:240,provenance:structuredClone(sample.provenance)},{...structuredClone(sample),id:'kbd-note-2',onsetTick:960,durationTicks:960}];d.bars[1].melody=[{...structuredClone(sample),id:'kbd-next-bar',onsetTick:0,durationTicks:1920}];s.replaceDraft(d);});await ready();const before=await state(),ticket=await p.evaluate(()=>CruiseStudio.documents.ticket());
  const expected=[{id:'kbd-note-0',kind:'note'},{id:'kbd-note-1',kind:'note'},{id:'kbd-rest',kind:'rest'},{gap:'720:240',kind:'gap'},{id:'kbd-note-2',kind:'note'},{id:'kbd-next-bar',kind:'note'}];await p.locator('[data-event-id="kbd-note-0"]').click();
  async function check(x){const v=await p.evaluate(()=>{const C=CruiseStudio,v=C.melodyInspector.controller.view(),a=document.activeElement;return {id:v.eventId,kind:v.event?.kind||'gap',gap:v.gap? v.gap.onsetTick+':'+v.gap.durationTicks:null,bar:v.barId,activeId:a.dataset.eventId,activeGap:a.dataset.gap,pressed:a.getAttribute('aria-pressed'),ticket:C.documents.ticket()};});assert.equal(v.kind,x.kind);assert.equal(v.id,x.id||null);if(x.gap)assert.equal(v.gap,x.gap);assert.equal(v.pressed,'true');assert.equal(v.activeId,x.id||'');assert.deepEqual(v.ticket,ticket);assert.equal(await p.locator('#sc-melody-onset').count(),x.kind==='gap'?0:1);assert.equal(await p.locator('#sc-melody-pitch-step').count(),x.kind==='rest'?1:0);assert.equal(v.bar,before.draft.bars[x.id==='kbd-next-bar'?1:0].id);}
  for(let i=1;i<expected.length;i++){await p.locator('[data-melody-target]:focus').press('ArrowRight');await ready();await check(expected[i]);}
  for(let i=expected.length-2;i>=0;i--){await p.locator('[data-melody-target]:focus').press('ArrowLeft');await ready();await check(expected[i]);}
  assert.deepEqual((await state()).draft,before.draft);assert.deepEqual((await state()).history,before.history);assert.equal((await state()).raw,before.raw);
 });
 await run('CDP IME blocks duration commands; Loupe input and composition buffer remain',async()=>{
  await reset();await first().click();await p.locator('.melody-measure').first().locator('.melody-bar-heading').click();const input=p.locator('#sc-slot-overlay [data-overlay-field="doremi"]');await input.focus();await p.evaluate(()=>window.__heldM2Input=document.activeElement);const before=await state(),cdp=await ctx.newCDPSession(p);
  await cdp.send('Input.imeSetComposition',{text:'れ',selectionStart:1,selectionEnd:1});assert(await p.evaluate(()=>CruiseStudio.documents.getSession().inputPending));
  const blocked=await p.evaluate(()=>{const c=CruiseStudio.melodyInspector.controller;return c.execute(c.view()?.handle,'melody.setDuration',{durationTicks:120});});assert(!blocked.ok);assert.deepEqual((await state()).draft,before.draft);assert(await p.evaluate(()=>document.activeElement===__heldM2Input&&__heldM2Input.isConnected));
  await cdp.send('Input.insertText',{text:'レミ'});await cdp.detach();await ready();assert(await p.evaluate(()=>document.activeElement===__heldM2Input&&__heldM2Input.isConnected));assert.match(await input.inputValue(),/レミ/);const after=await state();assert.deepEqual(after.draft.bars[0].melody.map(e=>[e.id,e.onsetTick,e.durationTicks,e.provenance]),before.draft.bars[0].melody.map(e=>[e.id,e.onsetTick,e.durationTicks,e.provenance]));await input.press('Escape');
 });
 await run('A/B and queued old selection cannot mutate newer project',async()=>{
  await reset();await first().click();await p.evaluate(()=>{window.__oldM2=CruiseStudio.melodyInspector.controller.view().handle;window.__oldM2Node=document.querySelector('[data-melody-target][data-event-id]:not([data-event-id=""])');CruiseStudio.documents.select('M2-B');});await ready();assert(await panel.isHidden());const before=await state();assert(!(await p.evaluate(()=>CruiseStudio.melodyInspector.controller.execute(__oldM2,'melody.delete',{}))).ok);await p.evaluate(()=>__oldM2Node.dispatchEvent(new MouseEvent('click',{bubbles:true})));assert(await panel.isHidden());assert.deepEqual(await state(),before);await p.evaluate(()=>CruiseStudio.documents.select('M2-A'));await ready();
 },abWrites);
 await run('workspace switch closes Inspector and blocks old command handle',async()=>{
  await reset();await first().click();await p.evaluate(()=>{window.__oldM2=CruiseStudio.melodyInspector.controller.view().handle;CruiseStudio.shellHost.navigate('preDtm');});assert(!(await p.evaluate(()=>CruiseStudio.melodyInspector.controller.execute(__oldM2,'melody.delete',{}))).ok);await p.evaluate(()=>CruiseStudio.shellHost.navigate('sheetCruise'));await ready();assert(await panel.isHidden());
 });
 await run('4 Themes and 390/768/1440/1920 geometry never overlay score',async()=>{
  await reset();await first().click();for(const theme of ['dark','light','charcoal','gray'])for(const width of [390,768,1440,1920]){await resize(width);await phase('theme apply '+theme,async()=>{await p.evaluate(t=>CruiseStudio.colorTheme.applyColorTheme(t),theme);await ready();});
   const g=await p.evaluate(()=>{const a=document.querySelector('#sc-preview').getBoundingClientRect(),b=document.querySelector('#sc-melody-inspector').getBoundingClientRect(),s=getComputedStyle(document.querySelector('#sc-melody-inspector'));return {score:{left:a.left,right:a.right,top:a.top,bottom:a.bottom},panel:{left:b.left,right:b.right,top:b.top,bottom:b.bottom},foreground:s.color,background:s.backgroundColor,overflow:document.documentElement.scrollWidth-innerWidth};});geometry.push({theme,width,...g});assert(g.overflow<=1);assert(g.panel.left>=g.score.right-1||g.panel.top>=g.score.bottom-1,'Inspector never covers paper');assert.notEqual(g.foreground,g.background);assert(g.panel.right-g.panel.left>=200);
   if(process.env.STAFF_QA_DIR)await p.screenshot({path:process.env.STAFF_QA_DIR+'/m2-'+theme+'-'+width+'.png'});
  }
 },audited);
 await run('explicit theme preference saves exact one settings value preserving Loupe',async()=>{
  for(const theme of ['dark','light','charcoal','gray'])await phase('explicit theme save '+theme,async()=>{await p.locator('input[name="studio-theme"][value="'+theme+'"]').check();await ready();},rows=>{assert.equal(rows.length,1);const e=rows[0];assert.equal(e.key,'cruiseStudio.appSettings');assert.equal(e.kind,'storage');assert.equal(e.method,'setItem');assert.match(e.stack,/setColorTheme/);const before=JSON.parse(e.previous||'{}'),value=JSON.parse(e.value);assert.deepEqual(value,{...before,colorTheme:theme});});
 },audited);
 await run('print explicitly falls back and hides Inspector without writing',async()=>{
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));await p.emulateMedia({media:'print'});assert.equal(await panel.evaluate(e=>getComputedStyle(e).display),'none');assert.equal(await p.locator('.melody-page').evaluate(e=>getComputedStyle(e).display),'none');assert(await p.locator('.melody-print-fallback .sheet-bar').count()>0);await p.emulateMedia({media:'screen'});await p.evaluate(()=>window.dispatchEvent(new Event('afterprint')));assert.match(await panel.innerText(),/五線は印刷されません。コード譜を印刷します/);
 });
 await run('no-write until explicit Save; edited IDs/timing survive reload and save-point Undo',async()=>{
  let edited;await phase('unsaved edit before Save',async()=>{await reset();await first().click();await p.selectOption('#sc-melody-duration','360');await ready();edited=(await state()).draft;});
  await phase('explicit Save',async()=>{await p.locator('#sc-save').click();await p.waitForFunction(()=>!CruiseStudio.documents.getSession().commitInFlight&&!CruiseStudio.documents.getSession().dirty);assert.deepEqual(JSON.parse((await state()).raw).bars,edited.bars);},rows=>{assert.deepEqual(rows.map(e=>[e.kind,e.method,e.key]),[['storage','setItem','cruiseStudio.project.M2-A'],['storage','setItem','cruiseStudio.projects.index']]);assert.deepEqual(JSON.parse(rows[0].value).bars,edited.bars);const index=JSON.parse(rows[1].value);assert.equal(index[0].projectId,'M2-A');assert.equal(index.filter(e=>e.projectId==='M2-A').length,1);});
  await phase('saved Undo/Redo',async()=>{await p.locator('#sc-undo').click();await ready();assert((await state()).dirty);await p.locator('#sc-redo').click();await ready();assert(!(await state()).dirty);});
  await phase('reload same project',async()=>{await p.reload();await p.evaluate(()=>CruiseStudio.shellHost.navigate('sheetCruise'));await p.selectOption('#sc-score-style','melody');await ready();assert.deepEqual(await p.evaluate(()=>CruiseStudio.documents.getSession().workingSnapshot().bars),edited.bars);});
  assert(new Set(ledger.filter(e=>e.kind==='storage').map(e=>e.documentId)).size>=1);assert(phases.some(e=>e.name==='reload same project'&&e.end===e.start));
 },audited);
 await run('Console, 404 and forbidden requests remain zero',()=>{assert.deepEqual(errors,[]);assert.deepEqual(http,[]);assert.deepEqual(external,[]);});
 if(process.env.STAFF_QA_DIR){fs.writeFileSync(process.env.STAFF_QA_DIR+'/m2-geometry.json',JSON.stringify(geometry,null,2));persist();}
 }finally{persist();await browser.close();}
});
