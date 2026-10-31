/* Structure discrete operations: memory-only adapter to the session-owned history. */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else (root.CruiseStudio = root.CruiseStudio || {}).structureOperations = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    var labels = Object.freeze({ addBar:'小節を追加', deleteBar:'小節を削除', duplicateBar:'小節を複製', moveBar:'小節を移動', moveBars:'複数小節を移動', transpose:'実音を移調', addSection: 'セクションを追加', removeSection: 'セクションを削除',
        renameSection: 'セクション名を変更', barCount: 'セクションの小節数を変更',
        strum: 'ストロークセルを変更', resetStrum: '基本ストロークへ戻す',
        bulkChord: 'コードをまとめて適用', bulkDoremi: 'ドレミをまとめて適用', display: '譜面表示設定を変更' });
    function structureKey(project) {
        return JSON.stringify([project.sections.map(function (s) { return s.id; }),
            project.bars.map(function (b) { return [b.sectionId, project.schemaVersion===2?b.id:b.barNumber]; })]);
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
            var result = session.runOperation(labels[kind], function (canonical) {
                if (['addBar','deleteBar','duplicateBar','moveBar','moveBars','transpose'].includes(kind)) {
                    if (canonical.schemaVersion !== 2) throw Error('この操作はschema2の曲で使用できます');
                    var api=model.schema2, i=canonical.bars.findIndex(function(b){return b.id===args.barId;});
                    if (kind==='moveBars') {
                        if(!args.beforeId&&![-1,1].includes(args.direction))throw Error('移動方向が不正です');
                        var ids=args.barIds, positions=ids.map(function(id){return canonical.bars.findIndex(function(b){return b.id===id;});}).sort(function(a,b){return a-b;});
                        if(!ids.length||new Set(ids).size!==ids.length||positions.some(function(n,k){return n<0||(k&&n!==positions[0]+k);}))throw Error('連続する小節を選択してください');
                        var target=args.beforeId?canonical.bars.find(function(b){return b.id===args.beforeId;}):canonical.bars[args.direction===-1?positions[0]-1:positions[positions.length-1]+1];
                        if(!target||ids.includes(target.id))throw Error('移動先が選択範囲内または範囲外です');
                        var targetId=target.id,section=target.sectionId,after=!args.beforeId&&args.direction===1;
                        var movedBars=canonical.bars.filter(function(b){return ids.includes(b.id);}).map(function(b){var copy=JSON.parse(JSON.stringify(b));copy.sectionId=section;return copy;});
                        canonical.bars=canonical.bars.filter(function(b){return !ids.includes(b.id);});
                        var destination=canonical.bars.findIndex(function(b){return b.id===targetId;})+(after?1:0);
                        canonical.bars.splice.apply(canonical.bars,[destination,0].concat(movedBars));
                        var movedCheck=api.validate(canonical);if(!movedCheck.ok)throw Error(movedCheck.errors.join('/'));
                        return;
                    }
                    if (kind==='transpose') {
                        var delta=Number(args.semitones);
                        if (!Number.isInteger(delta)||Math.abs(delta)>12) throw Error('移調は半音単位で±12以内です');
                        if (!delta) return;
                        if (canonical.performance.formBindings.length || canonical.bars.some(function(b){return b.chords.some(function(c){return c.unresolved;});})) throw Error('固定フォームまたは未解決コードがあります。フォームとコードを確認してから移調してください');
                        function shifted(p) { var midi=api.pitchMidi(p)+delta;if(midi<0||midi>127)throw Error('移調後の音域が範囲外です');var names=['C','C','D','D','E','F','F','G','G','A','A','B'];return {step:names[midi%12],alter:[1,3,6,8,10].includes(midi%12)?1:0,octave:Math.floor(midi/12)-1}; }
                        canonical.bars.forEach(function(b){b.melody.forEach(function(e){if(e.kind==='note')e.pitch=shifted(e.pitch);});b.chords.forEach(function(e){var value=api.chord(e.symbol,delta);if(value===null)throw Error('解釈できないコードがあるため移調できません');e.symbol=value;});});
                        canonical.solfege.tonic=shifted(canonical.solfege.tonic);
                        canonical.songInfo.originalKey=api.chord(canonical.songInfo.originalKey,delta);
                    } else {
                        if(i<0)throw Error('小節を選択してください');
                        if(kind==='duplicateBar') {
                            var newBarId=api.duplicateBar(canonical,args.barId);
                            var binding=canonical.performance.barRhythms.find(function(b){return b.barId===newBarId;});
                            var material=binding&&canonical.materials.rhythms.find(function(m){return m.id===binding.materialId;});
                            if(material&&material.encoding==='studio-strum-v1') {
                                var independent=JSON.parse(JSON.stringify(material));independent.id=api.newId();
                                independent.provenance.legacyId='strum_bar_'+independent.id;
                                independent.snapshot.slots.forEach(function(e){e.id=api.newId();});
                                canonical.materials.rhythms.push(independent);binding.materialId=independent.id;
                            }
                        }
                        if(kind==='addBar') canonical.bars.splice(i+1,0,{id:api.newId(),sectionId:canonical.bars[i].sectionId,melody:[],chords:[],lyrics:[]});
                        if(kind==='deleteBar') {
                            if(canonical.bars.length<=1)throw Error('最後の小節は削除できません');
                            var removedId=canonical.bars[i].id, chords=new Set(canonical.bars[i].chords.map(function(c){return c.id;}));canonical.bars.splice(i,1);
                            canonical.performance.barRhythms=canonical.performance.barRhythms.filter(function(b){return b.barId!==removedId;});
                            canonical.performance.formBindings=canonical.performance.formBindings.filter(function(b){return !chords.has(b.chordEventId);});
                            canonical.notation.lineBreakAfter=canonical.notation.lineBreakAfter.filter(function(id){return id!==removedId;});
                        }
                        if(kind==='moveBar') {var j=i+args.direction;if(![-1,1].includes(args.direction)||j<0||j>=canonical.bars.length)throw Error('これ以上移動できません');var sectionId=canonical.bars[j].sectionId, moved=JSON.parse(JSON.stringify(canonical.bars[i]));moved.sectionId=sectionId;canonical.bars.splice(i,1);canonical.bars.splice(j,0,moved);}
                    }
                    var check=api.validate(canonical);if(!check.ok)throw Error(check.errors.join('/'));
                    return;
                }
                return (model.editLegacy || function(p,fn){return fn(p);})(canonical,function(draft){
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
                },{kind:kind,...(args.sectionId?{sectionId:args.sectionId}:{}),barIds:canonical.schemaVersion===2?canonical.bars.slice(Math.max(0,args.barNumber-1),['bulkChord','bulkDoremi'].includes(kind)?args.barNumber-1+args.values.length:args.barNumber).map(function(b){return b.id;}):[]});
            },{requireUndo: session.draft.schemaVersion===2});
            return Object.assign({}, result, { warnings: warnings,
                structureChanged: result.ok && before !== structureKey(session.draft) });
        } });
    }
    return Object.freeze({ create: create, capture: capture, isCurrent: isCurrent, structureKey: structureKey });
}));
