import { membersVideoHref } from './news-members-video.js?v=1.38.1';
import { articlePath, CRUISE_STUDIO_NEWS_ITEM, STUDIO_BROWSER_CORRECTION } from './news-articles.js?v=1.38.1';
import {labelInformationScore,eventVisible,validEventDeadline} from './news-quality.js?v=1.35.0';
export {labelInformationScore} from './news-quality.js?v=1.35.0';
// Manual ingestion boundary. No collector, persistence or network access.
export const NEWS_MODE = 'beta';
export const NEWS_CATEGORIES = Object.freeze({
    cruise_apps: 'クルーズapps',
    acoustic_guitar: 'アコギ', electric_guitar_bass: 'ギター・ベース',
    amps_effects: 'アンプ・エフェクター', recording_audio: 'DTM・録音・配信',
    dtm_software: 'DTM・録音・配信', creator_streaming: 'DTM・録音・配信',
    artist_guitar: 'アーティスト・イベント', live_guitar: 'アーティスト・イベント', sale: 'セール', media_other: 'その他'
});
// Display-only grouping. Raw category keys remain valid in models and API filters.
export const RECORDING_STREAMING_GROUP = 'recording_streaming';
export const ARTIST_EVENT_GROUP = 'artist_event';
export const NEWS_FILTER_GROUPS = Object.freeze({
    acoustic_guitar: NEWS_CATEGORIES.acoustic_guitar,
    electric_guitar_bass: NEWS_CATEGORIES.electric_guitar_bass,
    amps_effects: NEWS_CATEGORIES.amps_effects,
    [RECORDING_STREAMING_GROUP]: NEWS_CATEGORIES.recording_audio,
    sale: NEWS_CATEGORIES.sale,
    [ARTIST_EVENT_GROUP]: 'アーティスト・イベント',
    cruise_apps: NEWS_CATEGORIES.cruise_apps,
    media_other: NEWS_CATEGORIES.media_other
});
export function newsFilterGroup(category) {
    if (['dtm_software', 'recording_audio', 'creator_streaming', 'DTM', '録音・配信'].includes(category)) return RECORDING_STREAMING_GROUP;
    if (['artist_guitar', 'live_guitar'].includes(category)) return ARTIST_EVENT_GROUP;
    return Object.hasOwn(NEWS_FILTER_GROUPS, category) ? category : '';
}
const categoryMatches = (raw, filter) => !filter || (filter === RECORDING_STREAMING_GROUP
    ? ['dtm_software', 'recording_audio', 'creator_streaming'].includes(raw)
    : filter === ARTIST_EVENT_GROUP ? ['artist_guitar', 'live_guitar'].includes(raw) : raw === filter);
