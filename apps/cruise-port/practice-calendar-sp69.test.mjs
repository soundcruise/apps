import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PRACTICE_CALENDAR_ICONS, PRACTICE_CALENDAR_SCHEMA_VERSION } from './practice-menu-calendar-store.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');

test('ten icon choices retain the formal keys without a memo selector', () => {
    assert.deepEqual(PRACTICE_CALENDAR_ICONS.map(({ value }) => value), [
        'practice', 'live', 'rehearsal', 'studio', 'recording',
        'work', 'rest', 'schedule', 'string-change', 'maintenance'
    ]);
    assert.equal(PRACTICE_CALENDAR_ICONS.some(({ value }) => value === 'memo'), false);
    const css = read('style.css');
    assert.match(css, /\.practice-calendar-note-icons\s*\{[^}]*position: absolute;/);
    assert.match(css, /\.practice-calendar-note-icons button\s*\{[^}]*min-height: 44px;/);
    assert.doesNotMatch(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
});

test('live uses the revised diagonal dynamic microphone distinct from recording', () => {
    const source = read('practice-menu-app.js');
    const live = source.match(/live: (\[\['ellipse',[\s\S]*?\]\]),\n    rehearsal:/)?.[1];
    const recording = source.match(/recording: (\[\['rect',[\s\S]*?\]\]),\n    'string-change':/)?.[1];
    assert.ok(live);
    assert.ok(recording);
    assert.match(live, /rx: 4\.4, ry: 3\.6/);
    assert.match(live, /rotate\(-45 16 6\)/);
    assert.notEqual(live, recording);
    assert.match(source, /'string-change': \[\['path'/);
    assert.match(source, /maintenance: \[\['path'/);
});

test('start and end selects are shared by Standard and Pro and sit before the memo', () => {
    for (const file of ['index.html', 'pro_9a3943176561/index.html']) {
        const markup = read(file);
        const form = markup.slice(markup.indexOf('id="practice-calendar-note-form"'), markup.indexOf('</form>', markup.indexOf('id="practice-calendar-note-form"')));
        assert.match(form, /id="practice-calendar-note-time"/);
        assert.match(form, /id="practice-calendar-note-end-time"[^>]*disabled/);
        assert.ok(form.indexOf('practice-calendar-note-icons') < form.indexOf('practice-calendar-note-time'));
        assert.ok(form.indexOf('practice-calendar-note-time') < form.indexOf('practice-calendar-note-text'));
    }
});

test('time range create edit removal and detail rendering stay wired without schema migration', () => {
    const source = read('practice-menu-app.js');
    const store = read('practice-menu-calendar-store.js');
    assert.match(source, /elements\.calendarNoteTime\.value = note\?\.time \|\| ''/);
    assert.match(source, /elements\.calendarNoteEndTime\.value = note\?\.endTime \|\| ''/);
    assert.match(source, /time\.dateTime = `\$\{note\.localDate\}T\$\{note\.time\}`/);
    assert.match(source, /note\.endTime \? `\$\{note\.time\}–\$\{note\.endTime\}` : note\.time/);
    assert.match(store, /if \(normalizedTime\.time === null\) delete updated\.time/);
    assert.match(store, /if \(normalizedEndTime\.time === null\) delete updated\.endTime/);
    assert.equal(PRACTICE_CALENDAR_SCHEMA_VERSION, 2);
    assert.doesNotMatch(store, /PRACTICE_CALENDAR_SCHEMA_VERSION = 3/);
});

test('SP6.7 text protection and keyboard module remain in place', () => {
    const source = read('practice-menu-app.js');
    assert.match(source, /if \(!state\.calendarNoteUserEdited\) elements\.calendarNoteText\.value = icon\.label/);
    assert.match(source, /elements\.calendarNoteText\.addEventListener\('input',[\s\S]*calendarNoteUserEdited = true/);
    assert.match(source, /createPracticeCalendarKeyboard\(\{/);
    assert.match(read('practice-calendar-keyboard.js'), /One correction per focused control/);
});
