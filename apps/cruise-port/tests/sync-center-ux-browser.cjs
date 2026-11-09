// Real DOM / IndexedDB, synthetic Account only; never contacts production.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    let bytes = fs.readFileSync(file);
    const ext = path.extname(file);
    // Only a local UI fixture: load the real markup/styles without booting Sync/auth.
    if (ext === '.html') bytes = Buffer.from(bytes.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
    res.setHeader('Content-Type', ({ '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' })[ext] || 'application/octet-stream');
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless:true, channel:'chrome' });
  let checks = 0;
  try {
    for (const edition of ['index.html', 'pro_9a3943176561/index.html']) {
      const context = await browser.newContext({ viewport:{width:393,height:852} });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.goto(`${origin}/apps/cruise-port/${edition}`);
      const install = async () => {
        const ctrl = await import('/apps/cruise-port/sync-center-controller.js');
        const ui = await import('/apps/cruise-port/sync-center-ui.js');
        const root = document.getElementById('sync-center-view');
        document.querySelectorAll('main.port-view').forEach(el => el.hidden = el !== root);
        document.getElementById('pro-gate-overlay')?.remove();
        document.body.classList.remove('pro-gate-active');
        document.querySelectorAll('[inert]').forEach(el => el.removeAttribute('inert'));
        window.calls = { opens:[], rechecks:0, port:0 };
        window.makePresentation = (state = 'attention', count = 0) => {
          const ids = ['pitch','fretboard','rhythm','chord'];
          const memberships = ids.map(appId => ({appId,state:'active',activeAppDeviceCount:appId==='chord'?1:2,
            attentionConflictCount:appId==='chord'?0:count,removalSafety:appId==='chord'||state==='clean'?'safe':state==='pending'?'unknown':'attention',
            dataset:{state:'ready',schemaVersion:1,recordCount:4}}));
          const appDevices = ids.flatMap(appId => (appId==='chord'?['new']:['old','new']).map(which => ({
            id:`${appId}-${which}`,appId,label:which==='old'?'Synthetic old target':'Synthetic current target',
            createdAt:1,lastSeenAt:3,revokedAt:null,isCurrent:which==='new',
            lastReport:{state:which==='new'?'clean':state,reportedAt:which==='new'?3:2,attentionCount:which==='old'?count:0}})));
          return {...ctrl.normalizeSyncCenterSummary({account:{id:'synthetic-A',state:'active',recoveryVersion:1},memberships},{devices:[],appDevices}),
            portStatus:{state:'synced',label:'✓ 同期済み'},portConflictCount:0,portRuntimeActive:false};
        };
        window.render = p => ui.renderSyncCenter(root,p,{edition:location.pathname.includes('/pro_')?'pro':'standard',orchestrationEnabled:true,
          onResolveApp:app=>calls.opens.push(app.id),onResolvePort:()=>calls.port++,
          onRecheck:()=>{calls.rechecks++;render(makePresentation('clean'));}});
        window.row = app => [...root.querySelectorAll('.sync-center-app')].find(el=>el.querySelector(`[data-sync-resolve-app="${app}"]`));
        window.mismatch = () => { const p=makePresentation();return {...p,apps:p.apps.map(a=>a.id==='pitch'?{...a,snapshot:'mismatch',presentationStatus:ctrl.appSyncStatusPresentation({...a,snapshot:'mismatch'})}:a)}; };
        window.offline = () => ctrl.createUnavailablePresentation('offline',makePresentation());
        localStorage.setItem('synthetic-local-practice','unchanged');
        const db = await new Promise((resolve,reject)=>{const q=indexedDB.open('synthetic-sync-ux',1);
          q.onupgradeneeded=()=>q.result.createObjectStore('records').add({operationId:'keep-midnight-v1',accountId:'synthetic-A',baseRevision:7,theme:'midnight',conflict:{local:'A',cloud:'B'},unattributed:true},'pending');
          q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});db.close();
        window.readFixture = async()=>{const db=await new Promise(resolve=>{const q=indexedDB.open('synthetic-sync-ux');q.onsuccess=()=>resolve(q.result);});try{return await new Promise(resolve=>{const q=db.transaction('records','readonly').objectStore('records').get('pending');q.onsuccess=()=>resolve(JSON.stringify(q.result));});}finally{db.close();}};
        window.fixtureBefore = await readFixture();
        render(makePresentation());
      };
      await page.evaluate(install);
      assert.deepEqual(await page.evaluate(()=>calls.opens), [], 'render must never open another app'); checks++;
      const saved = await page.evaluate(()=>({db:fixtureBefore,history:JSON.stringify(history.state),local:localStorage.getItem('synthetic-local-practice')}));
      assert.equal(await page.locator('[data-sync-resolve-app="pitch"]').textContent(),'アプリを開く'); checks++;
      assert.equal(await page.locator('.sync-center-app-status-chip--attention').first().textContent(),'前回報告に確認事項'); checks++;
      assert.equal(await page.locator('#sync-center-port-status-chip').textContent(),'✓ 同期済み'); checks++;
      for (const width of [393,320]) {
        await page.setViewportSize({width,height:852});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'status wording must not overflow'); checks++;
      }
      await page.setViewportSize({width:393,height:852});
      if (process.env.SYNC_UX_ARTIFACT_DIR && edition==='index.html') {
        fs.mkdirSync(process.env.SYNC_UX_ARTIFACT_DIR,{recursive:true});
        await page.screenshot({path:path.join(process.env.SYNC_UX_ARTIFACT_DIR,'sync-center-stage1.png')});
      }
      // A current target's clean report never erases another target's attention.
      await page.locator('[data-sync-resolve-app="pitch"]').click();
      assert.deepEqual(await page.evaluate(()=>calls.opens),['pitch'],'only the explicit app link may open'); checks++;
      await page.evaluate(()=>{ render(makePresentation());render(makePresentation());document.dispatchEvent(new Event('visibilitychange')); });
      assert.deepEqual(await page.evaluate(()=>calls.opens),['pitch'],'refresh/return must not open more apps'); checks++;
      assert.equal(await page.evaluate(()=>JSON.stringify(history.state)),saved.history,'render adds no seen/dismissal history'); checks++;
      await page.evaluate(()=>render(makePresentation('attention',2)));
      assert.equal(await page.locator('#sync-center-overall-status').textContent(),'確認事項のあるアプリ 3件','report count is apps, not claimed live conflicts'); checks++;
      assert.equal(await page.locator('.sync-center-app-status-chip--attention').first().textContent(),'前回報告に確認事項 2件'); checks++;
      // Inconsistent summary/devices responses use the existing Port-only recheck.
      await page.evaluate(()=>render(mismatch()));
      assert.equal(await page.locator('[data-sync-resolve-app="pitch"]').textContent(),'もう一度確認'); checks++;
      await page.locator('[data-sync-resolve-app="pitch"]').click();
      assert.equal(await page.evaluate(()=>calls.rechecks),1); checks++;
      assert.deepEqual(await page.evaluate(()=>calls.opens),['pitch'],'recheck must not open an app'); checks++;
      assert.equal(await page.locator('#sync-center-overall-status').textContent(),'同期の確認事項なし'); checks++;
      await page.evaluate(()=>render(makePresentation('pending')));
      assert.equal(await page.locator('.sync-center-app-status-chip--attention').count(),0,'pending alone is not a user conflict'); checks++;
      await page.evaluate(()=>render(makePresentation('error')));
      assert.equal(await page.locator('.sync-center-app-status-chip--attention').first().textContent(),'前回報告に確認事項'); checks++;
      await page.evaluate(()=>render(offline()));
      assert.equal(await page.locator('.sync-center-app-status-chip--offline').count(),4); checks++;
      await page.evaluate(()=>render({...makePresentation(),accountDisplayId:'synthetic-B'}));
      assert.equal(await page.evaluate(()=>readFixture()),saved.db,'Account display cannot adopt another Account outbox'); checks++;
      await page.evaluate(()=>render({...makePresentation('clean'),portStatus:{state:'attention',label:'確認が必要'},portConflictCount:1,portStructuredStatus:{conflictCount:1},portRuntimeActive:true}));
      assert(await page.locator('#sync-center-port-conflicts-open').isVisible()); checks++;
      assert.equal(await page.evaluate(()=>calls.port),0,'Port conflict review also requires a user action'); checks++;
      await page.evaluate(()=>render(makePresentation()));
      assert.equal(await page.evaluate(()=>readFixture()),saved.db,'Midnight/Outbox/conflicts/revision are untouched'); checks++;
      await page.reload();
      assert.equal(await page.evaluate(()=>localStorage.getItem('synthetic-local-practice')),saved.local); checks++;
      await page.evaluate(install);
      assert.equal(await page.evaluate(()=>readFixture()),saved.db); checks++;
      assert.deepEqual(await page.evaluate(()=>calls.opens),[],'fresh page never auto-opens another app'); checks++;
      await context.close();
    }
    console.log(`PASS: ${checks} Chromium DOM/IndexedDB checks, Standard and Pro`);
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error.stack);server.close();process.exitCode=1;});
