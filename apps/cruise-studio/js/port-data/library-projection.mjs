import { getKnownApp } from '../../../cruise-port/my-apps-known-apps.js?v=1.3.0';
import { getMyAppsIconPreset } from '../../../cruise-port/my-apps-icon-presets.js?v=1.0.3';
import { projectPractice, freezePractice } from './practice-projection.mjs?v=0.60.0';
// Closed catalog slice; no binary stores, loaders, writers or credentials. Launch data remains readonly.
export const LIBRARY_KEYS = Object.freeze(['gearList', 'gearCategories', 'myApps', 'practiceMenus', 'practiceHistory', 'syncAssetMetadata', 'schemaVersion'].map(x => 'cruisePort.' + x));
export const GEAR_STATUSES = Object.freeze([{ id: 'owned', name: '自分の機材' }, { id: 'sold', name: '手放した機材' }, { id: 'wishlist', name: 'ほしい機材' }].map(Object.freeze));
// Port getGearCategoryName's legacy label fallback. This does not initialize definitions.
const LEGACY_CATEGORY_NAMES = Object.freeze({ guitar: 'ギター', effects: 'エフェクター', amp: 'アンプ', dtm: 'DTM', recording: '配信・録音', accessories: 'アクセサリー', other: 'その他' });
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = (x, max = Infinity) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
const optionalText = (x, max) => typeof x === 'string' && x.length <= max;
export const usableLibraryState = state => ['ready', 'empty', 'absent', 'legacy'].includes(state);
function decode(raw, key, min, max) {
    if (raw['cruisePort.' + key] == null) return { state: 'absent', value: null };
    let value; try { value = typeof raw['cruisePort.' + key] === 'string' ? JSON.parse(raw['cruisePort.' + key]) : raw['cruisePort.' + key]; } catch { return { state: 'invalid', value: null }; }
    if (!object(value) || !Number.isInteger(value.version)) return { state: 'invalid', value: null };
    if (value.version > max) return { state: 'future', value: null };
    if (value.version < min) return { state: 'unsupported', value: null };
    return { state: value.version < max ? 'legacy' : 'ready', value };
}
function collection(raw, key, min, max, field) {
    const d = decode(raw, key, min, max), items = d.value?.[field];
    if (!d.value) return { state: d.state, version: null, items: [] };
    if (!Array.isArray(items) || items.some(x => !object(x) || !text(x.id)) || new Set(items.map(x => x.id)).size !== items.length) return { state: 'invalid', version: d.value.version, items: [] };
    return { state: items.length ? d.state : 'empty', version: d.value.version, items };
}
function crop(value) { return object(value) && ['x', 'y', 'size'].every(k => Number.isFinite(value[k])) && value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1 && value.size > 0 && value.size <= 1 ? { x: value.x, y: value.y, size: value.size } : null; }
function imageMetadata(item, prefix, entry, metadataState) {
    // References are claims in saved metadata. They never establish binary availability.
    const id = item[prefix + 'Id'], sourceId = item[prefix + 'SourceId'];
    const final = entry?.published?.final;
    const unsupported = id != null && typeof id !== 'string' || sourceId != null && typeof sourceId !== 'string' || item[prefix + 'Crop'] != null && !crop(item[prefix + 'Crop']);
    return { state: metadataState, unsupported: Boolean(unsupported), referenceId: typeof id === 'string' ? id : null, sourceReferenceId: typeof sourceId === 'string' ? sourceId : null, crop: crop(item[prefix + 'Crop']),
        publishedClaim: object(final), byteSize: Number.isSafeInteger(final?.byteSize) && final.byteSize >= 0 ? final.byteSize : null,
        mimeType: typeof final?.mimeType === 'string' ? final.mimeType : null, binary: 'unconnected' };
}
function urlInfo(raw, platform) {
    let supported = false;
    if (typeof raw === 'string' && raw.length <= 2048) { try { const u = new URL(raw); supported = u.protocol === 'https:' && !!u.hostname && !u.username && !u.password && u.href === raw; } catch { /* no normalization */ } }
    return { platform, value: typeof raw === 'string' ? raw : '非対応の値', state: supported ? 'https' : 'unsupported' };
}
export function projectLibrary(raw = {}) {
    const meta = decode(raw, 'syncAssetMetadata', 2, 4), assets = meta.value;
    const categories = collection(raw, 'gearCategories', 1, 1, 'categories');
    if (categories.items.some(x => !text(x.name) || [...x.name].length > 40)) { categories.state = 'invalid'; categories.items = []; }
    const categoryNames = new Map(categories.items.map(x => [x.id, x.name]));
    const gear = collection(raw, 'gearList', 5, 5, 'items');
    if (gear.items.some(x => !text(x.name, 100))) { gear.state = 'invalid'; gear.items = []; }
    const statusNames = new Map(GEAR_STATUSES.map(x => [x.id, x.name]));
    const projectedGear = gear.items.map((x, index) => {
        const warnings = [], status = statusNames.has(x.status) ? x.status : 'unsupported';
        if (status === 'unsupported') warnings.push('非対応の所有状態（分類を補正しません）');
        if (!Number.isSafeInteger(x.order)) warnings.push('保存順orderを確認できません（配列順を表示）');
        for (const [key, max] of [['manufacturer', 100], ['memo', 1000], ['priceText', 100]]) if (!optionalText(x[key], max)) warnings.push(key + 'は非対応の値です');
        const categoryId = typeof x.category === 'string' ? x.category : null;
        const image = imageMetadata(x, 'photo', assets?.gear?.[x.id], meta.state);
        if (image.unsupported) warnings.push('非対応のphoto metadata');
        if (Object.keys(x).some(k => !['id', 'name', 'manufacturer', 'status', 'category', 'priceText', 'priority', 'memo', 'order', 'createdAt', 'updatedAt', 'ownedAt', 'soldAt', 'photoId', 'photoSourceId', 'photoCrop', 'legacy'].includes(k))) warnings.push('未表示の保存fieldあり（保持・書戻しなし）');
        return { id: x.id, name: x.name, manufacturer: optionalText(x.manufacturer, 100) ? x.manufacturer : '', memo: optionalText(x.memo, 1000) ? x.memo : '', priceText: optionalText(x.priceText, 100) ? x.priceText : '',
            status, statusLabel: statusNames.get(x.status) || '非対応: ' + (typeof x.status === 'string' ? x.status : '未確認'), categoryId, categoryLabel: categoryNames.get(categoryId) || (Object.hasOwn(LEGACY_CATEGORY_NAMES, categoryId) ? LEGACY_CATEGORY_NAMES[categoryId] : categoryId) || 'カテゴリ未確認', categoryMissing: !categoryNames.has(categoryId),
            order: Number.isSafeInteger(x.order) ? x.order : null, sourceIndex: index, priority: ['low', 'medium', 'high'].includes(x.priority) ? x.priority : null,
            createdAt: typeof x.createdAt === 'string' ? x.createdAt : null, updatedAt: typeof x.updatedAt === 'string' ? x.updatedAt : null, ownedAt: typeof x.ownedAt === 'string' ? x.ownedAt : null, soldAt: typeof x.soldAt === 'string' ? x.soldAt : null, image, warnings };
    });
    // Preserve per-status order from Port; an unsupported order is never invented.
    const orderedGear = GEAR_STATUSES.flatMap(({ id }) => projectedGear.filter(x => x.status === id).sort((a, b) => a.order !== null && b.order !== null ? a.order - b.order : a.sourceIndex - b.sourceIndex)).concat(projectedGear.filter(x => x.status === 'unsupported'));
    const apps = collection(raw, 'myApps', 1, 7, 'items');
    if (apps.items.some(x => !text(x.id, 128) || !text(x.name, 80))) { apps.state = 'invalid'; apps.items = []; }
    const practice = projectPractice(raw), menuRaw = collection(raw, 'practiceMenus', 1, 3, 'items'), historyRaw = collection(raw, 'practiceHistory', 1, 5, 'events');
    const validMenuIds = new Set(practice.menus.items.map(x => x.id)), validHistoryIds = new Set(practice.history.items.map(x => x.id));
    const projectedApps = apps.items.map((x, index) => {
        const warnings = [], iconPreset = typeof x.iconPresetKey === 'string' ? getMyAppsIconPreset(x.iconPresetKey) : null;
        const kind = x.launchMode === undefined && apps.version < 4 ? 'https' : x.launchMode;
        const known = kind === 'known-app' && typeof x.appKey === 'string' ? getKnownApp(x.appKey) : null;
        const typeLabel = kind === 'https' ? 'HTTPS登録' : kind === 'known-app' ? '既知アプリ設定（旧起動metadata）' : kind === 'custom' ? 'カスタム設定（旧起動metadata）' : '非対応の登録形式';
        if (!['https', 'known-app', 'custom'].includes(kind)) warnings.push('launchModeを補正しません');
        if (kind === 'known-app' && !known) warnings.push('既知アプリ参照を確認できません: ' + (typeof x.appKey === 'string' ? x.appKey : '未確認'));
        if (x.iconPresetKey != null && !iconPreset) warnings.push('非対応iconPresetKey: ' + (typeof x.iconPresetKey === 'string' ? x.iconPresetKey : '未確認'));
        if (x.iconPresetKey && x.iconId) warnings.push('プリセットとcustom icon参照が併存（補正なし）');
        if (Object.keys(x).some(k => !['id', 'name', 'url', 'urls', 'launchMode', 'appKey', 'customLaunch', 'iconId', 'iconSourceId', 'iconCrop', 'iconPresetKey', 'createdAt', 'updatedAt'].includes(k))) warnings.push('未表示の保存fieldあり（保持・書戻しなし）');
        const urls = [];
        for (const platform of ['ios', 'android', 'macos', 'windows', 'web']) if (object(x.urls) && Object.hasOwn(x.urls, platform) && x.urls[platform] !== '') urls.push(urlInfo(x.urls[platform], platform));
        if (x.url !== '') urls.push(urlInfo(x.url, 'legacy fallback'));
        if (object(x.customLaunch)) for (const platform of ['ios', 'android']) if (x.customLaunch[platform] != null) urls.push(urlInfo(x.customLaunch[platform], '旧customLaunch ' + platform));
        if (urls.some(u => u.state === 'unsupported')) warnings.push('非対応URLは文字列のみ表示し、補正・起動しません');
        const reference = 'myapp:' + x.id;
        const refs = menuRaw.items.filter(m => validMenuIds.has(m.id) && m.appId === reference).map(m => ({ type: 'menu', id: m.id, name: m.name, hidden: Boolean(m.hidden) }))
            .concat(historyRaw.items.filter(h => validHistoryIds.has(h.id) && h.appId === reference).map(h => ({ type: 'history', id: h.id, name: h.practiceName, localDate: h.localDate })));
        return { id: x.id, name: x.name, sourceIndex: index, type: typeof kind === 'string' ? kind : 'unsupported', typeLabel, appKey: typeof x.appKey === 'string' ? x.appKey : null, appLabel: known?.name || null,
            launch: { url: typeof x.url === 'string' ? x.url : '', urls: Object.fromEntries(['ios', 'android', 'macos', 'windows', 'web'].map(platform => [platform, object(x.urls) && typeof x.urls[platform] === 'string' ? x.urls[platform] : ''])) },
            urls, iconKind: x.iconPresetKey && x.iconId ? '併存参照' : x.iconId ? 'カスタム参照' : x.iconPresetKey ? 'プリセット参照' : '参照なし / 未確認', iconPresetKey: typeof x.iconPresetKey === 'string' ? x.iconPresetKey : null, iconPresetLabel: iconPreset?.label || null,
            image: imageMetadata(x, 'icon', assets?.myApps?.[x.id], meta.state), refs, menuRefsState: practice.menus.state, historyRefsState: practice.history.state,
            createdAt: typeof x.createdAt === 'string' ? x.createdAt : null, updatedAt: typeof x.updatedAt === 'string' ? x.updatedAt : null, warnings };
    });
    const filterCategories = categories.items.map(x => ({ id: x.id, name: x.name, missing: false }));
    for (const item of orderedGear) if (item.categoryId && !filterCategories.some(c => c.id === item.categoryId)) filterCategories.push({ id: item.categoryId, name: item.categoryLabel + '（参照先未確認）', missing: true });
    return freezePractice({ dataOwner: 'port', canWrite: false, gear: { state: gear.state, categoriesState: categories.state, items: orderedGear, categories: filterCategories }, myApps: { state: apps.state, items: projectedApps } });
}
export function filterLibraryItems(model, kind, { query = '', status = 'all', category = 'all' } = {}) {
    const needle = query.trim().toLocaleLowerCase('ja-JP');
    return model?.[kind]?.items.filter(x => (kind !== 'gear' || (status === 'all' || x.status === status) && (category === 'all' || x.categoryId === category)) && (!needle || (kind === 'gear' ? [x.name, x.manufacturer, x.memo, x.categoryLabel].join(' ') : x.name).toLocaleLowerCase('ja-JP').includes(needle))) || [];
}
