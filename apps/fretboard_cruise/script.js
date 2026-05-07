const FRETBOARD_CRUISE_APP_VERSION = '1.54.6';
window.FRETBOARD_CRUISE_APP_VERSION = FRETBOARD_CRUISE_APP_VERSION;

// Constants
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OPEN_STRINGS = [4, 9, 2, 7, 11, 4]; // E A D G B E (6弦 -> 1弦)
const STRINGS_REV = [6, 5, 4, 3, 2, 1];
/** 描画できる指板の右端。通常表示は12Fまでに絞る */
const MAX_FRET = 24;
const DEFAULT_VISIBLE_MAX_FRET = 12;
const PRACTICE_MAX_FRET = 17;
const EXTENDED_VISIBLE_MAX_FRET = 24;
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
const DEFAULT_FRETBOARD_VIEW_AUTO_ORIENTATION = true;
const DEFAULT_CRUISE_LOOP_COUNT = 1;
const ROUTE_EDITOR_MAX_GROUPS = 20;
const ROUTE_EDITOR_SCALE_GUIDE_LABELS = {
    0: 'ド',
    2: 'レ',
    4: 'ミ',
    5: 'ファ',
    7: 'ソ',
    9: 'ラ',
    11: 'シ'
};

// Default States
let state = {
    course: null, // 'modeSelect' | 'ruleSelect' | 'basicRules' | 'basicRuleStep' | 'stageSelect' | 'memorize' | 'routeEditor' | 'visualize'
    memorize: {
        playMode: 'quiz', // 'cruise' | 'quiz'
        stage: 1,
        correct: 0,
        combo: 0,
        currentQuestion: null,
        cruiseTargets: [],
        cruiseScope: [], // Unique targets for rendering grey notes
        cruiseIndex: 0,
        cruiseCurrentLoop: 0,
        isCleared: false,
        hasTappedCurrentNote: false,
        isFirstNote: true,
        tempFeedback: null,
        isDemoPlayback: false,
        demoReturnCourse: null,
        demoReturnStage: null,
        stage1RepeatHintMode: 1,
        stage1IsContinuedRepeat: false, // True while 2nd note of a repeated pair is playing
        highlightMode: 2, // 1-5: Visual highlight pattern for current/next note (2=Glow)
        isCruisePlaying: true // Is cruise rhythm currently playing (default: playing)
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
        autoSelectRootChord: false,
        /** 自由探索だけ、13F以降を任意で表示 */
        showExtendedFrets: false
    },
    rules: {
        step: 1,
        page: 0,
        tapIndex: 0,
        phase: 'intro',
        labelMode: 'solfege',
        /** 0=1枚目のイントロ文、1=learnThemeIntro2（同じスライド内の2枚目） */
        ruleIntroStage: 0,
        celebration: null,
        /** STEP4-2 実践：画角スライド演出の第2段階へ進んだか */
        step4Slide2RevealDone: false,
        /** STEP4-3 実践：STEP4-2の横位置からスライド済みか */
        step4Slide3ScrollRevealDone: false,
        /** STEP5-1：チェックで練習から外したマス */
        step5ExcludedSlots: {},
        /** STEP5-2：同上（STEP5-1 とは別に保存） */
        step5ExcludedSlotsPart2: {},
        completedSteps: {}
    },
    routeEditor: {
        stage: 1,
        draft: [],
        deleteMode: false,
        history: [],
        deletePicker: null,
        groupBreaks: [],
        selectedGroupIndex: 0,
        visibleGroupIndices: [],
        forceHideAllGroups: false,
        showAllGroupsExpanded: false,
        groupPanelOffset: { x: 0, y: 0 }
    },
    settings: {
        tempo: DEFAULT_TEMPO,
        quizTimeLimit: DEFAULT_QUIZ_TIME_LIMIT,
        stringSpacing: DEFAULT_STRING_SPACING, // 100% = default
        noteLabelMode: 'solfege',
        viewMode: 'front',
        rotation: { ...DEFAULT_ROTATION },
        perspective: DEFAULT_VERTICAL_PERSPECTIVE, // 遠近感 (0-100)
        perspOriginX: DEFAULT_HORIZONTAL_PERSPECTIVE, // 横の遠近感 (0-100, 100=12F大きく)
        fretboardView: DEFAULT_FRETBOARD_VIEW,
        fretboardViewAutoOrientation: DEFAULT_FRETBOARD_VIEW_AUTO_ORIENTATION,
        cruiseLoopCount: DEFAULT_CRUISE_LOOP_COUNT,
        cruiseStageRoutes: {},
        cruiseStageRouteGroups: {},
        neckModelVersion: FRETBOARD_NECK_MODEL_VERSION
    }
};

let currentScrollLeft = 0;
let autoScrollRequested = false;
let nextTargetTime = 0;
let settingsReturnCourse = null;
let settingsPausedState = null;
let quizAdvanceTimeout = null;
let quizToneTimeout = null;
let ruleAdvanceLocked = false;
let ruleMissFeedbackTimeout = null;
let ruleCueScrollCleanup = null;
/** STEP3-1：太い弦↔開放の黄線レイアウト用スクロール／resize の解除 */
let ruleStep31LineCleanup = null;
let ruleStep31LineTimeoutIds = [];
/** 「半音！」ポップ：同じペア内では位置を付け直さない（チラつき防止） */
let ruleHalfToneLastPair = null;
let ruleHalfToneLastScroll = -1;
/** innerHTML で消えないよう、再描画前に外しておく既存ノード */
let ruleHalfTonePopDetached = null;
let ruleStep3GapPopDetached = null;
/** STEP4-3「1フレットずれる」吹き出し */
let ruleStep43GapPopDetached = null;
let ruleStep43GapCleanup = null;
let ruleStep43GapTimeoutIds = [];
const fretboardDocumentHandlers = new Map();
const fretboardDebugScrollHandlers = new Map();
const routeEditorDragHandlers = new Map();
const routeEditorGroupPanelDragHandlers = new Map();
let routeEditorDragSuppressRouteIndex = null;
let routeEditorDragSuppressNextClick = false;

