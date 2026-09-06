import {
    APP_DEFINITIONS,
    LIMITS,
    createPracticeMenu,
    deletePracticeMenu,
    loadPracticeMenus,
    movePracticeMenu,
    savePracticeMenus,
    updatePracticeMenu
} from './practice-menu-store.js';
import {
    MY_APPS_LIMITS,
    createMyApp,
    deleteMyApp,
    loadMyApps,
    moveMyApp,
    saveMyApps,
    updateMyApp,
    validateMyAppValues
} from './my-apps-store.js?v=1.0.0';
import { initMetronome } from './metronome-app.js';
import {
    applyVersionDisplay,
    reloadAppWithCacheBust
} from './app-version.js?v=1.1.6';
import { initTuner } from './tuner-app.js?v=1.1.8';

const elements = {
    homeView: document.querySelector('#home-view'),
    detailView: document.querySelector('#practice-detail-view'),
    formView: document.querySelector('#practice-form-view'),
    tunerView: document.querySelector('#tuner-view'),
    metronomeView: document.querySelector('#metronome-view'),
    myAppsManageView: document.querySelector('#my-apps-manage-view'),
    myAppsFormView: document.querySelector('#my-apps-form-view'),
    myAppsNotFoundView: document.querySelector('#my-apps-not-found-view'),
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
    myAppsForm: document.querySelector('#my-apps-form'),
    myAppsNameInput: document.querySelector('#my-apps-name'),
    myAppsUrlInput: document.querySelector('#my-apps-url'),
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
    reorderItems: []
};

let metronomeController = null;
let tunerController = null;

function showNotice(element, message = '') {
    element.textContent = message;
    element.hidden = message.length === 0;
}

