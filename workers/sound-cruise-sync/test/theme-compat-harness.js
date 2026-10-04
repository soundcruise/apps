// Test harness (no tests here) for theme writer backward compatibility, end to end: the real Worker (SQLite-backed D1), the real shared
// sync runtime and the real app sync adapters. Old adapters are the ones shipped before the theme
// reader-first release; they reject a settings theme, so the Worker must hide it from clients that do
// not declare `settings_theme_v1` and keep it when they write settings.
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { handleProAuthorizedRequest as handleRequest } from './pro-entitlement-fixture.js';
import { hashRecord, manifestHash } from '../src/records.js';
import { createD1SyncRepository } from '../src/sync-database.js';
import { createSqliteD1, seedIdentity } from './sqlite-d1.js';

const ORIGIN = 'https://soundcruise.jp';
const ENDPOINT = 'https://sync.soundcruise.jp';
const USER_ID = '123e4567-e89b-42d3-a456-426614174001';
const SHARED = new URL('../../../apps/shared/sync-account/', import.meta.url);
const APPS_DIR = new URL('../../../apps/', import.meta.url);
const OLD_DIR = new URL('./fixtures/pre-theme-reader/', import.meta.url);
const READER_DIR = new URL('./fixtures/theme-reader/', import.meta.url);
const CAPABILITY = 'settings_theme_v1';
const OPEN_CONTROL = Object.freeze({
  rolloutMode: 'open', admissionEnabled: true, dataWriteEnabled: true, dataReadEnabled: true,
  recoveryEnabled: true, cloudDeleteEnabled: true, generation: 1, updatedAt: 1
});

export const CAPABILITY_THEME = 'settings_theme_v1';
export const APPS = {
  pitch: {
    current: 'pitch-cruise/sync/pitch-sync-adapter.js', old: 'pitch-sync-adapter.js.fixture',
    root: 'SoundCruisePitchSync', name: 'PitchSyncAdapter', key: 'pitchTrainerSettings',
    // The shape Pitch Pro writes on every settings save (all synced fields present).
    seed: () => ({ pitchTrainerSettings: JSON.stringify({ instrument: 'piano', notationStyle: 'cde', scaleEnabled: true,
      isAnswerMode: true, keyRandomMode: false, baseOctave: 3, keyOffset: 0, noteSpeed: 1, sustainTime: 1.5, baseHz: 440 }),
      pitchTrainerProAccidentalDisplay: 'sharp' }),
    empty: () => ({ pitchTrainerSettings: '{}' }),
    read: (data) => JSON.parse(data.get('pitchTrainerSettings')),
    write: (data, change) => { const value = JSON.parse(data.get('pitchTrainerSettings')); change(value); data.set('pitchTrainerSettings', JSON.stringify(value)); },
    other: { field: 'instrument', from: 'piano', to: 'ukulele' },
    theme: (settings) => settings.theme
  },
  fretboard: {
    current: 'fretboard_cruise/sync/fretboard-sync-adapter.js', old: 'fretboard-sync-adapter.js.fixture',
    root: 'SoundCruiseFretboardSync', name: 'FretboardSyncAdapter', key: 'fretboard_cruise_state',
    seed: () => ({ fretboard_cruise_state: JSON.stringify({ settings: { tempo: 96 } }) }),
    empty: () => ({ fretboard_cruise_state: JSON.stringify({ settings: {} }) }),
    read: (data) => JSON.parse(data.get('fretboard_cruise_state')).settings,
    write: (data, change) => { const value = JSON.parse(data.get('fretboard_cruise_state')); change(value.settings); data.set('fretboard_cruise_state', JSON.stringify(value)); },
    other: { field: 'tempo', from: 96, to: 120 },
    theme: (settings) => settings.theme
  },
  rhythm: {
    current: 'rhythm-cruise/sync/rhythm-sync-adapter.js', old: 'rhythm-sync-adapter.js.fixture',
    root: 'SoundCruiseRhythmSync', name: 'RhythmSyncAdapter', key: 'rhythmCruiseSettings',
    seed: () => ({ rhythmCruiseSettings: JSON.stringify({ tapLayout: 'ud', judgePreset: 'semiStrict' }) }),
    empty: () => ({ rhythmCruiseSettings: '{}' }),
    read: (data) => JSON.parse(data.get('rhythmCruiseSettings')),
    write: (data, change) => { const value = JSON.parse(data.get('rhythmCruiseSettings')); change(value); data.set('rhythmCruiseSettings', JSON.stringify(value)); },
    other: { field: 'judgePreset', from: 'semiStrict', to: 'strict' },
    theme: (settings) => settings.theme
  }
};

