import { canCreatePractice, checkPracticeCreation } from './practice-capabilities.js?v=1.0.0';
import { canCreateMyApp, checkMyAppsCreation } from './my-apps-capabilities.js?v=1.0.0';
import { getCapabilities } from './cruise-port-capabilities.js?v=0.26.0';
import { requestToolPro } from './tool-capabilities.js?v=1.0.0';
import {
    LIMITS,
    createPracticeMenu,
    deletePracticeMenu,
    initializePracticeMenus,
    loadPracticeMenus,
    movePracticeMenu,
    savePracticeMenus,
    updatePracticeMenu
} from './practice-menu-store.js?v=0.26.0';
import {
    PRACTICE_NAME_PRESET_CUSTOM,
    PRACTICE_NAME_PRESETS,
    getPracticeNamePreset
} from './practice-menu-presets.js?v=1.0.0';
import { applyEditionDisplay } from './cruise-port-edition.js?v=0.26.0';
import { applyHomeCruiseLinks } from './cruise-app-links.js?v=0.26.0';
import {
    PRACTICE_COMPLETION_TYPE,
    beginPracticeCompletion,
    canCompletePracticeCycle,
    clearPracticeCurrentCheck,
    finishPracticeCompletion,
    loadPracticeProgress,
    removePracticeFromProgress,
    resetPracticeTotalCount,
    savePracticeProgress,
    setPracticeChecked,
    startNextPracticeCycle
} from './practice-menu-progress-store.js?v=0.24.0';
import {
    PRACTICE_HISTORY_EVENT_TYPE,
    appendPracticeHistoryEvent,
    createPracticeCalendarDaySummary,
    createCycleCompletedEvent,
    createPracticeCalendarMonth,
    createPracticeCompletedEvent,
    createPracticeDayHistoryView,
    createPracticeSessionEvent,
    deletePracticeHistoryEvent,
    loadPracticeHistory,
    savePracticeHistory,
    toLocalDateKey
} from './practice-menu-history-store.js?v=0.24.0';
import { createPracticeCalendarKeyboard } from './practice-calendar-keyboard.js?v=0.25.0';
import {
    PRACTICE_CALENDAR_DEFAULT_ICON,
    PRACTICE_CALENDAR_ICONS,
    PRACTICE_CALENDAR_LIMITS,
    PRACTICE_CALENDAR_TIME_OPTIONS,
    createPracticeCalendarNote,
    deletePracticeCalendarNote,
    getPracticeCalendarNotesForDate,
    isValidPracticeCalendarTime,
    isValidPracticeCalendarTimeRange,
    loadPracticeCalendar,
    savePracticeCalendar,
    updatePracticeCalendarNote
} from './practice-menu-calendar-store.js?v=0.24.0';
import {
    formatPracticeSessionDuration,
    formatPracticeTimerDuration,
    getPracticeTimerElapsedSeconds,
    loadPracticeTimer,
    savePracticeTimer,
    startPracticeTimer,
    stopPracticeTimer
} from './practice-menu-timer-store.js?v=0.24.0';
import {
    PRACTICE_ATTACHMENT_LIMITS,
    createPracticeAttachmentStore,
    isSafePracticeAttachmentInlineOpen
} from './practice-menu-attachment-store.js?v=0.24.0';
import {
    appendPendingPracticeAttachments,
    savePendingPracticeAttachments,
    validatePendingPracticeAttachment
} from './practice-menu-pending-attachments.js?v=1.0.0';
import {
    navigatePreparedPracticeFileWindow,
    preparePracticeFileWindow
} from './practice-menu-file-open.js?v=1.0.0';
import {
    PRACTICE_APP_STATUS,
    countPracticeMenuReferences,
    createPracticeAppOptionGroups,
    isSelectablePracticeAppId,
    resolvePracticeMenuApp
} from './practice-menu-app-resolver.js?v=0.26.0';
import {
    HOME_HISTORY_MODE,
    PRACTICE_ROUTE_KIND,
    parsePracticeRoute,
    safeDecodeRouteSegment,
    updateHomeHistory
} from './practice-menu-navigation.js?v=1.3.0';
import {
    MY_APPS_LIMITS,
    loadMyApps,
    moveMyApp,
    normalizeCustomLaunch,
    normalizeMyAppUrl,
    saveMyApps,
    validateMyAppValues
} from './my-apps-store.js?v=0.24.0';
import {
    getKnownApp,
    recognizeKnownAppUrl,
    recognizeStoreUrl
} from './my-apps-known-apps.js?v=1.3.0';
import {
    getKnownLaunchUiMode,
    detectMyAppsPlatform,
    resolveMyAppHref
} from './my-apps-launch.js?v=0.24.0';
import {
    createCustomLaunchTestState,
    createKnownLaunchFormState,
    isKnownLaunchEnabled,
    markCustomLaunchTested,
    recognizeKnownLaunchApp,
    setKnownLaunchDecision,
    shouldShowCustomLaunchSettings,
    updateCustomLaunchTestTarget
} from './my-apps-launch-form-state.js?v=1.1.0';
import { createMyAppsIconStore } from './my-apps-icon-store.js?v=0.24.0';
import {
    encodePreparedMyAppIcon,
    prepareMyAppEditorSource,
    prepareMyAppIcon
} from './my-apps-image-processor.js?v=1.2.0';
import {
    applyPinchGesture,
    createCropStateFromMetadata,
    createInitialCropState,
    cropStateToMetadata,
    moveCrop,
    zoomCropAtPoint
} from './my-apps-crop.js?v=1.1.0';
import {
    createMyAppEntry,
    deleteMyAppEntry,
    updateMyAppEntry
} from './my-apps-icon-workflow.js?v=0.24.0';
import {
    MY_APPS_ICON_PRESETS,
    createMyAppsPresetGraphic,
    getMyAppsIconPreset
} from './my-apps-icon-presets.js?v=1.0.4';
import { getMyAppHomeIconKind } from './my-apps-icon-scale-classifier.js?v=1.0.0';
import { initMetronome } from './metronome-app.js?v=0.24.0';
import {
    applyVersionDisplay,
    normalizeInitialHome,
    reloadAppWithCacheBust
} from './app-version.js?v=0.26.2';
import { applyHomeDisplaySize, applyHomeSectionOrder } from './home-display.js?v=0.25.0';
import { DEFAULT_SETTINGS, moveHomeSection, clearRetiredIconScalePreviewKeys, loadSettings, saveSettings } from './settings-store.js?v=0.25.0';
import { initTuner } from './tuner-app.js?v=0.24.0';
import {
    clearGearPhotoReferences,
    createGearItem,
    deleteGearItem,
    getGearPhotoReferences,
    getInitialGearCategory,
    getGearPriorityLabel,
    loadGearList,
    markGearSold,
    markGearPurchased,
    moveGearItem,
    restoreGearOwned,
    saveGearList,
    selectGearItems,
    setGearPhotoReferences,
    updateGearItem,
    validateGearValues
} from './gear-list-store.js?v=0.24.0';
import {
    GEAR_CATEGORY_NAME_LIMIT,
    addGearCategory,
    deleteGearCategory,
    getGearCategoryName,
    loadGearCategories,
    renameGearCategory,
    saveGearCategories
} from './gear-category-store.js?v=0.26.2';
import { createGearPhotoStore } from './gear-photo-store.js?v=0.24.0';
import {
    encodePreparedGearPhoto,
    prepareGearPhotoSource
} from './gear-photo-processor.js?v=1.0.0';
import {
    commitGearItemDeletion,
    commitGearPhotoChange,
    commitGearPhotoRemoval
} from './gear-photo-workflow.js?v=1.0.0';
import {
    GEAR_ROUTE_KIND,
    parseGearRoute,
    replaceGearListRoute
} from './gear-list-navigation.js?v=1.0.0';

import { initializeProAuthSettings } from './pro-auth-settings.js?v=1.0.0';
import { applyProLinks, createProAccessView, PRO_INFO_ROUTE } from './pro-prompt.js?v=1.0.0';

normalizeInitialHome();
const proAccessView = createProAccessView();
document.querySelector('#home-view').before(proAccessView);
let proAccessHasPreviousRoute = false;
let lastRenderedHash = null;
const PRACTICE_CALENDAR_ENTRY_SOURCE = Object.freeze({
    home: 'home',
    practice: 'practice'
});
const PRACTICE_CALENDAR_SOURCE_STATE_KEY = 'cruisePortCalendarSource';
proAccessView.querySelector('button').addEventListener('click', () => {
    if (proAccessHasPreviousRoute) history.back();
    else replaceHomeRoute();
});

applyEditionDisplay();
initializeProAuthSettings();
applyProLinks();
applyHomeCruiseLinks();

const elements = {
    homeView: document.querySelector('#home-view'),
    settingsView: document.querySelector('#settings-view'),
    wishlistView: document.querySelector('#wishlist-view'),
    gearFormView: document.querySelector('#gear-form-view'),
    practiceListView: document.querySelector('#practice-list-view'),
    practiceHiddenView: document.querySelector('#practice-hidden-view'),
    practiceHistoryView: document.querySelector('#practice-history-view'),
    detailView: document.querySelector('#practice-detail-view'),
    formView: document.querySelector('#practice-form-view'),
    tunerView: document.querySelector('#tuner-view'),
    metronomeView: document.querySelector('#metronome-view'),
    myAppsManageView: document.querySelector('#my-apps-manage-view'),
    myAppsFormView: document.querySelector('#my-apps-form-view'),
    myAppsNotFoundView: document.querySelector('#my-apps-not-found-view'),
    homeCalendarButton: document.querySelector('#home-calendar-button'),
    homeSettingsButton: document.querySelector('#home-settings-button'),
    settingsTitle: document.querySelector('#settings-title'),
    settingsStorageError: document.querySelector('#settings-storage-error'),
    settingsChoices: [...document.querySelectorAll('[data-display-size]')],
    fontChoices: [...document.querySelectorAll('button[data-font-size]')],
    sectionOrder: document.querySelector('#settings-section-order'),
    orderStatus: document.querySelector('#settings-order-status'),
    settingsReset: document.querySelector('#settings-reset'),
    gearTitle: document.querySelector('#wishlist-title'),
    gearTabs: [...document.querySelectorAll('[data-gear-status]')],
    gearCategorySelect: document.querySelector('#gear-category-select'),
    gearCategoryMenuWrap: document.querySelector('.gear-category-menu-wrap'),
    gearCategoryMenuToggle: document.querySelector('#gear-category-menu-toggle'),
    gearCategoryMenu: document.querySelector('#gear-category-menu'),
    gearCategoryAdd: document.querySelector('#gear-category-add'),
    gearCategoryRename: document.querySelector('#gear-category-rename'),
    gearCategoryDelete: document.querySelector('#gear-category-delete'),
    gearCategoryDialog: document.querySelector('#gear-category-dialog'),
    gearCategoryDialogTitle: document.querySelector('#gear-category-dialog-title'),
    gearCategoryForm: document.querySelector('#gear-category-form'),
    gearCategoryName: document.querySelector('#gear-category-name'),
    gearCategoryError: document.querySelector('#gear-category-error'),
    gearCategoryCancel: document.querySelector('#gear-category-cancel'),
    gearStorageError: document.querySelector('#gear-list-storage-error'),
    gearContent: document.querySelector('#gear-list-content'),
    gearSections: document.querySelector('#gear-list-sections'),
    gearReorderActions: document.querySelector('#gear-reorder-actions'),
    gearReorderCancel: document.querySelector('#gear-reorder-cancel'),
    gearReorderComplete: document.querySelector('#gear-reorder-complete'),
    gearReorderStatus: document.querySelector('#gear-reorder-status'),
    gearReorderNotice: document.querySelector('#gear-reorder-notice'),
    gearTitleAdd: document.querySelector('#gear-list-title-add'),
    gearAdd: document.querySelector('#gear-list-add'),
    gearFormTitle: document.querySelector('#gear-form-title'),
    gearForm: document.querySelector('#gear-list-form'),
    gearNameInput: document.querySelector('#gear-name'),
    gearCategoryInput: document.querySelector('#gear-category'),
    gearPriceInput: document.querySelector('#gear-price'),
    gearStatusInput: document.querySelector('#gear-status'),
    gearPriorityField: document.querySelector('#gear-priority-field'),
    gearPriorityInput: document.querySelector('#gear-priority'),
    gearMemoInput: document.querySelector('#gear-memo'),
    gearPhotoInput: document.querySelector('#gear-photo-input'),
    gearPhotoSelectLabel: document.querySelector('#gear-photo-select-label'),
    gearPhotoPreview: document.querySelector('#gear-photo-preview'),
    gearPhotoReadjust: document.querySelector('#gear-photo-readjust'),
    gearPhotoRemove: document.querySelector('#gear-photo-remove'),
    gearPhotoStatus: document.querySelector('#gear-photo-status'),
    gearPhotoCropDialog: document.querySelector('#gear-photo-crop-dialog'),
    gearPhotoCropTitle: document.querySelector('#gear-photo-crop-title'),
    gearPhotoCropCanvas: document.querySelector('#gear-photo-crop-canvas'),
    gearPhotoCropSlider: document.querySelector('#gear-photo-crop-slider'),
    gearPhotoCropStatus: document.querySelector('#gear-photo-crop-status'),
    gearPhotoCropConfirm: document.querySelector('#gear-photo-crop-confirm'),
    gearPhotoCropCancel: document.querySelector('#gear-photo-crop-cancel'),
    gearPhotoLightbox: document.querySelector('#gear-photo-lightbox'),
    gearPhotoLightboxTitle: document.querySelector('#gear-photo-lightbox-title'),
    gearPhotoLightboxImage: document.querySelector('#gear-photo-lightbox-image'),
    gearPhotoLightboxClose: document.querySelector('#gear-photo-lightbox-close'),
    gearFormError: document.querySelector('#gear-form-error'),
    tunerCard: document.querySelector('#tuner-card'),
    list: document.querySelector('#practice-menu-list'),
    empty: document.querySelector('#practice-empty'),
    addButton: document.querySelector('#practice-menu-add'),
    storageError: document.querySelector('#practice-storage-error'),
    listNotice: document.querySelector('#practice-list-notice'),
    historyOpen: document.querySelector('#practice-history-open'),
    hiddenOpen: document.querySelector('#practice-hidden-open'),
    hiddenCount: document.querySelector('#practice-hidden-count'),
    timerToggle: document.querySelector('#practice-timer-toggle'),
    timerIcon: document.querySelector('#practice-timer-icon'),
    timerLabel: document.querySelector('#practice-timer-label'),
    timerDisplay: document.querySelector('#practice-timer-display'),
    timerStatus: document.querySelector('#practice-timer-status'),
    finishButton: document.querySelector('#practice-finish'),
    cycleReset: document.querySelector('#practice-cycle-reset'),
    completionDialog: document.querySelector('#practice-completion-dialog'),
    completionTitle: document.querySelector('#practice-completion-title'),
    completionDescription: document.querySelector('#practice-completion-description'),
    completionError: document.querySelector('#practice-completion-error'),
    completionEnd: document.querySelector('#practice-completion-end'),
    completionCalendar: document.querySelector('#practice-completion-calendar'),
    hiddenTitle: document.querySelector('#practice-hidden-title'),
    hiddenList: document.querySelector('#practice-hidden-list'),
    hiddenEmpty: document.querySelector('#practice-hidden-empty'),
    hiddenNotice: document.querySelector('#practice-hidden-notice'),
    historyTitle: document.querySelector('#practice-history-title'),
    historyBack: document.querySelector('#practice-history-back'),
    historyError: document.querySelector('#practice-history-error'),
    historyStatus: document.querySelector('#practice-history-status'),
    calendarViewTabs: [...document.querySelectorAll('[data-calendar-view]')],
    calendarPrevious: document.querySelector('#practice-calendar-previous'),
    calendarNext: document.querySelector('#practice-calendar-next'),
    calendarToday: document.querySelector('#practice-calendar-today'),
    calendarMonth: document.querySelector('#practice-calendar-month'),
    calendarWeekdays: document.querySelector('#practice-calendar-weekdays'),
    calendarDays: document.querySelector('#practice-calendar-days'),
    calendarDayFocus: document.querySelector('#practice-calendar-day-focus'),
    calendarNoteAdd: document.querySelector('#practice-calendar-note-add'),
    calendarNotesEmpty: document.querySelector('#practice-calendar-notes-empty'),
    calendarNotesList: document.querySelector('#practice-calendar-notes-list'),
    calendarNoteForm: document.querySelector('#practice-calendar-note-form'),
    calendarNoteIconToggle: document.querySelector('#practice-calendar-note-icon-toggle'),
    calendarNoteIconSelection: document.querySelector('#practice-calendar-note-icon-selection'),
    calendarNoteIcons: document.querySelector('#practice-calendar-note-icons'),
    calendarNoteTime: document.querySelector('#practice-calendar-note-time'),
    calendarNoteEndTime: document.querySelector('#practice-calendar-note-end-time'),
    calendarNoteText: document.querySelector('#practice-calendar-note-text'),
    calendarNoteError: document.querySelector('#practice-calendar-note-error'),
    calendarNoteCancel: document.querySelector('#practice-calendar-note-cancel'),
    dayHistoryTitle: document.querySelector('#practice-day-history-title'),
    dayHistoryList: document.querySelector('#practice-day-history-list'),
    detailTitle: document.querySelector('#practice-detail-title'),
    detailSaved: document.querySelector('#practice-detail-saved'),
    detailDuration: document.querySelector('#practice-detail-duration'),
    detailApp: document.querySelector('#practice-detail-app'),
    detailMemo: document.querySelector('#practice-detail-memo'),
    detailCount: document.querySelector('#practice-detail-count'),
    detailError: document.querySelector('#practice-detail-error'),
    openApp: document.querySelector('#practice-open-app'),
    attachmentAdd: document.querySelector('.practice-attachment-add'),
    attachmentInput: document.querySelector('#practice-attachment-input'),
    attachmentStatus: document.querySelector('#practice-attachment-status'),
    attachmentsEmpty: document.querySelector('#practice-attachments-empty'),
    attachmentsList: document.querySelector('#practice-attachments-list'),
    formAttachments: document.querySelector('#practice-form-attachments'),
    formAttachmentAdd: document.querySelector('#practice-form-attachments .practice-attachment-add'),
    formAttachmentInput: document.querySelector('#practice-form-attachment-input'),
    formAttachmentStatus: document.querySelector('#practice-form-attachment-status'),
    formAttachmentsEmpty: document.querySelector('#practice-form-attachments-empty'),
    formAttachmentsList: document.querySelector('#practice-form-attachments-list'),
    attachmentLightbox: document.querySelector('#practice-attachment-lightbox'),
    attachmentLightboxTitle: document.querySelector('#practice-attachment-lightbox-title'),
    attachmentLightboxImage: document.querySelector('#practice-attachment-lightbox-image'),
    attachmentLightboxClose: document.querySelector('#practice-attachment-lightbox-close'),
    editButton: document.querySelector('#practice-edit'),
    deleteButton: document.querySelector('#practice-delete'),
    formTitle: document.querySelector('#practice-form-title'),
    form: document.querySelector('#practice-menu-form'),
    formSubmit: document.querySelector('#practice-menu-form button[type="submit"]'),
    nameLabel: document.querySelector('#practice-name-label'),
    namePresetInput: document.querySelector('#practice-name-preset'),
    nameInput: document.querySelector('#practice-name'),
    durationInput: document.querySelector('#practice-duration'),
    appInput: document.querySelector('#practice-app'),
    memoInput: document.querySelector('#practice-memo'),
    hiddenField: document.querySelector('#practice-hidden-field'),
    hiddenInput: document.querySelector('#practice-hidden'),
    countResetSection: document.querySelector('#practice-count-reset-section'),
    formTotalCount: document.querySelector('#practice-form-total-count'),
    countReset: document.querySelector('#practice-count-reset'),
    formError: document.querySelector('#practice-form-error'),
    formStatus: document.querySelector('#practice-form-status'),
    reorderStart: document.querySelector('#practice-reorder-start'),
    reorderActions: document.querySelector('#practice-reorder-actions'),
    reorderCancel: document.querySelector('#practice-reorder-cancel'),
    reorderComplete: document.querySelector('#practice-reorder-complete'),
    reorderStatus: document.querySelector('#practice-reorder-status'),
    reorderNotice: document.querySelector('#practice-reorder-notice'),
    myAppsGrid: document.querySelector('#my-apps-grid'),
    myAppsAdd: document.querySelector('#my-apps-add'),
    myAppsManage: document.querySelector('#my-apps-manage'),
    myAppsStorageError: document.querySelector('#my-apps-storage-error'),
    myAppsManageTitle: document.querySelector('#my-apps-manage-title'),
    myAppsList: document.querySelector('#my-apps-list'),
    myAppsReorderStart: document.querySelector('#my-apps-reorder-start'),
    myAppsReorderActions: document.querySelector('#my-apps-reorder-actions'),
    myAppsReorderCancel: document.querySelector('#my-apps-reorder-cancel'),
    myAppsReorderComplete: document.querySelector('#my-apps-reorder-complete'),
    myAppsReorderStatus: document.querySelector('#my-apps-reorder-status'),
    myAppsReorderNotice: document.querySelector('#my-apps-reorder-notice'),
    myAppsManageAdd: document.querySelector('#my-apps-manage-add'),
    myAppsFormTitle: document.querySelector('#my-apps-form-title'),
    myAppsFormBack: document.querySelector('#my-apps-form-back'),
    myAppsForm: document.querySelector('#my-apps-form'),
    myAppsNameInput: document.querySelector('#my-apps-name'),
    myAppsUrlInput: document.querySelector('#my-apps-url'),
    myAppsUrlHelpToggle: document.querySelector('#my-apps-url-help-toggle'),
    myAppsUrlHelp: document.querySelector('#my-apps-url-help'),
    myAppsUrlHelpClose: document.querySelector('#my-apps-url-help-close'),
    myAppsDirectLaunch: document.querySelector('#my-apps-direct-launch'),
    myAppsDirectRecognition: document.querySelector('#my-apps-direct-recognition'),
    myAppsDirectToggle: document.querySelector('#my-apps-direct-toggle'),
    myAppsDirectEnabled: document.querySelector('#my-apps-direct-enabled'),
    myAppsDirectDescription: document.querySelector('#my-apps-direct-description'),
    myAppsCustomLaunch: document.querySelector('#my-apps-custom-launch'),
    myAppsCustomIosInput: document.querySelector('#my-apps-custom-ios'),
    myAppsCustomAndroidInput: document.querySelector('#my-apps-custom-android'),
    myAppsCustomEnabled: document.querySelector('#my-apps-custom-enabled'),
    myAppsCustomIosTest: document.querySelector('#my-apps-custom-ios-test'),
    myAppsCustomAndroidTest: document.querySelector('#my-apps-custom-android-test'),
    myAppsCustomIosStatus: document.querySelector('#my-apps-custom-ios-status'),
    myAppsCustomAndroidStatus: document.querySelector('#my-apps-custom-android-status'),
    myAppsIconInput: document.querySelector('#my-apps-icon-input'),
    myAppsIconSelectLabel: document.querySelector('#my-apps-icon-select-label'),
    myAppsIconPresetOpen: document.querySelector('#my-apps-icon-preset-open'),
    myAppsIconPresetPicker: document.querySelector('#my-apps-icon-preset-picker'),
    myAppsIconPreview: document.querySelector('#my-apps-icon-preview'),
    myAppsIconAdjustHint: document.querySelector('#my-apps-icon-adjust-hint'),
    myAppsIconRemove: document.querySelector('#my-apps-icon-remove'),
    myAppsIconStatus: document.querySelector('#my-apps-icon-status'),
    myAppsCropDialog: document.querySelector('#my-apps-crop-dialog'),
    myAppsCropTitle: document.querySelector('#my-apps-crop-title'),
    myAppsCropCanvas: document.querySelector('#my-apps-crop-canvas'),
    myAppsCropSlider: document.querySelector('#my-apps-crop-slider'),
    myAppsCropStatus: document.querySelector('#my-apps-crop-status'),
    myAppsCropConfirm: document.querySelector('#my-apps-crop-confirm'),
    myAppsCropCancel: document.querySelector('#my-apps-crop-cancel'),
    myAppsSubmit: document.querySelector('#my-apps-submit'),
    myAppsFormError: document.querySelector('#my-apps-form-error'),
    myAppsDelete: document.querySelector('#my-apps-delete'),
    myAppsNotFoundTitle: document.querySelector('#my-apps-not-found-title')
};

const state = {
    items: [],
    storageReady: false,
    activeId: null,
    formMode: 'create',
    reorderMode: false,
    reorderItems: [],
    savedNotice: null,
    listNotice: '',
    progress: null,
    progressReady: false,
    history: null,
    historyReady: false,
    calendar: null,
    calendarReady: false,
    calendarNoteEditId: null,
    calendarNoteIcon: PRACTICE_CALENDAR_DEFAULT_ICON,
    calendarNoteIconDropdownOpen: false,
    calendarNoteUserEdited: false,
    timer: null,
    timerReady: false,
    timerInterval: null,
    attachmentCounts: {},
    attachmentCountsReady: false,
    pendingCreateAttachments: [],
    formSaving: false,
    filesFocusId: null,
    historyMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    historySelectedDate: toLocalDateKey(),
    calendarViewMode: 'month',
    completionActionInProgress: false
};

const myAppsState = {
    items: [],
    storageReady: false,
    activeId: null,
    formMode: 'create',
    reorderMode: false,
    reorderItems: [],
    iconAction: 'keep',
    iconBlob: null,
    iconSourceBlob: null,
    iconCrop: null,
    iconPresetKey: null,
    useCurrentIconAsSource: false,
    iconProcessing: false,
    saving: false,
    cropSession: null,
    cropState: null,
    cropPointers: new Map(),
    knownLaunchForm: createKnownLaunchFormState(),
    customLaunchTests: createCustomLaunchTestState(),
    customEditAvailable: false,
    customStoreIdentity: null
};

const gearState = {
    items: [],
    storageReady: false,
    categories: [],
    categoryStorageReady: false,
    categoryDialogMode: null,
    activeStatus: 'all',
    activeCategory: 'all',
    activeId: null,
    formMode: 'create',
    reorderMode: false,
    reorderStatus: null,
    reorderItems: [],
    photoAction: 'keep',
    photoBlob: null,
    photoSourceBlob: null,
    photoCrop: null,
    photoSourceWidth: 0,
    photoSourceHeight: 0,
    photoProcessing: false,
    saving: false,
    cropSession: null,
    cropState: null,
    cropPointers: new Map()
};

let metronomeController = null;
let tunerController = null;
let pendingHomeScrollTarget = null;
let homeSettings = { ...DEFAULT_SETTINGS };
let settingsStorageReady = true;
let gearPhotoLightboxReturnFocus = null;
let practiceAttachmentRenderGeneration = 0;
let practiceAttachmentLightboxReturnFocus = null;
const myAppsIconStore = createMyAppsIconStore();
const gearPhotoStore = createGearPhotoStore();
const practiceAttachmentStore = createPracticeAttachmentStore();
const practiceAttachmentObjectUrls = new Set();
const practiceAttachmentExternalObjectUrls = new Set();
const myAppsPlatform = detectMyAppsPlatform();
const myAppsObjectUrls = {
    home: new Set(),
    manage: new Set(),
    form: new Set()
};
const myAppsRenderGeneration = { home: 0, manage: 0, form: 0 };
const gearPhotoObjectUrls = { list: new Set(), form: new Set(), lightbox: new Set() };
const gearPhotoRenderGeneration = { list: 0, form: 0, lightbox: 0 };

function showNotice(element, message = '') {
    element.textContent = message;
    element.hidden = message.length === 0;
}

function cleanupMyAppsObjectUrls(scope) {
    myAppsRenderGeneration[scope] += 1;
    myAppsObjectUrls[scope].forEach((url) => URL.revokeObjectURL(url));
    myAppsObjectUrls[scope].clear();
}

