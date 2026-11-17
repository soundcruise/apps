"""Serve only a generated static mobile fixture over private HTTPS. No Sync/API."""
import argparse, http.server, ipaddress, json, pathlib, ssl, urllib.parse

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--bundle',required=True);parser.add_argument('--cert',required=True);parser.add_argument('--key',required=True);args=parser.parse_args()
    root=pathlib.Path(args.bundle).resolve();config=json.loads((root/'fixture-config.json').read_text());origin=urllib.parse.urlsplit(config['origin']);ip=ipaddress.ip_address(origin.hostname)
    if not ip.is_private or ip.is_unspecified or origin.scheme!='https':raise ValueError('private HTTPS required')
    allowed=set(config['allowed']);authority=origin.netloc
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):self.read(False)
        def do_HEAD(self):self.read(True)
        def read(self,head):
            name=urllib.parse.urlsplit(self.path).path
            if self.headers.get('Host')!=authority:self.send_error(403);return
            if name=='/':
                self.send_response(302);self.send_header('Location',config['entry']);self.end_headers();return
            if name=='/apps/score-viewer/local/':name=config['entry']
            if name not in allowed:self.send_error(404);return
            target=(root/name.lstrip('/')).resolve()
            if root not in target.parents or not target.is_file():self.send_error(404);return
            mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html; charset=utf-8','.css':'text/css','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.bcmap':'application/octet-stream','.ttf':'font/ttf','.pfb':'application/octet-stream','.wasm':'application/wasm','.icc':'application/octet-stream'}.get(target.suffix,'application/octet-stream')
            body=target.read_bytes();self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'");self.end_headers()
            if not head:self.wfile.write(body)
        def log_message(self,*args):pass
    server=http.server.ThreadingHTTPServer((str(ip),origin.port or 443),Handler);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(args.cert,args.key);server.socket=tls.wrap_socket(server.socket,server_side=True)
    print('MOBILE STATIC FIXTURE '+config['origin']+config['entry'],flush=True)
    try:server.serve_forever()
    finally:server.server_close()
if __name__=='__main__':main()
