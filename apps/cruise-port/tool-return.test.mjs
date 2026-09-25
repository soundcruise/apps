import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isToolRoute, parseToolRoute, toolBackTarget, withPracticeMenuReturn, TOOL_BACK_LABELS } from './tool-return.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('practice-menu launches carry an explicit context; other hrefs are untouched', () => {
  assert.equal(withPracticeMenuReturn('#tuner'), '#tuner?from=practice-menu');
  assert.equal(withPracticeMenuReturn('#metronome', 'p-1'), '#metronome?from=practice-menu&practice=p-1');
  assert.equal(withPracticeMenuReturn('#tuner', 'a b/c'), '#tuner?from=practice-menu&practice=a+b%2Fc');
  for (const href of ['https://soundcruise.jp/apps/pitch-cruise/', '#practice-menu', '#my-apps/new', null, undefined, '']) {
    assert.equal(withPracticeMenuReturn(href, 'p-1'), href);
  }
});

test('routes: Practice Menu → tool → 練習メニューに戻る; Home → tool → クルーズポート', () => {
  const exists = (id) => id === 'p-1';
  // Practice Menu detail → Metronome / Tuner → back to that practice menu.
  for (const tool of ['#metronome', '#tuner']) {
    const target = toolBackTarget(withPracticeMenuReturn(tool, 'p-1'), { practiceExists: exists });
    assert.deepEqual({ ...target }, { label: '← 練習メニューに戻る', hash: '#practice-menu/p-1' });
  }
  // Practice Menu list → tool → back to the list.
  assert.deepEqual({ ...toolBackTarget(withPracticeMenuReturn('#tuner'), { practiceExists: exists }) },
    { label: TOOL_BACK_LABELS.practice, hash: '#practice-menu' });
  // A practice menu that no longer exists falls back to the list, never to a dead route.
  assert.equal(toolBackTarget(withPracticeMenuReturn('#tuner', 'gone'), { practiceExists: exists }).hash, '#practice-menu');
  // Home → Metronome / Tuner keeps 「← クルーズポート」 (home route).
  for (const tool of ['#metronome', '#tuner']) {
    assert.deepEqual({ ...toolBackTarget(tool) }, { label: '← クルーズポート', hash: null });
  }
  // The context is part of the hash, so a reload keeps it.
  assert.equal(parseToolRoute('#tuner?from=practice-menu&practice=p-1').practiceId, 'p-1');
  // Unknown sources are ignored (plain home behaviour).
  assert.equal(toolBackTarget('#tuner?from=elsewhere').hash, null);
});

test('tool route matching keeps old hashes working and rejects look-alikes', () => {
  for (const hash of ['#tuner', '#metronome', '#tuner?from=practice-menu', '#metronome?from=practice-menu&practice=x']) {
    assert.equal(isToolRoute(hash), true, hash);
  }
  assert.equal(isToolRoute('#tuner?from=practice-menu', 'tuner'), true);
  assert.equal(isToolRoute('#tuner?from=practice-menu', 'metronome'), false);
  for (const hash of ['#tuners', '#practice-menu', '#tuner/x', '', null, '#metronome-view']) assert.equal(isToolRoute(hash), false, String(hash));
});

test('the app uses the context for every tool comparison and both launch sites', () => {
  const app = read('./practice-menu-app.js');
  assert.doesNotMatch(app, /=== '#tuner'|!== '#tuner'|=== '#metronome'/, 'no exact tool-hash comparisons remain');
  assert.match(app, /launch\.href = withPracticeMenuReturn\(app\.href\);/);
  assert.match(app, /elements\.openApp\.href = withPracticeMenuReturn\(app\.href, item\.id\);/);
  assert.match(app, /isToolRoute\(hash, 'tuner'\)[\s\S]{0,80}applyToolBackButton\(elements\.tunerView, hash\)/);
  assert.match(app, /isToolRoute\(hash, 'metronome'\)[\s\S]{0,80}applyToolBackButton\(elements\.metronomeView, hash\)/);
  assert.match(app, /const target = button\.dataset\.returnHash;\s*if \(target\) setHashRoute\(target\);\s*else setHomeRoute\(\);/);
  for (const html of [read('./index.html'), read('./pro_9a3943176561/index.html')]) {
    assert.equal((html.match(/class="view-back" type="button" data-action="home">← クルーズポート</g) || []).length >= 2, true,
      'both tools start with the home label');
  }
});
