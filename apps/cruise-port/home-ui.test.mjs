import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

assert.match(markup, /id="home-settings-button"[\s\S]*?表示設定を開く/);
assert.match(markup, /id="settings-view"[\s\S]*?data-display-size="large"[\s\S]*?data-display-size="standard"[\s\S]*?data-display-size="small"[\s\S]*?data-display-size="xsmall"/);
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

for (const [size, columns] of [['large', 1], ['standard', 2], ['small', 4], ['xsmall', 6]]) {
    assert.match(styles, new RegExp(`data-display-size=\\"${size}\\"\\] \\.home-card-grid[\\s\\S]*?repeat\\(${columns}, minmax\\(0, 1fr\\)\\)`));
}

console.log('home-ui: settings, display densities, Practice Menu integration, and wishlist placeholder tests passed');
