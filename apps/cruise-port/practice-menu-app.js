import {
    LIMITS,
    createPracticeMenu,
    deletePracticeMenu,
    loadPracticeMenus,
    movePracticeMenu,
    savePracticeMenus,
    updatePracticeMenu
} from './practice-menu-store.js?v=2.1.0';
import {
    PRACTICE_APP_STATUS,
    countPracticeMenuReferences,
    createPracticeAppOptionGroups,
    isSelectablePracticeAppId,
    resolvePracticeMenuApp
} from './practice-menu-app-resolver.js?v=1.1.0';
import {
    HOME_HISTORY_MODE,
    safeDecodeRouteSegment,
    updateHomeHistory
} from './practice-menu-navigation.js?v=1.0.0';
import {
    MY_APPS_LIMITS,
    loadMyApps,
    moveMyApp,
    normalizeCustomLaunch,
    normalizeMyAppUrl,
    saveMyApps,
    validateMyAppValues
} from './my-apps-store.js?v=6.0.1-assets';
import {
    getKnownApp,
    recognizeKnownAppUrl,
    recognizeStoreUrl
} from './my-apps-known-apps.js?v=1.3.0';
import {
    getKnownLaunchUiMode,
    detectMyAppsPlatform,
    resolveMyAppHref
} from './my-apps-launch.js?v=1.3.0';
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
import { createMyAppsIconStore } from './my-apps-icon-store.js?v=1.3.0';
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
} from './my-apps-icon-workflow.js?v=3.0.1-assets';
import {
    MY_APPS_ICON_PRESETS,
    createMyAppsPresetGraphic,
    getMyAppsIconPreset
} from './my-apps-icon-presets.js?v=1.0.3';
import { getMyAppHomeIconKind } from './my-apps-icon-scale-classifier.js?v=1.0.0';
import { initMetronome } from './metronome-app.js?v=2.3.1';
import {
    applyVersionDisplay,
    reloadAppWithCacheBust
} from './app-version.js?v=1.19.0';
import { applyHomeDisplaySize } from './home-display.js?v=1.0.0';
import { clearRetiredIconScalePreviewKeys, loadSettings, saveSettings } from './settings-store.js?v=1.0.1';
import { initTuner } from './tuner-app.js?v=1.2.0';
import {
    GEAR_CATEGORIES,
    clearGearPhotoReferences,
    createGearItem,
    deleteGearItem,
    getGearCategoryLabel,
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
} from './gear-list-store.js?v=4.0.0';
import { createGearPhotoStore } from './gear-photo-store.js?v=1.0.0';
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

