import { PortAssetSync } from './port-asset-sync.js';
import { datasetFixture } from './tests/dataset-fixture.mjs';
import { validatePortLocalCollections } from './port-sync-local-validation.js';
import { loadGearCategories, saveGearCategories, DEFAULT_GEAR_CATEGORIES } from './gear-category-store.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { PortDatasetRepository, PORT_DATASET_META, PORT_DELETE_INTENTS } from './port-dataset-repository.js';
import { registerPortRepository } from './port-dataset-storage.js?v=1.28.1';
import { loadMetronomeSettings, saveMetronomeSettings, METRONOME_DEFAULTS } from './metronome-store.js';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './settings-store.js';
const settingKey = 'cruisePort.settings', presetKey = 'cruisePort.metronomePresets';
function storage(values = {}) {
    const data = new Map(Object.entries(values));
    return { data, fail: () => false, getItem: key => data.get(key) ?? null,
        setItem(key, value) { if (this.fail(key, value)) throw Error('disk-full'); data.set(key, String(value)); },
        removeItem(key) { if (this.fail(key, null)) throw Error('disk-full'); data.delete(key); } };
}
function locks() {
    let pending = Promise.resolve();
    return { request(name, options, action) { const next = pending.then(action); pending = next.catch(() => {}); return next; } };
}
function setup(values = {}, sharedLocks = locks()) {
    const target = storage(values), notifications = [];
    const repo = new PortDatasetRepository({ storage: target, locks: sharedLocks, token: () => webcrypto.randomUUID(), notify: e => notifications.push(e) });
    registerPortRepository(target, repo);
    return { repo, target, notifications };
}
const settings = extra => JSON.stringify({ ...DEFAULT_SETTINGS, ...extra });
async function write(repo, key, value, source = 'local', revision) {
    const base = await repo.readDatasetState();
    return repo.runWrite({ expectedRevision: revision ?? base.revision, source }, tx => { tx.setItem(key, JSON.stringify(value)); return { ok: true }; });
}
function adapter(target, repo) {
    const context = { crypto: webcrypto, TextEncoder, URL, localStorage: target,
        SoundCruisePortSync: { usesPortRepository: s => s === target && !!repo, portRepository: () => repo } };
    vm.runInNewContext(fs.readFileSync(new URL('./port-sync-adapter.js', import.meta.url), 'utf8'), context);
    return context.SoundCruisePortSync;
}
test('repository read is stable and does not adopt or rewrite storage', async () => {
    const { repo, target } = setup({ [settingKey]: settings() });
    const a = await repo.readDatasetState(), b = await repo.readDatasetState();
    assert.equal(a.revision, b.revision); assert.equal(target.data.size, 1);
});
test('coordinated write changes opaque revision and publishes one notification', async () => {
    const {repo,notifications} = setup();const base=await repo.readDatasetState();
    const result=await write(repo, settingKey, DEFAULT_SETTINGS);
    assert.equal(result.status,'committed');assert.notEqual(result.revision,base.revision);assert.equal(notifications.length,1);
});
test('stale CAS cannot overwrite a newer coordinated write', async () => {
    const {repo,target}=setup();const base=await repo.readDatasetState();await write(repo,settingKey,DEFAULT_SETTINGS);
    const result=await write(repo,settingKey,{...DEFAULT_SETTINGS,theme:'light'},'local',base.revision);
    assert.equal(result.reason,'stale');assert.equal(JSON.parse(target.getItem(settingKey)).theme,undefined);
});
test('two repository instances serialize simultaneous writers on the same lock', async () => {
    const shared=locks(),{repo,target}=setup({},shared);const other=new PortDatasetRepository({storage:target,locks:shared});
    const base=await repo.readDatasetState();const results=await Promise.all([write(repo,settingKey,DEFAULT_SETTINGS,'local',base.revision),write(other,settingKey,{...DEFAULT_SETTINGS,theme:'light'},'local',base.revision)]);
    assert.deepEqual(results.map(r=>r.ok),[true,false]);assert.equal(results[1].reason,'stale');
});
test('Web Locks unavailable reports read-only capability and rejects writes', async()=>{
    const {repo,target}=setup({},null);assert.equal((await repo.readDatasetState()).sharedWriteCapable,false);
    assert.equal((await write(repo,settingKey,DEFAULT_SETTINGS)).reason,'locks-unavailable');assert.equal(target.data.size,0);
});
test('writer exception does not publish staged writes',async()=>{
    const {repo,target,notifications}=setup();const base=await repo.readDatasetState();
    const result=await repo.runWrite({expectedRevision:base.revision},tx=>{tx.setItem(settingKey,settings());throw Error('writer');});
    assert.equal(result.ok,false);assert.equal(target.data.size,0);assert.equal(notifications.length,0);
});
test('notification exceptions cannot misreport a committed write',async()=>{
    const {repo}=setup();repo.subscribe(()=>{throw Error('observer');});assert.equal((await write(repo,settingKey,DEFAULT_SETTINGS)).ok,true);
});
test('incident A: future Metronome load then ordinary BPM save preserves all original bytes',async()=>{
    const raw=JSON.stringify({...METRONOME_DEFAULTS,version:99,future:{keep:true}});const {target}=setup({'cruisePort.metronome':raw});
    assert.equal(loadMetronomeSettings(target).readOnly,true);
    assert.equal((await saveMetronomeSettings({...METRONOME_DEFAULTS,bpm:137},target)).reason,'forward-incompatible');
    assert.equal(target.getItem('cruisePort.metronome'),raw);
});
test('future settings schema is read-only and refuses default overwrite',async()=>{
    const raw=settings({version:99});const {target}=setup({[settingKey]:raw});loadSettings(target);
    assert.equal((await saveSettings(DEFAULT_SETTINGS,target)).ok,false);assert.equal(target.getItem(settingKey),raw);
});
test('incident B: normal settings save preserves unknown nested fields',async()=>{
    const unknown={nested:[1,{meaning:'retain'}]};const {target}=setup({[settingKey]:settings({future:unknown})});
    const loaded=loadSettings(target);assert.equal((await saveSettings({...loaded.settings,theme:'gray'},target)).ok,true);
    assert.deepEqual(JSON.parse(target.getItem(settingKey)).future,unknown);
});
test('unsafe unknown property blocks writes without normalization',async()=>{
    const raw='{"version":3,"__proto__":{"future":1}}';const {target}=setup({[settingKey]:raw});
    assert.equal((await saveSettings(DEFAULT_SETTINGS,target)).ok,false);assert.equal(target.getItem(settingKey),raw);
});
test('legacy migration read uses a private copy and writes no data',()=>{
    const raw=JSON.stringify({...METRONOME_DEFAULTS,version:2,sound:'drum'});const {target}=setup({'cruisePort.metronome':raw});
    loadMetronomeSettings(target);assert.equal(target.getItem('cruisePort.metronome'),raw);assert.equal(target.getItem(PORT_DATASET_META),null);
});
test('incident C: Metronome-only partial apply is rejected before any singleton or collection changes',async()=>{
    const {repo,target}=setup({[settingKey]:settings(),[presetKey]:'{"version":1,"items":[]}', 'cruisePort.metronome': JSON.stringify(METRONOME_DEFAULTS)});const api=adapter(target,repo),before=[...target.data];
    const partial = { schemaVersion: 1, records: api.readLocalSnapshot(target).records.filter(record => record.recordType === 'metronome_settings') };
    assert.equal(partial.records.length, 1);
    await assert.rejects(api.applyRemoteSnapshot(target,partial),/partial_snapshot/);
    assert.deepEqual([...target.data],before);
});
test('full capture/apply/capture preserves unrelated singleton, collection order and asset reference',async()=>{
    const values = datasetFixture();
    const { repo, target } = setup(values), api = adapter(target, repo);
    api.validateLocalStorage = validatePortLocalCollections;
    assert.equal(validatePortLocalCollections(target), true);
    const before = api.readLocalSnapshot(target);
    assert.equal(before.records.some(record => record.payload.value?.asset?.final?.assetId === 'asset-fixture'), true);
    await api.applyRemoteSnapshot(target, before);
    assert.equal(validatePortLocalCollections(target), true);
    const canonical = snapshot => JSON.parse(JSON.stringify({ ...snapshot, records: [...snapshot.records].sort((a,b) => (a.recordType+'/'+a.recordId).localeCompare(b.recordType+'/'+b.recordId)) }));
    assert.deepEqual(canonical(api.readLocalSnapshot(target)), canonical(before));
    assert.deepEqual(JSON.parse(target.getItem(settingKey)).futurePreference, { retained: true });
});
test('filtered full wrapper is rejected by its record inventory',async()=>{
    const {repo,target}=setup({[settingKey]:settings(),'cruisePort.metronome':JSON.stringify(METRONOME_DEFAULTS)});const api=adapter(target,repo),full=api.readLocalSnapshot(target);
    full.records=full.records.filter(r=>r.recordType==='metronome_settings');
    await assert.rejects(api.applyRemoteSnapshot(target,full),/partial_snapshot/);
});
test('incident D: unknown preset envelope blocks capture and apply instead of silently dropping metadata',async()=>{
    const raw=JSON.stringify({version:1,items:[],future:{keep:true}});const {repo,target}=setup({[presetKey]:raw});const api=adapter(target,repo);
    assert.throws(()=>api.readLocalSnapshot(target),/forward_incompatible/);
    await assert.rejects(api.applyRemoteSnapshot(target,api.fullSnapshot([])),/forward_incompatible/);
    assert.equal(target.getItem(presetKey),raw);
});
const preset = id => ({id,name:id});
async function deletedFixture() {
    const state=setup({[presetKey]:JSON.stringify({version:1,items:[preset('p')]})});
    assert.equal((await write(state.repo,presetKey,{version:1,items:[]})).ok,true);
    return state;
}
test('delete commits removal and durable generation-tagged intent together',async()=>{
    const {target}=await deletedFixture();assert.deepEqual(JSON.parse(target.getItem(presetKey)).items,[]);
    assert.equal(typeof JSON.parse(target.getItem(PORT_DELETE_INTENTS))['metronome_preset/p'].generation,'string');
});
test('intent persistence failure rolls the local removal back',async()=>{
    const raw=JSON.stringify({version:1,items:[preset('p')]});const {repo,target}=setup({[presetKey]:raw});let once=true;
    target.fail=key=>key===PORT_DELETE_INTENTS&&once&&(once=false,true);
    assert.equal((await write(repo,presetKey,{version:1,items:[]})).status,'rolled-back');assert.equal(target.getItem(presetKey),raw);
});
test('offline delete and reload retain identical retry identity',async()=>{
    const {target}=await deletedFixture();const raw=target.getItem(PORT_DELETE_INTENTS);const restarted=new PortDatasetRepository({storage:target,locks:locks()});
    assert.equal((await restarted.readDatasetState()).values[PORT_DELETE_INTENTS],raw);
});
test('delete then recreate clears intent and an old acknowledgement cannot remove the recreated item',async()=>{
    const {repo,target}=await deletedFixture();const generation=JSON.parse(target.getItem(PORT_DELETE_INTENTS))['metronome_preset/p'].generation;
    await write(repo,presetKey,{version:1,items:[preset('p')]});const base=await repo.readDatasetState();
    assert.equal((await repo.acknowledgeDelete('metronome_preset/p',generation,base.revision)).matched,false);
    assert.equal(JSON.parse(target.getItem(presetKey)).items.length,1);
});
test('delete/edit stale base cannot silently resurrect an item',async()=>{
    const {repo,target}=setup({[presetKey]:JSON.stringify({version:1,items:[preset('p')]})});const base=await repo.readDatasetState();
    await write(repo,presetKey,{version:1,items:[]});assert.equal((await write(repo,presetKey,{version:1,items:[preset('p')]},'local',base.revision)).reason,'stale');
});
test('old ack cannot clear a newer delete generation',async()=>{
    const {repo,target}=await deletedFixture();const old=JSON.parse(target.getItem(PORT_DELETE_INTENTS))['metronome_preset/p'].generation;
    await write(repo,presetKey,{version:1,items:[preset('p')]});await write(repo,presetKey,{version:1,items:[]});
    const base=await repo.readDatasetState();assert.equal((await repo.acknowledgeDelete('metronome_preset/p',old,base.revision)).matched,false);
    assert.notEqual(JSON.parse(target.getItem(PORT_DELETE_INTENTS))['metronome_preset/p'].generation,old);
});
test('matching ack clears once; duplicate ack is harmless',async()=>{
    const {repo,target}=await deletedFixture();const generation=JSON.parse(target.getItem(PORT_DELETE_INTENTS))['metronome_preset/p'].generation;
    assert.equal((await repo.acknowledgeDelete('metronome_preset/p',generation,(await repo.readDatasetState()).revision)).matched,true);
    assert.equal((await repo.acknowledgeDelete('metronome_preset/p',generation,(await repo.readDatasetState()).revision)).matched,false);
});
test('legacy boolean delete intent is retained when ack has no generation',async()=>{
    const {repo,target}=setup({[PORT_DELETE_INTENTS]:'{"metronome_preset/p":true}'});
    assert.equal((await repo.acknowledgeDelete('metronome_preset/p',undefined,(await repo.readDatasetState()).revision)).matched,false);
    assert.equal(target.getItem(PORT_DELETE_INTENTS),'{"metronome_preset/p":true}');
});
test('partial multi-key write failure rolls back original bytes and revision',async()=>{
    const {repo,target}=setup({[settingKey]:settings()});const before=await repo.readDatasetState();let failed=false;
    target.fail=key=>key==='cruisePort.metronome'&&!failed&&(failed=true);
    const result=await repo.runWrite({expectedRevision:before.revision},tx=>{tx.setItem(settingKey,settings({theme:'light'}));tx.setItem('cruisePort.metronome',JSON.stringify(METRONOME_DEFAULTS));});
    assert.equal(result.status,'rolled-back');assert.equal((await repo.readDatasetState()).revision,before.revision);
});
test('rollback failure is recovery-required and survives a new repository instance',async()=>{
    const {repo,target}=setup({[settingKey]:settings()});const before=await repo.readDatasetState();let count=0;
    target.fail=key=>key!==PORT_DATASET_META&&++count>=2;
    const result=await repo.runWrite({expectedRevision:before.revision},tx=>{tx.setItem(settingKey,settings({theme:'gray'}));tx.setItem('cruisePort.metronome',JSON.stringify(METRONOME_DEFAULTS));});
    assert.equal(result.status,'recovery-required');target.fail=()=>false;
    await assert.rejects(new PortDatasetRepository({storage:target,locks:locks()}).readDatasetState(),/recovery-required/);
});
test('Sync apply uses the repository lock and respects a stale local snapshot',async()=>{
    const {repo,target}=setup({[settingKey]:settings()}),api=adapter(target,repo),base=api.readLocalSnapshot(target);
    await write(repo,settingKey,{...DEFAULT_SETTINGS,theme:'gray'});
    await assert.rejects(api.applyRemoteSnapshot(target,base,[],base),/local_changed_during_apply/);
    assert.equal(JSON.parse(target.getItem(settingKey)).theme,'gray');
});
test('old rollback revision cannot overwrite a newly committed local change',async()=>{
    const {repo,target}=setup({[settingKey]:settings()}),old=await repo.readDatasetState();await write(repo,settingKey,{...DEFAULT_SETTINGS,theme:'light'});
    assert.equal((await repo.runWrite({expectedRevision:old.revision,source:'rollback'},tx=>tx.setItem(settingKey,old.values[settingKey]))).reason,'stale');
    assert.equal(JSON.parse(target.getItem(settingKey)).theme,'light');
});
test('unmanaged writes are rejected before reaching persistent storage',async()=>{
    const {repo,target}=setup(),base=await repo.readDatasetState();const result=await repo.runWrite({expectedRevision:base.revision},tx=>tx.setItem('account-credential','forbidden'));
    assert.equal(result.reason,'unmanaged-key');assert.equal(target.data.size,0);
});
test('unexpected repository protocol refuses writes without replacing metadata',async()=>{
    const {repo,target}=setup({[PORT_DATASET_META]:'{"protocol":99}'});
    assert.equal((await repo.runWrite({expectedRevision:'old'},()=>{})).reason,'protocol-mismatch');assert.equal(target.getItem(PORT_DATASET_META),'{"protocol":99}');
});

