// Adapt saved coordinates to the original Chord Cruise renderer. No SVG or
// finger/role design is reimplemented here; no form is adopted by displaying it.
export function drawChordForm(fretboard, container, snapshot, chord, explore) {
    container.replaceChildren();
    if (!snapshot) { container.textContent = 'フォーム候補がありません'; return () => {}; }
    const notes = snapshot.strings.filter(n => n.kind === 'note');
    const pressed = notes.filter(n => n.relativeFret > 0).map(n => n.relativeFret);
    const start = pressed.length ? Math.min(...pressed) : 1;
    const end = Math.max(start + 3, ...pressed);
    const frets = [];
    if (start === 1 || notes.some(n => n.relativeFret === 0)) frets.push(0);
    for (let fret = start; fret <= end; fret++) frets.push(fret);
    const options = {
        frets,
        markers: notes.map(n => {
            const midi = snapshot.tuningMidi[n.string - 1] + snapshot.capo + n.relativeFret;
            const interval = ((midi - chord.rootPc) % 12 + 12) % 12;
            return {string:n.string, fret:n.relativeFret,
                label:explore.readFingerLabel(n.finger) || (n.fingeringWarning ? '⚠' : ''),
                role:explore.readMarkerRole(chord, interval), fingeringWarning:!!n.fingeringWarning};
        }),
        mutedStrings: snapshot.strings.filter(n => n.kind === 'muted').map(n => n.string),
        barres: snapshot.barres.map(b => ({...b, fret:b.relativeFret})),
        markerLabelSize:'medium'
    };
    const board = container.ownerDocument.createElement('div');
    board.className = 'score-chord-diagram-board';
    container.append(board);
    fretboard.render(board, options);
    board.style.width = fretboard.createModel(options).width + 'px';
    board.style.transformOrigin = '0 0';
    function fit() {
        const scale = Math.min(1, container.clientWidth / parseFloat(board.style.width));
        board.style.transform = 'scale(' + scale + ')';
        container.style.height = board.offsetHeight * scale + 'px';
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
}
