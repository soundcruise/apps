import test from 'node:test';
import assert from 'node:assert/strict';
import {createBeatClock, createEventCursor, createScoreTimeline} from '../../score-viewer/core/beat-clock.mjs';
const near = (a,b) => assert(Math.abs(a-b) < 1e-7, `${a} != ${b}`);
function setup(options = {}) { let now = 0; return {clock:createBeatClock({now:() => now,bpm:120,barIds:['a','b','c'],...options}),time:value => now = value}; }
test('delayed audio startup holds tick zero and both reservation APIs use the same future origin',()=>{
    const f=setup(),cursor=createEventCursor(f.clock,[{tick:0},{tick:48}]),s=f.clock.play({delay:.03});
    f.time(.01);near(f.clock.snapshot().tick,0);near(f.clock.timeAtTick(0,s.generation),.03);
    const reservations=cursor.collect(.1);near(reservations[0].time,.03);near(reservations[1].time,.08);
    f.time(.04);near(f.clock.snapshot().tick,9.6);
});
test('shared monotonic clock maps ticks, bars and audio times without a separate scroll timer', () => {
    const f = setup(), c = f.clock; const start = c.play(); f.time(.5); const s = c.snapshot();
    near(s.tick,480); assert.equal(s.barId,'a'); near(c.timeAtTick(960,s.generation),1);
    f.time(2); assert.equal(c.snapshot().barId,'b'); near(c.snapshot().tickInBar,0);
    near(start.totalTicks,5760);
});
test('tempo changes retain the exact fractional tick and invalidate old audio reservations', () => {
    const f = setup(), c = f.clock; c.play(); f.time(.123); const before = c.snapshot(), ticket = {generation:before.generation};
    const changed = c.setTempo(60); near(changed.tick,before.tick); assert(!c.valid(ticket));
    near(c.timeAtTick(changed.tick + 480,changed.generation),1.123);
    f.time(1.123); near(c.snapshot().tick,before.tick + 480);
    assert.throws(() => c.timeAtTick(2000,before.generation),/stale-clock-generation/);
});
test('pause for interruption/visibility and resume never count hidden wall time; explicit seek only when paused', () => {
    const f = setup(), c = f.clock; c.play(); f.time(.5); const stopped = c.pause('visibility');
    f.time(99); near(c.snapshot().tick,480); assert.equal(stopped.reason,'visibility');
    c.play(); f.time(99.5); near(c.snapshot().tick,960); assert.throws(() => c.seek(0),/pause-before-seek/);
    c.pause(); c.seek(1920); assert.equal(c.snapshot().barId,'b'); c.play(); f.time(100); near(c.snapshot().tick,2400);
});
test('end clamps and stops, does not loop or reset; seek to start is explicit', () => {
    const f = setup(), c = f.clock; c.play(); f.time(100); const end = c.snapshot();
    assert.equal(end.status,'ended'); near(end.tick,5760); assert.equal(end.barId,'c'); near(end.tickInBar,1920);
    c.play(); assert.equal(c.snapshot().status,'ended'); c.seek(0); assert.equal(c.play().status,'playing');
});
test('reservation cursor retains event order, avoids repeats and reschedules only future notes on tempo change', () => {
    const f = setup(), c = f.clock, cursor = createEventCursor(c,[{tick:0,id:'start'},{tick:120,id:'next'},{tick:120,id:'same-pitch-other-string'}]);
    c.play(); const first = cursor.collect(.2); assert.equal(first.length,3); assert.deepEqual(cursor.collect(.2),[]);
    f.time(.05); c.setTempo(60); assert(first.every(t => !c.valid(t)));
    const next = cursor.collect(.2); assert.deepEqual(next.map(t => t.event.id),['next','same-pitch-other-string']);
    near(next[0].time,.2); assert(next.every(t => c.valid(t))); assert.deepEqual(cursor.collect(.2),[]);
    c.pause(); f.time(10); c.play(); const resumed = cursor.collect(.5); assert.deepEqual(resumed.map(t => t.event.id),['next','same-pitch-other-string']);
    c.pause(); c.seek(0); c.play(); assert.equal(cursor.collect()[0].event.id,'start');
});
test('tempo change at the exact current onset never replays the already issued attack', () => {
    const f = setup(), c = f.clock, cursor = createEventCursor(c,[{tick:0}]);
    c.play(); assert.equal(cursor.collect().length,1); c.setTempo(60); assert.deepEqual(cursor.collect(),[]);
    c.pause(); f.time(100); c.play(); assert.deepEqual(cursor.collect(),[]);
});
test('first polling frame includes the start event even when the clock already advanced', () => {
    const f = setup(), c = f.clock, input = [{tick:0,payload:{note:60}}], cursor = createEventCursor(c,input);
    assert(!Object.isFrozen(input[0].payload)); c.play(); f.time(.01);
    const result = cursor.collect(); assert.equal(result.length,1); near(result[0].time,.01);
    input[0].payload.note = 70; assert.equal(result[0].event.payload.note,60);
});
test('real bars, including silent bars, consume time; visual holes/fills never do', () => {
    const score = {schemaVersion:2,songInfo:{ticksPerBeat:480,timeSignature:{beats:4,beatUnit:4}},bars:[{id:'a'},{id:'b'}],extensions:{scoreLayoutV1:{holes:[{id:'hole'}],fills:[{}]}}};
    const t = createScoreTimeline(score); assert.equal(t.totalTicks,3840); assert.deepEqual(t.bars.map(b => b.barId),['a','b']);
});
test('long clock is stable through 2048 bars and many tempo changes', () => {
    const f = setup({barIds:Array.from({length:2048},(_,i) => 'b'+i)}), c = f.clock; c.play();
    let expected = 0, bpm = 120;
    for (let i=1;i<=1000;i++) { f.time(i / 10); expected += .1 * bpm / 60 * 480; bpm = i % 2 ? 20 : 400; near(c.setTempo(bpm).tick,expected); }
    near(c.snapshot().totalTicks,2048 * 1920);
});
test('invalid tempo/tick/clock values fail without changing musical position', () => {
    const f = setup(), c = f.clock;
    for (const bpm of [0,19,401,NaN,Infinity,'120']) assert.throws(() => c.setTempo(bpm));
    for (const tick of [-1,5761,NaN]) assert.throws(() => c.seek(tick));
    c.play(); f.time(1); near(c.snapshot().tick,960); f.time(.5); assert.throws(() => c.snapshot(),/non-monotonic-clock/);
    f.time(1); near(c.snapshot().tick,960); const token = {generation:c.snapshot().generation}; c.dispose(); assert(!c.valid(token));
    assert.throws(() => c.play(),/clock-disposed/);
});
