import { readStorageValue, assertStorageUnchanged, acceptStorageValues } from './storage-conflict.js?v=0.24.0';
export const PRACTICE_CALENDAR_SCHEMA_VERSION = 2;
export const PRACTICE_CALENDAR_STORAGE_KEY = 'cruisePort.practiceCalendar';
export const PRACTICE_CALENDAR_LIMITS = Object.freeze({ notes: 1500, text: 500 });
export const PRACTICE_CALENDAR_DEFAULT_ICON = 'schedule';
export const PRACTICE_CALENDAR_TIME_OPTIONS = Object.freeze(Array.from({ length: 96 }, (_, index) => {
    const hours = Math.floor(index / 4);
    const minutes = (index % 4) * 15;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}));
export const PRACTICE_CALENDAR_ICONS = Object.freeze([
    Object.freeze({ value: 'practice', label: '練習' }),
    Object.freeze({ value: 'live', label: 'ライブ' }),
    Object.freeze({ value: 'rehearsal', label: 'リハ' }),
    Object.freeze({ value: 'studio', label: 'スタジオ' }),
    Object.freeze({ value: 'recording', label: '録音' }),
    Object.freeze({ value: 'work', label: '作業' }),
    Object.freeze({ value: 'rest', label: '休み' }),
    Object.freeze({ value: 'schedule', label: '予定' }),
    Object.freeze({ value: 'string-change', label: '弦交換' }),
    Object.freeze({ value: 'maintenance', label: 'メンテ' })
]);

// Keep legacy memo valid without rewriting stored records.
const PRACTICE_CALENDAR_ICON_VALUES = new Set(['memo', ...PRACTICE_CALENDAR_ICONS.map(({ value }) => value)]);

