import { CRUISE_APP_ICONS, resolveCruiseAppHref } from './cruise-app-links.js?v=0.27.0';

const TEMPORARY_FEEDBACK_MS = globalThis.SoundCruiseSyncUI?.temporaryFeedbackMs || 5000;

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
        const actions = document.createElement('div');
        actions.className = 'sync-center-app-row-actions';
        const action = document.createElement(orchestrationEnabled ? 'button' : 'a');
        action.className = 'sync-center-app-action';
        if (!orchestrationEnabled) action.href = resolveCruiseAppHref(app.id, edition);
        else {
            action.type = 'button';
            action.dataset.syncAppAction = app.id;
        }
        action.textContent = app.action === 'setup' ? '接続する' : 'アプリを開く';
        action.setAttribute('aria-label', `${app.name}を${app.action === 'setup' ? '接続する' : '開く'}（${app.statusLabel}）`);
        if (app.action === 'none') {
            action.removeAttribute('href');
            action.setAttribute('aria-disabled', 'true');
        }
        actions.append(action);
        if (edition === 'pro' && orchestrationEnabled && app.canAddEnvironment) {
            const addEnvironment = document.createElement('button');
            addEnvironment.type = 'button';
            addEnvironment.className = 'sync-center-app-action secondary';
            addEnvironment.dataset.syncAppAddEnvironment = app.id;
            addEnvironment.textContent = '別の環境を追加';
            addEnvironment.setAttribute('aria-label', `${app.name}で別の環境を追加する`);
            actions.append(addEnvironment);
        }
        row.append(image, copy, actions);
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
                revoke.textContent = environment.isCurrent ? 'この環境の同期を解除' : '同期を解除';
                item.append(revoke);
            }
            return item;
        })
        : [Object.assign(document.createElement('li'), { textContent: '同期中の環境情報はありません。' })];
    list.replaceChildren(...rows);
}

function renderDangerActions(root, presentation) {
    const actions = root.querySelector('#sync-center-app-delete-actions');
    if (!actions) return;
    const buttons = presentation.apps
        .filter((app) => !['unset', 'prepared', 'deleting'].includes(app.status))
        .map((app) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'action-button danger-action';
            button.dataset.syncAppDelete = app.id;
            button.textContent = `${app.name}のクラウドデータを削除`;
            return button;
        });
    actions.replaceChildren(...buttons);
    const accountDelete = root.querySelector('#sync-center-account-delete');
    if (accountDelete) accountDelete.disabled = presentation.accountState !== 'active';
}

function showJoinCode(root, result, onClose = async () => {}) {
    const dialog = document.createElement('dialog');
    dialog.className = 'sync-center-help-dialog';
    dialog.dataset.syncJoinInvitation = result.invitationId;
    const panel = document.createElement('div');
    panel.className = 'sync-center-join-panel';
    const title = document.createElement('h2');
    title.textContent = result.kind === 'add_environment' ? '別の環境を追加' : '既存データを接続';
    const note = document.createElement('p');
    note.textContent = result.kind === 'add_environment'
        ? '別のブラウザやホーム画面版でも同じクラウドデータを使うためのコードです。5分以内に対象アプリの「Cruise Portと接続」へ入力してください。保存する必要はありません。接続が完了するまでこの画面を開いたままにしてください。「コードを取り消す」を押すと、このコードは使えなくなります。'
        : 'このコードを5分以内に対象アプリの「Cruise Portと接続」へ入力してください。保存する必要はありません。接続が完了するまでこの画面を開いたままにしてください。「コードを取り消す」を押すと、このコードは使えなくなります。';
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
            copyStatus.textContent = 'コピーできませんでした。コードを選択して保存してください。';
        } finally {
            copy.disabled = false;
            copy.removeAttribute('aria-busy');
            if (copyStatusTimer) globalThis.clearTimeout(copyStatusTimer);
            copyStatusTimer = globalThis.setTimeout(() => { copyStatus.textContent = ''; }, TEMPORARY_FEEDBACK_MS);
        }
    });
    const open = document.createElement('a');
    open.href = result.appUrl;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.className = 'action-button secondary-action';
    open.textContent = '対象アプリを開く';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'action-button secondary-action';
    close.textContent = 'コードを取り消す';
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        code.textContent = '';
        dialog.remove();
        Promise.resolve(onClose()).catch(() => {});
    }, { once: true });
    const actions = document.createElement('div');
    actions.className = 'sync-center-join-actions';
    actions.append(copy, open, close);
    panel.append(title, note, code, actions, copyStatus);
    dialog.append(panel);
    root.append(dialog);
    dialog.showModal();
}

