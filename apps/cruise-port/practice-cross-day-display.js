// Presentation only: children stay grouped under the existing session end date.
export function getPracticeCrossDayNotice(history, localDate) {
    const sessions = new Map(history.events
        .filter(event => event.type === 'practice-session')
        .map(event => [event.sessionId, event]));
    const dates = new Set();
    for (const event of history.events) {
        if (event.type !== 'practice-completed' || event.localDate !== localDate || !event.sessionId) continue;
        const session = sessions.get(event.sessionId);
        if (session && session.localDate !== localDate) dates.add(session.localDate);
    }
    if (!dates.size) return '';
    if (dates.size > 1) return '日付をまたいだ練習は、終了日の練習記録にまとめて表示されています。';
    const [year, month, day] = [...dates][0].split('-').map(Number);
    const yearLabel = year !== Number(localDate.slice(0, 4)) ? `${year}年` : '';
    return `日付をまたいだ練習は、${yearLabel}${month}月${day}日の練習記録にまとめて表示されています。`;
}
