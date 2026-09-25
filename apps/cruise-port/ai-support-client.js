// Cruise Port side of AI support (Cloud Sync UX 2.0 AI1-C). No DOM here.
//
// The Port sends only { message, history } to our Worker (POST /v2/ai-support/chat). The Worker
// authenticates the Account and Pro credentials, reads diagnostics itself, and calls the model; no
// credential or diagnostic data ever goes from the Port to a model. Nothing is stored: the
// conversation lives in the caller's memory only.

export const AI_SUPPORT_PATH = '/v2/ai-support/chat';
export const AI_SUPPORT_LIMITS = Object.freeze({ maxTurns: 20, maxUserChars: 2000, maxAssistantChars: 4000 });

// Mirrors the Worker's detector (workers/sound-cruise-sync/src/secret-detector.js); a parity test
// compares the two blocks byte for byte. The Worker check stays the authority.
// --- mirror start (keep identical in apps/cruise-port/ai-support-client.js) ---
const CODE_ALPHABET = '0-9A-HJKMNP-TV-Z';
const STRUCTURED_CODE = new RegExp(`(SAR1|SCJ1|SCE1|SQA1)[${CODE_ALPHABET}]{20}`, 'i');
const CREDENTIAL_TOKEN = /\b(sca1|scd1|sch1|scq1|scr1|sdi1|sadi1|sarc1|scp1)\.[0-9a-f]{8}-/i;
const LEGACY_RECOVERY = new RegExp(`(^|[^0-9A-Z])([${CODE_ALPHABET}]{4}[\\s-]?){4}[${CODE_ALPHABET}]{4}($|[^0-9A-Z])`, 'i');

// Text is NFKC-normalized first, so full-width digits, colons, slashes and spaces are ASCII here.
const APP_NAMES = /コード\s*クルーズ|chord\s*cruise/gi;
const latin = (word) => `(?<![A-Za-z])${word}(?![A-Za-z])`;
const STRONG_WORDS = [
  `(?:${latin('Pro')}|プロ)版?の?(?:番号|コード|暗証番号|パスコード)`, '暗証', latin('PIN'), 'パスコード', 'パスワード',
  latin('passcode'), latin('password'), '認証(?:番号|コード)', '接続コード', '復旧コード', '[4四]桁', 'コード\\s*(?:は|:)'
];
const WEAK_WORDS = [latin('Pro'), 'プロ', '番号', 'ログイン', 'ピン', 'コード(?![ァ-ヺー])'];
const STRONG_CONTEXT = new RegExp(STRONG_WORDS.join('|'), 'gi');
const ANY_CONTEXT = new RegExp([...STRONG_WORDS, ...WEAK_WORDS].join('|'), 'gi');
const DIGIT_RUN = /(?<!\d)\d(?:[ \t\-‐‒–—/.:・]{0,3}\d)*(?!\d)/g;
const JOINER = /[/.:・]/;
const UNIT_AFTER = /^\s*(年|月|日|件|回|円|%|時|分|秒|個|曲|人|行|ページ|バージョン|MB|KB|GB|ms|px)/i;
const SENTENCE = /[^。！？!?]+/g;
const SPLIT_WINDOW = 18;
const JOINED_WINDOW = 12;
// 「12/34がPINです」: a strong context right after the digits, joined only by spaces, light
// punctuation, closing quotes and a topic/subject particle (が, は, も, って, とは, という).
const REVERSE_GAP = /^[\s、,」』)）"']{0,3}(?:が|は|も|って|とは|という|=)?[\s、,]{0,3}$/;

function matches(pattern, text) {
  return [...text.matchAll(pattern)].map((match) => ({ start: match.index, end: match.index + match[0].length, text: match[0] }));
}

