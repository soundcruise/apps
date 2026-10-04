"""Loopback-only Port preview; public NEWS GET proxy, no credentials or writes.

Usage: python3 scripts/port-local-preview.py [port]
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, urlencode, unquote
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_NEWS = 'https://sound-cruise-news.cruise-port-requests.workers.dev/v1/news'

class Preview(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_HEAD(self):
        # Avoid the base class's unguarded static-file HEAD path.
        self.send_error(405)

    def do_GET(self):
        host = self.headers.get('Host', '')
        if not re.fullmatch(r'(?:127\.0\.0\.1|localhost|\[::1\])(?::[0-9]{1,5})?', host):
            return self.send_error(403)
        url = urlsplit(self.path)
        if url.path != '/__cruise_preview/news':
            path = Path(unquote(url.path).lstrip('/'))
            if (not (ROOT / path).resolve().is_relative_to(ROOT / 'apps')
                    or any(part.startswith('.') or part == 'node_modules' for part in path.parts)):
                return self.send_error(404)
            return super().do_GET()
        origin = self.headers.get('Origin')
        expected = 'http://' + self.headers.get('Host', '')
        if origin and origin != expected:
            return self.send_error(403)
        params = parse_qs(url.query, keep_blank_values=True)
        if set(params) - {'limit', 'offset', 'cursor'} or any(len(v) != 1 for v in params.values()):
            return self.send_error(400)
        if any(len(v[0]) > 400 for v in params.values()):
            return self.send_error(400)
        for key in ('limit', 'offset'):
            if key in params and (not params[key][0].isdigit() or int(params[key][0]) > (50 if key == 'limit' else 10000)):
                return self.send_error(400)
        try:
            # Fixed public endpoint; neither browser cookies nor Origin/Auth
            # headers are forwarded. Never contacts publisher article pages.
            result = subprocess.run(['curl', '--disable', '--silent', '--show-error', '--max-time', '10',
                '--proto', '=https', '--header', 'Accept: application/json',
                '--write-out', '\n%{http_code}',
                PUBLIC_NEWS + '?' + urlencode({k: v[0] for k, v in params.items()})],
                capture_output=True, check=True, timeout=12)
            payload, code = result.stdout.rsplit(b'\n', 1)
            status = int(code)
        except (subprocess.SubprocessError, ValueError):
            payload, status = b'{"error":"preview_news_unavailable"}', 503
        if len(payload) > 2_000_000:
            return self.send_error(502)
        try:
            json.loads(payload)
        except (ValueError, UnicodeError):
            return self.send_error(502)
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(payload)

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8765), Preview).serve_forever()
