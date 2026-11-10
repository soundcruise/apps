"""Offline UI fixture only: python3 apps/cruise-studio/scripts/serve-local-ui.py"""
import http.server
import pathlib
import subprocess
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[3]
PORT = 18874
CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'self'; frame-ancestors 'none'; worker-src 'none'"

def render():
    return subprocess.check_output(['node', str(pathlib.Path(__file__).with_name('local-ui-entry.mjs'))], cwd=ROOT)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def end_headers(self):
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()
    def do_GET(self):
        if self.headers.get('Host') != '127.0.0.1:18874':
            self.send_error(403); return
        path = urllib.parse.urlsplit(self.path).path
        if path == '/':
            body = render()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers(); self.wfile.write(body); return
        # No other HTML entry, gate, cloud or Account API is exposed here.
        if not path.startswith('/apps/') or '..' in urllib.parse.unquote(path).split('/') or any(s in path for s in ['/cloud/', '/sync-account/', '/pro-gate', '/pro-device-session', '/studio-entry.mjs']) or pathlib.Path(path).suffix not in ['.js', '.mjs', '.css', '.svg', '.png', '.woff2']:
            self.send_error(404); return
        resolved = (ROOT / path.lstrip('/')).resolve()
        if ROOT not in resolved.parents:
            self.send_error(404); return
        super().do_GET()
    def do_HEAD(self):
        self.send_error(405)
    def do_POST(self):
        self.send_error(405)
    def log_message(self, *_):
        pass # No request URLs, inputs or credentials in logs.

if __name__ == '__main__':
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print('LOCAL DEVELOPMENT / 本番認証の検証対象外: http://127.0.0.1:18874/', flush=True)
    server.serve_forever()
