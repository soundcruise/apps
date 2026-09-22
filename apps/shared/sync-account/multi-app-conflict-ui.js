(function installMultiAppConflictUi(global) {
  'use strict';

  const root = global.SoundCruiseMultiAppSync = global.SoundCruiseMultiAppSync || {};
  const ERROR_MESSAGES = Object.freeze({
    resolution_offline: 'オンラインに戻ってから、もう一度お試しください。',
    stale_resolution: 'クラウド側の内容が変わりました。最新の内容を確認して、もう一度選んでください。',
    local_changed_during_resolution: 'この端末の内容が変わりました。最新の内容を確認して、もう一度選んでください。',
    resolution_manifest_mismatch: '同期内容を確認できませんでした。データは確定せず停止しています。',
    resolution_verify_failed: '選択した内容を確認できませんでした。データは確定せず停止しています。'
  });

  function errorMessage(code) {
    return ERROR_MESSAGES[code] || '反映を完了できませんでした。内容は保持されています。もう一度お試しください。';
  }

  function createConflictResolutionController(runtime, view) {
    if (!runtime || !view) throw new Error('conflict_ui_dependency_missing');
    let items = [];
    let selections = new Map();
    let busy = false;

    function selectionSnapshot() {
      return new Map(selections);
    }

    function replaceItems(nextItems) {
      items = Array.isArray(nextItems) ? nextItems : [];
      const currentIds = new Set(items.map((item) => item.id));
      selections = new Map([...selections].filter(([id]) => currentIds.has(id)));
      for (const item of items) {
        if (!selections.has(item.id) && ['local', 'remote'].includes(item.selection)) {
          selections.set(item.id, item.selection);
        }
      }
    }

    function render() {
      if (!items.length) {
        view.close();
        return;
      }
      view.show(items, selectionSnapshot());
    }

    async function readCurrentItems() {
      replaceItems(await runtime.listConflictPresentations());
      render();
      return items.length;
    }

    async function refresh() {
      if (busy) return { ok: false, code: 'resolution_busy' };
      busy = true;
      view.setBusy(true);
      try {
        const count = await readCurrentItems();
        return { ok: true, count };
      } catch (error) {
        view.showError(errorMessage(error?.code));
        return { ok: false, code: error?.code || 'conflict_load_failed' };
      } finally {
        busy = false;
        view.setBusy(false);
      }
    }

    function select(id, choice) {
      if (busy || !items.some((item) => item.id === id)) return { ok: false, code: 'resolution_choice_invalid' };
      if (!['local', 'remote'].includes(choice)) return { ok: false, code: 'resolution_choice_invalid' };
      selections.set(id, choice);
      render();
      return { ok: true, selected: selections.size, total: items.length };
    }

    function selectAll(choice) {
      if (busy || !['local', 'remote'].includes(choice)) return { ok: false, code: 'resolution_choice_invalid' };
      for (const item of items) selections.set(item.id, choice);
      render();
      return { ok: true, selected: selections.size, total: items.length };
    }

    async function apply(mode = 'individual') {
      if (busy || !items.length) return { ok: false, code: 'resolution_busy' };
      const unresolved = items.filter((item) => !selections.has(item.id));
      if (unresolved.length) {
        view.showError(`残す内容が未選択の項目が${unresolved.length}件あります。すべて選んでください。`);
        return { ok: false, code: 'resolution_selection_incomplete', unresolved: unresolved.length };
      }

      const plan = items.map((item) => ({ id: item.id, choice: selections.get(item.id) }));
      let applied = 0;
      busy = true;
      view.setBusy(true, mode);
      try {
        for (const step of plan) {
          view.showProgress(applied, plan.length);
          const result = await runtime.resolveConflict(step.id, step.choice);
          if (!result?.ok) {
            await readCurrentItems();
            const prefix = applied ? `${applied}件を反映しました。残りは反映せず停止しました。` : '';
            view.showError(`${prefix}${errorMessage(result?.code)}`);
            return { ...result, applied, pending: items.length };
          }
          applied += 1;
          selections.delete(step.id);
        }
        const count = await readCurrentItems();
        return { ok: true, applied, remaining: count };
      } catch (error) {
        try { await readCurrentItems(); } catch (_) { /* keep the current safe screen */ }
        const prefix = applied ? `${applied}件を反映しました。残りは反映せず停止しました。` : '';
        view.showError(`${prefix}${errorMessage(error?.code)}`);
        return { ok: false, code: error?.code || 'resolution_failed', applied, pending: items.length };
      } finally {
        busy = false;
        view.setBusy(false);
      }
    }

    async function applyAll(choice) {
      if (busy || !['local', 'remote'].includes(choice)) return { ok: false, code: 'resolution_choice_invalid' };
      for (const item of items) selections.set(item.id, choice);
      return apply(choice === 'local' ? 'bulk-local' : 'bulk-remote');
    }

    async function later() {
      if (busy || !items.length) return { ok: false, code: 'resolution_busy' };
      busy = true;
      view.setBusy(true, 'later');
      try {
        for (const item of items) {
          const result = await runtime.resolveConflict(item.id, 'later');
          if (!result?.ok) {
            view.showError(errorMessage(result?.code));
            return result;
          }
        }
        view.close();
        return { ok: true, deferred: true, remaining: items.length };
      } catch (error) {
        view.showError(errorMessage(error?.code));
        return { ok: false, code: error?.code || 'resolution_failed' };
      } finally {
        busy = false;
        view.setBusy(false);
      }
    }

    return Object.freeze({
      refresh, select, selectAll, apply, applyAll, later,
      get activeId() { return items[0]?.id || null; },
      get count() { return items.length; },
      get selectedCount() { return selections.size; }
    });
  }

  function appendTextElement(document, parent, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function formatUpdatedAt(value) {
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) return '更新日時不明';
    try {
      return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
      }).format(new Date(Number(value)));
    } catch (_) {
      return '更新日時不明';
    }
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
    const header = document.createElement('header');
    header.className = 'sound-cruise-sync-conflict-header';
    const title = appendTextElement(document, header, 'h2', '', '変更内容を確認してください');
    title.id = 'sound-cruise-sync-conflict-title';
    const summary = appendTextElement(document, header, 'p', 'sound-cruise-sync-conflict-summary',
      'この端末とクラウドの両方に新しい変更があります。残したい内容を選んでください。');
    summary.id = 'sound-cruise-sync-conflict-summary';
    dialog.setAttribute('aria-labelledby', title.id);
    dialog.setAttribute('aria-describedby', summary.id);
    const count = appendTextElement(document, header, 'p', 'sound-cruise-sync-conflict-count', '');
    panel.append(header);

    const overview = document.createElement('div');
    overview.className = 'sound-cruise-sync-conflict-overview';
    overview.setAttribute('aria-label', '確認が必要な変更');
    panel.append(overview);

    const bulk = document.createElement('div');
    bulk.className = 'sound-cruise-sync-conflict-bulk';
    const bulkHeading = document.createElement('div');
    bulkHeading.className = 'sound-cruise-sync-conflict-bulk-heading';
    appendTextElement(document, bulkHeading, 'p', '', 'まとめて選ぶ');
    const helpButton = appendTextElement(document, bulkHeading, 'button', 'sound-cruise-sync-conflict-help-button', '?');
    helpButton.type = 'button';
    helpButton.setAttribute('aria-label', '選び方の説明を表示');
    helpButton.setAttribute('aria-expanded', 'false');
    const bulkActions = document.createElement('div');
    bulkActions.className = 'sound-cruise-sync-conflict-bulk-actions';
    const bulkLocal = appendTextElement(document, bulkActions, 'button', '', 'この端末の内容でクラウドを更新');
    const bulkRemote = appendTextElement(document, bulkActions, 'button', '', 'クラウドの内容でこの端末を更新');
    bulkLocal.type = bulkRemote.type = 'button';
    bulkLocal.autofocus = true;
    const help = document.createElement('div');
    help.className = 'sound-cruise-sync-conflict-help';
    help.hidden = true;
    for (const [heading, copy] of [
      ['この端末の内容でクラウドを更新', 'この端末にある変更を残し、クラウド側へ反映します。'],
      ['クラウドの内容でこの端末を更新', 'クラウドに保存されている変更を残し、この端末へ反映します。'],
      ['あとで決める', 'どちらも変更せず、後で再度選べます。'],
      ['両方の変更について', '別々の項目への変更など、安全にまとめられる内容は通常の同期で自動的に反映されます。どちらかを選ぶ必要がある内容だけ、この画面に表示されます。']
    ]) {
      appendTextElement(document, help, 'h3', '', heading);
      appendTextElement(document, help, 'p', '', copy);
    }
    bulk.append(bulkHeading, bulkActions, help);
    panel.append(bulk);

    const individual = document.createElement('section');
    individual.className = 'sound-cruise-sync-conflict-individual';
    const individualSummary = appendTextElement(document, individual, 'button', 'sound-cruise-sync-conflict-individual-toggle', '個別に選択する');
    individualSummary.type = 'button';
    individualSummary.setAttribute('aria-expanded', 'false');
    const individualBody = document.createElement('div');
    individualBody.className = 'sound-cruise-sync-conflict-individual-body';
    individualBody.hidden = true;
    const list = document.createElement('div');
    list.className = 'sound-cruise-sync-conflict-list';
    list.setAttribute('aria-label', '個別に選択する変更');
    const applyButton = appendTextElement(document, individualBody, 'button', 'sound-cruise-sync-conflict-apply', '選んだ内容を反映');
    applyButton.type = 'button';
    individualBody.insertBefore(list, applyButton);
    individual.append(individualBody);
    panel.append(individual);

    const footer = document.createElement('footer');
    footer.className = 'sound-cruise-sync-conflict-footer';
    const status = appendTextElement(document, footer, 'p', 'sound-cruise-sync-conflict-status', '');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const laterButton = appendTextElement(document, footer, 'button', 'sound-cruise-sync-conflict-later', 'あとで決める');
    laterButton.type = 'button';
    panel.append(footer);
    dialog.append(panel);
    document.body.append(dialog);

    let controller;
    let renderedInputs = [];
    const allButtons = () => [bulkLocal, bulkRemote, helpButton, individualSummary, applyButton, laterButton];
    const isIndividualOpen = () => !individualBody.hidden;

    function renderOverviewItem(item) {
      const presentation = item.presentation;
      const row = document.createElement('article');
      row.className = 'sound-cruise-sync-conflict-overview-item';
      const copy = document.createElement('div');
      appendTextElement(document, copy, 'h3', '', `${presentation.appName}　${presentation.title}`);
      if (presentation.name !== presentation.title) {
        appendTextElement(document, copy, 'p', 'sound-cruise-sync-conflict-name', presentation.name);
      }
      const times = document.createElement('div');
      times.className = 'sound-cruise-sync-conflict-times';
      appendTextElement(document, times, 'span', '', `この端末　${formatUpdatedAt(presentation.localUpdatedAt)}`);
      appendTextElement(document, times, 'span', '', `クラウド　${formatUpdatedAt(presentation.remoteUpdatedAt)}`);
      if (presentation.localState !== presentation.remoteState) {
        appendTextElement(document, times, 'span', 'sound-cruise-sync-conflict-state',
          `この端末：${presentation.localState}／クラウド：${presentation.remoteState}`);
      }
      row.append(copy, times);
      return row;
    }

    function renderComparison(parent, presentation) {
      const comparison = document.createElement('div');
      comparison.className = 'sound-cruise-sync-conflict-comparison';
      const headings = document.createElement('div');
      headings.className = 'sound-cruise-sync-conflict-row sound-cruise-sync-conflict-headings';
      appendTextElement(document, headings, 'span', '', '項目');
      appendTextElement(document, headings, 'span', '', 'この端末');
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
      parent.append(comparison);
    }

    function renderChoice(parent, item, selected, index) {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'sound-cruise-sync-conflict-choice';
      appendTextElement(document, fieldset, 'legend', '', '残す内容');
      const options = document.createElement('div');
      options.className = 'sound-cruise-sync-conflict-choice-options';
      for (const [choice, label] of [['local', 'この端末'], ['remote', 'クラウド']]) {
        const option = document.createElement('label');
        option.className = 'sound-cruise-sync-conflict-choice-option';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `sound-cruise-sync-conflict-${index}`;
        input.value = choice;
        input.checked = selected === choice;
        input.addEventListener('change', () => controller.select(item.id, choice));
        renderedInputs.push(input);
        option.append(input);
        appendTextElement(document, option, 'span', '', label);
        options.append(option);
      }
      fieldset.append(options);
      parent.append(fieldset);
    }

    const view = {
      show(items, selections) {
        count.textContent = `確認が必要な変更 ${items.length}件`;
        overview.replaceChildren(...items.map(renderOverviewItem));
        list.replaceChildren();
        renderedInputs = [];
        items.forEach((item, index) => {
          const presentation = item.presentation;
          const card = document.createElement('article');
          card.className = 'sound-cruise-sync-conflict-card';
          card.dataset.syncConflictSelected = selections.get(item.id) || 'none';
          const cardHeader = document.createElement('header');
          appendTextElement(document, cardHeader, 'h3', 'sound-cruise-sync-conflict-title', `${presentation.appName}　${presentation.title}`);
          appendTextElement(document, cardHeader, 'p', 'sound-cruise-sync-conflict-name', presentation.name);
          card.append(cardHeader);
          const times = document.createElement('p');
          times.className = 'sound-cruise-sync-conflict-detail-times';
          times.textContent = `この端末 ${formatUpdatedAt(presentation.localUpdatedAt)} ／ クラウド ${formatUpdatedAt(presentation.remoteUpdatedAt)}`;
          card.append(times);
          renderComparison(card, presentation);
          renderChoice(card, item, selections.get(item.id), index);
          list.append(card);
        });
        const selectedCount = [...selections].filter(([id]) => items.some((item) => item.id === id)).length;
        status.textContent = isIndividualOpen()
          ? selectedCount === items.length ? 'すべて選択済みです。' : `${selectedCount}/${items.length}件を選択済み`
          : '';
        status.classList.remove('is-error');
        applyButton.disabled = selectedCount !== items.length;
        dialog.dataset.syncConflictPhase = 'attention';
        if (!dialog.open) dialog.showModal();
      },
      setBusy(value, choice) {
        const incomplete = renderedInputs.some((input) =>
          !renderedInputs.some((other) => other.name === input.name && other.checked));
        for (const button of allButtons()) button.disabled = value || (button === applyButton && incomplete);
        for (const input of renderedInputs) input.disabled = value;
        dialog.setAttribute('aria-busy', value ? 'true' : 'false');
        if (value) {
          dialog.dataset.syncConflictPhase = choice ? `resolving-${choice}` : 'loading';
          status.textContent = choice === 'individual' ? '選択した内容を安全に反映しています…'
            : choice === 'bulk-local' || choice === 'bulk-remote' ? '変更を安全に反映しています…'
            : choice === 'later' ? '選択を保留しています…' : '同期内容を確認しています…';
        }
      },
      showProgress(applied, total) {
        status.textContent = `${applied} / ${total}件完了　変更を反映しています…`;
      },
      showError(message) {
        dialog.dataset.syncConflictPhase = 'failure';
        status.textContent = message;
        status.classList.add('is-error');
        if (!dialog.open) dialog.showModal();
      },
      close() {
        status.textContent = '';
        status.classList.remove('is-error');
        dialog.dataset.syncConflictPhase = 'deferred';
        if (dialog.open) dialog.close();
      }
    };

    controller = createConflictResolutionController(runtime, view);
    dialog.__soundCruiseConflictController = controller;
    bulkLocal.addEventListener('click', () => controller.applyAll('local'));
    bulkRemote.addEventListener('click', () => controller.applyAll('remote'));
    helpButton.addEventListener('click', () => {
      help.hidden = !help.hidden;
      helpButton.setAttribute('aria-expanded', String(!help.hidden));
    });
    individualSummary.addEventListener('click', () => {
      if (dialog.getAttribute('aria-busy') === 'true') return;
      individualBody.hidden = !individualBody.hidden;
      individual.dataset.open = String(!individualBody.hidden);
      individualSummary.setAttribute('aria-expanded', String(!individualBody.hidden));
      if (individualBody.hidden) {
        status.textContent = '';
        return;
      }
      const selectedCount = renderedInputs.filter((input) => input.checked).length;
      status.textContent = `${selectedCount}/${controller.count}件を選択済み`;
    });
    applyButton.addEventListener('click', () => controller.apply('individual'));
    laterButton.addEventListener('click', () => controller.later());
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      controller.later();
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