test('ordinary store save detects ABA even when raw data returns to its original value', async () => {
    const { repo, target } = setup({ [settingKey]: settings({ theme: 'dark' }) });
    const loaded = loadSettings(target);
    await write(repo, settingKey, { ...DEFAULT_SETTINGS, theme: 'light' });
    await write(repo, settingKey, { ...DEFAULT_SETTINGS, theme: 'dark' });
    assert.equal((await saveSettings({ ...loaded.settings, theme: 'gray' }, target)).reason, 'stale');
    assert.equal(JSON.parse(target.getItem(settingKey)).theme, 'dark');
});
test('failed record validation blocks saving fallback defaults over unknown category fields', async () => {
    const key = 'cruisePort.gearCategories';
    const raw = JSON.stringify({ version: 1, categories: [{ id: 'future', name: 'Future', meaning: 'keep' }] });
    const { target } = setup({ [key]: raw });
    assert.equal(loadGearCategories([], target).ok, false);
    assert.equal((await saveGearCategories(DEFAULT_GEAR_CATEGORIES, target)).reason, 'forward-incompatible');
    assert.equal(target.getItem(key), raw);
});
test('asset attachment delete and recreate coordinate owner-set intents and old ack', async () => {
    const key = 'cruisePort.syncAssetMetadata';
    const metadata = { version: 4, attachments: { file: { practiceId: 'menu' } } };
    const { repo, target } = setup({ [key]: JSON.stringify(metadata) });
    await write(repo, key, { ...metadata, attachments: {} });
    const intents = JSON.parse(target.getItem(PORT_DELETE_INTENTS));
    assert.equal(typeof intents['practice_attachment/file'].generation, 'string');
    assert.equal(typeof intents['practice_attachment_set/menu'].generation, 'string');
    await write(repo, key, metadata);
    assert.equal((await repo.acknowledgeDelete('practice_attachment/file', intents['practice_attachment/file'].generation, (await repo.readDatasetState()).revision)).matched, false);
    assert.equal(target.getItem(PORT_DELETE_INTENTS), null);
});
test('Sync capture refuses a pending journal instead of reading a partially written dataset', () => {
    const { repo, target } = setup({ [PORT_DATASET_META]: JSON.stringify({ protocol: 1, pending: { before: {} } }) });
    assert.throws(() => adapter(target, repo).readLocalSnapshot(target), /recovery-required/);
});
test('store keeps its own committed base when another writer finishes before its continuation', async () => {
    const { repo, target } = setup({ [settingKey]: settings({ theme: 'dark' }) });
    loadSettings(target);
    const original = repo.runWrite.bind(repo);
    repo.runWrite = async (...args) => {
        const result = await original(...args);
        repo.runWrite = original;
        await write(repo, settingKey, { ...DEFAULT_SETTINGS, theme: 'light' });
        return result;
    };
    assert.equal((await saveSettings({ ...DEFAULT_SETTINGS, theme: 'gray' }, target)).ok, true);
    assert.equal((await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, target)).reason, 'stale');
    assert.equal(JSON.parse(target.getItem(settingKey)).theme, 'light');
});

