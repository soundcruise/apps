import { practiceFixture, serializeFixture } from './practice-fixture.mjs';
export { serializeFixture };
export function libraryFixture() {
    const data = practiceFixture(), date = '2026-10-14T00:00:00.000Z';
    delete data['cruisePort.syncAssetMetadata'].attachments.broken;
    const gear = (id, name, status, order, category = 'guitar') => ({ id, name, manufacturer: 'SOUND', status, order, category, priceText: '¥100,000', priority: 'medium', memo: '練習用', photoId: null, photoSourceId: null, photoCrop: null, createdAt: date, updatedAt: date, ownedAt: status === 'wishlist' ? null : date, soldAt: status === 'sold' ? date : null });
    data['cruisePort.gearList'] = { version: 5, items: [gear('g2', '後のギター', 'owned', 2), { ...gear('g1', '最初のギター', 'owned', 0), photoId: 'photo1', photoSourceId: 'source1', photoCrop: { x: .1, y: .2, size: .8 } }, gear('wish', '欲しいアンプ', 'wishlist', 0, 'amp'), gear('sold', '手放した機材', 'sold', 0, 'deleted-category')] };
    data['cruisePort.gearCategories'] = { version: 1, categories: [{ id: 'guitar', name: 'ギター' }, { id: 'amp', name: 'アンプ' }] };
    const app = (id, name, changes = {}) => ({ id, name, url: 'https://example.invalid/' + id, urls: { ios: '', android: '', macos: '', windows: '', web: 'https://example.invalid/' + id }, launchMode: 'https', appKey: null, customLaunch: null, iconId: null, iconSourceId: null, iconCrop: null, iconPresetKey: null, createdAt: date, updatedAt: date, ...changes });
    data['cruisePort.myApps'] = { version: 7, items: [app('custom', '自分の練習アプリ', { iconId: 'icon1', iconSourceId: 'icon-source1', iconCrop: { x: .1, y: .2, size: .8 } }), app('preset', 'プリセット利用', { iconPresetKey: 'metronome' }), app('known', '既知アプリ登録', { launchMode: 'known-app', appKey: 'spotify' }), app('legacy-custom', '旧カスタム登録', { launchMode: 'custom', customLaunch: { ios: 'https://example.invalid/ios', android: null } })] };
    data['cruisePort.syncAssetMetadata'].gear = { g1: { published: { availability: 'available', final: { assetId: 'private-gear-asset', byteSize: 123, mimeType: 'image/png' }, source: { assetId: 'private-source' } } } };
    data['cruisePort.syncAssetMetadata'].myApps = { custom: { published: { availability: 'available', final: { assetId: 'private-icon-asset', byteSize: 98, mimeType: 'image/webp' } } } };
    data['cruisePort.practiceHistory'].events[0].appId = 'myapp:custom';
    return data;
}
