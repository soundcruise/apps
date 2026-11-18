// The ONLY Studio-facing adapter. Viewer core imports no Studio modules/globals.
import {createScoreCodec} from '../../../../score-viewer/core/file-format.mjs';
import {createReadOnlyScore} from '../../../../score-viewer/core/read-only-score.mjs';
import {createBeatClock, createScoreTimeline} from '../../../../score-viewer/core/beat-clock.mjs';
import {insist, canonicalJSON, freeze, clone} from '../../../../score-viewer/core/json.mjs';
import {normalizeLayout, normalizeLineRules, DEFAULT_LAYOUT} from './paper-layout.mjs';
import {buildSongPreviewPlan, buildSongTickPlan} from './score-playback.mjs';

export function normalizeViewerPresentation(input, score) {
    insist(input && typeof input === 'object' && !Array.isArray(input), 'invalid-viewer-presentation');
    insist(input.version === undefined || input.version === 1, 'unsupported-presentation-version');
    const layout = normalizeLayout(input.layout), warnings = [];
    if (Object.keys(input).some(key => !['version','layout','rows','zoom','flow'].includes(key)) ||
        input.layout !== undefined && (!input.layout || typeof input.layout !== 'object' || Array.isArray(input.layout))) warnings.push('presentation-normalized');
    if (input.layout && Object.entries(input.layout).some(([key, value]) =>
        !Object.hasOwn(DEFAULT_LAYOUT, key) || canonicalJSON(value) !== canonicalJSON(layout[key]))) warnings.push('presentation-normalized');
    insist(input.rows === undefined || Array.isArray(input.rows) && input.rows.length <= 2048, 'invalid-presentation-rows');
    const rows = normalizeLineRules(input.rows || []);
    insist(rows.length === (input.rows || []).length, 'invalid-presentation-rows');
    const anchors = new Set([...score.bars.map(b => b.id), ...(score.extensions?.scoreLayoutV1?.holes || []).map(h => h.id)]);
    insist(rows.every(r => anchors.has(r.barId)), 'missing-presentation-anchor');
    const zoom = input.zoom === undefined ? 1 : input.zoom;
    insist(Number.isFinite(zoom) && zoom >= .5 && zoom <= 3, 'invalid-viewer-zoom');
    insist(input.flow === undefined || ['responsive','source','horizontal'].includes(input.flow), 'invalid-viewer-flow');
    return {value:{version:1, layout, rows, zoom, flow:input.flow || 'responsive'}, warnings:[...new Set(warnings)]};
}

export function createStudioViewerContract({schema, crypto = globalThis.crypto}) {
    insist(typeof schema?.validate === 'function', 'missing-schema2-validator');
    const codec = createScoreCodec({validateScore:score => schema.validate(score), normalizePresentation:normalizeViewerPresentation, crypto});
    function timeline(score) { return createScoreTimeline(score); }
    function createClock(score, {now, bpm = score.songInfo.bpm}) {
        const t = timeline(score);
        return createBeatClock({now, bpm, barIds:t.bars.map(b => b.barId), ticksPerBeat:t.ticksPerBeat});
    }
    // Reference contract for Stage 2: exact existing acoustic projection at a
    // chosen tempo, with silent unsupported/unbound forms rather than invention.
    // This is NOT the live AudioNode scheduler or transport integration yet.
    function playbackPlan(score, {bpm = score.songInfo.bpm, chordsOnly = false, melodyOnly = false} = {}) {
        const result = schema.validate(score); insist(result.ok, 'invalid-score');
        insist(Number.isFinite(bpm) && bpm >= 20 && bpm <= 400, 'invalid-practice-bpm');
        const copy = clone(score); copy.songInfo.bpm = bpm;
        const native = copy.materials.rhythms.some(m => m.encoding === 'rhythm-owner-cells-v1') ? schema.readStructureProjection(copy) : null;
        return freeze(buildSongPreviewPlan(copy, {pitchMidi:schema.pitchMidi,tieTarget:schema.melodyTieTarget, chordsOnly, melodyOnly,
             parseChord:() => null, notePc:() => null, qualities:{},
            rhythm(project, index) {
                const binding = project.performance.barRhythms.find(b => b.barId === project.bars[index].id);
                const m = project.materials.rhythms.find(m => m.id === (binding?.materialId || project.performance.basicRhythmId));
                if (m.encoding === 'studio-strum-v1') return {...m.snapshot, encoding:m.encoding};
                // Use the same canonical native-rhythm projection as the editor.
                return native.rhythmByBar[index].rhythm;
            }}));
    }
    function tickPlan(score,{melodyOnly=false}={}){
        const check=schema.validate(score);insist(check.ok,'invalid-score');
        const native=score.materials.rhythms.some(m=>m.encoding==='rhythm-owner-cells-v1')?schema.readStructureProjection(score):null;
        const materials=new Map(score.materials.rhythms.map(m=>[m.id,m])),bindings=new Map(score.performance.barRhythms.map(b=>[b.barId,b.materialId]));
        return freeze(buildSongTickPlan(score,{melodyOnly,pitchMidi:schema.pitchMidi,tieTarget:schema.melodyTieTarget,parseChord:()=>null,notePc:()=>null,qualities:{},
            rhythm(p,index){const m=materials.get(bindings.get(p.bars[index].id)||p.performance.basicRhythmId);return m.encoding==='studio-strum-v1'?{...m.snapshot,encoding:m.encoding}:native.rhythmByBar[index].rhythm;}}));
    }
    return Object.freeze({codec, normalizePresentation:normalizeViewerPresentation, timeline, createClock, playbackPlan,tickPlan,
        createReader({playbackState} = {}) { return createReadOnlyScore({codec, normalizePresentation:normalizeViewerPresentation, playbackState}); }});
}
