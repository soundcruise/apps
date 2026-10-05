import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const apps = ['pitch-cruise', 'fretboard_cruise', 'rhythm-cruise', 'chord-cruise', 'cruise-port'];

test('each app independently exposes the root rights, AI policy, and third-party notice', () => {
  for (const app of apps) {
    const noticeUrl = new URL(`apps/${app}/NOTICE.md`, root);
    const notice = readFileSync(noticeUrl, 'utf8');
    const destinations = [...notice.matchAll(/\]\(([^)]+)\)/g)].map(m => new URL(m[1], noticeUrl));
    for (const path of ['LICENSE', 'SECURITY-AND-AI-POLICY.md', 'NOTICE']) {
      assert(destinations.some(url => url.href === new URL(path, root).href), `${app}: ${path}`);
    }
    for (const url of destinations) assert(existsSync(url), url.href);
  }
});

test('all five Terms preserve permitted uses and third-party rights while prohibiting unauthorized bypass', () => {
  for (const app of apps) {
    const url = new URL(`apps/${app}/terms.html`, root);
    const html = readFileSync(url, 'utf8');
    for (const phrase of ['正当な引用', '感想・紹介', 'レビュー・批評', '好意的な内容に限りません', 'スクリーンショット', '運営者の明示的な承認',
      '法令上認められる利用', '各権利者のライセンスが優先', '人やAIシステム',
      '有料機能制限の解除', '認証・アクセス制御の回避', 'なりすまし']) {
      assert(html.includes(phrase), `${app}: ${phrase}`);
    }
    for (const section of ['license', 'ai-policy', 'notice']) {
      const href = `../../legal.html#${section}`;
      assert(html.includes(`href="${href}"`), `${app}: ${href}`);
      const target = new URL(href, url);
      target.hash = '';
      assert(existsSync(target));
      assert(read('legal.html').includes(`id="${section}"`));
    }
    assert(!/<iframe|<form|<input/i.test(html), `${app}: no new consent or access-control flow`);
  }
});

test('AI guidance explicitly permits operator-authorized AI work without advertising independent development', () => {
  const policy = read('SECURITY-AND-AI-POLICY.md');
  for (const phrase of ['Do not bypass authentication', 'Do not reproduce substantial protected',
    "persons or AI systems acting under the operator's authorization", 'development, maintenance, debugging, testing',
    'security review, refactoring, deployment', 'ChatGPT、Codex、Claude Code',
    'permissions remain unaffected', 'not a claim that comments']) {
    assert(policy.includes(phrase), phrase);
  }
  assert(!policy.includes('Independently created implementations'));
  assert(!read('LICENSE').includes('independent implementations'));
  assert(read('LICENSE').includes('uses permitted by applicable law'));
  assert(read('LICENSE').includes('Third-party priority'));
  assert(read('AGENTS.md').includes('SECURITY-AND-AI-POLICY.md'));
  const prohibitions = policy.split('\n').filter(line => line.startsWith('- Do not '));
  assert.equal(prohibitions.length, 5);
  for (const line of prohibitions) assert(line.includes('without explicit operator authorization'), line);
});

test('all five Terms permit public URL reviews while protecting private Pro access and materials', () => {
  for (const app of apps) {
  const html = read(`apps/${app}/terms.html`);
  assert(html.includes('公開されているURLが一般的な紹介・レビュー・画面共有に表示されること自体は禁止しません'));
  assert(html.includes('非公開アクセスURL、パスワード、トークン・認証情報、会員限定のアクセス方法'));
  assert(html.includes('第三者が無断でPro版を利用できる形で共有・公開することは禁止'));
  assert(html.includes('Pro版の教材や主要機能の内容を、第三者が実質的に利用・再現できる形で転載・再配布することは禁止'));
  assert(!html.includes('ただし、Pro版のURL、'));
  }
});

