import { CRUISE_APP_ICONS, resolveCruiseAppHref } from './cruise-app-links.js?v=0.27.0';

function setText(root, selector, value) {
    const element = root.querySelector(selector);
    if (element) element.textContent = value;
}

function renderAppRows(root, presentation, edition, orchestrationEnabled) {
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
        const action = document.createElement(orchestrationEnabled ? 'button' : 'a');
        action.className = 'sync-center-app-action';
        if (!orchestrationEnabled) action.href = resolveCruiseAppHref(app.id, edition);
        else {
            action.type = 'button';
            action.dataset.syncAppAction = app.id;
        }
        action.textContent = app.action === 'setup' ? '既存データを接続' : '開く';
        action.setAttribute('aria-label', `${app.name}を${app.action === 'setup' ? '既存データと接続する' : '開く'}（${app.statusLabel}）`);
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

function showJoinCode(root, result, onClose = async () => {}) {
    const dialog = document.createElement('dialog');
    dialog.className = 'sync-center-help-dialog';
    dialog.dataset.syncJoinInvitation = result.invitationId;
    const panel = document.createElement('div');
    panel.className = 'sync-center-join-panel';
    const title = document.createElement('h2');
    title.textContent = '既存データを接続';
    const note = document.createElement('p');
    note.textContent = 'このコードを5分以内に対象アプリの「Cruise Portと接続」へ入力してください。保存する必要はありません。';
    const code = document.createElement('output');
    code.dataset.sensitive = 'true';
    code.className = 'sync-center-join-code';
    code.textContent = result.displayJoinCode;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'action-button primary-action';
    copy.textContent = 'コードをコピー';
    copy.addEventListener('click', () => navigator.clipboard?.writeText(result.displayJoinCode));
    const open = document.createElement('a');
    open.href = result.appUrl;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.className = 'action-button secondary-action';
    open.textContent = '対象アプリを開く';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'action-button secondary-action';
    close.textContent = '閉じる';
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        code.textContent = '';
        dialog.remove();
        Promise.resolve(onClose()).catch(() => {});
    }, { once: true });
    const actions = document.createElement('div');
    actions.className = 'sync-center-join-actions';
    actions.append(copy, open, close);
    panel.append(title, note, code, actions);
    dialog.append(panel);
    root.append(dialog);
    dialog.showModal();
}

export function renderSyncCenter(root, presentation, { edition = 'standard', setupPlan = null, orchestrationEnabled = false } = {}) {
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
    renderAppRows(root, presentation, edition, orchestrationEnabled);
    renderEnvironments(root, presentation);
}

export function bindSyncCenterActions(root, { orchestrator = null, refresh = async () => {}, tokenProvider = async () => null } = {}) {
    const setup = root?.querySelector?.('#sync-center-setup');
    const confirm = root?.querySelector?.('#sync-center-setup-confirm');
    const recovery = root?.querySelector?.('#sync-center-recovery-code');
    const summary = root?.querySelector?.('#sync-center-setup-summary');
    const setPhase = (phase) => {
        setup.dataset.syncPhase = phase;
        if (confirm) confirm.dataset.syncAction = phase === 'recovery' ? 'confirm-recovery-saved' : 'create-account';
    };
    const ensureQaAdmission = async () => {
        if (!orchestrator?.qaAdmissionRequired || await orchestrator.hasQaAdmission()) return true;
        const enrollmentCode = globalThis.prompt('Multi-App QA Enrollment Codeを入力してください。');
        if (!enrollmentCode) throw new Error('qa_enrollment_required');
        const enrollmentToken = await tokenProvider('sound_cruise_account_qa_enroll');
        if (!enrollmentToken) throw new Error('verification_required');
        await orchestrator.enrollQa({ enrollmentCode, turnstileToken: enrollmentToken });
        return true;
    };
    root?.querySelector?.('#sync-center-setup-open')?.addEventListener('click', () => {
        setPhase('introduction');
        if (recovery) { recovery.hidden = true; recovery.textContent = ''; }
        if (confirm) confirm.textContent = '復旧コードを確認';
        setup.showModal();
    });
    root?.querySelector?.('#sync-center-setup-close')?.addEventListener('click', () => {
        orchestrator?.discardAccountCandidate?.();
        if (recovery) recovery.textContent = '';
        setup.close();
    });
    confirm?.addEventListener('click', async () => {
        if (!orchestrator?.enabled) {
            setup.close();
            setText(root, '#sync-center-action-status', 'この機能は現在利用できません。');
            return;
        }
        confirm.disabled = true;
        try {
            await ensureQaAdmission();
            if (setup.dataset.syncPhase === 'complete') {
                setup.close();
                return;
            }
            if (setup.dataset.syncPhase !== 'recovery') {
                const candidate = orchestrator.createAccountCandidate();
                setPhase('recovery');
                recovery.hidden = false;
                recovery.textContent = candidate.recoveryCode;
                if (summary) summary.textContent = '復旧コードを安全な場所へ保存してください。保存確認後にAccountを作成します。';
                confirm.textContent = '保存しました';
                return;
            }
            const turnstileToken = await tokenProvider('sound_cruise_account_start');
            if (!turnstileToken) throw new Error('verification_required');
            recovery.textContent = '';
            recovery.hidden = true;
            setPhase('preparing');
            if (summary) summary.textContent = '4つのアプリの同期準備をしています…';
            await orchestrator.completeAccountSetup({ recoverySaved: true, turnstileToken });
            const prepared = await orchestrator.prepareAll();
            if (!prepared.ok) throw new Error('membership_partial');
            setPhase('complete');
            if (summary) summary.textContent = '準備ができました。各アプリを開いて初回同期を完了してください。';
            confirm.textContent = '閉じる';
            await refresh();
        } catch (error) {
            setText(root, '#sync-center-action-status', error?.message === 'verification_required'
                ? '人間確認を完了してから続けてください。'
                : error?.message === 'qa_enrollment_required'
                    ? 'QA Enrollment Codeが必要です。'
                : '準備を完了できませんでした。成功済みの設定は保持されています。もう一度お試しください。');
        } finally { confirm.disabled = false; }
    });
    root?.addEventListener?.('click', async (event) => {
        const button = event.target.closest?.('[data-sync-app-action]');
        if (!button || !orchestrator?.enabled) return;
        button.disabled = true;
        try {
            const result = await orchestrator.launch(button.dataset.syncAppAction);
            if (result?.kind === 'join') {
                showJoinCode(root, result, async () => {
                    try { await orchestrator.cancelJoin(result.invitationId); }
                    catch (_) { /* consumed, expired, or already cancelled */ }
                    button.disabled = false;
                    await refresh();
                });
            }
        }
        catch (_) {
            button.disabled = false;
            setText(root, '#sync-center-action-status', 'アプリを開く準備ができませんでした。通信状態を確認してください。');
        }
    });
    root?.querySelectorAll?.('[data-sync-center-unavailable]').forEach((button) => {
        button.addEventListener('click', () => {
            setText(root, '#sync-center-action-status', 'この操作はまだ利用できません。各Cruiseアプリの設定から操作してください。');
        });
    });
    return Object.freeze({ ensureQaAdmission });
}

export const bindSyncCenterUnavailableActions = bindSyncCenterActions;
