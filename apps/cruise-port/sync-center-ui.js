import { CRUISE_APP_ICONS, resolveCruiseAppHref } from './cruise-app-links.js?v=0.27.0';
import { SYNC_CENTER_APPS } from './sync-center-controller.js?v=0.39.1';

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

function renderAddEnvironmentRows(root, presentation, edition, orchestrationEnabled) {
    const list = root.querySelector('#sync-center-add-environments');
    if (!list) return;
    const activeAccount = presentation.accountState === 'active';
    const entries = [
        {
            id: 'port', name: 'Cruise Port',
            icon: `/apps/cruise-port/assets/app-icons/${edition === 'pro' ? 'pro' : 'standard'}/icon-192.png`,
            available: activeAccount,
            detail: activeAccount ? '別の端末やブラウザを追加' : 'アカウント作成後に利用できます'
        },
        ...presentation.apps.map((app) => ({
            ...app,
            icon: CRUISE_APP_ICONS[app.id][edition === 'pro' ? 'pro' : 'standard'],
            available: activeAccount && app.canAddEnvironment,
            detail: app.canAddEnvironment ? '別の端末やブラウザを追加' : app.statusLabel
        }))
    ];
    const rows = entries.map((entry) => {
        const row = document.createElement('li');
        row.className = 'sync-center-app';
        const image = document.createElement('img');
        image.src = entry.icon;
        image.alt = '';
        image.width = 48;
        image.height = 48;
        const copy = document.createElement('div');
        copy.className = 'sync-center-app-copy';
        const name = document.createElement('strong');
        name.textContent = entry.name;
        const detail = document.createElement('span');
        detail.textContent = entry.detail;
        copy.append(name, detail);
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'sync-center-app-action secondary';
        action.textContent = '追加コード';
        action.disabled = !orchestrationEnabled || !entry.available;
        action.setAttribute('aria-label', `${entry.name}の追加コードを表示`);
        if (entry.id === 'port') action.dataset.syncPortAddEnvironment = 'true';
        else action.dataset.syncAppAddEnvironment = entry.id;
        row.append(image, copy, action);
        return row;
    });
    list.replaceChildren(...rows);
}

function renderEnvironments(root, presentation) {
    const list = root.querySelector('#sync-center-environments');
    if (!list) return;
    const activePortCount = presentation.environments.filter((environment) =>
        environment.state === 'active' && environment.isPortEnvironment).length;
    const rows = presentation.environments.length
        ? presentation.environments.map((environment) => {
            const item = document.createElement('li');
            const copy = document.createElement('span');
            const related = environment.relatedApps.length
                ? `・${environment.relatedApps.map((appId) => ({ chord: 'コード', pitch: '音感', fretboard: '指板', rhythm: 'リズム' })[appId]).join(' / ')}`
                : '';
            copy.textContent = `${environment.label}${environment.isCurrent ? '（この環境）' : ''}・${environment.state === 'active' ? '接続中' : '解除済み'}${related}`;
            const metadata = document.createElement('small');
            const created = environment.createdAt == null ? '不明' : new Date(environment.createdAt).toLocaleString('ja-JP');
            const lastSeen = environment.lastSeenAt == null ? '不明' : new Date(environment.lastSeenAt).toLocaleString('ja-JP');
            metadata.textContent = `作成 ${created}・最終利用 ${lastSeen}`;
            copy.append(metadata);
            item.append(copy);
            if (environment.state === 'active' && environment.id) {
                const revoke = document.createElement('button');
                revoke.type = 'button';
                revoke.className = 'action-button secondary-action';
                revoke.dataset.syncEnvironmentRevoke = environment.id;
                revoke.dataset.syncEnvironmentCurrent = environment.isCurrent ? 'true' : 'false';
                if (environment.isCurrent && environment.isPortEnvironment) {
                    revoke.dataset.syncCurrentEnvironmentDetach = 'true';
                    revoke.dataset.syncCurrentEnvironmentLastPort = String(activePortCount === 1);
                    revoke.textContent = 'この環境の接続を解除';
                } else revoke.textContent = environment.isCurrent ? 'この環境の同期を解除' : '同期を解除';
                item.append(revoke);
            }
            return item;
        })
        : [Object.assign(document.createElement('li'), { textContent: '同期中の環境情報はありません。' })];
    list.replaceChildren(...rows);
}

