import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

assert.doesNotMatch(markup, /保存した練習メニューを選ぶと、内容を確認して使用アプリを開けます。/);
assert.doesNotMatch(markup, /practice-complete-count|コンプリート回数/);
assert.match(markup, /id="practice-history-open"/);
assert.match(markup, /id="practice-history-open"[\s\S]*音楽カレンダー/);
assert.match(markup, /id="practice-timer-toggle"[\s\S]*練習スタート/);
assert.match(markup, /id="practice-hidden-open"/);
assert.doesNotMatch(markup, /id="practice-complete"/);
assert.doesNotMatch(`${markup}\n${source}`, /全部完了/);
assert.match(markup, /id="practice-finish"[^>]*disabled>ここで練習終了/);
assert.match(markup, /id="practice-cycle-reset"[^>]*disabled>チェックをすべてリセット/);
assert.match(markup, /id="practice-completion-dialog"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*hidden/);
assert.doesNotMatch(`${markup}\n${source}\n${styles}`, /confetti/i);
assert.match(markup, /class="practice-completion-sparkles"[^>]*aria-hidden="true"/);
assert.match(markup, /id="practice-completion-end"[^>]*>練習を終了する/);
assert.match(markup, /id="practice-completion-calendar"[^>]*>音楽カレンダーを見る/);
assert.match(markup, /お疲れさまでした！/);

