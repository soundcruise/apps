// One secret-like text detector for everything that may reach an AI provider (AI1-C blocker fix):
// the user's message and history, earlier AI replies, sync target names in diagnostics, and a
// reply sent back for repair. It is a safety net, not the only boundary — diagnostics never carry
// credentials to begin with. Cruise Port mirrors this file (ai-support-client.js, parity-tested).
//
// Strong formats are always secret. A 4-digit code (Pro passcode, PIN) is secret only in context:
// a context word near exactly 4 digits, even when they are split ("12 34", "1 2 3 4", "12-34").
// Numbers followed by a unit (2026年, 3件) and digits without context (エラー404, HTTP 500,
// version 1234) are not.

const CODE_ALPHABET = '0-9A-HJKMNP-TV-Z';
const STRUCTURED_CODE = new RegExp(`(SAR1|SCJ1|SCE1|SQA1)[${CODE_ALPHABET}]{20}`, 'i');
const CREDENTIAL_TOKEN = /\b(sca1|scd1|sch1|scq1|scr1|sdi1|sadi1|sarc1|scp1)\.[0-9a-f]{8}-/i;
const LEGACY_RECOVERY = new RegExp(`(^|[^0-9A-Z])([${CODE_ALPHABET}]{4}[\\s-]?){4}[${CODE_ALPHABET}]{4}($|[^0-9A-Z])`, 'i');

// App names contain コード; they are masked so 「コードクルーズ」 is never a code context.
const APP_NAMES = /コード\s*クルーズ|chord\s*cruise/gi;
const CONTEXT = /Pro|プロ|4桁|４桁|四桁|暗証|PIN|ピン|パスコード|パスワード|passcode|password|認証番号|認証コード|番号|コード|ログイン/gi;
const DIGIT = '[0-9０-９]';
const SEP = '[ \\t\\u3000\\-‐－./:．／：]';
// A whole run of digits and separators; it is code-like only when it holds exactly 4 digits, so
// dates (2026-09-25) and long numbers are one run of 8+ digits and are left alone. Runs joined by
// . / : are versions, dates and times (0.67.0, 12/25, 13:22), never a typed code.
const DIGIT_RUN = new RegExp(`(?<![0-9０-９])${DIGIT}(?:${SEP}{0,3}${DIGIT})*(?![0-9０-９])`, 'g');
const DATE_TIME_JOINER = /[./:．／：]/;
const UNIT_AFTER = /^\s*(年|月|日|件|回|円|%|％|時|分|秒|個|曲|人|行|ページ|バージョン|MB|KB|GB|ms|px)/i;
const WINDOW = 18;

function codeNearContext(text) {
  const masked = text.replace(APP_NAMES, '〓');
  for (const context of masked.matchAll(CONTEXT)) {
    const start = Math.max(0, context.index - WINDOW);
    const end = Math.min(masked.length, context.index + context[0].length + WINDOW);
    const window = masked.slice(start, end);
    for (const run of window.matchAll(DIGIT_RUN)) {
      if (DATE_TIME_JOINER.test(run[0]) || run[0].replace(/[^0-9０-９]/g, '').length !== 4) continue;
      if (!UNIT_AFTER.test(window.slice(run.index + run[0].length))) return true;
    }
  }
  return false;
}

export function containsSecret(text) {
  if (typeof text !== 'string' || !text) return false;
  const compact = text.replace(/[\s-]/g, '');
  return STRUCTURED_CODE.test(compact) || CREDENTIAL_TOKEN.test(text) || LEGACY_RECOVERY.test(text) ||
    codeNearContext(text);
}
