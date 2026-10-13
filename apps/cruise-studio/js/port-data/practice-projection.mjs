// Display projection only. Port owns schemas/storage; this module has no I/O or writers.
export const PRACTICE_KEYS = Object.freeze(['schemaVersion', 'practiceMenus', 'practiceMenuSets', 'practiceProgress', 'practiceHistory', 'practiceCalendar', 'myApps', 'syncAssetMetadata'].map(name => 'cruisePort.' + name));
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = (x, max = Infinity) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
const integer = x => Number.isSafeInteger(x) && x >= 0;
const iso = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x) && Number.isFinite(Date.parse(x));
const date = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
const time = x => x == null || typeof x === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x);
const strings = x => Array.isArray(x) && x.every(v => text(v)) && new Set(x).size === x.length;
const appId = x => x === null || text(x, 134) && !/[\u0000-\u001f\u007f-\u009f]/.test(x) && (!x.startsWith('myapp:') || text(x.slice(6), 128));
export function freezePractice(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freezePractice); Object.freeze(value); } return value; }
function decode(raw, name, min, max) {
    const value = raw['cruisePort.' + name];
    if (value == null) return { state: 'absent', value: null };
    let v; try { v = typeof value === 'string' ? JSON.parse(value) : value; } catch { return { state: 'invalid', value: null }; }
    if (!object(v) || !Number.isInteger(v.version)) return { state: 'invalid', value: null };
    if (v.version > max) return { state: 'future', value: null };
    if (v.version < min) return { state: 'unsupported', value: null };
    return { state: v.version < max ? 'legacy' : 'ready', value: v };
}
function collection(raw, name, min, max, field, valid, project) {
    const decoded = decode(raw, name, min, max), v = decoded.value;
    if (!v) return { state: decoded.state, items: [] };
    if (!Array.isArray(v[field]) || !v[field].every(x => object(x) && valid(x, v.version)) || new Set(v[field].map(x => x.id)).size !== v[field].length) return { state: 'invalid', items: [] };
    return { state: v[field].length ? decoded.state : 'empty', items: v[field].map(x => project(x, v.version)) };
}
const ready = s => ['ready', 'legacy', 'empty', 'absent'].includes(s);
const builtins = { pitch: '音感クルーズ', fretboard: '指板クルーズ', rhythm: 'リズムクルーズ', chord: 'コードクルーズ', metronome: 'メトロノーム', tuner: 'チューナー' };
const icons = { memo: 'メモ', practice: '練習', live: 'ライブ', rehearsal: 'リハ', studio: 'スタジオ', recording: '録音', work: '作業', rest: '休み', schedule: '予定', 'string-change': '弦交換', maintenance: 'メンテ' };
export function projectPractice(raw = {}) {
    const apps = collection(raw, 'myApps', 1, 7, 'items', x => text(x.id) && text(x.name, 80), x => ({ id: x.id, name: x.name }));
    const appNames = new Map(apps.items.map(x => [x.id, x.name]));
    const app = id => id === null ? '使用アプリなし' : (Object.hasOwn(builtins, id) ? builtins[id] : null) || (id.startsWith('myapp:') ? appNames.get(id.slice(6)) || (ready(apps.state) ? '削除済みのMy App' : 'My App参照を確認できません') : '未対応のアプリ');
    const menus = collection(raw, 'practiceMenus', 1, 3, 'items', (x, v) => text(x.id) && text(x.name, 100) && Number.isInteger(x.durationMinutes) && x.durationMinutes >= 1 && x.durationMinutes <= 999 && appId(x.appId) && (v !== 1 || Object.hasOwn(builtins, x.appId)) && typeof x.memo === 'string' && x.memo.length <= 1000 && (v < 3 || typeof x.hidden === 'boolean') && iso(x.createdAt) && iso(x.updatedAt), (x, v) => ({ id: x.id, name: x.name, durationMinutes: x.durationMinutes, memo: x.memo, hidden: v >= 3 && x.hidden, appLabel: app(x.appId), createdAt: x.createdAt, updatedAt: x.updatedAt }));
    if (raw['cruisePort.schemaVersion'] != null) {
        const schema = Number(raw['cruisePort.schemaVersion']), decoded = decode(raw, 'practiceMenus', 1, 3);
        if (!Number.isInteger(schema) || schema < 1) { menus.state = 'unsupported'; menus.items = []; }
        else if (schema > 3) { menus.state = 'future'; menus.items = []; }
        else if (decoded.value && decoded.value.version !== schema) { menus.state = 'invalid'; menus.items = []; }
    }
    const names = new Map(menus.items.map(x => [x.id, x]));
    const reference = id => ({ id, name: names.get(id)?.name || (ready(menus.state) ? '削除済み / 参照先なし' : 'メニュー参照を確認できません'), missing: !names.has(id), hidden: names.get(id)?.hidden || false });
    const sets = collection(raw, 'practiceMenuSets', 1, 1, 'items', x => text(x.id, 200) && x.id !== 'all' && text(x.name, 100) && strings(x.itemIds) && x.itemIds.length <= 2000 && iso(x.createdAt) && iso(x.updatedAt), x => ({ id: x.id, name: x.name, members: x.itemIds.map(reference) }));
    const p = decode(raw, 'practiceProgress', 1, 3), v = p.value;
    const validProgress = v && text(v.cycleId, 160) && strings(v.checkedPracticeIds) && strings(v.countedPracticeIds) && object(v.totalCounts) && Object.entries(v.totalCounts).every(([id, count]) => text(id) && integer(count)) && v.checkedPracticeIds.every(id => v.countedPracticeIds.includes(id)) && v.countedPracticeIds.every(id => Object.hasOwn(v.totalCounts, id)) && (v.version !== 1 || integer(v.completeCount)) && (v.version < 3 || v.completionPending === null || object(v.completionPending) && ['complete', 'partial'].includes(v.completionPending.type) && v.completionPending.cycleId === v.cycleId && iso(v.completionPending.createdAt));
    const progress = !v ? { state: p.state, items: [] } : !validProgress ? { state: 'invalid', items: [] } : { state: p.state, cycleId: v.cycleId, pending: v.version >= 3 ? v.completionPending?.type || null : null, items: Object.entries(v.totalCounts).map(([id, count]) => ({ ...reference(id), count, checked: v.checkedPracticeIds.includes(id), counted: v.countedPracticeIds.includes(id) })) };
    const seconds = x => integer(x) && x <= 30 * 86400;
    const history = collection(raw, 'practiceHistory', 1, 5, 'events', (x, version) => {
        if (!text(x.id) || !iso(x.timestamp) || !date(x.localDate)) return false;
        if (x.type === 'practice-completed') return text(x.cycleId) && text(x.practiceId) && text(x.practiceName, 100) && Number.isInteger(x.durationMinutes) && x.durationMinutes >= 1 && x.durationMinutes <= 999 && appId(x.appId) && (version < 3 || x.sessionId === null || text(x.sessionId, 160)) && (version < 4 || x.measuredDurationSeconds === undefined || text(x.sessionId, 160) && seconds(x.measuredDurationSeconds));
        if (x.type === 'cycle-completed') return text(x.cycleId) && [x.practiceId, x.practiceName, x.durationMinutes, x.appId].every(v => v === null);
        if (x.type !== 'practice-session' || version < 2 || !text(x.sessionId, 160) || !iso(x.startedAt) || !iso(x.endedAt) || x.endedAt < x.startedAt || !seconds(x.durationSeconds) || [x.cycleId, x.practiceId, x.practiceName, x.durationMinutes, x.appId].some(v => v !== null)) return false;
        if (version < 5) return true;
        if (!Array.isArray(x.pauseIntervals) || x.activeDurationSeconds !== undefined && !seconds(x.activeDurationSeconds)) return false;
        let previous = x.startedAt;
        for (const interval of x.pauseIntervals) { if (!iso(interval?.startedAt) || !iso(interval?.endedAt) || interval.startedAt < previous || interval.endedAt < interval.startedAt || interval.endedAt > x.endedAt) return false; previous = interval.endedAt; }
        return true;
    }, (x, version) => ({ id: x.id, type: x.type, timestamp: x.timestamp, localDate: x.localDate, name: x.type === 'practice-completed' ? x.practiceName : x.type === 'cycle-completed' ? 'サイクル完了' : '練習セッション', reference: x.practiceId ? reference(x.practiceId) : null, durationMinutes: x.durationMinutes, durationSeconds: x.type === 'practice-session' ? x.durationSeconds : version >= 4 ? x.measuredDurationSeconds ?? null : null, activeDurationSeconds: version >= 5 ? x.activeDurationSeconds ?? null : null, appLabel: x.type === 'practice-completed' ? app(x.appId) : null }));
    const calendar = collection(raw, 'practiceCalendar', 1, 2, 'notes', (x, version) => text(x.id, 160) && date(x.localDate) && text(x.text, 500) && x.text.trim() === x.text && time(x.time) && time(x.endTime) && (!x.endTime || typeof x.time === 'string' && x.endTime > x.time) && (version === 1 || Object.hasOwn(icons, x.icon)) && typeof x.createdAt === 'string' && Number.isFinite(Date.parse(x.createdAt)) && typeof x.updatedAt === 'string' && Number.isFinite(Date.parse(x.updatedAt)), (x, version) => ({ id: x.id, localDate: x.localDate, text: x.text, icon: icons[version === 1 ? 'memo' : x.icon], time: x.time ?? null, endTime: x.endTime ?? null }));
    const a = decode(raw, 'syncAssetMetadata', 2, 4), entries = a.value?.attachments;
    const attachments = !a.value ? { state: a.state, items: [] } : !object(entries) ? { state: 'invalid', items: [] } : { state: a.state, items: Object.entries(entries).map(([id, x]) => {
        // Missing metadata is isolated to this row. Never touch published.asset content or binary APIs.
        if (!object(x)) return { id, practiceId: null, state: 'invalid', fileName: 'metadataを確認できません' };
        const fileName = text(x.published?.asset?.originalFilename) ? x.published.asset.originalFilename : x.fileName;
        return { id, practiceId: typeof x.practiceId === 'string' ? x.practiceId : null, state: text(fileName) && ['image', 'file'].includes(x.kind) && integer(x.byteSize) ? 'metadata' : 'invalid', fileName: text(fileName) ? fileName : 'ファイル名未確認', kind: ['image', 'file'].includes(x.kind) ? x.kind : null, byteSize: integer(x.byteSize) ? x.byteSize : null, mimeType: typeof x.mimeType === 'string' ? x.mimeType : null, reference: typeof x.practiceId === 'string' ? reference(x.practiceId) : null };
    }) };
    return freezePractice({ dataOwner: 'port', canWrite: false, menus, sets, progress, history, calendar, attachments });
}
