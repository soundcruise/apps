// One secret-like text detector for everything that may reach an AI provider (AI1-C blocker fix):
// the user's message and history, earlier AI replies, sync target names in diagnostics, and a
// reply sent back for repair. It is a safety net, not the only boundary — diagnostics never carry
// credentials to begin with. Cruise Port mirrors the block below byte for byte
// (apps/cruise-port/ai-support-client.js; a parity test compares the sources).
//
// Strong formats (recovery, join and QA codes, credential tokens) are always secret. A 4-digit
// code (Pro passcode, PIN) is secret only in context, within one sentence:
// - a strong context (Proの番号, 暗証番号, PIN, パスコード, 認証番号, 接続コード, 復旧コード,
//   コードは / コード:, 4桁 ...) before exactly 4 digits, split by spaces, hyphens, slashes,
//   dots or colons: 「PINは1:2:3:4」「コードは1.2.3.4」「Proコードは12/34」, or the same strong
//   context right after the digits with only a particle between: 「12/34がPINです」;
// - any context word (also Pro, ログイン, a standalone コード; never a bare 番号) near exactly 4 digits split
//   only by spaces or hyphens: 「Proの番号は 12 34」「1234 がProの番号」.
// Numbers followed by a unit (2026年), dates, times and versions without a strong context
// (2026/09/25, 12:34, v1.2.3.4) and context-free numbers (エラー404, HTTP 500) are not secret.
// 「コード」 inside a word (コードクルーズ) is not a context.
//
// containsFullId: a canonical UUID or a run of 32+ hex characters (the shape of every Account
// and device ID), for text that must never carry a full ID.

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
// A bare 番号 is not a context: 同期先の番号, 端末番号, 管理番号 are ordinary. Secret numbers are
// named explicitly above (Proの番号, 暗証番号, 認証番号, 4桁の番号 ...).
const WEAK_WORDS = [latin('Pro'), 'プロ', 'ログイン', 'ピン', 'コード(?![ァ-ヺー])'];
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

// Worker-only (not mirrored): exact comparison with the IDs known for the authenticated Account.
// Case, width and every separator are ignored (「4714BF0C_F6BB/…」 is the same ID), but only
// those exact IDs match, so ordinary text is never turned into a false full ID.
export function normalizeIdText(text) {
  return typeof text === 'string' ? text.normalize('NFKC').toLowerCase().replace(/[^0-9a-z]/g, '') : '';
}
export function createKnownIdMatcher(ids = []) {
  const known = [...new Set((ids || []).map(normalizeIdText).filter((id) => id.length >= 16))];
  return (text) => typeof text === 'string' && known.length > 0 && known.some((id) => normalizeIdText(text).includes(id));
}
