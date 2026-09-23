import { loadMyApps } from './my-apps-store.js?v=0.58.0';
import { loadGearList } from './gear-list-store.js?v=0.58.0';
import { loadGearCategories } from './gear-category-store.js?v=0.58.0';
import { loadPracticeMenus } from './practice-menu-store.js?v=0.58.0';
import { loadPracticeHistory } from './practice-menu-history-store.js?v=0.58.0';
import { loadPracticeCalendar } from './practice-menu-calendar-store.js?v=0.58.0';
import { loadMetronomePresets } from './metronome-presets-store.js?v=0.58.0';

// Legacy loaders may migrate on read. Give them a private copy so validation
// follows the exact store rules without rewriting the user's original bytes.
function inspectionCopy(storage) {
    const changes = new Map();
    return {
        getItem(key) { return changes.has(key) ? changes.get(key) : storage.getItem(key); },
        setItem(key, value) { changes.set(key, String(value)); },
        removeItem(key) { changes.set(key, null); }
    };
}

export function validatePortLocalCollections(storage) {
    const copy = inspectionCopy(storage);
    const gear = loadGearList(copy);
    const results = [
        ['cruisePort.myApps', loadMyApps(copy)],
        ['cruisePort.gearList', gear],
        ['cruisePort.gearCategories', gear.ok ? loadGearCategories(gear.items, copy) : null],
        ['cruisePort.practiceMenus', loadPracticeMenus(copy)],
        ['cruisePort.practiceHistory', loadPracticeHistory(copy)],
        ['cruisePort.practiceCalendar', loadPracticeCalendar(copy)],
        ['cruisePort.metronomePresets', loadMetronomePresets(copy)]
    ];
    for (const [key, result] of results) {
        if (!result?.ok || (key === 'cruisePort.metronomePresets' && result.ignored > 0)) {
            throw new Error(`port_storage_invalid:${key}`);
        }
    }
    return true;
}