assert.match(markup, /id="practice-hidden-view"/);
assert.match(markup, /id="practice-hidden-list"/);
assert.match(markup, /id="practice-history-view"/);
assert.match(markup, /id="practice-calendar-previous"/);
assert.match(markup, /id="practice-calendar-next"/);
assert.match(markup, /id="practice-calendar-days"[^>]*role="group"/);
assert.match(markup, /data-calendar-view="month"[^>]*aria-pressed="true"[^>]*>月/);
assert.match(markup, /data-calendar-view="week"[^>]*>週/);
assert.match(markup, /data-calendar-view="day"[^>]*>日/);
assert.match(markup, /id="practice-calendar-day-focus"/);
assert.match(markup, /id="practice-calendar-note-add"/);
assert.match(markup, /id="practice-calendar-note-icons"/);
assert.match(markup, /id="practice-calendar-note-icon-toggle"[^>]*aria-haspopup="listbox"/);
assert.match(markup, /id="practice-calendar-note-time"/);
assert.match(markup, /id="practice-calendar-note-end-time"/);
assert.match(markup, /id="practice-calendar-note-text"[^>]*maxlength="500"/);
assert.match(markup, /id="practice-calendar-note-form"[^>]*data-keyboard-scroll-target="calendar-note-form"/);
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
assert.match(source, /const activeIds = getActivePracticeItems\(\)\.map/);
assert.match(source, /canCompletePracticeCycle\(nextProgress, activeIds\)/);
assert.match(source, /createPracticeCompletedEvent\([\s\S]*state\.timer\.sessionId : null/);
assert.match(source, /createCycleCompletedEvent\(completion\.progress\.cycleId, now\)/);
assert.match(source, /beginPracticeCompletion\([\s\S]*PRACTICE_COMPLETION_TYPE\.complete/);
assert.match(source, /beginPracticeCompletion\([\s\S]*PRACTICE_COMPLETION_TYPE\.partial/);
assert.match(source, /finishPracticeCompletion\(state\.progress\)/);
assert.match(source, /completionPending/);
assert.match(source, /event\.key === 'Escape'[\s\S]*preventDefault\(\)/);
const completionActionSource = source.slice(
    source.indexOf('function handlePracticeCompletionAction(destination)'),
    source.indexOf('function renderPracticeHiddenList()')
);
assert.ok(
    completionActionSource.indexOf('stopPracticeTimerWithHistory()')
        < completionActionSource.indexOf('finishPracticeCompletion(state.progress)'),
    'timer history must be saved before the cycle is reset'
);
assert.match(completionActionSource, /if \(!timerResult\.ok\)[\s\S]*syncPracticeCompletionDialog/);
const partialFinishSource = source.slice(
    source.indexOf('function handlePracticeFinishEarly()'),
    source.indexOf('function handlePracticeCompletionAction(destination)')
);
assert.doesNotMatch(partialFinishSource, /createCycleCompletedEvent/);
assert.match(source, /clearPracticeCurrentCheck\(state\.progress, state\.activeId\)/);
assert.match(source, /resetPracticeTotalCount\(state\.progress, item\.id\)/);
assert.match(source, /savePracticeProgress\(nextProgress\)/);
assert.match(source, /savePracticeHistory\(nextHistory\)/);
assert.match(source, /startPracticeTimer\(state\.timer\)/);
assert.match(source, /getPracticeTimerElapsedSeconds\(state\.timer\)/);
assert.match(source, /createPracticeSessionEvent\(transition\.session\)/);
assert.match(source, /openPracticeCalendar\(PRACTICE_CALENDAR_ENTRY_SOURCE\.practice\)/);
assert.match(source, /deleteAttachmentsForPractice\(item\.id\)/);
assert.match(source, /cleanupPracticeAttachmentObjectUrls\(\)/);
assert.match(source, /getAttachmentCounts\(state\.items\.map/);
assert.match(source, /action\.dataset\.practiceAction === 'files'/);
assert.match(source, /preparePracticeFileWindow\(window\)/);
assert.match(source, /navigatePreparedPracticeFileWindow\(preparedWindow, objectUrl\)/);
assert.match(source, /5 \* 60_000/);
assert.match(source, /requestAnimationFrame\(\(\) => \{[\s\S]*scrollIntoView\(\{ behavior: 'auto', block: 'start' \}\)/);
assert.match(source, /ファイルを開けませんでした。ポップアップを許可して、もう一度お試しください。/);
assert.match(source, /createPracticeDayHistoryView/);
assert.match(source, /practice-history-session-children/);
assert.match(source, /practice-history-session-duration/);
assert.match(source, /formatPracticeSessionDuration\(child\.measuredDurationSeconds\)/);
assert.match(source, /formatPracticeSessionDuration\(displayDurationSeconds\)/);
assert.match(source, /formatPracticeSessionDuration\(result\.displayDurationSeconds\)/);
assert.match(source, /state\.calendarViewMode === 'week'/);
assert.match(source, /state\.calendarViewMode === 'day'/);
assert.match(source, /createPracticeCalendarKeyboard/);
assert.doesNotMatch(source, /visualViewport\?\.addEventListener\('scroll'/);
const deletionSource = source.slice(source.indexOf('function handlePracticeHistoryDelete'), source.indexOf('function renderPracticeDayHistory'));
assert.match(deletionSource, /window\.confirm/);
assert.ok(deletionSource.indexOf('savePracticeHistory(result.history)') < deletionSource.indexOf('state.history = result.history'));
assert.doesNotMatch(deletionSource, /savePracticeProgress|totalCounts|deletePracticeMenu|localStorage\.clear/);
assert.match(source, /cleanupPracticeCalendarKeyboardTracking/);
assert.match(source, /const viewChanged = view\.hidden/);
assert.match(source, /if \(viewChanged\) window\.scrollTo/);
assert.doesNotMatch(source, /function handlePracticeComplete/);
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
assert.match(listCardSource, /copy\.append\(name, count\)/);
assert.match(listCardSource, /files\.textContent = attachmentCount === 1 \? 'ファイル' : `ファイル \$\{attachmentCount\}`/);

assert.match(styles, /\.practice-calendar-days[\s\S]*grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
assert.match(styles, /\.practice-calendar-view-tabs/);
assert.match(styles, /\.practice-calendar-weekdays span[\s\S]*font-size: 0\.8rem/);
assert.match(styles, /\.practice-calendar-day[\s\S]*font-size: 0\.96rem/);
assert.match(styles, /\.practice-history-session-children/);
assert.match(styles, /\.practice-history-session-duration/);
assert.match(styles, /\.practice-history-event strong[\s\S]*font-size: calc\(0\.94rem \* var\(--font-scale\)\)/);
assert.match(styles, /\.practice-history-event small[\s\S]*font-size: calc\(0\.86rem \* var\(--font-scale\)\)/);
assert.match(styles, /\.practice-calendar-note-icons/);
assert.match(styles, /\.practice-check[\s\S]*width: 44px[\s\S]*height: 44px/);
assert.match(styles, /\.practice-menu-card[\s\S]*grid-template-columns: 44px minmax\(0, 1fr\) auto 18px/);
assert.match(styles, /\.practice-timer-toggle[\s\S]*min-height: 48px/);
assert.match(styles, /\.practice-attachment-lightbox\[hidden\]/);
assert.match(styles, /\.practice-files-button/);
assert.match(styles, /\.practice-attachment-status\.is-error/);
assert.match(styles, /\.practice-completion-dialog[\s\S]*position: fixed[\s\S]*place-items: center/);
assert.match(styles, /\.practice-completion-sparkles i[\s\S]*practice-card-glint[\s\S]*infinite/);
assert.match(styles, /\.is-partial \.practice-completion-sparkles[\s\S]*display: none/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.practice-completion-sparkles i[\s\S]*animation: none/);
assert.doesNotMatch(markup, /fullcalendar|react-calendar|calendar\.js/);

console.log('practice-menu-progress-ui: timer, concise cards, calendar notes, detail actions, attachments, accessibility, and completion UI passed');
