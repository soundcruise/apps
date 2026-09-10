import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const standard = read('index.html');
const pro = read('pro_9a3943176561/index.html');
const source = read('practice-menu-app.js');
const styles = read('style.css');

test('confirmed basic Calendar has two tabs, divider and a six-cell solid date grid', () => {
    for (const markup of [standard, pro]) {
        const button = markup.match(/<button id="home-calendar-button"[\s\S]*?<\/button>/)?.[0];
        assert.ok(button);
        assert.match(button, /viewBox="0 0 24 24"/);
        assert.match(button, /<rect x="3\.5" y="5\.5" width="17" height="15" rx="2\.5"\/>/);
        assert.match(button, /M8 3v5M16 3v5M3\.5 10h17/);
        assert.match(button, /<g fill="currentColor" stroke="none">/);
        assert.equal((button.match(/width="2\.5" height="2\.5"/g) || []).length, 6);
        assert.equal((button.match(/<circle/g) || []).length, 0);
    }
    assert.match(styles, /\.port-calendar-button\s*\{[^}]*width: 44px;[^}]*flex: 0 0 44px/);
    assert.match(styles, /\.port-calendar-button svg\s*\{[^}]*width: 20px;[^}]*height: 20px/);
    assert.match(styles, /\.port-header-actions\s*\{[\s\S]*gap: 8px/);
});

test('confirmed Live is one diagonal solid microphone without assembled parts', () => {
    const live = source.match(/live: (\[\['path',[\s\S]*?\]\]),\n    rehearsal:/)?.[1];
    const recording = source.match(/recording: (\[\['rect',[\s\S]*?\]\]),\n    'string-change':/)?.[1];
    assert.ok(live && recording);
    assert.match(live, /M3\.7 17\.8l7\.3-7\.3/);
    assert.equal((live.match(/\['path'/g) || []).length, 1);
    assert.equal((live.match(/fill: 'currentColor'/g) || []).length, 1);
    assert.equal((live.match(/stroke: 'none'/g) || []).length, 1);
    assert.doesNotMatch(live, /ellipse|rect|circle|transform|M8 21h8|M5 11a7/);
    assert.notEqual(live, recording);
});

test('one central Live definition feeds selection, dropdown, detail and calendar markers', () => {
    assert.equal((source.match(/\n    live:/g) || []).length, 1);
    for (const call of [
        /calendarNoteIconSelection\.replaceChildren\(createPracticeCalendarIcon\(icon\.value\)/,
        /button\.append\(createPracticeCalendarIcon\(value\), text\)/,
        /row\.append\(createPracticeCalendarIcon\(note\.icon, 'practice-calendar-note-icon'\)\)/,
        /memoMark\.append\(createPracticeCalendarIcon\(summary\.memoIcons\[0\]\)\)/
    ]) assert.match(source, call);
});

test('the other nine icons and SP6.11 navigation stay present', () => {
    for (const key of ['practice', 'rehearsal', 'studio', 'recording', 'work', 'rest', 'schedule', "'string-change'", 'maintenance']) {
        assert.match(source, new RegExp(`\\n    ${key}:`));
    }
    assert.match(source, /maintenance: \[\['path',[\s\S]*M14\.7 6\.3/);
    assert.match(source, /PRACTICE_CALENDAR_SOURCE_STATE_KEY = 'cruisePortCalendarSource'/);
    assert.match(source, /'← 練習メニュー'[\s\S]*'← TOPに戻る'/);
});

test('SP6.12 changes no version or Calendar time styling', () => {
    assert.match(read('app-version.js'), /CRUISE_PORT_APP_VERSION = '0\.26\.2'/);
    assert.match(styles, /\.practice-calendar-note-copy time\s*\{[^}]*font-size: calc\(0\.78rem \* var\(--font-scale\)\)/);
});
