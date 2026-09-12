'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var webcrypto = require('crypto').webcrypto;

var root = path.join(__dirname, '..');
var coreSource = fs.readFileSync(path.join(root, 'js/sync/sync-core.js'), 'utf8');
var mergeSource = fs.readFileSync(path.join(root, 'js/sync/sync-merge.js'), 'utf8');

function loadMerge() {
    var window = { crypto: webcrypto };
    var context = {
        window: window, crypto: webcrypto, TextEncoder: TextEncoder,
        JSON: JSON, Object: Object, Number: Number, Uint8Array: Uint8Array,
        Date: Date, Promise: Promise
    };
    vm.createContext(context);
    vm.runInContext(coreSource, context, { filename: 'sync-core.js' });
    vm.runInContext(mergeSource, context, { filename: 'sync-merge.js' });
    return window.ChordCruiseSync;
}

function record(type, id, payload) {
    return { recordType: type, recordId: id, schemaVersion: 1, payload: payload };
}

function chord(id, folderId, name, extra) {
    return record('chord', id, Object.assign({
        id: id, folderId: folderId, chordName: name, notes: [], intervals: [],
        shape: 'open', rootPc: 0, qualityKey: 'major', fretRange: { min: 0, max: 3 }
    }, extra || {}));
}

function folder(id, name) {
    return record('folder', id, { id: id, name: name, colorKey: 'navy', order: 0 });
}

function order(folderIds, entries) {
    return record('library_order', 'default', { version: 1, folderIds: folderIds, entryIdsByFolder: entries });
}

async function snapshot(sync, records) {
    return sync.merge.buildSnapshot(records, webcrypto);
}

function cloudOf(local, cursor) {
    return {
        ok: true,
        appId: 'chord',
        datasetState: 'ready',
        schemaVersion: 1,
        recordCount: local.counts.total,
        manifestHash: local.manifestHash,
        cursor: cursor || 'scc1.MQ',
        records: local.records.map(function (item, index) {
            return Object.assign({}, JSON.parse(JSON.stringify(item)), {
                revision: index + 1,
                deletedAt: null,
                changeSeq: index + 1
            });
        })
    };
}

