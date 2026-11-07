// Shared output checks: runtime explanation sentences and archived evaluation fixtures.
// Runtime operations now use verified action IDs (ai-support-actions.js), without model repair.
// A rejected explanation sentence no longer discards the whole answer or triggers inference.

import { containsFullId, containsSecret } from './secret-detector.js';
import { uiGuidanceViolations } from './ai-support-ui-guidance.js';

// Names the user wrote (「…」) may legitimately contain any word, so term checks skip quoted text.
function withoutQuotedNames(text) {
  return text.replace(/「[^」\n]{0,80}」/g, '「」');
}

const RULES = Object.freeze([
  // 「もう一度確認」 exists only in the app row's 「同期先」. It is wrong only when tied to a sync target.
  Object.freeze({ category: 'per_target_recheck', scope: 'full',
    pattern: /(同期先|端末)(ごと|の横|の行|の中|の欄)?(に|の|で)[^。\n]{0,8}「?もう一度確認/ }),
  Object.freeze({ category: 'per_target_recheck', scope: 'full',
    pattern: /(もう一度確認|再確認)[^。\n]{0,6}(ボタン)?[^。\n]{0,4}(が|は)?[^。\n]{0,4}(各|それぞれの)(同期先|端末)(ごと)?に/ }),
  Object.freeze({ category: 'target_selection', scope: 'full',
    pattern: /を選(んで|び|択して|択し)[^。\n]{0,24}(確認|タップ|押|再確認|もう一度)/ }),
  Object.freeze({ category: 'resync_button', scope: 'full', pattern: /再同期|手動で同期|同期ボタン|「同期する」|同期を(再開|開始)する(ボタン|操作)/ }),
  Object.freeze({ category: 'login', scope: 'full', pattern: /ログイン|サインイン|サインアウト|ログアウト/ }),
  Object.freeze({ category: 'url', scope: 'full', pattern: /https?:\/\/|www\.|mailto:|\b[a-z0-9-]+\.(com|jp|net|org|io|dev)\b/i }),
  Object.freeze({ category: 'tool_syntax', scope: 'full',
    pattern: /<\/?(tool|system|function)[^>]*>|\{\s*"(role|name|arguments|tool)"|getSyncOverview|getAppSyncTargets|toModelToolResult/ }),
  Object.freeze({ category: 'internal_term', scope: 'unquoted',
    pattern: /\b(reference|ref|snapshot|snapshotState|removalSafety|reportState|attentionCount|cloudState|displayStatus|displayLabel|nameSource|userControlledPaths|pending|clean|unverified|mismatch|attention|contractVersion|appId)\b|スナップショット/i }),
  // A reply that looks like it holds a code is never shown (it would also block the next turn,
  // since the reply comes back as history) and is never sent back to the model as-is.
  Object.freeze({ category: 'secret_like', scope: 'full', pattern: { test: containsSecret } }),
  Object.freeze({ category: 'full_id', scope: 'full', pattern: { test: containsFullId } }),
  // Output that is not a sentence at all (e.g. 900 「!」 in a row, seen in production).
  Object.freeze({ category: 'degenerate_output', scope: 'full', pattern: { test: (text) => isDegenerateReply(text) } })
]);

// Degenerate model output: only obviously broken text, never style. Whitespace is ignored; a
// "meaningful" character is any letter or digit in any script (kana, kanji, ー, Latin, digits).
// A reply is degenerate when one non-meaningful character repeats 20+ times in a row (「!!!…」,
// 「！！！…」, 「! ! ! …」), when 20+ characters hold no meaningful character at all, or when 40+
// characters are less than 10% meaningful. 「はい！」「確認が必要です！」 and normal sentences pass.
const MEANINGFUL = /[\p{L}\p{N}]/u;
const DEGENERATE_RUN = 20;
export function isDegenerateReply(text) {
  const chars = [...String(text ?? '').replace(/\s+/gu, '')];
  if (!chars.length) return false;
  let run = 0;
  let meaningful = 0;
  for (let index = 0; index < chars.length; index += 1) {
    if (MEANINGFUL.test(chars[index])) {
      meaningful += 1;
      run = 0;
      continue;
    }
    run = index > 0 && chars[index] === chars[index - 1] ? run + 1 : 1;
    if (run >= DEGENERATE_RUN) return true;
  }
  if (chars.length >= 20 && meaningful === 0) return true;
  return chars.length >= 40 && meaningful / chars.length < 0.1;
}

// Returns { ok, violations: [category, ...] } — categories only, never the matched text.
export function validateSupportReply(text, context = {}) {
  const reply = typeof text === 'string' ? text : '';
  const unquoted = withoutQuotedNames(reply);
  const violations = [];
  for (const rule of RULES) {
    if (violations.includes(rule.category)) continue;
    if (rule.pattern.test(rule.scope === 'unquoted' ? unquoted : reply)) violations.push(rule.category);
  }
  for (const category of uiGuidanceViolations(reply, context)) if (!violations.includes(category)) violations.push(category);
  return { ok: violations.length === 0, violations };
}

// Sensitive model output is never re-sent. This reply claims no cause or diagnostic state.
export const GUARD_FALLBACK_REPLY = '回答を安全に表示できませんでした。相談画面下部の「メールで報告」からお問い合わせください。番号・復旧コード・接続コードは書かないでください。';