function cleanupGearPhotoObjectUrls(scope) {
    gearPhotoRenderGeneration[scope] += 1;
    gearPhotoObjectUrls[scope].forEach((url) => URL.revokeObjectURL(url));
    gearPhotoObjectUrls[scope].clear();
}

function cleanupPracticeAttachmentObjectUrls() {
    practiceAttachmentRenderGeneration += 1;
    practiceAttachmentObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    practiceAttachmentObjectUrls.clear();
}

function cleanupPendingPracticeAttachments() {
    state.pendingCreateAttachments = [];
    elements.formAttachmentInput.value = '';
}

function closePracticeAttachmentLightbox({ restoreFocus = false } = {}) {
    elements.attachmentLightbox.hidden = true;
    elements.attachmentLightboxImage.removeAttribute('src');
    document.body.classList.remove('practice-attachment-lightbox-open');
    if (restoreFocus) practiceAttachmentLightboxReturnFocus?.focus({ preventScroll: true });
    practiceAttachmentLightboxReturnFocus = null;
}

function cleanupGearPhotoFormState() {
    closeGearPhotoCropEditor({ restoreStatus: false, restoreFocus: false });
    cleanupGearPhotoObjectUrls('form');
    gearState.photoAction = 'keep';
    gearState.photoBlob = null;
    gearState.photoSourceBlob = null;
    gearState.photoCrop = null;
    gearState.photoSourceWidth = 0;
    gearState.photoSourceHeight = 0;
    gearState.photoProcessing = false;
    gearState.saving = false;
}

function cleanupMyAppsFormState() {
    closeMyAppsCropEditor({ restoreStatus: false, restoreFocus: false });
    cleanupMyAppsObjectUrls('form');
    myAppsState.iconAction = 'keep';
    myAppsState.iconBlob = null;
    myAppsState.iconSourceBlob = null;
    myAppsState.iconCrop = null;
    myAppsState.iconPresetKey = null;
    myAppsState.useCurrentIconAsSource = false;
    myAppsState.iconProcessing = false;
    myAppsState.saving = false;
    myAppsState.knownLaunchForm = createKnownLaunchFormState();
    myAppsState.customLaunchTests = createCustomLaunchTestState();
    myAppsState.customEditAvailable = false;
    myAppsState.customStoreIdentity = null;
}

function showView(view) {
    const viewChanged = view.hidden;
    if (view !== elements.practiceHistoryView) {
        cleanupPracticeCalendarKeyboardTracking();
        setPracticeCalendarIconDropdownOpen(false);
    }
    if (view !== elements.homeView) cleanupMyAppsObjectUrls('home');
    if (view !== elements.myAppsManageView) cleanupMyAppsObjectUrls('manage');
    if (view !== elements.myAppsFormView) cleanupMyAppsFormState();
    if (view !== elements.wishlistView) cleanupGearPhotoObjectUrls('list');
    if (view !== elements.gearFormView) cleanupGearPhotoFormState();
    if (view !== elements.formView && state.formMode === 'create') cleanupPendingPracticeAttachments();
    if (view !== elements.wishlistView && view !== elements.gearFormView) closeGearPhotoLightbox();
    if (view !== elements.detailView) {
        closePracticeAttachmentLightbox();
        cleanupPracticeAttachmentObjectUrls();
    }
    [
        proAccessView,
        elements.homeView,
        elements.settingsView,
        elements.wishlistView,
        elements.gearFormView,
        elements.practiceListView,
        elements.practiceHiddenView,
        elements.practiceHistoryView,
        elements.detailView,
        elements.formView,
        elements.tunerView,
        elements.metronomeView,
        elements.myAppsManageView,
        elements.myAppsFormView,
        elements.myAppsNotFoundView
    ]
        .forEach((candidate) => {
            candidate.hidden = candidate !== view;
        });
    metronomeController?.setActive(view === elements.metronomeView);
    tunerController?.setActive(view === elements.tunerView);
    if (viewChanged) window.scrollTo({ top: 0, behavior: 'auto' });
}

function findItem(id) {
    return state.items.find((item) => item.id === id) || null;
}

function setHomeRoute() {
    updateHomeHistory({ mode: HOME_HISTORY_MODE.push });
    renderRoute();
}

function replaceHomeRoute() {
    updateHomeHistory({ mode: HOME_HISTORY_MODE.replace });
    renderRoute();
}

function setHomeRouteWithMyAppsScroll() {
    pendingHomeScrollTarget = 'my-apps-section';
    setHomeRoute();
}

function replaceHomeRouteWithMyAppsScroll() {
    pendingHomeScrollTarget = 'my-apps-section';
    replaceHomeRoute();
}

function setHashRoute(route) {
    location.hash = route;
}

function setPracticeListRoute() {
    setHashRoute('#practice-menu');
}

function getPracticeCalendarEntrySource() {
    const source = window.history.state?.[PRACTICE_CALENDAR_SOURCE_STATE_KEY];
    return Object.values(PRACTICE_CALENDAR_ENTRY_SOURCE).includes(source) ? source : null;
}

function openPracticeCalendar(source) {
    const entrySource = Object.values(PRACTICE_CALENDAR_ENTRY_SOURCE).includes(source)
        ? source
        : PRACTICE_CALENDAR_ENTRY_SOURCE.home;
    const currentState = window.history.state && typeof window.history.state === 'object'
        ? window.history.state
        : {};
    const nextState = { ...currentState, [PRACTICE_CALENDAR_SOURCE_STATE_KEY]: entrySource };
    const url = `${location.pathname}${location.search}#practice-menu/calendar`;
    if (location.hash === '#practice-menu/calendar') window.history.replaceState(nextState, '', url);
    else window.history.pushState(nextState, '', url);
    renderRoute();
}

function returnFromPracticeCalendar() {
    if (getPracticeCalendarEntrySource()) {
        window.history.back();
        return;
    }
    replaceHomeRoute();
}

function replacePracticeListRoute() {
    window.history.replaceState(null, '', `${location.pathname}${location.search}#practice-menu`);
    renderRoute();
}

function replacePracticeDetailRoute(id) {
    window.history.replaceState(
        null,
        '',
        `${location.pathname}${location.search}#practice-menu/${encodeURIComponent(id)}`
    );
    renderRoute();
}

function sameOrder(firstItems, secondItems) {
    return firstItems.length === secondItems.length
        && firstItems.every((item, index) => item.id === secondItems[index].id);
}

function resolveCurrentPracticeApp(appId) {
    return resolvePracticeMenuApp(appId, {
        myApps: myAppsState.items,
        myAppsReady: myAppsState.storageReady,
        platform: myAppsPlatform
    });
}

function getPracticeTotalCount(id) {
    return state.progress?.totalCounts[id] || 0;
}

function getPracticeAttachmentCount(id) {
    return state.attachmentCounts[id] || 0;
}

async function refreshPracticeAttachmentCounts({ renderList = true } = {}) {
    const result = await practiceAttachmentStore.getAttachmentCounts(state.items.map((item) => item.id));
    if (!result.ok) {
        state.attachmentCounts = {};
        state.attachmentCountsReady = false;
    } else {
        state.attachmentCounts = result.counts;
        state.attachmentCountsReady = true;
    }
    if (renderList && parsePracticeRoute(location.hash)?.kind === PRACTICE_ROUTE_KIND.list) {
        renderPracticeList({ focus: false });
    }
}

function renderPracticeCard(item) {
    const app = resolveCurrentPracticeApp(item.appId);
    const card = document.createElement('article');
    const checkButton = document.createElement('button');
    const detailLink = document.createElement('a');
    const copy = document.createElement('span');
    const name = document.createElement('span');
    const count = document.createElement('span');
    const memo = document.createElement('span');
    const arrow = document.createElement('span');
    const actions = document.createElement('span');
    const checked = state.progress?.checkedPracticeIds.includes(item.id) || false;

    card.className = 'practice-row practice-menu-card';
    card.dataset.practiceId = item.id;
    checkButton.className = 'practice-check';
    checkButton.type = 'button';
    checkButton.dataset.practiceAction = 'check';
    checkButton.dataset.id = item.id;
    checkButton.setAttribute('aria-label', `${item.name}を${checked ? '未完了に戻す' : '完了にする'}`);
    checkButton.setAttribute('aria-pressed', checked ? 'true' : 'false');
    checkButton.disabled = !state.storageReady
        || !state.progressReady
        || !state.historyReady
        || Boolean(state.progress?.completionPending);
    checkButton.textContent = checked ? '✓' : '';
    detailLink.className = 'practice-card-link';
    detailLink.href = `#practice-menu/${encodeURIComponent(item.id)}`;
    detailLink.setAttribute('aria-label', `${item.name}の詳細を見る`);
    copy.className = 'practice-copy';
    name.className = 'card-name';
    count.className = 'practice-card-count';
    memo.className = 'practice-card-memo';
    arrow.className = 'practice-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    name.textContent = item.name;
    count.textContent = `${getPracticeTotalCount(item.id)}回`;
    memo.textContent = item.memo;
    arrow.textContent = '→';
    copy.append(name, count);
    if (item.memo) copy.append(memo);
    actions.className = 'practice-card-actions';
    if (app.launchable) {
        const launch = document.createElement('a');
        const launchArrow = document.createElement('span');
        launch.className = 'practice-launch';
        launch.href = app.href;
        launch.dataset.practiceAction = 'launch';
        launch.setAttribute('aria-label', `${item.name}の使用アプリ「${app.label}」を開く`);
        launch.title = `${app.label}を開く`;
        launch.textContent = 'アプリへ';
        launchArrow.setAttribute('aria-hidden', 'true');
        launchArrow.textContent = '↗';
        launch.append(launchArrow);
        actions.append(launch);
    }
    const attachmentCount = getPracticeAttachmentCount(item.id);
    if (state.attachmentCountsReady && attachmentCount > 0) {
        const files = document.createElement('button');
        files.className = 'practice-files-button';
        files.type = 'button';
        files.dataset.practiceAction = 'files';
        files.dataset.id = item.id;
        files.dataset.count = String(attachmentCount);
        files.setAttribute('aria-label', `${item.name}のファイル${attachmentCount}件を${attachmentCount === 1 ? '開く' : '一覧で見る'}`);
        files.textContent = attachmentCount === 1 ? 'ファイル' : `ファイル ${attachmentCount}`;
        actions.append(files);
    }
    card.append(detailLink, checkButton, copy, actions, arrow);
    return card;
}

function renderHiddenPracticeCard(item) {
    const app = resolveCurrentPracticeApp(item.appId);
    const card = document.createElement('a');
    const copy = document.createElement('span');
    const name = document.createElement('span');
    const detail = document.createElement('span');
    const count = document.createElement('span');
    const edit = document.createElement('span');

    card.className = 'practice-row practice-hidden-card';
    card.href = `#practice-menu/${encodeURIComponent(item.id)}/edit`;
    copy.className = 'practice-copy';
    name.className = 'card-name';
    detail.className = 'card-detail';
    count.className = 'practice-card-count';
    edit.className = 'practice-hidden-edit';
    name.textContent = item.name;
    detail.textContent = `${item.durationMinutes}分 ・ ${app.label}`;
    count.textContent = `${getPracticeTotalCount(item.id)}回`;
    edit.textContent = '編集';
    copy.append(name, detail, count);
    card.append(copy, edit);
    return card;
}

function renderReorderCard(item, index) {
    const card = document.createElement('div');
    const handle = document.createElement('span');
    const copy = document.createElement('span');
    const name = document.createElement('span');
    const controls = document.createElement('div');
    const upButton = document.createElement('button');
    const downButton = document.createElement('button');

    card.className = 'practice-row reorder-card';
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', `${item.name}の並び替え`);
    handle.className = 'reorder-handle';
    handle.setAttribute('aria-hidden', 'true');
    handle.textContent = '≡';
    copy.className = 'practice-copy';
    name.className = 'card-name';
    name.textContent = item.name;
    controls.className = 'reorder-controls';

    upButton.className = 'reorder-move';
    upButton.type = 'button';
    upButton.dataset.id = item.id;
    upButton.dataset.direction = '-1';
    upButton.setAttribute('aria-label', `${item.name}を上へ移動`);
    upButton.textContent = '↑';
    upButton.disabled = index === 0;

    downButton.className = 'reorder-move';
    downButton.type = 'button';
    downButton.dataset.id = item.id;
    downButton.dataset.direction = '1';
    downButton.setAttribute('aria-label', `${item.name}を下へ移動`);
    downButton.textContent = '↓';
    downButton.disabled = index === state.reorderItems.length - 1;

    controls.append(upButton, downButton);
    copy.append(name);
    card.append(handle, copy, controls);
    return card;
}

function createMyAppFallbackSvg() {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    const frame = document.createElementNS(namespace, 'rect');
    const line = document.createElementNS(namespace, 'path');
    const arrow = document.createElementNS(namespace, 'path');

    svg.setAttribute('viewBox', '0 0 64 64');
    frame.setAttribute('x', '13');
    frame.setAttribute('y', '15');
    frame.setAttribute('width', '38');
    frame.setAttribute('height', '34');
    frame.setAttribute('rx', '8');
    line.setAttribute('d', 'M23 25h18M23 33h11');
    arrow.setAttribute('class', 'icon-accent');
    arrow.setAttribute('d', 'M37 41l9-9m0 0h-7m7 0v7');
    svg.append(frame, line, arrow);
    return svg;
}

function createMyAppIcon(item = null, scope = 'home') {
    const icon = document.createElement('span');
    const fallback = createMyAppFallbackSvg();
    const presetGraphic = item?.iconPresetKey
        ? createMyAppsPresetGraphic(item.iconPresetKey, {
            onAssetError: () => icon.replaceChildren(fallback)
        })
        : null;

    icon.className = 'skeleton-icon my-app-icon';
    if (scope === 'home') icon.classList.add(`my-app-icon--${getMyAppHomeIconKind(item)}`);
    icon.setAttribute('aria-hidden', 'true');
    icon.append(presetGraphic || fallback);
    if (item?.iconId) hydrateMyAppIcon(icon, item.iconId, scope);
    return icon;
}

async function hydrateMyAppIcon(icon, iconId, scope) {
    const generation = myAppsRenderGeneration[scope];
    const result = await myAppsIconStore.getIcon(iconId);
    if (!result.ok || !result.record || generation !== myAppsRenderGeneration[scope]) return;

    const objectUrl = URL.createObjectURL(result.record.blob);
    if (generation !== myAppsRenderGeneration[scope]) {
        URL.revokeObjectURL(objectUrl);
        return;
    }
    myAppsObjectUrls[scope].add(objectUrl);
    const image = document.createElement('img');
    image.alt = '';
    image.decoding = 'async';
    image.onload = () => {
        if (generation === myAppsRenderGeneration[scope]) icon.replaceChildren(image);
    };
    image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        myAppsObjectUrls[scope].delete(objectUrl);
    };
    image.src = objectUrl;
}

function findMyApp(id) {
    return myAppsState.items.find((item) => item.id === id) || null;
}

function renderMyAppCard(item) {
    const card = document.createElement('a');
    const name = document.createElement('span');
    const external = document.createElement('span');

    card.className = 'port-card skeleton-card tool-card my-app-launch-card';
    card.href = resolveMyAppHref(item, myAppsPlatform);
    card.setAttribute('aria-label', `${item.name}を開く（外部アプリまたはWebサイト）`);
    name.className = 'card-name';
    name.textContent = item.name;
    external.className = 'my-app-external-mark';
    external.setAttribute('aria-hidden', 'true');
    external.textContent = '↗';
    card.append(createMyAppIcon(item, 'home'), name, external);
    return card;
}

function guardImageWrite(feature) {
    const capability = feature === 'customIcon' ? 'customMyAppIconWrite' : 'gearPhotoWrite';
    if (getCapabilities()[capability]) return true;
    requestToolPro(feature);
    return false;
}

function updateMyAppsCreateControls() {
    const locked = !canCreateMyApp(myAppsState.items);
    for (const button of [elements.myAppsAdd, elements.myAppsManageAdd]) {
        button.classList.toggle('tool-pro-locked', locked && getCapabilities().myAppsCreateLimit < MY_APPS_LIMITS.items);
        button.setAttribute('aria-label', locked ? 'My Appを追加（登録上限）' : 'My Appを追加');
    }
}

function guardMyAppsCreation() {
    const latest = checkMyAppsCreation();
    if (!latest.ok) {
        const message = '最新のMy Appsを読み込めません。入力内容を控えてから再読み込みしてください。';
        showNotice(elements.myAppsFormError, message);
        showNotice(elements.myAppsStorageError, message);
        return false;
    }
    if (latest.allowed) return true;
    if (getCapabilities().myAppsCreateLimit < MY_APPS_LIMITS.items) requestToolPro('myAppsCreate');
    else window.alert(`My Appsは${MY_APPS_LIMITS.items}件まで登録できます。`);
    return false;
}

function openMyAppsCreate() {
    if (guardMyAppsCreation()) setHashRoute('#my-apps/new');
}

function renderMyAppsHome() {
    cleanupMyAppsObjectUrls('home');
    elements.myAppsGrid.replaceChildren();
    myAppsState.items.forEach((item) => elements.myAppsGrid.append(renderMyAppCard(item)));
    elements.myAppsGrid.append(elements.myAppsAdd);
    elements.myAppsAdd.disabled = !myAppsState.storageReady || (getCapabilities().myAppsCreateLimit >= MY_APPS_LIMITS.items && myAppsState.items.length >= MY_APPS_LIMITS.items);
    updateMyAppsCreateControls();
    elements.myAppsAdd.hidden = false;
    elements.myAppsManage.hidden = !myAppsState.storageReady || myAppsState.items.length === 0;
    showNotice(
        elements.myAppsStorageError,
        myAppsState.storageReady ? '' : 'My Appsの保存データを読み込めません。保存領域の値は変更していません。'
    );
}

function renderMyAppsReorderCard(item, index) {
    const card = document.createElement('div');
    const icon = createMyAppIcon(item, 'manage');
    const copy = document.createElement('span');
    const name = document.createElement('span');
    const controls = document.createElement('div');
    const upButton = document.createElement('button');
    const downButton = document.createElement('button');

    card.className = 'practice-row reorder-card my-apps-reorder-card';
    icon.classList.add('my-app-manage-icon');
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', `${item.name}の並び替え`);
    copy.className = 'practice-copy';
    name.className = 'card-name';
    name.textContent = item.name;
    controls.className = 'reorder-controls';
    upButton.className = 'reorder-move';
    upButton.type = 'button';
    upButton.dataset.id = item.id;
    upButton.dataset.direction = '-1';
    upButton.setAttribute('aria-label', `${item.name}を上へ移動`);
    upButton.textContent = '↑';
    upButton.disabled = index === 0;
    downButton.className = 'reorder-move';
    downButton.type = 'button';
    downButton.dataset.id = item.id;
    downButton.dataset.direction = '1';
    downButton.setAttribute('aria-label', `${item.name}を下へ移動`);
    downButton.textContent = '↓';
    downButton.disabled = index === myAppsState.reorderItems.length - 1;
    controls.append(upButton, downButton);
    copy.append(name);
    card.append(icon, copy, controls);
    return card;
}

function renderMyAppsManageCard(item) {
    const card = document.createElement('div');
    const icon = createMyAppIcon(item, 'manage');
    const copy = document.createElement('span');
    const name = document.createElement('span');
    const url = document.createElement('span');
    const edit = document.createElement('button');

    card.className = 'practice-row my-apps-manage-card';
    icon.classList.add('my-app-manage-icon');
    copy.className = 'practice-copy';
    name.className = 'card-name';
    url.className = 'card-detail';
    name.textContent = item.name;
    url.textContent = item.url;
    edit.className = 'my-app-edit-button';
    edit.type = 'button';
    edit.dataset.id = item.id;
    edit.textContent = '編集';
    edit.setAttribute('aria-label', `${item.name}を編集`);
    copy.append(name, url);
    card.append(icon, copy, edit);
    return card;
}

function renderMyAppsManage() {
    if (!myAppsState.storageReady) {
        replaceHomeRoute();
        return;
    }
    cleanupMyAppsObjectUrls('manage');
    showView(elements.myAppsManageView);
    elements.myAppsList.replaceChildren();
    const visibleItems = myAppsState.reorderMode ? myAppsState.reorderItems : myAppsState.items;
    visibleItems.forEach((item, index) => {
        elements.myAppsList.append(
            myAppsState.reorderMode ? renderMyAppsReorderCard(item, index) : renderMyAppsManageCard(item)
        );
    });
    elements.myAppsReorderStart.hidden = myAppsState.reorderMode || myAppsState.items.length < 2;
    elements.myAppsReorderActions.hidden = !myAppsState.reorderMode;
    elements.myAppsManageAdd.hidden = myAppsState.reorderMode || (getCapabilities().myAppsCreateLimit >= MY_APPS_LIMITS.items && myAppsState.items.length >= MY_APPS_LIMITS.items);
    updateMyAppsCreateControls();
    elements.myAppsReorderStatus.textContent = myAppsState.reorderMode
        ? '並び替え中です。上下のボタンで順序を変更し、完了で保存します。'
        : '';
    elements.myAppsReorderStatus.hidden = !myAppsState.reorderMode;
    showNotice(elements.myAppsReorderNotice);
    elements.myAppsManageTitle.focus({ preventScroll: true });
}

function startMyAppsReorder() {
    if (!myAppsState.storageReady || myAppsState.items.length < 2) return;
    myAppsState.reorderMode = true;
    myAppsState.reorderItems = myAppsState.items.map((item) => ({ ...item }));
    renderMyAppsManage();
}

function cancelMyAppsReorder() {
    myAppsState.reorderMode = false;
    myAppsState.reorderItems = [];
    renderMyAppsManage();
}

function moveMyAppsReorderItem(id, direction) {
    const moveResult = moveMyApp(myAppsState.reorderItems, id, direction);
    if (!moveResult.moved) return;
    myAppsState.reorderItems = moveResult.items;
    renderMyAppsManage();
    const movedItem = findMyApp(id);
    if (movedItem) {
        elements.myAppsReorderStatus.textContent = `${movedItem.name}を${direction < 0 ? '上' : '下'}へ移動しました。`;
    }
    [...elements.myAppsList.querySelectorAll('.reorder-move')]
        .find((button) => button.dataset.id === id && Number(button.dataset.direction) === direction)
        ?.focus();
}

function completeMyAppsReorder() {
    if (!myAppsState.reorderMode) return;
    if (sameOrder(myAppsState.items, myAppsState.reorderItems)) {
        cancelMyAppsReorder();
        return;
    }
    const saveResult = saveMyApps(myAppsState.reorderItems);
    if (!saveResult.ok) {
        showNotice(elements.myAppsReorderNotice, '並び順を保存できませんでした。元の順番は変更していません。');
        return;
    }
    myAppsState.items = myAppsState.reorderItems;
    myAppsState.reorderMode = false;
    myAppsState.reorderItems = [];
    renderMyAppsManage();
}

function renderMyAppsNotFound() {
    showView(elements.myAppsNotFoundView);
    elements.myAppsNotFoundTitle.focus({ preventScroll: true });
}

function fillMyAppsForm(item = null) {
    cleanupMyAppsFormState();
    elements.myAppsForm.reset();
    elements.myAppsNameInput.value = item?.name || '';
    elements.myAppsUrlInput.value = item?.url || '';
    const recognition = recognizeKnownAppUrl(elements.myAppsUrlInput.value);
    const initialAppKey = recognition?.app.key
        || (item?.launchMode === 'known-app' && getKnownApp(item.appKey) ? item.appKey : null);
    const store = recognizeStoreUrl(elements.myAppsUrlInput.value);
    myAppsState.knownLaunchForm = createKnownLaunchFormState(item, initialAppKey);
    myAppsState.customLaunchTests = createCustomLaunchTestState();
    myAppsState.customEditAvailable = item?.launchMode === 'custom';
    myAppsState.customStoreIdentity = store ? `${store.platform}:${store.identifier}` : null;
    elements.myAppsCustomIosInput.value = item?.customLaunch?.ios || '';
    elements.myAppsCustomAndroidInput.value = item?.customLaunch?.android || '';
    elements.myAppsCustomEnabled.checked = item?.launchMode === 'custom';
    elements.myAppsCustomLaunch.open = item?.launchMode === 'custom';
    updateMyAppsLaunchOptions(item, { initial: true });
    elements.myAppsDelete.hidden = !item;
    myAppsState.iconPresetKey = item?.iconPresetKey || null;
    elements.myAppsIconSelectLabel.textContent = item?.iconId ? '画像を変更' : '画像を選択';
    elements.myAppsIconRemove.hidden = !item?.iconId && !item?.iconPresetKey;
    elements.myAppsIconStatus.textContent = item?.iconId
        ? '現在のアイコン画像'
        : item?.iconPresetKey
            ? `${getMyAppsIconPreset(item.iconPresetKey)?.label || '選択した'}アイコン`
            : '画像未設定';
    elements.myAppsIconPreview.replaceChildren(createMyAppIcon(item, 'form'));
    setMyAppsIconPreviewAdjustable(Boolean(item?.iconId));
    setMyAppsUrlHelpOpen(false);
    setMyAppsPresetPickerOpen(false);
    renderMyAppsPresetPicker();
    showNotice(elements.myAppsFormError);
    setMyAppsFormBusy(false);
}

function setMyAppsUrlHelpOpen(open) {
    elements.myAppsUrlHelp.hidden = !open;
    elements.myAppsUrlHelpToggle.setAttribute('aria-expanded', String(open));
}

function setMyAppsPresetPickerOpen(open) {
    elements.myAppsIconPresetPicker.hidden = !open;
    elements.myAppsIconPresetOpen.setAttribute('aria-expanded', String(open));
}

function renderMyAppsPresetPicker() {
    elements.myAppsIconPresetPicker.replaceChildren();
    MY_APPS_ICON_PRESETS.forEach((preset) => {
        const button = document.createElement('button');
        const label = document.createElement('span');
        button.type = 'button';
        button.className = 'my-apps-preset-option';
        button.dataset.presetKey = preset.key;
        button.setAttribute('aria-label', preset.label);
        button.setAttribute('aria-pressed', String(myAppsState.iconPresetKey === preset.key));
        button.classList.toggle('is-selected', myAppsState.iconPresetKey === preset.key);
        const fallback = createMyAppFallbackSvg();
        const graphic = createMyAppsPresetGraphic(preset.key, {
            onAssetError: () => graphic.replaceWith(fallback)
        });
        button.append(graphic || fallback);
        label.textContent = preset.label;
        button.append(label);
        elements.myAppsIconPresetPicker.append(button);
    });
}

function selectMyAppsPresetIcon(key) {
    const preset = getMyAppsIconPreset(key);
    if (!preset || myAppsState.saving || myAppsState.iconProcessing) return;
    myAppsState.iconAction = 'preset';
    myAppsState.iconPresetKey = preset.key;
    myAppsState.iconBlob = null;
    myAppsState.iconSourceBlob = null;
    myAppsState.iconCrop = null;
    myAppsState.useCurrentIconAsSource = false;
    elements.myAppsIconInput.value = '';
    elements.myAppsIconSelectLabel.textContent = '画像を選択';
    elements.myAppsIconRemove.hidden = false;
    elements.myAppsIconStatus.textContent = `${preset.label}を選択しました。フォームの保存で反映されます。`;
    cleanupMyAppsObjectUrls('form');
    elements.myAppsIconPreview.replaceChildren(createMyAppIcon({ iconPresetKey: preset.key }));
    setMyAppsIconPreviewAdjustable(false);
    renderMyAppsPresetPicker();
    setMyAppsPresetPickerOpen(false);
}

