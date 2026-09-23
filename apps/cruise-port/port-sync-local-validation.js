import { loadMyApps } from './my-apps-store.js?v=0.59.2';
import { loadGearList } from './gear-list-store.js?v=0.59.2';
import { loadGearCategories } from './gear-category-store.js?v=0.59.2';
import { loadPracticeMenus } from './practice-menu-store.js?v=0.59.2';
import { loadPracticeHistory } from './practice-menu-history-store.js?v=0.59.2';
import { loadPracticeCalendar } from './practice-menu-calendar-store.js?v=0.59.2';
import { loadMetronomePresets } from './metronome-presets-store.js?v=0.59.2';

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
    const collections = [
        ['cruisePort.myApps', 'items', loadMyApps],
        ['cruisePort.gearList', 'items', loadGearList],
        ['cruisePort.gearCategories', 'categories', (target) => {
            const gear = loadGearList(target);
            return gear.ok ? loadGearCategories(gear.items, target) : null;
        }],
        ['cruisePort.practiceMenus', 'items', loadPracticeMenus],
        ['cruisePort.practiceHistory', 'events', loadPracticeHistory],
        ['cruisePort.practiceCalendar', 'notes', loadPracticeCalendar],
        ['cruisePort.metronomePresets', 'items', loadMetronomePresets]
    ];
    for (const [key, field, loader] of collections) {
        const result = loader(copy);
        if (result?.ok) continue;
        // Store loaders also enforce UI limits and display-name uniqueness.
        // Validate each record with the same store schema, without those
        // collection-wide product policies. The adapter checks stable IDs.
        let envelope;
        try { envelope = JSON.parse(storage.getItem(key)); } catch (_) { /* invalid root */ }
        if (!envelope || !Array.isArray(envelope[field])) throw new Error(`port_storage_invalid:${key}`);
        for (const item of envelope[field]) {
            const probe = inspectionCopy(storage);
            probe.setItem(key, JSON.stringify({ ...envelope, [field]: [item] }));
            if (!loader(probe)?.ok) throw new Error(`port_storage_invalid:${key}`);
        }
        const empty = inspectionCopy(storage);
        empty.setItem(key, JSON.stringify({ ...envelope, [field]: [] }));
        if (!loader(empty)?.ok) throw new Error(`port_storage_invalid:${key}`);
    }
    return true;
}
