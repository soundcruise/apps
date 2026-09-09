import { normalizeDisplaySize, normalizeSectionOrder } from './settings-store.js?v=0.25.0';

export function applyHomeDisplaySize(homeView, displaySize) {
    const normalized = normalizeDisplaySize(displaySize);
    homeView.dataset.displaySize = normalized;
    return normalized;
}

export function applyHomeSectionOrder(homeView, order) {
    for (const key of normalizeSectionOrder(order)) {
        const section = homeView.querySelector(`[data-home-section="${key}"]`);
        if (section) homeView.append(section);
    }
}
