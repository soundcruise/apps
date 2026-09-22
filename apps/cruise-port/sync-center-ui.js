import { CRUISE_APP_ICONS, resolveCruiseAppHref } from './cruise-app-links.js?v=0.27.0';
import { SYNC_CENTER_APPS, appSyncStatusPresentation } from './sync-center-controller.js?v=0.45.9';

const TEMPORARY_FEEDBACK_MS = globalThis.SoundCruiseSyncUI?.temporaryFeedbackMs || 5000;

function setText(root, selector, value) {
    const element = root.querySelector(selector);
    if (element) element.textContent = value;
}

function renderAppRows(root, presentation, edition, orchestrationEnabled, onAppAction = null) {
    const list = root.querySelector('#sync-center-apps');
    if (!list) return;
    const rows = presentation.apps.map((app) => {
        const row = document.createElement('li');
        const presentationStatus = presentation.kind === 'ready'
            ? (app.presentationStatus || appSyncStatusPresentation(app))
            : appSyncStatusPresentation(app, presentation.kind);
        row.className = `sync-center-app sync-status-${presentationStatus.state}`;
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
        detail.className = 'sync-center-app-status-line';
        const chip = document.createElement('span');
        chip.className = `sync-center-app-status-chip sync-center-app-status-chip--${presentationStatus.state}`;
        chip.textContent = presentationStatus.label;
        detail.append(chip);
        if (app.recordCount != null) {
            const count = document.createElement('span');
            count.className = 'sync-center-app-record-count';
            count.textContent = `${app.recordCount}件`;
            detail.append(count);
        }
        copy.append(name, detail);
        const actions = document.createElement('div');
        actions.className = 'sync-center-app-row-actions';
        const needsInitialConnection = ['unset', 'prepared', 'detached'].includes(app.status);
        const accountReady = presentation.accountState === 'active';
        const canRemoveAppSync = Number(app.activeAppDeviceCount || 0) > 0 &&
            app.status !== 'deleting' && orchestrationEnabled;
        const action = document.createElement(needsInitialConnection
            ? (accountReady && !orchestrationEnabled ? 'a' : 'button')
            : canRemoveAppSync ? 'button' : 'span');
        action.className = canRemoveAppSync
            ? 'sync-center-app-action sync-center-app-remove'
            : 'sync-center-app-action';
        if (needsInitialConnection && accountReady && !orchestrationEnabled) action.href = resolveCruiseAppHref(app.id, edition);
        else if (needsInitialConnection && accountReady) {
            action.type = 'button';
            action.dataset.syncAppAction = app.id;
            if (typeof onAppAction === 'function') {
                action.addEventListener('click', (event) => {
                    event.stopPropagation();
                    void onAppAction(action);
                });
            }
        }
        if (needsInitialConnection && app.deleteGrace) {
            action.dataset.syncAppDeleteGrace = 'true';
            action.dataset.syncAppName = app.name;
        }
        if (canRemoveAppSync) {
            action.type = 'button';
            action.dataset.syncAppDetach = app.id;
            action.dataset.syncAppName = app.name;
        }
        // Prepared memberships use the same launch callback as normal rows, but
        // opening them issues the initial connection code. Keep that callback
        // contract intact while making the next action clear in the UI.
        const actionLabel = needsInitialConnection && !accountReady
            ? '先にアカウントを作成または接続してください'
            : needsInitialConnection ? '同期コード' : canRemoveAppSync ? '同期を解除' : app.statusLabel;
        action.textContent = actionLabel;
        action.setAttribute('aria-label', `${app.name}で${actionLabel}（${app.statusLabel}）`);
        if (needsInitialConnection && !accountReady) {
            action.disabled = true;
            action.setAttribute('aria-disabled', 'true');
        } else if (app.action === 'none' || (!needsInitialConnection && !canRemoveAppSync)) {
            action.removeAttribute('href');
            action.setAttribute('aria-disabled', 'true');
        }
        actions.append(action);
        row.append(image, copy, actions);
        return row;
    });
    list.replaceChildren(...rows);
}

function renderEnvironmentManagementRows(root, presentation, edition, orchestrationEnabled) {
    const portList = root.querySelector('#sync-center-add-environments');
    const appList = root.querySelector('#sync-center-app-environments');
    if (!portList || !appList) return;
    const activeAccount = presentation.accountState === 'active';
    const portEnvironments = presentation.environments.filter((environment) =>
        environment.state === 'active' && environment.isPortEnvironment);
    const entries = [
        {
            id: 'port', name: 'Cruise Port',
            subtitle: null,
            icon: `/apps/cruise-port/assets/app-icons/${edition === 'pro' ? 'pro' : 'standard'}/icon-192.png`,
            available: activeAccount,
            environments: portEnvironments
        },
        ...presentation.apps.map((app) => ({
            ...app,
            icon: CRUISE_APP_ICONS[app.id][edition === 'pro' ? 'pro' : 'standard'],
            available: activeAccount && app.canAddEnvironment && !app.deleteGrace,
            environments: Array.isArray(app.environments) ? app.environments : []
        }))
    ];
    const rows = entries.map((entry) => {
        const row = document.createElement('li');
        row.className = 'sync-center-app sync-center-environment-group sync-center-destination-card';
        const primary = document.createElement('div');
        primary.className = 'sync-center-destination-primary';
        const image = document.createElement('img');
        image.src = entry.icon;
        image.alt = '';
        image.width = 48;
        image.height = 48;
        const copy = document.createElement('div');
        copy.className = 'sync-center-app-copy';
        const name = document.createElement('strong');
        name.textContent = entry.name;
        copy.append(name);
        if (entry.subtitle) {
            const subtitle = document.createElement('span');
            subtitle.className = 'sync-center-app-subtitle';
            subtitle.textContent = entry.subtitle;
            copy.append(subtitle);
        }
        primary.append(image, copy);
        const count = document.createElement('button');
        count.type = 'button';
        count.className = 'sync-center-environment-count sync-center-destination-count';
        count.textContent = `同期先 ${entry.environments.length}件${entry.environments.length ? '⌄' : ''}`;
        count.disabled = entry.environments.length === 0;
        count.dataset.syncEnvironmentToggle = entry.id;
        count.setAttribute('aria-expanded', 'false');
        count.setAttribute('aria-label', `${entry.name}の環境一覧を表示`);
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'sync-center-app-action secondary sync-center-destination-add';
        add.textContent = entry.id === 'port' ? '別の端末を追加' : '同期先を追加';
        add.disabled = !orchestrationEnabled || !entry.available;
        add.setAttribute('aria-label', `${entry.name}の追加コードを表示`);
        if (entry.id === 'port') add.dataset.syncPortAddEnvironment = 'true';
        else add.dataset.syncAppAddEnvironment = entry.id;
        const details = document.createElement('ul');
        details.className = 'sync-center-environments sync-center-environment-list';
        details.dataset.syncEnvironmentDetails = entry.id;
        details.hidden = true;
        const environmentRows = entry.environments.map((environment) => {
            const item = document.createElement('li');
            const copy = document.createElement('span');
            copy.textContent = `${environment.label}${environment.isCurrent ? '（この環境）' : ''}`;
            const metadata = document.createElement('small');
            const lastSeen = environment.lastSeenAt == null ? '不明' : new Date(environment.lastSeenAt).toLocaleString('ja-JP');
            metadata.textContent = `最終利用 ${lastSeen}`;
            copy.append(metadata);
            item.append(copy);
            if (environment.id) {
                const revoke = document.createElement('button');
                revoke.type = 'button';
                revoke.className = 'action-button secondary-action';
                revoke.textContent = '解除';
                revoke.dataset.syncEnvironmentCurrent = environment.isCurrent ? 'true' : 'false';
                if (entry.id === 'port') {
                    revoke.dataset.syncEnvironmentRevoke = environment.id;
                    if (environment.isCurrent) {
                        revoke.dataset.syncCurrentEnvironmentDetach = 'true';
                        revoke.dataset.syncCurrentEnvironmentLastPort = String(portEnvironments.length === 1);
                    }
                } else {
                    revoke.dataset.syncAppEnvironmentRevoke = environment.id;
                    revoke.dataset.syncAppEnvironmentApp = entry.id;
                }
                item.append(revoke);
            }
            return item;
        });
        details.replaceChildren(...environmentRows);
        row.append(primary, add, count, details);
        return row;
    });
    portList.replaceChildren(rows[0]);
    appList.replaceChildren(...rows.slice(1));
}

