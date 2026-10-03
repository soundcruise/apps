import { NEWS_ARTICLES, parseNewsArticleRoute } from './news-articles.js?v=1.16.0';

export function renderNewsArticle({ documentObject = document, hash } = {}) {
    const doc = documentObject, content = doc.getElementById('news-article-content');
    const node = (tag, text, className) => {
        const element = doc.createElement(tag);
        if (text !== undefined) element.textContent = text;
        if (className) element.className = className;
        return element;
    };
    content.replaceChildren();
    const id = parseNewsArticleRoute(hash);
    const article = id ? NEWS_ARTICLES[id] : null;
    const title = doc.getElementById('news-article-title');
    title.textContent = article?.title ?? '記事が見つかりません';
    if (!article) {
        content.append(node('p', 'この記事は現在表示できません。ニュース一覧へお戻りください。'));
        return false;
    }
    const meta = node('p', undefined, 'news-article-meta');
    const time = node('time', `投稿日：${article.dateNote}`); time.dateTime = article.publishedAt;
    meta.append(node('span', 'クルーズapps', 'news-category'), time);
    content.append(meta);
    for (const [heading, copy] of [['概要', article.overview], ['使い方', article.usage]]) {
        const section = node('section'); section.append(node('h2', heading), node('p', copy));
        if (heading === '概要') {
            section.append(node('p', '対象アプリ'));
            const list = node('ul', undefined, 'news-article-apps');
            article.coveredApps.forEach(app => list.append(node('li', app)));
            section.append(list);
        }
        content.append(section);
    }
    const section = node('section'); section.append(node('h2', '4つのテーマを比較'));
    section.append(node('p', article.imageNote));
    const grid = node('div', undefined, 'news-theme-grid');
    for (const image of article.images) {
        const figure = node('figure'), img = node('img');
        img.src = new URL(image.src, import.meta.url).href;
        img.alt = image.alt; img.width = 378; img.height = 819;
        figure.append(node('figcaption', image.caption), img); grid.append(figure);
    }
    section.append(grid); content.append(section);
    const footer = node('nav', undefined, 'news-article-footer'); footer.setAttribute('aria-label', '記事のナビゲーション');
    const back = node('a', '← ニュース一覧', 'view-back'); back.href = '#news';
    const home = node('a', 'Cruise Portを開く', 'view-back'); home.href = '#';
    footer.append(back, home); content.append(footer);
    return true;
}