export function loadRuntime() {
  const events = new EventTarget();
  const documentEvents = new EventTarget();
  class CustomEventPolyfill extends Event { constructor(type, init = {}) { super(type); this.detail = init.detail; } }
  const context = {
    crypto: webcrypto, Headers, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout,
    structuredClone, EventTarget, Event, CustomEvent: CustomEventPolyfill, URL,
    navigator: { onLine: true }, queueMicrotask,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    document: {
      visibilityState: 'visible',
      addEventListener: documentEvents.addEventListener.bind(documentEvents),
      removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
      dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents)
    },
    SoundCruiseMultiAppSync: {},
    SoundCruiseSyncAccount: { appBackupStorage: { async save() {} } }
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(new URL('settings-field-merge.js', SHARED), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(new URL('multi-app-sync-runtime.js', SHARED), 'utf8'), context);
  return { Runtime: context.SoundCruiseMultiAppSync.MultiAppSyncRuntime, context };
}

export function memoryStore() {
  const maps = { meta: new Map(), outbox: new Map(), shadow: new Map(), conflicts: new Map() };
  return {
    readMeta: async (key) => structuredClone(maps.meta.get(key) ?? null),
    setMeta: async (key, value) => { maps.meta.set(key, structuredClone(value)); },
    removeMeta: async (key) => { maps.meta.delete(key); },
    clearCloudState: async () => { Object.values(maps).forEach((map) => map.clear()); },
    putOutbox: async (value) => { maps.outbox.set(value.operationId, structuredClone(value)); },
    listOutbox: async () => [...maps.outbox.values()].map((value) => structuredClone(value)),
    deleteOutbox: async (key) => { maps.outbox.delete(key); },
    putShadow: async (key, value) => { maps.shadow.set(key, structuredClone(value)); },
    getShadow: async (key) => structuredClone(maps.shadow.get(key) ?? null),
    listShadow: async () => [...maps.shadow.values()].map((value) => structuredClone(value)),
    deleteShadow: async (key) => { maps.shadow.delete(key); },
    putConflict: async (value) => { maps.conflicts.set(value.id, structuredClone(value)); },
    getConflict: async (key) => structuredClone(maps.conflicts.get(key) ?? null),
    listConflicts: async () => [...maps.conflicts.values()].map((value) => structuredClone(value)),
    deleteConflict: async (key) => { maps.conflicts.delete(key); }
  };
}

let deviceCounter = 0;
const deviceIdOf = (n) => `123e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}`;

