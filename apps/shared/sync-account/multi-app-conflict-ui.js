(function installMultiAppConflictUi(global) {
  'use strict';

  const root = global.SoundCruiseMultiAppSync = global.SoundCruiseMultiAppSync || {};
  const ERROR_MESSAGES = Object.freeze({
    resolution_offline: 'オンラインに戻ってから、もう一度お試しください。',
    stale_resolution: 'クラウド側の内容が変わりました。内容を確認して、もう一度選んでください。',
    local_changed_during_resolution: 'この環境の内容が変わりました。内容を確認して、もう一度選んでください。',
    resolution_manifest_mismatch: '同期内容を確認できませんでした。データは確定せず停止しています。',
    resolution_verify_failed: '選択した内容を確認できませんでした。データは確定せず停止しています。'
  });

  function errorMessage(code) {
    return ERROR_MESSAGES[code] || '解決を完了できませんでした。内容は保持されています。もう一度お試しください。';
  }

  function createConflictResolutionController(runtime, view) {
    if (!runtime || !view) throw new Error('conflict_ui_dependency_missing');
    let activeId = null;
    let busy = false;

    async function refresh() {
      if (busy) return { ok: false, code: 'resolution_busy' };
      busy = true;
      view.setBusy(true);
      try {
        const items = await runtime.listConflictPresentations();
        if (!items.length) {
          activeId = null;
          view.close();
          return { ok: true, count: 0 };
        }
        activeId = items[0].id;
        view.show(items[0], items.length);
        return { ok: true, count: items.length };
      } catch (error) {
        view.showError(errorMessage(error?.code));
        return { ok: false, code: error?.code || 'conflict_load_failed' };
      } finally {
        busy = false;
        view.setBusy(false);
      }
    }

    async function choose(choice) {
      if (busy || !activeId) return { ok: false, code: 'resolution_busy' };
      if (!['local', 'remote', 'later'].includes(choice)) return { ok: false, code: 'resolution_choice_invalid' };
      busy = true;
      view.setBusy(true, choice);
      try {
        const result = await runtime.resolveConflict(activeId, choice);
        if (choice === 'later') {
          view.close();
          return result;
        }
        if (!result.ok) {
          view.showError(errorMessage(result.code));
          return result;
        }
        busy = false;
        view.setBusy(false);
        return await refresh();
      } catch (error) {
        view.showError(errorMessage(error?.code));
        return { ok: false, code: error?.code || 'resolution_failed' };
      } finally {
        if (busy) {
          busy = false;
          view.setBusy(false);
        }
      }
    }

    return Object.freeze({ refresh, choose, get activeId() { return activeId; } });
  }

  function appendTextElement(document, parent, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function installConflictResolutionUi(runtime, document = global.document) {
    const existing = document?.querySelector?.('[data-sync-conflict-resolution]');
    if (existing?.__soundCruiseConflictController) return existing.__soundCruiseConflictController;
    if (!document?.createElement || !document?.body) throw new Error('conflict_ui_document_missing');

    const dialog = document.createElement('dialog');
    dialog.className = 'sound-cruise-sync-conflict';
    dialog.dataset.syncConflictResolution = '';
    const panel = document.createElement('section');
    panel.className = 'sound-cruise-sync-conflict-panel';
    appendTextElement(document, panel, 'h2', '', '同期内容の確認が必要です');
    const summary = appendTextElement(document, panel, 'p', 'sound-cruise-sync-conflict-summary',
      'この環境とクラウドの両方に変更があります。使う内容を選んでください。');
    const itemTitle = appendTextElement(document, panel, 'h3', 'sound-cruise-sync-conflict-title', '確認が必要な項目');
    const count = appendTextElement(document, panel, 'p', 'sound-cruise-sync-conflict-count', '');
    const comparison = document.createElement('div');
    comparison.className = 'sound-cruise-sync-conflict-comparison';
    panel.append(comparison);
    const status = appendTextElement(document, panel, 'p', 'sound-cruise-sync-conflict-status', '');
    status.setAttribute('role', 'status');
    const actions = document.createElement('div');
    actions.className = 'sound-cruise-sync-conflict-actions';
    const localButton = appendTextElement(document, actions, 'button', 'sound-cruise-sync-conflict-primary', 'この環境のデータを使う');
    const remoteButton = appendTextElement(document, actions, 'button', '', 'クラウドのデータを使う');
    const laterButton = appendTextElement(document, actions, 'button', '', 'あとで確認');
    for (const button of [localButton, remoteButton, laterButton]) button.type = 'button';
    panel.append(actions);
    dialog.append(panel);
    document.body.append(dialog);

    const view = {
      show(item, total) {
        const presentation = item.presentation;
        itemTitle.textContent = `${presentation.title}：${presentation.name}`;
        count.textContent = total > 1 ? `確認が必要な項目が${total}件あります。1件ずつ確認します。` : '';
        comparison.replaceChildren();
        const headings = document.createElement('div');
        headings.className = 'sound-cruise-sync-conflict-row sound-cruise-sync-conflict-headings';
        appendTextElement(document, headings, 'span', '', '項目');
        appendTextElement(document, headings, 'span', '', 'この環境');
        appendTextElement(document, headings, 'span', '', 'クラウド');
        comparison.append(headings);
        for (const field of presentation.fields) {
          const row = document.createElement('div');
          row.className = 'sound-cruise-sync-conflict-row';
          appendTextElement(document, row, 'span', 'sound-cruise-sync-conflict-label', field.label);
          appendTextElement(document, row, 'span', '', field.local);
          appendTextElement(document, row, 'span', '', field.remote);
          comparison.append(row);
        }
        status.textContent = '';
        dialog.dataset.syncConflictPhase = 'attention';
        if (!dialog.open) dialog.showModal();
      },
      setBusy(value, choice) {
        for (const button of [localButton, remoteButton, laterButton]) button.disabled = value;
        if (value) {
          dialog.dataset.syncConflictPhase = choice ? `resolving-${choice}` : 'loading';
          status.textContent = choice ? '選択した内容を安全に確認しています…' : '同期内容を確認しています…';
        } else if (dialog.dataset.syncConflictPhase !== 'failure') {
          status.textContent = '';
        }
      },
      showError(message) {
        dialog.dataset.syncConflictPhase = 'failure';
        status.textContent = message;
        if (!dialog.open) dialog.showModal();
      },
      close() {
        status.textContent = '';
        dialog.dataset.syncConflictPhase = 'deferred';
        if (dialog.open) dialog.close();
      }
    };
    const controller = createConflictResolutionController(runtime, view);
    dialog.__soundCruiseConflictController = controller;
    localButton.addEventListener('click', () => controller.choose('local'));
    remoteButton.addEventListener('click', () => controller.choose('remote'));
    laterButton.addEventListener('click', () => controller.choose('later'));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      controller.choose('later');
    });
    runtime.addEventListener('statechange', (event) => {
      if (event.detail?.state === 'attention' && event.detail?.reason === 'conflict') controller.refresh();
    });
    return controller;
  }

  Object.assign(root, {
    conflictResolutionErrorMessage: errorMessage,
    createConflictResolutionController,
    installConflictResolutionUi
  });
})(globalThis);