function createId(now = new Date()) {
    return globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function isIsoDate(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function isValidPracticeLocalDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isValidPracticeCalendarTime(value) {
    if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
    const [hours, minutes] = value.split(':').map(Number);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function isValidPracticeCalendarTimeRange(time, endTime) {
    if (endTime === undefined || endTime === null || endTime === '') return true;
    return isValidPracticeCalendarTime(time)
        && isValidPracticeCalendarTime(endTime)
        && endTime > time;
}

function normalizePracticeCalendarTime(value) {
    if (value === undefined || value === null || value === '') return { ok: true, time: null };
    return isValidPracticeCalendarTime(value)
        ? { ok: true, time: value }
        : { ok: false, time: null };
}

function isValidNote(note, version = PRACTICE_CALENDAR_SCHEMA_VERSION) {
    return Boolean(
        note
        && typeof note === 'object'
        && !Array.isArray(note)
        && typeof note.id === 'string'
        && note.id.length > 0
        && note.id.length <= 160
        && isValidPracticeLocalDate(note.localDate)
        && typeof note.text === 'string'
        && note.text.length > 0
        && note.text.trim() === note.text
        && note.text.length <= PRACTICE_CALENDAR_LIMITS.text
        && (note.time === undefined || note.time === null || isValidPracticeCalendarTime(note.time))
        && (note.endTime === undefined || note.endTime === null || isValidPracticeCalendarTime(note.endTime))
        && isValidPracticeCalendarTimeRange(note.time, note.endTime)
        && (version === 1 || PRACTICE_CALENDAR_ICON_VALUES.has(note.icon))
        && isIsoDate(note.createdAt)
        && isIsoDate(note.updatedAt)
    );
}

export function createEmptyPracticeCalendar() {
    return { version: PRACTICE_CALENDAR_SCHEMA_VERSION, notes: [] };
}

export function isValidPracticeCalendar(calendar) {
    return isValidPracticeCalendarVersion(calendar, PRACTICE_CALENDAR_SCHEMA_VERSION);
}

function isValidPracticeCalendarVersion(calendar, version) {
    return Boolean(
        calendar
        && typeof calendar === 'object'
        && !Array.isArray(calendar)
        && calendar.version === version
        && Array.isArray(calendar.notes)
        && calendar.notes.length <= PRACTICE_CALENDAR_LIMITS.notes
        && calendar.notes.every((note) => isValidNote(note, version))
        && new Set(calendar.notes.map((note) => note.id)).size === calendar.notes.length
    );
}

function cloneCalendar(calendar) {
    return {
        version: PRACTICE_CALENDAR_SCHEMA_VERSION,
        notes: calendar.notes.map((note) => ({ ...note, icon: note.icon || 'memo' }))
    };
}

export function loadPracticeCalendar(storage) {
    const fallback = createEmptyPracticeCalendar();
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        const rawValue = readStorageValue(storage, PRACTICE_CALENDAR_STORAGE_KEY);
        if (rawValue === null) return { ok: true, calendar: fallback };
        const parsed = JSON.parse(rawValue);
        const current = isValidPracticeCalendar(parsed);
        const legacy = isValidPracticeCalendarVersion(parsed, 1);
        if (!current && !legacy) return { ok: false, calendar: fallback, reason: 'invalid-data' };
        return legacy
            ? { ok: true, calendar: cloneCalendar(parsed), migrated: true }
            : { ok: true, calendar: cloneCalendar(parsed) };
    } catch (_) {
        return { ok: false, calendar: fallback, reason: 'read-failed' };
    }
}

export function savePracticeCalendar(calendar, storage) {
    if (!isValidPracticeCalendar(calendar)) return { ok: false, reason: 'invalid-data' };
    let previousValue;
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        assertStorageUnchanged(storage, [PRACTICE_CALENDAR_STORAGE_KEY]);
        previousValue = storage.getItem(PRACTICE_CALENDAR_STORAGE_KEY);
        storage.setItem(PRACTICE_CALENDAR_STORAGE_KEY, JSON.stringify(calendar));
        acceptStorageValues(storage, [PRACTICE_CALENDAR_STORAGE_KEY]);
        return { ok: true };
    } catch (_) {
        try {
            if (previousValue === null) storage.removeItem(PRACTICE_CALENDAR_STORAGE_KEY);
            else if (previousValue !== undefined) storage.setItem(PRACTICE_CALENDAR_STORAGE_KEY, previousValue);
        } catch (_) {
            // The caller retains the last known-good in-memory value.
        }
        return { ok: false, reason: 'write-failed' };
    }
}

export function createPracticeCalendarNote(calendar, {
    localDate,
    text,
    icon = PRACTICE_CALENDAR_DEFAULT_ICON,
    time = null,
    endTime = null
}, now = new Date()) {
    const normalizedText = typeof text === 'string' ? text.trim() : '';
    const normalizedTime = normalizePracticeCalendarTime(time);
    const normalizedEndTime = normalizePracticeCalendarTime(endTime);
    if (
        !isValidPracticeLocalDate(localDate)
        || !normalizedText
        || normalizedText.length > PRACTICE_CALENDAR_LIMITS.text
        || !normalizedTime.ok
        || !normalizedEndTime.ok
        || !isValidPracticeCalendarTimeRange(normalizedTime.time, normalizedEndTime.time)
        || !PRACTICE_CALENDAR_ICON_VALUES.has(icon)
    ) {
        return { ok: false, calendar: cloneCalendar(calendar), reason: 'invalid-values' };
    }
    if (calendar.notes.length >= PRACTICE_CALENDAR_LIMITS.notes) {
        return { ok: false, calendar: cloneCalendar(calendar), reason: 'limit-reached' };
    }
    const timestamp = now.toISOString();
    const note = {
        id: createId(now),
        localDate,
        text: normalizedText,
        icon,
        ...(normalizedTime.time === null ? {} : { time: normalizedTime.time }),
        ...(normalizedEndTime.time === null ? {} : { endTime: normalizedEndTime.time }),
        createdAt: timestamp,
        updatedAt: timestamp
    };
    return { ok: true, note, calendar: { version: PRACTICE_CALENDAR_SCHEMA_VERSION, notes: [...calendar.notes, note] } };
}

export function updatePracticeCalendarNote(calendar, id, values, now = new Date()) {
    const index = calendar.notes.findIndex((note) => note.id === id);
    if (index < 0) return { ok: false, calendar: cloneCalendar(calendar), reason: 'not-found' };
    const current = calendar.notes[index];
    const text = typeof values === 'string' ? values : values?.text;
    const icon = typeof values === 'string' ? current.icon : values?.icon;
    const time = typeof values === 'string' || !Object.prototype.hasOwnProperty.call(values || {}, 'time')
        ? current.time
        : values.time;
    const endTime = typeof values === 'string' || !Object.prototype.hasOwnProperty.call(values || {}, 'endTime')
        ? current.endTime
        : values.endTime;
    const normalizedText = typeof text === 'string' ? text.trim() : '';
    const normalizedTime = normalizePracticeCalendarTime(time);
    const normalizedEndTime = normalizePracticeCalendarTime(endTime);
    if (
        !normalizedText
        || normalizedText.length > PRACTICE_CALENDAR_LIMITS.text
        || !normalizedTime.ok
        || !normalizedEndTime.ok
        || !isValidPracticeCalendarTimeRange(normalizedTime.time, normalizedEndTime.time)
        || !PRACTICE_CALENDAR_ICON_VALUES.has(icon)
    ) {
        return { ok: false, calendar: cloneCalendar(calendar), reason: 'invalid-values' };
    }
    const notes = calendar.notes.map((note, noteIndex) => {
        if (noteIndex !== index) return { ...note };
        const updated = { ...note, text: normalizedText, icon, updatedAt: now.toISOString() };
        if (normalizedTime.time === null) delete updated.time;
        else updated.time = normalizedTime.time;
        if (normalizedEndTime.time === null) delete updated.endTime;
        else updated.endTime = normalizedEndTime.time;
        return updated;
    });
    return { ok: true, calendar: { version: PRACTICE_CALENDAR_SCHEMA_VERSION, notes } };
}

export function deletePracticeCalendarNote(calendar, id) {
    const notes = calendar.notes.filter((note) => note.id !== id);
    return notes.length === calendar.notes.length
        ? { ok: false, calendar: cloneCalendar(calendar), reason: 'not-found' }
        : { ok: true, calendar: { version: PRACTICE_CALENDAR_SCHEMA_VERSION, notes: notes.map((note) => ({ ...note })) } };
}

export function getPracticeCalendarNotesForDate(calendar, localDate) {
    return calendar.notes
        .filter((note) => note.localDate === localDate)
        .sort((first, second) => first.createdAt.localeCompare(second.createdAt));
}
