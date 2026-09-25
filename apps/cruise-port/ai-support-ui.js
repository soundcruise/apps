import { AI_SUPPORT_COPY, AI_SUPPORT_LIMITS, charCount, containsSensitive } from './ai-support-client.js?v=0.70.0';

// The 「AIに相談」 panel inside Sync Center's support section (AI1-C). It lives outside the rows
// that Sync Center re-renders, so a conversation survives a status refresh but not a page reload:
// turns are kept in this closure only (no Web Storage, IndexedDB or cookies). Every message, the
// AI's included, is written with textContent; nothing is parsed as HTML or Markdown.

export const AI_PANEL_COPY = Object.freeze({
  open: 'AIに相談',
  title: 'AIに相談',
  subtitle: 'クラウド同期の状態を確認しながら、解決方法をご案内します。',
  // The disclosure (processing, privacy, memory) is one tap away under this button, next to the title.
  infoToggle: '送信内容の取り扱い',
  summary: '送信した内容は Cloudflare Workers AI で処理され、Cruiseには保存されません。',
  // Mirrors privacy.html#ai-support. Pressing 送信 is the consent; there is no separate dialog.
  privacy: '送信すると、相談内容・直近の会話・同期状態の要約・同期先の表示名などを、Cloudflare Workers AI で処理します。4桁の番号や復旧コードなどが含まれる場合は、自動で検出してAIへ送りません。',
  privacyLink: 'プライバシーポリシー',
  memory: 'Cruiseは相談内容をサーバーにも端末にも保存しません。ページを閉じたり更新したりすると会話は消えます。AIの回答は誤ることがあります。',
  inputLabel: '相談内容',
  codesWarning: '復旧コード・接続コードなどは入力しないでください。',
  placeholder: '例：コードクルーズが「確認が必要」になっています',
  send: '送信',
  // Read by screen readers only; the pending bubble shows three quiet dots instead of text.
  thinking: '回答を作成しています',
  cancel: '中止',
  close: '閉じる',
  you: 'あなた',
  ai: 'AI',
  unsent: '（送信できませんでした）',
  footerLead: '解決しない場合は、',
  footerLink: 'メールで報告',
  footerTail: 'からご相談ください。'
});

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

// container: the empty element in the support section. client: createAiSupportClient().
// privacy.html sits next to this module in both editions (Standard and Pro).
const DEFAULT_PRIVACY_HREF = new URL('./privacy.html#ai-support', import.meta.url).href;

