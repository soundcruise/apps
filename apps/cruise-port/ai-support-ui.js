import { AI_SUPPORT_COPY, AI_SUPPORT_LIMITS, charCount, containsSensitive } from './ai-support-client.js?v=0.68.0';

// The 「AIに相談」 panel inside Sync Center's support section (AI1-C). It lives outside the rows
// that Sync Center re-renders, so a conversation survives a status refresh but not a page reload:
// turns are kept in this closure only (no Web Storage, IndexedDB or cookies). Every message, the
// AI's included, is written with textContent; nothing is parsed as HTML or Markdown.

export const AI_PANEL_COPY = Object.freeze({
  open: 'AIに相談',
  title: 'AIに相談',
  subtitle: 'クラウド同期の状態を確認しながら、解決方法をご案内します。',
  // Always visible, short. The full disclosure (privacy, memory) is one tap away under ⓘ.
  summary: '送信した内容は Cloudflare Workers AI で処理され、Cruiseには保存されません。',
  infoToggle: 'AI相談について',
  // Mirrors privacy.html#ai-support. Pressing 送信 is the consent; there is no separate dialog.
  privacy: '送信すると、相談内容・直近の会話・同期状態の要約・同期先の表示名などを、Cloudflare Workers AI で処理します。4桁の番号や復旧コードなどが含まれる場合は、自動で検出してAIへ送りません。',
  privacyLink: 'プライバシーポリシー',
  memory: 'Cruiseは相談内容をサーバーにも端末にも保存しません。ページを閉じたり更新したりすると会話は消えます。AIの回答は誤ることがあります。',
  inputLabel: '相談内容',
  codesWarning: '4桁の番号・復旧コード・接続コードなどは入力しないでください。',
  placeholder: '例：コードクルーズが「確認が必要」になっています',
  send: '送信',
  sending: 'AIが同期状態を確認しています…',
  thinking: '回答を確認しています…',
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
  enterSends = () => !globalThis.matchMedia?.('(pointer: coarse)')?.matches
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
  const infoToggle = node('button', 'sync-center-ai-info-toggle', 'ⓘ');
  infoToggle.type = 'button';
  infoToggle.setAttribute('aria-label', AI_PANEL_COPY.infoToggle);
  infoToggle.setAttribute('aria-expanded', 'false');
  infoToggle.setAttribute('aria-controls', `${id}-details`);
  summary.append(node('p', 'sync-center-ai-summary-text', AI_PANEL_COPY.summary), infoToggle);
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
  details.append(privacy, memory);
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
  container.append(openButton, panel);

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
    log.scrollTop = log.scrollHeight;
    return item;
  }

  // A visible "thinking" bubble while the reply is on its way (status text alone was easy to miss).
  function appendPending() {
    const item = node('div', 'sync-center-ai-message sync-center-ai-message--ai sync-center-ai-message--pending');
    item.setAttribute('aria-hidden', 'true'); // the status line already announces it
    item.append(node('span', 'sync-center-ai-speaker', AI_PANEL_COPY.ai));
    const line = node('p', 'sync-center-ai-thinking');
    const dots = node('span', 'sync-center-ai-dots');
    dots.append(node('span', null, ''), node('span', null, ''), node('span', null, ''));
    line.append(dots, node('span', 'sync-center-ai-thinking-text', AI_PANEL_COPY.thinking));
    item.append(line);
    log.append(item);
    log.scrollTop = log.scrollHeight;
    return item;
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
    status.textContent = AI_PANEL_COPY.sending;
    panel.setAttribute('aria-busy', 'true');
    const pending = appendPending();
    refreshControls();
    let result;
    try {
      result = await client.send({ message, history, signal: controller?.signal });
    } catch (_) {
      result = { ok: false, kind: 'failed' };
    }
    pending.remove?.();
    sending = null;
    panel.removeAttribute('aria-busy');
    status.textContent = '';
    if (result.ok) {
      turns.push({ role: 'user', content: message }, { role: 'assistant', content: result.reply });
      appendMessage('assistant', result.reply);
    } else {
      // The unanswered message stays visible, is not part of the history, and is offered again.
      bubble.append(node('span', 'sync-center-ai-unsent', AI_PANEL_COPY.unsent));
      if (!input.value) input.value = message;
      showError(AI_SUPPORT_COPY[result.kind] || AI_SUPPORT_COPY.failed);
    }
    refreshControls();
    if (panel.contains?.(globalThis.document?.activeElement) || globalThis.document?.activeElement === sendButton) input.focus();
  }

  function open(from = openButton) {
    opener = from;
    panel.hidden = false;
    openButton.setAttribute('aria-expanded', 'true');
    refreshControls();
    panel.scrollIntoView?.({ block: 'nearest' });
    input.focus();
  }
  function close() {
    panel.hidden = true;
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