(async function () {
    var sync = loadMerge();
    var defaults = await snapshot(sync, [
        record('settings', 'default', sync.merge.DEFAULT_SETTINGS),
        record('folder', 'folder_uncategorized', {
            id: 'folder_uncategorized', name: '未分類', builtin: false,
            colorKey: 'black-leather', order: 0, createdAt: 'one', updatedAt: 'two'
        }),
        order(['folder_uncategorized'], { folder_uncategorized: [] })
    ]);
    assert.strictEqual(sync.merge.hasMeaningfulLocalData(defaults), false, 'built-in defaults are not user data');
    var changedSettings = await snapshot(sync, [record('settings', 'default', Object.assign({}, sync.merge.DEFAULT_SETTINGS, { selectedKey: 7 }))]);
    assert.strictEqual(sync.merge.hasMeaningfulLocalData(changedSettings), true, 'changed settings are meaningful');

    var remote = await snapshot(sync, [
        folder('folder-cloud', 'Cloud'),
        chord('cloud-c', 'folder-cloud', 'Cloud C'),
        order(['folder-cloud'], { 'folder-cloud': ['cloud-c'] })
    ]);
    var validated = await sync.merge.validateCloudSnapshot(cloudOf(remote), webcrypto);
    assert.strictEqual(validated.manifestHash, remote.manifestHash, 'cloud manifest and every payload hash are revalidated');
    var tampered = cloudOf(remote);
    tampered.records[0].payload.name = 'tampered';
    await assert.rejects(sync.merge.validateCloudSnapshot(tampered, webcrypto), /hash mismatch/);

    var hydrate = await sync.merge.planMerge({
        local: defaults, cloud: validated, shadow: [], sessionId: 'hydrate'
    }, webcrypto);
    assert.strictEqual(hydrate.localState, 'empty');
    assert.strictEqual(hydrate.conflicts.length, 0, 'empty device safely hydrates without false default conflicts');
    assert(hydrate.finalSnapshot.records.some(function (item) { return item.recordId === 'cloud-c'; }));

    var localIndependent = await snapshot(sync, [
        folder('folder-local', 'Local'), chord('local-c', 'folder-local', 'Local C'),
        order(['folder-local'], { 'folder-local': ['local-c'] })
    ]);
    var independent = await sync.merge.planMerge({
        local: localIndependent, cloud: validated, shadow: [], sessionId: 'independent'
    }, webcrypto);
    assert.strictEqual(independent.conflicts.length, 0);
    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(independent.finalSnapshot.records.filter(function (item) { return item.recordType === 'chord'; }).map(function (item) { return item.recordId; }).sort())),
        ['cloud-c', 'local-c'],
        'independent records from two devices are preserved'
    );

    var collidingLocal = await snapshot(sync, [
        folder('same-folder', 'Local Folder'), chord('local-ref', 'same-folder', 'Local Ref'),
        order(['same-folder'], { 'same-folder': ['local-ref'] })
    ]);
    var collidingCloudBase = await snapshot(sync, [
        folder('same-folder', 'Cloud Folder'), chord('cloud-ref', 'same-folder', 'Cloud Ref'),
        order(['same-folder'], { 'same-folder': ['cloud-ref'] })
    ]);
    var collidingCloud = await sync.merge.validateCloudSnapshot(cloudOf(collidingCloudBase), webcrypto);
    var collision = await sync.merge.planMerge({
        local: collidingLocal, cloud: collidingCloud, shadow: [], sessionId: 'collision'
    }, webcrypto);
    assert.strictEqual(collision.conflicts.length, 0);
    assert.strictEqual(collision.idRemaps.length, 1, 'custom folder ID collision is deterministically remapped');
    var remapped = collision.idRemaps[0].newId;
    var localRef = collision.finalSnapshot.records.find(function (item) { return item.recordId === 'local-ref'; });
    assert.strictEqual(localRef.payload.folderId, remapped, 'Chord folder reference follows folder ID remap');
    assert(collision.finalSnapshot.records.find(function (item) { return item.recordId === remapped; }));
    assert(collision.finalSnapshot.records.find(function (item) { return item.recordType === 'library_order'; }).payload.folderIds.indexOf(remapped) !== -1);

    var duplicateLocal = await snapshot(sync, [folder('f', 'F'), chord('duplicate', 'f', 'Local Duplicate'), order(['f'], { f: ['duplicate'] })]);
    var duplicateCloudBase = await snapshot(sync, [folder('f', 'F'), chord('duplicate', 'f', 'Cloud Duplicate'), order(['f'], { f: ['duplicate'] })]);
    var duplicateCloud = await sync.merge.validateCloudSnapshot(cloudOf(duplicateCloudBase), webcrypto);
    var duplicatePreview = await sync.merge.planMerge({ local: duplicateLocal, cloud: duplicateCloud, shadow: [], sessionId: 'duplicate' }, webcrypto);
    var duplicateConflict = duplicatePreview.conflicts.find(function (item) { return item.recordKey === 'chord/duplicate'; });
    assert(duplicateConflict && duplicateConflict.choices.indexOf('both') !== -1, 'Chord conflict offers local/cloud/both');
    var keepLocalChoice = {}; keepLocalChoice[duplicateConflict.conflictId] = 'local';
    var keepLocal = await sync.merge.planMerge({
        local: duplicateLocal, cloud: duplicateCloud, shadow: [], choices: keepLocalChoice, sessionId: 'duplicate-local'
    }, webcrypto);
    assert.strictEqual(keepLocal.finalSnapshot.records.find(function (item) { return item.recordId === 'duplicate'; }).payload.chordName, 'Local Duplicate');
    var keepCloudChoice = {}; keepCloudChoice[duplicateConflict.conflictId] = 'cloud';
    var keepCloud = await sync.merge.planMerge({
        local: duplicateLocal, cloud: duplicateCloud, shadow: [], choices: keepCloudChoice, sessionId: 'duplicate-cloud'
    }, webcrypto);
    assert.strictEqual(keepCloud.finalSnapshot.records.find(function (item) { return item.recordId === 'duplicate'; }).payload.chordName, 'Cloud Duplicate');
    var keepBoth = {};
    keepBoth[duplicateConflict.conflictId] = 'both';
    var resolved = await sync.merge.planMerge({
        local: duplicateLocal, cloud: duplicateCloud, shadow: [], choices: keepBoth, sessionId: 'duplicate'
    }, webcrypto);
    assert.strictEqual(resolved.conflicts.length, 0);
    assert.strictEqual(resolved.finalSnapshot.records.filter(function (item) { return item.recordType === 'chord'; }).length, 2);
    var resolvedAgain = await sync.merge.planMerge({
        local: duplicateLocal, cloud: duplicateCloud, shadow: [], choices: keepBoth, sessionId: 'duplicate'
    }, webcrypto);
    assert.strictEqual(resolved.idRemaps[0].newId, resolvedAgain.idRemaps[0].newId, 'keep-both ID is stable across retry');

    var base = await snapshot(sync, [folder('f3', 'F3'), chord('three-way', 'f3', 'Base', { memo: 'base', notes: [{ string: 1, fret: 0 }] })]);
    var localThree = await snapshot(sync, [folder('f3', 'F3'), chord('three-way', 'f3', 'Base', { memo: 'local memo', notes: [{ string: 1, fret: 0 }], futureField: 'local-only' })]);
    var cloudThreeBase = await snapshot(sync, [folder('f3', 'F3'), chord('three-way', 'f3', 'Base', { memo: 'base', notes: [{ string: 1, fret: 2 }] })]);
    var cloudThree = await sync.merge.validateCloudSnapshot(cloudOf(cloudThreeBase), webcrypto);
    var shadow = base.records.map(function (item, index) {
        return Object.assign({}, JSON.parse(JSON.stringify(item)), { revision: index + 1, deletedAt: null });
    });
    var threeWay = await sync.merge.planMerge({ local: localThree, cloud: cloudThree, shadow: shadow, sessionId: 'three-way' }, webcrypto);
    assert.strictEqual(threeWay.conflicts.length, 0, 'independent 3-way fields merge automatically');
    var mergedChord = threeWay.finalSnapshot.records.find(function (item) { return item.recordId === 'three-way'; });
    assert.strictEqual(mergedChord.payload.memo, 'local memo');
    assert.strictEqual(mergedChord.payload.notes[0].fret, 2, 'atomic musical definition comes from one side');
    assert.strictEqual(mergedChord.payload.futureField, 'local-only', 'unknown one-sided fields survive');

    var unknownBase = await snapshot(sync, [folder('future-folder', 'Future'), chord('future', 'future-folder', 'Future', { futureField: 'base' })]);
    var unknownLocal = await snapshot(sync, [folder('future-folder', 'Future'), chord('future', 'future-folder', 'Future', { futureField: 'local' })]);
    var unknownCloudSnapshot = await snapshot(sync, [folder('future-folder', 'Future'), chord('future', 'future-folder', 'Future', { futureField: 'cloud' })]);
    var unknownConflictPlan = await sync.merge.planMerge({
        local: unknownLocal,
        cloud: await sync.merge.validateCloudSnapshot(cloudOf(unknownCloudSnapshot), webcrypto),
        shadow: unknownBase.records.map(function (item) { return Object.assign({}, cloneForTest(item), { revision: 1, deletedAt: null }); }),
        sessionId: 'unknown-conflict'
    }, webcrypto);
    assert(unknownConflictPlan.conflicts.some(function (item) { return item.fields.indexOf('futureField') !== -1; }), 'divergent unknown fields require a choice');

    var atomicLocal = await snapshot(sync, [folder('atomic-folder', 'Atomic'), chord('atomic', 'atomic-folder', 'Atomic', { notes: [{ string: 1, fret: 1 }] })]);
    var atomicCloudSnapshot = await snapshot(sync, [folder('atomic-folder', 'Atomic'), chord('atomic', 'atomic-folder', 'Atomic', { notes: [{ string: 1, fret: 2 }] })]);
    var atomicConflictPlan = await sync.merge.planMerge({
        local: atomicLocal,
        cloud: await sync.merge.validateCloudSnapshot(cloudOf(atomicCloudSnapshot), webcrypto),
        shadow: [],
        sessionId: 'atomic-conflict'
    }, webcrypto);
    assert(atomicConflictPlan.conflicts.some(function (item) { return item.fields.indexOf('chord_definition') !== -1; }), 'the musical definition is never mixed field-by-field');

    var orphanLocal = await snapshot(sync, [chord('orphan', 'missing-folder', 'Orphan')]);
    var orphanPlan = await sync.merge.planMerge({ local: orphanLocal, cloud: validated, shadow: [], sessionId: 'orphan' }, webcrypto);
    assert(orphanPlan.conflicts.some(function (item) { return item.kind === 'missing_folder_reference'; }), 'missing folder references block commit instead of dropping a Chord');
    assert.strictEqual(orphanPlan.finalSnapshot, null);

    var defaultSettings = sync.merge.DEFAULT_SETTINGS;
    var settingsBase = await snapshot(sync, [record('settings', 'default', defaultSettings)]);
    var settingsLocal = await snapshot(sync, [record('settings', 'default', Object.assign({}, defaultSettings, { selectedKey: 4 }))]);
    var settingsCloudBase = await snapshot(sync, [record('settings', 'default', Object.assign({}, defaultSettings, { scaleType: 'minor' }))]);
    var settingsCloud = await sync.merge.validateCloudSnapshot(cloudOf(settingsCloudBase), webcrypto);
    var settingsMerged = await sync.merge.planMerge({
        local: settingsLocal,
        cloud: settingsCloud,
        shadow: settingsBase.records.map(function (item) { return Object.assign({}, cloneForTest(item), { revision: 1, deletedAt: null }); }),
        sessionId: 'settings'
    }, webcrypto);
    assert.strictEqual(settingsMerged.conflicts.length, 0, 'independent settings fields merge');
    var mergedSettings = settingsMerged.finalSnapshot.records.find(function (item) { return item.recordType === 'settings'; }).payload;
    assert.strictEqual(mergedSettings.selectedKey, 4);
    assert.strictEqual(mergedSettings.scaleType, 'minor');

    var orderFolders = [folder('A', 'A'), folder('B', 'B'), folder('C', 'C')];
    var baseOrderSnapshot = await snapshot(sync, orderFolders.concat(order(['A', 'B', 'C'], { A: [], B: [], C: [] })));
    var localOrderSnapshot = await snapshot(sync, orderFolders.concat(order(['B', 'A', 'C'], { A: [], B: [], C: [] })));
    var cloudOrderSnapshot = await snapshot(sync, orderFolders.concat(order(['C', 'A', 'B'], { A: [], B: [], C: [] })));
    var orderConflictPlan = await sync.merge.planMerge({
        local: localOrderSnapshot,
        cloud: await sync.merge.validateCloudSnapshot(cloudOf(cloudOrderSnapshot), webcrypto),
        shadow: baseOrderSnapshot.records.map(function (item) { return Object.assign({}, cloneForTest(item), { revision: 1, deletedAt: null }); }),
        sessionId: 'order-conflict'
    }, webcrypto);
    assert(orderConflictPlan.conflicts.some(function (item) { return item.kind === 'order_order'; }), 'divergent order moves require a choice');

    var localEdited = await snapshot(sync, [folder('f3', 'F3'), chord('three-way', 'f3', 'Edited', { notes: [{ string: 1, fret: 0 }] })]);
    var tombstoneHash = await sync.core.hashSyncPayload('chord', 'three-way', null, 1, webcrypto);
    var cloudDeleted = {
        cursor: 'scc1.Mg', manifestHash: cloudThree.manifestHash, records: cloudThree.records.map(function (item) {
            if (item.recordId !== 'three-way') return item;
            return { recordType: 'chord', recordId: 'three-way', schemaVersion: 1, revision: 9, payload: null, payloadHash: tombstoneHash, deletedAt: 123 };
        })
    };
    var deleteEdit = await sync.merge.planMerge({ local: localEdited, cloud: cloudDeleted, shadow: shadow, sessionId: 'delete-edit' }, webcrypto);
    assert(deleteEdit.conflicts.some(function (item) { return item.kind === 'cloud_delete_local_edit'; }), 'delete/edit is never silently resolved');

    console.log('sync-pilot-p4: empty hydrate, merge planning, 3-way, remap, keep-both, and delete/edit safeguards passed');
}()).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});

function cloneForTest(value) { return JSON.parse(JSON.stringify(value)); }
