import { getCapabilities } from './cruise-port-capabilities.js?v=0.26.0';
import { loadMyApps } from './my-apps-store.js?v=0.24.0';

export function canCreateMyApp(items, capabilities = getCapabilities()) {
    return items.length < capabilities.myAppsCreateLimit;
}

// A read-only facade preserves the editor's original conflict snapshot.
export function checkMyAppsCreation(storage, capabilities = getCapabilities()) {
    const latest = loadMyApps({ getItem: key => (storage ?? globalThis.localStorage).getItem(key) });
    return { ...latest, allowed: latest.ok && canCreateMyApp(latest.items, capabilities) };
}
