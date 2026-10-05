#!/usr/bin/env python3
"""Render canonical legal texts as one static, script-free reading page."""
import argparse
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCUMENTS = (
    ('license', 'LICENSE', 'ライセンス'),
    ('ai-policy', 'SECURITY-AND-AI-POLICY.md', 'セキュリティ・AI利用方針'),
    ('notice', 'NOTICE', '第三者ライセンス等の通知'),
)


def render():
    nav = ''.join('<a href="#{}">{}</a>'.format(key, title)
                  for key, _, title in DOCUMENTS)
    sections = ''.join(
        '<section id="{}"><h2>{}</h2><p>原文ファイル：<a href="{}">{}</a></p>'
        '<pre>{}</pre></section>\n'.format(key, title, filename, filename,
                                        escape((ROOT / filename).read_text(encoding='utf-8')))
        for key, filename, title in DOCUMENTS)
    return '''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SOUND CRUISE | 権利・AI利用方針・第三者通知</title>
<style>
body{margin:0;background:#121214;color:#eee;font:16px/1.8 system-ui,sans-serif}
main{box-sizing:border-box;max-width:960px;margin:auto;padding:28px 20px 60px}
h1{font-size:1.5rem}h2{font-size:1.2rem}a{color:#ffe582;overflow-wrap:anywhere}
nav{display:flex;flex-wrap:wrap;gap:12px 20px}section{margin-top:36px;scroll-margin-top:20px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;border:1px solid #555;border-radius:12px;padding:16px}
a:focus-visible{outline:2px solid #ffe582;outline-offset:4px}
</style>
</head>
<body><main>
<h1>権利・AI利用方針・第三者通知</h1>
<p>以下はリポジトリの正文をそのまま表示しています。第三者素材には各ライセンスが優先します。</p>
<nav aria-label="文書を選択">''' + nav + '</nav>\n' + sections + '''
</main></body>
</html>
'''


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    page = ROOT / 'legal.html'
    content = render()
    if args.check:
        if not page.exists() or page.read_text(encoding='utf-8') != content:
            raise SystemExit('legal.html is stale; run tools/generate-legal-viewer.py')
        print('legal.html matches all three canonical documents')
    else:
        page.write_text(content, encoding='utf-8')
