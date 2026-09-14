import { CRUISE_APP_ICONS, resolveCruiseAppHref } from './cruise-app-links.js?v=0.27.0';

function setText(root, selector, value) {
    const element = root.querySelector(selector);
    if (element) element.textContent = value;
}

function renderAppRows(root, presentation, edition) {
    const list = root.querySelector('#sync-center-apps');
    if (!list) return;
    const rows = presentation.apps.map((app) => {
        const row = document.createElement('li');
        row.className = `sync-center-app sync-status-${app.status}`;
        const image = document.createElement('img');
        image.src = CRUISE_APP_ICONS[app.id][edition === 'pro' ? 'pro' : 'standard'];
        image.alt = '';
        image.width = 48;
        image.height = 48;
        const copy = document.createElement('div');
        copy.className = 'sync-center-app-copy';
        const name = document.createElement('strong');
        name.textContent = app.name;
        const detail = document.createElement('span');
        detail.textContent = app.recordCount == null ? app.statusLabel : `${app.statusLabel}・${app.recordCount}件`;
        copy.append(name, detail);
        const action = document.createElement('a');
        action.className = 'sync-center-app-action';
        action.href = resolveCruiseAppHref(app.id, edition);
        action.textContent = app.action === 'setup' ? '設定する' : '開く';
        action.setAttribute('aria-label', `${app.name}を${app.action === 'setup' ? '設定する' : '開く'}（${app.statusLabel}）`);
        if (app.action === 'none') {
            action.removeAttribute('href');
            action.setAttribute('aria-disabled', 'true');
        }
        row.append(image, copy, action);
        return row;
    });
    list.replaceChildren(...rows);
}

function renderEnvironments(root, presentation) {
    const list = root.querySelector('#sync-center-environments');
    if (!list) return;
    const rows = presentation.environments.length
        ? presentation.environments.map((environment) => {
            const item = document.createElement('li');
            item.textContent = `${environment.label}${environment.isCurrent ? '（この環境）' : ''}・${environment.state === 'active' ? '接続中' : '解除済み'}`;
            return item;
        })
        : [Object.assign(document.createElement('li'), { textContent: '同期中の環境情報はありません。' })];
    list.replaceChildren(...rows);
}

export function renderSyncCenter(root, presentation, { edition = 'standard', setupPlan = null } = {}) {
    if (!root || !presentation || presentation.kind === 'disabled') return;
    root.dataset.syncState = presentation.kind;
    setText(root, '#sync-center-account-label', presentation.accountLabel);
    setText(root, '#sync-center-account-description', presentation.accountDescription);
    setText(root, '#sync-center-progress', `${presentation.readyCount} / ${presentation.totalCount} アプリの同期設定が完了`);
    const setupCount = Array.isArray(setupPlan?.appIds) ? setupPlan.appIds.length : 0;
    setText(root, '#sync-center-setup-plan', setupPlan?.kind === 'unavailable'
        ? '同期情報を確認できてから、必要な設定を案内します。'
        : setupCount ? `現在の状態では${setupCount}個のアプリで個別の初回同期が必要です。`
            : '現在、個別の初回同期が必要なアプリはありません。');
    const alert = root.querySelector('#sync-center-alert');
    if (alert) {
        alert.hidden = !['error', 'offline'].includes(presentation.kind);
        alert.textContent = presentation.kind === 'offline'
            ? 'オフラインのため同期情報を更新できません。各アプリとCruise Portはそのまま利用できます。'
            : presentation.kind === 'error' ? '同期情報を確認できません。時間をおいて再読み込みしてください。' : '';
    }
    renderAppRows(root, presentation, edition);
    renderEnvironments(root, presentation);
}

export function bindSyncCenterUnavailableActions(root) {
    const setup = root?.querySelector?.('#sync-center-setup');
    root?.querySelector?.('#sync-center-setup-open')?.addEventListener('click', () => setup.showModal());
    root?.querySelector?.('#sync-center-setup-close')?.addEventListener('click', () => setup.close());
    root?.querySelector?.('#sync-center-setup-confirm')?.addEventListener('click', () => {
        setup.close();
        setText(root, '#sync-center-action-status', '各Cruiseアプリを開き、個別に初回同期を完了してください。');
    });
    root?.querySelectorAll?.('[data-sync-center-unavailable]').forEach((button) => {
        button.addEventListener('click', () => {
            setText(root, '#sync-center-action-status', 'この操作はまだ利用できません。各Cruiseアプリの設定から操作してください。');
        });
    });
}
