"""Offline private preview. Does NOT provide a production authentication origin."""
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import argparse,ssl
p=argparse.ArgumentParser();p.add_argument('--bundle',required=True);p.add_argument('--host',default='127.0.0.1');p.add_argument('--port',type=int,default=18741);p.add_argument('--cert');p.add_argument('--key');a=p.parse_args()
if a.host not in ['127.0.0.1','localhost','::1'] and not a.cert:p.error('LAN preview requires a trusted HTTPS certificate')
repo=Path(__file__).resolve().parents[3];bundle=Path(a.bundle).resolve()
class Handler(SimpleHTTPRequestHandler):
 def translate_path(self,url):
  parts=url.split('?',1)[0].split('#',1)[0];base=bundle if parts.startswith('/apps/cruise-port/') else repo
  from urllib.parse import unquote
  target=(base/unquote(parts).lstrip('/')).resolve()
  if not any(target.is_relative_to(base/d) for d in ['apps/cruise-port','apps/shared','apps/cruise-studio']):return '/dev/null/denied'
  return str(target)
 def end_headers(self):
  self.send_header('Cache-Control','no-store');self.send_header('Content-Security-Policy',"connect-src 'self'; form-action 'none'; frame-src 'self'");super().end_headers()
 def log_message(self,*args):pass # Never record query strings, form input or credentials.
server=ThreadingHTTPServer((a.host,a.port),Handler)
if a.cert:
 ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);ctx.load_cert_chain(a.cert,a.key);server.socket=ctx.wrap_socket(server.socket,server_side=True)
print('Offline preview: do NOT enter real Pro/Account information. Production API requests blocked.',flush=True)
try:server.serve_forever()
except KeyboardInterrupt:server.server_close()
