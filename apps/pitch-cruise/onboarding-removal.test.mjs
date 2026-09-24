import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Pitch no longer shows temporary onboarding: the "まずはこちらをチェック" bubble and the
// "New" badges on Information, Settings and Test Mode. The features themselves remain.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const script = read('./script.js');
const theme = read('./theme.css');
const pages = { standard: read('./standard/index.html'), beta: read('./beta/index.html'), pro: read('./pro_x9v7q2m8/index.html') };
const REMOVED_IDS = ['home-info-intro', 'home-settings-new-badge', 'home-info-new-badge', 'test-mode-new-badge'];

test('onboarding bubble and New badges are gone from every Pitch edition', () => {
  for (const [edition, html] of Object.entries(pages)) {
    for (const id of REMOVED_IDS) assert.doesNotMatch(html, new RegExp(`id="${id}"`), `${edition}: ${id}`);
    assert.doesNotMatch(html, /まずはこちらをチェック/, edition);
  }
});

test('no script path shows or tracks the removed onboarding UI', () => {
  for (const pattern of [/maybeShowInfoIntro|dismissInfoIntro|maybeShowInfoNewBadge|dismissInfoNewBadge/,
    /_initNewBadges|SETTINGS_NEW_BADGE_KEY|TEST_MODE_NEW_BADGE_KEY|initInfoNewBadge|shouldShowInfoNewBadge/,
    /home-info-intro|home-settings-new-badge|home-info-new-badge|test-mode-new-badge/]) {
    assert.doesNotMatch(script, pattern);
  }
  assert.doesNotMatch(theme, /\.settings-new-badge|\.tm-new-badge/);
});

test('the Information page shows no New badges but keeps its links', () => {
  const info = read('./info.html');
  assert.doesNotMatch(info, /recommended-videos-new-badge|pro-access-new-badge|>New</);
  assert.doesNotMatch(info, /pitchCruiseInfoNewSeen|pitchCruiseRecommendedNewSeen/, 'seen flags are no longer read or written');
  assert.match(info, /id="recommended-videos-link"[\s\S]*おすすめの関連動画リスト/);
  assert.match(info, /id="standard-pro-access-link"[\s\S]*PRO版の入手方法/);
});

test('Information, Settings and Test Mode remain available', () => {
  for (const html of [pages.standard, pages.pro]) {
    assert.match(html, /class="home-info-link icon-btn home-info-link--final"/);
    assert.match(html, /id="home-settings-btn"/);
    assert.match(html, /id="test-mode-toggle"/);
    assert.match(html, /id="test-mode-info-btn"/);
  }
  assert.match(script, /_initTestModeInfoAccordion\(\);/);
  for (const html of Object.values(pages)) assert.match(html, /theme\.css\?v=13"/);
});
