import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

assert.match(markup, /id="home-settings-button"[\s\S]*?表示設定を開く/);
assert.match(markup, /id="settings-view"[\s\S]*?data-display-size="large"[\s\S]*?data-display-size="standard"[\s\S]*?data-display-size="small"[\s\S]*?data-display-size="xsmall"/);
assert.match(markup, /data-display-size="standard"[\s\S]*?><span>中<\/span>/);
assert.doesNotMatch(markup, /<span>標準<\/span>/);
assert.match(markup, /id="icon-scale-preview-title">アイコンサイズ比較/);
for (const group of ['cruise', 'simple']) {
    for (const value of ['100', '90', '80', '70', '60', '50']) {
        assert.match(markup, new RegExp(`data-${group}-icon-scale-preview="${value}"`));
    }
}
assert.match(markup, /id="practice-menu-card" href="#practice-menu"/);
assert.doesNotMatch(markup, /<section class="port-section" aria-labelledby="practice-heading">/);
assert.match(markup, /id="wishlist-card" href="#wishlist"/);
assert.match(markup, /id="wishlist-card"[\s\S]*?>機材リスト</);
assert.doesNotMatch(markup, /欲しいものリスト/);
assert.match(markup, /id="wishlist-view"[\s\S]*?自分の機材や、[\s\S]*?これから欲しい機材を整理できる機能を準備中です/);
assert.match(markup, /id="my-apps-grid" class="card-grid home-card-grid"/);

assert.match(appSource, /hash === '#settings'/);
assert.match(appSource, /hash === '#wishlist'/);
assert.match(appSource, /hash === '#practice-menu'/);
assert.match(appSource, /applyHomeDisplaySize\(elements\.homeView, homeSettings\.displaySize\)/);
assert.match(appSource, /applyHomeIconScalePreviews\(elements\.homeView, homeIconScalePreviews\)/);
assert.match(appSource, /my-app-icon--\$\{getMyAppHomeIconKind\(item\)\}/);

for (const [size, columns] of [['large', 1], ['standard', 2], ['small', 4], ['xsmall', 6]]) {
    assert.match(styles, new RegExp(`data-display-size=\\"${size}\\"\\] \\.home-card-grid[\\s\\S]*?repeat\\(${columns}, minmax\\(0, 1fr\\)\\)`));
}

for (const [size, simpleBaseline] of [['large', 86], ['standard', 90], ['small', 60], ['xsmall', 39]]) {
    assert.match(styles, new RegExp(`data-display-size="${size}"\\] \\.home-card-grid \\.app-card img[\\s\\S]*?var\\(--cruise-icon-scale-preview\\)`));
    assert.match(styles, new RegExp(`data-display-size="${size}"\\] \\.home-card-grid \\.tool-card \\.skeleton-icon,[\\s\\S]*?home-card-grid \\.my-app-icon--preset,[\\s\\S]*?home-card-grid \\.my-app-icon--generic \\{[\\s\\S]*?calc\\(${simpleBaseline}px \\* var\\(--simple-icon-scale-preview\\)\\)`));
}

const comparisonStart = styles.indexOf('/* Temporary U1.4 comparison.');
const comparisonEnd = styles.indexOf('\n.my-app-external-mark', comparisonStart);
const comparisonStyles = styles.slice(comparisonStart, comparisonEnd);
assert.match(comparisonStyles, /my-app-icon--generic/);
assert.doesNotMatch(comparisonStyles, /my-app-icon--custom/);
assert.doesNotMatch(comparisonStyles, /transform: scale/);

console.log('home-ui: settings, display densities, Practice Menu integration, and wishlist placeholder tests passed');
