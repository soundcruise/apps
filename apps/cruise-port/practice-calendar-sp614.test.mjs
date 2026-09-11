import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const source = read('practice-menu-app.js');

test('Live is a single solid diagonal hand microphone with one grille cutout', () => {
    const live = source.match(/live: (\[\['path',[\s\S]*?\]\]),\n    rehearsal:/)?.[1];
    assert.ok(live);
    assert.equal((live.match(/\['path'/g) || []).length, 1);
    assert.equal((live.match(/[mM][^z]+z/g) || []).length, 2);
    assert.match(live, /fill: 'currentColor'/);
    assert.match(live, /'fill-rule': 'evenodd'/);
    assert.match(live, /'clip-rule': 'evenodd'/);
    assert.match(live, /stroke: 'none'/);
    assert.doesNotMatch(live, /ellipse|rect|circle|line|transform|rotate|stand/);
});

test('Live silhouette keeps a long handle, joined head and diagonal grille band', () => {
    const live = source.match(/live: (\[\['path',[\s\S]*?\]\]),\n    rehearsal:/)?.[1];
    assert.ok(live);
    assert.match(live, /M3\.3 20\.2c-1-1-1-2\.5 0-3\.5l7\.8-7\.8/);
    assert.match(live, /M11\.8 5\.4l6\.8 6\.6 1\.3-1\.3-6\.8-6\.7z/);
});

test('recording and every non-Live icon definition remain present', () => {
    assert.match(source, /recording: \[\['rect',[\s\S]*M5 11a7 7 0 0 0 14 0/);
    for (const key of ['practice', 'rehearsal', 'studio', 'recording', 'work', 'rest', 'schedule', "'string-change'", 'maintenance']) {
        assert.match(source, new RegExp(`\\n    ${key}:`));
    }
});

test('SP6.14 central rendering routes remain covered in Cruise Port 0.27.2', () => {
    assert.equal((source.match(/\n    live:/g) || []).length, 1);
    assert.match(source, /calendarNoteIconSelection\.replaceChildren\(createPracticeCalendarIcon\(icon\.value\)/);
    assert.match(source, /button\.append\(createPracticeCalendarIcon\(value\), text\)/);
    assert.match(source, /row\.append\(createPracticeCalendarIcon\(note\.icon, 'practice-calendar-note-icon'\)\)/);
    assert.match(source, /memoMark\.append\(createPracticeCalendarIcon\(summary\.memoIcons\[0\]\)\)/);
    assert.match(read('app-version.js'), /CRUISE_PORT_APP_VERSION = '0\.27\.2'/);
});