function renderDangerActions(root, presentation) {
    const accountDelete = root.querySelector('#sync-center-account-delete');
    if (accountDelete) accountDelete.disabled = presentation.accountState !== 'active';
    root.querySelectorAll('[data-sync-app-delete]').forEach((button) => {
        const app = presentation.apps.find((item) => item.id === button.dataset.syncAppDelete);
        button.disabled = presentation.accountState !== 'active' ||
            !app || app.deleteGrace || ['unset', 'prepared', 'deleting'].includes(app.status);
    });
}

function renderPortStatus(root, presentation) {
    const status = presentation.portStatus || {
        state: 'attention', label: '確認が必要'
    };
    const chip = root.querySelector('#sync-center-port-status-chip');
    if (chip) {
        chip.textContent = status.label;
        chip.dataset.syncPortStatus = status.state;
        chip.className = `sync-center-app-status-chip sync-center-app-status-chip--${status.state}`;
    }
}

function showJoinCode(root, result, edition = 'standard', onClose = async () => {}) {
    const dialog = document.createElement('dialog');
    dialog.className = 'sync-center-help-dialog';
    dialog.dataset.syncJoinInvitation = result.invitationId;
    const panel = document.createElement('div');
    panel.className = 'sync-center-join-panel';
    const header = document.createElement('header');
    header.className = 'sync-center-join-header';
    const title = document.createElement('h2');
    const isPortAddition = result.kind === 'add_port';
    title.textContent = isPortAddition ? '別のCruise Portを追加'
        : 'このアプリを接続';
    const target = isPortAddition
        ? { id: 'port', name: 'Cruise Port' }
        : SYNC_CENTER_APPS.find((app) => app.id === result.appId);
    if (target) {
        const badge = document.createElement('div');
        badge.className = 'sync-center-join-target';
        const icon = document.createElement('img');
        icon.src = isPortAddition
            ? `/apps/cruise-port/assets/app-icons/${edition === 'pro' ? 'pro' : 'standard'}/icon-192.png`
            : CRUISE_APP_ICONS[target.id][edition === 'pro' ? 'pro' : 'standard'];
        icon.alt = '';
        icon.width = 44;
        icon.height = 44;
        const name = document.createElement('span');
        name.textContent = target.name;
        badge.append(icon, name);
        header.append(title, badge);
    } else {
        header.append(title);
    }
    const intro = document.createElement('p');
    intro.className = 'sync-center-join-intro';
    intro.textContent = isPortAddition
        ? '別の端末やブラウザのCruise Portを、このアカウントに追加します。'
        : '以下の手順で接続します。';
    const steps = document.createElement('ol');
    steps.className = 'sync-center-join-steps';
    (isPortAddition ? [
        '追加コードをコピー',
        '追加したい端末やブラウザでCruise Portを開く',
        '「既存のアカウントに接続」を押す',
        'コードを入力して接続する'
    ] : [
        'コードをコピー',
        '普段使っているProアプリを開く',
        '設定 → クラウド同期 → 「Cruise Portと接続」を押す',
        'コードを貼り付けて「接続する」を押す'
    ]).forEach((step) => {
        const item = document.createElement('li');
        item.textContent = step;
        steps.append(item);
    });
    const codeLabel = document.createElement('p');
    codeLabel.className = 'sync-center-join-code-label';
    codeLabel.textContent = '接続コード';
    const code = document.createElement('output');
    code.dataset.sensitive = 'true';
    code.className = 'sync-center-join-code';
    code.textContent = result.displayJoinCode;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'action-button primary-action';
    copy.textContent = 'コードをコピー';
    const copyStatus = document.createElement('p');
    copyStatus.setAttribute('role', 'status');
    copyStatus.setAttribute('aria-live', 'polite');
    let copyStatusTimer = null;
    copy.addEventListener('click', async () => {
        copy.disabled = true;
        copy.setAttribute('aria-busy', 'true');
        try {
            if (!globalThis.navigator?.clipboard?.writeText) throw new Error('clipboard_unavailable');
            await globalThis.navigator.clipboard.writeText(result.displayJoinCode);
            copyStatus.textContent = 'コピーしました';
        } catch (_) {
            copyStatus.textContent = 'コピーできませんでした。コードを選択してコピーしてください。';
        } finally {
            copy.disabled = false;
            copy.removeAttribute('aria-busy');
            if (copyStatusTimer) globalThis.clearTimeout(copyStatusTimer);
            copyStatusTimer = globalThis.setTimeout(() => { copyStatus.textContent = ''; }, TEMPORARY_FEEDBACK_MS);
        }
    });
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
    actions.append(copy, close);
    const expires = document.createElement('p');
    expires.className = 'sync-center-join-note';
    expires.textContent = 'このコードは5分間有効です。';
    const keepOpen = document.createElement('p');
    keepOpen.className = 'sync-center-join-note sync-center-join-warning';
    keepOpen.textContent = '※ 接続が完了するまで、この画面を開いたままにしてください。閉じると、このコードは使えなくなります。';
    steps.children[0]?.after(keepOpen);
    panel.append(header, intro, steps, codeLabel, code, actions, expires, copyStatus);
    dialog.append(panel);
    root.append(dialog);
    dialog.showModal();
}

