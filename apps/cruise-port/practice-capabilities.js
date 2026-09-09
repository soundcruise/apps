import { getCapabilities } from './cruise-port-capabilities.js?v=0.26.0';
import { loadPracticeMenus } from './practice-menu-store.js?v=0.24.0';

export function canCreatePractice(items, capabilities = getCapabilities()) {
    return items.length < capabilities.practiceMenuCreateLimit;
}

// Read current data without accepting a new snapshot for the editor's storage
// conflict guard. This facade is read-only; validation and schema stay unchanged.
export function checkPracticeCreation(storage, capabilities = getCapabilities()) {
    const latest = loadPracticeMenus({ getItem: key => (storage ?? globalThis.localStorage).getItem(key) });
    return { ...latest, allowed: latest.ok && canCreatePractice(latest.items, capabilities) };
}
