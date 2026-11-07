// Only the application can turn operation IDs into instructions. No model-supplied label,
// route, target ID, button text or URL is interpolated into an operation sentence.
import { DIAGNOSTIC_APPS } from './ai-diagnostics.js';

const APPS = new Map(DIAGNOSTIC_APPS.map((app) => [app.id, app.name]));
export const SUPPORT_ACTION_IDS = Object.freeze(['inspect_targets', 'inspect_app', 'recheck_app', 'connect_app', 'check_network', 'contact_support', 'preserve_data']);
export const SUPPORT_QUESTIONS = Object.freeze({
  none: '', which_app: 'どのアプリの同期についてお困りですか？',
  which_environment: 'どの端末・ブラウザで起きていますか？',
  visible_state: 'そのアプリには、どのような同期状態が表示されていますか？'
});
export const SUPPORT_PLAN_FORMAT = Object.freeze({ type: 'json_schema', json_schema: {
  type: 'object', additionalProperties: false,
  properties: {
    explanation: { type: 'string', maxLength: 1200 },
    actions: { type: 'array', maxItems: 2, items: { type: 'object', additionalProperties: false,
      properties: { id: { type: 'string', enum: SUPPORT_ACTION_IDS }, appId: { type: 'string', enum: ['none', ...APPS.keys()] } }, required: ['id', 'appId'] } },
    questionId: { type: 'string', enum: Object.keys(SUPPORT_QUESTIONS) }
  }, required: ['explanation', 'actions', 'questionId']
} });
export const CONTACT_GUIDANCE = '相談画面下部の「メールで報告」からお問い合わせください。番号・復旧コード・接続コードは書かないでください。';
// Exact, audited FAQ intents only. Unrecognised phrasings still go through diagnosis + AI.
const FAQ = new Map([
  ['クラウド同期の問い合わせ先はどこですか', CONTACT_GUIDANCE],
  ['問い合わせ先を教えてください', CONTACT_GUIDANCE],
  ['原因を特定できない場合はどうすればよいですか解決しないときの問い合わせ方法も教えてください',
    '原因が分からない場合は、分かっている症状と、使っているアプリ・端末・表示されている同期状態をお知らせください。' + CONTACT_GUIDANCE],
  ['設定のサポートから自動修復できますか',
    'Cruise Portには「設定 → サポート」や自動修復の操作はありません。' + CONTACT_GUIDANCE]
]);
export function supportFaq(message) {
  return FAQ.get(message.normalize('NFKC').replace(/[。！？?\s]/g, '')) || null;
}

export function chooseSupportApp(message, overview, history = []) {
  const named = DIAGNOSTIC_APPS.filter((app) => message.includes(app.name));
  if (named.length === 1) return named[0].id;
  if (named.length > 1) return null;
  // History can identify the app, never its current state or visibility conditions.
  for (const turn of [...history].reverse().filter((turn) => turn.role === 'user')) {
    const previous = DIAGNOSTIC_APPS.filter((app) => turn.content.includes(app.name));
    if (previous.length === 1) return previous[0].id;
    if (previous.length > 1) break;
  }
  const needsAttention = (overview.apps || []).filter((app) => ['attention', 'recheck', 'syncing', 'connecting'].includes(app.displayStatus));
  return needsAttention.length === 1 ? needsAttention[0].appId : null;
}

// The same two diagnostic tools remain unchanged. Only their provider-bound projection drops
// user-controlled names and short IDs: the AI can reason from states without device names or identifiers.
export function supportModelData(data) {
  const project = (app) => Object.fromEntries(Object.entries(app || {}).filter(([key]) =>
    ['appId', 'appName', 'cloudState', 'displayStatus', 'displayLabel', 'snapshotState', 'attentionCount', 'reportCounts', 'activeTargetCount'].includes(key)));
  if (Array.isArray(data?.apps)) return { accountState: data.accountState, apps: data.apps.map(project) };
  return { accountState: data.accountState, app: project(data.app), targets: (data.targets || []).map((target) => ({
    reportState: target.reportState, reportedAt: target.reportedAt, attentionCount: target.attentionCount
  })) };
}

export function decodeSupportPlan(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  let plan;
  try { plan = JSON.parse(raw); } catch {
    return { explanation: '', actions: [], questionId: 'none', malformed: true };
  }
  if (!plan || Array.isArray(plan) || typeof plan !== 'object' ||
      Object.keys(plan).some((key) => !['explanation', 'actions', 'questionId'].includes(key)) ||
      typeof plan.explanation !== 'string' || !Array.isArray(plan.actions) || plan.actions.length > 2 ||
      !Object.hasOwn(SUPPORT_QUESTIONS, plan.questionId)) {
    return { explanation: '', actions: [], questionId: 'none', malformed: true };
  }
  return { explanation: plan.explanation, actions: plan.actions, questionId: plan.questionId, malformed: false };
}

