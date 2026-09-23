import { getActiveDurationSeconds } from './practice-menu-timer-store.js?v=0.59.1';

function add(map, key, seconds) {
    if (!key || !Number.isFinite(seconds) || seconds <= 0) return;
    map.set(key, (map.get(key) || 0) + seconds);
}

export function practiceWeekKey(localDate) {
    const [year, month, day] = localDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatPracticeTotal(seconds) {
    const minutes = Math.floor(Math.max(0, seconds) / 60);
    const hours = Math.floor(minutes / 60);
    return hours ? `${hours}時間${minutes % 60}分` : `${minutes}分`;
}

export function buildPracticeAnalytics(history) {
    const daily = new Map();
    const weekly = new Map();
    const monthly = new Map();
    const menu = new Map();
    const sessions = new Map();
    const children = new Map();
    for (const event of history.events) {
        if (event.type === 'practice-session') sessions.set(event.sessionId, event);
        if (event.type === 'practice-completed' && event.sessionId) {
            const list = children.get(event.sessionId) || [];
            list.push(event);
            children.set(event.sessionId, list);
        }
    }
    let totalSeconds = 0;
    const addPeriod = (date, seconds) => {
        add(daily, date, seconds);
        add(weekly, practiceWeekKey(date), seconds);
        add(monthly, date.slice(0, 7), seconds);
        totalSeconds += seconds;
    };
    for (const session of sessions.values()) addPeriod(session.localDate, session.activeDurationSeconds ?? session.durationSeconds);
    for (const [sessionId, list] of children) {
        const session = sessions.get(sessionId);
        let previous = session ? Date.parse(session.startedAt) : null;
        list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        for (const child of list) {
            const checked = session ? Math.min(Date.parse(session.endedAt), Math.max(previous, Date.parse(child.timestamp))) : null;
            const seconds = child.measuredDurationSeconds ?? (session
                ? getActiveDurationSeconds(new Date(previous).toISOString(), new Date(checked).toISOString(), session.pauseIntervals || [])
                : 0);
            if (!session && child.measuredDurationSeconds !== undefined) addPeriod(child.localDate, seconds);
            const key = child.practiceId;
            if (key && seconds > 0) {
                const previousEntry = menu.get(key);
                menu.set(key, { practiceId: key, name: child.practiceName,
                    seconds: (previousEntry?.seconds || 0) + seconds });
            }
            if (session) previous = checked;
        }
    }
    const periods = (map) => [...map].sort(([a], [b]) => b.localeCompare(a))
        .map(([key, seconds]) => ({ key, seconds }));
    return { totalSeconds, daily: periods(daily), weekly: periods(weekly), monthly: periods(monthly),
        menu: [...menu.values()].sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name, 'ja-JP')) };
}
