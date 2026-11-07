// Small, fixed description of the UI this support assistant can recommend, not a navigation
// service. Source contracts are checked by test/ai-support-ui-guidance.test.js against Port and
// the shared app connection UI. Diagnostic data never defines new routes or controls.
import { DIAGNOSTIC_APPS } from './ai-diagnostics.js';

export const VERIFIED_UI_PATHS = Object.freeze([
  ['設定', 'クラウド同期', 'Cruise Portと接続'],
  ['設定', 'クラウド同期を開く', '同期センター'],
  ['同期センター', '同期先', 'もう一度確認'],
  ['同期センター', 'クラウド同期で困ったときは', '不具合を報告(メール)'],
  ['同期センター', 'クラウド同期で困ったときは', 'AIに相談', 'メールで報告'],
  ['AIに相談', '送信内容の取り扱い', 'プライバシーポリシー'],
  ['設定', 'お問い合わせ'],
  ['同期センター', '同期コード']
].map((nodes) => Object.freeze(nodes)));

export const UI_GUIDANCE_POLICY = [
  '- 現行Portでは対象アプリの行の「同期先N件」（Nは件数）を開く。古い説明にある ⓘ ボタンを現行画面にあるとは案内しない。',
  '- 接続操作は「未接続」と確認できたアプリに限る。状態が未確認なら「未接続と表示されている場合」と条件を明示する。',
  '- 「もう一度確認」は「同期先」を開いた先に表示される場合だけ案内する。前回報告だけからボタンの存在を断定しない。',
  '- 確認済み経路：' + VERIFIED_UI_PATHS.map((nodes) => nodes.join(' → ')).join(' ／ '),
  '- この経路にない画面・ボタンを尋ねられても、あるものとして補完しない。確認できないことを伝え、必要なら対象アプリや画面を短く聞き返す。',
  '- 問い合わせ導線は同期センター下部の「クラウド同期で困ったときは」と相談画面下部の「メールで報告」にある。別の設定画面やヘルプ内のリンクを推測して案内しない。'
].join('\n');

const LABELS = new Set(VERIFIED_UI_PATHS.flat());
const APP_NAMES = DIAGNOSTIC_APPS.map((app) => app.name);
const STATUS = /^(?:✓\s*)?(?:同期済み|未接続|確認が必要|再確認が必要|保留中)$/;
const ACTION = /開|押|タップ|クリック|選|利用|進|表示|確認|問い合わせ|相談/;
const CONNECT_CONDITION = /未接続[^。]{0,18}(?:場合|なら|とき)/;
const RECHECK_CONDITION = /もう一度確認[^。]{0,25}(?:表示されていれば|表示されている場合|表示がある場合|見つかる場合|ある場合|あれば)|(?:表示されていれば|表示されている場合)[^。]{0,20}もう一度確認/;
const DENIAL_END = /(?:は|が|の存在は)(?:存在しません|ありません|確認できません|案内できません|実装されていません)(?:が)?$/;
const CONNECT = /同期コード|Cruise\s*Portと接続/;
const READ_ONLY = /確認|表示|読み/;
const NEGATIVE_ACTION = /(?:できません|ありません|見つかりません|しないでください|していません|勧めません)$/;

function label(value) {
  return value.trim().replace(/^[「『"\s]+|[」』"\s]+$/g, '')
    .replace(/^同期先\s*\d+\s*件$/, '同期先');
}

