// Publisher-required referral attribution is presentation-only. Never mutate NEWS records.
const IKEBE_TRACKING = Object.freeze({
    utm_source: 'soundcruise', utm_medium: 'referral', utm_campaign: 'cruise_port'
});

export function newsOriginalArticleHref(item) {
    const original = item?.sourceUrl;
    if (typeof original !== 'string' || /[\u0000-\u0020\u007f]/.test(original)) return null;
    let url;
    try { url = new URL(original); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const covered = (url.hostname === 'www.ikebe-gakki-pb.com' && /^\/new_product\/\d+\/?$/.test(url.pathname)) ||
        (url.hostname === 'www.ikebe-gakki.com' && /^\/blog\/(?!category(?:\/|$)|tag(?:\/|$)|author(?:\/|$)|page(?:\/|$)|feed(?:\/|$))[^/]+\/?$/.test(url.pathname));
    if (!covered) return original;
    // Replace conflicting/duplicate tracking keys, including casing variants; preserve other queries and fragment.
    for (const key of [...url.searchParams.keys()]) {
        if (Object.hasOwn(IKEBE_TRACKING, key.toLowerCase())) url.searchParams.delete(key);
    }
    for (const [key, value] of Object.entries(IKEBE_TRACKING)) url.searchParams.set(key, value);
    return url.href;
}