function updateMyAppsLaunchOptions(item = null, { initial = false } = {}) {
    const recognition = recognizeKnownAppUrl(elements.myAppsUrlInput.value);
    const existingApp = item?.launchMode === 'known-app' ? getKnownApp(item.appKey) : null;
    const knownApp = initial && item?.launchMode === 'custom'
        ? null
        : recognition?.app || existingApp;
    if (!initial) {
        myAppsState.knownLaunchForm = recognizeKnownLaunchApp(
            myAppsState.knownLaunchForm,
            knownApp?.key || null
        );
    }

    const launchUiMode = getKnownLaunchUiMode(knownApp?.key || null, myAppsPlatform);
    if (launchUiMode === 'hidden') {
        elements.myAppsDirectEnabled.checked = false;
        elements.myAppsDirectLaunch.hidden = true;
        elements.myAppsDirectToggle.hidden = false;
        elements.myAppsDirectRecognition.textContent = '';
        elements.myAppsDirectDescription.textContent = '対応している端末では、Webページではなくアプリを開きます。';
    } else if (launchUiMode === 'fallback') {
        myAppsState.knownLaunchForm = setKnownLaunchDecision(myAppsState.knownLaunchForm, false);
        elements.myAppsDirectEnabled.checked = false;
        elements.myAppsDirectToggle.hidden = true;
        elements.myAppsDirectRecognition.textContent = `${knownApp.name}を認識しました`;
        elements.myAppsDirectDescription.textContent = 'Androidでは登録したGoogle Playページを開きます。';
        elements.myAppsDirectLaunch.hidden = false;
    } else {
        elements.myAppsDirectEnabled.checked = isKnownLaunchEnabled(myAppsState.knownLaunchForm);
        elements.myAppsDirectToggle.hidden = false;
        elements.myAppsDirectRecognition.textContent = `${knownApp.name}を認識しました`;
        elements.myAppsDirectDescription.textContent = '対応している端末では、Webページではなくアプリを開きます。';
        elements.myAppsDirectLaunch.hidden = false;
    }

    const store = recognizeStoreUrl(elements.myAppsUrlInput.value);
    const storeIdentity = store ? `${store.platform}:${store.identifier}` : null;
    if (!initial && myAppsState.customStoreIdentity && storeIdentity !== myAppsState.customStoreIdentity) {
        elements.myAppsCustomEnabled.checked = false;
        elements.myAppsCustomIosInput.value = '';
        elements.myAppsCustomAndroidInput.value = '';
        myAppsState.customLaunchTests = createCustomLaunchTestState();
        myAppsState.customEditAvailable = false;
    }
    myAppsState.customStoreIdentity = storeIdentity;
    const showCustom = shouldShowCustomLaunchSettings({
        knownAppKey: knownApp?.key || null,
        customEditAvailable: myAppsState.customEditAvailable
    });
    elements.myAppsCustomLaunch.hidden = !showCustom;
    if (!showCustom) elements.myAppsCustomEnabled.checked = false;
    updateMyAppsCustomLaunchTests();
}

function customLaunchTestElements(platform) {
    return platform === 'ios'
        ? {
            input: elements.myAppsCustomIosInput,
            link: elements.myAppsCustomIosTest,
            status: elements.myAppsCustomIosStatus
        }
        : {
            input: elements.myAppsCustomAndroidInput,
            link: elements.myAppsCustomAndroidTest,
            status: elements.myAppsCustomAndroidStatus
        };
}

function updateMyAppsCustomLaunchTests() {
    const unstable = myAppsState.saving || myAppsState.iconProcessing || Boolean(myAppsState.cropSession);
    for (const platform of ['ios', 'android']) {
        const { input, link, status } = customLaunchTestElements(platform);
        const result = input.value.trim() ? normalizeMyAppUrl(input.value) : { ok: false };
        const href = result.ok ? result.url : null;
        myAppsState.customLaunchTests = updateCustomLaunchTestTarget(
            myAppsState.customLaunchTests,
            platform,
            href
        );
        if (href && !unstable) {
            link.href = href;
            link.hidden = false;
        } else {
            link.removeAttribute('href');
            link.hidden = true;
        }
        status.textContent = myAppsState.customLaunchTests[platform].testedHref === href && href
            ? '結果を確認後、このフォームへ戻って保存してください。'
            : '';
    }
}

function markMyAppsCustomLaunchTest(platform) {
    myAppsState.customLaunchTests = markCustomLaunchTested(myAppsState.customLaunchTests, platform);
    updateMyAppsCustomLaunchTests();
}

function setMyAppsFormBusy(busy) {
    myAppsState.saving = busy && !myAppsState.iconProcessing;
    elements.myAppsSubmit.disabled = busy;
    elements.myAppsSubmit.textContent = busy ? '保存中…' : '保存';
    elements.myAppsIconInput.disabled = busy;
    elements.myAppsIconRemove.disabled = busy;
    elements.myAppsIconPresetOpen.disabled = busy;
    elements.myAppsIconPresetPicker.querySelectorAll('button').forEach((button) => { button.disabled = busy; });
    elements.myAppsIconPreview.disabled = busy || !elements.myAppsIconPreview.dataset.adjustable;
    elements.myAppsDirectEnabled.disabled = busy;
    elements.myAppsCustomIosInput.disabled = busy;
    elements.myAppsCustomAndroidInput.disabled = busy;
    elements.myAppsCustomEnabled.disabled = busy;
    elements.myAppsDelete.disabled = busy;
    elements.myAppsFormBack.disabled = busy;
    elements.myAppsForm.querySelectorAll('[data-action="cancel-my-apps-form"]').forEach((button) => {
        button.disabled = busy;
    });
    elements.myAppsIconSelectLabel.parentElement.classList.toggle('is-disabled', busy);
    elements.myAppsIconSelectLabel.parentElement.setAttribute('aria-disabled', String(busy));
    updateMyAppsCustomLaunchTests();
}

function setMyAppsIconPreviewAdjustable(adjustable) {
    elements.myAppsIconSelectLabel.parentElement.classList.toggle('tool-pro-locked', !getCapabilities().customMyAppIconWrite);
    elements.myAppsIconSelectLabel.parentElement.setAttribute('aria-label', getCapabilities().customMyAppIconWrite ? 'アイコン画像を選択' : 'アイコン画像を選択（Pro版機能）');
    elements.myAppsIconAdjustHint.classList.toggle('tool-pro-locked', adjustable && !getCapabilities().customMyAppIconWrite);
    elements.myAppsIconPreview.setAttribute('aria-label', getCapabilities().customMyAppIconWrite ? 'アイコンを再調整' : 'アイコンを再調整（Pro版機能）');
    if (adjustable) {
        elements.myAppsIconPreview.dataset.adjustable = 'true';
    } else {
        delete elements.myAppsIconPreview.dataset.adjustable;
    }
    elements.myAppsIconPreview.disabled = !adjustable || myAppsState.saving || myAppsState.iconProcessing;
    elements.myAppsIconAdjustHint.hidden = !adjustable;
}

function showMyAppsBlobPreview(blob) {
    cleanupMyAppsObjectUrls('form');
    const generation = myAppsRenderGeneration.form;
    const icon = createMyAppIcon();
    const image = document.createElement('img');
    const objectUrl = URL.createObjectURL(blob);
    myAppsObjectUrls.form.add(objectUrl);
    image.alt = '';
    image.onload = () => {
        if (generation === myAppsRenderGeneration.form) icon.replaceChildren(image);
    };
    image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        myAppsObjectUrls.form.delete(objectUrl);
    };
    image.src = objectUrl;
    elements.myAppsIconPreview.replaceChildren(icon);
    setMyAppsIconPreviewAdjustable(true);
}

function iconProcessingErrorMessage(reason) {
    if (reason === 'file-too-large') return '画像は15MB以内で選択してください。';
    if (reason === 'svg-not-supported') return 'SVG画像は使用できません。PNG、JPEG、WebPなどの画像を選択してください。';
    return 'この画像形式を読み込めませんでした。別の画像を選んでください。';
}

function renderMyAppsCrop() {
    const session = myAppsState.cropSession;
    const cropState = myAppsState.cropState;
    if (!session || !cropState) return;
    const canvas = elements.myAppsCropCanvas;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
        session.prepared.source,
        cropState.offsetX,
        cropState.offsetY,
        cropState.sourceWidth * cropState.scale,
        cropState.sourceHeight * cropState.scale
    );
    elements.myAppsCropSlider.value = String(cropState.scale);
    const zoomPercent = Math.round((cropState.scale / cropState.minScale) * 100);
    elements.myAppsCropSlider.setAttribute('aria-valuetext', `${zoomPercent}%`);
}

function openMyAppsCropEditor(prepared, returnStatus, {
    action = 'replace',
    sourceBlob = null,
    initialCrop = null,
    useCurrentIconAsSource = false,
    legacySource = false
} = {}) {
    closeMyAppsCropEditor({ restoreStatus: false, restoreFocus: false });
    const cropState = initialCrop
        ? createCropStateFromMetadata(prepared.width, prepared.height, initialCrop)
        : createInitialCropState(prepared.width, prepared.height);
    myAppsState.cropSession = {
        prepared,
        returnStatus,
        action,
        sourceBlob,
        useCurrentIconAsSource,
        legacySource
    };
    myAppsState.cropState = cropState;
    myAppsState.cropPointers.clear();
    elements.myAppsCropSlider.min = String(cropState.minScale);
    elements.myAppsCropSlider.max = String(cropState.maxScale);
    elements.myAppsCropSlider.step = String((cropState.maxScale - cropState.minScale) / 1000);
    elements.myAppsCropStatus.textContent = legacySource
        ? '以前の形式の画像です。元の範囲まで戻す場合は「画像を変更」してください。'
        : '';
    elements.myAppsCropDialog.hidden = false;
    document.body.classList.add('my-apps-crop-open');
    updateMyAppsCustomLaunchTests();
    renderMyAppsCrop();
    elements.myAppsCropTitle.focus({ preventScroll: true });
}

function closeMyAppsCropEditor({ restoreStatus = true, restoreFocus = true } = {}) {
    const session = myAppsState.cropSession;
    if (session) session.prepared.cleanup();
    if (restoreStatus && session) elements.myAppsIconStatus.textContent = session.returnStatus;
    myAppsState.cropSession = null;
    myAppsState.cropState = null;
    myAppsState.cropPointers.clear();
    elements.myAppsCropDialog.hidden = true;
    document.body.classList.remove('my-apps-crop-open');
    const context = elements.myAppsCropCanvas.getContext('2d');
    context.clearRect(0, 0, elements.myAppsCropCanvas.width, elements.myAppsCropCanvas.height);
    elements.myAppsIconInput.value = '';
    updateMyAppsCustomLaunchTests();
    if (restoreFocus) elements.myAppsIconPreview.focus({ preventScroll: true });
}

function cropPointerPosition(event) {
    const rect = elements.myAppsCropCanvas.getBoundingClientRect();
    const scaleX = elements.myAppsCropCanvas.width / rect.width;
    const scaleY = elements.myAppsCropCanvas.height / rect.height;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
}

function handleCropPointerDown(event) {
    if (!myAppsState.cropSession) return;
    event.preventDefault();
    elements.myAppsCropCanvas.setPointerCapture?.(event.pointerId);
    myAppsState.cropPointers.set(event.pointerId, cropPointerPosition(event));
}

function handleCropPointerMove(event) {
    if (!myAppsState.cropPointers.has(event.pointerId) || !myAppsState.cropState) return;
    event.preventDefault();
    const previousPoints = [...myAppsState.cropPointers.values()];
    const previousPoint = myAppsState.cropPointers.get(event.pointerId);
    const currentPoint = cropPointerPosition(event);
    myAppsState.cropPointers.set(event.pointerId, currentPoint);
    const currentPoints = [...myAppsState.cropPointers.values()];
    myAppsState.cropState = currentPoints.length === 1
        ? moveCrop(
            myAppsState.cropState,
            currentPoint.x - previousPoint.x,
            currentPoint.y - previousPoint.y
        )
        : applyPinchGesture(myAppsState.cropState, previousPoints.slice(0, 2), currentPoints.slice(0, 2));
    renderMyAppsCrop();
}

function handleCropPointerEnd(event) {
    myAppsState.cropPointers.delete(event.pointerId);
    if (elements.myAppsCropCanvas.hasPointerCapture?.(event.pointerId)) {
        elements.myAppsCropCanvas.releasePointerCapture(event.pointerId);
    }
}

function handleCropSlider() {
    if (!myAppsState.cropState) return;
    const center = myAppsState.cropState.cropSize / 2;
    myAppsState.cropState = zoomCropAtPoint(
        myAppsState.cropState,
        Number(elements.myAppsCropSlider.value),
        center,
        center
    );
    renderMyAppsCrop();
}

async function confirmMyAppsCrop() {
    if (!guardImageWrite('customIcon')) return;
    const session = myAppsState.cropSession;
    const cropState = myAppsState.cropState;
    if (!session || !cropState || myAppsState.iconProcessing) return;
    myAppsState.iconProcessing = true;
    elements.myAppsCropConfirm.disabled = true;
    elements.myAppsCropCancel.disabled = true;
    elements.myAppsCropStatus.textContent = 'アイコン画像を作成しています…';
    const result = await encodePreparedMyAppIcon(session.prepared, cropState);
    if (myAppsState.cropSession !== session) return;
    myAppsState.iconProcessing = false;
    elements.myAppsCropConfirm.disabled = false;
    elements.myAppsCropCancel.disabled = false;
    if (!result.ok) {
        elements.myAppsCropStatus.textContent = iconProcessingErrorMessage(result.reason);
        return;
    }
    const iconCrop = cropStateToMetadata(cropState);
    closeMyAppsCropEditor({ restoreStatus: false });
    myAppsState.iconAction = session.action;
    myAppsState.iconBlob = result.blob;
    myAppsState.iconSourceBlob = session.sourceBlob;
    myAppsState.iconCrop = iconCrop;
    myAppsState.iconPresetKey = null;
    myAppsState.useCurrentIconAsSource = session.useCurrentIconAsSource;
    elements.myAppsIconSelectLabel.textContent = '画像を変更';
    elements.myAppsIconRemove.hidden = false;
    elements.myAppsIconStatus.textContent = session.action === 'readjust'
        ? '現在のアイコンを再調整しました。フォームの保存で反映されます。'
        : '調整したアイコン画像です。フォームの保存で反映されます。';
    showMyAppsBlobPreview(result.blob);
}

async function handleCurrentMyAppsIconAdjustment() {
    if (!guardImageWrite('customIcon')) return;
    if (
        elements.myAppsIconPreview.disabled
        || myAppsState.iconProcessing
        || myAppsState.saving
        || myAppsState.iconAction === 'remove'
    ) return;

    const item = findMyApp(myAppsState.activeId);
    const hasPendingReplacement = myAppsState.iconAction === 'replace' && myAppsState.iconSourceBlob;
    if (!hasPendingReplacement && !item?.iconId) return;
    const generation = myAppsRenderGeneration.form;
    const returnStatus = elements.myAppsIconStatus.textContent;
    myAppsState.iconProcessing = true;
    setMyAppsFormBusy(true);
    elements.myAppsIconStatus.textContent = '現在のアイコンを読み込んでいます…';

    let sourceBlob = null;
    let action = 'readjust';
    let initialCrop = null;
    let useCurrentIconAsSource = false;
    let legacySource = false;

    if (hasPendingReplacement) {
        sourceBlob = myAppsState.iconSourceBlob;
        action = 'replace';
        initialCrop = myAppsState.iconCrop;
    } else {
        if (item.iconSourceId) {
            const sourceResult = await myAppsIconStore.getIcon(item.iconSourceId);
            sourceBlob = sourceResult.ok ? sourceResult.record?.blob || null : null;
            if (sourceBlob) {
                initialCrop = myAppsState.iconAction === 'readjust'
                    ? myAppsState.iconCrop
                    : item.iconCrop;
            }
        }
        if (!sourceBlob) {
            const iconResult = await myAppsIconStore.getIcon(item.iconId);
            sourceBlob = iconResult.ok ? iconResult.record?.blob || null : null;
            useCurrentIconAsSource = true;
            legacySource = true;
            initialCrop = myAppsState.iconAction === 'readjust' && myAppsState.useCurrentIconAsSource
                ? myAppsState.iconCrop
                : null;
        }
    }

    if (generation !== myAppsRenderGeneration.form) return;
    if (!sourceBlob) {
        myAppsState.iconProcessing = false;
        setMyAppsFormBusy(false);
        elements.myAppsIconStatus.textContent = '現在のアイコン画像を読み込めませんでした。画像を変更してください。';
        return;
    }

    const prepared = await prepareMyAppIcon(sourceBlob);
    if (generation !== myAppsRenderGeneration.form) {
        if (prepared.ok) prepared.cleanup();
        return;
    }
    myAppsState.iconProcessing = false;
    setMyAppsFormBusy(false);
    if (!prepared.ok) {
        elements.myAppsIconStatus.textContent = iconProcessingErrorMessage(prepared.reason);
        return;
    }
    openMyAppsCropEditor(prepared, returnStatus, {
        action,
        sourceBlob: action === 'replace' ? sourceBlob : null,
        initialCrop,
        useCurrentIconAsSource,
        legacySource
    });
}

async function handleMyAppsIconSelection() {
    if (!guardImageWrite('customIcon')) { elements.myAppsIconInput.value = ''; return; }
    const file = elements.myAppsIconInput.files?.[0];
    if (!file) return;
    elements.myAppsIconInput.value = '';
    setMyAppsPresetPickerOpen(false);
    const generation = myAppsRenderGeneration.form;
    const returnStatus = elements.myAppsIconStatus.textContent;
    myAppsState.iconProcessing = true;
    setMyAppsFormBusy(true);
    elements.myAppsIconStatus.textContent = '画像を準備しています…';
    const result = await prepareMyAppEditorSource(file);
    if (generation !== myAppsRenderGeneration.form) {
        if (result.ok) result.cleanup();
        return;
    }
    myAppsState.iconProcessing = false;
    setMyAppsFormBusy(false);
    if (!result.ok) {
        elements.myAppsIconStatus.textContent = iconProcessingErrorMessage(result.reason);
        return;
    }
    openMyAppsCropEditor(result, returnStatus, {
        action: 'replace',
        sourceBlob: result.blob
    });
}

function removeMyAppsIcon() {
    myAppsState.iconAction = 'remove';
    myAppsState.iconBlob = null;
    myAppsState.iconSourceBlob = null;
    myAppsState.iconCrop = null;
    myAppsState.iconPresetKey = null;
    myAppsState.useCurrentIconAsSource = false;
    elements.myAppsIconInput.value = '';
    elements.myAppsIconSelectLabel.textContent = '画像を選択';
    elements.myAppsIconRemove.hidden = true;
    elements.myAppsIconStatus.textContent = '保存すると汎用アイコンへ戻ります。';
    cleanupMyAppsObjectUrls('form');
    elements.myAppsIconPreview.replaceChildren(createMyAppIcon());
    setMyAppsIconPreviewAdjustable(false);
    renderMyAppsPresetPicker();
}

function renderMyAppsForm(mode, id = null) {
    if (mode === 'create' && !guardMyAppsCreation()) { setHashRoute('#my-apps/manage'); return; }
    if (!myAppsState.storageReady) {
        replaceHomeRoute();
        return;
    }
    const item = mode === 'edit' ? findMyApp(id) : null;
    if (mode === 'edit' && !item) {
        renderMyAppsNotFound();
        return;
    }
    myAppsState.formMode = mode;
    myAppsState.activeId = item?.id || null;
    elements.myAppsFormTitle.textContent = mode === 'edit' ? 'My Appを編集' : 'My Appを追加';
    fillMyAppsForm(item);
    showView(elements.myAppsFormView);
    elements.myAppsFormTitle.focus({ preventScroll: true });
}

function readMyAppsFormValues() {
    const appKey = !elements.myAppsDirectLaunch.hidden && elements.myAppsDirectEnabled.checked
        ? myAppsState.knownLaunchForm.activeAppKey
        : null;
    let launchMode = appKey ? 'known-app' : 'https';
    let customLaunch = null;
    if (
        !appKey
        && !elements.myAppsCustomLaunch.hidden
        && elements.myAppsCustomEnabled.checked
    ) {
        const customResult = normalizeCustomLaunch({
            ios: elements.myAppsCustomIosInput.value.trim() || null,
            android: elements.myAppsCustomAndroidInput.value.trim() || null
        });
        if (!customResult.ok) {
            return {
                ok: false,
                message: '起動用URLはHTTPSで入力してください。iPhone・iPad用またはAndroid用のどちらか1つは必要です。'
            };
        }
        launchMode = 'custom';
        customLaunch = customResult.value;
    }
    const valuesResult = validateMyAppValues({
        name: elements.myAppsNameInput.value,
        url: elements.myAppsUrlInput.value,
        launchMode,
        appKey,
        customLaunch
    });
    if (valuesResult.ok) return valuesResult;
    if (valuesResult.reason === 'invalid-name') {
        return { ok: false, message: `アプリ名は1〜${MY_APPS_LIMITS.name}文字で入力してください。` };
    }
    return { ok: false, message: 'HTTPS URLを入力してください。http、独自scheme、認証情報付きURLは登録できません。' };
}

async function handleMyAppsSubmit(event) {
    event.preventDefault();
    showNotice(elements.myAppsFormError);
    if (myAppsState.iconProcessing || myAppsState.saving) {
        showNotice(elements.myAppsFormError, '画像の準備が終わるまでお待ちください。');
        return;
    }
    const formResult = readMyAppsFormValues();
    if (!formResult.ok) {
        showNotice(elements.myAppsFormError, formResult.message);
        return;
    }

    if (myAppsState.formMode !== 'edit' && !guardMyAppsCreation()) return;
    if (['replace', 'readjust'].includes(myAppsState.iconAction) && !guardImageWrite('customIcon')) return;
    const formGeneration = myAppsRenderGeneration.form;
    setMyAppsFormBusy(true);
    const result = myAppsState.formMode === 'edit'
        ? await updateMyAppEntry({
            items: myAppsState.items,
            id: myAppsState.activeId,
            values: formResult.values,
            iconAction: myAppsState.iconAction,
            iconBlob: myAppsState.iconBlob,
            iconSourceBlob: myAppsState.iconSourceBlob,
            iconCrop: myAppsState.iconCrop,
            iconPresetKey: myAppsState.iconAction === 'preset' ? myAppsState.iconPresetKey : null,
            useCurrentIconAsSource: myAppsState.useCurrentIconAsSource,
            iconStore: myAppsIconStore
        })
        : await createMyAppEntry({
            items: myAppsState.items,
            values: formResult.values,
            iconBlob: myAppsState.iconAction === 'replace' ? myAppsState.iconBlob : null,
            iconSourceBlob: myAppsState.iconAction === 'replace' ? myAppsState.iconSourceBlob : null,
            iconCrop: myAppsState.iconAction === 'replace' ? myAppsState.iconCrop : null,
            iconPresetKey: myAppsState.iconAction === 'preset' ? myAppsState.iconPresetKey : null,
            iconStore: myAppsIconStore
        });

    if (formGeneration !== myAppsRenderGeneration.form) {
        if (result.ok) myAppsState.items = result.items;
        return;
    }
    if (!result.ok) {
        setMyAppsFormBusy(false);
        if (result.reason === 'creation-blocked') {
            guardMyAppsCreation();
            if (myAppsState.iconAction === 'replace') guardImageWrite('customIcon');
        } else if (result.reason === 'pro-required') {
            requestToolPro('customIcon');
        } else if (result.reason === 'not-found') {
            renderMyAppsNotFound();
        } else if (result.reason === 'limit-reached') {
            showNotice(elements.myAppsFormError, `My Appsは${MY_APPS_LIMITS.items}件まで登録できます。`);
        } else if (result.reason === 'icon-write-failed') {
            showNotice(elements.myAppsFormError, 'アイコン画像を保存できませんでした。Safariの保存設定や空き容量を確認して、もう一度お試しください。');
        } else {
            showNotice(elements.myAppsFormError, '保存できませんでした。Safariの保存設定や空き容量を確認してください。');
        }
        return;
    }
    myAppsState.items = result.items;
    if (myAppsState.formMode === 'edit') setHashRoute('#my-apps/manage');
    else replaceHomeRouteWithMyAppsScroll();
}

function cancelMyAppsForm() {
    if (myAppsState.formMode === 'edit') {
        setHashRoute('#my-apps/manage');
    } else {
        setHomeRoute();
    }
}

async function handleMyAppsDelete() {
    const item = findMyApp(myAppsState.activeId);
    if (!item) {
        renderMyAppsNotFound();
        return;
    }
    const referenceCount = state.storageReady
        ? countPracticeMenuReferences(state.items, item.id)
        : null;
    const referenceWarning = referenceCount > 0
        ? `\n\nこのアプリは練習メニュー${referenceCount}件で使用されています。削除すると、それらの練習メニューではアプリを開けなくなります。`
        : '';
    if (!window.confirm(`このアプリをMy Appsから削除しますか？${referenceWarning}\n外部アプリ自体は削除されません。`)) return;
    if (myAppsState.saving) return;
    const formGeneration = myAppsRenderGeneration.form;
    setMyAppsFormBusy(true);
    const result = await deleteMyAppEntry({
        items: myAppsState.items,
        id: item.id,
        iconStore: myAppsIconStore
    });
    if (formGeneration !== myAppsRenderGeneration.form) {
        if (result.ok) myAppsState.items = result.items;
        return;
    }
    if (!result.ok) {
        setMyAppsFormBusy(false);
        showNotice(elements.myAppsFormError, '削除できませんでした。Safariの保存設定や空き容量を確認してください。');
        return;
    }
    myAppsState.items = result.items;
    setHashRoute('#my-apps/manage');
}

function renderHome() {
    showView(elements.homeView);
    renderMyAppsHome();
    const targetId = pendingHomeScrollTarget;
    pendingHomeScrollTarget = null;
    if (targetId) {
        requestAnimationFrame(() => {
            const target = document.querySelector(`#${targetId}`);
            if (!target) return;
            const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
        });
    }
}

function getActivePracticeItems() {
    return state.items.filter((item) => !item.hidden);
}

function getHiddenPracticeItems() {
    return state.items.filter((item) => item.hidden);
}

function mergeReorderedActiveItems(items, reorderedActiveItems) {
    let activeIndex = 0;
    return items.map((item) => item.hidden ? item : reorderedActiveItems[activeIndex++]);
}

function persistPracticeProgress(nextProgress) {
    const result = savePracticeProgress(nextProgress);
    if (!result.ok) return false;
    state.progress = nextProgress;
    return true;
}

function persistPracticeActivity(nextProgress, nextHistory) {
    const previousProgress = state.progress;
    const progressResult = savePracticeProgress(nextProgress);
    if (!progressResult.ok) return false;
    const historyResult = savePracticeHistory(nextHistory);
    if (!historyResult.ok) {
        savePracticeProgress(previousProgress);
        return false;
    }
    state.progress = nextProgress;
    state.history = nextHistory;
    return true;
}

function persistPracticeCalendar(nextCalendar) {
    const result = savePracticeCalendar(nextCalendar);
    if (!result.ok) return false;
    state.calendar = nextCalendar;
    return true;
}

function updatePracticeTimerDisplay() {
    const running = Boolean(state.timerReady && state.timer?.running);
    const elapsedSeconds = running ? getPracticeTimerElapsedSeconds(state.timer) : 0;
    elements.timerToggle.disabled = !state.timerReady
        || !state.historyReady
        || Boolean(state.progress?.completionPending);
    elements.timerToggle.classList.toggle('is-running', running);
    elements.timerToggle.setAttribute('aria-label', running ? '練習を終了する' : '練習タイマーを開始する');
    elements.timerIcon.textContent = running ? '■' : '▶';
    elements.timerLabel.textContent = running ? '練習終了' : '練習スタート';
    elements.timerDisplay.textContent = formatPracticeTimerDuration(elapsedSeconds);
    elements.timerDisplay.dateTime = `PT${elapsedSeconds}S`;
    elements.timerDisplay.classList.toggle('is-running', running);
}

