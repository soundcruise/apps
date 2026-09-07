import {
    LIMITS,
    createPracticeMenu,
    deletePracticeMenu,
    loadPracticeMenus,
    movePracticeMenu,
    savePracticeMenus,
    updatePracticeMenu
} from './practice-menu-store.js?v=2.0.0';
import {
    PRACTICE_APP_STATUS,
    countPracticeMenuReferences,
    createPracticeAppOptionGroups,
    isSelectablePracticeAppId,
    resolvePracticeMenuApp
} from './practice-menu-app-resolver.js?v=1.0.0';
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
import { initMetronome } from './metronome-app.js';
import {
    applyVersionDisplay,
    reloadAppWithCacheBust
} from './app-version.js?v=1.12.7';
import { applyHomeDisplaySize } from './home-display.js?v=1.0.0';
import { clearRetiredIconScalePreviewKeys, loadSettings, saveSettings } from './settings-store.js?v=1.0.1';
import { initTuner } from './tuner-app.js?v=1.1.8';

const elements = {
    homeView: document.querySelector('#home-view'),
    settingsView: document.querySelector('#settings-view'),
    wishlistView: document.querySelector('#wishlist-view'),
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
    list: document.querySelector('#practice-menu-list'),
    addButton: document.querySelector('#practice-menu-add'),
    storageError: document.querySelector('#practice-storage-error'),
    detailTitle: document.querySelector('#practice-detail-title'),
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
    reorderItems: []
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

let metronomeController = null;
let tunerController = null;
let pendingHomeScrollTarget = null;
let homeSettings = { displaySize: 'standard' };
let settingsStorageReady = true;
const myAppsIconStore = createMyAppsIconStore();
const myAppsPlatform = detectMyAppsPlatform();
const myAppsObjectUrls = {
    home: new Set(),
    manage: new Set(),
    form: new Set()
};
const myAppsRenderGeneration = { home: 0, manage: 0, form: 0 };

function showNotice(element, message = '') {
    element.textContent = message;
    element.hidden = message.length === 0;
}

function cleanupMyAppsObjectUrls(scope) {
    myAppsRenderGeneration[scope] += 1;
    myAppsObjectUrls[scope].forEach((url) => URL.revokeObjectURL(url));
    myAppsObjectUrls[scope].clear();
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
    [
        elements.homeView,
        elements.settingsView,
        elements.wishlistView,
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
    const arrow = document.createElement('span');

    card.className = 'practice-row practice-menu-card';
    card.href = `#practice-menu/${encodeURIComponent(item.id)}`;
    copy.className = 'practice-copy';
    name.className = 'card-name';
    detail.className = 'card-detail';
    arrow.className = 'practice-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    name.textContent = item.name;
    detail.textContent = `${item.durationMinutes}分 ・ ${app.label}`;
    arrow.textContent = '→';
    copy.append(name, detail);
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
    elements.openApp.textContent = `${app.label}を開く`;
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
    placeholder.textContent = '選択してください';
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

function renderWishlist() {
    showView(elements.wishlistView);
    document.querySelector('#wishlist-title')?.focus({ preventScroll: true });
}

function renderRoute() {
    const hash = location.hash;
    const editMatch = hash.match(/^#practice-menu\/([^/]+)\/edit$/);
    const detailMatch = hash.match(/^#practice-menu\/([^/]+)$/);
    const myAppsEditMatch = hash.match(/^#my-apps\/([^/]+)\/edit$/);

    if (hash === '#settings') {
        renderSettings();
    } else if (hash === '#wishlist') {
        renderWishlist();
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
    const appId = elements.appInput.value;
    const memo = elements.memoInput.value;

    if (!name) return { ok: false, message: 'メニュー名を入力してください。' };
    if (name.length > LIMITS.name) return { ok: false, message: 'メニュー名は100文字以内で入力してください。' };
    if (!/^\d+$/.test(durationText)) return { ok: false, message: '練習時間は1〜999の整数で入力してください。' };

    const durationMinutes = Number(durationText);
    if (durationMinutes < 1 || durationMinutes > LIMITS.durationMinutes) {
        return { ok: false, message: '練習時間は1〜999分で入力してください。' };
    }
    if (!isSelectablePracticeAppId(appId, {
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
        if (persist(updateResult.items)) setHashRoute(`#practice-menu/${encodeURIComponent(state.activeId)}`);
        return;
    }

    const item = createPracticeMenu(formResult.values, state.items);
    if (persist([...state.items, item])) setHashRoute(`#practice-menu/${encodeURIComponent(item.id)}`);
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
});

const loadResult = loadPracticeMenus();
state.items = loadResult.items;
state.storageReady = loadResult.ok;
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
renderRoute();