function confirmDeleteCancellation(root, appName) {
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'sync-center-help-dialog';
        const panel = document.createElement('div');
        panel.className = 'sync-center-join-panel';
        const title = document.createElement('h2');
        title.textContent = '削除を取り消して再接続';
        const copy = document.createElement('p');
        copy.textContent = `${appName}の同期データは削除待ちです。再接続すると削除を取り消し、現在のクラウドデータを引き続き使用します。`;
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = 'action-button primary-action';
        confirm.textContent = '削除を取り消して同期コードを表示';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'action-button secondary-action';
        cancel.textContent = 'キャンセル';
        const actions = document.createElement('div');
        actions.className = 'sync-center-join-actions';
        actions.append(confirm, cancel);
        panel.append(title, copy, actions);
        dialog.append(panel);
        root.append(dialog);
        let accepted = false;
        confirm.addEventListener('click', () => { accepted = true; dialog.close(); }, { once: true });
        cancel.addEventListener('click', () => dialog.close(), { once: true });
        dialog.addEventListener('close', () => {
            dialog.remove();
            resolve(accepted);
        }, { once: true });
        dialog.showModal();
    });
}

export function renderSyncCenter(root, presentation, {
    edition = 'standard', orchestrationEnabled = false, onAppAction = null
} = {}) {
    if (!root || !presentation || presentation.kind === 'disabled') return;
    root.dataset.syncState = presentation.kind;
    const accountStatus = root.querySelector('#sync-center-account-status');
    const setupOpen = root.querySelector('#sync-center-setup-open');
    const portConnectOpen = root.querySelector('#sync-center-port-connect-open');
    const accountRecoveryOpen = root.querySelector('#sync-center-account-recovery-open');
    const recoveryOpen = root.querySelector('#sync-center-recovery-open');
    const recoveryHelp = root.querySelector('#sync-center-recovery-help');
    const accountActionRow = root.querySelector('.sync-center-account-action-row');
    const accountState = presentation.accountState;
    if (accountActionRow) accountActionRow.dataset.syncAccountState = accountState || 'unknown';
    const accountDisplayId = root.querySelector('#sync-center-account-display-id');
    if (accountStatus) {
        accountStatus.textContent = accountState === 'unset' ? '未作成' :
            accountState === 'active' ? '作成済み' : accountState === 'deleting' ? '削除中' : '確認が必要';
        accountStatus.dataset.syncAccountState = accountState || 'unknown';
    }
    if (setupOpen) {
        setupOpen.hidden = accountState !== 'unset';
        setupOpen.textContent = 'アカウントの作成';
    }
    if (portConnectOpen) portConnectOpen.hidden = accountState !== 'unset';
    if (accountRecoveryOpen) {
        accountRecoveryOpen.hidden = accountState !== 'active';
        accountRecoveryOpen.textContent = '復旧コードを更新';
    }
    if (recoveryOpen) recoveryOpen.hidden = accountState !== 'unset';
    if (recoveryHelp) {
        recoveryHelp.textContent = accountState === 'active'
            ? '復旧コードは、アカウントを失ったときに元のクラウドデータへ戻るために使います。安全のため現在のコードは再表示できません。必要な場合は「復旧コードを更新」から新しいコードを発行できます。'
            : '保存してある復旧コードを使って、既存のSound Cruise Syncアカウントを復旧できます。';
    }
    if (accountDisplayId) {
        accountDisplayId.textContent = presentation.accountDisplayId
            ? `アカウント：${presentation.accountDisplayId}` : '';
        accountDisplayId.hidden = !presentation.accountDisplayId;
    }
    const alert = root.querySelector('#sync-center-alert');
    if (alert) {
        alert.hidden = !['error', 'offline'].includes(presentation.kind);
        alert.textContent = presentation.kind === 'offline'
            ? 'オフラインのため同期情報を更新できません。各アプリとCruise Portはそのまま利用できます。'
            : presentation.kind === 'error' ? '同期情報を確認できません。時間をおいて再読み込みしてください。' : '';
    }
    renderAppRows(root, presentation, edition, orchestrationEnabled, onAppAction);
    renderPortStatus(root, presentation);
    renderEnvironmentManagementRows(root, presentation, edition, orchestrationEnabled);
    renderDangerActions(root, presentation);
}

function bindSectionHelp(root) {
    root?.querySelectorAll?.('[data-sync-section-help-toggle]').forEach((button) => {
        if (button.dataset.syncSectionHelpBound === 'true') return;
        button.dataset.syncSectionHelpBound = 'true';
        button.addEventListener('click', () => {
            const help = root.querySelector(`#${button.dataset.syncSectionHelpToggle}`);
            if (!help) return;
            help.hidden = !help.hidden;
            button.setAttribute('aria-expanded', String(!help.hidden));
        });
    });
}

function bindAdvancedEnvironmentManagement(root) {
    const toggle = root?.querySelector?.('#sync-center-app-environments-toggle');
    const panel = root?.querySelector?.('#sync-center-app-environments-advanced');
    if (!toggle || !panel || toggle.dataset.syncBound === 'true') return;
    toggle.dataset.syncBound = 'true';
    toggle.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        toggle.setAttribute('aria-expanded', String(!panel.hidden));
        toggle.textContent = panel.hidden ? 'Cruiseアプリの同期先を管理' : 'Cruiseアプリの同期先を閉じる';
    });
}

