import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');

test('Practice action padding grows without changing its gap or touch height', () => {
    const css = read('style.css');
    assert.match(css, /\.practice-menu-card \.practice-launch,\s*\.practice-menu-card \.practice-files-button\s*\{\s*padding-inline: 10px;/);
    assert.match(css, /\.practice-card-actions\s*\{[^}]*gap: 4px;/);
    assert.match(css, /\.practice-launch,\s*\.practice-files-button\s*\{\s*min-height: 44px;/);
});

test('detail title and compact edit share a bounded header row in both editions', () => {
    const css = read('style.css');
    assert.match(css, /\.practice-detail-top-actions\s*\{[^}]*display: flex;[^}]*gap: 12px;/);
    assert.match(css, /#practice-edit-top\s*\{[^}]*width: auto;[^}]*min-width: 58px;[^}]*min-height: 44px;/);
    assert.match(css, /\.practice-detail-top-actions h1\s*\{[^}]*-webkit-line-clamp: 2;/);
    for (const file of ['index.html', 'pro_9a3943176561/index.html']) {
        assert.match(read(file), /practice-detail-top-actions[\s\S]*practice-detail-title[\s\S]*practice-edit-top/);
    }
});

test('practice calendar uses a robust filled pick and retains the other formal icons', () => {
    const source = read('practice-menu-app.js');
    const pick = source.match(/practice: \[\['path', \{ d: '([^']+)', fill: 'currentColor', stroke: 'none' \}\]\]/);
    assert.ok(pick);
    assert.match(pick[1], /^M12 3C/);
    for (const key of ['live', 'rehearsal', 'studio', 'recording', 'work', 'rest', 'schedule']) {
        assert.match(source, new RegExp(`\\n    ${key}:`));
    }
});
