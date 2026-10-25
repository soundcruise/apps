import { loadNewsPresentation } from '../../../cruise-port/news-provider.js?v=1.24.14';
import { prepareNews, groupNews, NEWS_CATEGORIES, NEWS_FILTER_GROUPS } from '../../../cruise-port/news-data.js?v=1.24.14';
import { NEWS_ARTICLES } from '../../../cruise-port/news-articles.js?v=1.16.1';
import { newsSourceDisplayName } from '../../../cruise-port/news-ui.js?v=1.24.14';
import { newsOriginalArticleHref } from '../../../cruise-port/news-external-link.js?v=1.23.1';

// Memory-only lifecycle. No cache fallback can resurrect an old/taken-down
// external record. Only the owner's independently bundled first-party fallback
// may survive an API outage; an explicit kill disables that too.
export function createNewsController({ load = loadNewsPresentation, fetcher = globalThis.fetch, change = () => {} } = {}) {
    let generation = 0, active = false, disposed = false, controller = null;
    let state = Object.freeze({ phase: 'idle', items: [], mode: 'on', notice: '' });
    const publish = next => { state = Object.freeze(next); change(state); };
    function stop() { generation++; active = false; controller?.abort(); controller = null; state = Object.freeze({ phase: 'idle', items: [], mode: 'on', notice: '' }); }
    async function refresh() {
        if (!active || disposed) return;
        controller?.abort(); controller = new AbortController();
        const own = controller, epoch = ++generation;
        publish({ phase: 'loading', items: [], mode: 'on', notice: '' });
        try {
            const result = await load({ fetcher: (input, options = {}) => fetcher(input, { ...options,
                signal: options.signal ? AbortSignal.any([own.signal, options.signal]) : own.signal }) });
            if (!active || disposed || epoch !== generation) return;
            publish({ phase: result.notice ? 'error' : 'ready', items: result.items, mode: result.mode, notice: result.notice || '' });
        } catch (error) {
            if (!active || disposed || epoch !== generation) return;
            publish({ phase: error?.name === 'NewsDisabledError' ? 'off' : 'error', items: [], mode: error?.name === 'NewsDisabledError' ? 'off' : 'on', notice: error?.name === 'NewsDisabledError' ? 'ニュースは現在利用できません。' : 'ニュースを読み込めませんでした。もう一度お試しください。' });
        }
    }
    return Object.freeze({ snapshot: () => state, activate() { if (disposed) return; active = true; return refresh(); }, refresh,
        deactivate: stop, dispose() { if (disposed) return; stop(); disposed = true; } });
}

