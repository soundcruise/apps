/* Memory-only consumer of the Rhythm owner API. No product boot or persistence imports. */
const IDS = Object.freeze([
    'basic-eighth', 'offbeat-eighth', 'one-three-eighth', 'two-four-eighth', 'standard-eighth',
    'continuous-sixteenth', 'eighth-two-sixteenths', 'mixed-sixteenth', 'standard-sixteenth'
].map(suffix => 'rhythm:create-basic:' + suffix)); // Identity compatibility only; no musical database.
const internalErrors = new WeakSet();
const verifiedContexts = new WeakSet();
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
        requireValue(array || proto === Object.prototype || proto === null, 'non-plain-record');
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
/** Low-level R2 decoder. sourceContext must already be verified by the caller.
 * A context is issued by the injected facade below, which compares version
 * and source pins before calling the owner. Neither interface is authorization. */
export function decodeOfficialPattern(ownerResult, sourceContext) {
    try {
        requireValue(sourceContext && typeof sourceContext === 'object' && verifiedContexts.has(sourceContext), 'source-context-not-issued', 'unverified-owner-source');
        const result = data(ownerResult), context = data(sourceContext);
        record(context, ['ownerApp','ownerAppVersion']);
        requireValue(context.ownerApp === 'rhythm-cruise' && typeof context.ownerAppVersion === 'string' &&
            context.ownerAppVersion.length <= 32 && /^\d+\.\d+\.\d+$/.test(context.ownerAppVersion), 'source-context');
        validateResult(result); record(result, ['ok','apiVersion','pattern']);
        const p = result.pattern; validatePattern(p);
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
        return freeze({ok: true, source: {ownerApp: context.ownerApp, ownerAppVersion: context.ownerAppVersion,
            ownerApiVersion: 1, patternId: p.patternId, patternRevision: p.patternRevision, encoding: p.encoding},
            nativeSnapshot: p, projection: {adapterVersion: 1, ppq: 480, lengthTicks: 1920, events,
                diagnostics: [], displayable: true, rhythmResolved: true, performanceReady: false, completeScore: false}});
    } catch (error) { return failure(error); }
}
function queryData(value, allowed) {
    const q = value === undefined ? {} : data(value);
    requireValue(q && typeof q === 'object' && !Array.isArray(q) && Object.keys(q).every(k => allowed.includes(k)), 'query', 'invalid-argument');
    return q;
}
/** The host verifies Git bytes/metadata outside this pure module, then injects
 * the functions, observed version, receipt and independently approved source pin.
 * Receipt strings are provenance, not a cryptographic proof or capability. */
export function createOfficialRhythmAdapter(config) {
    try {
        requireValue(config && typeof config === 'object' && Object.getPrototypeOf(config) === Object.prototype, 'configuration', 'invalid-argument');
        const descriptors = Object.getOwnPropertyDescriptors(config);
        const names = ['listOfficialPatterns','getOfficialPattern','ownerVersion','sourceEvidence','expectedSource'];
        requireValue(Reflect.ownKeys(descriptors).length === names.length && names.every(n => descriptors[n] && Object.hasOwn(descriptors[n], 'value') && descriptors[n].enumerable), 'configuration-descriptors', 'invalid-argument');
        const list = descriptors.listOfficialPatterns.value, get = descriptors.getOfficialPattern.value;
        requireValue(typeof list === 'function' && typeof get === 'function', 'owner-functions', 'invalid-argument');
        const version = data(descriptors.ownerVersion.value), evidence = data(descriptors.sourceEvidence.value), pin = data(descriptors.expectedSource.value);
        record(evidence, ['ownerApp','ownerAppVersion','commit','tree','modulePath','moduleSha256','versionSource','verification']);
        record(evidence.versionSource, ['path','symbol','sha256']); record(pin, ['commit','moduleSha256']);
        requireValue(evidence.ownerApp === 'rhythm-cruise' && evidence.verification === 'fixed-git-object' &&
            evidence.modulePath === 'apps/rhythm-cruise/js/official-patterns.mjs' &&
            evidence.versionSource.path === 'apps/rhythm-cruise/script.js' && evidence.versionSource.symbol === 'RHYTHM_CRUISE_VERSION', 'source-evidence', 'unverified-owner-source');
        requireValue(typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version) && version.length <= 32 && version === evidence.ownerAppVersion, 'owner-version-mismatch', 'owner-version-mismatch');
        requireValue([evidence.commit, evidence.tree, evidence.moduleSha256, evidence.versionSource.sha256].every(x => typeof x === 'string') &&
            /^[a-f0-9]{40}$/.test(evidence.commit) && /^[a-f0-9]{40}$/.test(evidence.tree) &&
            /^[a-f0-9]{64}$/.test(evidence.moduleSha256) && /^[a-f0-9]{64}$/.test(evidence.versionSource.sha256) &&
            evidence.commit === pin.commit && evidence.moduleSha256 === pin.moduleSha256, 'owner-source-pin', 'unverified-owner-source');
        const context = freeze({ownerApp: evidence.ownerApp, ownerAppVersion: version});
        verifiedContexts.add(context);
        function invoke(callback, ...args) { try { return callback(...args); } catch (_) { reject('owner-error', 'owner-api-exception'); } }
        return freeze({ok: true, sourceEvidence: evidence, sourceContext: context,
            listOfficialPatterns(query) {
                try {
                    const q = queryData(query, ['apiVersion','collection']);
                    if (Object.hasOwn(q, 'apiVersion') && q.apiVersion !== 1) reject('unsupported-api-version', 'query-api');
                    if (Object.hasOwn(q, 'collection') && q.collection !== 'create-basic') reject('unsupported-pattern', 'collection');
                    const result = data(invoke(list, q)); validateResult(result); record(result, ['ok','apiVersion','patterns']);
                    requireValue(Array.isArray(result.patterns) && result.patterns.length === 9, 'catalog-count');
                    result.patterns.forEach((p, i) => {record(p, ['patternId','patternRevision','name','grid','legacyRef']);
                        identity(p.patternId, p.patternRevision, p.legacyRef, p.grid);
                        requireValue(p.patternId === IDS[i] && typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 80, 'catalog-order/name');});
                    return freeze(result);
                } catch (error) { return failure(error); }
            },
            getOfficialPattern(patternId, options) {
                try {
                    requireValue(typeof patternId === 'string' && patternId.length <= 128, 'pattern-id', 'invalid-argument');
                    requireValue(IDS.includes(patternId), 'pattern-id', 'unsupported-pattern');
                    const q = queryData(options, ['apiVersion','patternRevision']);
                    if (Object.hasOwn(q, 'apiVersion') && q.apiVersion !== 1) reject('unsupported-api-version', 'query-api');
                    if (Object.hasOwn(q, 'patternRevision') && q.patternRevision !== 1) reject('unsupported-pattern', 'query-revision');
                    const result = decodeOfficialPattern(invoke(get, patternId, q), context);
                    if (result.ok && result.source.patternId !== patternId) reject('invalid-owner-response', 'requested-pattern-mismatch');
                    return result;
                } catch (error) { return failure(error); }
            }});
    } catch (error) { return failure(error); }
}
