/* Text values enter the session Core; DOM/native histories remain browser-owned. */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else (root.CruiseStudio = root.CruiseStudio || {}).structureText = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    function create(options) {
        var model = options.model;
        return Object.freeze({
            finish: function () { var s = options.getSession(); return s ? s.finishTextGroup() : { ok: true }; },
            apply: function (target, value, mode) {
                var s = options.getSession(), warnings = [];
                if (!s || s.domain !== 'structure' || (options.isEligible && !options.isEligible()) ||
                    s.target.projectId !== s.draft.projectId) return { ok: false, code: 'stale-target' };
                if (mode === 'native') s.finishTextGroup();
                var key = JSON.stringify([target.kind, target.field, target.sectionId, target.barNumber, target.tick, target.ticks]);
                var run = mode === 'composition' ? s.runCompositionTextOperation : s.runTextOperation;
                var result = run(key, '文字入力: ' + (target.field || target.kind), function (canonical) {
                return (model.editLegacy || function(p,fn){return fn(p);})(canonical,function(draft){
                    if (target.kind === 'song') {
                        var si = draft.songInfo, field = target.field;
                        if (field === 'title') si.title = String(value).trim() || '無題のプロジェクト';
                        else if (field === 'artist') si.artist = String(value).trim();
                        else if (field === 'capo' || field === 'bpm') {
                            var n = parseInt(value, 10);
                            si[field] = field === 'capo' ? (isNaN(n) ? 0 : Math.min(11, Math.max(0, n))) :
                                (isNaN(n) ? 100 : Math.min(400, Math.max(20, n)));
                        } else if (field === 'originalKey' || field === 'playKey') si[field] = value;
                        else if (field === 'timeSignature') { var sig = String(value || '4/4').split('/'); si.timeSignature = { beats: parseInt(sig[0], 10) || 4, beatUnit: parseInt(sig[1], 10) || 4 }; }
                        else throw Error('Unknown song field');
                    } else if (target.kind === 'basicStrum') warnings = model.setBasicStrumText(draft, value).warnings;
                    else {
                        if (!draft.bars.some(function (b) { return b.barNumber === target.barNumber; })) throw Error('小節が見つかりません');
                        if (target.kind === 'chord') model.setBarChord(draft, target.barNumber, value);
                        else if (target.kind === 'doremi') { var bar=draft.bars.find(function(b){return b.barNumber===target.barNumber;}); if(value!==model.getBarDoremiText(bar)) { warnings=model.setBarDoremiText(draft,target.barNumber,value).warnings; if(canonical.schemaVersion===2 && warnings.length) throw Error(warnings.join(' / ')); } }
                        else if (target.kind === 'lyrics') {
                            var applied = model.setBarLyricSlot(draft, target.barNumber, target.tick, target.ticks, value);
                            if (!applied.ok) throw Error(applied.warnings.join(' / '));
                            warnings = applied.warnings;
                        } else throw Error('Unknown text field');
                    }
                    });
                });
                if (mode === 'native' || mode === 'composition' || mode === 'discrete') s.finishTextGroup();
                return Object.assign({}, result, { warnings: warnings });
            }
        });
    }
    return Object.freeze({ create: create });
}));