export function createAiSupportPanel({
  container,
  client,
  mailHref,
  privacyHref = DEFAULT_PRIVACY_HREF,
  isOnline = () => globalThis.navigator?.onLine !== false,
  enterSends = () => !globalThis.matchMedia?.('(pointer: coarse)')?.matches,
  viewport = globalThis.visualViewport || null
}) {
  const turns = []; // { role: 'user' | 'assistant', content } — memory only
  let sending = null; // { controller } while a request is in flight (single-flight)
  let opener = null;
  const id = 'sync-center-ai';

  // Deliberately quiet: Cloud Sync's own actions stay the main controls.
  const openButton = node('button', 'sync-center-ai-open', AI_PANEL_COPY.open);
  openButton.type = 'button';
  openButton.setAttribute('aria-expanded', 'false');
  openButton.setAttribute('aria-controls', `${id}-panel`);

  const panel = node('section', 'sync-center-ai-panel');
  panel.id = `${id}-panel`;
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', `${id}-title`);
  const header = node('div', 'sync-center-ai-header');
  const titles = node('div', 'sync-center-ai-titles');
  const title = node('h3', 'sync-center-ai-title', AI_PANEL_COPY.title);
  title.id = `${id}-title`;
  titles.append(title, node('p', 'sync-center-ai-subtitle', AI_PANEL_COPY.subtitle));
  const closeButton = node('button', 'sync-center-ai-close', AI_PANEL_COPY.close);
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'AI相談を閉じる');
  header.append(titles, closeButton);
  const summary = node('div', 'sync-center-ai-summary');
  const infoToggle = node('button', 'sync-center-ai-info-toggle', AI_PANEL_COPY.infoToggle);
  infoToggle.type = 'button';
  infoToggle.setAttribute('aria-expanded', 'false');
  infoToggle.setAttribute('aria-controls', `${id}-details`);
  summary.append(infoToggle);
  const details = node('div', 'sync-center-ai-details');
  details.id = `${id}-details`;
  details.hidden = true;
  const privacy = node('p', 'sync-center-ai-privacy', AI_PANEL_COPY.privacy);
  const privacyLink = node('a', 'sync-center-ai-privacy-link', AI_PANEL_COPY.privacyLink);
  privacyLink.href = privacyHref;
  privacyLink.target = '_blank';
  privacyLink.rel = 'noopener';
  privacy.append(' ', privacyLink);
  const memory = node('p', 'sync-center-ai-memory', AI_PANEL_COPY.memory);
  details.append(node('p', 'sync-center-ai-summary-text', AI_PANEL_COPY.summary), privacy, memory);
  const log = node('div', 'sync-center-ai-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-label', 'AIとの会話');
  const status = node('p', 'sync-center-ai-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const error = node('p', 'sync-center-ai-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;

  const form = node('form', 'sync-center-ai-form');
  form.noValidate = true;
  const label = node('label', 'sync-center-ai-label', AI_PANEL_COPY.inputLabel);
  label.htmlFor = `${id}-input`;
  const input = node('textarea', 'sync-center-ai-input');
  input.id = `${id}-input`;
  input.rows = 3;
  input.placeholder = AI_PANEL_COPY.placeholder;
  input.setAttribute('enterkeyhint', 'send');
  const counter = node('span', 'sync-center-ai-counter', `0/${AI_SUPPORT_LIMITS.maxUserChars}`);
  counter.id = `${id}-counter`;
  const codesWarning = node('p', 'sync-center-ai-codes', AI_PANEL_COPY.codesWarning);
  codesWarning.id = `${id}-codes`;
  input.setAttribute('aria-describedby', `${id}-codes ${id}-counter`);
  const sendButton = node('button', 'action-button primary-action sync-center-ai-send', AI_PANEL_COPY.send);
  sendButton.type = 'submit';
  const cancelButton = node('button', 'action-button secondary-action sync-center-ai-cancel', AI_PANEL_COPY.cancel);
  cancelButton.type = 'button';
  cancelButton.hidden = true;
  const actions = node('div', 'sync-center-ai-actions');
  actions.append(counter, cancelButton, sendButton);
  form.append(label, codesWarning, input, actions);

  const footer = node('p', 'sync-center-ai-footer');
  const mail = node('a', 'sync-center-ai-mail', AI_PANEL_COPY.footerLink);
  if (mailHref) mail.href = mailHref;
  footer.append(AI_PANEL_COPY.footerLead, mail, AI_PANEL_COPY.footerTail);

  panel.append(header, summary, details, log, status, error, form, footer);
  // Empty room under the panel, sized only when needed so a bubble near the end of the page can
  // still be scrolled up to the top of the screen.
  const room = node('div', 'sync-center-ai-room');
  room.setAttribute('aria-hidden', 'true');
  container.append(openButton, panel, room);

  function showError(message) {
    error.textContent = message || '';
    error.hidden = !message;
  }
  function refreshControls() {
    const online = isOnline();
    const length = charCount(input.value);
    counter.textContent = `${length}/${AI_SUPPORT_LIMITS.maxUserChars}`;
    counter.classList?.toggle?.('sync-center-ai-counter--over', length > AI_SUPPORT_LIMITS.maxUserChars);
    sendButton.disabled = Boolean(sending) || !online || !input.value.trim() || length > AI_SUPPORT_LIMITS.maxUserChars;
    cancelButton.hidden = !sending;
    if (!sending) status.textContent = online ? '' : AI_SUPPORT_COPY.offline;
  }
  function appendMessage(role, content, { unsent = false } = {}) {
    const item = node('div', `sync-center-ai-message sync-center-ai-message--${role === 'user' ? 'user' : 'ai'}`);
    item.append(node('span', 'sync-center-ai-speaker', role === 'user' ? AI_PANEL_COPY.you : AI_PANEL_COPY.ai));
    item.append(node('p', 'sync-center-ai-text', content)); // textContent only
    if (unsent) item.append(node('span', 'sync-center-ai-unsent', AI_PANEL_COPY.unsent));
    log.append(item);
    return item;
  }

  // A quiet "thinking" bubble (three dots, no visible text) while the reply is on its way.
  function appendPending() {
    const item = node('div', 'sync-center-ai-message sync-center-ai-message--ai sync-center-ai-message--pending');
    item.append(node('span', 'sync-center-ai-speaker', AI_PANEL_COPY.ai));
    const line = node('p', 'sync-center-ai-thinking');
    const dots = node('span', 'sync-center-ai-dots');
    dots.setAttribute('aria-hidden', 'true');
    dots.append(node('span', null, ''), node('span', null, ''), node('span', null, ''));
    line.append(dots, node('span', 'sync-center-ai-sr-only', AI_PANEL_COPY.thinking));
    item.append(line);
    log.append(item);
    return item;
  }

  // Scrolling. The conversation flows in the page (the log has no scroll box of its own), so a
  // bubble is brought to the top with scrollIntoView; CSS scroll-margin-top keeps it clear of the
  // safe area. Nothing here touches location/history or moves focus.
  const reduceMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  function makeRoomBelow(element) {
    const doc = globalThis.document?.documentElement;
    if (!doc || !element?.getBoundingClientRect || !room.style) return;
    room.style.height = '0px'; // measure without the old room (the page may have been clamped by it)
    const height = Math.max(viewport?.height || 0, globalThis.innerHeight || 0, doc.clientHeight || 0);
    const top = pageTopOf(element);
    const missing = Math.ceil(top + height - doc.scrollHeight);
    room.style.height = `${Math.max(0, missing)}px`;
  }
  function scrollToTop(element) {
    makeRoomBelow(element);
    element?.scrollIntoView?.({ block: 'start', inline: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
  }
  // Positions in page (document) coordinates: the difference of two getBoundingClientRect values.
  function pageTopOf(element) {
    const doc = globalThis.document?.documentElement;
    const docTop = doc?.getBoundingClientRect?.().top ?? -(globalThis.scrollY || 0);
    return element.getBoundingClientRect().top - docTop;
  }
  // Grows (never shrinks) the room below so the page can scroll far enough for `element` to reach
  // the top of the screen. Growing only keeps the page height from jumping while the keyboard is up.
  function growRoomBelow(element) {
    const doc = globalThis.document?.documentElement;
    if (!doc || !element?.getBoundingClientRect || !room.style) return;
    const height = Math.max(viewport?.height || 0, globalThis.innerHeight || 0, doc.clientHeight || 0);
    const missing = Math.ceil(pageTopOf(element) + height - (doc.scrollHeight || 0));
    if (missing > 0) room.style.height = `${(parseFloat(room.style.height) || 0) + missing}px`;
  }
  // The keyboard itself is left to the browser: the input is brought near the top of the screen
  // before it opens (see open()), and tapping the input later only makes sure there is room below,
  // so iOS / Android can lift it above the keyboard even at the end of the page. No viewport math:
  // on iOS it depends on which viewport a value is measured against, and it overshot on device.
  input.addEventListener('focus', () => growRoomBelow(form));

  // While a reply is pending: did the user scroll somewhere on purpose? Then the finished reply
  // does not yank the page back unless the conversation is still on screen.
  let userScrolled = false;
  const markUserScroll = () => { userScrolled = true; };
  function watchUserScroll(on) {
    const method = on ? 'addEventListener' : 'removeEventListener';
    for (const type of ['wheel', 'touchmove']) globalThis[method]?.(type, markUserScroll, { passive: true });
  }
  function isOnScreen(element) {
    const rect = element?.getBoundingClientRect?.();
    if (!rect) return true;
    const height = viewport?.height || globalThis.innerHeight || 0;
    const top = viewport?.offsetTop || 0;
    return rect.bottom > top && rect.top < top + height;
  }

  async function send() {
    if (sending) return; // single-flight: one request at a time, replies in order
    const message = input.value.trim();
    if (!message) return;
    if (!isOnline()) { showError(AI_SUPPORT_COPY.offline); return; }
    if (charCount(message) > AI_SUPPORT_LIMITS.maxUserChars) { showError(AI_SUPPORT_COPY.tooLong); return; }
    if (containsSensitive(message)) { showError(AI_SUPPORT_COPY.secret); return; } // left unchanged for the user
    showError('');
    const history = turns.slice();
    const bubble = appendMessage('user', message);
    input.value = '';
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    sending = { controller };
    panel.setAttribute('aria-busy', 'true');
    const pending = appendPending();
    refreshControls();
    // Start reading from the question just sent; the dots and then the reply follow below it.
    scrollToTop(bubble);
    userScrolled = false;
    watchUserScroll(true);
    let result;
    try {
      result = await client.send({ message, history, signal: controller?.signal });
    } catch (_) {
      result = { ok: false, kind: 'failed' };
    }
    watchUserScroll(false);
    const followConversation = !userScrolled || isOnScreen(pending);
    pending.remove?.();
    sending = null;
    panel.removeAttribute('aria-busy');
    status.textContent = '';
    if (result.ok) {
      turns.push({ role: 'user', content: message }, { role: 'assistant', content: result.reply });
      const reply = appendMessage('assistant', result.reply);
      // Long replies are read from their first line, not from the end.
      if (followConversation) scrollToTop(reply);
    } else {
      // The unanswered message stays visible, is not part of the history, and is offered again.
      bubble.append(node('span', 'sync-center-ai-unsent', AI_PANEL_COPY.unsent));
      if (!input.value) input.value = message;
      showError(AI_SUPPORT_COPY[result.kind] || AI_SUPPORT_COPY.failed);
    }
    refreshControls();
    // Back to the input for the next question (preventScroll, so the reply stays at the top). On
    // touch screens this would reopen the keyboard over the reply, so the user taps the input instead.
    if (enterSends() && (panel.contains?.(globalThis.document?.activeElement) || globalThis.document?.activeElement === sendButton)) {
      input.focus({ preventScroll: true });
    }
  }

  function open(from = openButton) {
    opener = from;
    panel.hidden = false;
    openButton.setAttribute('aria-expanded', 'true');
    refreshControls();
    // Before the keyboard exists the screen and the visible area are the same, so this is exact:
    // bring 相談内容 to the top of the screen, then focus inside the tap (iOS opens the keyboard only
    // then). The input and 送信 are then already above where the keyboard will be.
    makeRoomBelow(form);
    form.scrollIntoView?.({ block: 'start', inline: 'nearest', behavior: 'auto' });
    input.focus({ preventScroll: true });
  }
  function close() {
    panel.hidden = true;
    if (room.style) room.style.height = '0px';
    openButton.setAttribute('aria-expanded', 'false');
    const target = opener && opener.isConnected !== false ? opener : openButton;
    opener = null;
    target.focus?.();
  }

  openButton.addEventListener('click', () => (panel.hidden ? open(openButton) : close()));
  infoToggle.addEventListener('click', () => {
    details.hidden = !details.hidden;
    infoToggle.setAttribute('aria-expanded', String(!details.hidden));
  });
  closeButton.addEventListener('click', close);
  cancelButton.addEventListener('click', () => {
    // Stops waiting on this device; the server may still finish the request.
    sending?.controller?.abort();
  });
  form.addEventListener('submit', (event) => { event.preventDefault(); void send(); });
  input.addEventListener('input', () => { showError(''); refreshControls(); });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    if (!enterSends()) return; // touch keyboards: Enter makes a new line, 送信 sends
    event.preventDefault();
    void send();
  });
  globalThis.addEventListener?.('online', refreshControls);
  globalThis.addEventListener?.('offline', refreshControls);
  refreshControls();

  return Object.freeze({
    open,
    close,
    isOpen: () => !panel.hidden,
    // For tests only: a copy, so callers cannot edit the conversation.
    turns: () => turns.map((turn) => ({ ...turn }))
  });
}