test('PortAssetSync attachment removal commits metadata and journal together through the repository', async () => {
    const key = 'cruisePort.syncAssetMetadata';
    const raw = JSON.stringify({ version: 4, gear: {}, myApps: {}, attachments: { file: {
        practiceId: 'menu', published: { availability: 'available', asset: { assetId: 'asset-1' } }
    } }, releaseQueue: [], discardQueue: [], referencePending: false });
    const { target } = setup({ [key]: raw });
    const assets = new PortAssetSync({ storage: target, canSync: () => false });
    assert.equal(await assets.removePracticeAttachment({ logicalId: 'file' }), true);
    const metadata = JSON.parse(target.getItem(key));
    assert.deepEqual(metadata.attachments, {});
    assert.deepEqual(metadata.releaseQueue, ['asset-1']);
    assert.equal(typeof JSON.parse(target.getItem(PORT_DELETE_INTENTS))['practice_attachment/file'].generation, 'string');
});
test('PortAssetSync intent failure rolls back metadata and rejects the removal', async () => {
    const key = 'cruisePort.syncAssetMetadata';
    const raw = JSON.stringify({ version: 4, attachments: { file: { practiceId: 'menu' } } });
    const { target } = setup({ [key]: raw });
    let once = true;
    target.fail = key => key === PORT_DELETE_INTENTS && once && (once = false, true);
    const assets = new PortAssetSync({ storage: target, canSync: () => false });
    await assert.rejects(assets.removePracticeAttachment({ logicalId: 'file' }), /write-failed/);
    assert.equal(target.getItem(key), raw);
    assert.equal(target.getItem(PORT_DELETE_INTENTS), null);
});

