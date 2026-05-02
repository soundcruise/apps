const FRETBOARD_CRUISE_APP_VERSION = '1.13.48';
window.FRETBOARD_CRUISE_APP_VERSION = FRETBOARD_CRUISE_APP_VERSION;

// Constants
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OPEN_STRINGS = [4, 9, 2, 7, 11, 4]; // E A D G B E (6弦 -> 1弦)
const STRINGS_REV = [6, 5, 4, 3, 2, 1];
const MAX_FRET = 12;
const FRETBOARD_HIT_DEBUG = new URLSearchParams(window.location.search).has('hitDebug');
const TARGET_HIT_PADDING_X_PX = 0;
const TARGET_HIT_PADDING_Y_PX = 20;
const FRET_WIDTHS = Array(MAX_FRET + 1).fill(65);
const FRETBOARD_WIDTH = FRET_WIDTHS.reduce((sum, width) => sum + width, 0);
const FRETBOARD_TOP_Y = 15;
const FRETBOARD_STRING_GAP = 30;
const FRETBOARD_STRING_AREA_HEIGHT = 180;
const FRETBOARD_HEIGHT = FRETBOARD_TOP_Y * 2 + FRETBOARD_STRING_AREA_HEIGHT;
const FRETBOARD_CENTER_Y = FRETBOARD_HEIGHT / 2;
const FRETBOARD_BODY_BOTTOM_Y = FRETBOARD_HEIGHT - FRETBOARD_TOP_Y;
const FRET_NUMBER_STRIP_HEIGHT = 34;
const FRET_NUMBER_STRIP_BOTTOM_Y = FRETBOARD_BODY_BOTTOM_Y + FRET_NUMBER_STRIP_HEIGHT;
const FRETBOARD_VIEWBOX_HEIGHT = 330;
const HORIZONTAL_FAR_SCALE = 0.65;
const HORIZONTAL_NEAR_SCALE = 1.25;
const VERTICAL_NEAR_EXPONENT = 1.55;
const VERTICAL_FAR_SCALE = 0.92;
const VERTICAL_NEAR_SCALE = 1.1;
const FRETBOARD_SIDE_DEPTH = 24;
const NECK_GRIP_DEPTH = 74;
const NECK_GRIP_OUTSET = 34;
const FRETBOARD_SURFACE_Z = 0;
const STRING_Z = 1.2;
const FRET_DOT_Z = 0.6;
const FRET_NUMBER_Z = -1.5;
const NOTE_MARKER_Z = 2.2;
const FRETBOARD_NECK_MODEL_VERSION = 2;
const DEFAULT_TEMPO = 75;
const DEFAULT_QUIZ_TIME_LIMIT = 5;
const DEFAULT_STRING_SPACING = 100;
const DEFAULT_VERTICAL_PERSPECTIVE = 0;
const DEFAULT_HORIZONTAL_PERSPECTIVE = 0;
const DEFAULT_ROTATION = { x: 0, y: 0, z: 0 };
const DEFAULT_FRETBOARD_VIEW = 'full';
const DEFAULT_FRETBOARD_VIEW_AUTO_ORIENTATION = false;

// Default States
let state = {
    course: null, // 'modeSelect' | 'stageSelect' | 'memorize' | 'visualize'
    memorize: {
        playMode: 'quiz', // 'cruise' | 'quiz'
        stage: 1,
        correct: 0,
        combo: 0,
        currentQuestion: null,
        cruiseTargets: [],
        cruiseScope: [], // Unique targets for rendering grey notes
        cruiseIndex: 0,
        isCleared: false,
        hasTappedCurrentNote: false,
        isFirstNote: true,
        tempFeedback: null
    },
    visualize: {
        key: 0, // C
        capo: 0,
        displayMode: 'note',
        chordType: 'M',
        degreeMode: false,
        scale: 'major',
        selectedChordIndex: null,
        /** 'movable' = キー主音を1度（P1）, 'fixed' = Cを1度（P1） */
        doMode: 'movable',
        /** '3' = 3和音, '7' = 7thコード */
        chordType: '3',
        /** autoSelectRootChord: Iコード自動選択（オン時）*/
        autoSelectRootChord: false
    },
    settings: {
        tempo: DEFAULT_TEMPO,
        quizTimeLimit: DEFAULT_QUIZ_TIME_LIMIT,
        stringSpacing: DEFAULT_STRING_SPACING, // 100% = default
        viewMode: 'front',
        rotation: { ...DEFAULT_ROTATION },
        perspective: DEFAULT_VERTICAL_PERSPECTIVE, // 遠近感 (0-100)
        perspOriginX: DEFAULT_HORIZONTAL_PERSPECTIVE, // 横の遠近感 (0-100, 100=12F大きく)
        fretboardView: DEFAULT_FRETBOARD_VIEW,
        fretboardViewAutoOrientation: DEFAULT_FRETBOARD_VIEW_AUTO_ORIENTATION,
        neckModelVersion: FRETBOARD_NECK_MODEL_VERSION
    }
};

let currentScrollLeft = 0;
let autoScrollRequested = false;
let nextTargetTime = 0;
let settingsReturnCourse = null;
let quizAdvanceTimeout = null;
let quizToneTimeout = null;
const fretboardDocumentHandlers = new Map();
const fretboardDebugScrollHandlers = new Map();

function cleanupFretboardDocumentHandlers(containerId) {
    if (containerId) {
        const handler = fretboardDocumentHandlers.get(containerId);
        if (handler) {
            document.removeEventListener('click', handler, true);
            fretboardDocumentHandlers.delete(containerId);
        }
        const debugScrollHandler = fretboardDebugScrollHandlers.get(containerId);
        if (debugScrollHandler) {
            const containerEl = document.getElementById(containerId);
            const wrapper = containerEl ? containerEl.querySelector('.fretboard-scroll-wrapper') : null;
            if (wrapper) wrapper.removeEventListener('scroll', debugScrollHandler);
            fretboardDebugScrollHandlers.delete(containerId);
        }
        const debugOverlay = document.getElementById(`hit-debug-${containerId}`);
        if (debugOverlay) debugOverlay.remove();
        return;
    }

    fretboardDocumentHandlers.forEach(handler => {
        document.removeEventListener('click', handler, true);
    });
    fretboardDocumentHandlers.clear();
    fretboardDebugScrollHandlers.forEach((handler, id) => {
        const containerEl = document.getElementById(id);
        const wrapper = containerEl ? containerEl.querySelector('.fretboard-scroll-wrapper') : null;
        if (wrapper) wrapper.removeEventListener('scroll', handler);
    });
    fretboardDebugScrollHandlers.clear();
    document.querySelectorAll('.hit-debug-overlay').forEach(el => el.remove());
}

// Load state
const savedState = localStorage.getItem('fretboard_cruise_state');
if (savedState) {
    try {
        let loaded = JSON.parse(savedState);
        // Deep merge for settings
        state = { ...state, ...loaded };
        if (!state.settings) state.settings = getDefaultSettings();
        if (!state.visualize) state.visualize = { key: 0, capo: 0, displayMode: 'note', chordType: 'M', degreeMode: false };
        if (typeof state.visualize.key === 'undefined') state.visualize.key = 0;
        if (typeof state.visualize.capo === 'undefined') state.visualize.capo = 0;
        if (typeof state.visualize.displayMode === 'undefined') state.visualize.displayMode = 'note';
        if (typeof state.visualize.doMode === 'undefined') state.visualize.doMode = 'movable';
        if (typeof state.visualize.chordType === 'undefined') state.visualize.chordType = '3';
        if (typeof state.visualize.autoSelectRootChord === 'undefined') state.visualize.autoSelectRootChord = false;
        if (typeof state.settings.tempo === 'undefined') state.settings.tempo = DEFAULT_TEMPO;
        if (typeof state.settings.quizTimeLimit === 'undefined') state.settings.quizTimeLimit = DEFAULT_QUIZ_TIME_LIMIT;
        if (typeof state.settings.stringSpacing === 'undefined') state.settings.stringSpacing = DEFAULT_STRING_SPACING;
        if (typeof state.settings.viewMode === 'undefined') state.settings.viewMode = 'front';
        if (typeof state.settings.rotation === 'undefined') state.settings.rotation = { ...DEFAULT_ROTATION };
        if (typeof state.settings.perspective === 'undefined') state.settings.perspective = DEFAULT_VERTICAL_PERSPECTIVE;
        if (typeof state.settings.perspOriginX === 'undefined') state.settings.perspOriginX = DEFAULT_HORIZONTAL_PERSPECTIVE;
        if (typeof state.settings.fretboardView === 'undefined') state.settings.fretboardView = DEFAULT_FRETBOARD_VIEW;
        if (typeof state.settings.fretboardViewAutoOrientation === 'undefined') {
            state.settings.fretboardViewAutoOrientation = DEFAULT_FRETBOARD_VIEW_AUTO_ORIENTATION;
        }
    } catch (e) {}
}

if (state.settings.neckModelVersion !== FRETBOARD_NECK_MODEL_VERSION) {
    if (state.settings.viewMode === 'front' || (state.settings.perspective === 0 && state.settings.perspOriginX === 0)) {
        state.settings.rotation = { ...DEFAULT_ROTATION };
        state.settings.perspective = DEFAULT_VERTICAL_PERSPECTIVE;
        state.settings.perspOriginX = DEFAULT_HORIZONTAL_PERSPECTIVE;
    }
    state.settings.neckModelVersion = FRETBOARD_NECK_MODEL_VERSION;
}

if (state.settings.viewMode === 'front') {
    state.settings.rotation = { ...DEFAULT_ROTATION };
}
state.settings.viewMode = 'custom';

function saveState() {
    localStorage.setItem('fretboard_cruise_state', JSON.stringify(state));
}

function getFretboardViewForWindowOrientation() {
    return window.innerWidth > window.innerHeight ? 'full' : 'zoom';
}

/** 向き自動モードのとき、必要なら fretboardView を更新。変更があれば true */
function applyFretboardViewFromOrientationIfAuto() {
    if (!state.settings || !state.settings.fretboardViewAutoOrientation) return false;
    const next = getFretboardViewForWindowOrientation();
    if (state.settings.fretboardView !== next) {
        state.settings.fretboardView = next;
        return true;
    }
    return false;
}

let _fretboardOrientationApplyTimer = null;
function scheduleApplyFretboardViewFromOrientation() {
    if (_fretboardOrientationApplyTimer) clearTimeout(_fretboardOrientationApplyTimer);
    _fretboardOrientationApplyTimer = setTimeout(() => {
        _fretboardOrientationApplyTimer = null;
        const autoChanged = applyFretboardViewFromOrientationIfAuto();
        if (autoChanged) saveState();
        if (state.course === 'memorize') {
            renderApp();
        } else if (autoChanged && (state.course === 'settings' || state.course === 'visualize')) {
            renderApp();
        }
    }, 120);
}

function initFretboardViewOrientationListeners() {
    if (initFretboardViewOrientationListeners._done) return;
    initFretboardViewOrientationListeners._done = true;
    window.addEventListener('orientationchange', () => setTimeout(scheduleApplyFretboardViewFromOrientation, 200));
    window.addEventListener('resize', scheduleApplyFretboardViewFromOrientation);
}
initFretboardViewOrientationListeners();

function getDefaultSettings() {
    return {
        tempo: DEFAULT_TEMPO,
        quizTimeLimit: DEFAULT_QUIZ_TIME_LIMIT,
        stringSpacing: DEFAULT_STRING_SPACING,
        viewMode: 'custom',
        rotation: { ...DEFAULT_ROTATION },
        perspective: DEFAULT_VERTICAL_PERSPECTIVE,
        perspOriginX: DEFAULT_HORIZONTAL_PERSPECTIVE,
        fretboardView: DEFAULT_FRETBOARD_VIEW,
        fretboardViewAutoOrientation: DEFAULT_FRETBOARD_VIEW_AUTO_ORIENTATION,
        neckModelVersion: FRETBOARD_NECK_MODEL_VERSION
    };
}

function cloneSettings(settings) {
    return {
        ...settings,
        rotation: { ...(settings.rotation || DEFAULT_ROTATION) }
    };
}

function openSettings(returnCourse = state.course) {
    settingsReturnCourse = returnCourse;
    state.course = 'settings';
    saveState();
    renderApp();
}

