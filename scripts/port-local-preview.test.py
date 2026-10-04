"""No network: validate the preview proxy's fixed read-only boundary."""
import importlib.util
import io
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location('preview', Path(__file__).with_name('port-local-preview.py'))
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)

class PreviewBoundary(unittest.TestCase):
    def handler(self, path, headers=None):
        h = preview.Preview.__new__(preview.Preview)
        h.path = path
        h.headers = {'Host': '127.0.0.1:8765', **(headers or {})}
        h.wfile = io.BytesIO()
        h.send_error = lambda code: setattr(h, 'status', code)
        h.send_response = lambda code: setattr(h, 'status', code)
        h.send_header = lambda *args: None
        h.end_headers = lambda: None
        return h

    def test_query_cannot_choose_endpoint_or_forward_repeated_values(self):
        with patch.object(preview.subprocess, 'run') as fetch:
            for query in ['url=https://example.invalid/', 'limit=51', 'offset=-1', 'limit=1&limit=2', 'cursor='+'x'*401]:
                h = self.handler('/__cruise_preview/news?' + query)
                h.do_GET()
                self.assertEqual(h.status, 400)
            fetch.assert_not_called()

    def test_untrusted_host_denied_before_fetch(self):
        with patch.object(preview.subprocess, 'run') as fetch:
            for host in ['foreign.example:8765', '127.0.0.1@foreign.example', 'localhost.foreign.example']:
                h = self.handler('/__cruise_preview/news', {'Host':host})
                h.do_GET()
                self.assertEqual(h.status,403)
            fetch.assert_not_called()

    def test_private_static_paths_not_served(self):
        with patch.object(preview.SimpleHTTPRequestHandler, 'do_GET') as serve:
            for path in ['/workers/sound-cruise-news/.dev.vars', '/.git/config', '/apps/../workers/a', '/apps/%2e%2e/workers/a', '/apps/.env', '/apps/cruise-port/node_modules/a']:
                h = self.handler(path)
                h.do_GET()
                self.assertEqual(h.status,404)
            serve.assert_not_called()
            self.handler('/apps/cruise-port/index.html').do_GET()
            serve.assert_called_once()
        h = self.handler('/.git/config')
        h.do_HEAD()
        self.assertEqual(h.status,405)

    def test_foreign_origin_denied_before_fetch(self):
        with patch.object(preview.subprocess, 'run') as fetch:
            h = self.handler('/__cruise_preview/news', {'Origin':'https://foreign.example'})
            h.do_GET()
            self.assertEqual(h.status, 403)
            fetch.assert_not_called()

    def test_fixed_public_get_drops_credentials(self):
        body = b'{"contractVersion":1,"items":[],"nextOffset":null}'
        with patch.object(preview.subprocess, 'run', return_value=SimpleNamespace(stdout=body+b'\n200')) as fetch:
            h = self.handler('/__cruise_preview/news?limit=50&offset=0', {'Authorization':'synthetic-test-only', 'Cookie':'synthetic-test-only', 'Origin':'http://127.0.0.1:8765'})
            h.do_GET()
            args = fetch.call_args.args[0]
            self.assertEqual(args[-1], preview.PUBLIC_NEWS+'?limit=50&offset=0')
            self.assertNotIn('synthetic-test-only', str(args))
            self.assertNotIn('--data', args)
            self.assertEqual(args[:2],['curl','--disable'])
            self.assertEqual(h.status,200)
            self.assertEqual(json.loads(h.wfile.getvalue())['items'],[])

    def test_non_json_upstream_fails_closed(self):
        with patch.object(preview.subprocess, 'run', return_value=SimpleNamespace(stdout=b'html\n200')):
            h = self.handler('/__cruise_preview/news')
            h.do_GET()
            self.assertEqual(h.status,502)
        self.assertFalse(hasattr(preview.Preview,'do_POST'))

if __name__ == '__main__':
    unittest.main()
