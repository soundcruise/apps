(function installPortSyncAdapter(global) {
  'use strict';

  const root = global.SoundCruisePortSync = global.SoundCruisePortSync || {};
  const APP_ID = 'port';
  const SCHEMA_VERSION = 1;
  const ASSET_METADATA_KEY = 'cruisePort.syncAssetMetadata';
  const MANAGED_KEYS = Object.freeze([
    'cruisePort.settings', 'cruisePort.metronome', 'cruisePort.metronomePresets',
    'cruisePort.tuner', 'cruisePort.gearList', 'cruisePort.gearCategories',
    'cruisePort.practiceCalendar', 'cruisePort.schemaVersion', 'cruisePort.practiceMenus',
    'cruisePort.practiceProgress', 'cruisePort.practiceHistory', 'cruisePort.myApps',
    ASSET_METADATA_KEY
  ]);
  const SINGLETONS = Object.freeze([
    ['cruisePort.settings', 'settings', 'global'],
    ['cruisePort.metronome', 'metronome_settings', 'default'],
    ['cruisePort.tuner', 'tuner_settings', 'default'],
    ['cruisePort.practiceProgress', 'practice_cycle', 'current']
  ]);
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
  const FORBIDDEN_KEY = /(?:credential|verifier|password|secret|token|recovery.?code|join.?code|blob|base64|binary)/iu;

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function plain(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  async function sha256(value, cryptoImpl = global.crypto) {
    const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  function parse(storage, key, fallback = null) {
    const raw = storage.getItem(key);
    if (raw == null || raw === '') return clone(fallback);
    try { return JSON.parse(raw); } catch (_) { throw new Error(`port_storage_invalid:${key}`); }
  }
  function safeId(value) {
    const id = String(value ?? '');
    if (!SAFE_ID.test(id)) throw new Error('port_record_id_invalid');
    return id;
  }
  function assertSafe(value, depth = 0, budget = { count: 0 }) {
    budget.count += 1;
    if (budget.count > 4096 || depth > 12) throw new Error('port_record_too_large');
    if (value == null || typeof value === 'boolean') return;
    if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('port_record_invalid'); return; }
    if (typeof value === 'string') {
      if (value.length > 20000 || /^data:/iu.test(value) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value)) {
        throw new Error('port_record_invalid');
      }
      return;
    }
    if (Array.isArray(value)) {
      if (value.length > 2000) throw new Error('port_record_too_large');
      value.forEach((item) => assertSafe(item, depth + 1, budget));
      return;
    }
    if (!plain(value) || Object.keys(value).length > 200) throw new Error('port_record_invalid');
    Object.entries(value).forEach(([key, item]) => {
      if (FORBIDDEN_KEY.test(key)) throw new Error('port_secret_or_binary_blocked');
      assertSafe(item, depth + 1, budget);
    });
  }
  function record(recordType, recordId, value) {
    const id = safeId(recordId);
    const safeValue = clone(value);
    assertSafe(safeValue);
    return { recordType, recordId: id, schemaVersion: SCHEMA_VERSION, payload: { id, value: safeValue } };
  }
  function without(object, keys) {
    const result = {};
    Object.entries(plain(object) ? object : {}).forEach(([key, value]) => {
      if (!keys.includes(key)) result[key] = clone(value);
    });
    return result;
  }
  function assetMetadata(storage) {
    const value = parse(storage, ASSET_METADATA_KEY, null);
    if (![2, 3, 4].includes(value?.version)) {
      return { version: 4, gear: {}, myApps: {}, attachments: {}, releaseQueue: [], discardQueue: [], referencePending: false };
    }
    return {
      version: 4, gear: clone(value.gear || {}), myApps: clone(value.myApps || {}),
      attachments: clone(value.attachments || {}),
      releaseQueue: [...new Set(value.releaseQueue || [])],
      discardQueue: [...new Set(value.discardQueue || [])],
      referencePending: value.referencePending === true
    };
  }
  function assetFor(item, kind, metadata) {
    const idKey = kind === 'gear' ? 'photoId' : 'iconId';
    const sourceKey = kind === 'gear' ? 'photoSourceId' : 'iconSourceId';
    const cropKey = kind === 'gear' ? 'photoCrop' : 'iconCrop';
    const entry = metadata?.[kind === 'gear' ? 'gear' : 'myApps']?.[item?.id];
    if (entry?.published?.availability === 'available' && entry.published.final?.assetId) {
      return clone(entry.published);
    }
    return {
      present: Boolean(item?.[idKey] || item?.[sourceKey]),
      crop: item?.[cropKey] ? clone(item[cropKey]) : null
    };
  }
  function itemValues(value, fallbackKey = 'items') {
    return plain(value) && Array.isArray(value[fallbackKey]) ? value[fallbackKey] : [];
  }
  function recordKey(record) { return `${record?.recordType || ''}/${record?.recordId || ''}`; }
  function isDeleted(record) { return record?.deletedAt != null || record?.deleted === true; }
  function recordMap(records) {
    return new Map((records || []).filter((item) => plain(item)).map((item) => [recordKey(item), item]));
  }
  function liveRecord(records, type, id) {
    const value = records.get(`${type}/${id}`);
    return value && !isDeleted(value) ? value : null;
  }
  function availablePair(value) {
    return value?.availability === 'available' && typeof value.final?.assetId === 'string';
  }
  function availableAttachment(value) {
    return value?.availability === 'available' && typeof value.asset?.assetId === 'string';
  }
  function missingPairReference(record) {
    return !availablePair(record?.payload?.value?.asset);
  }
  function findAssetReferenceRepairs(storage, records, previousRecords) {
    const current = recordMap(records);
    const previous = recordMap(previousRecords);
    const assets = assetMetadata(storage);
    const gearItems = itemValues(parse(storage, 'cruisePort.gearList', { items: [] }));
    const appItems = itemValues(parse(storage, 'cruisePort.myApps', { items: [] }));
    const repairs = { gear: new Set(), myApps: new Set(), attachments: new Set() };
    for (const item of gearItems) {
      const entry = assets.gear[item.id];
      const currentRecord = liveRecord(current, 'gear_item', item.id);
      const previousRecord = liveRecord(previous, 'gear_item', item.id);
      if (item.photoId && availablePair(entry?.published) && currentRecord && previousRecord &&
          missingPairReference(currentRecord) && missingPairReference(previousRecord)) {
        repairs.gear.add(item.id);
      }
    }
    for (const item of appItems) {
      const entry = assets.myApps[item.id];
      const currentRecord = liveRecord(current, 'my_app', item.id);
      const previousRecord = liveRecord(previous, 'my_app', item.id);
      if (!item.iconPresetKey && item.iconId && availablePair(entry?.published) && currentRecord && previousRecord &&
          missingPairReference(currentRecord) && missingPairReference(previousRecord)) {
        repairs.myApps.add(item.id);
      }
    }
    for (const [logicalId, entry] of Object.entries(assets.attachments)) {
      if (!availableAttachment(entry?.published) || !liveRecord(current, 'practice_menu', entry.practiceId) ||
          !liveRecord(previous, 'practice_menu', entry.practiceId)) continue;
      const currentAttachment = current.get(`practice_attachment/${logicalId}`);
      const previousAttachment = previous.get(`practice_attachment/${logicalId}`);
      if (!currentAttachment && !previousAttachment) repairs.attachments.add(logicalId);
    }
    return repairs;
  }
  function hasAssetReferenceRepairs(repairs) {
    return repairs.gear.size > 0 || repairs.myApps.size > 0 || repairs.attachments.size > 0;
  }
  function reconcileRemoteAssetReferences(storage, records, previousRecords) {
    const repairs = findAssetReferenceRepairs(storage, records, previousRecords);
    if (!hasAssetReferenceRepairs(repairs)) return false;
    const assets = assetMetadata(storage);
    if (!assets.referencePending) {
      assets.referencePending = true;
      storage.setItem(ASSET_METADATA_KEY, JSON.stringify(assets));
    }
    return true;
  }
  function readLocalSnapshot(storage = global.localStorage) {
    const records = [];
    const assets = assetMetadata(storage);
    SINGLETONS.forEach(([key, type, id]) => {
      const value = parse(storage, key);
      if (value != null) records.push(record(type, id, value));
    });
    const presets = parse(storage, 'cruisePort.metronomePresets', { items: [] });
    itemValues(presets).forEach((item, index) => records.push(record('metronome_preset', item.id, { item, order: index })));
    const calendar = parse(storage, 'cruisePort.practiceCalendar', { notes: [] });
    itemValues(calendar, 'notes').forEach((item) => records.push(record('calendar_event', item.id, item)));
    const menus = parse(storage, 'cruisePort.practiceMenus', { items: [] });
    itemValues(menus).forEach((item, index) => records.push(record('practice_menu', item.id, item)));
    if (itemValues(menus).length) records.push(record('practice_menu_order', 'default', itemValues(menus).map(({ id }) => id)));
    Object.entries(assets.attachments || {}).forEach(([logicalId, entry]) => {
      if (entry?.published?.availability !== 'available' || !entry.published.asset?.assetId) return;
      records.push(record('practice_attachment', logicalId, {
        practiceId: entry.practiceId, fileName: entry.fileName, kind: entry.kind,
        mimeType: entry.mimeType, byteSize: entry.byteSize,
        createdAt: entry.createdAt, updatedAt: entry.updatedAt,
        asset: clone(entry.published.asset)
      }));
    });
    const attachmentSets = new Map();
    records.filter((item) => item.recordType === 'practice_attachment').forEach((item) => {
      const practiceId = item.payload.value.practiceId;
      if (!attachmentSets.has(practiceId)) attachmentSets.set(practiceId, []);
      attachmentSets.get(practiceId).push(item.recordId);
    });
    attachmentSets.forEach((ids, practiceId) => {
      records.push(record('practice_attachment_set', practiceId, ids.sort()));
    });
    const history = parse(storage, 'cruisePort.practiceHistory', { events: [] });
    itemValues(history, 'events').forEach((item) => records.push(record('practice_history_event', item.id, item)));
    const categories = parse(storage, 'cruisePort.gearCategories', { categories: [] });
    itemValues(categories, 'categories').forEach((item) => records.push(record('gear_category', item.id, item)));
    if (itemValues(categories, 'categories').length) {
      records.push(record('gear_category_order', 'default', itemValues(categories, 'categories').map(({ id }) => id)));
    }
    const gear = parse(storage, 'cruisePort.gearList', { items: [] });
    itemValues(gear).forEach((item) => records.push(record('gear_item', item.id, {
      item: without(item, ['photoId', 'photoSourceId', 'photoCrop']), asset: assetFor(item, 'gear', assets)
    })));
    ['owned', 'wishlist', 'sold'].forEach((status) => {
      const ids = itemValues(gear).filter((item) => item.status === status)
        .sort((left, right) => Number(left.order || 0) - Number(right.order || 0)).map(({ id }) => id);
      if (ids.length) records.push(record('gear_order', status, ids));
    });
    const myApps = parse(storage, 'cruisePort.myApps', { items: [] });
    itemValues(myApps).forEach((item) => records.push(record('my_app', item.id, {
      item: without(item, ['iconId', 'iconSourceId', 'iconCrop']), asset: assetFor(item, 'app', assets)
    })));
    if (itemValues(myApps).length) records.push(record('my_app_order', 'default', itemValues(myApps).map(({ id }) => id)));
    return { schemaVersion: SCHEMA_VERSION, records };
  }
  function normalizeSnapshot(snapshot) {
    if (!plain(snapshot) || snapshot.schemaVersion !== SCHEMA_VERSION || !Array.isArray(snapshot.records)) {
      throw new Error('port_snapshot_invalid');
    }
    const seen = new Set();
    const records = snapshot.records.map((item) => {
      if (!plain(item) || typeof item.recordType !== 'string' || typeof item.recordId !== 'string' ||
          item.schemaVersion !== SCHEMA_VERSION || !plain(item.payload) || item.payload.id !== item.recordId) {
        throw new Error('port_snapshot_invalid');
      }
      safeId(item.recordId); assertSafe(item.payload.value);
      const key = `${item.recordType}/${item.recordId}`;
      if (seen.has(key)) throw new Error('port_snapshot_duplicate');
      seen.add(key);
      return clone(item);
    }).sort((a, b) => `${a.recordType}/${a.recordId}`.localeCompare(`${b.recordType}/${b.recordId}`));
    return { schemaVersion: SCHEMA_VERSION, records };
  }
  async function serializeRecords(snapshot, cryptoImpl = global.crypto) {
    const normalized = normalizeSnapshot(snapshot);
    return Promise.all(normalized.records.map(async (item) => ({
      ...clone(item), payloadHash: await sha256(canonical({
        appId: APP_ID, payload: item.payload, recordId: item.recordId,
        recordType: item.recordType, schemaVersion: item.schemaVersion
      }), cryptoImpl)
    })));
  }
  function deserializeRecords(records) {
    return normalizeSnapshot({ schemaVersion: SCHEMA_VERSION, records: (records || []).map((item) => ({
      recordType: item.recordType, recordId: item.recordId,
      schemaVersion: item.schemaVersion, payload: clone(item.payload)
    })) });
  }
  function keyOf(item) { return `${item.recordType}/${item.recordId}`; }
  function mergeSnapshots(localSnapshot, remoteSnapshot) {
    const local = normalizeSnapshot(localSnapshot); const remote = normalizeSnapshot(remoteSnapshot);
    const merged = new Map(remote.records.map((item) => [keyOf(item), item]));
    const conflicts = [];
    local.records.forEach((item) => {
      const current = merged.get(keyOf(item));
      if (current && canonical(current.payload) !== canonical(item.payload)) {
        conflicts.push({ recordKey: keyOf(item), reason: 'same_record_changed' });
      } else merged.set(keyOf(item), item);
    });
    return { snapshot: normalizeSnapshot({ schemaVersion: SCHEMA_VERSION, records: [...merged.values()] }), conflicts };
  }
  function byType(snapshot, type) { return snapshot.records.filter((item) => item.recordType === type); }
  function ordered(snapshot, type, orderType, orderId = 'default') {
    const items = byType(snapshot, type); const order = byType(snapshot, orderType).find((item) => item.recordId === orderId)?.payload.value || [];
    const rank = new Map(order.map((id, index) => [id, index]));
    return items.sort((a, b) => (rank.get(a.recordId) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.recordId) ?? Number.MAX_SAFE_INTEGER));
  }
  function restoreAsset(remoteValue, localItem, kind, entry) {
    const idKey = kind === 'gear' ? 'photoId' : 'iconId';
    const sourceKey = kind === 'gear' ? 'photoSourceId' : 'iconSourceId';
    const cropKey = kind === 'gear' ? 'photoCrop' : 'iconCrop';
    const asset = remoteValue.asset || { present: false, crop: null };
    const cloudAsset = asset?.availability === 'available' && asset.final?.assetId ? asset : null;
    const pendingLocal = Boolean(entry?.pending);
    const bindingMatches = Boolean(cloudAsset && entry?.binding?.final?.assetId === cloudAsset.final.assetId &&
      entry.binding.final.hash === cloudAsset.final.hash);
    return {
      ...clone(remoteValue.item),
      [idKey]: pendingLocal && localItem?.[idKey] ? localItem[idKey]
        : bindingMatches ? entry.binding.final.localId : (!cloudAsset && asset.present && localItem?.[idKey] ? localItem[idKey] : null),
      [sourceKey]: pendingLocal && localItem?.[sourceKey] ? localItem[sourceKey]
        : bindingMatches && cloudAsset.source && entry.binding?.source?.assetId === cloudAsset.source.assetId
          ? entry.binding.source.localId
          : (!cloudAsset && asset.present && localItem?.[sourceKey] ? localItem[sourceKey] : null),
      [cropKey]: asset.crop ? clone(asset.crop) : null
    };
  }
  function write(storage, key, value) { storage.setItem(key, JSON.stringify(value)); }
  async function applyRemoteSnapshot(storage, snapshot, previousRecords = []) {
    const before = new Map(MANAGED_KEYS.map((key) => [key, storage.getItem(key)]));
    const normalized = normalizeSnapshot(snapshot);
    const currentGear = itemValues(parse(storage, 'cruisePort.gearList', { items: [] }));
    const currentApps = itemValues(parse(storage, 'cruisePort.myApps', { items: [] }));
    const currentAssets = assetMetadata(storage);
    const repairs = findAssetReferenceRepairs(storage, normalized.records, previousRecords);
    const currentHistory = parse(storage, 'cruisePort.practiceHistory', { version: 4, events: [] });
    SINGLETONS.forEach(([key, type, id]) => {
      const found = byType(normalized, type).find((item) => item.recordId === id);
      if (found) write(storage, key, found.payload.value); else storage.removeItem(key);
    });
    const presets = ordered(normalized, 'metronome_preset', 'unused').map((item) => item.payload.value)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0)).map(({ item }) => item);
    write(storage, 'cruisePort.metronomePresets', { version: 1, items: presets });
    write(storage, 'cruisePort.practiceCalendar', { version: 2, notes: byType(normalized, 'calendar_event').map((item) => item.payload.value) });
    write(storage, 'cruisePort.practiceMenus', { version: 3, items: ordered(normalized, 'practice_menu', 'practice_menu_order').map((item) => item.payload.value) });
    const remoteAttachments = new Map(byType(normalized, 'practice_attachment').map((item) => [item.recordId, item.payload.value]));
    Object.entries(currentAssets.attachments || {}).forEach(([logicalId, entry]) => {
      if (remoteAttachments.has(logicalId) || repairs.attachments.has(logicalId) || entry?.pending) return;
      if (entry?.binding?.localId) currentAssets.discardQueue.push(entry.binding.localId);
      delete currentAssets.attachments[logicalId];
    });
    remoteAttachments.forEach((value, logicalId) => {
      const entry = currentAssets.attachments[logicalId] || {};
      if (entry.binding?.assetId && entry.binding.assetId !== value.asset.assetId && entry.binding.localId) {
        currentAssets.discardQueue.push(entry.binding.localId);
        entry.binding = null;
      }
      currentAssets.attachments[logicalId] = {
        ...entry,
        practiceId: value.practiceId, fileName: value.fileName, kind: value.kind,
        mimeType: value.mimeType, byteSize: value.byteSize,
        createdAt: value.createdAt, updatedAt: value.updatedAt,
        published: { version: 1, availability: 'available', asset: clone(value.asset) },
        pending: null
      };
    });
    currentAssets.referencePending = currentAssets.referencePending || hasAssetReferenceRepairs(repairs);
    currentAssets.discardQueue = [...new Set(currentAssets.discardQueue.filter(Boolean))];
    storage.setItem('cruisePort.schemaVersion', '3');
    write(storage, 'cruisePort.practiceHistory', {
      version: 4, events: byType(normalized, 'practice_history_event').map((item) => item.payload.value),
      ...(currentHistory.activeSessionTiming ? { activeSessionTiming: currentHistory.activeSessionTiming } : {})
    });
    write(storage, 'cruisePort.gearCategories', { version: 1, categories: ordered(normalized, 'gear_category', 'gear_category_order').map((item) => item.payload.value) });
    const gearRank = new Map();
    byType(normalized, 'gear_order').forEach((order) => order.payload.value.forEach((id, index) => gearRank.set(id, index)));
    write(storage, 'cruisePort.gearList', { version: 4, items: byType(normalized, 'gear_item').map((entry) => {
      const local = currentGear.find((item) => item.id === entry.recordId);
      const metadataEntry = currentAssets.gear[entry.recordId] || {};
      const repair = repairs.gear.has(entry.recordId);
      metadataEntry.published = entry.payload.value.asset?.availability === 'available'
        ? clone(entry.payload.value.asset) : repair ? metadataEntry.published : null;
      if (metadataEntry.binding?.final?.assetId !== metadataEntry.published?.final?.assetId) metadataEntry.binding = null;
      currentAssets.gear[entry.recordId] = metadataEntry;
      const value = repair ? { ...entry.payload.value, asset: clone(metadataEntry.published) } : entry.payload.value;
      return { ...restoreAsset(value, local, 'gear', metadataEntry), order: gearRank.get(entry.recordId) ?? 0 };
    }) });
    write(storage, 'cruisePort.myApps', { version: 6, items: ordered(normalized, 'my_app', 'my_app_order').map((entry) => {
      const local = currentApps.find((item) => item.id === entry.recordId);
      const metadataEntry = currentAssets.myApps[entry.recordId] || {};
      const repair = repairs.myApps.has(entry.recordId);
      metadataEntry.published = entry.payload.value.asset?.availability === 'available'
        ? clone(entry.payload.value.asset) : repair ? metadataEntry.published : null;
      if (metadataEntry.binding?.final?.assetId !== metadataEntry.published?.final?.assetId) metadataEntry.binding = null;
      currentAssets.myApps[entry.recordId] = metadataEntry;
      const value = repair ? { ...entry.payload.value, asset: clone(metadataEntry.published) } : entry.payload.value;
      return restoreAsset(value, local, 'app', metadataEntry);
    }) });
    write(storage, ASSET_METADATA_KEY, currentAssets);
    root.acceptRemoteStorageValues?.(storage, MANAGED_KEYS);
    const changed = MANAGED_KEYS.some((key) => storage.getItem(key) !== before.get(key));
    return Object.freeze({ ok: true, changed });
  }
  async function computeManifest(snapshot, cryptoImpl = global.crypto) {
    const records = await serializeRecords(snapshot, cryptoImpl);
    const rows = records.map(({ recordType, recordId, payloadHash }) => ({
      recordKey: `${recordType}/${recordId}`, payloadHash
    })).sort((left, right) => left.recordKey.localeCompare(right.recordKey));
    return sha256(canonical({ appId: APP_ID, schemaVersion: SCHEMA_VERSION, records: rows }), cryptoImpl);
  }
  function assertDataPlaneContext(context) {
    if (context?.membership?.appId !== APP_ID || context.membership.state !== 'active') throw new Error('port_membership_inactive');
    if (context?.appCredential?.appId !== APP_ID || typeof context.appCredential.credential !== 'string' ||
        !context.appCredential.credential.startsWith('scd1.')) throw new Error('port_app_credential_required');
    return true;
  }
  function getConflictPresentation({ localRecord, remoteRecord }) {
    const name = localRecord?.payload?.value?.item?.name || remoteRecord?.payload?.value?.item?.name || 'Cruise Portデータ';
    return { title: 'Cruise Port', name: String(name), fields: [{
      label: '状態', local: localRecord ? 'この環境に保存' : 'この環境で削除',
      remote: remoteRecord ? 'クラウドに保存' : 'クラウドで削除'
    }] };
  }

  class PortSyncAdapter {
    constructor(options = {}) {
      this.storage = options.storage || global.localStorage;
      this.cryptoImpl = options.cryptoImpl || global.crypto;
      this.remoteApplyChanged = false;
      this.remoteReferenceRecords = [];
    }
    readLocalSnapshot() { return readLocalSnapshot(this.storage); }
    normalizeLocalSnapshot(value = this.readLocalSnapshot()) { return normalizeSnapshot(value); }
    validateSnapshot(value) { try { normalizeSnapshot(value); return true; } catch (_) { return false; } }
    serializeRecords(value) { return serializeRecords(value, this.cryptoImpl); }
    deserializeRecords(value) { return deserializeRecords(value); }
    isMeaningfulLocalData(value = this.readLocalSnapshot()) { return normalizeSnapshot(value).records.length > 0; }
    mergeSnapshots(local, remote) { return mergeSnapshots(local, remote); }
    primeRemoteReferences(records) { this.remoteReferenceRecords = clone(records || []); }
    reconcileRemoteReferences(records) {
      const repaired = reconcileRemoteAssetReferences(this.storage, records, this.remoteReferenceRecords);
      this.remoteReferenceRecords = clone(records || []);
      return repaired;
    }
    async applyRemoteSnapshot(value) {
      const result = await applyRemoteSnapshot(this.storage, value, this.remoteReferenceRecords);
      this.remoteApplyChanged = this.remoteApplyChanged || result.changed;
      return result;
    }
    consumeRemoteApplyChanged() {
      const changed = this.remoteApplyChanged;
      this.remoteApplyChanged = false;
      return changed;
    }
    computeManifest(value) { return computeManifest(value, this.cryptoImpl); }
    getConflictPresentation(context) { return getConflictPresentation(context); }
    assertDataPlaneContext(context) { return assertDataPlaneContext(context); }
  }

  Object.assign(root, {
    APP_ID, SCHEMA_VERSION, MANAGED_KEYS, ASSET_METADATA_KEY, PortSyncAdapter,
    readLocalSnapshot, normalizeLocalSnapshot: normalizeSnapshot, serializeRecords,
    deserializeRecords, mergeSnapshots, applyRemoteSnapshot, computeManifest,
    assertDataPlaneContext, getConflictPresentation, reconcileRemoteAssetReferences
  });
})(globalThis);
