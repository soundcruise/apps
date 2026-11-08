import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';
import { visibleRecordView } from '../src/sync-capabilities.js';
import { runChordAudit } from './fixtures/midnight-chord-audit.mjs';
import { world, device, loadRuntime } from './theme-compat-harness.js';
const frozen = fs.readFileSync(new URL('./fixtures/published-v1/multi-app-sync-runtime.js.fixture',import.meta.url),'utf8');
const ok=r=>assert.equal(r.ok,true,JSON.stringify(r));
function upgrade(w,d) {
 const {Runtime,context}=loadRuntime();context.navigator.locks=w.locks;
 vm.runInContext(fs.readFileSync(new URL('../../../apps/'+d.item.current,import.meta.url),'utf8'),vm.createContext(context));
 const adapter=new context[d.item.root][d.item.name]({storage:{getItem:k=>d.data.get(k)??null,setItem:(k,v)=>d.data.set(k,String(v)),removeItem:k=>d.data.delete(k)},cryptoImpl:webcrypto});
 const old=d.runtime;
 const runtime=new Runtime({appId:w.appId,accountId:w.accountId,endpoint:old.endpoint,adapter,store:d.store,accountClient:old.accountClient,accountCore:old.accountCore,fetchImpl:old.fetchImpl,admissionMode:old.admissionMode,writerWireContext:old.writerWireContext});
 return {...d,runtime,adapter,sync:(reason='focus')=>runtime.sync(reason)};
}
test('published runtime fixture remains fixed',()=>{
 const m=JSON.parse(fs.readFileSync(new URL('./fixtures/published-v1/source.json',import.meta.url)));assert.equal(createHash('sha256').update(frozen).digest('hex'),m.runtime.sha256);
});
for(const app of ['pitch','fretboard','rhythm']) {
 test(`${app}: frozen v1 Midnight operation is not committed; same Outbox resumes after v2 update`,async t=>{
  const w=world(app);t.after(()=>w.close());let d=device(w,'published',undefined,frozen);ok(await d.join());
  const before=w.stored(),cursor=await d.store.readMeta('cursor');d.change(s=>s.theme='midnight');await d.sync('save');
  const pending=await d.store.listOutbox();assert.equal(pending.length,1);assert.equal(pending[0].terminalError,'settings_theme_upgrade_required');assert.deepEqual(w.stored(),before);assert.equal(d.settings().theme,'midnight');
  const store=d.store,data=d.data;d=upgrade(w,d);assert.equal(d.store,store);assert.equal(d.data,data);assert.equal(await store.readMeta('cursor'),cursor);
  ok(await d.sync());assert.equal(d.settings().theme,'midnight');assert.equal(w.stored().values.theme,'midnight');assert.equal((await store.listOutbox()).length,0);assert.equal((await d.conflicts()).length,0);ok(await d.sync());
  assert.equal(w.stored().revision,before.revision+1);assert.equal(w.db.raw.prepare("SELECT last_operation_id FROM sync_records WHERE record_type='settings'").get().last_operation_id,pending[0].operationId);
 });
 for(const choice of ['local','remote']) test(`${app}: existing failed v1 resolution resumes with ${choice} choice after upgrade`,async t=>{
  const w=world(app);t.after(()=>w.close());let d=device(w,'published',undefined,frozen);ok(await d.join());
  // Reproduce a projected conflict that was already persisted before the new gate.
  const ungated=w.rawWriter(w.addDevice());ok(await ungated.put({...w.stored().values,theme:'midnight'},['settings_theme_v2']));
  d.change(s=>s.theme='midnight');await d.sync();let c=(await d.conflicts())[0];
  if(!c) { // The old runtime may retain the rejected Outbox until another remote edit.
   ok(await ungated.put({...w.stored().values,[d.item.other.field]:d.item.other.to},['settings_theme_v2']));await d.sync();c=(await d.conflicts())[0];
  }
  assert.ok(c,'real conflict retained');await d.runtime.resolveConflict(c.id,'merged',{fieldChoices:{'/theme':choice}});
  d=upgrade(w,d);
  let result=(await d.conflicts()).length?await d.runtime.resolveConflict(c.id,'merged',{fieldChoices:{'/theme':choice}}):await d.sync();
  assert.equal(result.ok,true,JSON.stringify(result));ok(await d.sync());assert.equal((await d.conflicts()).length,0);assert.equal((await d.store.listOutbox()).length,0);assert.equal(d.settings().theme,w.stored().values.theme);
 });
 test(`${app}: simultaneous old and updated tab cannot leak Midnight to four-theme reader`,async t=>{
  const w=world(app);t.after(()=>w.close());const old=device(w,'v1',undefined,frozen);ok(await old.join());
  const modern=device(w,'current');ok(await modern.join());modern.change(s=>s.theme='midnight');ok(await modern.sync('save'));ok(await old.sync());assert.equal(old.settings().theme,'dark');
  old.change(s=>{s.theme='light';s[old.item.other.field]=old.item.other.to});ok(await old.sync('save'));ok(await modern.sync());assert.equal(modern.settings().theme,'light');assert.equal(w.stored().values[old.item.other.field],old.item.other.to);
 });
}