const elements = {
    homeView: document.querySelector('#home-view'),
    settingsView: document.querySelector('#settings-view'),
    wishlistView: document.querySelector('#wishlist-view'),
    gearFormView: document.querySelector('#gear-form-view'),
    practiceListView: document.querySelector('#practice-list-view'),
    detailView: document.querySelector('#practice-detail-view'),
    formView: document.querySelector('#practice-form-view'),
    tunerView: document.querySelector('#tuner-view'),
    metronomeView: document.querySelector('#metronome-view'),
    myAppsManageView: document.querySelector('#my-apps-manage-view'),
    myAppsFormView: document.querySelector('#my-apps-form-view'),
    myAppsNotFoundView: document.querySelector('#my-apps-not-found-view'),
    homeSettingsButton: document.querySelector('#home-settings-button'),
    settingsTitle: document.querySelector('#settings-title'),
    settingsStorageError: document.querySelector('#settings-storage-error'),
    settingsChoices: [...document.querySelectorAll('[data-display-size]')],
    gearTitle: document.querySelector('#wishlist-title'),
    gearTabs: [...document.querySelectorAll('[data-gear-status]')],
    gearCategoryFilter: document.querySelector('#gear-category-filter'),
    gearStorageError: document.querySelector('#gear-list-storage-error'),
    gearContent: document.querySelector('#gear-list-content'),
    gearSections: document.querySelector('#gear-list-sections'),
    gearReorderActions: document.querySelector('#gear-reorder-actions'),
    gearReorderCancel: document.querySelector('#gear-reorder-cancel'),
    gearReorderComplete: document.querySelector('#gear-reorder-complete'),
    gearReorderStatus: document.querySelector('#gear-reorder-status'),
    gearReorderNotice: document.querySelector('#gear-reorder-notice'),
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
    detailTitle: document.querySelector('#practice-detail-title'),
    detailSaved: document.querySelector('#practice-detail-saved'),
    detailDuration: document.querySelector('#practice-detail-duration'),
    detailApp: document.querySelector('#practice-detail-app'),
    detailMemo: document.querySelector('#practice-detail-memo'),
    detailError: document.querySelector('#practice-detail-error'),
    openApp: document.querySelector('#practice-open-app'),
    editButton: document.querySelector('#practice-edit'),
    deleteButton: document.querySelector('#practice-delete'),
    formTitle: document.querySelector('#practice-form-title'),
    form: document.querySelector('#practice-menu-form'),
    nameInput: document.querySelector('#practice-name'),
    durationInput: document.querySelector('#practice-duration'),
    appInput: document.querySelector('#practice-app'),
    memoInput: document.querySelector('#practice-memo'),
    formError: document.querySelector('#practice-form-error'),
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
    savedNotice: null
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
let homeSettings = { displaySize: 'standard' };
let settingsStorageReady = true;
let gearPhotoLightboxReturnFocus = null;
const myAppsIconStore = createMyAppsIconStore();
const gearPhotoStore = createGearPhotoStore();
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
    if (view !== elements.homeView) cleanupMyAppsObjectUrls('home');
    if (view !== elements.myAppsManageView) cleanupMyAppsObjectUrls('manage');
    if (view !== elements.myAppsFormView) cleanupMyAppsFormState();
    if (view !== elements.wishlistView) cleanupGearPhotoObjectUrls('list');
    if (view !== elements.gearFormView) cleanupGearPhotoFormState();
    if (view !== elements.wishlistView && view !== elements.gearFormView) closeGearPhotoLightbox();
    [
        elements.homeView,
        elements.settingsView,
        elements.wishlistView,
        elements.gearFormView,
        elements.practiceListView,
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
    window.scrollTo({ top: 0, behavior: 'auto' });
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

function setHashRoute(route) {
    location.hash = route;
}

function setPracticeListRoute() {
    setHashRoute('#practice-menu');
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

function renderPracticeCard(item) {
    const app = resolveCurrentPracticeApp(item.appId);
    const card = document.createElement('a');
    const copy = document.createElement('span');
    const name = document.createElement('span');
    const detail = document.createElement('span');
    const memo = document.createElement('span');
    const arrow = document.createElement('span');

    card.className = 'practice-row practice-menu-card';
    card.href = `#practice-menu/${encodeURIComponent(item.id)}`;
    copy.className = 'practice-copy';
    name.className = 'card-name';
    detail.className = 'card-detail';
    memo.className = 'practice-card-memo';
    arrow.className = 'practice-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    name.textContent = item.name;
    detail.textContent = `${item.durationMinutes}分 ・ ${app.label}`;
    memo.textContent = item.memo;
    arrow.textContent = '→';
    copy.append(name, detail);
    if (item.memo) copy.append(memo);
    card.append(copy, arrow);
    return card;
}

function renderReorderCard(item, index) {
    const app = resolveCurrentPracticeApp(item.appId);
    const card = document.createElement('div');
    const handle = document.createElement('span');
    const copy = document.createElement('span');
    const name = document.createElement('span');
    const detail = document.createElement('span');
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
    detail.className = 'card-detail';
    name.textContent = item.name;
    detail.textContent = `${item.durationMinutes}分 ・ ${app.label}`;
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
    copy.append(name, detail);
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

function renderMyAppsHome() {
    cleanupMyAppsObjectUrls('home');
    elements.myAppsGrid.replaceChildren();
    myAppsState.items.forEach((item) => elements.myAppsGrid.append(renderMyAppCard(item)));
    elements.myAppsGrid.append(elements.myAppsAdd);
    elements.myAppsAdd.disabled = !myAppsState.storageReady || myAppsState.items.length >= MY_APPS_LIMITS.items;
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
    elements.myAppsManageAdd.hidden = myAppsState.reorderMode || myAppsState.items.length >= MY_APPS_LIMITS.items;
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
        if (result.reason === 'not-found') {
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
    setHashRoute('#my-apps/manage');
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

function renderPracticeList() {
    showView(elements.practiceListView);
    elements.list.replaceChildren();
    const visibleItems = state.reorderMode ? state.reorderItems : state.items;

    visibleItems.forEach((item, index) => {
        elements.list.append(
            state.reorderMode ? renderReorderCard(item, index) : renderPracticeCard(item)
        );
    });
    elements.empty.hidden = state.reorderMode || state.items.length > 0 || !state.storageReady;

    elements.reorderStart.hidden = state.reorderMode || state.items.length < 2;
    elements.reorderActions.hidden = !state.reorderMode;
    elements.addButton.hidden = state.reorderMode;
    elements.addButton.disabled = !state.storageReady;
    elements.reorderStatus.textContent = state.reorderMode
        ? '並び替え中です。上下のボタンで順序を変更し、完了で保存します。'
        : '';
    elements.reorderStatus.hidden = !state.reorderMode;
    showNotice(
        elements.storageError,
        state.storageReady ? '' : '練習メニューの保存データを読み込めません。保存領域の値は変更していません。'
    );
    document.querySelector('#practice-heading')?.focus({ preventScroll: true });
}

function startReorder() {
    if (!state.storageReady || state.items.length < 2) return;
    state.reorderMode = true;
    state.reorderItems = [...state.items];
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
    if (sameOrder(state.items, state.reorderItems)) {
        cancelReorder();
        return;
    }

    const saveResult = savePracticeMenus(state.reorderItems);
    if (!saveResult.ok) {
        showNotice(elements.reorderNotice, '並び順を保存できませんでした。元の順番は変更していません。');
        return;
    }
    state.items = state.reorderItems;
    state.reorderMode = false;
    state.reorderItems = [];
    showNotice(elements.reorderNotice);
    renderPracticeList();
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
    showNotice(elements.detailSaved, state.savedNotice?.id === item.id ? state.savedNotice.message : '');
    state.savedNotice = null;
    elements.openApp.textContent = `${app.label}を開く`;
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
    showNotice(elements.detailError, detailMessage);
    showView(elements.detailView);
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

function fillForm(item = null) {
    elements.form.reset();
    elements.nameInput.value = item?.name || '';
    elements.durationInput.value = item?.durationMinutes ?? 10;
    populatePracticeAppSelect(item?.appId || '');
    elements.memoInput.value = item?.memo || '';
    showNotice(elements.formError);
}

function renderForm(mode, id = null) {
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
    elements.formTitle.textContent = mode === 'edit' ? '練習メニューを編集' : '練習メニューを作成';
    fillForm(item);
    showView(elements.formView);
    elements.formTitle.focus({ preventScroll: true });
}

function renderSettings({ focus = true, storageError = '' } = {}) {
    showView(elements.settingsView);
    const activeSize = applyHomeDisplaySize(elements.homeView, homeSettings.displaySize);
    elements.settingsChoices.forEach((button) => {
        const selected = button.dataset.displaySize === activeSize;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-checked', selected ? 'true' : 'false');
        button.tabIndex = selected ? 0 : -1;
    });
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
    category.textContent = getGearCategoryLabel(item.category);
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
    const categories = [{ key: 'all', label: 'すべて' }, ...GEAR_CATEGORIES];
    elements.gearCategoryFilter.replaceChildren();
    categories.forEach(({ key, label }) => {
        const button = document.createElement('button');
        const selected = gearState.activeCategory === key;
        button.type = 'button';
        button.className = 'gear-category-chip';
        button.dataset.gearCategory = key;
        button.textContent = label;
        button.disabled = gearState.reorderMode;
        button.setAttribute('aria-pressed', String(selected));
        button.classList.toggle('is-selected', selected);
        elements.gearCategoryFilter.append(button);
    });
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
    elements.gearAdd.hidden = gearState.reorderMode;
    elements.gearAdd.textContent = gearState.activeStatus === 'wishlist' ? '＋ ほしい機材を追加' : '＋ 機材を追加';
    elements.gearAdd.disabled = !gearState.storageReady || gearState.reorderMode;
    showNotice(
        elements.gearStorageError,
        gearState.storageReady ? '' : '機材リストを読み込めませんでした。保存データは変更していません。'
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
    gearState.photoProcessing = true;
    updateGearPhotoControls(Boolean(gearState.photoBlob || findGearItem(gearState.activeId)?.photoId));
    elements.gearPhotoStatus.textContent = '写真を読み込んでいます…';
    const prepared = await prepareGearPhotoSource(blob);
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
    gearState.photoProcessing = true;
    updateGearPhotoControls(true);
    elements.gearPhotoStatus.textContent = '元の写真を読み込んでいます…';
    const prepared = await prepareMyAppIcon(blob);
    gearState.photoProcessing = false;
    updateGearPhotoControls(true);
    if (!prepared.ok) {
        elements.gearPhotoStatus.textContent = gearPhotoErrorMessage(prepared.reason);
        return;
    }
    openGearPhotoCropEditor(prepared, { sourceBlob: blob, initialCrop });
}

async function handleGearPhotoSelection() {
    const file = elements.gearPhotoInput.files?.[0];
    if (file) await prepareAndOpenGearPhoto(file);
}

async function handleGearPhotoReadjust() {
    if (gearState.photoAction === 'replace' && gearState.photoSourceBlob) {
        await openStoredGearPhotoForReadjustment(gearState.photoSourceBlob, gearState.photoCrop);
        return;
    }
    const item = findGearItem(gearState.activeId);
    if (!item?.photoSourceId) return;
    gearState.photoProcessing = true;
    updateGearPhotoControls(true);
    elements.gearPhotoStatus.textContent = '元の写真を読み込んでいます…';
    const result = await gearPhotoStore.getPhoto(item.photoSourceId);
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
    elements.gearCategoryInput.value = item?.category || getInitialGearCategory(gearState.activeCategory);
    elements.gearPriceInput.value = item?.priceText || '';
    elements.gearStatusInput.value = item?.status || (gearState.activeStatus === 'wishlist' ? 'wishlist' : 'owned');
    elements.gearPriorityInput.value = item?.priority || 'medium';
    elements.gearMemoInput.value = item?.memo || '';
    updateGearPriorityVisibility();
    showNotice(elements.gearFormError);
    resetGearPhotoForm(item);
}

function renderGearForm(mode, id = null) {
    if (!gearState.storageReady) {
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
    const gearRoute = parseGearRoute(hash);
    const editMatch = hash.match(/^#practice-menu\/([^/]+)\/edit$/);
    const detailMatch = hash.match(/^#practice-menu\/([^/]+)$/);
    const myAppsEditMatch = hash.match(/^#my-apps\/([^/]+)\/edit$/);

    if (hash === '#settings') {
        renderSettings();
    } else if (gearRoute?.kind === GEAR_ROUTE_KIND.list) {
        renderWishlist();
    } else if (gearRoute?.kind === GEAR_ROUTE_KIND.create) {
        renderGearForm('create');
    } else if (gearRoute?.kind === GEAR_ROUTE_KIND.edit) {
        renderGearForm('edit', gearRoute.id);
    } else if (gearRoute?.kind === GEAR_ROUTE_KIND.invalid) {
        correctGearListRoute();
    } else if (hash === '#practice-menu') {
        renderPracticeList();
    } else if (hash === '#my-apps/manage') {
        renderMyAppsManage();
    } else if (hash === '#my-apps/new') {
        renderMyAppsForm('create');
    } else if (myAppsEditMatch) {
        const id = safeDecodeRouteSegment(myAppsEditMatch[1]);
        if (id === null) replaceHomeRoute();
        else renderMyAppsForm('edit', id);
    } else if (hash === '#practice-menu/new') {
        renderForm('create');
    } else if (hash === '#tuner') {
        showView(elements.tunerView);
    } else if (hash === '#metronome') {
        showView(elements.metronomeView);
    } else if (editMatch) {
        const id = safeDecodeRouteSegment(editMatch[1]);
        if (id === null) replaceHomeRoute();
        else renderForm('edit', id);
    } else if (detailMatch) {
        const id = safeDecodeRouteSegment(detailMatch[1]);
        if (id === null) replaceHomeRoute();
        else renderDetail(id);
    } else if (hash) {
        replaceHomeRoute();
    } else {
        renderHome();
    }
}

function readFormValues() {
    const name = elements.nameInput.value.trim();
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

    return { ok: true, values: { name, durationMinutes, appId, memo } };
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

function handleSubmit(event) {
    event.preventDefault();
    showNotice(elements.formError);
    const formResult = readFormValues();
    if (!formResult.ok) {
        showNotice(elements.formError, formResult.message);
        return;
    }

    if (state.formMode === 'edit') {
        const updateResult = updatePracticeMenu(state.items, state.activeId, formResult.values);
        if (!updateResult.found) {
            showNotice(elements.formError, '編集する練習メニューが見つかりません。');
            return;
        }
        if (persist(updateResult.items)) {
            state.savedNotice = { id: state.activeId, message: '変更を保存しました。' };
            replacePracticeDetailRoute(state.activeId);
        }
        return;
    }

    const item = createPracticeMenu(formResult.values, state.items);
    if (persist([...state.items, item])) {
        state.savedNotice = { id: item.id, message: '保存しました。この画面から内容を確認して使えます。' };
        replacePracticeDetailRoute(item.id);
    }
}

function cancelForm() {
    if (state.formMode === 'edit' && state.activeId) {
        setHashRoute(`#practice-menu/${encodeURIComponent(state.activeId)}`);
    } else {
        setPracticeListRoute();
    }
}

function handleDelete() {
    const item = findItem(state.activeId);
    if (!item || !window.confirm('この練習メニューを削除しますか？')) return;

    const deleteResult = deletePracticeMenu(state.items, item.id);
    if (!deleteResult.found) return;
    const saveResult = savePracticeMenus(deleteResult.items);
    if (!saveResult.ok) {
        showNotice(elements.detailError, '削除できませんでした。保存設定を確認してください。');
        return;
    }
    state.items = deleteResult.items;
    replacePracticeListRoute();
}

elements.addButton.addEventListener('click', () => setHashRoute('#practice-menu/new'));
elements.gearAdd.addEventListener('click', () => setHashRoute('#wishlist/new'));
elements.gearForm.addEventListener('submit', handleGearSubmit);
elements.gearStatusInput.addEventListener('change', updateGearPriorityVisibility);
elements.gearPhotoInput.addEventListener('change', handleGearPhotoSelection);
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
elements.gearCategoryFilter.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-gear-category]');
    if (!chip || gearState.reorderMode) return;
    gearState.activeCategory = chip.dataset.gearCategory;
    renderWishlist({ focus: false });
    elements.gearCategoryFilter.querySelector(`[data-gear-category="${gearState.activeCategory}"]`)?.focus({ preventScroll: true });
});
elements.form.addEventListener('submit', handleSubmit);
elements.editButton.addEventListener('click', () => {
    if (state.activeId) setHashRoute(`#practice-menu/${encodeURIComponent(state.activeId)}/edit`);
});
elements.deleteButton.addEventListener('click', handleDelete);
elements.reorderStart.addEventListener('click', startReorder);
elements.reorderCancel.addEventListener('click', cancelReorder);
elements.reorderComplete.addEventListener('click', completeReorder);
elements.list.addEventListener('click', (event) => {
    const button = event.target.closest('.reorder-move');
    if (!button || !state.reorderMode) return;
    moveReorderItem(button.dataset.id, Number(button.dataset.direction));
});
document.querySelectorAll('[data-action="home"]').forEach((button) => button.addEventListener('click', setHomeRoute));
document.querySelectorAll('[data-action="practice-list"]').forEach((button) => button.addEventListener('click', setPracticeListRoute));
document.querySelectorAll('[data-action="gear-list"]').forEach((button) => button.addEventListener('click', setGearListRoute));
document.querySelectorAll('[data-action="cancel-form"]').forEach((button) => button.addEventListener('click', cancelForm));
document.querySelectorAll('[data-action="my-apps-home"]').forEach((button) => button.addEventListener('click', setHomeRoute));
document.querySelectorAll('[data-action="my-apps-home-scroll"]').forEach((button) => button.addEventListener('click', setHomeRouteWithMyAppsScroll));
document.querySelectorAll('[data-action="new-my-app"]').forEach((button) => button.addEventListener('click', () => setHashRoute('#my-apps/new')));
elements.myAppsAdd.addEventListener('click', () => setHashRoute('#my-apps/new'));
elements.myAppsManage.addEventListener('click', () => setHashRoute('#my-apps/manage'));
elements.homeSettingsButton.addEventListener('click', () => setHashRoute('#settings'));
elements.settingsChoices.forEach((button) => button.addEventListener('click', () => {
    const saveResult = saveSettings({ displaySize: button.dataset.displaySize });
    homeSettings = saveResult.settings;
    applyHomeDisplaySize(elements.homeView, homeSettings.displaySize);
    renderSettings({
        focus: false,
        storageError: saveResult.ok ? '' : '表示設定を保存できませんでした。今回の表示には反映しています。'
    });
    button.focus({ preventScroll: true });
}));
elements.settingsChoices.forEach((button, index) => button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const offset = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const next = elements.settingsChoices[(index + offset + elements.settingsChoices.length) % elements.settingsChoices.length];
    next.click();
}));
elements.myAppsForm.addEventListener('submit', handleMyAppsSubmit);
elements.myAppsDelete.addEventListener('click', handleMyAppsDelete);
elements.myAppsIconInput.addEventListener('change', handleMyAppsIconSelection);
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
});

const loadResult = loadPracticeMenus();
state.items = loadResult.items;
state.storageReady = loadResult.ok;
GEAR_CATEGORIES.forEach(({ key, label }) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = label;
    elements.gearCategoryInput.append(option);
});
const gearLoadResult = loadGearList();
gearState.items = gearLoadResult.items;
gearState.storageReady = gearLoadResult.ok;
const myAppsLoadResult = loadMyApps();
myAppsState.items = myAppsLoadResult.items;
myAppsState.storageReady = myAppsLoadResult.ok;
const settingsLoadResult = loadSettings();
homeSettings = settingsLoadResult.settings;
settingsStorageReady = settingsLoadResult.ok;
applyHomeDisplaySize(elements.homeView, homeSettings.displaySize);
clearRetiredIconScalePreviewKeys();
metronomeController = initMetronome(elements.metronomeView);
tunerController = initTuner(elements.tunerView);
elements.tunerCard.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    void tunerController.startFromUserGesture();
});
renderRoute();
