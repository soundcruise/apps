import assert from 'node:assert/strict';
import test from 'node:test';
import {
    PRACTICE_CALENDAR_DEFAULT_ICON,
    PRACTICE_CALENDAR_ICONS,
    PRACTICE_CALENDAR_LIMITS,
    PRACTICE_CALENDAR_SCHEMA_VERSION,
    PRACTICE_CALENDAR_STORAGE_KEY,
    createEmptyPracticeCalendar,
    createPracticeCalendarNote,
    deletePracticeCalendarNote,
    getPracticeCalendarNotesForDate,
    loadPracticeCalendar,
    savePracticeCalendar,
    updatePracticeCalendarNote
} from './practice-menu-calendar-store.js';

class FakeStorage {
    constructor(values = {}) { this.values = new Map(Object.entries(values)); this.failWrites = false; }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { if (this.failWrites) throw new Error('quota'); this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
}

const now = new Date('2026-09-08T01:00:00.000Z');

test('future and past dates support multiple trimmed notes with reload', () => {
    let calendar = createEmptyPracticeCalendar();
    const first = createPracticeCalendarNote(calendar, { localDate: '2026-10-02', text: '  バンドリハーサル  ' }, now);
    assert.equal(first.ok, true);
    assert.equal(first.note.icon, PRACTICE_CALENDAR_DEFAULT_ICON);
    calendar = first.calendar;
    calendar = createPracticeCalendarNote(calendar, { localDate: '2026-10-02', text: '個人練習' }, now).calendar;
    calendar = createPracticeCalendarNote(calendar, { localDate: '2026-09-01', text: 'ライブ' }, now).calendar;
    assert.deepEqual(getPracticeCalendarNotesForDate(calendar, '2026-10-02').map(({ text }) => text), ['バンドリハーサル', '個人練習']);
    const storage = new FakeStorage();
    assert.deepEqual(savePracticeCalendar(calendar, storage), { ok: true });
    assert.equal(loadPracticeCalendar(storage).calendar.notes.length, 3);
});

test('notes can be edited and individually deleted without touching peers', () => {
    const created = createPracticeCalendarNote(createEmptyPracticeCalendar(), { localDate: '2026-10-02', text: 'ライブ', icon: 'live' }, now);
    const peer = createPracticeCalendarNote(created.calendar, { localDate: '2026-10-02', text: '休み' }, now);
    const updated = updatePracticeCalendarNote(peer.calendar, created.note.id, { text: 'ライブ本番', icon: 'recording' }, new Date('2026-09-09T01:00:00Z'));
    assert.equal(updated.calendar.notes[0].text, 'ライブ本番');
    assert.equal(updated.calendar.notes[0].icon, 'recording');
    const deleted = deletePracticeCalendarNote(updated.calendar, created.note.id);
    assert.deepEqual(deleted.calendar.notes.map(({ text }) => text), ['休み']);
});

test('v1 notes migrate to v2 with the memo icon without rewriting raw storage', () => {
    const legacyNote = {
        id: 'legacy-note',
        localDate: '2026-09-09',
        text: '以前のメモ',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
    };
    const raw = JSON.stringify({ version: 1, notes: [legacyNote] });
    const storage = new FakeStorage({ [PRACTICE_CALENDAR_STORAGE_KEY]: raw });
    const loaded = loadPracticeCalendar(storage);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.migrated, true);
    assert.equal(loaded.calendar.version, PRACTICE_CALENDAR_SCHEMA_VERSION);
    assert.equal(loaded.calendar.notes[0].icon, 'memo');
    assert.equal(storage.getItem(PRACTICE_CALENDAR_STORAGE_KEY), raw);
});

test('all eight formal icons save and reload', () => {
    assert.deepEqual(PRACTICE_CALENDAR_ICONS.map(({value,label})=>[value,label]), [
        ['practice','練習'],['live','ライブ'],['rehearsal','リハ'],['studio','スタジオ'],
        ['recording','録音'],['work','作業'],['rest','休み'],['schedule','予定']
    ]);
    let calendar = createEmptyPracticeCalendar();
    PRACTICE_CALENDAR_ICONS.forEach(({ value }, index) => {
        calendar = createPracticeCalendarNote(calendar, {
            localDate: `2026-10-${String(index + 1).padStart(2, '0')}`,
            text: value,
            icon: value
        }, now).calendar;
    });
    const storage = new FakeStorage();
    assert.equal(savePracticeCalendar(calendar, storage).ok, true);
    assert.deepEqual(loadPracticeCalendar(storage).calendar.notes.map(({ icon }) => icon), PRACTICE_CALENDAR_ICONS.map(({ value }) => value));
});

test('legacy v2 memo remains readable and unmodified in storage', () => {
    const created = createPracticeCalendarNote(createEmptyPracticeCalendar(), {localDate:'2026-10-02',text:'以前の本文',icon:'memo'}, now);
    assert.equal(created.ok,true);
    const raw=JSON.stringify(created.calendar);
    const storage=new FakeStorage({[PRACTICE_CALENDAR_STORAGE_KEY]:raw});
    const loaded=loadPracticeCalendar(storage);
    assert.equal(loaded.ok,true);
    assert.equal(loaded.calendar.notes[0].icon,'memo');
    assert.equal(storage.getItem(PRACTICE_CALENDAR_STORAGE_KEY),raw);
    assert(!PRACTICE_CALENDAR_ICONS.some(({value})=>value==='memo'));
});

test('empty, overlong, malformed, and over-limit calendar data fail safely', () => {
    const empty = createEmptyPracticeCalendar();
    assert.equal(createPracticeCalendarNote(empty, { localDate: '2026-10-02', text: ' ' }, now).ok, false);
    assert.equal(createPracticeCalendarNote(empty, { localDate: 'bad', text: '予定' }, now).ok, false);
    assert.equal(createPracticeCalendarNote(empty, { localDate: '2026-10-02', text: '予定', icon: 'unknown' }, now).ok, false);
    assert.equal(createPracticeCalendarNote(empty, { localDate: '2026-10-02', text: 'x'.repeat(PRACTICE_CALENDAR_LIMITS.text + 1) }, now).ok, false);
    const malformed = '{broken';
    const storage = new FakeStorage({ [PRACTICE_CALENDAR_STORAGE_KEY]: malformed });
    assert.equal(loadPracticeCalendar(storage).ok, false);
    assert.equal(storage.getItem(PRACTICE_CALENDAR_STORAGE_KEY), malformed);
});
