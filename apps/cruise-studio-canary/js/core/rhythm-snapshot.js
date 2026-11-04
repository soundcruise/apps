/* Offline native Rhythm snapshot reader. Acquisition, owner availability and authorization are separate. */
(function(root,factory){
    if(typeof module==='object'&&module.exports)module.exports=factory();
    else (root.CruiseStudio=root.CruiseStudio||{}).rhythmSnapshots=factory();
})(globalThis,function(){
'use strict';
const IDS = Object.freeze([
    'basic-eighth', 'offbeat-eighth', 'one-three-eighth', 'two-four-eighth', 'standard-eighth',
    'continuous-sixteenth', 'eighth-two-sixteenths', 'mixed-sixteenth', 'standard-sixteenth'
].map(suffix => 'rhythm:create-basic:' + suffix)); // Identity compatibility only; no musical database.
const internalErrors = new WeakSet();

function reject(code, detail) {
    const error = Object.freeze({code, detail});
    internalErrors.add(error);
    throw error;
}
function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}
function failure(error) {
    const known = error && typeof error === 'object' && internalErrors.has(error);
    const code = known ? error.code : 'invalid-owner-response';
    return freeze({ok: false, error: {code}, diagnostics: [{code, detail: known ? error.detail : 'unsafe-or-invalid-input'}]});
}
function requireValue(ok, detail, code = 'invalid-owner-response') { if (!ok) reject(code, detail); }
// Bounded own-descriptor inspection precedes all cloning/field reads. No JSON hooks
// are called. Proxy traps can execute by language design; thrown traps are contained.
function data(value) {
    let nodes = 0, chars = 0;
    const seen = new Set();
    function visit(input, depth) {
        requireValue(++nodes <= 2048 && depth <= 10, 'data-budget');
        if (input === null || typeof input === 'boolean') return input;
        if (typeof input === 'number') { requireValue(Number.isFinite(input), 'nonfinite-number'); return input; }
        if (typeof input === 'string') {
            chars += input.length; requireValue(input.length <= 512 && chars <= 32768, 'string-budget'); return input;
        }
        requireValue(input && typeof input === 'object' && !seen.has(input), 'non-json-value');
        seen.add(input);
        const array = Array.isArray(input), proto = Object.getPrototypeOf(input);
        const ctor = proto && Object.getOwnPropertyDescriptor(proto, 'constructor');
        requireValue(array || proto === Object.prototype || proto === null || (Object.getPrototypeOf(proto) === null && ctor && typeof ctor.value === 'function' && Function.prototype.toString.call(ctor.value) === Function.prototype.toString.call(Object)), 'non-plain-record');
        for (let cursor = input; cursor !== null; cursor = Object.getPrototypeOf(cursor)) {
            requireValue(!Object.getOwnPropertyDescriptor(cursor, 'toJSON') &&
                !Object.getOwnPropertyDescriptor(cursor, Symbol.toStringTag), 'json-hook');
        }
        if (array) {
            const length = Object.getOwnPropertyDescriptor(input, 'length').value;
            requireValue(Number.isSafeInteger(length) && length <= 64, 'array-budget');
            requireValue(Reflect.ownKeys(input).length === length + 1, 'array-shape');
            const output = [];
            for (let i = 0; i < length; i++) {
                const d = Object.getOwnPropertyDescriptor(input, String(i));
                requireValue(d && Object.hasOwn(d, 'value') && d.enumerable, 'array-descriptor');
                output.push(visit(d.value, depth + 1));
            }
            return output;
        }
        const keys = Reflect.ownKeys(input);
        requireValue(keys.length <= 24, 'record-budget');
        const output = {};
        for (const key of keys) {
            requireValue(typeof key === 'string' && key.length <= 128, 'record-key');
            const d = Object.getOwnPropertyDescriptor(input, key);
            requireValue(d && Object.hasOwn(d, 'value') && d.enumerable, 'record-descriptor');
            Object.defineProperty(output, key, {value: visit(d.value, depth + 1), enumerable: true});
        }
        return output;
    }
    return visit(value, 0);
}
function record(value, keys) {
    requireValue(value && typeof value === 'object' && !Array.isArray(value) &&
        Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), 'record-fields');
}
function identity(patternId, revision, legacy, grid) {
    const index = IDS.indexOf(patternId);
    requireValue(index >= 0 && revision === 1, 'pattern-identity', 'unsupported-pattern');
    record(legacy, ['stageN', 'presetIndex']);
    requireValue(legacy.stageN === (index < 5 ? 2 : 3) && legacy.presetIndex === (index < 5 ? index : index - 5), 'legacy-reference');
    requireValue(grid === (index < 5 ? 'eighth' : 'sixteenth'), 'identity-grid');
}
function validateResult(result) {
    requireValue(result && typeof result === 'object' && typeof result.ok === 'boolean', 'result-shape');
    if (!result.ok) {
        record(result, ['ok', 'error']); record(result.error, ['code']);
        requireValue(typeof result.error.code === 'string' && result.error.code.length <= 128, 'owner-error-shape');
        reject('owner-error', result.error.code);
    }
    requireValue(result.apiVersion === 1, 'api-version', 'unsupported-api-version');
}
function validatePattern(p) {
    record(p, ['patternId','patternRevision','name','encoding','legacyRef','meter','tpq','patternBars','lengthTicks','grid','cellTicks','feel','sourceDirections','cells','semanticProfile']);
    requireValue(p.encoding === 'rhythm-official-cells-v1', 'encoding', 'unsupported-encoding');
    requireValue(p.semanticProfile === 'rhythm-create-basic-v1', 'semantic-profile', 'unsupported-profile');
    record(p.meter, ['beats','beatUnit']);
    requireValue(p.meter.beats === 4 && p.meter.beatUnit === 4, 'meter', 'unsupported-meter');
    requireValue(['eighth','sixteenth'].includes(p.grid), 'grid', 'unsupported-grid');
    requireValue(p.feel === 'straight', 'feel', 'unsupported-feel');
    requireValue(p.patternBars === 1, 'multiple-bars', 'unsupported-pattern');
    identity(p.patternId, p.patternRevision, p.legacyRef, p.grid);
    requireValue(typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 80, 'name');
    requireValue(p.tpq === 24 && p.lengthTicks === 96 && p.cellTicks === (p.grid === 'eighth' ? 12 : 6), 'source-timebase');
    const count = p.grid === 'eighth' ? 8 : 16;
    requireValue(Array.isArray(p.cells) && p.cells.length === count, 'cell-count');
    record(p.sourceDirections, ['stage','preset']);
    const stage = p.sourceDirections.stage, preset = p.sourceDirections.preset;
    requireValue(Array.isArray(stage) && stage.length === count && stage.every(x => x === 'down' || x === 'up'), 'stage-directions');
    requireValue(preset === null || (Array.isArray(preset) && preset.length === count && preset.every(x => x === null || x === 'down' || x === 'up')), 'preset-directions');
    p.cells.forEach((cell, i) => {
        record(cell, ['id','tick','type','direction','directionBasis','legacyDirManual']);
        requireValue(cell.id === 'c' + String(i).padStart(2, '0'), 'cell-id');
        requireValue(Number.isSafeInteger(cell.tick) && cell.tick >= 0 && cell.tick < 96 && cell.tick === i * p.cellTicks && cell.tick + p.cellTicks <= 96, 'source-cell-time');
        requireValue(['hit','rest','tie'].includes(cell.type), 'unknown-cell-type');
        requireValue(cell.direction === null || cell.direction === 'down' || cell.direction === 'up', 'direction');
        const raw = preset === null ? (cell.type === 'hit' ? stage[i] : null) : preset[i];
        const expected = cell.type === 'hit' && raw === null ? stage[i] : raw;
        requireValue(cell.direction === expected, 'direction-source-mismatch');
        requireValue(cell.directionBasis === (preset !== null ? 'preset-explicit' : cell.type === 'hit' ? 'stage-default' : 'none'), 'direction-basis');
        requireValue(cell.legacyDirManual === (cell.type === 'hit' ? true : null), 'legacy-manual-flag');
        // All nine official profiles have no directional non-attack motion. A
        // changed/manual profile must not be promoted to a formal air stroke.
        requireValue(cell.type === 'hit' || cell.direction === null, 'unprovided-motion-semantics', 'unsupported-pattern');
    });
}

