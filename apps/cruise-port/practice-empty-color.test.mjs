import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
test('only Practice empty heading reuses the danger text color in both editions', () => {
    const css = read('style.css');
    const rule = css.match(/#practice-empty > p\s*\{([^}]+)\}/)[1].trim();
    assert.equal(rule, 'color: #e2aaa2;');
    assert.match(css, /\.danger-action\s*\{[^}]*color: #e2aaa2;/);
    for (const file of ['index.html', 'pro_9a3943176561/index.html']) {
        assert.match(read(file), /id="practice-empty"[^>]*>\s*<p>まだ練習メニューがありません<\/p>/);
    }
});
