export const timestamp = '2026-10-14T00:00:00.000Z';
export function practiceFixture() {
    const menu = (id, name, appId = null, hidden = false) => ({ id, name, appId, hidden, durationMinutes: 10, memo: '練習メモ', createdAt: timestamp, updatedAt: timestamp });
    const completed = (id, practiceId, practiceName) => ({ id, type: 'practice-completed', timestamp, localDate: '2026-10-14', cycleId: 'cycle1', practiceId, practiceName, durationMinutes: 10, appId: null, sessionId: null });
    return {
        'cruisePort.schemaVersion': '3',
        'cruisePort.practiceMenus': { version: 3, items: [menu('m1', 'スケール', 'pitch'), menu('m2', 'アルペジオ', 'myapp:custom'), menu('m3', '非表示メニュー', 'myapp:deleted', true)] },
        'cruisePort.practiceMenuSets': { version: 1, items: [{ id: 'set1', name: '朝の練習', itemIds: ['m2', 'deleted', 'm1', 'm3'], createdAt: timestamp, updatedAt: timestamp }] },
        'cruisePort.practiceProgress': { version: 3, cycleId: 'cycle1', checkedPracticeIds: ['m1'], countedPracticeIds: ['m1'], totalCounts: { m1: 4, deleted: 7 }, completionPending: null },
        'cruisePort.practiceHistory': { version: 5, events: [completed('h1', 'm1', '過去のスケール名'), completed('h2', 'deleted', '削除前のメニュー名'), { id: 'h3', type: 'practice-session', timestamp, localDate: '2026-10-13', cycleId: null, practiceId: null, practiceName: null, durationMinutes: null, appId: null, sessionId: 's1', startedAt: '2026-10-13T23:50:00.000Z', endedAt: timestamp, durationSeconds: 600, pauseIntervals: [{ startedAt: '2026-10-13T23:51:00.000Z', endedAt: '2026-10-13T23:52:00.000Z' }], activeDurationSeconds: 540 }] },
        'cruisePort.practiceCalendar': { version: 2, notes: [{ id: 'note1', localDate: '2026-10-15', text: 'スタジオ練習', icon: 'studio', time: '10:00', endTime: '11:00', createdAt: timestamp, updatedAt: timestamp }] },
        'cruisePort.myApps': { version: 1, items: [{ id: 'custom', name: '自分の練習アプリ', url: 'https://example.invalid/', createdAt: timestamp, updatedAt: timestamp }] },
        'cruisePort.syncAssetMetadata': { version: 4, gear: {}, myApps: {}, attachments: { att1: { practiceId: 'm1', fileName: '練習資料.pdf', kind: 'file', byteSize: 123, mimeType: 'application/pdf', createdAt: timestamp, updatedAt: timestamp, published: { availability: 'available', asset: { assetId: 'do-not-export', originalFilename: '練習資料.pdf', storageKey: 'private' } } }, orphan: { practiceId: 'deleted', fileName: '旧資料.png', kind: 'image', byteSize: 30, mimeType: 'image/png' }, broken: null }, releaseQueue: [], discardQueue: [], referencePending: false }
    };
}
export function serializeFixture(fixture) { return Object.fromEntries(Object.entries(fixture).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])); }
