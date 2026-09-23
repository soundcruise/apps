export const GEAR_GRID_STORAGE_KEY = 'cruisePort.gearGridColumns';
export const GEAR_TABS = Object.freeze([
    { status: 'all', label: '全て' },
    { status: 'owned', label: '自分の機材' },
    { status: 'wishlist', label: 'ほしい機材' }
]);
const GEAR_STATUS_LABELS = Object.freeze({ owned: '自分の機材', sold: '手放した機材', wishlist: 'ほしい機材' });

export function gearCardLabel(item) {
    return [item.manufacturer?.trim(), item.name?.trim()].filter(Boolean).join(' / ');
}

export function gearGridColumns(storage = globalThis.localStorage) {
    try {
        const columns = Number(storage.getItem(GEAR_GRID_STORAGE_KEY));
        return [1, 2, 3, 4].includes(columns) ? columns : 1;
    } catch (_) { return 1; }
}

export function saveGearGridColumns(columns, storage = globalThis.localStorage) {
    if (![1, 2, 3, 4].includes(columns)) return false;
    try { storage.setItem(GEAR_GRID_STORAGE_KEY, String(columns)); return true; }
    catch (_) { return false; }
}

export function gearItemsForExport(items, activeStatus, activeCategory = 'all') {
    const statuses = activeStatus === 'all' ? ['owned', 'sold', 'wishlist']
        : activeStatus === 'owned' ? ['owned', 'sold'] : [activeStatus];
    return statuses.flatMap((status) => items.filter((item) => item.status === status
        && (activeCategory === 'all' || item.category === activeCategory)).sort((a, b) => a.order - b.order));
}

function safeCsvCell(value) {
    let text = String(value ?? '');
    if (/^\s*[=+@-]/u.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
}

export function gearListCsv(items, categories) {
    const columns = ['メーカー', '名前', 'カテゴリー', '状態', '価格', '優先度', 'メモ', '登録日', '所有開始日', '手放した日'];
    const rows = items.map((item) => [
        item.manufacturer, item.name, categories.find((category) => category.id === item.category)?.name || item.category,
        GEAR_STATUS_LABELS[item.status] || item.status,
        item.priceText, item.priority === 'high' ? '高' : item.priority === 'low' ? '低' : '中',
        item.memo, item.createdAt, item.ownedAt, item.soldAt
    ]);
    return `\uFEFF${[columns, ...rows].map((row) => row.map(safeCsvCell).join(',')).join('\r\n')}\r\n`;
}

export function gearItemText(item, categories) {
    const category = categories.find((value) => value.id === item.category)?.name || item.category;
    const status = GEAR_STATUS_LABELS[item.status] || item.status;
    return `メーカー：${item.manufacturer || ''}\n名前：${item.name}\nカテゴリー：${category}\n状態：${status}\n価格：${item.priceText || ''}\n優先度：${item.priority === 'high' ? '高' : item.priority === 'low' ? '低' : '中'}\nメモ：${item.memo || ''}\n`;
}

export async function shareGearText(item, categories, { navigatorObject = globalThis.navigator, download } = {}) {
    const text = gearItemText(item, categories);
    if (typeof navigatorObject?.share === 'function') {
        try { await navigatorObject.share({ title: gearCardLabel(item), text }); return 'shared'; }
        catch (error) { if (error?.name === 'AbortError') return 'cancelled'; }
    }
    download(text, `${item.name.replace(/[\\/:*?"<>|]/gu, '_')}.txt`, 'text/plain;charset=utf-8');
    return 'downloaded';
}