test('unknown asset metadata shape cannot be normalized to an empty dictionary', async () => {
    const key = 'cruisePort.syncAssetMetadata';
    const raw = JSON.stringify({ version: 4, attachments: ['unknown future attachment'] });
    const { repo, target } = setup({ [key]: raw });
    const result = await repo.runWrite({ expectedRevision: 'irrelevant' }, tx => tx.setItem(key, '{"version":4,"attachments":{}}'));
    assert.equal(result.reason, 'forward-incompatible');
    assert.equal(target.getItem(key), raw);
});

test('Sync/ack publication fences an Account generation change while waiting for the dataset lock',async()=>{
 const {repo,target}=setup();await write(repo,settingKey,DEFAULT_SETTINGS);const base=await repo.readDatasetState();const raw=target.getItem(settingKey);let current=true;
 const result=await repo.runWrite({expectedRevision:base.revision,source:'sync',assertCurrent:async()=>{if(!current)throw Object.assign(Error('account_generation_changed'),{code:'account_generation_changed'});}},async draft=>{draft.setItem(settingKey,settings({theme:'gray'}));current=false;return {ok:true};});
 assert.equal(result.ok,false);assert.equal(result.reason,'account_generation_changed');assert.equal(target.getItem(settingKey),raw);
 const ack=await repo.acknowledgeDelete('metronome_preset/old','old-generation',base.revision,()=>{throw Object.assign(Error('account_generation_changed'),{code:'account_generation_changed'});});assert.equal(ack.ok,false);assert.equal(target.getItem(settingKey),raw);
});