function ensurePracticeTimerTicking() {
    window.clearInterval(state.timerInterval);
    state.timerInterval = null;
    updatePracticeTimerDisplay();
    if (!state.timer?.running) return;
    state.timerInterval = window.setInterval(updatePracticeTimerDisplay, 500);
}

function stopPracticeTimerWithHistory(now = new Date()) {
    if (!state.timerReady || !state.historyReady) {
        return { ok: false, message: 'タイマーまたは履歴を読み込めないため、練習を終了できません。' };
    }
    if (!state.timer.running) return { ok: true, stopped: false, session: null };
    const transition = stopPracticeTimer(state.timer, now);
    if (!transition.stopped) return { ok: false, message: 'タイマーを終了できませんでした。計測を継続しています。' };
    const historyResult = appendPracticeHistoryEvent(
        state.history,
        createPracticeSessionEvent(transition.session)
    );
    if (!historyResult.ok) {
        return { ok: false, message: '練習記録を作成できませんでした。タイマーは継続しています。' };
    }
    const previousHistory = state.history;
    if (!savePracticeHistory(historyResult.history).ok) {
        return { ok: false, message: '練習記録を保存できませんでした。タイマーは継続しています。' };
    }
    if (!savePracticeTimer(transition.timer).ok) {
        savePracticeHistory(previousHistory);
        return { ok: false, message: 'タイマーを終了できませんでした。計測を継続しています。' };
    }
    state.history = historyResult.history;
    state.timer = transition.timer;
    ensurePracticeTimerTicking();
    const sessionEntry = createPracticeDayHistoryView(
        state.history,
        toLocalDateKey(new Date(transition.session.endedAt))
    ).find(({ kind, event }) => kind === 'session' && event.sessionId === transition.session.sessionId);
    return {
        ok: true,
        stopped: true,
        session: transition.session,
        displayDurationSeconds: sessionEntry?.displayDurationSeconds ?? transition.session.durationSeconds
    };
}

function handlePracticeTimerToggle() {
    if (!state.timerReady || !state.historyReady || state.progress?.completionPending) return;
    showNotice(elements.timerStatus);
    if (!state.timer.running) {
        const transition = startPracticeTimer(state.timer);
        if (!transition.started || !savePracticeTimer(transition.timer).ok) {
            showNotice(elements.timerStatus, '練習タイマーを開始できませんでした。保存設定を確認してください。');
            return;
        }
        state.timer = transition.timer;
        ensurePracticeTimerTicking();
        renderPracticeList({ focus: false });
        return;
    }
    const result = stopPracticeTimerWithHistory();
    showNotice(
        elements.timerStatus,
        result.ok
            ? `練習時間 ${formatPracticeSessionDuration(result.displayDurationSeconds)}を記録しました。`
            : result.message
    );
    renderPracticeList({ focus: false });
}

function setPracticeCompletionBackgroundInert(inert) {
    document.querySelectorAll('.port-view, .port-global-refresh-bar, .port-footer').forEach((element) => {
        element.inert = inert;
    });
}

function closePracticeCompletionDialog() {
    elements.completionDialog.hidden = true;
    elements.completionDialog.classList.remove('is-partial');
    document.body.classList.remove('practice-completion-open');
    setPracticeCompletionBackgroundInert(false);
    showNotice(elements.completionError);
}

function syncPracticeCompletionDialog({ focus = true } = {}) {
    const pending = state.progressReady ? state.progress?.completionPending : null;
    if (!pending) {
        if (!elements.completionDialog.hidden) closePracticeCompletionDialog();
        return;
    }
    const complete = pending.type === PRACTICE_COMPLETION_TYPE.complete;
    elements.completionDialog.classList.toggle('is-partial', !complete);
    elements.completionTitle.textContent = complete ? 'お疲れさまでした！' : 'お疲れさまでした';
    elements.completionDescription.textContent = complete
        ? '今日の練習メニューをすべて完了しました。'
        : '今日の練習、おつかれさまでした。';
    elements.completionEnd.disabled = state.completionActionInProgress;
    elements.completionCalendar.disabled = state.completionActionInProgress;
    const wasHidden = elements.completionDialog.hidden;
    elements.completionDialog.hidden = false;
    document.body.classList.add('practice-completion-open');
    setPracticeCompletionBackgroundInert(true);
    if (wasHidden && focus) elements.completionEnd.focus({ preventScroll: true });
}

function persistPracticeCheck(item, checked) {
    const now = new Date();
    const transition = setPracticeChecked(state.progress, item.id, checked);
    if (!transition.changed) return { changed: false, completionStarted: false };
    let nextProgress = transition.progress;
    let nextHistory = state.history;
    let historyChanged = false;

    if (transition.countAdded) {
        const individualResult = appendPracticeHistoryEvent(
            nextHistory,
            createPracticeCompletedEvent(
                item,
                state.progress.cycleId,
                now,
                state.timerReady && state.timer?.running ? state.timer.sessionId : null
            ),
            state.timerReady ? state.timer : null
        );
        if (!individualResult.ok) return { changed: false, completionStarted: false, failed: true };
        nextHistory = individualResult.history;
        historyChanged = true;
    }

    let completionStarted = false;
    const activeIds = getActivePracticeItems().map((activeItem) => activeItem.id);
    if (checked && canCompletePracticeCycle(nextProgress, activeIds)) {
        const completion = beginPracticeCompletion(
            nextProgress,
            PRACTICE_COMPLETION_TYPE.complete,
            activeIds,
            now
        );
        if (completion.started) {
            const cycleResult = appendPracticeHistoryEvent(
                nextHistory,
                createCycleCompletedEvent(completion.progress.cycleId, now)
            );
            if (!cycleResult.ok) return { changed: false, completionStarted: false, failed: true };
            nextProgress = completion.progress;
            nextHistory = cycleResult.history;
            historyChanged = true;
            completionStarted = true;
        }
    }

    const persisted = historyChanged
        ? persistPracticeActivity(nextProgress, nextHistory)
        : persistPracticeProgress(nextProgress);
    return { changed: persisted, completionStarted: persisted && completionStarted, failed: !persisted };
}

function handlePracticeCheck(item) {
    if (!state.progressReady || !state.historyReady || item.hidden || state.progress.completionPending) return;
    const checked = state.progress.checkedPracticeIds.includes(item.id);
    const result = persistPracticeCheck(item, !checked);
    if (result.failed) {
        state.listNotice = '練習記録を保存できませんでした。チェック状態は変更していません。';
    }
    renderPracticeList({
        focus: false,
        focusCheckId: result.completionStarted ? null : item.id
    });
    if (result.completionStarted) syncPracticeCompletionDialog();
}

function handlePracticeCycleReset() {
    if (!state.progressReady) return;
    const hasCycleActivity = state.progress.checkedPracticeIds.length > 0
        || state.progress.countedPracticeIds.length > 0;
    if (!hasCycleActivity) return;
    if (!window.confirm('チェックをすべてリセットして、次の練習サイクルを始めますか？\n通算回数と履歴は残ります。')) return;
    const nextProgress = startNextPracticeCycle(state.progress);
    if (!persistPracticeProgress(nextProgress)) {
        state.listNotice = 'チェックをリセットできませんでした。現在の進捗は変更していません。';
    } else {
        state.listNotice = 'チェックをリセットしました。';
    }
    renderPracticeList({ focus: false });
}

function handlePracticeFinishEarly() {
    if (!state.progressReady || state.progress.completionPending) return;
    const activeIds = getActivePracticeItems().map((item) => item.id);
    const hasActivity = Boolean(state.timerReady && state.timer?.running)
        || state.progress.checkedPracticeIds.length > 0;
    if (activeIds.length === 0 || !hasActivity) return;
    const transition = beginPracticeCompletion(
        state.progress,
        PRACTICE_COMPLETION_TYPE.partial,
        activeIds
    );
    if (!transition.started || !persistPracticeProgress(transition.progress)) {
        state.listNotice = '練習終了の状態を保存できませんでした。現在の進捗は変更していません。';
        renderPracticeList({ focus: false });
        return;
    }
    renderPracticeList({ focus: false });
    syncPracticeCompletionDialog();
}

function handlePracticeCompletionAction(destination) {
    if (state.completionActionInProgress || !state.progress?.completionPending) return;
    state.completionActionInProgress = true;
    showNotice(elements.completionError);
    syncPracticeCompletionDialog({ focus: false });

    const timerResult = stopPracticeTimerWithHistory();
    if (!timerResult.ok) {
        state.completionActionInProgress = false;
        showNotice(elements.completionError, timerResult.message);
        syncPracticeCompletionDialog({ focus: false });
        return;
    }

    const transition = finishPracticeCompletion(state.progress);
    if (!transition.finished || !persistPracticeProgress(transition.progress)) {
        state.completionActionInProgress = false;
        showNotice(elements.completionError, '次の練習サイクルを開始できませんでした。もう一度お試しください。');
        syncPracticeCompletionDialog({ focus: false });
        return;
    }

    state.completionActionInProgress = false;
    closePracticeCompletionDialog();
    if (destination === 'calendar') {
        setPracticeCalendarSelectedDate(new Date());
        state.calendarViewMode = 'month';
        openPracticeCalendar(PRACTICE_CALENDAR_ENTRY_SOURCE.practice);
        return;
    }
    setHomeRoute();
}

function renderPracticeHiddenList() {
    showView(elements.practiceHiddenView);
    const hiddenItems = getHiddenPracticeItems();
    elements.hiddenList.replaceChildren(...hiddenItems.map(renderHiddenPracticeCard));
    elements.hiddenEmpty.hidden = hiddenItems.length > 0;
    showNotice(elements.hiddenNotice, state.listNotice);
    state.listNotice = '';
    elements.hiddenTitle.focus({ preventScroll: true });
}

const PRACTICE_CALENDAR_WEEKDAYS = Object.freeze(['日', '月', '火', '水', '木', '金', '土']);

function practiceLocalDateToDate(localDate) {
    const [year, month, day] = localDate.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
}

function setPracticeCalendarSelectedDate(date) {
    state.historySelectedDate = toLocalDateKey(date);
    state.historyMonth = new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftPracticeCalendarDate({ days = 0, months = 0 }) {
    const current = practiceLocalDateToDate(state.historySelectedDate);
    if (months) {
        const intendedDay = current.getDate();
        current.setDate(1);
        current.setMonth(current.getMonth() + months);
        current.setDate(Math.min(intendedDay, new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()));
    }
    if (days) current.setDate(current.getDate() + days);
    setPracticeCalendarSelectedDate(current);
}

function getPracticeCalendarWeekDates(localDate) {
    const selected = practiceLocalDateToDate(localDate);
    selected.setDate(selected.getDate() - selected.getDay());
    return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(selected);
        date.setDate(selected.getDate() + index);
        return date;
    });
}

function closePracticeCalendarNoteForm() {
    cleanupPracticeCalendarKeyboardTracking();
    setPracticeCalendarIconDropdownOpen(false);
    state.calendarNoteEditId = null;
    state.calendarNoteIcon = PRACTICE_CALENDAR_DEFAULT_ICON;
    state.calendarNoteUserEdited = false;
    elements.calendarNoteForm.hidden = true;
    elements.calendarNoteTime.value = '';
    elements.calendarNoteEndTime.value = '';
    syncPracticeCalendarEndTimeOptions();
    elements.calendarNoteText.value = '';
    showNotice(elements.calendarNoteError);
}

const calendarKeyboard = createPracticeCalendarKeyboard({
    windowObject: window,
    form: elements.calendarNoteForm,
    getInputBounds: () => ({
        top: elements.calendarNoteIconToggle.closest('fieldset').getBoundingClientRect().top,
        bottom: elements.calendarNoteText.getBoundingClientRect().bottom
    })
});

function activatePracticeCalendarKeyboardTracking() {
    calendarKeyboard.start(document.activeElement);
}

function cleanupPracticeCalendarKeyboardTracking() {
    calendarKeyboard.stop();
}

const PRACTICE_CALENDAR_ICON_SHAPES = Object.freeze({
    practice: [['path', { d: 'M12 3C8.2 3 4.2 3.5 3.1 6.1c-1 2.5 2.5 10.1 5.9 13.6a4.2 4.2 0 0 0 6 0c3.4-3.5 6.9-11.1 5.9-13.6C19.8 3.5 15.8 3 12 3Z', fill: 'currentColor', stroke: 'none' }]],
    studio: [['circle', { cx: 12, cy: 16, r: 4 }], ['rect', { x: 6, y: 8, width: 5, height: 4, rx: 1 }], ['rect', { x: 13, y: 8, width: 5, height: 4, rx: 1 }], ['path', { d: 'M2 6h5M4 4v16M2 21l2-3 2 3M18 5h4M20 3v17M18 21l2-3 2 3' }]],
    work: [['path', { d: 'M4 20l2-6L17 3l4 4L10 18zM14 6l4 4M6 14l4 4M4 20l6-2' }]],
    schedule: [['rect', { x: 4, y: 5.5, width: 16, height: 14, rx: 2 }], ['path', { d: 'M8 3.5v4M16 3.5v4M4 10h16' }]],
    live: [['path', { d: 'M3.3 20.2c-1-1-1-2.5 0-3.5l7.8-7.8c-.8-1.7-.4-3.8 1-5.2l.9-.9c2.1-2.1 5.5-2.1 7.6 0s2.1 5.5 0 7.6l-.9.9c-1.4 1.4-3.5 1.8-5.2 1l-7.8 7.8c-1 1-2.4 1.1-3.4.1zM11.8 5.4l6.8 6.6 1.3-1.3-6.8-6.7z', fill: 'currentColor', 'fill-rule': 'evenodd', 'clip-rule': 'evenodd', stroke: 'none' }]],
    rehearsal: [['circle', { cx: 9, cy: 8, r: 3 }], ['circle', { cx: 17, cy: 9, r: 2.5 }], ['path', { d: 'M3.5 19c.6-3.6 2.4-5.5 5.5-5.5s4.9 1.9 5.5 5.5M14 14.5c3.6-.7 5.8.8 6.5 4.5' }]],
    recording: [['rect', { x: 8, y: 3, width: 8, height: 12, rx: 4 }], ['path', { d: 'M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8' }]],
    'string-change': [['path', { d: 'M9 3h6l1.5 14h-9zM9 17v4h6v-4M8.5 6H6M8 10H6M7.7 14H6M15.5 6H18M16 10h2M16.3 14H18' }], ['circle', { cx: 5, cy: 6, r: 1 }], ['circle', { cx: 5, cy: 10, r: 1 }], ['circle', { cx: 5, cy: 14, r: 1 }], ['circle', { cx: 19, cy: 6, r: 1 }], ['circle', { cx: 19, cy: 10, r: 1 }], ['circle', { cx: 19, cy: 14, r: 1 }]],
    maintenance: [['path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-8 8l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 8-8z' }]],
    memo: [['path', { d: 'M6 3.5h9l3 3V20H6zM15 3.5V7h3M9 11h6M9 15h6' }]],
    rest: [['path', { d: 'M4 10h12v5a6 6 0 0 1-12 0zM16 11h2a3 3 0 0 1 0 6h-3M2 22h18M6 3c-2 2 2 3 0 5M10 3c-2 2 2 3 0 5M14 3c-2 2 2 3 0 5' }]]
});

function createPracticeCalendarIcon(icon, className = '') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    if (className) svg.setAttribute('class', className);
    (PRACTICE_CALENDAR_ICON_SHAPES[icon === 'memo' ? 'schedule' : icon] || PRACTICE_CALENDAR_ICON_SHAPES.schedule).forEach(([tagName, attributes]) => {
        const shape = document.createElementNS('http://www.w3.org/2000/svg', tagName);
        Object.entries(attributes).forEach(([name, value]) => shape.setAttribute(name, String(value)));
        svg.append(shape);
    });
    return svg;
}

function getPracticeCalendarIconDefinition(value = state.calendarNoteIcon) {
    const normalizedValue = value === 'memo' ? 'schedule' : value;
    return PRACTICE_CALENDAR_ICONS.find(({ value: iconValue }) => iconValue === normalizedValue)
        || PRACTICE_CALENDAR_ICONS.find(({ value: iconValue }) => iconValue === PRACTICE_CALENDAR_DEFAULT_ICON);
}

function setPracticeCalendarIconDropdownOpen(open, { focusOption = false, restoreFocus = false } = {}) {
    const nextOpen = Boolean(open && !elements.calendarNoteForm.hidden);
    state.calendarNoteIconDropdownOpen = nextOpen;
    elements.calendarNoteIcons.hidden = !nextOpen;
    elements.calendarNoteIconToggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    if (nextOpen && focusOption) {
        elements.calendarNoteIcons.querySelector('[role="option"][aria-selected="true"]')?.focus({ preventScroll: true });
    } else if (!nextOpen && restoreFocus) {
        elements.calendarNoteIconToggle.focus({ preventScroll: true });
    }
}

function renderPracticeCalendarIconSelection() {
    const icon = getPracticeCalendarIconDefinition();
    const label = document.createElement('span');
    label.textContent = icon.label;
    elements.calendarNoteIconSelection.replaceChildren(createPracticeCalendarIcon(icon.value), label);
    elements.calendarNoteIconToggle.setAttribute('aria-label', `表示アイコン：${icon.label}`);
}

function renderPracticeCalendarIconChoices() {
    elements.calendarNoteIcons.replaceChildren(...PRACTICE_CALENDAR_ICONS.map(({ value, label }) => {
        const button = document.createElement('button');
        const text = document.createElement('span');
        button.type = 'button';
        button.id = `practice-calendar-note-icon-${value}`;
        button.setAttribute('role', 'option');
        button.dataset.calendarNoteIcon = value;
        button.setAttribute('aria-label', `表示アイコン：${label}`);
        const selected = value === getPracticeCalendarIconDefinition().value;
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
        button.tabIndex = selected ? 0 : -1;
        button.append(createPracticeCalendarIcon(value), text);
        text.textContent = label;
        return button;
    }));
    renderPracticeCalendarIconSelection();
}

function selectPracticeCalendarIcon(value, { restoreFocus = true } = {}) {
    const icon = PRACTICE_CALENDAR_ICONS.find(({ value: iconValue }) => iconValue === value);
    if (!icon) return;
    state.calendarNoteIcon = icon.value;
    if (!state.calendarNoteUserEdited) elements.calendarNoteText.value = icon.label;
    renderPracticeCalendarIconChoices();
    setPracticeCalendarIconDropdownOpen(false, { restoreFocus });
}

function movePracticeCalendarIconFocus(direction) {
    const options = [...elements.calendarNoteIcons.querySelectorAll('[role="option"]')];
    if (options.length === 0) return;
    const currentIndex = Math.max(0, options.indexOf(document.activeElement));
    const nextIndex = direction === 'first'
        ? 0
        : direction === 'last'
            ? options.length - 1
            : (currentIndex + direction + options.length) % options.length;
    options.forEach((option, index) => { option.tabIndex = index === nextIndex ? 0 : -1; });
    options[nextIndex].focus({ preventScroll: true });
}

function renderPracticeCalendarTimeOptions() {
    for (const select of [elements.calendarNoteTime, elements.calendarNoteEndTime]) {
        if (select.options.length > 1) continue;
        select.append(...PRACTICE_CALENDAR_TIME_OPTIONS.map((value) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            return option;
        }));
    }
}

function ensurePracticeCalendarTimeOption(select, value) {
    select.querySelectorAll('[data-legacy-time]').forEach((option) => option.remove());
    if (!value || [...select.options].some((option) => option.value === value)) return;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    option.dataset.legacyTime = 'true';
    select.append(option);
}

function syncPracticeCalendarEndTimeOptions() {
    const startTime = elements.calendarNoteTime.value;
    elements.calendarNoteEndTime.disabled = !startTime;
    [...elements.calendarNoteEndTime.options].forEach((option) => {
        option.disabled = Boolean(option.value && (!startTime || option.value <= startTime));
    });
    if (!isValidPracticeCalendarTimeRange(startTime, elements.calendarNoteEndTime.value)) {
        elements.calendarNoteEndTime.value = '';
    }
}

function openPracticeCalendarNoteForm(note = null) {
    cleanupPracticeCalendarKeyboardTracking();
    renderPracticeCalendarTimeOptions();
    state.calendarNoteEditId = note?.id || null;
    state.calendarNoteIcon = note?.icon || PRACTICE_CALENDAR_DEFAULT_ICON;
    state.calendarNoteUserEdited = Boolean(note);
    ensurePracticeCalendarTimeOption(elements.calendarNoteTime, note?.time || '');
    ensurePracticeCalendarTimeOption(elements.calendarNoteEndTime, note?.endTime || '');
    elements.calendarNoteTime.value = note?.time || '';
    elements.calendarNoteEndTime.value = note?.endTime || '';
    syncPracticeCalendarEndTimeOptions();
    elements.calendarNoteText.value = note?.text || '';
    renderPracticeCalendarIconChoices();
    elements.calendarNoteForm.hidden = false;
    setPracticeCalendarIconDropdownOpen(false);
    showNotice(elements.calendarNoteError);
    elements.calendarNoteText.focus();
}

function renderPracticeCalendarNotes() {
    const notes = getPracticeCalendarNotesForDate(state.calendar, state.historySelectedDate);
    elements.calendarNotesList.replaceChildren();
    notes.forEach((note) => {
        const row = document.createElement('article');
        const copy = document.createElement('div');
        const text = document.createElement('p');
        const actions = document.createElement('div');
        const edit = document.createElement('button');
        const remove = document.createElement('button');
        row.className = 'practice-calendar-note';
        row.append(createPracticeCalendarIcon(note.icon, 'practice-calendar-note-icon'));
        copy.className = 'practice-calendar-note-copy';
        actions.className = 'practice-calendar-note-actions';
        if (note.time) {
            const time = document.createElement('time');
            time.dateTime = `${note.localDate}T${note.time}`;
            time.textContent = note.endTime ? `${note.time}–${note.endTime}` : note.time;
            copy.append(time);
        }
        text.textContent = note.text;
        copy.append(text);
        edit.type = 'button';
        edit.dataset.calendarNoteAction = 'edit';
        edit.dataset.id = note.id;
        edit.textContent = '編集';
        remove.type = 'button';
        remove.dataset.calendarNoteAction = 'delete';
        remove.dataset.id = note.id;
        remove.textContent = '削除';
        actions.append(edit, remove);
        row.append(copy, actions);
        elements.calendarNotesList.append(row);
    });
    elements.calendarNotesEmpty.hidden = notes.length > 0;
    elements.calendarNoteAdd.disabled = !state.calendarReady
        || state.calendar.notes.length >= PRACTICE_CALENDAR_LIMITS.notes;
    if (state.calendarNoteEditId && !notes.some((note) => note.id === state.calendarNoteEditId)) {
        closePracticeCalendarNoteForm();
    }
}

function handlePracticeCalendarNoteSubmit(event) {
    event.preventDefault();
    if (!state.calendarReady) return;
    const time = elements.calendarNoteTime.value;
    const endTime = elements.calendarNoteEndTime.value;
    if (time && !isValidPracticeCalendarTime(time)) {
        showNotice(elements.calendarNoteError, '時刻を00:00〜23:59で入力してください。');
        return;
    }
    if (!isValidPracticeCalendarTimeRange(time, endTime)) {
        showNotice(elements.calendarNoteError, '終了時刻は開始時刻より後を選んでください。');
        return;
    }
    const result = state.calendarNoteEditId
        ? updatePracticeCalendarNote(state.calendar, state.calendarNoteEditId, {
            text: elements.calendarNoteText.value,
            icon: state.calendarNoteIcon,
            time,
            endTime
        })
        : createPracticeCalendarNote(state.calendar, {
            localDate: state.historySelectedDate,
            text: elements.calendarNoteText.value,
            icon: state.calendarNoteIcon,
            time,
            endTime
        });
    if (!result.ok) {
        showNotice(
            elements.calendarNoteError,
            result.reason === 'limit-reached'
                ? `予定・メモは全体で${PRACTICE_CALENDAR_LIMITS.notes}件まで保存できます。`
                : '予定・メモを1〜500文字で入力してください。'
        );
        return;
    }
    if (!persistPracticeCalendar(result.calendar)) {
        showNotice(elements.calendarNoteError, '予定・メモを保存できませんでした。');
        return;
    }
    closePracticeCalendarNoteForm();
    renderPracticeHistory({ focus: false });
}

function handlePracticeCalendarNoteAction(event) {
    const button = event.target.closest('[data-calendar-note-action]');
    if (!button || !state.calendarReady) return;
    const note = state.calendar.notes.find(({ id }) => id === button.dataset.id);
    if (!note) return;
    if (button.dataset.calendarNoteAction === 'edit') {
        openPracticeCalendarNoteForm(note);
        return;
    }
    if (!window.confirm('この予定・メモを削除しますか？')) return;
    const result = deletePracticeCalendarNote(state.calendar, note.id);
    if (!result.ok || !persistPracticeCalendar(result.calendar)) {
        showNotice(elements.historyError, '予定・メモを削除できませんでした。');
        return;
    }
    closePracticeCalendarNoteForm();
    renderPracticeHistory({ focus: false });
}

function createPracticeHistoryDeleteButton(event, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'practice-history-delete';
    button.dataset.historyDeleteId = event.id;
    button.setAttribute('aria-label', `${label}の練習記録を削除`);
    button.title = '練習記録を削除';
    button.disabled = !state.historyReady;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7');
    svg.append(path);
    button.append(svg);
    return button;
}

function handlePracticeHistoryDelete(event) {
    const button = event.target.closest('[data-history-delete-id]');
    if (!button || !state.historyReady) return;
    const target = state.history.events.find(({ id }) => id === button.dataset.historyDeleteId);
    if (!target) return;
    const message = target.type === PRACTICE_HISTORY_EVENT_TYPE.practiceSession
        ? 'この練習セッションと、セッション内の練習記録を削除しますか？'
        : 'この練習記録を削除しますか？';
    if (!window.confirm(`${message}\n練習メニューと通算回数は変わりません。`)) return;
    showNotice(elements.historyStatus);
    const result = deletePracticeHistoryEvent(state.history, target.id, state.timerReady ? state.timer : null);
    if (!result.ok || !savePracticeHistory(result.history).ok) {
        showNotice(elements.historyError, '練習記録を削除できませんでした。記録は変更していません。');
        return;
    }
    const buttons = [...elements.dayHistoryList.querySelectorAll('[data-history-delete-id]')];
    const index = buttons.indexOf(button);
    state.history = result.history;
    renderPracticeHistory({ focus: false });
    const remaining = elements.dayHistoryList.querySelectorAll('[data-history-delete-id]');
    (remaining[Math.min(index, remaining.length - 1)] || elements.dayHistoryTitle).focus({ preventScroll: true });
    showNotice(elements.historyStatus, `${result.deletedIds.length}件の練習記録を削除しました。`);
}

