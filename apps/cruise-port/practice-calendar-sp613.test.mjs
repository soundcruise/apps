import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const source = read('practice-menu-app.js');

test('Live is one closed currentColor path with no assembled parts or stand', () => {
    const live = source.match(/live: (\[\['path',[\s\S]*?\]\]),\n    rehearsal:/)?.[1];
    assert.ok(live);
    assert.equal((live.match(/\['path'/g) || []).length, 1);
    assert.equal((live.match(/fill: 'currentColor'/g) || []).length, 1);
    assert.equal((live.match(/stroke: 'none'/g) || []).length, 1);
    assert.match(live, /d: 'M[^']+z'/);
    assert.doesNotMatch(live, /ellipse|rect|circle|line|transform|stand/);
});

test('one Live definition still feeds every Calendar rendering surface', () => {
    assert.equal((source.match(/\n    live:/g) || []).length, 1);
    for (const call of [
        /calendarNoteIconSelection\.replaceChildren\(createPracticeCalendarIcon\(icon\.value\)/,
        /button\.append\(createPracticeCalendarIcon\(value\), text\)/,
        /row\.append\(createPracticeCalendarIcon\(note\.icon, 'practice-calendar-note-icon'\)\)/,
        /memoMark\.append\(createPracticeCalendarIcon\(summary\.memoIcons\[0\]\)\)/
    ]) assert.match(source, call);
});

test('recording and the other nine formal icons remain available', () => {
    assert.match(source, /recording: \[\['rect',[\s\S]*M5 11a7 7 0 0 0 14 0/);
    for (const key of ['practice', 'rehearsal', 'studio', 'recording', 'work', 'rest', 'schedule', "'string-change'", 'maintenance']) {
        assert.match(source, new RegExp(`\\n    ${key}:`));
    }
});

test('SP6.13 UI remains covered in Cruise Port 0.27.0', () => {
    assert.match(read('app-version.js'), /CRUISE_PORT_APP_VERSION = '0\.27\.0'/);
});