test('bundled music font and third-party licenses stay separate from operator-owned materials', () => {
  const notice = read('NOTICE');
  for (const component of ['VexFlow', 'Bravura', 'Petaluma', 'Leland', 'Gonville', 'Outfit']) {
    assert(notice.includes(component), component);
  }
  assert(read('apps/rhythm-cruise/vendor/LICENSE-vexflow.txt').includes('Permission is hereby granted'));
  for (const file of ['bravura', 'petaluma', 'leland']) {
    assert(read(`apps/rhythm-cruise/vendor/LICENSE-${file}-OFL.txt`).includes('SIL OPEN FONT LICENSE Version 1.1'));
  }
  assert(read('apps/shared/licenses/Outfit-OFL.txt').includes('The Outfit Project Authors'));
});

test('authorization scope is explicit, aligned, and not established by an ownership claim alone', () => {
  const policy = read('SECURITY-AND-AI-POLICY.md');
  const license = read('LICENSE');
  assert(policy.includes('under the\noperator\'s control'));
  assert(policy.includes("A third party's statement that they\nare the owner does not by itself establish authorization"));
  for (const document of [policy, license]) {
    for (const work of ['development', 'maintenance', 'debugging', 'testing',
      'security review', 'refactoring', 'deployment', 'other authorized work']) {
      assert(document.includes(work), work);
    }
  }
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    const text = read(file);
    for (const link of ['LICENSE', 'SECURITY-AND-AI-POLICY.md', 'NOTICE']) assert(text.includes(link));
    assert(text.includes('運営者が明示的に承認した'));
    assert(!/ユーザーが認めた|一般的な機能の独立実装|pitch_trainer\/|staging\/index.html/.test(text));
  }
});

test('each source notice uses operator authorization and resolves canonical policy paths', () => {
  const files = ['apps/pitch-cruise/script.js', 'apps/fretboard_cruise/script.js',
    'apps/rhythm-cruise/script.js', 'apps/chord-cruise/js/app.js',
    'apps/chord-cruise/js/core/feature-access.js', 'apps/cruise-port/practice-menu-app.js',
    'apps/cruise-port/cruise-port-capabilities.js', 'apps/shared/pro-gate.js',
    'apps/shared/pro-backend-entitlement.js', 'workers/cruise-port-requests/src/app.js',
    'workers/sound-cruise-sync/src/app.js', 'workers/sound-cruise-sync/src/index.js',
    'workers/sound-cruise-sync/src/pro-auth-app.js', 'workers/sound-cruise-sync/src/ai-support-app.js'];
  for (const file of files) {
    const header = read(file).split('*/')[0];
    assert(header.includes('Operator-authorized development and maintenance'));
    assert(header.includes('Third-party licenses and legally permitted uses remain unaffected'));
    const references = header.match(/See (\S+) and (\S+) \(repository-relative\)/);
    assert(references, file);
    for (const path of references.slice(1)) assert(existsSync(new URL(path, new URL(file, root))), file);
  }
});

test('current handoff docs do not instruct client-side password hash authentication', () => {
  for (const file of ['CLAUDE.md', 'apps/rhythm-cruise/ai-handoff/RHYTHM_CRUISE_OVERVIEW.md',
    'apps/cruise-studio/ROADMAP.md']) {
    const text = read(file);
    assert(!/passwordHash|soundCruiseProAuth|pitch_trainer\//.test(text), file);
    for (const phrase of ['generation', 'device-bound session', 'Account/device']) assert(text.includes(phrase), file);
  }
  assert(!read('apps/rhythm-cruise/script.js').includes('いまは true 固定。将来は'));
});

test('legal HTML shows canonical texts verbatim, safely, with no auth or external-fetch runtime', () => {
  const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
  const html = read('legal.html');
  for (const file of ['LICENSE', 'SECURITY-AND-AI-POLICY.md', 'NOTICE']) {
    assert(html.includes(`<pre>${escape(read(file))}</pre>`), file);
  }
  assert(!/<script|<iframe|<form|<input|fetch\(|localStorage|indexedDB|\son\w+=/i.test(html));
  assert(html.includes('white-space:pre-wrap;overflow-wrap:anywhere'));
  assert(html.includes('name="viewport"'));
  execFileSync('python3', ['tools/generate-legal-viewer.py', '--check'], { cwd: root });
});