test('Chord C: persisted cursor/snapshot validation/pending operations remain recoverable',async()=>{
 const c=await runChordAudit();ok(c.pull);assert.equal(c.localTheme,'midnight');assert.equal(c.cloudTheme,'midnight');assert.equal(c.retainedCursor,true);assert.equal(c.restartNoExtraSnapshot,true);assert.equal(c.pending.code,'theme_view_upgrade_pending');assert.equal(c.pendingPreserved,true);assert.equal(c.badManifest.code,'invalid_cloud_snapshot');assert.equal(c.badManifestPreserved,true);ok(c.retry);assert.equal(c.retryTheme,'midnight');
});
for(const app of ['pitch','fretboard','rhythm'])for(const choice of ['local','remote'])test(`${app}: pre-gate committed Midnight verification failure recovers via ${choice}`,async t=>{
 const w=world(app);t.after(()=>w.close());let d=device(w,'published',undefined,frozen);ok(await d.join());
 const send=d.runtime.fetchImpl;
 // Emulate the pre-gate Worker through the real repository and old v1 ACK projection.
 // Only bypass the newly added request guard; this is synthetic transport, never production.
 d.runtime.fetchImpl=async(url,init={})=>{
  if(!url.endsWith('/push'))return send(url,init);
  const b=JSON.parse(init.body);if(b.capabilities?.includes('settings_theme_v2'))return send(url,init);
  const response=await send(url,{...init,body:JSON.stringify({...b,capabilities:['settings_theme_v2']})});const body=await response.json();
  for(const r of body.results||[])r.record=await visibleRecordView(app,r.record,new Set(['settings_theme_v1']));
  return new Response(JSON.stringify(body),{status:response.status});
 };
 d.change(s=>s.theme='midnight');await d.sync('save');const c=(await d.conflicts())[0];assert.ok(c);
 const failed=await d.runtime.resolveConflict(c.id,'merged',{fieldChoices:{'/theme':'local'}});assert.equal(failed.code,'resolution_verify_failed');assert.equal(w.stored().values.theme,'midnight');
 d=upgrade(w,d);
 if(choice==='remote')ok(await d.runtime.resolveConflict(c.id,'later'));
 ok(await d.runtime.resolveConflict(c.id,'merged',{fieldChoices:{'/theme':choice}}));ok(await d.sync());assert.equal(d.settings().theme,'midnight');assert.equal((await d.conflicts()).length,0);assert.equal((await d.store.listOutbox()).length,0);
});
for(const app of ['pitch','fretboard','rhythm']) {
 test(`${app}: old/new tabs sharing the durable store re-read without cursor reset`,async t=>{
  const w=world(app);t.after(()=>w.close());const old=device(w,'published',undefined,frozen);ok(await old.join());const modern=upgrade(w,old);
  modern.change(s=>s.theme='midnight');ok(await modern.sync('save'));const revision=w.stored().revision;
  for(let i=0;i<3;i++){await old.sync();ok(await modern.sync());assert.equal(modern.settings().theme,'midnight');assert.equal(w.stored().values.theme,'midnight');assert.equal(w.stored().revision,revision);}
  assert.equal((await modern.store.listOutbox()).length,0);assert.equal((await modern.conflicts()).length,0);
 });
 test(`${app}: updating reader capability cannot grant foreign Account outbox authority`,async t=>{
  const w=world(app);t.after(()=>w.close());let d=device(w,'published',undefined,frozen);ok(await d.join());d.change(s=>s.theme='midnight');await d.sync();const [p]=await d.store.listOutbox();
  await d.store.putOutbox({...p,authorityContext:{accountId:'foreign-account'}});const before=w.stored();d=upgrade(w,d);await d.sync();assert.deepEqual(w.stored(),before);assert.equal((await d.store.listOutbox()).length,1);assert.equal((await d.store.listOutbox())[0].terminalError,'legacy_outbox_needs_migration');
 });
 test(`${app}: genuine revision advance invalidates the saved intent, never treated as projection-only`,async t=>{
  const w=world(app);t.after(()=>w.close());let d=device(w,'published',undefined,frozen);ok(await d.join());const writer=w.rawWriter(w.addDevice());
  ok(await writer.put({...w.stored().values,theme:'midnight'},['settings_theme_v2']));d.change(s=>s.theme='midnight');await d.sync();const c=(await d.conflicts())[0];await d.runtime.resolveConflict(c.id,'merged',{fieldChoices:{'/theme':'local'}});
  ok(await writer.put({...w.stored().values,[d.item.other.field]:d.item.other.to},['settings_theme_v2']));d=upgrade(w,d);const r=await d.runtime.resolveConflict(c.id,'merged',{fieldChoices:{'/theme':'local'}});assert.equal(r.code,'local_changed_during_resolution');assert.equal(w.stored().values[d.item.other.field],d.item.other.to);assert.equal((await d.conflicts()).length,1);
  ok(await d.runtime.resolveConflict(c.id,'merged',{fieldChoices:{'/theme':'local'}}));ok(await d.sync());assert.equal(w.stored().values[d.item.other.field],d.item.other.to);
 });
}
for(const app of ['pitch','fretboard','rhythm'])test(`${app}: first migration with saved Midnight resumes the existing migration Outbox after update`,async t=>{
 const w=world(app);t.after(()=>w.close());let d=device(w,'published',undefined,frozen);d.change(s=>s.theme='midnight');await d.join();
 const p=await d.store.listOutbox();assert.ok(p.some(o=>o.terminalError==='settings_theme_upgrade_required'));assert.equal(w.stored(),null);const cursor=await d.store.readMeta('cursor');d=upgrade(w,d);assert.equal(await d.store.readMeta('cursor'),cursor);
 ok(await d.runtime.initializeDataset());ok(await d.sync());assert.equal(w.stored().values.theme,'midnight');assert.equal((await d.store.listOutbox()).length,0);assert.equal((await d.conflicts()).length,0);
});
