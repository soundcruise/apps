// Read-only candidate audit. All state is synthetic/in-memory; no network transport.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const repo = new URL('../../../../', import.meta.url).pathname;
const { world, device } = await import(repo + 'workers/sound-cruise-sync/test/theme-compat-harness.js');
const { hashRecord } = await import(repo + 'workers/sound-cruise-sync/src/records.js');
const port = await import(repo + 'apps/cruise-port/settings-store.js');
const read = p => fs.readFileSync(repo + p, 'utf8');
export async function runAudit() {
const results = { base: '4cfbea2cfee9d63e0e55690741cad0179cb54e0a', legacy: [], upgrades: [] };
const ok = r => assert.equal(r.ok, true, JSON.stringify(r));
function storage(data) { return {
  getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k),
  key: i => [...data.keys()][i] ?? null, get length() { return data.size; }
}; }
function upgrade(d) {
  const c = vm.createContext({ crypto: webcrypto, TextEncoder, structuredClone, URL });
  vm.runInContext(read('apps/' + d.item.current), c);
  const adapter = new c[d.item.root][d.item.name]({ storage: storage(d.data), cryptoImpl: webcrypto });
  d.runtime.adapter = adapter; d.adapter = adapter;
}
for (const app of ['pitch','fretboard','rhythm']) {
  const w = world(app);
  try {
    const old = device(w, 'v1'); ok(await old.join());
    ok(await w.rawWriter(w.addDevice()).put({ ...w.stored().values, theme: 'midnight' }, ['settings_theme_v2']));
    ok(await old.sync()); assert.equal(old.settings().theme, 'dark');
    const cursor = await old.store.readMeta('cursor');
    const store = old.store, data = old.data;
    upgrade(old); ok(await old.sync());
    assert.equal(old.store, store); assert.equal(old.data, data); assert.equal(old.settings().theme,'midnight');
    results.upgrades.push({app, sameStore:true, priorCursor:cursor, restoredTheme:old.settings().theme, conflicts:(await old.conflicts()).length});
  } finally { w.close(); }
  for (const scenario of ['frozen-v1-explicit-light','published-v1-explicit-midnight']) {
    const w = world(app);
    try {
      const d = device(w, scenario.startsWith('frozen') ? 'v1' : 'published');
      ok(await d.join());
      if (scenario.startsWith('frozen')) {
        ok(await w.rawWriter(w.addDevice()).put({ ...w.stored().values, theme:'midnight' }, ['settings_theme_v2']));
        ok(await d.sync());
      }
      d.change(s => { s.theme = scenario.startsWith('frozen') ? 'light' : 'midnight'; });
      const rounds = [];
      for(let i=0;i<3;i++) {
        const sync = await d.sync('save');
        rounds.push({ok:sync.ok, localTheme:d.settings().theme, cloudTheme:w.stored().values.theme,
          cloudRevision:w.stored().revision, pending:(await d.store.listOutbox()).length, conflicts:(await d.conflicts()).length});
      }
      const entry = { app, scenario, rounds };
      if (scenario === 'published-v1-explicit-midnight') {
        const conflict = (await d.conflicts())[0];
        entry.localResolution = await d.runtime.resolveConflict(conflict.id, 'merged', {fieldChoices:{'/theme':'local'}});
        entry.remoteResolution = await d.runtime.resolveConflict(conflict.id, 'merged', {fieldChoices:{'/theme':'remote'}});
        entry.afterResolution = { localTheme:d.settings().theme, cloudTheme:w.stored().values.theme,
          conflicts:(await d.conflicts()).length, resync:await d.sync() };
      }
      results.legacy.push(entry);
    } finally { w.close(); }
  }
}
// Fault injection: a failed local overlay removal must not be mistaken for an atomic failed choice.
{
  const data = new Map([[port.SETTINGS_STORAGE_KEY, JSON.stringify({version:3,fontSize:'medium',theme:'light'})]]);
  const s = storage(data);
  ok(port.saveSettings({...port.loadSettings(s).settings,theme:'midnight'},s,{themeChanged:true}));
  const before = port.loadSettings(storage(data)).settings.theme;
  s.removeItem = () => { throw Error('synthetic-storage-failure'); };
  const save = port.saveSettings({...port.loadSettings(s).settings,theme:'gray'},s,{themeChanged:true});
  results.portPartialCommit = { before, saveOk:save.ok, restartTheme:port.loadSettings(storage(data)).settings.theme,
    base:JSON.parse(data.get(port.SETTINGS_STORAGE_KEY)), overlay:JSON.parse(data.get(port.MIDNIGHT_STORAGE_KEY)) };
}
// Real Chord client and local Worker handler with a persisted old projected shadow/cursor.
{
  const w = world('chord');
  try {
    w.env.SYNC_ALLOWED_APP_IDS += ',chord';
    w.db.raw.prepare("UPDATE sync_datasets SET state = 'ready'").run();
    const id = w.addDevice(), send = w.fetchFor(id);
    const op = { operationId:webcrypto.randomUUID(), recordType:'settings', recordId:'default', schemaVersion:1,
      baseRevision:0,payload:{theme:'midnight',selectedKey:0},deleted:false };
    op.payloadHash = await hashRecord(op,webcrypto,'chord');
    const pushed = await (await send('https://sync.soundcruise.jp/v1/sync/push',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({appId:'chord',mode:'sync',capabilities:['settings_theme_v2'],operations:[op]})})).json();
    ok(pushed);
    const before = await (await send('https://sync.soundcruise.jp/v1/sync/snapshot?appId=chord')).json(); ok(before);
    const full = await (await send('https://sync.soundcruise.jp/v1/sync/snapshot?appId=chord&capabilities=settings_theme_v2')).json(); ok(full);
    assert.equal(before.records[0].payload.theme,'dark'); assert.equal(full.records[0].payload.theme,'midnight');
    const data = new Map([['chordCruise.settings', JSON.stringify(before.records[0].payload)]]);
    const meta = new Map([['appId','chord'],['cursor',before.cursor],['migrationState','complete'],['datasetState','ready'],
      ['deviceCredential',{credential:'scd1.'+id+'.'+'A'.repeat(43)}]]);
    const shadow = new Map([['settings/default',{...before.records[0],recordKey:'settings/default'}]]);
    const store = {getMeta:async k=>meta.get(k),setMeta:async(k,v)=>meta.set(k,v),getShadow:async k=>shadow.get(k),
      putShadow:async r=>shadow.set(r.recordKey,r),listShadow:async()=>[...shadow.values()],listOutbox:async()=>[],listConflicts:async()=>[]};
    const c = { crypto:webcrypto,TextEncoder,URL,structuredClone,AbortController,setTimeout,clearTimeout };
    c.window=c; vm.createContext(c);
    vm.runInContext(read('apps/chord-cruise/js/sync/sync-core.js'),c);
    vm.runInContext(read('apps/chord-cruise/js/sync/sync-merge.js'),c);
    c.ChordCruiseSync.database = {open:async()=>store};
    vm.runInContext(read('apps/chord-cruise/js/sync/sync-client.js'),c);
    const calls=[];
    let corruptSnapshot = false;
    const client=c.ChordCruiseSync.client.createClient({enabled:true,localStorage:storage(data),crypto:webcrypto,
      endpoint:'https://sync.soundcruise.jp',fetch:async(url,init)=>{
        calls.push(url); const response = await send(url,init);
        if (corruptSnapshot && url.includes('/snapshot?')) {
          const body = await response.json(); body.manifestHash = '0'.repeat(64);
          return new Response(JSON.stringify(body), {status:200,headers:{'Content-Type':'application/json'}});
        }
        return response;
      }});
    await client.initialize();
    const pulled=await client.pullOnce();
    results.chordUpgrade={priorCursor:before.cursor,pull:JSON.parse(JSON.stringify(pulled)),
      calls:[...calls],localTheme:JSON.parse(data.get('chordCruise.settings')).theme,cloudTheme:full.records[0].payload.theme,
      retainedCursor:meta.get('cursor') === before.cursor};
    const snapshots = () => calls.filter(u => u.includes('/snapshot?')).length;
    const count = snapshots(); await client.initialize(); await client.pullOnce();
    results.chordUpgrade.restartNoExtraSnapshot = snapshots() === count;
    // Downgrade/re-upgrade: an old tab can replace the shadow while the v2 marker survives.
    const oldView = () => { shadow.set('settings/default',{...before.records[0],recordKey:'settings/default'});
      data.set('chordCruise.settings',JSON.stringify(before.records[0].payload)); };
    oldView();
    const pending = [{operationId:'kept',recordType:'settings',payload:{theme:'light'}}];
    store.listOutbox = async () => pending;
    results.chordUpgrade.pending = JSON.parse(JSON.stringify(await client.pullOnce()));
    results.chordUpgrade.pendingPreserved = pending.length === 1 && meta.get('cursor') === before.cursor &&
      JSON.parse(data.get('chordCruise.settings')).theme === 'dark';
    pending.length = 0;
    corruptSnapshot = true;
    results.chordUpgrade.badManifest = JSON.parse(JSON.stringify(await client.pullOnce()));
    results.chordUpgrade.badManifestPreserved = meta.get('cursor') === before.cursor &&
      JSON.parse(data.get('chordCruise.settings')).theme === 'dark';
    corruptSnapshot = false;
    results.chordUpgrade.retry = JSON.parse(JSON.stringify(await client.pullOnce()));
    results.chordUpgrade.retryTheme = JSON.parse(data.get('chordCruise.settings')).theme;
  } finally { w.close(); }
}
return results;
}
