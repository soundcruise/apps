import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { manifestHash as workerManifestHash } from '../../workers/sound-cruise-sync/src/records.js';

const source = fs.readFileSync(new URL('./port-sync-adapter.js', import.meta.url), 'utf8');

function storage(values = {}) {
  const data = new Map(Object.entries(values));
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    value: (key) => data.get(key),
    has: (key) => data.has(key)
  };
}

function load(targetStorage) {
  const context = { crypto: webcrypto, TextEncoder, structuredClone, localStorage: targetStorage };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.SoundCruisePortSync;
}

test('Port adapter emits item records without binary or device-local asset identifiers', async () => {
  const target = storage({
    'cruisePort.settings': JSON.stringify({ version: 3, displaySize: 'small' }),
    'cruisePort.gearList': JSON.stringify({ version: 4, items: [{
      id: 'gear-1', name: 'Guitar', status: 'owned', order: 0,
      photoId: 'local-photo', photoSourceId: 'local-source', photoCrop: { x: 0.2 }
    }] }),
    'cruisePort.myApps': JSON.stringify({ version: 6, items: [{
      id: 'app-1', name: 'Music', url: 'https://example.com/', iconPresetKey: null,
      iconId: 'local-icon', iconSourceId: 'local-icon-source', iconCrop: { scale: 1 }
    }] }),
    'cruisePort.practiceHistory': JSON.stringify({ version: 4, events: [{ id: 'event-1', type: 'cycle-completed' }], activeSessionTiming: { sessionId: 'running' } }),
    'cruisePort.practiceTimer': JSON.stringify({ running: true, secretDeviceTick: 44 })
  });
  const api = load(target);
  const snapshot = api.readLocalSnapshot(target);
  const records = await api.serializeRecords(snapshot);
  const serialized = JSON.stringify(records);
  assert.equal(serialized.includes('local-photo'), false);
  assert.equal(serialized.includes('local-source'), false);
  assert.equal(serialized.includes('local-icon'), false);
  assert.equal(serialized.includes('activeSessionTiming'), false);
  assert.equal(serialized.includes('practiceTimer'), false);
  assert.equal(records.some((item) => item.recordType === 'gear_item'), true);
  assert.equal(records.some((item) => item.recordType === 'my_app'), true);
  assert.equal(records.every((item) => /^[a-f0-9]{64}$/u.test(item.payloadHash)), true);
});

test('Port manifest exactly matches the Worker migration-complete contract', async () => {
  const target = storage({
    'cruisePort.gearList': JSON.stringify({ version: 4, items: [
      { id: 'gear-b', name: 'B', status: 'owned', order: 1 },
      { id: 'gear-a', name: 'A', status: 'owned', order: 0 }
    ] })
  });
  const api = load(target);
  const adapter = new api.PortSyncAdapter({ storage: target, cryptoImpl: webcrypto });
  const snapshot = adapter.readLocalSnapshot();
  const records = await adapter.serializeRecords(snapshot);
  assert.equal(
    await adapter.computeManifest(snapshot),
    await workerManifestHash(records, snapshot.schemaVersion, webcrypto, 'port')
  );
});

test('Port hydrate keeps this environment asset IDs and running timer while applying text metadata', async () => {
  const timer = JSON.stringify({ running: true, startedAt: 123 });
  const target = storage({
    'cruisePort.gearList': JSON.stringify({ version: 4, items: [{
      id: 'gear-1', name: 'Old', status: 'owned', order: 0,
      photoId: 'local-photo', photoSourceId: 'local-source', photoCrop: { x: 0 }
    }] }),
    'cruisePort.myApps': JSON.stringify({ version: 6, items: [] }),
    'cruisePort.practiceHistory': JSON.stringify({ version: 4, events: [], activeSessionTiming: { sessionId: 'running', startedAt: '2026-01-01T00:00:00.000Z', lastCheckedAt: '2026-01-01T00:00:01.000Z' } }),
    'cruisePort.practiceTimer': timer
  });
  const api = load(target);
  const adapter = new api.PortSyncAdapter({ storage: target, cryptoImpl: webcrypto });
  const snapshot = { schemaVersion: 1, records: [
    { recordType: 'gear_item', recordId: 'gear-1', schemaVersion: 1, payload: { id: 'gear-1', value: {
      item: { id: 'gear-1', name: 'Cloud', status: 'owned', order: 0 }, asset: { present: true, crop: { x: 0.5 } }
    } } },
    { recordType: 'gear_order', recordId: 'owned', schemaVersion: 1, payload: { id: 'owned', value: ['gear-1'] } },
    { recordType: 'practice_history_event', recordId: 'event-2', schemaVersion: 1, payload: { id: 'event-2', value: { id: 'event-2', type: 'cycle-completed' } } }
  ] };
  const firstApply = await adapter.applyRemoteSnapshot(snapshot);
  const gear = JSON.parse(target.value('cruisePort.gearList')).items[0];
  assert.equal(gear.name, 'Cloud');
  assert.equal(gear.photoId, 'local-photo');
  assert.equal(gear.photoSourceId, 'local-source');
  assert.deepEqual(gear.photoCrop, { x: 0.5 });
  assert.equal(target.value('cruisePort.practiceTimer'), timer);
  assert.equal(JSON.parse(target.value('cruisePort.practiceHistory')).activeSessionTiming.sessionId, 'running');
  assert.equal(firstApply.changed, true);
  assert.equal(adapter.consumeRemoteApplyChanged(), true);
  assert.equal(adapter.consumeRemoteApplyChanged(), false);
  const duplicateApply = await adapter.applyRemoteSnapshot(snapshot);
  assert.equal(duplicateApply.changed, false);
  assert.equal(adapter.consumeRemoteApplyChanged(), false);
});