function renderPracticeDayHistory() {
    const [year, month, day] = state.historySelectedDate.split('-').map(Number);
    elements.dayHistoryTitle.textContent = `${month}月${day}日の練習記録`;
    const entries = createPracticeDayHistoryView(state.history, state.historySelectedDate);
    elements.dayHistoryList.replaceChildren();
    if (entries.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'practice-history-empty';
        empty.textContent = 'この日の練習記録はありません。';
        elements.dayHistoryList.append(empty);
        return;
    }
    entries.forEach(({ event, kind, children, displayDurationSeconds }) => {
        const row = document.createElement('div');
        const mark = document.createElement('span');
        const copy = document.createElement('span');
        const title = document.createElement('strong');
        const detail = document.createElement('small');
        const session = kind === 'session';
        row.className = `practice-history-event${session ? ' is-session' : ''}`;
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = session ? '◷' : '✓';
        title.textContent = session ? '練習セッション' : event.practiceName;
        detail.textContent = session
            ? `${formatPracticeSessionDuration(displayDurationSeconds)} ・ ${new Date(event.startedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}〜${new Date(event.endedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
            : `${event.durationMinutes}分 ・ ${new Date(event.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
        copy.append(title, detail);
        row.dataset.historyEventId = event.id;
        row.append(mark, copy, createPracticeHistoryDeleteButton(event, title.textContent));
        if (session && children.length > 0) {
            const childList = document.createElement('ul');
            childList.className = 'practice-history-session-children';
            children.forEach((child) => {
                const childItem = document.createElement('li');
                const childMark = document.createElement('span');
                const childCopy = document.createElement('span');
                const childName = document.createElement('span');
                const childDuration = document.createElement('small');
                childItem.dataset.historyEventId = child.id;
                childMark.setAttribute('aria-hidden', 'true');
                childMark.textContent = '✓';
                childName.textContent = child.practiceName;
                childDuration.className = 'practice-history-session-duration';
                childDuration.textContent = formatPracticeSessionDuration(child.measuredDurationSeconds);
                childCopy.append(childName, childDuration);
                childItem.append(childMark, childCopy, createPracticeHistoryDeleteButton(child, child.practiceName));
                childList.append(childItem);
            });
            row.append(childList);
        }
        elements.dayHistoryList.append(row);
    });
}

function createPracticeCalendarDayButton(summary, date, { week = false } = {}) {
    const button = document.createElement('button');
    const selected = summary.localDate === state.historySelectedDate;
    const today = summary.localDate === toLocalDateKey();
    button.type = 'button';
    button.dataset.practiceDate = summary.localDate;
    button.className = 'practice-calendar-day';
    button.classList.toggle('has-activity', summary.practiced);
    button.classList.toggle('has-complete', summary.completed);
    button.classList.toggle('has-memo', summary.notes.length > 0);
    button.classList.toggle('is-today', today);
    if (today) button.setAttribute('aria-current', 'date');
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.setAttribute('aria-label', `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日${summary.practiced ? '、練習済み' : '、練習記録なし'}${summary.notes.length ? `、予定・メモ${summary.notes.length}件` : ''}${summary.completed ? '、全メニュー完了' : ''}`);
    if (week) {
        const weekday = document.createElement('small');
        weekday.textContent = PRACTICE_CALENDAR_WEEKDAYS[date.getDay()];
        button.append(weekday);
    }
    const dayNumber = document.createElement('span');
    dayNumber.textContent = week ? `${date.getMonth() + 1}/${date.getDate()}` : String(date.getDate());
    button.append(dayNumber);
    const markers = document.createElement('span');
    markers.className = 'practice-calendar-markers';
    if (summary.practiced) {
        const mark = document.createElement('i');
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = '✓';
        markers.append(mark);
    }
    if (summary.notes.length > 0) {
        const memoMark = document.createElement('b');
        memoMark.setAttribute('aria-hidden', 'true');
        memoMark.append(createPracticeCalendarIcon(summary.memoIcons[0]));
        markers.append(memoMark);
        if (summary.notes.length > 1) {
            const noteCount = document.createElement('em');
            noteCount.setAttribute('aria-hidden', 'true');
            noteCount.textContent = `+${summary.notes.length - 1}`;
            markers.append(noteCount);
        }
    }
    button.append(markers);
    return button;
}

function renderPracticeMonthCalendar(selectedDate) {
    const year = selectedDate.getFullYear();
    const monthIndex = selectedDate.getMonth();
    elements.calendarMonth.textContent = `${year}年${monthIndex + 1}月`;
    elements.calendarPrevious.setAttribute('aria-label', '前の月');
    elements.calendarNext.setAttribute('aria-label', '次の月');
    elements.calendarWeekdays.hidden = false;
    elements.calendarDays.hidden = false;
    elements.calendarDayFocus.hidden = true;
    elements.calendarDays.className = 'practice-calendar-days is-month';
    elements.calendarDays.setAttribute('aria-label', `${year}年${monthIndex + 1}月の音楽カレンダー`);
    elements.calendarDays.replaceChildren(...createPracticeCalendarMonth(year, monthIndex, state.history, state.calendar.notes).map((cell) => {
        if (!cell) {
            const blank = document.createElement('span');
            blank.className = 'practice-calendar-blank';
            blank.setAttribute('aria-hidden', 'true');
            return blank;
        }
        return createPracticeCalendarDayButton(cell, new Date(year, monthIndex, cell.day, 12));
    }));
}

function renderPracticeWeekCalendar() {
    const weekDates = getPracticeCalendarWeekDates(state.historySelectedDate);
    const first = weekDates[0];
    const last = weekDates[6];
    elements.calendarMonth.textContent = first.getMonth() === last.getMonth()
        ? `${first.getFullYear()}年${first.getMonth() + 1}月${first.getDate()}日〜${last.getDate()}日`
        : `${first.getMonth() + 1}月${first.getDate()}日〜${last.getMonth() + 1}月${last.getDate()}日`;
    elements.calendarPrevious.setAttribute('aria-label', '前の週');
    elements.calendarNext.setAttribute('aria-label', '次の週');
    elements.calendarWeekdays.hidden = true;
    elements.calendarDays.hidden = false;
    elements.calendarDayFocus.hidden = true;
    elements.calendarDays.className = 'practice-calendar-days is-week';
    elements.calendarDays.setAttribute('aria-label', '選択日を含む週の音楽カレンダー');
    elements.calendarDays.replaceChildren(...weekDates.map((date) => createPracticeCalendarDayButton(
        createPracticeCalendarDaySummary(toLocalDateKey(date), state.history, state.calendar.notes),
        date,
        { week: true }
    )));
}

function renderPracticeDayCalendar(selectedDate) {
    const summary = createPracticeCalendarDaySummary(state.historySelectedDate, state.history, state.calendar.notes);
    elements.calendarMonth.textContent = `${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日（${PRACTICE_CALENDAR_WEEKDAYS[selectedDate.getDay()]}）`;
    elements.calendarPrevious.setAttribute('aria-label', '前の日');
    elements.calendarNext.setAttribute('aria-label', '次の日');
    elements.calendarWeekdays.hidden = true;
    elements.calendarDays.hidden = true;
    elements.calendarDayFocus.hidden = false;
    elements.calendarDayFocus.replaceChildren();
    const date = document.createElement('time');
    date.dateTime = state.historySelectedDate;
    if (state.historySelectedDate === toLocalDateKey()) date.setAttribute('aria-current', 'date');
    date.textContent = `${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日 ${PRACTICE_CALENDAR_WEEKDAYS[selectedDate.getDay()]}曜日`;
    const status = document.createElement('span');
    status.textContent = summary.practiced ? '✓ 練習できた日' : '練習記録はまだありません';
    elements.calendarDayFocus.append(date, status);
}

function renderPracticeHistory({ focus = true } = {}) {
    showView(elements.practiceHistoryView);
    elements.historyBack.textContent = getPracticeCalendarEntrySource() === PRACTICE_CALENDAR_ENTRY_SOURCE.practice
        ? '← 練習メニュー'
        : '← TOPに戻る';
    showNotice(elements.historyStatus);
    const selectedDate = practiceLocalDateToDate(state.historySelectedDate);
    state.historyMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    elements.calendarViewTabs.forEach((button) => {
        const active = button.dataset.calendarView === state.calendarViewMode;
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.tabIndex = 0;
    });
    if (state.calendarViewMode === 'week') renderPracticeWeekCalendar();
    else if (state.calendarViewMode === 'day') renderPracticeDayCalendar(selectedDate);
    else renderPracticeMonthCalendar(selectedDate);
    showNotice(
        elements.historyError,
        state.historyReady && state.calendarReady
            ? ''
            : '音楽カレンダーを読み込めません。保存領域の値は変更していません。'
    );
    renderPracticeCalendarNotes();
    renderPracticeDayHistory();
    if (focus) elements.historyTitle.focus({ preventScroll: true });
}

function renderPracticeList({ focus = true, focusCheckId = null } = {}) {
    showView(elements.practiceListView);
    elements.list.replaceChildren();
    const activeItems = getActivePracticeItems();
    const visibleItems = state.reorderMode ? state.reorderItems : activeItems;

    visibleItems.forEach((item, index) => {
        elements.list.append(
            state.reorderMode ? renderReorderCard(item, index) : renderPracticeCard(item)
        );
    });
    elements.empty.hidden = state.reorderMode || activeItems.length > 0 || !state.storageReady;

    elements.reorderStart.hidden = state.reorderMode || activeItems.length < 2;
    elements.reorderActions.hidden = !state.reorderMode;
    elements.historyOpen.hidden = state.reorderMode;
    elements.addButton.hidden = state.reorderMode;
    elements.addButton.disabled = !state.storageReady;
    elements.addButton.classList.toggle('tool-pro-locked', !canCreatePractice(state.items));
    elements.addButton.setAttribute('aria-label', canCreatePractice(state.items)
        ? '練習メニューを追加' : '練習メニューを追加（Pro版では登録枠を拡張できます）');
    elements.reorderStatus.textContent = state.reorderMode
        ? '並び替え中です。上下のボタンで順序を変更し、完了で保存します。'
        : '';
    elements.reorderStatus.hidden = !state.reorderMode;
    elements.hiddenCount.textContent = String(getHiddenPracticeItems().length);
    const completionPending = Boolean(state.progress?.completionPending);
    const hasFinishActivity = Boolean(state.timerReady && state.timer?.running)
        || state.progress.checkedPracticeIds.length > 0;
    elements.finishButton.disabled = !state.progressReady
        || !state.historyReady
        || completionPending
        || activeItems.length === 0
        || !hasFinishActivity;
    elements.cycleReset.disabled = !state.progressReady
        || completionPending
        || (state.progress.checkedPracticeIds.length === 0 && state.progress.countedPracticeIds.length === 0);
    elements.finishButton.parentElement.hidden = state.reorderMode;
    elements.historyOpen.disabled = !state.historyReady;
    elements.hiddenOpen.disabled = !state.storageReady;
    updatePracticeTimerDisplay();
    showNotice(elements.listNotice, state.listNotice);
    state.listNotice = '';
    showNotice(
        elements.storageError,
        !state.storageReady
            ? '練習メニューの保存データを読み込めません。保存領域の値は変更していません。'
            : !state.progressReady || !state.historyReady
                ? '進捗または履歴を読み込めないため、チェック機能を停止しています。既存データは変更していません。'
                : !state.calendarReady || !state.timerReady
                    ? 'カレンダーまたはタイマーの保存データを読み込めません。該当機能を停止し、既存データは変更していません。'
                : ''
    );
    if (focusCheckId) {
        [...elements.list.querySelectorAll('[data-practice-action="check"]')]
            .find((button) => button.dataset.id === focusCheckId)
            ?.focus({ preventScroll: true });
    } else if (focus) {
        document.querySelector('#practice-heading')?.focus({ preventScroll: true });
    }
}

function startReorder() {
    const activeItems = getActivePracticeItems();
    if (!state.storageReady || activeItems.length < 2) return;
    state.reorderMode = true;
    state.reorderItems = [...activeItems];
    showNotice(elements.reorderNotice);
    renderPracticeList();
}

function cancelReorder() {
    state.reorderMode = false;
    state.reorderItems = [];
    showNotice(elements.reorderNotice);
    renderPracticeList();
}

function moveReorderItem(id, direction) {
    const moveResult = movePracticeMenu(state.reorderItems, id, direction);
    if (!moveResult.moved) return;
    state.reorderItems = moveResult.items;
    renderPracticeList();
    [...elements.list.querySelectorAll('.reorder-move')]
        .find((button) => button.dataset.id === id && Number(button.dataset.direction) === direction)
        ?.focus();
}

function completeReorder() {
    if (!state.reorderMode) return;
    const activeItems = getActivePracticeItems();
    if (sameOrder(activeItems, state.reorderItems)) {
        cancelReorder();
        return;
    }

    const candidateItems = mergeReorderedActiveItems(state.items, state.reorderItems);
    const saveResult = savePracticeMenus(candidateItems);
    if (!saveResult.ok) {
        showNotice(elements.reorderNotice, '並び順を保存できませんでした。元の順番は変更していません。');
        return;
    }
    state.items = candidateItems;
    state.reorderMode = false;
    state.reorderItems = [];
    showNotice(elements.reorderNotice);
    renderPracticeList();
}

function formatPracticeAttachmentSize(byteSize) {
    if (byteSize < 1024) return `${byteSize} B`;
    if (byteSize < 1024 * 1024) return `${Math.round(byteSize / 1024)} KB`;
    return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}

function getPracticeAttachmentFailureMessage(reason) {
    if (reason === 'empty-file') return '空のファイルは追加できません。別のファイルを選んでください。';
    if (reason === 'image-too-large') return '画像サイズが大きすぎます。15MB以下の画像を選んでください。';
    if (reason === 'file-too-large') return 'ファイルサイズが大きすぎます。20MB以下のファイルを選んでください。';
    if (reason === 'limit-reached') {
        return `ファイルは1つの練習メニューにつき${PRACTICE_ATTACHMENT_LIMITS.countPerPractice}件までです。不要なファイルを削除してください。`;
    }
    return 'ファイルを保存できませんでした。ブラウザの空き容量や保存設定を確認してください。';
}

function getPracticeAttachmentPresentation(scope = 'detail') {
    return scope === 'form'
        ? {
            add: elements.formAttachmentAdd,
            input: elements.formAttachmentInput,
            status: elements.formAttachmentStatus,
            empty: elements.formAttachmentsEmpty,
            list: elements.formAttachmentsList
        }
        : {
            add: elements.attachmentAdd,
            input: elements.attachmentInput,
            status: elements.attachmentStatus,
            empty: elements.attachmentsEmpty,
            list: elements.attachmentsList
        };
}

function setPracticeAttachmentStatus(scope, message = '', { error = false } = {}) {
    const status = getPracticeAttachmentPresentation(scope).status;
    status.textContent = message;
    status.classList.toggle('is-error', Boolean(message) && error);
}

function createPracticeAttachmentRow(record) {
    const row = document.createElement('article');
    const preview = document.createElement(record.kind === 'image' ? 'button' : 'span');
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    const detail = document.createElement('small');
    const actions = document.createElement('span');
    const open = document.createElement('a');
    const remove = document.createElement('button');
    const objectUrl = URL.createObjectURL(record.blob);
    practiceAttachmentObjectUrls.add(objectUrl);

    row.className = 'practice-attachment-row';
    preview.className = 'practice-attachment-preview';
    if (record.kind === 'image') {
        const image = document.createElement('img');
        preview.type = 'button';
        preview.dataset.attachmentAction = 'preview';
        preview.dataset.url = objectUrl;
        preview.dataset.fileName = record.fileName;
        preview.setAttribute('aria-label', `${record.fileName}をプレビュー`);
        image.src = objectUrl;
        image.alt = '';
        preview.append(image);
    } else {
        preview.setAttribute('aria-hidden', 'true');
        preview.textContent = record.mimeType === 'application/pdf' ? 'PDF' : 'FILE';
    }
    copy.className = 'practice-attachment-copy';
    name.textContent = record.fileName;
    const fileKind = record.kind === 'image'
      ? '画像'
      : record.mimeType === 'application/pdf'
        ? 'PDF'
        : 'ファイル';
    detail.textContent = `${fileKind} ・ ${formatPracticeAttachmentSize(record.byteSize)}`;
    copy.append(name, detail);
    actions.className = 'practice-attachment-actions';
    open.href = objectUrl;
    open.setAttribute('aria-label', `${record.fileName}を${isSafePracticeAttachmentInlineOpen(record.mimeType) ? '開く' : 'ダウンロード'}`);
    if (isSafePracticeAttachmentInlineOpen(record.mimeType)) {
        open.target = '_blank';
        open.rel = 'noopener';
        open.textContent = '開く';
    } else {
        open.download = record.fileName;
        open.textContent = '保存';
    }
    remove.type = 'button';
    remove.dataset.attachmentAction = 'delete';
    remove.dataset.id = record.id;
    remove.dataset.fileName = record.fileName;
    remove.setAttribute('aria-label', `${record.fileName}を削除`);
    remove.textContent = '削除';
    actions.append(open, remove);
    row.append(preview, copy, actions);
    return row;
}

function createPendingPracticeAttachmentRow(record) {
    const row = document.createElement('article');
    const preview = document.createElement('span');
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    const detail = document.createElement('small');
    const actions = document.createElement('span');
    const remove = document.createElement('button');

    row.className = 'practice-attachment-row';
    preview.className = 'practice-attachment-preview';
    preview.setAttribute('aria-hidden', 'true');
    preview.textContent = record.kind === 'image'
        ? '画像'
        : record.mimeType === 'application/pdf' ? 'PDF' : 'FILE';
    copy.className = 'practice-attachment-copy';
    name.textContent = record.fileName;
    detail.textContent = `${record.kind === 'image' ? '画像' : record.mimeType === 'application/pdf' ? 'PDF' : 'ファイル'} ・ ${formatPracticeAttachmentSize(record.byteSize)}`;
    copy.append(name, detail);
    actions.className = 'practice-attachment-actions';
    remove.type = 'button';
    remove.dataset.attachmentAction = 'pending-delete';
    remove.dataset.pendingId = record.pendingId;
    remove.setAttribute('aria-label', `${record.fileName}を選択から外す`);
    remove.textContent = '削除';
    actions.append(remove);
    row.append(preview, copy, actions);
    return row;
}

function renderPendingPracticeAttachments() {
    const presentation = getPracticeAttachmentPresentation('form');
    const canWrite = getCapabilities().practiceFileWrite;
    const limitReached = state.pendingCreateAttachments.length >= PRACTICE_ATTACHMENT_LIMITS.countPerPractice;
    presentation.input.disabled = !canWrite || limitReached || state.formSaving;
    presentation.add.classList.toggle('tool-pro-locked', !canWrite);
    presentation.add.classList.toggle('is-disabled', canWrite && (limitReached || state.formSaving));
    presentation.add.setAttribute('aria-label', canWrite ? 'ファイルを追加' : 'ファイルを追加（Pro版機能）');
    presentation.empty.hidden = state.pendingCreateAttachments.length > 0;
    presentation.empty.textContent = limitReached
        ? `ファイルは${PRACTICE_ATTACHMENT_LIMITS.countPerPractice}件までです。`
        : 'ファイルはありません。';
    presentation.list.replaceChildren(...state.pendingCreateAttachments.map(createPendingPracticeAttachmentRow));
}

async function renderPracticeAttachments(practiceId, scope = 'detail') {
    const presentation = getPracticeAttachmentPresentation(scope);
    closePracticeAttachmentLightbox();
    cleanupPracticeAttachmentObjectUrls();
    const generation = practiceAttachmentRenderGeneration;
    presentation.list.replaceChildren();
    presentation.empty.hidden = true;
    presentation.input.disabled = true;
    presentation.add.classList.add('is-disabled');
    if (!getCapabilities().practiceFileWrite) presentation.add.classList.remove('is-disabled');
    presentation.add.classList.toggle('tool-pro-locked', !getCapabilities().practiceFileWrite);
    presentation.add.setAttribute('aria-label', getCapabilities().practiceFileWrite ? 'ファイルを追加' : 'ファイルを追加（Pro版機能）');
    const result = await practiceAttachmentStore.getAttachments(practiceId);
    if (generation !== practiceAttachmentRenderGeneration || state.activeId !== practiceId) return;
    if (!result.ok) {
        presentation.empty.hidden = false;
        presentation.empty.textContent = 'ファイル機能を利用できません。練習メニュー本体は引き続き利用できます。';
        setPracticeAttachmentStatus(scope, 'ファイルの保存領域を利用できません。', { error: true });
        return;
    }
    presentation.input.disabled = result.records.length >= PRACTICE_ATTACHMENT_LIMITS.countPerPractice;
    presentation.add.classList.toggle('is-disabled', getCapabilities().practiceFileWrite && presentation.input.disabled);
    presentation.empty.hidden = result.records.length > 0;
    presentation.empty.textContent = result.records.length >= PRACTICE_ATTACHMENT_LIMITS.countPerPractice
        ? `ファイルは${PRACTICE_ATTACHMENT_LIMITS.countPerPractice}件までです。`
        : 'ファイルはありません。';
    presentation.list.replaceChildren(...result.records.map(createPracticeAttachmentRow));
}

function openPracticeAttachmentLightbox(button) {
    practiceAttachmentLightboxReturnFocus = button;
    elements.attachmentLightboxTitle.textContent = button.dataset.fileName;
    elements.attachmentLightboxImage.src = button.dataset.url;
    elements.attachmentLightboxImage.alt = button.dataset.fileName;
    elements.attachmentLightbox.hidden = false;
    document.body.classList.add('practice-attachment-lightbox-open');
    elements.attachmentLightboxTitle.focus({ preventScroll: true });
}

function openPracticeAttachmentLightboxForRecord(record, trigger) {
    const objectUrl = URL.createObjectURL(record.blob);
    practiceAttachmentObjectUrls.add(objectUrl);
    practiceAttachmentLightboxReturnFocus = trigger;
    elements.attachmentLightboxTitle.textContent = record.fileName;
    elements.attachmentLightboxImage.src = objectUrl;
    elements.attachmentLightboxImage.alt = record.fileName;
    elements.attachmentLightbox.hidden = false;
    document.body.classList.add('practice-attachment-lightbox-open');
    elements.attachmentLightboxTitle.focus({ preventScroll: true });
}

function closePreparedPracticeAttachmentWindow(preparedWindow) {
    try {
        if (preparedWindow && !preparedWindow.closed) preparedWindow.close();
    } catch (_) {
        // A blocked or already-detached popup needs no further cleanup.
    }
}

function openPracticeAttachmentRecord(record, preparedWindow = null) {
    const inline = isSafePracticeAttachmentInlineOpen(record.mimeType);
    if (inline && !preparedWindow) return false;
    const objectUrl = URL.createObjectURL(record.blob);
    practiceAttachmentExternalObjectUrls.add(objectUrl);
    if (inline) {
        try {
            if (!navigatePreparedPracticeFileWindow(preparedWindow, objectUrl)) throw new Error('navigation-failed');
        } catch (_) {
            closePreparedPracticeAttachmentWindow(preparedWindow);
            practiceAttachmentExternalObjectUrls.delete(objectUrl);
            URL.revokeObjectURL(objectUrl);
            return false;
        }
    } else {
        closePreparedPracticeAttachmentWindow(preparedWindow);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = record.fileName;
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
    }
    window.setTimeout(() => {
        if (!practiceAttachmentExternalObjectUrls.delete(objectUrl)) return;
        URL.revokeObjectURL(objectUrl);
    }, 5 * 60_000);
    return true;
}

async function handlePracticeAttachmentSelection(event, scope = 'detail') {
    const presentation = getPracticeAttachmentPresentation(scope);
    if (!getCapabilities().practiceFileWrite) {
        presentation.input.value = '';
        requestToolPro('practiceFile');
        return;
    }
    const item = findItem(state.activeId);
    const files = [...(presentation.input.files || [])];
    presentation.input.value = '';
    if (scope === 'form' && state.formMode === 'create') {
        if (files.length === 0) return;
        const result = appendPendingPracticeAttachments(state.pendingCreateAttachments, files);
        state.pendingCreateAttachments = result.pending;
        const message = result.ok
            ? `保存前のファイルを${result.addedCount}件追加しました。`
            : `${result.addedCount ? `${result.addedCount}件を追加しました。` : ''}${getPracticeAttachmentFailureMessage(result.reason)}`;
        setPracticeAttachmentStatus('form', message, { error: !result.ok });
        renderPendingPracticeAttachments();
        return;
    }
    if (!item || files.length === 0) return;
    presentation.input.disabled = true;
    setPracticeAttachmentStatus(scope, 'ファイルを保存しています…');
    let savedCount = 0;
    let failureMessage = '';
    for (const file of files) {
        const validation = validatePendingPracticeAttachment(file);
        if (!validation.ok) {
            failureMessage = getPracticeAttachmentFailureMessage(validation.reason);
            break;
        }
        const result = await practiceAttachmentStore.addAttachment(item.id, file, { fileName: file.name });
        if (!result.ok) {
            if (result.reason === 'pro-required') requestToolPro('practiceFile');
            failureMessage = getPracticeAttachmentFailureMessage(result.reason);
            break;
        }
        savedCount += 1;
    }
    setPracticeAttachmentStatus(
        scope,
        failureMessage || `ファイルを${savedCount}件追加しました。`,
        { error: Boolean(failureMessage) }
    );
    await renderPracticeAttachments(item.id, scope);
    await refreshPracticeAttachmentCounts();
}

async function handlePracticeAttachmentAction(event, scope = 'detail') {
    const button = event.target.closest('[data-attachment-action]');
    if (!button) return;
    if (scope === 'form' && state.formMode === 'create' && button.dataset.attachmentAction === 'pending-delete') {
        state.pendingCreateAttachments = state.pendingCreateAttachments
            .filter((record) => record.pendingId !== button.dataset.pendingId);
        setPracticeAttachmentStatus('form', '保存前のファイルを選択から外しました。');
        renderPendingPracticeAttachments();
        return;
    }
    if (button.dataset.attachmentAction === 'preview') {
        openPracticeAttachmentLightbox(button);
        return;
    }
    const item = findItem(state.activeId);
    if (!item || !window.confirm(`「${button.dataset.fileName}」を削除しますか？`)) return;
    const result = await practiceAttachmentStore.deleteAttachment(button.dataset.id);
    setPracticeAttachmentStatus(scope, result.ok ? 'ファイルを削除しました。' : 'ファイルを削除できませんでした。', { error: !result.ok });
    await renderPracticeAttachments(item.id, scope);
    await refreshPracticeAttachmentCounts();
}

async function handlePracticeFilesAction(button, event) {
    event.preventDefault();
    event.stopPropagation();
    const item = findItem(button.dataset.id);
    if (!item) return;
    let preparedWindow = null;
    if (button.dataset.count === '1') {
        try {
            preparedWindow = preparePracticeFileWindow(window);
        } catch (_) {
            preparedWindow = null;
        }
    }
    const result = await practiceAttachmentStore.getAttachments(item.id);
    if (!result.ok) {
        closePreparedPracticeAttachmentWindow(preparedWindow);
        state.listNotice = 'ファイル機能を利用できません。保存設定を確認してください。';
        renderPracticeList({ focus: false });
        return;
    }
    await refreshPracticeAttachmentCounts({ renderList: false });
    if (result.records.length !== 1) {
        closePreparedPracticeAttachmentWindow(preparedWindow);
        state.filesFocusId = item.id;
        setHashRoute(`#practice-menu/${encodeURIComponent(item.id)}`);
        return;
    }
    const [record] = result.records;
    if (record.kind === 'image') {
        closePreparedPracticeAttachmentWindow(preparedWindow);
        openPracticeAttachmentLightboxForRecord(record, button);
    } else if (!openPracticeAttachmentRecord(record, preparedWindow)) {
        state.listNotice = 'ファイルを開けませんでした。ポップアップを許可して、もう一度お試しください。';
        renderPracticeList({ focus: false });
    }
}

function renderDetail(id) {
    const item = findItem(id);
    if (!item) {
        replacePracticeListRoute();
        return;
    }

    const app = resolveCurrentPracticeApp(item.appId);
    state.activeId = item.id;
    elements.detailTitle.textContent = item.name;
    elements.detailDuration.textContent = `${item.durationMinutes}分`;
    elements.detailApp.textContent = app.label;
    elements.detailMemo.textContent = item.memo || 'なし';
    elements.detailCount.textContent = `${getPracticeTotalCount(item.id)}回`;
    const savedNotice = state.savedNotice?.id === item.id ? state.savedNotice : null;
    showNotice(elements.detailSaved, savedNotice?.message || '');
    state.savedNotice = null;
    elements.openApp.textContent = 'アプリを開く';
    elements.openApp.hidden = !app.launchable;
    elements.openApp.classList.toggle('is-disabled', !app.launchable);
    if (app.launchable) {
        elements.openApp.href = app.href;
        elements.openApp.removeAttribute('aria-disabled');
        elements.openApp.removeAttribute('tabindex');
    } else {
        elements.openApp.removeAttribute('href');
        elements.openApp.setAttribute('aria-disabled', 'true');
        elements.openApp.setAttribute('tabindex', '-1');
    }
    const detailMessage = app.status === PRACTICE_APP_STATUS.missing
        ? '使用アプリが削除されています。練習メニューを編集してください。'
        : app.status === PRACTICE_APP_STATUS.storeUnavailable
            ? 'My Appsの保存データを読み込めないため、このアプリを開けません。'
            : app.status === PRACTICE_APP_STATUS.unsupported
                ? 'この使用アプリには現在対応していません。練習メニューを編集してください。'
                : '';
    showNotice(elements.detailError, [detailMessage, savedNotice?.error].filter(Boolean).join(' '));
    showView(elements.detailView);
    setPracticeAttachmentStatus('detail');
    const focusFiles = state.filesFocusId === item.id;
    state.filesFocusId = null;
    void renderPracticeAttachments(item.id).then(() => {
        if (!focusFiles || state.activeId !== item.id) return;
        requestAnimationFrame(() => {
            if (state.activeId !== item.id || parsePracticeRoute(location.hash)?.kind !== PRACTICE_ROUTE_KIND.detail) return;
            const target = document.querySelector('#practice-attachments-title');
            target?.scrollIntoView({ behavior: 'auto', block: 'start' });
            target?.focus({ preventScroll: true });
        });
    });
    elements.detailTitle.focus({ preventScroll: true });
}

function populatePracticeAppSelect(selectedAppId = '') {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '使用アプリなし';
    elements.appInput.replaceChildren(placeholder);

    const optionValues = new Set();
    createPracticeAppOptionGroups(myAppsState.items).forEach((groupModel) => {
        const group = document.createElement('optgroup');
        group.label = groupModel.label;
        groupModel.options.forEach((optionModel) => {
            const option = document.createElement('option');
            option.value = optionModel.value;
            option.textContent = optionModel.label;
            optionValues.add(optionModel.value);
            group.append(option);
        });
        elements.appInput.append(group);
    });

    if (selectedAppId && !optionValues.has(selectedAppId)) {
        const unresolved = resolveCurrentPracticeApp(selectedAppId);
        const option = document.createElement('option');
        option.value = selectedAppId;
        option.textContent = unresolved.label;
        option.dataset.temporary = 'true';
        elements.appInput.append(option);
    }
    elements.appInput.value = selectedAppId;
}

function populatePracticeNamePresets() {
    elements.namePresetInput.replaceChildren(...PRACTICE_NAME_PRESETS.map((preset) => {
        const option = document.createElement('option');
        option.value = preset.value;
        option.textContent = preset.label;
        return option;
    }));
}

function syncPracticeNameControls() {
    const isCreate = state.formMode === 'create';
    const customName = elements.namePresetInput.value === PRACTICE_NAME_PRESET_CUSTOM;
    elements.namePresetInput.hidden = !isCreate;
    elements.nameInput.hidden = isCreate && !customName;
    elements.nameInput.required = !elements.nameInput.hidden;
    elements.nameLabel.htmlFor = isCreate ? 'practice-name-preset' : 'practice-name';
}

function handlePracticeNamePresetChange() {
    if (state.formMode !== 'create') return;
    const preset = getPracticeNamePreset(elements.namePresetInput.value);
    syncPracticeNameControls();
    if (preset.appId) elements.appInput.value = preset.appId;
}

function fillForm(item = null) {
    elements.form.reset();
    elements.namePresetInput.value = PRACTICE_NAME_PRESET_CUSTOM;
    elements.nameInput.value = item?.name || '';
    elements.durationInput.value = item?.durationMinutes ?? 10;
    populatePracticeAppSelect(item?.appId || '');
    syncPracticeNameControls();
    elements.memoInput.value = item?.memo || '';
    elements.hiddenInput.checked = item?.hidden || false;
    elements.hiddenField.hidden = !item;
    elements.formAttachments.hidden = false;
    elements.formAttachmentsList.replaceChildren();
    elements.formAttachmentsEmpty.hidden = true;
    setPracticeAttachmentStatus('form');
    elements.countResetSection.hidden = !item;
    elements.formTotalCount.textContent = `${item ? getPracticeTotalCount(item.id) : 0}回`;
    elements.countReset.disabled = !item || !state.progressReady || getPracticeTotalCount(item.id) === 0;
    showNotice(elements.formError);
    showNotice(elements.formStatus);
}

function setPracticeFormSaving(saving) {
    state.formSaving = saving;
    elements.formSubmit.disabled = saving;
    elements.formSubmit.textContent = saving ? '保存中…' : '保存';
    document.querySelectorAll('[data-action="cancel-form"]').forEach((button) => {
        button.disabled = saving;
    });
    if (state.formMode === 'create') renderPendingPracticeAttachments();
}

function renderForm(mode, id = null) {
    if (mode === 'create' && !guardPracticeCreation()) {
        replacePracticeListRoute();
        return;
    }
    const item = mode === 'edit' ? findItem(id) : null;
    if (mode === 'edit' && !item) {
        replacePracticeListRoute();
        return;
    }
    if (!state.storageReady) {
        replaceHomeRoute();
        return;
    }

    state.formMode = mode;
    state.activeId = item?.id || null;
    cleanupPendingPracticeAttachments();
    setPracticeFormSaving(false);
    elements.formTitle.textContent = mode === 'edit' ? '練習メニューを編集' : '練習メニューを作成';
    fillForm(item);
    showView(elements.formView);
    if (item) void renderPracticeAttachments(item.id, 'form');
    else renderPendingPracticeAttachments();
    elements.formTitle.focus({ preventScroll: true });
}

function applyDisplaySettings() {
    applyHomeDisplaySize(elements.homeView, homeSettings.displaySize);
    document.documentElement.dataset.fontSize = homeSettings.fontSize;
    applyHomeSectionOrder(elements.homeView, homeSettings.sectionOrder);
    // The edition link is auxiliary, never part of the user's section order.
    const proLink = elements.homeView.querySelector('[data-standard-pro-link]');
    if (proLink) elements.homeView.append(proLink);
}

const homeSectionLabels = { cruiseApps: 'クルーズアプリ', tools: 'ツール', myApps: 'My Apps' };

function renderSettings({ focus = true, storageError = '' } = {}) {
    showView(elements.settingsView);
    applyDisplaySettings();
    [...elements.settingsChoices, ...elements.fontChoices].forEach((button) => {
        const selected = button.dataset.displaySize
            ? button.dataset.displaySize === homeSettings.displaySize
            : button.dataset.fontSize === homeSettings.fontSize;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-checked', selected ? 'true' : 'false');
        button.tabIndex = selected ? 0 : -1;
    });
    elements.sectionOrder.replaceChildren(...homeSettings.sectionOrder.map((key, index) => {
        const row = document.createElement('div');
        row.className = 'settings-order-row';
        const label = document.createElement('span');
        label.textContent = homeSectionLabels[key];
        row.append(label);
        for (const direction of [-1, 1]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'reorder-button';
            button.dataset.sectionKey = key;
            button.dataset.direction = String(direction);
            button.textContent = direction === -1 ? '↑' : '↓';
            button.setAttribute('aria-label', `${homeSectionLabels[key]}を${direction === -1 ? '上' : '下'}へ`);
            button.disabled = index + direction < 0 || index + direction >= homeSettings.sectionOrder.length;
            row.append(button);
        }
        return row;
    }));
    showNotice(
        elements.settingsStorageError,
        storageError || (settingsStorageReady ? '' : '表示設定を読み込めませんでした。標準表示で開いています。')
    );
    if (focus) elements.settingsTitle.focus({ preventScroll: true });
}

function findGearItem(id) {
    return gearState.items.find((item) => item.id === id) || null;
}

function setGearListRoute() {
    setHashRoute('#wishlist');
}

function correctGearListRoute() {
    replaceGearListRoute();
    renderRoute();
}

function createGearMetadata(item) {
    const metadata = document.createElement('div');
    metadata.className = 'gear-card-metadata';
    if (item.status === 'wishlist') {
        const priority = document.createElement('span');
        priority.className = `gear-priority gear-priority--${item.priority}`;
        priority.textContent = `優先度 ${getGearPriorityLabel(item.priority)}`;
        metadata.append(priority);
    }
    const category = document.createElement('span');
    category.className = 'gear-category-badge';
    category.textContent = getGearCategoryName(gearState.categories, item.category);
    metadata.append(category);
    return metadata;
}

function createGearAction(label, action, item, className = 'secondary-action') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `action-button ${className}`;
    button.dataset.gearAction = action;
    button.dataset.id = item.id;
    button.textContent = label;
    button.setAttribute('aria-label', `${item.name}を${label}`);
    return button;
}

function showGearPhotoBlob(blob, scope, image, onReady = null) {
    const generation = gearPhotoRenderGeneration[scope];
    const objectUrl = URL.createObjectURL(blob);
    gearPhotoObjectUrls[scope].add(objectUrl);
    image.onload = () => {
        if (generation === gearPhotoRenderGeneration[scope]) onReady?.();
    };
    image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        gearPhotoObjectUrls[scope].delete(objectUrl);
    };
    image.src = objectUrl;
}

