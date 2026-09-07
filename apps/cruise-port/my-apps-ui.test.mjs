import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

assert.match(markup, /id="my-apps-url-help-toggle"[^>]+aria-expanded="false"[^>]+aria-controls="my-apps-url-help"/);
assert.match(markup, /id="my-apps-url-help"[^>]+hidden/);
assert.match(markup, /ホーム画面で追加したいアプリを長押し/);
assert.match(markup, /Google Playの商品ページを開く/);
assert.match(markup, /「3点リーダー」から「共有」を選ぶ/);
assert.match(markup, /「アプリ情報」を選ぶ/);
assert.match(markup, /画面最下部付近の「アプリの詳細」を選ぶ/);
assert.match(markup, /表示名や位置は端末によって異なる場合があります/);
assert.match(markup, /id="my-apps-url-help-close"[^>]+aria-label="URLの取得方法を閉じる"/);
assert.match(markup, /id="my-apps-icon-preset-open"[^>]+aria-controls="my-apps-icon-preset-picker"/);
assert.match(markup, /id="my-apps-icon-preset-picker"[^>]+hidden/);
assert.match(markup, /id="my-apps-section"/);
assert.match(markup, /data-action="my-apps-home-scroll"/);
assert.match(markup, /id="tuner-card"[\s\S]*?src="\.\/assets\/my-app-icons\/tool-tuner\.png\?v=0\.13\.1"[\s\S]*?alt=""/);
assert.match(markup, /id="metronome-card"[\s\S]*?src="\.\/assets\/my-app-icons\/tool-metronome\.png\?v=0\.13\.1"[\s\S]*?alt=""/);

assert.match(appSource, /setMyAppsUrlHelpOpen\(elements\.myAppsUrlHelp\.hidden\)/);
assert.match(appSource, /createMyAppsPresetGraphic\(preset\.key/);
assert.match(appSource, /onAssetError: \(\) => icon\.replaceChildren\(fallback\)/);
assert.match(appSource, /iconAction = 'preset'/);
assert.match(appSource, /iconPresetKey: myAppsState\.iconAction === 'preset'/);
assert.match(appSource, /pendingHomeScrollTarget = 'my-apps-section'/);
assert.match(appSource, /pendingHomeScrollTarget = null/);
assert.match(appSource, /scrollIntoView\(\{ behavior: reducedMotion \? 'auto' : 'smooth', block: 'start' \}\)/);
assert.match(appSource, /\[data-action="my-apps-home-scroll"\]/);
assert.doesNotMatch(appSource, /window\.open\(/);

assert.match(styles, /#my-apps-section[\s\S]*scroll-margin-top/);
assert.match(styles, /my-apps-icon-preset-picker[\s\S]*grid-template-columns:\s*repeat\(4/);
assert.match(styles, /my-apps-preset-option\.is-selected/);
assert.match(styles, /\.my-apps-preset-option > img[\s\S]*?width: 42px/);
assert.match(styles, /\.skeleton-icon > img[\s\S]*?object-fit: contain/);
assert.match(styles, /@media \(max-width: 420px\)[\s\S]*my-apps-url-help-columns[\s\S]*grid-template-columns:\s*1fr/);

console.log('my-apps-ui: URL help, trusted preset picker, and one-time return scroll wiring tests passed');
