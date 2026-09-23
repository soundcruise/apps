import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPracticeMenus, savePracticeMenus } from './practice-menu-store.js';
import { loadPracticeProgress, savePracticeProgress, createEmptyPracticeProgress } from './practice-menu-progress-store.js';
import { loadPracticeHistory, savePracticeHistory, createEmptyPracticeHistory, createCycleCompletedEvent, createPracticeSessionEvent } from './practice-menu-history-store.js';
import { loadPracticeCalendar, savePracticeCalendar, createEmptyPracticeCalendar } from './practice-menu-calendar-store.js';
import { loadPracticeTimer, savePracticeTimer, createStoppedPracticeTimer } from './practice-menu-timer-store.js';
import { loadMyApps, saveMyApps } from './my-apps-store.js';
import { loadGearList, saveGearList } from './gear-list-store.js';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, clearRetiredIconScalePreviewKeys } from './settings-store.js';
import { loadMetronomeSettings, saveMetronomeSettings, METRONOME_DEFAULTS } from './metronome-store.js';
import { loadMetronomePresets, saveMetronomePresets, createMetronomePreset } from './metronome-presets-store.js';
import { loadTunerSettings, saveTunerSettings, TUNER_DEFAULTS } from './tuner-store.js';
import { createPracticeAttachmentStore } from './practice-menu-attachment-store.js';
import { createGearPhotoStore } from './gear-photo-store.js';
import { createMyAppsIconStore } from './my-apps-icon-store.js';
import { acceptRemoteStorageValues, acceptStorageValues, assertStorageUnchanged, readStorageValue } from './storage-conflict.js?v=0.59.3';

test('every storage module imports the current conflict coordinator cache key', () => {
    for (const file of [
        'practice-menu-store.js', 'practice-menu-progress-store.js',
        'practice-menu-history-store.js', 'practice-menu-calendar-store.js',
        'practice-menu-timer-store.js', 'my-apps-store.js', 'gear-list-store.js',
        'gear-category-store.js', 'settings-store.js', 'metronome-store.js',
        'metronome-presets-store.js', 'tuner-store.js'
    ]) {
        const source = readFileSync(new URL(file, import.meta.url), 'utf8');
        assert.match(source, /storage-conflict\.js\?v=0\.59\.3/, file);
    }
});

test('verified cloud applies refresh the visible app only after unsafe local activity is clear', () => {
    const source = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
    assert.match(source, /cruise-port-cloud-data-applied/u);
    assert.match(source, /pendingPortCloudRefresh/u);
    assert.match(source, /dialog\[open\].*role="dialog"/u);
    assert.match(source, /state\.timer\?\.running/u);
    assert.match(source, /reloadAppWithCacheBust\(\)/u);
});

test('blocked localStorage getter returns recoverable failures for every store, without uncaught exceptions', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
    try {
        for (const load of [loadPracticeMenus, loadPracticeProgress, loadPracticeHistory, loadPracticeCalendar, loadPracticeTimer,
            loadMyApps, loadGearList, loadSettings, loadMetronomeSettings, loadMetronomePresets, loadTunerSettings]) {
            assert.equal(load().ok, false, load.name);
        }
        for (const [save, value] of [[savePracticeMenus, []], [savePracticeProgress, createEmptyPracticeProgress()],
            [savePracticeHistory, createEmptyPracticeHistory()], [savePracticeCalendar, createEmptyPracticeCalendar()],
            [savePracticeTimer, createStoppedPracticeTimer()], [saveMyApps, []], [saveGearList, []], [saveSettings, DEFAULT_SETTINGS],
            [saveMetronomeSettings, METRONOME_DEFAULTS], [saveMetronomePresets, []], [saveTunerSettings, TUNER_DEFAULTS]]) {
            assert.equal(save(value).ok, false, save.name);
        }
        assert.equal(clearRetiredIconScalePreviewKeys(), false);
        assert.equal(createMetronomePreset({ presets: [], name: 'QA blocked', settings: METRONOME_DEFAULTS }).ok, false);
    } finally {
        if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
        else delete globalThis.localStorage;
    }
});

test('blocked IndexedDB getter fails only the requested media operation, not app initialization', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
    try {
        const attachments = createPracticeAttachmentStore();
        const gear = createGearPhotoStore();
        const icons = createMyAppsIconStore();
        assert.equal((await attachments.getAttachments('qa')).ok, false);
        assert.equal((await gear.getPhoto('qa')).ok, false);
        assert.equal((await icons.getIcon('qa')).ok, false);
    } finally {
        if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor);
        else delete globalThis.indexedDB;
    }
});

