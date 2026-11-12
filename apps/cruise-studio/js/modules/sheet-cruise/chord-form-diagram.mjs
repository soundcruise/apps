// Read-only geometry. The caller supplies either an immutable saved snapshot or
// an owner-adapter preview. This renderer never infers pitches or adopts a form.
export function drawChordForm(document, container, snapshot, label) {
    container.replaceChildren();
    if (!snapshot) { container.textContent = 'このコードのフォーム候補はありません'; return; }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 224 190');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label + '。6弦が左、1弦が右。カポ相対フレット。');
    function draw(tag, attributes, text) {
        const n = document.createElementNS(svg.namespaceURI, tag);
        for (const [key, value] of Object.entries(attributes)) n.setAttribute(key, String(value));
        if (text !== undefined) n.textContent = text;
        svg.append(n);
    }
    const frets = snapshot.strings.filter(n => n.kind === 'note' && n.relativeFret > 0).map(n => n.relativeFret);
    const start = frets.length ? Math.max(1, Math.min(...frets)) : 1;
    const count = Math.max(4, ...frets.map(f => f - start + 1));
    const x = string => 32 + (6 - string) * 32, y = fret => 36 + (fret - start + .5) * 128 / count;
    for (let string = 1; string <= 6; string++) draw('line', {x1:x(string), x2:x(string), y1:36, y2:164, stroke:'currentColor'});
    for (let fret = 0; fret <= count; fret++) draw('line', {x1:32, x2:192, y1:36+fret*128/count, y2:36+fret*128/count, stroke:'currentColor', 'stroke-width':fret===0 && start===1 ? 3 : 1});
    draw('text', {x:8, y:52, 'font-size':13}, start);
    for (const b of snapshot.barres) draw('line', {x1:x(b.fromString), x2:x(b.toString), y1:y(b.relativeFret), y2:y(b.relativeFret), stroke:'currentColor', 'stroke-width':10, 'stroke-linecap':'round'});
    for (const n of snapshot.strings) {
        if (n.kind !== 'note' || n.relativeFret === 0) draw('text', {x:x(n.string), y:25, 'text-anchor':'middle', 'font-size':16}, n.kind==='muted' ? '×' : n.kind==='note' ? '○' : '?');
        else draw('circle', {cx:x(n.string), cy:y(n.relativeFret), r:6, fill:'currentColor'});
    }
    container.append(svg);
}
