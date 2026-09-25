// Deterministic checks on an AI support reply before it reaches a user (AI1-C acceptance fix).
//
// The system prompt describes the real UI, but correctness does not depend on the model: every
// final reply is checked here. A reply that describes UI Cruise Port does not have, leaks internal
// field or tool names, or contains tool syntax is never shown; the chat loop asks the model to
// rewrite it once, and otherwise returns GUARD_FALLBACK_REPLY. Only violation category names leave
// this module; the reply text is never logged or stored.

import { containsFullId, containsSecret } from './secret-detector.js';

// Names the user wrote (「…」) may legitimately contain any word, so term checks skip quoted text.
function withoutQuotedNames(text) {
  return text.replace(/「[^」\n]{0,80}」/g, '「」');
}

const RULES = Object.freeze([
  // 「もう一度確認」 exists only in the app row's ⓘ. It is wrong only when tied to a sync target.
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
  Object.freeze({ category: 'full_id', scope: 'full', pattern: { test: containsFullId } })
]);

export const GUARD_CATEGORIES = Object.freeze([...new Set(RULES.map((rule) => rule.category))]);

// Returns { ok, violations: [category, ...] } — categories only, never the matched text.
export function validateSupportReply(text) {
  const reply = typeof text === 'string' ? text : '';
  const unquoted = withoutQuotedNames(reply);
  const violations = [];
  for (const rule of RULES) {
    if (violations.includes(rule.category)) continue;
    if (rule.pattern.test(rule.scope === 'unquoted' ? unquoted : reply)) violations.push(rule.category);
  }
  return { ok: violations.length === 0, violations };
}

// Fixed text for the one repair request. Categories come from GUARD_CATEGORIES only, so nothing
// user-written (a message, a sync target name, the reply) is ever part of this instruction.
const CATEGORY_HINTS = Object.freeze({
  per_target_recheck: '「もう一度確認」を同期先や端末に結び付けて書いた（実際は対象アプリの行の ⓘ に表示される場合がある）',
  target_selection: '同期先や端末を「選んで」操作するような、存在しない手順を書いた',
  resync_button: '再同期・手動同期のボタンなど、存在しない操作を書いた',
  login: 'ログイン・サインインなど、存在しない仕組みを書いた',
  url: 'URL やアドレスを書いた',
  tool_syntax: 'ツール名やツールの記法を書いた',
  internal_term: '英語の状態名や内部の項目名（snapshot、reference など）を書いた',
  secret_like: '4桁の番号やコードのように見える数字・文字の並びを書いた（番号やコードは書かない）',
  full_id: 'IDのように見える長い英数字の並びを書いた（IDは書かない）'
});

export function repairInstruction(violations) {
  const hints = violations.filter((category) => CATEGORY_HINTS[category]).map((category) => `- ${CATEGORY_HINTS[category]}`);
  return [
    '【修正依頼】直前の回答には、Cruise Port に存在しない画面・操作の案内、または利用者に見せてはいけない表記が含まれていました。',
    ...hints,
    '存在しないUI案内を削除し、確認済みのUIだけを使って回答全体を書き直してください。',
    '「もう一度確認」は、対象アプリの行にある ⓘ を開いたときに表示される場合があるボタンです。例：「コードクルーズの行にある ⓘ を開き、『もう一度確認』が表示されている場合はタップしてください。」',
    'ツール結果はすでに上にあります。ツールは呼ばず、プレーンテキストの日本語で、最初の回答と同じ内容の案内を正確に書き直してください。'
  ].join('\n');
}

// Shown when the repaired reply still fails. It claims nothing about the diagnostics (no cause,
// no data loss, no stopped sync) and names only UI that exists.
export const GUARD_FALLBACK_REPLY = '正確な操作手順をまとめられませんでした。Cruise Port の同期センターで、対象アプリの行にある ⓘ を開いて状態を確認してください。「もう一度確認」が表示されている場合はタップしてください。解決しない場合は、同期センター下部の「クラウド同期で困ったときは」からメールでお問い合わせください。';
