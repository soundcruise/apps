export const MY_APPS_CROP_VIEW_SIZE = 320;
export const MY_APPS_CROP_MAX_ZOOM_MULTIPLIER = 6;

export function isValidIconCrop(crop) {
    return Boolean(
        crop
        && typeof crop === 'object'
        && !Array.isArray(crop)
        && Object.keys(crop).length === 3
        && ['x', 'y', 'size'].every((key) => Object.hasOwn(crop, key))
        && Number.isFinite(crop.x)
        && Number.isFinite(crop.y)
        && Number.isFinite(crop.size)
        && crop.x >= 0
        && crop.x <= 1
        && crop.y >= 0
        && crop.y <= 1
        && crop.size > 0
        && crop.size <= 1
    );
}

function requirePositive(value) {
    if (!(value > 0) || !Number.isFinite(value)) throw new TypeError('invalid-crop-dimensions');
    return value;
}

export function calculateMinimumCoverScale(sourceWidth, sourceHeight, cropSize = MY_APPS_CROP_VIEW_SIZE) {
    requirePositive(sourceWidth);
    requirePositive(sourceHeight);
    requirePositive(cropSize);
    return Math.max(cropSize / sourceWidth, cropSize / sourceHeight);
}

export function clampCropPosition(state) {
    const scaledWidth = state.sourceWidth * state.scale;
    const scaledHeight = state.sourceHeight * state.scale;
    return Object.freeze({
        ...state,
        offsetX: Math.min(0, Math.max(state.cropSize - scaledWidth, state.offsetX)),
        offsetY: Math.min(0, Math.max(state.cropSize - scaledHeight, state.offsetY))
    });
}

export function createInitialCropState(sourceWidth, sourceHeight, {
    cropSize = MY_APPS_CROP_VIEW_SIZE,
    maximumMultiplier = MY_APPS_CROP_MAX_ZOOM_MULTIPLIER
} = {}) {
    const minScale = calculateMinimumCoverScale(sourceWidth, sourceHeight, cropSize);
    const maxScale = minScale * requirePositive(maximumMultiplier);
    return clampCropPosition({
        sourceWidth,
        sourceHeight,
        cropSize,
        minScale,
        maxScale,
        scale: minScale,
        offsetX: (cropSize - sourceWidth * minScale) / 2,
        offsetY: (cropSize - sourceHeight * minScale) / 2
    });
}

export function cropStateToMetadata(state) {
    const sourceCropSize = state.cropSize / state.scale;
    const minimumSourceDimension = Math.min(state.sourceWidth, state.sourceHeight);
    return Object.freeze({
        x: Math.min(1, Math.max(0, (-state.offsetX / state.scale) / state.sourceWidth)),
        y: Math.min(1, Math.max(0, (-state.offsetY / state.scale) / state.sourceHeight)),
        size: Math.min(1, Math.max(Number.EPSILON, sourceCropSize / minimumSourceDimension))
    });
}

export function createCropStateFromMetadata(sourceWidth, sourceHeight, crop, options = {}) {
    const initialState = createInitialCropState(sourceWidth, sourceHeight, options);
    if (!isValidIconCrop(crop)) return initialState;
    const sourceCropSize = crop.size * Math.min(sourceWidth, sourceHeight);
    const scale = Math.min(
        initialState.maxScale,
        Math.max(initialState.minScale, initialState.cropSize / sourceCropSize)
    );
    return clampCropPosition({
        ...initialState,
        scale,
        offsetX: -(crop.x * sourceWidth) * scale,
        offsetY: -(crop.y * sourceHeight) * scale
    });
}

export function moveCrop(state, deltaX, deltaY) {
    return clampCropPosition({
        ...state,
        offsetX: state.offsetX + deltaX,
        offsetY: state.offsetY + deltaY
    });
}

export function zoomCropAtPoint(state, requestedScale, focalX, focalY) {
    const scale = Math.min(state.maxScale, Math.max(state.minScale, requestedScale));
    const sourceX = (focalX - state.offsetX) / state.scale;
    const sourceY = (focalY - state.offsetY) / state.scale;
    return clampCropPosition({
        ...state,
        scale,
        offsetX: focalX - sourceX * scale,
        offsetY: focalY - sourceY * scale
    });
}

function midpoint(first, second) {
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function distance(first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y);
}

export function applyPinchGesture(state, previousPoints, currentPoints) {
    if (previousPoints.length !== 2 || currentPoints.length !== 2) return state;
    const previousDistance = distance(previousPoints[0], previousPoints[1]);
    if (!(previousDistance > 0)) return state;
    const currentDistance = distance(currentPoints[0], currentPoints[1]);
    const previousMidpoint = midpoint(previousPoints[0], previousPoints[1]);
    const currentMidpoint = midpoint(currentPoints[0], currentPoints[1]);
    const sourceX = (previousMidpoint.x - state.offsetX) / state.scale;
    const sourceY = (previousMidpoint.y - state.offsetY) / state.scale;
    const scale = Math.min(
        state.maxScale,
        Math.max(state.minScale, state.scale * (currentDistance / previousDistance))
    );
    return clampCropPosition({
        ...state,
        scale,
        offsetX: currentMidpoint.x - sourceX * scale,
        offsetY: currentMidpoint.y - sourceY * scale
    });
}

export function calculateCropDrawRect(state, outputSize = 256) {
    requirePositive(outputSize);
    const ratio = outputSize / state.cropSize;
    return Object.freeze({
        x: state.offsetX * ratio,
        y: state.offsetY * ratio,
        width: state.sourceWidth * state.scale * ratio,
        height: state.sourceHeight * state.scale * ratio
    });
}
