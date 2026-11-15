import {chordVoicing, strumVoices} from './chord-audition.mjs';
import {createHarmonyTimeline} from './score-harmony.mjs';

// Pure, read-only score -> audio projection. Times are seconds from one audio clock.
// A blank cell is not a rest: recorded strings ring until a physical interruption.
function barPlan(project, index, deps, harmony) {
    const bar = project.bars[index], seconds = 60 / project.songInfo.bpm / 480, total = 1920 * seconds;
    if (!bar || !Number.isFinite(total) || total <= 0 || total > 60) throw Error('BPMや小節を確認してください');
    const events = [], warnings = [], cuts = [];
    if (!deps.chordsOnly) bar.melody.forEach(e => {
        if (e.kind !== 'note') return;
        const midi = deps.pitchMidi(e.pitch);
        if (!Number.isInteger(midi) || midi < 21 || midi > 108) { warnings.push('音域外のメロディは鳴らせません'); return; }
        events.push({part: 'piano', midi, start: .03 + e.onsetTick * seconds, duration: e.durationTicks * seconds,
            gain: .32, tick: e.onsetTick, sourceEventId: e.id});
    });
    if (!deps.melodyOnly) {
        const rhythm = deps.rhythm(project, index);
        let slots;
        if (rhythm?.encoding === 'studio-strum-v1') slots = rhythm.slots.slice().sort((a, b) => a.tick - b.tick);
        else if (rhythm?.encoding === 'rhythm-owner-cells-v1' && rhythm.projection?.rhythmResolved)
            slots = rhythm.projection.events.filter(e => e.sound !== 'sustain').map(e => ({tick: e.onsetTick,
                action: e.sound === 'rest' ? 'rest' : e.direction, durationTicks: e.notationDurationTicks, accent: e.accent === true}));
        else throw Error('このストローク形式は試聴未対応です。元のデータを保持しています');
        if (slots.some(s => s.tieToNext === true || !['down', 'up', 'mute', 'rest'].includes(s.action)))
            throw Error('このストロークの方向・タイは試聴未対応です');
        if (deps.fillBlankStrums) slots = deps.fillBlankStrums(slots, bar.chords.map(c => c.onsetTick));
        const fallback = slots.some(s => s.tick % 240 || s.durationTicks !== undefined && s.durationTicks % 240) ? 120 : 240;
        const chords = bar.chords.slice().sort((a, b) => a.onsetTick - b.onsetTick);
        for (const chord of chords) {
            cuts.push(.03 + chord.onsetTick * seconds);
            if (chord.durationTicks !== undefined) cuts.push(.03 + (chord.onsetTick + chord.durationTicks) * seconds);
        }
        if (!slots.length && chords.length) warnings.push('ストローク未入力のためコードは鳴りません');
        slots.forEach((slot, i) => {
            const end = Math.min(1920, slot.tick + (slot.durationTicks ?? fallback), slots[i + 1]?.tick ?? 1920);
            const duration = (end - slot.tick) * seconds, start = .03 + slot.tick * seconds;
            if (duration <= 0) return;
            if (slot.action === 'rest' || slot.action === 'mute') cuts.push(start);
            if (slot.action === 'rest') return;
            if (slot.action === 'mute') {
                events.push({part: 'mute', midi: 60, start, duration: Math.min(.085, duration), gain: slot.accent ? .18 : .14,
                    tick: slot.tick, stroke: 'mute'}); return;
            }
            try {
                const chord = harmony.at(index,slot.tick);
                if (!chord) throw Error('コード未入力のストロークは鳴らせません');
                if (chords.includes(chord) && chords.filter(c => c.onsetTick === chord.onsetTick).length > 1)
                    throw Error('同じ位置の複数コードは試聴未対応です');
                const voicing = chordVoicing(project, chord, deps);
                if (voicing.fallback) warnings.push('登録フォームなし：コード名からの参考和音です');
                events.push(...strumVoices(voicing, {start, duration: 4, attackWindow: duration, tick: slot.tick,
                    id: chord.id, direction: slot.action, accent: slot.accent}));
            } catch (e) { warnings.push(e.message); cuts.push(start); }
        });
    }
    if (events.length > 256) throw Error('試聴する音が多すぎます');
    return {events, cuts, duration: total + .03, secondsPerTick: seconds, warnings: [...new Set(warnings)]};
}
function finishPlan(plan) {
    const cuts = [...new Set([...plan.cuts, plan.duration])].sort((a, b) => a - b);
    const ordered = plan.events.slice().sort((a, b) => a.start - b.start), nextString = new Map();
    // Reverse sweep is linear after sorting, even for 2,048 bars. Same pitch on
    // different strings remains two voices; a restruck string releases before its new attack.
    for (let i = ordered.length - 1; i >= 0; i--) {
        const e = ordered[i];
        if (e.part !== 'guitar') continue;
        let lo = 0, hi = cuts.length;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (cuts[mid] <= e.attackStart + 1e-9) lo = mid + 1; else hi = mid; }
        const key = e.string === null ? 'fallback:' + e.midi : 'string:' + e.string;
        const end = Math.min(e.start + e.duration, cuts[lo] ?? plan.duration, nextString.get(key) ?? Infinity);
        e.duration = end - e.start;
        nextString.set(key, e.start);
    }
    delete plan.cuts;
    plan.events = ordered.filter(e => e.duration > .0001 && e.start < plan.duration);
    return plan;
}
export function buildBarPreviewPlan(project, index, deps) { return finishPlan(barPlan(project, index, deps,createHarmonyTimeline(project))); }
export function buildSongPreviewPlan(project, deps, startIndex = 0, count) {
    const events = [], cuts = [], spans = [], warnings = [], harmony=createHarmonyTimeline(project); let offset = 0;
    project.bars.slice(startIndex, count === undefined ? undefined : startIndex + count).forEach((bar, n) => {
        const index = startIndex + n;
        let plan; try { plan = barPlan(project, index, deps,harmony); } catch (e) { throw Error((index + 1) + '小節目：' + e.message); }
        plan.events.forEach(e => events.push({...e, start: e.start + offset, ...(e.attackStart === undefined ? {} : {attackStart: e.attackStart + offset}), barIndex: index}));
        plan.cuts.forEach(t => cuts.push(t + offset));
        spans.push({index, start: offset, end: offset + plan.duration - .03}); offset += plan.duration - .03;
        plan.warnings.forEach(w => { if (warnings.length < 8 && !warnings.includes(w)) warnings.push(w); });
    });
    return finishPlan({events, cuts, spans, duration: offset + .03, secondsPerTick: 60 / project.songInfo.bpm / 480, warnings});
}
