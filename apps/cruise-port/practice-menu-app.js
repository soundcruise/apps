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
import { initMetronome } from './metronome-app.js';

const elements = {
    homeView: document.querySelector('#home-view'),
    detailView: document.querySelector('#practice-detail-view'),
    formView: document.querySelector('#practice-form-view'),
    metronomeView: document.querySelector('#metronome-view'),
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
    reorderNotice: document.querySelector('#practice-reorder-notice')
};

const state = {
    items: [],
    storageReady: false,
    activeId: null,
    formMode: 'create',
    reorderMode: false,
    reorderItems: []
};

let metronomeController = null;

function showNotice(element, message = '') {
    element.textContent = message;
    element.hidden = message.length === 0;
}

function showView(view) {
    [elements.homeView, elements.detailView, elements.formView, elements.metronomeView].forEach((candidate) => {
        candidate.hidden = candidate !== view;
    });
    metronomeController?.setActive(view === elements.metronomeView);
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

    if (hash === '#practice-menu/new') {
        renderForm('create');
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
window.addEventListener('hashchange', renderRoute);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) metronomeController?.stopForPageHidden();
});
window.addEventListener('pagehide', () => metronomeController?.stopForPageHidden());

const loadResult = loadPracticeMenus();
state.items = loadResult.items;
state.storageReady = loadResult.ok;
metronomeController = initMetronome(elements.metronomeView);
renderRoute();
