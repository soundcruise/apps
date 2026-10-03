import { NEWS_MODE, NEWS_CATEGORIES, NEWS_FILTER_GROUPS, newsFilterGroup, prepareNews, tickerNews, groupNews } from './news-data.js?v=1.15.0';
import { NEWS_BETA_ITEMS } from './data/news-beta.js?v=1.3.0';

const renderCleanup = new WeakMap();
export function stopNewsUpdates(doc = document) {
    renderCleanup.get(doc)?.();
    renderCleanup.delete(doc);
}
export function renderNews({ documentObject = document, items = NEWS_BETA_ITEMS, mode = NEWS_MODE, clock = () => Date.now(), now = clock(), category = '' } = {}) {
    const doc = documentObject;
    stopNewsUpdates(doc);
    const ticker = doc.getElementById('news-ticker');
    const entry = doc.getElementById('news-entry');
    const content = doc.getElementById('news-content');
    const node = (tag, text, className) => {
        const result = doc.createElement(tag);
        if (text !== undefined) result.textContent = text;
        if (className) result.className = className;
        return result;
    };
    ticker.hidden = true;
    entry.hidden = mode === 'off';
    content.replaceChildren();
    if (mode === 'off') {
        content.append(node('p', 'ニュースは現在利用できません。'));
        return;
    }
    try {
        const news = prepareNews(items, { now, mode });
        const recent = tickerNews(news, now);
        if (recent.length) {
            ticker.replaceChildren(node('span', 'NEWS', 'news-ticker-label'));
            const viewport = node('span', undefined, 'news-ticker-viewport');
            const track = node('span', undefined, 'news-ticker-track');
            recent.forEach(item => track.append(node('span', item.label)));
            track.setAttribute('aria-hidden', 'true');
            viewport.append(track);
            ticker.append(viewport);
            ticker.setAttribute('aria-label', `ニュース一覧へ。${recent[0].label}`);
            ticker.hidden = false;
        }
        if (mode === 'on') content.append(node('p', '毎朝6:00更新（日本時間）', 'news-beta-note'));
        if (mode === 'beta') content.append(node('p', 'Beta · 手動確認済みのニュース', 'news-beta-note'));
        const label = node('label', 'カテゴリ', 'news-filter');
        const select = node('select');
        select.id = 'news-category';
        const all = node('option', 'すべて'); all.value = ''; select.append(all);
        Object.entries(NEWS_FILTER_GROUPS).forEach(([key, title]) => {
            const option = node('option', title); option.value = key; select.append(option);
        });
        select.value = newsFilterGroup(category);
        label.append(select); content.append(label);
        const list = node('div', undefined, 'news-list'); content.append(list);
        const draw = (at = now) => {
            list.replaceChildren();
            const groups = groupNews(prepareNews(items, { now: at, mode }), select.value, at);
            if (!groups.length) list.append(node('p', '表示できるニュースはありません。', 'news-empty'));
            for (const [day, records] of groups) {
                const section = node('section');
                section.append(node('h2', day.replaceAll('-', '/'), 'news-day'));
                for (const item of records) {
                    const link = node('a', undefined, 'news-card');
                    link.href = item.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
                    link.append(node('span', NEWS_CATEGORIES[item.category], 'news-category'), node('span', item.label, 'news-label'), node('span', item.sourceName, 'news-source'));
                    const time = node('time', day.replaceAll('-', '/')); time.dateTime = item.publishedAt;
                    link.append(time); section.append(link);
                }
                list.append(section);
            }
        };
        select.addEventListener('change', () => draw(clock())); draw();
        // No network: expire the already loaded list/ticker at the deadline, including on wake.
        const view = doc.defaultView;
        if (view?.setTimeout) {
            const refresh = () => renderNews({ documentObject: doc, items, mode, clock, now: clock(), category: select.value });
            const wake = () => { if (!doc.hidden) refresh(); };
            const deadlines = news.filter(item => item.category === 'sale' && Number.isSafeInteger(item.saleEndsAt)).map(item => item.saleEndsAt + 1);
            const next = Math.min(...deadlines);
            const timer = Number.isFinite(next) ? view.setTimeout(refresh, Math.max(1, Math.min(2147483647, next - now))) : null;
            doc.addEventListener?.('visibilitychange', wake);
            view.addEventListener?.('pageshow', wake);
            renderCleanup.set(doc, () => {
                if (timer !== null) view.clearTimeout(timer);
                doc.removeEventListener?.('visibilitychange', wake);
                view.removeEventListener?.('pageshow', wake);
            });
        }
    } catch {
        ticker.hidden = true;
        content.replaceChildren(node('p', 'ニュースを読み込めませんでした。'));
    }
}