function createGearPhotoThumbnail(item) {
    const button = document.createElement('button');
    const image = document.createElement('img');
    button.type = 'button';
    button.className = 'gear-card-photo';
    button.dataset.gearPhotoId = item.id;
    button.setAttribute('aria-label', `${item.name}の写真を拡大表示`);
    button.hidden = true;
    image.alt = '';
    button.append(image);
    gearPhotoStore.getPhoto(item.photoId).then((result) => {
        if (!result.ok || !result.record?.blob || !button.isConnected) return;
        showGearPhotoBlob(result.record.blob, 'list', image, () => { button.hidden = false; });
    });
    return button;
}

function closeGearPhotoLightbox({ restoreFocus = false } = {}) {
    const returnFocus = gearPhotoLightboxReturnFocus;
    cleanupGearPhotoObjectUrls('lightbox');
    elements.gearPhotoLightbox.hidden = true;
    elements.gearPhotoLightboxImage.removeAttribute('src');
    delete elements.gearPhotoLightbox.dataset.itemId;
    gearPhotoLightboxReturnFocus = null;
    document.body.classList.remove('gear-photo-lightbox-open');
    if (restoreFocus && returnFocus?.isConnected && !returnFocus.disabled) returnFocus.focus({ preventScroll: true });
}

async function openGearPhotoLightbox(item, blob = null) {
    if (!item?.photoId && !blob) return;
    const returnFocus = document.activeElement;
    cleanupGearPhotoObjectUrls('lightbox');
    const generation = gearPhotoRenderGeneration.lightbox;
    const result = blob ? { ok: true, record: { blob } } : await gearPhotoStore.getPhoto(item.photoId);
    if (generation !== gearPhotoRenderGeneration.lightbox || !result.ok || !result.record?.blob) return;
    elements.gearPhotoLightbox.dataset.itemId = item.id || '';
    gearPhotoLightboxReturnFocus = returnFocus;
    elements.gearPhotoLightboxTitle.textContent = `${item.name || '機材'}の写真`;
    elements.gearPhotoLightboxImage.alt = `${item.name || '機材'}の写真`;
    showGearPhotoBlob(result.record.blob, 'lightbox', elements.gearPhotoLightboxImage);
    elements.gearPhotoLightbox.hidden = false;
    document.body.classList.add('gear-photo-lightbox-open');
    elements.gearPhotoLightboxClose.focus({ preventScroll: true });
}

function updateGearPhotoControls(hasPhoto) {
    for (const button of [elements.gearPhotoSelectLabel, elements.gearPhotoReadjust]) {
        button.classList.toggle('tool-pro-locked', !getCapabilities().gearPhotoWrite);
        button.setAttribute('aria-label', `${button.textContent}${getCapabilities().gearPhotoWrite ? '' : '（Pro版機能）'}`);
    }
    elements.gearPhotoPreview.disabled = !hasPhoto || gearState.photoProcessing || gearState.saving;
    elements.gearPhotoReadjust.hidden = !hasPhoto;
    elements.gearPhotoRemove.hidden = !hasPhoto;
    elements.gearPhotoReadjust.disabled = gearState.photoProcessing || gearState.saving;
    elements.gearPhotoRemove.disabled = gearState.photoProcessing || gearState.saving;
    elements.gearPhotoInput.disabled = gearState.photoProcessing || gearState.saving;
    elements.gearPhotoSelectLabel.classList.toggle('is-disabled', gearState.photoProcessing || gearState.saving);
    elements.gearPhotoSelectLabel.setAttribute('aria-disabled', String(gearState.photoProcessing || gearState.saving));
}

function showGearPhotoPreview(blob, status = '') {
    cleanupGearPhotoObjectUrls('form');
    const image = document.createElement('img');
    image.alt = '';
    elements.gearPhotoPreview.replaceChildren(image);
    showGearPhotoBlob(blob, 'form', image);
    elements.gearPhotoStatus.textContent = status;
    updateGearPhotoControls(true);
}

function showEmptyGearPhotoPreview(status = '') {
    cleanupGearPhotoObjectUrls('form');
    const text = document.createElement('span');
    text.textContent = '写真は未設定です';
    elements.gearPhotoPreview.replaceChildren(text);
    elements.gearPhotoStatus.textContent = status;
    updateGearPhotoControls(false);
}

async function resetGearPhotoForm(item = null) {
    cleanupGearPhotoFormState();
    elements.gearPhotoInput.value = '';
    elements.gearPhotoSelectLabel.textContent = item?.photoId ? '写真を変更' : '写真を選択';
    showEmptyGearPhotoPreview();
    if (!item?.photoId) return;
    const generation = gearPhotoRenderGeneration.form;
    elements.gearPhotoStatus.textContent = '写真を読み込んでいます…';
    const result = await gearPhotoStore.getPhoto(item.photoId);
    if (generation !== gearPhotoRenderGeneration.form) return;
    if (!result.ok || !result.record?.blob) {
        showEmptyGearPhotoPreview('写真を読み込めませんでした。機材情報はそのまま利用できます。');
        return;
    }
    showGearPhotoPreview(result.record.blob);
}

function renderGearCard(item) {
    const card = document.createElement('article');
    const heading = document.createElement('div');
    const name = document.createElement('h3');
    card.className = `gear-card gear-card--${item.status}`;
    heading.className = 'gear-card-heading';
    name.textContent = item.name;
    heading.append(name);
    card.append(heading);

    if (item.photoId) card.prepend(createGearPhotoThumbnail(item));

    if (item.priceText) {
        const price = document.createElement('p');
        price.className = 'gear-card-price';
        price.textContent = item.priceText;
        card.append(price);
    }
    card.append(createGearMetadata(item));
    if (item.memo) {
        const memo = document.createElement('p');
        memo.className = 'gear-card-memo';
        memo.textContent = item.memo;
        card.append(memo);
    }
    const actions = document.createElement('div');
    actions.className = 'gear-card-actions';
    if (item.status === 'wishlist') {
        actions.append(createGearAction('購入した', 'purchase', item, 'gear-purchase-action'));
    } else if (item.status === 'owned') {
        actions.append(createGearAction('手放した', 'sell', item, 'secondary-action'));
    } else {
        actions.append(createGearAction('所有中に戻す', 'restore', item, 'secondary-action'));
    }
    actions.append(
        createGearAction('編集', 'edit', item),
        createGearAction('削除', 'delete', item, 'danger-action')
    );
    card.append(actions);
    return card;
}

function renderGearCategoryFilter() {
    const categories = [{ id: 'all', name: '全て' }, ...gearState.categories];
    elements.gearCategorySelect.replaceChildren();
    categories.forEach(({ id, name }) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = name;
        elements.gearCategorySelect.append(option);
    });
    elements.gearCategorySelect.value = categories.some(({ id }) => id === gearState.activeCategory)
        ? gearState.activeCategory
        : 'all';
    elements.gearCategorySelect.disabled = gearState.reorderMode;
    elements.gearCategoryMenuToggle.disabled = gearState.reorderMode;
    if (gearState.reorderMode) closeGearCategoryMenu();
    const categorySelected = gearState.activeCategory !== 'all';
    elements.gearCategoryAdd.disabled = gearState.reorderMode || !gearState.categoryStorageReady;
    elements.gearCategoryRename.disabled = !categorySelected || gearState.reorderMode || !gearState.categoryStorageReady;
    elements.gearCategoryDelete.disabled = !categorySelected || gearState.reorderMode || !gearState.categoryStorageReady;
}

function closeGearCategoryMenu({ restoreFocus = false } = {}) {
    if (!elements.gearCategoryMenu || elements.gearCategoryMenu.hidden) return;
    elements.gearCategoryMenu.hidden = true;
    elements.gearCategoryMenuToggle?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) elements.gearCategoryMenuToggle?.focus({ preventScroll: true });
}

function toggleGearCategoryMenu() {
    if (!elements.gearCategoryMenu || gearState.reorderMode) return;
    const willOpen = elements.gearCategoryMenu.hidden;
    if (!willOpen) {
        closeGearCategoryMenu({ restoreFocus: true });
        return;
    }
    elements.gearCategoryMenu.hidden = false;
    elements.gearCategoryMenuToggle.setAttribute('aria-expanded', 'true');
    const firstEnabled = [...elements.gearCategoryMenu.querySelectorAll('[role="menuitem"]')]
        .find((item) => !item.disabled);
    firstEnabled?.focus({ preventScroll: true });
}

function populateGearCategoryOptions(selectedId = '') {
    elements.gearCategoryInput.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '選択してください';
    elements.gearCategoryInput.append(placeholder);
    gearState.categories.forEach(({ id, name }) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = name;
        elements.gearCategoryInput.append(option);
    });
    elements.gearCategoryInput.value = gearState.categories.some(({ id }) => id === selectedId) ? selectedId : '';
}

function openGearCategoryDialog(mode) {
    if (!gearState.categoryStorageReady || gearState.reorderMode) return;
    const category = gearState.categories.find(({ id }) => id === gearState.activeCategory);
    if (mode === 'rename' && !category) return;
    gearState.categoryDialogMode = mode;
    elements.gearCategoryDialogTitle.textContent = mode === 'rename' ? 'カテゴリ名を変更' : 'カテゴリを追加';
    elements.gearCategoryName.value = mode === 'rename' ? category.name : '';
    showNotice(elements.gearCategoryError);
    elements.gearCategoryDialog.hidden = false;
    elements.wishlistView.inert = true;
    requestAnimationFrame(() => elements.gearCategoryName.focus());
}

function closeGearCategoryDialog({ restoreFocus = true } = {}) {
    if (elements.gearCategoryDialog.hidden) return;
    const mode = gearState.categoryDialogMode;
    elements.gearCategoryDialog.hidden = true;
    elements.wishlistView.inert = false;
    gearState.categoryDialogMode = null;
    if (!restoreFocus) return;
    const target = elements.gearCategoryMenuToggle;
    target?.focus({ preventScroll: true });
}

function handleGearCategorySubmit(event) {
    event.preventDefault();
    const result = gearState.categoryDialogMode === 'rename'
        ? renameGearCategory(gearState.categories, gearState.activeCategory, elements.gearCategoryName.value)
        : addGearCategory(gearState.categories, elements.gearCategoryName.value);
    if (!result.ok) {
        const message = result.reason === 'duplicate-name'
            ? '同じ名前のカテゴリが既にあります。'
            : `カテゴリ名は1〜${GEAR_CATEGORY_NAME_LIMIT}文字で入力してください。`;
        showNotice(elements.gearCategoryError, message);
        elements.gearCategoryName.focus();
        return;
    }
    const saved = saveGearCategories(result.categories);
    if (!saved.ok) {
        showNotice(elements.gearCategoryError, 'カテゴリを保存できませんでした。入力内容を控えてからページを更新してください。');
        return;
    }
    gearState.categories = result.categories;
    if (result.category) gearState.activeCategory = result.category.id;
    closeGearCategoryDialog({ restoreFocus: false });
    renderWishlist({ focus: false });
    elements.gearCategorySelect.focus({ preventScroll: true });
}

function reloadGearItemsBeforeCategoryDelete() {
    const latest = loadGearList();
    if (!latest.ok) {
        gearState.storageReady = false;
        showNotice(elements.gearStorageError, '機材リストを読み込めませんでした。カテゴリは削除していません。');
        return null;
    }
    gearState.items = latest.items;
    gearState.storageReady = true;
    return latest.items;
}

function showGearCategoryHasItemsNotice() {
    window.alert('このカテゴリには機材が登録されています。\n削除するには、先に機材を別のカテゴリへ移動してください。');
}

function handleGearCategoryDelete() {
    if (!gearState.categoryStorageReady || gearState.reorderMode) return;
    const category = gearState.categories.find(({ id }) => id === gearState.activeCategory);
    if (!category) return;
    const itemsBeforeConfirmation = reloadGearItemsBeforeCategoryDelete();
    if (!itemsBeforeConfirmation) return;
    if (itemsBeforeConfirmation.some((item) => item.category === category.id)) {
        showGearCategoryHasItemsNotice();
        elements.gearCategoryMenuToggle?.focus({ preventScroll: true });
        return;
    }
    if (!window.confirm(`「${category.name}」カテゴリを削除しますか？\nこの操作は元に戻せません。`)) return;

    // Re-read after confirmation. A different tab may have assigned an item to
    // this category while the confirmation dialog was open.
    const latestItems = reloadGearItemsBeforeCategoryDelete();
    if (!latestItems) return;
    if (latestItems.some((item) => item.category === category.id)) {
        showGearCategoryHasItemsNotice();
        renderWishlist({ focus: false });
        elements.gearCategoryMenuToggle?.focus({ preventScroll: true });
        return;
    }

    const result = deleteGearCategory(gearState.categories, category.id);
    if (!result.ok) return;
    const saved = saveGearCategories(result.categories);
    if (!saved.ok) {
        showNotice(elements.gearStorageError, 'カテゴリを削除できませんでした。ページを更新してからもう一度お試しください。');
        return;
    }
    gearState.categories = result.categories;
    gearState.activeCategory = 'all';
    renderWishlist({ focus: false });
    elements.gearCategorySelect.focus({ preventScroll: true });
}

function getGearSections() {
    if (gearState.activeStatus === 'all') {
        return [
            { status: 'owned', title: '今持っている機材', emptyMessage: '今持っている機材はまだありません' },
            { status: 'sold', title: '手放した機材', emptyMessage: '手放した機材はまだありません' },
            { status: 'wishlist', title: 'ほしい機材', emptyMessage: 'ほしい機材はまだありません' }
        ];
    }
    if (gearState.activeStatus === 'owned') {
        return [
            { status: 'owned', title: '今持っている機材', emptyMessage: '今持っている機材はまだありません' },
            { status: 'sold', title: '手放した機材', emptyMessage: '手放した機材はまだありません' }
        ];
    }
    return [{ status: 'wishlist', title: 'ほしい機材', emptyMessage: 'ほしい機材はまだありません' }];
}

function renderGearReorderCard(item, index, length) {
    const card = document.createElement('article');
    const name = document.createElement('h3');
    const controls = document.createElement('div');
    const upButton = document.createElement('button');
    const downButton = document.createElement('button');
    card.className = `gear-card gear-card--${item.status} gear-card--reorder`;
    name.textContent = item.name;
    controls.className = 'reorder-controls gear-reorder-controls';
    [
        [upButton, '↑', -1, index === 0, '上へ移動'],
        [downButton, '↓', 1, index === length - 1, '下へ移動']
    ].forEach(([button, label, direction, disabled, description]) => {
        button.type = 'button';
        button.className = 'reorder-move';
        button.dataset.gearAction = 'reorder-move';
        button.dataset.id = item.id;
        button.dataset.direction = String(direction);
        button.disabled = disabled;
        button.textContent = label;
        button.setAttribute('aria-label', `${item.name}を${description}`);
        controls.append(button);
    });
    card.append(name, controls);
    return card;
}

function renderGearSection({ status, title, emptyMessage }) {
    const section = document.createElement('section');
    const heading = document.createElement('div');
    const headingTitle = document.createElement('h2');
    const count = document.createElement('span');
    const items = selectGearItems(
        gearState.reorderMode && gearState.reorderStatus === status ? gearState.reorderItems : gearState.items,
        { status, category: gearState.activeCategory }
    );
    section.className = 'gear-list-section';
    heading.className = 'gear-list-heading';
    headingTitle.textContent = title;
    count.textContent = `${items.length}件`;
    heading.append(headingTitle, count);
    if (!gearState.reorderMode && gearState.activeStatus !== 'all' && gearState.activeCategory === 'all' && items.length >= 2) {
        const start = document.createElement('button');
        start.type = 'button';
        start.className = 'reorder-button gear-reorder-start';
        start.dataset.gearReorderStatus = status;
        start.textContent = '並び替え';
        start.setAttribute('aria-label', `${title}を並び替え`);
        heading.append(start);
    }
    const list = document.createElement('div');
    list.className = 'gear-list-items';
    if (gearState.reorderMode && gearState.reorderStatus === status) {
        items.forEach((item, index) => list.append(renderGearReorderCard(item, index, items.length)));
    } else {
        items.forEach((item) => list.append(renderGearCard(item)));
    }
    const empty = document.createElement('div');
    empty.className = 'gear-list-empty';
    empty.hidden = items.length !== 0;
    const emptyCopy = document.createElement('p');
    emptyCopy.textContent = emptyMessage;
    empty.append(emptyCopy);
    section.append(heading, list, empty);
    return section;
}

function renderWishlist({ focus = true } = {}) {
    cleanupGearPhotoObjectUrls('list');
    showView(elements.wishlistView);
    elements.gearTabs.forEach((tab) => {
        const selected = tab.dataset.gearStatus === gearState.activeStatus;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        tab.classList.toggle('is-selected', selected);
    });
    const activeTab = elements.gearTabs.find((tab) => tab.dataset.gearStatus === gearState.activeStatus);
    elements.gearContent.setAttribute('aria-labelledby', activeTab?.id || 'gear-all-tab');
    renderGearCategoryFilter();
    elements.gearSections.replaceChildren(...getGearSections().map(renderGearSection));
    elements.gearReorderActions.hidden = !gearState.reorderMode;
    elements.gearReorderStatus.hidden = !gearState.reorderMode;
    elements.gearReorderStatus.textContent = gearState.reorderMode
        ? '並び替え中です。上下のボタンで順序を変更し、完了で保存します。'
        : '';
    elements.gearTitleAdd.hidden = gearState.reorderMode;
    elements.gearTitleAdd.disabled = !gearState.storageReady || !gearState.categoryStorageReady || gearState.reorderMode;
    elements.gearAdd.hidden = gearState.reorderMode;
    elements.gearAdd.textContent = gearState.activeStatus === 'wishlist' ? '＋ ほしい機材を追加' : '＋ 機材を追加';
    elements.gearAdd.disabled = !gearState.storageReady || !gearState.categoryStorageReady || gearState.reorderMode;
    showNotice(
        elements.gearStorageError,
        !gearState.storageReady
            ? '機材リストを読み込めませんでした。保存データは変更していません。'
            : !gearState.categoryStorageReady
                ? 'カテゴリ設定を読み込めませんでした。機材データは変更していません。'
                : ''
    );
    if (focus) elements.gearTitle.focus({ preventScroll: true });
}

function gearPhotoErrorMessage(reason) {
    if (reason === 'file-too-large') return '写真は15MB以内で選択してください。';
    if (reason === 'svg-not-supported') return 'SVG画像は使用できません。PNG、JPEG、WebPなどの画像を選択してください。';
    return 'この画像形式を読み込めませんでした。別の画像を選んでください。';
}

