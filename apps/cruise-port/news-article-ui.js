import { CRUISE_STUDIO_NEWS_ITEM, NEWS_ARTICLES, parseNewsArticleRoute } from './news-articles.js?v=1.38.4';
import { confirmMembersVideo } from './news-members-video.js?v=1.38.4';

function appendBrowserCorrection(doc, content, article, node) {
    const intro = node('p', article.intro);
    intro.append(doc.createTextNode(' '), node('strong', article.recommendation));
    content.append(intro, node('p', article.overview), node('p', article.compatibility));

    const steps = node('ol', undefined, 'news-article-steps');
    article.steps.forEach(copy => steps.append(node('li', copy)));
    const platforms = node('ul');
    article.platforms.forEach(copy => platforms.append(node('li', copy)));
    steps.lastElementChild.append(platforms);
    content.append(node('h2', 'Chromeでアプリを追加する手順'), steps);

    const actions = node('div', undefined, 'news-article-actions');
    const pdf = node('a', '画像付きの手順を見る（PDF）', 'action-button secondary-action');
    pdf.href = article.pdfUrl;
    pdf.target = '_blank';
    pdf.rel = 'noopener noreferrer';
    const video = node('button', undefined, 'action-button secondary-action news-article-video');
    video.append(
        node('span', 'クルーズスタジオの紹介動画'),
        node('small', '(メンバー限定)')
    );
    video.type = 'button';
    video.setAttribute('aria-haspopup', 'dialog');
    video.addEventListener('click', () => confirmMembersVideo(doc, CRUISE_STUDIO_NEWS_ITEM, video));
    actions.append(pdf, video);
    content.append(actions);
}

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
    if (article.steps) {
        appendBrowserCorrection(doc, content, article, node);
    } else {
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
    }
    const footer = node('nav', undefined, 'news-article-footer'); footer.setAttribute('aria-label', '記事のナビゲーション');
    const back = node('a', '← ニュース一覧', 'view-back'); back.href = '#news';
    const home = node('a', 'Cruise Portを開く', 'view-back'); home.href = '#';
    footer.append(back, home); content.append(footer);
    return true;
}
