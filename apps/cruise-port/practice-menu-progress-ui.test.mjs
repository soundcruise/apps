import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

assert.doesNotMatch(markup, /保存した練習メニューを選ぶと、内容を確認して使用アプリを開けます。/);
assert.doesNotMatch(markup, /practice-complete-count|コンプリート回数/);
assert.match(markup, /id="practice-history-open"/);
assert.match(markup, /id="practice-history-open"[\s\S]*練習カレンダー/);
assert.match(markup, /id="practice-timer-toggle"[\s\S]*練習スタート/);
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
assert.match(markup, /id="practice-calendar-note-add"/);
assert.match(markup, /id="practice-calendar-note-text"[^>]*maxlength="500"/);
assert.match(markup, /<span>日<\/span><span>月<\/span><span>火<\/span><span>水<\/span><span>木<\/span><span>金<\/span><span>土<\/span>/);

assert.match(markup, /id="practice-hidden"[^>]*type="checkbox"/);
assert.match(markup, /id="practice-count-reset"[^>]*>通算回数をリセット/);
assert.match(markup, /id="practice-detail-count"/);
assert.match(markup, /id="practice-open-app"[^>]*>アプリを開く/);
assert.match(markup, /id="practice-detail-back"[^>]*>練習メニューに戻る/);
assert.match(markup, /id="practice-attachment-input"[^>]*multiple/);
assert.match(markup, /id="practice-attachments-title"[^>]*>ファイル/);
assert.match(markup, /id="practice-form-attachments"/);
assert.match(markup, /id="practice-form-attachment-input"[^>]*multiple/);
assert.doesNotMatch(`${markup}\n${source}`, /資料/);
assert.doesNotMatch(markup, /id="practice-open-app"[^>]*primary-action/);

assert.match(source, /className = 'practice-check'/);
assert.match(source, /setAttribute\('aria-pressed', checked \? 'true' : 'false'\)/);
assert.match(source, /className = 'practice-launch'/);
assert.match(source, /launch\.textContent = 'アプリへ'/);
assert.match(source, /setAttribute\('aria-label', `\$\{item\.name\}の使用アプリ/);
assert.match(source, /const activeItems = getActivePracticeItems\(\)/);
assert.match(source, /canCompletePracticeCycle\(state\.progress, activeItems\.map/);
assert.match(source, /createPracticeCompletedEvent\(item, state\.progress\.cycleId\)/);
assert.match(source, /createCycleCompletedEvent\(transition\.completedCycleId, now\)/);
assert.match(source, /clearPracticeCurrentCheck\(state\.progress, state\.activeId\)/);
assert.match(source, /resetPracticeTotalCount\(state\.progress, item\.id\)/);
assert.match(source, /savePracticeProgress\(nextProgress\)/);
assert.match(source, /savePracticeHistory\(nextHistory\)/);
assert.match(source, /startPracticeTimer\(state\.timer\)/);
assert.match(source, /getPracticeTimerElapsedSeconds\(state\.timer\)/);
assert.match(source, /createPracticeSessionEvent\(transition\.session\)/);
assert.match(source, /setHashRoute\('#practice-menu\/calendar'\)/);
assert.match(source, /deleteAttachmentsForPractice\(item\.id\)/);
assert.match(source, /cleanupPracticeAttachmentObjectUrls\(\)/);
assert.match(source, /getAttachmentCounts\(state\.items\.map/);
assert.match(source, /action\.dataset\.practiceAction === 'files'/);
assert.match(source, /ファイルサイズが大きすぎます。20MB以下のファイルを選んでください。/);
assert.match(source, /画像サイズが大きすぎます。15MB以下の画像を選んでください。/);
assert.doesNotMatch(source, /pagehide[\s\S]{0,500}stopPracticeTimer/);
assert.match(source, /history\.replaceState[\s\S]*#practice-menu\/hidden/);

const listCardSource = source.slice(
    source.indexOf('function renderPracticeCard(item)'),
    source.indexOf('function renderHiddenPracticeCard(item)')
);
assert.doesNotMatch(listCardSource, /durationMinutes/);
assert.doesNotMatch(listCardSource, /(?:detail|copy|name)\.textContent = app\.label/);
assert.match(listCardSource, /card\.append\(detailLink, checkButton, copy, actions, arrow\)/);
assert.match(listCardSource, /files\.textContent = attachmentCount === 1 \? 'ファイル' : `ファイル \$\{attachmentCount\}`/);

assert.match(styles, /\.practice-calendar-days[\s\S]*grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
assert.match(styles, /\.practice-check[\s\S]*width: 44px[\s\S]*height: 44px/);
assert.match(styles, /\.practice-menu-card[\s\S]*grid-template-columns: 44px minmax\(0, 1fr\) auto 18px/);
assert.match(styles, /\.practice-timer-toggle[\s\S]*min-height: 48px/);
assert.match(styles, /\.practice-attachment-lightbox\[hidden\]/);
assert.match(styles, /\.practice-files-button/);
assert.match(styles, /\.practice-attachment-status\.is-error/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.practice-completion-celebration[\s\S]*animation: none/);
assert.doesNotMatch(markup, /fullcalendar|react-calendar|calendar\.js/);

console.log('practice-menu-progress-ui: timer, concise cards, calendar notes, detail actions, attachments, accessibility, and completion UI passed');