function renderGearPhotoCrop() {
    const session = gearState.cropSession;
    const cropState = gearState.cropState;
    if (!session || !cropState) return;
    const canvas = elements.gearPhotoCropCanvas;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
        session.prepared.source,
        cropState.offsetX,
        cropState.offsetY,
        cropState.sourceWidth * cropState.scale,
        cropState.sourceHeight * cropState.scale
    );
    elements.gearPhotoCropSlider.value = String(cropState.scale);
    const zoomPercent = Math.round((cropState.scale / cropState.minScale) * 100);
    elements.gearPhotoCropSlider.setAttribute('aria-valuetext', `${zoomPercent}%`);
}

function openGearPhotoCropEditor(prepared, { sourceBlob, initialCrop = null } = {}) {
    closeGearPhotoCropEditor({ restoreStatus: false, restoreFocus: false });
    const cropState = initialCrop
        ? createCropStateFromMetadata(prepared.width, prepared.height, initialCrop)
        : createInitialCropState(prepared.width, prepared.height);
    gearState.cropSession = { prepared, sourceBlob };
    gearState.cropState = cropState;
    gearState.cropPointers.clear();
    elements.gearPhotoCropSlider.min = String(cropState.minScale);
    elements.gearPhotoCropSlider.max = String(cropState.maxScale);
    elements.gearPhotoCropSlider.step = String((cropState.maxScale - cropState.minScale) / 1000);
    elements.gearPhotoCropStatus.textContent = '';
    elements.gearPhotoCropDialog.hidden = false;
    document.body.classList.add('my-apps-crop-open');
    renderGearPhotoCrop();
    elements.gearPhotoCropTitle.focus({ preventScroll: true });
}

function closeGearPhotoCropEditor({ restoreStatus = true, restoreFocus = true } = {}) {
    const session = gearState.cropSession;
    session?.prepared.cleanup();
    gearState.cropSession = null;
    gearState.cropState = null;
    gearState.cropPointers.clear();
    elements.gearPhotoCropDialog.hidden = true;
    if (elements.myAppsCropDialog.hidden) document.body.classList.remove('my-apps-crop-open');
    const context = elements.gearPhotoCropCanvas.getContext('2d');
    context.clearRect(0, 0, elements.gearPhotoCropCanvas.width, elements.gearPhotoCropCanvas.height);
    elements.gearPhotoInput.value = '';
    if (restoreStatus) elements.gearPhotoStatus.textContent = '';
    if (restoreFocus) elements.gearPhotoPreview.focus({ preventScroll: true });
}

function gearCropPointerPosition(event) {
    const rect = elements.gearPhotoCropCanvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * (elements.gearPhotoCropCanvas.width / rect.width),
        y: (event.clientY - rect.top) * (elements.gearPhotoCropCanvas.height / rect.height)
    };
}

function handleGearCropPointerDown(event) {
    if (!gearState.cropSession) return;
    event.preventDefault();
    elements.gearPhotoCropCanvas.setPointerCapture?.(event.pointerId);
    gearState.cropPointers.set(event.pointerId, gearCropPointerPosition(event));
}

function handleGearCropPointerMove(event) {
    if (!gearState.cropPointers.has(event.pointerId) || !gearState.cropState) return;
    event.preventDefault();
    const previousPoints = [...gearState.cropPointers.values()];
    const previousPoint = gearState.cropPointers.get(event.pointerId);
    const currentPoint = gearCropPointerPosition(event);
    gearState.cropPointers.set(event.pointerId, currentPoint);
    const currentPoints = [...gearState.cropPointers.values()];
    gearState.cropState = currentPoints.length === 1
        ? moveCrop(gearState.cropState, currentPoint.x - previousPoint.x, currentPoint.y - previousPoint.y)
        : applyPinchGesture(gearState.cropState, previousPoints.slice(0, 2), currentPoints.slice(0, 2));
    renderGearPhotoCrop();
}

function handleGearCropPointerEnd(event) {
    gearState.cropPointers.delete(event.pointerId);
    if (elements.gearPhotoCropCanvas.hasPointerCapture?.(event.pointerId)) {
        elements.gearPhotoCropCanvas.releasePointerCapture(event.pointerId);
    }
}

function handleGearCropSlider() {
    if (!gearState.cropState) return;
    const center = gearState.cropState.cropSize / 2;
    gearState.cropState = zoomCropAtPoint(gearState.cropState, Number(elements.gearPhotoCropSlider.value), center, center);
    renderGearPhotoCrop();
}

async function confirmGearPhotoCrop() {
    if (!guardImageWrite('gearPhoto')) return;
    const session = gearState.cropSession;
    const cropState = gearState.cropState;
    if (!session || !cropState || gearState.photoProcessing) return;
    gearState.photoProcessing = true;
    elements.gearPhotoCropConfirm.disabled = true;
    elements.gearPhotoCropCancel.disabled = true;
    elements.gearPhotoCropStatus.textContent = '写真を作成しています…';
    const result = await encodePreparedGearPhoto(session.prepared, cropState);
    if (gearState.cropSession !== session) return;
    gearState.photoProcessing = false;
    elements.gearPhotoCropConfirm.disabled = false;
    elements.gearPhotoCropCancel.disabled = false;
    if (!result.ok) {
        elements.gearPhotoCropStatus.textContent = gearPhotoErrorMessage(result.reason);
        return;
    }
    const crop = cropStateToMetadata(cropState);
    const sourceBlob = session.sourceBlob;
    const sourceWidth = session.prepared.width;
    const sourceHeight = session.prepared.height;
    closeGearPhotoCropEditor({ restoreStatus: false });
    gearState.photoAction = 'replace';
    gearState.photoBlob = result.blob;
    gearState.photoSourceBlob = sourceBlob;
    gearState.photoCrop = crop;
    gearState.photoSourceWidth = sourceWidth;
    gearState.photoSourceHeight = sourceHeight;
    elements.gearPhotoSelectLabel.textContent = '写真を変更';
    showGearPhotoPreview(result.blob, '調整した写真です。フォームの保存で反映されます。');
}

async function prepareAndOpenGearPhoto(blob, initialCrop = null) {
    if (gearState.photoProcessing || gearState.saving) return;
    const generation = gearPhotoRenderGeneration.form;
    gearState.photoProcessing = true;
    updateGearPhotoControls(Boolean(gearState.photoBlob || findGearItem(gearState.activeId)?.photoId));
    elements.gearPhotoStatus.textContent = '写真を読み込んでいます…';
    const prepared = await prepareGearPhotoSource(blob);
    if (generation !== gearPhotoRenderGeneration.form) {
        prepared.cleanup?.();
        return;
    }
    gearState.photoProcessing = false;
    updateGearPhotoControls(Boolean(gearState.photoBlob || findGearItem(gearState.activeId)?.photoId));
    if (!prepared.ok) {
        elements.gearPhotoStatus.textContent = gearPhotoErrorMessage(prepared.reason);
        elements.gearPhotoInput.value = '';
        return;
    }
    openGearPhotoCropEditor(prepared, { sourceBlob: prepared.blob, initialCrop });
}

async function openStoredGearPhotoForReadjustment(blob, initialCrop) {
    if (gearState.photoProcessing || gearState.saving) return;
    const generation = gearPhotoRenderGeneration.form;
    gearState.photoProcessing = true;
    updateGearPhotoControls(true);
    elements.gearPhotoStatus.textContent = '元の写真を読み込んでいます…';
    const prepared = await prepareMyAppIcon(blob);
    if (generation !== gearPhotoRenderGeneration.form) {
        prepared.cleanup?.();
        return;
    }
    gearState.photoProcessing = false;
    updateGearPhotoControls(true);
    if (!prepared.ok) {
        elements.gearPhotoStatus.textContent = gearPhotoErrorMessage(prepared.reason);
        return;
    }
    openGearPhotoCropEditor(prepared, { sourceBlob: blob, initialCrop });
}

async function handleGearPhotoSelection() {
    if (!guardImageWrite('gearPhoto')) { elements.gearPhotoInput.value = ''; return; }
    const file = elements.gearPhotoInput.files?.[0];
    if (file) await prepareAndOpenGearPhoto(file);
}

async function handleGearPhotoReadjust() {
    if (!guardImageWrite('gearPhoto')) return;
    if (gearState.photoAction === 'replace' && gearState.photoSourceBlob) {
        await openStoredGearPhotoForReadjustment(gearState.photoSourceBlob, gearState.photoCrop);
        return;
    }
    const item = findGearItem(gearState.activeId);
    if (!item?.photoSourceId) return;
    const generation = gearPhotoRenderGeneration.form;
    gearState.photoProcessing = true;
    updateGearPhotoControls(true);
    elements.gearPhotoStatus.textContent = '元の写真を読み込んでいます…';
    const result = await gearPhotoStore.getPhoto(item.photoSourceId);
    if (generation !== gearPhotoRenderGeneration.form) return;
    gearState.photoProcessing = false;
    updateGearPhotoControls(true);
    if (!result.ok || !result.record?.blob) {
        elements.gearPhotoStatus.textContent = '元の写真を読み込めませんでした。別の写真を選んでください。';
        return;
    }
    await openStoredGearPhotoForReadjustment(result.record.blob, item.photoCrop);
}

function handleGearPhotoRemove() {
    if (!window.confirm('この機材の写真を削除しますか？')) return;
    gearState.photoAction = 'remove';
    gearState.photoBlob = null;
    gearState.photoSourceBlob = null;
    gearState.photoCrop = null;
    elements.gearPhotoSelectLabel.textContent = '写真を選択';
    showEmptyGearPhotoPreview('写真はフォームの保存時に削除されます。');
}

function fillGearForm(item = null) {
    elements.gearForm.reset();
    elements.gearNameInput.value = item?.name || '';
    populateGearCategoryOptions(item?.category || getInitialGearCategory(gearState.activeCategory));
    elements.gearPriceInput.value = item?.priceText || '';
    elements.gearStatusInput.value = item?.status || (gearState.activeStatus === 'wishlist' ? 'wishlist' : 'owned');
    elements.gearPriorityInput.value = item?.priority || 'medium';
    elements.gearMemoInput.value = item?.memo || '';
    updateGearPriorityVisibility();
    showNotice(elements.gearFormError);
    resetGearPhotoForm(item);
}

function renderGearForm(mode, id = null) {
    if (!gearState.storageReady || !gearState.categoryStorageReady) {
        correctGearListRoute();
        return;
    }
    const item = mode === 'edit' ? findGearItem(id) : null;
    if (mode === 'edit' && !item) {
        correctGearListRoute();
        return;
    }
    gearState.formMode = mode;
    gearState.activeId = item?.id || null;
    elements.gearFormTitle.textContent = mode === 'edit'
        ? `${item.name}を編集`
        : gearState.activeStatus === 'wishlist' ? 'ほしい機材を追加' : '機材を追加';
    fillGearForm(item);
    showView(elements.gearFormView);
    elements.gearFormTitle.focus({ preventScroll: true });
}

function updateGearPriorityVisibility() {
    elements.gearPriorityField.hidden = elements.gearStatusInput.value !== 'wishlist';
}

function readGearFormValues() {
    if (!gearState.categories.some(({ id }) => id === elements.gearCategoryInput.value)) {
        return { ok: false, field: 'category', message: 'カテゴリを選択してください。' };
    }
    return validateGearValues({
        name: elements.gearNameInput.value,
        category: elements.gearCategoryInput.value,
        priceText: elements.gearPriceInput.value,
        priority: elements.gearPriorityInput.value,
        memo: elements.gearMemoInput.value,
        status: elements.gearStatusInput.value
    });
}

function persistGearItems(candidateItems, errorElement, message) {
    const result = saveGearList(candidateItems);
    if (!result.ok) {
        showNotice(errorElement, message);
        return false;
    }
    gearState.items = candidateItems;
    return true;
}

async function handleGearSubmit(event) {
    event.preventDefault();
    if (gearState.saving || gearState.photoProcessing || gearState.cropSession) return;
    showNotice(elements.gearFormError);
    const validation = readGearFormValues();
    if (!validation.ok) {
        showNotice(elements.gearFormError, validation.message);
        const fieldElements = {
            name: elements.gearNameInput,
            category: elements.gearCategoryInput,
            priceText: elements.gearPriceInput,
            priority: elements.gearPriorityInput,
            status: elements.gearStatusInput,
            memo: elements.gearMemoInput
        };
        fieldElements[validation.field]?.focus();
        return;
    }

    const originalItem = gearState.formMode === 'edit' ? findGearItem(gearState.activeId) : null;
    const buildItems = (references = null, removePhoto = false) => {
        if (gearState.formMode === 'edit') {
            const updateResult = updateGearItem(gearState.items, gearState.activeId, validation.values);
            if (!updateResult.found) return null;
            if (references) return setGearPhotoReferences(updateResult.items, gearState.activeId, references).items;
            if (removePhoto) return clearGearPhotoReferences(updateResult.items, gearState.activeId).items;
            return updateResult.items;
        }
        return [...gearState.items, createGearItem(validation.values, gearState.items, new Date(), references)];
    };
    if (gearState.formMode === 'edit' && !originalItem) {
        correctGearListRoute();
        return;
    }

    if (gearState.photoAction === 'replace' && !guardImageWrite('gearPhoto')) return;
    gearState.saving = true;
    updateGearPhotoControls(Boolean(gearState.photoBlob || originalItem?.photoId));
    const submitButton = elements.gearForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = '保存中…';
    let result;
    if (gearState.photoAction === 'replace') {
        result = await commitGearPhotoChange({
            photoStore: gearPhotoStore,
            pending: {
                sourceBlob: gearState.photoSourceBlob,
                finalBlob: gearState.photoBlob,
                crop: gearState.photoCrop,
                sourceWidth: gearState.photoSourceWidth,
                sourceHeight: gearState.photoSourceHeight
            },
            previousReferences: getGearPhotoReferences(originalItem),
            buildItems: (references) => buildItems(references),
            persist: (items) => saveGearList(items)
        });
    } else if (gearState.photoAction === 'remove' && originalItem) {
        result = await commitGearPhotoRemoval({
            photoStore: gearPhotoStore,
            previousReferences: getGearPhotoReferences(originalItem),
            buildItems: () => buildItems(null, true),
            persist: (items) => saveGearList(items)
        });
    } else {
        const candidateItems = buildItems();
        const persisted = saveGearList(candidateItems);
        result = persisted.ok ? { ok: true, items: candidateItems } : { ok: false, reason: 'metadata-write-failed' };
    }
    gearState.saving = false;
    submitButton.disabled = false;
    submitButton.textContent = '保存';
    updateGearPhotoControls(Boolean(gearState.photoBlob || originalItem?.photoId));
    if (!result.ok) {
        showNotice(elements.gearFormError, result.reason === 'write-failed'
            ? '写真を保存できませんでした。機材リストは変更していません。'
            : '保存できませんでした。元の機材リストは変更していません。');
        return;
    }
    gearState.items = result.items;
    gearState.activeStatus = validation.values.status === 'wishlist' ? 'wishlist' : 'owned';
    setGearListRoute();
}

function handleGearPurchase(item) {
    if (!window.confirm(`${item.name}を自分の機材に追加しますか？`)) return;
    const result = markGearPurchased(gearState.items, item.id);
    if (!result.found) return;
    if (!persistGearItems(result.items, elements.gearStorageError, '変更を保存できませんでした。元のリストは変更していません。')) return;
    gearState.activeStatus = 'owned';
    renderWishlist({ focus: false });
}

function handleGearSell(item) {
    if (!window.confirm(`${item.name}を手放した機材へ移しますか？`)) return;
    const result = markGearSold(gearState.items, item.id);
    if (!result.found) return;
    if (!persistGearItems(result.items, elements.gearStorageError, '変更を保存できませんでした。元のリストは変更していません。')) return;
    gearState.activeStatus = 'owned';
    renderWishlist({ focus: false });
}

function handleGearRestore(item) {
    if (!window.confirm(`${item.name}を所有中の機材へ戻しますか？`)) return;
    const result = restoreGearOwned(gearState.items, item.id);
    if (!result.found) return;
    if (!persistGearItems(result.items, elements.gearStorageError, '変更を保存できませんでした。元のリストは変更していません。')) return;
    gearState.activeStatus = 'owned';
    renderWishlist({ focus: false });
}

async function handleGearDelete(item) {
    const message = item.status === 'owned'
        ? `${item.name}を機材リストから削除しますか？`
        : item.status === 'sold'
            ? `${item.name}を手放した機材から削除しますか？`
            : `${item.name}をほしい機材から削除しますか？`;
    if (!window.confirm(message)) return;
    const deletion = deleteGearItem(gearState.items, item.id);
    if (!deletion.found) return;
    const result = item.photoId || item.photoSourceId
        ? await commitGearItemDeletion({
            photoStore: gearPhotoStore,
            references: getGearPhotoReferences(item),
            buildItems: () => deletion.items,
            persist: (items) => saveGearList(items)
        })
        : saveGearList(deletion.items).ok
            ? { ok: true, items: deletion.items, cleanupOk: true }
            : { ok: false };
    if (!result.ok) {
        showNotice(elements.gearStorageError, '削除を保存できませんでした。元のリストは変更していません。');
        return;
    }
    gearState.items = result.items;
    renderWishlist({ focus: false });
    if (result.cleanupOk === false) {
        showNotice(elements.gearStorageError, '機材は削除しましたが、写真データの整理を完了できませんでした。');
    }
}

function startGearReorder(status) {
    if (!['owned', 'wishlist', 'sold'].includes(status)
        || gearState.activeStatus === 'all'
        || gearState.activeCategory !== 'all'
        || selectGearItems(gearState.items, { status }).length < 2) {
        return;
    }
    gearState.reorderMode = true;
    gearState.reorderStatus = status;
    gearState.reorderItems = gearState.items.map((item) => ({ ...item }));
    showNotice(elements.gearReorderNotice);
    renderWishlist({ focus: false });
}

function cancelGearReorder() {
    gearState.reorderMode = false;
    gearState.reorderStatus = null;
    gearState.reorderItems = [];
    showNotice(elements.gearReorderNotice);
    renderWishlist({ focus: false });
}

function moveGearReorderItem(id, direction) {
    const result = moveGearItem(gearState.reorderItems, id, direction);
    if (!result.moved) return;
    gearState.reorderItems = result.items;
    renderWishlist({ focus: false });
    [...elements.gearSections.querySelectorAll('.reorder-move')]
        .find((button) => button.dataset.id === id && Number(button.dataset.direction) === direction)
        ?.focus();
}

function completeGearReorder() {
    if (!gearState.reorderMode) return;
    const currentIds = selectGearItems(gearState.items, { status: gearState.reorderStatus }).map(({ id }) => id);
    const reorderedIds = selectGearItems(gearState.reorderItems, { status: gearState.reorderStatus }).map(({ id }) => id);
    if (currentIds.every((id, index) => id === reorderedIds[index])) {
        cancelGearReorder();
        return;
    }
    if (!persistGearItems(gearState.reorderItems, elements.gearReorderNotice, '並び順を保存できませんでした。元の順番は変更していません。')) return;
    gearState.reorderMode = false;
    gearState.reorderStatus = null;
    gearState.reorderItems = [];
    showNotice(elements.gearReorderNotice);
    renderWishlist({ focus: false });
}

function handleGearListAction(event) {
    const photoTarget = event.target.closest('[data-gear-photo-id]');
    if (photoTarget) {
        const photoItem = findGearItem(photoTarget.dataset.gearPhotoId);
        if (photoItem) openGearPhotoLightbox(photoItem);
        return;
    }
    const target = event.target.closest('[data-gear-action]');
    if (!target) return;
    if (target.dataset.gearAction === 'reorder-move') {
        moveGearReorderItem(target.dataset.id, Number(target.dataset.direction));
        return;
    }
    const item = findGearItem(target.dataset.id);
    if (!item) return;
    if (target.dataset.gearAction === 'edit') {
        setHashRoute(`#wishlist/${encodeURIComponent(item.id)}/edit`);
    } else if (target.dataset.gearAction === 'purchase') {
        handleGearPurchase(item);
    } else if (target.dataset.gearAction === 'sell') {
        handleGearSell(item);
    } else if (target.dataset.gearAction === 'restore') {
        handleGearRestore(item);
    } else if (target.dataset.gearAction === 'delete') {
        handleGearDelete(item);
    }
}

