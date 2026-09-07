import { normalizeDisplaySize } from './settings-store.js';

export function applyHomeDisplaySize(homeView, displaySize) {
    const normalized = normalizeDisplaySize(displaySize);
    homeView.dataset.displaySize = normalized;
    return normalized;
}