function cleanupFretboardDocumentHandlers(containerId) {
    if (containerId) {
        const handler = fretboardDocumentHandlers.get(containerId);
        if (handler) {
            document.removeEventListener('click', handler, true);
            fretboardDocumentHandlers.delete(containerId);
        }
        const dragHandlers = routeEditorDragHandlers.get(containerId);
        if (dragHandlers) {
            document.removeEventListener('pointerdown', dragHandlers.pointerdown, true);
            document.removeEventListener('pointermove', dragHandlers.pointermove, true);
            document.removeEventListener('pointerup', dragHandlers.pointerup, true);
            document.removeEventListener('pointercancel', dragHandlers.pointercancel, true);
            routeEditorDragHandlers.delete(containerId);
        }
        const groupPanelDragHandlers = routeEditorGroupPanelDragHandlers.get(containerId);
        if (groupPanelDragHandlers) {
            document.removeEventListener('pointermove', groupPanelDragHandlers.pointermove, true);
            document.removeEventListener('pointerup', groupPanelDragHandlers.pointerup, true);
            document.removeEventListener('pointercancel', groupPanelDragHandlers.pointercancel, true);
            routeEditorGroupPanelDragHandlers.delete(containerId);
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
    routeEditorDragHandlers.forEach(handlers => {
        document.removeEventListener('pointerdown', handlers.pointerdown, true);
        document.removeEventListener('pointermove', handlers.pointermove, true);
        document.removeEventListener('pointerup', handlers.pointerup, true);
        document.removeEventListener('pointercancel', handlers.pointercancel, true);
    });
    routeEditorDragHandlers.clear();
    routeEditorGroupPanelDragHandlers.forEach(handlers => {
        document.removeEventListener('pointermove', handlers.pointermove, true);
        document.removeEventListener('pointerup', handlers.pointerup, true);
        document.removeEventListener('pointercancel', handlers.pointercancel, true);
    });
    routeEditorGroupPanelDragHandlers.clear();
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
        if (!state.visualize) {
            state.visualize = {
                key: 0,
                capo: 0,
                displayMode: 'note',
                chordType: 'M',
                degreeMode: false,
                showExtendedFrets: false
            };
        }
        if (!state.rules) {
            state.rules = {
                step: 1,
                page: 0,
                tapIndex: 0,
                phase: 'intro',
                labelMode: 'solfege',
                ruleIntroStage: 0,
                celebration: null,
                step4Slide2RevealDone: false,
                step4Slide3ScrollRevealDone: false,
                step5ExcludedSlots: {},
                step5ExcludedSlotsPart2: {},
                completedSteps: {}
            };
        }
        if (typeof state.rules.step === 'undefined') state.rules.step = 1;
        if (typeof state.rules.page === 'undefined') state.rules.page = 0;
        if (typeof state.rules.tapIndex === 'undefined') state.rules.tapIndex = 0;
        if (typeof state.rules.phase === 'undefined') state.rules.phase = 'intro';
        if (typeof state.rules.labelMode === 'undefined') state.rules.labelMode = 'solfege';
        if (typeof state.rules.ruleIntroStage !== 'number') state.rules.ruleIntroStage = 0;
        if (typeof state.rules.step4Slide2RevealDone !== 'boolean') state.rules.step4Slide2RevealDone = false;
        if (typeof state.rules.step4Slide3ScrollRevealDone !== 'boolean') state.rules.step4Slide3ScrollRevealDone = false;
        if (
            !state.rules.step5ExcludedSlots ||
            typeof state.rules.step5ExcludedSlots !== 'object' ||
            Array.isArray(state.rules.step5ExcludedSlots)
        ) {
            state.rules.step5ExcludedSlots = {};
        }
        if (
            !state.rules.step5ExcludedSlotsPart2 ||
            typeof state.rules.step5ExcludedSlotsPart2 !== 'object' ||
            Array.isArray(state.rules.step5ExcludedSlotsPart2)
        ) {
            state.rules.step5ExcludedSlotsPart2 = {};
        }
        if (
            !state.rules.completedSteps ||
            typeof state.rules.completedSteps !== 'object' ||
            Array.isArray(state.rules.completedSteps)
        ) {
            state.rules.completedSteps = {};
        }
        if (typeof state.rules.step === 'number' && state.rules.step > 5) {
            state.rules.step = 5;
            state.rules.page = 0;
            state.rules.phase = 'intro';
            state.rules.tapIndex = 0;
        }
        if (typeof state.memorize.isDemoPlayback !== 'boolean') state.memorize.isDemoPlayback = false;
        if (typeof state.memorize.demoReturnCourse === 'undefined') state.memorize.demoReturnCourse = null;
        if (typeof state.memorize.demoReturnStage === 'undefined') state.memorize.demoReturnStage = null;
        // Official specification: always use mode 1 (1/2 display)
        state.memorize.stage1RepeatHintMode = 1;
        state.memorize.stage1IsContinuedRepeat = false;
        if (typeof state.visualize.key === 'undefined') state.visualize.key = 0;
        if (typeof state.visualize.capo === 'undefined') state.visualize.capo = 0;
        if (typeof state.visualize.displayMode === 'undefined') state.visualize.displayMode = 'note';
        if (typeof state.visualize.doMode === 'undefined') state.visualize.doMode = 'movable';
        if (typeof state.visualize.chordType === 'undefined') state.visualize.chordType = '3';
        if (typeof state.visualize.autoSelectRootChord === 'undefined') state.visualize.autoSelectRootChord = false;
        if (typeof state.visualize.showExtendedFrets === 'undefined') state.visualize.showExtendedFrets = false;
        if (typeof state.settings.tempo === 'undefined') state.settings.tempo = DEFAULT_TEMPO;
        if (typeof state.settings.quizTimeLimit === 'undefined') state.settings.quizTimeLimit = DEFAULT_QUIZ_TIME_LIMIT;
        if (typeof state.settings.stringSpacing === 'undefined') state.settings.stringSpacing = DEFAULT_STRING_SPACING;
        if (typeof state.settings.noteLabelMode === 'undefined') state.settings.noteLabelMode = state.rules?.labelMode || 'solfege';
        if (typeof state.settings.viewMode === 'undefined') state.settings.viewMode = 'front';
        if (typeof state.settings.rotation === 'undefined') state.settings.rotation = { ...DEFAULT_ROTATION };
        if (typeof state.settings.perspective === 'undefined') state.settings.perspective = DEFAULT_VERTICAL_PERSPECTIVE;
        if (typeof state.settings.perspOriginX === 'undefined') state.settings.perspOriginX = DEFAULT_HORIZONTAL_PERSPECTIVE;
        if (typeof state.settings.fretboardView === 'undefined') state.settings.fretboardView = DEFAULT_FRETBOARD_VIEW;
        if (typeof state.settings.fretboardViewAutoOrientation === 'undefined') {
            state.settings.fretboardViewAutoOrientation = DEFAULT_FRETBOARD_VIEW_AUTO_ORIENTATION;
        }
        if (typeof state.settings.cruiseLoopCount === 'undefined') {
            state.settings.cruiseLoopCount = DEFAULT_CRUISE_LOOP_COUNT;
        }
        state.settings.routeEditorScaleGuideVariant = 3;
        if (
            !state.settings.cruiseStageRoutes ||
            typeof state.settings.cruiseStageRoutes !== 'object' ||
            Array.isArray(state.settings.cruiseStageRoutes)
        ) {
            state.settings.cruiseStageRoutes = {};
        }
        if (
            !state.settings.cruiseStageRouteGroups ||
            typeof state.settings.cruiseStageRouteGroups !== 'object' ||
            Array.isArray(state.settings.cruiseStageRouteGroups)
        ) {
            state.settings.cruiseStageRouteGroups = {};
        }
        if (
            !state.routeEditor ||
            typeof state.routeEditor !== 'object' ||
            Array.isArray(state.routeEditor)
        ) {
            state.routeEditor = { stage: 1, draft: [], deleteMode: false, history: [], deletePicker: null, groupBreaks: [], selectedGroupIndex: 0, showAllGroupsExpanded: false };
        }
        if (!Array.isArray(state.routeEditor.draft)) state.routeEditor.draft = [];
        if (typeof state.routeEditor.stage !== 'number') state.routeEditor.stage = 1;
        if (typeof state.routeEditor.deleteMode !== 'boolean') state.routeEditor.deleteMode = false;
        if (!Array.isArray(state.routeEditor.history)) state.routeEditor.history = [];
        if (state.routeEditor.deletePicker && typeof state.routeEditor.deletePicker !== 'object') {
            state.routeEditor.deletePicker = null;
        }
        if (!Array.isArray(state.routeEditor.groupBreaks)) state.routeEditor.groupBreaks = [];
        if (typeof state.routeEditor.selectedGroupIndex !== 'number') state.routeEditor.selectedGroupIndex = 0;
        if (!Array.isArray(state.routeEditor.visibleGroupIndices)) state.routeEditor.visibleGroupIndices = [];
        if (typeof state.routeEditor.forceHideAllGroups !== 'boolean') state.routeEditor.forceHideAllGroups = false;
        if (typeof state.routeEditor.showAllGroupsExpanded !== 'boolean') state.routeEditor.showAllGroupsExpanded = false;
        if (!state.routeEditor.groupPanelOffset || typeof state.routeEditor.groupPanelOffset !== 'object') {
            state.routeEditor.groupPanelOffset = { x: 0, y: 0 };
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

function clearStage1RepeatHintState() {
    state.memorize.stage1IsContinuedRepeat = false;
}

function markRuleStepCompleted(step) {
    const doneStep = clamp(parseInt(step, 10), 1, 5);
    if (!state.rules.completedSteps || typeof state.rules.completedSteps !== 'object' || Array.isArray(state.rules.completedSteps)) {
        state.rules.completedSteps = {};
    }
    state.rules.completedSteps[String(doneStep)] = true;
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
        if (state.course === 'memorize' || state.course === 'routeEditor') {
            renderApp();
        } else if (autoChanged && (state.course === 'settings' || state.course === 'visualize' || state.course === 'ruleSelect' || state.course === 'basicRules' || state.course === 'basicRuleStep')) {
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
        noteLabelMode: 'solfege',
        viewMode: 'custom',
        rotation: { ...DEFAULT_ROTATION },
        perspective: DEFAULT_VERTICAL_PERSPECTIVE,
        perspOriginX: DEFAULT_HORIZONTAL_PERSPECTIVE,
        fretboardView: DEFAULT_FRETBOARD_VIEW,
        fretboardViewAutoOrientation: DEFAULT_FRETBOARD_VIEW_AUTO_ORIENTATION,
        cruiseLoopCount: DEFAULT_CRUISE_LOOP_COUNT,
        cruiseStageRoutes: {},
        cruiseStageRouteGroups: {},
        neckModelVersion: FRETBOARD_NECK_MODEL_VERSION
    };
}

function cloneSettings(settings) {
    return {
        ...settings,
        rotation: { ...(settings.rotation || DEFAULT_ROTATION) },
        cruiseStageRoutes: JSON.parse(JSON.stringify(settings.cruiseStageRoutes || {})),
        cruiseStageRouteGroups: JSON.parse(JSON.stringify(settings.cruiseStageRouteGroups || {}))
    };
}

function openSettings(returnCourse = state.course) {
    settingsReturnCourse = returnCourse;
    state.course = 'settings';
    saveState();
    renderApp();
}

function navButtonHtml({ id, text, extraClass = '', disabled = false, ariaLabel = text }) {
    const classes = ['icon-btn', 'page-nav-btn', extraClass].filter(Boolean).join(' ');
    return `<button class="${classes}" id="${id}" ${ariaLabel ? `aria-label="${ariaLabel}"` : ''} ${disabled ? 'disabled' : ''}>${text}</button>`;
}

function buildPageHeader({
    titleTag = 'h2',
    titleClass = '',
    titleText = '',
    titleSubText = '',
    leftHtml = '',
    rightHtml = '',
    headerClass = ''
}) {
    const subHtml = titleSubText
        ? `<p class="page-header-title-sub">${titleSubText}</p>`
        : '';
    return `
        <header class="page-header ${headerClass}">
            <div class="page-header-top">
                <div class="page-header-actions page-header-actions--left">${leftHtml}</div>
                <div class="page-header-actions page-header-actions--right">${rightHtml}</div>
            </div>
            <div class="page-header-title-wrap">
                <${titleTag} class="page-header-title ${titleClass}">${titleText}</${titleTag}>
                ${subHtml}
            </div>
        </header>
    `;
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

function getProjectedFretboardBounds(neckTop, neckBottom, maxFret = MAX_FRET) {
    const renderMaxFret = clamp(Math.floor(maxFret), 0, MAX_FRET);
    const visibleEdges = getFretXEdges().slice(0, renderMaxFret + 2);
    const stringCenters = Array.from({ length: 6 }, (_, i) => getStringOriginalY(i));
    const samplePoints = [];
    visibleEdges.forEach(x => {
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

/** 投影後の指板のうち、fretMin〜fretMaxInclusive の列だけの外接矩形（横幅に使う） */
function getProjectedFretboardBoundsForFretRange(neckTop, neckBottom, fretMin, fretMaxInclusive) {
    const xEdges = getFretXEdges();
    const fm = clamp(fretMin, 0, MAX_FRET);
    const fM = clamp(fretMaxInclusive, 0, MAX_FRET);
    const stringCenters = Array.from({ length: 6 }, (_, i) => getStringOriginalY(i));
    const samplePoints = [];
    for (let xi = fm; xi <= fM + 1; xi++) {
        const x = xEdges[xi];
        samplePoints.push(projectPoint(x, neckTop, NOTE_MARKER_Z));
        samplePoints.push(projectPoint(x, neckBottom, NOTE_MARKER_Z));
    }
    for (let f = fm; f <= fM; f++) {
        const midX = (xEdges[f] + xEdges[f + 1]) / 2;
        samplePoints.push(projectPoint(midX, FRET_NUMBER_STRIP_BOTTOM_Y + 8, FRET_NUMBER_Z));
        stringCenters.forEach(y => samplePoints.push(projectPoint(midX, y, NOTE_MARKER_Z)));
    }
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

/**
 * 自由探索で13F以降表示のとき、「〜12Fぶんが画面幅に収まる」程度まで拡大するためのスケール上限。
 * 投影だけだと12F帯の横幅がフルボードに近く見積もられることがあるので、フレット間の実長比も混ぜる。
 */
function getVisualizeExtended12FretWidthFitScale(
    layoutW,
    layoutPad,
    projectedBounds,
    neckTop,
    neckBottom,
    renderMaxFret
) {
    const xEdges = getFretXEdges();
    const fm = clamp(Math.floor(renderMaxFret), 0, MAX_FRET);
    const lin12 = Math.max(1e-6, xEdges[DEFAULT_VISIBLE_MAX_FRET + 1] - xEdges[0]);
    const linFull = Math.max(1e-6, xEdges[fm + 1] - xEdges[0]);
    const bounds12Proj = getProjectedFretboardBoundsForFretRange(
        neckTop,
        neckBottom,
        0,
        DEFAULT_VISIBLE_MAX_FRET
    ).width;
    const geoW12 = projectedBounds.width * (lin12 / linFull);
    const effectiveW12 = Math.min(bounds12Proj, geoW12);
    return (layoutW - layoutPad) / Math.max(1, effectiveW12);
}

/** 投影後の指板のうち、fretLo〜fretHi（小数可）の帯の外接矩形（開放側・高フレット側を半フレット分見切る画角用） */
function getProjectedFretboardBoundsForFretFloatRange(neckTop, neckBottom, fretLoIn, fretHiIn) {
    const xEdges = getFretXEdges();
    let fretLo = Math.min(fretLoIn, fretHiIn);
    let fretHi = Math.max(fretLoIn, fretHiIn);
    fretLo = clamp(fretLo, 0, MAX_FRET + 1 - 1e-6);
    fretHi = clamp(fretHi, 0, MAX_FRET + 1 - 1e-6);
    const fretToX = f => {
        const fCl = clamp(f, 0, MAX_FRET + 1 - 1e-9);
        const fi = Math.floor(fCl);
        const fr = fCl - fi;
        const i0 = clamp(fi, 0, MAX_FRET);
        const i1 = clamp(fi + 1, 0, MAX_FRET + 1);
        return xEdges[i0] * (1 - fr) + xEdges[i1] * fr;
    };
    const stringCenters = Array.from({ length: 6 }, (_, i) => getStringOriginalY(i));
    const samplePoints = [];
    const xAtLo = fretToX(fretLo);
    const xAtHi = fretToX(fretHi);
    samplePoints.push(projectPoint(xAtLo, neckTop, NOTE_MARKER_Z));
    samplePoints.push(projectPoint(xAtLo, neckBottom, NOTE_MARKER_Z));
    samplePoints.push(projectPoint(xAtHi, neckTop, NOTE_MARKER_Z));
    samplePoints.push(projectPoint(xAtHi, neckBottom, NOTE_MARKER_Z));
    const xiStart = Math.max(0, Math.floor(fretLo));
    const xiEnd = Math.min(MAX_FRET, Math.ceil(fretHi));
    for (let xi = xiStart; xi <= xiEnd + 1; xi++) {
        const x = xEdges[clamp(xi, 0, MAX_FRET + 1)];
        samplePoints.push(projectPoint(x, neckTop, NOTE_MARKER_Z));
        samplePoints.push(projectPoint(x, neckBottom, NOTE_MARKER_Z));
    }
    for (let f = Math.ceil(fretLo - 1e-9); f <= Math.floor(fretHi + 1e-9); f++) {
        if (f < 0 || f > MAX_FRET) continue;
        const midX = (xEdges[f] + xEdges[f + 1]) / 2;
        samplePoints.push(projectPoint(midX, FRET_NUMBER_STRIP_BOTTOM_Y + 8, FRET_NUMBER_Z));
        stringCenters.forEach(y => samplePoints.push(projectPoint(midX, y, NOTE_MARKER_Z)));
    }
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

/** STEP3・ペアタップ用：指定フレット列をラッパー中央付近に寄せる */
function alignRuleStep3FretColumnCenter(wrapper, fretNum) {
    const col =
        wrapper.querySelector(`.fret-column[data-string="4"][data-fret="${fretNum}"]`) ||
        wrapper.querySelector(`.fret-column[data-fret="${fretNum}"]`);
    if (!col) {
        wrapper.scrollLeft = 0;
        return;
    }
    const wrapperRect = wrapper.getBoundingClientRect();
    const colRect = col.getBoundingClientRect();
    const colCenter = colRect.left + colRect.width / 2;
    const wrapperCenter = wrapperRect.left + wrapperRect.width / 2;
    const delta = colCenter - wrapperCenter;
    wrapper.scrollLeft += Math.round(delta);
    const maxScroll = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
    wrapper.scrollLeft = clamp(wrapper.scrollLeft, 0, maxScroll);
}

function animateRuleWrapperScrollLeft(wrapper, targetLeft, durationMs = 950) {
    const startLeft = wrapper.scrollLeft;
    const maxScroll = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
    const endLeft = clamp(Math.round(targetLeft), 0, maxScroll);
    const delta = endLeft - startLeft;
    if (Math.abs(delta) < 2) return;
    const startTime = performance.now();
    const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const step = now => {
        if (!wrapper.isConnected) return;
        const t = clamp((now - startTime) / durationMs, 0, 1);
        wrapper.scrollLeft = startLeft + delta * easeInOut(t);
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

/**
 * STEP3-1（開放〜5F が収まる拡大のあと）：4弦3F 付近を基準に 3フレット列がラッパー中央に来るよう scrollLeft を調整する。
 */
function alignRuleStep3Page0Fret3Center(wrapper) {
    alignRuleStep3FretColumnCenter(wrapper, 3);
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

function playMidiTone(midiNote) {
    initAudio();
    if (!audioCtx) return;

    const doPlay = () => {
        const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.72, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.35);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 1.35);
    };

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
    const isTimeoutMiss = !state.memorize.hasTappedCurrentNote;
    if (isTimeoutMiss) {
        state.memorize.combo = 0;
        state.memorize.tempFeedback = { text: 'Miss... (時間切れ)', className: 'feedback-display feedback-wrong' };
    } else {
        state.memorize.tempFeedback = null;
    }

    const advanceToNext = () => {
        // Save previous question for repeat hint detection
        const prevQuestion = state.memorize.currentQuestion;

        // Move to next note
        let nextIdx = state.memorize.cruiseIndex + 1;
        if (nextIdx >= state.memorize.cruiseTargets.length) {
            const maxLoops = state.settings.cruiseLoopCount; // 0 = 無制限
            const currentLoop = state.memorize.cruiseCurrentLoop;
            if (maxLoops === 0 || currentLoop + 1 < maxLoops) {
                // ループ続行：周回カウントを進め、先頭に戻る
                // Check loop boundary for same note (STAGE1 only, 要望2)
                const nextLoopFirstNote = state.memorize.cruiseTargets[0];
                if (state.memorize.stage === 1 && prevQuestion && nextLoopFirstNote &&
                    prevQuestion.stringName === nextLoopFirstNote.stringName &&
                    prevQuestion.fret === nextLoopFirstNote.fret) {
                    state.memorize.stage1IsContinuedRepeat = true;
                } else {
                    clearStage1RepeatHintState();
                }

                state.memorize.cruiseCurrentLoop = currentLoop + 1;
                state.memorize.cruiseIndex = 0;
                state.memorize.currentQuestion = nextLoopFirstNote;
                state.memorize.hasTappedCurrentNote = false;

                let q = state.memorize.currentQuestion;
                playTone(q.stringIdx, q.fret);

                autoScrollRequested = true;
                saveState();
                renderApp();
                return;
            }
            // 規定ループ完了：STOP
            clearStage1RepeatHintState();
            state.memorize.isCleared = true;
            stopRhythm();
            saveState();
            renderApp();
            return;
        }

        state.memorize.cruiseIndex = nextIdx;
        state.memorize.currentQuestion = state.memorize.cruiseTargets[nextIdx];

        // Check if same note is repeated (STAGE1 only)
        if (state.memorize.stage === 1 && prevQuestion &&
            prevQuestion.stringName === state.memorize.currentQuestion.stringName &&
            prevQuestion.fret === state.memorize.currentQuestion.fret) {
            clearStage1RepeatHintState();
            state.memorize.stage1IsContinuedRepeat = true;  // 2回目の音（表示用）
        } else {
            clearStage1RepeatHintState();
        }

        state.memorize.hasTappedCurrentNote = false;

        let q = state.memorize.currentQuestion;
        playTone(q.stringIdx, q.fret);

        autoScrollRequested = true;
        saveState();
        renderApp();
    };

    advanceToNext();
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
        for (let f = 0; f <= PRACTICE_MAX_FRET; f++) {
            let noteIdx = (OPEN_STRINGS[s] + f) % 12;
            let isNat = [0, 2, 4, 5, 7, 9, 11].includes(noteIdx); // Keep natural notes only for beginners
            
            let add = false;
            switch(stage) {
                case 1: if (f >= 0 && f <= 3 && isNat) add = true; break;
                case 2: if (f >= 0 && f <= 5 && isNat) add = true; break;
                case 3: if (f >= 5 && f <= 9 && isNat) add = true; break;
                case 4: if (f >= 5 && f <= PRACTICE_MAX_FRET && isNat) add = true; break;
                case 5: if (f >= 0 && f <= PRACTICE_MAX_FRET && isNat) add = true; break;
                case 6: if (f >= 0 && f <= PRACTICE_MAX_FRET && isNat) add = true; break;
            }
            if (add) {
                targets.push({ stringIdx: s, stringName: 6 - s, fret: f, noteIdx: noteIdx, noteName: NOTES[noteIdx] });
            }
        }
    }
    return targets;
}

function makeCruiseTarget(stringName, fret) {
    const normalizedStringName = clamp(parseInt(stringName, 10), 1, 6);
    const normalizedFret = clamp(parseInt(fret, 10), 0, MAX_FRET);
    const stringIdx = 6 - normalizedStringName;
    const noteIdx = (OPEN_STRINGS[stringIdx] + normalizedFret) % 12;
    return {
        stringIdx,
        stringName: normalizedStringName,
        fret: normalizedFret,
        noteIdx,
        noteName: NOTES[noteIdx],
        midiNote: STRING_BASE_PITCHES[stringIdx] + normalizedFret
    };
}

function cruiseRouteSlotFromTarget(target) {
    return {
        stringName: target.stringName,
        fret: target.fret
    };
}

function normalizeCruiseRouteSlot(slot) {
    if (!slot || typeof slot !== 'object') return null;
    const stringName = parseInt(slot.stringName, 10);
    const fret = parseInt(slot.fret, 10);
    if (!Number.isFinite(stringName) || !Number.isFinite(fret)) return null;
    if (stringName < 1 || stringName > 6 || fret < 0 || fret > MAX_FRET) return null;
    return { stringName, fret };
}

function cloneCruiseRouteSlots(slots) {
    if (!Array.isArray(slots)) return [];
    return slots.map(normalizeCruiseRouteSlot).filter(Boolean).map(slot => ({ ...slot }));
}

function getSavedCruiseRouteSlots(stage) {
    const routes = state.settings.cruiseStageRoutes || {};
    const saved = routes[String(stage)];
    if (!Array.isArray(saved)) return [];
    return cloneCruiseRouteSlots(saved);
}

function findLastCruiseRouteSlotIndex(route, stringName, fret) {
    if (!Array.isArray(route)) return -1;
    for (let i = route.length - 1; i >= 0; i--) {
        const slot = normalizeCruiseRouteSlot(route[i]);
        if (!slot) continue;
        if (slot.stringName === stringName && slot.fret === fret) return i;
    }
    return -1;
}

function getRouteEditorSnapshot(stage = null) {
    const currentStage = clamp(parseInt(stage ?? state.routeEditor?.stage ?? 1, 10), 1, 6);
    const routeKey = String(currentStage);
    return {
        stage: currentStage,
        draft: cloneCruiseRouteSlots(state.routeEditor?.draft),
        deleteMode: !!state.routeEditor?.deleteMode,
        savedRoute: cloneCruiseRouteSlots(state.settings?.cruiseStageRoutes?.[routeKey]),
        deletePicker: null,
        groupBreaks: Array.isArray(state.routeEditor?.groupBreaks) ? state.routeEditor.groupBreaks.slice() : [],
        selectedGroupIndex: typeof state.routeEditor?.selectedGroupIndex === 'number' ? state.routeEditor.selectedGroupIndex : 0,
        visibleGroupIndices: Array.isArray(state.routeEditor?.visibleGroupIndices) ? state.routeEditor.visibleGroupIndices.slice() : [],
        forceHideAllGroups: !!state.routeEditor?.forceHideAllGroups,
        showAllGroupsExpanded: !!state.routeEditor?.showAllGroupsExpanded,
        groupPanelOffset: {
            x: clamp(parseInt(state.routeEditor?.groupPanelOffset?.x ?? 0, 10), -9999, 9999),
            y: clamp(parseInt(state.routeEditor?.groupPanelOffset?.y ?? 0, 10), -9999, 9999)
        }
    };
}

function pushRouteEditorHistory(stage = null) {
    if (!state.routeEditor || typeof state.routeEditor !== 'object') return;
    const snapshot = getRouteEditorSnapshot(stage);
    if (!Array.isArray(state.routeEditor.history)) state.routeEditor.history = [];
    state.routeEditor.history.push(snapshot);
    if (state.routeEditor.history.length > 40) state.routeEditor.history.shift();
}

function restoreRouteEditorSnapshot(snapshot) {
    if (!snapshot) return false;
    const stage = clamp(parseInt(snapshot.stage ?? state.routeEditor?.stage ?? 1, 10), 1, 6);
    state.routeEditor.stage = stage;
    state.routeEditor.draft = cloneCruiseRouteSlots(snapshot.draft);
    state.routeEditor.deleteMode = !!snapshot.deleteMode;
    state.routeEditor.deletePicker = null;
    state.routeEditor.groupBreaks = Array.isArray(snapshot.groupBreaks) ? snapshot.groupBreaks.slice() : [];
    state.routeEditor.selectedGroupIndex = typeof snapshot.selectedGroupIndex === 'number' ? snapshot.selectedGroupIndex : 0;
    state.routeEditor.visibleGroupIndices = Array.isArray(snapshot.visibleGroupIndices) ? snapshot.visibleGroupIndices.slice() : [];
    state.routeEditor.forceHideAllGroups = !!snapshot.forceHideAllGroups;
    state.routeEditor.showAllGroupsExpanded = !!snapshot.showAllGroupsExpanded;
    state.routeEditor.groupPanelOffset = {
        x: clamp(parseInt(snapshot.groupPanelOffset?.x ?? 0, 10), -9999, 9999),
        y: clamp(parseInt(snapshot.groupPanelOffset?.y ?? 0, 10), -9999, 9999)
    };

    if (!state.settings.cruiseStageRoutes || typeof state.settings.cruiseStageRoutes !== 'object') {
        state.settings.cruiseStageRoutes = {};
    }
    const routeKey = String(stage);
    if (Array.isArray(snapshot.savedRoute) && snapshot.savedRoute.length) {
        state.settings.cruiseStageRoutes[routeKey] = cloneCruiseRouteSlots(snapshot.savedRoute);
    } else {
        delete state.settings.cruiseStageRoutes[routeKey];
    }
    if (!state.settings.cruiseStageRouteGroups || typeof state.settings.cruiseStageRouteGroups !== 'object') {
        state.settings.cruiseStageRouteGroups = {};
    }
    if (Array.isArray(snapshot.groupBreaks) && snapshot.groupBreaks.length) {
        state.settings.cruiseStageRouteGroups[routeKey] = snapshot.groupBreaks.slice();
    } else {
        delete state.settings.cruiseStageRouteGroups[routeKey];
    }
    return true;
}

function getRouteEditorDeleteOptions(route, stringName, fret) {
    if (!Array.isArray(route)) return [];
    const options = [];
    route.forEach((slot, index) => {
        const normalized = normalizeCruiseRouteSlot(slot);
        if (!normalized) return;
        if (normalized.stringName === stringName && normalized.fret === fret) {
            options.push({
                index,
                label: `${options.length + 1}番目`,
                slot: normalized
            });
        }
    });
    return options;
}

function getRouteEditorSlotInfo(slot) {
    const normalized = normalizeCruiseRouteSlot(slot);
    if (!normalized) return null;
    const target = makeCruiseTarget(normalized.stringName, normalized.fret);
    return {
        ...normalized,
        noteIdx: target.noteIdx,
        noteName: target.noteName
    };
}

function buildAutoRouteEditorGroupBreaks(draft) {
    if (!Array.isArray(draft) || !draft.length) return [];
    const breaks = [0];
    let prevInfo = getRouteEditorSlotInfo(draft[0]);
    for (let i = 1; i < draft.length; i++) {
        const currInfo = getRouteEditorSlotInfo(draft[i]);
        if (!currInfo || !prevInfo) {
            prevInfo = currInfo;
            continue;
        }
        const splitByBoundary =
            prevInfo.noteIdx === 11 ||
            currInfo.noteIdx <= prevInfo.noteIdx ||
            (currInfo.fret < prevInfo.fret && Math.abs(currInfo.stringName - prevInfo.stringName) <= 1);
        if (splitByBoundary && breaks[breaks.length - 1] !== i) {
            breaks.push(i);
        }
        prevInfo = currInfo;
    }
    return breaks;
}

function normalizeRouteEditorGroupBreaks(breaks, draftLength) {
    const normalized = (Array.isArray(breaks) ? breaks : [])
        .map(value => parseInt(value, 10))
        .filter(Number.isFinite)
        .map(value => clamp(value, 0, Math.max(0, draftLength + ROUTE_EDITOR_MAX_GROUPS - 1)))
        .sort((a, b) => a - b);
    const deduped = [];
    normalized.forEach(value => {
        if (!deduped.length || deduped[deduped.length - 1] !== value) deduped.push(value);
    });
    if (!deduped.length || deduped[0] !== 0) deduped.unshift(0);
    if (deduped.length > ROUTE_EDITOR_MAX_GROUPS) deduped.length = ROUTE_EDITOR_MAX_GROUPS;
    return deduped;
}

function buildRouteEditorGroupsFromBreaks(draft, breaks) {
    const normalizedDraft = Array.isArray(draft) ? draft : [];
    const normalizedBreaks = normalizeRouteEditorGroupBreaks(
        breaks,
        Math.max(1, normalizedDraft.length)
    );
    if (!normalizedBreaks.length) {
        return [{
            name: 'Gr.1',
            start: 0,
            end: -1,
            isEmpty: true
        }];
    }
    return normalizedBreaks.map((start, index) => {
        const end = index + 1 < normalizedBreaks.length ? normalizedBreaks[index + 1] - 1 : normalizedDraft.length - 1;
        return {
            name: `Gr.${index + 1}`,
            start,
            end: start >= normalizedDraft.length ? start - 1 : end,
            isEmpty: end < start || start >= normalizedDraft.length
        };
    });
}

function normalizeRouteEditorGroupPanelOffset(offset) {
    return {
        x: clamp(parseInt(offset?.x ?? 0, 10), -9999, 9999),
        y: clamp(parseInt(offset?.y ?? 0, 10), -9999, 9999)
    };
}

function getRouteEditorSavedGroupBreaks(stage) {
    const groups = state.settings.cruiseStageRouteGroups || {};
    const saved = groups[String(stage)];
    return Array.isArray(saved) ? saved : [];
}

function setRouteEditorSavedGroupBreaks(stage, breaks) {
    if (!state.settings.cruiseStageRouteGroups || typeof state.settings.cruiseStageRouteGroups !== 'object') {
        state.settings.cruiseStageRouteGroups = {};
    }
    state.settings.cruiseStageRouteGroups[String(stage)] = Array.isArray(breaks) ? breaks.slice() : [];
}

function shiftRouteEditorGroupBreaks(breaks, draftLength, groupIndex, delta) {
    const normalized = normalizeRouteEditorGroupBreaks(breaks, draftLength);
    const next = normalized.slice();
    if (!next.length) return next;
    const boundaryIndex = groupIndex + 1;
    if (boundaryIndex <= 0 || boundaryIndex >= next.length) return next;
    const leftStart = next[boundaryIndex - 1];
    const rightStart = next[boundaryIndex];
    const maxIndex = Math.max(0, draftLength - 1);
    const newValue = clamp(rightStart + delta, leftStart + 1, boundaryIndex + 1 < next.length ? next[boundaryIndex + 1] - 1 : maxIndex);
    next[boundaryIndex] = newValue;
    return normalizeRouteEditorGroupBreaks(next, draftLength);
}

function insertRouteEditorGroupBreak(breaks, draftLength, groupIndex) {
    const normalized = normalizeRouteEditorGroupBreaks(breaks, draftLength);
    const groups = buildRouteEditorGroupsFromBreaks(Array(draftLength).fill(null), normalized);
    const targetGroup = groups[groupIndex];
    if (!targetGroup) return normalized;
    const span = targetGroup.end - targetGroup.start + 1;
    if (span < 2) return normalized;
    const split = targetGroup.start + Math.floor(span / 2);
    if (split <= targetGroup.start) return normalized;
    const next = normalized.slice();
    next.splice(groupIndex + 1, 0, split);
    return normalizeRouteEditorGroupBreaks(next, draftLength);
}

function adjustRouteEditorGroupBreaksForInsert(breaks, insertedIndex, draftLength) {
    const next = (Array.isArray(breaks) ? breaks : []).map(start => {
        const n = parseInt(start, 10);
        if (!Number.isFinite(n)) return null;
        return n > insertedIndex ? n + 1 : n;
    }).filter(value => value !== null);
    return normalizeRouteEditorGroupBreaks(next, draftLength);
}

function adjustRouteEditorGroupBreaksForDelete(breaks, deletedIndex, draftLength) {
    const next = (Array.isArray(breaks) ? breaks : []).map(start => {
        const n = parseInt(start, 10);
        if (!Number.isFinite(n)) return null;
        return n > deletedIndex ? n - 1 : n;
    }).filter(value => value !== null);
    return normalizeRouteEditorGroupBreaks(next, draftLength);
}

function getRouteEditorGroups(draft, breaks) {
    return buildRouteEditorGroupsFromBreaks(draft, breaks);
}

function getRouteEditorVisibleGroupIndices(groupCount) {
    if (!groupCount) return [];
    const raw = Array.isArray(state.routeEditor?.visibleGroupIndices)
        ? state.routeEditor.visibleGroupIndices
        : [];
    const indices = raw
        .map(value => parseInt(value, 10))
        .filter(Number.isFinite)
        .filter(value => value >= 0 && value < groupCount);
    const unique = [];
    indices.sort((a, b) => a - b).forEach(index => {
        if (!unique.includes(index)) unique.push(index);
    });
    return unique.length ? unique : [0];
}

function getRouteEditorVisibleGroups(groups) {
    const visibleIndices = getRouteEditorVisibleGroupIndices(groups.length);
    return visibleIndices
        .map(index => ({
            ...groups[index],
            index
        }))
        .filter(group => !!group);
}

function getRouteEditorOperationGroupIndex(visibleGroups, selectedGroupIndex) {
    const parsedSelected = clamp(parseInt(selectedGroupIndex ?? 0, 10), 0, Number.MAX_SAFE_INTEGER);
    const visibleIndices = Array.isArray(visibleGroups)
        ? visibleGroups.map(group => parseInt(group?.index, 10)).filter(Number.isFinite)
        : [];
    if (visibleIndices.length <= 1) {
        return visibleIndices.length === 1 ? visibleIndices[0] : parsedSelected;
    }
    return Math.max(...visibleIndices);
}

function getRouteEditorGroupIndexForRouteIndex(draft, breaks, routeIndex) {
    const normalizedDraft = Array.isArray(draft) ? draft : [];
    const normalizedBreaks = normalizeRouteEditorGroupBreaks(breaks, normalizedDraft.length);
    if (!Number.isFinite(routeIndex) || routeIndex < 0 || routeIndex >= normalizedDraft.length) return 0;
    let groupIndex = 0;
    for (let i = 0; i < normalizedBreaks.length; i++) {
        if (normalizedBreaks[i] <= routeIndex) groupIndex = i;
        else break;
    }
    return groupIndex;
}

function findRouteEditorRouteIndexInGroup(draft, breaks, groupIndex, stringName, fret) {
    const normalizedDraft = Array.isArray(draft) ? draft : [];
    const groups = getRouteEditorGroups(normalizedDraft, breaks);
    const group = groups[groupIndex];
    if (!group || group.end < group.start) return -1;
    for (let i = group.end; i >= group.start; i--) {
        const slot = normalizeCruiseRouteSlot(normalizedDraft[i]);
        if (!slot) continue;
        if (slot.stringName === stringName && slot.fret === fret) return i;
    }
    return -1;
}

function insertRouteEditorSlotIntoGroup(draft, breaks, groupIndex, slot) {
    const normalizedDraft = Array.isArray(draft) ? draft.slice() : [];
    const oldLength = normalizedDraft.length;
    const normalizedBreaks = normalizeRouteEditorGroupBreaks(breaks, oldLength);
    const groups = getRouteEditorGroups(normalizedDraft, normalizedBreaks);
    const targetGroupIndex = clamp(parseInt(groupIndex ?? 0, 10), 0, Math.max(0, groups.length - 1));
    const targetGroup = groups[targetGroupIndex];
    const insertIndex = targetGroup
        ? clamp(
            targetGroup.end >= targetGroup.start ? targetGroup.end + 1 : targetGroup.start,
            0,
            oldLength
        )
        : oldLength;
    const nextBreaks = normalizedBreaks.slice();
    if (!nextBreaks.length) nextBreaks.push(0);
    while (nextBreaks.length <= targetGroupIndex && nextBreaks.length < ROUTE_EDITOR_MAX_GROUPS) {
        nextBreaks.push(Math.max(oldLength, nextBreaks[nextBreaks.length - 1] + 1));
    }
    if (targetGroupIndex > 0 && targetGroup?.isEmpty) {
        nextBreaks[targetGroupIndex] = insertIndex;
    }
    for (let i = targetGroupIndex + 1; i < nextBreaks.length; i++) {
        if (nextBreaks[i] >= insertIndex && nextBreaks[i] <= oldLength) {
            nextBreaks[i] += 1;
        }
    }
    normalizedDraft.splice(insertIndex, 0, slot);
    return {
        draft: normalizedDraft,
        groupBreaks: normalizeRouteEditorGroupBreaks(nextBreaks, normalizedDraft.length)
    };
}

function getRouteEditorGroupColorStyle(groupIndex) {
    const palette = [
        { bg: '#4f9cf9', fg: '#06111f', ring: 'rgba(79, 156, 249, 0.28)' },
        { bg: '#7ee081', fg: '#08130b', ring: 'rgba(126, 224, 129, 0.26)' },
        { bg: '#f7b955', fg: '#1c1204', ring: 'rgba(247, 185, 85, 0.28)' },
        { bg: '#e38df0', fg: '#16091a', ring: 'rgba(227, 141, 240, 0.26)' },
        { bg: '#7cd6ff', fg: '#07131a', ring: 'rgba(124, 214, 255, 0.26)' },
        { bg: '#ff8d8d', fg: '#1e0909', ring: 'rgba(255, 141, 141, 0.26)' },
        { bg: '#c8e06d', fg: '#101507', ring: 'rgba(200, 224, 109, 0.26)' },
        { bg: '#89a8ff', fg: '#09111d', ring: 'rgba(137, 168, 255, 0.26)' },
        { bg: '#6fe0c0', fg: '#071513', ring: 'rgba(111, 224, 192, 0.26)' },
        { bg: '#ffb36b', fg: '#1d1205', ring: 'rgba(255, 179, 107, 0.28)' },
        { bg: '#ff6fa8', fg: '#1d0914', ring: 'rgba(255, 111, 168, 0.26)' },
        { bg: '#b89cff', fg: '#0f0a1d', ring: 'rgba(184, 156, 255, 0.26)' },
        { bg: '#61d4ff', fg: '#07131a', ring: 'rgba(97, 212, 255, 0.26)' },
        { bg: '#ffd66a', fg: '#1b1305', ring: 'rgba(255, 214, 106, 0.28)' },
        { bg: '#97ed7d', fg: '#09150a', ring: 'rgba(151, 237, 125, 0.26)' },
        { bg: '#ff9aa0', fg: '#1e090b', ring: 'rgba(255, 154, 160, 0.26)' },
        { bg: '#8be3d6', fg: '#071615', ring: 'rgba(139, 227, 214, 0.26)' },
        { bg: '#d79cff', fg: '#14091d', ring: 'rgba(215, 156, 255, 0.26)' },
        { bg: '#ffc57c', fg: '#1d1105', ring: 'rgba(255, 197, 124, 0.28)' },
        { bg: '#8fb0ff', fg: '#08111d', ring: 'rgba(143, 176, 255, 0.26)' }
    ];
    const index = ((parseInt(groupIndex, 10) % palette.length) + palette.length) % palette.length;
    const color = palette[index];
    return `--route-edit-note-bg: ${color.bg}; --route-edit-note-fg: ${color.fg}; --route-edit-note-ring: ${color.ring};`;
}

function getRouteEditorSelectedGroupIndex(groupCount) {
    if (!groupCount) return 0;
    return clamp(parseInt(state.routeEditor?.selectedGroupIndex ?? 0, 10), 0, groupCount - 1);
}

function getRouteEditorSelectedGroupRange(draft, breaks, groupIndex) {
    const groups = getRouteEditorGroups(draft, breaks);
    return groups[groupIndex] || null;
}

function getRouteEditorGroupSlots(draft, groupRange) {
    if (!groupRange || !Array.isArray(draft)) return [];
    if (groupRange.end < groupRange.start) return [];
    return draft.slice(groupRange.start, groupRange.end + 1);
}

function shiftRouteEditorGroupRange(groups, groupIndex, delta, draftLength) {
    const ranges = Array.isArray(groups) ? groups.map(group => ({ ...group })) : [];
    if (!ranges.length) return ranges;
    const current = ranges[groupIndex];
    if (!current) return ranges;
    if (delta === 0) return ranges;
    if (delta < 0) {
        if (groupIndex === 0) return ranges;
        const prev = ranges[groupIndex - 1];
        if (!prev || prev.end <= prev.start) return ranges;
        prev.end -= 1;
        current.start -= 1;
    } else {
        if (groupIndex >= ranges.length - 1) return ranges;
        const next = ranges[groupIndex + 1];
        if (!next || next.end <= next.start) return ranges;
        current.end += 1;
        next.start += 1;
    }
    return ranges.filter((group, index) => index === 0 || group.start <= group.end).map(group => ({
        ...group,
        start: clamp(group.start, 0, Math.max(0, draftLength - 1)),
        end: clamp(group.end, 0, Math.max(0, draftLength - 1))
    }));
}

function makeCruiseScopeFromSequence(sequence) {
    const seen = new Set();
    const scope = [];
    sequence.forEach(target => {
        const key = `${target.stringName}-${target.fret}`;
        if (seen.has(key)) return;
        seen.add(key);
        scope.push(target);
    });
    return scope;
}

function getCruiseUniqueTargetsForStage(stage) {
    const targets = getStageTargets(stage).map(t => ({
        ...t,
        midiNote: STRING_BASE_PITCHES[t.stringIdx] + t.fret
    }));
    if (stage === 6) {
        return targets.sort((a, b) => a.midiNote - b.midiNote);
    }
    const grouped = {};
    targets.forEach(t => {
        if (!grouped[t.midiNote] || t.stringIdx < grouped[t.midiNote].stringIdx) {
            grouped[t.midiNote] = t;
        }
    });
    return Object.values(grouped).sort((a, b) => a.midiNote - b.midiNote);
}

function buildCruiseWalkSequence(uniqueTargets) {
    let startIdx = uniqueTargets.findIndex(t => t.stringName === 5 && t.fret === 3);
    if (startIdx === -1) startIdx = uniqueTargets.findIndex(t => t.stringName === 6 && t.fret === 8);
    if (startIdx === -1) startIdx = uniqueTargets.findIndex(t => t.noteIdx === 0);
    if (startIdx === -1) startIdx = 0;

    const sequence = [];
    for (let i = startIdx; i >= 0; i--) sequence.push(uniqueTargets[i]);
    for (let i = 1; i < uniqueTargets.length; i++) sequence.push(uniqueTargets[i]);
    for (let i = uniqueTargets.length - 2; i >= startIdx; i--) sequence.push(uniqueTargets[i]);
    return sequence;
}

function buildDefaultCruiseStageSequence(stage) {
    const sequence = [];
    const cruiseScope = [];

    if (stage === 5) {
        for (let s = 1; s <= 4; s++) {
            const uniqueTargets = getCruiseUniqueTargetsForStage(s);
            cruiseScope.push(...uniqueTargets);

            const subSeq = buildCruiseWalkSequence(uniqueTargets);
            if (s < 4) subSeq.pop();
            sequence.push(...subSeq);
        }
    } else {
        const uniqueTargets = getCruiseUniqueTargetsForStage(stage);
        cruiseScope.push(...uniqueTargets);
        sequence.push(...buildCruiseWalkSequence(uniqueTargets));
    }

    return { sequence, cruiseScope };
}

function buildCruiseStageSequence(stage) {
    const savedSlots = getSavedCruiseRouteSlots(stage);
    if (savedSlots.length > 0) {
        return buildCruiseSequenceFromSlots(savedSlots, true);
    }
    return {
        ...buildDefaultCruiseStageSequence(stage),
        isCustom: false
    };
}

function buildCruiseSequenceFromSlots(slots, isCustom = false) {
    const sequence = cloneCruiseRouteSlots(slots).map(slot => makeCruiseTarget(slot.stringName, slot.fret));
    return {
        sequence,
        cruiseScope: makeCruiseScopeFromSequence(sequence),
        isCustom
    };
}

function startCruisePlaybackFromSequence(sequence, cruiseScope = null, stage = null) {
    if (!Array.isArray(sequence) || !sequence.length) return false;
    stopRhythm();
    stopQuizTimer();
    clearStage1RepeatHintState();
    if (Number.isFinite(parseInt(stage, 10))) {
        state.memorize.stage = clamp(parseInt(stage, 10), 1, 6);
    }
    state.memorize.playMode = 'cruise';
    state.memorize.cruiseTargets = sequence.map(target => ({ ...target }));
    state.memorize.cruiseScope = Array.isArray(cruiseScope) && cruiseScope.length
        ? cruiseScope.map(target => ({ ...target }))
        : makeCruiseScopeFromSequence(state.memorize.cruiseTargets);
    state.memorize.cruiseIndex = 0;
    state.memorize.cruiseCurrentLoop = 0;
    state.memorize.currentQuestion = state.memorize.cruiseTargets[0];
    state.memorize.isCleared = false;
    state.memorize.hasTappedCurrentNote = false;
    state.memorize.isFirstNote = true;
    state.memorize.tempFeedback = null;
    state.memorize.isDemoPlayback = true;
    state.memorize.demoReturnCourse = 'routeEditor';
    state.memorize.demoReturnStage = Number.isFinite(parseInt(stage, 10)) ? clamp(parseInt(stage, 10), 1, 6) : state.routeEditor?.stage || 1;
    state.memorize.isCruisePlaying = true;
    state.course = 'memorize';
    autoScrollRequested = true;
    startRhythm();
    saveState();
    renderApp();
    return true;
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
    if (!app) return;
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
        state.visualize.showExtendedFrets
    ) {
        currentScrollLeft = oldWrapper.scrollLeft;
    } else if (
        oldScrollGroup === 'rule' &&
        state.course === 'basicRuleStep' &&
        state.settings.fretboardView === 'zoom' &&
        state.rules.phase === 'play'
    ) {
        currentScrollLeft = oldWrapper.scrollLeft;
    } else {
        currentScrollLeft = 0;
    }

    const isLandscapeRuleStep =
        state.course === 'basicRuleStep' &&
        window.innerWidth > window.innerHeight;
    const isGameLikeCourse =
        state.course === 'memorize' ||
        state.course === 'routeEditor' ||
        state.course === 'visualize' ||
        isLandscapeRuleStep;

    // 指板ゲーム画面・順番編集・横画面の基本ルールは max-width を外してビューポート幅いっぱいにする
    if (isGameLikeCourse) {
        app.style.maxWidth = 'none';
        app.style.width = '100vw';
        app.style.boxSizing = 'border-box';
    }

    if (!isGameLikeCourse) {
        app.style.maxHeight = '100dvh';
        app.style.overflowY = 'auto';
        app.style.overflowX = 'hidden';
        app.style.boxSizing = 'border-box';
        app.style.paddingBottom = 'calc(var(--in-game-refresh-stack-height, 96px) + max(12px, env(safe-area-inset-bottom)))';
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
    } else if (state.course === 'ruleSelect') {
        renderRuleSelect(app);
    } else if (state.course === 'basicRules') {
        renderBasicRules(app);
    } else if (state.course === 'basicRuleStep') {
        renderBasicRuleStep(app);
    } else if (state.course === 'stageSelect') {
        renderStageSelect(app);
    } else if (state.course === 'memorize') {
        renderMemorize(app);
    } else if (state.course === 'routeEditor') {
        renderRouteEditor(app);
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
                const zoomAnchorFretAttr = newWrapper.getAttribute('data-zoom-scroll-anchor-fret');
                const zoomAnchorFret = zoomAnchorFretAttr !== null ? parseFloat(zoomAnchorFretAttr) : null;

                if (q && state.settings.fretboardView === 'zoom') {
                    if (Number.isFinite(zoomAnchorFret)) {
                        // Use anchor fret as scroll reference
                        const anchorFloor = Math.floor(zoomAnchorFret);
                        const anchorCeil = Math.ceil(zoomAnchorFret);
                        const fretColFloor = newWrapper.querySelector(`.fret-column[data-fret="${anchorFloor}"]`);
                        const fretColCeil = newWrapper.querySelector(`.fret-column[data-fret="${anchorCeil}"]`);

                        let scrollPos = 0;
                        if (fretColFloor && fretColCeil) {
                            const frac = zoomAnchorFret - anchorFloor;
                            const floorLeft = fretColFloor.offsetLeft;
                            const ceilLeft = fretColCeil.offsetLeft;
                            const interpolatedLeft = floorLeft + (ceilLeft - floorLeft) * frac;
                            const wrapperCenter = newWrapper.clientWidth / 2;
                            scrollPos = Math.max(0, interpolatedLeft - wrapperCenter);
                        } else if (fretColFloor) {
                            const wrapperCenter = newWrapper.clientWidth / 2;
                            scrollPos = Math.max(0, fretColFloor.offsetLeft - wrapperCenter);
                        }

                        setTimeout(() => {
                            newWrapper.scrollTo({ left: scrollPos, behavior: 'smooth' });
                        }, 10);
                    } else {
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
        } else if (state.course === 'visualize' && state.visualize.showExtendedFrets) {
            newWrapper.scrollLeft = currentScrollLeft;
        } else if (
            state.course === 'basicRuleStep' &&
            newScrollGroup === 'rule' &&
            state.settings.fretboardView === 'zoom' &&
            state.rules.phase === 'play'
        ) {
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
        ${buildPageHeader({
            titleTag: 'h1',
            titleClass: 'home-title',
            titleText: '指板クルーズ',
            rightHtml: `<button class="icon-btn home-settings-btn" id="btn-settings-home" aria-label="設定">⚙️</button>`
        })}
        <div class="home-basic-rules-slot" style="display: flex; justify-content: center; width: 100%; margin-top: 6px; margin-bottom: 28px;">
            <button type="button" class="btn-secondary" id="btn-home-basic-rules" style="padding: 10px 18px; font-size: 0.92rem; line-height: 1.35;">🔰 基本ルール</button>
        </div>
        <div class="action-btns" style="flex-direction: column; gap: 20px; align-items: center; width: 100%;">
            <button type="button" class="btn-primary home-memorize-btn" id="btn-cruise-mode">🛳️ 指板をたどる</button>
            <button type="button" class="btn-primary home-memorize-btn" id="btn-quiz-mode">🎯 指板クイズ</button>
            <button type="button" class="btn-primary home-memorize-btn" id="btn-home-board-view">🧭 指板を探索する</button>
        </div>
    `;

    document.getElementById('btn-cruise-mode').onclick = () => {
        state.memorize.playMode = 'cruise';
        state.course = 'stageSelect';
        saveState();
        renderApp();
    };

    document.getElementById('btn-quiz-mode').onclick = () => {
        state.memorize.playMode = 'quiz';
        state.course = 'stageSelect';
        saveState();
        renderApp();
    };

    document.getElementById('btn-home-basic-rules').onclick = () => {
        state.course = 'basicRules';
        saveState();
        renderApp();
    };

    document.getElementById('btn-home-board-view').onclick = () => {
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
        ${buildPageHeader({
            headerClass: 'page-header--mode-select',
            titleText: 'モード選択',
            leftHtml: `
                ${navButtonHtml({ id: 'btn-back', text: '← 戻る', extraClass: 'page-nav-btn--back' })}
            `,
            rightHtml: `<button class="icon-btn home-settings-btn" id="btn-settings" aria-label="設定">⚙️</button>`
        })}
        <div class="stage-list">
            <button class="stage-btn" data-mode="cruise">
                🛳️ 指板をたどる
                <span class="stage-desc">光る場所をなぞって指板を覚えよう！</span>
            </button>
            <button class="stage-btn" data-mode="quiz">
                🎯 指板クイズ
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

function renderRuleSelect(app) {
    app.innerHTML = `
        ${buildPageHeader({
            headerClass: 'page-header--stage-select',
            titleText: 'ルールを知る',
            leftHtml: `
                ${navButtonHtml({ id: 'btn-back', text: '← 戻る', extraClass: 'page-nav-btn--back' })}
            `,
            rightHtml: `<button class="icon-btn home-settings-btn" id="btn-settings-rules" aria-label="設定">⚙️</button>`
        })}
        <div class="stage-list">
            <button class="stage-btn" data-rules="basic">
                🟨 基本ルール
                <span class="stage-desc">このアプリの遊び方を先に確認する</span>
            </button>
            <button class="stage-btn" data-rules="visualize">
                指板を探索する
                <span class="stage-desc">キー・スケール・コードを見ながら指板を確認する</span>
            </button>
        </div>
    `;

    document.getElementById('btn-back').onclick = () => {
        state.course = null;
        saveState();
        renderApp();
    };

    document.getElementById('btn-settings-rules').onclick = () => {
        openSettings('ruleSelect');
    };

    document.querySelectorAll('.stage-btn[data-rules="visualize"]').forEach(btn => {
        btn.onclick = () => {
            state.course = 'visualize';
            saveState();
            renderApp();
        };
    });

    document.querySelectorAll('.stage-btn[data-rules="basic"]').forEach(btn => {
        btn.onclick = () => {
            state.course = 'basicRules';
            saveState();
            renderApp();
        };
    });
}

/** 基本ルール STEP の表題（一覧・各STEP画面ヘッダーで共通） */
const BASIC_RULE_STEP_HEADLINES = [
    '半音の位置を知る',
    'オクターブ違い',
    '隣の弦との間隔',
    'ドレミの形',
    '形を広げる'
];

function getBasicRuleStepHeadline(step) {
    const i = clamp(step, 1, 5) - 1;
    return BASIC_RULE_STEP_HEADLINES[i] || '';
}

function renderBasicRules(app) {
    const completedSteps = state.rules?.completedSteps && typeof state.rules.completedSteps === 'object'
        ? state.rules.completedSteps
        : {};
    app.innerHTML = `
        ${buildPageHeader({
            headerClass: 'page-header--stage-select',
            titleText: '🔰 基本ルール',
            leftHtml: `
                ${navButtonHtml({ id: 'btn-back', text: '← 戻る', extraClass: 'page-nav-btn--back' })}
            `,
            rightHtml: `<button class="icon-btn home-settings-btn" id="btn-settings-basic-rules" aria-label="設定">⚙️</button>`
        })}
        <div class="stage-list">
            ${BASIC_RULE_STEP_HEADLINES.map((headline, idx) => {
                const num = idx + 1;
                const isDone = !!completedSteps[String(num)];
                return `
                <button class="stage-btn basic-rule-step-btn ${isDone ? 'is-complete' : ''}" data-rule-step="${num}" aria-label="STEP ${num} ${headline}${isDone ? ' クリア済み' : ''}">
                    <span class="basic-rule-step-main">STEP ${num} ${headline}</span>
                    ${isDone ? '<span class="basic-rule-step-badge" aria-hidden="true">✓ クリア</span>' : ''}
                </button>`;
            }).join('')}
        </div>
    `;

    document.getElementById('btn-back').onclick = () => {
        state.course = null;
        saveState();
        renderApp();
    };

    document.getElementById('btn-settings-basic-rules').onclick = () => {
        openSettings('basicRules');
    };

    document.querySelectorAll('.stage-btn[data-rule-step]').forEach(btn => {
        btn.onclick = () => {
            state.rules.step = parseInt(btn.getAttribute('data-rule-step'), 10);
            state.rules.page = 0;
            state.rules.tapIndex = 0;
            state.rules.phase = 'intro';
            state.rules.ruleIntroStage = 0;
            state.rules.celebration = null;
            state.course = 'basicRuleStep';
            saveState();
            renderApp();
        };
    });
}

function getNotationLabel(noteIdx) {
    return state.settings.noteLabelMode === 'note' ? NOTES[noteIdx] : FIXED_SOLFEGE[noteIdx].replace('♯', '#');
}

function getRuleLabel(noteIdx) {
    return getNotationLabel(noteIdx);
}

/** STEP2〜4：C長調の音名＝設定の度数色（.degree-1〜7）と揃える */
function getRuleStep2CMajorDegreeClass(noteIdx) {
    if (typeof noteIdx !== 'number') return 'role-other';
    const degByPc = { 0: 1, 2: 2, 4: 3, 5: 4, 7: 5, 9: 6, 11: 7 };
    const d = degByPc[((noteIdx % 12) + 12) % 12];
    return d ? `degree-${d}` : 'role-other';
}

function getCMajorNoteLabel(noteIdx) {
    const solfege = { 0: 'ド', 2: 'レ', 4: 'ミ', 5: 'ファ', 7: 'ソ', 9: 'ラ', 11: 'シ' };
    return state.settings.noteLabelMode === 'note' ? NOTES[noteIdx] : solfege[noteIdx];
}

function getCMajorMarkersForString(stringNum, options = {}) {
    const showIndex = options.showIndex !== false;
    const stringIdx = 6 - stringNum;
    const frets = [];
    for (let f = 0; f <= MAX_FRET; f++) {
        const noteIdx = (OPEN_STRINGS[stringIdx] + f) % 12;
        if ([0, 2, 4, 5, 7, 9, 11].includes(noteIdx)) {
            frets.push({ fret: f, noteIdx });
        }
    }
    const firstC = frets.findIndex(item => item.noteIdx === 0);
    const ordered = firstC >= 0
        ? [...frets.slice(firstC), ...frets.slice(0, firstC)]
        : frets;
    return ordered.map((item, index) => ({
        stringNum,
        fret: item.fret,
        noteIdx: item.noteIdx,
        label: showIndex ? `${index + 1}${getCMajorNoteLabel(item.noteIdx)}` : getCMajorNoteLabel(item.noteIdx),
        className: item.noteIdx === 0 ? 'rule-root' : ([4, 11].includes(item.noteIdx) ? 'rule-half' : 'rule-scale')
    }));
}

function withRuleNoteIdx(marker) {
    const noteIdx = typeof marker.noteIdx === 'number'
        ? marker.noteIdx
        : (OPEN_STRINGS[6 - marker.stringNum] + marker.fret) % 12;
    return { ...marker, noteIdx };
}

/** STEP5 ドレミファソラシドの音級（ピッチクラス） */
const STEP5_FREE_SHAPE_PITCH_SEQUENCE = [0, 2, 4, 5, 7, 9, 11, 0];

/**
 * STEP5：開放〜maxFret にあるその音のマスを列挙するが、同一弦で「ちょうど12フレット離れた同じ音名」は片方だけ残す（オクターブ重ねない）。
 * ペアがあるときは低いフレットを残す（例：6弦ミは開放のみ／12フレットは付けない。4弦レは開放のみ）。
 */
function rulePositionsForPitchUpToMaxFret(noteIdx, maxFret) {
    const pc = ((noteIdx % 12) + 12) % 12;
    const hi = clamp(Math.floor(maxFret), 0, MAX_FRET);
    const out = [];
    for (let sn = 6; sn >= 1; sn--) {
        const si = 6 - sn;
        const hits = [];
        for (let f = 0; f <= hi; f++) {
            if ((OPEN_STRINGS[si] + f) % 12 === pc) hits.push(f);
        }
        const pending = new Set(hits);
        while (pending.size > 0) {
            const f = Math.min(...pending);
            pending.delete(f);
            if (pending.has(f + 12)) {
                pending.delete(f + 12);
                out.push({ stringNum: sn, fret: f });
            } else {
                out.push({ stringNum: sn, fret: f });
            }
        }
    }
    return out;
}

/** STEP5：ステップごとに候補を足す／削る（ベースは rulePositionsForPitchUpToMaxFret）。最終ドではスタートマスだけ除外 */
function ruleStep5AdjustPositionsForStep(stepIndex, pitchClass, positions, anchorStringNum, anchorFret) {
    const pc = ((pitchClass % 12) + 12) % 12;
    const hasSlot = (list, sn, fr) => list.some(p => p.stringNum === sn && p.fret === fr);
    const list = positions.map(p => ({ stringNum: p.stringNum, fret: p.fret }));
    if (stepIndex === 2 && pc === 4 && !hasSlot(list, 6, 12)) {
        list.push({ stringNum: 6, fret: 12 });
    }
    if (stepIndex === 5 && pc === 9 && !hasSlot(list, 5, 12)) {
        list.push({ stringNum: 5, fret: 12 });
    }
    if (stepIndex === 7 && pc === 0) {
        return list.filter(p => !(p.stringNum === anchorStringNum && p.fret === anchorFret));
    }
    return list;
}

/** STEP5：スタート地点ごとのドレミ〜ド（開放〜12F・adjust 適用） */
function makeStep5FreeShapeStepPairs(startStringNum, startFret) {
    const STEP5_CANDIDATE_MAX_FRET = 12;
    return STEP5_FREE_SHAPE_PITCH_SEQUENCE.map((pc, i) => {
        if (i === 0) return [{ stringNum: startStringNum, fret: startFret }];
        const raw = rulePositionsForPitchUpToMaxFret(pc, STEP5_CANDIDATE_MAX_FRET);
        return ruleStep5AdjustPositionsForStep(i, pc, raw, startStringNum, startFret);
    });
}

/** STEP5-2 用：各ターンで「その音」が鳴る 1〜6弦の12フレットを必ず候補に（オクターブ違いを選べる） */
function ruleStep5Augment12FretAllStrings(stepPairs) {
    return stepPairs.map((spots, i) => {
        if (i === 0) return spots;
        const pc = ((STEP5_FREE_SHAPE_PITCH_SEQUENCE[i] % 12) + 12) % 12;
        const list = spots.map(p => ({ stringNum: p.stringNum, fret: p.fret }));
        const hasSlot = (sn, fr) => list.some(p => p.stringNum === sn && p.fret === fr);
        for (let sn = 1; sn <= 6; sn++) {
            const si = 6 - sn;
            const npc = ((OPEN_STRINGS[si] + 12) % 12 + 12) % 12;
            if (npc === pc && !hasSlot(sn, 12)) {
                list.push({ stringNum: sn, fret: 12 });
            }
        }
        return list;
    });
}

/** STEP5：ステップごとのタップ候補（弦・フレットのリスト） */
function buildRuleFreeShapeMarkersFromStepPairs(stepPairs) {
    const map = new Map();
    for (let i = 0; i < stepPairs.length; i++) {
        const spots = stepPairs[i];
        for (let j = 0; j < spots.length; j++) {
            const pos = spots[j];
            const si = 6 - pos.stringNum;
            const npc = ((OPEN_STRINGS[si] + pos.fret) % 12 + 12) % 12;
            const key = `${pos.stringNum}-${pos.fret}`;
            map.set(key, {
                stringNum: pos.stringNum,
                fret: pos.fret,
                noteIdx: npc,
                label: getCMajorNoteLabel(npc),
                className:
                    npc === 0 ? 'rule-root' : [4, 11].includes(npc) ? 'rule-half' : 'rule-scale'
            });
        }
    }
    return [...map.values()];
}

function buildRuleFreeShapeTargetSequence(slide) {
    const pairs = slide.ruleFreeShapeStepPairs;
    return pairs.map(spots => {
        const p0 = spots[0];
        const si = 6 - p0.stringNum;
        const pc = ((OPEN_STRINGS[si] + p0.fret) % 12 + 12) % 12;
        if (spots.length === 1) {
            return withRuleNoteIdx({
                stringNum: p0.stringNum,
                fret: p0.fret,
                noteIdx: pc,
                label: getCMajorNoteLabel(pc),
                cueLabel: getCMajorNoteLabel(pc),
                cue: `${p0.stringNum}弦${p0.fret}フレット`
            });
        }
        return {
            noteIdx: pc,
            ruleFlexibleMulti: true,
            acceptedPositions: spots,
            label: getCMajorNoteLabel(pc),
            cueLabel: getCMajorNoteLabel(pc)
        };
    });
}

function ruleStep5SlotKey(stringNum, fret) {
    return `${stringNum}-${fret}`;
}

/** STEP5：除外マップ（スライド別）。Part2 は STEP5-2 専用で STEP5-1 と独立 */
function ruleStep5ExcludedRawForPartition(part) {
    if (part === 2) {
        if (
            !state.rules.step5ExcludedSlotsPart2 ||
            typeof state.rules.step5ExcludedSlotsPart2 !== 'object' ||
            Array.isArray(state.rules.step5ExcludedSlotsPart2)
        ) {
            state.rules.step5ExcludedSlotsPart2 = {};
        }
        return state.rules.step5ExcludedSlotsPart2;
    }
    if (
        !state.rules.step5ExcludedSlots ||
        typeof state.rules.step5ExcludedSlots !== 'object' ||
        Array.isArray(state.rules.step5ExcludedSlots)
    ) {
        state.rules.step5ExcludedSlots = {};
    }
    return state.rules.step5ExcludedSlots;
}

function ruleStep5ExcludedPartitionFromSlide(slide) {
    return slide.ruleFreeShapeExcludedSlotPartition === 2 ? 2 : 1;
}

/** STEP5：チェックで練習から外す（現在の STEP5 スライドに応じたマップへ保存） */
function ruleStep5SetSlotExcluded(stringNum, fret, excluded) {
    const step = state.rules.step || 1;
    const page = state.rules.page || 0;
    const slides = step === 5 ? getRuleSlides(5) : [];
    const slide = slides[clamp(page, 0, Math.max(0, slides.length - 1))];
    const part =
        slide && slide.ruleFreeShapeStepPairs && slide.ruleFreeShapeStepPairs.length
            ? ruleStep5ExcludedPartitionFromSlide(slide)
            : 1;
    const map = ruleStep5ExcludedRawForPartition(part);
    const key = ruleStep5SlotKey(stringNum, fret);
    if (excluded) map[key] = true;
    else delete map[key];
    saveState();
    renderApp();
}

/** STEP5：チェックで除外したマスをタップ候補から外す（全部オフになるときは元に戻す） */
function ruleStep5ApplyExcludedSlots(targets, excludedRaw) {
    const excluded =
        excludedRaw && typeof excludedRaw === 'object' && !Array.isArray(excludedRaw) ? excludedRaw : {};
    return targets.map(t => {
        if (!t.ruleFlexibleMulti || !t.acceptedPositions || !t.acceptedPositions.length) {
            return t;
        }
        const filtered = t.acceptedPositions.filter(
            p => !excluded[ruleStep5SlotKey(p.stringNum, p.fret)]
        );
        if (filtered.length === 0) {
            return { ...t, acceptedPositions: [...t.acceptedPositions] };
        }
        if (filtered.length === t.acceptedPositions.length) return t;
        return { ...t, acceptedPositions: filtered };
    });
}

function getRuleTargetSequence(slide) {
    if (slide.soundSequence) return slide.soundSequence;
    if (slide.ruleFreeShapeStepPairs && slide.ruleFreeShapeStepPairs.length) {
        const seq = buildRuleFreeShapeTargetSequence(slide);
        const part = ruleStep5ExcludedPartitionFromSlide(slide);
        return ruleStep5ApplyExcludedSlots(seq, ruleStep5ExcludedRawForPartition(part));
    }
    return (slide.markers || []).map(withRuleNoteIdx);
}

function getRuleTargetLabel(target) {
    if (!target) return '';
    if (target.cueLabel) return target.cueLabel;
    if (target.label) return String(target.label).replace(/^\d+/, '');
    if (typeof target.noteIdx === 'number') return getRuleLabel(target.noteIdx);
    return '';
}

function showRuleMissFeedback(message = '光る丸をタップしてね') {
    const feedback = document.getElementById('rule-miss-feedback');
    const area = document.getElementById('rule-touch-area');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.add('is-visible');
    if (area) area.classList.add('is-miss');
    if (navigator.vibrate) navigator.vibrate(25);
    if (ruleMissFeedbackTimeout) clearTimeout(ruleMissFeedbackTimeout);
    ruleMissFeedbackTimeout = setTimeout(() => {
        feedback.classList.remove('is-visible');
        if (area) area.classList.remove('is-miss');
    }, 1100);
}

function getRuleSlides(step) {
    const dedupeMarkersByStringFret = list => {
        const map = new Map();
        for (let i = 0; i < list.length; i++) {
            const m = list[i];
            if (!m || typeof m.stringNum !== 'number') continue;
            map.set(`${m.stringNum}-${m.fret}`, m);
        }
        return [...map.values()];
    };
    const label = n => getRuleLabel(n);
    const cLabel = n => getCMajorNoteLabel(n);
    /** options の追加フィールド（例：STEP5-1 の ruleSamePitchGroup）を残す */
    const marker = (stringNum, fret, noteIdx, options = {}) => ({
        ...options,
        stringNum,
        fret,
        noteIdx,
        label: options.label || label(noteIdx),
        cueLabel: options.cueLabel,
        cue: options.cue,
        className: options.className || 'rule-scale'
    });
    const cMajorMarker = (stringNum, fret, noteIdx, index, options = {}) => marker(stringNum, fret, noteIdx, {
        label: options.showIndex === false ? cLabel(noteIdx) : `${index}${cLabel(noteIdx)}`,
        cueLabel: cLabel(noteIdx),
        className: noteIdx === 0 ? 'rule-root' : ([4, 11].includes(noteIdx) ? 'rule-half' : 'rule-scale'),
        ...options
    });
    /** STEP2-1／STEP2-2：各弦の開放（ミラソレシミ） */
    const step2OpenStringMarkers = [6, 5, 4, 3, 2, 1].map(sn => {
        const stringIdx = 6 - sn;
        const noteIdx = OPEN_STRINGS[stringIdx] % 12;
        return marker(sn, 0, noteIdx, {
            className: sn === 6 ? 'rule-root' : 'rule-scale',
            cue: 'タップ'
        });
    });
    /** STEP2-2：12フレット（開放と同じ音名・1オクターブ上）— 実践のタップ順はこれのみ */
    const step2TwelfthFretMarkers = [6, 5, 4, 3, 2, 1].map(sn => {
        const stringIdx = 6 - sn;
        const noteIdx = (OPEN_STRINGS[stringIdx] + 12) % 12;
        return marker(sn, 12, noteIdx, {
            className: sn === 6 ? 'rule-root' : 'rule-scale',
            cue: 'タップ'
        });
    });
    /** STEP2-3：6弦のみ、開放〜12FのC長調の音をネック上の順に */
    const step2SixStringCMajorTo12Markers = [0, 1, 3, 5, 7, 8, 10, 12].map(fret => {
        const stringNum = 6;
        const stringIdx = 6 - stringNum;
        const noteIdx = (OPEN_STRINGS[stringIdx] + fret) % 12;
        const className = noteIdx === 0 ? 'rule-root' : ([4, 11].includes(noteIdx) ? 'rule-half' : 'rule-scale');
        return marker(stringNum, fret, noteIdx, { className, cue: 'タップ' });
    });
    /** STEP2-4：1弦も6弦と同じ音程間隔（ミ〜ミの並び） */
    const step2OneStringCMajorTo12Markers = [0, 1, 3, 5, 7, 8, 10, 12].map(fret => {
        const stringNum = 1;
        const stringIdx = 6 - stringNum;
        const noteIdx = (OPEN_STRINGS[stringIdx] + fret) % 12;
        const className = noteIdx === 0 ? 'rule-root' : ([4, 11].includes(noteIdx) ? 'rule-half' : 'rule-scale');
        return marker(stringNum, fret, noteIdx, { className, cue: 'タップ' });
    });
    /** STEP4-1：ミ＝4弦2F、ラ＝3弦2F まわりのC長調形 */
    const step4Slide1Shape = [
        marker(5, 3, 0, { className: 'rule-root' }),
        marker(5, 5, 2, { className: 'rule-scale' }),
        marker(4, 2, 4, { className: 'rule-half' }),
        marker(4, 3, 5, { className: 'rule-scale' }),
        marker(4, 5, 7, { className: 'rule-scale' }),
        marker(3, 2, 9, { className: 'rule-scale' }),
        marker(3, 4, 11, { className: 'rule-half' }),
        marker(3, 5, 0, { className: 'rule-root' })
    ];
    const step4Slide1ShapeNoteOnly = step4Slide1Shape.map(m => ({
        ...m,
        label: getCMajorNoteLabel(m.noteIdx)
    }));
    /** STEP4-2：6弦8Fのドを起点に、STEP4-1と同じ形のドレミファソラシド（5,3→6,8 に平行移動） */
    const step4Slide2Shape = [
        marker(6, 8, 0, { className: 'rule-root' }),
        marker(6, 10, 2, { className: 'rule-scale' }),
        marker(5, 7, 4, { className: 'rule-half' }),
        marker(5, 8, 5, { className: 'rule-scale' }),
        marker(5, 10, 7, { className: 'rule-scale' }),
        marker(4, 7, 9, { className: 'rule-scale' }),
        marker(4, 9, 11, { className: 'rule-half' }),
        marker(4, 10, 0, { className: 'rule-root' })
    ];
    const step4Slide2ShapeNoteOnly = step4Slide2Shape.map(m => ({
        ...m,
        label: getCMajorNoteLabel(m.noteIdx)
    }));
    /** STEP4-3：4弦10Fのドからドレミファソラシド（タップ順どおりにたどる） */
    const step4Slide3Shape = [
        marker(4, 10, 0, { className: 'rule-root' }),
        marker(4, 12, 2, { className: 'rule-scale' }),
        marker(3, 9, 4, { className: 'rule-half' }),
        marker(3, 10, 5, { className: 'rule-scale' }),
        marker(3, 12, 7, { className: 'rule-scale' }),
        marker(2, 10, 9, { className: 'rule-scale' }),
        marker(2, 12, 11, { className: 'rule-half' }),
        marker(2, 13, 0, { className: 'rule-root' })
    ];
    const step4Slide3ShapeNoteOnly = step4Slide3Shape.map(m => ({
        ...m,
        label: getCMajorNoteLabel(m.noteIdx)
    }));

    /** STEP5-1：同じオクターブの同じ音を、ドレミ順に2オクターブ分たどる */
    const step5SamePitchBridgeGroups = [
        [[6, 8, 0], [5, 3, 0]],
        [[6, 10, 2], [5, 5, 2], [4, 0, 2]],
        [[6, 12, 4], [5, 7, 4], [4, 2, 4]],
        [[5, 8, 5], [4, 3, 5]],
        [[5, 10, 7], [4, 5, 7], [3, 0, 7]],
        [[5, 12, 9], [4, 7, 9], [3, 2, 9]],
        [[4, 9, 11], [3, 4, 11], [2, 0, 11]],
        [[4, 10, 0], [3, 5, 0], [2, 1, 0]],
        [[4, 12, 2], [3, 7, 2], [2, 3, 2]],
        [[3, 9, 4], [2, 5, 4], [1, 0, 4]],
        [[3, 10, 5], [2, 6, 5], [1, 1, 5]],
        [[3, 12, 7], [2, 8, 7], [1, 3, 7]],
        [[2, 10, 9], [1, 5, 9]],
        [[2, 12, 11], [1, 7, 11]],
        [[1, 8, 0]]
    ];
    const step5SamePitchBridgeMarkers = step5SamePitchBridgeGroups.flatMap((group, groupIndex) =>
        group.map(([stringNum, fret, noteIdx]) =>
            marker(stringNum, fret, noteIdx, {
                label: getCMajorNoteLabel(noteIdx),
                cue: 'タップ',
                className: noteIdx === 0 ? 'rule-root' : [4, 11].includes(noteIdx) ? 'rule-half' : 'rule-scale',
                ruleSamePitchGroup: groupIndex
            })
        )
    );

    /** STEP5-2：開放〜12F ＋ステップ調整。同一弦の開放／12重複は基本は低い方のみ */
    const step5FreeShapeStepPairs21 = ruleStep5Augment12FretAllStrings(
        makeStep5FreeShapeStepPairs(2, 1)
    );
    const step5FreeShapeMarkers21 = buildRuleFreeShapeMarkersFromStepPairs(step5FreeShapeStepPairs21);

    /** STEP1の2弦スケール共通：1〜13F のドレミファソラシド（♯を飛ばす） */
    const step1TwoStringScaleMarkers = [1, 3, 5, 6, 8, 10, 12, 13].map(fret => {
        const stringNum = 2;
        const stringIdx = 6 - stringNum;
        const noteIdx = (OPEN_STRINGS[stringIdx] + fret) % 12;
        const className = fret === 1 || fret === 13 ? 'rule-root' : 'rule-scale';
        return marker(stringNum, fret, noteIdx, { className, cue: 'タップ' });
    });

    const slides = {
        1: [
            {
                learnTheme: '「1フレットは半音ずつ」と知ろう！',
                summaryLearn: 'フレットには#などの音も入っていますね。',
                markers: [
                    marker(6, 0, 4, { className: 'rule-root', cue: 'タップ' }),
                    marker(6, 1, 5, { className: 'rule-half', cue: 'タップ' }),
                    marker(6, 2, 6, { cue: 'タップ' }),
                    marker(6, 3, 7, { cue: 'タップ' }),
                    marker(6, 4, 8, { cue: 'タップ' }),
                    marker(6, 5, 9, { cue: 'タップ' }),
                    marker(6, 6, 10, { cue: 'タップ' })
                ]
            },
            {
                learnTheme: 'では、ドレミファソラシドだけをたどってみましょう',
                summaryLearn: '気づきましたか？',
                markers: step1TwoStringScaleMarkers
            },
            {
                learnTheme: 'ミファとシドだけ半音です',
                learnThemeIntro2: 'もう1度たどってみましょう',
                summaryLearn: 'ミファとシドだけ半音と覚えておきましょう',
                markers: step1TwoStringScaleMarkers
            }
        ],
        2: [
            {
                learnTheme: '開放弦の音を覚えよう',
                summaryLearn: '開放弦はミラソレシミ',
                summaryLearnSubline: '英名でEAGDBE',
                suppressFloatingCue: true,
                markers: step2OpenStringMarkers
            },
            {
                learnTheme: '12フレット先はオクターブ上の音',
                summaryLearn: '12フレットも同じ「ミラレソシミ」です',
                suppressFloatingCue: true,
                /** 実践でも開放の音名を残しつつ、タップは12Fの順だけ（STEP2-4と同パターン） */
                markers: [...step2OpenStringMarkers, ...step2TwelfthFretMarkers],
                soundSequence: step2TwelfthFretMarkers.map(m => withRuleNoteIdx(m))
            },
            {
                learnTheme: '次は6弦の音をたどってみよう',
                summaryLearn: '6弦は開放弦から12フレットが\nミから1オクターブ上のミですね',
                suppressFloatingCue: true,
                markers: step2SixStringCMajorTo12Markers
            },
            {
                learnTheme: '1弦も6弦と同じ音の並びですので\nたどってみましょう',
                summaryLearn: '1弦は6弦の2オクターブ上の音となっています',
                suppressFloatingCue: true,
                /** 6弦の音名も常時表示し、タップの正解順は1弦だけ */
                markers: [...step2SixStringCMajorTo12Markers, ...step2OneStringCMajorTo12Markers],
                soundSequence: step2OneStringCMajorTo12Markers.map(m => withRuleNoteIdx(m))
            }
        ],
        3: [
            {
                learnTheme: '隣の弦と同じ音をたどろう！',
                summaryLearn: '気づきましたか？',
                summaryLearn2: '3弦→2弦だけ4フレット違い',
                summaryLearnSubline: '他は5フレット',
                suppressFloatingCue: true,
                step3PairTapSequence: true,
                /** STEP3-1：ガイド線・「◯フレット」吹き出しなし（STEP3-2/3 は従来どおり） */
                step3PairTapHideLineAndGapHint: true,
                markers: [
                    marker(6, 5, 9, { className: 'rule-root' }),
                    marker(5, 0, 9, { className: 'rule-root' }),
                    marker(4, 5, 7, { className: 'rule-root' }),
                    marker(3, 0, 7, { className: 'rule-root' }),
                    marker(3, 4, 11, { className: 'rule-half' }),
                    marker(2, 0, 11, { className: 'rule-half' }),
                    marker(2, 5, 4, { className: 'rule-root' }),
                    marker(1, 0, 4, { className: 'rule-root' })
                ]
            },
            {
                learnTheme: 'もう1度たどろう！',
                summaryLearn: 'これが指板の覚えられない原因No.1です',
                suppressFloatingCue: true,
                step3PairTapSequence: true,
                markers: [
                    marker(6, 5, 9, { className: 'rule-root' }),
                    marker(5, 0, 9, { className: 'rule-root' }),
                    marker(4, 5, 7, { className: 'rule-root' }),
                    marker(3, 0, 7, { className: 'rule-root' }),
                    marker(3, 4, 11, { className: 'rule-half' }),
                    marker(2, 0, 11, { className: 'rule-half' }),
                    marker(2, 5, 4, { className: 'rule-root' }),
                    marker(1, 0, 4, { className: 'rule-root' })
                ]
            },
            {
                learnTheme: '他のフレットも当然同じです',
                summaryLearn: '3→2弦だけ4フレット分と覚えておきましょう',
                suppressFloatingCue: true,
                step3PairTapSequence: true,
                /** 実践で全マーカー常時表示（タップ先は rule-next の光のみ） */
                step3PairTapShowAllMarkersInPlay: true,
                /** 画角：この範囲が収まるようスケール・横位置を固定 */
                ruleTapLayoutFretRange: [7, 12],
                markers: [
                    marker(6, 12, 4, { className: 'rule-root' }),
                    marker(5, 7, 4, { className: 'rule-root' }),
                    marker(5, 12, 9, { className: 'rule-root' }),
                    marker(4, 7, 9, { className: 'rule-root' }),
                    marker(4, 12, 2, { className: 'rule-root' }),
                    marker(3, 7, 2, { className: 'rule-root' }),
                    marker(3, 12, 7, { className: 'rule-root' }),
                    marker(2, 8, 7, { className: 'rule-root' }),
                    marker(2, 12, 11, { className: 'rule-half' }),
                    marker(1, 7, 11, { className: 'rule-half' })
                ]
            }
        ],
        4: [
            {
                learnTheme: '5弦3フレットから始まるドレミ',
                summaryLearn: 'ここが1番重要なポジションです',
                /** STEP4-2 と同一倍率（7〜10F 幅でフィット）。低フレット側はスクロールで見せる */
                ruleTapLayoutZoomFitFloatRange: [6.5, 10.5],
                ruleTapLayoutZoomExtra: 1.08,
                ruleTapLayoutLockScroll: true,
                markers: step4Slide1ShapeNoteOnly
            },
            {
                learnTheme: '6弦8フレットにも同じ形があります',
                summaryLearn: 'ここもすぐに弾けるようにしましょう',
                ruleTapLayoutZoomFitFloatRange: [6.5, 10.5],
                ruleTapLayoutZoomExtra: 1.08,
                markers: step4Slide2ShapeNoteOnly
            },
            {
                learnTheme: '4弦10フレットからのドレミは落とし穴があります',
                summaryLearn: 'やっぱり2弦にいく時は、半音ずれますね',
                /** STEP4-2 と同一倍率。高フレット側はスクロールで見せる */
                ruleTapLayoutZoomFitFloatRange: [6.5, 10.5],
                ruleTapLayoutZoomExtra: 1.08,
                ruleTapLayoutLockScroll: true,
                markers: step4Slide3ShapeNoteOnly
            }
        ],
        5: [
            {
                learnTheme: '同じ音をたどってみよう',
                suppressFloatingCue: true,
                skipSummaryPhase: true,
                markers: step5SamePitchBridgeMarkers,
                ruleSamePitchBridgeSequence: true,
                ruleSlowAutoScrollToNext: true,
                /** STEP4-1 と同程度の拡大。横スクロールで開放〜12Fを自分で見られる */
                ruleTapLayoutZoomFitFloatRange: [6.5, 10.5],
                ruleTapLayoutZoomExtra: 1.08,
                ruleTapLayoutLockScroll: false,
                text: '同じ音をたどってみよう'
            }
        ]
    };
    return slides[step] || slides[1];
}

function renderRuleDiagram(type, activeIndex = 0) {
    if (type !== 'intervals') return '';
    const notes = state.settings.noteLabelMode === 'note'
        ? ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']
        : ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ', 'ド'];
    const gaps = ['全音', '全音', '半音', '全音', '全音', '全音', '半音'];
    return `
        <div class="rule-interval-diagram">
            ${notes.map((note, idx) => `
                <button type="button" class="rule-interval-note ${idx === activeIndex ? 'is-next' : ''}" data-rule-diagram-note="${idx}">${note}</button>
                ${idx < gaps.length ? `<div class="rule-interval-gap ${gaps[idx] === '半音' ? 'is-half' : ''}">${gaps[idx]}</div>` : ''}
            `).join('')}
        </div>
    `;
}

function getMemorizeQuestionLabel(noteIdx) {
    return getNotationLabel(noteIdx);
}

function openRulesInVisualize() {
    state.visualize.key = 0;
    state.visualize.capo = 0;
    state.visualize.scale = 'major';
    state.visualize.displayMode = state.settings.noteLabelMode === 'note' ? 'note' : 'solfege';
    state.visualize.doMode = 'movable';
    state.visualize.selectedChordIndex = null;
    state.visualize.autoSelectRootChord = false;
    state.course = 'visualize';
    saveState();
    renderApp();
}

function goToRuleOffset(delta) {
    const step = state.rules.step || 1;
    const slides = getRuleSlides(step);
    const page = state.rules.page || 0;
    const nextPage = page + delta;
    if (nextPage >= 0 && nextPage < slides.length) {
        state.rules.page = nextPage;
        state.rules.tapIndex = 0;
        state.rules.phase = 'intro';
    } else if (delta > 0 && step < 5) {
        state.rules.step = step + 1;
        state.rules.page = 0;
        state.rules.tapIndex = 0;
        state.rules.phase = 'intro';
    } else if (delta > 0) {
        state.course = 'basicRules';
        state.rules.ruleIntroStage = 0;
        saveState();
        renderApp();
        return;
    } else if (delta < 0 && step > 1) {
        state.rules.step = step - 1;
        state.rules.page = getRuleSlides(state.rules.step).length - 1;
        state.rules.tapIndex = 0;
        state.rules.phase = 'intro';
    } else {
        state.course = 'basicRules';
    }
    state.rules.ruleIntroStage = 0;
    saveState();
    renderApp();
}

/** まとめ画面から：最終スライドならCLEAR祝い、それ以外は次スライドへ */
function ruleTryAdvanceFromSummary() {
    const step = state.rules.step || 1;
    const slides = getRuleSlides(step);
    const page = clamp(state.rules.page || 0, 0, slides.length - 1);
    const slide = slides[page];
    const summary2 = slide && (slide.summaryLearn2 || '').trim();
    if (summary2 && (state.rules.ruleIntroStage || 0) === 0) {
        state.rules.ruleIntroStage = 1;
        saveState();
        renderApp();
        return;
    }
    if (page >= slides.length - 1) {
        markRuleStepCompleted(step);
        state.rules.celebration = { completedStep: step };
        saveState();
        renderApp();
        return;
    }
    goToRuleOffset(1);
}

function dismissRuleCelebrationAndAdvance() {
    state.rules.celebration = null;
    goToRuleOffset(1);
}

/** 「1つ戻る」：直前の1アクションだけ戻す（スライド跨ぎ・STEP跨ぎあり） */
function ruleUndoOneAction() {
    if (state.rules.celebration) {
        state.rules.celebration = null;
        saveState();
        renderApp();
        return;
    }
    const step = state.rules.step || 1;
    const slides = getRuleSlides(step);
    const page = clamp(state.rules.page || 0, 0, slides.length - 1);
    const slide = slides[page];
    const targets = getRuleTargetSequence(slide);
    const n = targets.length;
    const introFollowUp = (slide.learnThemeIntro2 || '').trim();

    if (state.rules.phase === 'intro' && introFollowUp && (state.rules.ruleIntroStage || 0) === 1) {
        state.rules.ruleIntroStage = 0;
        saveState();
        renderApp();
        return;
    }
    if (state.rules.phase === 'summary') {
        const summary2 = (slide.summaryLearn2 || '').trim();
        if (summary2 && (state.rules.ruleIntroStage || 0) === 1) {
            state.rules.ruleIntroStage = 0;
            saveState();
            renderApp();
            return;
        }
        if (n > 0) {
            state.rules.phase = 'play';
            state.rules.tapIndex = n - 1;
            state.rules.ruleIntroStage = 0;
        } else {
            state.rules.phase = 'intro';
            state.rules.tapIndex = 0;
            state.rules.ruleIntroStage = 0;
        }
        saveState();
        renderApp();
        return;
    }
    if (state.rules.phase === 'play') {
        if ((state.rules.tapIndex || 0) > 0) {
            state.rules.tapIndex = (state.rules.tapIndex || 0) - 1;
        } else {
            state.rules.phase = 'intro';
            state.rules.ruleIntroStage = introFollowUp ? 1 : 0;
        }
        saveState();
        renderApp();
        return;
    }
    if (page > 0) {
        const prevIdx = page - 1;
        state.rules.page = prevIdx;
        const prevSlide = slides[prevIdx];
        const prevTargets = getRuleTargetSequence(prevSlide);
        if (prevSlide.skipSummaryPhase && prevTargets.length > 0) {
            state.rules.phase = 'play';
            state.rules.tapIndex = prevTargets.length - 1;
        } else {
            state.rules.phase = 'summary';
            state.rules.tapIndex = 0;
        }
        state.rules.ruleIntroStage = 0;
        saveState();
        renderApp();
        return;
    }
    if (step > 1) {
        const prevStep = step - 1;
        const prevSlides = getRuleSlides(prevStep);
        state.rules.step = prevStep;
        state.rules.page = prevSlides.length - 1;
        state.rules.phase = 'summary';
        state.rules.tapIndex = 0;
        state.rules.ruleIntroStage = 0;
        saveState();
        renderApp();
        return;
    }
    state.course = 'basicRules';
    saveState();
    renderApp();
}

/** 「1つ進む」：次の1アクションだけ進める（音は鳴らさない・スライド跨ぎ・STEP跨ぎあり） */
function ruleAdvanceOneAction() {
    const step = state.rules.step || 1;
    const slides = getRuleSlides(step);
    const page = clamp(state.rules.page || 0, 0, slides.length - 1);
    const slide = slides[page];
    const targets = getRuleTargetSequence(slide);
    const n = targets.length;

    if (state.rules.phase === 'intro') {
        const introFollowUp = (slide.learnThemeIntro2 || '').trim();
        if (introFollowUp && (state.rules.ruleIntroStage || 0) === 0) {
            state.rules.ruleIntroStage = 1;
            saveState();
            renderApp();
            return;
        }
        state.rules.phase = 'play';
        state.rules.tapIndex = 0;
        state.rules.ruleIntroStage = 0;
        saveState();
        renderApp();
        return;
    }
    if (state.rules.phase === 'play') {
        const idx = state.rules.tapIndex || 0;
        if (n === 0) {
            ruleFinishPlaySlide(slide);
        } else if (idx < n - 1) {
            state.rules.tapIndex = idx + 1;
            state.rules.phase = 'play';
        } else {
            ruleFinishPlaySlide(slide);
        }
        saveState();
        renderApp();
        return;
    }
    if (state.rules.phase === 'summary') {
        ruleTryAdvanceFromSummary();
    }
}

/** 進捗バー：同じSTEP内の指定スライドへ（イントロからやり直し） */
function ruleJumpToSlideWithinStep(targetPage) {
    const step = state.rules.step || 1;
    const slides = getRuleSlides(step);
    const max = Math.max(0, slides.length - 1);
    state.rules.page = clamp(targetPage, 0, max);
    state.rules.phase = 'intro';
    state.rules.tapIndex = 0;
    state.rules.ruleIntroStage = 0;
    state.rules.celebration = null;
    saveState();
    renderApp();
}

function playRuleTarget(target) {
    if (!target) return;
    if (typeof target.midiNote === 'number') {
        playMidiTone(target.midiNote);
        return;
    }
    if (typeof target.stringNum === 'number' && typeof target.fret === 'number') {
        playTone(6 - target.stringNum, target.fret);
    }
}

/** 実践フェーズ終了時：まとめへ／または skip のときは次スライドのイントロ or STEP クリア */
function ruleFinishPlaySlide(slide) {
    state.rules.tapIndex = 0;
    state.rules.ruleIntroStage = 0;
    const step = state.rules.step || 1;
    const slides = getRuleSlides(step);
    const page = clamp(state.rules.page || 0, 0, slides.length - 1);
    if (slide.skipSummaryPhase) {
        if (page < slides.length - 1) {
            state.rules.page = page + 1;
            state.rules.phase = 'intro';
        } else {
            markRuleStepCompleted(step);
            state.rules.celebration = { completedStep: step };
        }
    } else {
        state.rules.phase = 'summary';
    }
}

function advanceRuleAfterSound(slide) {
    const targets = getRuleTargetSequence(slide);
    const nextIndex = (state.rules.tapIndex || 0) + 1;
    if (nextIndex < targets.length) {
        state.rules.tapIndex = nextIndex;
        state.rules.phase = 'play';
        saveState();
        renderApp();
    } else {
        ruleFinishPlaySlide(slide);
        saveState();
        renderApp();
    }
}

function playCurrentRuleTarget(slide) {
    if (ruleAdvanceLocked) return;
    ruleAdvanceLocked = true;
    setTimeout(() => {
        ruleAdvanceLocked = false;
    }, 180);
    if (state.rules.phase === 'intro') {
        const slides0 = getRuleSlides(state.rules.step || 1);
        const page0 = clamp(state.rules.page || 0, 0, slides0.length - 1);
        const slide0 = slides0[page0];
        const introFollowUp = ((slide0 && slide0.learnThemeIntro2) || '').trim();
        if (introFollowUp && (state.rules.ruleIntroStage || 0) === 0) {
            state.rules.ruleIntroStage = 1;
            saveState();
            renderApp();
            return;
        }
        state.rules.phase = 'play';
        state.rules.tapIndex = 0;
        state.rules.ruleIntroStage = 0;
        saveState();
        renderApp();
        return;
    }
    if (state.rules.phase === 'summary') {
        ruleTryAdvanceFromSummary();
        return;
    }
    const targets = getRuleTargetSequence(slide);
    const target = targets[state.rules.tapIndex || 0];
    if (!target) {
        ruleFinishPlaySlide(slide);
        saveState();
        renderApp();
        return;
    }
    if (target.ruleFlexibleMulti) return;
    playRuleTarget(target);
    advanceRuleAfterSound(slide);
}

/** STEP完了時：案4（CLEAR＋進捗ドット＋STEP表記） */
function renderRuleClearCelebration(app) {
    const done = clamp(state.rules.celebration.completedStep || 1, 1, 5);
    if (done >= 5) {
        const pieces = Array.from({ length: 30 }, (_, i) => `
            <span class="rule-master-confetti-piece" style="--x:${(i * 37) % 100}; --d:${(i % 7) * 0.18}s; --r:${(i * 29) % 360}deg;"></span>
        `).join('');
        app.innerHTML = `
            ${buildPageHeader({
                headerClass: 'page-header--stage-select',
                titleText: '基本ルール クリア',
                titleSubText: 'STEP 5 おわり',
                leftHtml: `${navButtonHtml({ id: 'btn-back', text: '← 戻る', extraClass: 'page-nav-btn--back' })}`,
                rightHtml: `<button class="icon-btn home-settings-btn" id="btn-settings-rule-clear" aria-label="設定">⚙️</button>`
            })}
            <div class="rule-clear-celebration rule-master-clear">
                <div class="rule-master-confetti" aria-hidden="true">${pieces}</div>
                <div class="rule-clear-card rule-master-clear-card">
                    <p class="rule-master-clear-head" aria-live="polite">ルール制覇！！</p>
                    <p class="rule-master-clear-lead">指板を「覚える」には<br>こちらをやりましょう！</p>
                    <button type="button" class="btn-primary rule-clear-next-btn" id="btn-rule-clear-memorize">覚えるモードへ</button>
                </div>
                <div style="height:120px"></div>
            </div>
        `;
        document.getElementById('btn-back').onclick = () => {
            state.rules.celebration = null;
            state.course = 'basicRules';
            saveState();
            renderApp();
        };
        document.getElementById('btn-settings-rule-clear').onclick = () => openSettings('basicRuleStep');
        document.getElementById('btn-rule-clear-memorize').onclick = () => {
            state.rules.celebration = null;
            state.course = 'modeSelect';
            saveState();
            renderApp();
        };
        app.style.height = '100vh';
        app.style.overflowY = 'auto';
        app.style.overflowX = 'hidden';
        return;
    }
    const nextLabel = done >= 5 ? '基本ルール一覧へ' : '次のSTEPへ';
    const dots = [1, 2, 3, 4, 5].map(n => `
        <span class="rule-clear-dot ${n <= done ? 'is-done' : ''}" aria-hidden="true"></span>
    `).join('');
    app.innerHTML = `
        ${buildPageHeader({
            headerClass: 'page-header--stage-select',
            titleText: 'STEP クリア',
            titleSubText: `STEP ${done} おわり`,
            leftHtml: `${navButtonHtml({ id: 'btn-back', text: '← 戻る', extraClass: 'page-nav-btn--back' })}`,
            rightHtml: `<button class="icon-btn home-settings-btn" id="btn-settings-rule-clear" aria-label="設定">⚙️</button>`
        })}
        <div class="rule-clear-celebration">
            <div class="rule-clear-card">
                <p class="rule-clear-head" aria-live="polite">CLEAR！</p>
                <p class="rule-clear-steptext">STEP ${done} / 5 完了</p>
                <div class="rule-clear-dots" role="img" aria-label="STEP 1から5までの進み">${dots}</div>
                <button type="button" class="btn-primary rule-clear-next-btn" id="btn-rule-clear-next">${nextLabel}</button>
            </div>
            <div style="height:120px"></div>
        </div>
    `;
    document.getElementById('btn-back').onclick = () => {
        state.rules.celebration = null;
        state.course = 'basicRules';
        saveState();
        renderApp();
    };
    document.getElementById('btn-settings-rule-clear').onclick = () => openSettings('basicRuleStep');
    document.getElementById('btn-rule-clear-next').onclick = () => {
        dismissRuleCelebrationAndAdvance();
    };
    app.style.height = '100vh';
    app.style.overflowY = 'auto';
    app.style.overflowX = 'hidden';
}

function renderBasicRuleStep(app) {
    if (state.rules.celebration) {
        const cs = state.rules.celebration.completedStep;
        if (typeof cs !== 'number' || cs < 1 || cs > 5) {
            state.rules.celebration = null;
        } else {
            renderRuleClearCelebration(app);
            return;
        }
    }
    cleanupRuleStep31PairLine();
    cleanupRuleStep43GapHintSchedule();
    if (state.rules._step42RevealTimer) {
        clearTimeout(state.rules._step42RevealTimer);
        state.rules._step42RevealTimer = null;
    }
    if (state.rules._step42RevealTimer2) {
        clearTimeout(state.rules._step42RevealTimer2);
        state.rules._step42RevealTimer2 = null;
    }
    if (state.rules._step43RevealTimer) {
        clearTimeout(state.rules._step43RevealTimer);
        state.rules._step43RevealTimer = null;
    }
    if (state.rules._step43RevealTimer2) {
        clearTimeout(state.rules._step43RevealTimer2);
        state.rules._step43RevealTimer2 = null;
    }
    const step = clamp(state.rules.step || 1, 1, 5);
    const slides = getRuleSlides(step);
    const page = clamp(state.rules.page || 0, 0, slides.length - 1);
    state.rules.step = step;
    state.rules.page = page;
    if (!['intro', 'play', 'summary'].includes(state.rules.phase)) state.rules.phase = 'intro';
    if (step === 4 && page === 1 && state.rules.phase === 'intro') {
        state.rules.step4Slide2RevealDone = false;
    }
    if (step === 4 && page === 2 && state.rules.phase === 'intro') {
        state.rules.step4Slide3ScrollRevealDone = false;
    }
    const slide = slides[page];
    if (
        !state.rules.step5ExcludedSlots ||
        typeof state.rules.step5ExcludedSlots !== 'object' ||
        Array.isArray(state.rules.step5ExcludedSlots)
    ) {
        state.rules.step5ExcludedSlots = {};
    }
    if (
        !state.rules.step5ExcludedSlotsPart2 ||
        typeof state.rules.step5ExcludedSlotsPart2 !== 'object' ||
        Array.isArray(state.rules.step5ExcludedSlotsPart2)
    ) {
        state.rules.step5ExcludedSlotsPart2 = {};
    }
    const markersForRuleBoard =
        step === 5 && slide.ruleFreeShapeStepPairs && slide.ruleFreeShapeStepPairs.length
            ? (() => {
                  const part = ruleStep5ExcludedPartitionFromSlide(slide);
                  const excl = ruleStep5ExcludedRawForPartition(part);
                  return (slide.markers || []).filter(
                      m => !excl[ruleStep5SlotKey(m.stringNum, m.fret)]
                  );
              })()
            : slide.markers || [];
    const targets = getRuleTargetSequence(slide);
    state.rules.tapIndex = clamp(state.rules.tapIndex || 0, 0, Math.max(0, targets.length - 1));
    const isPlayPhase = state.rules.phase === 'play';
    const isSummaryPhase = state.rules.phase === 'summary';
    const currentTarget = targets[state.rules.tapIndex] || null;
    const hasFretboard = !!(slide.markers && slide.markers.length);
    /**
     * STEP3・ペアタップ：偶数 tapIndex＝太い側のみ表示（※全表示スライドは別）→奇数＝ペア＋黄線→細い側タップで次へ
     */
    const step3PairTapUI = step === 3 && !!slide.step3PairTapSequence && hasFretboard;
    const ruleFreeShapeUI = !!(slide.ruleFreeShapeStepPairs && slide.ruleFreeShapeStepPairs.length)
        && hasFretboard;
    let markersSource = markersForRuleBoard;
    if (ruleFreeShapeUI) {
        const src = markersForRuleBoard;
        if (!isPlayPhase || isSummaryPhase || slide.ruleFreeShapeShowAllMarkersInPlay) {
            markersSource = src;
        } else {
            const t = targets[state.rules.tapIndex || 0];
            if (!t) {
                markersSource = [];
            } else if (t.ruleFlexibleMulti && t.acceptedPositions && t.acceptedPositions.length) {
                markersSource = src.filter(m =>
                    t.acceptedPositions.some(p => p.stringNum === m.stringNum && p.fret === m.fret)
                );
            } else if (t.ruleFlexibleMulti) {
                const pc = ((t.noteIdx % 12) + 12) % 12;
                markersSource = src.filter(m => {
                    const raw =
                        typeof m.noteIdx === 'number'
                            ? m.noteIdx
                            : (OPEN_STRINGS[6 - m.stringNum] + m.fret) % 12;
                    return ((raw % 12) + 12) % 12 === pc;
                });
            } else {
                markersSource = src.filter(m => m.stringNum === t.stringNum && m.fret === t.fret);
            }
        }
    } else if (slide.ruleSamePitchBridgeSequence && isPlayPhase && currentTarget) {
        const currentGroup =
            typeof currentTarget.ruleSamePitchGroup === 'number'
                ? currentTarget.ruleSamePitchGroup
                : null;
        markersSource =
            currentGroup === null
                ? markersForRuleBoard.filter(
                      m => m.stringNum === currentTarget.stringNum && m.fret === currentTarget.fret
                  )
                : markersForRuleBoard.filter(m => m.ruleSamePitchGroup === currentGroup);
    } else if (step === 4 && page === 1 && isPlayPhase && !state.rules.step4Slide2RevealDone) {
        const s4 = getRuleSlides(4);
        const dedupeMR = list => {
            const map = new Map();
            for (let i = 0; i < list.length; i++) {
                const m = list[i];
                if (!m || typeof m.stringNum !== 'number') continue;
                map.set(`${m.stringNum}-${m.fret}`, m);
            }
            return [...map.values()];
        };
        markersSource = dedupeMR([...(s4[0]?.markers || []), ...(s4[1]?.markers || [])]);
    }
    if (step3PairTapUI) {
        const src = slide.markers || [];
        if (isSummaryPhase) {
            markersSource = [];
        } else if (!isPlayPhase) {
            const t0 = targets[0];
            markersSource = t0
                ? src.filter(m => m.stringNum === t0.stringNum && m.fret === t0.fret)
                : [];
        } else if (slide.step3PairTapShowAllMarkersInPlay) {
            markersSource = src;
        } else {
            const idx = state.rules.tapIndex || 0;
            if (idx % 2 === 0) {
                const t = targets[idx];
                markersSource = t
                    ? src.filter(m => m.stringNum === t.stringNum && m.fret === t.fret)
                    : [];
            } else {
                const t0 = targets[idx - 1];
                const t1 = targets[idx];
                const pick = t =>
                    src.find(m => m.stringNum === t.stringNum && m.fret === t.fret);
                markersSource = [pick(t0), pick(t1)].filter(Boolean);
            }
        }
    }
    const markersForRender = markersSource.map(marker => {
        let matchCurrent = false;
        if (currentTarget) {
            if (currentTarget.ruleFlexibleMulti) {
                if (currentTarget.acceptedPositions && currentTarget.acceptedPositions.length) {
                    matchCurrent = currentTarget.acceptedPositions.some(
                        p => p.stringNum === marker.stringNum && p.fret === marker.fret
                    );
                } else {
                    const raw =
                        typeof marker.noteIdx === 'number'
                            ? marker.noteIdx
                            : (OPEN_STRINGS[6 - marker.stringNum] + marker.fret) % 12;
                    const mPc = ((raw % 12) + 12) % 12;
                    const tPc = ((currentTarget.noteIdx % 12) + 12) % 12;
                    matchCurrent = mPc === tPc;
                }
            } else if (
                marker.stringNum === currentTarget.stringNum &&
                marker.fret === currentTarget.fret
            ) {
                matchCurrent = true;
            }
        }
        const targetMatch =
            (isPlayPhase && matchCurrent) ||
            (step3PairTapUI &&
                !isSummaryPhase &&
                !isPlayPhase &&
                targets[0] &&
                marker.stringNum === targets[0].stringNum &&
                marker.fret === targets[0].fret);
        return {
            ...marker,
            className: `${marker.className || 'rule-scale'}${targetMatch ? ' rule-next' : ''}`
        };
    });
    const themeMain = (slide.learnTheme || slide.introText || slide.text || '').trim();
    const introFollowUp = (slide.learnThemeIntro2 || '').trim();
    const summaryFollowUp = (slide.summaryLearn2 || '').trim();
    const hasDoubleIntro = introFollowUp.length > 0 && state.rules.phase === 'intro';
    const hasDoubleSummary = summaryFollowUp.length > 0 && isSummaryPhase;
    if (state.rules.phase === 'intro' && hasDoubleIntro) {
        state.rules.ruleIntroStage = clamp(state.rules.ruleIntroStage || 0, 0, 1);
    } else if (isSummaryPhase && hasDoubleSummary) {
        state.rules.ruleIntroStage = clamp(state.rules.ruleIntroStage || 0, 0, 1);
    } else {
        state.rules.ruleIntroStage = 0;
    }
    const introOverlayMain = hasDoubleIntro && (state.rules.ruleIntroStage || 0) === 1
        ? introFollowUp
        : themeMain;
    let summaryMain = (slide.summaryLearn || slide.summaryText || '').trim();
    if (isSummaryPhase && hasDoubleSummary && (state.rules.ruleIntroStage || 0) === 1) {
        summaryMain = summaryFollowUp;
    }
    let summarySubline = (slide.summaryLearnSubline ? String(slide.summaryLearnSubline) : '').trim();
    if (isSummaryPhase && hasDoubleSummary && (state.rules.ruleIntroStage || 0) === 0) {
        summarySubline = '';
    }
    const summarySublineHtml = isSummaryPhase && summarySubline
        ? `<span class="rule-phase-overlay-note">${summarySubline}</span>`
        : '';
    const playLine = (slide.text || '').trim();
    const isFinalRuleSummary = isSummaryPhase && step === 5 && page === slides.length - 1;
    const overlayIntroHtml = `
                        <span class="rule-phase-overlay-main">${introOverlayMain}</span>
                        <button type="button" class="rule-start-btn" id="rule-start-btn">タップで開始</button>`;
    const overlaySummaryHtml = `
                        <span class="rule-phase-overlay-main">${summaryMain}</span>
                        ${summarySublineHtml}
                        <button type="button" class="rule-start-btn" id="rule-start-btn">タップで次へ</button>`;
    const phaseClass = 'rule-phase-banner--intro';
    const touchPhaseClass = isPlayPhase ? 'rule-touch-area--play' : 'rule-touch-area--intro';
    const halfTonePopEl = document.getElementById('rule-half-tone-pop');
    if (halfTonePopEl) {
        halfTonePopEl.remove();
        ruleHalfTonePopDetached = halfTonePopEl;
    }
    const step3GapPopEl = document.getElementById('rule-step3-gap-pop');
    if (step3GapPopEl) {
        step3GapPopEl.remove();
        ruleStep3GapPopDetached = step3GapPopEl;
    }
    const step43GapPopEl = document.getElementById('rule-step43-gap-pop');
    if (step43GapPopEl) {
        step43GapPopEl.remove();
        ruleStep43GapPopDetached = step43GapPopEl;
    }
    app.innerHTML = `
        ${buildPageHeader({
            headerClass: 'page-header--stage-select',
            titleText: `STEP ${step}`,
            titleSubText: getBasicRuleStepHeadline(step),
            leftHtml: `
                ${navButtonHtml({ id: 'btn-back', text: '← 戻る', extraClass: 'page-nav-btn--back' })}
            `,
            rightHtml: `<button class="icon-btn home-settings-btn" id="btn-settings-rule-step" aria-label="設定">⚙️</button>`
        })}
        <div class="rule-step-card ${window.innerWidth > window.innerHeight ? 'rule-step-card--landscape' : ''}">
            <div class="rule-step-head">
                <span class="settings-card-subtitle rule-step-page-count">${page + 1} / ${slides.length}</span>
            </div>
            <div class="rule-step-progress" role="group" aria-label="このSTEPのスライドへ移動">
                ${slides.map((_, idx) => `
                    <button type="button" class="rule-step-progress-segment ${idx < page ? 'is-done' : ''} ${idx === page ? 'is-current' : ''}"
                        data-rule-progress-index="${idx}"
                        aria-label="STEP ${step}-${idx + 1}"
                        ${idx === page ? 'aria-current="true"' : ''}>
                        <span class="rule-step-progress-bar" aria-hidden="true"></span>
                    </button>
                `).join('')}
            </div>
            ${isPlayPhase && playLine ? `<p class="rule-step-text">${playLine}</p>` : ''}
            <div id="rule-touch-area" class="rule-touch-area ${touchPhaseClass}">
                ${hasFretboard ? `
                <div class="rule-fretboard-stack" id="rule-fretboard-stack">
                    <div id="rule-fretboard-container" class="rule-fretboard-host"></div>
                    ${step === 3 && slide.step3PairTapSequence && !slide.step3PairTapHideLineAndGapHint ? '<svg id="rule-step31-pair-line" class="rule-step31-pair-line" aria-hidden="true"></svg>' : ''}
                </div>` : renderRuleDiagram(slide.diagram, currentTarget ? currentTarget.diagramIndex : 0)}
                ${isPlayPhase ? '' : `
                    <div class="rule-phase-overlay ${phaseClass}" id="rule-phase-overlay" role="presentation">
                        ${isSummaryPhase ? overlaySummaryHtml : overlayIntroHtml}
                    </div>
                `}
                ${slide.specialGap ? `<div class="rule-special-gap-note">3弦〜2弦だけ狭い</div>` : ''}
            </div>
            <p id="rule-miss-feedback" class="rule-miss-feedback" role="status" aria-live="polite"></p>
            <div class="rule-step-actions">
                <button type="button" class="btn-secondary" id="btn-rule-prev">1つ戻る</button>
                <button type="button" class="btn-secondary" id="btn-rule-advance">1つ進む</button>
            </div>
            ${isFinalRuleSummary ? '<p class="rule-complete-note">おつかれ！いつでもSTEPから復習できるよ</p>' : ''}
        </div>
    `;

    document.getElementById('btn-back').onclick = () => {
        state.course = 'basicRules';
        saveState();
        renderApp();
    };
    document.getElementById('btn-settings-rule-step').onclick = () => openSettings('basicRuleStep');
    document.getElementById('btn-rule-prev').onclick = () => ruleUndoOneAction();
    document.getElementById('btn-rule-advance').onclick = () => ruleAdvanceOneAction();
    document.querySelectorAll('.rule-step-progress-segment[data-rule-progress-index]').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.getAttribute('data-rule-progress-index'), 10);
            if (!Number.isNaN(idx)) ruleJumpToSlideWithinStep(idx);
        };
    });
    const ruleTouchArea = document.getElementById('rule-touch-area');
    if (ruleTouchArea && !isPlayPhase) {
        ruleTouchArea.onclick = () => playCurrentRuleTarget(slide);
    }
    if (!hasFretboard) {
        ruleTouchArea.onclick = (e) => {
            if (!isPlayPhase) {
                playCurrentRuleTarget(slide);
                return;
            }
            if (!isPlayPhase) return;
            const noteButton = e.target.closest('[data-rule-diagram-note]');
            if (!noteButton) {
                showRuleMissFeedback('光る場所をタップしてね');
                return;
            }
            const tappedIndex = parseInt(noteButton.getAttribute('data-rule-diagram-note'), 10);
            if (currentTarget && tappedIndex === currentTarget.diagramIndex) {
                playCurrentRuleTarget(slide);
            } else {
                showRuleMissFeedback('光る場所をタップしてね');
            }
        };
    }
    const ruleStep3TapFitFretRange = (() => {
        if (step === 4 && page === 2 && isPlayPhase) {
            if (state.rules.step4Slide3ScrollRevealDone) {
                return [9, 13];
            }
            return false;
        }
        if (step === 4 && page === 1 && isPlayPhase) {
            if (state.rules.step4Slide2RevealDone) {
                return [7, 10];
            }
            return false;
        }
        if (Array.isArray(slide.ruleTapLayoutFretRange) && slide.ruleTapLayoutFretRange.length === 2) {
            return slide.ruleTapLayoutFretRange;
        }
        if (slide.step3PairTapSequence) {
            return [0, typeof slide.step3PairTapViewFretMax === 'number' ? slide.step3PairTapViewFretMax : 5];
        }
        return false;
    })();
    const ruleTapLayoutZoomFitFloatRange =
        Array.isArray(slide.ruleTapLayoutZoomFitFloatRange) && slide.ruleTapLayoutZoomFitFloatRange.length === 2
            ? slide.ruleTapLayoutZoomFitFloatRange
            : null;
    const ruleTapLayoutZoomExtra =
        typeof slide.ruleTapLayoutZoomExtra === 'number' && slide.ruleTapLayoutZoomExtra > 0
            ? slide.ruleTapLayoutZoomExtra
            : 1;
    /** STEP4：共通ズームでも見せたい位置へ寄せる（float の中央代替） */
    let ruleTapZoomScrollAnchorFret = null;
    if (step === 5 && hasFretboard && state.settings.fretboardView === 'zoom') {
        ruleTapZoomScrollAnchorFret = page === 0 ? (isPlayPhase ? null : 8) : 1;
    } else if (step === 4 && hasFretboard && state.settings.fretboardView === 'zoom') {
        if (page === 0) {
            ruleTapZoomScrollAnchorFret = 3;
        } else if (page === 1) {
            if (!isPlayPhase) ruleTapZoomScrollAnchorFret = 3;
            else if (!state.rules.step4Slide2RevealDone) ruleTapZoomScrollAnchorFret = 3;
            else ruleTapZoomScrollAnchorFret = 8;
        } else if (page === 2) {
            if (!isPlayPhase) {
                ruleTapZoomScrollAnchorFret = 8;
            } else if (!state.rules.step4Slide3ScrollRevealDone) {
                ruleTapZoomScrollAnchorFret = 8;
            } else {
                ruleTapZoomScrollAnchorFret = 11;
            }
        }
    }
    const effectiveRuleTapLockScroll =
        step === 4 && page === 1 && isPlayPhase
            ? !!state.rules.step4Slide2RevealDone
            : step === 4 && page === 2 && isPlayPhase
              ? !!state.rules.step4Slide3ScrollRevealDone
              : slide.ruleTapLayoutLockScroll === true;
    const step5AnchorDisableSlot =
        step === 5 &&
        slide.ruleFreeShapeStepPairs &&
        slide.ruleFreeShapeStepPairs[0] &&
        slide.ruleFreeShapeStepPairs[0][0]
            ? slide.ruleFreeShapeStepPairs[0][0]
            : null;
    if (hasFretboard) {
        renderFretboardHTML('rule-fretboard-container', {
            mode: 'rule',
            ruleMarkers: markersForRender,
            displayMode: state.settings.noteLabelMode,
            rulePitchToneByAccidental: step === 1 && (page === 0 || page === 1 || page === 2),
            ruleTapCueBesideNote: step === 2 && (page === 0 || page === 1 || page === 2 || page === 3),
            ruleTapCueBubbleAboveNote: step === 2 && page === 2,
            ruleStep2DegreeColors: step === 2 || step === 3 || step === 4 || step === 5,
            ruleStep3TapFitFretRange,
            ruleTapLayoutZoomFitFloatRange,
            ruleTapLayoutZoomExtra,
            ruleTapZoomScrollAnchorFret,
            ruleSlowAutoScrollToNext: slide.ruleSlowAutoScrollToNext === true,
            ruleTapLayoutLockScroll: effectiveRuleTapLockScroll,
            ruleStep3PairTapLine:
                !!slide.step3PairTapSequence && !slide.step3PairTapHideLineAndGapHint,
            ruleStep5ExcludeInlineCheckboxes: step === 5 && isPlayPhase && ruleFreeShapeUI,
            ruleStep5ExcludedSlotsLookup:
                step === 5 && slide.ruleFreeShapeStepPairs && slide.ruleFreeShapeStepPairs.length
                    ? ruleStep5ExcludedRawForPartition(ruleStep5ExcludedPartitionFromSlide(slide))
                    : null,
            ruleStep5AnchorDisableSlot: step5AnchorDisableSlot,
            onFretClick: (stringNum, fret) => {
                if (!isPlayPhase || !currentTarget) return;
                const fShape = !!(slide.ruleFreeShapeStepPairs && slide.ruleFreeShapeStepPairs.length);
                if (fShape) {
                    const tappedPc = ((OPEN_STRINGS[6 - stringNum] + fret) % 12 + 12) % 12;
                    const wantPc = ((currentTarget.noteIdx % 12) + 12) % 12;
                    if (currentTarget.ruleFlexibleMulti) {
                        const spots = currentTarget.acceptedPositions;
                        const posOk =
                            spots && spots.length
                                ? spots.some(p => p.stringNum === stringNum && p.fret === fret)
                                : tappedPc === wantPc;
                        if (posOk) {
                            playTone(6 - stringNum, fret);
                            advanceRuleAfterSound(slide);
                        } else {
                            showRuleMissFeedback('光る丸をタップしてね');
                        }
                    } else if (
                        stringNum === currentTarget.stringNum &&
                        fret === currentTarget.fret
                    ) {
                        playCurrentRuleTarget(slide);
                    } else {
                        showRuleMissFeedback('光る丸をタップしてね');
                    }
                    return;
                }
                if (
                    stringNum === currentTarget.stringNum &&
                    fret === currentTarget.fret
                ) {
                    playCurrentRuleTarget(slide);
                } else {
                    showRuleMissFeedback('光る丸をタップしてね');
                }
            }
        });
        if (step === 4 && page === 1 && isPlayPhase && !state.rules.step4Slide2RevealDone) {
            if (state.settings.fretboardView === 'zoom') {
                state.rules._step42RevealTimer = setTimeout(() => {
                    state.rules._step42RevealTimer = null;
                    const wrap = document.querySelector('#rule-fretboard-container .fretboard-scroll-wrapper');
                    if (!wrap) return;
                    alignRuleStep3Page0Fret3Center(wrap);
                    const scrollBefore = wrap.scrollLeft;
                    alignRuleStep3FretColumnCenter(wrap, 8);
                    const scrollTarget = wrap.scrollLeft;
                    wrap.scrollLeft = scrollBefore;
                    wrap.scrollTo({ left: scrollTarget, behavior: 'smooth' });
                    state.rules._step42RevealTimer2 = setTimeout(() => {
                        state.rules._step42RevealTimer2 = null;
                        state.rules.step4Slide2RevealDone = true;
                        saveState();
                        renderApp();
                    }, 780);
                }, 140);
            } else {
                state.rules._step42RevealTimer = setTimeout(() => {
                    state.rules._step42RevealTimer = null;
                    state.rules.step4Slide2RevealDone = true;
                    saveState();
                    renderApp();
                }, 650);
            }
        }
        if (step === 4 && page === 2 && isPlayPhase && !state.rules.step4Slide3ScrollRevealDone) {
            if (state.settings.fretboardView === 'zoom') {
                state.rules._step43RevealTimer = setTimeout(() => {
                    state.rules._step43RevealTimer = null;
                    const wrap = document.querySelector('#rule-fretboard-container .fretboard-scroll-wrapper');
                    if (!wrap) return;
                    alignRuleStep3FretColumnCenter(wrap, 8);
                    const scrollBefore = wrap.scrollLeft;
                    alignRuleStep3FretColumnCenter(wrap, 11);
                    const scrollTarget = wrap.scrollLeft;
                    wrap.scrollLeft = scrollBefore;
                    wrap.scrollTo({ left: scrollTarget, behavior: 'smooth' });
                    state.rules._step43RevealTimer2 = setTimeout(() => {
                        state.rules._step43RevealTimer2 = null;
                        state.rules.step4Slide3ScrollRevealDone = true;
                        saveState();
                        renderApp();
                    }, 780);
                }, 140);
            } else {
                state.rules._step43RevealTimer = setTimeout(() => {
                    state.rules._step43RevealTimer = null;
                    state.rules.step4Slide3ScrollRevealDone = true;
                    saveState();
                    renderApp();
                }, 650);
            }
        }
    }

    syncRuleStepHalfTonePop();
    syncRuleStep3GapHintPop();
    syncRuleStep43GapHintPop();
    if (
        hasFretboard &&
        step === 3 &&
        slide.step3PairTapSequence &&
        !slide.step3PairTapHideLineAndGapHint
    ) {
        scheduleRuleStep31PairLineUpdates();
    }
    if (hasFretboard && step === 4 && page === 2) {
        scheduleRuleStep43GapHintUpdates();
    }

    app.style.height = '100vh';
    app.style.overflowY = 'auto';
    app.style.overflowX = 'hidden';
}

function getRuleHalfTonePopPairFromTarget(t) {
    if (!t || t.stringNum !== 2) return null;
    if (t.fret === 5 || t.fret === 6) return 'miFa';
    if (t.fret === 12 || t.fret === 13) return 'siDo';
    return null;
}

function getRuleHalfTonePairFromState() {
    const step = state.rules.step || 1;
    const page = state.rules.page || 0;
    if (step !== 1 || page !== 2 || state.rules.phase !== 'play') return null;
    const slides = getRuleSlides(step);
    const slide = slides[page];
    if (!slide) return null;
    const targets = getRuleTargetSequence(slide);
    const t = targets[state.rules.tapIndex || 0] || null;
    return getRuleHalfTonePopPairFromTarget(t);
}

function removeRuleHalfTonePopElement() {
    const pop = document.getElementById('rule-half-tone-pop') || ruleHalfTonePopDetached;
    if (pop) pop.remove();
    ruleHalfTonePopDetached = null;
    ruleHalfToneLastPair = null;
    ruleHalfToneLastScroll = -1;
}

function pickRuleFretColumnNoteMarker(col) {
    if (!col) return col;
    const nodes = col.querySelectorAll('.note-marker');
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (!n.classList.contains('hidden-note')) return n;
    }
    return col.querySelector('.note-marker') || col;
}

/** 音名丸の外周同士を結ぶ線分の端点（ビューポート座標） */
function ruleStep3PairNoteEdgesViewport(elA, elB) {
    const ma = pickRuleFretColumnNoteMarker(elA);
    const mb = pickRuleFretColumnNoteMarker(elB);
    const rma = ma.getBoundingClientRect();
    const rmb = mb.getBoundingClientRect();
    const cx1 = rma.left + rma.width / 2;
    const cy1 = rma.top + rma.height / 2;
    const cx2 = rmb.left + rmb.width / 2;
    const cy2 = rmb.top + rmb.height / 2;
    const rad1 = Math.max(4, Math.min(rma.width, rma.height) / 2);
    const rad2 = Math.max(4, Math.min(rmb.width, rmb.height) / 2);
    let dx = cx2 - cx1;
    let dy = cy2 - cy1;
    const dist = Math.hypot(dx, dy) || 1;
    dx /= dist;
    dy /= dist;
    return {
        x1: cx1 + dx * rad1,
        y1: cy1 + dy * rad1,
        x2: cx2 - dx * rad2,
        y2: cy2 - dy * rad2
    };
}

/** 3弦→2弦で同じ音のときだけ、間隔は5フレットではなく4フレット */
function ruleStep3PairGapIsFourFret(tA, tB) {
    if (!tA || !tB || tA.stringNum !== 3 || tB.stringNum !== 2) return false;
    const nA =
        typeof tA.noteIdx === 'number'
            ? tA.noteIdx % 12
            : (OPEN_STRINGS[6 - tA.stringNum] + tA.fret) % 12;
    const nB =
        typeof tB.noteIdx === 'number'
            ? tB.noteIdx % 12
            : (OPEN_STRINGS[6 - tB.stringNum] + tB.fret) % 12;
    if (nA !== nB) return false;
    return tA.fret - tB.fret === 4;
}

/** STEP3・太い弦→細い弦の黄線フェーズ：例外は「4フレット」オレンジ、その他は「5フレット」白背景 */
function getRuleStep3GapHintState() {
    if (state.rules.step !== 3 || state.rules.phase !== 'play') return null;
    const slides = getRuleSlides(3);
    const page = clamp(state.rules.page || 0, 0, slides.length - 1);
    const slide = slides[page];
    if (!slide || !slide.step3PairTapSequence) return null;
    if (slide.step3PairTapHideLineAndGapHint) return null;
    const idx = state.rules.tapIndex || 0;
    if (idx % 2 === 0) return null;
    const targets = getRuleTargetSequence(slide);
    const tA = targets[idx - 1];
    const tB = targets[idx];
    if (!tA || !tB) return null;
    return { variant: ruleStep3PairGapIsFourFret(tA, tB) ? 'four' : 'five', tA, tB };
}

function removeRuleStep3GapPopElement() {
    const pop = document.getElementById('rule-step3-gap-pop') || ruleStep3GapPopDetached;
    if (pop) pop.remove();
    ruleStep3GapPopDetached = null;
}

function syncRuleStep3GapHintPop() {
    const area = document.getElementById('rule-touch-area');
    const st = getRuleStep3GapHintState();
    if (!st || !area) {
        removeRuleStep3GapPopElement();
        return;
    }
    const text = st.variant === 'four' ? '4フレット' : '5フレット';
    const cls =
        st.variant === 'four'
            ? 'rule-half-tone-pop rule-half-tone-pop--compact'
            : 'rule-step3-five-fret-pop';
    let pop = document.getElementById('rule-step3-gap-pop') || ruleStep3GapPopDetached;
    if (!pop) {
        pop = document.createElement('div');
        pop.id = 'rule-step3-gap-pop';
        pop.setAttribute('role', 'status');
        ruleStep3GapPopDetached = pop;
    } else {
        ruleStep3GapPopDetached = pop;
    }
    pop.className = cls;
    pop.textContent = text;
    const reattached = !pop.parentNode || pop.parentNode !== area;
    if (reattached) {
        area.appendChild(pop);
    }
    positionRuleStep3GapHintPop(0);
}

function positionRuleStep3GapHintPop(delayMs = 0) {
    const run = () => {
        const st = getRuleStep3GapHintState();
        if (!st) {
            removeRuleStep3GapPopElement();
            return;
        }
        const pop = document.getElementById('rule-step3-gap-pop') || ruleStep3GapPopDetached;
        const area = document.getElementById('rule-touch-area');
        const host = document.getElementById('rule-fretboard-container');
        if (!area || !pop || !host) return;
        const elA = host.querySelector(
            `.fret-column[data-string="${st.tA.stringNum}"][data-fret="${st.tA.fret}"]`
        );
        const elB = host.querySelector(
            `.fret-column[data-string="${st.tB.stringNum}"][data-fret="${st.tB.fret}"]`
        );
        if (!elA || !elB) return;
        const edge = ruleStep3PairNoteEdgesViewport(elA, elB);
        const midVx = (edge.x1 + edge.x2) / 2;
        const midVy = (edge.y1 + edge.y2) / 2;
        const areaRect = area.getBoundingClientRect();
        const midX = midVx - areaRect.left;
        const midY = midVy - areaRect.top;
        const w = pop.offsetWidth || (st.variant === 'four' ? 56 : 58);
        const h = pop.offsetHeight || 22;
        const leftPx = clamp(
            Math.round(midX - w / 2),
            6,
            Math.max(6, areaRect.width - w - 6)
        );
        const topPx = clamp(
            Math.round(midY - h / 2),
            4,
            Math.max(4, areaRect.height - h - 4)
        );
        pop.style.position = 'absolute';
        pop.style.left = `${leftPx}px`;
        pop.style.top = `${topPx}px`;
        pop.classList.add('is-positioned');
    };
    if (delayMs > 0) {
        setTimeout(run, delayMs);
    } else {
        run();
    }
}

/** STEP4-3：ソ→ラで「1フレットずれる」吹き出し（タップインデックス5〜、まとめでは消す） */
const STEP43_LA_GAP_HINT_FROM_TAP_INDEX = 5;

function ruleStep43GapHintShouldShow() {
    if (state.rules.step !== 4) return false;
    const page = clamp(state.rules.page || 0, 0, 99);
    if (page !== 2) return false;
    const ph = state.rules.phase;
    if (ph === 'summary') return false;
    if (ph !== 'play') return false;
    return (state.rules.tapIndex || 0) >= STEP43_LA_GAP_HINT_FROM_TAP_INDEX;
}

function cleanupRuleStep43GapHintSchedule() {
    ruleStep43GapTimeoutIds.forEach(id => clearTimeout(id));
    ruleStep43GapTimeoutIds = [];
    if (ruleStep43GapCleanup) {
        ruleStep43GapCleanup();
        ruleStep43GapCleanup = null;
    }
}

function removeRuleStep43GapPopElement() {
    const pop = document.getElementById('rule-step43-gap-pop') || ruleStep43GapPopDetached;
    if (pop) pop.remove();
    ruleStep43GapPopDetached = null;
}

function syncRuleStep43GapHintPop() {
    const area = document.getElementById('rule-touch-area');
    if (!ruleStep43GapHintShouldShow() || !area) {
        removeRuleStep43GapPopElement();
        return;
    }
    let pop = document.getElementById('rule-step43-gap-pop') || ruleStep43GapPopDetached;
    if (!pop) {
        pop = document.createElement('div');
        pop.id = 'rule-step43-gap-pop';
        pop.setAttribute('role', 'note');
        ruleStep43GapPopDetached = pop;
    } else {
        ruleStep43GapPopDetached = pop;
    }
    pop.className = 'rule-step43-gap-pop';
    pop.textContent = '1フレットずれる';
    const reattached = !pop.parentNode || pop.parentNode !== area;
    if (reattached) {
        area.appendChild(pop);
    }
    positionRuleStep43GapHintPop(0);
}

function positionRuleStep43GapHintPop(delayMs = 0) {
    const run = () => {
        if (!ruleStep43GapHintShouldShow()) {
            removeRuleStep43GapPopElement();
            return;
        }
        const pop = document.getElementById('rule-step43-gap-pop') || ruleStep43GapPopDetached;
        const area = document.getElementById('rule-touch-area');
        const host = document.getElementById('rule-fretboard-container');
        if (!area || !pop || !host) return;
        /** ラ（2弦10）の音名丸の左隣・被り回避 */
        const tRa = { stringNum: 2, fret: 10 };
        const colRa = host.querySelector(
            `.fret-column[data-string="${tRa.stringNum}"][data-fret="${tRa.fret}"]`
        );
        if (!colRa) return;
        const noteEl = pickRuleFretColumnNoteMarker(colRa);
        if (!noteEl) return;
        const r = noteEl.getBoundingClientRect();
        const areaRect = area.getBoundingClientRect();
        const gap = 6;
        pop.style.visibility = 'hidden';
        pop.style.left = '0';
        pop.style.top = '0';
        void pop.offsetWidth;
        const w = pop.offsetWidth;
        const h = pop.offsetHeight;
        let leftPx = Math.round(r.left - areaRect.left - gap - w);
        let topPx = Math.round(r.top - areaRect.top + (r.height - h) / 2);
        /** 左に十分な隙間がないときだけ、ノートの上にずらす */
        if (leftPx < 8) {
            leftPx = Math.round(r.left - areaRect.left + (r.width - w) / 2);
            topPx = Math.round(r.top - areaRect.top - h - gap);
        }
        leftPx = clamp(leftPx, 6, Math.max(6, areaRect.width - w - 6));
        topPx = clamp(topPx, 4, Math.max(4, areaRect.height - h - 4));
        pop.style.visibility = '';
        pop.style.position = 'absolute';
        pop.style.left = `${leftPx}px`;
        pop.style.top = `${topPx}px`;
        pop.classList.add('is-positioned');
    };
    if (delayMs > 0) {
        setTimeout(run, delayMs);
    } else {
        run();
    }
}

function scheduleRuleStep43GapHintUpdates() {
    cleanupRuleStep43GapHintSchedule();
    if (!ruleStep43GapHintShouldShow()) return;
    const host = document.getElementById('rule-fretboard-container');
    const wrapper = host?.querySelector('.fretboard-scroll-wrapper');
    const update = () => positionRuleStep43GapHintPop(0);
    [0, 45, 120, 280, 520].forEach(d => {
        ruleStep43GapTimeoutIds.push(setTimeout(update, d));
    });
    if (!wrapper) return;
    let rafId = null;
    const onScrollOrResize = () => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            update();
        });
    };
    wrapper.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    ruleStep43GapCleanup = () => {
        wrapper.removeEventListener('scroll', onScrollOrResize);
        window.removeEventListener('resize', onScrollOrResize);
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
    };
}

/** STEP1・スライド3（page 2）：半音ペアの下に「半音！」ポップ（DOMは付け替えで維持） */
function syncRuleStepHalfTonePop() {
    const pair = getRuleHalfTonePairFromState();
    const area = document.getElementById('rule-touch-area');
    if (!pair || !area) {
        removeRuleHalfTonePopElement();
        return;
    }
    const host = document.getElementById('rule-fretboard-container');
    if (!host) {
        removeRuleHalfTonePopElement();
        return;
    }
    let pop = document.getElementById('rule-half-tone-pop') || ruleHalfTonePopDetached;
    if (!pop) {
        pop = document.createElement('div');
        pop.id = 'rule-half-tone-pop';
        pop.setAttribute('role', 'status');
        pop.textContent = '半音！';
        ruleHalfTonePopDetached = pop;
    } else {
        ruleHalfTonePopDetached = pop;
    }
    pop.className = 'rule-half-tone-pop rule-half-tone-pop--step1-practice';
    pop.textContent = '半音！';
    const reattached = !pop.parentNode || pop.parentNode !== area;
    if (reattached) {
        area.appendChild(pop);
        ruleHalfToneLastPair = null;
        ruleHalfToneLastScroll = -1;
    }
    positionRuleHalfTonePop(0);
}

/** STEP1・page 2：半音ポップを2弦の該当フレット列の直下に置く（同一ペア内はスクロール以外レイアウトしない） */
function positionRuleHalfTonePop(delayMs = 0) {
    const run = () => {
        const pair = getRuleHalfTonePairFromState();
        const pop = document.getElementById('rule-half-tone-pop') || ruleHalfTonePopDetached;
        const area = document.getElementById('rule-touch-area');
        const host = document.getElementById('rule-fretboard-container');
        if (!pair) {
            removeRuleHalfTonePopElement();
            return;
        }
        if (!area || !pop || !host) return;
        const wrapper = host.querySelector('.fretboard-scroll-wrapper');
        const sc = wrapper ? wrapper.scrollLeft : 0;
        if (
            ruleHalfToneLastPair === pair &&
            Math.abs(ruleHalfToneLastScroll - sc) < 0.5 &&
            pop.classList.contains('is-positioned')
        ) {
            return;
        }
        const frets = pair === 'miFa' ? [5, 6] : [12, 13];
        const c1 = host.querySelector(`.fret-column[data-string="2"][data-fret="${frets[0]}"]`);
        const c2 = host.querySelector(`.fret-column[data-string="2"][data-fret="${frets[1]}"]`);
        if (!c1 || !c2) return;
        const areaRect = area.getBoundingClientRect();
        const r1 = c1.getBoundingClientRect();
        const r2 = c2.getBoundingClientRect();
        const left = Math.min(r1.left, r2.left);
        const right = Math.max(r1.right, r2.right);
        const bottom = Math.max(r1.bottom, r2.bottom);
        const centerX = (left + right) / 2 - areaRect.left;
        const topY = bottom - areaRect.top + 6;
        const w = pop.offsetWidth || 72;
        const h = pop.offsetHeight || 36;
        const leftPx = clamp(
            Math.round(centerX - w / 2),
            6,
            Math.max(6, areaRect.width - w - 6)
        );
        const topPx = clamp(
            Math.round(topY),
            4,
            Math.max(4, areaRect.height - h - 4)
        );
        pop.style.position = 'absolute';
        pop.style.left = `${leftPx}px`;
        pop.style.top = `${topPx}px`;
        pop.classList.add('is-positioned');
        ruleHalfToneLastPair = pair;
        ruleHalfToneLastScroll = sc;
    };
    if (delayMs > 0) {
        setTimeout(run, delayMs);
    } else {
        run();
    }
}

function positionRuleFloatingCue(delayMs = 0) {
    const update = () => {
        const area = document.getElementById('rule-touch-area');
        const cue = document.getElementById('rule-floating-cue');
        const target = document.querySelector('#rule-fretboard-container .rule-next');
        if (!area || !cue || !target) return;
        const areaRect = area.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const cueRect = cue.getBoundingClientRect();
        const left = clamp(
            targetRect.left + targetRect.width / 2 - areaRect.left - cueRect.width / 2,
            8,
            Math.max(8, areaRect.width - cueRect.width - 8)
        );
        const top = clamp(
            targetRect.top - areaRect.top - cueRect.height - 10,
            4,
            Math.max(4, areaRect.height - cueRect.height - 4)
        );
        cue.style.left = `${Math.round(left)}px`;
        cue.style.top = `${Math.round(top)}px`;
        const arrowLeft = clamp(
            targetRect.left + targetRect.width / 2 - areaRect.left - left - 6,
            12,
            Math.max(12, cueRect.width - 18)
        );
        cue.style.setProperty('--rule-cue-arrow-left', `${Math.round(arrowLeft)}px`);
        cue.classList.add('is-positioned');
    };
    if (delayMs > 0) {
        setTimeout(update, delayMs);
    } else {
        update();
    }
}

function scheduleRuleFloatingCuePosition() {
    [0, 80, 180, 320, 520].forEach(delay => {
        positionRuleFloatingCue(delay);
        positionRuleHalfTonePop(delay);
    });
    const wrapper = document.querySelector('#rule-fretboard-container .fretboard-scroll-wrapper');
    if (!wrapper) return;
    if (ruleCueScrollCleanup) ruleCueScrollCleanup();
    let rafId = null;
    let cleanupTimer = null;
    const onScroll = () => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            positionRuleFloatingCue();
            positionRuleHalfTonePop();
        });
    };
    wrapper.addEventListener('scroll', onScroll, { passive: true });
    ruleCueScrollCleanup = () => {
        wrapper.removeEventListener('scroll', onScroll);
        if (rafId) cancelAnimationFrame(rafId);
        if (cleanupTimer) clearTimeout(cleanupTimer);
        ruleCueScrollCleanup = null;
        positionRuleFloatingCue();
        positionRuleHalfTonePop();
    };
    cleanupTimer = setTimeout(ruleCueScrollCleanup, 1800);
}

function cleanupRuleStep31PairLine() {
    ruleStep31LineTimeoutIds.forEach(id => clearTimeout(id));
    ruleStep31LineTimeoutIds = [];
    if (ruleStep31LineCleanup) {
        ruleStep31LineCleanup();
        ruleStep31LineCleanup = null;
    }
    const svg = document.getElementById('rule-step31-pair-line');
    if (svg) svg.innerHTML = '';
}

/** STEP3・ペアタップ各スライド：開放へ進んだあと、太い弦と開放を黄線で結ぶ（座標は #rule-fretboard-stack 基準） */
function updateRuleStep31PairLine() {
    const svg = document.getElementById('rule-step31-pair-line');
    const stack = document.getElementById('rule-fretboard-stack');
    if (!svg || !stack) return;
    if (state.rules.step !== 3 || state.rules.phase !== 'play') {
        svg.innerHTML = '';
        return;
    }
    const slides = getRuleSlides(3);
    const page = clamp(state.rules.page || 0, 0, slides.length - 1);
    const slide = slides[page];
    if (!slide || !slide.step3PairTapSequence || slide.step3PairTapHideLineAndGapHint) {
        svg.innerHTML = '';
        return;
    }
    const targets = getRuleTargetSequence(slide);
    const idx = state.rules.tapIndex || 0;
    if (idx % 2 === 0) {
        svg.innerHTML = '';
        return;
    }
    const tA = targets[idx - 1];
    const tB = targets[idx];
    if (!tA || !tB) return;
    const elA = document.querySelector(
        `#rule-fretboard-container .fret-column[data-string="${tA.stringNum}"][data-fret="${tA.fret}"]`
    );
    const elB = document.querySelector(
        `#rule-fretboard-container .fret-column[data-string="${tB.stringNum}"][data-fret="${tB.fret}"]`
    );
    if (!elA || !elB) return;
    const edgeV = ruleStep3PairNoteEdgesViewport(elA, elB);
    const sb = stack.getBoundingClientRect();
    const x1 = edgeV.x1 - sb.left;
    const y1 = edgeV.y1 - sb.top;
    const x2 = edgeV.x2 - sb.left;
    const y2 = edgeV.y2 - sb.top;
    const w = Math.max(1, Math.round(stack.clientWidth));
    const h = Math.max(1, Math.round(stack.clientHeight));
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" />`;
}

function scheduleRuleStep31PairLineUpdates() {
    cleanupRuleStep31PairLine();
    if (state.rules.step !== 3) return;
    const slides = getRuleSlides(3);
    const page = clamp(state.rules.page || 0, 0, slides.length - 1);
    const slide = slides[page];
    if (!slide || !slide.step3PairTapSequence || slide.step3PairTapHideLineAndGapHint) return;
    const update = () => {
        updateRuleStep31PairLine();
        positionRuleStep3GapHintPop(0);
    };
    [0, 45, 120, 280, 520].forEach(d => {
        ruleStep31LineTimeoutIds.push(setTimeout(update, d));
    });
    const wrapper = document.querySelector('#rule-fretboard-container .fretboard-scroll-wrapper');
    if (!wrapper) return;
    let rafId = null;
    const onScrollOrResize = () => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            update();
        });
    };
    wrapper.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    ruleStep31LineCleanup = () => {
        wrapper.removeEventListener('scroll', onScrollOrResize);
        window.removeEventListener('resize', onScrollOrResize);
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        ruleStep31LineCleanup = null;
        const svg = document.getElementById('rule-step31-pair-line');
        if (svg) svg.innerHTML = '';
    };
}

function renderStageSelect(app) {
    const stageSelectTitle = state.memorize.playMode === 'cruise' ? '🛳️ 指板をたどる' : '🎯 指板クイズ';
    const stageDefs = [
        { stage: 1, title: 'STAGE 1', desc: '開放弦〜3フレット (#なし)' },
        { stage: 2, title: 'STAGE 2', desc: '開放弦〜5フレット (#なし)' },
        { stage: 3, title: 'STAGE 3', desc: '5〜9フレット (#なし)' },
        { stage: 4, title: 'STAGE 4', desc: '5〜12フレット (#なし)' },
        { stage: 5, title: 'STAGE 5', desc: '総復習メドレー (STAGE 1〜4)' },
        { stage: 6, title: 'STAGE 6', desc: '全指板マスター (0〜12フレット)' }
    ];
    const stageButtonsHtml = stageDefs.map(def => {
        const savedCount = getSavedCruiseRouteSlots(def.stage).length;
        const savedBadge = state.memorize.playMode === 'cruise' && savedCount > 0
            ? `<span class="stage-route-saved">${savedCount}手 保存済み</span>`
            : '';
        const mainButton = `<button class="stage-btn" data-stage="${def.stage}">${def.title}<span class="stage-desc">${def.desc}</span>${savedBadge}</button>`;
        if (state.memorize.playMode !== 'cruise') return mainButton;
        return `
            <div class="stage-route-row">
                ${mainButton}
                <button class="stage-route-edit-btn" type="button" data-edit-stage="${def.stage}" aria-label="${def.title}の順番を編集">編集</button>
            </div>
        `;
    }).join('');
    app.innerHTML = `
        ${buildPageHeader({
            headerClass: 'page-header--stage-select',
            titleText: stageSelectTitle,
            leftHtml: `
                ${navButtonHtml({ id: 'btn-back', text: '← 戻る', extraClass: 'page-nav-btn--back' })}
                ${navButtonHtml({ id: 'btn-home-stage', text: '🏠 TOP', extraClass: 'page-nav-btn--home' })}
            `,
            rightHtml: `<button class="icon-btn home-settings-btn" id="btn-settings-stage" aria-label="設定">⚙️</button>`
        })}
        <div class="stage-list">
            ${stageButtonsHtml}
        </div>
    `;

    document.getElementById('btn-back').onclick = () => {
        state.course = null;
        saveState();
        renderApp();
    };

    document.getElementById('btn-home-stage').onclick = () => {
        state.course = null;
        saveState();
        renderApp();
    };

    document.getElementById('btn-settings-stage').onclick = () => {
        openSettings('stageSelect');
    };

    document.querySelectorAll('.stage-route-edit-btn').forEach(btn => {
        btn.onclick = () => {
            const stage = parseInt(btn.getAttribute('data-edit-stage'), 10);
            const savedSlots = getSavedCruiseRouteSlots(stage);
            const savedGroupBreaks = normalizeRouteEditorGroupBreaks(getRouteEditorSavedGroupBreaks(stage), savedSlots.length);
            const initialGroupBreaks = savedGroupBreaks.length
                ? savedGroupBreaks
                : buildAutoRouteEditorGroupBreaks(savedSlots);
            const initialGroups = buildRouteEditorGroupsFromBreaks(savedSlots, initialGroupBreaks);
            stopRhythm();
            state.routeEditor = {
                stage,
                draft: savedSlots,
                deleteMode: false,
                history: [],
                deletePicker: null,
                groupBreaks: savedSlots.length ? initialGroupBreaks : [0],
                selectedGroupIndex: 0,
                visibleGroupIndices: initialGroups.length ? initialGroups.map((_, index) => index) : [0],
                forceHideAllGroups: false,
                showAllGroupsExpanded: false,
                groupPanelOffset: { x: 0, y: 0 }
            };
            state.course = 'routeEditor';
            saveState();
            renderApp();
        };
    });

    document.querySelectorAll('.stage-btn').forEach(btn => {
        btn.onclick = () => {
            initAudio(); // Initialize audio on first user gesture
            state.memorize.stage = parseInt(btn.getAttribute('data-stage'));
            state.memorize.combo = 0;
            state.memorize.isCleared = false;
            state.course = 'memorize';
            
            if (state.memorize.playMode === 'cruise') {
                const { sequence, cruiseScope } = buildCruiseStageSequence(state.memorize.stage);
                
                clearStage1RepeatHintState();
                state.memorize.cruiseScope = cruiseScope;
                state.memorize.cruiseTargets = sequence;
                state.memorize.cruiseIndex = 0;
                state.memorize.cruiseCurrentLoop = 0;
                state.memorize.currentQuestion = sequence[0];
                state.memorize.isFirstNote = true;
                state.memorize.hasTappedCurrentNote = false;
                state.memorize.tempFeedback = null;
                state.memorize.isCruisePlaying = true;
                
                autoScrollRequested = true;
                startRhythm(); // Start the drum loop. It will trigger autoAdvanceCruise.
            } else {
                state.memorize.tempFeedback = null;
                generateQuestion();
                autoScrollRequested = true;
            }
            
            saveState();
            renderApp();
        };
    });
}

function renderRouteEditor(app) {
    const stage = clamp(parseInt(state.routeEditor?.stage || 1, 10), 1, 6);
    const scaleGuideVariant = 3;
    const isLandscape = window.innerWidth > window.innerHeight;
    const draft = Array.isArray(state.routeEditor?.draft)
        ? state.routeEditor.draft.map(normalizeCruiseRouteSlot).filter(Boolean)
        : [];
    const deleteMode = !!state.routeEditor?.deleteMode;
    const history = Array.isArray(state.routeEditor?.history) ? state.routeEditor.history : [];
    let groupBreaks = Array.isArray(state.routeEditor?.groupBreaks) ? state.routeEditor.groupBreaks.slice() : [];
    const savedGroupBreaks = normalizeRouteEditorGroupBreaks(groupBreaks.length ? groupBreaks : getRouteEditorSavedGroupBreaks(stage), draft.length);
    const autoGroupBreaks = buildAutoRouteEditorGroupBreaks(draft);
    groupBreaks = savedGroupBreaks.length ? savedGroupBreaks : autoGroupBreaks;
    if (!groupBreaks.length) groupBreaks = [0];
    const groups = getRouteEditorGroups(draft, groupBreaks);
    const visibleGroupIndices = state.routeEditor?.forceHideAllGroups ? [] : getRouteEditorVisibleGroupIndices(groups.length);
    const visibleGroups = visibleGroupIndices
        .map(index => ({ ...(groups[index] || {}), index }))
        .filter(group => Number.isFinite(group.start) && Number.isFinite(group.end));
    const interactionGroupIndex = getRouteEditorOperationGroupIndex(visibleGroups, state.routeEditor?.selectedGroupIndex ?? 0);
    const selectedGroupIndex = groups.length
        ? clamp(parseInt(state.routeEditor?.selectedGroupIndex ?? visibleGroupIndices[visibleGroupIndices.length - 1] ?? 0, 10), 0, groups.length - 1)
        : 0;
    const selectedGroup = groups[selectedGroupIndex] || null;
    const groupPanelOffset = normalizeRouteEditorGroupPanelOffset(state.routeEditor?.groupPanelOffset);
    const showAllGroupsExpanded = !!state.routeEditor?.showAllGroupsExpanded;
    state.routeEditor = {
        stage,
        draft,
        deleteMode,
        history,
        deletePicker: null,
        groupBreaks,
        selectedGroupIndex,
        visibleGroupIndices,
        forceHideAllGroups: !!state.routeEditor?.forceHideAllGroups,
        showAllGroupsExpanded,
        groupPanelOffset
    };

    const groupPanelStyle = `--route-editor-group-panel-shift-x: ${groupPanelOffset.x}px; --route-editor-group-panel-shift-y: ${groupPanelOffset.y}px;`;

    const groupButtonsHtml = groups.length
        ? groups.map((group, index) => `
            <button class="route-editor-group-btn ${visibleGroupIndices.includes(index) ? 'active' : ''}" type="button" data-group-index="${index}" aria-label="${group.name}" aria-pressed="${visibleGroupIndices.includes(index) ? 'true' : 'false'}">
                ${group.name}
            </button>
        `).join('')
        : '<p class="route-editor-empty">グループがありません</p>';

    app.innerHTML = `
        <div class="route-editor-screen route-editor-scale-guide-variant-${scaleGuideVariant}">
            ${buildPageHeader({
                headerClass: 'page-header--route-editor',
                titleText: `STAGE ${stage} 順番編集`,
                leftHtml: `
                    ${navButtonHtml({ id: 'btn-route-editor-back', text: '← 戻る', extraClass: 'page-nav-btn--back' })}
                    ${navButtonHtml({ id: 'btn-route-editor-home', text: '🏠 TOP', extraClass: 'page-nav-btn--home' })}
                `
            })}
            <div class="route-editor-toolbar">
                <button class="icon-btn route-editor-tool-btn" id="btn-route-editor-clear" ${draft.length ? '' : 'disabled'}>全消し</button>
                <button class="icon-btn route-editor-tool-btn" id="btn-route-editor-load-default">初期順</button>
                <button class="icon-btn route-editor-tool-btn" id="btn-route-editor-undo" ${history.length ? '' : 'disabled'}>↶ 戻す</button>
            </div>
            <div class="route-editor-group-panel ${isLandscape ? 'route-editor-group-panel--floating' : ''} ${showAllGroupsExpanded ? 'route-editor-group-panel--expanded' : ''}" style="${groupPanelStyle}">
                <div class="route-editor-group-panel-top">
                    <button class="icon-btn route-editor-tool-btn route-editor-group-expand-btn ${showAllGroupsExpanded ? 'active' : ''}" id="btn-route-editor-group-expand" ${groups.length ? '' : 'disabled'}>${showAllGroupsExpanded ? '縮小' : '一覧'}</button>
                </div>
                <button class="route-editor-group-panel-handle" id="btn-route-editor-group-panel-handle" type="button" title="ドラッグして移動" aria-label="グループ設定を移動">⋮⋮</button>
                <div class="route-editor-group-list">${groupButtonsHtml}</div>
                <div class="route-editor-group-actions">
                    <button class="icon-btn route-editor-tool-btn route-editor-group-add-btn" id="btn-route-editor-group-split">＋</button>
                    <button class="icon-btn route-editor-tool-btn route-editor-group-toggle-btn ${visibleGroupIndices.length === groups.length && !state.routeEditor?.forceHideAllGroups ? 'active' : ''}" id="btn-route-editor-show-all" ${groups.length ? '' : 'disabled'}>全て表示</button>
                    <button class="icon-btn route-editor-tool-btn route-editor-group-toggle-btn ${state.routeEditor?.forceHideAllGroups ? 'active' : ''}" id="btn-route-editor-hide-all" ${groups.length ? '' : 'disabled'}>全て非表示</button>
                </div>
            </div>
            <div id="fretboard-container" class="route-editor-fretboard-host"></div>
            <div class="route-editor-save-row">
                <button type="button" class="btn-secondary route-editor-demo-btn" id="btn-route-editor-demo" ${draft.length ? '' : 'disabled'}>現在の順番でデモ</button>
                <button class="btn-primary route-editor-save-btn" id="btn-route-editor-save" ${draft.length ? '' : 'disabled'}>この順番で保存</button>
            </div>
            <div class="route-editor-expanded-spacer ${showAllGroupsExpanded ? 'route-editor-expanded-spacer--visible' : ''}" aria-hidden="true"></div>
        </div>
    `;

    document.getElementById('btn-route-editor-back').onclick = () => {
        state.course = 'stageSelect';
        saveState();
        renderApp();
    };
    document.getElementById('btn-route-editor-home').onclick = () => {
        state.course = null;
        saveState();
        renderApp();
    };
    document.getElementById('btn-route-editor-undo').onclick = () => {
        const historyItem = Array.isArray(state.routeEditor.history) ? state.routeEditor.history.pop() : null;
        if (!historyItem) return;
        restoreRouteEditorSnapshot(historyItem);
        saveState();
        renderApp();
    };
    document.getElementById('btn-route-editor-group-expand').onclick = () => {
        state.routeEditor.showAllGroupsExpanded = !state.routeEditor.showAllGroupsExpanded;
        saveState();
        renderApp();
    };
    document.getElementById('btn-route-editor-clear').onclick = () => {
        pushRouteEditorHistory(stage);
        state.routeEditor.draft = [];
        state.routeEditor.deleteMode = false;
        state.routeEditor.groupBreaks = [0];
        state.routeEditor.selectedGroupIndex = 0;
        state.routeEditor.visibleGroupIndices = [0];
        state.routeEditor.forceHideAllGroups = false;
        state.routeEditor.showAllGroupsExpanded = false;
        setRouteEditorSavedGroupBreaks(stage, [0]);
        saveState();
        renderApp();
    };
    document.getElementById('btn-route-editor-load-default').onclick = () => {
        pushRouteEditorHistory(stage);
        const { sequence } = buildDefaultCruiseStageSequence(stage);
        state.routeEditor.draft = sequence.map(cruiseRouteSlotFromTarget);
        state.routeEditor.deleteMode = false;
        state.routeEditor.groupBreaks = buildAutoRouteEditorGroupBreaks(state.routeEditor.draft);
        state.routeEditor.selectedGroupIndex = 0;
        state.routeEditor.visibleGroupIndices = buildRouteEditorGroupsFromBreaks(state.routeEditor.draft, state.routeEditor.groupBreaks).map((_, index) => index);
        state.routeEditor.forceHideAllGroups = false;
        state.routeEditor.showAllGroupsExpanded = false;
        setRouteEditorSavedGroupBreaks(stage, state.routeEditor.groupBreaks);
        saveState();
        renderApp();
    };
    document.getElementById('btn-route-editor-save').onclick = () => {
        pushRouteEditorHistory(stage);
        if (!state.settings.cruiseStageRoutes) state.settings.cruiseStageRoutes = {};
        if (!state.settings.cruiseStageRouteGroups) state.settings.cruiseStageRouteGroups = {};
        state.settings.cruiseStageRoutes[String(stage)] = state.routeEditor.draft
            .map(normalizeCruiseRouteSlot)
            .filter(Boolean);
        state.settings.cruiseStageRouteGroups[String(stage)] = state.routeEditor.groupBreaks.slice();
        state.course = 'stageSelect';
        saveState();
        renderApp();
    };

    document.getElementById('btn-route-editor-demo').onclick = () => {
        const { sequence, cruiseScope } = buildCruiseSequenceFromSlots(state.routeEditor.draft, true);
        if (!sequence.length) return;
        startCruisePlaybackFromSequence(sequence, cruiseScope, stage);
    };

    document.getElementById('btn-route-editor-group-split').onclick = () => {
        if (groups.length >= ROUTE_EDITOR_MAX_GROUPS) return;
        pushRouteEditorHistory(stage);
        const nextBreaks = state.routeEditor.groupBreaks.slice();
        const nextIndex = groups.length;
        const nextStart = Math.max(draft.length, groups.length);
        nextBreaks.push(nextStart);
        state.routeEditor.groupBreaks = normalizeRouteEditorGroupBreaks(nextBreaks, draft.length);
        state.routeEditor.forceHideAllGroups = false;
        state.routeEditor.visibleGroupIndices = [nextIndex];
        state.routeEditor.selectedGroupIndex = Math.min(nextIndex, state.routeEditor.groupBreaks.length - 1);
        state.routeEditor.showAllGroupsExpanded = false;
        setRouteEditorSavedGroupBreaks(stage, state.routeEditor.groupBreaks);
        saveState();
        renderApp();
    };

    document.getElementById('btn-route-editor-show-all').onclick = () => {
        if (!groups.length) return;
        state.routeEditor.forceHideAllGroups = false;
        state.routeEditor.visibleGroupIndices = groups.map((_, index) => index);
        state.routeEditor.selectedGroupIndex = Math.min(selectedGroupIndex, groups.length - 1);
        saveState();
        renderApp();
    };

    document.getElementById('btn-route-editor-hide-all').onclick = () => {
        if (!groups.length) return;
        state.routeEditor.forceHideAllGroups = true;
        state.routeEditor.visibleGroupIndices = [];
        state.routeEditor.selectedGroupIndex = Math.min(selectedGroupIndex, groups.length - 1);
        saveState();
        renderApp();
    };

    const groupPanelEl = app.querySelector('.route-editor-group-panel');
    const groupPanelHandleEl = document.getElementById('btn-route-editor-group-panel-handle');
    if (isLandscape && groupPanelEl && groupPanelHandleEl) {
        const dragState = {
            pointerId: null,
            startX: 0,
            startY: 0,
            startOffsetX: groupPanelOffset.x,
            startOffsetY: groupPanelOffset.y,
            startRect: null,
            dragging: false
        };
        const applyGroupPanelOffset = (x, y) => {
            const nextOffset = {
                x: Math.round(x),
                y: Math.round(y)
            };
            groupPanelEl.style.setProperty('--route-editor-group-panel-shift-x', `${nextOffset.x}px`);
            groupPanelEl.style.setProperty('--route-editor-group-panel-shift-y', `${nextOffset.y}px`);
            state.routeEditor.groupPanelOffset = nextOffset;
        };
        const finishDrag = () => {
            document.removeEventListener('pointermove', onPointerMove, true);
            document.removeEventListener('pointerup', onPointerUp, true);
            document.removeEventListener('pointercancel', onPointerCancel, true);
            groupPanelEl.classList.remove('route-editor-group-panel--dragging');
            groupPanelHandleEl.classList.remove('route-editor-group-panel-handle--dragging');
            if (dragState.dragging) {
                saveState();
            }
            dragState.pointerId = null;
            dragState.dragging = false;
        };
        const onPointerMove = e => {
            if (dragState.pointerId !== null && e.pointerId !== dragState.pointerId) return;
            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            if (!dragState.dragging) {
                if (Math.abs(dx) + Math.abs(dy) < 4) return;
                dragState.dragging = true;
                dragState.startRect = groupPanelEl.getBoundingClientRect();
                groupPanelEl.classList.add('route-editor-group-panel--dragging');
                groupPanelHandleEl.classList.add('route-editor-group-panel-handle--dragging');
            }
            const rect = dragState.startRect || groupPanelEl.getBoundingClientRect();
            const margin = 8;
            const minDx = margin - rect.left;
            const maxDx = window.innerWidth - margin - rect.right;
            const minDy = margin - rect.top;
            const maxDy = window.innerHeight - margin - rect.bottom;
            const nextX = clamp(dragState.startOffsetX + dx, dragState.startOffsetX + Math.min(minDx, maxDx), dragState.startOffsetX + Math.max(minDx, maxDx));
            const nextY = clamp(dragState.startOffsetY + dy, dragState.startOffsetY + Math.min(minDy, maxDy), dragState.startOffsetY + Math.max(minDy, maxDy));
            applyGroupPanelOffset(nextX, nextY);
        };
        const onPointerUp = e => {
            if (dragState.pointerId !== null && e.pointerId !== dragState.pointerId) return;
            finishDrag();
        };
        const onPointerCancel = e => {
            if (dragState.pointerId !== null && e.pointerId !== dragState.pointerId) return;
            finishDrag();
        };
        const onPointerDown = e => {
            if (e.button !== undefined && e.button !== 0) return;
            if (dragState.pointerId !== null) return;
            e.preventDefault();
            e.stopPropagation();
            dragState.pointerId = typeof e.pointerId === 'number' ? e.pointerId : null;
            dragState.startX = e.clientX;
            dragState.startY = e.clientY;
            dragState.startOffsetX = groupPanelOffset.x;
            dragState.startOffsetY = groupPanelOffset.y;
            dragState.startRect = groupPanelEl.getBoundingClientRect();
            document.addEventListener('pointermove', onPointerMove, true);
            document.addEventListener('pointerup', onPointerUp, true);
            document.addEventListener('pointercancel', onPointerCancel, true);
        };
        groupPanelHandleEl.addEventListener('pointerdown', onPointerDown, { passive: false });
        routeEditorGroupPanelDragHandlers.set('routeEditor-group-panel', {
            pointermove: onPointerMove,
            pointerup: onPointerUp,
            pointercancel: onPointerCancel
        });
    }

    document.querySelectorAll('.route-editor-group-btn').forEach(btn => {
        btn.onclick = () => {
            const index = parseInt(btn.getAttribute('data-group-index'), 10);
            if (!Number.isFinite(index)) return;
            const nextVisible = new Set(visibleGroupIndices);
            if (nextVisible.has(index)) {
                if (nextVisible.size === 1) return;
                nextVisible.delete(index);
            } else {
                nextVisible.add(index);
            }
            const normalizedVisible = Array.from(nextVisible).sort((a, b) => a - b);
            state.routeEditor.forceHideAllGroups = false;
            state.routeEditor.visibleGroupIndices = normalizedVisible;
            state.routeEditor.selectedGroupIndex = index;
            saveState();
            renderApp();
        };
    });

    renderFretboardHTML('fretboard-container', {
        mode: 'routeEditor',
        question: null,
        showAnswer: true,
        routeEditorDraft: draft,
        routeEditorVisibleGroups: visibleGroups,
        onRouteEditorMarkerClick: (routeIndex) => {
            if (!Number.isFinite(routeIndex)) return;
            if (routeIndex < 0 || routeIndex >= state.routeEditor.draft.length) return;
            pushRouteEditorHistory(stage);
            const clickedSlot = normalizeCruiseRouteSlot(state.routeEditor.draft[routeIndex]);
            let deleteIndex = routeIndex;
            if (clickedSlot && visibleGroupIndices.length >= 2) {
                const preferredIndex = findRouteEditorRouteIndexInGroup(
                    state.routeEditor.draft,
                    state.routeEditor.groupBreaks,
                    interactionGroupIndex,
                    clickedSlot.stringName,
                    clickedSlot.fret
                );
                if (preferredIndex >= 0) {
                    deleteIndex = preferredIndex;
                }
            }
            state.routeEditor.draft.splice(deleteIndex, 1);
            state.routeEditor.groupBreaks = adjustRouteEditorGroupBreaksForDelete(state.routeEditor.groupBreaks, deleteIndex, state.routeEditor.draft.length);
            setRouteEditorSavedGroupBreaks(stage, state.routeEditor.groupBreaks);
            saveState();
            renderApp();
        },
        onFretClick: (stringName, fret) => {
            const insertTargetGroupIndex = interactionGroupIndex;
            pushRouteEditorHistory(stage);
            const inserted = insertRouteEditorSlotIntoGroup(
                state.routeEditor.draft,
                state.routeEditor.groupBreaks,
                insertTargetGroupIndex,
                { stringName, fret }
            );
            state.routeEditor.draft = inserted.draft;
            state.routeEditor.groupBreaks = inserted.groupBreaks;
            setRouteEditorSavedGroupBreaks(stage, state.routeEditor.groupBreaks);
            saveState();
            playTone(6 - stringName, fret);
            renderApp();
        }
    });

    app.style.height = '100vh';
    app.style.overflowY = 'auto';
    app.style.overflowX = 'hidden';
    app.style.alignItems = 'stretch';
    app.style.gap = '0';
    app.style.paddingTop = 'max(4px, env(safe-area-inset-top))';
    app.style.paddingBottom = 'calc(var(--in-game-refresh-stack-height, 96px) + max(8px, env(safe-area-inset-bottom)))';
    app.style.paddingLeft = 'max(10px, env(safe-area-inset-left))';
    app.style.paddingRight = 'max(10px, env(safe-area-inset-right))';
}

function renderMemorize(app) {
    const q = state.memorize.currentQuestion;
    if (!q) {
        generateQuestion();
        renderApp();
        return;
    }

    const isCruise = state.memorize.playMode === 'cruise';

    let fbText = isCruise
        ? 'リズムに合わせてタップ！'
        : '指板をタップして回答してください';
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
    const repeatHintMode = 1;  // Official specification: fixed to mode 1 (1/2 display)
    const repeatHintTabsHtml = '';  // Tab UI removed - using official 1/2 display only

    const memorizeLand =
        typeof window !== 'undefined' && window.innerWidth > window.innerHeight;
    const memorizeRootClass = memorizeLand
        ? 'memorize-screen memorize-screen--landscape'
        : 'memorize-screen';
    const memorizeQuestionLabel = q ? getMemorizeQuestionLabel(q.noteIdx) : '';

    app.innerHTML = `
        <div class="${memorizeRootClass}" data-fretboard-view="${state.settings.fretboardView}">
            ${buildPageHeader({
                titleText: '',
                headerClass: 'page-header--memorize',
                leftHtml: `
                    ${navButtonHtml({ id: 'btn-back', text: '← 戻る', extraClass: 'page-nav-btn--back' })}
                    ${navButtonHtml({ id: 'btn-home-memorize', text: '🏠 TOP', extraClass: 'page-nav-btn--home' })}
                `,
                rightHtml: `${quizTimerHtml}${navButtonHtml({ id: 'btn-memorize-settings', text: '⚙️ 設定', extraClass: 'page-nav-btn--settings' })}`
            })}
            <div class="memorize-body-stack">
                <div class="memorize-copy-block">
                    <div class="memorize-question-row">
                        ${stageStatsHtml}
                        <div class="question-text memorize-question memorize-question-main">${q.stringName}弦 の <span class="memorize-question-note" style="color: var(--primary-color);">${memorizeQuestionLabel}</span> ${isCruise ? 'をタップ！' : 'を探せ！'}</div>
                    </div>
                    <div id="feedback" class="${fbClass} memorize-feedback">${fbText}</div>
                    ${repeatHintTabsHtml}
                </div>
                <div id="fretboard-container" class="memorize-fretboard-host"></div>
                ${isCruise ? `
                    <div class="memorize-cruise-controls">
                        <button type="button" class="btn-secondary memorize-cruise-control-btn" id="btn-cruise-prev">⬅️</button>
                        <button type="button" class="btn-secondary memorize-cruise-control-btn" id="btn-cruise-reset">⏮️</button>
                        <button type="button" class="btn-secondary memorize-cruise-control-btn" id="btn-cruise-stop">
                            ${state.memorize.isCleared
                                ? 'もう1度やる'
                                : (state.memorize.isCruisePlaying ? '⏸️' : '▶️')}
                        </button>
                        <button type="button" class="btn-secondary memorize-cruise-control-btn" id="btn-cruise-next">
                            ${state.memorize.isCleared ? '次のステージ' : '➡️'}
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    document.getElementById('btn-back').onclick = () => {
        stopRhythm();
        stopQuizTimer();
        clearStage1RepeatHintState();
        if (state.memorize.isDemoPlayback && state.memorize.demoReturnCourse === 'routeEditor') {
            state.course = 'routeEditor';
            if (Number.isFinite(parseInt(state.memorize.demoReturnStage, 10))) {
                state.routeEditor.stage = clamp(parseInt(state.memorize.demoReturnStage, 10), 1, 6);
            }
            state.memorize.isDemoPlayback = false;
            state.memorize.demoReturnCourse = null;
            state.memorize.demoReturnStage = null;
        } else {
            state.course = 'stageSelect';
        }
        saveState();
        renderApp();
    };

    document.getElementById('btn-home-memorize').onclick = () => {
        stopRhythm();
        stopQuizTimer();
        clearStage1RepeatHintState();
        state.course = null;
        saveState();
        renderApp();
    };

    if (isCruise) {
        document.getElementById('btn-cruise-prev').onclick = () => {
            if (state.memorize.cruiseIndex > 0) {
                clearStage1RepeatHintState();
                state.memorize.cruiseIndex--;
                state.memorize.currentQuestion = state.memorize.cruiseTargets[state.memorize.cruiseIndex];
                state.memorize.hasTappedCurrentNote = false;
                saveState();
                renderApp();
            }
        };

        document.getElementById('btn-cruise-stop').onclick = () => {
            if (state.memorize.isCleared) {
                // Restart course: reset state and play
                clearStage1RepeatHintState();
                state.memorize.isCleared = false;
                state.memorize.cruiseIndex = 0;
                state.memorize.correct = 0;
                state.memorize.combo = 0;
                state.memorize.currentQuestion = state.memorize.cruiseTargets[0];
                state.memorize.hasTappedCurrentNote = false;
                state.memorize.isFirstNote = true;
                state.memorize.isCruisePlaying = true;
                startRhythm();
            } else {
                // Toggle play/stop
                state.memorize.isCruisePlaying = !state.memorize.isCruisePlaying;
                if (!state.memorize.isCruisePlaying) {
                    stopRhythm();
                } else {
                    startRhythm();
                }
            }
            saveState();
            renderApp();
        };

        document.getElementById('btn-cruise-next').onclick = () => {
            if (state.memorize.isCleared) {
                // Go back to stage select
                stopRhythm();
                stopQuizTimer();
                state.course = 'stageSelect';
            } else {
                // Advance to next note
                if (state.memorize.cruiseIndex < state.memorize.cruiseTargets.length - 1) {
                    clearStage1RepeatHintState();
                    state.memorize.cruiseIndex++;
                    state.memorize.currentQuestion = state.memorize.cruiseTargets[state.memorize.cruiseIndex];
                    state.memorize.hasTappedCurrentNote = false;
                }
            }
            saveState();
            renderApp();
        };

        document.getElementById('btn-cruise-reset').onclick = () => {
            // Reset to the beginning of the course
            clearStage1RepeatHintState();
            state.memorize.isCleared = false;
            state.memorize.cruiseIndex = 0;
            state.memorize.cruiseCurrentLoop = 0;
            state.memorize.correct = 0;
            state.memorize.combo = 0;
            state.memorize.currentQuestion = state.memorize.cruiseTargets[0];
            state.memorize.hasTappedCurrentNote = false;
            state.memorize.isFirstNote = true;
            state.memorize.isCruisePlaying = true;
            startRhythm();
            saveState();
            renderApp();
        };
    }

    document.getElementById('btn-memorize-settings').onclick = () => {
        stopRhythm();
        stopQuizTimer();
        clearStage1RepeatHintState();
        state.memorize.isCruisePlaying = false;
        openSettings();
    };

    // Highlight mode selection buttons
    document.querySelectorAll('.highlight-mode-btn').forEach(btn => {
        btn.onclick = () => {
            const mode = parseInt(btn.getAttribute('data-mode'));
            state.memorize.highlightMode = mode;
            saveState();
            renderApp();
        };
    });

    const fretboardOptions = {
        mode: 'memorize',
        question: q,
        showAnswer: isCruise,
        clicked: null,
        onFretClick: handleFretClick,
        highlightMode: isCruise ? state.memorize.highlightMode : null,
        nextQuestion: isCruise && state.memorize.cruiseIndex < state.memorize.cruiseTargets.length - 1
            ? state.memorize.cruiseTargets[state.memorize.cruiseIndex + 1]
            : null
    };

    // STAGE2縦画面：開放弦～6フレット固定、スクロールなし
    const isPortrait = window.innerWidth <= window.innerHeight;
    if (isCruise && state.memorize.stage === 2 && isPortrait) {
        fretboardOptions.ruleTapLayoutZoomFitFloatRange = [0, 6];
        fretboardOptions.ruleTapLayoutLockScroll = true;
        fretboardOptions.ruleTapZoomScrollAnchorFret = -1.5;
        autoScrollRequested = false;
    }

    renderFretboardHTML('fretboard-container', fretboardOptions);

    // Apply highlight overlay for cruise mode on STAGE1
    if (isCruise && state.memorize.stage === 1 && state.memorize.highlightMode) {
        let nextQ = null;
        if (state.memorize.cruiseIndex < state.memorize.cruiseTargets.length - 1) {
            // Normal case: next note is within current loop
            nextQ = state.memorize.cruiseTargets[state.memorize.cruiseIndex + 1];
        } else {
            // Loop boundary: at the last note, check if next loop exists
            const maxLoops = state.settings.cruiseLoopCount; // 0 = 無制限
            const currentLoop = state.memorize.cruiseCurrentLoop;
            if (maxLoops === 0 || currentLoop + 1 < maxLoops) {
                // Next loop exists, so nextQ is the first note of next loop
                nextQ = state.memorize.cruiseTargets[0];
            }
        }

        // Determine loop position marker
        let loopPositionMarker = null;
        if (state.memorize.cruiseIndex === 0) {
            loopPositionMarker = 'start';  // スタート!
        } else if (state.memorize.cruiseIndex === state.memorize.cruiseTargets.length - 1) {
            loopPositionMarker = 'last';   // ラスト!
        }

        requestAnimationFrame(() => {
            renderHighlightOverlay(q, nextQ, state.memorize.highlightMode, repeatHintMode, state.memorize.stage1IsContinuedRepeat, loopPositionMarker);
        });
    }

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

    // Flash the target note cell based on timing result
    flashCell(type);
}

function flashCell(type) {
    const q = state.memorize.currentQuestion;
    if (!q) return;
    const container = document.getElementById('fretboard-container');
    if (!container) return;

    const cell = container.querySelector(`[data-string="${q.stringName}"][data-fret="${q.fret}"]`);
    if (!cell) return;

    const flash = document.createElement('div');
    flash.style.position = 'absolute';
    flash.style.inset = '0';
    flash.style.borderRadius = '8px';
    flash.style.pointerEvents = 'none';
    flash.style.zIndex = '10';

    if (type === 'good') {
        flash.style.backgroundColor = 'rgba(0, 150, 255, 0.5)';
        flash.style.boxShadow = '0 0 20px rgba(0, 150, 255, 0.8)';
    } else if (type === 'miss') {
        flash.style.backgroundColor = 'rgba(255, 80, 80, 0.5)';
        flash.style.boxShadow = '0 0 20px rgba(255, 80, 80, 0.8)';
    }

    cell.appendChild(flash);
    setTimeout(() => flash.remove(), 300);
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
    if (typeof state.visualize.showExtendedFrets === 'undefined') state.visualize.showExtendedFrets = false;

    const chords = getDiatonicChordsForKey(state.visualize.key, state.visualize.scale, state.visualize.chordType === '7');
    const chordButtonsHtml = chords.map((chord, idx) => {
        const isSelected = state.visualize.selectedChordIndex === idx;
        const isDisabled = !state.visualize.autoSelectRootChord;
        return `<button class="chord-btn ${isSelected ? 'active' : ''} ${isDisabled ? 'disabled' : ''}" data-chord-index="${idx}">${chord.label}</button>`;
    }).join('');

    app.innerHTML = `
        ${buildPageHeader({
            titleText: '🧭 指板を探索する',
            leftHtml: `
                ${navButtonHtml({ id: 'btn-back', text: '← 戻る', extraClass: 'page-nav-btn--back' })}
            `,
            rightHtml: `<button class="icon-btn home-settings-btn" id="btn-settings-visualize" aria-label="設定">⚙️</button>`
        })}

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
            <div class="setup-item setup-item--wide">
                <button type="button" id="vis-extended-frets" class="extended-frets-btn ${state.visualize.showExtendedFrets ? 'active' : ''}" aria-pressed="${state.visualize.showExtendedFrets ? 'true' : 'false'}">
                    13フレット以降を表示
                </button>
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

    document.getElementById('vis-extended-frets').onclick = () => {
        state.visualize.showExtendedFrets = !state.visualize.showExtendedFrets;
        currentScrollLeft = 0;
        saveState();
        renderApp();
    };

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
        <div class="settings-screen">
        ${buildPageHeader({
            titleText: '設定',
            titleClass: 'settings-screen-title',
            leftHtml: `
                ${navButtonHtml({ id: 'btn-back-settings', text: '← 戻る', extraClass: 'page-nav-btn--back' })}
                ${navButtonHtml({ id: 'btn-home-settings', text: '🏠 TOP', extraClass: 'page-nav-btn--home' })}
            `
        })}

        <div class="settings-page-stack settings-page-stack--proposed">
        <div class="settings-card">
            <div class="settings-card-header">
                <div class="settings-card-title-wrap">
                    <h3 class="settings-card-title">テンポ</h3>
                    <span class="settings-card-subtitle">テンポをたどるモード</span>
                </div>
                <button class="settings-card-reset-btn" type="button" data-reset-card="tempo">リセット</button>
            </div>
            <div class="settings-value-row">
                <span>遅い</span>
                <span class="settings-value-badge" id="tempo-display">BPM ${state.settings.tempo}</span>
                <span>速い</span>
            </div>
            <input type="range" id="tempo-slider" min="40" max="200" value="${state.settings.tempo}" class="settings-range">
        </div>

        <div class="settings-card">
            <div class="settings-card-header">
                <div class="settings-card-title-wrap">
                    <h3 class="settings-card-title">ループ回数</h3>
                    <span class="settings-card-subtitle">テンポをたどるモード</span>
                </div>
                <button class="settings-card-reset-btn" type="button" data-reset-card="cruise-loop">リセット</button>
            </div>
            <div class="mode-buttons settings-loop-count-buttons">
                <button class="mode-btn ${state.settings.cruiseLoopCount === 1 ? 'active' : ''}" data-loop-count="1">1周</button>
                <button class="mode-btn ${state.settings.cruiseLoopCount === 2 ? 'active' : ''}" data-loop-count="2">2周</button>
                <button class="mode-btn ${state.settings.cruiseLoopCount === 3 ? 'active' : ''}" data-loop-count="3">3周</button>
                <button class="mode-btn ${state.settings.cruiseLoopCount === 0 ? 'active' : ''}" data-loop-count="0">無限</button>
            </div>
        </div>

        <div class="settings-card">
            <div class="settings-card-header">
                <div class="settings-card-title-wrap">
                    <h3 class="settings-card-title">制限時間</h3>
                    <span class="settings-card-subtitle">指板クイズモード</span>
                </div>
                <button class="settings-card-reset-btn" type="button" data-reset-card="timer">リセット</button>
            </div>
            <div class="settings-value-row">
                <span>短い</span>
                <span class="settings-value-badge" id="timer-display">${state.settings.quizTimeLimit} 秒</span>
                <span>長い</span>
            </div>
            <input type="range" id="timer-slider" min="1" max="10" step="1" value="${state.settings.quizTimeLimit}" class="settings-range">
        </div>

        <div class="settings-card">
            <div class="settings-card-header">
                <div class="settings-card-title-wrap">
                    <h3 class="settings-card-title">表記</h3>
                    <span class="settings-card-subtitle">共通</span>
                </div>
            </div>
            <div class="mode-buttons settings-notation-buttons">
                <button class="mode-btn ${state.settings.noteLabelMode === 'solfege' ? 'active' : ''}" data-notation-mode="solfege">ドレミ</button>
                <button class="mode-btn ${state.settings.noteLabelMode === 'note' ? 'active' : ''}" data-notation-mode="note">CDE</button>
            </div>
            <p class="settings-note settings-note--animated visible" style="margin-top:10px;">覚えるコースの指板に反映されます。</p>
        </div>

        <div class="settings-card">
            <div class="settings-card-header">
                <h3 class="settings-card-title">指板の視点</h3>
                <button class="settings-card-reset-btn" type="button" data-reset-card="view">リセット</button>
            </div>

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
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <label for="fretboard-orientation-auto" class="settings-label" style="cursor:pointer;">画面の向きで自動切替</label>
                        <button class="settings-help-btn" type="button" data-target="note-orientation" aria-label="説明を表示">⊕</button>
                    </div>
                    <input type="checkbox" id="fretboard-orientation-auto" class="settings-checkbox-native" ${state.settings.fretboardViewAutoOrientation ? 'checked' : ''}>
                </div>
                <p class="settings-note settings-note--animated" id="note-orientation">オンにすると、横持ちでは全体ビュー、縦持ちでは拡大ビューになります。オフのときは下のボタンで選べます。</p>
                <div class="settings-view-buttons">
                    <button class="settings-view-btn ${state.settings.fretboardView === 'full' ? 'active' : ''}" data-view="full" ${state.settings.fretboardViewAutoOrientation ? 'disabled' : ''}>全体ビュー</button>
                    <button class="settings-view-btn ${state.settings.fretboardView === 'zoom' ? 'active' : ''}" data-view="zoom" ${state.settings.fretboardViewAutoOrientation ? 'disabled' : ''}>拡大ビュー</button>
                </div>

                <div class="settings-row-between" style="margin-bottom:8px;">
                    <span class="settings-label">カメラの向き（ドラッグで操作）</span>
                </div>

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
            </div>
        </div>
        <div class="settings-actions-footer settings-actions-footer--proposed">
            <button class="settings-bottom-btn settings-apply-btn" id="btn-settings-apply">決定</button>
            <div class="settings-secondary-actions">
                <button class="btn-secondary settings-bottom-btn" id="btn-settings-cancel">キャンセル</button>
                <button class="btn-secondary settings-bottom-btn settings-danger-btn" id="btn-settings-defaults">全てリセット</button>
            </div>
        </div>
        </div>
	    `;

    // Attach help button listeners
    const helpButtons = document.querySelectorAll('.settings-help-btn');
    helpButtons.forEach(button => {
        button.onclick = () => {
            const targetId = button.getAttribute('data-target');
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.classList.toggle('visible');
            }
        };
    });

    const cardResetButtons = document.querySelectorAll('.settings-card-reset-btn');
    cardResetButtons.forEach(button => {
        button.onclick = () => {
            const resetCard = button.getAttribute('data-reset-card');
            if (resetCard === 'tempo') {
                state.settings.tempo = DEFAULT_TEMPO;
                refreshSettingsControls();
                return;
            }
            if (resetCard === 'timer') {
                state.settings.quizTimeLimit = DEFAULT_QUIZ_TIME_LIMIT;
                refreshSettingsControls();
                return;
            }
            if (resetCard === 'view') {
                state.settings.fretboardViewAutoOrientation = DEFAULT_FRETBOARD_VIEW_AUTO_ORIENTATION;
                state.settings.fretboardView = DEFAULT_FRETBOARD_VIEW;
                state.settings.viewMode = 'front';
                state.settings.rotation = { ...DEFAULT_ROTATION };
                state.settings.perspective = DEFAULT_VERTICAL_PERSPECTIVE;
                state.settings.perspOriginX = DEFAULT_HORIZONTAL_PERSPECTIVE;
                state.settings.stringSpacing = DEFAULT_STRING_SPACING;
                applyFretboardViewFromOrientationIfAuto();
                refreshSettingsControls();
            }
            if (resetCard === 'cruise-loop') {
                state.settings.cruiseLoopCount = DEFAULT_CRUISE_LOOP_COUNT;
                syncLoopCountSettingsUI();
                return;
            }
        };
    });

    const closeSettings = (shouldSave, targetCourse = settingsReturnCourse) => {
        if (!shouldSave) {
            state.settings = cloneSettings(settingsSnapshot);
        }
        state.course = targetCourse;
        // 設定画面から戻ってきた場合、一時停止状態（isCruisePlaying = false）を保持
        settingsReturnCourse = null;
        saveState();
        renderApp();
    };

    document.getElementById('btn-home-settings').onclick = () => closeSettings(true, null);
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

    document.querySelectorAll('.settings-notation-buttons .mode-btn').forEach(btn => {
        btn.onclick = () => {
            state.settings.noteLabelMode = btn.getAttribute('data-notation-mode');
            syncNotationSettingsUI();
            saveState();
            renderApp();
        };
    });

    document.querySelectorAll('.settings-loop-count-buttons .mode-btn').forEach(btn => {
        btn.onclick = () => {
            state.settings.cruiseLoopCount = parseInt(btn.getAttribute('data-loop-count'));
            syncLoopCountSettingsUI();
            saveState();
        };
    });

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

    function syncNotationSettingsUI() {
        document.querySelectorAll('.settings-notation-buttons .mode-btn').forEach(b => {
            const mode = b.getAttribute('data-notation-mode');
            b.classList.toggle('active', mode === state.settings.noteLabelMode);
        });
    }

    function syncLoopCountSettingsUI() {
        document.querySelectorAll('.settings-loop-count-buttons .mode-btn').forEach(b => {
            const count = parseInt(b.getAttribute('data-loop-count'));
            b.classList.toggle('active', count === state.settings.cruiseLoopCount);
        });
    }

    function refreshSettingsControls() {
        tempoSlider.value = state.settings.tempo;
        tempoDisplay.textContent = `BPM ${state.settings.tempo}`;
        timerSlider.value = state.settings.quizTimeLimit;
        timerDisplay.textContent = `${state.settings.quizTimeLimit} 秒`;
        syncNotationSettingsUI();
        syncLoopCountSettingsUI();
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
            const projectedBounds = getProjectedFretboardBounds(
                getNeckYBounds().top,
                getNeckYBounds().bottom,
                DEFAULT_VISIBLE_MAX_FRET
            );
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
    app.style.gap = '0';
    app.style.alignItems = 'stretch';
    app.style.paddingBottom = 'calc(var(--in-game-refresh-stack-height, 96px) + max(8px, env(safe-area-inset-bottom)))';
}

function getHighestFretFromPositions(positions) {
    if (!Array.isArray(positions)) return 0;
    return positions.reduce((max, item) => {
        if (!item) return max;
        let fret = typeof item.fret === 'number' ? item.fret : 0;
        if (Array.isArray(item.acceptedPositions)) {
            fret = Math.max(fret, getHighestFretFromPositions(item.acceptedPositions));
        }
        return Math.max(max, fret);
    }, 0);
}

function getRenderMaxFret(mode, options) {
    if (mode === 'visualize') {
        return state.visualize.showExtendedFrets ? EXTENDED_VISIBLE_MAX_FRET : DEFAULT_VISIBLE_MAX_FRET;
    }

    let maxFret = DEFAULT_VISIBLE_MAX_FRET;

    if (mode === 'rule') {
        maxFret = Math.max(maxFret, getHighestFretFromPositions(options.ruleMarkers));
        if (Array.isArray(options.ruleStep3TapFitFretRange)) {
            maxFret = Math.max(maxFret, options.ruleStep3TapFitFretRange[1] || 0);
        }
        if (Array.isArray(options.ruleTapLayoutZoomFitFloatRange)) {
            maxFret = Math.max(maxFret, Math.ceil(options.ruleTapLayoutZoomFitFloatRange[1] || 0));
        }
    } else if (mode === 'memorize') {
        maxFret = Math.max(
            maxFret,
            options.question && typeof options.question.fret === 'number' ? options.question.fret : 0,
            getHighestFretFromPositions(state.memorize.cruiseTargets),
            getHighestFretFromPositions(state.memorize.cruiseScope)
        );
    } else if (mode === 'routeEditor') {
        maxFret = Math.max(
            maxFret,
            getHighestFretFromPositions(options.routeEditorDraft)
        );
    }

    return clamp(Math.floor(maxFret), DEFAULT_VISIBLE_MAX_FRET, MAX_FRET);
}

function renderFretboardHTML(containerId, options) {
    const {
        mode, question, showAnswer, clicked, onFretClick,
        highlightMode = null, nextQuestion = null,
        keyIndex, capo, displayMode, scale, selectedChordIndex,
        doMode: doModeOpt, chordType, autoSelectRootChord,         ruleMarkers,
        rulePitchToneByAccidental = false,
        ruleTapCueBesideNote = false,
        /** true のとき音名マーカーはそのまま、吹き出しだけ上に絶対配置 */
        ruleTapCueBubbleAboveNote = false,
        ruleStep2DegreeColors = false,
        /**
         * STEP3 などルール指板：false でオフ。[最小F, 最大F] の範囲幅に合わせてスケールする（両端含む）。
         * ペアタップでは render 側で [0, 5] などを渡す。
         */
        ruleStep3TapFitFretRange = false,
        /** true のときだけ黄線 SVG の追従を開始（ペアタップ専用） */
        ruleStep3PairTapLine = false,
        /** ルール指板：true のとき拡大ビューで横スクロールを出さず画角を固定 */
        ruleTapLayoutLockScroll = false,
        /** [fretLo, fretHi] 小数可。横幅フィットに使う（開放側・高F側を半分見切る等） */
        ruleTapLayoutZoomFitFloatRange = null,
        /** 1 より大きいと横幅の許容量を広げ、同じ画角でもさらに拡大 */
        ruleTapLayoutZoomExtra = 1,
        /** 指定時はルール指板ズームの初期横スクロールをこのフレット列基準にする（STEP4 共通ズーム用） */
        ruleTapZoomScrollAnchorFret = null,
        /** true のとき拡大ビューの次ターゲットへの横スクロールをゆっくり動かす */
        ruleSlowAutoScrollToNext = false,
        /** STEP5 実践：「いま光っているマス」の音名横にチェック（チェックで光らせない） */
        ruleStep5ExcludeInlineCheckboxes = false,
        /** STEP5：スタート地点はチェックで除外しない（その弦フレット） */
        ruleStep5AnchorDisableSlot = null,
        /** STEP5：このスライド用の除外マップ（null 時は step5ExcludedSlots のみ参照） */
        ruleStep5ExcludedSlotsLookup = null,
        routeEditorDraft = [],
        routeEditorVisibleIndices = null,
        routeEditorVisibleGroups = null,
        onRouteEditorMarkerClick = null
    } = options;
    let step3TapRange = null;
    if (
        ruleStep3TapFitFretRange !== false &&
        Array.isArray(ruleStep3TapFitFretRange) &&
        ruleStep3TapFitFretRange.length === 2
    ) {
        let lo = clamp(Math.floor(ruleStep3TapFitFretRange[0]), 0, MAX_FRET);
        let hi = clamp(Math.floor(ruleStep3TapFitFretRange[1]), 0, MAX_FRET);
        if (lo > hi) {
            const t = lo;
            lo = hi;
            hi = t;
        }
        step3TapRange = [lo, hi];
    }
    let step3TapFloatRange = null;
    if (Array.isArray(ruleTapLayoutZoomFitFloatRange) && ruleTapLayoutZoomFitFloatRange.length === 2) {
        let lo = Number(ruleTapLayoutZoomFitFloatRange[0]);
        let hi = Number(ruleTapLayoutZoomFitFloatRange[1]);
        if (Number.isFinite(lo) && Number.isFinite(hi)) {
            if (lo > hi) {
                const t = lo;
                lo = hi;
                hi = t;
            }
            step3TapFloatRange = [lo, hi];
        }
    }
    const ruleTapZoomMul =
        typeof ruleTapLayoutZoomExtra === 'number' && ruleTapLayoutZoomExtra > 0
            ? ruleTapLayoutZoomExtra
            : 1;
    const renderMaxFret = getRenderMaxFret(mode, options);
    const routeEditorVisibleIndexSet = Array.isArray(routeEditorVisibleIndices)
        ? new Set(routeEditorVisibleIndices.map(index => parseInt(index, 10)).filter(Number.isFinite))
        : null;
    const routeEditorVisibleGroupList = Array.isArray(routeEditorVisibleGroups)
        ? routeEditorVisibleGroups.map(group => ({
            ...group,
            index: parseInt(group?.index, 10)
        })).filter(group => Number.isFinite(group.index))
        : null;
    const routeEditorGroupIndexBySlot = new Map();
    if (mode === 'routeEditor' && Array.isArray(routeEditorVisibleGroupList)) {
        routeEditorVisibleGroupList.forEach(group => {
            const start = parseInt(group.start, 10);
            const end = parseInt(group.end, 10);
            if (!Number.isFinite(start) || !Number.isFinite(end)) return;
            if (end < start) return;
            const normalizedStart = Math.max(0, start);
            const normalizedEnd = Math.max(normalizedStart, end);
            for (let i = normalizedStart; i <= normalizedEnd; i++) {
                routeEditorGroupIndexBySlot.set(i, group.index);
            }
        });
    }
    const routeEditorOrderMap = new Map();
    if (mode === 'routeEditor' && Array.isArray(routeEditorDraft)) {
        const groupOrderMap = new Map();
        routeEditorDraft.map(normalizeCruiseRouteSlot).filter(Boolean).forEach((slot, index) => {
            if (routeEditorVisibleGroupList && !routeEditorGroupIndexBySlot.has(index)) return;
            if (routeEditorVisibleIndexSet && !routeEditorVisibleIndexSet.has(index)) return;
            const key = `${slot.stringName}-${slot.fret}`;
            const groupIndex = routeEditorVisibleGroupList && routeEditorGroupIndexBySlot.has(index)
                ? routeEditorGroupIndexBySlot.get(index)
                : 0;
            const groupOrder = (groupOrderMap.get(groupIndex) || 0) + 1;
            groupOrderMap.set(groupIndex, groupOrder);
            const orders = routeEditorOrderMap.get(key) || [];
            orders.push({
                index,
                order: groupOrder,
                groupIndex
            });
            routeEditorOrderMap.set(key, orders);
        });
    }
    const isRuleMode = mode === 'rule';
    const ruleViewSnapshot = isRuleMode ? {
        rotation: { ...(state.settings.rotation || DEFAULT_ROTATION) },
        perspective: state.settings.perspective,
        perspOriginX: state.settings.perspOriginX,
        stringSpacing: state.settings.stringSpacing
    } : null;
    if (isRuleMode) {
        state.settings.rotation = { ...DEFAULT_ROTATION };
        state.settings.perspective = DEFAULT_VERTICAL_PERSPECTIVE;
        state.settings.perspOriginX = DEFAULT_HORIZONTAL_PERSPECTIVE;
        state.settings.stringSpacing = DEFAULT_STRING_SPACING;
    }
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
    const ruleMarkerMap = new Map((ruleMarkers || []).map(marker => [`${marker.stringNum}-${marker.fret}`, marker]));
    
    const neckBounds = getNeckYBounds();
    const neckTop = neckBounds.top;
    const neckBottom = neckBounds.bottom;

    const scrollWrapperClass =
        mode === 'visualize' || mode === 'rule' || mode === 'routeEditor'
            ? 'fretboard-scroll-wrapper fretboard-scroll-wrapper--visualize'
            : 'fretboard-scroll-wrapper';
    const scrollGroupAttr =
        (containerId === 'fretboard-container' || (mode === 'rule' && containerId === 'rule-fretboard-container'))
            ? ` data-scroll-group="${mode}"`
            : '';
    const zoomAnchorAttr =
        (mode === 'memorize' && containerId === 'fretboard-container' && ruleTapZoomScrollAnchorFret !== null)
            ? ` data-zoom-scroll-anchor-fret="${ruleTapZoomScrollAnchorFret}"`
            : '';
    let html = `<div class="${scrollWrapperClass}"${scrollGroupAttr}${zoomAnchorAttr}>`;
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
        const depthEdges = xEdges.slice(1, renderMaxFret + 2);
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

    const boardEdges = xEdges.slice(1, renderMaxFret + 2);
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
    ].filter(dot => dot.fret <= renderMaxFret);
    dotPoints.forEach(dot => {
        const x = (xEdges[dot.fret] + xEdges[dot.fret + 1]) / 2;
        const p = projectPoint(x, dot.y, FRET_DOT_Z);
        html += `<circle class="projected-fret-dot" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${(8 * p.scale).toFixed(2)}"></circle>`;
    });

    stringOrder.forEach((stringNum, rowIndex) => {
        const originalY = getStringOriginalY(rowIndex);
        const stringClass = hasHighlight && stringNum !== question.stringName ? 'projected-string dimmed' : (hasHighlight ? 'projected-string highlighted' : 'projected-string');
        for (let i = 0; i <= renderMaxFret; i++) {
            const p1 = projectPoint(xEdges[i], originalY, STRING_Z);
            const p2 = projectPoint(xEdges[i + 1], originalY, STRING_Z);
            const strokeWidth = getStringThickness(stringNum) * ((p1.scale + p2.scale) / 2);
            html += `<path class="${stringClass}" data-string="${stringNum}" d="${buildSvgPath([p1, p2])}" stroke-width="${strokeWidth.toFixed(2)}"></path>`;
        }
    });

    xEdges.slice(0, renderMaxFret + 2).forEach((x, index) => {
        if (index === 0) return; // remove fret wire left of open strings
        const topPoint = projectPoint(x, neckTop, FRETBOARD_SURFACE_Z);
        const bottomPoint = projectPoint(x, neckBottom, FRETBOARD_SURFACE_Z);
        const wireWidth = index === 1 ? 8 : 4;
        const gradId = index === 1 ? nutGradientId : fretGradientId;
        const wireClass = index === 1 ? 'projected-fret-wire nut' : 'projected-fret-wire';
        html += `<line class="${wireClass}" x1="${topPoint.x.toFixed(2)}" y1="${topPoint.y.toFixed(2)}" x2="${bottomPoint.x.toFixed(2)}" y2="${bottomPoint.y.toFixed(2)}" stroke="url(#${gradId})" stroke-width="${wireWidth}"></line>`;
    });

    for (let f = 0; f <= renderMaxFret; f++) {
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

        for (let f = 0; f <= renderMaxFret; f++) {
            let noteIdx = (OPEN_STRINGS[stringIdx] + f) % 12;
            let markerHtml = '';
            
            // Interaction logic: route editor and memorize mode need direct fret taps.
            let isInteractive = (mode === 'memorize' || mode === 'routeEditor');
            if (mode === 'memorize' && showAnswer && state.memorize.playMode === 'quiz') {
                isInteractive = false; // Disable clicking after answering in quiz mode
            }
            
            let fretClass = isInteractive ? 'fret-column interactive' : 'fret-column';
            
            if (mode === 'routeEditor') {
                const orders = (routeEditorOrderMap.get(`${stringNum}-${f}`) || []).slice().sort((a, b) => {
                    if (a.groupIndex !== b.groupIndex) return b.groupIndex - a.groupIndex;
                    return b.index - a.index;
                });
                const guideLabel = ROUTE_EDITOR_SCALE_GUIDE_LABELS[noteIdx] || '';
                const guideHtml = guideLabel
                    ? `<button type="button" class="note-marker route-editor-scale-guide" aria-hidden="true" tabindex="-1" disabled>${guideLabel}</button>`
                    : '';
                if (orders.length) {
                    let orderHtml = '';
                    if (orders.length >= 3) {
                        const visibleOrders = orders.slice(0, 3);
                        const denseOffsets = [
                            { x: -5, y: 0 },
                            { x: 0, y: 0 },
                            { x: 5, y: 0 }
                        ];
                        orderHtml = visibleOrders
                            .map(({ index: routeIndex, groupIndex }, stackIndex) => {
                                const groupStyle = getRouteEditorGroupColorStyle(groupIndex);
                                const offset = denseOffsets[stackIndex] || denseOffsets[denseOffsets.length - 1];
                                const denseZIndex = visibleOrders.length - stackIndex;
                                return `
                                <button type="button" class="note-marker route-edit-note route-edit-note-button route-edit-note--stacked route-edit-note--dense" data-route-index="${routeIndex}" aria-label="Gr.${groupIndex + 1} ${stringNum}弦 ${f}フレット" style="${groupStyle}; --route-edit-stack-x: ${offset.x}px; --route-edit-stack-y: ${offset.y}px; z-index:${denseZIndex};"></button>
                            `;
                            })
                            .join('');
                    } else {
                        const stackedClass = orders.length > 1 ? ' route-edit-note--stacked' : '';
                        orderHtml = orders
                            .map(({ index: routeIndex, order, groupIndex }) => {
                                const groupStyle = getRouteEditorGroupColorStyle(groupIndex);
                                return `
                                <button type="button" class="note-marker route-edit-note route-edit-note-button${stackedClass}" data-route-index="${routeIndex}" aria-label="Gr.${groupIndex + 1} ${order}番目 ${stringNum}弦 ${f}フレット" style="${groupStyle}">
                                    <span class="route-edit-note-order">${order}</span>
                                </button>
                            `; })
                            .join('');
                    }
                    const stackModeClass = orders.length >= 3 ? ' route-edit-note-stack--dense' : '';
                    markerHtml = `${guideHtml}<div class="route-edit-note-stack${stackModeClass}" data-string="${stringNum}" data-fret="${f}">${orderHtml}</div>`;
                } else {
                    markerHtml = `${guideHtml}<div class="note-marker hidden-note"></div>`;
                }
            } else if (mode === 'memorize') {
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
                        markerHtml = `<div class="note-marker target-note correct-note">${getNotationLabel(noteIdx)}</div>`;
                    } else if (isNextCruise) {
                        markerHtml = `<div class="note-marker target-note next-note">${getNotationLabel(noteIdx)}</div>`;
                    } else if (isScope) {
                        markerHtml = `<div class="note-marker target-note grey-note">${getNotationLabel(noteIdx)}</div>`;
                    } else {
                        markerHtml = `<div class="note-marker hidden-note"></div>`;
                    }
                } else {
                    // Quiz mode
                    if (showAnswer) {
                        if (isTargetQuiz && isClicked) {
                            markerHtml = `<div class="note-marker target-note correct-note">${getNotationLabel(noteIdx)}</div>`;
                        } else if (isTargetQuiz) {
                            markerHtml = `<div class="note-marker target-note correct-note">${getNotationLabel(noteIdx)}</div>`;
                        } else if (isClicked && !clicked.isCorrect) {
                            markerHtml = `<div class="note-marker target-note wrong-note">${getNotationLabel(noteIdx)}</div>`;
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
            } else if (mode === 'rule') {
                const ruleMarker = ruleMarkerMap.get(`${stringNum}-${f}`);
                if (ruleMarker) {
                    const markerAriaLabel = `${stringNum}弦 ${f}フレット ${ruleMarker.label}`;
                    const rc = ruleMarker.className || 'rule-scale';
                    const ruleNIdx = typeof ruleMarker.noteIdx === 'number'
                        ? ruleMarker.noteIdx
                        : (OPEN_STRINGS[6 - ruleMarker.stringNum] + f) % 12;
                    const hasRuleNext = rc.includes('rule-next');
                    let innerMarkerClass;
                    if (ruleStep2DegreeColors) {
                        const degCls = getRuleStep2CMajorDegreeClass(ruleNIdx);
                        innerMarkerClass = `${degCls}${hasRuleNext ? ' rule-next' : ''}`;
                    } else {
                        const isRulePalette = rc.includes('rule-root') || rc.includes('rule-half') || rc.includes('rule-scale');
                        const pitchToneClass = rulePitchToneByAccidental && isRulePalette
                            ? ([1, 3, 6, 8, 10].includes(ruleNIdx) ? 'rule-pitch-sharp' : 'rule-pitch-natural')
                            : '';
                        const pitchPart = pitchToneClass ? ` ${pitchToneClass}` : '';
                        innerMarkerClass = `${rc}${pitchPart}`;
                    }
                    const innerMarker = `<div class="note-marker ${innerMarkerClass}" aria-label="${markerAriaLabel}" title="${markerAriaLabel}">${ruleMarker.label}</div>`;
                    markerHtml = innerMarker;
                } else {
                    markerHtml = `<div class="note-marker hidden-note"></div>`;
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
            const markerFontSize = (mode === 'rule' ? 0.66 : 0.85) * markerScale;
            const markerStyle = `width:${markerSize.toFixed(2)}px; height:${markerSize.toFixed(2)}px; font-size:${markerFontSize.toFixed(2)}rem;`;
            markerHtml = markerHtml.replace('<div class="note-marker', `<div style="${markerStyle}" class="note-marker`);
            if (
                mode === 'rule' &&
                ruleStep5ExcludeInlineCheckboxes &&
                markerHtml.includes('rule-next')
            ) {
                const anchorDisable =
                    ruleStep5AnchorDisableSlot &&
                    stringNum === ruleStep5AnchorDisableSlot.stringNum &&
                    f === ruleStep5AnchorDisableSlot.fret;
                const ex =
                    ruleStep5ExcludedSlotsLookup && typeof ruleStep5ExcludedSlotsLookup === 'object'
                        ? ruleStep5ExcludedSlotsLookup
                        : state.rules.step5ExcludedSlots || {};
                const checked = anchorDisable ? false : !!ex[ruleStep5SlotKey(stringNum, f)];
                markerHtml = `<div class="rule-step5-marker-row">${markerHtml}<label class="rule-step5-inline-exclude"${
                    anchorDisable ? ' data-rule-step5-exclude-anchor="1"' : ''
                }><input type="checkbox" class="rule-step5-inline-exclude-cb" data-sn="${stringNum}" data-fr="${f}"${
                    anchorDisable ? ' disabled' : ''
                }${checked ? ' checked' : ''} aria-label="チェックでこのマスを練習から外す" title="チェックで練習から外す" /></label></div>`;
            }
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

    if (mode === 'rule' && ruleStep5ExcludeInlineCheckboxes && containerId === 'rule-fretboard-container') {
        containerEl.querySelectorAll('.rule-step5-inline-exclude').forEach(el => {
            el.addEventListener('click', e => e.stopPropagation());
            el.addEventListener('mousedown', e => e.stopPropagation());
        });
        containerEl.querySelectorAll('.rule-step5-inline-exclude-cb').forEach(cb => {
            cb.addEventListener('click', e => e.stopPropagation());
            cb.addEventListener('change', () => {
                if (cb.disabled) return;
                const sn = parseInt(cb.getAttribute('data-sn'), 10);
                const fr = parseInt(cb.getAttribute('data-fr'), 10);
                if (Number.isNaN(sn) || Number.isNaN(fr)) return;
                ruleStep5SetSlotExcluded(sn, fr, cb.checked);
            });
        });
    }

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
            const isRuleFretHost = mode === 'rule' && containerId === 'rule-fretboard-container';
            const ruleHostW = isRuleFretHost && containerEl.parentElement
                ? Math.floor(containerEl.parentElement.clientWidth)
                : 0;
            const layoutW = isRuleFretHost && ruleHostW > 0
                ? ruleHostW
                : (appEl && appEl.clientWidth > 0 ? appEl.clientWidth : screenW);
            const ruleTapCapZoomByFretWidth = (zMax, layoutPad, innerMin) => {
                let bW = 0;
                if (step3TapFloatRange !== null) {
                    bW = getProjectedFretboardBoundsForFretFloatRange(
                        neckTop,
                        neckBottom,
                        step3TapFloatRange[0],
                        step3TapFloatRange[1]
                    ).width;
                } else if (step3TapRange !== null) {
                    bW = getProjectedFretboardBoundsForFretRange(
                        neckTop,
                        neckBottom,
                        step3TapRange[0],
                        step3TapRange[1]
                    ).width;
                } else {
                    return Math.min(1, zMax);
                }
                const widthCap = Math.max(innerMin, layoutW - layoutPad) * ruleTapZoomMul;
                return Math.min(1, zMax, widthCap / Math.max(1, bW));
            };
            const isZoomView = (mode === 'memorize' || mode === 'visualize' || mode === 'rule' || mode === 'routeEditor') && state.settings.fretboardView === 'zoom';
            const visualizeExtendedNeedsHorizScroll =
                mode === 'visualize' &&
                containerId === 'fretboard-container' &&
                !!state.visualize.showExtendedFrets &&
                renderMaxFret > DEFAULT_VISIBLE_MAX_FRET;
            const perspectiveWrapper = containerEl.querySelector('.fretboard-perspective-wrapper');

            // Break out of the app container's max-width by offsetting to the left
            // viewport edge. position:relative keeps the element in the flex flow.
            const containerRect = containerEl.getBoundingClientRect();
            containerEl.style.position = 'relative';
            containerEl.style.left = isRuleFretHost ? '0px' : `${-Math.round(containerRect.left)}px`;
            containerEl.style.width = `${layoutW}px`;
            containerEl.style.overflow = '';
            containerEl.style.removeProperty('-webkit-overflow-scrolling');

            if (isZoomView) {
                scrollWrapper.style.marginLeft = '';
                const projectedBounds = getProjectedFretboardBounds(neckTop, neckBottom, renderMaxFret);
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
                if (
                    (step3TapRange !== null || step3TapFloatRange !== null) &&
                    (isRuleFretHost && containerId === 'rule-fretboard-container' ||
                     mode === 'memorize' && containerId === 'fretboard-container')
                ) {
                    void containerEl.offsetHeight;
                    const ch = containerEl.clientHeight;
                    if (ch > 72) {
                        const zSlack = land ? 0 : 4;
                        const zBottomClear = land ? 34 : 0;
                        maxZoomViewH = Math.max(130, ch - zSlack - zBottomClear);
                    }
                }
                let zoomScale = Math.min(1, maxZoomViewH / projectedBounds.height);
                if (isRuleFretHost) {
                    zoomScale = ruleTapCapZoomByFretWidth(zoomScale, 18, 160);
                } else if (mode === 'memorize' && containerId === 'fretboard-container' && (step3TapRange !== null || step3TapFloatRange !== null)) {
                    zoomScale = ruleTapCapZoomByFretWidth(zoomScale, 18, 160);
                }
                if (visualizeExtendedNeedsHorizScroll && containerId === 'fretboard-container') {
                    const layoutPadZ = land ? 0 : 2;
                    zoomScale = Math.min(
                        zoomScale,
                        getVisualizeExtended12FretWidthFitScale(
                            layoutW,
                            layoutPadZ,
                            projectedBounds,
                            neckTop,
                            neckBottom,
                            renderMaxFret
                        )
                    );
                }
                scrollWrapper.style.width = `${layoutW}px`;
                scrollWrapper.style.height = `${Math.ceil(projectedBounds.height * zoomScale)}px`;
                scrollWrapper.style.overflowX =
                    ruleTapLayoutLockScroll &&
                    (step3TapRange !== null || step3TapFloatRange !== null)
                        ? 'hidden'
                        : 'auto';
                scrollWrapper.style.overflowY = 'hidden';
                scrollWrapper.style.transform = '';
                scrollWrapper.style.transformOrigin = '';
                containerEl.style.height = '';
                containerEl.style.marginBottom = '';
                if (perspectiveWrapper) {
                    perspectiveWrapper.style.transformOrigin = 'top left';
                    perspectiveWrapper.style.transform = `translate(${(-projectedBounds.minX).toFixed(2)}px, ${(-projectedBounds.minY).toFixed(2)}px) scale(${zoomScale.toFixed(4)})`;
                }
            } else {
                const projectedBounds = getProjectedFretboardBounds(neckTop, neckBottom, renderMaxFret);
                const land = window.innerWidth > window.innerHeight;
                const memorizeFretHost =
                    mode === 'memorize' && containerId === 'fretboard-container';
                const routeEditorFretHost =
                    mode === 'routeEditor' && containerId === 'fretboard-container';
                const visualizeFretHost =
                    (mode === 'visualize' && containerId === 'fretboard-container') ||
                    (mode === 'rule' && containerId === 'rule-fretboard-container') ||
                    routeEditorFretHost;
                const memorizeCruiseLandscape =
                    mode === 'memorize' &&
                    containerId === 'fretboard-container' &&
                    land &&
                    state.memorize.playMode === 'cruise';
                /** 自由探索・全体ビュー・13F以降ON: ズーム時と同様にラッパーで横スクロール（縮めて全体を収めない） */
                const visualizeExtendedFullScrollLayout =
                    visualizeExtendedNeedsHorizScroll && state.settings.fretboardView === 'full';
                /** 横・覚える・全体: 上段テキストを詰めた分、scale 用の高さ目安を少し上げる */
                const fallbackFullH = routeEditorFretHost && land
                    ? Math.max(150, Math.round(window.innerHeight * 0.44))
                    : memorizeCruiseLandscape
                        ? Math.max(150, Math.round(window.innerHeight * 0.46))
                        : Math.max(
                            120,
                            Math.round(
                                window.innerHeight *
                                    ((memorizeFretHost || visualizeFretHost) && land ? 0.605 : land ? 0.41 : 0.3) -
                                ((memorizeFretHost || visualizeFretHost) && land ? 48 : land ? 108 : 100)
                            )
                        );
                let maxFullViewH = Math.max(180, window.innerHeight * 0.35);
                const memorizeLandBottomUiClearPx =
                    routeEditorFretHost && land
                        ? 72
                        : memorizeCruiseLandscape
                            ? 70
                            : (memorizeFretHost || visualizeFretHost) && land
                                ? 22
                                : land
                                    ? 36
                                    : 0;
                const readMemorizeHostMaxH = () => {
                    if (
                        (mode !== 'memorize' && mode !== 'visualize' && mode !== 'rule') ||
                        (containerId !== 'fretboard-container' && containerId !== 'rule-fretboard-container') ||
                        !appEl
                    ) {
                        if (!routeEditorFretHost) return null;
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
                        routeEditorFretHost && land ? 150 : memorizeCruiseLandscape ? 150 : 110,
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
                let scale;
                if (visualizeExtendedFullScrollLayout) {
                    scale = Math.min(
                        1,
                        scaleByH,
                        getVisualizeExtended12FretWidthFitScale(
                            layoutW,
                            layoutPad,
                            projectedBounds,
                            neckTop,
                            neckBottom,
                            renderMaxFret
                        )
                    );
                } else {
                    scale = Math.min(1, scaleByW, scaleByH);
                }
                if (mode === 'rule' && step3TapRange === null && step3TapFloatRange === null) {
                    scale = Math.min(scale, Math.max(0.72, (layoutW - layoutPad) / projectedBounds.width));
                }
                if (
                    (step3TapRange !== null || step3TapFloatRange !== null) &&
                    mode === 'rule' &&
                    containerId === 'rule-fretboard-container'
                ) {
                    const bFitW =
                        step3TapFloatRange !== null
                            ? getProjectedFretboardBoundsForFretFloatRange(
                                  neckTop,
                                  neckBottom,
                                  step3TapFloatRange[0],
                                  step3TapFloatRange[1]
                              ).width
                            : getProjectedFretboardBoundsForFretRange(
                                  neckTop,
                                  neckBottom,
                                  step3TapRange[0],
                                  step3TapRange[1]
                              ).width;
                    const wCap = Math.max(140, layoutW - layoutPad) * ruleTapZoomMul;
                    scale = Math.min(scale, wCap / Math.max(1, bFitW));
                }
                let centerTx = 0;
                if (visualizeExtendedFullScrollLayout) {
                    scrollWrapper.style.marginLeft = '0px';
                    scrollWrapper.style.width = `${layoutW}px`;
                    scrollWrapper.style.height = `${Math.ceil(projectedBounds.height * scale)}px`;
                    scrollWrapper.style.overflowX = 'auto';
                    scrollWrapper.style.overflowY = 'hidden';
                    scrollWrapper.style.transform = '';
                    scrollWrapper.style.transformOrigin = '';
                    containerEl.style.height = `${Math.ceil(projectedBounds.height * scale)}px`;
                    if (perspectiveWrapper) {
                        perspectiveWrapper.style.transformOrigin = 'top left';
                        perspectiveWrapper.style.transform = `translate(${(-projectedBounds.minX).toFixed(
                            2
                        )}px, ${(-projectedBounds.minY).toFixed(2)}px) scale(${scale.toFixed(4)})`;
                    }
                } else {
                    const scaledW = projectedBounds.width * scale;
                    centerTx = Math.max(0, Math.round((layoutW - scaledW) / 2));
                    if (visualizeFretHost && mode !== 'rule') {
                        let rightOffset;
                        if (land) {
                            rightOffset = layoutW < 500 ? 0 : layoutW < 700 ? 10 : 20;
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
                        perspectiveWrapper.style.transform = `translate(${(-projectedBounds.minX).toFixed(
                            2
                        )}px, ${(-projectedBounds.minY).toFixed(2)}px)`;
                    }
                }
                const syncFretboardLayoutCollapse = () => {
                    if (!scrollWrapper.isConnected) return;
                    void scrollWrapper.offsetHeight;
                    const layoutH = scrollWrapper.offsetHeight;
                    const visualH = scrollWrapper.getBoundingClientRect().height;
                    if (layoutH > 1 && visualH > 1) {
                        if (visualizeFretHost) {
                            // height設定済みのためmarginBottomは不要
                            containerEl.style.marginBottom = '';
                        } else if (memorizeCruiseLandscape) {
                            // クルーズ横画面は下部ボタン列を優先し、指板下の空きを残す
                            containerEl.style.marginBottom = '';
                        } else {
                            containerEl.style.marginBottom = `${-Math.round(layoutH - visualH)}px`;
                        }
                    }
                };
                syncFretboardLayoutCollapse();
                /** 基本ルールの指板は全体ビューで rAF 後にスケールを差し替えると、再描画のたびに一瞬ズームしたように見える */
                const refineScaleAfterPaint =
                    containerId === 'fretboard-container' &&
                    (mode === 'memorize' || mode === 'visualize' || mode === 'routeEditor');
                if (refineScaleAfterPaint) {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            if (!scrollWrapper.isConnected || !containerEl.isConnected) return;
                            const mh1 = readMemorizeHostMaxH();
                            if (mh1 === null) {
                                syncFretboardLayoutCollapse();
                                return;
                            }
                            let s1 =
                                visualizeExtendedFullScrollLayout && mode === 'visualize'
                                    ? Math.min(
                                          1,
                                          mh1 / projectedBounds.height,
                                          getVisualizeExtended12FretWidthFitScale(
                                              layoutW,
                                              layoutPad,
                                              projectedBounds,
                                              neckTop,
                                              neckBottom,
                                              renderMaxFret
                                          )
                                      )
                                    : Math.min(1, scaleByW, mh1 / projectedBounds.height);
                            if (
                                (step3TapRange !== null || step3TapFloatRange !== null) &&
                                mode === 'rule' &&
                                containerId === 'rule-fretboard-container'
                            ) {
                                const bFitRW =
                                    step3TapFloatRange !== null
                                        ? getProjectedFretboardBoundsForFretFloatRange(
                                              neckTop,
                                              neckBottom,
                                              step3TapFloatRange[0],
                                              step3TapFloatRange[1]
                                          ).width
                                        : getProjectedFretboardBoundsForFretRange(
                                              neckTop,
                                              neckBottom,
                                              step3TapRange[0],
                                              step3TapRange[1]
                                          ).width;
                                const wCapR = Math.max(140, layoutW - layoutPad) * ruleTapZoomMul;
                                s1 = Math.min(s1, wCapR / Math.max(1, bFitRW));
                            }
                            if (mode === 'rule' && step3TapRange === null && step3TapFloatRange === null) {
                                s1 = Math.min(s1, Math.max(0.72, (layoutW - layoutPad) / projectedBounds.width));
                            }
                            if (Math.abs(s1 - scale) > 0.002) {
                                scale = s1;
                                if (visualizeExtendedFullScrollLayout) {
                                    scrollWrapper.style.height = `${Math.ceil(projectedBounds.height * scale)}px`;
                                    containerEl.style.height = `${Math.ceil(projectedBounds.height * scale)}px`;
                                    scrollWrapper.style.marginLeft = '0px';
                                    if (perspectiveWrapper) {
                                        perspectiveWrapper.style.transform = `translate(${(-projectedBounds.minX).toFixed(
                                            2
                                        )}px, ${(-projectedBounds.minY).toFixed(2)}px) scale(${scale.toFixed(4)})`;
                                    }
                                } else {
                                    const sw = projectedBounds.width * scale;
                                    centerTx = Math.max(0, Math.round((layoutW - sw) / 2));
                                    if (visualizeFretHost && mode !== 'rule') {
                                        let rightOffset;
                                        if (land) {
                                            rightOffset = layoutW < 500 ? 0 : layoutW < 700 ? 10 : 20;
                                        } else {
                                            rightOffset = 20;
                                        }
                                        centerTx += rightOffset;
                                        containerEl.style.height = `${Math.ceil(projectedBounds.height * scale)}px`;
                                    }
                                    scrollWrapper.style.marginLeft = `${centerTx}px`;
                                    scrollWrapper.style.transform = `scale(${scale.toFixed(4)})`;
                                }
                            }
                            syncFretboardLayoutCollapse();
                        });
                    });
                }
            }

            // 全体ビューは marginLeft でビューポート中央に寄せているので、left 補正はズレの原因になる（スキップ）
            if (isZoomView && !isRuleFretHost) {
                const wrapperRect = scrollWrapper.getBoundingClientRect();
                if (Math.abs(wrapperRect.left) > 1) {
                    const currentLeft = parseFloat(containerEl.style.left) || 0;
                    containerEl.style.left = `${Math.round(currentLeft - wrapperRect.left)}px`;
                }
            }
        }
    }

    addFretboardDots(containerId);
    if (isRuleMode && ruleViewSnapshot) {
        state.settings.rotation = ruleViewSnapshot.rotation;
        state.settings.perspective = ruleViewSnapshot.perspective;
        state.settings.perspOriginX = ruleViewSnapshot.perspOriginX;
        state.settings.stringSpacing = ruleViewSnapshot.stringSpacing;
    }

    cleanupFretboardDocumentHandlers(containerId);
    if (isTiltPreview) return;

    let routeEditorDragState = null;

    const findFretColumnAtClientPoint = (clientX, clientY, paddingX = 0, paddingY = 0) => {
        const cols = containerEl.querySelectorAll('.fret-column');
        let bestCol = null;
        let bestDistance = Infinity;
        cols.forEach(col => {
            const r = col.getBoundingClientRect();
            if (
                clientX < r.left - paddingX ||
                clientX > r.right + paddingX ||
                clientY < r.top - paddingY ||
                clientY > r.bottom + paddingY
            ) {
                return;
            }
            const dx = clientX - (r.left + r.width / 2);
            const dy = clientY - (r.top + r.height / 2);
            const distance = dx * dx + dy * dy;
            if (distance < bestDistance) {
                bestDistance = distance;
                bestCol = col;
            }
        });
        return bestCol;
    };

    const getRouteEditorDropTarget = (clientX, clientY) => {
        return findFretColumnAtClientPoint(clientX, clientY, 18, 18);
    };

    const clearRouteEditorDragState = () => {
        if (routeEditorDragState?.previewEl) {
            routeEditorDragState.previewEl.remove();
        }
        if (routeEditorDragState?.buttonEl) {
            routeEditorDragState.buttonEl.classList.remove('route-edit-note-button--dragging');
        }
        routeEditorDragState = null;
        document.body.style.userSelect = '';
    };

    const beginRouteEditorDragPreview = (state, clientX, clientY) => {
        const rect = state.buttonEl.getBoundingClientRect();
        const preview = state.buttonEl.cloneNode(true);
        preview.classList.add('route-edit-note-drag-preview');
        preview.style.position = 'fixed';
        preview.style.left = `${rect.left + rect.width / 2}px`;
        preview.style.top = `${rect.top + rect.height / 2}px`;
        preview.style.margin = '0';
        preview.style.pointerEvents = 'none';
        preview.style.zIndex = '99999';
        preview.style.opacity = '0.95';
        preview.style.transform = 'translate(-50%, -50%) scale(1.06)';
        preview.style.transition = 'none';
        document.body.appendChild(preview);
        state.previewEl = preview;
        state.previewOffsetX = clientX - (rect.left + rect.width / 2);
        state.previewOffsetY = clientY - (rect.top + rect.height / 2);
    };

    const updateRouteEditorDragPreview = (state, clientX, clientY) => {
        if (!state.previewEl) return;
        state.previewEl.style.left = `${clientX - state.previewOffsetX}px`;
        state.previewEl.style.top = `${clientY - state.previewOffsetY}px`;
    };

    const handleRouteEditorPointerDown = (e) => {
        if (mode !== 'routeEditor') return;
        if (typeof e.button === 'number' && e.button !== 0) return;
        const button = e.target && typeof e.target.closest === 'function'
            ? e.target.closest('.route-edit-note-button')
            : null;
        if (!button || !containerEl.contains(button)) return;
        const routeIndex = parseInt(button.getAttribute('data-route-index'), 10);
        if (!Number.isFinite(routeIndex)) return;
        routeEditorDragState = {
            routeIndex,
            pointerId: typeof e.pointerId === 'number' ? e.pointerId : null,
            startX: e.clientX,
            startY: e.clientY,
            dragging: false,
            buttonEl: button,
            previewEl: null,
            previewOffsetX: 0,
            previewOffsetY: 0
        };
    };

    const handleRouteEditorPointerMove = (e) => {
        if (!routeEditorDragState) return;
        if (routeEditorDragState.pointerId !== null && typeof e.pointerId === 'number' && e.pointerId !== routeEditorDragState.pointerId) return;
        const dx = e.clientX - routeEditorDragState.startX;
        const dy = e.clientY - routeEditorDragState.startY;
        const movedEnough = Math.hypot(dx, dy) >= 6;
        if (!routeEditorDragState.dragging && !movedEnough) return;
        if (!routeEditorDragState.dragging) {
            routeEditorDragState.dragging = true;
            routeEditorDragState.buttonEl.classList.add('route-edit-note-button--dragging');
            document.body.style.userSelect = 'none';
            beginRouteEditorDragPreview(routeEditorDragState, e.clientX, e.clientY);
        }
        updateRouteEditorDragPreview(routeEditorDragState, e.clientX, e.clientY);
        e.preventDefault();
        e.stopPropagation();
    };

    const handleRouteEditorPointerEnd = (e) => {
        if (!routeEditorDragState) return;
        if (routeEditorDragState.pointerId !== null && typeof e.pointerId === 'number' && e.pointerId !== routeEditorDragState.pointerId) return;
        const endedState = routeEditorDragState;
        const wasDragging = endedState.dragging;
        const routeIndex = endedState.routeIndex;
        const targetCol = wasDragging ? getRouteEditorDropTarget(e.clientX, e.clientY) : null;
        clearRouteEditorDragState();
        if (!wasDragging) return;
        e.preventDefault();
        e.stopPropagation();
        routeEditorDragSuppressNextClick = true;
        routeEditorDragSuppressRouteIndex = routeIndex;
        setTimeout(() => {
            if (routeEditorDragSuppressRouteIndex === routeIndex) {
                routeEditorDragSuppressRouteIndex = null;
            }
            routeEditorDragSuppressNextClick = false;
        }, 350);
        if (!targetCol) return;
        const stringName = parseInt(targetCol.getAttribute('data-string'), 10);
        const fret = parseInt(targetCol.getAttribute('data-fret'), 10);
        if (!Number.isFinite(stringName) || !Number.isFinite(fret)) return;
        if (routeIndex < 0 || routeIndex >= state.routeEditor.draft.length) return;
        const currentSlot = normalizeCruiseRouteSlot(state.routeEditor.draft[routeIndex]);
        if (currentSlot && currentSlot.stringName === stringName && currentSlot.fret === fret) return;
        pushRouteEditorHistory(state.routeEditor?.stage);
        state.routeEditor.draft[routeIndex] = { stringName, fret };
        saveState();
        renderApp();
    };

    const handleRouteEditorPointerCancel = (e) => {
        if (!routeEditorDragState) return;
        if (routeEditorDragState.pointerId !== null && typeof e.pointerId === 'number' && e.pointerId !== routeEditorDragState.pointerId) return;
        clearRouteEditorDragState();
    };

    if (mode === 'routeEditor') {
        document.addEventListener('pointerdown', handleRouteEditorPointerDown, true);
        document.addEventListener('pointermove', handleRouteEditorPointerMove, true);
        document.addEventListener('pointerup', handleRouteEditorPointerEnd, true);
        document.addEventListener('pointercancel', handleRouteEditorPointerCancel, true);
        routeEditorDragHandlers.set(containerId, {
            pointerdown: handleRouteEditorPointerDown,
            pointermove: handleRouteEditorPointerMove,
            pointerup: handleRouteEditorPointerEnd,
            pointercancel: handleRouteEditorPointerCancel
        });
    }

    // Attach on document capture because player-view rotation can project frets outside
    // the container's layout box. Hit-test the projected 2D fret rectangles instead.
    const handleFretboardClick = (e) => {
        if (routeEditorDragSuppressNextClick) {
            routeEditorDragSuppressNextClick = false;
            return;
        }
        const routeEditorMarkerButton = mode === 'routeEditor' && e.target && typeof e.target.closest === 'function'
            ? e.target.closest('.route-edit-note-button')
            : null;
        if (routeEditorMarkerButton && typeof onRouteEditorMarkerClick === 'function') {
            const routeIndex = parseInt(routeEditorMarkerButton.getAttribute('data-route-index'), 10);
            if (routeEditorDragSuppressRouteIndex !== null && routeEditorDragSuppressRouteIndex === routeIndex) {
                routeEditorDragSuppressRouteIndex = null;
                return;
            }
            routeEditorDragSuppressRouteIndex = null;
            if (Number.isFinite(routeIndex)) {
                onRouteEditorMarkerClick(routeIndex);
            }
            return;
        }

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
        // STEP5：音名横のチェックUIはフレット矩形ヒットと別扱い（タップ判定と二重にならないよう除外）
        if (
            mode === 'rule' &&
            e.target &&
            typeof e.target.closest === 'function' &&
            e.target.closest('.rule-step5-inline-exclude')
        ) {
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
        } else if (mode === 'rule' && onFretClick) {
            onFretClick(s, f);
        }
    };
    document.addEventListener('click', handleFretboardClick, true);
    fretboardDocumentHandlers.set(containerId, handleFretboardClick);
    renderFretboardHitDebug(containerId, mode, question);

    if (mode === 'rule' && containerId === 'rule-fretboard-container' && state.settings.fretboardView === 'zoom') {
        setTimeout(() => {
            const wrapper = containerEl.querySelector('.fretboard-scroll-wrapper');
            if (!wrapper) return;
            if (ruleSlowAutoScrollToNext) {
                const targetCol = wrapper.querySelector('.rule-next')?.closest('.fret-column');
                if (!targetCol) return;
                const wrapperRect = wrapper.getBoundingClientRect();
                const targetRect = targetCol.getBoundingClientRect();
                const targetCenter = targetRect.left + targetRect.width / 2;
                const wrapperCenter = wrapperRect.left + wrapperRect.width / 2;
                const delta = targetCenter - wrapperCenter;
                if (Math.abs(delta) > 12) {
                    animateRuleWrapperScrollLeft(wrapper, wrapper.scrollLeft + delta, 1100);
                    scheduleRuleFloatingCuePosition();
                } else {
                    positionRuleFloatingCue();
                }
                return;
            }
            // STEP3 など：指定フレット幅に合わせたあと、見せたい範囲の中央付近へ横スクロール
            if (typeof ruleTapZoomScrollAnchorFret === 'number') {
                alignRuleStep3FretColumnCenter(wrapper, ruleTapZoomScrollAnchorFret);
                if (ruleStep3PairTapLine) {
                    scheduleRuleStep31PairLineUpdates();
                }
                return;
            }
            if (step3TapFloatRange !== null) {
                const [fl, fh] = step3TapFloatRange;
                if (fl < 1 && fh <= 6.5) {
                    alignRuleStep3Page0Fret3Center(wrapper);
                } else {
                    alignRuleStep3FretColumnCenter(wrapper, Math.round((fl + fh) / 2));
                }
                if (ruleStep3PairTapLine) {
                    scheduleRuleStep31PairLineUpdates();
                }
                return;
            }
            if (step3TapRange !== null) {
                const [fMin, fMax] = step3TapRange;
                if (fMin === 0 && fMax <= 5) {
                    alignRuleStep3Page0Fret3Center(wrapper);
                } else {
                    alignRuleStep3FretColumnCenter(
                        wrapper,
                        Math.round((fMin + fMax) / 2)
                    );
                }
                if (ruleStep3PairTapLine) {
                    scheduleRuleStep31PairLineUpdates();
                }
                return;
            }
            const targetCol = wrapper.querySelector('.rule-next')?.closest('.fret-column');
            if (!targetCol) return;
            const wrapperRect = wrapper.getBoundingClientRect();
            const targetRect = targetCol.getBoundingClientRect();
            const targetCenter = targetRect.left + targetRect.width / 2;
            const wrapperCenter = wrapperRect.left + wrapperRect.width / 2;
            const delta = targetCenter - wrapperCenter;
            if (Math.abs(delta) > 12) {
                if (ruleSlowAutoScrollToNext) {
                    animateRuleWrapperScrollLeft(wrapper, wrapper.scrollLeft + delta, 1100);
                } else {
                    wrapper.scrollBy({ left: delta, behavior: 'smooth' });
                }
                scheduleRuleFloatingCuePosition();
            } else {
                positionRuleFloatingCue();
            }
        }, 30);
    }

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

function renderHighlightOverlay(currentQuestion, nextQuestion, highlightMode, repeatHintMode = 1, isContinuedRepeat = false, loopPositionMarker = null) {
    if (!currentQuestion) return;

    const container = document.getElementById('fretboard-container');
    if (!container) return;

    // Remove existing overlay
    const existingOverlay = container.querySelector('.highlight-overlay');
    if (existingOverlay) existingOverlay.remove();

    // Remove any glow effects inserted directly into cells
    container.querySelectorAll('.fret-glow-effect').forEach(el => el.remove());

    // Create overlay container
    const overlay = document.createElement('div');
    overlay.className = 'highlight-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '12';

    // Find current and next note positions
    const currentFret = currentQuestion.fret;
    const currentString = currentQuestion.stringName;
    const nextFret = nextQuestion ? nextQuestion.fret : null;
    const nextString = nextQuestion ? nextQuestion.stringName : null;

    // Try multiple selectors for compatibility
    let currentCell = container.querySelector(`[data-string="${currentString}"][data-fret="${currentFret}"]`);
    if (!currentCell) {
        currentCell = container.querySelector(`.string-row[data-string="${currentString}"] .fret-column[data-fret="${currentFret}"]`);
    }
    if (!currentCell) {
        return;
    }

    let nextCell = null;
    if (nextQuestion) {
        nextCell = container.querySelector(`[data-string="${nextString}"][data-fret="${nextFret}"]`);
        if (!nextCell) {
            nextCell = container.querySelector(`.string-row[data-string="${nextString}"] .fret-column[data-fret="${nextFret}"]`);
        }
    }

    container.style.position = 'relative';
    container.appendChild(overlay);

    // ループ位置マーカー（スタート! / ラスト!）を優先的に表示
    if (loopPositionMarker) {
        renderSameNoteRepeatHintOverlay(overlay, currentCell, repeatHintMode, null, loopPositionMarker);
        return;
    }

    // 同じ音が続く場合は、1回目/2回目の両方を安定表示する
    const isRepeatedSameCell = !!(nextQuestion
        && currentQuestion.stringName === nextQuestion.stringName
        && currentQuestion.fret === nextQuestion.fret);

    if (isRepeatedSameCell || isContinuedRepeat) {
        renderSameNoteRepeatHintOverlay(overlay, currentCell, repeatHintMode, isContinuedRepeat);
        return;
    }

    // Apply highlight based on mode (after overlay is added to container)
    switch(highlightMode) {
        case 1: // Simple rings
            addRingHighlight(overlay, currentCell, nextCell, 'gold', 'lightblue');
            break;
        case 2: // Glow effect
            addGlowHighlight(overlay, currentCell, nextCell);
            break;
        case 3: // Background colors
            addBackgroundHighlight(overlay, currentCell, nextCell);
            break;
        case 4: // Scale + Glow
            addScaleGlowHighlight(overlay, currentCell, nextCell);
            break;
        case 5: // Path line + Highlight
            addPathLineHighlight(overlay, currentCell, nextCell);
            break;
    }
}

function renderSameNoteRepeatHintOverlay(overlay, currentCell, repeatHintMode, isSecondNote = false, loopPositionMarker = null) {
    const containerRect = overlay.parentElement.getBoundingClientRect();
    const currentRect = currentCell.getBoundingClientRect();
    const currentX = currentRect.left - containerRect.left + currentRect.width / 2;
    const currentY = currentRect.top - containerRect.top + currentRect.height / 2;
    const ringSize = Math.max(currentRect.width, currentRect.height) + 8;

    const ringLeft = currentX - ringSize / 2;
    const ringTop = currentY - ringSize / 2;

    const addElement = (className, styles = {}, text = '') => {
        const el = document.createElement('div');
        el.className = className;
        el.style.position = 'absolute';
        el.style.pointerEvents = 'none';
        Object.entries(styles).forEach(([key, value]) => {
            el.style[key] = value;
        });
        if (text) el.textContent = text;
        overlay.appendChild(el);
        return el;
    };

    const baseRing = {
        left: `${ringLeft}px`,
        top: `${ringTop}px`,
        width: `${ringSize}px`,
        height: `${ringSize}px`,
        borderRadius: '50%'
    };

    // ループ位置マーカー表示（スタート! / ラスト!）
    if (loopPositionMarker === 'start' || loopPositionMarker === 'last') {
        const markerText = loopPositionMarker === 'start' ? 'スタート!' : 'ラスト!';
        addElement('loop-position-badge', {
            left: `${currentX + 8}px`,
            top: `${currentY - 19}px`,
            minWidth: '32px',
            height: '18px',
            padding: '0 4px',
            borderRadius: '999px',
            background: 'rgba(8, 18, 10, 0.9)',
            border: '1px solid rgba(49, 196, 107, 0.95)',
            color: '#dfffea',
            fontSize: '0.68rem',
            fontWeight: '900',
            lineHeight: '18px',
            textAlign: 'center',
            boxShadow: '0 0 10px rgba(49, 196, 107, 0.22)',
            whiteSpace: 'nowrap'
        }, markerText);
        return;
    }

    // Display "1/2" or "2/2" badge (official specification)
    addElement('repeat-note-badge repeat-note-badge--fraction', {
        left: `${currentX + 11}px`,
        top: `${currentY - 19}px`,
        minWidth: '30px',
        height: '18px',
        padding: '0 6px',
        borderRadius: '999px',
        background: 'rgba(8, 18, 10, 0.9)',
        border: '1px solid rgba(49, 196, 107, 0.95)',
        color: '#dfffea',
        fontSize: '0.68rem',
        fontWeight: '900',
        lineHeight: '18px',
        textAlign: 'center',
        boxShadow: '0 0 10px rgba(49, 196, 107, 0.22)'
    }, isSecondNote ? '2/2' : '1/2');
}

function addRingHighlight(overlay, currentCell, nextCell, currentColor, nextColor) {
    const ringSize = 60;
    const containerRect = overlay.parentElement.getBoundingClientRect();

    // Current ring
    const currentRect = currentCell.getBoundingClientRect();
    const currentX = currentRect.left - containerRect.left + currentRect.width / 2;
    const currentY = currentRect.top - containerRect.top + currentRect.height / 2;

    const ring1 = document.createElement('div');
    ring1.style.position = 'absolute';
    ring1.style.width = ringSize + 'px';
    ring1.style.height = ringSize + 'px';
    ring1.style.border = '4px solid ' + currentColor;
    ring1.style.borderRadius = '50%';
    ring1.style.top = (currentY - ringSize / 2) + 'px';
    ring1.style.left = (currentX - ringSize / 2) + 'px';
    ring1.style.animation = 'pulse 1s infinite';
    overlay.appendChild(ring1);

    // Next ring
    if (nextCell) {
        const nextRect = nextCell.getBoundingClientRect();
        const nextX = nextRect.left - containerRect.left + nextRect.width / 2;
        const nextY = nextRect.top - containerRect.top + nextRect.height / 2;

        const ring2 = document.createElement('div');
        ring2.style.position = 'absolute';
        ring2.style.width = (ringSize - 20) + 'px';
        ring2.style.height = (ringSize - 20) + 'px';
        ring2.style.border = '3px solid ' + nextColor;
        ring2.style.borderRadius = '50%';
        ring2.style.top = (nextY - (ringSize - 20) / 2) + 'px';
        ring2.style.left = (nextX - (ringSize - 20) / 2) + 'px';
        overlay.appendChild(ring2);
    }
}

function addGlowHighlight(overlay, currentCell, nextCell) {
    // Insert glow directly inside the target cell (before note-marker) so it renders behind the note text
    const glow = document.createElement('div');
    glow.className = 'fret-glow-effect';
    glow.style.position = 'absolute';
    glow.style.width = '30px';
    glow.style.height = '30px';
    glow.style.left = '50%';
    glow.style.top = '50%';
    glow.style.transform = 'translate(-50%, -50%)';
    glow.style.backgroundColor = 'rgba(255, 215, 0, 0.3)';
    glow.style.borderRadius = '50%';
    glow.style.boxShadow = '0 0 15px rgba(255, 215, 0, 0.8)';
    glow.style.animation = 'glow 1s ease-in-out infinite';
    glow.style.pointerEvents = 'none';
    // Insert before note-marker so note-marker (later in DOM) renders on top
    currentCell.insertBefore(glow, currentCell.firstChild);
}

function addBackgroundHighlight(overlay, currentCell, nextCell) {
    const containerRect = overlay.parentElement.getBoundingClientRect();

    // Current background
    const currentRect = currentCell.getBoundingClientRect();
    const currentWidth = currentRect.width * 1.3;
    const currentHeight = currentRect.height * 1.3;

    const bg1 = document.createElement('div');
    bg1.style.position = 'absolute';
    bg1.style.width = currentWidth + 'px';
    bg1.style.height = currentHeight + 'px';
    bg1.style.backgroundColor = 'rgba(255, 100, 100, 0.25)';
    bg1.style.top = (currentRect.top - containerRect.top + currentRect.height / 2 - currentHeight / 2) + 'px';
    bg1.style.left = (currentRect.left - containerRect.left + currentRect.width / 2 - currentWidth / 2) + 'px';
    bg1.style.borderRadius = '8px';
    overlay.appendChild(bg1);

    // Next background
    if (nextCell) {
        const nextRect = nextCell.getBoundingClientRect();
        const nextWidth = nextRect.width * 1.2;
        const nextHeight = nextRect.height * 1.2;

        const bg2 = document.createElement('div');
        bg2.style.position = 'absolute';
        bg2.style.width = nextWidth + 'px';
        bg2.style.height = nextHeight + 'px';
        bg2.style.backgroundColor = 'rgba(100, 150, 255, 0.15)';
        bg2.style.top = (nextRect.top - containerRect.top + nextRect.height / 2 - nextHeight / 2) + 'px';
        bg2.style.left = (nextRect.left - containerRect.left + nextRect.width / 2 - nextWidth / 2) + 'px';
        bg2.style.borderRadius = '6px';
        overlay.appendChild(bg2);
    }
}

function addScaleGlowHighlight(overlay, currentCell, nextCell) {
    const containerRect = overlay.parentElement.getBoundingClientRect();

    // Current highlight
    addRingHighlight(overlay, currentCell, nextCell, 'gold', 'lightblue');

    // Next scaled up
    if (nextCell) {
        const nextRect = nextCell.getBoundingClientRect();
        const scaleWidth = nextRect.width * 1.4;
        const scaleHeight = nextRect.height * 1.4;

        const scale = document.createElement('div');
        scale.style.position = 'absolute';
        scale.style.width = scaleWidth + 'px';
        scale.style.height = scaleHeight + 'px';
        scale.style.backgroundColor = 'rgba(100, 200, 255, 0.2)';
        scale.style.borderRadius = '10px';
        scale.style.top = (nextRect.top - containerRect.top + nextRect.height / 2 - scaleHeight / 2) + 'px';
        scale.style.left = (nextRect.left - containerRect.left + nextRect.width / 2 - scaleWidth / 2) + 'px';
        scale.style.boxShadow = 'inset 0 0 10px rgba(100, 200, 255, 0.4)';
        scale.style.animation = 'pulse 1.5s ease-in-out infinite';
        overlay.appendChild(scale);
    }
}

function addPathLineHighlight(overlay, currentCell, nextCell) {
    const containerRect = overlay.parentElement.getBoundingClientRect();

    // Current ring
    addRingHighlight(overlay, currentCell, nextCell, 'gold', 'lightblue');

    // Path line
    if (nextCell) {
        const currentRect = currentCell.getBoundingClientRect();
        const nextRect = nextCell.getBoundingClientRect();

        const currentCenter = {
            x: currentRect.left - containerRect.left + currentRect.width / 2,
            y: currentRect.top - containerRect.top + currentRect.height / 2
        };
        const nextCenter = {
            x: nextRect.left - containerRect.left + nextRect.width / 2,
            y: nextRect.top - containerRect.top + nextRect.height / 2
        };

        const line = document.createElement('div');
        line.style.position = 'absolute';
        line.style.height = '3px';
        line.style.backgroundColor = 'rgba(255, 200, 0, 0.5)';

        const distance = Math.sqrt(
            Math.pow(nextCenter.x - currentCenter.x, 2) +
            Math.pow(nextCenter.y - currentCenter.y, 2)
        );
        const angle = Math.atan2(nextCenter.y - currentCenter.y, nextCenter.x - currentCenter.x) * 180 / Math.PI;

        line.style.width = distance + 'px';
        line.style.top = currentCenter.y + 'px';
        line.style.left = currentCenter.x + 'px';
        line.style.transformOrigin = '0 50%';
        line.style.transform = 'rotate(' + angle + 'deg)';
        overlay.appendChild(line);
    }
}

// Initial render
document.addEventListener('DOMContentLoaded', () => {
    renderApp();
});
