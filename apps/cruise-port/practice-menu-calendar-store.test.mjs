import assert from 'node:assert/strict';
import test from 'node:test';
import {
    PRACTICE_CALENDAR_DEFAULT_ICON,
    PRACTICE_CALENDAR_ICONS,
    PRACTICE_CALENDAR_LIMITS,
    PRACTICE_CALENDAR_SCHEMA_VERSION,
    PRACTICE_CALENDAR_STORAGE_KEY,
    PRACTICE_CALENDAR_TIME_OPTIONS,
    createEmptyPracticeCalendar,
    createPracticeCalendarNote,
    deletePracticeCalendarNote,
    getPracticeCalendarNotesForDate,
    isValidPracticeCalendarTime,
    isValidPracticeCalendarTimeRange,
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

test('all ten formal icons save and reload in the dropdown order', () => {
    assert.deepEqual(PRACTICE_CALENDAR_ICONS.map(({value,label})=>[value,label]), [
        ['practice','練習'],['live','ライブ'],['rehearsal','リハ'],['studio','スタジオ'],
        ['recording','録音'],['work','作業'],['rest','休み'],['schedule','予定'],
        ['string-change','弦交換'],['maintenance','メンテ']
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

test('optional local time saves as HH:MM while an empty time remains omitted', () => {
    const emptyTime = createPracticeCalendarNote(createEmptyPracticeCalendar(), {
        localDate: '2026-10-02', text: '終日予定', icon: 'schedule', time: ''
    }, now);
    assert.equal(emptyTime.ok, true);
    assert.equal(Object.hasOwn(emptyTime.note, 'time'), false);
    const timed = createPracticeCalendarNote(emptyTime.calendar, {
        localDate: '2026-10-02', text: 'ライブ', icon: 'live', time: '19:00'
    }, now);
    assert.equal(timed.ok, true);
    assert.equal(timed.note.time, '19:00');
    const storage = new FakeStorage();
    assert.equal(savePracticeCalendar(timed.calendar, storage).ok, true);
    assert.equal(loadPracticeCalendar(storage).calendar.notes[1].time, '19:00');
});

test('time edit can change and remove the field without changing schema', () => {
    const created = createPracticeCalendarNote(createEmptyPracticeCalendar(), {
        localDate: '2026-10-02', text: 'ライブ', icon: 'live', time: '19:00'
    }, now);
    const changed = updatePracticeCalendarNote(created.calendar, created.note.id, {
        text: '開演', icon: 'live', time: '19:30'
    }, new Date('2026-09-09T01:00:00Z'));
    assert.equal(changed.ok, true);
    assert.equal(changed.calendar.version, 2);
    assert.equal(changed.calendar.notes[0].time, '19:30');
    const removed = updatePracticeCalendarNote(changed.calendar, created.note.id, {
        text: '開演', icon: 'live', time: ''
    }, new Date('2026-09-10T01:00:00Z'));
    assert.equal(removed.ok, true);
    assert.equal(Object.hasOwn(removed.calendar.notes[0], 'time'), false);
});

test('15 minute choices cover a local day and endTime stays optional', () => {
    assert.equal(PRACTICE_CALENDAR_TIME_OPTIONS.length, 96);
    assert.equal(PRACTICE_CALENDAR_TIME_OPTIONS[0], '00:00');
    assert.equal(PRACTICE_CALENDAR_TIME_OPTIONS[1], '00:15');
    assert.equal(PRACTICE_CALENDAR_TIME_OPTIONS.at(-1), '23:45');
    const created = createPracticeCalendarNote(createEmptyPracticeCalendar(), {
        localDate: '2026-10-02', text: 'ライブ', icon: 'live', time: '19:00', endTime: '21:00'
    }, now);
    assert.equal(created.ok, true);
    assert.equal(created.note.time, '19:00');
    assert.equal(created.note.endTime, '21:00');
    assert.equal(created.calendar.version, 2);
});

test('endTime edits and removal preserve the established time field', () => {
    const created = createPracticeCalendarNote(createEmptyPracticeCalendar(), {
        localDate: '2026-10-02', text: 'ライブ', icon: 'live', time: '19:00', endTime: '21:00'
    }, now);
    const changed = updatePracticeCalendarNote(created.calendar, created.note.id, {
        text: 'ライブ', icon: 'live', time: '19:00', endTime: '21:30'
    }, new Date('2026-09-09T01:00:00Z'));
    assert.equal(changed.calendar.notes[0].endTime, '21:30');
    const endRemoved = updatePracticeCalendarNote(changed.calendar, created.note.id, {
        text: 'ライブ', icon: 'live', time: '19:00', endTime: ''
    }, new Date('2026-09-09T02:00:00Z'));
    assert.equal(endRemoved.calendar.notes[0].time, '19:00');
    assert.equal(Object.hasOwn(endRemoved.calendar.notes[0], 'endTime'), false);
    const bothRemoved = updatePracticeCalendarNote(endRemoved.calendar, created.note.id, {
        text: 'ライブ', icon: 'live', time: '', endTime: ''
    }, new Date('2026-09-09T03:00:00Z'));
    assert.equal(Object.hasOwn(bothRemoved.calendar.notes[0], 'time'), false);
    assert.equal(Object.hasOwn(bothRemoved.calendar.notes[0], 'endTime'), false);
});

test('endTime requires a valid earlier start on the same local day', () => {
    assert.equal(isValidPracticeCalendarTimeRange('', ''), true);
    assert.equal(isValidPracticeCalendarTimeRange('19:00', ''), true);
    assert.equal(isValidPracticeCalendarTimeRange('19:00', '21:00'), true);
    for (const [time, endTime] of [['', '21:00'], ['19:00', '19:00'], ['21:00', '19:00'], ['19:00', '24:00']]) {
        assert.equal(isValidPracticeCalendarTimeRange(time, endTime), false);
        assert.equal(createPracticeCalendarNote(createEmptyPracticeCalendar(), {
            localDate: '2026-10-02', text: '不正', icon: 'schedule', time, endTime
        }, now).ok, false);
    }
});

test('time validation rejects malformed values and preserves created order', () => {
    for (const valid of ['00:00', '09:05', '19:00', '23:59']) assert.equal(isValidPracticeCalendarTime(valid), true);
    for (const invalid of ['9:05', '24:00', '12:60', '19:00:00', 'UTC', 1900, null]) assert.equal(isValidPracticeCalendarTime(invalid), false);
    assert.equal(createPracticeCalendarNote(createEmptyPracticeCalendar(), {
        localDate: '2026-10-02', text: '不正', icon: 'schedule', time: '24:00'
    }, now).ok, false);
    const late = createPracticeCalendarNote(createEmptyPracticeCalendar(), {
        localDate: '2026-10-02', text: '先に作成', icon: 'schedule', time: '20:00'
    }, now);
    const early = createPracticeCalendarNote(late.calendar, {
        localDate: '2026-10-02', text: '後に作成', icon: 'schedule', time: '09:00'
    }, new Date('2026-09-08T02:00:00Z'));
    assert.deepEqual(getPracticeCalendarNotesForDate(early.calendar, '2026-10-02').map(({ text }) => text), ['先に作成', '後に作成']);
});

test('legacy v2 records without time load without rewriting stored data', () => {
    const created = createPracticeCalendarNote(createEmptyPracticeCalendar(), {
        localDate: '2026-10-02', text: '既存予定', icon: 'schedule'
    }, now);
    const raw = JSON.stringify(created.calendar);
    const storage = new FakeStorage({ [PRACTICE_CALENDAR_STORAGE_KEY]: raw });
    const loaded = loadPracticeCalendar(storage);
    assert.equal(loaded.ok, true);
    assert.equal(Object.hasOwn(loaded.calendar.notes[0], 'time'), false);
    assert.equal(storage.getItem(PRACTICE_CALENDAR_STORAGE_KEY), raw);
    assert.equal(PRACTICE_CALENDAR_SCHEMA_VERSION, 2);
});

test('SP6.9 time-only records remain start-time records without rewrite', () => {
    const created = createPracticeCalendarNote(createEmptyPracticeCalendar(), {
        localDate: '2026-10-02', text: '旧時刻', icon: 'schedule', time: '19:07'
    }, now);
    const raw = JSON.stringify(created.calendar);
    const storage = new FakeStorage({ [PRACTICE_CALENDAR_STORAGE_KEY]: raw });
    const loaded = loadPracticeCalendar(storage);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.calendar.notes[0].time, '19:07');
    assert.equal(Object.hasOwn(loaded.calendar.notes[0], 'endTime'), false);
    assert.equal(storage.getItem(PRACTICE_CALENDAR_STORAGE_KEY), raw);
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
