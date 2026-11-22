import { OFFICIAL_VIDEO_CHANNEL_ID, OFFICIAL_VIDEO_SOURCE_ID, CRUISE_STUDIO_VIDEO } from './news-articles.js?v=1.38.2';

// Only the bundled, owner-reviewed official announcement can use this link type.
// Public API articles do not acquire this authority from their URL or title.
export function membersVideoHref(item) {
    if (item?.linkType !== 'members_video' || item.category !== 'cruise_apps' || item.sourceKind !== 'official' ||
        item.sourceId !== OFFICIAL_VIDEO_SOURCE_ID || item.videoChannelId !== OFFICIAL_VIDEO_CHANNEL_ID ||
        item.videoId !== CRUISE_STUDIO_VIDEO.id) return null;
    const canonical = `https://www.youtube.com/watch?v=${item.videoId}`;
    return item.sourceUrl === canonical ? canonical : null;
}

export function confirmMembersVideo(doc, item, trigger, { open = url => doc.defaultView.open(url, '_blank', 'noopener,noreferrer') } = {}) {
    const href = membersVideoHref(item);
    if (!href) return () => {};
    const node = (tag, text) => { const e = doc.createElement(tag); if (text) e.textContent = text; return e; };
    const dialog = node('dialog');
    dialog.className = 'sync-center-help-dialog news-members-dialog';
    dialog.setAttribute('aria-labelledby', 'news-members-title');
    dialog.setAttribute('aria-describedby', 'news-members-description');
    const title = node('h2', 'YouTubeへ移動します'); title.id = 'news-members-title';
    const text = node('p', 'この動画はYouTubeのメンバー限定コンテンツです。視聴には対象メンバーシップへの加入が必要です。'); text.id = 'news-members-description';
    const actions = node('div'); actions.className = 'news-members-actions';
    const cancel = node('button', 'キャンセル'), view = node('button', 'YouTubeで見る');
    cancel.type = view.type = 'button'; cancel.className = 'action-button secondary-action';
    view.className = 'action-button primary-action'; cancel.autofocus = true;
    let active = true;
    const close = () => { if (dialog.open) dialog.close(); };
    const viewWindow = doc.defaultView;
    const cleanup = () => {
        active = false;
        viewWindow?.removeEventListener?.('hashchange', close);
        dialog.remove();
        if (trigger?.isConnected) trigger.focus();
    };
    cancel.addEventListener('click', close);
    view.addEventListener('click', () => {
        if (!active || !dialog.open || membersVideoHref(item) !== href) return;
        // Synchronous user gesture: preserve Safari's ordinary popup permission.
        active = false;
        try { open(href); } finally { close(); }
    });
    dialog.addEventListener('close', cleanup, { once: true });
    dialog.addEventListener('click', event => {
        const r = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) close();
    });
    actions.append(cancel, view); dialog.append(title, text, actions); doc.body.append(dialog);
    dialog.showModal(); cancel.focus();
    viewWindow?.addEventListener?.('hashchange', close);
    return close;
}
