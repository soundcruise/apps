import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

assert.match(markup, /id="my-apps-url-help-toggle"[^>]+aria-expanded="false"[^>]+aria-controls="my-apps-url-help"/);
assert.match(markup, /id="my-apps-url-help"[^>]+hidden/);
assert.match(markup, /ホーム画面で追加したいアプリを長押し/);
assert.match(markup, /Google Playで対象アプリを開く/);
assert.match(markup, /id="my-apps-url-help-close"[^>]+aria-label="URLの取得方法を閉じる"/);
assert.match(markup, /id="my-apps-icon-preset-open"[^>]+aria-controls="my-apps-icon-preset-picker"/);
assert.match(markup, /id="my-apps-icon-preset-picker"[^>]+hidden/);
assert.match(markup, /id="my-apps-section"/);
assert.match(markup, /data-action="my-apps-home-scroll"/);
assert.match(markup, /id="tuner-card"[\s\S]*?<svg viewBox="0 0 64 64" role="img">[\s\S]*?M13 46a19 19 0 0 1 38 0[\s\S]*?aria-hidden="true"/);
assert.match(markup, /id="metronome-card"[\s\S]*?<svg viewBox="0 0 64 64" role="img">[\s\S]*?M23 13h18l8 39H15l8-39Z[\s\S]*?aria-hidden="true"/);

assert.match(appSource, /setMyAppsUrlHelpOpen\(elements\.myAppsUrlHelp\.hidden\)/);
assert.match(appSource, /createMyAppsPresetSvg\(preset\.key\)/);
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
assert.match(styles, /@media \(max-width: 420px\)[\s\S]*my-apps-url-help-columns[\s\S]*grid-template-columns:\s*1fr/);

console.log('my-apps-ui: URL help, trusted preset picker, and one-time return scroll wiring tests passed');
