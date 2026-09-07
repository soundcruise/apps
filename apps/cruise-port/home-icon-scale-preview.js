import { normalizeIconScalePreview } from './icon-scale-preview-store.js';

export function applyHomeIconScalePreview(homeView, value) {
    const normalized = normalizeIconScalePreview(value);
    homeView.dataset.iconScalePreview = normalized;
    return normalized;
}
