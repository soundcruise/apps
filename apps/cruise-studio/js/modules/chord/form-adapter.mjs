// Memory-only reader. Hosts inject the released Chord owner API; this module loads nothing.
export const CHORD_FORM_ADAPTER_VERSION = '1';
const STANDARD_TUNING = [64, 59, 55, 50, 45, 40]; // strings 1 → 6, sounding MIDI
const QUALITIES = ['maj', 'm', '7', 'maj7', 'm7', '6', 'm6', 'sus4'];
const pc = n => ((n % 12) + 12) % 12;
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const unique = values => [...new Set(values)];
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// Reject executable/accessor data without calling getters or toJSON. Cross-realm owner
// records are supported, but class instances, cycles and non-finite numbers are not.
function copyData(value, ancestors = new Set(), budget = { n: 4096 }) {
    if (--budget.n < 0) throw Error('data-budget');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || ancestors.has(value)) throw Error('non-data');
    const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
    if (!array && proto !== null && Object.getPrototypeOf(proto) !== null) throw Error('non-record');
    const descriptors = Object.getOwnPropertyDescriptors(value), result = array ? [] : {};
    ancestors.add(value);
    for (const key of Reflect.ownKeys(descriptors)) {
        if (array && key === 'length') continue;
        const d = descriptors[key];
        if (typeof key !== 'string' || !d.enumerable || !('value' in d) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('non-data');
        if (array && !/^(0|[1-9]\d*)$/.test(key)) throw Error('non-array-index');
        result[key] = copyData(d.value, ancestors, budget);
    }
    ancestors.delete(value);
    if (array && (result.length !== value.length || Object.keys(result).length !== value.length)) throw Error('sparse-array');
    return result;
}
function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}
const stringList = a => Array.isArray(a) && a.length <= 6 && a.every(n => integer(n, 1, 6)) && unique(a).length === a.length;

/** All musical pitch/quality and recommendation decisions remain with Chord Cruise.
 * parseChordSymbol is Studio's existing parseBasicChordSymbol reader, not a new parser.
 * No storage, DOM, audio, transport, permission or authorization dependencies are accepted.
 */
