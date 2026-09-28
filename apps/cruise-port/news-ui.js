import { NEWS_MODE, NEWS_CATEGORIES, prepareNews, tickerNews, groupNews } from './news-data.js?v=1.3.0';
import { NEWS_BETA_ITEMS } from './data/news-beta.js?v=1.3.0';

export function renderNews({ documentObject = document, items = NEWS_BETA_ITEMS, mode = NEWS_MODE, now = Date.now() } = {}) {
    const doc = documentObject;
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
        if (mode === 'beta') content.append(node('p', 'Beta · 手動確認済みのニュース', 'news-beta-note'));
        const label = node('label', 'カテゴリ', 'news-filter');
        const select = node('select');
        select.id = 'news-category';
        const all = node('option', 'すべて'); all.value = ''; select.append(all);
        Object.entries(NEWS_CATEGORIES).forEach(([key, title]) => {
            const option = node('option', title); option.value = key; select.append(option);
        });
        label.append(select); content.append(label);
        const list = node('div', undefined, 'news-list'); content.append(list);
        const draw = () => {
            list.replaceChildren();
            const groups = groupNews(news, select.value);
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
        select.addEventListener('change', draw); draw();
    } catch {
        ticker.hidden = true;
        content.replaceChildren(node('p', 'ニュースを読み込めませんでした。'));
    }
}
