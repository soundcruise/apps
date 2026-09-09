import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPracticeMenus, savePracticeMenus } from './practice-menu-store.js';
import { loadPracticeProgress, savePracticeProgress, createEmptyPracticeProgress } from './practice-menu-progress-store.js';
import { loadPracticeHistory, savePracticeHistory, createEmptyPracticeHistory } from './practice-menu-history-store.js';
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
