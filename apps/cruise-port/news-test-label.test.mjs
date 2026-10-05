import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

for (const path of ['index.html','pro_9a3943176561/index.html']) {
    test(`${path}: NEWS heading keeps its accessible name and adjacent visible test label`, () => {
        const html=readFileSync(new URL(path,import.meta.url),'utf8');
        const section=html.match(/<main id="news-view"[\s\S]*?<\/main>/)[0];
        assert.match(section, /aria-labelledby="news-title"/);
        assert.match(section, /<div class="news-heading">\s*<h1 id="news-title" class="view-title" tabindex="-1">ニュース<\/h1>\s*<span class="news-test-label">テスト中<\/span>\s*<\/div>/);
        assert.equal((section.match(/テスト中/g)||[]).length,1);
        assert.match(section, /<div id="news-content">/);
        assert.match(section, /ニュースの修正・掲載停止のお問い合わせ/);
        assert.doesNotMatch(section, /aria-hidden="true"|role="alert"|試験運用|β版/);
    });
}

test('test label has a restrained outline and the heading centers it without wrapping', () => {
    const css=readFileSync(new URL('style.css',import.meta.url),'utf8');
    const badge=css.match(/\.news-test-label \{([^}]+)\}/)[1];
    assert.match(badge, /border: 1px solid rgba\(var\(--port-accent-line-rgb\), 0\.45\)/);
    assert.match(badge, /color: rgb\(var\(--port-accent-rgb\)\)/);
    assert.match(badge, /background: transparent/);
    assert.match(badge, /border-radius: 4px/);
    assert.match(badge, /box-shadow: none/);
    assert.match(css, /\.news-heading \{[^}]*align-items: center;[^}]*flex-wrap: nowrap/);
});