export function mountNews({ document: doc, shell, load, fetcher, clock = () => Date.now() }) {
    const node = doc.getElementById('screen-news'), list = node.querySelector('[data-news-list]'), detail = node.querySelector('[data-news-detail]');
    const status = node.querySelector('[data-news-status]'), category = node.querySelector('[data-news-category]'), refresh = node.querySelector('[data-news-refresh]');
    const view = doc.defaultView;
    let active = false, disposed = false, selected = null, returnId = null, timer = null;
    const el = (tag, text, className) => { const result = doc.createElement(tag); if (text !== undefined) result.textContent = text; if (className) result.className = className; return result; };
    const allowed = () => active && !node.closest('[hidden], [inert]') && !shell.getCommandContext().activeModal;
    function visibleItems() { const s = controller.snapshot(); return prepareNews(s.items, { mode: s.mode, now: clock() }); }
    function listFocus(id) { return [...list.querySelectorAll('[data-news-id]')].find(x => x.dataset.newsId === id) || refresh; }
    function showList(focus = false) {
        selected = null; detail.hidden = true; list.hidden = false; category.closest('label').hidden = false;
        if (focus) listFocus(returnId).focus({ preventScroll: true });
    }
    function drawDetail(item, focus = false) {
        detail.replaceChildren();
        const back = el('button', '← ニュース一覧'); back.type = 'button'; back.dataset.newsBack = '';
        const title = el('h2', item.label); title.tabIndex = -1;
        detail.append(back, title, el('p', `${NEWS_CATEGORIES[item.category]} · ${newsSourceDisplayName(item)}`));
        const time = el('time', new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo' }).format(new Date(item.publishedAt))); time.dateTime = item.publishedAt; detail.append(time);
        if (item.linkType === 'internal') {
            const article = NEWS_ARTICLES[item.articleId];
            if (article) {
                detail.append(el('h3', '概要'), el('p', article.overview), el('p', '対象アプリ：' + article.coveredApps.join(' / ')), el('h3', '使い方'), el('p', article.usage));
            }
        } else {
            const href = newsOriginalArticleHref(item);
            detail.append(el('p', '記事本文は配信元でご覧ください。'));
            if (href) { const link = el('a', '配信元の記事を開く'); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; detail.append(link); }
        }
        list.hidden = true; category.closest('label').hidden = true; detail.hidden = false;
        if (focus) title.focus({ preventScroll: true });
    }
    function schedule() {
        view.clearTimeout(timer); timer = null;
        if (!active) return;
        const now = clock(), deadlines = controller.snapshot().items.flatMap(x => [x.saleEndsAt, x.eventEndsAt, Date.parse(x.publishedAt) + 90 * 86400000]).filter(x => Number.isSafeInteger(x) && x >= now);
        if (deadlines.length) timer = view.setTimeout(render, Math.min(2147483647, Math.max(1, Math.min(...deadlines) - now + 1)));
    }
    function render() {
        if (!active || disposed) return;
        const s = controller.snapshot(), items = visibleItems(), focused = doc.activeElement?.dataset.newsId;
        node.dataset.status = s.phase; refresh.disabled = s.phase === 'loading';
        status.textContent = s.phase === 'loading' ? 'ニュースを読み込んでいます…' : s.notice || (s.mode === 'beta' ? 'Beta · 手動確認済みのニュース' : '毎朝6:00更新（日本時間）');
        list.replaceChildren();
        const groups = groupNews(items, category.value, clock());
        for (const [day, records] of groups) {
            const section = el('section', undefined, 'pc-news-day'); section.append(el('h2', day.replaceAll('-', '/')));
            for (const item of records) {
                const button = el('button', undefined, 'pc-news-card'); button.type = 'button'; button.dataset.newsId = item.id;
                button.append(el('span', NEWS_CATEGORIES[item.category], 'pc-news-category'), el('strong', item.label), el('span', newsSourceDisplayName(item), 'pc-news-source'));
                if (item.hot) button.append(el('span', '注目記事', 'pc-news-hot'));
                section.append(button);
            }
            list.append(section);
        }
        if (!groups.length && s.phase !== 'loading' && s.phase !== 'off') list.append(el('p', '表示できるニュースはありません。'));
        if (selected) {
            const current = items.find(x => x.id === selected);
            // Wake/expiry checks do not rebuild unchanged detail controls and
            // discard native focus. A refresh clears selection before new data.
            if (!current) { const hadFocus = detail.contains(doc.activeElement); showList(hadFocus); }
        } else if (focused) listFocus(focused).focus({ preventScroll: true });
        schedule();
    }
    const controller = createNewsController({ load, fetcher, change() { showList(); render(); } });
    const click = event => {
        if (!allowed()) return;
        const button = event.target.closest('button'); if (!button || !node.contains(button)) return;
        if (button === refresh) { if (!shell.keyboard.isIMEBlocked({})) void controller.refresh(); return; }
        if (button.hasAttribute('data-news-back')) { showList(true); return; }
        const item = visibleItems().find(x => x.id === button.dataset.newsId);
        if (item) { selected = returnId = item.id; drawDetail(item, true); }
    };
    const filter = () => { if (allowed()) { showList(); render(); } };
    const wake = () => { if (!doc.hidden) render(); };
    node.addEventListener('click', click); category.addEventListener('change', filter);
    for (const [id, label] of Object.entries(NEWS_FILTER_GROUPS)) { const option = el('option', label); option.value = id; category.append(option); }
    return Object.freeze({ load() {}, activate() { if (disposed) return; active = true; doc.addEventListener('visibilitychange', wake); view.addEventListener('pageshow', wake); void controller.activate(); },
        deactivate() { active = false; selected = null; controller.deactivate(); view.clearTimeout(timer); timer = null; doc.removeEventListener('visibilitychange', wake); view.removeEventListener('pageshow', wake); },
        dispose() { if (disposed) return; this.deactivate(); controller.dispose(); node.removeEventListener('click', click); category.removeEventListener('change', filter); disposed = true; },
        snapshot: controller.snapshot, handleEscape() { if (!allowed() || !selected) return false; showList(true); return true; } });
}

export function mountHome({ document: doc, shell, getHost = () => globalThis.CruiseStudio?.portDataHost }) {
    const home = doc.getElementById('screen-home');
    function render() {
        const s = getHost()?.getCachedStatus();
        home.querySelector('[data-home-port-status]').textContent = !s?.dataset ? 'Port保存値：未確認。Toolsから明示的に確認できます。' : 'Port保存値：閲覧中。保存・同期の書込みは利用できません。';
    }
    const click = event => {
        const button = event.target.closest('[data-home-workspace], [data-home-action]');
        if (!button || !home.contains(button) || home.closest('[hidden], [inert]') || shell.getCommandContext().activeModal) return;
        if (button.dataset.homeWorkspace) shell.navigate(button.dataset.homeWorkspace);
        else if (button.dataset.homeAction === 'metronome') { if (shell.getLayoutState().dockCollapsed) doc.getElementById('shell-dock-toggle').click(); doc.getElementById('studio-dock').querySelector('button')?.focus(); }
        else if (button.dataset.homeAction === 'settings') doc.querySelector('#shell-theme input')?.focus();
        else if (button.dataset.homeAction === 'port') { const s = shell.getLayoutState(); if (!s.rightOpen || s.rightType !== 'tool') doc.getElementById('shell-tool').click(); doc.getElementById('studio-port-read').focus(); }
    };
    home.addEventListener('click', click);
    // Cached projection only. No ensure/read/provision on Home or status render.
    const off = getHost()?.subscribe(render) || (() => {}); render();
    return { render, dispose() { off(); home.removeEventListener('click', click); } };
}

// Establish the workspace adapter before app.js initializes the Shell. All I/O
// stays deferred until NEWS activation; Home only subscribes to cached state.
if (globalThis.document && globalThis.CruiseStudio) {
    const CS = globalThis.CruiseStudio;
    let news;
    CS.news = { load() {}, activate() { news?.activate(); }, deactivate() { news?.deactivate(); } };
    function initialize() {
        news = CS.newsView = mountNews({ document, shell: CS.shellHost });
        CS.shellHost.keyboard.registerEscape({ scope: 'workspace', workspaceId: 'news', handle: () => news.handleEscape() });
        CS.homeView = mountHome({ document, shell: CS.shellHost });
        const stop = () => { news.deactivate(); CS.homeView.dispose(); };
        window.addEventListener('pagehide', stop, { once: true });
        window.addEventListener('pageshow', event => {
            if (!event.persisted) return;
            CS.homeView = mountHome({ document, shell: CS.shellHost });
            if (CS.shellHost.getActiveWorkspace() === 'news') news.activate();
            window.addEventListener('pagehide', stop, { once: true });
        });
    }
    if (CS.shellHost) initialize(); else document.addEventListener('DOMContentLoaded', initialize, { once: true });
}
