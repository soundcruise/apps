import {labelInformationScore,compareTicker,eventVisible,validEventDeadline} from './news-quality.js?v=1.11.1';
export {labelInformationScore} from './news-quality.js?v=1.11.1';
// Manual ingestion boundary. No collector, persistence or network access.
export const NEWS_MODE = 'beta';
export const NEWS_CATEGORIES = Object.freeze({
    acoustic_guitar: 'アコギ', electric_guitar_bass: 'ギター・ベース',
    amps_effects: 'アンプ・エフェクター', recording_audio: 'DTM・録音・配信',
    dtm_software: 'DTM・録音・配信', creator_streaming: 'DTM・録音・配信',
    artist_guitar: 'アーティスト', live_guitar: 'イベント', sale: 'セール', media_other: 'その他'
});
// Display-only grouping. Raw category keys remain valid in models and API filters.
export const RECORDING_STREAMING_GROUP = 'recording_streaming';
export const NEWS_FILTER_GROUPS = Object.freeze(Object.fromEntries(
    Object.entries(NEWS_CATEGORIES).filter(([key]) => !['creator_streaming', 'dtm_software'].includes(key))
        .map(([key, label]) => [key === 'recording_audio' ? RECORDING_STREAMING_GROUP : key, label])
));
export function newsFilterGroup(category) {
    if (['dtm_software', 'recording_audio', 'creator_streaming', 'DTM', '録音・配信'].includes(category)) return RECORDING_STREAMING_GROUP;
    return Object.hasOwn(NEWS_FILTER_GROUPS, category) ? category : '';
}
const categoryMatches = (raw, filter) => !filter || (filter === RECORDING_STREAMING_GROUP
    ? ['dtm_software', 'recording_audio', 'creator_streaming'].includes(raw) : raw === filter);
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
    if (!validEventDeadline(input.eventEndsAt)) return null;
    if (input.manualReviewStatus !== 'approved' || input.sourceSafety !== 'safe') return null;
    if (['artist_guitar', 'live_guitar'].includes(input.category) && !GUITAR_EVIDENCE.includes(input.guitarEvidence)) return null;
    let url;
    try { url = new URL(input.sourceUrl); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    // Allowlist projection prevents headline/body/image fields entering the UI model.
    return Object.fromEntries(['id', 'label', 'sourceName', 'publishedAt', 'category', 'topicKey',
        'createdAt', 'updatedAt', 'manualReviewStatus', 'sourceSafety', 'sourceKind', 'guitarEvidence', 'saleEndsAt', 'eventEndsAt']
        .filter(key => input[key] !== undefined).map(key => [key, input[key]]).concat([['sourceUrl', url.href]]));
}
export function prepareNews(input, { now = Date.now(), mode = NEWS_MODE } = {}) {
    if (mode === 'off') return [];
    if (!['beta', 'on'].includes(mode) || !Array.isArray(input) || !Number.isFinite(now)) throw new TypeError('Invalid news input');
    const topics = new Map();
    for (const candidate of input) {
        const item = normalizeNewsItem(candidate);
        if (!item || !saleVisible(item, now) || !eventVisible(item, now)) continue;
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
    const recent = days => items.filter(item => saleVisible(item, now) && eventVisible(item, now) && now - Date.parse(item.publishedAt) >= 0 && now - Date.parse(item.publishedAt) <= days * DAY);
    const week = recent(7);
    return (week.length ? week : recent(14)).sort((a, b) => compareTicker(a, b, now)).slice(0, 5);
}
export function groupNews(items, category = '', now = Date.now()) {
    const groups = new Map();
    for (const item of items.filter(item => saleVisible(item, now) && eventVisible(item, now) && categoryMatches(item.category, category))) {
        const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(item.publishedAt));
        if (!groups.has(day)) groups.set(day, []);
        groups.get(day).push(item);
    }
    return [...groups];
}
