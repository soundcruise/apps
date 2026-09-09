import test from 'node:test';
import assert from 'node:assert/strict';
import { canCreateMyApp, checkMyAppsCreation } from './my-apps-capabilities.js';
import { getCapabilities } from './cruise-port-capabilities.js?v=0.26.0';
import { createMyApp, loadMyApps, saveMyApps, MY_APPS_LIMITS, MY_APPS_SCHEMA_VERSION } from './my-apps-store.js?v=0.24.0';
import { createMyAppEntry, updateMyAppEntry } from './my-apps-icon-workflow.js';
import { commitGearPhotoChange } from './gear-photo-workflow.js';

const standard = getCapabilities('standard'), pro = getCapabilities('pro');
const values = { name: 'QA', url: 'https://example.com/' };
const items = Array.from({ length: 7 }, () => createMyApp(values, []).item);
const storageFor = items => {
    let value = JSON.stringify({ version: 6, items });
    return { getItem: () => value, setItem: (k, v) => { value = v; } };
};
test('My Apps creation-only policy preserves 100 technical limit and v6', () => {
    assert.equal(MY_APPS_LIMITS.items, 100); assert.equal(MY_APPS_SCHEMA_VERSION, 6);
    for (let n = 0; n <= 7; n++) {
        assert.equal(canCreateMyApp(items.slice(0, n), standard), n < 5);
        assert.equal(canCreateMyApp(items.slice(0, n), pro), true);
    }
    assert.equal(canCreateMyApp(Array(100), pro), false);
    const s = storageFor(items); assert.equal(loadMyApps(s).items.length, 7);
    assert.equal(saveMyApps(items, s).ok, true);
});
test('latest creation check does not accept stale editor snapshot', async () => {
    const s = storageFor(items.slice(0, 4)); const old = loadMyApps(s).items;
    s.setItem('', JSON.stringify({ version: 6, items: items.slice(0, 5) }));
    assert.equal(checkMyAppsCreation(s, standard).allowed, false);
    assert.equal((await createMyAppEntry({ items: old, values, storage: s })).reason, 'creation-blocked');
    assert.equal(saveMyApps(old, s).ok, false);
    assert.equal(loadMyApps(s).items.length, 5);
});
test('latest unavailable storage fails closed', () => {
    assert.equal(checkMyAppsCreation({ getItem() { throw Error(); } }, standard).allowed, false);
});
test('custom image update rejects writes, allows keep and remove in Standard', async () => {
    const s = storageFor(items); loadMyApps(s);
    assert.equal((await updateMyAppEntry({items, id: items[0].id, values, storage:s, iconAction:'readjust'})).reason, 'pro-required');
    for (const iconAction of ['keep', 'remove']) assert.equal((await updateMyAppEntry({items, id:items[0].id, values, storage:s, iconAction})).ok, true);
});
test('gear capability change rolls back only newly saved images before metadata', async () => {
    let writes = 0, checks = 0, persisted = false; const deleted = [];
    const result = await commitGearPhotoChange({
        photoStore: { savePhoto: async () => ({ ok:true, record:{id:`new-${++writes}`} }), deletePhoto: async id => {deleted.push(id); return {ok:true};} },
        pending: {sourceBlob:new Blob(['s']),finalBlob:new Blob(['f']),crop:{x:0,y:0,size:1}},
        previousReferences:{photoId:'old'}, buildItems:()=>[], persist:()=>{persisted=true;return {ok:true};}, canWrite:()=>++checks===1
    });
    assert.equal(result.reason,'pro-required');assert.equal(persisted,false);assert.deepEqual(deleted,['new-2','new-1']);
});