function denied(tail) {
  // A denial of the named feature is not an instruction to use it. Do not exempt a whole
  // sentence just because it also contains a denial of some other feature.
  return /^[」』"\s]*(?:という)?(?:画面|ボタン|リンク|メニュー|機能|経路)?(?:は|が|の存在は)?\s*(?:存在しません|ありません|確認できません|案内できません|実装されていません)/.test(tail);
}

function pathNode(segment, first, last) {
  const quoted = [...segment.matchAll(/[「『"]([^」』"\n]+)[」』"]/g)];
  const lastQuote = quoted.at(-1);
  if (quoted.length && (!first || /^\s*(?:画面|メニュー)?\s*$/.test(segment.slice(lastQuote.index + lastQuote[0].length)))) {
    return label((first ? lastQuote : quoted[0])[1]);
  }
  const s = segment.trim();
  const names = [...LABELS].sort((a, b) => b.length - a.length);
  if (first) return names.find((name) => s.endsWith(name) && /(?:^|まず|次に|の|で|から|\s)$/.test(s.slice(0, -name.length))) || label(s);
  if (last) return names.find((name) => s.startsWith(name) && /^(?:\s|を|から|へ|で|に|が|は|画面|ボタン|リンク|メニュー|$)/.test(s.slice(name.length))) || label(s);
  return label(s);
}

function knownPath(nodes) {
  // Contiguous portions are valid: an answer need not repeat every ancestor of a visible UI.
  return VERIFIED_UI_PATHS.some((path) => path.some((_, i) =>
    nodes.length <= path.length - i && nodes.every((node, j) => path[i + j] === node)));
}

export const UI_GUIDANCE_CATEGORIES = Object.freeze(['unsupported_ui_path', 'ui_precondition', 'unsafe_operation']);

// Categories only. Never return matched text, target names, identifiers or tool results.
export function uiGuidanceViolations(reply, { apps = [] } = {}) {
  const violations = new Set();
  // Display names are inert data, not controls. Other quoted strings still undergo UI checks.
  const text = reply.replace(/(?:同期先|登録名|端末名)\s*[「『][^」』\n]{0,80}[」』]/g, '同期先の名前');
  for (const rawSentence of text.split(/[。！？\n]/)) {
    const sentence = rawSentence.normalize('NFKC');
    // Check directed paths, including unrecognised labels, rather than a blacklist of bad words.
    for (const part of sentence.split(/[、,;；]/)) {
      const segments = part.split(/\s*(?:→|⇒|->|>)\s*/);
      if (segments.length < 2 || !/(?:設定|同期|画面|メニュー)/.test(part) && !ACTION.test(part)) continue;
      const nodes = segments.map((s, i) => pathNode(s, i === 0, i === segments.length - 1));
      const tail = segments.at(-1).replace(/^\s*[「『"]?[^」』"\s]+[」』"]?/, '');
      if (!denied(tail) && !DENIAL_END.test(segments.at(-1).trim()) && !knownPath(nodes)) violations.add('unsupported_ui_path');
    }
    // Prose instructions need the same evidence as arrow paths. Recognise labels at the point
    // where an answer claims they are a control or asks the user to open/use them.
    const controls = /[「『]([^」』\n]{1,80})[」』](?:の)?(?:画面|ボタン|リンク|メニュー)?(?:を|から|へ)(?=([^。！？\n]{0,24}))|([^\s「」『』、。→]{1,30})(?:画面|ボタン|リンク|メニュー)(?:を|から|にある)(?=([^。！？\n]{0,24}))/g;
    for (const match of sentence.matchAll(controls)) {
      const raw = label(match[1] || match[3]);
      const name = match[1] ? raw : raw.split(/の|にある/).at(-1);
      const action = match[2] || match[4] || '';
      if (!ACTION.test(action) || denied(action)) continue;
      if (LABELS.has(name) || APP_NAMES.includes(name) || /^(?:その|この|対象)$/.test(name)) continue;
      if (STATUS.test(name) && READ_ONLY.test(action) && !/押|タップ|クリック/.test(action)) continue;
      violations.add('unsupported_ui_path');
    }
    const prosePaths = /(?=(設定|同期センター|クラウド同期)(?:画面|メニュー)?(?:から|の|内の|にある)\s*([「『][^」』\n]+[」』]|[^「」『』、。\s]{1,30}?)(?:を|へ|から)([^。！？\n]{0,24}))/g;
    for (const match of sentence.matchAll(prosePaths)) {
      if (!ACTION.test(match[3]) || denied(match[3])) continue;
      const child = label(match[2]).replace(/(?:画面|ボタン|リンク|メニュー)$/, '');
      if (child === '画面' || child === '') continue;
      if (!knownPath([match[1], child])) violations.add('unsupported_ui_path');
    }
    const claims = /(?:[「『]([^」』\n]{1,80})[」』]|([^\s「」『』、。→]{1,30}?))(?:という)?(?:画面|ボタン|リンク|メニュー|ページ)(?=が(?:あります|ある|存在)|に(?:あります|ある))/g;
    for (const match of sentence.matchAll(claims)) {
      const raw = label(match[1] || match[2]);
      const name = match[1] ? raw : raw.split(/の|にある/).at(-1);
      if (!LABELS.has(name)) violations.add('unsupported_ui_path');
    }
    if (/ⓘ/.test(rawSentence) && ACTION.test(sentence) && !denied(rawSentence.split('ⓘ')[1] || '')) violations.add('unsupported_ui_path');
    // Conditional advice remains usable even before a diagnostic read. A positive assertion
    // about an actionable state requires this turn's trusted diagnostics, not user/history text.
    if (CONNECT.test(sentence) && ACTION.test(sentence) && !CONNECT_CONDITION.test(sentence) && !NEGATIVE_ACTION.test(sentence.trim()) && !DENIAL_END.test(sentence.trim())) {
      const named = apps.filter((app) => DIAGNOSTIC_APPS.some((known) => known.id === app.appId && sentence.includes(known.name)));
      const mentioned = apps.filter((app) => DIAGNOSTIC_APPS.some((known) => known.id === app.appId && text.includes(known.name)));
      const relevant = named.length ? named : mentioned.length === 1 ? mentioned : apps;
      if (!relevant.length || !relevant.every((app) => app.displayStatus === 'detached')) violations.add('ui_precondition');
    }
    if (/もう一度確認/.test(sentence) && /押|タップ|クリック|ボタン/.test(sentence) && !RECHECK_CONDITION.test(sentence) && !NEGATIVE_ACTION.test(sentence.trim()) && !DENIAL_END.test(sentence.trim())) {
      violations.add('ui_precondition');
    }
    if (/(?:データ|アカウント|同期|アプリ)[^。\n]{0,12}(?:削除|解除|初期化|アンインストール)(?:して(?!いません|いない|おりません)|しましょう|を実行)/.test(sentence)) {
      violations.add('unsafe_operation');
    }
  }
  return [...violations];
}
