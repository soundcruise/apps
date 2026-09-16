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

  const APP_HELP_SUMMARY = 'このアプリの対応データをクラウドに保存し、複数の環境で同期できます。詳しい使い方は下の項目から確認できます。';

  const HELP_SECTIONS = Object.freeze([
    Object.freeze({
      title: '接続方法',
      paragraphs: Object.freeze(['最初の同期']),
      steps: Object.freeze([
        'Cruise Portを開く', 'クラウド同期を開く', 'クラウド同期をはじめる',
        '復旧コードを安全な場所へ保存する', '各Proアプリを開く', '画面の案内に沿って接続する'
      ]),
      secondaryTitle: '別の環境を追加',
      secondarySteps: Object.freeze([
        'Cruise Portでクラウド同期を開く', '対象アプリの「別の環境を追加」を押す',
        'コード画面を開いたまま、追加するブラウザまたはPWAを開く',
        '設定の「Cruise Portと接続」を押す', 'コードを入力して「接続する」を押す',
        '接続完了を確認してコード画面を閉じる'
      ])
    }),
    Object.freeze({
      title: '復旧と環境管理',
      paragraphs: Object.freeze([
        '復旧コードは、同期中の環境をすべて失った場合にクラウド同期を取り戻すためのコードです。現在有効なコードは1つだけです。新しいコードを発行すると、以前のコードは使えなくなります。運営者へ送らず、安全な場所へ保存してください。',
        '環境とは、同期に接続したブラウザ、ブラウザプロファイル、またはホーム画面版/PWAです。同じ端末でも保存領域が異なる場合は別の環境として表示されます。環境を解除しても、端末内とクラウドのデータは削除されません。',
        '復旧コードと同期中の環境の両方を失った場合、クラウド同期を復旧できないことがあります。'
      ])
    }),
    Object.freeze({
      title: 'オフライン・競合・エラー',
      paragraphs: Object.freeze([
        'オフライン中の変更はこの環境に保存され、接続が戻ると自動で同期を再開します。',
        '同じ項目がこの環境とクラウドの両方で変更された場合は、自動で上書きせず確認画面で停止します。内容を比較して残す側を選んでください。',
        '「確認が必要」「一時停止中」「再接続が必要」と表示された場合は、画面の案内に沿って確認または再接続してください。'
      ])
    }),
    Object.freeze({
      title: '解除・削除',
      paragraphs: Object.freeze([
        '環境の同期解除は、その環境の同期資格だけを無効にします。',
        'アプリ単位の削除は対象アプリのクラウドデータ、Account全体の削除は4アプリすべてのクラウドデータを対象にします。削除を確定すると同期中の環境は解除され、クラウドデータは7日後に完全削除の対象になります。',
        '環境の解除やクラウドデータの削除を行っても、端末内のデータは自動では削除されません。'
      ])
    }),
    Object.freeze({
      title: 'データとプライバシー',
      paragraphs: Object.freeze([
        '氏名・メールアドレスなど、個人を直接特定する情報の登録は必要ありません。',
        'クラウド同期を利用すると、アプリ内で保存した同期対象データと、同期に必要な識別子・更新日時などの技術情報がクラウドに保存されます。',
        '同期の提供、保護、不正利用防止のため、Cloudflare Workers、Cloudflare D1、Cloudflare Turnstileを利用します。'
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

  function appendSteps(document, parent, steps) {
    const list = document.createElement('ol');
    list.className = 'sound-cruise-sync-help-steps';
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
        if (section.steps) appendSteps(document, content, section.steps);
        if (section.secondaryTitle) appendText(document, content, 'h4', '', section.secondaryTitle);
        if (section.secondarySteps) appendSteps(document, content, section.secondarySteps);
        if (section.title === 'データとプライバシー') {
          const link = appendText(document, content, 'a', 'sound-cruise-sync-help-link', 'プライバシーポリシーを確認');
          link.href = privacyHref;
        }
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
    card.className = 'sound-cruise-sync-settings-card sound-cruise-sync-settings-card--accordion';
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
    const statusLabel = displayStatusLabel(options.state, status, options.statusLabel);
    appendText(document, toggle, 'span', 'sound-cruise-sync-settings-header-status', statusLabel);
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

  global.SoundCruiseSyncUI = Object.freeze({
    STATUS, APP_HELP_SUMMARY, HELP_SECTIONS, renderCard, openHelp, createJoinDialog,
    temporaryFeedbackMs: 5000
  });
})(globalThis);
