import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPracticeAnalytics, formatPracticeTotal, practiceWeekKey } from './practice-analytics.js';

const session = (id, date, seconds) => ({ id, type: 'practice-session', sessionId: id, localDate: date,
    startedAt: `${date}T00:00:00.000Z`, endedAt: `${date}T01:00:00.000Z`, durationSeconds: seconds,
    activeDurationSeconds: seconds, pauseIntervals: [] });
const child = (id, sessionId, date, name, seconds) => ({ id, type: 'practice-completed', sessionId,
    localDate: date, timestamp: `${date}T00:10:00.000Z`, practiceId: name, practiceName: name,
    measuredDurationSeconds: seconds });

test('daily, Monday weekly, monthly and total use confirmed session time once', () => {
    const history = { events: [session('a', '2026-09-06', 3600), child('c', 'a', '2026-09-06', 'ギター', 600),
        session('b', '2026-09-07', 1800), child('d', 'b', '2026-09-07', 'ギター', 300)] };
    const analytics = buildPracticeAnalytics(history);
    assert.equal(analytics.totalSeconds, 5400);
    assert.deepEqual(analytics.daily.map(({ key, seconds }) => [key, seconds]), [['2026-09-07', 1800], ['2026-09-06', 3600]]);
    assert.deepEqual(analytics.weekly.map(({ key, seconds }) => [key, seconds]), [['2026-09-07', 1800], ['2026-08-31', 3600]]);
    assert.equal(analytics.monthly[0].seconds, 5400);
    assert.equal(analytics.menu[0].seconds, 900);
    assert.equal(formatPracticeTotal(analytics.totalSeconds), '1時間30分');
    assert.equal(practiceWeekKey('2026-09-06'), '2026-08-31');
    assert.equal(practiceWeekKey('2026-09-07'), '2026-09-07');
});

test('orphan measured children count once and unmeasured standalone items are not guessed', () => {
    const history = { events: [child('orphan', 'missing', '2026-09-08', 'リズム', 120),
        { ...child('standalone', null, '2026-09-08', '歌', 0), measuredDurationSeconds: undefined }] };
    const analytics = buildPracticeAnalytics(history);
    assert.equal(analytics.totalSeconds, 120);
    assert.equal(analytics.menu[0].name, 'リズム');
    assert.equal(analytics.menu.length, 1);
    assert.deepEqual(buildPracticeAnalytics({ events: [] }).daily, []);
});
