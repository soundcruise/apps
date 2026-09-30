// Manual ingestion boundary. No collector, persistence or network access.
export const NEWS_MODE = 'beta';
export const NEWS_CATEGORIES = Object.freeze({
    acoustic_guitar: 'アコギ', electric_guitar_bass: 'ギター・ベース',
    amps_effects: 'アンプ・エフェクター', recording_audio: '録音・オーディオ',
    dtm_software: 'DTM', creator_streaming: '配信・クリエイター',
    artist_guitar: 'アーティスト', live_guitar: 'ライブ', sale: 'セール', media_other: 'その他'
});
const PRIORITY = ['official', 'distributor', 'retailer_editorial', 'media'];
const GUITAR_EVIDENCE = ['acoustic_guitar_vocal', 'guitar_performance', 'guitar_gear', 'guitar_recording', 'manual_guitar_review'];
const DAY = 86400000;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
export const validSaleDeadline = value => value == null || (Number.isSafeInteger(value) && value >= 0);
export const saleVisible = (item, now) => item.category !== 'sale' || (validSaleDeadline(item.saleEndsAt) && (item.saleEndsAt == null || now <= item.saleEndsAt));
export function normalizeNewsItem(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    for (const key of ['id', 'label', 'sourceName', 'topicKey']) {
        if (!text(input[key], key === 'label' ? 140 : 200)) return null;
    }
    if (!Object.hasOwn(NEWS_CATEGORIES, input.category) || !PRIORITY.includes(input.sourceKind)) return null;
    if (!['publishedAt', 'createdAt', 'updatedAt'].every(key => date(input[key]))) return null;
    if (input.category === 'sale' && !validSaleDeadline(input.saleEndsAt)) return null;
    if (input.manualReviewStatus !== 'approved' || input.sourceSafety !== 'safe') return null;
    if (['artist_guitar', 'live_guitar'].includes(input.category) && !GUITAR_EVIDENCE.includes(input.guitarEvidence)) return null;
    let url;
    try { url = new URL(input.sourceUrl); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    // Allowlist projection prevents headline/body/image fields entering the UI model.
    return Object.fromEntries(['id', 'label', 'sourceName', 'publishedAt', 'category', 'topicKey',
        'createdAt', 'updatedAt', 'manualReviewStatus', 'sourceSafety', 'sourceKind', 'guitarEvidence', 'saleEndsAt']
        .filter(key => input[key] !== undefined).map(key => [key, input[key]]).concat([['sourceUrl', url.href]]));
}
export function labelInformationScore(label) {
    if (typeof label !== 'string' || /審査待ち|要確認/.test(label)) return 0;
    if (/総単板|限定|発売予定|復刻|シグネチャー|小型|追加ボイス|プラグイン\d+製品|エクスプレッションペダル/.test(label)) return 4;
    if (/の製品情報$|、(?:ギター|音楽)に関する話題$/.test(label)) return 0;
    if (/演奏に関する話題$/.test(label)) return 1;
    return 3;
}
export function prepareNews(input, { now = Date.now(), mode = NEWS_MODE } = {}) {
    if (mode === 'off') return [];
    if (!['beta', 'on'].includes(mode) || !Array.isArray(input) || !Number.isFinite(now)) throw new TypeError('Invalid news input');
    const topics = new Map();
    for (const candidate of input) {
        const item = normalizeNewsItem(candidate);
        if (!item || !saleVisible(item, now)) continue;
        const age = now - Date.parse(item.publishedAt);
        if (age < 0 || age > 90 * DAY) continue;
        const previous = topics.get(item.topicKey);
        if (!previous || labelInformationScore(item.label) > labelInformationScore(previous.label) ||
            (labelInformationScore(item.label) === labelInformationScore(previous.label) && (PRIORITY.indexOf(item.sourceKind) < PRIORITY.indexOf(previous.sourceKind) ||
            (item.sourceKind === previous.sourceKind && item.publishedAt > previous.publishedAt)))) topics.set(item.topicKey, item);
    }
    return [...topics.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
}
export function tickerNews(items, now = Date.now()) {
    const recent = days => items.filter(item => saleVisible(item, now) && now - Date.parse(item.publishedAt) >= 0 && now - Date.parse(item.publishedAt) <= days * DAY);
    const week = recent(7);
    return (week.length ? week : recent(14)).sort((a, b) => labelInformationScore(b.label) - labelInformationScore(a.label) || b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id)).slice(0, 5);
}
export function groupNews(items, category = '', now = Date.now()) {
    const groups = new Map();
    for (const item of items.filter(item => saleVisible(item, now) && (!category || item.category === category))) {
        const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(item.publishedAt));
        if (!groups.has(day)) groups.set(day, []);
        groups.get(day).push(item);
    }
    return [...groups];
}
