import {assertJSON, insist, record, clone, freeze, canonicalJSON} from './json.mjs';

export const VIEWER_VERSION = '0.17.1-dev.1';
export const SCORE_FORMAT = 'sound-cruise/score-view';
export const SCORE_EXTENSION = '.cruise-score.json';
// Schema2 allows 4 Mi UTF-16 code units (8 MiB accounting). UTF-8 needs at most
// 12 MiB for that score. Reserve 1 MiB for the bounded envelope/presentation.
export const MAX_FILE_BYTES = 13 * 1024 * 1024;
export const MAX_PRESENTATION_BYTES = 64 * 1024;
export const CAPABILITIES = Object.freeze(['schema2', 'meter:4/4', 'layout:scoreLayoutV1', 'melody:bar-ties-v1',
    'form:studio-chord-form-v1', 'form:studio-chord-form-v2',
    'rhythm:studio-strum-v1', 'rhythm:rhythm-owner-cells-v1']);
const encoder = new TextEncoder();
const identifier = v => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(v);
function requirements(score) {
    return [...new Set(['schema2', 'meter:4/4',
        ...score.materials.forms.map(m => 'form:' + m.encoding),
        ...score.materials.rhythms.map(m => 'rhythm:' + m.encoding),
        ...(score.bars.some(bar=>bar.melody.some(note=>note.tieToNext))?['melody:bar-ties-v1']:[]),
        ...(score.extensions?.scoreLayoutV1 ? ['layout:scoreLayoutV1'] : [])])].sort();
}

// Host supplies the existing canonical validator and allowlisted presentation
// normalizer. No repository, editor, storage, network or musical migration here.
export function createScoreCodec({validateScore, normalizePresentation, crypto = globalThis.crypto}) {
    insist(typeof validateScore === 'function' && typeof normalizePresentation === 'function', 'missing-codec-adapter');
    insist(typeof crypto?.subtle?.digest === 'function', 'missing-sha256');
    async function hash(bytes) {
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
    }
    function checkedScore(input) {
        assertJSON(input);
        const score = clone(input), result = validateScore(score);
        insist(result?.ok === true, 'invalid-score:' + (result?.errors || []).join('/'));
        insist(score.schemaVersion === 2, 'unsupported-schema');
        return score;
    }
    function presentation(input, score) {
        assertJSON(input);
        insist(encoder.encode(JSON.stringify(input)).byteLength <= MAX_PRESENTATION_BYTES, 'presentation-budget');
        const result = normalizePresentation(clone(input), freeze(clone(score)));
        assertJSON(result.value);
        insist(encoder.encode(JSON.stringify(result.value)).byteLength <= MAX_PRESENTATION_BYTES, 'presentation-budget');
        return result;
    }
    async function verify(input) {
        assertJSON(input);
        record(input, ['format','formatVersion','viewerDocumentId','revisionId','source','score','defaultPresentation','requires']);
        insist(input.format === SCORE_FORMAT && input.formatVersion === 1, 'unsupported-viewer-format');
        insist(identifier(input.viewerDocumentId) && identifier(input.revisionId), 'invalid-document-id');
        record(input.source, ['projectId','exportedAt','studioVersion','scoreDigest']);
        insist(typeof input.source.exportedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.source.exportedAt) &&
            Number.isFinite(Date.parse(input.source.exportedAt)) && new Date(input.source.exportedAt).toISOString() === input.source.exportedAt, 'invalid-export-time');
        insist(typeof input.source.studioVersion === 'string' && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(input.source.studioVersion), 'invalid-studio-version');
        insist(typeof input.source.scoreDigest === 'string' && /^[0-9a-f]{64}$/.test(input.source.scoreDigest), 'invalid-score-digest');
        insist(Array.isArray(input.requires) && input.requires.length <= CAPABILITIES.length &&
            new Set(input.requires).size === input.requires.length && input.requires.every(c => CAPABILITIES.includes(c)), 'unsupported-required-capability');
        const score = checkedScore(input.score);
        insist(input.source.projectId === score.projectId, 'source-project-mismatch');
        insist(requirements(score).every(c => input.requires.includes(c)), 'missing-required-capability');
        const actual = await hash(encoder.encode(canonicalJSON(score)));
        insist(actual === input.source.scoreDigest, 'score-digest-mismatch');
        const p = presentation(input.defaultPresentation, score);
        const bound = new Set(score.performance.formBindings.map(b => b.chordEventId));
        const unbound = score.bars.some(b => b.chords.some(c => !c.unresolved && !bound.has(c.id)));
        return {document: freeze({...clone(input), score, defaultPresentation: p.value}),
            warnings: freeze([...(p.warnings || []), ...(unbound ? ['unbound-form:no-automatic-voicing'] : [])])};
    }
    async function decode(data) {
        let bytes;
        if (typeof data === 'string') {
            insist(data.length <= MAX_FILE_BYTES, 'file-budget'); bytes = encoder.encode(data);
        } else if (data instanceof Uint8Array) { insist(data.byteLength <= MAX_FILE_BYTES, 'file-budget'); bytes = data.slice(); }
        else if (data instanceof ArrayBuffer) { insist(data.byteLength <= MAX_FILE_BYTES, 'file-budget'); bytes = new Uint8Array(data.slice(0)); }
        else throw Error('unsupported-file-input');
        insist(bytes.byteLength <= MAX_FILE_BYTES, 'file-budget');
        let input;
        try { input = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); }
        catch { throw Error('invalid-viewer-json'); }
        const result = await verify(input);
        return Object.freeze({...result, byteHash: await hash(bytes), byteLength: bytes.byteLength});
    }
    async function encode(project, {documentId, revisionId, exportedAt, studioVersion, defaultPresentation = {}}) {
        // Copy before the first await; later editor operations cannot change this export.
        const score = checkedScore(project), p = presentation(defaultPresentation, score);
        const digest = await hash(encoder.encode(canonicalJSON(score)));
        const document = {format:SCORE_FORMAT, formatVersion:1, viewerDocumentId:documentId, revisionId,
            source:{projectId:score.projectId, exportedAt, studioVersion, scoreDigest:digest},
            score, defaultPresentation:p.value, requires:requirements(score)};
        const text = JSON.stringify(document) + '\n', decoded = await decode(text);
        return Object.freeze({...decoded, text, warnings:freeze([...new Set([...p.warnings, ...decoded.warnings])])});
    }
    return Object.freeze({encode, decode});
}