export function bindSyncCenterActions(root, { orchestrator = null, refresh = async () => {}, tokenProvider = async () => null, edition = 'standard' } = {}) {
    bindSectionHelp(root);
    bindAdvancedEnvironmentManagement(root);
    const setup = root?.querySelector?.('#sync-center-setup');
    const setupTitle = root?.querySelector?.('#sync-center-setup-title');
    const setupClose = root?.querySelector?.('#sync-center-setup-close');
    const confirm = root?.querySelector?.('#sync-center-setup-confirm');
    const recovery = root?.querySelector?.('#sync-center-recovery-code');
    const summary = root?.querySelector?.('#sync-center-setup-summary');
    const setupIntro = root?.querySelector?.('#sync-center-setup-intro');
    const setupSteps = root?.querySelector?.('#sync-center-setup-steps');
    const setupPlan = root?.querySelector?.('#sync-center-setup-plan');
    const setupTurnstile = root?.querySelector?.('#sync-center-setup-turnstile');
    const setupTurnstileMount = root?.querySelector?.('#sync-center-turnstile');
    const recoveryDialog = root?.querySelector?.('#sync-center-recovery');
    const recoveryTitle = root?.querySelector?.('#sync-center-recovery-dialog-title');
    const recoveryInput = root?.querySelector?.('#sync-center-recovery-input');
    const recoverySummary = root?.querySelector?.('#sync-center-recovery-summary');
    const recoveryCandidate = root?.querySelector?.('#sync-center-recovery-candidate');
    const recoveryConfirm = root?.querySelector?.('#sync-center-recovery-confirm');
    const recoveryClose = root?.querySelector?.('#sync-center-recovery-close');
    const setupCopy = root?.querySelector?.('#sync-center-setup-copy');
    const setupCopyStatus = root?.querySelector?.('#sync-center-setup-copy-status');
    const recoveryCopy = root?.querySelector?.('#sync-center-recovery-copy');
    const recoveryCopyStatus = root?.querySelector?.('#sync-center-recovery-copy-status');
    const recoveryRotateConfirmDialog = root?.querySelector?.('#sync-center-recovery-rotate-confirm-dialog');
    const recoveryRotateConfirm = root?.querySelector?.('#sync-center-recovery-rotate-confirm');
    const recoverySecret = recoveryInput && globalThis.SoundCruiseSyncAccount?.core
        ?.createSensitiveInputController?.(recoveryInput);
    const portConnectDialog = root?.querySelector?.('#sync-center-port-connect');
    const portConnectDescription = root?.querySelector?.('#sync-center-port-connect-description');
    const portConnectLabel = root?.querySelector?.('#sync-center-port-connect-label');
    const portConnectInput = root?.querySelector?.('#sync-center-port-connect-input');
    const portConnectConfirm = root?.querySelector?.('#sync-center-port-connect-confirm');
    const portConnectCancel = root?.querySelector?.('#sync-center-port-connect-cancel');
    const portConnectClose = root?.querySelector?.('#sync-center-port-connect-close');
    const portConnectStatus = root?.querySelector?.('#sync-center-port-connect-status');
    const portConnectSecret = portConnectInput && globalThis.SoundCruiseSyncAccount?.core
        ?.createSensitiveInputController?.(portConnectInput);
    const setPortConnectPhase = (phase) => {
        const inputPhase = phase === 'input';
        const successPhase = phase === 'complete';
        if (portConnectDialog) portConnectDialog.dataset.syncPhase = phase;
        if (portConnectDescription) portConnectDescription.hidden = !inputPhase;
        if (portConnectLabel) portConnectLabel.hidden = !inputPhase;
        if (portConnectInput) portConnectInput.hidden = !inputPhase;
        if (portConnectConfirm) portConnectConfirm.hidden = !inputPhase;
        if (portConnectCancel) portConnectCancel.hidden = !inputPhase;
        if (portConnectClose) portConnectClose.hidden = !successPhase;
    };
    const lifecycleDialog = root?.querySelector?.('#sync-center-lifecycle-confirm');
    const lifecycleTitle = root?.querySelector?.('#sync-center-lifecycle-title');
    const lifecycleSummary = root?.querySelector?.('#sync-center-lifecycle-summary');
    const lifecycleConfirm = root?.querySelector?.('#sync-center-lifecycle-submit');
    const lifecycleDeleteNote = root?.querySelector?.('#sync-center-lifecycle-delete-note');
    let lifecycleAction = null;
    const copySensitiveOutput = async (button, status, value) => {
        if (!button || !status) return;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        try {
            if (!value || !globalThis.navigator?.clipboard?.writeText) throw new Error('clipboard_unavailable');
            await globalThis.navigator.clipboard.writeText(value);
            status.textContent = 'コピーしました';
        } catch (_) {
            status.textContent = 'コピーできませんでした。コードを選択して保存してください。';
        } finally {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            if (status._syncFeedbackTimer) globalThis.clearTimeout(status._syncFeedbackTimer);
            status._syncFeedbackTimer = globalThis.setTimeout(() => { status.textContent = ''; }, TEMPORARY_FEEDBACK_MS);
        }
    };
    const requestSetupTurnstileToken = async (action) => {
        if (setupTurnstile) setupTurnstile.hidden = false;
        if (summary) summary.textContent = '本人確認を完了してください。';
        try {
            return await tokenProvider(action, { mount: setupTurnstileMount, visible: true });
        } finally {
            if (setupTurnstile) setupTurnstile.hidden = true;
        }
    };
    setupCopy?.addEventListener('click', () => copySensitiveOutput(setupCopy, setupCopyStatus, recovery?.textContent || ''));
    recoveryCopy?.addEventListener('click', () => copySensitiveOutput(recoveryCopy, recoveryCopyStatus, recoveryCandidate?.textContent || ''));
    const setPhase = (phase) => {
        setup.dataset.syncPhase = phase;
        const processing = ['starting', 'preparing-memberships'].includes(phase);
        if (setupTitle) setupTitle.textContent = phase === 'recovery'
            ? '復旧コードを保存' : phase === 'complete' ? 'アカウント作成が完了しました'
                : processing ? 'アカウントを作成しています…' : 'クラウド同期をはじめる';
        if (setupClose) setupClose.hidden = phase === 'complete' || processing;
        if (confirm) confirm.hidden = processing;
        const introduction = phase === 'introduction';
        if (setupIntro) setupIntro.hidden = !introduction;
        if (setupSteps) setupSteps.hidden = !introduction;
        if (setupPlan) setupPlan.hidden = !introduction;
        if (summary) summary.hidden = introduction;
        if (confirm) confirm.dataset.syncAction = ['recovery', 'start-uncertain'].includes(phase)
            ? 'confirm-recovery-saved' : phase === 'membership-retry' ? 'retry-memberships' : 'create-account';
    };
    const showRecoveryCandidate = () => {
        const candidate = orchestrator.createAccountCandidate();
        setPhase('recovery');
        recovery.hidden = false;
        recovery.textContent = candidate.recoveryCode;
        if (setupCopy) setupCopy.hidden = false;
        if (summary) summary.textContent = 'この復旧コードを安全な場所に保存してください。';
        if (confirm) confirm.textContent = '保存しました';
    };
    const safeErrorCode = (error) => {
        const value = String(error?.code || error?.message || 'setup_failed');
        return /^[a-z0-9_]{1,64}$/.test(value) ? value : 'setup_failed';
    };
    const failureCategory = (error) => {
        const code = safeErrorCode(error);
        if (error?.category === 'storage' || code.startsWith('account_storage_')) return 'storage';
        if (['verification_required', 'verification_failed', 'turnstile_failed'].includes(code) || code.includes('turnstile')) {
            return 'turnstile';
        }
        if (['qa_admission_required', 'qa_enrollment_required'].includes(code)) return 'admission';
        if (code === 'rate_limited') return 'rate_limit';
        if (['network_error', 'account_request_timeout', 'account_start_uncertain', 'invalid_response'].includes(code)) {
            return 'network';
        }
        if (Number(error?.status) >= 500 || code.includes('server_') || code.includes('runtime_')) return 'server';
        return 'unknown';
    };
    const accountStartFailureMessage = (category) => ({
        storage: 'このブラウザ環境では同期の準備を完了できませんでした。もう一度お試しください。',
        turnstile: '人間確認の検証に失敗しました。ページを更新してから、もう一度お試しください。',
        admission: 'このQA環境の利用確認を完了できませんでした。ページを更新してから、もう一度お試しください。',
        rate_limit: '短時間に操作が集中しました。少し待ってから、もう一度お試しください。',
        network: 'アカウント作成の通信を完了できませんでした。通信状態を確認して、もう一度お試しください。',
        server: '同期サービスでアカウント作成を完了できませんでした。少し待ってから、もう一度お試しください。'
    })[category] || 'アカウント作成を完了できませんでした。もう一度お試しください。';
    const ensureQaAdmission = async () => {
        if (!orchestrator?.qaAdmissionRequired || await orchestrator.hasQaAdmission()) return true;
        const enrollmentCode = globalThis.prompt('Multi-App QA Enrollment Codeを入力してください。');
        if (!enrollmentCode) throw new Error('qa_enrollment_required');
        const enrollmentToken = await tokenProvider('sound_cruise_account_qa_enroll');
        if (!enrollmentToken) throw new Error('verification_required');
        await orchestrator.enrollQa({ enrollmentCode, turnstileToken: enrollmentToken });
        return true;
    };
    root?.querySelector?.('#sync-center-port-connect-open')?.addEventListener('click', () => {
        portConnectSecret?.resolve();
        setPortConnectPhase('input');
        if (portConnectStatus) portConnectStatus.textContent = '';
        portConnectDialog?.showModal();
        portConnectInput?.focus();
    });
    portConnectCancel?.addEventListener('click', () => {
        portConnectSecret?.resolve();
        if (portConnectStatus) portConnectStatus.textContent = '';
        portConnectDialog?.close();
    });
    portConnectClose?.addEventListener('click', () => {
        portConnectDialog?.close();
        setText(root, '#sync-center-action-status', '既存のアカウントに接続しました。');
    });
    portConnectConfirm?.addEventListener('click', async () => {
        if (!orchestrator?.enabled) return;
        portConnectConfirm.disabled = true;
        try {
            const joinCode = portConnectSecret?.take();
            if (!joinCode) throw new Error('port_join_code_required');
            setPortConnectPhase('working');
            if (portConnectStatus) portConnectStatus.textContent = '既存のアカウントに接続しています…';
            await orchestrator.connectExistingAccount(joinCode);
            portConnectSecret.resolve();
            setPortConnectPhase('complete');
            if (portConnectStatus) portConnectStatus.textContent = '接続しました。';
            try { await refresh(); } catch (_) { /* committed Join remains successful */ }
        } catch (error) {
            portConnectSecret?.reject(error);
            setPortConnectPhase('input');
            if (portConnectStatus) {
                portConnectStatus.textContent = '接続できませんでした。コードの有効期限と入力内容を確認してください。';
            }
        } finally {
            portConnectConfirm.disabled = false;
        }
    });
    root?.querySelector?.('#sync-center-setup-open')?.addEventListener('click', () => {
        if (recovery) { recovery.hidden = true; recovery.textContent = ''; }
        if (setupCopy) setupCopy.hidden = true;
        if (setupCopyStatus) setupCopyStatus.textContent = '';
        try {
            showRecoveryCandidate();
            setup.showModal();
        } catch (_) {
            setText(root, '#sync-center-action-status', 'アカウント作成を開始できませんでした。もう一度お試しください。');
        }
    });
    root?.querySelector?.('#sync-center-setup-close')?.addEventListener('click', () => {
        orchestrator?.discardAccountCandidate?.();
        if (recovery) recovery.textContent = '';
        if (setupCopy) setupCopy.hidden = true;
        if (setupCopyStatus) setupCopyStatus.textContent = '';
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
            delete setup.dataset.syncError;
            delete setup.dataset.syncFailureCategory;
            await ensureQaAdmission();
            if (setup.dataset.syncPhase === 'complete') {
                setup.close();
                return;
            }
            if (setup.dataset.syncPhase === 'membership-retry') {
                setPhase('preparing-memberships');
                if (summary) summary.textContent = '4つのアプリの同期準備をしています…';
                const prepared = await orchestrator.prepareAll();
                if (!prepared.ok) throw new Error('membership_partial');
                setPhase('complete');
                if (summary) summary.textContent = '続いて、各アプリの初回同期を完了してください。';
                confirm.textContent = '閉じる';
                try { await refresh(); } catch (_) { /* Account is already authoritative */ }
                return;
            }
            if (!['recovery', 'start-uncertain'].includes(setup.dataset.syncPhase)) {
                showRecoveryCandidate();
                return;
            }
            const turnstileToken = await requestSetupTurnstileToken('sound_cruise_account_start');
            if (!turnstileToken) throw new Error('verification_required');
            recovery.textContent = '';
            recovery.hidden = true;
            if (setupCopy) setupCopy.hidden = true;
            setPhase('starting');
            if (summary) summary.textContent = 'Sound Cruise Syncアカウントを作成しています…';
            await orchestrator.completeAccountSetup({ recoverySaved: true, turnstileToken });
            setPhase('preparing-memberships');
            if (summary) summary.textContent = '4つのアプリの同期準備をしています…';
            const prepared = await orchestrator.prepareAll();
            if (!prepared.ok) throw new Error('membership_partial');
            setPhase('complete');
            if (summary) summary.textContent = '続いて、各アプリの初回同期を完了してください。';
            confirm.textContent = '閉じる';
            try { await refresh(); } catch (_) { /* Account is already authoritative */ }
        } catch (error) {
            const failedPhase = setup.dataset.syncPhase;
            setup.dataset.syncError = safeErrorCode(error);
            setup.dataset.syncFailureCategory = failureCategory(error);
            if (failedPhase === 'starting' || failedPhase === 'start-uncertain') {
                setPhase('start-uncertain');
                if (summary) summary.textContent = accountStartFailureMessage(setup.dataset.syncFailureCategory);
                confirm.textContent = 'もう一度試す';
            } else if (failedPhase === 'preparing-memberships' || failedPhase === 'membership-retry') {
                setPhase('membership-retry');
                if (summary) summary.textContent = '完了していないアプリの同期準備があります。成功済みの設定は保持されています。';
                confirm.textContent = 'もう一度試す';
            } else if (failedPhase === 'recovery' && error?.message === 'verification_required') {
                if (summary) summary.textContent = '人間確認を完了してから、もう一度お試しください。';
            }
            setText(root, '#sync-center-action-status', error?.message === 'verification_required'
                ? '人間確認を完了してから続けてください。'
                : error?.message === 'qa_enrollment_required'
                    ? 'QA Enrollment Codeが必要です。'
                : '準備を完了できませんでした。成功済みの設定は保持されています。もう一度お試しください。');
        } finally { confirm.disabled = false; }
    });
    const issueAppJoin = async (button) => {
        if (!button || !orchestrator?.enabled) return;
        button.disabled = true;
        const deleting = button.dataset.syncAppDeleteGrace === 'true';
        try {
            if (deleting) {
                const confirmed = await confirmDeleteCancellation(
                    root, button.dataset.syncAppName || 'このアプリ'
                );
                if (!confirmed) { button.disabled = false; return; }
            }
            const result = deleting
                ? await orchestrator.cancelAppDeleteAndLaunch(button.dataset.syncAppAction)
                : await orchestrator.launch(button.dataset.syncAppAction);
            if (result?.kind === 'join') {
                showJoinCode(root, result, edition, async () => {
                    try { await orchestrator.cancelJoin(result.invitationId); }
                    catch (_) { /* consumed, expired, or already cancelled */ }
                    button.disabled = false;
                    await refresh();
                });
            }
        }
        catch (_) {
            button.disabled = false;
            if (deleting) await refresh();
            setText(root, '#sync-center-action-status', '同期コードを表示できませんでした。同期状態を確認してください。');
        }
    };
    root?.addEventListener?.('click', async (event) => {
        const environmentToggle = event.target.closest?.('[data-sync-environment-toggle]');
        if (environmentToggle) {
            const environmentId = environmentToggle.dataset.syncEnvironmentToggle;
            const details = root.querySelector(`[data-sync-environment-details="${environmentId}"]`);
            if (details) {
                details.hidden = !details.hidden;
                environmentToggle.setAttribute('aria-expanded', String(!details.hidden));
                const count = details.children.length;
                environmentToggle.textContent = `同期先 ${count}件${details.hidden ? '⌄' : '⌃'}`;
            }
            return;
        }
        const addEnvironment = event.target.closest?.('[data-sync-app-add-environment]');
        if (addEnvironment && orchestrator?.enabled) {
            addEnvironment.disabled = true;
            try {
                const result = await orchestrator.addEnvironment(addEnvironment.dataset.syncAppAddEnvironment);
                showJoinCode(root, result, edition, async () => {
                    try { await orchestrator.cancelJoin(result.invitationId); }
                    catch (_) { /* consumed, expired, or already cancelled */ }
                    addEnvironment.disabled = false;
                    await refresh();
                });
            } catch (_) {
                addEnvironment.disabled = false;
                setText(root, '#sync-center-action-status', '別の環境を追加できませんでした。同期状態を確認してください。');
            }
            return;
        }
        const addPort = event.target.closest?.('[data-sync-port-add-environment]');
        if (addPort && orchestrator?.enabled) {
            addPort.disabled = true;
            try {
                await ensureQaAdmission();
                const result = await orchestrator.issuePortAddition();
                showJoinCode(root, result, edition, async () => {
                    try { await orchestrator.cancelPortAddition(result.invitationId); }
                    catch (_) { /* consumed, expired, or already cancelled */ }
                    addPort.disabled = false;
                    await refresh();
                });
            } catch (_) {
                addPort.disabled = false;
                setText(root, '#sync-center-action-status', 'Cruise Portの追加コードを表示できませんでした。同期状態を確認してください。');
            }
            return;
        }
        const button = event.target.closest?.('[data-sync-app-action]');
        await issueAppJoin(button);
    });
    root?.querySelectorAll?.('[data-sync-center-unavailable]').forEach((button) => {
        button.addEventListener('click', () => {
            setText(root, '#sync-center-action-status', 'この操作はまだ利用できません。各Cruiseアプリの設定から操作してください。');
        });
    });

    const closeRecovery = () => {
        recoverySecret?.resolve();
        orchestrator?.discardRecoveryCandidate?.();
        orchestrator?.discardRecoveryRotationCandidate?.();
        if (recoveryCandidate) { recoveryCandidate.textContent = ''; recoveryCandidate.hidden = true; }
        if (recoveryCopy) recoveryCopy.hidden = true;
        if (recoveryCopyStatus) recoveryCopyStatus.textContent = '';
        if (recoveryClose) recoveryClose.hidden = false;
        if (recoveryDialog?.open) recoveryDialog.close();
    };
    const openRecovery = async () => {
        if (!orchestrator?.enabled) return;
        try {
            await ensureQaAdmission();
            recoveryDialog.dataset.syncMode = 'execution';
            recoveryDialog.dataset.syncPhase = 'input';
            recoveryConfirm.dataset.syncAction = 'prepare-recovery';
            if (recoveryTitle) recoveryTitle.textContent = 'Sound Cruise Syncを復旧';
            if (recoveryInput) recoveryInput.hidden = false;
            if (recoveryClose) { recoveryClose.hidden = false; recoveryClose.textContent = '戻る'; }
            recoveryConfirm.textContent = '復旧対象を確認';
            recoverySummary.textContent = '保存してある復旧コードを入力してください。';
            recoveryCandidate.hidden = true;
            recoveryCandidate.textContent = '';
            if (recoveryCopy) recoveryCopy.hidden = true;
            recoveryDialog.showModal();
        } catch (_) {
            setText(root, '#sync-center-action-status', '復旧を開始できませんでした。QA認証と通信状態を確認してください。');
        }
    };
    root?.querySelector?.('#sync-center-recovery-open')?.addEventListener('click', () => openRecovery());
    root?.querySelector?.('#sync-center-account-recovery-open')?.addEventListener('click', () => {
        if (orchestrator?.enabled) recoveryRotateConfirmDialog?.showModal();
    });
    root?.querySelector?.('#sync-center-recovery-rotate-cancel')?.addEventListener('click', () => recoveryRotateConfirmDialog?.close());
    recoveryRotateConfirm?.addEventListener('click', async () => {
        recoveryRotateConfirm.disabled = true;
        try {
            await ensureQaAdmission();
            const turnstileToken = await tokenProvider('sound_cruise_recovery_rotation');
            if (!turnstileToken) throw new Error('verification_required');
            await orchestrator.prepareRecoveryRotation({ turnstileToken });
            recoveryRotateConfirmDialog?.close();
            recoverySecret?.resolve();
            recoveryDialog.dataset.syncMode = 'rotation';
            recoveryDialog.dataset.syncPhase = 'candidate';
            recoveryConfirm.dataset.syncAction = 'commit-recovery-rotation';
            if (recoveryTitle) recoveryTitle.textContent = '新しい復旧コードを保存';
            if (recoveryInput) recoveryInput.hidden = true;
            if (recoveryClose) { recoveryClose.hidden = false; recoveryClose.textContent = 'キャンセル'; }
            recoveryCandidate.textContent = orchestrator.recoveryRotationCandidateCode();
            recoveryCandidate.hidden = false;
            if (recoveryCopy) recoveryCopy.hidden = false;
            recoverySummary.textContent = 'この復旧コードを安全な場所に保存してください。';
            recoveryConfirm.textContent = '保存しました';
            recoveryDialog.showModal();
        } catch (error) {
            setText(root, '#sync-center-action-status', error?.message === 'verification_required'
                ? '人間確認を完了してから続けてください。'
                : '復旧コードを更新できませんでした。同期状態と通信状態を確認してください。');
        } finally {
            recoveryRotateConfirm.disabled = false;
        }
    });
    root?.querySelector?.('#sync-center-recovery-close')?.addEventListener('click', closeRecovery);
    recoveryConfirm?.addEventListener('click', async () => {
        recoveryConfirm.disabled = true;
        const phase = recoveryDialog.dataset.syncPhase;
        try {
            if (phase === 'input') {
                const recoveryCode = recoverySecret?.take();
                if (!recoveryCode) throw new Error('account_recovery_code_required');
                const turnstileToken = await tokenProvider('sound_cruise_account_recovery');
                if (!turnstileToken) throw new Error('verification_required');
                const prepared = await orchestrator.prepareRecovery({ recoveryCode, turnstileToken });
                recoveryDialog.dataset.syncPhase = 'summary';
                recoveryConfirm.dataset.syncAction = 'show-recovery-candidate';
                if (recoveryInput) recoveryInput.hidden = true;
                const memberships = prepared.summary.memberships || [];
                const ready = memberships.filter((item) => item.dataset?.state === 'ready').length;
                const records = memberships.reduce((total, item) => total + Number(item.dataset?.recordCount || 0), 0);
                recoverySummary.textContent = `${memberships.length}アプリ（準備完了${ready}件）、同期データ${records}件、同期中の環境${prepared.summary.activeDeviceCount}件を復旧します。`;
                recoveryConfirm.textContent = '新しい復旧コードを確認';
                recoverySecret.resolve();
                return;
            }
            if (phase === 'summary') {
                recoveryDialog.dataset.syncPhase = 'candidate';
                recoveryConfirm.dataset.syncAction = 'commit-recovery';
                recoveryCandidate.textContent = orchestrator.recoveryCandidateCode();
                recoveryCandidate.hidden = false;
                if (recoveryCopy) recoveryCopy.hidden = false;
                recoverySummary.textContent = '新しい復旧コードを安全な場所へ保存してください。次の操作で復旧が確定します。';
                recoveryConfirm.textContent = '保存しました';
                return;
            }
            if (phase === 'candidate') {
                const rotation = recoveryDialog.dataset.syncMode === 'rotation';
                recoveryCandidate.textContent = '';
                recoveryCandidate.hidden = true;
                if (recoveryCopy) recoveryCopy.hidden = true;
                recoveryDialog.dataset.syncPhase = 'committing';
                if (rotation) await orchestrator.commitRecoveryRotation({ recoverySaved: true });
                else await orchestrator.commitRecovery({ recoverySaved: true });
                recoveryDialog.dataset.syncPhase = 'complete';
                recoverySummary.textContent = rotation
                    ? '復旧コードを更新しました。以前の復旧コードは使えません。'
                    : 'Sound Cruise Syncを復旧しました。旧環境の同期資格情報は無効です。';
                recoveryConfirm.dataset.syncAction = 'close';
                recoveryConfirm.textContent = '閉じる';
                if (recoveryClose) recoveryClose.hidden = true;
                try { await refresh(); } catch (_) {}
                return;
            }
            closeRecovery();
        } catch (error) {
            recoverySecret?.reject(error);
            if (phase === 'candidate' && recoveryDialog.dataset.syncMode === 'rotation') {
                recoveryDialog.dataset.syncPhase = 'candidate';
                recoveryConfirm.dataset.syncAction = 'commit-recovery-rotation';
                recoveryConfirm.textContent = 'もう一度試す';
                recoveryCandidate.textContent = orchestrator.recoveryRotationCandidateCode();
                recoveryCandidate.hidden = false;
                if (recoveryCopy) recoveryCopy.hidden = false;
                recoverySummary.textContent = '更新結果を確認できませんでした。保存済みの同じコードで安全に再確認します。';
            } else {
                recoveryCandidate.textContent = '';
                recoveryCandidate.hidden = true;
                if (recoveryCopy) recoveryCopy.hidden = true;
            }
            setText(root, '#sync-center-action-status', error?.message === 'verification_required'
                ? '人間確認を完了してから続けてください。'
                : recoveryDialog.dataset.syncMode === 'rotation'
                    ? '復旧コードの更新結果を確認できませんでした。同じ操作でもう一度確認してください。'
                    : '復旧を完了できませんでした。入力内容と通信状態を確認してください。');
        } finally {
            recoveryConfirm.disabled = false;
        }
    });

    const openLifecycle = (action) => {
        lifecycleAction = action;
        lifecycleDialog.dataset.syncPhase = 'review';
        lifecycleConfirm.dataset.syncAction = action.kind === 'delete'
            ? 'issue-delete-intent' : action.kind === 'detach' ? 'detach-app'
                : action.kind === 'current-environment' ? 'detach-current-environment' : 'revoke-environment';
        lifecycleConfirm.textContent = action.kind === 'delete' ? '削除内容を確認' : '同期を解除';
        if (lifecycleDeleteNote) lifecycleDeleteNote.hidden = action.kind !== 'delete';
        if (lifecycleTitle) lifecycleTitle.textContent = action.title || '操作内容を確認';
        lifecycleSummary.textContent = action.summary;
        lifecycleDialog.showModal();
    };
    root?.addEventListener?.('click', (event) => {
        const appEnvironment = event.target.closest?.('[data-sync-app-environment-revoke]');
        if (appEnvironment) {
            openLifecycle({
                kind: 'app-environment',
                appId: appEnvironment.dataset.syncAppEnvironmentApp,
                appDeviceId: appEnvironment.dataset.syncAppEnvironmentRevoke,
                title: 'この環境の同期を解除',
                summary: 'この環境の同期を解除しますか？クラウド上と端末内のデータ、ほかの環境は削除されません。'
            });
            return;
        }
        const environment = event.target.closest?.('[data-sync-environment-revoke]');
        if (environment) {
            if (environment.dataset.syncCurrentEnvironmentDetach === 'true') {
                const lastPort = environment.dataset.syncCurrentEnvironmentLastPort === 'true';
                openLifecycle({
                    kind: 'current-environment',
                    title: 'この環境の接続を解除',
                    summary: lastPort
                        ? 'この環境が最後のCruise Portです。接続を解除した後、このアカウントへ再び接続するには保存済みの復旧コードが必要です。クラウド上と端末内のデータは削除されません。'
                        : 'このCruise Portと、この環境で接続しているアプリをアカウントから解除します。クラウド上と端末内のデータは削除されません。他の環境はそのまま利用できます。'
                });
                return;
            }
            openLifecycle({
                kind: 'environment', accountDeviceId: environment.dataset.syncEnvironmentRevoke,
                summary: environment.dataset.syncEnvironmentCurrent === 'true'
                    ? 'この環境の同期を解除します。解除後、このCruise Portは未接続になります。クラウドと端末内のデータは削除されません。'
                    : '選択した環境の同期を解除します。他の環境とクラウドデータは維持されます。'
            });
            return;
        }
        const appDetach = event.target.closest?.('[data-sync-app-detach]');
        if (appDetach) {
            const appName = appDetach.dataset.syncAppName || 'このアプリ';
            openLifecycle({
                kind: 'detach', appId: appDetach.dataset.syncAppDetach,
                title: `${appName}の同期を解除`,
                summary: `${appName}のクラウド同期接続だけを解除します。クラウド上と端末内のデータは削除されません。解除後は同期コードからいつでも再接続できます。`
            });
            return;
        }
        const appDelete = event.target.closest?.('[data-sync-app-delete]');
        if (appDelete) {
            const appName = appDelete.dataset.syncAppName || 'このアプリ';
            openLifecycle({
                kind: 'delete', scope: 'app', appId: appDelete.dataset.syncAppDelete,
                title: `${appName}の同期データを削除`,
                summary: `${appName}のクラウド上の同期データを削除対象にします。端末内のデータは削除されません。削除を確定すると、7日後に完全削除の対象になります。他の3アプリとSound Cruise Syncアカウントは維持されます。`
            });
        }
    });
    root?.querySelector?.('[data-sync-app-delete-toggle]')?.addEventListener('click', (event) => {
        const details = root.querySelector('#sync-center-app-delete-actions');
        if (!details) return;
        details.hidden = !details.hidden;
        event.currentTarget.setAttribute('aria-expanded', String(!details.hidden));
        event.currentTarget.textContent = details.hidden ? 'アプリ単位で削除⌄' : 'アプリ単位で削除を閉じる⌃';
    });
    root?.querySelector?.('#sync-center-account-delete')?.addEventListener('click', () => {
        openLifecycle({
            kind: 'delete', scope: 'account', appId: null,
            title: 'Sound Cruise Syncアカウントを削除',
            summary: '4つのアプリすべてのクラウド同期データと、Sound Cruise Syncの接続情報を削除対象にします。端末内のデータは削除されません。削除を確定すると同期中の環境は解除され、クラウドデータは7日後に完全削除の対象になります。'
        });
    });
    root?.querySelector?.('#sync-center-lifecycle-close')?.addEventListener('click', () => {
        orchestrator?.discardDeleteCandidate?.();
        lifecycleAction = null;
        lifecycleDialog.close();
    });
    lifecycleConfirm?.addEventListener('click', async () => {
        if (!lifecycleAction || !orchestrator?.enabled) return;
        lifecycleConfirm.disabled = true;
        try {
            await ensureQaAdmission();
            if (lifecycleAction.kind === 'environment') {
                await orchestrator.revokeEnvironment(lifecycleAction.accountDeviceId);
                lifecycleDialog.close();
                lifecycleAction = null;
                await refresh();
                return;
            }
            if (lifecycleAction.kind === 'app-environment') {
                await orchestrator.revokeAppEnvironment(
                    lifecycleAction.appId, lifecycleAction.appDeviceId
                );
                lifecycleDialog.close();
                lifecycleAction = null;
                await refresh();
                return;
            }
            if (lifecycleAction.kind === 'current-environment') {
                await orchestrator.detachCurrentEnvironment();
                lifecycleDialog.close();
                lifecycleAction = null;
                await refresh();
                return;
            }
            if (lifecycleAction.kind === 'detach') {
                await orchestrator.detachApp(lifecycleAction.appId);
                lifecycleDialog.close();
                lifecycleAction = null;
                await refresh();
                return;
            }
            if (lifecycleDialog.dataset.syncPhase === 'review') {
                await orchestrator.issueDelete(lifecycleAction.scope, lifecycleAction.appId);
                lifecycleDialog.dataset.syncPhase = 'confirm';
                lifecycleConfirm.dataset.syncAction = 'commit-delete';
                lifecycleConfirm.textContent = '削除を確定';
                lifecycleSummary.textContent += ' この操作を確定すると復旧コードでは取り消せません。';
                return;
            }
            await orchestrator.commitDelete(lifecycleAction.scope, lifecycleAction.appId);
            lifecycleDialog.close();
            lifecycleAction = null;
            await refresh();
        } catch (_) {
            setText(root, '#sync-center-action-status', '操作を完了できませんでした。状態を更新してもう一度お試しください。');
        } finally {
            lifecycleConfirm.disabled = false;
        }
    });
    return Object.freeze({ ensureQaAdmission, onAppAction: issueAppJoin });
}

export const bindSyncCenterUnavailableActions = bindSyncCenterActions;
