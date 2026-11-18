// First-party editorial content is bundled locally; never accept article bodies from the API.
export const NEWS_ARTICLES = Object.freeze({
    'theme-colors': Object.freeze({
        title: 'クルーズapps、4つのカラーテーマに対応',
        publishedAt: '2026-10-02T15:00:00.000Z',
        dateNote: '2026年10月3日',
        overview: 'Cruise Portと4つのクルーズアプリで、画面テーマを4種類から選べるようになりました。これまでのダークに加えて、チャコール・グレー・ライトを追加しています。好みや使用環境に合わせて、画面の雰囲気を切り替えられます。',
        coveredApps: Object.freeze(['Cruise Port', '音感クルーズ', '指板クルーズ', 'リズムクルーズ', 'コードクルーズ']),
        usage: '各アプリの設定画面にある「カラーテーマ」で、使いたいテーマを選んでください。指板クルーズでは「共通」タブにあります。音感クルーズ・指板クルーズでは、最後に「決定」を押して設定を確定します。保存したテーマは、次回起動時にも引き継がれます。',
        imageNote: '画像はCruise Portでの表示例です。4つのクルーズアプリでも同じ4種類のテーマを選べます。',
        images: Object.freeze(['dark', 'charcoal', 'gray', 'light'].map((theme, index) => Object.freeze({
            src: `assets/news/theme-colors/${theme}.jpg?v=1.16.0`,
            caption: ['ダーク', 'チャコール', 'グレー', 'ライト'][index],
            alt: `Cruise Portのホーム画面（${['ダーク', 'チャコール', 'グレー', 'ライト'][index]}テーマ）。同じカード配置で色の違いを比較できます。`
        })))
    })
});
export const articlePath = id => Object.hasOwn(NEWS_ARTICLES, id) ? `#news/cruise-apps/${id}` : null;
export function parseNewsArticleRoute(hash) {
    const match = typeof hash === 'string' && hash.match(/^#news\/cruise-apps\/([a-z0-9-]+)\/?$/);
    return match && Object.hasOwn(NEWS_ARTICLES, match[1]) ? match[1] : null;
}
export const CRUISE_APPS_NEWS_ITEM = Object.freeze({
    id: 'cruise-port-theme-colors', label: NEWS_ARTICLES['theme-colors'].title,
    sourceName: 'Sound Cruise', category: 'cruise_apps', linkType: 'internal', articleId: 'theme-colors',
    publishedAt: NEWS_ARTICLES['theme-colors'].publishedAt,
    createdAt: NEWS_ARTICLES['theme-colors'].publishedAt, updatedAt: NEWS_ARTICLES['theme-colors'].publishedAt,
    topicKey: 'cruise-port-theme-colors', sourceKind: 'official', sourceSafety: 'safe', manualReviewStatus: 'approved'
});

// Returning via the explicit list link replaces the detail entry, so Back cannot cycle into it again.
export function replaceNewsListRoute({ historyObject = globalThis.history, locationObject = globalThis.location } = {}) {
    historyObject.replaceState(historyObject.state, '', `${locationObject.pathname}${locationObject.search}#news`);
}

// Owner-requested official announcement; not a collector receipt, AI inference or
// manufacturer publication permission. Published only when this release is approved.
export const OFFICIAL_VIDEO_CHANNEL_ID = 'UC4ncQuk56I8SK6lJGZcGwJQ';
export const CRUISE_STUDIO_VIDEO = Object.freeze({
    id: 'BKHbxOotq9E', url: 'https://www.youtube.com/watch?v=BKHbxOotq9E',
    title: '#6【メンバー限定】PCで使える弾き語りアプリ「クルーズスタジオ」',
    channelId: OFFICIAL_VIDEO_CHANNEL_ID,
    publishedOn: '2026-11-15', publishedAt: null, // Exact publication time not exposed by the reviewed UI.
    visibility: 'members_only', audience: 'all_channel_members',
    evidence: 'youtube_watch_and_authenticated_studio_review_2026-11-18'
});
export const CRUISE_STUDIO_NEWS_ITEM = Object.freeze({
    id: 'sound-cruise-studio-members-video-20261118',
    label: 'Cruise Studioの解説動画をメンバー限定で公開',
    sourceName: 'Sound Cruise', category: 'cruise_apps', linkType: 'members_video',
    sourceUrl: CRUISE_STUDIO_VIDEO.url, videoId: CRUISE_STUDIO_VIDEO.id,
    videoChannelId: OFFICIAL_VIDEO_CHANNEL_ID, videoPublishedOn: CRUISE_STUDIO_VIDEO.publishedOn,
    publishedAt: '2026-11-17T15:00:00.000Z', // NEWS date: November 18 JST, distinct from video date.
    createdAt: '2026-11-17T15:00:00.000Z', updatedAt: '2026-11-17T15:00:00.000Z',
    topicKey: 'sound-cruise:youtube:BKHbxOotq9E', sourceKind: 'official',
    sourceSafety: 'safe', manualReviewStatus: 'approved',
    publicationBasis: 'owner_official_notice_instruction_2026-11-18'
});
export const CRUISE_APPS_NEWS_ITEMS = Object.freeze([CRUISE_APPS_NEWS_ITEM, CRUISE_STUDIO_NEWS_ITEM]);
