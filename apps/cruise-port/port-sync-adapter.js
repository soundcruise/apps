(function installPortSyncAdapter(global) {
  'use strict';

  const root = global.SoundCruisePortSync = global.SoundCruisePortSync || {};
  const APP_ID = 'port';
  const SCHEMA_VERSION = 1;
  const ASSET_METADATA_KEY = 'cruisePort.syncAssetMetadata';
  const DELETION_INTENT_KEY = 'cruisePort.syncDeletionIntent.v1';
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
  const ORDER_ITEM_TYPES = Object.freeze({
    gear_category_order: 'gear_category',
    gear_order: 'gear_item',
    practice_menu_order: 'practice_menu',
    my_app_order: 'my_app'
  });
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
    if (raw == null) return clone(fallback);
    try { return JSON.parse(raw); } catch (_) { throw new Error(`port_storage_invalid:${key}`); }
  }
  function safeId(value) {
    const id = String(value ?? '');
    if (!SAFE_ID.test(id)) throw new Error('port_record_id_invalid');
    return id;
  }
  function assertSafe(value, depth = 0, budget = { count: 0 }, urlField = false) {
    budget.count += 1;
    if (budget.count > 4096 || depth > 12) throw new Error('port_record_too_large');
    if (value == null || typeof value === 'boolean') return;
    if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('port_record_invalid'); return; }
    if (typeof value === 'string') {
      if (value.length > 20000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value)) {
        throw new Error('port_record_invalid');
      }
      if (urlField && value !== '') {
        let url;
        try { url = new global.URL(value); } catch (_) { throw new Error('port_record_invalid'); }
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
          throw new Error('port_record_invalid');
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      if (value.length > 2000) throw new Error('port_record_too_large');
      value.forEach((item) => assertSafe(item, depth + 1, budget, urlField));
      return;
    }
    if (!plain(value) || Object.keys(value).length > 200) throw new Error('port_record_invalid');
    Object.entries(value).forEach(([key, item]) => {
      if (FORBIDDEN_KEY.test(key)) throw new Error('port_secret_or_binary_blocked');
      assertSafe(item, depth + 1, budget, urlField || /^(?:url|urls|customLaunch|href|website)$/iu.test(key));
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
  function normalizeMyAppItem(item) {
    const value = clone(plain(item) ? item : {});
    if (!Object.hasOwn(value, 'iconPresetKey')) value.iconPresetKey = null;
    if (!plain(value.urls)) value.urls = { ios: '', android: '', macos: '', windows: '', web: '' };
    return value;
  }
  function assetMetadata(storage) {
    const value = parse(storage, ASSET_METADATA_KEY, null);
    if (value === null) {
      return { version: 4, gear: {}, myApps: {}, attachments: {}, releaseQueue: [], discardQueue: [], referencePending: false };
    }
    if (!plain(value) || ![2, 3, 4].includes(value.version) ||
        ['gear', 'myApps', 'attachments'].some((key) => value[key] !== undefined && !plain(value[key])) ||
        ['releaseQueue', 'discardQueue'].some((key) => value[key] !== undefined && !Array.isArray(value[key]))) {
      throw new Error(`port_storage_invalid:${ASSET_METADATA_KEY}`);
    }
    for (const [bucket, assetKey] of [['gear', 'final'], ['myApps', 'final'], ['attachments', 'asset']]) {
      for (const entry of Object.values(value[bucket] || {})) {
        if (!plain(entry) || (entry.published != null &&
            (!plain(entry.published) || entry.published.availability !== 'available' ||
              typeof entry.published[assetKey]?.assetId !== 'string'))) {
          throw new Error(`port_storage_invalid:${ASSET_METADATA_KEY}`);
        }
      }
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
  function itemValues(value, fallbackKey = 'items', storageKey = fallbackKey) {
    if (!plain(value) || !Array.isArray(value[fallbackKey])) throw new Error(`port_storage_invalid:${storageKey}`);
    const ids = new Set();
    for (const item of value[fallbackKey]) {
      if (!plain(item) || typeof item.id !== 'string' || !SAFE_ID.test(item.id) || ids.has(item.id)) {
        throw new Error(`port_storage_invalid:${storageKey}`);
      }
      ids.add(item.id);
      assertSafe(item);
    }
    return value[fallbackKey];
  }
  const COLLECTION_VERSIONS = Object.freeze({
    'cruisePort.metronomePresets': [1], 'cruisePort.practiceCalendar': [1, 2],
    'cruisePort.practiceMenus': [1, 2, 3], 'cruisePort.practiceHistory': [1, 2, 3, 4, 5],
    'cruisePort.gearCategories': [1], 'cruisePort.gearList': [1, 2, 3, 4, 5],
    'cruisePort.myApps': [1, 2, 3, 4, 5, 6, 7]
  });
  function collection(storage, key, fallbackKey = 'items') {
    const value = parse(storage, key, { version: COLLECTION_VERSIONS[key].at(-1), [fallbackKey]: [] });
    if (!plain(value) || !COLLECTION_VERSIONS[key].includes(value.version)) {
      throw new Error(`port_storage_invalid:${key}`);
    }
    const items = itemValues(value, fallbackKey, key);
    if (key === 'cruisePort.myApps') {
      for (const item of items) {
        if ((Object.hasOwn(item, 'urls') && (!plain(item.urls) ||
              !['ios', 'android', 'macos', 'windows', 'web'].every((platform) => typeof item.urls[platform] === 'string'))) ||
            (value.version >= 6 && Object.hasOwn(item, 'iconPresetKey') &&
              item.iconPresetKey !== null && typeof item.iconPresetKey !== 'string')) {
          throw new Error(`port_storage_invalid:${key}`);
        }
      }
    }
    return value;
  }
  function recordKey(record) { return `${record?.recordType || ''}/${record?.recordId || ''}`; }
  function canDeleteRecord(storage, key, previous) {
    const guarded = new Set(['metronome_preset', 'calendar_event', 'practice_menu',
      'practice_history_event', 'gear_category', 'gear_item', 'my_app']);
    const type = String(key).split('/')[0];
    const orderType = ORDER_ITEM_TYPES[type];
    if (!guarded.has(type) && !orderType) return true;
    let intents;
    try { intents = JSON.parse(storage.getItem(DELETION_INTENT_KEY) || '{}'); } catch (_) { return false; }
    if (!plain(intents)) return false;
    if (guarded.has(type)) return intents[key] === true;
    if (intents[key] === true) return true;
    const ids = previous?.payload?.value;
    return Array.isArray(ids) && ids.length > 0 && ids.every((id) => intents[`${orderType}/${id}`] === true);
  }
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
    const gearItems = itemValues(collection(storage, 'cruisePort.gearList'));
    const appItems = itemValues(collection(storage, 'cruisePort.myApps'));
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
    root.validateLocalStorage?.(storage);
    const records = [];
    const assets = assetMetadata(storage);
    SINGLETONS.forEach(([key, type, id]) => {
      const value = parse(storage, key);
      if (value != null) records.push(record(type, id, value));
    });
    const presets = collection(storage, 'cruisePort.metronomePresets');
    itemValues(presets).forEach((item, index) => records.push(record('metronome_preset', item.id, { item, order: index })));
    const calendar = collection(storage, 'cruisePort.practiceCalendar', 'notes');
    itemValues(calendar, 'notes').forEach((item) => records.push(record('calendar_event', item.id, item)));
    const menus = collection(storage, 'cruisePort.practiceMenus');
    itemValues(menus).forEach((item, index) => records.push(record('practice_menu', item.id, item)));
    if (itemValues(menus).length) records.push(record('practice_menu_order', 'default', itemValues(menus).map(({ id }) => id)));
    Object.entries(assets.attachments || {}).forEach(([logicalId, entry]) => {
      if (entry?.published?.availability !== 'available' || !entry.published.asset?.assetId) return;
      records.push(record('practice_attachment', logicalId, {
        practiceId: entry.practiceId,
        // Asset prepare normalizes user-supplied filenames to NFC. Keep the
        // structured reference byte-for-byte aligned with that authoritative
        // metadata so decomposed iOS filenames remain valid Worker payloads.
        fileName: entry.published.asset.originalFilename || entry.fileName, kind: entry.kind,
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
    const history = collection(storage, 'cruisePort.practiceHistory', 'events');
    itemValues(history, 'events').forEach((item) => records.push(record('practice_history_event', item.id, item)));
    const categories = collection(storage, 'cruisePort.gearCategories', 'categories');
    itemValues(categories, 'categories').forEach((item) => records.push(record('gear_category', item.id, item)));
    if (itemValues(categories, 'categories').length) {
      records.push(record('gear_category_order', 'default', itemValues(categories, 'categories').map(({ id }) => id)));
    }
    const gear = collection(storage, 'cruisePort.gearList');
    itemValues(gear).forEach((item) => records.push(record('gear_item', item.id, {
      item: without(item, ['photoId', 'photoSourceId', 'photoCrop']), asset: assetFor(item, 'gear', assets)
    })));
    ['owned', 'wishlist', 'sold'].forEach((status) => {
      const ids = itemValues(gear).filter((item) => item.status === status)
        .sort((left, right) => Number(left.order || 0) - Number(right.order || 0)).map(({ id }) => id);
      if (ids.length) records.push(record('gear_order', status, ids));
    });
    const myApps = collection(storage, 'cruisePort.myApps');
    itemValues(myApps).forEach((item) => records.push(record('my_app', item.id, {
      item: without(normalizeMyAppItem(item), ['iconId', 'iconSourceId', 'iconCrop']), asset: assetFor(item, 'app', assets)
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
      const normalized = clone(item);
      const value = normalized.payload.value;
      if (normalized.recordType === 'gear_item' && plain(value?.item) && value.item.manufacturer === undefined) {
        value.item.manufacturer = '';
      }
      if (normalized.recordType === 'my_app' && plain(value?.item)) value.item = normalizeMyAppItem(value.item);
      if (normalized.recordType === 'my_app' && plain(value?.item)) {
        const urls = [value.item.url, ...Object.values(value.item.urls || {}),
          ...Object.values(value.item.customLaunch || {})].filter((url) => typeof url === 'string' && url !== '');
        if (urls.some((url) => !url.startsWith('https://'))) throw new Error('port_record_invalid');
      }
      if (normalized.recordType === 'practice_history_event' && value?.type === 'practice-session'
          && value.pauseIntervals === undefined) value.pauseIntervals = [];
      return normalized;
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
  function mergeDisjointOrder(localRecord, remoteRecord, localRecords, remoteRecords) {
    const itemType = ORDER_ITEM_TYPES[localRecord?.recordType];
    const localOrder = localRecord?.payload?.value;
    const remoteOrder = remoteRecord?.payload?.value;
    if (!itemType || !Array.isArray(localOrder) || !Array.isArray(remoteOrder)) return null;
    const remoteIds = new Set(remoteOrder);
    if (localOrder.some((id) => remoteIds.has(id))) return null;
    const localItems = new Set(localRecords.filter((item) => item.recordType === itemType).map((item) => item.recordId));
    const remoteItems = new Set(remoteRecords.filter((item) => item.recordType === itemType).map((item) => item.recordId));
    if (!localOrder.every((id) => localItems.has(id)) || !remoteOrder.every((id) => remoteItems.has(id))) return null;
    return {
      ...clone(remoteRecord),
      payload: { ...clone(remoteRecord.payload), value: [...remoteOrder, ...localOrder] }
    };
  }
  function mergeSnapshots(localSnapshot, remoteSnapshot) {
    const local = normalizeSnapshot(localSnapshot); const remote = normalizeSnapshot(remoteSnapshot);
    const merged = new Map(remote.records.map((item) => [keyOf(item), item]));
    const conflicts = [];
    local.records.forEach((item) => {
      const current = merged.get(keyOf(item));
      if (current && canonical(current.payload) !== canonical(item.payload)) {
        const combinedOrder = mergeDisjointOrder(item, current, local.records, remote.records);
        if (combinedOrder) merged.set(keyOf(item), combinedOrder);
        else conflicts.push({ recordKey: keyOf(item), reason: 'same_record_changed' });
      } else merged.set(keyOf(item), item);
    });
    return { snapshot: normalizeSnapshot({ schemaVersion: SCHEMA_VERSION, records: [...merged.values()] }), conflicts };
  }
  function prepareRemoteResolutionSnapshot(snapshot, { recordKey: selectedKey, localRecord } = {}) {
    const normalized = normalizeSnapshot(snapshot);
    const records = new Map(normalized.records.map((item) => [keyOf(item), item]));
    const selected = records.get(selectedKey);
    const itemType = ORDER_ITEM_TYPES[selected?.recordType];
    if (!selected || !itemType || !Array.isArray(selected.payload?.value)) return normalized;

    const availableIds = normalized.records.filter((item) => {
      if (item.recordType !== itemType) return false;
      if (selected.recordType !== 'gear_order') return true;
      return item.payload?.value?.item?.status === selected.recordId;
    }).map((item) => item.recordId);
    const available = new Set(availableIds);
    const preferred = selected.payload.value.filter((id) => available.has(id));
    const previous = Array.isArray(localRecord?.payload?.value)
      ? localRecord.payload.value.filter((id) => available.has(id)) : [];
    const mergedOrder = [...new Set([...preferred, ...previous, ...availableIds])];
    records.set(selectedKey, {
      ...clone(selected), payload: { ...clone(selected.payload), value: mergedOrder }
    });
    return normalizeSnapshot({ ...normalized, records: [...records.values()] });
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
  async function applyRemoteSnapshot(storage, snapshot, previousRecords = [], expectedSnapshot = null) {
    if (expectedSnapshot && canonical(normalizeSnapshot(readLocalSnapshot(storage))) !==
        canonical(normalizeSnapshot(expectedSnapshot))) {
      const error = new Error('local_changed_during_apply');
      error.code = 'local_changed_during_apply';
      throw error;
    }
    const before = new Map(MANAGED_KEYS.map((key) => [key, storage.getItem(key)]));
    const normalized = normalizeSnapshot(snapshot);
    const currentGear = itemValues(collection(storage, 'cruisePort.gearList'));
    const currentApps = itemValues(collection(storage, 'cruisePort.myApps'));
    const currentAssets = assetMetadata(storage);
    const repairs = findAssetReferenceRepairs(storage, normalized.records, previousRecords);
    const currentHistory = collection(storage, 'cruisePort.practiceHistory', 'events');
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
      version: 5, events: byType(normalized, 'practice_history_event').map((item) => {
        const event = item.payload.value;
        return event.type === 'practice-session' && !Array.isArray(event.pauseIntervals)
          ? { ...event, pauseIntervals: [] } : event;
      }),
      ...(currentHistory.activeSessionTiming ? { activeSessionTiming: currentHistory.activeSessionTiming } : {})
    });
    write(storage, 'cruisePort.gearCategories', { version: 1, categories: ordered(normalized, 'gear_category', 'gear_category_order').map((item) => item.payload.value) });
    const gearRank = new Map();
    byType(normalized, 'gear_order').forEach((order) => order.payload.value.forEach((id, index) => gearRank.set(id, index)));
    write(storage, 'cruisePort.gearList', { version: 5, items: byType(normalized, 'gear_item').map((entry) => {
      const local = currentGear.find((item) => item.id === entry.recordId);
      const metadataEntry = currentAssets.gear[entry.recordId] || {};
      const repair = repairs.gear.has(entry.recordId);
      metadataEntry.published = entry.payload.value.asset?.availability === 'available'
        ? clone(entry.payload.value.asset) : repair ? metadataEntry.published : null;
      if (metadataEntry.binding?.final?.assetId !== metadataEntry.published?.final?.assetId) metadataEntry.binding = null;
      currentAssets.gear[entry.recordId] = metadataEntry;
      const value = repair ? { ...entry.payload.value, asset: clone(metadataEntry.published) } : entry.payload.value;
      const restored = restoreAsset(value, local, 'gear', metadataEntry);
      return { ...restored, manufacturer: restored.manufacturer ?? '', order: gearRank.get(entry.recordId) ?? 0 };
    }) });
    write(storage, 'cruisePort.myApps', { version: 7, items: ordered(normalized, 'my_app', 'my_app_order').map((entry) => {
      const local = currentApps.find((item) => item.id === entry.recordId);
      const metadataEntry = currentAssets.myApps[entry.recordId] || {};
      const repair = repairs.myApps.has(entry.recordId);
      metadataEntry.published = entry.payload.value.asset?.availability === 'available'
        ? clone(entry.payload.value.asset) : repair ? metadataEntry.published : null;
      if (metadataEntry.binding?.final?.assetId !== metadataEntry.published?.final?.assetId) metadataEntry.binding = null;
      currentAssets.myApps[entry.recordId] = metadataEntry;
      const value = repair ? { ...entry.payload.value, asset: clone(metadataEntry.published) } : entry.payload.value;
      return normalizeMyAppItem(restoreAsset(value, local, 'app', metadataEntry));
    }) });
    write(storage, ASSET_METADATA_KEY, currentAssets);
    const changedKeys = MANAGED_KEYS.filter((key) => storage.getItem(key) !== before.get(key));
    root.acceptRemoteStorageValues?.(storage, changedKeys);
    const changed = changedKeys.length > 0;
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
  const CONFLICT_LABELS = Object.freeze({
    settings: '設定', metronome_settings: 'メトロノーム', metronome_preset: 'メトロノーム',
    tuner_settings: 'チューナー設定', calendar_event: '音楽カレンダー', practice_menu: '練習メニュー',
    practice_menu_order: '練習メニューの並び順', practice_attachment: '練習メニューの添付ファイル',
    practice_attachment_set: '練習メニューの添付ファイル', practice_cycle: '練習サイクル',
    practice_history_event: '練習履歴', gear_category: '機材カテゴリ',
    gear_category_order: '機材カテゴリの並び順', gear_item: '機材リスト',
    gear_order: '機材リストの並び順', my_app: 'My Apps', my_app_order: 'My Appsの並び順'
  });
  function conflictTimestamp(record) {
    if (!record) return null;
    if (isDeleted(record)) return record.deletedAt || null;
    const value = record.payload?.value;
    const candidate = value?.item?.updatedAt ?? value?.updatedAt;
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) return candidate;
    if (typeof candidate === 'string' && Number.isFinite(Date.parse(candidate))) return candidate;
    return null;
  }
  function getConflictPresentation({ localRecord, remoteRecord }) {
    const type = localRecord?.recordType || remoteRecord?.recordType || 'port';
    const localValue = localRecord?.payload?.value;
    const remoteValue = remoteRecord?.payload?.value;
    const name = localValue?.item?.name || remoteValue?.item?.name || localValue?.name || remoteValue?.name ||
      localValue?.fileName || remoteValue?.fileName || CONFLICT_LABELS[type] || 'Cruise Portデータ';
    const localLive = localRecord && !isDeleted(localRecord);
    const remoteLive = remoteRecord && !isDeleted(remoteRecord);
    return { appName: 'Cruise Port', title: CONFLICT_LABELS[type] || 'Cruise Portデータ', name: String(name),
      localUpdatedAt: conflictTimestamp(localRecord), remoteUpdatedAt: conflictTimestamp(remoteRecord), fields: [{
      label: '状態', local: localLive ? '保存済み' : '削除済み',
      remote: remoteLive ? '保存済み' : '削除済み'
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
    canDeleteRecord(key, previous) { return canDeleteRecord(this.storage, key, previous); }
    mergeSnapshots(local, remote) { return mergeSnapshots(local, remote); }
    primeRemoteReferences(records) { this.remoteReferenceRecords = clone(records || []); }
    reconcileRemoteReferences(records) {
      const repaired = reconcileRemoteAssetReferences(this.storage, records, this.remoteReferenceRecords);
      this.remoteReferenceRecords = clone(records || []);
      return repaired;
    }
    async applyRemoteSnapshot(value, options = {}) {
      const result = await applyRemoteSnapshot(this.storage, value, this.remoteReferenceRecords, options?.expectedSnapshot);
      this.remoteApplyChanged = this.remoteApplyChanged || result.changed;
      return result;
    }
    consumeRemoteApplyChanged() {
      const changed = this.remoteApplyChanged;
      this.remoteApplyChanged = false;
      return changed;
    }
    computeManifest(value) { return computeManifest(value, this.cryptoImpl); }
    prepareRemoteResolutionSnapshot(value, context) { return prepareRemoteResolutionSnapshot(value, context); }
    getConflictPresentation(context) { return getConflictPresentation(context); }
    assertDataPlaneContext(context) { return assertDataPlaneContext(context); }
  }

  Object.assign(root, {
    APP_ID, SCHEMA_VERSION, MANAGED_KEYS, ASSET_METADATA_KEY, PortSyncAdapter,
    readLocalSnapshot, normalizeLocalSnapshot: normalizeSnapshot, serializeRecords,
    deserializeRecords, mergeSnapshots, applyRemoteSnapshot, computeManifest,
    assertDataPlaneContext, getConflictPresentation, reconcileRemoteAssetReferences,
    prepareRemoteResolutionSnapshot
  });
})(globalThis);
