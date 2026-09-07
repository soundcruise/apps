import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const store = readFileSync(new URL('./gear-list-store.js', import.meta.url), 'utf8');
const gearFormMarkup = markup.match(/<form id="gear-list-form"[\s\S]*?<\/form>/)?.[0] || '';
const gearSource = source.match(/function findGearItem[\s\S]*?function renderRoute/)?.[0] || '';

assert.match(markup, /id="wishlist-card" href="#wishlist"/);
assert.match(markup, /id="gear-owned-tab"[\s\S]*?role="tab"[\s\S]*?自分の機材/);
assert.match(markup, /id="gear-wishlist-tab"[\s\S]*?role="tab"[\s\S]*?ほしい物リスト/);
assert.match(markup, /id="gear-category-filter"/);
assert.match(markup, /id="gear-owned-preview"[\s\S]*?今持っている機材/);
assert.match(markup, /id="gear-list-form"[\s\S]*?id="gear-name"[\s\S]*?id="gear-category"[\s\S]*?id="gear-price"[\s\S]*?id="gear-status"[\s\S]*?id="gear-priority"[\s\S]*?id="gear-memo"/);
assert.doesNotMatch(gearFormMarkup, /id="gear-manufacturer"|name="manufacturer"|>メーカー</);
assert.doesNotMatch(gearFormMarkup, /id="gear-url"|name="url"|>URL</);
assert.match(markup, /maxlength="100"/);
assert.match(markup, /id="gear-memo"[\s\S]*?maxlength="1000"/);
assert.match(markup, /id="gear-category"[\s\S]*?<option value="">選択してください<\/option>/);
assert.match(markup, /id="gear-price" name="priceText" type="text" maxlength="100"/);
assert.match(markup, /placeholder="例：198,000円、約20万円、未定"/);
assert.doesNotMatch(gearFormMarkup, /id="gear-price"[^>]*type="number"|name="priceYen"|inputmode="numeric"/);
assert.match(markup, /option value="owned">自分の機材/);
assert.match(markup, /option value="wishlist">ほしい物リスト/);

for (const category of ['guitar', 'effects', 'amp', 'dtm', 'recording', 'accessories', 'other']) {
    assert.match(store, new RegExp(`key: '${category}'`));
}
assert.match(store, /GEAR_LIST_STORAGE_KEY = 'cruisePort\.gearList'/);
assert.match(store, /GEAR_LIST_SCHEMA_VERSION = 2/);
assert.doesNotMatch(store, /localStorage\.clear/);

assert.match(source, /parseGearRoute\(hash\)/);
assert.match(source, /#wishlist\/new/);
assert.match(source, /#wishlist\/\$\{encodeURIComponent\(item\.id\)\}\/edit/);
assert.match(source, /replaceGearListRoute\(\)/);
assert.match(source, /saveGearList\(candidateItems\)/);
assert.match(source, /gearState\.items = candidateItems/);
assert.match(source, /getInitialGearCategory\(gearState\.activeCategory\)/);
assert.match(source, /elements\.gearCategoryInput\.value = item\?\.category \|\| getInitialGearCategory/);
assert.match(source, /markGearPurchased\(gearState\.items, item\.id\)/);
assert.match(source, /\$\{item\.name\}を自分の機材に追加しますか？/);
assert.match(source, /\$\{item\.name\}を機材リストから削除しますか？/);
assert.match(source, /\$\{item\.name\}をほしい物リストから削除しますか？/);
assert.match(source, /price\.textContent = item\.priceText/);
assert.match(source, /detail\.textContent = getGearCategoryLabel\(item\.category\)/);
assert.doesNotMatch(source, /gearManufacturerInput|gearUrlInput|formatGearPrice/);
assert.doesNotMatch(gearSource, /item\.manufacturer|item\.url|item\.priceYen/);
assert.doesNotMatch(gearSource, /商品ページを開く/);
assert.doesNotMatch(source, /innerHTML/);
assert.doesNotMatch(source, /localStorage\.clear/);

assert.match(styles, /\.gear-category-filter[\s\S]*?overflow-x: auto/);
assert.match(styles, /\.gear-owned-preview-list[\s\S]*?overflow-x: auto/);
assert.match(styles, /\.gear-card-memo[\s\S]*?-webkit-line-clamp: 3/);
assert.match(styles, /\.gear-card-actions/);

console.log('gear-list-ui: core UI, safe rendering, routing, and mobile layout checks passed');
