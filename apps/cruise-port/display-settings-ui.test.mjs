import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');

test('heading-only focus suppression preserves existing keyboard rings and route focus', () => {
    assert.match(css, /\.port-view \.view-title\[tabindex="-1"\]:focus \{ outline: none; \}/);
    assert.match(css, /\.settings-choice:focus-visible/);
    assert.match(app, /settingsTitle\.focus\(\{ preventScroll: true \}\)/);
    assert.doesNotMatch(css, /(?:\*|button):focus\s*\{\s*outline:\s*none/);
});

test('font choices use independent field and stable baseline, not global rem geometry scaling', () => {
    for (const [key, scale] of [['small','0.9'],['medium','1'],['large','1.13'],['xlarge','1.26']]) {
        assert.ok(html.includes(`data-font-size="${key}"`));
        assert.ok(css.includes(`:root[data-font-size="${key}"] { --font-scale: ${scale}; }`));
    }
    for (const selector of ['.tempo-value', '.tuner-note', '.practice-timer-card time', '.practice-calendar-day']) {
        const body = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
        assert.doesNotMatch(body, /--font-scale/);
    }
    assert.match(css, /input,\s*select,\s*textarea[\s\S]*?font-size: max\(1rem,/);
});

test('settings handlers keep complete drafts, use the guarded store, and limit reset scope', () => {
    const handlers = app.slice(app.indexOf('function updateDisplaySettings(next)'), app.indexOf('elements.myAppsForm.addEventListener'));
    assert.match(handlers, /saveSettings\(next\)/);
    assert.match(handlers, /\.\.\.homeSettings, \[field\]/);
    assert.match(handlers, /window\.confirm/);
    assert.match(handlers, /updateDisplaySettings\(DEFAULT_SETTINGS\)/);
    assert.doesNotMatch(handlers, /localStorage|indexedDB|deleteDatabase|removeItem/);
    assert.match(app, /row\.append\(button\)/);
    assert.match(app, /button\.disabled = index \+ direction/);
    assert.match(app, /cruise-port-storage-conflict/);
});
