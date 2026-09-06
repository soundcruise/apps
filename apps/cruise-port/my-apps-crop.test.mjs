import assert from 'node:assert/strict';
import {
    applyPinchGesture,
    calculateCropDrawRect,
    calculateMinimumCoverScale,
    createInitialCropState,
    moveCrop,
    zoomCropAtPoint
} from './my-apps-crop.js';

assert.equal(calculateMinimumCoverScale(640, 320), 1, 'landscape covers height');
assert.equal(calculateMinimumCoverScale(320, 640), 1, 'portrait covers width');
assert.equal(calculateMinimumCoverScale(640, 640), 0.5, 'square covers both axes');

const landscape = createInitialCropState(640, 320);
assert.equal(landscape.minScale, 1);
assert.equal(landscape.maxScale, 6);
assert.equal(landscape.offsetX, -160);
assert.equal(landscape.offsetY, 0);

const portrait = createInitialCropState(320, 640);
assert.equal(portrait.offsetX, 0);
assert.equal(portrait.offsetY, -160);

const square = createInitialCropState(640, 640);
assert.equal(square.offsetX, 0);
assert.equal(square.offsetY, 0);

assert.equal(moveCrop(landscape, 1000, 0).offsetX, 0, 'drag X clamps at near edge');
assert.equal(moveCrop(landscape, -1000, 0).offsetX, -320, 'drag X clamps at far edge');
assert.equal(moveCrop(portrait, 0, 1000).offsetY, 0, 'drag Y clamps at near edge');
assert.equal(moveCrop(portrait, 0, -1000).offsetY, -320, 'drag Y clamps at far edge');

const zoomed = zoomCropAtPoint(landscape, 99, 160, 160);
assert.equal(zoomed.scale, landscape.maxScale, 'zoom clamps at maximum');
assert(zoomed.offsetX <= 0 && zoomed.offsetY <= 0, 'position is clamped after zoom');

const pinched = applyPinchGesture(
    landscape,
    [{ x: 110, y: 160 }, { x: 210, y: 160 }],
    [{ x: 70, y: 170 }, { x: 270, y: 170 }]
);
assert.equal(pinched.scale, 2, 'pinch distance controls scale');
assert.equal(pinched.offsetY, -150, 'pinch midpoint anchors zoom and follows midpoint translation');

assert.deepEqual(
    calculateCropDrawRect({ ...landscape, scale: 2, offsetX: -320, offsetY: -160 }, 256),
    { x: -256, y: -128, width: 1024, height: 512 },
    '320-unit editor transform maps exactly to 256px output'
);

console.log('my-apps-crop: cover, center, limits, drag, pinch, clamp, and output mapping tests passed');
