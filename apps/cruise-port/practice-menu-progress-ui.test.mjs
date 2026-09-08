import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

assert.doesNotMatch(markup, /保存した練習メニューを選ぶと、内容を確認して使用アプリを開けます。/);
assert.match(markup, /id="practice-complete-count"/);
assert.match(markup, /id="practice-history-open"/);
assert.match(markup, /id="practice-hidden-open"/);
assert.match(markup, /id="practice-complete"[^>]*disabled>全部完了/);
assert.match(markup, /id="practice-cycle-reset"[^>]*disabled>チェックをすべてリセット/);
assert.match(markup, /id="practice-completion-celebration"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
assert.match(markup, /お疲れさまでした/);

assert.match(markup, /id="practice-hidden-view"/);
assert.match(markup, /id="practice-hidden-list"/);
assert.match(markup, /id="practice-history-view"/);
assert.match(markup, /id="practice-calendar-previous"/);
assert.match(markup, /id="practice-calendar-next"/);
assert.match(markup, /id="practice-calendar-days"[^>]*role="grid"/);
assert.match(markup, /<span>日<\/span><span>月<\/span><span>火<\/span><span>水<\/span><span>木<\/span><span>金<\/span><span>土<\/span>/);

assert.match(markup, /id="practice-hidden"[^>]*type="checkbox"/);
assert.match(markup, /id="practice-count-reset"[^>]*>通算回数をリセット/);
assert.match(markup, /id="practice-detail-count"/);

assert.match(source, /className = 'practice-check'/);
assert.match(source, /setAttribute\('aria-pressed', checked \? 'true' : 'false'\)/);
assert.match(source, /className = 'practice-launch'/);
assert.match(source, /setAttribute\('aria-label', `\$\{item\.name\}の使用アプリ/);
assert.match(source, /const activeItems = getActivePracticeItems\(\)/);
assert.match(source, /canCompletePracticeCycle\(state\.progress, activeItems\.map/);
assert.match(source, /createPracticeCompletedEvent\(item, state\.progress\.cycleId\)/);
assert.match(source, /createCycleCompletedEvent\(transition\.completedCycleId, now\)/);
assert.match(source, /clearPracticeCurrentCheck\(state\.progress, state\.activeId\)/);
assert.match(source, /resetPracticeTotalCount\(state\.progress, item\.id\)/);
assert.match(source, /savePracticeProgress\(nextProgress\)/);
assert.match(source, /savePracticeHistory\(nextHistory\)/);
assert.match(source, /history\.replaceState[\s\S]*#practice-menu\/hidden/);

assert.match(styles, /\.practice-calendar-days[\s\S]*grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
assert.match(styles, /\.practice-check[\s\S]*width: 42px[\s\S]*height: 42px/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.practice-completion-celebration[\s\S]*animation: none/);
assert.doesNotMatch(markup, /fullcalendar|react-calendar|calendar\.js/);

console.log('practice-menu-progress-ui: list controls, hidden view, calendar, accessibility, and quiet completion UI passed');
