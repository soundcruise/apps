// Read-only candidate audit. All state is synthetic/in-memory; no network transport.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const repo = new URL('../../../../', import.meta.url).pathname;
const { world, device } = await import(repo + 'workers/sound-cruise-sync/test/theme-compat-harness.js');
const { hashRecord } = await import(repo + 'workers/sound-cruise-sync/src/records.js');
const read = p => fs.readFileSync(repo + p, 'utf8');
export async function runChordAudit(){
const results={};
const ok = r => assert.equal(r.ok, true, JSON.stringify(r));
function storage(data) { return {
  getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k),
  key: i => [...data.keys()][i] ?? null, get length() { return data.size; }
}; }
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
    const conflicts=[];
    const store = {putOutbox:async o=>{const i=pending.findIndex(p=>p.operationId===o.operationId);pending[i]=o},getMeta:async k=>meta.get(k),setMeta:async(k,v)=>meta.set(k,v),getShadow:async k=>shadow.get(k),
      putShadow:async r=>shadow.set(r.recordKey,r),listShadow:async()=>[...shadow.values()],listOutbox:async()=>[],listConflicts:async()=>conflicts,putConflict:async c=>{const i=conflicts.findIndex(x=>x.conflictId===c.conflictId);if(i<0)conflicts.push(c);else conflicts[i]=c}};
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
    // Separate invalid-manifest fault scenario; real reviewed recovery is covered in browsers.
    pending.length = 0; conflicts.length=0;
    corruptSnapshot = true;
    results.chordUpgrade.badManifest = JSON.parse(JSON.stringify(await client.pullOnce()));
    results.chordUpgrade.badManifestPreserved = meta.get('cursor') === before.cursor &&
      JSON.parse(data.get('chordCruise.settings')).theme === 'dark';
    corruptSnapshot = false;
    results.chordUpgrade.retry = JSON.parse(JSON.stringify(await client.pullOnce()));
    results.chordUpgrade.retryTheme = JSON.parse(data.get('chordCruise.settings')).theme;
  } finally { w.close(); }
}
return results.chordUpgrade;
}