function renderDangerActions(root, presentation) {
    const accountDelete = root.querySelector('#sync-center-account-delete');
    if (accountDelete) accountDelete.disabled = presentation.accountState !== 'active';
    root.querySelectorAll('[data-sync-app-delete]').forEach((button) => {
        const app = presentation.apps.find((item) => item.id === button.dataset.syncAppDelete);
        button.disabled = presentation.accountState !== 'active' ||
            !app || ['unset', 'prepared', 'deleting'].includes(app.status);
    });
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
    const isAdditionalEnvironment = result.kind === 'add_environment' || isPortAddition;
    title.textContent = isPortAddition ? '別のCruise Portを追加'
        : isAdditionalEnvironment ? '別の環境を追加' : 'このアプリを接続';
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
        isAdditionalEnvironment ? '追加したいブラウザやPWAで対象のProアプリを開く' : '普段使っているProアプリを開く',
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
    close.textContent = '接続をやめる';
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
    keepOpen.className = 'sync-center-join-note';
    keepOpen.textContent = '接続が完了するまでこの画面を開いたままにしてください。';
    panel.append(header, intro, steps, codeLabel, code, actions, expires, keepOpen, copyStatus);
    dialog.append(panel);
    root.append(dialog);
    dialog.showModal();
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
    const currentEnvironmentDetach = root.querySelector('#sync-center-current-environment-detach');
    const accountState = presentation.accountState;
    const accountDisplayId = root.querySelector('#sync-center-account-display-id');
    if (accountStatus) {
        accountStatus.textContent = accountState === 'unset' ? '未作成' :
            accountState === 'active' ? '作成済み' : accountState === 'deleting' ? '削除中' : '確認が必要';
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
    if (currentEnvironmentDetach) {
        const activePortCount = presentation.environments.filter((environment) =>
            environment.state === 'active' && environment.isPortEnvironment).length;
        const currentPort = presentation.environments.some((environment) =>
            environment.isCurrent && environment.isPortEnvironment && environment.state === 'active');
        currentEnvironmentDetach.hidden = accountState !== 'active' || !currentPort;
        currentEnvironmentDetach.dataset.syncCurrentEnvironmentLastPort = String(currentPort && activePortCount === 1);
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
    renderAddEnvironmentRows(root, presentation, edition, orchestrationEnabled);
    renderEnvironments(root, presentation);
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

export function bindSyncCenterActions(root, { orchestrator = null, refresh = async () => {}, tokenProvider = async () => null, edition = 'standard' } = {}) {
    bindSectionHelp(root);
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
    const portConnectInput = root?.querySelector?.('#sync-center-port-connect-input');
    const portConnectConfirm = root?.querySelector?.('#sync-center-port-connect-confirm');
    const portConnectCancel = root?.querySelector?.('#sync-center-port-connect-cancel');
    const portConnectStatus = root?.querySelector?.('#sync-center-port-connect-status');
    const portConnectSecret = portConnectInput && globalThis.SoundCruiseSyncAccount?.core
        ?.createSensitiveInputController?.(portConnectInput);
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
        if (setupTitle) setupTitle.textContent = phase === 'recovery'
            ? '復旧コードを保存' : phase === 'complete' ? 'アカウント作成が完了しました' : 'クラウド同期をはじめる';
        if (setupClose) setupClose.hidden = phase === 'complete';
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
        if (portConnectStatus) portConnectStatus.textContent = '';
        portConnectDialog?.showModal();
        portConnectInput?.focus();
    });
    portConnectCancel?.addEventListener('click', () => {
        portConnectSecret?.resolve();
        if (portConnectStatus) portConnectStatus.textContent = '';
        portConnectDialog?.close();
    });
    portConnectConfirm?.addEventListener('click', async () => {
        if (!orchestrator?.enabled) return;
        portConnectConfirm.disabled = true;
        try {
            const joinCode = portConnectSecret?.take();
            if (!joinCode) throw new Error('port_join_code_required');
            await orchestrator.connectExistingAccount(joinCode);
            portConnectSecret.resolve();
            if (portConnectStatus) portConnectStatus.textContent = '';
            portConnectDialog.close();
            setText(root, '#sync-center-action-status', '既存のアカウントに接続しました。');
            await refresh();
        } catch (error) {
            portConnectSecret?.reject(error);
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
                await refresh();
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
            await refresh();
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
        try {
            const result = await orchestrator.launch(button.dataset.syncAppAction);
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
            setText(root, '#sync-center-action-status', '同期コードを表示できませんでした。同期状態を確認してください。');
        }
    };
    root?.addEventListener?.('click', async (event) => {
        const environmentToggle = event.target.closest?.('[data-sync-environments-toggle]');
        if (environmentToggle) {
            const details = root.querySelector('#sync-center-environments-details');
            if (details) {
                details.hidden = !details.hidden;
                environmentToggle.setAttribute('aria-expanded', String(!details.hidden));
                environmentToggle.textContent = details.hidden ? '詳細⌄' : '詳細を閉じる⌃';
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
                await refresh();
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
    root?.querySelector?.('#sync-center-current-environment-detach')?.addEventListener('click', () => {
        const button = root.querySelector('#sync-center-current-environment-detach');
        const lastPort = button?.dataset?.syncCurrentEnvironmentLastPort === 'true';
        openLifecycle({
            kind: 'current-environment',
            title: 'この環境の接続を解除',
            summary: lastPort
                ? 'この環境が最後のCruise Portです。接続を解除した後、このアカウントへ再び接続するには保存済みの復旧コードが必要です。クラウド上と端末内のデータは削除されません。'
                : 'このCruise Portと、この環境で接続しているアプリをアカウントから解除します。クラウド上と端末内のデータは削除されません。他の環境はそのまま利用できます。'
        });
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