// One user and one app dataset in a real SQLite D1, reachable through the real Worker.
export function world(appId) {
  const db = createSqliteD1();
  const first = deviceIdOf(++deviceCounter);
  seedIdentity(db, { appId, deviceId: first, userId: USER_ID });
  db.raw.exec('PRAGMA foreign_keys = OFF');
  db.raw.prepare(`INSERT INTO sync_account_managed_users (sync_user_id, account_id, membership_id, app_id, created_at)
    VALUES (?, 'account-1', ?, ?, 1)`).run(USER_ID, `membership-${appId}`, appId);
  db.raw.exec('PRAGMA foreign_keys = ON');
  const devices = [first];
  let clock = 1000;
  const env = {
    ALLOWED_ORIGINS: ORIGIN, SYNC_ALLOWED_APP_IDS: 'pitch,fretboard,rhythm',
    SYNC_CREDENTIAL_PEPPER: 'p'.repeat(64), SYNC_DB: db,
    SYNC_RATE_LIMITER: { limit: async () => ({ success: true }) }
  };
  const dependencies = {
    readRuntimeControl: async () => OPEN_CONTROL,
    authenticateDevice: async (_db, authorization, requestedAppId) => ({
      userId: USER_ID, deviceId: authorization.slice('Bearer '.length), appId: requestedAppId, userState: 'provisioning'
    }),
    createRepository: (session) => createD1SyncRepository(session, () => clock++)
  };
  const addDevice = () => {
    const id = devices.length === 1 && !devices.used ? first : deviceIdOf(++deviceCounter);
    if (id === first) devices.used = true;
    else {
      db.raw.prepare(`INSERT INTO sync_devices (id,user_id,app_id,credential_version,credential_verifier,label,
        last_cursor,created_at,last_seen_at,revoked_at) VALUES (?, ?, ?, 1, ?, NULL, 0, 1, 1, NULL)`)
        .run(id, USER_ID, appId, id.replace(/-/g, '').padEnd(64, 'e'));
      devices.push(id);
    }
    return id;
  };
  const fetchFor = (deviceId) => async (url, init = {}) => {
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${deviceId}`);
    headers.set('Origin', ORIGIN);
    const target = new URL(url);
    return handleRequest(new Request(`${ENDPOINT}${target.pathname}${target.search}`, {
      method: init.method || 'GET', headers, body: init.body
    }), env, null, dependencies);
  };
  const stored = () => {
    const row = db.raw.prepare(`SELECT revision, deleted_at, payload_json FROM sync_records
      WHERE user_id = ? AND app_id = ? AND record_type = 'settings' AND record_id = 'settings'`).get(USER_ID, appId);
    return row ? { revision: row.revision, deleted: row.deleted_at != null, values: row.payload_json ? JSON.parse(row.payload_json).values : null } : null;
  };
  // A capable writer device, driven through the raw protocol (used before the writer clients exist).
  const rawWriter = (deviceId) => ({
    async put(values) {
      const current = stored();
      const op = { operationId: webcrypto.randomUUID(), recordType: 'settings', recordId: 'settings', schemaVersion: 1,
        baseRevision: current?.revision || 0, payload: values ? { id: 'settings', values } : null, payloadHash: '', deleted: !values };
      op.payloadHash = await hashRecord({ ...op }, webcrypto, appId);
      const response = await fetchFor(deviceId)(`${ENDPOINT}/v1/sync/push`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, mode: 'sync', operations: [op], capabilities: [CAPABILITY] }) });
      return response.json();
    },
    async snapshot(capable = true) {
      const response = await fetchFor(deviceId)(`${ENDPOINT}/v1/sync/snapshot?appId=${appId}${capable ? `&capabilities=${CAPABILITY}` : ''}`);
      return response.json();
    }
  });
  return { db, appId, env, dependencies, addDevice, fetchFor, stored, rawWriter, close: () => db.close() };
}

// A real app device: shared runtime + an app sync adapter (old fixture, current, or a given source).
export function device(w, which, values) {
  const item = APPS[w.appId];
  const deviceId = w.addDevice();
  const { Runtime, context } = loadRuntime();
  const data = new Map(Object.entries(values ?? item.seed()));
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
  context.localStorage = storage;
  const fixture = item.current.split('/').pop() + '.fixture';
  const source = which === 'old' ? fs.readFileSync(new URL(item.old, OLD_DIR), 'utf8')
    : which === 'reader' ? fs.readFileSync(new URL(fixture, READER_DIR), 'utf8')
      : fs.readFileSync(new URL(item.current, APPS_DIR), 'utf8');
  vm.runInNewContext(source, context);
  const adapter = new context[item.root][item.name]({ storage, cryptoImpl: webcrypto });
  const store = memoryStore();
  const core = { validAppCredential: (v) => v === 'scd1.valid', validQaCredential: (v) => v === 'scq1.valid', createOperationId: () => webcrypto.randomUUID() };
  const accountClient = {
    admissionMode: 'qa',
    async consumeHandoff() { return { consumeMode: 'new_app', membershipId: `membership-${w.appId}`, membershipState: 'active', appDeviceCredential: 'scd1.valid', qaCredential: 'scq1.valid' }; },
    async consumeJoinInvitation() { return this.consumeHandoff(); },
    async confirmConsumePersisted() {}
  };
  const runtime = new Runtime({ appId: w.appId, endpoint: ENDPOINT, adapter, store, accountClient, accountCore: core,
    fetchImpl: w.fetchFor(deviceId), admissionMode: 'qa', randomOperationId: () => webcrypto.randomUUID() });
  const safe = async (fn) => { try { return await fn(); } catch (error) { return { ok: false, code: `THROW ${error.code || error.message}` }; } };
  return {
    deviceId, data, adapter, store, runtime, item,
    join: () => safe(() => runtime.consumeHandoff(`handoff-${deviceId}`)),
    sync: (reason = 'focus') => safe(() => runtime.sync(reason)),
    settings: () => item.read(data),
    change: (fn) => item.write(data, fn),
    conflicts: () => store.listConflicts()
  };
}

