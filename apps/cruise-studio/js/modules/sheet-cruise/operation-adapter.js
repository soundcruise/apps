/* Structure discrete operations: memory-only adapter to the session-owned history. */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else (root.CruiseStudio = root.CruiseStudio || {}).structureOperations = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    var labels = Object.freeze({basicRhythm:'基本ストロークを変更',deleteBars:'選択小節を削除',pasteBars:'選択小節を貼り付け',duplicateBars:'選択小節を複製',restoreSlot:'空き枠を小節に戻す',songInfo:'曲情報を変更',instrument:'キー・カポを変更',moveSection:'セクションを移動', addBar:'小節を追加', deleteBar:'小節を削除', duplicateBar:'小節を複製', pasteBar:'小節の内容を貼り付け', moveBar:'小節を移動', moveBars:'複数小節を移動', transpose:'実音を移調', addSection: 'セクションを追加', removeSection: 'セクションを削除',
        renameSection: 'セクション名を変更', barCount: 'セクションの小節数を変更',
        strum: 'ストロークセルを変更', resetStrum: '基本ストロークへ戻す',
        rangeTransfer: '選択したマスを移動・貼り付け', chordTransfer: 'コードとフォームを移動・貼り付け', cellTransfer: 'マスを移動・貼り付け', chordPreset: 'コード一括入力', strumPreset: 'ストローク一括入力',
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
    // Same-Project memory copy, using the existing canonical duplicate intent.
    // Destination identity/section/layout survive; source and immutable materials do not change.
    function pasteBar(model, canonical, args) {
        var api=model.schema2, source=args.source, check=source&&api.validate(source);
        if(!check?.ok||source.projectId!==canonical.projectId)throw Error('同じProjectの小節をコピーしてください');
        if(api.barLength(source)!==api.barLength(canonical))throw Error('拍子が変わりました。小節をコピーし直してください');
        if(JSON.stringify(source.instrument)!==JSON.stringify(canonical.instrument))throw Error('楽器条件が変わりました。小節をコピーし直してください');
        var destination=canonical.bars.findIndex(function(b){return b.id===args.barId;});
        if(destination<0)throw Error('貼り付け先の小節を選択してください');
        var staged=JSON.parse(JSON.stringify(source));if(staged.extensions)delete staged.extensions.scoreLayoutV1;
        // The temporary copy needs only the source bar. Do not consume an extra
        // bar in the real Project or fail merely because it already has 2048 bars.
        staged.bars=staged.bars.filter(function(b){return b.id===args.sourceBarId;});
        if(!staged.bars.length)throw Error('コピーした小節が見つかりません');
        var sourceChords=new Set(staged.bars[0].chords.map(function(c){return c.id;}));
        staged.performance.formBindings=staged.performance.formBindings.filter(function(b){return sourceChords.has(b.chordEventId);});
        staged.performance.barRhythms=staged.performance.barRhythms.filter(function(b){return b.barId===args.sourceBarId;});
        staged.notation.lineBreakAfter=staged.notation.lineBreakAfter.filter(function(id){return id===args.sourceBarId;});
        var newId=api.duplicateBar(staged,args.sourceBarId),bar=staged.bars.find(function(b){return b.id===newId;}),target=canonical.bars[destination];
        var oldChords=new Set(target.chords.map(function(c){return c.id;})),newChords=new Set(bar.chords.map(function(c){return c.id;}));
        var forms=staged.performance.formBindings.filter(function(b){return newChords.has(b.chordEventId);});
        function retain(kind,id){
            var material=staged.materials[kind].find(function(m){return m.id===id;}),existing=canonical.materials[kind].find(function(m){return m.id===id;});
            if(!material||existing&&JSON.stringify(existing)!==JSON.stringify(material))throw Error('コピーした素材を確認できません。コピーし直してください');
            if(!existing)canonical.materials[kind].push(JSON.parse(JSON.stringify(material)));
            return material;
        }
        forms.forEach(function(b){retain('forms',b.materialId);});
        var originalRhythm=staged.performance.barRhythms.find(function(b){return b.barId===newId;});
        const needsBinding=originalRhythm || source.performance.basicRhythmId!==canonical.performance.basicRhythmId;
        const materialId=needsBinding && copyRhythmMaterial(canonical,retain('rhythms',originalRhythm?.materialId||source.performance.basicRhythmId),api);
        bar.id=target.id;bar.sectionId=target.sectionId;canonical.bars[destination]=bar;
        canonical.performance.formBindings=canonical.performance.formBindings.filter(function(b){return !oldChords.has(b.chordEventId);}).concat(forms);
        canonical.performance.barRhythms=canonical.performance.barRhythms.filter(function(b){return b.barId!==target.id;}).concat(materialId?[{id:api.newId(),barId:target.id,materialId}]:[]);
        check=api.validate(canonical);if(!check.ok)throw Error(check.errors.join('/'));
        return bar;
    }
    function scoreLayout(p,create){
        if(create){if(!p.extensions)p.extensions={};if(!p.extensions.scoreLayoutV1)p.extensions.scoreLayoutV1={version:1,holes:[],fills:[]};}
        return p.extensions?.scoreLayoutV1||{version:1,holes:[],fills:[]};
    }
    function scoreSlots(p,sectionId){
        var holes=scoreLayout(p).holes,result=[],numbers=new Map(p.bars.map(function(b,i){return [b.id,i+1];}));
        p.bars.filter(function(b){return b.sectionId===sectionId;}).forEach(function(b){
            holes.filter(function(h){return h.sectionId===sectionId&&h.beforeBarId===b.id;}).forEach(function(h){result.push({id:h.id,sectionId:sectionId,empty:true});});
            result.push({id:b.id,barId:b.id,sectionId:sectionId,barNumber:numbers.get(b.id)});
        });
        holes.filter(function(h){return h.sectionId===sectionId&&h.beforeBarId===null;}).forEach(function(h){result.push({id:h.id,sectionId:sectionId,empty:true});});return result;
    }
    function selectedPositions(p,ids){
        if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw Error('小節を選択してください');
        var positions=ids.map(function(id){return p.bars.findIndex(function(b){return b.id===id;});}).sort(function(a,b){return a-b;});
        if(positions.some(function(n,i){return n<0||i&&n!==positions[0]+i;}))throw Error('連続する小節を選択してください');return positions;
    }
    function removeBars(p,ids,keep){
        selectedPositions(p,ids);var removed=new Set(ids),chords=new Set(p.bars.filter(function(b){return removed.has(b.id);}).flatMap(function(b){return b.chords.map(function(c){return c.id;});}));
        if(keep){var layout=scoreLayout(p,true),holes=[];p.sections.forEach(function(section){var slots=scoreSlots(p,section.id);slots.forEach(function(slot,i){if(slot.empty||removed.has(slot.id)){var next=slots.slice(i+1).find(function(s){return !s.empty&&!removed.has(s.id);});holes.push({id:slot.id,sectionId:section.id,beforeBarId:next?next.id:null});}});});layout.holes=holes;}
        p.bars=p.bars.filter(function(b){return !removed.has(b.id);});p.performance.formBindings=p.performance.formBindings.filter(function(b){return !chords.has(b.chordEventId);});p.performance.barRhythms=p.performance.barRhythms.filter(function(b){return !removed.has(b.barId);});p.notation.lineBreakAfter=p.notation.lineBreakAfter.filter(function(id){return !removed.has(id);});
    }
    function restoreSlot(model,p,slot){
        var api=model.schema2,layout=scoreLayout(p,true),hole=slot.id&&layout.holes.find(function(h){return h.id===slot.id;}),sectionId=hole?hole.sectionId:slot.sectionId,beforeId=hole?hole.beforeBarId:slot.beforeBarId;
        if(slot.id&&!hole)throw Error('空き枠の選択が変わりました');if(!p.sections.some(function(s){return s.id===sectionId;}))throw Error('セクションが見つかりません');
        if(beforeId!==null&&!p.bars.some(function(b){return b.id===beforeId&&b.sectionId===sectionId;}))throw Error('挿入位置が変わりました');
        var index=beforeId===null?p.bars.reduce(function(n,b,i){return b.sectionId===sectionId?i+1:n;},-1):p.bars.findIndex(function(b){return b.id===beforeId;});
        if(index<0){var order=p.sections.findIndex(function(s){return s.id===sectionId;}),later=new Set(p.sections.slice(order+1).map(function(s){return s.id;}));index=p.bars.findIndex(function(b){return later.has(b.sectionId);});if(index<0)index=p.bars.length;}
        var id=hole?hole.id:api.newId();p.bars.splice(index,0,{id:id,sectionId:sectionId,melody:[],lyrics:[],chords:[]});
        if(hole){var position=layout.holes.indexOf(hole);layout.holes.slice(0,position).filter(function(h){return h.sectionId===sectionId&&h.beforeBarId===beforeId;}).forEach(function(h){h.beforeBarId=id;});layout.holes.splice(position,1);layout.fills.forEach(function(f){if(f.anchorId===hole.id)f.anchorId=id;});}
        else {
            layout.holes.filter(function(h){return (slot.precedingHoleIds||[]).includes(h.id)&&h.sectionId===sectionId&&h.beforeBarId===beforeId;}).forEach(function(h){h.beforeBarId=id;});
            var pad=slot.padIndex||0;if(!Number.isInteger(pad)||pad<0||pad>7)throw Error('空き枠の位置が不正です');
            for(var i=0;i<pad;i++)layout.holes.push({id:api.newId(),sectionId:sectionId,beforeBarId:id});
            if(slot.columns&&slot.baseUsed<slot.columns){var used=slot.liveUsed+pad+1;if(used>slot.columns)throw Error('行の空き枠が変わりました');layout.fills=layout.fills.filter(function(f){return f.anchorId!==slot.anchorId;});layout.fills.push({anchorId:slot.anchorId,columns:slot.columns,baseUsed:slot.baseUsed,used:used});}
        }
        return id;
    }
    function writeRestoredBar(model,p,id,values){
        var index=p.bars.findIndex(function(b){return b.id===id;})+1;
        [['chord',values.chord],['lyrics',values.lyrics],['doremi',values.doremi],['strum',values.strum]].forEach(function(pair){if(!pair[1]?.trim())return;model.editLegacy(p,function(view){var result;
            if(pair[0]==='chord')result=model.setBarChord(view,index,pair[1],{symbolOnly:true});
            if(pair[0]==='doremi')result=model.setBarDoremiText(view,index,pair[1]);
            if(pair[0]==='lyrics')result=model.setBarLyricSlot(view,index,0,240,pair[1]);
            if(pair[0]==='strum')result=model.setBarStrumText(view,index,pair[1]);
            if(result?.ok===false||result?.warnings?.length)throw Error(result.error||result.warnings.join('/'));
        },{kind:pair[0],barIds:[id]});});
    }
    function pasteRange(model,p,args){
        var ids=args.sourceBarIds||[args.sourceBarId];ids=selectedPositions(args.source,ids).map(function(i){return args.source.bars[i].id;});
        var targets=[],targetId,start;
        if(args.insert){
            targetId=args.slot?restoreSlot(model,p,args.slot):args.barId;start=p.bars.findIndex(function(b){return b.id===targetId;});if(start<0)throw Error('貼り付け先を選択してください');
            var section=p.bars[start].sectionId;for(var i=args.slot?1:0;i<ids.length;i++)p.bars.splice(start+i,0,{id:model.schema2.newId(),sectionId:section,melody:[],lyrics:[],chords:[]});
            targets=p.bars.slice(start,start+ids.length).map(function(b){return b.id;});
        }else if(args.targetSlots){
            // The UI supplies adjacent visible cells, including implicit line padding.
            // Resolve each empty cell once; never skip it and overwrite the next live bar.
            if(args.targetSlots.length!==ids.length)throw Error('貼り付け先の枠が足りません。「挿入して貼り付け」を使ってください');
            var consumed=new Map();
            args.targetSlots.forEach(function(cell){
                if(cell.barId){if(!p.bars.some(function(b){return b.id===cell.barId;}))throw Error('貼り付け先が変わりました');targets.push(cell.barId);return;}
                var slot=Object.assign({},cell);
                if(!slot.id){var key=slot.anchorId||slot.sectionId,prior=consumed.get(key)||0;slot.padIndex-=prior;slot.liveUsed+=prior;if(slot.padIndex<0)throw Error('空き枠の選択が重複しています');consumed.set(key,prior+slot.padIndex+1);}
                targets.push(restoreSlot(model,p,slot));
            });targetId=targets[0];
        }else{
            targetId=args.slot?restoreSlot(model,p,args.slot):args.barId;
            var slots=p.sections.flatMap(function(section){return scoreSlots(p,section.id);}),index=slots.findIndex(function(s){return s.id===targetId;});
            if(index<0||index+ids.length>slots.length)throw Error('貼り付け先の枠が足りません。「挿入して貼り付け」を使ってください');
            targets=slots.slice(index,index+ids.length).map(function(s){return s.empty?restoreSlot(model,p,{id:s.id}):s.id;});
        }
        var copiedNotes=new Map();
        ids.forEach(function(id,i){
            var original=args.source.bars.find(function(b){return b.id===id;});
            var pasted=pasteBar(model,p,{source:args.source,sourceBarId:id,barId:targets[i]});
            original.melody.forEach(function(note,j){copiedNotes.set(note.id,{original:note,pasted:pasted.melody[j]});});
        });
        copiedNotes.forEach(function(pair){
            var continuation=copiedNotes.get(pair.original.tieToNext);
            if(continuation)pair.pasted.tieToNext=continuation.pasted.id;
        });
        return targetId;
    }
    function copyJSON(value) { return JSON.parse(JSON.stringify(value)); }
    function chordTransfer(project, args, api, duplicateBinding) {
        var target = project.bars.find(function (bar) { return bar.id === args.barId; });
        var tick = args.tick, span = args.span, barTicks=api.barLength(project);
        if (!target || !Number.isInteger(tick) || !Number.isInteger(span) || tick < 0 || span < 1 || tick + span > barTicks)
            throw Error('貼り付け先を選び直してください');
        var source = args.from && project.bars.find(function (bar) { return bar.id === args.from.barId; });
        var moving = !!args.from;
        var original = moving ? source?.chords.find(function (event) { return event.id === args.from.eventId; }) : args.clip?.event;
        if (!original) throw Error('元のコードが見つかりません');
        if (moving && source === target && original.onsetTick === tick) return;
        if (!moving && (args.clip.projectId !== project.projectId ||
            JSON.stringify(args.clip.instrument) !== JSON.stringify(project.instrument)))
            throw Error('同じ曲・楽器設定でコードをコピーし直してください');
        var collision = target.chords.filter(function (event) {
            return event !== original && event.onsetTick >= tick && event.onsetTick < tick + span;
        });
        if (!moving && collision.length && (collision.length !== 1 || collision[0].onsetTick !== tick))
            throw Error('移動先には空いているコードマスを選んでください');
        var event = copyJSON(original);
        if (moving) source.chords = source.chords.filter(function (item) { return item !== original; });
        else {
            event.id = api.newId();
            var clip = args.clip;
            if (clip.binding && clip.material) {
                if (!project.materials.forms.some(function (form) { return form.id === clip.material.id; }))
                    project.materials.forms.push(copyJSON(clip.material));
                var binding = duplicateBinding ? duplicateBinding(project, original, event, clip.binding, clip.material) :
                    Object.assign(copyJSON(clip.binding), {
                        id: api.newId(), chordEventId: event.id, confirmation:{status:'unconfirmed', basisKey:null}
                    });
                project.performance.formBindings.push(binding);
            }
        }
        var replaced = new Set(collision.map(function (item) { return item.id; }));
        project.performance.formBindings = project.performance.formBindings.filter(function (binding) {
            return !replaced.has(binding.chordEventId);
        });
        target.chords = target.chords.filter(function (item) { return !replaced.has(item.id); });
        event.onsetTick = tick;
        var next = target.chords.reduce(function (end, item) { return item.onsetTick > tick ? Math.min(end, item.onsetTick) : end; }, barTicks);
        if (event.durationTicks !== undefined) event.durationTicks = Math.min(event.durationTicks, next - tick);
        target.chords.forEach(function (item) {
            if (item.onsetTick < tick && item.onsetTick + item.durationTicks > tick) item.durationTicks = tick - item.onsetTick;
        });
        if(!event.unresolved)api.addChordStroke(project,target.id,tick,args.resolution);
        target.chords.push(event);
        target.chords.sort(function (a, b) { return a.onsetTick - b.onsetTick; });
    }
    function rhythmSnapshot(project, barId) {
        var binding = project.performance.barRhythms.find(function (item) { return item.barId === barId; });
        var material = project.materials.rhythms.find(function (item) {
            return item.id === (binding?.materialId || project.performance.basicRhythmId);
        });
        if (material?.encoding !== 'studio-strum-v1') throw Error('このリズム素材はマス単位で編集できません');
        return material.snapshot;
    }
    function rhythmSlots(project, barId) {
        var barTicks=project.songInfo.timeSignature.beats*project.songInfo.ticksPerBeat;
        return copyJSON(rhythmSnapshot(project,barId).slots.filter(function(slot){return slot.tick<barTicks;}).map(function(slot){
            return slot.durationTicks>barTicks-slot.tick?{...slot,durationTicks:barTicks-slot.tick}:slot;
        }));
    }
    function cellEvents(project, row, barId) {
        var bar = project.bars.find(function (item) { return item.id === barId; });
        if (!bar) throw Error('小節が見つかりません');
        if (row === 'strum') return rhythmSlots(project, barId);
        if (row === 'lyrics') return bar.lyrics;
        if (row === 'doremi') return bar.melody;
        throw Error('転送する行を確認してください');
    }
    function cellTransfer(model, project, args) {
        var row = args.row, moving = !!args.from, api = model.schema2, barTicks=api.barLength(project);
        var tickField = row === 'strum' ? 'tick' : 'onsetTick';
        var from = moving ? args.from.tick : args.clip.tick;
        var target = cellEvents(project, row, args.barId);
        var sameBar = moving && args.from.barId === args.barId;
        var source = moving ? sameBar ? target : cellEvents(project, row, args.from.barId) : args.clip.events;
        if (!moving && (args.clip.projectId !== project.projectId || args.clip.row !== row))
            throw Error('同じ曲の同じ行でコピーし直してください');
        if (!Number.isInteger(args.tick) || !Number.isInteger(args.span) ||
            args.tick < 0 || args.span <= 0 || args.tick + args.span > barTicks)
            throw Error('移動先を選び直してください');
        if (sameBar && from === args.tick) return;
        var picked = moving ? source.filter(function (event) {
            return event[tickField] >= from && event[tickField] < from + args.from.span;
        }) : source;
        if (!picked.length) throw Error('移動元のマスに入力がありません');
        var destination = target.filter(function (event) { return !sameBar || !picked.includes(event); });
        var replaced = destination.filter(function (event) {
            return event[tickField] >= args.tick && event[tickField] < args.tick + args.span;
        });
        destination = destination.filter(function (event) { return !replaced.includes(event); });
        var moved = copyJSON(picked);
        moved.forEach(function (event) {
            event[tickField] += args.tick - from;
            if (event[tickField] >= args.tick + args.span || (!moving && event[tickField] + (event.durationTicks || 1) > barTicks))
                throw Error('移動先に入りきりません。マスの幅や音の長さを確認してください');
            if (!moving) event.id = api.newId();
        });
        var sorted = destination.concat(moved).sort(function (x, y) { return x[tickField] - y[tickField]; });
        // A dragged note can sustain up to the next attack or the end of this measure.
        if (moving && row !== 'lyrics') {
            var arrivals = new Set(moved);
            sorted.forEach(function (event, index) {
                var next = sorted[index + 1];
                if (!arrivals.has(event) && !arrivals.has(next)) return;
                var end = next ? next[tickField] : barTicks;
                if (event[tickField] + event.durationTicks > end) {
                    event.durationTicks = end - event[tickField];
                    if (event.tieToNext) delete event.tieToNext;
                }
            });
        }
        if (row !== 'lyrics' && sorted.some(function (event, index) {
            return index && sorted[index - 1][tickField] + (sorted[index - 1].durationTicks || 1) > event[tickField];
        })) throw Error('前後の音と重なります。空いている位置を選んでください');
        var updates = new Map([[args.barId, sorted]]);
        if (moving && !sameBar) updates.set(args.from.barId, source.filter(function (event) { return !picked.includes(event); }));
        if (row === 'strum') {
            writeStrokeUpdates(model,project,updates);
        } else updates.forEach(function (events, id) {
            var bar = project.bars.find(function (item) { return item.id === id; });
            bar[row === 'lyrics' ? 'lyrics' : 'melody'] = events;
        });
    }
    function writeStrokeUpdates(model,project,updates,options) {
        model.editLegacy(project, function (view) {
            updates.forEach(function (slots,id) {
                var barNumber = project.bars.findIndex(function (bar) { return bar.id === id; }) + 1;
                model.setBarStrumSlots(view,barNumber,slots.map(function ({id,...slot}) { return slot; }),{keepEmpty:true,...options?.get(id)});
            });
        },{kind:'strum',barIds:Array.from(updates.keys())});
    }
    function transferStrokeRange(model,project,origin,start,end,to,barTicks) {
        var moving=origin===project, length=end-start, updates=new Map(), options=new Map(), items=[];
        // Copy explicit rests at either edge. A held stroke starts at its original attack.
        for(var index=Math.floor(start/barTicks);index<Math.ceil(end/barTicks);index++){
            var base=index*barTicks;
            var carry=rhythmSnapshot(origin,origin.bars[index].id).leadingSustainTicks;
            var previous=items.at(-1);
            if(carry && previous && ['down','up'].includes(previous.event.action) &&
                previous.time+(previous.event.durationTicks||0)===to+base-start){
                previous.event.durationTicks+=Math.min(carry,end-base);
            }
            for(var slot of rhythmSlots(origin,origin.bars[index].id)){
                var onset=base+slot.tick, stop=onset+(slot.durationTicks??1);
                var from=slot.action==='rest'?Math.max(onset,start):onset;
                if(from<start||from>=end||stop<=from)continue;
                var last=Math.min(stop,end);
                var event={...slot};
                if(slot.durationTicks!==undefined)event.durationTicks=last-from;
                if(last<stop)delete event.tieToNext;
                items.push({event,time:to+from-start});
            }
        }
        if(!items.length)throw Error('移動・コピーするストロークや休符を選択してください。「〜」は直前の入力も一緒に選択します');

        function erase(slots,from,until) {
            return slots.flatMap(function(slot){
                var stop=slot.tick+(slot.durationTicks??1);
                if(stop<=from||slot.tick>=until)return [slot];
                var remaining=[];
                if(slot.tick<from){
                    var head={...slot,durationTicks:from-slot.tick};
                    delete head.tieToNext;
                    remaining.push(head);
                }
                if(slot.action==='rest'&&stop>until)
                    remaining.push({...slot,tick:until,durationTicks:stop-until});
                return remaining;
            });
        }
        project.bars.forEach(function(bar,index){
            var base=index*barTicks;
            var clears=moving&&base<end&&base+barTicks>start, replaces=base<to+length&&base+barTicks>to;
            if(!clears&&!replaces)return;
            var slots=rhythmSlots(project,bar.id);
            var target=rhythmSnapshot(project,bar.id);
            var hold=target.leadingSustainTicks||0, metadata={};
            if(clears)hold=Math.min(hold,Math.max(0,start-base));
            if(replaces){
                hold=Math.min(hold,Math.max(0,to-base));
                var sourceStart=base-to+start;
                if(base>=to && base+barTicks<=to+length && sourceStart%barTicks===0){
                    var snapshot=rhythmSnapshot(origin,origin.bars[sourceStart/barTicks].id);
                    metadata.inputGrid=model.strumInputGrid(snapshot,barTicks);
                    hold=snapshot.leadingSustainTicks||0;
                }
            }
            metadata.leadingSustainTicks=hold;
            options.set(bar.id,metadata);
            if(clears)slots=erase(slots,Math.max(0,start-base),Math.min(barTicks,end-base));
            if(replaces)slots=erase(slots,Math.max(0,to-base),Math.min(barTicks,to+length-base));
            updates.set(bar.id,slots);
        });
        items.forEach(function({event,time}){
            var bar=project.bars[Math.floor(time/barTicks)], tick=time%barTicks;
            var remaining=barTicks-tick;
            if(event.durationTicks>remaining){
                var tail=event.durationTicks-remaining;
                event.durationTicks=remaining;
                delete event.tieToNext;
                for(var next=Math.floor(time/barTicks)+1;tail>0;next++){
                    var nextId=project.bars[next].id, span=Math.min(barTicks,tail);
                    if(event.action==='rest')updates.get(nextId).push({...event,tick:0,durationTicks:span});
                    else if(event.action!=='mute')options.get(nextId).leadingSustainTicks=span;
                    tail-=span;
                }
            }
            updates.get(bar.id).push({...event,tick});
        });
        updates.forEach(function(slots){slots.sort(function(a,b){return a.tick-b.tick;});});
        writeStrokeUpdates(model,project,updates,options);
    }
    function transferRange(model, project, args, schema, duplicateBinding) {
        var track = {chord:'chords', lyrics:'lyrics', doremi:'melody', strum:'strum'}[args.row];
        var {start, end, to} = args, origin = args.source || project, moving = !args.source;
        var barTicks=schema.barLength(project),length = end - start, limit = project.bars.length * barTicks;
        if (!track || origin.projectId !== project.projectId || schema.barLength(origin)!==barTicks || ![start,end,to].every(Number.isInteger) ||
            start < 0 || length < 1 || end > origin.bars.length * barTicks || to < 0 || to + length > limit)
            throw Error('選択範囲が収まる位置を選んでください');
        if (moving && start === to) return;
        if (track === 'strum') return transferStrokeRange(model,project,origin,start,end,to,barTicks);
        if (!moving && track === 'chords' && JSON.stringify(project.instrument) !== JSON.stringify(origin.instrument))
            throw Error('楽器設定が変わりました。コピーし直してください');
        var items = [], displaced = new Set(), touched = new Set(), arrivals = new Set(), copiedMelody=new Map();
        origin.bars.slice(Math.floor(start / barTicks), Math.ceil(end / barTicks)).forEach(function(bar, index) {
            var base = (Math.floor(start / barTicks) + index) * barTicks;
            bar[track].forEach(function(event) {
                var time = base + event.onsetTick;
                if (time >= start && time < end) items.push({event, time:to + time - start});
            });
        });
        if (!items.length) throw Error('選択範囲に入力がありません');
        project.bars.forEach(function(bar, index) {
            var base = index * barTicks;
            if (!(base < to + length && base + barTicks > to || moving && base < end && base + barTicks > start)) return;
            touched.add(bar);
            bar[track] = bar[track].filter(function(event) {
                var at = base + event.onsetTick;
                if (moving && at >= start && at < end) return false;
                if (at < to || at >= to + length) return true;
                displaced.add(event.id);
                return false;
            });
        });
        if (track === 'chords') project.performance.formBindings = project.performance.formBindings.filter(b => !displaced.has(b.chordEventId));
        items.forEach(function({event, time}) {
            var next = copyJSON(event);
            next.onsetTick = time % barTicks;
            if (!moving) {
                next.id = schema.newId();
                if (track === 'melody') copiedMelody.set(event.id,next);
                if (track === 'chords') {
                    var binding = origin.performance.formBindings.find(b => b.chordEventId === event.id);
                    if (binding) {
                        var material = origin.materials.forms.find(f => f.id === binding.materialId);
                        if (!project.materials.forms.some(f => f.id === material.id)) project.materials.forms.push(copyJSON(material));
                        var clone = duplicateBinding ? duplicateBinding(project,event,next,binding,material) :
                            Object.assign(copyJSON(binding), {id:schema.newId(), chordEventId:next.id, confirmation:{status:'unconfirmed',basisKey:null}});
                        project.performance.formBindings.push(clone);
                    }
                }
            }
            arrivals.add(next);
            var targetBar=project.bars[Math.floor(time / barTicks)];
            targetBar[track].push(next);
            if(track==='chords'&&!next.unresolved)schema.addChordStroke(project,targetBar.id,next.onsetTick,args.chordGrid?.[targetBar.id]?.[next.onsetTick]);
        });
        copiedMelody.forEach(function(note){
            if(!note.tieToNext)return;
            var continuation=copiedMelody.get(note.tieToNext);
            if(continuation)note.tieToNext=continuation.id;
            else delete note.tieToNext;
        });
        touched.forEach(function(bar) {
            var events = bar[track].sort((a,b) => a.onsetTick - b.onsetTick);
            events.forEach(function(event,index) {
                if (!arrivals.has(event) && !arrivals.has(events[index+1])) return;
                var stop = events[index+1]?.onsetTick ?? barTicks;
                if (event.durationTicks !== undefined && event.onsetTick + event.durationTicks > stop)
                    event.durationTicks = stop - event.onsetTick;
            });
        });
    }
    function applyChordPreset(project, args, api, installForm) {
        var positions = selectedPositions(project, args.barIds);
        var pattern = args.pattern || args.values?.map(function (symbol) { return [{tick:0, symbol:symbol}]; });
        if (!Array.isArray(pattern) || positions.length !== pattern.length) throw Error('進行と入力先の小節数を確認してください');
        var replaced = new Set(), forms = [],barTicks=api.barLength(project);
        positions.forEach(function (position, index) {
            var bar = project.bars[position], kept = new Set();
            if (bar.chords.length && !args.overwrite) throw Error('既存コードの上書きを選択してください');
            var staged = pattern[index], ticks = new Set();
            if (!Array.isArray(staged)) throw Error('進行を確認してください');
            var next = staged.map(function (entry) {
                var symbol = api.chord(entry.symbol, project.instrument.capo);
                if (symbol === null || !Number.isInteger(entry.tick) || entry.tick < 0 || entry.tick >= barTicks || ticks.has(entry.tick))
                    throw Error('コード名と拍の位置を確認してください');
                ticks.add(entry.tick);
                api.addChordStroke(project,bar.id,entry.tick);
                var keep = bar.chords.find(function (event) { return event.onsetTick === entry.tick && !event.unresolved && event.symbol === symbol; });
                if (keep) kept.add(keep.id);
                var event = keep ? copyJSON(keep) : {id:api.newId(), onsetTick:entry.tick, symbol:symbol, unresolved:false, provenance:{origin:'user-set'}};
                if (entry.durationTicks !== undefined) event.durationTicks = Math.min(entry.durationTicks, barTicks - entry.tick);
                else delete event.durationTicks;
                if (entry.form) {
                    if (!installForm) throw Error('フォームの読み込みを確認してください');
                    forms.push({event:event, form:entry.form});
                }
                return event;
            }).sort(function (left, right) { return left.onsetTick - right.onsetTick; });
            bar.chords.forEach(function (event) { if (!kept.has(event.id)) replaced.add(event.id); });
            bar.chords = next;
        });
        project.performance.formBindings = project.performance.formBindings.filter(function (binding) {
            return !replaced.has(binding.chordEventId);
        });
        // Confirmation is evaluated against the final bars and their remaining bindings.
        forms.forEach(function (item) { installForm(project,item.event,item.form); });
    }
    function applyStrumPreset(project, args, api) {
        var positions = selectedPositions(project, args.barIds);
        if (!Array.isArray(args.pattern) || !args.pattern.length || args.pattern.length > 8)
            throw Error('パターンは1〜8小節で指定してください');
        var targets = new Set(args.barIds), old = new Set(),barTicks=api.barLength(project);
        var bindings = project.performance.barRhythms;
        var targetBindings = new Map(bindings.filter(function (binding) { return targets.has(binding.barId); })
            .map(function (binding) { return [binding.barId, binding]; }));
        var materials = args.pattern.map(function (slots, index) {
            if(!Array.isArray(slots)||slots.some(function(slot){return slot.tick>=barTicks||slot.tick+(slot.durationTicks??1)>barTicks;}))
                throw Error('このパターンは曲の拍子に収まりません');
            const sourceGrid = args.inputGrids?.[index];
            const inputGrid = sourceGrid && {unit:sourceGrid.unit, beats:sourceGrid.beats.slice(0,barTicks/480)};
            const cellStarts = inputGrid ? api.strumCellStarts(inputGrid.unit,inputGrid.beats,barTicks)
                : args.cellStarts?.[index]?.filter(tick=>tick<barTicks);
            return {id: api.newId(), encoding: 'studio-strum-v1', snapshot: {
                name: args.name, lengthTicks: barTicks,
                ...(cellStarts && {cellStarts}), ...(inputGrid && {inputGrid}),
                ...(args.leadingSustains?.[index] ? {leadingSustainTicks:args.leadingSustains[index]} : {}),
                slots: slots.map(function (slot) {
                    return Object.assign({}, slot, {id: api.newId()});
                })
            }, provenance: {origin: 'user-set'}};
        });
        project.materials.rhythms.push.apply(project.materials.rhythms, materials);
        targetBindings.forEach(function (binding) { old.add(binding.materialId); });
        project.performance.barRhythms = bindings.filter(function (binding) { return !targets.has(binding.barId); });
        if (positions.length === project.bars.length && materials.length === 1) {
            old.add(project.performance.basicRhythmId);
            project.performance.basicRhythmId = materials[0].id;
        } else {
            positions.forEach(function (position, index) {
                var barId = project.bars[position].id, previous = targetBindings.get(barId);
                project.performance.barRhythms.push({
                    id: previous?.id || api.newId(), barId: barId, materialId: materials[index % materials.length].id
                });
            });
        }
        var referenced = new Set([project.performance.basicRhythmId].concat(project.performance.barRhythms.map(function (binding) { return binding.materialId; })));
        project.materials.rhythms = project.materials.rhythms.filter(function (material) {
            return !old.has(material.id) || referenced.has(material.id);
        });
    }
    function copyRhythmMaterial(project,material,api){
        if(material.encoding!=='studio-strum-v1')return material.id;
        const copy=copyJSON(material);
        copy.id=api.newId();copy.provenance.legacyId='strum_bar_'+copy.id;
        for(const slot of copy.snapshot.slots)slot.id=api.newId();
        project.materials.rhythms.push(copy);
        return copy.id;
    }
    function editSections(canonical,rows,api){
        const original=copyJSON(canonical);
        if(!Array.isArray(rows)||!rows.length||rows.length>128||new Set(rows.map(function(s){return s.id;})).size!==rows.length)throw Error('セクション構成を確認してください');
        var oldSections=new Map(canonical.sections.map(function(s){return [s.id,s];})),retained=new Set(rows.map(function(s){return s.id;}));
        for(var r of rows)if(typeof r.name!=='string'||r.name.length>200||!r.name.trim()||!oldSections.has(r.id)&&r.isNew!==true)throw Error('セクション名を確認してください');
        var remove=canonical.bars.filter(function(b){return !retained.has(b.sectionId);}).map(function(b){return b.id;});for(var id of remove)removeBars(canonical,[id],false);
        canonical.sections=rows.map(function(r){return oldSections.has(r.id)?Object.assign({},oldSections.get(r.id),{name:r.name.trim()}):{id:r.id,name:r.name.trim(),lyricsHidden:false};});
        for(const row of rows){
            const previous=canonical.bars.filter(b=>b.sectionId===row.id);
            for(const bar of previous.slice(row.keep??previous.length))removeBars(canonical,[bar.id],false);
            const existing=canonical.bars.filter(b=>b.sectionId===row.id).length;
            const count=row.count??(oldSections.has(row.id)?existing:4);
            if(!Number.isInteger(count)||count<existing||count>2048||canonical.bars.length+count-existing>2048)throw Error('小節数を確認してください');
            const sources=row.copyFrom?original.bars.filter(b=>b.sectionId===row.copyFrom).slice(0,row.keep??Infinity):[];
            const ids=new Map(), copied=[];
            for(let n=existing;n<count;n++){
                const bar={id:api.newId(),sectionId:row.id,chords:[],melody:[],lyrics:[]},source=sources[n];
                if(!source){canonical.bars.push(bar);continue;}
                for(const part of ['chords','melody','lyrics']){
                    if(!row.parts.includes(part))continue;
                    bar[part]=copyJSON(source[part]);
                    for(const event of bar[part]){const id=api.newId();ids.set(event.id,id);event.id=id;}
                }
                canonical.bars.push(bar);
                copied.push(...bar.melody);
                if(row.parts.includes('strum')){
                    const rhythm=original.performance.barRhythms.find(r=>r.barId===source.id);
                    if(!rhythm)continue;
                    const material=original.materials.rhythms.find(m=>m.id===rhythm.materialId);
                    canonical.performance.barRhythms.push({id:api.newId(),barId:bar.id,materialId:copyRhythmMaterial(canonical,material,api)});
                }
            }
            for(const note of copied)if(note.tieToNext)note.tieToNext=ids.get(note.tieToNext);
            for(const note of copied)if(!note.tieToNext)delete note.tieToNext;
            for(const form of original.performance.formBindings)if(ids.has(form.chordEventId)){
                const clone=copyJSON(form);clone.id=api.newId();clone.chordEventId=ids.get(form.chordEventId);
                canonical.performance.formBindings.push(clone);
            }
        }
        var order=new Map(rows.map(function(r,i){return [r.id,i];}));canonical.bars.sort(function(a,b){return order.get(a.sectionId)-order.get(b.sectionId);});
        api.pruneMelodyTies(canonical);
        api.reconcileScoreLayout(canonical,original);
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
            var before = structureKey(session.draft), warnings = [],formBefore=options.afterEdit||session.draft.extensions?.scoreLayoutV1?JSON.parse(JSON.stringify(session.draft)):null;
            var result = session.runOperation(labels[kind], function (canonical) {
                if (['rangeTransfer', 'chordTransfer', 'cellTransfer', 'chordPreset', 'strumPreset'].includes(kind)) {
                    if (canonical.schemaVersion !== 2) throw Error('この操作は最新形式の曲で使用できます');
                    var schema = model.schema2;
                    if (kind === 'rangeTransfer') transferRange(model, canonical, args, schema, options.duplicateBinding);
                    if (kind === 'chordTransfer') chordTransfer(canonical, args, schema, options.duplicateBinding);
                    if (kind === 'cellTransfer') cellTransfer(model, canonical, args);
                    if (kind === 'chordPreset') {
                        for (var entry of args.steps || [args]) applyChordPreset(canonical, entry, schema, options.installForm);
                        if (options.afterEdit) options.afterEdit(canonical, formBefore);
                    }
                    if (kind === 'strumPreset') for (var entry of args.steps || [args]) applyStrumPreset(canonical, entry, schema);
                    var validated = schema.validate(canonical);
                    if (!validated.ok) throw Error(validated.errors.join('/'));
                    return;
                }
                if(['deleteBars','pasteBars','duplicateBars','restoreSlot','songInfo','instrument','moveSection','basicRhythm'].includes(kind)){
                    if(canonical.schemaVersion!==2)throw Error('この操作はschema2の曲で使用できます');
                    var api=model.schema2;
                    if(kind==='deleteBars')removeBars(canonical,args.barIds,args.keepSlots!==false);
                    if(kind==='pasteBars')pasteRange(model,canonical,args);
                    if(kind==='duplicateBars'){var selected=selectedPositions(canonical,args.barIds),source=JSON.parse(JSON.stringify(canonical)),last=selected.at(-1),section=canonical.bars[last].sectionId,target={id:api.newId(),sectionId:section,chords:[],lyrics:[],melody:[]};canonical.bars.splice(last+1,0,target);pasteRange(model,canonical,{source:source,sourceBarIds:args.barIds,barId:target.id,insert:true,slot:null});canonical.bars.splice(last+1+args.barIds.length,1);}
                    if(kind==='restoreSlot'){if(args.activateEmpty!==true&&!Object.values(args.values||{}).some(function(v){return typeof v==='string'&&v.trim();}))throw Error('入力してから確定してください');var restored=restoreSlot(model,canonical,args.slot);writeRestoredBar(model,canonical,restored,args.values);}
                    if(kind==='basicRhythm')model.editLegacy(canonical,function(view){var r=model.setBasicStrumText(view,args.text);if(r.warnings.length)throw Error(r.warnings.join('/'));},{kind:'basicStrum'});
                    if(kind==='songInfo'){var values=args.values;for(var field of Object.keys(values)){if(!['title','artist','bpm','originalKey','timeSignature'].includes(field))throw Error('曲情報の項目が不正です');if(field==='bpm'){if(!Number.isFinite(values[field])||values[field]<20||values[field]>400)throw Error('BPMは20〜400で入力してください');canonical.songInfo.bpm=values.bpm;}else if(field==='timeSignature'){api.setMeter(canonical,values[field]);}else{if(typeof values[field]!=='string'||values[field].length>1000)throw Error('入力を確認してください');canonical.songInfo[field]=values[field].trim();}}}
                    if(kind==='songInfo'&&args.sections){
                        const next=copyJSON(canonical);
                        editSections(next,args.sections,api);
                        for(const field of ['sections','bars','materials','performance','notation','extensions'])if(next[field])canonical[field]=next[field];
                    }
                    if(kind==='moveSection'){var i=canonical.sections.findIndex(function(s){return s.id===args.sectionId;}),j=i+args.direction;if(i<0||![-1,1].includes(args.direction)||j<0||j>=canonical.sections.length)throw Error('これ以上移動できません');var item=canonical.sections.splice(i,1)[0];canonical.sections.splice(j,0,item);var order=new Map(canonical.sections.map(function(s,i){return [s.id,i];}));canonical.bars.sort(function(a,b){return order.get(a.sectionId)-order.get(b.sectionId);});}
                    if(kind==='instrument'){
                        if(!['preserve','transpose'].includes(args.mode))throw Error('変更方法を確認してください');
                        if(!Number.isInteger(args.capo)||args.capo<0||args.capo>11)throw Error('カポは0〜11で指定してください');
                        var delta=0;if(args.mode==='transpose'){var root=function(key){var m=/^([A-G])([#b♯♭]?)$/.exec(key);if(!m)throw Error('キーを確認してください');return (['C','D','E','F','G','A','B'].indexOf(m[1])<0?0:{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]])+(m[2]==='#'||m[2]==='♯'?1:m[2]?-1:0);};delta=((root(args.originalKey)-root(canonical.songInfo.originalKey)+18)%12)-6;}
                        // Capo edits retain the full interval; legacy key-only requests keep the shortest shift.
                        if(args.transposeSemitones!==undefined){var shift=args.transposeSemitones;if(args.mode!=='transpose'||!Number.isInteger(shift)||Math.abs(shift)>24||((shift-delta)%12+12)%12!==0)throw Error('移調する音程とキーを確認してください');delta=shift;}
                        var maximum=args.maxAbsoluteFret??canonical.instrument.maxAbsoluteFret;
                        if(maximum!==undefined&&(!Number.isInteger(maximum)||maximum<args.capo||maximum>36))throw Error('フレット上限はカポ位置以上・36以下で指定してください');
                        var changed=delta!==0||args.capo!==canonical.instrument.capo||maximum!==canonical.instrument.maxAbsoluteFret;
                        if(changed&&canonical.performance.formBindings.length&&!options.afterEdit)throw Error('フォームの更新処理を準備できませんでした。開き直してください');
                        if(delta){if(canonical.bars.some(function(b){return b.chords.some(function(c){return c.unresolved;});}))throw Error('未解決コードを確認してから移調してください');var shift=function(p){var midi=api.pitchMidi(p)+delta;if(midi<0||midi>127)throw Error('移調後の音域を確認してください');var steps=['C','C','D','D','E','F','F','G','G','A','A','B'];return {step:steps[midi%12],alter:[1,3,6,8,10].includes(midi%12)?1:0,octave:Math.floor(midi/12)-1};};canonical.bars.forEach(function(b){b.melody.forEach(function(e){if(e.kind==='note')e.pitch=shift(e.pitch);});b.chords.forEach(function(c){var symbol=api.chord(c.symbol,delta);if(symbol===null)throw Error('コードの移調を確認してください');c.symbol=symbol;});});canonical.solfege.tonic=shift(canonical.solfege.tonic);canonical.songInfo.originalKey=args.originalKey;}
                        if(args.mode==='transpose')canonical.songInfo.originalKey=args.originalKey;
                        canonical.instrument.capo=args.capo;if(maximum!==undefined)canonical.instrument.maxAbsoluteFret=maximum;if(changed)canonical.performance.formBindings=[];
                    }
                    api.reconcileScoreLayout(canonical,formBefore||canonical);if(options.afterEdit)options.afterEdit(canonical,formBefore);var checked=api.validate(canonical);if(!checked.ok)throw Error(checked.errors.join('/'));return;
                }
                if(kind==='pasteBar'){if(canonical.schemaVersion!==2)throw Error('この操作はschema2の曲で使用できます');pasteBar(model,canonical,args);return;}
                if (['addBar','deleteBar','duplicateBar','moveBar','moveBars','transpose'].includes(kind)) {
                    if (canonical.schemaVersion !== 2) throw Error('この操作はschema2の曲で使用できます');
                    var api=model.schema2, i=canonical.bars.findIndex(function(b){return b.id===args.barId;});
                    if (kind==='moveBars') {
                        if((args.afterId!==undefined&&(typeof args.afterId!=='string'||!args.afterId))||(args.beforeId&&args.afterId))throw Error('移動先を1つ指定してください');
                        if(!args.beforeId&&!args.afterId&&![-1,1].includes(args.direction))throw Error('移動方向が不正です');
                        var ids=args.barIds, positions=ids.map(function(id){return canonical.bars.findIndex(function(b){return b.id===id;});}).sort(function(a,b){return a-b;});
                        if(!ids.length||new Set(ids).size!==ids.length||positions.some(function(n,k){return n<0||(k&&n!==positions[0]+k);}))throw Error('連続する小節を選択してください');
                        var anchorId=args.beforeId||args.afterId,target=anchorId?canonical.bars.find(function(b){return b.id===anchorId;}):canonical.bars[args.direction===-1?positions[0]-1:positions[positions.length-1]+1];
                        if(!target||ids.includes(target.id))throw Error('移動先が選択範囲内または範囲外です');
                        var targetId=target.id,section=target.sectionId,after=!!args.afterId||(!anchorId&&args.direction===1);
                        var movedBars=canonical.bars.filter(function(b){return ids.includes(b.id);}).map(function(b){var copy=JSON.parse(JSON.stringify(b));copy.sectionId=section;return copy;});
                        canonical.bars=canonical.bars.filter(function(b){return !ids.includes(b.id);});
                        var destination=canonical.bars.findIndex(function(b){return b.id===targetId;})+(after?1:0);
                        canonical.bars.splice.apply(canonical.bars,[destination,0].concat(movedBars));
                        api.reconcileScoreLayout(canonical,formBefore||canonical);var movedCheck=api.validate(canonical);if(!movedCheck.ok)throw Error(movedCheck.errors.join('/'));
                        return;
                    }
                    if (kind==='transpose') {
                        var delta=Number(args.semitones);
                        if (!Number.isInteger(delta)||Math.abs(delta)>12) throw Error('移調は半音単位で±12以内です');
                        if (!delta) return;
                        if ((canonical.performance.formBindings.some(function(b){return b.mode!=='auto';})||canonical.performance.formBindings.length&&!options.afterEdit) || canonical.bars.some(function(b){return b.chords.some(function(c){return c.unresolved;});})) throw Error('固定フォームまたは未解決コードがあります。フォームとコードを確認してから移調してください');
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
                    api.reconcileScoreLayout(canonical,formBefore||canonical);if(options.afterEdit)options.afterEdit(canonical,formBefore);var check=api.validate(canonical);if(!check.ok)throw Error(check.errors.join('/'));
                    return;
                }
                var applied=(model.editLegacy || function(p,fn){return fn(p);})(canonical,function(draft){
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
                    model.setBarStrumSlots(draft, args.barNumber, kind === 'resetStrum' ? [] : args.slots, {keepEmpty:kind==='strum'&&args.keepEmpty===true,inputGrid:args.inputGrid,leadingSustainTicks:args.leadingSustainTicks}); break;
                case 'bulkChord': case 'bulkDoremi':
                    var start = draft.bars.findIndex(function (b) { return b.barNumber === args.barNumber; });
                    if (start < 0) throw Error('小節が見つかりません');
                    args.values.slice(0, draft.bars.length - start).forEach(function (value, i) {
                        var number = draft.bars[start + i].barNumber;
                        if (kind === 'bulkChord') model.setBarChord(draft, number, value, {symbolOnly: true});
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
                if(options.afterEdit)options.afterEdit(canonical,formBefore);return applied;
            },{requireUndo: session.draft.schemaVersion===2});
            return Object.assign({}, result, { warnings: warnings,
                structureChanged: result.ok && before !== structureKey(session.draft) });
        } });
    }
    return Object.freeze({ previewSections(project,rows,api){const draft=copyJSON(project);editSections(draft,rows,api);return draft;}, previewPreset(project,kind,args,schema,installForm) {
        var draft = copyJSON(project);
        if (kind === 'chordPreset') applyChordPreset(draft,args,schema,installForm);
        else if (kind === 'strumPreset') applyStrumPreset(draft,args,schema);
        else throw Error('入力の種類を確認してください');
        return draft;
    }, create: create, capture: capture, isCurrent: isCurrent, structureKey: structureKey,scoreSlots:scoreSlots,scoreLayout:scoreLayout });
}));
