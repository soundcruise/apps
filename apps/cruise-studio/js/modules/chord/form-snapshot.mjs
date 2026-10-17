// Self-contained adopted data. No storage, UI, owner recommendation or implicit mutation.
const clone = x => JSON.parse(JSON.stringify(x));
const pc = n => (n % 12 + 12) % 12;
export function freezeData(x) { if (x && typeof x === 'object') { Object.values(x).forEach(freezeData); Object.freeze(x); } return x; }
export function materialFromResult(result) {
    if (!result?.display.possible || !result.performance.voicingUsable || result.provenance.adapterVersion !== '2' ||
        result.form.unknownStrings.length || !Array.isArray(result.form.barres)) throw Error('unusable-form');
    const q = result.request, f = result.form, v = result.provenance;
    return {
        encoding: 'studio-chord-form-v1',
        snapshot: { capo: q.capo, tuningMidi: q.tuningMidi.slice(), maxAbsoluteFret: q.maxAbsoluteFret,
            strings: [1, 2, 3, 4, 5, 6].map(string => {
                const n = f.notes.find(n => n.string === string);
                if (n) return { string, kind: 'note', relativeFret: n.relativeFret, finger: n.finger, fingeringWarning: n.fingeringWarning };
                if (!f.mutedStrings.includes(string)) throw Error('unknown-string');
                return { string, kind: 'muted' };
            }),
            barres: f.barres.map(b => ({ finger: b.finger, relativeFret: b.relativeFret, fromString: b.fromString, toString: b.toString })),
            playability: f.playability, ownerWarning: f.ownerWarning },
        provenance: { origin: 'owner-recommendation', ownerApp: v.ownerApp, ownerVersion: v.ownerVersion, adapterVersion: v.adapterVersion,
            sourceSymbol: q.soundingSymbol, shape: f.shape, recommendationSource: v.recommendation.source,
            generation: clone(v.generation), externalMaterialId: null }
    };
}
// Derived only. Schema validation must precede these readers; no content key is persisted.
export function contentKey(material) {
    const s = material.snapshot, v = material.provenance;
    return JSON.stringify([material.encoding, s.capo, s.tuningMidi, s.maxAbsoluteFret,
        s.strings.map(n => n.kind === 'muted' ? [n.string, n.kind] : [n.string, n.kind, n.relativeFret, n.finger, n.fingeringWarning]),
        s.barres.map(b => [b.finger, b.relativeFret, b.fromString, b.toString]), s.playability, s.ownerWarning,
        v.origin, v.ownerApp, v.ownerVersion, v.adapterVersion, v.sourceSymbol, v.shape, v.recommendationSource,
        [v.generation.minRelativeFret, v.generation.maxRelativeFret], v.externalMaterialId]);
}
export function basisKey(project, event, material, playedStrings) {
    return JSON.stringify([project.projectId, event.id, event.symbol, event.unresolved, project.instrument.capo,
        project.instrument.tuning, project.instrument.maxAbsoluteFret ?? null, contentKey(material), playedStrings.slice().sort((a,b) => a-b)]);
}
export function evaluateBinding(project, binding, { schema, chordTheory, parseChordSymbol }) {
    const invalid = reason => freezeData({ ready: false, scope: 'voicing-only', reasons: [reason], soundingMidi: [] });
    try { schema.assertJson(binding); } catch { return invalid('invalid-binding'); }
    const check = schema.validate(project);
    if (!check.ok) return invalid('invalid-project');
    // Do not accept an arbitrary UI binding unrelated to the validated Project.
    const b = project.performance.formBindings.find(x => x.id === binding?.id);
    if (!b) return invalid('missing-binding');
    const event = project.bars.flatMap(b => b.chords).find(e => e.id === b.chordEventId);
    const material = project.materials.forms.find(m => m.id === b.materialId), s = material.snapshot;
    if (event.unresolved) return invalid('unresolved-chord');
    const reasons = [], add = x => { if (!reasons.includes(x)) reasons.push(x); };
    // Snapshot pitches always use the adopted capo/tuning, never current Project settings.
    const notes = s.strings.filter(n => n.kind === 'note').map(n => ({ ...n, midi: s.tuningMidi[n.string-1] + s.capo + n.relativeFret }));
    const played = notes.filter(n => b.playedStrings.includes(n.string));
    let parsed, root, bass, definition;
    try {
        parsed = parseChordSymbol(event.symbol);
        root = chordTheory.parseSpelledNoteName(parsed.root).pc;
        bass = parsed.bass ? chordTheory.parseSpelledNoteName(parsed.bass).pc : root;
        const q = ['maj','m','7','maj7','m7','6','m6','sus4'].find(k => k === parsed.quality || chordTheory.QUALITIES[k]?.symbolSuffix === parsed.quality);
        definition = chordTheory.QUALITIES[q];
        if (!definition) return invalid('unsupported-quality');
    } catch { return invalid('unsupported-symbol'); }
    const required = [...new Set(definition.intervals.map(i => pc(root+i)).concat(bass))];
    const fullPcs = new Set(notes.map(n => pc(n.midi))), playedPcs = new Set(played.map(n => pc(n.midi)));
    if (required.some(n => !fullPcs.has(n))) add('missing-required-tones');
    if (notes.some(n => !required.includes(pc(n.midi)))) add('unintended-tones');
    if (required.some(n => !playedPcs.has(n))) add('played-tones-incomplete');
    if (pc(Math.min(...played.map(n => n.midi))) !== bass) add('played-bass-mismatch');
    if (played.some(n => n.fingeringWarning) || s.ownerWarning || !['standard','advanced'].includes(s.playability)) add('playability-unconfirmed');
    if (project.instrument.capo !== s.capo || JSON.stringify(project.instrument.tuning) !== JSON.stringify(s.tuningMidi) || project.instrument.maxAbsoluteFret !== s.maxAbsoluteFret) add('instrument-changed');
    if (b.confirmation.status !== 'confirmed' || b.confirmation.basisKey !== basisKey(project,event,material,b.playedStrings)) add('confirmation-required');
    return freezeData({ ready: reasons.length === 0, scope: 'voicing-only', reasons, soundingMidi: played.map(n => n.midi).sort((a,b)=>a-b) });
}