const PRIORITY = ['official', 'distributor', 'retailer_editorial', 'media'];
const GUITAR_EVIDENCE = ['acoustic_guitar_vocal', 'guitar_performance', 'guitar_gear', 'guitar_recording', 'manual_guitar_review'];
const DAY = 86400000;
const jstFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' });
export const newsDay = publishedAt => jstFormatter.format(new Date(publishedAt));
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
    if(input.hot!==undefined&&typeof input.hot!=='boolean'||input.displayOrder!==undefined&&(!Number.isSafeInteger(input.displayOrder)||input.displayOrder<0||input.displayOrder>99))return null;
    if (input.manualReviewStatus !== 'approved' || input.sourceSafety !== 'safe') return null;
    if (['artist_guitar', 'live_guitar'].includes(input.category) && !GUITAR_EVIDENCE.includes(input.guitarEvidence)) return null;
    if (input.linkType === 'members_video') {
        if (!membersVideoHref(input) || !/^20\d{2}-\d{2}-\d{2}$/.test(input.videoPublishedOn || '') || !Number.isFinite(Date.parse(input.videoPublishedOn+'T00:00:00Z')) ||
            new Date(input.videoPublishedOn + 'T00:00:00Z').toISOString().slice(0,10) !== input.videoPublishedOn) return null;
        return Object.fromEntries(['id', 'label', 'sourceName', 'sourceUrl', 'publishedAt', 'category', 'topicKey', 'createdAt', 'updatedAt', 'manualReviewStatus', 'sourceSafety', 'sourceKind', 'linkType', 'videoId', 'videoChannelId', 'videoPublishedOn', 'sourceId', 'hot', 'displayOrder'].filter(key => input[key] !== undefined).map(key => [key, input[key]]));
    }
    if (input.linkType === 'internal') {
        if (input.category !== 'cruise_apps' || !articlePath(input.articleId) || input.sourceName !== 'Sound Cruise' || input.sourceKind !== 'official') return null;
        return Object.fromEntries(['id', 'label', 'sourceName', 'publishedAt', 'category', 'topicKey', 'createdAt', 'updatedAt', 'manualReviewStatus', 'sourceSafety', 'sourceKind', 'linkType', 'articleId'].map(key => [key, input[key]]));
    }
    if (input.category === 'cruise_apps' || (input.linkType !== undefined && input.linkType !== 'external')) return null;
    let url;
    try { url = new URL(input.sourceUrl); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    // Allowlist projection prevents headline/body/image fields entering the UI model.
    return Object.fromEntries(['id', 'label', 'sourceName', 'publishedAt', 'category', 'topicKey',
        'createdAt', 'updatedAt', 'manualReviewStatus', 'sourceSafety', 'sourceKind', 'guitarEvidence', 'saleEndsAt', 'eventEndsAt', 'hot', 'displayOrder']
        .filter(key => input[key] !== undefined).map(key => [key, input[key]]).concat([['sourceUrl', url.href]]));
}
const studioFeatureStart = Date.parse('2026-11-20T00:00:00+09:00');
const studioFeatureEnd = Date.parse('2026-11-23T00:00:00+09:00');
function isStudioNotice(item) {
    return item.id === CRUISE_STUDIO_NEWS_ITEM.id && Boolean(membersVideoHref(item));
}
export function nextStudioFeatureChange(items, now) {
    if (!items.some(isStudioNotice)) return Infinity;
    if (now < studioFeatureStart) return studioFeatureStart;
    return now < studioFeatureEnd ? studioFeatureEnd : Infinity;
}
export function isFeaturedStudioNotice(item, now) {
    return now >= studioFeatureStart && now < studioFeatureEnd && isStudioNotice(item);
}
export function isStudioBrowserCorrection(item) {
    return item.id === STUDIO_BROWSER_CORRECTION.id && item.articleId === STUDIO_BROWSER_CORRECTION.articleId &&
        item.linkType === 'internal' && item.category === 'cruise_apps' && item.sourceKind === 'official';
}
export function isFeaturedNews(item, now) {
    return isStudioBrowserCorrection(item) || isFeaturedStudioNotice(item, now);
}
export function prepareNews(input, { now = Date.now(), mode = NEWS_MODE } = {}) {
    if (mode === 'off') return [];
    if (!['beta', 'on'].includes(mode) || !Array.isArray(input) || !Number.isFinite(now)) throw new TypeError('Invalid news input');
    const topics = new Map();
    for (const candidate of input) {
        const item = normalizeNewsItem(candidate);
        if (!item || !saleVisible(item, now) || !eventVisible(item, now)) continue;
        const age = now - Date.parse(item.publishedAt);
        if (age < 0 || (age > 90 * DAY && !isStudioBrowserCorrection(item))) continue;
        const previous = topics.get(item.topicKey);
        if (!previous || labelInformationScore(item.label) > labelInformationScore(previous.label) ||
            (labelInformationScore(item.label) === labelInformationScore(previous.label) && (PRIORITY.indexOf(item.sourceKind) < PRIORITY.indexOf(previous.sourceKind) ||
            (item.sourceKind === previous.sourceKind && item.publishedAt > previous.publishedAt)))) topics.set(item.topicKey, item);
    }
    return [...topics.values()].sort((a,b) => {
        // The correction remains pinned, followed by the time-limited Studio notice.
        // Ordinary entries retain their JST day and within-day priority.
        const officialFirst = item => item.displayOrder === 0 && membersVideoHref(item) ? 1 : 0;
        return Number(isStudioBrowserCorrection(b)) - Number(isStudioBrowserCorrection(a)) ||
            Number(isFeaturedStudioNotice(b, now)) - Number(isFeaturedStudioNotice(a, now)) ||
            newsDay(b.publishedAt).localeCompare(newsDay(a.publishedAt)) ||
            (a.displayOrder ?? 100000) - (b.displayOrder ?? 100000) ||
            officialFirst(b) - officialFirst(a) ||
            b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id);
    });
}
export function tickerNews(items, now = Date.now()) {
    const recent = days => items.filter(item => saleVisible(item, now) && eventVisible(item, now) && now - Date.parse(item.publishedAt) >= 0 && now - Date.parse(item.publishedAt) <= days * DAY);
    const week = recent(7);
    // prepareNews already ordered the list, including same-day display preferences.
    return (week.length ? week : recent(14)).slice(0, 5);
}
export function groupNews(items, category = '', now = Date.now()) {
    const groups = [];
    for (const item of items.filter(item => saleVisible(item, now) && eventVisible(item, now) && categoryMatches(item.category, category))) {
        const day = newsDay(item.publishedAt);
        const featured = isFeaturedNews(item, now);
        const previous = groups.at(-1);
        const previousFeatured = previous ? isFeaturedNews(previous[1][0], now) : false;
        if (!previous || featured !== previousFeatured || (!featured && previous[0] !== day)) groups.push([day, [item]]);
        else previous[1].push(item);
    }
    return groups;
}
