import { normalizeIconScalePreview } from './icon-scale-preview-store.js';

export function applyHomeIconScalePreviews(homeView, previews = {}) {
    const normalized = {
        cruise: normalizeIconScalePreview(previews.cruise),
        simple: normalizeIconScalePreview(previews.simple)
    };
    homeView.dataset.cruiseIconScalePreview = normalized.cruise;
    homeView.dataset.simpleIconScalePreview = normalized.simple;
    return normalized;
}
