import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    PRACTICE_CALENDAR_DEFAULT_ICON,
    PRACTICE_CALENDAR_SCHEMA_VERSION,
    PRACTICE_CALENDAR_STORAGE_KEY,
    PRACTICE_CALENDAR_TIME_OPTIONS
} from './practice-menu-calendar-store.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const standard = read('index.html');
const pro = read('pro_9a3943176561/index.html');
const source = read('practice-menu-app.js');
const store = read('practice-menu-calendar-store.js');
const styles = read('style.css');

test('user-facing naming is Music Calendar while route and storage identity stay stable', () => {
    for (const markup of [standard, pro]) {
        assert.doesNotMatch(markup, /練習カレンダー/);
        assert.match(markup, /音楽カレンダー/);
    }
    assert.doesNotMatch(source, /練習カレンダー/);
    assert.match(source, /#practice-menu\/calendar/);
    assert.equal(PRACTICE_CALENDAR_STORAGE_KEY, 'cruisePort.practiceCalendar');
});

test('Practice heading and utility row contain the reorganized existing actions', () => {
    for (const markup of [standard, pro]) {
        const section = markup.slice(markup.indexOf('id="practice-list-view"'), markup.indexOf('id="practice-hidden-view"'));
        const heading = section.slice(section.indexOf('class="practice-heading-row"'), section.indexOf('class="practice-timer-card"'));
        assert.ok(heading.indexOf('id="practice-heading"') < heading.indexOf('id="practice-history-open"'));
        assert.match(heading, /id="practice-history-open"[\s\S]*音楽カレンダー/);
        const utility = section.slice(section.indexOf('class="practice-overview"'), section.indexOf('id="practice-storage-error"'));
        assert.ok(utility.indexOf('id="practice-hidden-open"') < utility.indexOf('id="practice-reorder-start"'));
    }
    assert.match(source, /elements\.historyOpen\.hidden = state\.reorderMode/);
});

test('Home has one 44px Calendar action before Settings in both editions', () => {
    for (const markup of [standard, pro]) {
        const header = markup.slice(markup.indexOf('class="port-header"'), markup.indexOf('</header>'));
        assert.ok(header.indexOf('id="home-calendar-button"') < header.indexOf('id="home-settings-button"'));
        assert.match(header, /aria-label="音楽カレンダーを開く" title="音楽カレンダー"/);
    }
    assert.match(source, /elements\.homeCalendarButton\.addEventListener\('click',[\s\S]*#practice-menu\/calendar/);
    assert.match(styles, /\.port-header-actions\s*\{[\s\S]*gap: 8px/);
    assert.match(styles, /\.port-calendar-button\s*\{[^}]*width: 44px;[^}]*flex: 0 0 44px/);
});

test('icon picker is an accessible custom listbox with the schedule default', () => {
    assert.equal(PRACTICE_CALENDAR_DEFAULT_ICON, 'schedule');
    for (const markup of [standard, pro]) {
        assert.match(markup, /id="practice-calendar-note-icon-toggle"[^>]*aria-haspopup="listbox"[^>]*aria-expanded="false"/);
        assert.match(markup, /id="practice-calendar-note-icons"[^>]*role="listbox"[^>]*hidden/);
    }
    assert.match(source, /setAttribute\('role', 'option'\)/);
    assert.match(source, /setAttribute\('aria-selected', selected \? 'true' : 'false'\)/);
    assert.match(source, /event\.key === 'Escape'/);
    assert.match(source, /ArrowDown:[\s\S]*ArrowUp:[\s\S]*Home:[\s\S]*End:/);
    assert.match(source, /!event\.target\.closest\('\.practice-calendar-icon-dropdown'\)/);
});

test('formal revised icons use a diagonal mic, acoustic 3+3 headstock and wrench', () => {
    assert.match(source, /live: \[\['ellipse',[\s\S]*rotate\(40 15\.5 6\)/);
    assert.match(source, /recording: \[\['rect'/);
    const stringIcon = source.match(/'string-change': (\[[\s\S]*?\]),\n    maintenance:/)?.[1];
    assert.ok(stringIcon);
    assert.equal((stringIcon.match(/\['circle'/g) || []).length, 6);
    assert.match(stringIcon, /M9 3h6l1\.5 14h-9z/);
    assert.match(source, /maintenance: \[\['path'/);
});

test('start and end use native 15-minute selects with safe dependency', () => {
    assert.equal(PRACTICE_CALENDAR_TIME_OPTIONS.length, 96);
    assert.deepEqual(PRACTICE_CALENDAR_TIME_OPTIONS.slice(0, 4), ['00:00', '00:15', '00:30', '00:45']);
    assert.equal(PRACTICE_CALENDAR_TIME_OPTIONS.at(-1), '23:45');
    for (const markup of [standard, pro]) {
        assert.match(markup, /id="practice-calendar-note-time"/);
        assert.match(markup, /id="practice-calendar-note-end-time"[^>]*disabled/);
        assert.doesNotMatch(markup, /type="time"/);
    }
    assert.match(source, /elements\.calendarNoteEndTime\.disabled = !startTime/);
    assert.match(source, /option\.value <= startTime/);
});

test('optional endTime extends schema v2 without migration or read-time writes', () => {
    assert.equal(PRACTICE_CALENDAR_SCHEMA_VERSION, 2);
    assert.match(store, /endTime = null/);
    assert.match(store, /\{ endTime: normalizedEndTime\.time \}/);
    assert.doesNotMatch(store, /PRACTICE_CALENDAR_SCHEMA_VERSION = 3/);
    const load = store.slice(store.indexOf('export function loadPracticeCalendar'), store.indexOf('export function savePracticeCalendar'));
    assert.doesNotMatch(load, /setItem|savePracticeCalendar/);
});

test('detail displays a range, start only, or no time without changing month markers', () => {
    assert.match(source, /note\.endTime \? `\$\{note\.time\}–\$\{note\.endTime\}` : note\.time/);
    assert.match(source, /if \(note\.time\)/);
    assert.match(source, /summary\.memoIcons\[0\]/);
    assert.doesNotMatch(source, /sort\([^)]*time/);
});

test('SP6.7 auto-follow and keyboard protection remain transient', () => {
    assert.match(source, /if \(!state\.calendarNoteUserEdited\) elements\.calendarNoteText\.value = icon\.label/);
    assert.match(source, /elements\.calendarNoteText\.addEventListener\('input',[\s\S]*calendarNoteUserEdited = true/);
    assert.match(source, /createPracticeCalendarKeyboard\(\{/);
    assert.doesNotMatch(store, /calendarNoteUserEdited/);
});

test('SP6.10 retains the current app version', () => {
    assert.match(read('app-version.js'), /CRUISE_PORT_APP_VERSION = '0\.26\.2'/);
});
