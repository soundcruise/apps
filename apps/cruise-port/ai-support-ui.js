import { AI_SUPPORT_COPY, AI_SUPPORT_LIMITS, charCount, containsSecret } from './ai-support-client.js?v=0.67.0';

// The 「AIに相談」 panel inside Sync Center's support section (AI1-C). It lives outside the rows
// that Sync Center re-renders, so a conversation survives a status refresh but not a page reload:
// turns are kept in this closure only (no Web Storage, IndexedDB or cookies). Every message, the
// AI's included, is written with textContent; nothing is parsed as HTML or Markdown.

export const AI_PANEL_COPY = Object.freeze({
  open: 'AIに相談',
  title: 'AIに相談',
  subtitle: 'クラウド同期の状態を確認しながら、解決方法をご案内します。',
  privacy: '入力した相談内容と、問題解決に必要な同期状態・同期先の表示名などを、Cloudflare Workers AI で処理します。4桁の番号、復旧コード、接続コードは入力しないでください。',
  memory: '相談内容は保存されません。ページを閉じたり更新したりすると消えます。AIの回答は誤ることがあります。',
  inputLabel: '相談内容',
  placeholder: '例：コードクルーズが「確認が必要」になっています',
  send: '送信',
  sending: 'AIが同期状態を確認しています…',
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
export function createAiSupportPanel({
  container,
  client,
  mailHref,
  isOnline = () => globalThis.navigator?.onLine !== false,
  enterSends = () => !globalThis.matchMedia?.('(pointer: coarse)')?.matches
}) {
  const turns = []; // { role: 'user' | 'assistant', content } — memory only
  let sending = null; // { controller } while a request is in flight (single-flight)
  let opener = null;
  const id = 'sync-center-ai';

  const openButton = node('button', 'action-button primary-action sync-center-ai-open', AI_PANEL_COPY.open);
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
  const privacy = node('p', 'sync-center-ai-privacy', AI_PANEL_COPY.privacy);
  const memory = node('p', 'sync-center-ai-memory', AI_PANEL_COPY.memory);
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
  input.setAttribute('aria-describedby', `${id}-counter`);
  const sendButton = node('button', 'action-button primary-action sync-center-ai-send', AI_PANEL_COPY.send);
  sendButton.type = 'submit';
  const cancelButton = node('button', 'action-button secondary-action sync-center-ai-cancel', AI_PANEL_COPY.cancel);
  cancelButton.type = 'button';
  cancelButton.hidden = true;
  const actions = node('div', 'sync-center-ai-actions');
  actions.append(counter, cancelButton, sendButton);
  form.append(label, input, actions);

  const footer = node('p', 'sync-center-ai-footer');
  const mail = node('a', 'sync-center-ai-mail', AI_PANEL_COPY.footerLink);
  if (mailHref) mail.href = mailHref;
  footer.append(AI_PANEL_COPY.footerLead, mail, AI_PANEL_COPY.footerTail);

  panel.append(header, privacy, memory, log, status, error, form, footer);
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

  async function send() {
    if (sending) return; // single-flight: one request at a time, replies in order
    const message = input.value.trim();
    if (!message) return;
    if (!isOnline()) { showError(AI_SUPPORT_COPY.offline); return; }
    if (charCount(message) > AI_SUPPORT_LIMITS.maxUserChars) { showError(AI_SUPPORT_COPY.tooLong); return; }
    if (containsSecret(message)) { showError(AI_SUPPORT_COPY.secret); return; } // left unchanged for the user
    showError('');
    const history = turns.slice();
    const bubble = appendMessage('user', message);
    input.value = '';
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    sending = { controller };
    status.textContent = AI_PANEL_COPY.sending;
    panel.setAttribute('aria-busy', 'true');
    refreshControls();
    let result;
    try {
      result = await client.send({ message, history, signal: controller?.signal });
    } catch (_) {
      result = { ok: false, kind: 'failed' };
    }
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