function readRhythmMaterial(value) {
    try {
        const m=data(value);
        record(m,['id','encoding','snapshot','provenance']);
        requireValue(typeof m.id==='string'&&m.id.length>0,'material-id');
        requireValue(m.encoding==='rhythm-owner-cells-v1','material-encoding','unsupported-encoding');
        record(m.provenance,['origin','source','adapterVersion']);
        requireValue(m.provenance.origin==='user-set'&&m.provenance.adapterVersion===1,'material-provenance');
        const s=m.provenance.source,p=m.snapshot;
        record(s,['ownerApp','ownerAppVersion','ownerApiVersion','patternId','patternRevision','encoding']);
        requireValue(s.ownerApp==='rhythm-cruise'&&typeof s.ownerAppVersion==='string'&&s.ownerAppVersion.length<=32&&/^\d+\.\d+\.\d+$/.test(s.ownerAppVersion)&&s.ownerApiVersion===1,'source-version');
        validatePattern(p);
        requireValue(s.patternId===p.patternId&&s.patternRevision===p.patternRevision&&s.encoding===p.encoding,'source-snapshot-mismatch');
        requireValue(JSON.stringify(p).length*2<=16384,'snapshot-budget');
        const spanTicks = p.cellTicks * 20;
        requireValue(Number.isSafeInteger(spanTicks) && spanTicks === (p.grid === 'eighth' ? 240 : 120) && p.lengthTicks * 20 === 1920, 'target-timebase');
        const events = [];
        let active = null;
        for (const cell of p.cells) {
            const onsetTick = cell.tick * 20;
            requireValue(Number.isSafeInteger(onsetTick) && onsetTick + spanTicks <= 1920, 'target-cell-time');
            const sound = cell.type === 'hit' ? 'attack' : cell.type === 'rest' ? 'rest' : 'sustain';
            if (sound === 'sustain' && active === null) reject('unresolved-orphan-sustain', cell.id);
            const event = {sourceCellId: cell.id, sourceTick: cell.tick, sourceSpanTicks: p.cellTicks,
                onsetTick, spanTicks, sound, direction: cell.direction, directionBasis: cell.directionBasis,
                legacyDirManual: cell.legacyDirManual, motion: sound === 'attack' ? 'stroke' : 'none',
                continuationOf: sound === 'sustain' ? events[active].sourceCellId : null,
                notationDurationTicks: sound === 'sustain' ? null : spanTicks,
                accent: null, playedStrings: null, voicing: null};
            if (sound === 'attack') active = events.length;
            else if (sound === 'rest') active = null;
            else events[active].notationDurationTicks += spanTicks;
            events.push(event);
        }
        return freeze({ok:true,material:m,projection:{adapterVersion:1,ppq:480,lengthTicks:1920,events,
            diagnostics:[],displayable:true,rhythmResolved:true,performanceReady:false,completeScore:false}});
    } catch(error) { return failure(error); }
}
function validateRhythmMaterial(value){const r=readRhythmMaterial(value);return r.ok?{ok:true}:{ok:false,errors:r.diagnostics.map(x=>({code:x.code,path:x.detail}))};}
function contentKey(value){const r=readRhythmMaterial(value);if(!r.ok)throw Error(r.error.code);function canonical(v){if(!v||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';}const m={...r.material};delete m.id;return canonical(m);}
return Object.freeze({validateRhythmMaterial,readRhythmMaterial,contentKey});
});