// A role boundary, not a list of bad UI names. Descriptions are statements; every operational
// sentence (including a *correct* route) belongs to the verified action channel instead.
// Filter sentences individually so one misplaced instruction does not discard useful prose.
const OPERATIONAL = /[→⇒>ⓘ]|画面|ボタン|メニュー|リンク|設定|同期センター|(?:を|へ)(?:開|押|選|入力|送信|移動)|タップ|クリック|(?:してください|してみて|しなければ|しましょう|ください)|選択|操作|変更|再接続|切り替|アクセス|修復|リセット|解除|削除|復旧|初期化|アンインストール/;
const QUESTION = /[?？]|(?:ですか|ますか|でしょうか)[。\s]*$/;
export function supportDescription(text, validateSentence) {
  const kept = []; let omitted = 0;
  for (const sentence of (text.match(/[^。！？!?\n]+[。！？!?]?/g) || [])) {
    const s = sentence.trim();
    if (!s) continue;
    if (/^[（(].*[）)]$/.test(s) || OPERATIONAL.test(s) || QUESTION.test(s) || !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(s) || !validateSentence(s)) omitted++;
    else if (kept.join('').length + s.length <= 700) kept.push(s);
    else omitted++;
  }
  return { text: kept.join(''), omitted };
}

export function supportCaption(context) {
  const apps = context.overview?.apps || [];
  const selected = apps.find((app) => app.appId === context.appId);
  if (selected) {
    let text = `${APPS.get(selected.appId)}の表示は「${selected.displayLabel}」です。`;
    if (selected.snapshotState === 'mismatch' || selected.cloudState === 'attention') text += 'この表示だけでは原因までは特定できません。';
    if (selected.reportCounts?.pending) text += `前回の報告に保留中のものが${selected.reportCounts.pending}件あります。`;
    return text;
  }
  if (apps.length === DIAGNOSTIC_APPS.length && apps.every((app) => app.displayStatus === 'available')) return '4つのアプリの表示はすべて「✓ 同期済み」です。';
  if (apps.length === DIAGNOSTIC_APPS.length && apps.every((app) => app.displayStatus === 'detached')) return '4つのアプリは未接続です。';
  return apps.map((app) => `${APPS.get(app.appId)}は「${app.displayLabel}」`).join('、') + (apps.length ? 'です。' : '現在の同期状態を確認できませんでした。');
}

export function renderSupportAction(action, context) {
  if (!action || Object.keys(action).some((key) => !['id', 'appId'].includes(key))) return null;
  if (!SUPPORT_ACTION_IDS.includes(action.id) || !['none', ...APPS.keys()].includes(action.appId)) return null;
  if (action.id === 'contact_support') return CONTACT_GUIDANCE;
  if (action.id === 'preserve_data') return 'データの削除や同期解除は行わず、まず現在の状態を確認しましょう。';
  if (action.id === 'check_network') return '端末がインターネットにつながっていることをご確認ください。';
  if (action.id === 'connect_app' && action.appId === 'none' && context.overview?.apps?.length === DIAGNOSTIC_APPS.length &&
      context.overview.apps.every((app) => app.displayStatus === 'detached')) {
    return 'Cruise Portの同期センターで接続したいアプリの「同期コード」を表示し、そのアプリの「設定 → クラウド同期 → Cruise Portと接続」から入力してください。コードはこの相談には書かないでください。';
  }
  const name = APPS.get(action.appId);
  const app = context.overview?.apps?.find((item) => item.appId === action.appId);
  if (!name || !app) return null;
  const detail = context.details?.get(action.appId);
  const count = Number.isSafeInteger(app.activeTargetCount) && app.activeTargetCount >= 0 ? app.activeTargetCount : 0;
  const targetsLabel = `同期先${count}件`;
  if (action.id === 'connect_app' && app.displayStatus === 'detached') {
    return `Cruise Portの同期センターで${name}の「同期コード」を表示し、接続したい端末の${name}で「設定 → クラウド同期 → Cruise Portと接続」から入力してください。コードはこの相談には書かないでください。`;
  }
  const hasDetails = ['synced', 'initial', 'connecting', 'deleting', 'attention'].includes(app.cloudState);
  if (action.id === 'inspect_targets' && hasDetails) return `Cruise Portの${name}の行の「${targetsLabel}」を開いて、前回の報告をご確認ください。`;
  if (action.id === 'inspect_app' && app.cloudState === 'synced' && detail && app.snapshotState !== 'mismatch') {
    return `Cruise Portの${name}の行の「${targetsLabel}」で前回の報告を確認し、そのアプリを使っている端末で${name}を開いて「設定 → クラウド同期」をご確認ください。`;
  }
  const retry = app.snapshotState === 'mismatch' || ['syncing', 'connecting'].includes(app.displayStatus) ||
    (app.displayStatus === 'attention' && app.cloudState !== 'synced');
  if (action.id === 'recheck_app' && hasDetails && retry) return `Cruise Portの${name}の行の「${targetsLabel}」を開き、「もう一度確認」が表示されている場合にタップしてください。`;
  return null;
}

export function defaultSupportActions(context) {
  const app = context.overview?.apps?.find((item) => item.appId === context.appId);
  if (!app) {
    const connect = { id: 'connect_app', appId: 'none' };
    return renderSupportAction(connect, context) ? [connect] : [];
  }
  const ids = app.displayStatus === 'detached' ? ['connect_app'] : app.snapshotState === 'mismatch' || ['syncing', 'connecting'].includes(app.displayStatus) ||
    (app.displayStatus === 'attention' && app.cloudState !== 'synced') ? ['recheck_app'] :
    app.reportCounts?.attention || app.reportCounts?.error || app.reportCounts?.pending ? ['inspect_app', 'inspect_targets'] : ['inspect_targets'];
  return ids.map((id) => ({ id, appId: app.appId })).filter((action) => renderSupportAction(action, context)).slice(0, 1);
}