export function renderSyncCenter(root, presentation, { edition = 'standard', orchestrationEnabled = false } = {}) {
    if (!root || !presentation || presentation.kind === 'disabled') return;
    root.dataset.syncState = presentation.kind;
    setText(root, '#sync-center-account-label', presentation.accountLabel);
    setText(root, '#sync-center-account-description', presentation.accountDescription);
    setText(root, '#sync-center-progress', `${presentation.readyCount} / ${presentation.totalCount} アプリの同期設定が完了`);
    const alert = root.querySelector('#sync-center-alert');
    if (alert) {
        alert.hidden = !['error', 'offline'].includes(presentation.kind);
        alert.textContent = presentation.kind === 'offline'
            ? 'オフラインのため同期情報を更新できません。各アプリとCruise Portはそのまま利用できます。'
            : presentation.kind === 'error' ? '同期情報を確認できません。時間をおいて再読み込みしてください。' : '';
    }
    renderAppRows(root, presentation, edition, orchestrationEnabled);
    renderEnvironments(root, presentation);
    renderDangerActions(root, presentation);
}

export function bindSyncCenterActions(root, { orchestrator = null, refresh = async () => {}, tokenProvider = async () => null } = {}) {
    const setup = root?.querySelector?.('#sync-center-setup');
    const confirm = root?.querySelector?.('#sync-center-setup-confirm');
    const recovery = root?.querySelector?.('#sync-center-recovery-code');
    const summary = root?.querySelector?.('#sync-center-setup-summary');
    const setupIntro = root?.querySelector?.('#sync-center-setup-intro');
    const setupSteps = root?.querySelector?.('#sync-center-setup-steps');
    const setupPlan = root?.querySelector?.('#sync-center-setup-plan');
    const recoveryDialog = root?.querySelector?.('#sync-center-recovery');
    const recoveryInput = root?.querySelector?.('#sync-center-recovery-input');
    const recoverySummary = root?.querySelector?.('#sync-center-recovery-summary');
    const recoveryCandidate = root?.querySelector?.('#sync-center-recovery-candidate');
    const recoveryConfirm = root?.querySelector?.('#sync-center-recovery-confirm');
    const setupCopy = root?.querySelector?.('#sync-center-setup-copy');
    const setupCopyStatus = root?.querySelector?.('#sync-center-setup-copy-status');
    const recoveryCopy = root?.querySelector?.('#sync-center-recovery-copy');
    const recoveryCopyStatus = root?.querySelector?.('#sync-center-recovery-copy-status');
    const recoverySecret = recoveryInput && globalThis.SoundCruiseSyncAccount?.core
        ?.createSensitiveInputController?.(recoveryInput);
    const lifecycleDialog = root?.querySelector?.('#sync-center-lifecycle-confirm');
    const lifecycleSummary = root?.querySelector?.('#sync-center-lifecycle-summary');
    const lifecycleConfirm = root?.querySelector?.('#sync-center-lifecycle-submit');
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
    setupCopy?.addEventListener('click', () => copySensitiveOutput(setupCopy, setupCopyStatus, recovery?.textContent || ''));
    recoveryCopy?.addEventListener('click', () => copySensitiveOutput(recoveryCopy, recoveryCopyStatus, recoveryCandidate?.textContent || ''));
    const setPhase = (phase) => {
        setup.dataset.syncPhase = phase;
        const introduction = phase === 'introduction';
        if (setupIntro) setupIntro.hidden = !introduction;
        if (setupSteps) setupSteps.hidden = !introduction;
        if (setupPlan) setupPlan.hidden = !introduction;
        if (summary) summary.hidden = introduction;
        if (confirm) confirm.dataset.syncAction = ['recovery', 'start-uncertain'].includes(phase)
            ? 'confirm-recovery-saved' : phase === 'membership-retry' ? 'retry-memberships' : 'create-account';
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
    root?.querySelector?.('#sync-center-setup-open')?.addEventListener('click', () => {
        setPhase('introduction');
        if (recovery) { recovery.hidden = true; recovery.textContent = ''; }
        if (setupCopy) setupCopy.hidden = true;
        if (setupCopyStatus) setupCopyStatus.textContent = '';
        if (confirm) confirm.textContent = '復旧コードを確認';
        setup.showModal();
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
                if (summary) summary.textContent = '準備ができました。各アプリを開いて初回同期を完了してください。';
                confirm.textContent = '閉じる';
                await refresh();
                return;
            }
            if (!['recovery', 'start-uncertain'].includes(setup.dataset.syncPhase)) {
                const candidate = orchestrator.createAccountCandidate();
                setPhase('recovery');
                recovery.hidden = false;
                recovery.textContent = candidate.recoveryCode;
                if (setupCopy) setupCopy.hidden = false;
                if (summary) summary.textContent = '復旧コードを安全な場所へ保存してください。保存確認後にAccountを作成します。';
                confirm.textContent = '保存しました';
                return;
            }
            const turnstileToken = await tokenProvider('sound_cruise_account_start');
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
            if (summary) summary.textContent = '準備ができました。各アプリを開いて初回同期を完了してください。';
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
    root?.addEventListener?.('click', async (event) => {
        const addEnvironment = event.target.closest?.('[data-sync-app-add-environment]');
        if (addEnvironment && orchestrator?.enabled) {
            addEnvironment.disabled = true;
            try {
                const result = await orchestrator.addEnvironment(addEnvironment.dataset.syncAppAddEnvironment);
                showJoinCode(root, result, async () => {
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

    const closeRecovery = () => {
        recoverySecret?.resolve();
        orchestrator?.discardRecoveryCandidate?.();
        if (recoveryCandidate) { recoveryCandidate.textContent = ''; recoveryCandidate.hidden = true; }
        if (recoveryCopy) recoveryCopy.hidden = true;
        if (recoveryCopyStatus) recoveryCopyStatus.textContent = '';
        if (recoveryDialog?.open) recoveryDialog.close();
    };
    root?.querySelector?.('#sync-center-recovery-open')?.addEventListener('click', async () => {
        if (!orchestrator?.enabled) return;
        try {
            await ensureQaAdmission();
            recoveryDialog.dataset.syncPhase = 'input';
            recoveryConfirm.dataset.syncAction = 'prepare-recovery';
            recoveryConfirm.textContent = '復旧対象を確認';
            recoverySummary.textContent = '保存済みのAccount Recovery Codeを入力してください。';
            recoveryCandidate.hidden = true;
            recoveryCandidate.textContent = '';
            if (recoveryCopy) recoveryCopy.hidden = true;
            recoveryDialog.showModal();
        } catch (_) {
            setText(root, '#sync-center-action-status', '復旧を開始できませんでした。QA認証と通信状態を確認してください。');
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
                recoveryCandidate.textContent = '';
                recoveryCandidate.hidden = true;
                if (recoveryCopy) recoveryCopy.hidden = true;
                recoveryDialog.dataset.syncPhase = 'committing';
                await orchestrator.commitRecovery({ recoverySaved: true });
                recoveryDialog.dataset.syncPhase = 'complete';
                recoverySummary.textContent = 'Sound Cruise Syncを復旧しました。旧環境の同期資格情報は無効です。';
                recoveryConfirm.dataset.syncAction = 'close';
                recoveryConfirm.textContent = '閉じる';
                await refresh();
                return;
            }
            closeRecovery();
        } catch (error) {
            recoverySecret?.reject(error);
            recoveryCandidate.textContent = '';
            recoveryCandidate.hidden = true;
            if (recoveryCopy) recoveryCopy.hidden = true;
            setText(root, '#sync-center-action-status', error?.message === 'verification_required'
                ? '人間確認を完了してから続けてください。'
                : '復旧を完了できませんでした。入力内容と通信状態を確認してください。');
        } finally {
            recoveryConfirm.disabled = false;
        }
    });

    const openLifecycle = (action) => {
        lifecycleAction = action;
        lifecycleDialog.dataset.syncPhase = 'review';
        lifecycleConfirm.dataset.syncAction = action.kind === 'environment' ? 'revoke-environment' : 'issue-delete-intent';
        lifecycleConfirm.textContent = action.kind === 'environment' ? '同期を解除' : '削除内容を確認';
        lifecycleSummary.textContent = action.summary;
        lifecycleDialog.showModal();
    };
    root?.addEventListener?.('click', (event) => {
        const environment = event.target.closest?.('[data-sync-environment-revoke]');
        if (environment) {
            openLifecycle({
                kind: 'environment', accountDeviceId: environment.dataset.syncEnvironmentRevoke,
                summary: environment.dataset.syncEnvironmentCurrent === 'true'
                    ? 'この環境の同期を解除します。解除後、このCruise Portは未接続になります。クラウドと端末内のデータは削除されません。'
                    : '選択した環境の同期を解除します。他の環境とクラウドデータは維持されます。'
            });
            return;
        }
        const appDelete = event.target.closest?.('[data-sync-app-delete]');
        if (appDelete) {
            openLifecycle({
                kind: 'delete', scope: 'app', appId: appDelete.dataset.syncAppDelete,
                summary: 'このアプリのクラウド同期データを削除対象にします。他の3アプリとSound Cruise Sync Accountは維持されます。'
            });
        }
    });
    root?.querySelector?.('#sync-center-account-delete')?.addEventListener('click', () => {
        openLifecycle({
            kind: 'delete', scope: 'account', appId: null,
            summary: '4アプリすべてのクラウド同期データとSound Cruise Sync Accountが削除対象になります。'
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
    return Object.freeze({ ensureQaAdmission });
}

export const bindSyncCenterUnavailableActions = bindSyncCenterActions;
