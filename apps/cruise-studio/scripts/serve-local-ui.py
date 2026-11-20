"""Offline UI fixture only: python3 apps/cruise-studio/scripts/serve-local-ui.py"""
import http.server
import pathlib
import subprocess
import urllib.parse
import importlib.util

spec = importlib.util.spec_from_file_location('viewer_mock', pathlib.Path(__file__).with_name('local-viewer-sync.py'))
viewer_mock = importlib.util.module_from_spec(spec)
spec.loader.exec_module(viewer_mock)

ROOT = pathlib.Path(__file__).resolve().parents[3]
PORT = 18874
PDF_ASSETS = 'http://127.0.0.1:18874/apps/score-viewer/vendor/pdfjs/'
CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src " + PDF_ASSETS + "; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'self'; frame-ancestors 'none'; worker-src " + PDF_ASSETS + "pdf.worker.min.mjs"
VIEWER_LOCAL = '/apps/score-viewer/local/'
LOCAL_CSP = CSP.replace('connect-src ' + PDF_ASSETS, "connect-src 'self'").replace('worker-src ' + PDF_ASSETS + 'pdf.worker.min.mjs', 'worker-src ' + PDF_ASSETS + 'pdf.worker.min.mjs http://127.0.0.1:18874' + VIEWER_LOCAL + 'sw.js')

def render():
    return subprocess.check_output(['node', str(pathlib.Path(__file__).with_name('local-ui-entry.mjs'))], cwd=ROOT)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def end_headers(self):
        local_viewer = urllib.parse.urlsplit(self.path).path.startswith(VIEWER_LOCAL)
        self.send_header('Content-Security-Policy', LOCAL_CSP if local_viewer else CSP)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()
    def do_GET(self):
        if self.headers.get('Host') != '127.0.0.1:18874':
            self.send_error(403); return
        if viewer_mock.handle(self, 'GET'): return
        path = urllib.parse.urlsplit(self.path).path
        if path in [VIEWER_LOCAL, VIEWER_LOCAL + 'index.html', VIEWER_LOCAL + 'port.html']:
            body = subprocess.check_output(['node', str(pathlib.Path(__file__).with_name('local-port-viewer.mjs'))], cwd=ROOT) if path.endswith('port.html') else (ROOT / 'apps/score-viewer/local/index.html').read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers(); self.wfile.write(body); return
        if path == VIEWER_LOCAL + 'manifest.webmanifest':
            body = (ROOT / path.lstrip('/')).read_bytes()
            self.send_response(200); self.send_header('Content-Type', 'application/manifest+json')
            self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
        if path == '/apps/cruise-studio/score-guide/index.html':
            super().do_GET(); return
        if path == '/':
            body = render()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers(); self.wfile.write(body); return
        # No other HTML entry, gate, cloud or Account API is exposed here.
        pdf_asset = path.startswith('/apps/score-viewer/vendor/pdfjs/') and pathlib.Path(path).suffix in ['.bcmap', '.ttf', '.pfb', '.wasm', '.icc']
        if not path.startswith('/apps/') or '..' in urllib.parse.unquote(path).split('/') or any(s in path for s in ['/cloud/', '/sync-account/', '/pro-gate', '/pro-device-session', '/studio-entry.mjs']) or (pathlib.Path(path).suffix not in ['.js', '.mjs', '.css', '.svg', '.png', '.woff2'] and not pdf_asset):
            self.send_error(404); return
        resolved = (ROOT / path.lstrip('/')).resolve()
        if ROOT not in resolved.parents:
            self.send_error(404); return
        super().do_GET()
    def do_HEAD(self):
        self.send_error(405)
    def do_POST(self):
        if viewer_mock.handle(self, 'POST'): return
        self.send_error(405)
    def do_PUT(self):
        if viewer_mock.handle(self, 'PUT'): return
        self.send_error(405)
    def log_message(self, *_):
        pass # No request URLs, inputs or credentials in logs.

if __name__ == '__main__':
    subprocess.check_call(['node', str(pathlib.Path(__file__).with_name('build-local-viewer-offline.mjs'))], cwd=ROOT)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print('LOCAL DEVELOPMENT / 本番認証の検証対象外: http://127.0.0.1:18874/', flush=True)
    server.serve_forever()