test('local image removal retires metadata in the same dataset publication and rejects stale hydrate',async()=>{
 const key='cruisePort.gearList',metaKey='cruisePort.syncAssetMetadata',item={id:'visual',photoId:'old-final',photoSourceId:'old-source',photoCrop:{x:0,y:0,size:1}},entry={published:{availability:'available',final:{assetId:'remote-final'},source:{assetId:'remote-source'}},binding:{final:{assetId:'remote-final',localId:'old-final'},source:{assetId:'remote-source',localId:'old-source'}},pending:null};
 const f=setup({[key]:JSON.stringify({version:5,items:[item]}),[metaKey]:JSON.stringify({version:4,gear:{visual:entry},myApps:{},attachments:{},releaseQueue:[],discardQueue:[]})});
 assert.equal((await write(f.repo,key,{version:5,items:[{...item,photoId:null,photoSourceId:null,photoCrop:null}]})).ok,true);const meta=JSON.parse(f.target.getItem(metaKey));assert.equal(meta.gear.visual.published,null);assert.equal(meta.gear.visual.binding,null);assert.deepEqual(meta.releaseQueue,['remote-final','remote-source']);assert(f.notifications[0].keys.includes(key)&&f.notifications[0].keys.includes(metaKey));
 const sync=new PortAssetSync({storage:f.target,controller:{runtime:{assertCurrentAsync:async()=>{}}}});assert.equal(await sync.commitHydratedPair('gear','visual',entry,entry,{finalId:null,sourceId:null,crop:null},{finalId:'stale-final',sourceId:'stale-source',crop:item.photoCrop}),false);assert.equal(JSON.parse(f.target.getItem(key)).items[0].photoId,null);
});
test('sync cache absence preserves remote binding and never queues a local image deletion',async()=>{
 const key='cruisePort.gearList',mk='cruisePort.syncAssetMetadata',item={id:'cache',photoId:'cached',photoSourceId:'source',photoCrop:{x:0,y:0,size:1}},published={availability:'available',final:{assetId:'cloud'}};const f=setup({[key]:JSON.stringify({version:5,items:[item]}),[mk]:JSON.stringify({version:4,gear:{cache:{published}},myApps:{},attachments:{},releaseQueue:[],discardQueue:[]})});assert.equal((await write(f.repo,key,{version:5,items:[{...item,photoId:null,photoSourceId:null,photoCrop:null}]},'sync')).ok,true);assert.deepEqual(JSON.parse(f.target.getItem(mk)).gear.cache.published,published);assert.deepEqual(JSON.parse(f.target.getItem(mk)).releaseQueue,[]);
});
