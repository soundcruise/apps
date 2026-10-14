/* Structure discrete operations: memory-only adapter to the session-owned history. */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else (root.CruiseStudio = root.CruiseStudio || {}).structureOperations = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    var labels = Object.freeze({ addSection: 'セクションを追加', removeSection: 'セクションを削除',
        renameSection: 'セクション名を変更', barCount: 'セクションの小節数を変更',
        strum: 'ストロークセルを変更', resetStrum: '基本ストロークへ戻す',
        bulkChord: 'コードをまとめて適用', bulkDoremi: 'ドレミをまとめて適用', display: '譜面表示設定を変更' });
    function structureKey(project) {
        return JSON.stringify([project.sections.map(function (s) { return s.id; }),
            project.bars.map(function (b) { return [b.sectionId, b.barNumber]; })]);
    }
    function capture(session) {
        return session ? Object.freeze({ session: session, sessionId: session.sessionId,
            projectId: session.target.projectId, version: session.snapshotVersion }) : null;
    }
    function isCurrent(frame, session) {
        return !!(frame && session && !session.destroyed && frame.session === session &&
            frame.sessionId === session.sessionId && frame.projectId === session.target.projectId &&
            frame.version === session.snapshotVersion);
    }
    function create(options) {
        var model = options.model;
        return Object.freeze({ execute: function (kind, args, expected) {
            var session = options.getSession();
            if (!session || session.domain !== 'structure' || session.draft.projectId !== session.target.projectId ||
                (options.isEligible && !options.isEligible()) || (expected && !isCurrent(expected, session))) {
                return { ok: false, code: 'stale-target', error: '編集対象または入力状態が変わりました' };
            }
            if (!Object.hasOwn(labels, kind)) return { ok: false, code: 'unsupported-operation' };
            args = args || {};
            var before = structureKey(session.draft), warnings = [];
            var result = session.runOperation(labels[kind], function (draft) {
                if (['removeSection', 'renameSection', 'barCount'].includes(kind) &&
                    !draft.sections.some(function (s) { return s.id === args.sectionId; })) throw Error('セクションが見つかりません');
                switch (kind) {
                case 'addSection': model.addSection(draft, '新しいセクション', 4); break;
                case 'removeSection':
                    var removed = model.removeSection(draft, args.sectionId);
                    if (!removed.ok) throw Error(removed.error);
                    break;
                case 'renameSection': model.renameSection(draft, args.sectionId, args.name); break;
                case 'barCount': model.setSectionBarCount(draft, args.sectionId, args.count); break;
                case 'strum': case 'resetStrum':
                    if (!draft.bars.some(function (b) { return b.barNumber === args.barNumber; })) throw Error('小節が見つかりません');
                    model.setBarStrumSlots(draft, args.barNumber, kind === 'resetStrum' ? [] : args.slots); break;
                case 'bulkChord': case 'bulkDoremi':
                    var start = draft.bars.findIndex(function (b) { return b.barNumber === args.barNumber; });
                    if (start < 0) throw Error('小節が見つかりません');
                    args.values.slice(0, draft.bars.length - start).forEach(function (value, i) {
                        var number = draft.bars[start + i].barNumber;
                        if (kind === 'bulkChord') model.setBarChord(draft, number, value);
                        else model.setBarDoremiText(draft, number, value).warnings.forEach(function (warning) {
                            warnings.push(number + '小節目: ' + warning);
                        });
                    }); break;
                case 'display':
                    if (!draft.sheetSettings) draft.sheetSettings = model.getDefaultSheetSettings();
                    ['showChords', 'showStrum', 'showLyrics', 'showDoremi', 'showTimingGrid'].forEach(function (key) {
                        draft.sheetSettings[key] = !!args.settings[key];
                    });
                    draft.sheetSettings.timingGridResolution = args.settings.timingGridResolution === 16 ? 16 : 8;
                    break;
                }
            });
            return Object.assign({}, result, { warnings: warnings,
                structureChanged: result.ok && before !== structureKey(session.draft) });
        } });
    }
    return Object.freeze({ create: create, capture: capture, isCurrent: isCurrent, structureKey: structureKey });
}));