test('Port merge safe-stops only same-record divergence', () => {
  const api = load(storage());
  const item = (id, value) => ({ recordType: 'practice_menu', recordId: id, schemaVersion: 1, payload: { id, value } });
  const merged = api.mergeSnapshots(
    { schemaVersion: 1, records: [item('menu-a', { name: 'Local' })] },
    { schemaVersion: 1, records: [item('menu-a', { name: 'Remote' }), item('menu-b', { name: 'Remote B' })] }
  );
  assert.deepEqual(JSON.parse(JSON.stringify(merged.conflicts)), [{ recordKey: 'practice_menu/menu-a', reason: 'same_record_changed' }]);
  assert.equal(merged.snapshot.records.length, 2);
});

test('practice attachments serialize only logical metadata and hydrate without binary download', async () => {
  const logicalId = '123e4567-e89b-42d3-a456-426614174100';
  const asset = {
    assetId: '223e4567-e89b-42d3-a456-426614174100', kind: 'practice_attachment_pdf',
    hash: 'a'.repeat(64), mime: 'application/pdf', byteSize: 20, width: 1, height: 1,
    objectVersion: 1, availability: 'available', ownerRecordId: 'practice-a', originalFilename: 'score.pdf'
  };
  const sourceStorage = storage({
    'cruisePort.practiceMenus': JSON.stringify({ version: 3, items: [{ id: 'practice-a', name: 'A' }] }),
    'cruisePort.syncAssetMetadata': JSON.stringify({
      version: 3, gear: {}, myApps: {}, attachments: {
        [logicalId]: {
          practiceId: 'practice-a', kind: 'file', mimeType: 'application/pdf', fileName: 'score.pdf', byteSize: 20,
          createdAt: '2026-09-18T01:00:00.000Z', updatedAt: '2026-09-18T01:00:00.000Z',
          published: { version: 1, availability: 'available', asset },
          binding: { assetId: asset.assetId, hash: asset.hash, localId: 'device-local-id' }, pending: null
        }
      }, releaseQueue: [], discardQueue: []
    })
  });
  const api = load(sourceStorage);
  const snapshot = api.readLocalSnapshot(sourceStorage);
  const attachment = snapshot.records.find((record) => record.recordType === 'practice_attachment');
  const set = snapshot.records.find((record) => record.recordType === 'practice_attachment_set');
  assert.equal(attachment.recordId, logicalId);
  assert.equal(JSON.stringify(attachment).includes('device-local-id'), false);
  assert.equal(JSON.stringify(attachment).includes('blob'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(set.payload.value)), [logicalId]);

  const target = storage({
    'cruisePort.syncAssetMetadata': JSON.stringify({ version: 3, gear: {}, myApps: {}, attachments: {}, releaseQueue: [], discardQueue: [] })
  });
  await api.applyRemoteSnapshot(target, snapshot);
  const hydrated = JSON.parse(target.value('cruisePort.syncAssetMetadata'));
  assert.equal(hydrated.attachments[logicalId].published.asset.assetId, asset.assetId);
  assert.equal(hydrated.attachments[logicalId].binding, undefined);
  assert.equal(Object.hasOwn(hydrated.attachments[logicalId], 'blob'), false);
});

