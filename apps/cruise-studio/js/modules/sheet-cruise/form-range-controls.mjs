import {rangeForForm} from './form-range.mjs';

export function addFormRangeControls(root, snapshot, fretWidth, save) {
    const doc = root.ownerDocument;
    const limit = snapshot.maxAbsoluteFret - snapshot.capo;
    if (limit < 1) return;
    const stage = root.querySelector('.cc-fb-stage');
    const first = Array.from(stage.querySelectorAll('.cc-fb-fret-number')).find(label => label.textContent === '1');
    if (!first) return;
    const origin = Number(first.getAttribute('x')) - fretWidth / 2;
    const group = doc.createElement('fieldset');
    group.className = 'score-form-range';
    group.innerHTML = '<legend>表示範囲</legend><label><input type="checkbox"> 自動</label><label>開始 <input type="number"></label><label>終了 <input type="number"></label><span>フレット</span>';
    root.append(group);
    const [auto, min, max] = group.querySelectorAll('input');
    const band = doc.createElement('div');
    band.className = 'score-range-band';
    stage.append(band);
    const saved = rangeForForm(snapshot);
    let current = saved;
    function show(range, automatic) {
        current = range;
        auto.checked = automatic;
        min.value = range.min;
        max.value = range.max;
        band.style.left = (origin + (range.min - 1) * fretWidth) + 'px';
        band.style.width = ((range.max - range.min + 1) * fretWidth) + 'px';
    }
    function change(edge, value) {
        const bound = edge === 'min' ? Math.min(value,current.max) : Math.max(value,current.min);
        return rangeForForm(snapshot,{...current,[edge]:bound});
    }
    function commit(range) {
        const manual = range && {min:range.min,max:range.max};
        if (!save(manual)) show(saved,!snapshot.displayRange);
    }
    auto.onchange = () => commit(auto.checked ? null : current);
    for (const [edge, input] of [['min',min],['max',max]]) {
        input.min = 1;
        input.max = limit;
        input.onchange = () => {
            if (!Number.isInteger(input.valueAsNumber)) return show(current,auto.checked);
            const range = change(edge,input.valueAsNumber);
            show(range,false);
            commit(range);
        };
        const grip = doc.createElement('span');
        grip.className = 'score-range-grip';
        grip.dataset.rangeEdge = edge;
        grip.title = (edge === 'min' ? '開始' : '終了') + 'フレットをドラッグ';
        band.append(grip);
        let drag;
        grip.onpointerdown = event => {
            if (event.button !== 0 || drag) return;
            event.preventDefault();
            event.stopPropagation();
            const rect = stage.getBoundingClientRect();
            drag = {id:event.pointerId, from:event.clientX - rect.left, value:current[edge], step:fretWidth * rect.width / stage.offsetWidth};
            grip.setPointerCapture(event.pointerId);
        };
        function move(event) {
            const distance = event.clientX - stage.getBoundingClientRect().left - drag.from;
            show(change(edge,drag.value + Math.round(distance / drag.step)),false);
        }
        grip.onpointermove = event => { if (drag?.id === event.pointerId) move(event); };
        grip.onpointerup = event => {
            if (drag?.id !== event.pointerId) return;
            move(event);
            drag = null;
            if (current.min !== saved.min || current.max !== saved.max) commit(current);
            else show(saved,!snapshot.displayRange);
        };
        grip.onlostpointercapture = grip.onpointercancel = () => {
            if (drag) show(saved,!snapshot.displayRange);
            drag = null;
        };
        grip.onclick = event => event.stopPropagation();
    }
    show(saved,!snapshot.displayRange);
}
