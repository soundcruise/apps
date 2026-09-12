(function (global) {
    'use strict';

    var sync = global.ChordCruiseSync || {};
    var core = sync.core;
    if (!core) throw new Error('Sound Cruise Sync core must load before the merge planner');

    var DEFAULT_SETTINGS = Object.freeze({
        selectedKey: 0,
        scaleType: 'major',
        chordToneMode: '3',
        fretboardDisplayMode: 'note',
        degreeNotationFormal: false,
        cagedTabAutoChange: true,
        chordNameSize: 'medium',
        fretNumberSize: 'medium',
        fretboardMarkerLabelSize: 'medium',
        fretNumberHighlightMode: 'all',
        highlightedFrets: [0, 3, 5, 7, 9, 12, 15, 17, 19, 21, 24],
        highFretMode: false,
        libraryColumns: 4,
        folderShelfColumns: 4,
        libraryCardDisplayMode: 'finger',
        libraryCardMonochrome: false,
        librarySortMode: 'updatedDesc',
        lastSaveFolderId: ''
    });
    var CHORD_ATOMIC_FIELDS = Object.freeze([
        'shape', 'rootPc', 'qualityKey', 'intervals', 'tensionIntervals', 'bassPc',
        'notes', 'deletedNotes', 'mutedStrings', 'fretRange'
    ]);
    var BOOKKEEPING_FIELDS = Object.freeze(['createdAt', 'updatedAt']);

    function own(object, key) {
        return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
    }

    function same(left, right) {
        return core.canonicalJson(left) === core.canonicalJson(right);
    }

    function recordMap(records) {
        var map = Object.create(null);
        (records || []).forEach(function (record) {
            if (!record || typeof record.recordType !== 'string' || typeof record.recordId !== 'string') return;
            map[core.recordKey(record.recordType, record.recordId)] = record;
        });
        return map;
    }

    function cloneRecord(record) {
        return record ? core.cloneJson(record) : null;
    }

    function live(record) {
        return Boolean(record && record.deletedAt == null && record.payload !== null);
    }

    function semanticPayload(payload) {
        var value = core.cloneJson(payload || {});
        BOOKKEEPING_FIELDS.forEach(function (key) { delete value[key]; });
        return value;
    }

    function isDefaultSettings(payload) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
        return Object.keys(payload).every(function (key) {
            return own(DEFAULT_SETTINGS, key) && same(payload[key], DEFAULT_SETTINGS[key]);
        });
    }

    function isInitialFolder(payload) {
        if (!payload || payload.id !== 'folder_uncategorized') return false;
        var semantic = semanticPayload(payload);
        var allowed = ['id', 'name', 'builtin', 'colorKey', 'order'];
        if (Object.keys(semantic).some(function (key) { return allowed.indexOf(key) === -1; })) return false;
        return (!own(semantic, 'name') || semantic.name === '未分類') &&
            (!own(semantic, 'builtin') || semantic.builtin === false) &&
            (!own(semantic, 'colorKey') || semantic.colorKey === 'black-leather') &&
            (!own(semantic, 'order') || semantic.order === 0);
    }

    function isEmptyOrder(payload) {
        if (!payload || typeof payload !== 'object') return false;
        var folderIds = Array.isArray(payload.folderIds) ? payload.folderIds : [];
        var entries = payload.entryIdsByFolder && typeof payload.entryIdsByFolder === 'object'
            ? payload.entryIdsByFolder : {};
        var allowedFolders = folderIds.length === 0 ||
            (folderIds.length === 1 && folderIds[0] === 'folder_uncategorized');
        return allowedFolders && Object.keys(entries).every(function (folderId) {
            return Array.isArray(entries[folderId]) && entries[folderId].length === 0;
        });
    }

    function hasMeaningfulLocalData(snapshot) {
        if (!snapshot || !Array.isArray(snapshot.records) || (snapshot.errors && snapshot.errors.length)) return true;
        return snapshot.records.some(function (record) {
            if (record.recordType === 'chord') return true;
            if (record.recordType === 'folder') return !isInitialFolder(record.payload);
            if (record.recordType === 'settings') return !isDefaultSettings(record.payload);
            if (record.recordType === 'library_order') return !isEmptyOrder(record.payload);
            return true;
        });
    }

    async function buildSnapshot(records, cryptoImpl) {
        var normalized = [];
        for (var index = 0; index < records.length; index += 1) {
            var input = records[index];
            if (!live(input)) continue;
            var record = core.normalizeRecord(input.recordType, input.recordId, input.payload, core.APP_SCHEMA_VERSION);
            record.recordKey = core.recordKey(record.recordType, record.recordId);
            record.payloadHash = await core.hashRecord(record, cryptoImpl);
            normalized.push(record);
        }
        normalized.sort(function (a, b) { return a.recordKey.localeCompare(b.recordKey); });
        var manifestHash = await core.sha256Text(core.canonicalJson({
            appId: core.APP_ID,
            schemaVersion: core.APP_SCHEMA_VERSION,
            records: normalized.map(function (record) {
                return { recordKey: record.recordKey, payloadHash: record.payloadHash };
            })
        }), cryptoImpl);
        return {
            appId: core.APP_ID,
            schemaVersion: core.APP_SCHEMA_VERSION,
            records: normalized,
            counts: normalized.reduce(function (counts, record) {
                counts.total += 1;
                counts[record.recordType] += 1;
                return counts;
            }, { total: 0, settings: 0, folder: 0, chord: 0, library_order: 0 }),
            manifestHash: manifestHash,
            errors: []
        };
    }

    async function validateCloudSnapshot(input, cryptoImpl) {
        if (!input || input.ok !== true || input.appId !== core.APP_ID || input.schemaVersion !== core.APP_SCHEMA_VERSION ||
            !Array.isArray(input.records) || typeof input.manifestHash !== 'string' ||
            !Number.isInteger(input.recordCount) || typeof input.cursor !== 'string') {
            throw new TypeError('Invalid cloud snapshot');
        }
        var seen = Object.create(null);
        var records = [];
        for (var index = 0; index < input.records.length; index += 1) {
            var server = input.records[index];
            if (!server || core.RECORD_TYPES.indexOf(server.recordType) === -1 || !server.recordId ||
                !Number.isInteger(server.revision) || server.revision < 1 || server.schemaVersion !== core.APP_SCHEMA_VERSION ||
                typeof server.payloadHash !== 'string' || server.payloadHash.length !== 64) {
                throw new TypeError('Invalid cloud record');
            }
            var key = core.recordKey(server.recordType, server.recordId);
            if (seen[key]) throw new TypeError('Duplicate cloud record');
            seen[key] = true;
            var deleted = server.deletedAt != null;
            if (deleted && server.payload !== null) throw new TypeError('Invalid cloud tombstone');
            var calculated = await core.hashSyncPayload(
                server.recordType, server.recordId, deleted ? null : server.payload, server.schemaVersion, cryptoImpl
            );
            if (calculated !== server.payloadHash) throw new TypeError('Cloud record hash mismatch');
            records.push(core.cloneJson(server));
        }
        var liveSnapshot = await buildSnapshot(records, cryptoImpl);
        if (liveSnapshot.counts.total !== input.recordCount || liveSnapshot.manifestHash !== input.manifestHash) {
            throw new TypeError('Cloud manifest mismatch');
        }
        return {
            appId: core.APP_ID,
            schemaVersion: core.APP_SCHEMA_VERSION,
            datasetState: input.datasetState,
            cursor: input.cursor,
            recordCount: input.recordCount,
            manifestHash: input.manifestHash,
            records: records,
            liveSnapshot: liveSnapshot
        };
    }

    function mergeObject(recordType, local, cloud, base) {
        var localPayload = local.payload;
        var cloudPayload = cloud.payload;
        var basePayload = base && live(base) ? base.payload : null;
        if (!basePayload && recordType === 'settings') basePayload = DEFAULT_SETTINGS;
        if (same(semanticPayload(localPayload), semanticPayload(cloudPayload))) return { value: cloneRecord(cloud), fields: [] };
        if (basePayload && same(semanticPayload(localPayload), semanticPayload(basePayload))) return { value: cloneRecord(cloud), fields: [] };
        if (basePayload && same(semanticPayload(cloudPayload), semanticPayload(basePayload))) return { value: cloneRecord(local), fields: [] };

        var result = {};
        var conflicts = [];
        var keys = Object.create(null);
        Object.keys(localPayload).concat(Object.keys(cloudPayload), basePayload ? Object.keys(basePayload) : []).forEach(function (key) {
            if (BOOKKEEPING_FIELDS.indexOf(key) === -1) keys[key] = true;
        });
        var atomicHandled = false;
        Object.keys(keys).sort().forEach(function (key) {
            if (recordType === 'chord' && CHORD_ATOMIC_FIELDS.indexOf(key) !== -1) {
                if (atomicHandled) return;
                atomicHandled = true;
                var localGroup = {}, cloudGroup = {}, baseGroup = {};
                CHORD_ATOMIC_FIELDS.forEach(function (field) {
                    if (own(localPayload, field)) localGroup[field] = localPayload[field];
                    if (own(cloudPayload, field)) cloudGroup[field] = cloudPayload[field];
                    if (basePayload && own(basePayload, field)) baseGroup[field] = basePayload[field];
                });
                var selected;
                if (same(localGroup, cloudGroup)) selected = localGroup;
                else if (basePayload && same(localGroup, baseGroup)) selected = cloudGroup;
                else if (basePayload && same(cloudGroup, baseGroup)) selected = localGroup;
                else { conflicts.push('chord_definition'); return; }
                Object.keys(selected).forEach(function (field) { result[field] = core.cloneJson(selected[field]); });
                return;
            }
            var localHas = own(localPayload, key);
            var cloudHas = own(cloudPayload, key);
            var baseHas = Boolean(basePayload && own(basePayload, key));
            var localValue = localHas ? localPayload[key] : undefined;
            var cloudValue = cloudHas ? cloudPayload[key] : undefined;
            var baseValue = baseHas ? basePayload[key] : undefined;
            if (localHas === cloudHas && same(localValue, cloudValue)) {
                if (localHas) result[key] = core.cloneJson(localValue);
            } else if (basePayload && localHas === baseHas && same(localValue, baseValue)) {
                if (cloudHas) result[key] = core.cloneJson(cloudValue);
            } else if (basePayload && cloudHas === baseHas && same(cloudValue, baseValue)) {
                if (localHas) result[key] = core.cloneJson(localValue);
            } else {
                conflicts.push(key);
            }
        });
        if (conflicts.length) return { value: null, fields: conflicts };
        if (own(localPayload, 'createdAt') || own(cloudPayload, 'createdAt')) {
            result.createdAt = localPayload.createdAt || cloudPayload.createdAt;
        }
        if (own(localPayload, 'updatedAt') || own(cloudPayload, 'updatedAt')) {
            result.updatedAt = cloudPayload.updatedAt || localPayload.updatedAt;
        }
        return {
            value: {
                recordType: local.recordType,
                recordId: local.recordId,
                schemaVersion: core.APP_SCHEMA_VERSION,
                payload: result
            },
            fields: []
        };
    }

    function chooseConflict(conflict, choice, result, bothQueue) {
        if (!choice) return false;
        if (choice === 'local' && live(conflict.local)) result[conflict.recordKey] = cloneRecord(conflict.local);
        else if (choice === 'cloud' && live(conflict.cloud)) result[conflict.recordKey] = cloneRecord(conflict.cloud);
        else if (choice === 'delete') delete result[conflict.recordKey];
        else if (choice === 'both' && conflict.recordType === 'chord' && live(conflict.local) && live(conflict.cloud)) {
            result[conflict.recordKey] = cloneRecord(conflict.cloud);
            bothQueue.push(conflict);
        } else return false;
        return true;
    }

    function relativeOrderCompatible(left, right) {
        var common = left.filter(function (id) { return right.indexOf(id) !== -1; });
        var commonRight = right.filter(function (id) { return left.indexOf(id) !== -1; });
        return same(common, commonRight);
    }

    function mergeSequence(local, cloud) {
        var left = Array.isArray(local) ? local : [];
        var right = Array.isArray(cloud) ? cloud : [];
        if (!relativeOrderCompatible(left, right)) return null;
        var result = right.slice();
        left.forEach(function (id) { if (result.indexOf(id) === -1) result.push(id); });
        return result;
    }

    function normalizedOrder(input, folders, chords) {
        var folderIds = folders.map(function (record) { return record.recordId; });
        var chordByFolder = Object.create(null);
        folderIds.forEach(function (id) { chordByFolder[id] = []; });
        chords.forEach(function (record) {
            if (chordByFolder[record.payload.folderId]) chordByFolder[record.payload.folderId].push(record.recordId);
        });
        var source = input && input.payload ? input.payload : {};
        var resultFolders = (Array.isArray(source.folderIds) ? source.folderIds : []).filter(function (id, index, list) {
            return folderIds.indexOf(id) !== -1 && list.indexOf(id) === index;
        });
        folderIds.forEach(function (id) { if (resultFolders.indexOf(id) === -1) resultFolders.push(id); });
        var entries = {};
        resultFolders.forEach(function (folderId) {
            var sourceEntries = source.entryIdsByFolder && Array.isArray(source.entryIdsByFolder[folderId])
                ? source.entryIdsByFolder[folderId] : [];
            entries[folderId] = sourceEntries.filter(function (id, index, list) {
                return chordByFolder[folderId].indexOf(id) !== -1 && list.indexOf(id) === index;
            });
            chordByFolder[folderId].forEach(function (id) { if (entries[folderId].indexOf(id) === -1) entries[folderId].push(id); });
        });
        return { version: 1, folderIds: resultFolders, entryIdsByFolder: entries };
    }

    async function planMerge(input, cryptoImpl) {
        var localSnapshot = input.local;
        var cloudSnapshot = input.cloud;
        var shadowRecords = input.shadow || [];
        var choices = input.choices || {};
        var sessionId = input.sessionId || 'merge';
        if (!localSnapshot || !cloudSnapshot || !Array.isArray(localSnapshot.records) || !Array.isArray(cloudSnapshot.records)) {
            throw new TypeError('Local and cloud snapshots are required');
        }
        var meaningfulLocal = hasMeaningfulLocalData(localSnapshot);
        var localRecords = meaningfulLocal ? core.cloneJson(localSnapshot.records) : [];
        var cloudRecords = core.cloneJson(cloudSnapshot.records);
        var cloudMap = recordMap(cloudRecords);
        var shadowMap = recordMap(shadowRecords);
        var idRemaps = [];

        // Independent custom folders can legitimately share a locally generated ID.
        // Keep the cloud identity and deterministically remap the local graph.
        for (var folderIndex = 0; folderIndex < localRecords.length; folderIndex += 1) {
            var localFolder = localRecords[folderIndex];
            if (localFolder.recordType !== 'folder' || localFolder.recordId === 'folder_uncategorized') continue;
            var cloudFolder = cloudMap[localFolder.recordKey || core.recordKey('folder', localFolder.recordId)];
            var baseFolder = shadowMap[core.recordKey('folder', localFolder.recordId)];
            if (!live(cloudFolder) || baseFolder || same(semanticPayload(localFolder.payload), semanticPayload(cloudFolder.payload))) continue;
            var newId = await core.deterministicUuid('sound-cruise-sync:p4:folder:' + sessionId + ':' + localFolder.recordId, cryptoImpl);
            idRemaps.push({ recordType: 'folder', oldId: localFolder.recordId, newId: newId });
            localRecords.forEach(function (record) {
                if (record.recordType === 'folder' && record.recordId === localFolder.recordId) {
                    record.recordId = newId; record.recordKey = core.recordKey('folder', newId); record.payload.id = newId;
                }
                if (record.recordType === 'chord' && record.payload.folderId === localFolder.recordId) record.payload.folderId = newId;
                if (record.recordType === 'library_order') {
                    var order = record.payload;
                    if (Array.isArray(order.folderIds)) order.folderIds = order.folderIds.map(function (id) { return id === localFolder.recordId ? newId : id; });
                    if (order.entryIdsByFolder && own(order.entryIdsByFolder, localFolder.recordId)) {
                        order.entryIdsByFolder[newId] = order.entryIdsByFolder[localFolder.recordId];
                        delete order.entryIdsByFolder[localFolder.recordId];
                    }
                }
            });
        }

        var localMap = recordMap(localRecords);
        var keys = Object.create(null);
        Object.keys(localMap).concat(Object.keys(cloudMap), Object.keys(shadowMap)).forEach(function (key) {
            if (key !== 'library_order/default') keys[key] = true;
        });
        var finalMap = Object.create(null);
        var conflicts = [];
        var operations = [];
        var bothQueue = [];

        Object.keys(keys).sort().forEach(function (key) {
            var local = localMap[key];
            var cloud = cloudMap[key];
            var base = shadowMap[key];
            var localLive = live(local);
            var cloudLive = live(cloud);
            if (localLive && cloudLive && local.payloadHash && local.payloadHash === cloud.payloadHash) {
                finalMap[key] = cloneRecord(cloud); operations.push({ recordKey: key, action: 'identical' }); return;
            }
            if (localLive && cloudLive) {
                var merged = mergeObject(local.recordType, local, cloud, base);
                if (merged.value) {
                    finalMap[key] = merged.value; operations.push({ recordKey: key, action: 'merge' }); return;
                }
                var editConflict = {
                    conflictId: 'record/' + key,
                    recordKey: key,
                    recordType: local.recordType,
                    kind: 'edit_edit',
                    fields: merged.fields,
                    local: cloneRecord(local),
                    cloud: cloneRecord(cloud),
                    choices: local.recordType === 'chord' ? ['local', 'cloud', 'both'] : ['local', 'cloud']
                };
                if (!chooseConflict(editConflict, choices[editConflict.conflictId], finalMap, bothQueue)) conflicts.push(editConflict);
                return;
            }
            if (localLive && !cloudLive) {
                if (base && live(base)) {
                    if (local.payloadHash === base.payloadHash) { operations.push({ recordKey: key, action: 'cloud_delete' }); return; }
                    var cloudDelete = {
                        conflictId: 'record/' + key, recordKey: key, recordType: local.recordType,
                        kind: 'cloud_delete_local_edit', local: cloneRecord(local), cloud: cloneRecord(cloud),
                        choices: ['local', 'delete']
                    };
                    if (!chooseConflict(cloudDelete, choices[cloudDelete.conflictId], finalMap, bothQueue)) conflicts.push(cloudDelete);
                } else {
                    finalMap[key] = cloneRecord(local); operations.push({ recordKey: key, action: 'local_only' });
                }
                return;
            }
            if (!localLive && cloudLive) {
                if (base && live(base) && cloud.payloadHash !== base.payloadHash) {
                    var localDelete = {
                        conflictId: 'record/' + key, recordKey: key, recordType: cloud.recordType,
                        kind: 'local_delete_cloud_edit', local: cloneRecord(local), cloud: cloneRecord(cloud),
                        choices: ['cloud', 'delete']
                    };
                    if (!chooseConflict(localDelete, choices[localDelete.conflictId], finalMap, bothQueue)) conflicts.push(localDelete);
                } else if (!base) {
                    finalMap[key] = cloneRecord(cloud); operations.push({ recordKey: key, action: 'cloud_only' });
                }
            }
        });

        for (var bothIndex = 0; bothIndex < bothQueue.length; bothIndex += 1) {
            var conflict = bothQueue[bothIndex];
            var bothId = await core.deterministicUuid('sound-cruise-sync:p4:both:' + sessionId + ':' + conflict.recordKey, cryptoImpl);
            var bothRecord = cloneRecord(conflict.local);
            bothRecord.recordId = bothId;
            bothRecord.recordKey = core.recordKey('chord', bothId);
            bothRecord.payload.id = bothId;
            finalMap[bothRecord.recordKey] = bothRecord;
            idRemaps.push({ recordType: 'chord', oldId: conflict.local.recordId, newId: bothId, reason: 'keep_both' });
        }

        var folders = Object.keys(finalMap).map(function (key) { return finalMap[key]; }).filter(function (record) { return record.recordType === 'folder'; });
        var chords = Object.keys(finalMap).map(function (key) { return finalMap[key]; }).filter(function (record) { return record.recordType === 'chord'; });
        var folderIds = folders.map(function (record) { return record.recordId; });
        chords.forEach(function (record) {
            if (folderIds.indexOf(record.payload.folderId) === -1) {
                conflicts.push({
                    conflictId: 'reference/' + record.recordKey,
                    recordKey: record.recordKey,
                    recordType: 'chord',
                    kind: 'missing_folder_reference',
                    folderId: record.payload.folderId,
                    choices: []
                });
            }
        });

        var localOrder = localMap['library_order/default'];
        var cloudOrder = cloudMap['library_order/default'];
        var baseOrder = shadowMap['library_order/default'];
        var selectedOrder = null;
        if (live(localOrder) && live(cloudOrder)) {
            if (same(localOrder.payload, cloudOrder.payload)) selectedOrder = localOrder;
            else if (live(baseOrder) && same(localOrder.payload, baseOrder.payload)) selectedOrder = cloudOrder;
            else if (live(baseOrder) && same(cloudOrder.payload, baseOrder.payload)) selectedOrder = localOrder;
            else {
                var localFolders = localOrder.payload.folderIds || [];
                var cloudFolders = cloudOrder.payload.folderIds || [];
                var mergedFolders = mergeSequence(localFolders, cloudFolders);
                var mergedEntries = {};
                var orderConflict = mergedFolders === null;
                if (!orderConflict) mergedFolders.forEach(function (folderId) {
                    var merged = mergeSequence(
                        localOrder.payload.entryIdsByFolder && localOrder.payload.entryIdsByFolder[folderId],
                        cloudOrder.payload.entryIdsByFolder && cloudOrder.payload.entryIdsByFolder[folderId]
                    );
                    if (merged === null) orderConflict = true;
                    else mergedEntries[folderId] = merged;
                });
                if (!orderConflict) selectedOrder = { recordType: 'library_order', recordId: 'default', payload: { version: 1, folderIds: mergedFolders, entryIdsByFolder: mergedEntries } };
                else {
                    var orderItem = {
                        conflictId: 'order/library_order/default', recordKey: 'library_order/default',
                        recordType: 'library_order', kind: 'order_order', local: cloneRecord(localOrder),
                        cloud: cloneRecord(cloudOrder), choices: ['local', 'cloud']
                    };
                    var orderChoice = choices[orderItem.conflictId];
                    if (orderChoice === 'local') selectedOrder = localOrder;
                    else if (orderChoice === 'cloud') selectedOrder = cloudOrder;
                    else conflicts.push(orderItem);
                }
            }
        } else selectedOrder = live(localOrder) ? localOrder : (live(cloudOrder) ? cloudOrder : null);
        var orderPayload = normalizedOrder(selectedOrder, folders, chords);
        finalMap['library_order/default'] = {
            recordType: 'library_order', recordId: 'default', schemaVersion: core.APP_SCHEMA_VERSION, payload: orderPayload
        };

        var finalRecords = Object.keys(finalMap).sort().map(function (key) { return finalMap[key]; });
        var finalSnapshot = conflicts.length ? null : await buildSnapshot(finalRecords, cryptoImpl);
        var localOriginalMap = recordMap(localSnapshot.records);
        var cloudOriginalMap = recordMap(cloudSnapshot.records);
        var localWrites = [];
        var remoteChanges = [];
        if (finalSnapshot) {
            var finalSnapshotMap = recordMap(finalSnapshot.records);
            var allLocal = Object.create(null);
            Object.keys(localOriginalMap).concat(Object.keys(finalSnapshotMap)).forEach(function (key) { allLocal[key] = true; });
            Object.keys(allLocal).sort().forEach(function (key) {
                var before = localOriginalMap[key]; var after = finalSnapshotMap[key];
                if (!before || !after || before.payloadHash !== after.payloadHash) {
                    localWrites.push({ recordKey: key, before: cloneRecord(before), after: cloneRecord(after), action: after ? 'put' : 'delete' });
                }
            });
            var allCloud = Object.create(null);
            Object.keys(cloudOriginalMap).concat(Object.keys(finalSnapshotMap)).forEach(function (key) { allCloud[key] = true; });
            Object.keys(allCloud).sort().forEach(function (key) {
                var before = cloudOriginalMap[key]; var after = finalSnapshotMap[key];
                var beforeLive = live(before);
                if ((!beforeLive && after) || (beforeLive && !after) || (beforeLive && after && before.payloadHash !== after.payloadHash)) {
                    remoteChanges.push({ recordKey: key, before: cloneRecord(before), after: cloneRecord(after), action: after ? 'put' : 'delete' });
                }
            });
        }
        return {
            version: 1,
            sessionId: sessionId,
            localState: meaningfulLocal ? 'local_data_pending_merge' : 'empty',
            source: {
                localRecordCount: localSnapshot.counts.total,
                cloudRecordCount: cloudSnapshot.recordCount == null
                    ? cloudSnapshot.records.filter(live).length : cloudSnapshot.recordCount,
                localManifestHash: localSnapshot.manifestHash,
                cloudManifestHash: cloudSnapshot.manifestHash,
                cloudCursor: cloudSnapshot.cursor
            },
            operations: operations,
            summary: operations.reduce(function (summary, operation) {
                summary[operation.action] = (summary[operation.action] || 0) + 1;
                return summary;
            }, {
                identical: 0,
                merge: 0,
                local_only: 0,
                cloud_only: 0,
                cloud_delete: 0
            }),
            localWrites: localWrites,
            remoteChanges: remoteChanges,
            idRemaps: idRemaps,
            conflicts: conflicts,
            warnings: [],
            finalManifest: finalSnapshot ? {
                recordCount: finalSnapshot.counts.total,
                manifestHash: finalSnapshot.manifestHash
            } : null,
            finalSnapshot: finalSnapshot
        };
    }

    sync.merge = Object.freeze({
        DEFAULT_SETTINGS: core.cloneJson(DEFAULT_SETTINGS),
        CHORD_ATOMIC_FIELDS: CHORD_ATOMIC_FIELDS.slice(),
        hasMeaningfulLocalData: hasMeaningfulLocalData,
        buildSnapshot: buildSnapshot,
        validateCloudSnapshot: validateCloudSnapshot,
        planMerge: planMerge,
        normalizedOrder: normalizedOrder
    });
    global.ChordCruiseSync = sync;
}(typeof window !== 'undefined' ? window : globalThis));
