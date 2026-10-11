import { DEFAULT_SETTINGS } from '../settings-store.js';
import { METRONOME_DEFAULTS } from '../metronome-store.js';
import { createMetronomePreset } from '../metronome-presets-store.js';
import { TUNER_DEFAULTS } from '../tuner-store.js';
import { createPracticeMenu, INITIAL_PRACTICE_MENU_VALUES } from '../practice-menu-store.js';
import { createEmptyPracticeProgress } from '../practice-menu-progress-store.js';
import { createCycleCompletedEvent } from '../practice-menu-history-store.js';
import { createPracticeCalendarNote, createEmptyPracticeCalendar } from '../practice-menu-calendar-store.js';
import { createPracticeMenuSet } from '../practice-menu-sets-store.js';
import { createGearItem } from '../gear-list-store.js';
import { DEFAULT_GEAR_CATEGORIES } from '../gear-category-store.js';
import { createMyApp } from '../my-apps-store.js';

// Real domain constructors keep this fixture subject to the same schemas as the UI.
export function datasetFixture() {
    const now = new Date('2026-10-10T12:00:00.000Z');
    const menus = ['Second', 'First'].map(name => createPracticeMenu({ ...INITIAL_PRACTICE_MENU_VALUES, name }, [], now));
    const gear = createGearItem({ name: 'Guitar', category: 'guitar', priceText: '', priority: 'medium', memo: '', status: 'owned' }, [], now);
    const app = createMyApp({ name: 'Practice app', url: 'https://example.com/', launchMode: 'https' }, [], now).item;
    const progress = createEmptyPracticeProgress(now);
    const presetStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    const presets = ['Second', 'First'].reduce((items, name) => createMetronomePreset({ presets: items, name, settings: METRONOME_DEFAULTS, storage: presetStorage, now: now.getTime() }).presets, []);
    const asset = { assetId: 'asset-fixture', kind: 'gear_photo_final', hash: 'a'.repeat(64), mime: 'image/webp', byteSize: 12, width: 512, height: 512, objectVersion: 1, availability: 'available' };
    return Object.fromEntries(Object.entries({
        'cruisePort.settings': { ...DEFAULT_SETTINGS, theme: 'light', futurePreference: { retained: true } },
        'cruisePort.metronome': METRONOME_DEFAULTS,
        'cruisePort.tuner': TUNER_DEFAULTS,
        'cruisePort.metronomePresets': { version: 1, items: presets },
        'cruisePort.practiceMenus': { version: 3, items: menus },
        'cruisePort.practiceProgress': progress,
        'cruisePort.practiceHistory': { version: 5, events: [createCycleCompletedEvent(progress.cycleId, now)] },
        'cruisePort.practiceCalendar': createPracticeCalendarNote(createEmptyPracticeCalendar(), { localDate: '2026-10-10', text: 'Practice' }, now).calendar,
        'cruisePort.practiceMenuSets': { version: 1, items: createPracticeMenuSet({ name: 'Set', itemIds: menus.map(item => item.id) }, [], menus, now).items },
        'cruisePort.gearList': { version: 5, items: [gear] },
        'cruisePort.gearCategories': { version: 1, categories: DEFAULT_GEAR_CATEGORIES },
        'cruisePort.myApps': { version: 7, items: [app] },
        'cruisePort.syncAssetMetadata': { version: 4, gear: { [gear.id]: { published: { version: 1, availability: 'available', final: asset, source: null, crop: null } } }, myApps: {}, attachments: {}, releaseQueue: [], discardQueue: [], referencePending: false },
        'cruisePort.schemaVersion': 3
    }).map(([key, value]) => [key, JSON.stringify(value)]));
}
