import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

assert.match(markup, /id="home-settings-button"[\s\S]*?表示設定を開く/);
assert.match(markup, /id="settings-view"[\s\S]*?data-display-size="large"[\s\S]*?data-display-size="standard"[\s\S]*?data-display-size="small"[\s\S]*?data-display-size="xsmall"/);
assert.match(markup, /data-display-size="standard"[\s\S]*?><span>中<\/span>/);
assert.doesNotMatch(markup, /<span>標準<\/span>/);
assert.doesNotMatch(markup, /アイコンサイズ比較/);
assert.doesNotMatch(markup, /data-(?:cruise|simple)-icon-scale-preview/);
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
assert.doesNotMatch(appSource, /applyHomeIconScalePreviews|loadIconScalePreviews|saveIconScalePreview|homeIconScalePreviews/);
assert.match(appSource, /my-app-icon--\$\{getMyAppHomeIconKind\(item\)\}/);

for (const [size, columns] of [['large', 1], ['standard', 2], ['small', 4], ['xsmall', 6]]) {
    assert.match(styles, new RegExp(`data-display-size=\\"${size}\\"\\] \\.home-card-grid[\\s\\S]*?repeat\\(${columns}, minmax\\(0, 1fr\\)\\)`));
}

for (const [size, cruiseBaseline, simpleBaseline] of [['large', 80, 86], ['standard', 84, 90], ['small', 56, 60], ['xsmall', 36, 39]]) {
    assert.match(styles, new RegExp(`data-display-size="${size}"\\] \\.home-card-grid \\.app-card img[\\s\\S]*?calc\\(${cruiseBaseline}px \\* 0\\.9\\)`));
    assert.match(styles, new RegExp(`data-display-size="${size}"\\] \\.home-card-grid \\.tool-card \\.skeleton-icon,[\\s\\S]*?home-card-grid \\.my-app-icon--preset,[\\s\\S]*?home-card-grid \\.my-app-icon--generic \\{[\\s\\S]*?calc\\(${simpleBaseline}px \\* 0\\.7\\)`));
}

assert.doesNotMatch(styles, /icon-scale-preview|cruise-icon-scale-preview|simple-icon-scale-preview/);
const formalIconRuleStart = styles.indexOf('/* Formal U1.5 balance:');
const formalIconRuleEnd = styles.indexOf('\n.my-app-external-mark', formalIconRuleStart);
const formalIconRules = styles.slice(formalIconRuleStart, formalIconRuleEnd);
assert.equal(formalIconRuleStart >= 0, true);
assert.doesNotMatch(formalIconRules, /my-app-icon--custom/);
assert.doesNotMatch(formalIconRules, /transform: scale/);

console.log('home-ui: settings, display densities, Practice Menu integration, and wishlist placeholder tests passed');
