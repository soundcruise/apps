(function installSoundCruiseSyncUi(global) {
  'use strict';

  const STATUS = Object.freeze({
    unconnected: Object.freeze({ label: '未接続', description: '' }),
    connecting: Object.freeze({ label: '接続中', description: '同期の準備をしています。' }),
    checking: Object.freeze({ label: '同期を確認中', description: 'クラウドの状態を確認しています。' }),
    syncing: Object.freeze({ label: '同期中', description: '' }),
    ready: Object.freeze({ label: '同期済み', description: '' }),
    attention: Object.freeze({ label: '確認が必要', description: '同期する内容を確認してください。' }),
    offline: Object.freeze({ label: 'オフライン', description: '接続が戻ると自動で同期を再開します。' }),
    paused: Object.freeze({ label: '一時停止中', description: '安全のため同期を停止しています。' }),
    deleting: Object.freeze({ label: '削除中', description: '' }),
    reconnect: Object.freeze({ label: '再接続が必要', description: 'Cruise Portから接続し直してください。' })
  });

  const APP_HELP_SUMMARY = 'このアプリの対応データをクラウドに保存し、複数の環境で同期できます。';

  const HELP_SECTIONS = Object.freeze([
    Object.freeze({
      title: 'クラウド同期',
      paragraphs: Object.freeze(['このアプリの対応データをクラウドに保存し、複数の環境で同期できます。'])
    }),
    Object.freeze({
      title: '接続方法',
      paragraphs: Object.freeze(['Cruise Portで同期コードを表示し、このアプリの「Cruise Portと接続」から入力します。'])
    }),
    Object.freeze({
      title: 'この環境の同期を解除',
      paragraphs: Object.freeze([
        '今開いているこの環境だけをクラウド同期から外します。',
        'クラウド上と端末内のデータ、ほかの同期環境は残ります。後から再接続できます。'
      ])
    }),
    Object.freeze({
      title: 'オフライン・競合',
      paragraphs: Object.freeze([
        'オフライン中\n変更は端末に保存され、接続が戻ると自動で同期を再開します。',
        '競合した場合\n自動で上書きせず、残す内容を確認する画面を表示します。'
      ])
    })
  ]);
  let cardSequence = 0;

  function appendText(document, parent, tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    parent.append(node);
    return node;
  }

  function appendSteps(document, parent, steps, { flow = false } = {}) {
    const list = document.createElement('ol');
    list.className = `sound-cruise-sync-help-steps${flow ? ' sound-cruise-sync-help-steps--flow' : ''}`;
    steps.forEach((step) => appendText(document, list, 'li', '', step));
    parent.append(list);
  }

  function openHelp({
    document = global.document,
    privacyHref = '../privacy.html?edition=pro',
    summary = APP_HELP_SUMMARY,
    sections = HELP_SECTIONS
  } = {}) {
    if (!document?.body) return null;
    let dialog = document.querySelector('[data-sync-shared-help]');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'sound-cruise-sync-help';
      dialog.dataset.syncSharedHelp = '';
      const panel = document.createElement('section');
      panel.className = 'sound-cruise-sync-help-panel';
      const header = document.createElement('header');
      header.className = 'sound-cruise-sync-help-header';
      appendText(document, header, 'h2', '', 'クラウド同期について');
      const body = document.createElement('div');
      body.className = 'sound-cruise-sync-help-body';
      if (summary) appendText(document, body, 'p', 'sound-cruise-sync-help-summary', summary);
      sections.forEach((section, index) => {
        const group = document.createElement('section');
        group.className = 'sound-cruise-sync-help-section';
        const headingId = `sound-cruise-sync-help-heading-${index + 1}`;
        const contentId = `sound-cruise-sync-help-content-${index + 1}`;
        const toggle = appendText(document, group, 'button', 'sound-cruise-sync-help-toggle', section.title);
        toggle.type = 'button';
        toggle.id = headingId;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', contentId);
        const indicator = appendText(document, toggle, 'span', 'sound-cruise-sync-help-indicator', '＋');
        indicator.setAttribute('aria-hidden', 'true');
        const content = document.createElement('div');
        content.className = 'sound-cruise-sync-help-content';
        content.id = contentId;
        content.setAttribute('role', 'region');
        content.setAttribute('aria-labelledby', headingId);
        content.hidden = true;
        section.paragraphs?.forEach((paragraph) => appendText(document, content, 'p', '', paragraph));
        if (section.steps) appendSteps(document, content, section.steps, { flow: section.flowSteps === true });
        if (section.secondaryTitle) appendText(document, content, 'h4', '', section.secondaryTitle);
        if (section.secondarySteps) appendSteps(document, content, section.secondarySteps, { flow: section.secondaryFlowSteps === true });
        toggle.addEventListener('click', () => {
          const willOpen = toggle.getAttribute('aria-expanded') !== 'true';
          body.querySelectorAll('.sound-cruise-sync-help-toggle[aria-expanded="true"]').forEach((openToggle) => {
            if (openToggle === toggle) return;
            openToggle.setAttribute('aria-expanded', 'false');
            const openContent = document.getElementById(openToggle.getAttribute('aria-controls'));
            if (openContent) openContent.hidden = true;
            const openIndicator = openToggle.querySelector('.sound-cruise-sync-help-indicator');
            if (openIndicator) openIndicator.textContent = '＋';
          });
          toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
          content.hidden = !willOpen;
          indicator.textContent = willOpen ? '−' : '＋';
        });
        group.append(content);
        body.append(group);
      });
      appendText(document, body, 'p', 'sound-cruise-sync-help-note',
        '復旧コード、別環境の追加、同期データの削除などの詳しい管理はCruise Portで行います。');
      const privacy = appendText(document, body, 'a', 'sound-cruise-sync-help-link', 'プライバシーポリシーを確認');
      privacy.href = privacyHref;
      const footer = document.createElement('footer');
      footer.className = 'sound-cruise-sync-help-footer';
      const close = appendText(document, footer, 'button', 'sound-cruise-sync-button sound-cruise-sync-button--primary', '閉じる');
      close.type = 'button';
      close.addEventListener('click', () => dialog.close());
      panel.append(header, body, footer);
      dialog.append(panel);
      document.body.append(dialog);
      dialog.addEventListener('close', () => document.documentElement.classList.remove('sound-cruise-sync-help-open'));
    }
    if (!dialog.open) {
      dialog.querySelectorAll('.sound-cruise-sync-help-toggle').forEach((toggle) => {
        toggle.setAttribute('aria-expanded', 'false');
        const content = document.getElementById(toggle.getAttribute('aria-controls'));
        if (content) content.hidden = true;
        const indicator = toggle.querySelector('.sound-cruise-sync-help-indicator');
        if (indicator) indicator.textContent = '＋';
      });
      document.documentElement.classList.add('sound-cruise-sync-help-open');
      dialog.showModal();
    }
    return dialog;
  }

  function actionButton(document, action, controller) {
    const button = document.createElement(action.href ? 'a' : 'button');
    button.className = `sound-cruise-sync-button sound-cruise-sync-button--${action.kind || 'secondary'}`;
    button.textContent = action.label;
    if (action.href) {
      button.href = action.href;
      return button;
    }
    button.type = 'button';
    button.dataset.syncAction = action.id || 'card-action';
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (controller.busy || button.disabled) return;
      controller.setBusy(true, action.loadingLabel || '処理中…');
      try { await action.run?.(); }
      catch (error) { controller.setFeedback(error?.message || '操作を完了できませんでした。', 'error'); }
      finally { controller.setBusy(false); }
    });
    return button;
  }

  function displayStatusLabel(state, status, suppliedLabel) {
    if (state === 'unconnected') return '未接続';
    if (state === 'ready') return '接続';
    return suppliedLabel || status.label;
  }

  function renderCard(host, options = {}) {
    if (!host?.ownerDocument) return null;
    const document = host.ownerDocument;
    host.replaceChildren();
    host.dataset.syncJoinUiState = options.state || 'checking';
    const status = STATUS[options.state] || STATUS.checking;
    const card = document.createElement('section');
    // Testing appearance is a reversible Pro-only presentation modifier.
    const testingAppearance = document.documentElement?.dataset.appEdition === 'Pro';
    card.className = `sound-cruise-sync-settings-card sound-cruise-sync-settings-card--accordion${testingAppearance ? ' sound-cruise-sync-settings-card--testing' : ''}`;
    card.dataset.syncSettingsState = options.state || 'checking';
    const bodyId = `sound-cruise-sync-settings-body-${++cardSequence}`;
    const expanded = host.dataset.syncCardExpanded === 'true';
    const header = document.createElement('header');
    header.className = 'sound-cruise-sync-settings-head';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sound-cruise-sync-settings-toggle';
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.setAttribute('aria-controls', bodyId);
    appendText(document, toggle, 'strong', 'sound-cruise-sync-settings-title', 'クラウド同期');
    if (testingAppearance) appendText(document, toggle, 'span', 'sound-cruise-sync-settings-testing-badge', '試験中');
    const statusLabel = displayStatusLabel(options.state, status, options.statusLabel);
    appendText(document, toggle, 'span', 'sound-cruise-sync-settings-status-chip', statusLabel);
    appendText(document, toggle, 'span', 'sound-cruise-sync-settings-chevron', '⌄').setAttribute('aria-hidden', 'true');
    header.append(toggle);
    const body = document.createElement('div');
    body.className = 'sound-cruise-sync-settings-body';
    body.id = bodyId;
    body.hidden = !expanded;
    toggle.addEventListener('click', () => {
      const willOpen = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      body.hidden = !willOpen;
      host.dataset.syncCardExpanded = willOpen ? 'true' : 'false';
    });
    const description = appendText(document, body, 'p', 'sound-cruise-sync-description',
      options.description === undefined ? status.description : options.description);
    if (options.accountDisplayId) {
      appendText(document, body, 'p', 'sound-cruise-sync-account-id',
        `アカウント：${options.accountDisplayId}`);
    }
    const actions = document.createElement('div');
    actions.className = 'sound-cruise-sync-card-actions';
    const actionRow = document.createElement('div');
    actionRow.className = 'sound-cruise-sync-action-row';
    const help = appendText(document, actionRow, 'button', 'sound-cruise-sync-help-button', '?');
    help.type = 'button';
    help.setAttribute('aria-label', 'クラウド同期のヘルプを開く');
    help.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openHelp({ document, privacyHref: options.privacyHref });
    });
    const feedback = appendText(document, body, 'p', 'sound-cruise-sync-feedback', '');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    const controller = {
      busy: false,
      timer: null,
      setBusy(value, label) {
        this.busy = value;
        card.dataset.syncBusy = value ? 'true' : 'false';
        actions.querySelectorAll('button').forEach((node) => {
          if (value) {
            node.dataset.syncLabel = node.textContent;
            node.textContent = label;
            node.disabled = true;
            node.setAttribute('aria-busy', 'true');
          } else {
            node.disabled = false;
            node.removeAttribute('aria-busy');
            if (node.dataset.syncLabel) node.textContent = node.dataset.syncLabel;
            delete node.dataset.syncLabel;
          }
        });
      },
      setFeedback(message, kind = 'success', timeoutMs = 5000) {
        feedback.textContent = message || '';
        feedback.dataset.syncFeedback = message ? kind : '';
        if (this.timer) global.clearTimeout(this.timer);
        if (message && timeoutMs > 0) this.timer = global.setTimeout(() => {
          if (feedback.textContent === message) feedback.textContent = '';
          feedback.dataset.syncFeedback = '';
        }, timeoutMs);
      },
      card
    };
    [options.primaryAction, options.secondaryAction].filter(Boolean)
      .forEach((action) => actions.append(actionButton(document, action, controller)));
    actionRow.prepend(actions);
    body.insertBefore(actionRow, feedback);
    card.append(header, body);
    if (!description.textContent) description.hidden = true;
    if (!actions.childElementCount) actions.hidden = true;
    host.append(card);
    return controller;
  }

  function bindSetupViewport(dialog) {
    const viewport = global.visualViewport;
    const update = () => {
      const width = Math.max(0, Number(viewport?.width || global.innerWidth || 0));
      const height = Math.max(0, Number(viewport?.height || global.innerHeight || 0));
      const offsetLeft = Number(viewport?.offsetLeft || 0);
      const offsetTop = Number(viewport?.offsetTop || 0);
      dialog.style.setProperty('--sync-setup-viewport-width', `${width}px`);
      dialog.style.setProperty('--sync-setup-viewport-height', `${height}px`);
      dialog.style.setProperty('--sync-setup-viewport-center', `${offsetLeft + (width / 2)}px`);
      dialog.style.setProperty('--sync-setup-viewport-top', `${offsetTop}px`);
      const active = dialog.ownerDocument?.activeElement;
      if (active && dialog.contains(active)) {
        global.requestAnimationFrame?.(() => active.scrollIntoView?.({ block: 'nearest' }));
      }
    };
    const cleanup = () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    dialog.addEventListener('close', cleanup, { once: true });
    dialog.addEventListener('focusin', update);
    update();
  }

  function createJoinDialog({ document = global.document, portUrl = '/apps/cruise-port/#sync-center', mode = 'join' } = {}) {
    const dialog = document.createElement('dialog');
    dialog.className = 'sound-cruise-sync-setup';
    dialog.dataset.syncPhase = 'confirm';
    const panel = document.createElement('form');
    panel.method = 'dialog';
    panel.className = 'sound-cruise-sync-setup-panel';
    appendText(document, panel, 'h2', '', mode === 'join' ? '接続コードを入力' : 'クラウド同期');
    appendText(document, panel, 'p', '', mode === 'join'
      ? 'Cruise Portに表示された接続コードを入力してください。'
      : 'このアプリをクラウド同期へ接続します。').dataset.syncSummary = '';
    if (mode === 'join') {
      const label = appendText(document, panel, 'label', 'sound-cruise-sync-join-field', '接続コード');
      label.dataset.syncJoinField = '';
      const input = document.createElement('input');
      input.dataset.syncJoinCode = '';
      input.dataset.sensitive = 'true';
      input.setAttribute('data-sync-sensitive', 'join-code-input');
      input.autocomplete = 'off';
      input.autocapitalize = 'characters';
      input.spellcheck = false;
      label.append(input);
    }
    const error = appendText(document, panel, 'p', 'sound-cruise-sync-error', '');
    error.dataset.syncError = '';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const start = appendText(document, panel, 'button', 'sound-cruise-sync-button sound-cruise-sync-button--primary', mode === 'join' ? '接続する' : '同期を開始');
    start.type = 'button'; start.dataset.syncAction = 'start';
    const continueButton = appendText(document, panel, 'button', 'sound-cruise-sync-button sound-cruise-sync-button--primary', '閉じる');
    continueButton.type = 'button'; continueButton.dataset.syncAction = 'continue'; continueButton.hidden = true;
    const returnLink = appendText(document, panel, 'a', 'sound-cruise-sync-button sound-cruise-sync-button--secondary', 'Cruise Portに戻る');
    returnLink.dataset.syncAction = 'return'; returnLink.href = portUrl; returnLink.hidden = true;
    const cancel = appendText(document, panel, 'button', 'sound-cruise-sync-button sound-cruise-sync-button--secondary', 'キャンセル');
    cancel.value = 'cancel'; cancel.dataset.syncAction = 'cancel';
    dialog.append(panel);
    document.body.append(dialog);
    bindSetupViewport(dialog);
    return dialog;
  }

  function setJoinProcessing(dialog, { title = '接続しています…', description = 'しばらくお待ちください。' } = {}) {
    if (!dialog) return;
    dialog.dataset.syncPhase = 'working';
    const panel = dialog.querySelector('.sound-cruise-sync-setup-panel');
    panel?.querySelectorAll('[data-sync-join-field], [data-sync-action="start"], [data-sync-action="cancel"], [data-sync-action="continue"], [data-sync-action="return"], [data-sync-error]')
      .forEach((node) => { node.hidden = true; });
    const heading = panel?.querySelector('h2');
    const summary = panel?.querySelector('[data-sync-summary]');
    if (heading) heading.textContent = title;
    if (summary) summary.textContent = description;
    let indicator = panel?.querySelector('[data-sync-processing]');
    if (!indicator && panel) {
      indicator = appendText(panel.ownerDocument, panel, 'p', 'sound-cruise-sync-processing', '処理中…');
      indicator.dataset.syncProcessing = '';
      indicator.setAttribute('role', 'status');
      indicator.setAttribute('aria-live', 'polite');
    }
  }

  function restoreJoinInput(dialog, { title = '接続コードを入力', description = 'Cruise Portに表示された接続コードを入力してください。' } = {}) {
    if (!dialog) return;
    dialog.dataset.syncPhase = 'attention';
    const panel = dialog.querySelector('.sound-cruise-sync-setup-panel');
    panel?.querySelector('[data-sync-processing]')?.remove();
    const heading = panel?.querySelector('h2');
    const summary = panel?.querySelector('[data-sync-summary]');
    if (heading) heading.textContent = title;
    if (summary) summary.textContent = description;
    panel?.querySelectorAll('[data-sync-join-field], [data-sync-action="start"], [data-sync-action="cancel"]')
      .forEach((node) => { node.hidden = false; });
  }

  function completeJoinDialog(dialog, { title = 'クラウド同期を設定しました。' } = {}) {
    if (!dialog) return;
    dialog.dataset.syncPhase = 'complete';
    const panel = dialog.querySelector('.sound-cruise-sync-setup-panel');
    panel?.querySelectorAll('[data-sync-join-field], [data-sync-action="start"], [data-sync-action="cancel"], [data-sync-action="return"], [data-sync-error], [data-sync-processing]')
      .forEach((node) => { node.hidden = true; });
    const heading = panel?.querySelector('h2');
    const summary = panel?.querySelector('[data-sync-summary]');
    if (heading) heading.textContent = 'クラウド同期';
    if (summary) summary.textContent = title;
    const close = panel?.querySelector('[data-sync-action="continue"]');
    if (close) { close.hidden = false; close.textContent = '閉じる'; }
  }

  function openCurrentEnvironmentDetachDialog({ document = global.document, onConfirm } = {}) {
    if (!document?.body || typeof onConfirm !== 'function') return null;
    const dialog = document.createElement('dialog');
    dialog.className = 'sound-cruise-sync-setup';
    dialog.dataset.syncPhase = 'confirm';
    const panel = document.createElement('section');
    panel.className = 'sound-cruise-sync-setup-panel';
    appendText(document, panel, 'h2', '', 'この環境の同期を解除');
    appendText(document, panel, 'p', '', '今開いているこの環境だけをクラウド同期から解除します。\n\nクラウド上と端末内のデータ、ほかの同期環境は削除されません。\n\n後から再接続できます。').dataset.syncSummary = '';
    const error = appendText(document, panel, 'p', 'sound-cruise-sync-error', '');
    error.dataset.syncError = ''; error.hidden = true;
    const confirm = appendText(document, panel, 'button', 'sound-cruise-sync-button sound-cruise-sync-button--secondary', '同期を解除');
    confirm.type = 'button'; confirm.dataset.syncAction = 'start';
    const cancel = appendText(document, panel, 'button', 'sound-cruise-sync-button sound-cruise-sync-button--secondary', 'キャンセル');
    cancel.type = 'button'; cancel.dataset.syncAction = 'cancel';
    cancel.addEventListener('click', () => dialog.close());
    confirm.addEventListener('click', async () => {
      setJoinProcessing(dialog, { title: 'この環境の同期を解除中…', description: '同期の接続を安全に解除しています。' });
      try { await onConfirm(); dialog.close(); }
      catch (_) {
        restoreJoinInput(dialog, { title: 'この環境の同期を解除', description: '接続を解除できませんでした。通信状態を確認してもう一度お試しください。' });
        error.hidden = false;
        error.textContent = '接続を解除できませんでした。データは削除していません。';
      }
    });
    panel.append(confirm, cancel);
    dialog.append(panel); document.body.append(dialog); bindSetupViewport(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.showModal();
    return dialog;
  }

  function isStandalonePwa() {
    return Boolean(global.navigator?.standalone || global.matchMedia?.('(display-mode: standalone)')?.matches);
  }

  function openPortManagement({
    portUrl = '/apps/cruise-port/#sync-center',
    document = global.document,
    location = global.location
  } = {}) {
    if (!isStandalonePwa()) {
      location?.assign?.(portUrl);
      return null;
    }
    const dialog = document.createElement('dialog');
    dialog.className = 'sound-cruise-sync-setup';
    dialog.dataset.syncPortManagement = '';
    const panel = document.createElement('section');
    panel.className = 'sound-cruise-sync-setup-panel';
    appendText(document, panel, 'h2', '', 'クラウド同期の管理');
    appendText(document, panel, 'p', '', 'ホーム画面版のCruise Portを開いてクラウド同期を管理してください。');
    const close = appendText(document, panel, 'button', 'sound-cruise-sync-button sound-cruise-sync-button--primary', '閉じる');
    close.type = 'button';
    close.addEventListener('click', () => dialog.close());
    const browser = appendText(document, panel, 'button', 'sound-cruise-sync-button sound-cruise-sync-button--secondary', 'SafariでCruise Portを開く');
    browser.type = 'button';
    browser.addEventListener('click', () => location?.assign?.(portUrl));
    dialog.append(panel);
    document.body.append(dialog);
    bindSetupViewport(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.showModal();
    return dialog;
  }

  global.SoundCruiseSyncUI = Object.freeze({
    STATUS, APP_HELP_SUMMARY, HELP_SECTIONS, renderCard, openHelp, createJoinDialog,
    setJoinProcessing, restoreJoinInput, completeJoinDialog, openCurrentEnvironmentDetachDialog,
    isStandalonePwa, openPortManagement,
    temporaryFeedbackMs: 5000
  });
})(globalThis);
