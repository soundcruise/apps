"""TEST ONLY: loopback origin with synthetic Pro policy, no real credentials/backend.
Run in a disposable browser profile. Port data keys are real but data must be synthetic.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse
ROOT = Path(__file__).resolve().parents[4]
BOUNDARY = b'''import {getCapabilities} from '/apps/cruise-port/cruise-port-capabilities.js';
const auth={credential:'synthetic-local-fixture',generation:1,sessionVersion:1};
const source=Object.freeze({read:()=>({auth,revoked:false,revision:'fixture'}),validate:async()=>({ok:true,offlineRemainingMs:60000})});
globalThis.SoundCruiseProOperationSource=source;
export function createPortProBoundary(){let disposed=false;return {authorize:async()=>disposed?{ok:false}:{ok:true,capabilities:getCapabilities('pro')},invalidate(){},dispose(){disposed=true;}};}
'''
GATE = b"""// TEST ONLY synthetic native Pro gate for disposable loopback profiles.
window.__soundCruiseClearGate=async()=>{};
window.SoundCruiseProOperationSource=Object.freeze({read:()=>({auth:{credential:'synthetic-local-fixture',generation:1,sessionVersion:1},revoked:false,revision:'fixture'}),validate:async()=>({ok:true,offlineRemainingMs:60000})});
window.__soundCruiseRequireProBackendAuth=async()=>{};
window.__soundCruiseEnsureProSession=async()=>true;
"""
ENTRY = b"""// TEST ONLY, served exclusively by loopback fixture, never referenced by product.
const cs=globalThis.CruiseStudio;cs.entryAuth=Object.freeze({check:async()=>true,isAuthorized:()=>true,read:()=>({phase:'ready',accountId:'synthetic-fixture'})});
document.documentElement.dataset.studioEntry='ready';document.getElementById('studio-shell').inert=false;
"""
class Handler(SimpleHTTPRequestHandler):
    synthetic = True
    release_root = None
    native_root = None
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
    def end_headers(self):
        self.send_header('Content-Security-Policy', "connect-src 'self'; form-action 'self'; object-src 'none'")
        super().end_headers()
    def do_GET(self):
        if self.release_root and self.path.split('?')[0].startswith('/apps/cruise-studio/'):
            relative = self.path.split('?')[0].lstrip('/')
            target = (self.release_root / relative).resolve()
            if self.release_root not in target.parents or not target.is_file():
                self.send_error(404); return
            # Synthetic substitutions are fixture-only; missing artifact paths stay 404.
            if not (self.synthetic and relative.endswith(('js/core/studio-entry.mjs', 'js/core/port-pro-boundary.mjs'))):
                self.send_response(200); self.send_header('Content-Type',self.guess_type(str(target))); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(target.read_bytes()); return
        if not self.synthetic and not self.native_root:
            super().do_GET(); return
        if self.synthetic and self.path.split('?')[0] == '/apps/cruise-studio/js/core/studio-entry.mjs':
            self.send_response(200); self.send_header('Content-Type','text/javascript'); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(ENTRY); return
        if self.synthetic and self.path.split('?')[0] == '/apps/shared/pro-gate.js':
            self.send_response(200); self.send_header('Content-Type','text/javascript'); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(GATE); return
        if self.synthetic and self.path.split('?')[0] == '/apps/cruise-studio/js/core/port-pro-boundary.mjs':
            self.send_response(200); self.send_header('Content-Type','text/javascript'); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(BOUNDARY); return
        if self.native_root and self.path.split('?')[0].startswith(tuple('/apps/'+name+'/' for name in ['cruise-port','pitch-cruise','fretboard_cruise','rhythm-cruise','chord-cruise','shared'])):
            target = (self.native_root / self.path.split('?')[0].lstrip('/')).resolve()
            if target.is_dir(): target = target / 'index.html'
            if self.native_root not in target.parents or not target.is_file(): self.send_error(404); return
            self.send_response(200); self.send_header('Content-Type',self.guess_type(str(target))); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(target.read_bytes()); return
        super().do_GET()
if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=18781);parser.add_argument('--native-entry',action='store_true');parser.add_argument('--release-root',type=Path);parser.add_argument('--native-root',type=Path);args=parser.parse_args();Handler.synthetic=not args.native_entry;Handler.release_root=args.release_root.resolve() if args.release_root else None;Handler.native_root=args.native_root.resolve() if args.native_root else None
    print('SYNTHETIC TEST ENVIRONMENT ONLY. Do not enter real Account or Pro credentials.',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
