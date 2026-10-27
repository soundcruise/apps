/* Normal focus/read-only UI regression. Disposable Chrome, no auth probes. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium } = require('playwright');
const url = process.env.STUDIO_URL || 'http://127.0.0.1:8766/apps/cruise-studio/index.html';
test('Workspace Focus Restoration real Chrome', async t => {
    const { libraryFixture, serializeFixture } = await import('./library-fixture.mjs');
    const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const errors = [], missing = [], external = [], report = { cases: [], screenshots: [] };
    await context.route('**/*', r => { const u = new URL(r.request().url()); if (u.origin === new URL(url).origin) return r.continue(); if (u.hostname === 'fonts.googleapis.com') return r.fulfill({ body: '', contentType: 'text/css' }); external.push(u.href); return r.abort(); });
    await context.addInitScript(() => {
        window.__focusQA = { writes: [], mutations: [], opens: [], unhandled: [] };
        for (const m of ['setItem', 'removeItem', 'clear']) { const fn = Storage.prototype[m]; Storage.prototype[m] = function (k, ...a) { if (/^(cruisePort\.|soundCruise|sound-cruise)/.test(k) || m === 'clear') __focusQA.writes.push({ m, k }); return fn.call(this, k, ...a); }; }
        for (const m of ['put', 'add', 'delete', 'clear']) { const fn = IDBObjectStore.prototype[m]; IDBObjectStore.prototype[m] = function (...a) { __focusQA.mutations.push({ m, store: this.name }); return fn.apply(this, a); }; }
        const open = IDBFactory.prototype.open; IDBFactory.prototype.open = function (name, ...a) { __focusQA.opens.push(name); return open.call(this, name, ...a); };
        const create = IDBDatabase.prototype.createObjectStore; IDBDatabase.prototype.createObjectStore = function (...a) { __focusQA.mutations.push({ create: this.name }); return create.apply(this, a); };
        window.addEventListener('unhandledrejection', e => __focusQA.unhandled.push(String(e.reason)));
    });
    const p = await context.newPage(); p.setDefaultTimeout(8000); p.on('dialog', d => d.accept()); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); p.on('response', r => { if (r.status() === 404) missing.push(r.url()); });
    const nav = async id => { await p.click('.studio-nav [data-workspace="' + id + '"]'); await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); };
    const active = () => p.evaluate(() => ({ id: document.activeElement.id, list: document.activeElement.dataset.focusList, item: document.activeElement.dataset.focusItem, role: document.activeElement.dataset.focusRole }));
    const step = (name, fn) => t.test(name, async () => { await fn(); report.cases.push(name); });
    try {
        await p.goto(url); await p.waitForFunction(() => !!CruiseStudio.libraryViews);
        const writer = await context.newPage(); await writer.goto(url); await writer.evaluate(values => Object.entries(values).forEach(([k, v]) => localStorage.setItem(k, v)), serializeFixture(libraryFixture()));
        await writer.evaluate(async () => { const CS = CruiseStudio, x = CS.model.createSampleProject(); x.projectId = 'focus-project'; x.songInfo.title = 'Focus fixture'; await CS.repository.save({ target: { type: 'project', projectId: x.projectId }, snapshot: x, baseRevision: null }); CS.storage.setCurrentProjectId(x.projectId); const { PortDatasetRepository } = await import('/apps/cruise-port/port-dataset-repository.js'); window.__focusRepo = new PortDatasetRepository({ storage: localStorage }); });
        await nav('sheetCruise'); const project = await p.evaluate(() => JSON.stringify(CruiseStudio.sheetCruise.getSession().draft));
        await nav('practice'); await p.click('#practice-read'); await p.waitForFunction(() => document.querySelector('#screen-practice').dataset.status === 'ready');
        for (const [id, other, selector] of [['practice', 'gear', '[data-practice-select="menus"][data-practice-id="m1"]'], ['gear', 'myApps', '[data-library-id="g1"]'], ['myApps', 'practice', '[data-library-id="custom"]']]) {
            await step('counterexample ' + id + ' list focus survives workspace round trip', async () => {
                await nav(id); const section = '#screen-' + (id === 'myApps' ? 'my-apps' : id); await p.locator(section + ' ' + selector).focus();
                await nav(other); await nav(id); assert.equal(await p.locator(section + ' ' + selector).evaluate(e => e === document.activeElement), true);
            });
        }
        await step('Practice set and history focus use distinct list IDs, without changing selection', async () => {
            await nav('practice'); const before = await p.evaluate(() => CruiseStudio.practiceView.snapshot().selected);
            for (const [list, id] of [['sets','set1'], ['history','h1']]) { const e = p.locator(`#screen-practice [data-focus-list="${list}"][data-focus-item="${id}"]`); await e.focus(); await nav('gear'); await nav('practice'); assert.equal((await active()).list, list); assert.equal((await active()).item, id); assert.equal(await e.evaluate(e => e === document.activeElement), true); }
            assert.deepEqual(await p.evaluate(() => CruiseStudio.practiceView.snapshot().selected), before);
        });
        await step('search text/caret and filter control restore separately from selection', async () => {
            await nav('gear'); await p.locator('#screen-gear [data-library-id="g1"]').click(); await p.locator('#screen-gear [data-library-search]').fill('ギター');
            await p.locator('#screen-gear [data-library-search]').evaluate(e => { e.focus(); e.setSelectionRange(1,2); }); await nav('myApps'); await nav('gear'); assert.equal((await active()).role, 'search'); assert.equal(await p.locator('#screen-gear [data-library-search]').inputValue(),'ギター'); assert.equal(await p.locator('#screen-gear [data-library-search]').evaluate(e=>e.selectionStart),1);
            for (const field of ['status','category']) { await p.locator(`#screen-gear [data-library-filter="${field}"]`).focus(); await nav('practice'); await nav('gear'); assert.equal((await active()).item, field); }
            assert.equal(await p.evaluate(()=>CruiseStudio.libraryViews.gear.snapshot().selectedId),'g1'); await p.locator('#screen-gear [data-library-search]').fill('');
            await nav('myApps'); await p.locator('#screen-my-apps [data-library-search]').fill('練習'); await p.locator('#screen-my-apps [data-library-search]').focus(); await nav('practice'); await nav('myApps'); assert.equal((await active()).role,'search'); assert.equal(await p.locator('#screen-my-apps [data-library-search]').inputValue(),'練習'); await p.locator('#screen-my-apps [data-library-search]').fill('');
        });
        await step('same display names and reordered external snapshot retain formal item focus', async () => {
            await nav('gear'); await p.locator('#screen-gear [data-library-id="g2"]').focus();
            await writer.evaluate(async()=>{ const r=await __focusRepo.runWrite({ expectedRevision:(await __focusRepo.readDatasetState()).revision },tx=>{ const x=JSON.parse(tx.getItem('cruisePort.gearList')); x.items.filter(i=>i.id==='g1'||i.id==='g2').forEach(i=>i.name='同じ名前'); x.items.find(i=>i.id==='g2').order=0; x.items.find(i=>i.id==='g1').order=1; tx.setItem('cruisePort.gearList',JSON.stringify(x)); return {}; }); if(!r.ok)throw Error(r.reason); });
            await p.waitForFunction(()=>document.querySelector('#screen-gear [data-library-id="g2"]').textContent.includes('同じ名前')); assert.equal((await active()).item,'g2'); await nav('practice'); await nav('gear'); assert.equal((await active()).item,'g2');
        });
        await step('inactive deletion resolves to safe fallback, without touching remaining selection', async () => {
            await p.locator('#screen-gear [data-library-id="g2"]').focus(); await nav('practice');
            await writer.evaluate(async()=>{await __focusRepo.runWrite({expectedRevision:(await __focusRepo.readDatasetState()).revision},tx=>{ const x=JSON.parse(tx.getItem('cruisePort.gearList'));x.items=x.items.filter(i=>i.id!=='g2');tx.setItem('cruisePort.gearList',JSON.stringify(x));return {};});});
            await p.waitForFunction(()=>!document.querySelector('#screen-gear [data-library-id="g2"]')); await nav('gear'); assert.equal((await active()).id,''); assert.equal((await active()).item,'read'); assert.equal(await p.evaluate(()=>CruiseStudio.libraryViews.gear.snapshot().selectedId),'g1');
        });
        await step('external rename outside active search falls back, keeps query/detail/selection', async () => {
            await p.locator('#screen-gear [data-library-search]').fill('同じ名前'); await p.locator('#screen-gear [data-library-id="g1"]').focus();
            await writer.evaluate(async()=>{await __focusRepo.runWrite({expectedRevision:(await __focusRepo.readDatasetState()).revision},tx=>{const x=JSON.parse(tx.getItem('cruisePort.gearList'));x.items.find(i=>i.id==='g1').name='更新後のギター';tx.setItem('cruisePort.gearList',JSON.stringify(x));return {};});});
            await p.waitForFunction(()=>!document.querySelector('#screen-gear [data-library-id="g1"]')); assert.equal((await active()).item,'read'); assert.equal(await p.locator('#screen-gear [data-library-search]').inputValue(),'同じ名前'); assert.equal(await p.evaluate(()=>CruiseStudio.libraryViews.gear.snapshot().selectedId),'g1'); assert.match(await p.locator('#screen-gear [data-library-detail]').innerText(),/更新後のギター/); await p.locator('#screen-gear [data-library-search]').fill('');
        });
        await step('stale/loading/error/future are re-evaluated using current visible controls', async () => {
            await p.evaluate(()=>{const request=navigator.locks.request.bind(navigator.locks);navigator.locks.request=(...args)=>args[0]==='sound-cruise:port:dataset:v1'&&args[1]?.mode==='shared'?new Promise(r=>window.__finishFocusRead=()=>{navigator.locks.request=request;r(request(...args));}):request(...args);});
            await p.locator('#screen-gear [data-library-read]').click(); await p.waitForFunction(()=>!!window.__finishFocusRead); await p.locator('#screen-gear [data-library-id="g1"]').focus(); await nav('practice'); await nav('gear'); assert.equal((await active()).item,'g1');
            await p.locator('#screen-gear [data-library-search]').focus(); await p.evaluate(()=>__finishFocusRead()); await p.waitForFunction(()=>document.querySelector('#screen-gear').dataset.status==='ready'); assert.equal((await active()).role,'search');
            await p.evaluate(()=>{const get=Storage.prototype.getItem;window.__restoreFocusGet=()=>Storage.prototype.getItem=get;Storage.prototype.getItem=function(k){if(k.startsWith('cruisePort.'))throw Error('fixture read failure');return get.call(this,k);};});
            await p.locator('#screen-gear [data-library-read]').click(); await p.waitForFunction(()=>document.querySelector('#screen-gear').dataset.status==='error'); await p.locator('#screen-gear [data-library-id="g1"]').focus(); await nav('practice'); await nav('gear'); assert.equal((await active()).item,'g1'); await p.evaluate(()=>__restoreFocusGet());
            await writer.evaluate(()=>{window.__savedFocusGear=localStorage.getItem('cruisePort.gearList');const x=JSON.parse(__savedFocusGear);x.version=999;localStorage.setItem('cruisePort.gearList',JSON.stringify(x));}); await p.waitForFunction(()=>document.querySelector('#screen-gear').dataset.status==='future'); assert.equal((await active()).item,'read');
            await writer.evaluate(()=>localStorage.setItem('cruisePort.gearList',__savedFocusGear)); await p.waitForFunction(()=>document.querySelector('#screen-gear').dataset.status==='ready'); assert.equal((await active()).item,'read');
        });
        await step('Modal keeps input focus through external render, then restores replaced trigger by ID', async () => {
            await p.locator('#screen-gear [data-library-id="g1"]').focus(); await p.evaluate(()=>{const content=document.createElement('div');content.innerHTML='<input id="focus-modal-input"><button>OK</button>';CruiseStudio.shellHost.modal.open({title:'Focus test',content});});
            await writer.evaluate(async()=>{await __focusRepo.runWrite({expectedRevision:(await __focusRepo.readDatasetState()).revision},tx=>{const x=JSON.parse(tx.getItem('cruisePort.gearList'));x.items.find(i=>i.id==='g1').name='Modal中の更新';tx.setItem('cruisePort.gearList',JSON.stringify(x));return {};});});
            await p.waitForFunction(()=>document.querySelector('#screen-gear [data-library-id="g1"]').textContent.includes('Modal中')); assert.equal((await active()).id,'focus-modal-input'); await p.keyboard.press('Tab'); await p.keyboard.press('Shift+Tab'); assert.equal((await active()).id,'focus-modal-input'); await p.keyboard.press('Escape'); assert.equal((await active()).item,'g1');
        });
        await step('IME search and external snapshot preserve input owner and committed value', async () => {
            await nav('myApps'); const search=p.locator('#screen-my-apps [data-library-search]'); await search.focus(); await search.evaluate(e=>{e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));e.value='練習';e.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'練習'}));});
            await writer.evaluate(async()=>{await __focusRepo.runWrite({expectedRevision:(await __focusRepo.readDatasetState()).revision},tx=>{const x=JSON.parse(tx.getItem('cruisePort.myApps'));x.items[0].name='練習アプリの更新';tx.setItem('cruisePort.myApps',JSON.stringify(x));return {};});});
            await p.waitForFunction(()=>document.querySelector('#screen-my-apps [data-library-id="custom"]').textContent.includes('更新')); assert.equal((await active()).role,'search'); assert.equal(await search.inputValue(),'練習');
            await search.evaluate(e=>e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'練習'}))); await p.waitForFunction(()=>!CruiseStudio.shellHost.keyboard.isIMEBlocked({})); await search.press('Space'); await search.press('Enter'); await search.press('Control+s'); assert.equal(await p.evaluate(()=>CruiseStudio.metronomeM1.snapshot().running),false); assert.equal(await p.evaluate(()=>CruiseStudio.tunerRuntime.snapshot().state),'idle'); await search.fill('');
        });
        await step('rapid workspace switching and old read completion do not steal newer input focus', async () => {
            await nav('gear'); await p.locator('#screen-gear [data-library-id="g1"]').focus(); for(let i=0;i<30;i++){await p.evaluate(()=>{CruiseStudio.shellHost.navigate('myApps');CruiseStudio.shellHost.navigate('practice');CruiseStudio.shellHost.navigate('gear');});assert.equal((await active()).item,'g1');}
            await p.evaluate(()=>{const request=navigator.locks.request.bind(navigator.locks);navigator.locks.request=(...args)=>args[0]==='sound-cruise:port:dataset:v1'&&args[1]?.mode==='shared'?new Promise(r=>window.__finishOldFocusRead=()=>{navigator.locks.request=request;r(request(...args));}):request(...args);}); await p.locator('#screen-gear [data-library-read]').click(); await p.waitForFunction(()=>!!window.__finishOldFocusRead);
            await nav('myApps'); await p.locator('#screen-my-apps [data-library-search]').focus(); await p.evaluate(()=>__finishOldFocusRead()); await p.waitForFunction(()=>document.querySelector('#screen-gear').dataset.status==='ready'); assert.equal((await active()).role,'search'); assert.equal(await p.evaluate(()=>document.activeElement.closest('.screen').id),'screen-my-apps');
        });
        await step('native Tab/Enter/Space select only explicit controls, focus does not select', async () => {
            await nav('practice'); const before=await p.evaluate(()=>CruiseStudio.practiceView.snapshot().selected); await p.locator('[data-practice-select="menus"][data-practice-id="m2"]').focus(); assert.deepEqual(await p.evaluate(()=>CruiseStudio.practiceView.snapshot().selected),before); await p.keyboard.press('Enter'); assert.equal(await p.evaluate(()=>CruiseStudio.practiceView.snapshot().selected.menus),'m2');
            await p.locator('[data-practice-select="sets"]').first().focus(); await p.keyboard.press('Space'); assert.equal(await p.evaluate(()=>CruiseStudio.practiceView.snapshot().selected.sets),'set1'); await p.keyboard.press('Tab'); assert(await p.evaluate(()=>document.activeElement.closest('.screen')?.id==='screen-practice'));
        });
        await step('four themes and 390–1920 widths retain current focus identity across pane and navigation', async () => {
            for(const theme of ['dark','charcoal','gray','light']){await p.evaluate(t=>CruiseStudio.colorTheme.setColorTheme(t),theme);for(const width of [390,768,1024,1440,1920]){await p.setViewportSize({width,height:900});await nav('gear');await p.keyboard.press('Tab');await p.locator('#screen-gear [data-library-id="g1"]').focus();await p.locator('.studio-nav [data-workspace="myApps"]').focus();await p.keyboard.press('Enter');await p.locator('.studio-nav [data-workspace="gear"]').focus();await p.keyboard.press('Enter');assert.equal((await active()).item,'g1');assert.equal(await p.locator('#screen-gear [data-library-id="g1"]').evaluate(e=>e.matches(':focus-visible')&&getComputedStyle(e).outlineStyle!=='none'),true);const path='/private/tmp/wfr-'+theme+'-'+width+'.png';await p.screenshot({path});report.screenshots.push(path);}}
            await p.setViewportSize({width:1440,height:900});await p.locator('#screen-gear [data-library-search]').focus();await p.click('#shell-inspector');await p.click('#shell-pane-close');await nav('practice');await nav('gear');assert.equal((await active()).role,'search');
        });
        await step('Structure/Loupe and Active Document retain exact draft and dirty state', async () => {
            await nav('sheetCruise');await p.locator('.sheet-bar').first().click();await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await p.locator('[data-overlay-field="chord"]').focus();await nav('practice');await nav('sheetCruise');assert.equal(await p.evaluate(()=>document.activeElement.dataset.overlayField),'chord');assert.equal(await p.evaluate(()=>JSON.stringify(CruiseStudio.sheetCruise.getSession().draft)),project);assert.equal(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().dirty),false);await nav('preDtm');assert.equal(await p.locator('#pd-project-select').inputValue(),'focus-project');await nav('sheetCruise');
            await p.emulateMedia({media:'print'});assert.equal(await p.locator('.studio-nav').evaluate(e=>getComputedStyle(e).display),'none');assert.match(await p.locator('.sheet-page').innerText(),/Focus fixture/);await p.emulateMedia({media:'screen'});
        });
        await step('50 real mount/host/dispose cycles add no listener or timer and invalidate old resolver', async () => {
            const result=await p.evaluate(()=>{let subscriptions=0,bindings=0;const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;const mountRoot=document.querySelector('#screen-gear');EventTarget.prototype.addEventListener=function(t,fn,...a){if(this===mountRoot)bindings++;return add.call(this,t,fn,...a);};EventTarget.prototype.removeEventListener=function(t,fn,...a){if(this===mountRoot)bindings--;return remove.call(this,t,fn,...a);};let off=0;const host={getCachedStatus:()=>CruiseStudio.portDataHost.getCachedStatus(),subscribe(){subscriptions++;return()=>{subscriptions--;off++;};}};try{for(let i=0;i<50;i++){const view=CruiseStudio.libraryPresentation.mount({document,shell:CruiseStudio.shellHost,kind:'gear',filterItems:()=>[]});view.attachHost(host);view.activate();view.dispose();view.dispose();if(view.resolveFocus({workspaceId:'gear',listId:'items',itemId:'g1',role:'item'})!==null)throw Error('old resolver');}return{subscriptions,bindings,off};}finally{EventTarget.prototype.addEventListener=add;EventTarget.prototype.removeEventListener=remove;}});assert.deepEqual(result,{subscriptions:0,bindings:0,off:50});
        });
        await step('No-write, no unexpected dirty, formal version, console/404/unhandled zero', async () => {
            const qa=await p.evaluate(()=>__focusQA);assert.deepEqual(qa.writes,[]);assert.deepEqual(qa.mutations,[]);assert.deepEqual(qa.unhandled,[]);assert(!qa.opens.some(n=>/authority|cruisePortGear|cruisePortMyApps|cruisePortPractice|pro-device/i.test(n)));assert.equal(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().dirty),false);assert.equal(await p.evaluate(()=>CruiseStudio.portDataHost.canWrite),false);assert.equal(await p.locator('#studio-version').textContent(),'v0.47.10');assert.equal(await p.evaluate(()=>CruiseStudio.model.APP_VERSION),'0.47.10');assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert.deepEqual(external,[]);report.noWrite=qa;
        });
        await step('reload forgets focus identity and has no automatic Port read', async () => {
            await p.reload();await p.waitForFunction(()=>!!CruiseStudio.libraryViews);await nav('gear');assert.equal((await active()).id,'screen-gear');assert.equal(await p.evaluate(()=>CruiseStudio.libraryViews.gear.snapshot().selectedId),null);assert.deepEqual(await p.evaluate(()=>__focusQA.opens),[]);
        });
    } finally { fs.writeFileSync('/private/tmp/wfr-browser.json', JSON.stringify(report,null,2)); await browser.close(); }
});