function showView(view) {
    [
        elements.homeView,
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
    history.pushState(null, '', `${location.pathname}${location.search}`);
    renderRoute();
}

function setHashRoute(route) {
    location.hash = route;
}

function sameOrder(firstItems, secondItems) {
    return firstItems.length === secondItems.length
        && firstItems.every((item, index) => item.id === secondItems[index].id);
}

function renderPracticeCard(item) {
    const app = APP_DEFINITIONS[item.appId];
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
    detail.textContent = `${item.durationMinutes}分 ・ ${app.name}`;
    arrow.textContent = '→';
    copy.append(name, detail);
    card.append(copy, arrow);
    return card;
}

function renderReorderCard(item, index) {
    const app = APP_DEFINITIONS[item.appId];
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
    detail.textContent = `${item.durationMinutes}分 ・ ${app.name}`;
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

function createMyAppIcon() {
    const namespace = 'http://www.w3.org/2000/svg';
    const icon = document.createElement('span');
    const svg = document.createElementNS(namespace, 'svg');
    const frame = document.createElementNS(namespace, 'rect');
    const line = document.createElementNS(namespace, 'path');
    const arrow = document.createElementNS(namespace, 'path');

    icon.className = 'skeleton-icon my-app-icon';
    icon.setAttribute('aria-hidden', 'true');
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
    icon.append(svg);
    return icon;
}

function findMyApp(id) {
    return myAppsState.items.find((item) => item.id === id) || null;
}

function renderMyAppCard(item) {
    const card = document.createElement('a');
    const name = document.createElement('span');
    const external = document.createElement('span');

    card.className = 'port-card skeleton-card tool-card my-app-launch-card';
    card.href = item.url;
    card.setAttribute('aria-label', `${item.name}を開く（外部アプリまたはWebサイト）`);
    name.className = 'card-name';
    name.textContent = item.name;
    external.className = 'my-app-external-mark';
    external.setAttribute('aria-hidden', 'true');
    external.textContent = '↗';
    card.append(createMyAppIcon(), name, external);
    return card;
}

function renderMyAppsHome() {
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
    const icon = createMyAppIcon();
    const copy = document.createElement('span');
    const name = document.createElement('span');
    const controls = document.createElement('div');
    const upButton = document.createElement('button');
    const downButton = document.createElement('button');

    card.className = 'practice-row reorder-card my-apps-reorder-card';
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
    const icon = createMyAppIcon();
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
        setHomeRoute();
        return;
    }
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
    elements.myAppsForm.reset();
    elements.myAppsNameInput.value = item?.name || '';
    elements.myAppsUrlInput.value = item?.url || '';
    elements.myAppsDelete.hidden = !item;
    showNotice(elements.myAppsFormError);
}

function renderMyAppsForm(mode, id = null) {
    if (!myAppsState.storageReady) {
        setHomeRoute();
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
    const valuesResult = validateMyAppValues({
        name: elements.myAppsNameInput.value,
        url: elements.myAppsUrlInput.value
    });
    if (valuesResult.ok) return valuesResult;
    if (valuesResult.reason === 'invalid-name') {
        return { ok: false, message: `アプリ名は1〜${MY_APPS_LIMITS.name}文字で入力してください。` };
    }
    return { ok: false, message: 'HTTPS URLを入力してください。http、独自scheme、認証情報付きURLは登録できません。' };
}

function handleMyAppsSubmit(event) {
    event.preventDefault();
    showNotice(elements.myAppsFormError);
    const formResult = readMyAppsFormValues();
    if (!formResult.ok) {
        showNotice(elements.myAppsFormError, formResult.message);
        return;
    }

    if (myAppsState.formMode === 'edit') {
        const updateResult = updateMyApp(myAppsState.items, myAppsState.activeId, formResult.values);
        if (!updateResult.found) {
            renderMyAppsNotFound();
            return;
        }
        const saveResult = saveMyApps(updateResult.items);
        if (!saveResult.ok) {
            showNotice(elements.myAppsFormError, '保存できませんでした。Safariの保存設定や空き容量を確認してください。');
            return;
        }
        myAppsState.items = updateResult.items;
        setHashRoute('#my-apps/manage');
        return;
    }

    const createResult = createMyApp(formResult.values, myAppsState.items);
    if (!createResult.ok) {
        const message = createResult.reason === 'limit-reached'
            ? `My Appsは${MY_APPS_LIMITS.items}件まで登録できます。`
            : 'アプリを準備できませんでした。もう一度お試しください。';
        showNotice(elements.myAppsFormError, message);
        return;
    }
    const candidateItems = [...myAppsState.items, createResult.item];
    const saveResult = saveMyApps(candidateItems);
    if (!saveResult.ok) {
        showNotice(elements.myAppsFormError, '保存できませんでした。Safariの保存設定や空き容量を確認してください。');
        return;
    }
    myAppsState.items = candidateItems;
    setHashRoute('#my-apps/manage');
}

function cancelMyAppsForm() {
    if (myAppsState.formMode === 'edit') {
        setHashRoute('#my-apps/manage');
    } else {
        setHomeRoute();
    }
}

function handleMyAppsDelete() {
    const item = findMyApp(myAppsState.activeId);
    if (!item) {
        renderMyAppsNotFound();
        return;
    }
    if (!window.confirm('このアプリをMy Appsから削除しますか？\n外部アプリ自体は削除されません。')) return;
    const deleteResult = deleteMyApp(myAppsState.items, item.id);
    const saveResult = saveMyApps(deleteResult.items);
    if (!deleteResult.found || !saveResult.ok) {
        showNotice(elements.myAppsFormError, '削除できませんでした。Safariの保存設定や空き容量を確認してください。');
        return;
    }
    myAppsState.items = deleteResult.items;
    setHashRoute('#my-apps/manage');
}

function renderHome() {
    showView(elements.homeView);
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
    renderMyAppsHome();
}

function startReorder() {
    if (!state.storageReady || state.items.length < 2) return;
    state.reorderMode = true;
    state.reorderItems = [...state.items];
    showNotice(elements.reorderNotice);
    renderHome();
}

function cancelReorder() {
    state.reorderMode = false;
    state.reorderItems = [];
    showNotice(elements.reorderNotice);
    renderHome();
}

function moveReorderItem(id, direction) {
    const moveResult = movePracticeMenu(state.reorderItems, id, direction);
    if (!moveResult.moved) return;
    state.reorderItems = moveResult.items;
    renderHome();
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
    renderHome();
}

function renderDetail(id) {
    const item = findItem(id);
    if (!item) {
        setHomeRoute();
        return;
    }

    const app = APP_DEFINITIONS[item.appId];
    state.activeId = item.id;
    elements.detailTitle.textContent = item.name;
    elements.detailDuration.textContent = `${item.durationMinutes}分`;
    elements.detailApp.textContent = app.name;
    elements.detailMemo.textContent = item.memo || 'なし';
    elements.openApp.textContent = `${app.name}を開く`;
    elements.openApp.href = app.href;
    showNotice(elements.detailError);
    showView(elements.detailView);
    elements.detailTitle.focus({ preventScroll: true });
}

function fillForm(item = null) {
    elements.form.reset();
    elements.nameInput.value = item?.name || '';
    elements.durationInput.value = item?.durationMinutes ?? 10;
    elements.appInput.value = item?.appId || '';
    elements.memoInput.value = item?.memo || '';
    showNotice(elements.formError);
}

function renderForm(mode, id = null) {
    const item = mode === 'edit' ? findItem(id) : null;
    if (mode === 'edit' && !item) {
        setHomeRoute();
        return;
    }
    if (!state.storageReady) {
        setHomeRoute();
        return;
    }

    state.formMode = mode;
    state.activeId = item?.id || null;
    elements.formTitle.textContent = mode === 'edit' ? '練習メニューを編集' : '練習メニューを作成';
    fillForm(item);
    showView(elements.formView);
    elements.formTitle.focus({ preventScroll: true });
}

function renderRoute() {
    const hash = location.hash;
    const editMatch = hash.match(/^#practice-menu\/([^/]+)\/edit$/);
    const detailMatch = hash.match(/^#practice-menu\/([^/]+)$/);
    const myAppsEditMatch = hash.match(/^#my-apps\/([^/]+)\/edit$/);

    if (hash === '#my-apps/manage') {
        renderMyAppsManage();
    } else if (hash === '#my-apps/new') {
        renderMyAppsForm('create');
    } else if (myAppsEditMatch) {
        try {
            renderMyAppsForm('edit', decodeURIComponent(myAppsEditMatch[1]));
        } catch (_) {
            renderMyAppsNotFound();
        }
    } else if (hash === '#practice-menu/new') {
        renderForm('create');
    } else if (hash === '#tuner') {
        showView(elements.tunerView);
    } else if (hash === '#metronome') {
        showView(elements.metronomeView);
    } else if (editMatch) {
        renderForm('edit', decodeURIComponent(editMatch[1]));
    } else if (detailMatch) {
        renderDetail(decodeURIComponent(detailMatch[1]));
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
    if (!Object.hasOwn(APP_DEFINITIONS, appId)) return { ok: false, message: '使用アプリを選択してください。' };
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
        setHomeRoute();
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
    setHomeRoute();
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
document.querySelectorAll('[data-action="cancel-form"]').forEach((button) => button.addEventListener('click', cancelForm));
document.querySelectorAll('[data-action="my-apps-home"]').forEach((button) => button.addEventListener('click', setHomeRoute));
document.querySelectorAll('[data-action="new-my-app"]').forEach((button) => button.addEventListener('click', () => setHashRoute('#my-apps/new')));
elements.myAppsAdd.addEventListener('click', () => setHashRoute('#my-apps/new'));
elements.myAppsManage.addEventListener('click', () => setHashRoute('#my-apps/manage'));
elements.myAppsForm.addEventListener('submit', handleMyAppsSubmit);
elements.myAppsDelete.addEventListener('click', handleMyAppsDelete);
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
window.addEventListener('pagehide', () => metronomeController?.stopForPageHidden());

const loadResult = loadPracticeMenus();
state.items = loadResult.items;
state.storageReady = loadResult.ok;
const myAppsLoadResult = loadMyApps();
myAppsState.items = myAppsLoadResult.items;
myAppsState.storageReady = myAppsLoadResult.ok;
metronomeController = initMetronome(elements.metronomeView);
tunerController = initTuner(elements.tunerView);
renderRoute();
