/* Immutable, bounded Structure projection. Owners supply pitch/parser/spelling; no persistence. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.commonMusic = factory();
})(globalThis, function () {
    'use strict';
    var LIMITS = Object.freeze({ bars: 2048, events: 32768, nodes: 100000, chars: 2 * 1024 * 1024, depth: 32 });
    function freeze(x) { if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.values(x).forEach(freeze); Object.freeze(x); } return x; }
    function diagnostic(code, severity, location, detail) { return { code: code, severity: severity, sourceLocation: location || null, detail: detail || null }; }
    function failure(code, detail) { return freeze({ ok: false, model: null, diagnostics: [diagnostic(code, 'fatal', null, detail)] }); }
    function budget(project) {
        if (!project || !Array.isArray(project.bars) || project.bars.length > LIMITS.bars) return false;
        var stack = [[project, 0]], seen = new Set(), nodes = 0, chars = 0, events = 0;
        while (stack.length) {
            var item = stack.pop(), x = item[0], depth = item[1];
            if (++nodes > LIMITS.nodes || depth > LIMITS.depth) return false;
            if (typeof x === 'string') { chars += x.length; if (chars > LIMITS.chars) return false; }
            if (x && typeof x === 'object') {
                if (seen.has(x)) return false; seen.add(x);
                if (Array.isArray(x) && x.length > LIMITS.events) return false;
                for (var key in x) if (Object.hasOwn(x, key)) {
                    chars += key.length;
                    if (chars > LIMITS.chars || stack.length + nodes >= LIMITS.nodes) return false;
                    stack.push([x[key], depth + 1]);
                }
            }
        }
        project.bars.forEach(function (b) { if (b) ['melody', 'chords'].forEach(function (k) { events += Array.isArray(b[k]) ? b[k].length : 0; }); });
        if(project.schemaVersion===2) { if(!project.materials || !Array.isArray(project.materials.rhythms))return false; return events<=LIMITS.events; }
        if (!Array.isArray(project.strumPatterns)) return false;
        var sizes = new Map();
        project.strumPatterns.forEach(function (p) { if (p) sizes.set(p.id, Array.isArray(p.slots) ? p.slots.length : 0); });
        project.bars.forEach(function (b) { if (b) events += sizes.get(b.strumOverride || project.basicStrumPatternId) || 0; });
        return events <= LIMITS.events;
    }
    function createConverter(options) {
        var theory = options.studioTheory, spelling = options.chordTheory, prepared = new WeakSet(), frozenTrees = new WeakSet();
        function frozenTree(value) {
            if (!value || typeof value !== 'object') return true;
            if (frozenTrees.has(value)) return true;
            if (!Object.isFrozen(value) || !Object.values(value).every(frozenTree)) return false;
            frozenTrees.add(value); return true;
        }
        // A conversion DTO is not a persistable Project. Validate the original before selecting data.
        function prepare(project) {
            if (project.schemaVersion !== 2) return project;
            if (prepared.has(project)) return project;
            if (!options.schema2) throw Error('unsupported-schema');
            var legacy = options.schema2.readProjection(project, true);
            var value = freeze({ schemaVersion: 2, projectId: project.projectId,
                originalKey: project.songInfo.originalKey, tonic: { ...project.solfege.tonic },
                bars: frozenTree(project.bars) ? project.bars : JSON.parse(JSON.stringify(project.bars)), legacy: legacy });
            prepared.add(value); return value;
        }
        function convertV2(frame) {
            var api=options.schema2,p=frame.project;
            if(!api)return failure('unsupported-schema');
            try { p=prepare(p); } catch(e) { return failure('invalid-project',e.message); }
            // prepare() validates canonical input and owns/freezes this read projection.
            // The v1 converter accepts JSON data, not editor-only non-enumerable IDs.
            // Strip those metadata descriptors only in this private DTO; convert() still
            // applies the strict v1 validator. The public non-persistable projection stays intact.
            var projection={...p.legacy,bars:p.legacy.bars.map(function(bar){return {...bar};}),songInfo:{...p.legacy.songInfo,
                originalKey:p.tonic.step+spelling.formatAccidental(p.tonic.alter)}};
            var r=convert(Object.assign({},frame,{project:projection}));if(!r.ok)return r;
            // Copy only modified branches. Never JSON-expand the shared source graph.
            var out={...r,model:{...r.model,modelVersion:2,keyContext:{...r.model.keyContext,originalKey:p.originalKey},
                measures:r.model.measures.map(function(m){return {...m,voices:{...m.voices,melody:{...m.voices.melody,
                    events:m.voices.melody.events.map(function(e){return {...e,sourceLocation:{...e.sourceLocation},provenance:{...e.provenance}};})}},
                    harmony:m.harmony.map(function(e){return {...e};}),lyrics:m.lyrics.map(function(e){return {...e};})};})}};
            out.model.measures.forEach(function(m,bi){
                var b=p.bars[bi],notes=b.melody.filter(function(e){return e.kind==='note';});m.id=b.id;m.sourceBarId=b.id;
                m.voices.melody.events.forEach(function(e,i){var src=notes[i];e.sourceEventId=src.id;e.sourceLocation.barId=b.id;e.sourceLocation.eventId=src.id;
                    e.pitch=Object.assign({},src.pitch,{midi:api.pitchMidi(src.pitch),semitoneNumber:api.pitchMidi(src.pitch),name:src.pitch.step+spelling.formatAccidental(src.pitch.alter)});e.provenance.timing=src.provenance.timing;});
                b.melody.filter(function(e){return e.kind==='rest';}).forEach(function(e){m.voices.melody.events.push({kind:'rest',onsetTick:e.onsetTick,durationTicks:e.durationTicks,sourceEventId:e.id,sourceLocation:{barIndex:bi,eventType:'rest',eventIndex:null,barId:b.id,eventId:e.id},provenance:e.provenance});});
                var cursor=0,empty=[];m.voices.melody.events.slice().sort(function(a,b){return a.onsetTick-b.onsetTick;}).forEach(function(e){if(e.onsetTick>cursor)empty.push({kind:'silence',onsetTick:cursor,durationTicks:e.onsetTick-cursor,sourceBarId:b.id});cursor=e.onsetTick+e.durationTicks;});
                if(cursor<1920)empty.push({kind:'silence',onsetTick:cursor,durationTicks:1920-cursor,sourceBarId:b.id});m.voices.melody.silentIntervals=empty;
                m.harmony.forEach(function(e,i){e.sourceEventId=b.chords[i].id;e.actualSymbol=b.chords[i].symbol;});
                m.lyrics.forEach(function(e,i){e.sourceEventId=b.lyrics[i].id;});
            });
            return freeze(out);
        }
        function convert(frame) {
            if (!frame || frame.source !== 'working' || !frame.project || typeof frame.sessionId !== 'string' || !frame.sessionId || typeof frame.version !== 'string' || !frame.version ||
                typeof frame.project.projectId !== 'string' || !frame.token || frame.token.sessionId !== frame.sessionId || frame.token.projectId !== frame.project.projectId ||
                !Number.isSafeInteger(frame.token.generation) || frame.token.generation < 0 || !(frame.baseRevision === null || typeof frame.baseRevision === 'string')) return failure('invalid-source');
            if (!(frame.workspaceId == null || typeof frame.workspaceId === 'string') || !(frame.workspaceGeneration == null || Number.isSafeInteger(frame.workspaceGeneration))) return failure('invalid-source');
            var p = frame.project;
            if(p.schemaVersion===2)return convertV2(frame);
            if (!budget(p) || (frame.baseRevision && frame.baseRevision.length > LIMITS.chars * 2)) return failure('memory-budget');
            if (p.schemaVersion !== 1) return failure('unsupported-schema');
            var info = p.songInfo;
            if (!info || info.timeSignature?.beats !== 4 || info.timeSignature?.beatUnit !== 4) return failure('unsupported-time-signature');
            if (info.ticksPerBeat !== 480) return failure('unsupported-ppq');
            var validation;
            try { validation = options.validate(p); } catch (_) { return failure('invalid-project'); }
            if (!validation || typeof validation.ok !== 'boolean') return failure('invalid-project');
            if (!p.bars.every(function (b) { return b && typeof b.sectionId === 'string' && Number.isSafeInteger(b.barNumber) && Array.isArray(b.melody) && Array.isArray(b.chords); })) return failure('invalid-project');
            if (!Number.isSafeInteger(info.capo) || !theory.isKeyRelationConsistent(info.playKey, info.capo, info.originalKey)) return failure('inconsistent-key');
            var source = { projectId: p.projectId, sessionId: frame.sessionId, snapshotVersion: frame.version,
                generation: frame.token.generation, workspaceId: frame.workspaceId ?? null, workspaceGeneration: frame.workspaceGeneration ?? null };
            var ds = [], measures = [], patternMap = new Map(), hasFatal = false;
            function issue(code, severity, loc, detail) {
                if (severity === 'fatal') hasFatal = true;
                if (ds.length < 256) ds.push(diagnostic(code, severity, loc, detail));
                else if (severity === 'fatal' && !ds.some(function (d) { return d.severity === 'fatal'; })) ds[255] = diagnostic(code, severity, loc, detail);
            }
            if (!validation.ok) issue('invalid-project', 'fatal', null, validation.errors);
            function location(bar, type, index, patternIndex) { return { snapshot: source, barIndex: bar, eventType: type, eventIndex: index,
                ...(patternIndex === undefined ? {} : { patternIndex: patternIndex }) }; }
            function provenance(loc, kind) { return { sourceOwner: 'cruise-studio', sourceLocation: loc,
                derivationKind: kind || 'legacy-data', confirmationState: 'legacy-unknown' }; }
            function timing(ev, loc, optional) {
                if (!Number.isSafeInteger(ev?.tick) || ev.tick < 0 || ev.tick >= 1920) { issue('invalid-onset', 'fatal', loc); return false; }
                if (optional && ev.durationTicks === undefined) return true;
                if (!Number.isSafeInteger(ev.durationTicks) || ev.durationTicks <= 0) { issue('invalid-duration', 'fatal', loc); return false; }
                if (ev.tick + ev.durationTicks > 1920) { issue('out-of-range', 'fatal', loc, 'measure-boundary'); return false; }
                return true;
            }
            function scale(key) { return spelling.spellScaleNotes({ tonicPc: theory.keyToSemitone(key), tonicName: key, scaleId: 'major' }); }
            var formScale, soundScale;
            try { formScale = scale(info.playKey); soundScale = scale(info.originalKey); } catch (_) { return failure('invalid-key-spelling'); }
            // MIDI arithmetic stays in Studio; Chord owns letter/accidental spelling.
            function pitch(ev, number, scaleNotes) {
                var note = scaleNotes[ev.step];
                if (!Number.isSafeInteger(number) || !note) return null;
                var alter = note.accidental + ev.alter;
                var natural = spelling.parseSpelledNoteName(note.letter).pc;
                var octave = (number - natural - alter) / 12 - 1;
                if (!Number.isInteger(octave)) return null;
                return { step: note.letter, alter: alter, octave: octave, name: note.letter + spelling.formatAccidental(alter),
                    semitoneNumber: number, midi: number >= 0 && number <= 127 ? number : null };
            }
            (p.strumPatterns || []).forEach(function (pat, i) {
                if (!pat || typeof pat.id !== 'string') { issue('stroke-inconsistency', 'fatal', null); return; }
                if (patternMap.has(pat.id)) issue('stroke-inconsistency', 'fatal', null, 'duplicate-pattern-id');
                patternMap.set(pat.id, { value: pat, index: i });
            });
            p.bars.forEach(function (bar, bi) {
                var melody = [], harmony = [], strokes = [], silence = [], start = bi * 1920;
                var measure = { index: bi, barNumber: bar.barNumber, sectionId: bar.sectionId, startTick: start, lengthTicks: 1920,
                    meter: { beats: 4, beatUnit: 4 }, harmony: harmony, lyrics: [],
                    voices: { melody: { events: melody, silentIntervals: silence }, guitar: { events: strokes,
                        form: null, stringFret: null, struckStrings: null, fingering: null, voicing: null } } };
                measures.push(measure);
                (Array.isArray(bar.lyrics) ? bar.lyrics : []).forEach(function (ev, ei) {
                    var loc = location(bi, 'lyrics', ei);
                    if (!Number.isSafeInteger(ev?.tick) || ev.tick < 0 || ev.tick >= 1920 || typeof ev.text !== 'string') {
                        issue('invalid-lyrics', 'fatal', loc); return;
                    }
                    measure.lyrics.push({ onsetTick: ev.tick, text: ev.text, sourceLocation: loc, provenance: provenance(loc) });
                });
                bar.melody.forEach(function (ev, ei) {
                    var loc = location(bi, 'melody', ei); if (!timing(ev, loc, false)) return;
                    if (!Number.isSafeInteger(ev.step) || ev.step < 0 || ev.step > 6 || !Number.isSafeInteger(ev.alter)) { issue('invalid-melody-pitch', 'fatal', loc); return; }
                    if (!Number.isSafeInteger(ev.octave)) { issue('unresolved-octave', 'fatal', loc); return; }
                    // Use the existing pitch convention's actual capo-adjusted MIDI, including octave carry.
                    var midi = theory.melodyEventToMidiNote(ev, info.playKey, info.capo);
                    var form = midi === null ? null : pitch(ev, midi - info.capo, formScale);
                    var sound = pitch(ev, midi, soundScale);
                    if (!form || !sound || midi === null || !Number.isInteger(sound.octave)) { issue('invalid-melody-pitch', 'fatal', loc, 'MIDI range'); return; }
                    melody.push({ id: JSON.stringify([frame.sessionId, frame.version, frame.token.generation, bi, 'melody', ei]), kind: 'note',
                        onsetTick: ev.tick, absoluteTick: start + ev.tick, durationTicks: ev.durationTicks, solfege: { step: ev.step, alter: ev.alter, octave: ev.octave },
                        formPitch: form, pitch: sound, sourceLocation: loc,
                        provenance: { pitch: provenance(loc, 'existing-convention'), timing: provenance(loc), spelling: provenance(loc, 'existing-convention') } });
                });
                var ordered = melody.slice().sort(function (a, b) { return a.onsetTick - b.onsetTick; }), cursor = 0;
                ordered.forEach(function (ev) { if (ev.onsetTick < cursor) issue('overlap', 'fatal', ev.sourceLocation, 'melody');
                    if (ev.onsetTick > cursor) silence.push({ onsetTick: cursor, durationTicks: ev.onsetTick - cursor, kind: 'silence', provenance: provenance(location(bi, 'melody-gap', null), 'existing-convention') });
                    cursor = Math.max(cursor, ev.onsetTick + ev.durationTicks); });
                if (cursor < 1920) silence.push({ onsetTick: cursor, durationTicks: 1920 - cursor, kind: 'silence', provenance: provenance(location(bi, 'melody-gap', null), 'existing-convention') });
                bar.chords.forEach(function (ev, ei) {
                    var loc = location(bi, 'chord', ei); if (!timing(ev, loc, true)) return;
                    if (typeof ev.symbol !== 'string') { issue('unsupported-chord', 'fatal', loc, 'symbol must be string'); return; }
                    var parsed = theory.parseBasicChordSymbol(ev.symbol);
                    var known = parsed && (['', 'maj7', 'add9'].includes(parsed.quality) || Object.values(spelling.QUALITIES).some(function (q) { return q.symbolSuffix === parsed.quality; }));
                    if (!known) issue('unsupported-chord', 'warning', loc, ev.symbol);
                    if (ev.durationTicks === undefined) issue('unresolved-chord-duration', 'unresolved', loc);
                    harmony.push({ symbol: ev.symbol, root: parsed?.root ?? null, quality: parsed?.quality ?? null, bass: parsed?.bass ?? null,
                        supported: !!known, onsetTick: ev.tick, durationTicks: ev.durationTicks ?? null, sourceLocation: loc, provenance: provenance(loc) });
                });
                var harmonyEnd = 0;
                harmony.slice().sort(function (a, b) { return a.onsetTick - b.onsetTick; }).forEach(function (h) {
                    if (h.durationTicks === null) return;
                    if (h.onsetTick < harmonyEnd) issue('overlap', 'fatal', h.sourceLocation, 'harmony');
                    harmonyEnd = Math.max(harmonyEnd, h.onsetTick + h.durationTicks);
                });
                var selected = patternMap.get(bar.strumOverride || p.basicStrumPatternId);
                var pat = selected?.value;
                if (!pat || pat.lengthTicks !== 1920 || !Array.isArray(pat.slots)) { issue('stroke-inconsistency', 'fatal', location(bi, 'stroke', null), 'pattern-length/reference'); return; }
                var previous = -1;
                pat.slots.forEach(function (slot, si) {
                    var loc = location(bi, 'stroke', si, selected.index);
                    if (!timing(slot, loc, true)) return;
                    if (!['down', 'up', 'mute', 'rest'].includes(slot.action) || slot.tick <= previous || (slot.accent !== undefined && typeof slot.accent !== 'boolean') ||
                        (slot.tieToNext !== undefined && typeof slot.tieToNext !== 'boolean')) { issue('stroke-inconsistency', 'fatal', loc); return; }
                    previous = slot.tick;
                    var explicit = slot.durationTicks !== undefined;
                    var duration = explicit ? slot.durationTicks : ((pat.slots[si + 1]?.tick ?? 1920) - slot.tick);
                    if (!Number.isSafeInteger(duration) || duration <= 0 || slot.tick + duration > 1920) { issue('stroke-inconsistency', 'fatal', loc, 'duration'); return; }
                    if (slot.tieToNext !== undefined) issue('unresolved-continuation', 'unresolved', loc);
                    strokes.push({ onsetTick: slot.tick, absoluteTick: start + slot.tick, durationTicks: duration,
                        grid: { tick: slot.tick, quarterPosition: { numerator: slot.tick, denominator: 480 }, resolution: null,
                            eighthAligned: slot.tick % 240 === 0, sixteenthAligned: slot.tick % 120 === 0 },
                        action: slot.action, direction: slot.action === 'down' || slot.action === 'up' ? slot.action : null,
                        hit: slot.action !== 'rest', rest: slot.action === 'rest', accent: slot.accent ?? null,
                        continuation: slot.tieToNext ?? null, form: null, stringFret: null, struckStrings: null,
                        sourceLocation: loc, provenance: { onset: provenance(loc), duration: provenance(loc, explicit ? 'legacy-data' : 'existing-convention'), direction: provenance(loc) } });
                });
                if (strokes.some(function (s) { return s.hit; })) {
                    issue('unresolved-voicing', 'unresolved', location(bi, 'guitar', null));
                    issue('unresolved-string-fret', 'unresolved', location(bi, 'guitar', null));
                }
            });
            return freeze({ ok: !hasFatal, model: { modelVersion: 1, source: source, ppq: 480, meter: { beats: 4, beatUnit: 4 },
                keyContext: { originalKey: info.originalKey, playKey: info.playKey, capo: info.capo, scale: 'legacy-major-solfege',
                    provenance: provenance(location(null, 'songInfo', null), 'existing-convention') }, measures: measures,
                completePerformance: false, diagnostics: ds }, diagnostics: ds });
        }
        return Object.freeze({ convert: convert, prepare: prepare, supportedSchemas: Object.freeze(options.schema2?[1,2]:[1]) });
    }
    return Object.freeze({ createConverter: createConverter, budget: budget, limits: LIMITS, failure: failure });
});
