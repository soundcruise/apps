import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PRACTICE_CALENDAR_SCHEMA_VERSION } from './practice-menu-calendar-store.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const standard = read('index.html');
const pro = read('pro_9a3943176561/index.html');
const source = read('practice-menu-app.js');
const styles = read('style.css');

test('Home calendar glyph has bindings, a header divider and date dots without changing its button', () => {
    for (const markup of [standard, pro]) {
        const button = markup.match(/<button id="home-calendar-button"[\s\S]*?<\/button>/)?.[0];
        assert.ok(button);
        assert.match(button, /M7 3v4M17 3v4M4 9h16/);
        assert.equal((button.match(/<circle/g) || []).length, 4);
    }
    assert.match(styles, /\.port-calendar-button\s*\{[^}]*width: 44px;[^}]*flex: 0 0 44px/);
    assert.match(styles, /\.port-header-actions\s*\{[\s\S]*gap: 8px/);
});

test('calendar entry source is transient history state with a safe Home fallback', () => {
    for (const markup of [standard, pro]) {
        assert.match(markup, /id="practice-history-back"[^>]*>← TOPに戻る<\/button>/);
        assert.doesNotMatch(markup, /id="practice-history-back"[^>]*data-action="practice-list"/);
    }
    assert.match(source, /PRACTICE_CALENDAR_SOURCE_STATE_KEY = 'cruisePortCalendarSource'/);
    assert.match(source, /function openPracticeCalendar\(source\)[\s\S]*history\.pushState\(nextState,[\s\S]*renderRoute\(\)/);
    assert.match(source, /function returnFromPracticeCalendar\(\)[\s\S]*history\.back\(\)[\s\S]*replaceHomeRoute\(\)/);
    assert.match(source, /elements\.homeCalendarButton\.addEventListener\('click',[\s\S]*PRACTICE_CALENDAR_ENTRY_SOURCE\.home/);
    assert.match(source, /elements\.historyOpen\.addEventListener\('click',[\s\S]*PRACTICE_CALENDAR_ENTRY_SOURCE\.practice/);
    assert.match(source, /destination === 'calendar'[\s\S]*PRACTICE_CALENDAR_ENTRY_SOURCE\.practice/);
    const sourceFunctions = source.slice(source.indexOf('function getPracticeCalendarEntrySource'), source.indexOf('function replacePracticeListRoute'));
    assert.doesNotMatch(sourceFunctions, /localStorage|sessionStorage/);
});

test('calendar back label follows source without changing the hash route', () => {
    assert.match(source, /elements\.historyBack\.textContent = getPracticeCalendarEntrySource\(\) === PRACTICE_CALENDAR_ENTRY_SOURCE\.practice[\s\S]*'← 練習メニュー'[\s\S]*'← TOPに戻る'/);
    assert.match(source, /#practice-menu\/calendar/);
    assert.doesNotMatch(source, /#music-calendar|calendarSource=/);
});

test('live and maintenance use small-size-safe outlined geometry while recording and the other icons remain', () => {
    const live = source.match(/live: (\[\['ellipse',[\s\S]*?\]\]),\n    rehearsal:/)?.[1];
    const recording = source.match(/recording: (\[\['rect',[\s\S]*?\]\]),\n    'string-change':/)?.[1];
    const maintenance = source.match(/maintenance: (\[\['path',[\s\S]*?\]\]),\n    memo:/)?.[1];
    assert.ok(live && recording && maintenance);
    assert.match(live, /rx: 4\.4, ry: 3\.6/);
    assert.match(live, /M13\.2 3\.8l5 5M11\.9 5\.2l5 5/);
    assert.notEqual(live, recording);
    assert.match(maintenance, /M14\.7 6\.3a1 1 0 0 0 0 1\.4/);
    assert.match(maintenance, /l6\.9-6\.9a6 6/);
    for (const key of ['practice', 'rehearsal', 'studio', 'recording', 'work', 'rest', 'schedule', "'string-change'"]) {
        assert.match(source, new RegExp(`\\n    ${key}:`));
    }
});

test('only calendar note time grows one restrained step and storage stays v2', () => {
    assert.match(styles, /\.practice-calendar-note-copy time\s*\{[^}]*font-size: calc\(0\.78rem \* var\(--font-scale\)\)/);
    assert.match(styles, /\.practice-calendar-note p\s*\{[^}]*font-size: calc\(0\.8rem \* var\(--font-scale\)\)/);
    assert.equal(PRACTICE_CALENDAR_SCHEMA_VERSION, 2);
    assert.doesNotMatch(read('practice-menu-calendar-store.js'), /PRACTICE_CALENDAR_SCHEMA_VERSION = 3/);
});

test('SP6.11 retains Cruise Port 0.26.2', () => {
    assert.match(read('app-version.js'), /CRUISE_PORT_APP_VERSION = '0\.26\.2'/);
});
