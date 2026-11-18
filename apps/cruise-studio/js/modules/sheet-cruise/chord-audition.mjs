// Read-only acoustic projection. String identity is ephemeral, never Project data.
export function chordVoicing(project, chord, deps, explicitForm) {
    if (!chord || chord.unresolved) throw Error('コードを確認してください');
    const bindings = (project.performance?.formBindings || []).filter(b => chord.id && b.chordEventId === chord.id);
    if (bindings.length > 1) throw Error('フォームの登録が重複しています');
    const binding = bindings[0];
    const material = binding && project.materials.forms.find(m => m.id === binding.materialId);
    if (!explicitForm && binding && !material?.snapshot) throw Error('登録フォームを読み込めません');
    const form = explicitForm || material?.snapshot;
    if (form) {
        if (!Array.isArray(form.tuningMidi) || form.tuningMidi.length !== 6 ||
            !form.tuningMidi.every(Number.isInteger) || !Number.isInteger(form.capo) || form.capo < 0 || form.capo > 11 ||
            !Array.isArray(form.strings) || form.strings.length !== 6 || new Set(form.strings.map(n => n.string)).size !== 6 ||
            form.strings.some(n => !Number.isInteger(n.string) || n.string < 1 || n.string > 6 ||
                !['note', 'muted'].includes(n.kind) || n.kind === 'note' && (!Number.isInteger(n.relativeFret) || n.relativeFret < 0 || n.relativeFret + form.capo > 36)))
            throw Error('フォームの楽器条件を確認してください');
        const played = !explicitForm && binding ? binding.playedStrings : null;
        if (!explicitForm && binding && !Array.isArray(played)) throw Error('フォームの使用弦を確認してください');
        if (played && (!played.length || new Set(played).size !== played.length || played.some(i => !form.strings.some(n => n.string === i && n.kind === 'note'))))
            throw Error('フォームの使用弦を確認してください');
        const notes = form.strings.filter(n => n.kind === 'note' && (!played || played.includes(n.string)))
            .map(n => ({string: n.string, midi: form.tuningMidi[n.string - 1] + form.capo + n.relativeFret}));
        if (!notes.length || notes.some(n => n.midi < 21 || n.midi > 108)) throw Error('フォームの音域を確認してください');
        return {notes: notes.sort((a, b) => b.string - a.string), fallback: false};
    }
    const parsed = deps.parseChord(chord.symbol), quality = parsed && Object.keys(deps.qualities)
        .find(k => k === parsed.quality || deps.qualities[k].symbolSuffix === parsed.quality);
    if (!quality) throw Error('このコードの試聴用フォームを確認してください');
    const root = deps.notePc(parsed.root), bass = deps.notePc(parsed.bass || parsed.root);
    if (!Number.isInteger(root) || !Number.isInteger(bass)) throw Error('コードの音名を確認してください');
    const low = 40 + (bass - 4 + 12) % 12;
    const midi = [...new Set([low, ...deps.qualities[quality].intervals.map(i => {
        let n = 48 + root + i; while (n < low) n += 12; return n;
    })])].sort((a, b) => a - b);
    // No invented physical string for a theoretical fallback.
    return {notes: midi.map(midi => ({string: null, midi})), fallback: true};
}
export function chordNotes(project, chord, deps, form) {
    return chordVoicing(project, chord, deps, form).notes.map(n => n.midi).sort((a, b) => a - b);
}
export function strumVoices(voicing, {start, duration, tick, id, direction = 'down', accent = false, attackWindow = .25}) {
    const up = direction === 'up', notes = voicing.notes.slice();
    if (up) notes.reverse();
    // Pick accelerates through the strings; skipped/muted strings still take travel time.
    const travel = up ? [0, .007, .016, .027, .040, .055] : [0, .014, .026, .036, .044, .051];
    const position = (n, i) => n.string === null ? i * 5 / Math.max(1, notes.length - 1) : up ? n.string - 1 : 6 - n.string;
    const travelAt = p => travel[Math.floor(p)] + (travel[Math.ceil(p)] - travel[Math.floor(p)]) * (p % 1);
    const first = position(notes[0], 0), last = position(notes.at(-1), notes.length - 1);
    const span = travelAt(last) - travelAt(first) || .001, scale = Math.min(1, attackWindow * .28 / span, duration * .3 / span);
    return notes.map((n, i) => {
        const offset = (travelAt(position(n, i)) - travelAt(first)) * scale;
        const strength = n.string === null ? 1 : up ? 1.08 - (n.string - 1) * .065 : .88 + (n.string - 1) * .033;
        return {part: 'guitar', midi: n.midi, string: n.string, attackStart: start, start: start + offset, duration: duration - offset,
            release: .045, gain: .075 * strength * (up ? .9 : 1) * (accent ? 1.2 : 1), tick, stroke: direction, sourceEventId: id};
    });
}
export function singleChordPlan(project, chord, deps, form) {
    const voicing = chordVoicing(project, chord, deps, form);
    return {events: strumVoices(voicing, {start: .03, duration: 1.6, tick: 0, id: chord.id}),
        warnings: voicing.fallback ? ['登録フォームなし：コード名からの参考和音です'] : []};
}
