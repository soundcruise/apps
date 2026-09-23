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
    let fieldSelections = new Map();
    let busy = false;

    function selectionSnapshot() {
      const snapshot = new Map(selections);
      Object.defineProperty(snapshot, 'fields', { value: new Map(fieldSelections) });
      return snapshot;
    }

    function replaceItems(nextItems) {
      items = Array.isArray(nextItems) ? nextItems : [];
      const currentIds = new Set(items.map((item) => item.id));
      selections = new Map([...selections].filter(([id]) => currentIds.has(id)));
      fieldSelections = new Map([...fieldSelections].filter(([id]) => currentIds.has(id)));
      for (const item of items) {
        if (item.settings) {
          const saved = fieldSelections.get(item.id) || {};
          for (const field of item.settings.fields) {
            if (field.selected && !saved[field.path]) saved[field.path] = field.selected;
          }
          fieldSelections.set(item.id, saved);
          selections.delete(item.id);
          continue;
        }
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
      if (busy || !items.some((item) => item.id === id && !item.settings)) return { ok: false, code: 'resolution_choice_invalid' };
      if (!['local', 'remote'].includes(choice)) return { ok: false, code: 'resolution_choice_invalid' };
      selections.set(id, choice);
      render();
      return { ok: true, selected: selections.size, total: items.length };
    }

    function selectAll(choice) {
      if (busy || !['local', 'remote'].includes(choice)) return { ok: false, code: 'resolution_choice_invalid' };
      if (items.some((item) => item.settings)) return { ok: false, code: 'settings_field_choice_required' };
      for (const item of items) selections.set(item.id, choice);
      render();
      return { ok: true, selected: selections.size, total: items.length };
    }

    function selectField(id, path, choice) {
      const item = items.find((entry) => entry.id === id);
      if (busy || !item?.settings?.fields.some((field) => field.path === path) ||
          !['local', 'remote'].includes(choice)) return { ok: false, code: 'resolution_choice_invalid' };
      fieldSelections.set(id, { ...(fieldSelections.get(id) || {}), [path]: choice });
      render();
      return { ok: true };
    }

    function selected(item) {
      return item.settings
        ? item.settings.fields.every((field) => ['local', 'remote'].includes(fieldSelections.get(item.id)?.[field.path]))
        : selections.has(item.id);
    }

    async function apply(mode = 'individual') {
      if (busy || !items.length) return { ok: false, code: 'resolution_busy' };
      const unresolved = items.filter((item) => !selected(item));
      if (unresolved.length) {
        view.showError(`残す内容が未選択の項目が${unresolved.length}件あります。すべて選んでください。`);
        return { ok: false, code: 'resolution_selection_incomplete', unresolved: unresolved.length };
      }

      const plan = items.map((item) => item.settings
        ? { id: item.id, choice: 'merged', options: { fieldChoices: fieldSelections.get(item.id) || {} } }
        : { id: item.id, choice: selections.get(item.id) });
      let applied = 0;
      busy = true;
      view.setBusy(true, mode);
      try {
        for (const step of plan) {
          view.showProgress(applied, plan.length);
          const result = await runtime.resolveConflict(step.id, step.choice, step.options);
          if (!result?.ok) {
            await readCurrentItems();
            const prefix = applied ? `${applied}件を反映しました。残りは反映せず停止しました。` : '';
            view.showError(`${prefix}${errorMessage(result?.code)}`);
            return { ...result, applied, pending: items.length };
          }
          applied += 1;
          selections.delete(step.id);
          fieldSelections.delete(step.id);
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
      if (items.some((item) => item.settings)) return { ok: false, code: 'settings_field_choice_required' };
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
      refresh, select, selectField, selectAll, apply, applyAll, later,
      get activeId() { return items[0]?.id || null; },
      get count() { return items.length; },
      get selectedCount() { return items.filter(selected).length; }
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

  const SETTINGS_LABELS = Object.freeze({
    keyRandomMode: 'キーの出題', noteSpeed: '音の速さ', scaleEnabled: 'スケール出題',
    isAnswerMode: '回答モード', testModeEnabled: 'テストモード',
    builtinChordEnabled: '内蔵コード', builtinProgressionEnabled: '内蔵進行'
  });

  function settingLabel(field) {
    return SETTINGS_LABELS[field.field] || String(field.field || field.path || '設定項目').slice(0, 80);
  }

  function settingValue(field, value) {
    if (field.field === 'keyRandomMode') return value ? 'ランダム' : '順番';
    if (field.field === 'noteSpeed' && Number.isFinite(value)) return `${value}倍`;
    if (typeof value === 'boolean') return value ? 'オン' : 'オフ';
    if (value === null) return '未設定';
    if (typeof value === 'string' || typeof value === 'number') return String(value).slice(0, 100);
    if (Array.isArray(value)) return value.slice(0, 5).map(String).join('、').slice(0, 100);
    if (value && typeof value === 'object') return Object.entries(value).slice(0, 5)
      .map(([key, entry]) => `${key}: ${String(entry)}`).join('、').slice(0, 100);
    return '設定値';
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

    function conciseState(value) {
      return String(value).includes('削除') ? '削除済み' : '保存されています';
    }

    function renderDeletionDifference(parent, presentation) {
      if (presentation.localState === presentation.remoteState) return;
      const states = document.createElement('div');
      states.className = 'sound-cruise-sync-conflict-deletion-difference';
      for (const [label, value] of [
        ['この端末', presentation.localState], ['クラウド', presentation.remoteState]
      ]) {
        const side = document.createElement('div');
        appendTextElement(document, side, 'span', '', label);
        appendTextElement(document, side, 'strong', '', conciseState(value));
        states.append(side);
      }
      parent.append(states);
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

    function renderRecordComparison(parent, presentation) {
      const fields = Array.isArray(presentation.fields) ? presentation.fields : [];
      const different = fields.filter((field) => String(field.local) !== String(field.remote));
      const visible = different.length ? different : fields;
      if (!visible.length) return;
      for (const field of visible) {
        const section = document.createElement('section');
        section.className = 'sound-cruise-sync-conflict-field';
        appendTextElement(document, section, 'h4', '', field.label);
        const values = document.createElement('div');
        values.className = 'sound-cruise-sync-conflict-field-values';
        appendTextElement(document, values, 'span', '', `この端末：${field.local}`);
        appendTextElement(document, values, 'span', '', `クラウド：${field.remote}`);
        section.append(values);
        parent.append(section);
      }
    }

    function renderSettingsChoices(parent, item, choices, index) {
      appendTextElement(document, parent, 'p', 'sound-cruise-sync-conflict-field-count',
        `選択が必要 ${item.settings.fields.length}項目`);
      if (item.settings.automaticCount) appendTextElement(document, parent, 'p',
        'sound-cruise-sync-conflict-auto', `${item.settings.automaticCount}項目は自動で統合されます`);
      item.settings.fields.forEach((field, fieldIndex) => {
        const section = document.createElement('section');
        section.className = 'sound-cruise-sync-conflict-field';
        appendTextElement(document, section, 'h4', '', settingLabel(field));
        const values = document.createElement('div');
        values.className = 'sound-cruise-sync-conflict-field-values';
        appendTextElement(document, values, 'span', '', `この端末：${settingValue(field, field.local)}`);
        appendTextElement(document, values, 'span', '', `クラウド：${settingValue(field, field.remote)}`);
        section.append(values);
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
          input.name = `sound-cruise-sync-conflict-${index}-${fieldIndex}`;
          input.value = choice;
          input.checked = choices[field.path] === choice;
          input.addEventListener('change', () => controller.selectField(item.id, field.path, choice));
          renderedInputs.push(input);
          option.append(input);
          appendTextElement(document, option, 'span', '', label);
          options.append(option);
        }
        fieldset.append(options);
        section.append(fieldset);
        parent.append(section);
      });
    }

    const view = {
      show(items, selections) {
        const hasSettings = items.some((item) => item.settings);
        title.textContent = hasSettings ? '設定の違いを確認' : '変更内容を確認してください';
        overview.hidden = hasSettings;
        bulk.hidden = hasSettings;
        if (hasSettings) {
          individualBody.hidden = false;
          individual.dataset.open = 'true';
          individualSummary.hidden = true;
          summary.textContent = 'この端末とクラウドで異なる設定だけ選んでください。同じ設定は自動で統合されます。';
        } else {
          individualSummary.hidden = false;
          summary.textContent = 'この端末とクラウドの両方に新しい変更があります。残したい内容を選んでください。';
        }
        count.textContent = `確認が必要な変更 ${items.length}件`;
        overview.replaceChildren(...items.map(renderOverviewItem));
        const previousListScroll = list.scrollTop;
        list.replaceChildren();
        renderedInputs = [];
        items.forEach((item, index) => {
          const presentation = item.presentation;
          const card = document.createElement('article');
          card.className = 'sound-cruise-sync-conflict-card';
          card.dataset.syncConflictSelected = selections.get(item.id) || 'none';
          const cardHeader = document.createElement('header');
          appendTextElement(document, cardHeader, 'h3', 'sound-cruise-sync-conflict-title',
            `${presentation.appName}　${presentation.title}`);
          appendTextElement(document, cardHeader, 'p', 'sound-cruise-sync-conflict-name', presentation.name);
          card.append(cardHeader);
          const times = document.createElement('div');
          times.className = 'sound-cruise-sync-conflict-detail-times';
          appendTextElement(document, times, 'span', '', `この端末　最終更新 ${formatUpdatedAt(presentation.localUpdatedAt)}`);
          appendTextElement(document, times, 'span', '', `クラウド　最終更新 ${formatUpdatedAt(presentation.remoteUpdatedAt)}`);
          card.append(times);
          renderDeletionDifference(card, presentation);
          if (item.settings) renderSettingsChoices(card, item, selections.fields.get(item.id) || {}, index);
          else {
            renderRecordComparison(card, presentation);
            renderChoice(card, item, selections.get(item.id), index);
          }
          list.append(card);
        });
        list.scrollTop = previousListScroll;
        const selectedCount = controller.selectedCount;
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
      const selectedCount = controller.selectedCount;
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