test('concurrent edits to the same practice attachment set safe-stop as one semantic conflict', () => {
  const api = load(storage());
  const set = (ids) => ({
    recordType: 'practice_attachment_set', recordId: 'practice-a', schemaVersion: 1,
    payload: { id: 'practice-a', value: ids }
  });
  const localId = '123e4567-e89b-42d3-a456-426614174101';
  const remoteId = '223e4567-e89b-42d3-a456-426614174101';
  const result = api.mergeSnapshots(
    { schemaVersion: 1, records: [set([localId])] },
    { schemaVersion: 1, records: [set([remoteId])] }
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result.conflicts)), [{
    recordKey: 'practice_attachment_set/practice-a', reason: 'same_record_changed'
  }]);
});

test('Port adapter rejects secret-shaped and data URL payloads', () => {
  const api = load(storage());
  assert.throws(() => api.normalizeLocalSnapshot({ schemaVersion: 1, records: [{
    recordType: 'settings', recordId: 'global', schemaVersion: 1,
    payload: { id: 'global', value: { recoveryCode: 'forbidden' } }
  }] }), /blocked/u);
  assert.throws(() => api.normalizeLocalSnapshot({ schemaVersion: 1, records: [{
    recordType: 'settings', recordId: 'global', schemaVersion: 1,
    payload: { id: 'global', value: { image: 'data:image/png;base64,AAAA' } }
  }] }), /invalid/u);
});

test('Port adapter round-trips every structured record family and preserves ordering', async () => {
  const target = storage({
    'cruisePort.settings': JSON.stringify({ version: 3, displaySize: 'small' }),
    'cruisePort.metronome': JSON.stringify({ version: 3, bpm: 96 }),
    'cruisePort.tuner': JSON.stringify({ version: 1, referenceHz: 442 }),
    'cruisePort.metronomePresets': JSON.stringify({ version: 1, items: [
      { id: 'preset-b', name: 'B' }, { id: 'preset-a', name: 'A' }
    ] }),
    'cruisePort.practiceCalendar': JSON.stringify({ version: 2, notes: [{ id: 'calendar-1', text: '予定' }] }),
    'cruisePort.practiceMenus': JSON.stringify({ version: 3, items: [
      { id: 'menu-b', name: 'B' }, { id: 'menu-a', name: 'A' }
    ] }),
    'cruisePort.practiceProgress': JSON.stringify({ version: 2, cycleId: 'cycle-1' }),
    'cruisePort.practiceHistory': JSON.stringify({ version: 4, events: [{ id: 'history-1', type: 'practice-completed' }] }),
    'cruisePort.gearCategories': JSON.stringify({ version: 1, categories: [
      { id: 'category-b', name: 'B' }, { id: 'category-a', name: 'A' }
    ] }),
    'cruisePort.gearList': JSON.stringify({ version: 4, items: [
      { id: 'gear-b', name: 'B', status: 'owned', order: 0 },
      { id: 'gear-a', name: 'A', status: 'wishlist', order: 0 }
    ] }),
    'cruisePort.myApps': JSON.stringify({ version: 6, items: [
      { id: 'app-b', name: 'B' }, { id: 'app-a', name: 'A' }
    ] })
  });
  const api = load(target);
  const snapshot = api.readLocalSnapshot(target);
  const types = new Set(snapshot.records.map((item) => item.recordType));
  for (const type of [
    'settings', 'metronome_settings', 'metronome_preset', 'tuner_settings',
    'calendar_event', 'practice_menu', 'practice_menu_order', 'practice_cycle',
    'practice_history_event', 'gear_category', 'gear_category_order', 'gear_item',
    'gear_order', 'my_app', 'my_app_order'
  ]) assert.equal(types.has(type), true, type);

  const empty = storage({
    'cruisePort.practiceTimer': JSON.stringify({ version: 1, running: true, sessionId: 'local', startedAt: '2026-01-01T00:00:00.000Z' })
  });
  await api.applyRemoteSnapshot(empty, snapshot);
  assert.deepEqual(JSON.parse(empty.value('cruisePort.metronomePresets')).items.map((item) => item.id), ['preset-b', 'preset-a']);
  assert.deepEqual(JSON.parse(empty.value('cruisePort.practiceMenus')).items.map((item) => item.id), ['menu-b', 'menu-a']);
  assert.deepEqual(JSON.parse(empty.value('cruisePort.gearCategories')).categories.map((item) => item.id), ['category-b', 'category-a']);
  assert.deepEqual(JSON.parse(empty.value('cruisePort.myApps')).items.map((item) => item.id), ['app-b', 'app-a']);
  assert.equal(JSON.parse(empty.value('cruisePort.practiceTimer')).sessionId, 'local');
});