function renderRoute() {
    const hash = location.hash;
    if (hash === PRO_INFO_ROUTE && lastRenderedHash !== PRO_INFO_ROUTE) {
        proAccessHasPreviousRoute = lastRenderedHash !== null;
    }
    lastRenderedHash = hash;
    const gearRoute = parseGearRoute(hash);
    const practiceRoute = parsePracticeRoute(hash);
    const myAppsEditMatch = hash.match(/^#my-apps\/([^/]+)\/edit$/);

    if (hash === PRO_INFO_ROUTE) {
        if (document.documentElement.dataset.edition === 'pro') {
            replaceHomeRoute();
            return;
        }
        showView(proAccessView);
        proAccessView.querySelector('h1').focus({ preventScroll: true });
    } else if (hash === '#settings') {
        renderSettings();
    } else if (gearRoute?.kind === GEAR_ROUTE_KIND.list) {
        renderWishlist();
    } else if (gearRoute?.kind === GEAR_ROUTE_KIND.create) {
        renderGearForm('create');
    } else if (gearRoute?.kind === GEAR_ROUTE_KIND.edit) {
        renderGearForm('edit', gearRoute.id);
    } else if (gearRoute?.kind === GEAR_ROUTE_KIND.invalid) {
        correctGearListRoute();
    } else if (practiceRoute?.kind === PRACTICE_ROUTE_KIND.list) {
        renderPracticeList();
    } else if (practiceRoute?.kind === PRACTICE_ROUTE_KIND.hidden) {
        renderPracticeHiddenList();
    } else if (practiceRoute?.kind === PRACTICE_ROUTE_KIND.calendar) {
        renderPracticeHistory();
    } else if (hash === '#my-apps/manage') {
        renderMyAppsManage();
    } else if (hash === '#my-apps/new') {
        renderMyAppsForm('create');
    } else if (myAppsEditMatch) {
        const id = safeDecodeRouteSegment(myAppsEditMatch[1]);
        if (id === null) replaceHomeRoute();
        else renderMyAppsForm('edit', id);
    } else if (practiceRoute?.kind === PRACTICE_ROUTE_KIND.create) {
        renderForm('create');
    } else if (hash === '#tuner') {
        showView(elements.tunerView);
    } else if (hash === '#metronome') {
        showView(elements.metronomeView);
    } else if (practiceRoute?.kind === PRACTICE_ROUTE_KIND.edit) {
        renderForm('edit', practiceRoute.id);
    } else if (practiceRoute?.kind === PRACTICE_ROUTE_KIND.detail) {
        renderDetail(practiceRoute.id);
    } else if (practiceRoute?.kind === PRACTICE_ROUTE_KIND.invalid) {
        replaceHomeRoute();
    } else if (hash) {
        replaceHomeRoute();
    } else {
        renderHome();
    }
    syncPracticeCompletionDialog();
}

function readFormValues() {
    const namePreset = state.formMode === 'create'
        ? getPracticeNamePreset(elements.namePresetInput.value)
        : null;
    const name = namePreset && namePreset.value !== PRACTICE_NAME_PRESET_CUSTOM
        ? namePreset.label
        : elements.nameInput.value.trim();
    const durationText = elements.durationInput.value.trim();
    const selectedAppId = elements.appInput.value;
    const appId = selectedAppId || null;
    const memo = elements.memoInput.value;

    if (!name) return { ok: false, message: 'メニュー名を入力してください。' };
    if (name.length > LIMITS.name) return { ok: false, message: 'メニュー名は100文字以内で入力してください。' };
    if (!/^\d+$/.test(durationText)) return { ok: false, message: '練習時間は1〜999の整数で入力してください。' };

    const durationMinutes = Number(durationText);
    if (durationMinutes < 1 || durationMinutes > LIMITS.durationMinutes) {
        return { ok: false, message: '練習時間は1〜999分で入力してください。' };
    }
    if (appId !== null && !isSelectablePracticeAppId(appId, {
        myApps: myAppsState.items,
        myAppsReady: myAppsState.storageReady
    })) {
        const unresolved = resolveCurrentPracticeApp(appId);
        if (unresolved.status === PRACTICE_APP_STATUS.missing) {
            return { ok: false, message: '使用アプリが削除されています。別のアプリを選択してください。' };
        }
        if (unresolved.status === PRACTICE_APP_STATUS.storeUnavailable) {
            return { ok: false, message: 'My Appsを読み込めません。クルーズアプリまたはツールを選択してください。' };
        }
        return { ok: false, message: '使用アプリを選択してください。' };
    }
    if (memo.length > LIMITS.memo) return { ok: false, message: 'メモは1000文字以内で入力してください。' };

    const hidden = state.formMode === 'edit' ? elements.hiddenInput.checked : false;
    return { ok: true, values: { name, durationMinutes, appId, memo, hidden } };
}

function persist(candidateItems) {
    const result = savePracticeMenus(candidateItems);
    if (!result.ok) {
        showNotice(elements.formError, '保存できませんでした。ブラウザの空き容量や保存設定を確認してください。');
        return false;
    }
    state.items = candidateItems;
    return true;
}

function persistPracticeItemsAndProgress(candidateItems, nextProgress) {
    const previousProgress = state.progress;
    const progressChanged = nextProgress !== state.progress;
    if (progressChanged && !savePracticeProgress(nextProgress).ok) return false;
    const menuResult = savePracticeMenus(candidateItems);
    if (!menuResult.ok) {
        if (progressChanged) savePracticeProgress(previousProgress);
        return false;
    }
    state.items = candidateItems;
    if (progressChanged) state.progress = nextProgress;
    return true;
}

function guardPracticeCreation() {
    const latest = checkPracticeCreation();
    if (!latest.ok) {
        const message = '最新の練習メニューを読み込めません。入力内容を控えてから再読み込みしてください。';
        showNotice(elements.formError, message);
        state.listNotice = message;
        showNotice(elements.listNotice, message);
        return false;
    }
    if (!latest.allowed) { requestToolPro('practiceCreate'); return false; }
    return true;
}

async function handleSubmit(event) {
    event.preventDefault();
    showNotice(elements.formError);
    const formResult = readFormValues();
    if (!formResult.ok) {
        showNotice(elements.formError, formResult.message);
        return;
    }

    if (state.formMode === 'edit') {
        const previousItem = findItem(state.activeId);
        const updateResult = updatePracticeMenu(state.items, state.activeId, formResult.values);
        if (!updateResult.found) {
            showNotice(elements.formError, '編集する練習メニューが見つかりません。');
            return;
        }
        const nextItem = updateResult.items.find((item) => item.id === state.activeId);
        const visibilityChanged = previousItem.hidden !== nextItem.hidden;
        const nextProgress = !previousItem.hidden && nextItem.hidden && state.progressReady
            ? clearPracticeCurrentCheck(state.progress, state.activeId)
            : state.progress;
        if (persistPracticeItemsAndProgress(updateResult.items, nextProgress)) {
            if (visibilityChanged) {
                state.listNotice = nextItem.hidden
                    ? '練習メニューを非表示にしました。'
                    : '練習メニューを通常一覧へ戻しました。';
                window.history.replaceState(
                    null,
                    '',
                    `${location.pathname}${location.search}${nextItem.hidden ? '#practice-menu/hidden' : '#practice-menu'}`
                );
                renderRoute();
            } else if (nextItem.hidden) {
                state.listNotice = '変更を保存しました。';
                window.history.replaceState(null, '', `${location.pathname}${location.search}#practice-menu/hidden`);
                renderRoute();
            } else {
                state.savedNotice = { id: state.activeId, message: '変更を保存しました。' };
                replacePracticeDetailRoute(state.activeId);
            }
        }
        return;
    }

    if (!guardPracticeCreation()) return;
    const item = createPracticeMenu(formResult.values, state.items);
    if (persist([...state.items, item])) {
        const pending = [...state.pendingCreateAttachments];
        let attachmentResult = { ok: true, savedRecords: [], remaining: [] };
        if (pending.length > 0) {
            setPracticeFormSaving(true);
            attachmentResult = await savePendingPracticeAttachments(practiceAttachmentStore, item.id, pending);
            state.pendingCreateAttachments = attachmentResult.remaining;
            await refreshPracticeAttachmentCounts({ renderList: false });
            setPracticeFormSaving(false);
        }
        const savedCount = attachmentResult.savedRecords.length;
        if (attachmentResult.ok) {
            replacePracticeListRoute();
            return;
        }
        state.savedNotice = {
            id: item.id,
            message: savedCount > 0 ? `保存しました。ファイルを${savedCount}件追加しました。` : '保存しました。',
            error: `「${attachmentResult.failed.fileName}」以降のファイルを保存できませんでした。${getPracticeAttachmentFailureMessage(attachmentResult.reason)}`
        };
        replacePracticeDetailRoute(item.id);
    }
}

function cancelForm() {
    if (state.formMode === 'edit' && state.activeId) {
        const item = findItem(state.activeId);
        setHashRoute(item?.hidden
            ? '#practice-menu/hidden'
            : `#practice-menu/${encodeURIComponent(state.activeId)}`);
    } else {
        setPracticeListRoute();
    }
}

async function handleDelete() {
    const item = findItem(state.activeId);
    if (!item || !window.confirm('この練習メニューを削除しますか？')) return;

    const deleteResult = deletePracticeMenu(state.items, item.id);
    if (!deleteResult.found) return;
    const nextProgress = state.progressReady
        ? removePracticeFromProgress(state.progress, item.id)
        : state.progress;
    if (!persistPracticeItemsAndProgress(deleteResult.items, nextProgress)) {
        showNotice(elements.detailError, '削除できませんでした。保存設定を確認してください。');
        return;
    }
    const attachmentCleanup = await practiceAttachmentStore.deleteAttachmentsForPractice(item.id);
    if (!attachmentCleanup.ok) {
        state.listNotice = '練習メニューは削除しましたが、ファイルデータの整理を完了できませんでした。';
    }
    await refreshPracticeAttachmentCounts({ renderList: false });
    if (item.hidden) {
        window.history.replaceState(null, '', `${location.pathname}${location.search}#practice-menu/hidden`);
        renderRoute();
    } else {
        replacePracticeListRoute();
    }
}

function handlePracticeTotalCountReset() {
    const item = findItem(state.activeId);
    if (!item || !state.progressReady || !getPracticeTotalCount(item.id)) return;
    if (!window.confirm(`「${item.name}」の通算回数を0回に戻しますか？\n過去の練習履歴は残ります。`)) return;
    const nextProgress = resetPracticeTotalCount(state.progress, item.id);
    if (!persistPracticeProgress(nextProgress)) {
        showNotice(elements.formError, '通算回数をリセットできませんでした。');
        return;
    }
    elements.formTotalCount.textContent = '0回';
    elements.countReset.disabled = true;
    showNotice(elements.formStatus, '通算回数をリセットしました。履歴は保持されています。');
}

elements.addButton.addEventListener('click', () => {
    if (guardPracticeCreation()) setHashRoute('#practice-menu/new');
});
elements.namePresetInput.addEventListener('change', handlePracticeNamePresetChange);
[elements.gearTitleAdd, elements.gearAdd].forEach((button) => button.addEventListener('click', () => setHashRoute('#wishlist/new')));
elements.gearForm.addEventListener('submit', handleGearSubmit);
elements.gearStatusInput.addEventListener('change', updateGearPriorityVisibility);
elements.gearPhotoInput.addEventListener('change', handleGearPhotoSelection);
elements.gearPhotoSelectLabel.addEventListener('click', () => {
    if (guardImageWrite('gearPhoto') && !elements.gearPhotoInput.disabled) elements.gearPhotoInput.click();
});
elements.gearPhotoReadjust.addEventListener('click', handleGearPhotoReadjust);
elements.gearPhotoRemove.addEventListener('click', handleGearPhotoRemove);
elements.gearPhotoPreview.addEventListener('click', () => {
    const item = findGearItem(gearState.activeId) || { id: '', name: elements.gearNameInput.value || '機材' };
    if (gearState.photoAction === 'replace' && gearState.photoBlob) openGearPhotoLightbox(item, gearState.photoBlob);
    else if (item.photoId) openGearPhotoLightbox(item);
});
elements.gearPhotoCropCanvas.addEventListener('pointerdown', handleGearCropPointerDown);
elements.gearPhotoCropCanvas.addEventListener('pointermove', handleGearCropPointerMove);
elements.gearPhotoCropCanvas.addEventListener('pointerup', handleGearCropPointerEnd);
elements.gearPhotoCropCanvas.addEventListener('pointercancel', handleGearCropPointerEnd);
elements.gearPhotoCropSlider.addEventListener('input', handleGearCropSlider);
elements.gearPhotoCropConfirm.addEventListener('click', confirmGearPhotoCrop);
elements.gearPhotoCropCancel.addEventListener('click', () => closeGearPhotoCropEditor());
elements.gearPhotoCropDialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !gearState.photoProcessing) {
        closeGearPhotoCropEditor();
        return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [elements.gearPhotoCropSlider, elements.gearPhotoCropConfirm, elements.gearPhotoCropCancel]
        .filter((element) => !element.disabled);
    const currentIndex = focusable.indexOf(document.activeElement);
    if (event.shiftKey && currentIndex <= 0) {
        event.preventDefault();
        focusable[focusable.length - 1]?.focus();
    } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
        event.preventDefault();
        focusable[0]?.focus();
    }
});
elements.gearPhotoLightboxClose.addEventListener('click', () => closeGearPhotoLightbox({ restoreFocus: true }));
elements.gearPhotoLightbox.addEventListener('click', (event) => {
    if (event.target === elements.gearPhotoLightbox) closeGearPhotoLightbox({ restoreFocus: true });
});
elements.gearPhotoLightbox.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeGearPhotoLightbox({ restoreFocus: true });
    if (event.key === 'Tab') {
        event.preventDefault();
        elements.gearPhotoLightboxClose.focus();
    }
});
elements.gearSections.addEventListener('click', (event) => {
    const reorderStart = event.target.closest('[data-gear-reorder-status]');
    if (reorderStart) {
        startGearReorder(reorderStart.dataset.gearReorderStatus);
        return;
    }
    handleGearListAction(event);
});
elements.gearReorderCancel.addEventListener('click', cancelGearReorder);
elements.gearReorderComplete.addEventListener('click', completeGearReorder);
elements.gearTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
        if (gearState.reorderMode) cancelGearReorder();
        gearState.activeStatus = tab.dataset.gearStatus;
        renderWishlist({ focus: false });
        tab.focus({ preventScroll: true });
    });
    tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const offset = event.key === 'ArrowLeft' ? -1 : 1;
        elements.gearTabs[(index + offset + elements.gearTabs.length) % elements.gearTabs.length].click();
    });
});
elements.gearCategorySelect.addEventListener('change', () => {
    if (gearState.reorderMode) return;
    gearState.activeCategory = elements.gearCategorySelect.value;
    renderWishlist({ focus: false });
    elements.gearCategorySelect.focus({ preventScroll: true });
});
elements.gearCategoryMenuToggle.addEventListener('click', toggleGearCategoryMenu);
elements.gearCategoryAdd.addEventListener('click', () => {
    closeGearCategoryMenu({ restoreFocus: false });
    openGearCategoryDialog('add');
});
elements.gearCategoryRename.addEventListener('click', () => {
    closeGearCategoryMenu({ restoreFocus: false });
    openGearCategoryDialog('rename');
});
elements.gearCategoryDelete.addEventListener('click', () => {
    closeGearCategoryMenu({ restoreFocus: false });
    handleGearCategoryDelete();
});
document.addEventListener('click', (event) => {
    if (!elements.gearCategoryMenu?.hidden && !elements.gearCategoryMenuWrap?.contains(event.target)) {
        closeGearCategoryMenu();
    }
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && elements.gearCategoryMenu && !elements.gearCategoryMenu.hidden) {
        event.preventDefault();
        closeGearCategoryMenu({ restoreFocus: true });
    }
});
elements.gearCategoryForm.addEventListener('submit', handleGearCategorySubmit);
elements.gearCategoryCancel.addEventListener('click', () => closeGearCategoryDialog());
elements.gearCategoryDialog.addEventListener('click', (event) => {
    if (event.target === elements.gearCategoryDialog) closeGearCategoryDialog();
});
elements.gearCategoryDialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeGearCategoryDialog();
        return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [elements.gearCategoryName, ...elements.gearCategoryForm.querySelectorAll('button')]
        .filter((element) => !element.disabled && !element.hidden);
    const currentIndex = focusable.indexOf(document.activeElement);
    if (event.shiftKey && currentIndex <= 0) {
        event.preventDefault();
        focusable.at(-1)?.focus();
    } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
        event.preventDefault();
        focusable[0]?.focus();
    }
});
elements.form.addEventListener('submit', handleSubmit);
elements.countReset.addEventListener('click', handlePracticeTotalCountReset);
elements.openApp.addEventListener('click', (event) => {
    if (
        elements.openApp.getAttribute('href') !== '#tuner'
        || event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
    ) return;
    void tunerController.startFromUserGesture();
});
function openActivePracticeEditor() {
    if (state.activeId) setHashRoute(`#practice-menu/${encodeURIComponent(state.activeId)}/edit`);
}
elements.editButton.addEventListener('click', openActivePracticeEditor);
document.querySelector('#practice-edit-top').addEventListener('click', openActivePracticeEditor);
elements.deleteButton.addEventListener('click', handleDelete);
elements.reorderStart.addEventListener('click', startReorder);
elements.reorderCancel.addEventListener('click', cancelReorder);
elements.reorderComplete.addEventListener('click', completeReorder);
elements.timerToggle.addEventListener('click', handlePracticeTimerToggle);
elements.historyOpen.addEventListener('click', () => {
    state.calendarViewMode = 'month';
    openPracticeCalendar(PRACTICE_CALENDAR_ENTRY_SOURCE.practice);
});
elements.historyBack.addEventListener('click', returnFromPracticeCalendar);
elements.hiddenOpen.addEventListener('click', () => setHashRoute('#practice-menu/hidden'));
elements.finishButton.addEventListener('click', handlePracticeFinishEarly);
elements.cycleReset.addEventListener('click', handlePracticeCycleReset);
elements.completionEnd.addEventListener('click', () => handlePracticeCompletionAction('home'));
elements.completionCalendar.addEventListener('click', () => handlePracticeCompletionAction('calendar'));
elements.completionDialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [elements.completionEnd, elements.completionCalendar]
        .filter((element) => !element.disabled);
    if (focusable.length === 0) {
        event.preventDefault();
        return;
    }
    const currentIndex = focusable.indexOf(document.activeElement);
    if (event.shiftKey && currentIndex <= 0) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
    } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
        event.preventDefault();
        focusable[0].focus();
    }
});
elements.calendarViewTabs.forEach((button) => button.addEventListener('click', () => {
    state.calendarViewMode = button.dataset.calendarView;
    renderPracticeHistory({ focus: false });
    button.focus({ preventScroll: true });
}));
elements.calendarViewTabs.forEach((button, index) => button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const offset = event.key === 'ArrowLeft' ? -1 : 1;
    elements.calendarViewTabs[(index + offset + elements.calendarViewTabs.length) % elements.calendarViewTabs.length].click();
}));
elements.calendarPrevious.addEventListener('click', () => {
    shiftPracticeCalendarDate(state.calendarViewMode === 'month'
        ? { months: -1 }
        : { days: state.calendarViewMode === 'week' ? -7 : -1 });
    renderPracticeHistory({ focus: false });
});
elements.calendarNext.addEventListener('click', () => {
    shiftPracticeCalendarDate(state.calendarViewMode === 'month'
        ? { months: 1 }
        : { days: state.calendarViewMode === 'week' ? 7 : 1 });
    renderPracticeHistory({ focus: false });
});
elements.calendarToday.addEventListener('click', () => {
    setPracticeCalendarSelectedDate(new Date());
    renderPracticeHistory({ focus: false });
});
elements.calendarDays.addEventListener('click', (event) => {
    const button = event.target.closest('[data-practice-date]');
    if (!button) return;
    state.historySelectedDate = button.dataset.practiceDate;
    renderPracticeHistory({ focus: false });
    if (event.detail === 0) {
        elements.calendarDays.querySelector(`[data-practice-date="${state.historySelectedDate}"]`)?.focus({ preventScroll: true });
    }
});
elements.calendarNoteAdd.addEventListener('click', () => openPracticeCalendarNoteForm());
elements.calendarNoteIconToggle.addEventListener('click', () => {
    setPracticeCalendarIconDropdownOpen(!state.calendarNoteIconDropdownOpen, { focusOption: true });
});
elements.calendarNoteIconToggle.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    setPracticeCalendarIconDropdownOpen(true, { focusOption: true });
    if (event.key === 'ArrowUp') movePracticeCalendarIconFocus('last');
});
elements.calendarNoteIcons.addEventListener('click', (event) => {
    const button = event.target.closest('[data-calendar-note-icon]');
    if (!button) return;
    selectPracticeCalendarIcon(button.dataset.calendarNoteIcon);
});
elements.calendarNoteIcons.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        event.preventDefault();
        setPracticeCalendarIconDropdownOpen(false, { restoreFocus: true });
        return;
    }
    if (event.key === 'Tab') {
        setPracticeCalendarIconDropdownOpen(false);
        return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectPracticeCalendarIcon(document.activeElement?.dataset?.calendarNoteIcon);
        return;
    }
    const direction = {
        ArrowDown: 1,
        ArrowRight: 1,
        ArrowUp: -1,
        ArrowLeft: -1,
        Home: 'first',
        End: 'last'
    }[event.key];
    if (direction === undefined) return;
    event.preventDefault();
    movePracticeCalendarIconFocus(direction);
});
document.addEventListener('click', (event) => {
    if (state.calendarNoteIconDropdownOpen && !event.target.closest('.practice-calendar-icon-dropdown')) {
        setPracticeCalendarIconDropdownOpen(false);
    }
});
elements.calendarNoteTime.addEventListener('change', syncPracticeCalendarEndTimeOptions);
elements.calendarNoteText.addEventListener('input', () => {
    state.calendarNoteUserEdited = true;
});
elements.calendarNoteForm.addEventListener('submit', handlePracticeCalendarNoteSubmit);
elements.calendarNoteCancel.addEventListener('click', closePracticeCalendarNoteForm);
elements.calendarNoteForm.addEventListener('focusin', activatePracticeCalendarKeyboardTracking);
elements.calendarNoteForm.addEventListener('focusout', () => {
    window.requestAnimationFrame(() => {
        if (!elements.calendarNoteForm.contains(document.activeElement)) {
            cleanupPracticeCalendarKeyboardTracking();
        }
    });
});
elements.calendarNotesList.addEventListener('click', handlePracticeCalendarNoteAction);
elements.dayHistoryList.addEventListener('click', handlePracticeHistoryDelete);
elements.attachmentInput.addEventListener('change', (event) => handlePracticeAttachmentSelection(event, 'detail'));
for (const scope of ['detail', 'form']) {
    const presentation = getPracticeAttachmentPresentation(scope);
    presentation.add.addEventListener('click', () => {
        if (!getCapabilities().practiceFileWrite) { requestToolPro('practiceFile'); return; }
        if (!presentation.input.disabled) presentation.input.click();
    });
}
elements.attachmentsList.addEventListener('click', (event) => handlePracticeAttachmentAction(event, 'detail'));
elements.formAttachmentInput.addEventListener('change', (event) => handlePracticeAttachmentSelection(event, 'form'));
elements.formAttachmentsList.addEventListener('click', (event) => handlePracticeAttachmentAction(event, 'form'));
elements.attachmentLightboxClose.addEventListener('click', () => closePracticeAttachmentLightbox({ restoreFocus: true }));
elements.attachmentLightbox.addEventListener('click', (event) => {
    if (event.target === elements.attachmentLightbox) closePracticeAttachmentLightbox({ restoreFocus: true });
});
elements.attachmentLightbox.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePracticeAttachmentLightbox({ restoreFocus: true });
    if (event.key === 'Tab') {
        event.preventDefault();
        elements.attachmentLightboxClose.focus();
    }
});
elements.list.addEventListener('click', (event) => {
    const reorderButton = event.target.closest('.reorder-move');
    if (reorderButton && state.reorderMode) {
        moveReorderItem(reorderButton.dataset.id, Number(reorderButton.dataset.direction));
        return;
    }
    const action = event.target.closest('[data-practice-action]');
    if (!action || state.reorderMode) return;
    if (action.dataset.practiceAction === 'launch') {
        event.stopPropagation();
        if (
            action.getAttribute('href') === '#tuner'
            && !event.defaultPrevented
            && event.button === 0
            && !event.metaKey
            && !event.ctrlKey
            && !event.shiftKey
            && !event.altKey
        ) {
            void tunerController.startFromUserGesture();
        }
        return;
    }
    if (action.dataset.practiceAction === 'check') {
        event.preventDefault();
        event.stopPropagation();
        const item = findItem(action.dataset.id);
        if (item) handlePracticeCheck(item);
    }
    if (action.dataset.practiceAction === 'files') {
        void handlePracticeFilesAction(action, event);
    }
});
document.querySelectorAll('[data-action="home"]').forEach((button) => button.addEventListener('click', setHomeRoute));
document.querySelectorAll('[data-action="practice-list"]').forEach((button) => button.addEventListener('click', setPracticeListRoute));
document.querySelectorAll('[data-action="gear-list"]').forEach((button) => button.addEventListener('click', setGearListRoute));
document.querySelectorAll('[data-action="cancel-form"]').forEach((button) => button.addEventListener('click', cancelForm));
document.querySelectorAll('[data-action="my-apps-home"]').forEach((button) => button.addEventListener('click', setHomeRoute));
document.querySelectorAll('[data-action="my-apps-home-scroll"]').forEach((button) => button.addEventListener('click', setHomeRouteWithMyAppsScroll));
document.querySelectorAll('[data-action="new-my-app"]').forEach((button) => button.addEventListener('click', openMyAppsCreate));
elements.myAppsAdd.addEventListener('click', openMyAppsCreate);
elements.myAppsManage.addEventListener('click', () => setHashRoute('#my-apps/manage'));
elements.homeCalendarButton.addEventListener('click', () => {
    state.calendarViewMode = 'month';
    openPracticeCalendar(PRACTICE_CALENDAR_ENTRY_SOURCE.home);
});
elements.homeSettingsButton.addEventListener('click', () => setHashRoute('#settings'));
function updateDisplaySettings(next) {
    const saveResult = saveSettings(next);
    homeSettings = saveResult.settings;
    applyDisplaySettings();
    renderSettings({
        focus: false,
        storageError: saveResult.ok ? '' : '表示設定を保存できませんでした。今回の表示には反映しています。'
    });
    return saveResult.ok;
}
[...elements.settingsChoices, ...elements.fontChoices].forEach((button) => button.addEventListener('click', () => {
    const field = button.dataset.displaySize ? 'displaySize' : 'fontSize';
    updateDisplaySettings({ ...homeSettings, [field]: button.dataset[field] });
    button.focus({ preventScroll: true });
}));
for (const choices of [elements.settingsChoices, elements.fontChoices]) choices.forEach((button, index) => button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const offset = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const next = choices[(index + offset + choices.length) % choices.length];
    next.click();
}));
elements.sectionOrder.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-section-key]');
    if (!button || button.disabled) return;
    const key = button.dataset.sectionKey;
    const direction = Number(button.dataset.direction);
    const saved = updateDisplaySettings({ ...homeSettings, sectionOrder: moveHomeSection(homeSettings.sectionOrder, key, direction) });
    elements.orderStatus.textContent = `${homeSettings.sectionOrder.map(key => homeSectionLabels[key]).join('、')}の順${saved ? 'に保存しました。' : 'です。保存はできていません。'}`;
    const same = elements.sectionOrder.querySelector(`[data-section-key="${key}"][data-direction="${direction}"]`);
    const fallback = elements.sectionOrder.querySelector(`[data-section-key="${key}"]:not(:disabled)`);
    (same?.disabled ? fallback : same)?.focus({ preventScroll: true });
});
elements.settingsReset.addEventListener('click', () => {
    if (!window.confirm('表示設定をすべてデフォルトに戻しますか？\n練習メニューやMy Appsなどのデータは削除されません。')) return;
    const saved = updateDisplaySettings(DEFAULT_SETTINGS);
    elements.orderStatus.textContent = saved ? '表示設定をデフォルトに戻しました。' : '保存できませんでした。デフォルトは今回の表示だけに反映しています。';
    elements.settingsReset.focus({ preventScroll: true });
});
elements.myAppsForm.addEventListener('submit', handleMyAppsSubmit);
elements.myAppsDelete.addEventListener('click', handleMyAppsDelete);
elements.myAppsIconInput.addEventListener('change', handleMyAppsIconSelection);
elements.myAppsIconSelectLabel.parentElement.addEventListener('click', () => {
    if (guardImageWrite('customIcon') && !elements.myAppsIconInput.disabled) elements.myAppsIconInput.click();
});
elements.myAppsUrlInput.addEventListener('input', () => {
    updateMyAppsLaunchOptions();
});
elements.myAppsUrlHelpToggle.addEventListener('click', () => {
    setMyAppsUrlHelpOpen(elements.myAppsUrlHelp.hidden);
});
elements.myAppsUrlHelpClose.addEventListener('click', () => {
    setMyAppsUrlHelpOpen(false);
    elements.myAppsUrlHelpToggle.focus({ preventScroll: true });
});
elements.myAppsDirectEnabled.addEventListener('change', () => {
    myAppsState.knownLaunchForm = setKnownLaunchDecision(
        myAppsState.knownLaunchForm,
        elements.myAppsDirectEnabled.checked
    );
});
elements.myAppsCustomIosInput.addEventListener('input', updateMyAppsCustomLaunchTests);
elements.myAppsCustomAndroidInput.addEventListener('input', updateMyAppsCustomLaunchTests);
elements.myAppsCustomIosTest.addEventListener('click', () => markMyAppsCustomLaunchTest('ios'));
elements.myAppsCustomAndroidTest.addEventListener('click', () => markMyAppsCustomLaunchTest('android'));
elements.myAppsIconRemove.addEventListener('click', removeMyAppsIcon);
elements.myAppsIconPresetOpen.addEventListener('click', () => {
    renderMyAppsPresetPicker();
    setMyAppsPresetPickerOpen(elements.myAppsIconPresetPicker.hidden);
});
elements.myAppsIconPresetPicker.addEventListener('click', (event) => {
    const presetButton = event.target.closest('.my-apps-preset-option');
    if (presetButton) selectMyAppsPresetIcon(presetButton.dataset.presetKey);
});
elements.myAppsIconPreview.addEventListener('click', handleCurrentMyAppsIconAdjustment);
elements.myAppsCropCanvas.addEventListener('pointerdown', handleCropPointerDown);
elements.myAppsCropCanvas.addEventListener('pointermove', handleCropPointerMove);
elements.myAppsCropCanvas.addEventListener('pointerup', handleCropPointerEnd);
elements.myAppsCropCanvas.addEventListener('pointercancel', handleCropPointerEnd);
elements.myAppsCropSlider.addEventListener('input', handleCropSlider);
elements.myAppsCropConfirm.addEventListener('click', confirmMyAppsCrop);
elements.myAppsCropCancel.addEventListener('click', () => closeMyAppsCropEditor());
elements.myAppsCropDialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !myAppsState.iconProcessing) {
        closeMyAppsCropEditor();
        return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [elements.myAppsCropSlider, elements.myAppsCropConfirm, elements.myAppsCropCancel]
        .filter((element) => !element.disabled);
    const currentIndex = focusable.indexOf(document.activeElement);
    if (event.shiftKey && currentIndex <= 0) {
        event.preventDefault();
        focusable[focusable.length - 1]?.focus();
    } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
        event.preventDefault();
        focusable[0]?.focus();
    }
});
elements.myAppsReorderStart.addEventListener('click', startMyAppsReorder);
elements.myAppsReorderCancel.addEventListener('click', cancelMyAppsReorder);
elements.myAppsReorderComplete.addEventListener('click', completeMyAppsReorder);
elements.myAppsList.addEventListener('click', (event) => {
    const reorderButton = event.target.closest('.reorder-move');
    if (reorderButton && myAppsState.reorderMode) {
        moveMyAppsReorderItem(reorderButton.dataset.id, Number(reorderButton.dataset.direction));
        return;
    }
    const editButton = event.target.closest('.my-app-edit-button');
    if (editButton && !myAppsState.reorderMode) {
        setHashRoute(`#my-apps/${encodeURIComponent(editButton.dataset.id)}/edit`);
    }
});
document.querySelectorAll('[data-action="cancel-my-apps-form"]').forEach((button) => button.addEventListener('click', cancelMyAppsForm));
applyVersionDisplay();
document.querySelectorAll('.port-refresh-app').forEach((button) => button.addEventListener('click', () => {
    reloadAppWithCacheBust();
}));
window.addEventListener('hashchange', renderRoute);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) metronomeController?.stopForPageHidden();
    if (!document.hidden) ensurePracticeTimerTicking();
});
window.addEventListener('pagehide', () => {
    metronomeController?.stopForPageHidden();
    closeMyAppsCropEditor({ restoreStatus: false, restoreFocus: false });
    cleanupMyAppsObjectUrls('home');
    cleanupMyAppsObjectUrls('manage');
    cleanupMyAppsObjectUrls('form');
    closeGearPhotoCropEditor({ restoreStatus: false, restoreFocus: false });
    closeGearPhotoLightbox();
    cleanupGearPhotoObjectUrls('list');
    cleanupGearPhotoObjectUrls('form');
    window.clearInterval(state.timerInterval);
    state.timerInterval = null;
    closePracticeAttachmentLightbox();
    cleanupPracticeAttachmentObjectUrls();
    practiceAttachmentExternalObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    practiceAttachmentExternalObjectUrls.clear();
    cleanupPracticeCalendarKeyboardTracking();
});
window.addEventListener('pageshow', ensurePracticeTimerTicking);
window.addEventListener('cruise-port-storage-conflict', () => {
    window.alert('別のタブで保存内容が変更されました。上書きを防ぐため、この操作は保存していません。\n入力中の内容を控えてから「ページを更新」を押してください。');
});

const loadResult = initializePracticeMenus(loadPracticeMenus());
state.items = loadResult.items;
state.storageReady = loadResult.ok;
const progressLoadResult = loadPracticeProgress();
state.progress = progressLoadResult.progress;
state.progressReady = progressLoadResult.ok;
const historyLoadResult = loadPracticeHistory();
state.history = historyLoadResult.history;
state.historyReady = historyLoadResult.ok;
const calendarLoadResult = loadPracticeCalendar();
state.calendar = calendarLoadResult.calendar;
state.calendarReady = calendarLoadResult.ok;
const timerLoadResult = loadPracticeTimer();
state.timer = timerLoadResult.timer;
state.timerReady = timerLoadResult.ok;
populatePracticeNamePresets();
const gearLoadResult = loadGearList();
gearState.items = gearLoadResult.items;
gearState.storageReady = gearLoadResult.ok;
const gearCategoryLoadResult = loadGearCategories(gearState.items);
gearState.categories = gearCategoryLoadResult.categories;
gearState.categoryStorageReady = gearCategoryLoadResult.ok;
const myAppsLoadResult = loadMyApps();
myAppsState.items = myAppsLoadResult.items;
myAppsState.storageReady = myAppsLoadResult.ok;
const settingsLoadResult = loadSettings();
homeSettings = settingsLoadResult.settings;
settingsStorageReady = settingsLoadResult.ok;
applyDisplaySettings();
clearRetiredIconScalePreviewKeys();
metronomeController = initMetronome(elements.metronomeView);
tunerController = initTuner(elements.tunerView);
elements.tunerCard.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    void tunerController.startFromUserGesture();
});
ensurePracticeTimerTicking();
renderRoute();
void refreshPracticeAttachmentCounts();