test('stale tab saves are rejected per key while independent stores and fresh reloads can save', () => {
    const values = new Map();
    const makeTab = () => ({ getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) });
    const first = makeTab(), stale = makeTab();
    for (const [load, save, initial] of [
        [loadPracticeMenus, savePracticeMenus, []],
        [loadPracticeHistory, savePracticeHistory, createEmptyPracticeHistory()],
        [loadPracticeProgress, savePracticeProgress, createEmptyPracticeProgress()],
        [loadPracticeCalendar, savePracticeCalendar, createEmptyPracticeCalendar()],
        [loadPracticeTimer, savePracticeTimer, createStoppedPracticeTimer()],
        [loadMyApps, saveMyApps, []], [loadGearList, saveGearList, []],
        [loadSettings, saveSettings, DEFAULT_SETTINGS],
        [loadMetronomeSettings, saveMetronomeSettings, METRONOME_DEFAULTS],
        [loadMetronomePresets, saveMetronomePresets, []],
        [loadTunerSettings, saveTunerSettings, TUNER_DEFAULTS]
    ]) {
        load(first); load(stale);
        assert.equal(save(initial, first).ok, true, save.name);
        const before = [...values];
        assert.equal(save(initial, stale).ok, false, `${save.name} must block the stale tab`);
        assert.deepEqual([...values], before);
        load(stale);
        assert.equal(save(initial, stale).ok, true, 'reload acknowledges current state');
    }
});

test('a verified cloud apply blocks stale in-memory writes until the page reloads', () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
    loadSettings(storage);
    storage.setItem('cruisePort.settings', JSON.stringify({ ...DEFAULT_SETTINGS, displaySize: 'small' }));
    acceptRemoteStorageValues(storage, ['cruisePort.settings']);
    assert.throws(() => assertStorageUnchanged(storage, ['cruisePort.settings']), /storage-write-conflict/u);
});

test('managed local saves notify Port sync once while verified remote applies stay silent', () => {
    const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const previousSync = globalThis.SoundCruiseMultiAppSync;
    const previousManagedKeys = globalThis.SoundCruisePortSync.MANAGED_KEYS;
    const storage = { getItem: () => null };
    const calls = [];
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    globalThis.SoundCruisePortSync.MANAGED_KEYS = ['cruisePort.settings'];
    globalThis.SoundCruiseMultiAppSync = { notifyLocalSave: (appId) => calls.push(appId) };
    try {
        acceptStorageValues(storage, ['cruisePort.settings']);
        acceptRemoteStorageValues(storage, ['cruisePort.settings']);
        assert.deepEqual(calls, ['port']);
    } finally {
        globalThis.SoundCruisePortSync.MANAGED_KEYS = previousManagedKeys;
        globalThis.SoundCruiseMultiAppSync = previousSync;
        if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
        else delete globalThis.localStorage;
    }
});

test('deferred cloud history and a timer completion append both survive', () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
    const base = createEmptyPracticeHistory();
    assert.equal(savePracticeHistory(base, storage).ok, true);
    const loaded = loadPracticeHistory(storage).history;
    const remoteEvent = createCycleCompletedEvent('remote-cycle', new Date('2026-09-23T01:00:00.000Z'));
    storage.setItem('cruisePort.practiceHistory', JSON.stringify({ ...base, events: [remoteEvent] }));
    acceptRemoteStorageValues(storage, ['cruisePort.practiceHistory']);
    const localEvent = createPracticeSessionEvent({ sessionId: 'local-session',
        startedAt: '2026-09-23T01:01:00.000Z', endedAt: '2026-09-23T01:02:00.000Z', durationSeconds: 60 });
    const candidate = { ...loaded, events: [localEvent] };
    const saved = savePracticeHistory(candidate, storage, { baseHistory: loaded });
    assert.equal(saved.ok, true);
    assert.deepEqual(new Set(saved.history.events.map((event) => event.id)), new Set([remoteEvent.id, localEvent.id]));
    assert.deepEqual(new Set(JSON.parse(storage.getItem('cruisePort.practiceHistory')).events.map((event) => event.id)),
        new Set([remoteEvent.id, localEvent.id]));
});

test('a store save records explicit deletion intent for the sync adapter', () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
    const event = createCycleCompletedEvent('cycle-1', new Date('2026-09-23T01:00:00.000Z'));
    assert.equal(savePracticeHistory({ ...createEmptyPracticeHistory(), events: [event] }, storage).ok, true);
    loadPracticeHistory(storage);
    assert.equal(savePracticeHistory(createEmptyPracticeHistory(), storage).ok, true);
    assert.equal(JSON.parse(storage.getItem('cruisePort.syncDeletionIntent.v1'))[`practice_history_event/${event.id}`], true);
});

test('deleting the last collection item records its order tombstone separately', () => {
    const values = new Map([['cruisePort.myApps', JSON.stringify({ version: 7, items: [{ id: 'app-1' }] })]]);
    const storage = { getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
    readStorageValue(storage, 'cruisePort.myApps');
    storage.setItem('cruisePort.myApps', JSON.stringify({ version: 7, items: [] }));
    acceptStorageValues(storage, ['cruisePort.myApps']);
    const intents = JSON.parse(storage.getItem('cruisePort.syncDeletionIntent.v1'));
    assert.equal(intents['my_app/app-1'], true);
    assert.equal(intents['my_app_order/default'], true);
});