function clearQuizAdvanceTimers() {
    if (quizAdvanceTimeout) {
        clearTimeout(quizAdvanceTimeout);
        quizAdvanceTimeout = null;
    }
    if (quizToneTimeout) {
        clearTimeout(quizToneTimeout);
        quizToneTimeout = null;
    }
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// ----------------------------------------------------
// 3D Math Base (STEP 1: foundation only)
// ----------------------------------------------------
function createVec3(x = 0, y = 0, z = 0) {
    return { x, y, z };
}

function degToRad(deg) {
    return (deg * Math.PI) / 180;
}

function rotateVec3(point, rotationDeg) {
    const rx = degToRad(rotationDeg.x || 0);
    const ry = degToRad(rotationDeg.y || 0);
    const rz = degToRad(rotationDeg.z || 0);

    let x = point.x;
    let y = point.y;
    let z = point.z;

    // Rotate around X axis
    let y1 = y * Math.cos(rx) - z * Math.sin(rx);
    let z1 = y * Math.sin(rx) + z * Math.cos(rx);
    y = y1;
    z = z1;

    // Rotate around Y axis
    let x2 = x * Math.cos(ry) + z * Math.sin(ry);
    let z2 = -x * Math.sin(ry) + z * Math.cos(ry);
    x = x2;
    z = z2;

    // Rotate around Z axis
    let x3 = x * Math.cos(rz) - y * Math.sin(rz);
    let y3 = x * Math.sin(rz) + y * Math.cos(rz);

    return createVec3(x3, y3, z);
}

function getCameraPoseFromSettings() {
    const rotation = state.settings.rotation || { x: 0, y: 0, z: 0 };
    const verticalStrength = getVerticalPerspectiveStrength();
    const horizontalStrength = getHorizontalPerspectiveStrength();
    const perspectivePx = lerp(2400, 900, verticalStrength);
    const cameraOffsetX = lerp(0, 260, horizontalStrength);
    return {
        position: createVec3(cameraOffsetX, 0, perspectivePx),
        rotation: createVec3(rotation.x, rotation.y, rotation.z),
        perspectivePx
    };
}

function projectWorldToScreenBase(worldPoint, cameraPose, viewportCenterY = FRETBOARD_CENTER_Y) {
    // STEP 1 keeps output behavior unchanged on purpose.
    // This helper exists so STEP 2 can switch to full camera projection safely.
    const projected = projectPoint(worldPoint.x, worldPoint.y, worldPoint.z);
    return {
        x: projected.x,
        y: projected.y - FRETBOARD_CENTER_Y + viewportCenterY,
        scale: projected.scale
    };
}

function safeNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

function getProjectionScaleAtDepth(depthZ, cameraPose) {
    const camDistance = Math.max(300, safeNumber(cameraPose.perspectivePx, 1200));
    const z = safeNumber(depthZ, 0);
    const denom = camDistance + z;
    if (denom <= 1) return 1;
    return camDistance / denom;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getHorizontalPerspectiveStrength() {
    const raw = state.settings.perspOriginX || 0;
    return Math.max(0, Math.min(1, raw / 100));
}

function getVerticalPerspectiveStrength() {
    const raw = state.settings.perspective || 0;
    return Math.max(0, Math.min(1, raw / 100));
}

function getFretXEdges() {
    const edges = [0];
    FRET_WIDTHS.forEach(width => edges.push(edges[edges.length - 1] + width));
    return edges;
}

function getHorizontalScaleAtX(x) {
    const depth = Math.max(0, Math.min(1, x / FRETBOARD_WIDTH));
    const perspectiveScale = lerp(HORIZONTAL_FAR_SCALE, HORIZONTAL_NEAR_SCALE, depth);
    return lerp(1, perspectiveScale, getHorizontalPerspectiveStrength());
}

function getStringSpacingScale() {
    return clamp((state.settings.stringSpacing || 100) / 100, 0.8, 1.6);
}

function getNeckYBounds() {
    const baseTop = FRETBOARD_TOP_Y;
    const baseBottom = FRETBOARD_BODY_BOTTOM_Y;
    const center = (baseTop + baseBottom) / 2;
    const halfHeight = (baseBottom - baseTop) / 2;
    const scaledHalfHeight = halfHeight * getStringSpacingScale();
    return {
        top: center - scaledHalfHeight,
        bottom: center + scaledHalfHeight
    };
}

function getVerticalScaleAtY(y) {
    const neck = getNeckYBounds();
    const stripBottom = neck.bottom + FRET_NUMBER_STRIP_HEIGHT;
    const depth = Math.max(0, Math.min(1, (y - neck.top) / (stripBottom - neck.top)));
    const perspectiveScale = lerp(VERTICAL_FAR_SCALE, VERTICAL_NEAR_SCALE, depth);
    return lerp(1, perspectiveScale, getVerticalPerspectiveStrength());
}

function projectPoint(x, y, z = 0) {
    const worldPoint = createVec3(x - FRETBOARD_WIDTH / 2, y - FRETBOARD_CENTER_Y, z);
    const rotated = rotateVec3(worldPoint, state.settings.rotation || { x: 0, y: 0, z: 0 });

    // Base projection: axis rotation only.
    const baseX = FRETBOARD_WIDTH / 2 + safeNumber(rotated.x, 0);
    const baseY = FRETBOARD_CENTER_Y + safeNumber(rotated.y, 0);

    // Trapezoid / perspective effect is controlled only by the camera-depth sliders.
    const hScale = getHorizontalScaleAtX(x);
    const vScale = getVerticalScaleAtY(y);
    const scale = hScale * vScale;
    const projectedX = FRETBOARD_WIDTH / 2 + (baseX - FRETBOARD_WIDTH / 2) * hScale;
    const projectedY = FRETBOARD_CENTER_Y + (baseY - FRETBOARD_CENTER_Y) * scale;

    return {
        x: projectedX,
        y: projectedY,
        scale
    };
}

function projectFretboardY(originalY, x) {
    return projectPoint(x, originalY, 0).y;
}

function getStringOriginalY(rowIndex) {
    const t = rowIndex / 5;
    const exponent = lerp(1, VERTICAL_NEAR_EXPONENT, getVerticalPerspectiveStrength());
    const easedT = Math.pow(t, exponent);
    const neck = getNeckYBounds();
    const stringTopY = neck.top + FRETBOARD_STRING_GAP / 2;
    const stringBottomY = neck.bottom - FRETBOARD_STRING_GAP / 2;
    const baseY = lerp(stringTopY, stringBottomY, easedT);
    const centerY = (stringTopY + stringBottomY) / 2;
    return centerY + (baseY - centerY) * 1;
}

function getStringOriginalBounds(rowIndex) {
    const neck = getNeckYBounds();
    const centers = Array.from({ length: 6 }, (_, i) => getStringOriginalY(i));
    const top = rowIndex === 0 ? neck.top : (centers[rowIndex - 1] + centers[rowIndex]) / 2;
    const bottom = rowIndex === centers.length - 1 ? neck.bottom : (centers[rowIndex] + centers[rowIndex + 1]) / 2;
    return { top, bottom };
}

function getStringThickness(stringNum) {
    if (stringNum === 6) return 5;
    if (stringNum === 5) return 4;
    if (stringNum === 4) return 3;
    if (stringNum === 3) return 2.5;
    if (stringNum === 2) return 2;
    return 1.5;
}

function buildSvgPath(points) {
    return points.map((p, index) => `${index === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}

function buildClosedPolygon(points) {
    return points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

function buildProjectedBandPolygon(yTop, yBottom, z = 0, xSamples = getFretXEdges()) {
    const topPoints = xSamples.map(x => projectPoint(x, yTop, z));
    const bottomPoints = xSamples.slice().reverse().map(x => projectPoint(x, yBottom, z));
    return buildClosedPolygon([...topPoints, ...bottomPoints]);
}

function buildProjectedDepthStrip(y, zFront, zBack, xSamples = getFretXEdges()) {
    const frontPoints = xSamples.map(x => projectPoint(x, y, zFront));
    const backPoints = xSamples.slice().reverse().map(x => projectPoint(x, y, zBack));
    return buildClosedPolygon([...frontPoints, ...backPoints]);
}

function buildProjectedSideWall(x, yTop, yBottom, zFront, zBack) {
    const p1 = projectPoint(x, yTop, zFront);
    const p2 = projectPoint(x, yBottom, zFront);
    const p3 = projectPoint(x, yBottom, zBack);
    const p4 = projectPoint(x, yTop, zBack);
    return buildClosedPolygon([p1, p2, p3, p4]);
}

function getProjectedFretboardBounds(neckTop, neckBottom) {
    const stringCenters = Array.from({ length: 6 }, (_, i) => getStringOriginalY(i));
    const samplePoints = [];
    getFretXEdges().forEach(x => {
        samplePoints.push(projectPoint(x, neckTop, NOTE_MARKER_Z));
        samplePoints.push(projectPoint(x, neckBottom, NOTE_MARKER_Z));
        samplePoints.push(projectPoint(x, FRET_NUMBER_STRIP_BOTTOM_Y + 8, FRET_NUMBER_Z));
        stringCenters.forEach(y => samplePoints.push(projectPoint(x, y, NOTE_MARKER_Z)));
    });
    const minX = Math.min(...samplePoints.map(p => p.x));
    const maxX = Math.max(...samplePoints.map(p => p.x));
    const minY = Math.min(...samplePoints.map(p => p.y));
    const maxY = Math.max(...samplePoints.map(p => p.y));
    const padding = 28;
    return {
        minX: minX - padding,
        maxX: maxX + padding,
        minY: minY - padding,
        maxY: maxY + padding,
        width: Math.max(1, maxX - minX + padding * 2),
        height: Math.max(1, maxY - minY + padding * 2)
    };
}

// ----------------------------------------------------
// Audio Synthesis
// ----------------------------------------------------
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

const STRING_BASE_PITCHES = [40, 45, 50, 55, 59, 64]; // E2, A2, D3, G3, B3, E4

function playTone(stringIdx, fret) {
    initAudio();
    if (!audioCtx) return;

    const doPlay = () => {
        let midiNote = STRING_BASE_PITCHES[stringIdx] + fret;
        let freq = 440 * Math.pow(2, (midiNote - 69) / 12);

        let t = audioCtx.currentTime;
        let osc = audioCtx.createOscillator();
        let gain = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.8, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 2.0);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(t);
        osc.stop(t + 2.0);
    };

    // On iOS the context can be suspended or interrupted — resume first
    if (audioCtx.state !== 'running') {
        audioCtx.resume().then(doPlay).catch(() => {});
    } else {
        doPlay();
    }
}

// --- Rhythm Machine & Timers ---
let rhythmInterval = null;
let nextNoteTime = 0;
let current16thNote = 0;

let quizTimerInterval = null;
let quizTimeLeft = 3.0;

function startQuizTimer() {
    clearInterval(quizTimerInterval);
    quizTimeLeft = state.settings.quizTimeLimit;
    
    quizTimerInterval = setInterval(() => {
        quizTimeLeft -= 0.1;
        if (quizTimeLeft <= 0) {
            quizTimeLeft = 0;
            clearInterval(quizTimerInterval);
            handleQuizTimeout();
        }
        
        const timerDisplay = document.getElementById('quiz-timer');
        if (timerDisplay) {
            timerDisplay.textContent = quizTimeLeft.toFixed(1) + 's';
            if (quizTimeLeft <= 1.0) {
                timerDisplay.parentElement.style.color = 'var(--error-color)';
            }
        }
    }, 100);
}

function handleQuizTimeout() {
    if (state.course !== 'memorize' || state.memorize.playMode !== 'quiz') return;
    const container = document.getElementById('fretboard-container');
    if (!container) return;

    state.memorize.combo = 0;
    state.memorize.tempFeedback = { text: 'Miss... (時間切れ)', className: 'feedback-display feedback-wrong' };
    
    // Show answer briefly and move to next
    let app = document.getElementById('app');
    renderFretboardHTML('fretboard-container', {
        mode: 'memorize',
        question: state.memorize.currentQuestion,
        showAnswer: true,
        clicked: null,
        onFretClick: null
    });
    
    const fb = document.getElementById('feedback');
    if (fb) {
        fb.textContent = 'Miss... (時間切れ)';
        fb.className = 'feedback-display feedback-wrong';
    }
    
    clearQuizAdvanceTimers();
    quizAdvanceTimeout = setTimeout(() => {
        quizAdvanceTimeout = null;
        if (state.course !== 'memorize' || state.memorize.playMode !== 'quiz') return;
        generateQuestion();
        renderApp();
    }, 1000);
}

function stopQuizTimer() {
    clearQuizAdvanceTimers();
    if (quizTimerInterval) {
        clearInterval(quizTimerInterval);
        quizTimerInterval = null;
    }
}

function scheduleRhythm() {
    if (!audioCtx) return;
    while (nextNoteTime < audioCtx.currentTime + 0.1) {
        playRhythmNote(current16thNote, nextNoteTime);
        
        if (state.course === 'memorize' && state.memorize.playMode === 'cruise' && !state.memorize.isCleared) {
            if (current16thNote === 0 || current16thNote === 8) {
                let delayMs = (nextNoteTime - audioCtx.currentTime) * 1000;
                setTimeout(autoAdvanceCruise, delayMs);
                
                // Target time is the next snare beat (4 16th notes later)
                let secondsPerBeat = 60.0 / state.settings.tempo;
                nextTargetTime = nextNoteTime + secondsPerBeat;
            }
        }
        
        nextRhythmNote();
    }
    rhythmInterval = setTimeout(scheduleRhythm, 25);
}

function autoAdvanceCruise() {
    if (state.course !== 'memorize' || state.memorize.playMode !== 'cruise' || state.memorize.isCleared) return;

    if (state.memorize.isFirstNote) {
        state.memorize.isFirstNote = false;
        state.memorize.hasTappedCurrentNote = false;
        let q = state.memorize.currentQuestion;
        playTone(q.stringIdx, q.fret);
        renderApp();
        return;
    }
    
    // Evaluate previous window (timeout miss)
    if (!state.memorize.hasTappedCurrentNote) {
        state.memorize.combo = 0;
        state.memorize.tempFeedback = { text: 'Miss... (時間切れ)', className: 'feedback-display feedback-wrong' };
    } else {
        state.memorize.tempFeedback = null;
    }
    
    // Move to next note
    let nextIdx = state.memorize.cruiseIndex + 1;
    if (nextIdx >= state.memorize.cruiseTargets.length) {
        state.memorize.isCleared = true;
        stopRhythm();
        saveState();
        renderApp();
        return;
    }
    
    state.memorize.cruiseIndex = nextIdx;
    state.memorize.currentQuestion = state.memorize.cruiseTargets[nextIdx];
    state.memorize.hasTappedCurrentNote = false;
    
    let q = state.memorize.currentQuestion;
    playTone(q.stringIdx, q.fret);
    
    autoScrollRequested = true;
    saveState();
    renderApp();
}

function nextRhythmNote() {
    let secondsPerBeat = 60.0 / state.settings.tempo;
    nextNoteTime += 0.25 * secondsPerBeat;
    current16thNote++;
    if (current16thNote === 16) {
        current16thNote = 0;
    }
}

function playRhythmNote(note, time) {
    if (note === 0 || note === 8) playDrumKick(time);
    if (note === 4 || note === 12) playDrumSnare(time);
    if (note % 2 === 0) playDrumHat(time);
}

function playDrumKick(time) {
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.001, time + 0.5);
    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    osc.start(time);
    osc.stop(time + 0.5);
}

function playDrumSnare(time) {
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();
    osc.type = 'square';
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(250, time);
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    osc.start(time);
    osc.stop(time + 0.1);
}

function playDrumHat(time) {
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();
    osc.type = 'square';
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(8000, time);
    gain.gain.setValueAtTime(0.05, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
    osc.start(time);
    osc.stop(time + 0.05);
}

function startRhythm() {
    initAudio();
    if (rhythmInterval) return;
    nextNoteTime = audioCtx.currentTime + 0.1;
    current16thNote = 0;
    scheduleRhythm();
}

function stopRhythm() {
    if (rhythmInterval) {
        clearTimeout(rhythmInterval);
        rhythmInterval = null;
    }
}

// ----------------------------------------------------
// Core Logic
// ----------------------------------------------------

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getStageTargets(stage) {
    let targets = [];
    for (let s = 0; s < 6; s++) {
        for (let f = 0; f <= 12; f++) {
            let noteIdx = (OPEN_STRINGS[s] + f) % 12;
            let isNat = [0, 2, 4, 5, 7, 9, 11].includes(noteIdx); // Keep natural notes only for beginners
            
            let add = false;
            switch(stage) {
                case 1: if (f >= 0 && f <= 3 && isNat) add = true; break;
                case 2: if (f >= 0 && f <= 5 && isNat) add = true; break;
                case 3: if (f >= 5 && f <= 9 && isNat) add = true; break;
                case 4: if (f >= 5 && f <= 12 && isNat) add = true; break;
                case 5: if (f >= 0 && f <= 12 && isNat) add = true; break;
                case 6: if (f >= 0 && f <= 12 && isNat) add = true; break;
            }
            if (add) {
                targets.push({ stringIdx: s, stringName: 6 - s, fret: f, noteIdx: noteIdx, noteName: NOTES[noteIdx] });
            }
        }
    }
    return targets;
}

function generateQuestion() {
    let targets = getStageTargets(state.memorize.stage);
    if (targets.length === 0) return;
    
    let target = targets[getRandomInt(0, targets.length - 1)];
    
    // Prevent the exact same question string+note from appearing twice in a row if possible
    if (state.memorize.currentQuestion && targets.length > 1) {
        while (target.stringIdx === state.memorize.currentQuestion.stringIdx && target.noteIdx === state.memorize.currentQuestion.noteIdx) {
            target = targets[getRandomInt(0, targets.length - 1)];
        }
    }

    state.memorize.currentQuestion = target;
    state.memorize.hasTappedCurrentNote = false;
    saveState();
    
    if (state.memorize.playMode === 'quiz') {
        autoScrollRequested = true;
        startQuizTimer();
    }
}

// ----------------------------------------------------
// UI Rendering
// ----------------------------------------------------

/** 指板のヒットレイヤーがコードボタンの上に重なる場合、e.target がボタンにならないため座標から解決する */
function findChordButtonFromPointerEvent(e) {
    const t = e.target;
    if (t && typeof t.closest === 'function') {
        const byClosest = t.closest('.chord-btn');
        if (byClosest) return byClosest;
    }
    if (typeof e.clientX !== 'number' || typeof e.clientY !== 'number' || !document.elementsFromPoint) {
        return null;
    }
    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    if (!stack || !stack.length) return null;
    for (let i = 0; i < stack.length; i++) {
        const el = stack[i];
        if (el && el.classList && el.classList.contains('chord-btn')) return el;
    }
    return null;
}

function renderApp() {
    const app = document.getElementById('app');
    if (applyFretboardViewFromOrientationIfAuto()) {
        saveState();
    }
    if (app && typeof app._cleanupSettingsHandlers === 'function') {
        app._cleanupSettingsHandlers();
    }
    cleanupFretboardDocumentHandlers();

    // Reset settings-screen styles
    app.style.height = '';
    app.style.overflowY = '';
    app.style.overflowX = '';
    app.style.maxWidth = '';
    app.style.width = '';
    app.style.display = '';
    app.style.flexDirection = '';
    app.style.alignItems = '';
    app.style.alignSelf = '';
    app.style.gap = '';
    app.style.maxHeight = '';
    app.style.minHeight = '';
    app.style.paddingTop = '';
    app.style.paddingBottom = '';
    app.style.paddingLeft = '';
    app.style.paddingRight = '';

    // 直前の指板の scrollLeft は「同じ画面種別」のときだけ引き継ぐ（メモライズ→自由探索でズーム横スクロールが残らないようにする）
    const oldWrapper = document.querySelector('.fretboard-scroll-wrapper');
    const oldScrollGroup = oldWrapper && oldWrapper.getAttribute('data-scroll-group');
    if (oldScrollGroup === 'memorize' && state.course === 'memorize') {
        currentScrollLeft = oldWrapper.scrollLeft;
    } else if (
        oldScrollGroup === 'visualize' &&
        state.course === 'visualize' &&
        state.settings.fretboardView === 'zoom'
    ) {
        currentScrollLeft = oldWrapper.scrollLeft;
    } else {
        currentScrollLeft = 0;
    }

    // 指板ゲーム画面は max-width を外してビューポート幅いっぱいにする（横で 600px クリップと innerWidth 前提のズレを防ぐ）
    if (state.course === 'memorize' || state.course === 'visualize') {
        app.style.maxWidth = 'none';
        app.style.width = '100vw';
        app.style.boxSizing = 'border-box';
    }
    // 覚えるコース: 縦方向に余白を確保し、指板エリアに flex で残り高さを渡す（横画面で下弦が切れないようにする）
    if (state.course === 'memorize') {
        app.style.display = 'flex';
        app.style.flexDirection = 'column';
        app.style.alignItems = 'stretch';
        app.style.alignSelf = 'stretch';
        app.style.gap = '0';
        app.style.height = '100dvh';
        app.style.maxHeight = '100dvh';
        app.style.minHeight = '0';
        app.style.overflow = 'hidden';
        const memorizeLandApp = window.innerWidth > window.innerHeight;
        app.style.paddingTop = memorizeLandApp
            ? 'max(2px, env(safe-area-inset-top))'
            : 'max(4px, env(safe-area-inset-top))';
        app.style.paddingBottom =
            'calc(var(--in-game-refresh-stack-height, 96px) + max(8px, env(safe-area-inset-bottom)))';
        app.style.paddingLeft = 'max(10px, env(safe-area-inset-left))';
        app.style.paddingRight = 'max(10px, env(safe-area-inset-right))';
    }

    if (state.course === null) {
        renderHome(app);
    } else if (state.course === 'modeSelect') {
        renderModeSelect(app);
    } else if (state.course === 'stageSelect') {
        renderStageSelect(app);
    } else if (state.course === 'memorize') {
        renderMemorize(app);
    } else if (state.course === 'visualize') {
        renderVisualize(app);
    } else if (state.course === 'settings') {
        renderSettings(app);
    }
    
    // Restore or auto-adjust scroll position（メインの #fretboard-container のラッパーのみ）
    const newWrapper = document.querySelector('.fretboard-scroll-wrapper');
    const newScrollGroup = newWrapper && newWrapper.getAttribute('data-scroll-group');
    if (newWrapper && newScrollGroup) {
        if (autoScrollRequested) {
            autoScrollRequested = false;

            if (state.course === 'memorize' && state.memorize.playMode === 'cruise') {
                const q = state.memorize.currentQuestion;
                if (q && state.settings.fretboardView === 'zoom') {
                    const fretCol = newWrapper.querySelector(`.fret-column[data-fret="${q.fret}"]`);
                    if (fretCol) {
                        const fretLeft = fretCol.offsetLeft;
                        const fretRight = fretLeft + fretCol.clientWidth;
                        const visibleLeft = currentScrollLeft;
                        const visibleRight = currentScrollLeft + newWrapper.clientWidth;

                        // If the target is out of bounds (with 20px margin), then auto-scroll to center it
                        if (fretLeft < visibleLeft + 20 || fretRight > visibleRight - 20) {
                            const wrapperCenter = newWrapper.clientWidth / 2;
                            const fretCenter = fretLeft + (fretCol.clientWidth / 2);
                            setTimeout(() => {
                                newWrapper.scrollTo({ left: fretCenter - wrapperCenter, behavior: 'smooth' });
                            }, 10);
                        } else {
                            newWrapper.scrollLeft = currentScrollLeft;
                        }
                    }
                } else {
                    newWrapper.scrollLeft = 0;
                }
            } else if (state.course === 'memorize' && state.memorize.playMode === 'quiz') {
                newWrapper.scrollLeft = 0;
            } else {
                newWrapper.scrollLeft = 0;
            }
        } else if (state.course === 'memorize') {
            newWrapper.scrollLeft = currentScrollLeft;
        } else if (state.course === 'visualize' && state.settings.fretboardView === 'zoom') {
            newWrapper.scrollLeft = currentScrollLeft;
        } else {
            newWrapper.scrollLeft = 0;
        }
    } else if (newWrapper) {
        newWrapper.scrollLeft = 0;
    }

    // Refresh state bar
    const vDisplay = document.getElementById('app-version-display');
    if (vDisplay) vDisplay.textContent = `Ver. ${FRETBOARD_CRUISE_APP_VERSION}`;
    const rb = document.getElementById('in-game-refresh-bar');
    if (rb) {
        rb.classList.remove('hidden');
        const reloadBtn = rb.querySelector('.js-reload-app');
        if (reloadBtn) {
            reloadBtn.onclick = () => {
                stopRhythm();
                window.location.reload();
            };
        }
    }

}

function renderHome(app) {
    app.innerHTML = `
        <header>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
                <div style="width:60px;"></div>
                <h1 class="home-title" style="flex:1; text-align:center;">指板クルーズ</h1>
                <div style="width:60px; display:flex; justify-content:flex-end; padding-top:4px;">
                    <button class="icon-btn" id="btn-settings-home" style="padding:8px 12px;">⚙️</button>
                </div>
            </div>
        </header>
        <div class="action-btns" style="flex-direction: column; gap: 20px; align-items: center; width: 100%;">
            <button class="btn-primary" id="btn-memorize" style="width: 80%; padding: 20px; font-size: 1.2rem;">覚えるコース</button>
            <button class="btn-secondary" id="btn-visualize" style="width: 80%; padding: 20px; font-size: 1.2rem;">自由探索モード</button>
        </div>
    `;

    document.getElementById('btn-memorize').onclick = () => {
        state.course = 'modeSelect';
        saveState();
        renderApp();
    };

    document.getElementById('btn-visualize').onclick = () => {
        state.course = 'visualize';
        saveState();
        renderApp();
    };

    document.getElementById('btn-settings-home').onclick = () => {
        openSettings(null);
    };
}

function renderModeSelect(app) {
    app.innerHTML = `
        <header style="padding-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 20px;">
                <button class="icon-btn" id="btn-back">◀ ホーム</button>
                <h2 style="font-size: 1.5rem; margin:0;">モード選択</h2>
                <button class="icon-btn" id="btn-settings" style="font-size: 1.5rem; background: none; border: none; padding: 0; cursor: pointer;" title="設定">⚙️</button>
            </div>
        </header>
        <div class="stage-list">
            <button class="stage-btn" data-mode="cruise">
                🛳️ クルージングモード
                <span class="stage-desc">光る場所をなぞって指板を覚えよう！</span>
            </button>
            <button class="stage-btn" data-mode="quiz">
                🎯 問題モード
                <span class="stage-desc">自力で音を探すテスト形式！</span>
            </button>
        </div>
    `;

    document.getElementById('btn-back').onclick = () => {
        state.course = null;
        saveState();
        renderApp();
    };

    document.getElementById('btn-settings').onclick = () => {
        openSettings('modeSelect');
    };

    document.querySelectorAll('.stage-btn').forEach(btn => {
        btn.onclick = () => {
            state.memorize.playMode = btn.getAttribute('data-mode');
            state.course = 'stageSelect';
            saveState();
            renderApp();
        };
    });
}

function renderStageSelect(app) {
    app.innerHTML = `
        <header style="padding-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 20px;">
                <button class="icon-btn" id="btn-back">◀ モード選択</button>
                <h2 style="font-size: 1.5rem; margin:0;">ステージ選択</h2>
                <button class="icon-btn" id="btn-settings-stage" style="font-size: 1.5rem; background: none; border: none; padding: 0; cursor: pointer;" title="設定">⚙️</button>
            </div>
        </header>
        <div class="stage-list">
            <button class="stage-btn" data-stage="1">STAGE 1<span class="stage-desc">開放弦〜3フレット (#なし)</span></button>
            <button class="stage-btn" data-stage="2">STAGE 2<span class="stage-desc">開放弦〜5フレット (#なし)</span></button>
            <button class="stage-btn" data-stage="3">STAGE 3<span class="stage-desc">5〜9フレット (#なし)</span></button>
            <button class="stage-btn" data-stage="4">STAGE 4<span class="stage-desc">5〜12フレット (#なし)</span></button>
            <button class="stage-btn" data-stage="5">STAGE 5<span class="stage-desc">総復習メドレー (STAGE 1〜4)</span></button>
            <button class="stage-btn" data-stage="6">STAGE 6<span class="stage-desc">全指板マスター (0〜12フレット)</span></button>
        </div>
    `;

    document.getElementById('btn-back').onclick = () => {
        state.course = 'modeSelect';
        saveState();
        renderApp();
    };

    document.getElementById('btn-settings-stage').onclick = () => {
        openSettings('stageSelect');
    };

    document.querySelectorAll('.stage-btn').forEach(btn => {
        btn.onclick = () => {
            initAudio(); // Initialize audio on first user gesture
            state.memorize.stage = parseInt(btn.getAttribute('data-stage'));
            state.memorize.combo = 0;
            state.memorize.isCleared = false;
            state.course = 'memorize';
            
            if (state.memorize.playMode === 'cruise') {
                let sequence = [];
                let cruiseScope = [];

                if (state.memorize.stage === 5) {
                    // Medley Mode: combine stage 1, 2, 3, 4 sequences
                    for (let s = 1; s <= 4; s++) {
                        let targets = getStageTargets(s);
                        targets.forEach(t => t.midiNote = STRING_BASE_PITCHES[t.stringIdx] + t.fret);
                        
                        let grouped = {};
                        targets.forEach(t => {
                            if (!grouped[t.midiNote] || t.stringIdx < grouped[t.midiNote].stringIdx) {
                                grouped[t.midiNote] = t;
                            }
                        });
                        let uniqueTargets = Object.values(grouped);
                        uniqueTargets.sort((a, b) => a.midiNote - b.midiNote);
                        
                        cruiseScope.push(...uniqueTargets);
                        
                        let startIdx = uniqueTargets.findIndex(t => t.stringName === 5 && t.fret === 3);
                        if (startIdx === -1) startIdx = uniqueTargets.findIndex(t => t.stringName === 6 && t.fret === 8);
                        if (startIdx === -1) startIdx = uniqueTargets.findIndex(t => t.noteIdx === 0);
                        if (startIdx === -1) startIdx = 0;

                        let subSeq = [];
                        for (let i = startIdx; i >= 0; i--) subSeq.push(uniqueTargets[i]);
                        for (let i = 1; i < uniqueTargets.length; i++) subSeq.push(uniqueTargets[i]);
                        for (let i = uniqueTargets.length - 2; i >= startIdx; i--) subSeq.push(uniqueTargets[i]);
                        
                        // Connect seamlessly by skipping the return-to-start note for stages 1-3
                        if (s < 4) {
                            subSeq.pop();
                        }
                        sequence.push(...subSeq);
                    }
                } else {
                    let targets = getStageTargets(state.memorize.stage);
                    targets.forEach(t => t.midiNote = STRING_BASE_PITCHES[t.stringIdx] + t.fret);
                    
                    // Deduplicate by pitch, preferring lower fret / higher string (Skip for Stage 6)
                    let uniqueTargets;
                    if (state.memorize.stage === 6) {
                        uniqueTargets = [...targets];
                    } else {
                        let grouped = {};
                        targets.forEach(t => {
                            if (!grouped[t.midiNote] || t.stringIdx < grouped[t.midiNote].stringIdx) {
                                grouped[t.midiNote] = t;
                            }
                        });
                        uniqueTargets = Object.values(grouped);
                    }
                    uniqueTargets.sort((a, b) => a.midiNote - b.midiNote);
                    
                    cruiseScope = uniqueTargets;
                    
                    // Find starting C (5th string 3rd fret, or 6th string 8th fret, or any C)
                    let startIdx = uniqueTargets.findIndex(t => t.stringName === 5 && t.fret === 3);
                    if (startIdx === -1) startIdx = uniqueTargets.findIndex(t => t.stringName === 6 && t.fret === 8);
                    if (startIdx === -1) startIdx = uniqueTargets.findIndex(t => t.noteIdx === 0);
                    if (startIdx === -1) startIdx = 0;

                    for (let i = startIdx; i >= 0; i--) sequence.push(uniqueTargets[i]);
                    for (let i = 1; i < uniqueTargets.length; i++) sequence.push(uniqueTargets[i]);
                    for (let i = uniqueTargets.length - 2; i >= startIdx; i--) sequence.push(uniqueTargets[i]);
                }
                
                state.memorize.cruiseScope = cruiseScope;
                state.memorize.cruiseTargets = sequence;
                state.memorize.cruiseIndex = 0;
                state.memorize.currentQuestion = sequence[0];
                state.memorize.isFirstNote = true;
                state.memorize.hasTappedCurrentNote = false;
                state.memorize.tempFeedback = null;
                
                autoScrollRequested = true;
                startRhythm(); // Start the drum loop. It will trigger autoAdvanceCruise.
            } else {
                generateQuestion();
                autoScrollRequested = true;
            }
            
            saveState();
            renderApp();
        };
    });
}

function renderMemorize(app) {
    const q = state.memorize.currentQuestion;
    if (!q) {
        generateQuestion();
        renderApp();
        return;
    }

    const isCruise = state.memorize.playMode === 'cruise';

    if (state.memorize.isCleared) {
        app.innerHTML = `
            <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; text-align:center;">
                <h1 style="color:var(--primary-color); font-size:3rem; margin-bottom:20px;">CLEAR!</h1>
                <p style="font-size:1.2rem; margin-bottom:30px;">ルート制覇おめでとうございます！</p>
                <button class="btn-primary" id="btn-back-clear" style="padding:15px 30px; font-size:1.2rem;">ステージ選択へ戻る</button>
            </div>
        `;
        document.getElementById('btn-back-clear').onclick = () => {
            state.course = 'stageSelect';
            saveState();
            renderApp();
        };
        return;
    }

    let fbText = isCruise ? 'リズムに合わせてタップ！' : '指板をタップして回答してください';
    let fbClass = 'feedback-display';
    if (state.memorize.tempFeedback) {
        fbText = state.memorize.tempFeedback.text;
        fbClass = state.memorize.tempFeedback.className;
        state.memorize.tempFeedback = null; // consume
    }

    const quizTimerHtml = !isCruise
        ? `<div class="memorize-quiz-timer stat-item" style="color: ${quizTimeLeft <= 1.0 ? 'var(--error-color)' : 'inherit'};"><span class="label">残り時間</span><span class="value" id="quiz-timer">${quizTimeLeft.toFixed(1)}s</span></div>`
        : '';

    const stageStatsHtml = `
                    <div class="stats memorize-stats memorize-stats--near-question">
                        <div class="stat-item"><span class="label">STAGE</span><span class="value">${state.memorize.stage}</span></div>
                        <div class="stat-item"><span class="label">正解</span><span class="value" id="score-correct">${state.memorize.correct}</span></div>
                        <div class="stat-item"><span class="label">連続</span><span class="value" id="score-combo">${state.memorize.combo}</span></div>
                    </div>`;

    const memorizeLand =
        typeof window !== 'undefined' && window.innerWidth > window.innerHeight;
    const memorizeRootClass = memorizeLand
        ? 'memorize-screen memorize-screen--landscape'
        : 'memorize-screen';

    app.innerHTML = `
        <div class="${memorizeRootClass}" data-fretboard-view="${state.settings.fretboardView}">
            <header class="memorize-header">
                <div class="memorize-top-row ${isCruise ? 'memorize-top-row--cruise-only' : ''}">
                    <button class="icon-btn" id="btn-back">◀ ステージ</button>
                    ${quizTimerHtml}
                </div>
            </header>
            <div class="memorize-body-stack">
                <div class="memorize-copy-block">
                    <div class="memorize-question-row">
                        ${stageStatsHtml}
                        <div class="question-text memorize-question memorize-question-main">${q.stringName}弦 の <span class="memorize-question-note" style="color: var(--primary-color);">${q.noteName}</span> ${isCruise ? 'をタップ！' : 'を探せ！'}</div>
                    </div>
                    <div id="feedback" class="${fbClass} memorize-feedback">${fbText}</div>
                </div>
                <div id="fretboard-container" class="memorize-fretboard-host"></div>
            </div>
        </div>
    `;

    document.getElementById('btn-back').onclick = () => {
        stopRhythm();
        stopQuizTimer();
        state.course = 'stageSelect';
        saveState();
        renderApp();
    };

    renderFretboardHTML('fretboard-container', {
        mode: 'memorize',
        question: q,
        showAnswer: isCruise, // Cruise mode shows answer immediately
        clicked: null,
        onFretClick: handleFretClick
    });

}

function handleFretClick(stringNum, fret) {
    const q = state.memorize.currentQuestion;
    const fb = document.getElementById('feedback');
    const isCruise = state.memorize.playMode === 'cruise';
    
    let stringIdx = 6 - stringNum;
    let clickedNoteIdx = (OPEN_STRINGS[stringIdx] + fret) % 12;

    // Check if correct
    let isCorrect = false;
    if (isCruise) {
        // Cruise mode: exact fret match required because same note can be at fret 0 and 12
        isCorrect = (stringNum === q.stringName) && (fret === q.fret);
    } else {
        // Quiz mode: any fret with the correct note name on that string is fine
        isCorrect = (stringNum === q.stringName) && (clickedNoteIdx === q.noteIdx);
    }

    if (isCruise) {
        if (state.memorize.hasTappedCurrentNote || state.memorize.isCleared) return;
        
        let timeDiff = audioCtx.currentTime - nextTargetTime;
        
        // Check timing window (±150ms)
        if (Math.abs(timeDiff) > 0.15) {
            state.memorize.combo = 0;
            state.memorize.hasTappedCurrentNote = true;
            let fbText = timeDiff < 0 ? 'Early!' : 'Late!';
            showLiveFeedback(fbText, 'miss');
        } else {
            if (isCorrect) {
                playTone(stringIdx, fret);
                state.memorize.correct++;
                state.memorize.combo++;
                state.memorize.hasTappedCurrentNote = true;
                showLiveFeedback('Perfect!', 'good');
            } else {
                state.memorize.combo = 0;
                state.memorize.hasTappedCurrentNote = true;
                showLiveFeedback('Miss!', 'miss');
            }
        }
        saveState();
        return; // Don't call renderApp here, wait for autoAdvanceCruise
    }

    // --- Quiz Mode Logic Below ---
    if (state.memorize.hasTappedCurrentNote) return;
    stopQuizTimer();
    state.memorize.hasTappedCurrentNote = true;

    playTone(stringIdx, fret); // Play sound on any click

    if (isCorrect) {
        state.memorize.correct++;
        state.memorize.combo++;
        updateMemorizeScoreDisplay();
        fb.textContent = '正解！';
        fb.className = 'feedback-display feedback-correct';
        
        renderFretboardHTML('fretboard-container', {
            mode: 'memorize',
            question: q,
            showAnswer: true,
            clicked: { stringNum, fret, isCorrect: true },
            onFretClick: null // disable clicking
        });

    } else {
        state.memorize.combo = 0;
        updateMemorizeScoreDisplay();
        fb.textContent = `不正解... 正解はここ！`;
        fb.className = 'feedback-display feedback-wrong';
        
        renderFretboardHTML('fretboard-container', {
            mode: 'memorize',
            question: q,
            showAnswer: true,
            clicked: { stringNum, fret, isCorrect: false },
            onFretClick: null // disable clicking
        });
    }

    saveState();

    clearQuizAdvanceTimers();
    quizAdvanceTimeout = setTimeout(() => {
        quizAdvanceTimeout = null;
        if (state.course !== 'memorize' || state.memorize.playMode !== 'quiz') return;
        generateQuestion();
        renderApp();
        // Play the next question note
        quizToneTimeout = setTimeout(() => {
            quizToneTimeout = null;
            if (state.course === 'memorize' && state.memorize.playMode === 'quiz' && state.memorize.currentQuestion) {
                playTone(state.memorize.currentQuestion.stringIdx, state.memorize.currentQuestion.fret);
            }
        }, 100);
    }, 1000); // 1 second delay to see the result
}

function showLiveFeedback(text, type) {
    const fb = document.getElementById('feedback');
    if (fb) {
        fb.textContent = text;
        if (type === 'good') fb.className = 'feedback-display feedback-correct';
        else if (type === 'miss') fb.className = 'feedback-display feedback-wrong';
        else fb.className = 'feedback-display';
        
        const sc = document.getElementById('score-correct');
        const scombo = document.getElementById('score-combo');
        if (sc) sc.textContent = state.memorize.correct;
        if (scombo) scombo.textContent = state.memorize.combo;
    }
}

function updateMemorizeScoreDisplay() {
    const sc = document.getElementById('score-correct');
    const scombo = document.getElementById('score-combo');
    if (sc) sc.textContent = state.memorize.correct;
    if (scombo) scombo.textContent = state.memorize.combo;
}

const SCALE_INTERVALS = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    pentaMajor: [0, 2, 4, 7, 9],
    pentaMinor: [0, 3, 5, 7, 10]
};

const DIATONIC_CHORDS = {
    major: [
        { label: 'I',       suffix3: '', suffix7: 'M7', degrees: [0, 4, 7],    degrees7: [0, 4, 7, 11] },
        { label: 'IIm',     suffix3: 'm', suffix7: 'm7',   degrees: [2, 5, 9],    degrees7: [2, 5, 9, 0]  },
        { label: 'IIIm',    suffix3: 'm', suffix7: 'm7',   degrees: [4, 7, 11],   degrees7: [4, 7, 11, 2] },
        { label: 'IV',      suffix3: '', suffix7: 'M7', degrees: [5, 9, 0],    degrees7: [5, 9, 0, 4]  },
        { label: 'V',       suffix3: '', suffix7: '7',    degrees: [7, 11, 2],   degrees7: [7, 11, 2, 5] },
        { label: 'VIm',     suffix3: 'm', suffix7: 'm7',   degrees: [9, 0, 4],    degrees7: [9, 0, 4, 7]  },
        { label: 'VIIm7b5', suffix3: 'mb5', suffix7: 'm7b5', degrees: [11, 2, 5],   degrees7: [11, 2, 5, 9] }
    ],
    minor: [
        { label: 'Im',      suffix3: 'm', suffix7: 'm7',   degrees: [0, 3, 7],    degrees7: [0, 3, 7, 10]  },
        { label: 'IIm7b5',  suffix3: 'mb5', suffix7: 'm7b5', degrees: [2, 5, 8],    degrees7: [2, 5, 8, 0]   },
        { label: 'III',     suffix3: '', suffix7: 'M7', degrees: [3, 7, 10],   degrees7: [3, 7, 10, 2]  },
        { label: 'IVm',     suffix3: 'm', suffix7: 'm7',   degrees: [5, 8, 0],    degrees7: [5, 8, 0, 3]   },
        { label: 'Vm',      suffix3: 'm', suffix7: 'm7',   degrees: [7, 10, 2],   degrees7: [7, 10, 2, 5]  },
        { label: 'VI',      suffix3: '', suffix7: 'M7', degrees: [8, 0, 3],    degrees7: [8, 0, 3, 7]   },
        { label: 'VII',     suffix3: '', suffix7: '7',    degrees: [10, 2, 5],   degrees7: [10, 2, 5, 8]  }
    ],
    pentaMajor: [
        { label: 'I',   suffix3: '', suffix7: 'M7', degrees: [0, 4, 7],  degrees7: [0, 4, 7, 11] },
        { label: 'II',  suffix3: '', suffix7: 'M7', degrees: [2, 6, 9],  degrees7: [2, 6, 9, 0]  },
        { label: 'III', suffix3: 'm', suffix7: 'm7',   degrees: [4, 7, 11], degrees7: [4, 7, 11, 2] },
        { label: 'V',   suffix3: '', suffix7: '7',    degrees: [7, 11, 2], degrees7: [7, 11, 2, 5] },
        { label: 'VI',  suffix3: 'm', suffix7: 'm7',   degrees: [9, 0, 4],  degrees7: [9, 0, 4, 7]  }
    ],
    pentaMinor: [
        { label: 'Im',  suffix3: 'm', suffix7: 'm7',   degrees: [0, 3, 7],  degrees7: [0, 3, 7, 10] },
        { label: 'III', suffix3: '', suffix7: 'M7', degrees: [3, 7, 10], degrees7: [3, 7, 10, 2] },
        { label: 'IVm', suffix3: 'm', suffix7: 'm7',   degrees: [5, 8, 0],  degrees7: [5, 8, 0, 3]  },
        { label: 'Vm',  suffix3: 'm', suffix7: 'm7',   degrees: [7, 10, 2], degrees7: [7, 10, 2, 5] },
        { label: 'VII', suffix3: '', suffix7: '7',    degrees: [10, 2, 5], degrees7: [10, 2, 5, 8] }
    ]
};

function getDiatonicChordsForKey(keyIndex, scaleType, use7Chords) {
    const baseChords = DIATONIC_CHORDS[scaleType] || DIATONIC_CHORDS.major;
    const scaleIntervals = SCALE_INTERVALS[scaleType] || SCALE_INTERVALS.major;

    return baseChords.map((chord, idx) => {
        const rootScaleDegree = idx;
        const rootInterval = scaleIntervals[rootScaleDegree];
        const rootNoteIndex = (keyIndex + rootInterval) % 12;
        const rootNoteName = NOTES[rootNoteIndex];

        let newLabel;
        if (use7Chords) {
            newLabel = rootNoteName + chord.suffix7;
        } else {
            newLabel = rootNoteName + chord.suffix3;
        }
        const degreesArray = use7Chords ? (chord.degrees7 || chord.degrees) : chord.degrees;

        return {
            label: newLabel,
            degrees: degreesArray
        };
    });
}

function getScaleDegrees(scaleType) {
    switch(scaleType) {
        case 'major':
            return { 0: '1', 2: '2', 4: '3', 5: '4', 7: '5', 9: '6', 11: '7' };
        case 'minor':
            return { 0: '1', 2: '2b', 3: '3', 5: '4', 7: '5', 8: '6b', 10: '7b' };
        case 'pentaMajor':
            return { 0: '1', 2: '2', 4: '3', 7: '5', 9: '6' };
        case 'pentaMinor':
            return { 0: '1', 3: '3b', 5: '4', 7: '5', 10: '7b' };
        default:
            return { 0: '1', 2: '2', 4: '3', 5: '4', 7: '5', 9: '6', 11: '7' };
    }
}

/**
 * 移動ド＋CDE: キー主音を「表記上のC」とみなし、スケール内を C 大調の音名で出す（Major は C,D,E,F,G,A,B）。
 * 移動ド＋ドレミ: 同じくスケール内を ドレミファソラシ。固定ドは絶対音高で C=ド（半音は ♯ 表記）。
 * 度数は常にキー（＋カポ）基準の P1 / M2 など。CDE・ドレミのみ固定ド・移動ドで分岐。
 */
const MOVABLE_DIATONIC_LETTERS = {
    major: { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' },
    minor: { 0: 'C', 2: 'D', 3: 'Eb', 5: 'F', 7: 'G', 8: 'Ab', 10: 'Bb' },
    pentaMajor: { 0: 'C', 2: 'D', 4: 'E', 7: 'G', 9: 'A' },
    pentaMinor: { 0: 'C', 3: 'Eb', 5: 'F', 7: 'G', 10: 'Bb' }
};

function getMovableDiatonicLetterLabel(degreeFromKey, scaleType) {
    const map = MOVABLE_DIATONIC_LETTERS[scaleType || 'major'] || MOVABLE_DIATONIC_LETTERS.major;
    return map.hasOwnProperty(degreeFromKey) ? map[degreeFromKey] : undefined;
}

const MOVABLE_DIATONIC_SOLFEGE = {
    major: { 0: 'ド', 2: 'レ', 4: 'ミ', 5: 'ファ', 7: 'ソ', 9: 'ラ', 11: 'シ' },
    minor: { 0: 'ド', 2: 'レ', 3: '♭ミ', 5: 'ファ', 7: 'ソ', 8: '♭ラ', 10: '♭シ' },
    pentaMajor: { 0: 'ド', 2: 'レ', 4: 'ミ', 7: 'ソ', 9: 'ラ' },
    pentaMinor: { 0: 'ド', 3: '♭ミ', 5: 'ファ', 7: 'ソ', 10: '♭シ' }
};

/** 固定ド＝C をドとした絶対表記（NOTES の半音と対応） */
const FIXED_SOLFEGE = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ'];

function getMovableDiatonicSolfegeLabel(degreeFromKey, scaleType) {
    const map = MOVABLE_DIATONIC_SOLFEGE[scaleType || 'major'] || MOVABLE_DIATONIC_SOLFEGE.major;
    return map.hasOwnProperty(degreeFromKey) ? map[degreeFromKey] : undefined;
}

/** 自由探索のマーカー文字（CDE / 度数 / ドレミ × 固定ド・移動ド） */
function getVisualizeMarkerLabel(noteIdx, scaleType, displayMode, doMode, isScale, degreeFromKey, allDegrees) {
    if (displayMode === 'degree') {
        return allDegrees[degreeFromKey] || NOTES[noteIdx];
    }
    if (displayMode === 'solfege') {
        if (doMode === 'fixed') {
            return FIXED_SOLFEGE[noteIdx] || NOTES[noteIdx];
        }
        if (isScale) {
            const s = getMovableDiatonicSolfegeLabel(degreeFromKey, scaleType);
            if (s) return s;
        }
        return FIXED_SOLFEGE[noteIdx] || NOTES[noteIdx];
    }
    if (doMode === 'fixed') {
        return NOTES[noteIdx];
    }
    if (isScale) {
        const letter = getMovableDiatonicLetterLabel(degreeFromKey, scaleType);
        if (letter) return letter;
    }
    return NOTES[noteIdx];
}

function getAllDegreesWithAccidentals(scaleType) {
    // 標準的な音楽理論の度数表記: P1, m2, M2, m3, M3, P4, dim5, P5, m6, M6, m7, M7
    const intervalsFromRoot = {
        0: 'P1',   // 完全1度
        1: 'm2',   // 短2度
        2: 'M2',   // 長2度
        3: 'm3',   // 短3度
        4: 'M3',   // 長3度
        5: 'P4',   // 完全4度
        6: 'dim5', // 減5度
        7: 'P5',   // 完全5度
        8: 'm6',   // 短6度
        9: 'M6',   // 長6度
        10: 'm7',  // 短7度
        11: 'M7'   // 長7度
    };
    return intervalsFromRoot;
}

function renderVisualize(app) {
    if (typeof state.visualize.capo === 'undefined') state.visualize.capo = 0;
    if (typeof state.visualize.displayMode === 'undefined') state.visualize.displayMode = 'note';
    if (typeof state.visualize.scale === 'undefined') state.visualize.scale = 'major';
    if (typeof state.visualize.selectedChordIndex === 'undefined') state.visualize.selectedChordIndex = null;
    if (typeof state.visualize.doMode === 'undefined') state.visualize.doMode = 'movable';

    const chords = getDiatonicChordsForKey(state.visualize.key, state.visualize.scale, state.visualize.chordType === '7');
    const chordButtonsHtml = chords.map((chord, idx) => {
        const isSelected = state.visualize.selectedChordIndex === idx;
        const isDisabled = !state.visualize.autoSelectRootChord;
        return `<button class="chord-btn ${isSelected ? 'active' : ''} ${isDisabled ? 'disabled' : ''}" data-chord-index="${idx}">${chord.label}</button>`;
    }).join('');

    app.innerHTML = `
        <header style="padding-top: 10px; margin-bottom: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <button class="icon-btn" id="btn-back">◀ ホーム</button>
                <h2 style="font-size: 1.5rem; margin:0; flex:1; text-align:center;">自由探索モード</h2>
                <button class="icon-btn" id="btn-settings-visualize" style="font-size: 1.5rem; background: none; border: none; padding: 0; cursor: pointer;" title="設定">⚙️</button>
            </div>
        </header>

        <div class="setup-panel">
            <div class="setup-item">
                <label>キー</label>
                <select id="vis-key">
                    ${NOTES.map((note, idx) => `<option value="${idx}" ${state.visualize.key===idx?'selected':''}>${note}</option>`).join('')}
                </select>
            </div>
            <div class="setup-item">
                <label>カポ</label>
                <select id="vis-capo">
                    ${[0,1,2,3,4,5,6,7].map(c => `<option value="${c}" ${state.visualize.capo===c?'selected':''}>${c}</option>`).join('')}
                </select>
            </div>
            <div class="setup-item">
                <label>スケール</label>
                <select id="vis-scale">
                    <option value="major" ${state.visualize.scale==='major'?'selected':''}>Major</option>
                    <option value="minor" ${state.visualize.scale==='minor'?'selected':''}>Minor</option>
                    <option value="pentaMajor" ${state.visualize.scale==='pentaMajor'?'selected':''}>Penta Major</option>
                    <option value="pentaMinor" ${state.visualize.scale==='pentaMinor'?'selected':''}>Penta Minor</option>
                </select>
            </div>
            <div class="setup-item">
                <div class="mode-buttons">
                    <button class="mode-btn ${state.visualize.displayMode==='solfege'?'active':''}" data-mode="solfege">ドレミ</button>
                    <button class="mode-btn ${state.visualize.displayMode==='note'?'active':''}" data-mode="note">CDE</button>
                    <button class="mode-btn ${state.visualize.displayMode==='degree'?'active':''}" data-mode="degree">度数</button>
                </div>
            </div>
            <div class="setup-item">
                <div class="mode-buttons">
                    <button type="button" class="do-mode-btn ${state.visualize.doMode==='movable'?'active':''}" data-do-mode="movable">移動ド</button>
                    <button type="button" class="do-mode-btn ${state.visualize.doMode==='fixed'?'active':''}" data-do-mode="fixed">固定ド</button>
                </div>
            </div>
        </div>

        <div id="fretboard-container" style="width: 100%;"></div>

        <div class="visualize-chords-afterboard" style="margin-bottom: 120px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                <h3 style="font-size: 1rem; color: rgba(255,255,255,0.7); margin: 0;">ダイアトニックコード</h3>
                <label class="toggle-switch" style="margin-left: 10px;">
                    <input type="checkbox" id="auto-select-root-chord" ${state.visualize.autoSelectRootChord ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div class="chord-list">
                ${chordButtonsHtml}
            </div>
            <div style="display: flex; gap: 15px; margin-top: 20px; justify-content: center;">
                <button type="button" class="chord-type-btn ${state.visualize.chordType==='3'?'active':''}" data-chord-type="3">3和音</button>
                <button type="button" class="chord-type-btn ${state.visualize.chordType==='7'?'active':''}" data-chord-type="7">4和音</button>
            </div>
        </div>
    `;

    document.getElementById('btn-back').onclick = () => {
        state.course = null;
        saveState();
        renderApp();
    };

    document.getElementById('btn-settings-visualize').onclick = () => {
        openSettings('visualize');
    };

    document.getElementById('vis-key').onchange = (e) => {
        state.visualize.key = parseInt(e.target.value);
        saveState();
        renderApp();
    };

    document.getElementById('vis-capo').onchange = (e) => {
        state.visualize.capo = parseInt(e.target.value);
        saveState();
        renderApp();
    };

    document.getElementById('vis-scale').onchange = (e) => {
        state.visualize.scale = e.target.value;
        state.visualize.selectedChordIndex = null;
        saveState();
        renderApp();
    };

    document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
        btn.onclick = () => {
            state.visualize.displayMode = btn.getAttribute('data-mode');
            saveState();
            renderApp();
        };
    });

    document.querySelectorAll('.do-mode-btn').forEach(btn => {
        btn.onclick = () => {
            state.visualize.doMode = btn.getAttribute('data-do-mode');
            saveState();
            renderApp();
        };
    });

    document.querySelectorAll('.chord-type-btn').forEach(btn => {
        btn.onclick = () => {
            state.visualize.chordType = btn.getAttribute('data-chord-type');
            saveState();
            renderApp();
        };
    });

    const autoSelectToggle = document.getElementById('auto-select-root-chord');
    if (autoSelectToggle) {
        autoSelectToggle.onchange = () => {
            state.visualize.autoSelectRootChord = autoSelectToggle.checked;
            saveState();
            renderApp();
        };
    }

    renderFretboardHTML('fretboard-container', {
        mode: 'visualize',
        keyIndex: state.visualize.key,
        capo: state.visualize.capo,
        displayMode: state.visualize.displayMode,
        scale: state.visualize.scale,
        selectedChordIndex: state.visualize.selectedChordIndex,
        doMode: state.visualize.doMode,
        chordType: state.visualize.chordType,
        autoSelectRootChord: state.visualize.autoSelectRootChord
    });

    // body は overflow:hidden のため、縦長コンテンツは #app 内でスクロール（設定画面と同じ）
    app.style.height = '100vh';
    app.style.overflowY = 'auto';
    app.style.overflowX = 'hidden';
}

function renderSettings(app) {
    const settingsDocumentHandlers = [];
    const settingsSnapshot = cloneSettings(state.settings);
    app.innerHTML = `
        <header style="padding-top: 10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:20px;">
                <button class="icon-btn" id="btn-back-settings">◀ 戻る</button>
                <h2 style="font-size:1.5rem; margin:0;">設定</h2>
                <div style="width:80px;"></div>
            </div>
        </header>

        <div class="settings-card">
            <h3 class="settings-card-title">クルージングモードのテンポ</h3>
            <div class="settings-value-row">
                <span>遅い</span>
                <span class="settings-value-badge" id="tempo-display">BPM ${state.settings.tempo}</span>
                <span>速い</span>
            </div>
            <input type="range" id="tempo-slider" min="40" max="200" value="${state.settings.tempo}" class="settings-range">
            <p class="settings-note">BPM 75 が初心者向けの推奨スピードです。「ドン・タン・ドン・タン」の「タン」に合わせてタップ。</p>
        </div>

        <div class="settings-card">
            <h3 class="settings-card-title">問題モードの制限時間</h3>
            <div class="settings-value-row">
                <span>短い</span>
                <span class="settings-value-badge" id="timer-display">${state.settings.quizTimeLimit} 秒</span>
                <span>長い</span>
            </div>
            <input type="range" id="timer-slider" min="1" max="10" step="1" value="${state.settings.quizTimeLimit}" class="settings-range">
            <p class="settings-note">設定した秒数以内に答えないとMissになります。（推奨: 5秒）</p>
        </div>

        <div class="settings-card">
            <h3 class="settings-card-title">指板の視点</h3>

            <div class="settings-preview-area">
                <div class="settings-preview-clip">
                    <div id="tilt-preview-container" style="pointer-events:none;"></div>
                </div>
                <div id="trackball-area" class="settings-trackball">
                    <div id="trackball-pointer" class="settings-trackball-dot"></div>
                </div>
            </div>

            <div id="tilt-setting-group" style="border-top:1px solid rgba(255,255,255,0.1); padding-top:16px; margin-top:8px;">
                <div class="settings-row-between" style="margin-bottom:10px;">
                    <label for="fretboard-orientation-auto" class="settings-label" style="cursor:pointer;">画面の向きで自動切替</label>
                    <input type="checkbox" id="fretboard-orientation-auto" class="settings-checkbox-native" ${state.settings.fretboardViewAutoOrientation ? 'checked' : ''}>
                </div>
                <p class="settings-note" style="margin-top:0; margin-bottom:12px;">オンにすると、横持ちでは全体ビュー、縦持ちでは拡大ビューになります。オフのときは下のボタンで選べます。</p>
                <div class="settings-view-buttons">
                    <button class="settings-view-btn ${state.settings.fretboardView === 'full' ? 'active' : ''}" data-view="full" ${state.settings.fretboardViewAutoOrientation ? 'disabled' : ''}>全体ビュー</button>
                    <button class="settings-view-btn ${state.settings.fretboardView === 'zoom' ? 'active' : ''}" data-view="zoom" ${state.settings.fretboardViewAutoOrientation ? 'disabled' : ''}>拡大ビュー</button>
                </div>
                <p class="settings-note" style="margin-top:6px; margin-bottom:14px;">全体ビューは0〜12フレットを表示、拡大ビューは約5フレット分を大きく表示します。</p>

                <div class="settings-row-between" style="margin-bottom:8px;">
                    <span class="settings-label">カメラの向き（ドラッグで操作）</span>
                </div>
                <p class="settings-note" style="margin-top:0; margin-bottom:14px;">中央をドラッグで上下左右、端をドラッグで回転します。まずはプリセットを選んでから微調整すると簡単です。</p>

                <div class="settings-presets">
                    <button class="settings-preset-btn" data-preset="front">正面カメラ</button>
                    <button class="settings-preset-btn" data-preset="diagonal">斜めカメラ</button>
                </div>

                <div class="settings-axes">
                    <div class="settings-axis-item">
                        <div class="settings-row-between" style="margin-bottom:4px;">
                            <span class="settings-axis-label">X軸（前後）</span>
	                            <div style="display:flex; align-items:center; gap:6px;">
	                                <span class="settings-axis-val" id="rot-x-disp">${Math.round(state.settings.rotation.x)}°</span>
	                                <button class="settings-reset-btn" data-reset="rot-x">初期値</button>
	                            </div>
	                        </div>
                        <input type="range" id="rot-x-slider" min="-90" max="90" step="1" value="${state.settings.rotation.x}" class="settings-range">
                    </div>
                    <div class="settings-axis-item">
                        <div class="settings-row-between" style="margin-bottom:4px;">
                            <span class="settings-axis-label">Y軸（左右）</span>
	                            <div style="display:flex; align-items:center; gap:6px;">
	                                <span class="settings-axis-val" id="rot-y-disp">${Math.round(state.settings.rotation.y)}°</span>
	                                <button class="settings-reset-btn" data-reset="rot-y">初期値</button>
	                            </div>
	                        </div>
                        <input type="range" id="rot-y-slider" min="-90" max="90" step="1" value="${state.settings.rotation.y}" class="settings-range">
                    </div>
                    <div class="settings-axis-item">
                        <div class="settings-row-between" style="margin-bottom:4px;">
                            <span class="settings-axis-label">Z軸（回転）</span>
	                            <div style="display:flex; align-items:center; gap:6px;">
	                                <span class="settings-axis-val" id="rot-z-disp">${Math.round(state.settings.rotation.z)}°</span>
	                                <button class="settings-reset-btn" data-reset="rot-z">初期値</button>
	                            </div>
	                        </div>
                        <input type="range" id="rot-z-slider" min="-180" max="180" step="1" value="${state.settings.rotation.z}" class="settings-range">
                    </div>
                </div>

		                <div class="settings-row-between" style="margin-bottom:6px;">
		                    <span class="settings-label">カメラ奥行（横 ヘッド小 ← → 12F大）</span>
		                    <div class="settings-value-control">
	                        <span class="settings-value-badge-sm" id="persp-origin-display">${state.settings.perspOriginX}</span>
	                        <button class="settings-reset-btn" data-reset="persp-origin">初期値</button>
	                    </div>
		                </div>
	                <input type="range" id="persp-origin-slider" min="0" max="100" step="1" value="${state.settings.perspOriginX}" class="settings-range">

		                <div class="settings-row-between" style="margin-top:16px; margin-bottom:6px;">
		                    <span class="settings-label">弦間の広さ（1弦小、6弦大）</span>
		                    <div class="settings-value-control">
		                        <span class="settings-value-badge-sm" id="persp-display">${state.settings.perspective}</span>
		                        <button class="settings-reset-btn" data-reset="perspective">初期値</button>
		                    </div>
		                </div>
	                <input type="range" id="persp-slider" min="0" max="100" step="1" value="${state.settings.perspective}" class="settings-range" style="margin-bottom:16px;">

		                <div class="settings-row-between" style="margin-top:16px; margin-bottom:6px;">
		                    <span class="settings-label">弦間の広さ（一律）</span>
	                    <div class="settings-value-control">
	                        <span class="settings-value-badge-sm" id="string-spacing-display">${state.settings.stringSpacing}%</span>
	                        <button class="settings-reset-btn" data-reset="string-spacing">初期値</button>
	                    </div>
	                </div>
                <input type="range" id="string-spacing-slider" min="80" max="150" step="1" value="${state.settings.stringSpacing}" class="settings-range">
                <p class="settings-note" style="margin-top:10px;">横の奥行は「ヘッド側を小さくしたい時」に上げます。迷ったら 70〜90 がおすすめです。</p>
            </div>
	        </div>
	        <div class="settings-actions-footer">
	            <button class="settings-bottom-btn settings-apply-btn" id="btn-settings-apply">決定</button>
	            <div class="settings-secondary-actions">
	                <button class="btn-secondary settings-bottom-btn" id="btn-settings-cancel">キャンセル</button>
	                <button class="btn-secondary settings-bottom-btn settings-danger-btn" id="btn-settings-defaults">全ての項目をデフォルトに戻す</button>
	            </div>
	        </div>
	    `;

    const closeSettings = (shouldSave) => {
        if (!shouldSave) {
            state.settings = cloneSettings(settingsSnapshot);
        }
        state.course = settingsReturnCourse;
        settingsReturnCourse = null;
        saveState();
        renderApp();
    };

    document.getElementById('btn-back-settings').onclick = () => closeSettings(true);
    document.getElementById('btn-settings-cancel').onclick = () => closeSettings(false);
    document.getElementById('btn-settings-apply').onclick = () => closeSettings(true);

    const tempoSlider = document.getElementById('tempo-slider');
    const tempoDisplay = document.getElementById('tempo-display');
    tempoSlider.oninput = (e) => {
        state.settings.tempo = parseInt(e.target.value);
        tempoDisplay.textContent = `BPM ${state.settings.tempo}`;
    };

    const timerSlider = document.getElementById('timer-slider');
    const timerDisplay = document.getElementById('timer-display');
    timerSlider.oninput = (e) => {
        state.settings.quizTimeLimit = parseInt(e.target.value);
        timerDisplay.textContent = `${state.settings.quizTimeLimit} 秒`;
    };

    const updatePreview = () => {
        renderFretboardHTML('tilt-preview-container', {
            mode: 'visualize',
            question: null,
            showAnswer: true,
            displayMode: 'note',
            keyIndex: 0,
            capo: 0,
            onFretClick: null
        });
    };

    renderFretboardHTML('tilt-preview-container', {
        mode: 'visualize',
        question: null,
        showAnswer: true,
        displayMode: 'note',
        keyIndex: 0,
        capo: 0,
        onFretClick: null
    });
    // Call transform immediately after HTML is injected
    setTimeout(() => { if(typeof updatePreviewTransform === 'function') updatePreviewTransform(); }, 0);


    const dragArea = document.getElementById('trackball-area');
    const dispX = document.getElementById('rot-x-disp');
    const dispY = document.getElementById('rot-y-disp');
    const dispZ = document.getElementById('rot-z-disp');
    const perspSlider = document.getElementById('persp-slider');
    const perspDisp = document.getElementById('persp-display');
    const perspOriginSlider = document.getElementById('persp-origin-slider');
    const perspOriginDisp = document.getElementById('persp-origin-display');
    const stringSpacingSlider = document.getElementById('string-spacing-slider');
    const stringSpacingDisp = document.getElementById('string-spacing-display');

    function syncFretboardViewSettingsUI() {
        const chk = document.getElementById('fretboard-orientation-auto');
        if (chk) chk.checked = !!state.settings.fretboardViewAutoOrientation;
        document.querySelectorAll('.settings-view-btn').forEach(b => {
            const v = b.getAttribute('data-view');
            b.disabled = !!state.settings.fretboardViewAutoOrientation;
            b.classList.toggle('active', v === state.settings.fretboardView);
        });
    }

    function refreshSettingsControls() {
        tempoSlider.value = state.settings.tempo;
        tempoDisplay.textContent = `BPM ${state.settings.tempo}`;
        timerSlider.value = state.settings.quizTimeLimit;
        timerDisplay.textContent = `${state.settings.quizTimeLimit} 秒`;
        perspSlider.value = state.settings.perspective;
        perspOriginSlider.value = state.settings.perspOriginX;
        stringSpacingSlider.value = state.settings.stringSpacing;
        stringSpacingDisp.textContent = `${state.settings.stringSpacing}%`;
        syncFretboardViewSettingsUI();
        updatePreview();
        updatePreviewTransform();
    }

    let isDragging = false;
    let startX = 0, startY = 0;
    let initRotX = 0, initRotY = 0, initRotZ = 0;
    let dragMode = 'xy';

    function updatePreviewTransform() {
        if (!document.getElementById('tilt-preview-container')) return;
        const rotXSlider = document.getElementById('rot-x-slider');
        const rotYSlider = document.getElementById('rot-y-slider');
        const rotZSlider = document.getElementById('rot-z-slider');
        if (!dispX || !dispY || !dispZ || !perspDisp || !perspOriginDisp || !perspOriginSlider || !stringSpacingDisp || !stringSpacingSlider || !rotXSlider || !rotYSlider || !rotZSlider) return;

        const r = state.settings.rotation;
        const p_intensity = state.settings.perspective || 0;
        const p_px = 2000;
        const originX = state.settings.perspOriginX || 0;

        const previewContainer = document.querySelector('#tilt-preview-container .fretboard-container');
        const perspectiveWrapper = document.querySelector('#tilt-preview-container .fretboard-perspective-wrapper');
        if (perspectiveWrapper && previewContainer) {
            perspectiveWrapper.style.perspectiveOrigin = `50% 50%`;
            perspectiveWrapper.style.perspective = `${p_px}px`;

            // Center around 3rd string, 5th fret in projected space.
            const xEdges = getFretXEdges();
            const fret6CenterX = (xEdges[6] + xEdges[7]) / 2;
            const anchorY = getStringOriginalBounds(2).bottom; // exact boundary between 3rd and 4th strings
            const projectedAnchor = projectPoint(fret6CenterX, anchorY, FRETBOARD_SURFACE_Z);

            const clipEl = document.querySelector('.settings-preview-clip');
            const clipW = clipEl ? clipEl.offsetWidth : 360;
            const clipH = clipEl ? clipEl.offsetHeight : 180;
            const projectedBounds = getProjectedFretboardBounds(getNeckYBounds().top, getNeckYBounds().bottom);
            const isZoomPreview = state.settings.fretboardView === 'zoom';
            const zoomFretWidth = FRET_WIDTHS[0] * 5.2;
            let scale = isZoomPreview
                ? Math.min(1.15, Math.max(0.7, clipW / zoomFretWidth))
                : Math.min(0.56, (clipW - 16) / projectedBounds.width, (clipH - 16) / projectedBounds.height);
            const targetX = clipW / 2;
            const targetY = clipH / 2 - 8; // lift fretboard slightly so center sits between 3rd/4th strings visually
            // Keep the anchor point fixed at preview center.
            // This makes Z rotation orbit around that center (0F/12F trace arcs).
            const tx = targetX - projectedAnchor.x * scale;
            let ty = targetY - projectedAnchor.y * scale;
            let adjustedTx = tx;

            if (!isZoomPreview) {
                const leftMargin = 8;
                const rightMargin = 8;
                adjustedTx = targetX - projectedAnchor.x * scale;
                ty = targetY - projectedAnchor.y * scale;
                const currentLeft = projectedBounds.minX * scale + adjustedTx;
                const currentRight = projectedBounds.maxX * scale + adjustedTx;
                const currentTop = projectedBounds.minY * scale + ty;
                const currentBottom = projectedBounds.maxY * scale + ty;
                if (currentLeft < leftMargin) adjustedTx += (leftMargin - currentLeft);
                if (currentRight > clipW - rightMargin) adjustedTx -= (currentRight - (clipW - rightMargin));
                if (currentTop < 8) ty += (8 - currentTop);
                if (currentBottom > clipH - 8) ty -= (currentBottom - (clipH - 8));
            }

            // Rotation is already reflected in projected geometry (projectPoint).
            // Keep preview container transform to layout-only (center/fit) to avoid double rotation.
            previewContainer.style.transformOrigin = `0 0`;
            previewContainer.style.transform = `translateX(${adjustedTx.toFixed(1)}px) translateY(${ty.toFixed(1)}px) scale(${scale.toFixed(3)})`;
        }

        const pointer = document.getElementById('trackball-pointer');
        if (pointer) {
            const ptX = (r.y / 80) * 60;
            const ptY = (-r.x / 80) * 60;
            pointer.style.transform = `translate(${ptX}px, ${ptY}px) rotate(${r.z}deg)`;
            pointer.style.background = dragMode === 'z' ? '#c77dff' : '#4f9cf9';
            pointer.style.boxShadow = `0 0 10px ${dragMode === 'z' ? '#c77dff' : '#4f9cf9'}`;
        }
        dispX.textContent = `${Math.round(r.x)}°`;
        dispY.textContent = `${Math.round(r.y)}°`;
        dispZ.textContent = `${Math.round(r.z)}°`;
        rotXSlider.value = r.x;
        rotYSlider.value = r.y;
        rotZSlider.value = r.z;
        perspDisp.textContent = `${p_intensity}`;
        perspOriginDisp.textContent = `${originX}`;
        perspOriginSlider.value = originX;
        stringSpacingDisp.textContent = `${state.settings.stringSpacing}%`;
        stringSpacingSlider.value = state.settings.stringSpacing;
    }

    perspSlider.oninput = (e) => { state.settings.viewMode = 'custom'; state.settings.perspective = parseInt(e.target.value); updatePreview(); updatePreviewTransform(); };
    perspOriginSlider.oninput = (e) => { state.settings.viewMode = 'custom'; state.settings.perspOriginX = parseInt(e.target.value); updatePreview(); updatePreviewTransform(); };
    stringSpacingSlider.oninput = (e) => {
        state.settings.stringSpacing = parseInt(e.target.value);
        stringSpacingDisp.textContent = `${state.settings.stringSpacing}%`;
        updatePreview();
        updatePreviewTransform();
    };
    document.getElementById('rot-x-slider').oninput = (e) => { state.settings.viewMode = 'custom'; state.settings.rotation.x = parseInt(e.target.value); updatePreview(); updatePreviewTransform(); };
    document.getElementById('rot-y-slider').oninput = (e) => { state.settings.viewMode = 'custom'; state.settings.rotation.y = parseInt(e.target.value); updatePreview(); updatePreviewTransform(); };
    document.getElementById('rot-z-slider').oninput = (e) => { state.settings.viewMode = 'custom'; state.settings.rotation.z = parseInt(e.target.value); updatePreview(); updatePreviewTransform(); };

    document.querySelectorAll('.settings-reset-btn').forEach(btn => {
        btn.onclick = () => {
            state.settings.viewMode = 'custom';
            const resetTarget = btn.getAttribute('data-reset');
            if (resetTarget === 'rot-x') state.settings.rotation.x = DEFAULT_ROTATION.x;
            if (resetTarget === 'rot-y') state.settings.rotation.y = DEFAULT_ROTATION.y;
            if (resetTarget === 'rot-z') state.settings.rotation.z = DEFAULT_ROTATION.z;
            if (resetTarget === 'perspective') state.settings.perspective = DEFAULT_VERTICAL_PERSPECTIVE;
            if (resetTarget === 'persp-origin') state.settings.perspOriginX = DEFAULT_HORIZONTAL_PERSPECTIVE;
            if (resetTarget === 'string-spacing') state.settings.stringSpacing = DEFAULT_STRING_SPACING;
            refreshSettingsControls();
        };
    });

    document.querySelectorAll('.settings-preset-btn').forEach(btn => {
        btn.onclick = () => {
            const preset = btn.getAttribute('data-preset');
            state.settings.viewMode = 'custom';
            if (preset === 'front') {
                state.settings.rotation = { ...DEFAULT_ROTATION };
                state.settings.perspective = 0;
                state.settings.perspOriginX = 0;
            } else if (preset === 'diagonal') {
                state.settings.rotation = {x: 30, y: -12, z: 1};
                state.settings.perspective = 30;
                state.settings.perspOriginX = 90;
                state.settings.stringSpacing = DEFAULT_STRING_SPACING;
            }
            if (preset === 'front') {
                state.settings.stringSpacing = DEFAULT_STRING_SPACING;
            }
            refreshSettingsControls();
        };
    });

    document.querySelectorAll('.settings-view-btn').forEach(btn => {
        btn.onclick = () => {
            if (state.settings.fretboardViewAutoOrientation) return;
            state.settings.fretboardView = btn.getAttribute('data-view');
            syncFretboardViewSettingsUI();
            updatePreview();
            updatePreviewTransform();
            saveState();
        };
    });

    const fretboardOrientationAuto = document.getElementById('fretboard-orientation-auto');
    if (fretboardOrientationAuto) {
        fretboardOrientationAuto.onchange = () => {
            state.settings.fretboardViewAutoOrientation = fretboardOrientationAuto.checked;
            if (fretboardOrientationAuto.checked) {
                applyFretboardViewFromOrientationIfAuto();
            }
            syncFretboardViewSettingsUI();
            updatePreview();
            updatePreviewTransform();
            saveState();
        };
    }

    document.getElementById('btn-settings-defaults').onclick = () => {
        state.settings = getDefaultSettings();
        refreshSettingsControls();
    };

    function handleDragStart(e) {
        isDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        startX = clientX; startY = clientY;
        initRotX = state.settings.rotation.x;
        initRotY = state.settings.rotation.y;
        initRotZ = state.settings.rotation.z;
        if (dragArea) {
            const rect = dragArea.getBoundingClientRect();
            const dist = Math.sqrt(Math.pow(clientX - rect.left - rect.width/2, 2) + Math.pow(clientY - rect.top - rect.height/2, 2));
            dragMode = dist > (rect.width / 2) * 0.7 ? 'z' : 'xy';
        }
        updatePreviewTransform();
        dragArea.style.cursor = 'grabbing';
    }

    function handleDragMove(e) {
        if (!isDragging) return;
        state.settings.viewMode = 'custom';
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const dx = clientX - startX;
        const dy = clientY - startY;
        if (dragMode === 'xy') {
            state.settings.rotation.y = initRotY + dx * 0.5;
            state.settings.rotation.x = initRotX - dy * 0.5;
        } else {
            state.settings.rotation.z = initRotZ + (dx + dy) * 0.5;
        }
        state.settings.rotation.x = Math.max(-80, Math.min(80, state.settings.rotation.x));
        state.settings.rotation.y = Math.max(-80, Math.min(80, state.settings.rotation.y));
        state.settings.rotation.z = Math.max(-180, Math.min(180, state.settings.rotation.z));
        updatePreview();
        updatePreviewTransform();
    }

    function handleDragEnd() {
        if (isDragging) { isDragging = false; dragArea.style.cursor = 'grab'; }
    }

    dragArea.addEventListener('mousedown', handleDragStart);
    document.addEventListener('mousemove', handleDragMove);
    settingsDocumentHandlers.push(['mousemove', handleDragMove]);
    document.addEventListener('mouseup', handleDragEnd);
    settingsDocumentHandlers.push(['mouseup', handleDragEnd]);
    dragArea.addEventListener('touchstart', handleDragStart, {passive: false});
    document.addEventListener('touchmove', handleDragMove, {passive: false});
    settingsDocumentHandlers.push(['touchmove', handleDragMove]);
    document.addEventListener('touchend', handleDragEnd);
    settingsDocumentHandlers.push(['touchend', handleDragEnd]);
    app._cleanupSettingsHandlers = () => {
        settingsDocumentHandlers.forEach(([eventName, handler]) => {
            document.removeEventListener(eventName, handler);
        });
        app._cleanupSettingsHandlers = null;
    };

    app.style.height = '100vh';
    app.style.overflowY = 'auto';
    app.style.overflowX = 'hidden';
}

function renderFretboardHTML(containerId, options) {
    const {
        mode, question, showAnswer, clicked, onFretClick,
        keyIndex, capo, displayMode, scale, selectedChordIndex,
        doMode: doModeOpt, chordType, autoSelectRootChord
    } = options;
    const doMode = doModeOpt || 'movable';
    const use7Chords = chordType === '7';

    // If old perspective value (>100), migrate it to the 0-100 range.
    if (state.settings.perspective > 100) {
        state.settings.perspective = Math.round((2000 - state.settings.perspective) / 17);
        if (state.settings.perspective < 0) state.settings.perspective = 0;
        if (state.settings.perspective > 100) state.settings.perspective = 100;
        saveState();
    }
    const p_intensity = state.settings.perspective !== undefined ? state.settings.perspective : 0;
    const isTiltPreview = containerId === 'tilt-preview-container';
    // Keep preview perspective stable to prevent one-frame zoom flicker while sliders drag.
    const p_px = isTiltPreview ? 2000 : (1000 + (100 - p_intensity) * 10);
    
    let hasHighlight = mode === 'memorize' && !showAnswer;
    const nextCruiseTarget = (mode === 'memorize' && state.memorize.playMode === 'cruise')
        ? state.memorize.cruiseTargets[state.memorize.cruiseIndex + 1]
        : null;
    let containerClass = 'fretboard-container view-custom';
    const xEdges = getFretXEdges();
    const stringOrder = [1, 2, 3, 4, 5, 6];
    
    const neckBounds = getNeckYBounds();
    const neckTop = neckBounds.top;
    const neckBottom = neckBounds.bottom;

    const scrollWrapperClass =
        mode === 'visualize'
            ? 'fretboard-scroll-wrapper fretboard-scroll-wrapper--visualize'
            : 'fretboard-scroll-wrapper';
    const scrollGroupAttr =
        containerId === 'fretboard-container' ? ` data-scroll-group="${mode}"` : '';
    let html = `<div class="${scrollWrapperClass}"${scrollGroupAttr}>`;
    html += `<div class="fretboard-perspective-wrapper" style="perspective: ${p_px}px; perspective-origin: 50% 50%; transform-style: preserve-3d;">`;
    html += `<div class="${containerClass}" style="transform: none;">`;

    // Front face — exactly the fingerboard height (SVG overflows for fret numbers)
    html += `<div class="neck-face neck-front projected-neck" style="width:${FRETBOARD_WIDTH}px; height:${neckBottom}px; transform: translateZ(0); background: transparent; border: none; box-shadow: none;">`;

    const gradientId = `neck-wood-grad-${containerId}`;
    const fretGradientId = `fret-wire-grad-${containerId}`;
    const nutGradientId = `nut-grad-${containerId}`;
    const sideGradientId = `neck-side-grad-${containerId}`;
    const numberStripGradientId = `fret-number-strip-grad-${containerId}`;
    const neckDropShadowId = `neck-drop-shadow-${containerId}`;
    const topEdgeGlowId = `top-edge-glow-${containerId}`;
    const edgeH = 3; // px — black edge line thickness

    // SVG with explicit pixel size so it overflows beyond the front face for fret numbers
    html += `<svg class="projected-fretboard-svg" style="width:${FRETBOARD_WIDTH}px; height:${FRETBOARD_VIEWBOX_HEIGHT}px;" viewBox="0 0 ${FRETBOARD_WIDTH} ${FRETBOARD_VIEWBOX_HEIGHT}" preserveAspectRatio="none" aria-hidden="true">`;
    html += `<defs>
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#17100b"/>
            <stop offset="14%" stop-color="#2d1e14"/>
            <stop offset="33%" stop-color="#3f2a1a"/>
            <stop offset="52%" stop-color="#5a3a23"/>
            <stop offset="68%" stop-color="#442b1b"/>
            <stop offset="84%" stop-color="#2c1c12"/>
            <stop offset="100%" stop-color="#18110c"/>
        </linearGradient>
        <linearGradient id="${fretGradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#777"/>
            <stop offset="18%" stop-color="#b8b8b8"/>
            <stop offset="38%" stop-color="#f2f2f2"/>
            <stop offset="50%" stop-color="#ffffff"/>
            <stop offset="64%" stop-color="#dfdfdf"/>
            <stop offset="82%" stop-color="#9a9a9a"/>
            <stop offset="100%" stop-color="#5e5e5e"/>
        </linearGradient>
        <linearGradient id="${nutGradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#c7c1b0"/>
            <stop offset="35%" stop-color="#ece6d6"/>
            <stop offset="55%" stop-color="#faf4e6"/>
            <stop offset="78%" stop-color="#dcd5c5"/>
            <stop offset="100%" stop-color="#b9b3a4"/>
        </linearGradient>
        <linearGradient id="${sideGradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#4a2d1b"/>
            <stop offset="45%" stop-color="#2c1a11"/>
            <stop offset="100%" stop-color="#120b07"/>
        </linearGradient>
        <linearGradient id="${numberStripGradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#050505"/>
            <stop offset="45%" stop-color="#0b0b0b"/>
            <stop offset="70%" stop-color="#080808"/>
            <stop offset="100%" stop-color="#040404"/>
        </linearGradient>
        <linearGradient id="${topEdgeGlowId}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="rgba(255,244,220,0.24)"/>
            <stop offset="50%" stop-color="rgba(255,244,220,0.34)"/>
            <stop offset="100%" stop-color="rgba(255,244,220,0.18)"/>
        </linearGradient>
        <filter id="${neckDropShadowId}" x="-20%" y="-20%" width="140%" height="180%">
            <feDropShadow dx="-3" dy="8" stdDeviation="5" flood-color="rgba(0,0,0,0.55)"/>
            <feDropShadow dx="2" dy="10" stdDeviation="6" flood-color="rgba(0,0,0,0.35)"/>
        </filter>
    </defs>`;

    // Fingerboard wood and edge lines are projected with the same rule as strings/frets.
    if (isTiltPreview) {
        // Preview thickness uses screen-space extrusion so Y rotation won't create front popping/stretch.
        const r = state.settings.rotation || { x: 0, y: 0, z: 0 };
        const dx = clamp((-r.y * 0.45) + (r.z * 0.08), -34, 34);
        const dyMagnitude = clamp(16 + (Math.abs(r.x) * 0.24), 12, 38);
        const dy = (r.x >= 0 ? 1 : -1) * dyMagnitude;
        const depthEdges = xEdges.slice(1);
        const frontTop = depthEdges.map(x => projectPoint(x, neckTop + edgeH, FRETBOARD_SURFACE_Z));
        const frontBottom = depthEdges.map(x => projectPoint(x, neckBottom - edgeH, FRETBOARD_SURFACE_Z));
        const backTop = frontTop.map(p => ({ x: p.x + dx, y: p.y + dy }));
        const backBottom = frontBottom.map(p => ({ x: p.x + dx, y: p.y + dy }));
        const backWoodPoly = buildClosedPolygon([...backTop, ...backBottom.slice().reverse()]);
        const topDepthPoly = buildClosedPolygon([...frontTop, ...backTop.slice().reverse()]);
        const bottomDepthPoly = buildClosedPolygon([...frontBottom, ...backBottom.slice().reverse()]);
        const bassSidePoly = buildClosedPolygon([frontTop[0], frontBottom[0], backBottom[0], backTop[0]]);
        const trebleSidePoly = buildClosedPolygon([
            frontTop[frontTop.length - 1],
            frontBottom[frontBottom.length - 1],
            backBottom[backBottom.length - 1],
            backTop[backTop.length - 1]
        ]);
        html += `<polygon points="${backWoodPoly}" fill="url(#${sideGradientId})"></polygon>`;
        if (dy >= 0) {
            html += `<polygon points="${topDepthPoly}" fill="rgba(240,215,185,0.20)"></polygon>`;
            html += `<polygon points="${bottomDepthPoly}" fill="url(#${sideGradientId})"></polygon>`;
        } else {
            html += `<polygon points="${topDepthPoly}" fill="url(#${sideGradientId})"></polygon>`;
            html += `<polygon points="${bottomDepthPoly}" fill="rgba(240,215,185,0.18)"></polygon>`;
        }
        html += `<polygon points="${bassSidePoly}" fill="url(#${sideGradientId})"></polygon>`;
        html += `<polygon points="${trebleSidePoly}" fill="url(#${sideGradientId})"></polygon>`;
    }

    const boardEdges = xEdges.slice(1);
    const projectedWood = buildProjectedBandPolygon(neckTop + edgeH, neckBottom - edgeH, FRETBOARD_SURFACE_Z, boardEdges);
    const projectedTopEdge = buildProjectedBandPolygon(neckTop, neckTop + edgeH, FRETBOARD_SURFACE_Z, boardEdges);
    const projectedBottomEdge = buildProjectedBandPolygon(neckBottom - edgeH, neckBottom, FRETBOARD_SURFACE_Z, boardEdges);
    html += `<polygon points="${projectedWood}" fill="url(#${gradientId})" filter="url(#${neckDropShadowId})"></polygon>`;
    html += `<polygon points="${projectedTopEdge}" fill="url(#${topEdgeGlowId})"></polygon>`;
    html += `<polygon points="${projectedBottomEdge}" fill="rgba(8,6,4,0.92)"></polygon>`;



    const dotPoints = [
        ...[3, 5, 7, 9].map(f => ({ fret: f, y: FRETBOARD_CENTER_Y })),
        { fret: 12, y: FRETBOARD_CENTER_Y },
        { fret: 12, y: (getStringOriginalY(1) + getStringOriginalY(4)) / 2 }
    ];
    dotPoints.forEach(dot => {
        const x = (xEdges[dot.fret] + xEdges[dot.fret + 1]) / 2;
        const p = projectPoint(x, dot.y, FRET_DOT_Z);
        html += `<circle class="projected-fret-dot" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${(8 * p.scale).toFixed(2)}"></circle>`;
    });

    stringOrder.forEach((stringNum, rowIndex) => {
        const originalY = getStringOriginalY(rowIndex);
        const stringClass = hasHighlight && stringNum !== question.stringName ? 'projected-string dimmed' : (hasHighlight ? 'projected-string highlighted' : 'projected-string');
        for (let i = 0; i < xEdges.length - 1; i++) {
            const p1 = projectPoint(xEdges[i], originalY, STRING_Z);
            const p2 = projectPoint(xEdges[i + 1], originalY, STRING_Z);
            const strokeWidth = getStringThickness(stringNum) * ((p1.scale + p2.scale) / 2);
            html += `<path class="${stringClass}" data-string="${stringNum}" d="${buildSvgPath([p1, p2])}" stroke-width="${strokeWidth.toFixed(2)}"></path>`;
        }
    });

    xEdges.forEach((x, index) => {
        if (index === 0) return; // remove fret wire left of open strings
        const topPoint = projectPoint(x, neckTop, FRETBOARD_SURFACE_Z);
        const bottomPoint = projectPoint(x, neckBottom, FRETBOARD_SURFACE_Z);
        const wireWidth = index === 1 ? 8 : 4;
        const gradId = index === 1 ? nutGradientId : fretGradientId;
        const wireClass = index === 1 ? 'projected-fret-wire nut' : 'projected-fret-wire';
        html += `<line class="${wireClass}" x1="${topPoint.x.toFixed(2)}" y1="${topPoint.y.toFixed(2)}" x2="${bottomPoint.x.toFixed(2)}" y2="${bottomPoint.y.toFixed(2)}" stroke="url(#${gradId})" stroke-width="${wireWidth}"></line>`;
    });

    for (let f = 0; f <= MAX_FRET; f++) {
        if (f === 0) continue;
        const x = (xEdges[f] + xEdges[f + 1]) / 2;
        const labelY = f === 0
            ? (neckBottom - edgeH - 8)
            : (neckBottom + FRET_NUMBER_STRIP_HEIGHT * 0.58);
        const labelPoint = projectPoint(x, labelY, FRET_NUMBER_Z);
        const scale = labelPoint.scale;
        html += `<text class="projected-fret-number" data-fret="${f}" x="${labelPoint.x.toFixed(2)}" y="${labelPoint.y.toFixed(2)}" font-size="${(19 * scale).toFixed(2)}">${f}</text>`;
    }

    html += `</svg>`;
    html += `<div class="projected-hit-layer" style="height:${neckBottom}px;">`;

    for (let rowIndex = 0; rowIndex < stringOrder.length; rowIndex++) {
        let stringNum = stringOrder[rowIndex];
        let stringIdx = 6 - stringNum;

        for (let f = 0; f <= MAX_FRET; f++) {
            let noteIdx = (OPEN_STRINGS[stringIdx] + f) % 12;
            let markerHtml = '';
            
            // Interaction logic: in memorize mode, everything is interactive unless it's showing the answer in quiz mode
            let isInteractive = (mode === 'memorize'); 
            if (mode === 'memorize' && showAnswer && state.memorize.playMode === 'quiz') {
                isInteractive = false; // Disable clicking after answering in quiz mode
            }
            
            let fretClass = isInteractive ? 'fret-column interactive' : 'fret-column';
            
            if (mode === 'memorize') {
                let isTargetQuiz = (question && stringNum === question.stringName && noteIdx === question.noteIdx);
                let isTargetCruise = (question && stringNum === question.stringName && f === question.fret);
                let isClicked = clicked && (clicked.stringNum === stringNum && clicked.fret === f);

                // 正解のフレットには特別なクラスを付与して視覚化できるようにする
                if (isTargetCruise || (state.memorize.playMode === 'quiz' && isTargetQuiz)) {
                    fretClass += ' is-target-fret';
                }

                if (state.memorize.playMode === 'cruise') {
                    // Cruise mode: always show answer, user must click it
                    let isScope = state.memorize.cruiseScope.some(t => t.stringName === stringNum && t.fret === f);
                    let isNextCruise = nextCruiseTarget && stringNum === nextCruiseTarget.stringName && f === nextCruiseTarget.fret && !isTargetCruise;
                    if (isTargetCruise) {
                        markerHtml = `<div class="note-marker target-note correct-note">${NOTES[noteIdx]}</div>`;
                    } else if (isNextCruise) {
                        markerHtml = `<div class="note-marker target-note next-note">${NOTES[noteIdx]}</div>`;
                    } else if (isScope) {
                        markerHtml = `<div class="note-marker target-note grey-note">${NOTES[noteIdx]}</div>`;
                    } else {
                        markerHtml = `<div class="note-marker hidden-note"></div>`;
                    }
                } else {
                    // Quiz mode
                    if (showAnswer) {
                        if (isTargetQuiz && isClicked) {
                            markerHtml = `<div class="note-marker target-note correct-note">${NOTES[noteIdx]}</div>`;
                        } else if (isTargetQuiz) {
                            markerHtml = `<div class="note-marker target-note correct-note">${NOTES[noteIdx]}</div>`;
                        } else if (isClicked && !clicked.isCorrect) {
                            markerHtml = `<div class="note-marker target-note wrong-note">${NOTES[noteIdx]}</div>`;
                        } else {
                            markerHtml = `<div class="note-marker hidden-note"></div>`;
                        }
                    } else {
                        markerHtml = `<div class="note-marker hidden-note"></div>`;
                    }
                }
            } else if (mode === 'visualize') {
                let isBelowCapo = f < capo;
                if (isBelowCapo) {
                    markerHtml = `<div class="note-marker hidden-note"></div>`;
                } else {
                    const capoVal = capo | 0;
                    // カポで実際に鳴るキーが上がる分、度数・移動ド表記の基準もずらす
                    const keyPcForHarmony = (keyIndex + capoVal) % 12;
                    const degreeFromKey = (noteIdx - keyPcForHarmony + 12) % 12;
                    const scaleDegrees = getScaleDegrees(scale || 'major');
                    const allDegrees = getAllDegreesWithAccidentals(scale || 'major');
                    let isScale = scaleDegrees.hasOwnProperty(degreeFromKey);

                    let shouldShow = true;
                    if (autoSelectRootChord && selectedChordIndex !== null && selectedChordIndex !== undefined) {
                        const chords = DIATONIC_CHORDS[scale || 'major'] || DIATONIC_CHORDS.major;
                        const selectedChord = chords[selectedChordIndex];
                        const degreesToCheck = use7Chords
                            ? (selectedChord.degrees7 || selectedChord.degrees)
                            : selectedChord.degrees;
                        shouldShow = selectedChord && degreesToCheck.includes(degreeFromKey);
                    } else if (!autoSelectRootChord) {
                        shouldShow = isScale;
                    }

                    if (!shouldShow) {
                        markerHtml = `<div class="note-marker hidden-note"></div>`;
                    } else {
                        const label = getVisualizeMarkerLabel(
                            noteIdx,
                            scale || 'major',
                            displayMode,
                            doMode,
                            isScale,
                            degreeFromKey,
                            allDegrees
                        );
                        let roleClass = 'role-non-target';
                        if (isScale) {
                            if (degreeFromKey === 0) roleClass = 'role-root';
                            else if (degreeFromKey === 4) roleClass = 'role-third';
                            else if (degreeFromKey === 7) roleClass = 'role-fifth';
                            else if (degreeFromKey === 11) roleClass = 'role-seventh';
                            else roleClass = 'role-other';
                        } else {
                            roleClass = 'role-non-target grayed-note';
                        }

                        markerHtml = `<div class="note-marker ${roleClass}">${label}</div>`;
                    }
                }
            }

            const leftX = xEdges[f];
            const rightX = xEdges[f + 1];
            const centerX = (leftX + rightX) / 2;
            const { top: rowTopY, bottom: rowBottomY } = getStringOriginalBounds(rowIndex);
            const pTL = projectPoint(leftX, rowTopY, NOTE_MARKER_Z);
            const pTR = projectPoint(rightX, rowTopY, NOTE_MARKER_Z);
            const pBL = projectPoint(leftX, rowBottomY, NOTE_MARKER_Z);
            const pBR = projectPoint(rightX, rowBottomY, NOTE_MARKER_Z);
            const projectedLeft = Math.min(pTL.x, pTR.x, pBL.x, pBR.x);
            const projectedRight = Math.max(pTL.x, pTR.x, pBL.x, pBR.x);
            const projectedTopY = Math.min(pTL.y, pTR.y, pBL.y, pBR.y);
            const projectedBottomY = Math.max(pTL.y, pTR.y, pBL.y, pBR.y);
            const projectedHeight = projectedBottomY - projectedTopY;
            const projectedWidth = projectedRight - projectedLeft;
            const markerScale = projectPoint(centerX, getStringOriginalY(rowIndex), NOTE_MARKER_Z).scale;
            const markerSize = Math.max(20, 30 * markerScale);
            const markerFontSize = 0.85 * markerScale;
            const markerStyle = `width:${markerSize.toFixed(2)}px; height:${markerSize.toFixed(2)}px; font-size:${markerFontSize.toFixed(2)}rem;`;
            markerHtml = markerHtml.replace('<div class="note-marker', `<div style="${markerStyle}" class="note-marker`);
            const rotX = (state.settings.rotation && typeof state.settings.rotation.x === 'number') ? state.settings.rotation.x : 0;
            const layerOrder = rotX < 0 ? (7 - stringNum) : stringNum;
            const cellStyle = `left:${projectedLeft.toFixed(2)}px; top:${projectedTopY.toFixed(2)}px; width:${projectedWidth.toFixed(2)}px; height:${projectedHeight.toFixed(2)}px; z-index:${layerOrder};`;

            html += `<div class="${fretClass}" data-string="${stringNum}" data-fret="${f}" style="${cellStyle}">${markerHtml}</div>`;
        }
    }
    html += `</div>`;

    html += `</div>`; // neck-front
    html += `</div></div></div>`; // container & perspective-wrapper & scroll-wrapper
    
    const containerEl = document.getElementById(containerId);
    containerEl.innerHTML = html;

    // Scale the fretboard to fill the full viewport width in game mode.
    // Key constraints:
    //  1. Use window.innerWidth (not containerEl width) to break out of the
    //     app container's max-width: 600px constraint.
    //  2. Set scroll-wrapper width = FRETBOARD_WIDTH before applying scale so
    //     all frets (not just the clipped portion) are visible after scaling.
    //  3. Avoid overflow:hidden on the container — it can block iOS touch events
    //     for children whose layout position exceeds the container height.
    if (!isTiltPreview) {
        const scrollWrapper = containerEl.querySelector('.fretboard-scroll-wrapper');
        if (scrollWrapper) {
            const screenW = window.innerWidth;
            const appEl = document.getElementById('app');
            if (appEl && containerId === 'fretboard-container') {
                void appEl.offsetHeight;
            }
            const layoutW =
                appEl && appEl.clientWidth > 0 ? appEl.clientWidth : screenW;
            const isZoomView = (mode === 'memorize' || mode === 'visualize') && state.settings.fretboardView === 'zoom';
            const perspectiveWrapper = containerEl.querySelector('.fretboard-perspective-wrapper');

            // Break out of the app container's max-width by offsetting to the left
            // viewport edge. position:relative keeps the element in the flex flow.
            const containerRect = containerEl.getBoundingClientRect();
            containerEl.style.position = 'relative';
            containerEl.style.left = `${-Math.round(containerRect.left)}px`;
            containerEl.style.width = `${layoutW}px`;
            containerEl.style.overflow = '';
            containerEl.style.removeProperty('-webkit-overflow-scrolling');

            if (isZoomView) {
                scrollWrapper.style.marginLeft = '';
                const projectedBounds = getProjectedFretboardBounds(neckTop, neckBottom);
                const land = window.innerWidth > window.innerHeight;
                let maxZoomViewH =
                    mode === 'memorize' && containerId === 'fretboard-container'
                        ? Math.max(160, window.innerHeight * (land ? 0.56 : 0.36))
                        : Math.max(190, window.innerHeight * 0.36);
                if (mode === 'memorize' && containerId === 'fretboard-container') {
                    void containerEl.offsetHeight;
                    const ch = containerEl.clientHeight;
                    if (ch > 72) {
                        const zSlack = land ? 0 : 4;
                        /** 横・拡大: 下端UIとの隙間をやや詰め、指板の縦スケール上限を上げる */
                        const zBottomClear = land ? 34 : 0;
                        maxZoomViewH = Math.max(130, ch - zSlack - zBottomClear);
                    }
                }
                const zoomScale = Math.min(1, maxZoomViewH / projectedBounds.height);
                scrollWrapper.style.width = `${layoutW}px`;
                scrollWrapper.style.height = `${Math.ceil(projectedBounds.height * zoomScale)}px`;
                scrollWrapper.style.overflowX = 'auto';
                scrollWrapper.style.overflowY = 'hidden';
                scrollWrapper.style.transform = '';
                scrollWrapper.style.transformOrigin = '';
                containerEl.style.marginBottom = '';
                if (perspectiveWrapper) {
                    perspectiveWrapper.style.transformOrigin = 'top left';
                    perspectiveWrapper.style.transform = `translate(${(-projectedBounds.minX).toFixed(2)}px, ${(-projectedBounds.minY).toFixed(2)}px) scale(${zoomScale.toFixed(4)})`;
                }
            } else {
                const projectedBounds = getProjectedFretboardBounds(neckTop, neckBottom);
                const land = window.innerWidth > window.innerHeight;
                const memorizeFretHost =
                    mode === 'memorize' && containerId === 'fretboard-container';
                const visualizeFretHost =
                    mode === 'visualize' && containerId === 'fretboard-container';
                /** 横・覚える・全体: 上段テキストを詰めた分、scale 用の高さ目安を少し上げる */
                const fallbackFullH = Math.max(
                    120,
                    Math.round(
                        window.innerHeight *
                            ((memorizeFretHost || visualizeFretHost) && land ? 0.605 : land ? 0.41 : 0.3) -
                        ((memorizeFretHost || visualizeFretHost) && land ? 48 : land ? 108 : 100)
                    )
                );
                let maxFullViewH = Math.max(180, window.innerHeight * 0.35);
                const memorizeLandBottomUiClearPx =
                    (memorizeFretHost || visualizeFretHost) && land ? 22 : land ? 36 : 0;
                const readMemorizeHostMaxH = () => {
                    if ((mode !== 'memorize' && mode !== 'visualize') || containerId !== 'fretboard-container' || !appEl) {
                        return null;
                    }
                    void containerEl.offsetHeight;
                    void appEl.offsetHeight;
                    const cr = containerEl.getBoundingClientRect();
                    const appR = appEl.getBoundingClientRect();
                    const slack = land ? 0 : 5;
                    const ch = containerEl.clientHeight;
                    const fromClient =
                        ch > 72 ? ch - slack - memorizeLandBottomUiClearPx : 0;
                    const fromAppRect =
                        appR.height > 20
                            ? Math.max(
                                  0,
                                  Math.floor(
                                      appR.bottom -
                                          cr.top -
                                          slack -
                                          1 -
                                          memorizeLandBottomUiClearPx
                                  )
                              )
                            : 0;
                    const h = Math.max(
                        110,
                        fallbackFullH,
                        fromClient,
                        fromAppRect > 72 ? fromAppRect : 0
                    );
                    if (land) {
                        return Math.max(
                            h,
                            Math.floor(
                                window.innerHeight * 0.585 -
                                    memorizeLandBottomUiClearPx -
                                    2
                            )
                        );
                    }
                    return h;
                };
                const mh0 = readMemorizeHostMaxH();
                if (mh0 !== null) {
                    maxFullViewH = mh0;
                }
                const layoutPad = (memorizeFretHost || visualizeFretHost) ? (land ? 0 : 2) : 4;
                const scaleByW = (layoutW - layoutPad) / projectedBounds.width;
                const scaleByH = maxFullViewH / projectedBounds.height;
                let scale = Math.min(1, scaleByW, scaleByH);
                const scaledW = projectedBounds.width * scale;
                let centerTx = Math.max(0, Math.round((layoutW - scaledW) / 2));
                if (visualizeFretHost) {
                    let rightOffset;
                    if (land) {
                        rightOffset = layoutW < 500 ? 0 : (layoutW < 700 ? 10 : 20);
                    } else {
                        rightOffset = 20;
                    }
                    centerTx += rightOffset;
                }
                scrollWrapper.style.width = `${projectedBounds.width}px`;
                scrollWrapper.style.height = `${projectedBounds.height}px`;
                scrollWrapper.style.overflowX = 'hidden';
                scrollWrapper.style.overflowY = 'hidden';
                scrollWrapper.style.transformOrigin = 'top left';
                scrollWrapper.style.marginLeft = `${centerTx}px`;
                scrollWrapper.style.transform = `scale(${scale.toFixed(4)})`;
                if (visualizeFretHost) {
                    containerEl.style.height = `${Math.ceil(projectedBounds.height * scale)}px`;
                }
                if (perspectiveWrapper) {
                    perspectiveWrapper.style.transformOrigin = 'top left';
                    perspectiveWrapper.style.transform = `translate(${(-projectedBounds.minX).toFixed(2)}px, ${(-projectedBounds.minY).toFixed(2)}px)`;
                }
                const syncFretboardLayoutCollapse = () => {
                    if (!scrollWrapper.isConnected) return;
                    void scrollWrapper.offsetHeight;
                    const layoutH = scrollWrapper.offsetHeight;
                    const visualH = scrollWrapper.getBoundingClientRect().height;
                    if (layoutH > 1 && visualH > 1) {
                        containerEl.style.marginBottom = `${-Math.round(layoutH - visualH)}px`;
                    }
                };
                syncFretboardLayoutCollapse();
                if ((mode === 'memorize' || mode === 'visualize') && containerId === 'fretboard-container') {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            if (!scrollWrapper.isConnected || !containerEl.isConnected) return;
                            const mh1 = readMemorizeHostMaxH();
                            if (mh1 === null) {
                                syncFretboardLayoutCollapse();
                                return;
                            }
                            const s1 = Math.min(
                                1,
                                scaleByW,
                                mh1 / projectedBounds.height
                            );
                            if (Math.abs(s1 - scale) > 0.002) {
                                scale = s1;
                                const sw = projectedBounds.width * scale;
                                centerTx = Math.max(0, Math.round((layoutW - sw) / 2));
                                if (visualizeFretHost) {
                                    let rightOffset;
                                    if (land) {
                                        rightOffset = layoutW < 500 ? 0 : (layoutW < 700 ? 10 : 20);
                                    } else {
                                        rightOffset = 20;
                                    }
                                    centerTx += rightOffset;
                                }
                                scrollWrapper.style.marginLeft = `${centerTx}px`;
                                scrollWrapper.style.transform = `scale(${scale.toFixed(4)})`;
                            }
                            syncFretboardLayoutCollapse();
                        });
                    });
                }
            }

            // 全体ビューは marginLeft でビューポート中央に寄せているので、left 補正はズレの原因になる（スキップ）
            if (isZoomView) {
                const wrapperRect = scrollWrapper.getBoundingClientRect();
                if (Math.abs(wrapperRect.left) > 1) {
                    const currentLeft = parseFloat(containerEl.style.left) || 0;
                    containerEl.style.left = `${Math.round(currentLeft - wrapperRect.left)}px`;
                }
            }
        }
    }

    addFretboardDots(containerId);

    cleanupFretboardDocumentHandlers(containerId);
    if (isTiltPreview) return;

    // Attach on document capture because player-view rotation can project frets outside
    // the container's layout box. Hit-test the projected 2D fret rectangles instead.
    const handleFretboardClick = (e) => {
        const chordBtn = findChordButtonFromPointerEvent(e);
        if (chordBtn) {
            const chordIndex = parseInt(chordBtn.getAttribute('data-chord-index'));
            state.visualize.selectedChordIndex =
                state.visualize.selectedChordIndex === chordIndex ? null : chordIndex;
            saveState();
            setTimeout(() => renderApp(), 0);
            return;
        }

        if (!document.body.contains(containerEl)) {
            cleanupFretboardDocumentHandlers(containerId);
            return;
        }
        const cx = e.clientX, cy = e.clientY;
        const cols = containerEl.querySelectorAll('.fret-column');
        let bestCol = null, bestDistance = Infinity;

        // 正解判定のための情報を取得（判定を甘くするため）
        const q = (mode === 'memorize') ? question : null;

        for (const col of cols) {
            const r = col.getBoundingClientRect();
            const s = parseInt(col.getAttribute('data-string'));
            const f = parseInt(col.getAttribute('data-fret'));

            // このカラムが現在の正解かどうかを判定
            let isTarget = false;
            if (q) {
                if (state.memorize.playMode === 'cruise') {
                    // クルーズモードは特定のフレットが正解
                    isTarget = (s === q.stringName && f === q.fret);
                } else {
                    // クイズモードは同じ弦の同じ音名なら正解
                    const sIdx = 6 - s;
                    const nIdx = (OPEN_STRINGS[sIdx] + f) % 12;
                    isTarget = (s === q.stringName && nIdx === q.noteIdx);
                }
            }

            // 正解のフレットには判定エリアに余裕（パディング）を持たせる
            // また、距離計算でも優遇することで、隣接フレットより優先されやすくする
            const paddingX = isTarget ? TARGET_HIT_PADDING_X_PX : 0;
            const paddingY = isTarget ? TARGET_HIT_PADDING_Y_PX : 0;
            
            if (cx >= r.left - paddingX && cx <= r.right + paddingX && 
                cy >= r.top - paddingY && cy <= r.bottom + paddingY) {
                
                const dx = cx - (r.left + r.width / 2);
                const dy = cy - (r.top + r.height / 2);
                let distance = dx * dx + dy * dy;

                // 正解の場合は距離を大幅に小さく見積もり、吸い付きやすくする
                if (isTarget) distance *= 0.1;

                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestCol = col;
                }
            }
        }
        if (!bestCol) return;
        const s = parseInt(bestCol.getAttribute('data-string'));
        const f = parseInt(bestCol.getAttribute('data-fret'));
        if (onFretClick && bestCol.classList.contains('interactive')) {
            onFretClick(s, f);
        } else if (mode === 'visualize') {
            playTone(6 - s, f);
        }
    };
    document.addEventListener('click', handleFretboardClick, true);
    fretboardDocumentHandlers.set(containerId, handleFretboardClick);
    renderFretboardHitDebug(containerId, mode, question);

    // メモライズのズーム指板だけ、描画直後にスクロール位置を整える（自由探索の全体ビューでは中央寄せ margin を壊さない）
    if (mode === 'memorize' && containerId === 'fretboard-container') {
        setTimeout(() => {
            const wrapper = containerEl.querySelector('.fretboard-scroll-wrapper');
            if (wrapper && wrapper.firstChild) {
                wrapper.scrollLeft = 0;
                wrapper.firstChild.style.marginLeft = '0';
            }
        }, 10);
    }
}

function renderFretboardHitDebug(containerId, mode, question) {
    if (!FRETBOARD_HIT_DEBUG) return;

    const containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    let overlay = document.getElementById(`hit-debug-${containerId}`);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = `hit-debug-${containerId}`;
        overlay.className = 'hit-debug-overlay';
        document.body.appendChild(overlay);
    }

    const draw = () => {
        if (!document.body.contains(containerEl)) {
            cleanupFretboardDocumentHandlers(containerId);
            return;
        }

        const q = mode === 'memorize' ? question : null;
        const cols = containerEl.querySelectorAll('.fret-column');
        let html = '';
        let targetSummary = [];

        cols.forEach(col => {
            const r = col.getBoundingClientRect();
            const s = parseInt(col.getAttribute('data-string'));
            const f = parseInt(col.getAttribute('data-fret'));
            let isTarget = false;

            if (q) {
                if (state.memorize.playMode === 'cruise') {
                    isTarget = (s === q.stringName && f === q.fret);
                } else {
                    const sIdx = 6 - s;
                    const nIdx = (OPEN_STRINGS[sIdx] + f) % 12;
                    isTarget = (s === q.stringName && nIdx === q.noteIdx);
                }
            }

            const padX = isTarget ? TARGET_HIT_PADDING_X_PX : 0;
            const padY = isTarget ? TARGET_HIT_PADDING_Y_PX : 0;
            const left = Math.round(r.left - padX);
            const top = Math.round(r.top - padY);
            const width = Math.round(r.width + padX * 2);
            const height = Math.round(r.height + padY * 2);
            const centerX = Math.round(r.left + r.width / 2);
            const centerY = Math.round(r.top + r.height / 2);
            const boxClass = isTarget ? 'hit-debug-box target' : 'hit-debug-box';
            const label = isTarget
                ? `${s}弦${f}F 正解 ${width}x${height}px`
                : `${s}-${f}`;

            if (isTarget) {
                targetSummary.push(`${s}弦${f}F: ${width} x ${height} CSS px`);
            }

            html += `
                <div class="${boxClass}" style="left:${left}px; top:${top}px; width:${width}px; height:${height}px;">
                    <span>${label}</span>
                </div>
                <div class="hit-debug-center ${isTarget ? 'target' : ''}" style="left:${centerX}px; top:${centerY}px;"></div>
            `;
        });

        html += `
            <div class="hit-debug-panel">
                <strong>Hit Debug</strong>
                <div>単位: CSS px（getBoundingClientRect）</div>
                <div>通常: 投影後フレット矩形そのまま</div>
                <div>正解: 横 +${TARGET_HIT_PADDING_X_PX}px / 縦 +${TARGET_HIT_PADDING_Y_PX}px</div>
                <div>幅はフレット間隔そのまま、高さは +${TARGET_HIT_PADDING_Y_PX * 2}px</div>
                <div>${targetSummary.length ? targetSummary.join('<br>') : '正解対象なし'}</div>
            </div>
        `;
        overlay.innerHTML = html;
    };

    requestAnimationFrame(draw);

    const wrapper = containerEl.querySelector('.fretboard-scroll-wrapper');
    if (wrapper && !fretboardDebugScrollHandlers.has(containerId)) {
        const scrollHandler = () => requestAnimationFrame(draw);
        wrapper.addEventListener('scroll', scrollHandler, { passive: true });
        fretboardDebugScrollHandlers.set(containerId, scrollHandler);
    }
    window.addEventListener('resize', draw, { once: true });
}