export function createChordFormAdapter({ chordTheory, caged, parseChordSymbol, ownerVersion }) {
    if (!chordTheory || !caged || typeof parseChordSymbol !== 'function' ||
        typeof chordTheory.parseSpelledNoteName !== 'function' ||
        typeof caged.getCommonForm !== 'function' || typeof caged.getForm !== 'function' ||
        typeof ownerVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(ownerVersion)) throw TypeError('Chord owner dependencies required');

    function resolve(input) {
        let request = null, provenance = null;
        const unresolved = reason => freeze({ request, provenance, display: { possible: false, reasons: [reason] },
            form: null, completeness: { complete: false, reasons: [reason] },
            performance: { voicingUsable: false, scope: 'voicing-only', reasons: [reason] } });
        let q, parsed, quality, soundingRoot, soundingBass, formRoot;
        try {
            q = copyData(input);
            if (!q || typeof q.symbol !== 'string' || q.symbol.length > 64 || /\s/.test(q.symbol)) return unresolved('invalid-symbol');
            parsed = copyData(parseChordSymbol(q.symbol));
            if (!parsed || typeof parsed.root !== 'string' || typeof parsed.quality !== 'string') return unresolved('invalid-symbol');
            const root = copyData(chordTheory.parseSpelledNoteName(parsed.root));
            const bass = parsed.bass == null ? null : copyData(chordTheory.parseSpelledNoteName(parsed.bass));
            if (!root || !integer(root.pc, 0, 11) || (parsed.bass != null && (!bass || !integer(bass.pc, 0, 11)))) return unresolved('invalid-symbol');
            soundingRoot = root.pc; soundingBass = bass ? bass.pc : root.pc;
            const definitions = chordTheory.QUALITIES;
            quality = QUALITIES.find(k => k === parsed.quality || definitions[k]?.symbolSuffix === parsed.quality);
            if (parsed.quality === 'maj7') quality = 'maj7';
            if (!quality) return unresolved('unsupported-quality');
            const definition = copyData(definitions[quality]);
            if (!Array.isArray(definition.intervals) || !definition.intervals.length ||
                !definition.intervals.every(n => integer(n, 0, 11)) || !definition.intervals.includes(0)) return unresolved('invalid-owner-quality');
            if (!same(copyData(chordTheory.OPEN_STRINGS), [4, 9, 2, 7, 11, 4])) return unresolved('unsupported-owner-tuning');
            const capo = q.capo;
            if (!integer(capo, 0, 11)) return unresolved('unsupported-capo');
            if (!Array.isArray(q.tuningMidi) || !same(q.tuningMidi, STANDARD_TUNING)) return unresolved('unsupported-tuning');
            const maxAbsoluteFret = q.maxAbsoluteFret;
            if (!integer(maxAbsoluteFret, capo, 36)) return unresolved('invalid-physical-fret-bound');
            const generation = q.generation ?? { minRelativeFret: 0, maxRelativeFret: Math.min(13, maxAbsoluteFret - capo) };
            if (!integer(generation.minRelativeFret, 0, maxAbsoluteFret - capo) ||
                !integer(generation.maxRelativeFret, generation.minRelativeFret, maxAbsoluteFret - capo)) return unresolved('invalid-generation-range');
            if (q.playedStrings != null && (!stringList(q.playedStrings) || !q.playedStrings.length)) return unresolved('invalid-played-strings');
            formRoot = pc(soundingRoot - capo);
            request = { soundingSymbol: q.symbol, soundingRootPc: soundingRoot, soundingBassPc: soundingBass,
                slashBass: parsed.bass != null, quality, formRootPc: formRoot, formBassPc: pc(soundingBass - capo),
                capo, tuningMidi: q.tuningMidi.slice(), maxAbsoluteFret, generation,
                playedStrings: q.playedStrings == null ? null : q.playedStrings.slice() };
            provenance = { ownerApp: 'chord-cruise', ownerVersion, adapterVersion: CHORD_FORM_ADAPTER_VERSION,
                methods: ['getCommonForm', 'getForm'], recommendation: null, adoption: 'unconfirmed',
                fretCoordinates: 'capo-relative', generation: copyData(generation) };
            const recommendation = copyData(caged.getCommonForm(quality, formRoot, generation.maxRelativeFret, generation.minRelativeFret));
            if (recommendation === null) return unresolved('owner-no-recommendation');
            if (!recommendation || !['C', 'A', 'G', 'E', 'D'].includes(recommendation.shape) ||
                !['common', 'recommended'].includes(recommendation.source)) return unresolved('invalid-owner-recommendation');
            provenance.recommendation = recommendation;
            const raw = copyData(caged.getForm(recommendation.shape, quality, formRoot, generation.maxRelativeFret, generation.minRelativeFret));
            if (!raw || typeof raw.available !== 'boolean') return unresolved('invalid-owner-response');
            if (!raw.available) return unresolved('owner-form-unavailable');
            if (raw.shape !== recommendation.shape || raw.qualityKey !== quality || !Array.isArray(raw.notes) ||
                raw.notes.length < 1 || raw.notes.length > 6 || !stringList(raw.mutedStrings)) return unresolved('invalid-owner-response');
            const seen = new Set(), notes = [];
            for (const n of raw.notes) {
                if (!n || !integer(n.string, 1, 6) || seen.has(n.string) || raw.mutedStrings.includes(n.string) ||
                    !integer(n.fret, generation.minRelativeFret, generation.maxRelativeFret) ||
                    !integer(n.interval, 0, 11) || (n.finger != null && ![1, 2, 3, 4, 'T'].includes(n.finger))) return unresolved('invalid-owner-note');
                seen.add(n.string);
                const midi = q.tuningMidi[n.string - 1] + capo + n.fret;
                if (pc(midi - soundingRoot) !== n.interval) return unresolved('owner-pitch-mismatch');
                notes.push({ string: n.string, relativeFret: n.fret, absoluteFret: capo + n.fret, soundingMidi: midi,
                    pitchClass: pc(midi), interval: n.interval, finger: n.finger ?? null,
                    fingeringWarning: n.fingeringWarning === true });
            }
            const reasons = [], add = r => { if (!reasons.includes(r)) reasons.push(r); };
            const omissionConfirmed = raw.hasOutOfRangeNotes === false && raw.omittedNoteCount === 0 &&
                Array.isArray(raw.outOfRangeNotes) && raw.outOfRangeNotes.length === 0;
            if (!omissionConfirmed) add(raw.hasOutOfRangeNotes === true || raw.omittedNoteCount > 0 ? 'owner-partial-form' : 'owner-completeness-unconfirmed');
            const unknownStrings = [1, 2, 3, 4, 5, 6].filter(s => !seen.has(s) && !raw.mutedStrings.includes(s));
            if (unknownStrings.length) add('string-states-unconfirmed');
            const required = unique(definition.intervals.map(i => pc(soundingRoot + i)).concat(soundingBass));
            const permitted = new Set(required);
            const fullPcs = new Set(notes.map(n => n.pitchClass));
            if (required.some(p => !fullPcs.has(p))) add('missing-required-tones');
            if (['6', 'm6'].includes(quality) && !fullPcs.has(pc(soundingRoot + 9))) add('sixth-overlay-unresolved');
            if (notes.some(n => !permitted.has(n.pitchClass))) add('unintended-tones');
            if (pc(Math.min(...notes.map(n => n.soundingMidi))) !== soundingBass) add(parsed.bass ? 'slash-bass-unresolved' : 'root-bass-unresolved');
            const complete = reasons.length === 0;
            const performanceReasons = reasons.slice();
            if (!request.playedStrings) performanceReasons.push('played-strings-unconfirmed');
            else {
                const played = notes.filter(n => request.playedStrings.includes(n.string));
                if (played.length !== request.playedStrings.length) performanceReasons.push('played-string-not-in-form');
                const playedPcs = new Set(played.map(n => n.pitchClass));
                if (required.some(p => !playedPcs.has(p))) performanceReasons.push('played-tones-incomplete');
                if (played.length && pc(Math.min(...played.map(n => n.soundingMidi))) !== soundingBass) performanceReasons.push('played-bass-mismatch');
            }
            // Missing fingering alone does not prevent a string/fret TAB. Explicit owner
            // warnings/limited playability do require a later player confirmation contract.
            if (!['standard', 'advanced'].includes(raw.playability) || notes.some(n => n.fingeringWarning) || raw.warning) performanceReasons.push('playability-unconfirmed');
            let barres = null;
            if (typeof caged.detectBarres === 'function') {
                const detected = copyData(caged.detectBarres(copyData(raw.notes)));
                if (!Array.isArray(detected) || detected.some(b => !integer(b.fret, 1, maxAbsoluteFret - capo) ||
                    !integer(b.fromString, 1, 6) || !integer(b.toString, 1, 6) || ![1, 2, 3, 4, 'T'].includes(b.finger))) return unresolved('invalid-owner-barres');
                barres = detected.map(b => ({ ...b, relativeFret: b.fret, absoluteFret: capo + b.fret }));
            }
            return freeze({ request, provenance, display: { possible: true, reasons: [] },
                form: { shape: raw.shape, notes, mutedStrings: raw.mutedStrings, unknownStrings, barres,
                    rootRelativeFret: raw.rootFret ?? null, playability: raw.playability ?? null,
                    fingeringStatus: raw.fingeringStatus ?? null, ownerWarning: raw.warning ?? null,
                    omittedNoteCount: raw.omittedNoteCount ?? null },
                completeness: { complete, requiredPitchClasses: required, reasons },
                performance: { voicingUsable: performanceReasons.length === 0, scope: 'voicing-only',
                    reasons: unique(performanceReasons) } });
        } catch { return unresolved('owner-or-input-data-error'); }
    }
    return Object.freeze({ resolve });
}
