import { USER_LABEL_MAX, normalizeUserLabel, userLabelLength } from './sync-target-name.js?v=0.65.0';

// The rename dialog for one sync target (N1). It changes only the display name. It is online-only:
// nothing is queued, and a failure leaves the dialog open with the user's text intact.

export const RENAME_COPY = Object.freeze({
    title: '同期先の名前を変更',
    label: '名前',
    hint: '端末やブラウザを見分けやすい名前を付けられます（例：iPhoneホーム、Mac Safari）。空欄で保存すると登録時の名前に戻ります。',
    save: '保存',
    saving: '保存中…',
    cancel: 'キャンセル',
    reset: '登録時の名前に戻す',
    offline: 'オフラインのため保存できません。インターネット接続後にもう一度お試しください。',
    tooLong: `${USER_LABEL_MAX}文字以内で入力してください。`,
    characters: '改行や制御文字など、名前に使えない文字が含まれています。',
    notFound: 'この同期先は見つかりませんでした。画面を更新してから、もう一度お試しください。',
    unavailable: 'この同期先は解除済みのため、名前を変更できません。',
    paused: '現在、名前を変更できません。時間をおいてもう一度お試しください。',
    failed: '名前を変更できませんでした。もう一度お試しください。'
});

export function renameErrorMessage(error) {
    const code = error?.code;
    if (code === 'network_error' || code === 'account_request_timeout') return RENAME_COPY.offline;
    if (error?.status === 404) return RENAME_COPY.notFound;
    if (code === 'device_rename_unavailable') return RENAME_COPY.unavailable;
    if (error?.status === 423) return RENAME_COPY.paused;
    if (error?.status === 400 || error?.message === 'sync_target_name_invalid') return RENAME_COPY.characters;
    return RENAME_COPY.failed;
}

export function renameTargetFromDataset(dataset) {
    return Object.freeze({
        kind: dataset.syncTargetRename === 'account' ? 'account' : 'app',
        id: dataset.syncTargetId || '',
        appId: dataset.syncTargetApp || null,
        context: dataset.syncTargetContext || '',
        userLabel: dataset.syncTargetUserLabel || null,
        registeredLabel: dataset.syncTargetRegisteredLabel || null,
        shortId: dataset.syncTargetShortId || null
    });
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

// save(userLabel | null) performs the request; onSaved() refreshes Sync Center.
export function openSyncTargetRenameDialog(root, target, {
    save,
    onSaved = async () => {},
    isOnline = () => globalThis.navigator?.onLine !== false,
    restoreFocus = () => {}
}) {
    const uid = `sync-target-rename-${Math.random().toString(36).slice(2, 10)}`;
    const dialog = element('dialog', 'sync-center-help-dialog sync-center-rename-dialog');
    dialog.setAttribute('aria-labelledby', `${uid}-title`);
    const form = element('form', 'sync-center-rename-form');
    form.noValidate = true;
    const title = element('h2', '', RENAME_COPY.title);
    title.id = `${uid}-title`;
    const context = element('p', 'sync-center-rename-context',
        [target.context, target.shortId ? `同期先 ${target.shortId}` : null].filter(Boolean).join('・'));
    form.append(title, context);
    if (target.registeredLabel) {
        form.append(element('p', 'sync-center-rename-context', `登録時の名前：${target.registeredLabel}`));
    }
    const label = element('label', 'sync-center-rename-label', RENAME_COPY.label);
    label.htmlFor = `${uid}-input`;
    const input = element('input', 'sync-center-rename-input');
    input.type = 'text';
    input.id = `${uid}-input`;
    input.name = 'userLabel';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('enterkeyhint', 'done');
    input.value = target.userLabel || '';
    const hint = element('p', 'sync-center-rename-hint', RENAME_COPY.hint);
    hint.id = `${uid}-hint`;
    const counter = element('p', 'sync-center-rename-counter');
    counter.id = `${uid}-counter`;
    const error = element('p', 'sync-center-rename-error');
    error.id = `${uid}-error`;
    error.setAttribute('role', 'alert');
    error.hidden = true;
    input.setAttribute('aria-describedby', `${hint.id} ${counter.id} ${error.id}`);
    const submit = element('button', 'action-button primary-action', RENAME_COPY.save);
    submit.type = 'submit';
    const reset = target.userLabel ? element('button', 'action-button secondary-action', RENAME_COPY.reset) : null;
    if (reset) reset.type = 'button';
    const cancel = element('button', 'action-button secondary-action', RENAME_COPY.cancel);
    cancel.type = 'button';
    const actions = element('div', 'sync-center-rename-actions');
    actions.append(...[submit, reset, cancel].filter(Boolean));
    form.append(label, input, hint, counter, error, actions);
    dialog.append(form);

    let saving = false;
    let finished = false;
    // One idempotent exit for save, キャンセル and Escape, so the dialog never lingers in the DOM
    // waiting for the asynchronous close event.
    const finish = (reason) => {
        if (finished) return false;
        finished = true;
        if (dialog.open) dialog.close(reason);
        dialog.remove();
        return true;
    };
    const showError = (message) => {
        error.textContent = message || '';
        error.hidden = !message;
        input.setAttribute('aria-invalid', message ? 'true' : 'false');
    };
    const validate = () => {
        const length = userLabelLength(input.value);
        counter.textContent = `${length}/${USER_LABEL_MAX}`;
        const result = normalizeUserLabel(input.value);
        const message = result.ok ? '' : result.reason === 'length' ? RENAME_COPY.tooLong : RENAME_COPY.characters;
        showError(message);
        submit.disabled = saving || !result.ok;
        return result;
    };
    const setSaving = (value) => {
        saving = value;
        submit.textContent = value ? RENAME_COPY.saving : RENAME_COPY.save;
        submit.setAttribute('aria-busy', String(value));
        input.readOnly = value;
        for (const button of [reset, cancel]) if (button) button.disabled = value;
        submit.disabled = value;
    };
    const commit = async (userLabel) => {
        if (saving || finished) return;
        if (!isOnline()) {
            showError(RENAME_COPY.offline);
            return;
        }
        setSaving(true);
        try {
            await save(userLabel);
        } catch (failure) {
            setSaving(false);
            submit.disabled = !normalizeUserLabel(input.value).ok;
            showError(renameErrorMessage(failure));
            input.focus();
            return;
        }
        finish('saved');
        try { await onSaved(); } catch (_) { /* the name is saved; the next refresh shows it */ }
        // Focus moves only after the refresh has replaced the rows, so it lands on a live element.
        restoreFocus('saved');
    };
    input.addEventListener('input', () => { if (!saving) validate(); });
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const result = validate();
        if (result.ok) void commit(result.value);
    });
    reset?.addEventListener('click', () => { void commit(null); });
    cancel.addEventListener('click', () => { if (!saving && finish('cancel')) restoreFocus('cancel'); });
    // Escape closes like キャンセル (synchronously, not via the deferred close event), except while a
    // save is in flight.
    dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        if (!saving && finish('cancel')) restoreFocus('cancel');
    });
    dialog.addEventListener('close', () => { if (finish('cancel')) restoreFocus('cancel'); });
    validate();
    root.append(dialog);
    dialog.showModal();
    input.focus();
    input.select?.();
    return dialog;
}