function sentenceHasCode(sentence) {
  const strong = matches(STRONG_CONTEXT, sentence);
  const any = matches(ANY_CONTEXT, sentence);
  if (!any.length) return false;
  for (const run of matches(DIGIT_RUN, sentence)) {
    if (run.text.replace(/\D/g, '').length !== 4 || UNIT_AFTER.test(sentence.slice(run.end))) continue;
    if (JOINER.test(run.text)) {
      // 12/34, 1.2.3.4, 1:2:3:4 look like dates, versions and times, so only a strong context
      // right before them makes them a code.
      if (strong.some((context) => (context.end <= run.start && run.start - context.end <= JOINED_WINDOW) ||
        (run.end <= context.start && REVERSE_GAP.test(sentence.slice(run.end, context.start))))) return true;
    } else if (any.some((context) => (context.end <= run.start && run.start - context.end <= SPLIT_WINDOW) ||
      (run.end <= context.start && context.start - run.end <= SPLIT_WINDOW))) {
      return true;
    }
  }
  return false;
}

function codeNearContext(text) {
  const normalized = text.normalize('NFKC').replace(APP_NAMES, '〓');
  return (normalized.match(SENTENCE) || []).some(sentenceHasCode);
}

export function containsSecret(text) {
  if (typeof text !== 'string' || !text) return false;
  const compact = text.replace(/[\s-]/g, '');
  return STRUCTURED_CODE.test(compact) || CREDENTIAL_TOKEN.test(text) || LEGACY_RECOVERY.test(text) ||
    codeNearContext(text);
}

const FULL_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const LONG_HEX = /(?<![0-9a-f])[0-9a-f]{32,}(?![0-9a-f])/i;
export function containsFullId(text) {
  if (typeof text !== 'string' || !text) return false;
  const normalized = text.normalize('NFKC');
  return FULL_UUID.test(normalized) || LONG_HEX.test(normalized);
}

// Anything that must not reach a model: a secret-like code or a full ID.
export function containsSensitive(text) {
  return containsSecret(text) || containsFullId(text);
}
// --- mirror end ---

export function charCount(text) {
  return typeof text === 'string' ? [...text].length : 0;
}

// The Pro credential saved by shared/pro-gate.js (read-only; same shape check as the gate).
const PRO_AUTH_KEY = 'soundCruiseProAuth';
const PRO_TOKEN = /^scp1\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/;
export function readProCredential(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem?.(PRO_AUTH_KEY) || 'null');
    return value?.v === 2 && typeof value.credential === 'string' && PRO_TOKEN.test(value.credential)
      ? value.credential : null;
  } catch (_) {
    return null;
  }
}

// AI support is a Pro beta. The Port shows it only on the Pro edition, with Sync Center enabled,
// and only when the beta is explicitly switched on for this page (a config flag, or the
// ?sound-cruise-ai-beta=1 opt-in on soundcruise.jp). These switches only make the panel visible —
// they are UI discovery, never authorization. Who may use AI is decided by the Worker alone:
// AI_SUPPORT_MODE, the Pro credential, the Account credential and the beta Account allowlist.
export function readAiSupportConfig({ globalObject = globalThis, edition, syncConfig } = {}) {
  if (edition !== 'pro' || syncConfig?.enabled !== true || !syncConfig.endpoint) return Object.freeze({ enabled: false });
  const flag = globalObject?.__SOUND_CRUISE_AI_SUPPORT__?.enabled === true;
  const location = globalObject?.location;
  const optIn = location?.hostname === 'soundcruise.jp' &&
    new URLSearchParams(location.search || '').get('sound-cruise-ai-beta') === '1';
  return Object.freeze({ enabled: flag || optIn, endpoint: syncConfig.endpoint,
    admissionMode: syncConfig.admissionMode || 'qa' });
}

// Earlier turns in the server contract: user/assistant only, exact keys, bounded, most recent
// user turns kept (the current message is the 20th). Anything else is dropped, never sent.
export function buildHistory(turns) {
  const clean = [];
  for (const turn of Array.isArray(turns) ? turns : []) {
    if (!turn || !['user', 'assistant'].includes(turn.role) || typeof turn.content !== 'string') continue;
    const limit = turn.role === 'user' ? AI_SUPPORT_LIMITS.maxUserChars : AI_SUPPORT_LIMITS.maxAssistantChars;
    const content = [...turn.content].slice(0, limit).join('');
    if (content.trim()) clean.push({ role: turn.role, content });
  }
  const keep = AI_SUPPORT_LIMITS.maxTurns - 1;
  const userIndexes = clean.flatMap((turn, index) => (turn.role === 'user' ? [index] : []));
  const start = userIndexes.length > keep ? userIndexes[userIndexes.length - keep]
    : userIndexes.length ? userIndexes[0] : clean.length;
  return clean.slice(start);
}