function addFretboardDots(containerId) {
    const container = document.getElementById(containerId).querySelector('.fretboard-container');
    if (!container) return;

    const singleDotFrets = [3, 5, 7, 9];
    singleDotFrets.forEach(f => {
        const col = container.querySelector(`.string-row[data-string="3"] .fret-column[data-fret="${f}"]`);
        if (col) {
            let dot = document.createElement('div');
            dot.className = 'fret-dot';
            dot.style.top = '100%';
            dot.style.left = '50%';
            dot.style.transform = 'translate(-50%, -50%)';
            col.appendChild(dot);
        }
    });

    const fret12RowA = container.querySelector(`.string-row[data-string="5"] .fret-column[data-fret="12"]`);
    if (fret12RowA) {
        let dot = document.createElement('div');
        dot.className = 'fret-dot';
        dot.style.top = '100%';
        dot.style.left = '50%';
        dot.style.transform = 'translate(-50%, -50%)';
        fret12RowA.appendChild(dot);
    }
    
    const fret12RowB = container.querySelector(`.string-row[data-string="3"] .fret-column[data-fret="12"]`);
    if (fret12RowB) {
        let dot = document.createElement('div');
        dot.className = 'fret-dot';
        dot.style.top = '100%';
        dot.style.left = '50%';
        dot.style.transform = 'translate(-50%, -50%)';
        fret12RowB.appendChild(dot);
    }
}

// Initial render
document.addEventListener('DOMContentLoaded', () => {
    renderApp();
});
