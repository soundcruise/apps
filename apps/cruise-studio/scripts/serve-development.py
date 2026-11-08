"""Local development product entry. Uses existing Pro gate; never proxies cloud credentials."""
import http.server,pathlib,sys,urllib.parse
repo=pathlib.Path(__file__).resolve().parents[3]
entry=pathlib.Path(sys.argv[1]).resolve()
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(repo),**kwargs)
 def do_GET(self):
  if urllib.parse.urlsplit(self.path).path=='/':
   b=entry.read_bytes();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
  else:super().do_GET()
http.server.ThreadingHTTPServer(('127.0.0.1',18873),Handler).serve_forever()
