// Fret numbers are relative to the capo. Open and muted strings have a separate gutter.
export function rangeForForm(snapshot, requested = snapshot.displayRange) {
    const notes = snapshot.strings.filter(note => note.kind === 'note');
    const pressed = [...notes, ...snapshot.barres].map(note => note.relativeFret).filter(fret => fret > 0);
    const limit = (snapshot.maxAbsoluteFret ?? 36) - (snapshot.capo ?? 0);
    const first = pressed.length ? Math.min(...pressed) : null;
    const last = pressed.length ? Math.max(...pressed) : null;
    const includesOpen = notes.some(note => note.relativeFret === 0);
    if (requested) {
        const min = Math.max(1, Math.min(requested.min, first ?? limit, limit));
        const max = Math.min(limit, Math.max(requested.max, last ?? min, min));
        return {min, max, includesOpen};
    }
    const span = (last ?? 1) - (first ?? 1) + 1;
    const width = Math.min(limit, Math.max(3, span));
    const centeredStart = (first ?? 1) - Math.ceil((width - span) / 2);
    const min = Math.max(1, Math.min(centeredStart, limit - width + 1));
    return {min, max:min + width - 1, includesOpen};
}

export function diagramFrets(snapshot, includeGutter = false) {
    const range = rangeForForm(snapshot);
    const frets = includeGutter || range.includesOpen || snapshot.strings.some(note => note.kind === 'muted') ? [0] : [];
    for (let fret = range.min; fret <= range.max; fret++) frets.push(fret);
    return frets;
}
