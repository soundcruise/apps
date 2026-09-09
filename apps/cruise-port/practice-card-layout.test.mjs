import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('narrow Practice cards reserve a separate wrapping row for launch and file actions', () => {
    const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
    const narrow = css.slice(css.indexOf('@media (max-width: 420px)'));
    assert.match(narrow, /\.practice-menu-card\s*\{\s*grid-template-columns: 44px minmax\(0, 1fr\) 18px;/);
    assert.match(narrow, /\.practice-card-actions\s*\{[^}]*grid-column: 2 \/ -1;[^}]*grid-row: 2;[^}]*flex-wrap: wrap;/);
    assert.match(narrow, /\.practice-card-actions:empty\s*\{\s*display: none;/);
    // Narrow layout must not shrink the interactive controls below 44px.
    assert.match(css, /\.practice-check\s*\{\s*width: 44px;\s*height: 44px;/);
    assert.match(css, /\.practice-launch,\s*\.practice-files-button\s*\{\s*min-height: 44px;/);
});