export const AI_SUPPORT_COPY = Object.freeze({
  secret: '4桁の番号や復旧コードなどが相談内容に含まれている可能性があります。該当部分を削除してから、もう一度お試しください。',
  tooLong: `${AI_SUPPORT_LIMITS.maxUserChars}文字以内で入力してください。`,
  offline: 'インターネットに接続すると、AI相談を利用できます。',
  disabled: '現在、AI相談は利用できません。お手数ですが、メールでお知らせください。',
  notEntitled: '現在、AI相談はこのアカウントでは利用できません。',
  rateLimited: '短時間に多く送信されました。1分ほど待ってから、もう一度お試しください。',
  unavailable: 'AIが応答できませんでした。少し時間をおいてもう一度お試しいただくか、メールでお知らせください。',
  auth: 'Cruise Portの接続またはPro版の確認が必要です。同期センターの状態を確認してから、もう一度お試しください。',
  notConfigured: 'クラウド同期のアカウントが未設定のため、AI相談は利用できません。',
  cancelled: '送信を中止しました。',
  failed: '送信できませんでした。もう一度お試しいただくか、メールでお知らせください。'
});

// Server code → user-facing kind. Raw bodies are never shown.
export function errorKind(status, code) {
  if (code === 'ai_support_secret_detected') return 'secret';
  if (code === 'message_too_long') return 'tooLong';
  if (status === 429 || code === 'rate_limited') return 'rateLimited';
  if (code === 'ai_support_disabled') return 'disabled';
  if (code === 'ai_support_not_entitled') return 'notEntitled';
  if (code === 'ai_provider_unavailable' || code === 'ai_support_unavailable' || status >= 500) return 'unavailable';
  if ([401, 403, 410].includes(status)) return 'auth';
  return 'failed';
}

export function createAiSupportClient({
  endpoint,
  admissionMode = 'qa',
  accountRoot = globalThis.SoundCruiseSyncAccount,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  readPro = () => readProCredential()
} = {}) {
  return Object.freeze({
    // Returns { ok: true, reply } or { ok: false, kind }. Never throws for expected failures.
    async send({ message, history = [], signal } = {}) {
      const text = typeof message === 'string' ? message.trim() : '';
      if (!text) return { ok: false, kind: 'failed' };
      if (charCount(text) > AI_SUPPORT_LIMITS.maxUserChars) return { ok: false, kind: 'tooLong' };
      const sentHistory = buildHistory(history);
      if ([text, ...sentHistory.map((turn) => turn.content)].some(containsSensitive)) return { ok: false, kind: 'secret' };
      let account;
      try { account = await accountRoot?.storage?.getAccount?.(); } catch (_) { account = null; }
      const pro = readPro();
      if (!account?.accountCredential) return { ok: false, kind: 'notConfigured' };
      if (!pro) return { ok: false, kind: 'auth' };
      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json',
        Authorization: `Bearer ${account.accountCredential}`, 'X-Sound-Cruise-Pro-Authorization': `Bearer ${pro}` });
      if (admissionMode === 'qa') {
        try {
          const qa = await accountRoot?.storage?.getQaAdmission?.('port', null);
          if (qa?.qaCredential) headers.set('X-Sound-Cruise-QA-Authorization', `Bearer ${qa.qaCredential}`);
        } catch (_) { /* production UI never sends QA data */ }
      }
      let response;
      try {
        response = await fetchImpl(`${endpoint}${AI_SUPPORT_PATH}`, {
          method: 'POST', headers, body: JSON.stringify({ message: text, history: sentHistory }),
          credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal
        });
      } catch (error) {
        if (error?.name === 'AbortError') return { ok: false, kind: 'cancelled' };
        return { ok: false, kind: 'unavailable' };
      }
      let body = null;
      try { body = await response.json(); } catch (_) { body = null; }
      if (response.ok && body?.ok === true && typeof body.reply === 'string') return { ok: true, reply: body.reply };
      return { ok: false, kind: errorKind(response.status, body?.code) };
    }
  });
}
