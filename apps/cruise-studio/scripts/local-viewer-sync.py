"""In-memory, loopback-only fixture. Never imports the production Sync backend.

Objects are committed by compare-and-swap only after their bytes match metadata.
The server process owns this disposable mock namespace; restart discards it.
"""
import copy
import hashlib
import json
import re
import threading
import time

PREFIX = '/apps/score-viewer/local/mock-sync/v1/'
ORIGIN = 'http://127.0.0.1:18874'
NAMESPACE = 'viewer-local-fixture-v1'
TYPES = ['viewer_document', 'viewer_preset']
KINDS = {'viewer_score': ('application/vnd.sound-cruise.score+json', 13*1024*1024),
         'viewer_pdf': ('application/pdf', 20*1024*1024),
         'viewer_preset': ('application/vnd.sound-cruise.view-preset+json', 65536)}

class Failure(Exception):
    def __init__(self, status): self.status = status

def require(ok, status=400):
    if not ok: raise Failure(status)

def fields(value, keys):
    require(isinstance(value, dict) and set(value) == set(keys))

def integer(v): return type(v) is int and 0 <= v <= 2**53-1
def ident(v): return isinstance(v, str) and re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}', v) is not None

def descriptor(d):
    fields(d, ['namespace','appId','recordId','type','title','documentId','revisionId','asset'])
    require(d['namespace'] == NAMESPACE and d['appId'] == 'score-viewer')
    require(d['type'] in TYPES, 426)
    require(all(ident(d[k]) for k in ['recordId','documentId','revisionId']))
    require(isinstance(d['title'], str) and 0 < len(d['title'].strip()) <= 180 and not re.search(r'[\x00-\x1f\x7f]',d['title']))
    a=d['asset']; fields(a,['kind','mime','size','sha256'])
    require(a['kind'] in KINDS)
    mime,limit=KINDS[a['kind']]
    require(a['mime']==mime and integer(a['size']) and 0<a['size']<=limit)
    require(isinstance(a['sha256'],str) and re.fullmatch(r'[a-f0-9]{64}',a['sha256']))
    require((d['type']=='viewer_preset')==(a['kind']=='viewer_preset'))
    return copy.deepcopy(d)

class MockStore:
    def __init__(self, quota=64*1024*1024):
        self.records, self.uploads, self.assets = {}, {}, {}
        self.quota, self.lock = quota, threading.RLock()

    def list(self, types):
        # A client's reduced list is never interpreted as deletion of others.
        with self.lock: return {'records':[copy.deepcopy(r) for r in self.records.values() if r['descriptor']['type'] in types]}

    def check_base(self, d, base):
        old=self.records.get(d['recordId']);require(integer(base))
        require((old['version'] if old else 0)==base,409)
        if old:
            prev=old['descriptor']
            require(prev['type']==d['type'] and prev['asset']['kind']==d['asset']['kind'],409)
            # PDF/preset revisions are content-addressed. Scores have a stable
            # exported viewer ID; a different score cannot silently replace it.
            if d['asset']['kind']=='viewer_score': require(prev['documentId']==d['documentId'],409)
        if d['asset']['kind']=='viewer_score':
            for u in self.uploads.values():
                prev=u['descriptor']
                if 'result' in u and prev['asset']['kind']=='viewer_score' and prev['documentId']==d['documentId'] and prev['revisionId']==d['revisionId']:
                    require(prev['asset']['sha256']==d['asset']['sha256'],409)

    def prepare(self, value):
        fields(value,['protocol','descriptor','baseVersion','intent']);require(value['protocol']==1,426)
        d=descriptor(value['descriptor']);base=value['baseVersion'];intent=value['intent']
        canonical=json.dumps({'descriptor':d,'baseVersion':base},sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
        require(intent==hashlib.sha256(canonical).hexdigest())
        with self.lock:
            # Lost-response retries recover the exact previous commit result,
            # even after a later revision was published. They never rewind head.
            prev=self.uploads.get(intent)
            if prev: return {'uploadId':intent,'committed':'result' in prev}
            self.check_base(d,base)
            for key,entry in list(self.uploads.items()):
                if 'result' not in entry and time.monotonic()-entry['created']>300: del self.uploads[key]
            require(len(self.records)<500 or d['recordId'] in self.records,507)
            require(len(self.uploads)<1000,507)
            reserved=sum(len(v) for v in self.assets.values())+sum(u['descriptor']['asset']['size'] for u in self.uploads.values() if 'result' not in u)
            require(reserved+d['asset']['size']<=self.quota,507)
            self.uploads[intent]={'descriptor':d,'base':base,'created':time.monotonic()}
            return {'uploadId':intent,'committed':False}

    def put(self, key, body, mime):
        with self.lock:
            entry=self.uploads.get(key);require(entry is not None,404)
            a=entry['descriptor']['asset']
            require(mime==a['mime'] and len(body)==a['size'] and hashlib.sha256(body).hexdigest()==a['sha256'],422)
            if 'result' not in entry: entry['bytes']=bytes(body)
            return {'uploaded':True}

    def commit(self, value):
        fields(value,['protocol','uploadId']);require(value['protocol']==1,426)
        with self.lock:
            entry=self.uploads.get(value['uploadId']);require(entry is not None,404)
            if 'result' in entry: return copy.deepcopy(entry['result'])
            require('bytes' in entry,409)
            d=entry['descriptor'];self.check_base(d,entry['base'])
            # Native/preset bodies must at least be well-formed JSON. Full
            # schema/PDF validation is the receiving reader's responsibility.
            if d['asset']['kind']=='viewer_pdf': require(entry['bytes'].startswith(b'%PDF-'),422)
            else:
                try: require(isinstance(json.loads(entry['bytes']),dict),422)
                except (ValueError,UnicodeError): raise Failure(422)
            result={'descriptor':d,'version':entry['base']+1,'deleted':False}
            self.assets[d['asset']['sha256']]=entry.pop('bytes')
            self.records[d['recordId']]=result;entry['result']=result
            return copy.deepcopy(result)

    def delete(self,value):
        fields(value,['protocol','recordId','baseVersion','type']);require(value['protocol']==1 and value['type'] in TYPES,426)
        with self.lock:
            old=self.records.get(value['recordId']);require(old is not None,404)
            require(old['descriptor']['type']==value['type'] and old['version']==value['baseVersion'],409)
            if not old['deleted']: self.records[value['recordId']]={**old,'deleted':True,'version':old['version']+1}
            return copy.deepcopy(self.records[value['recordId']])

    def asset(self,key):
        with self.lock:
            require(key in self.assets,404)
            # Committed historical blobs survive a tombstone. Offline copies
            # belong to each device and are never remotely erased here.
            rows=[u['descriptor'] for u in self.uploads.values() if 'result' in u and u['descriptor']['asset']['sha256']==key]
            require(bool(rows),404)
            return self.assets[key],rows[0]['asset']['mime']

STORE=MockStore()

def handle(handler, method):
    from urllib.parse import urlsplit,parse_qs
    url=urlsplit(handler.path)
    if not url.path.startswith(PREFIX): return False
    try:
        require(handler.headers.get('Host')=='127.0.0.1:18874',403)
        require(handler.headers.get('X-Viewer-Mock')=='1',403)
        require(handler.headers.get('Origin') in [None,ORIGIN] and handler.headers.get('Sec-Fetch-Site') not in ['cross-site','same-site'],403)
        if method!='GET': require(handler.headers.get('Origin')==ORIGIN,403)
        path=url.path[len(PREFIX):]
        if method=='GET' and path=='capabilities': result={'protocol':1,'namespace':NAMESPACE,'types':TYPES,'assets':list(KINDS)}
        elif method=='GET' and path=='records':
            types=parse_qs(url.query).get('types',[''])[0].split(',');require(bool(types) and all(t in TYPES for t in types),426)
            result=STORE.list(types)
        elif method=='GET' and re.fullmatch(r'assets/[a-f0-9]{64}',path):
            body,mime=STORE.asset(path.split('/')[1]);respond(handler,200,body,mime);return True
        elif method in ['POST','PUT']:
            raw_length=handler.headers.get('Content-Length','');require(raw_length.isdigit() and 0<int(raw_length)<=20*1024*1024,413)
            length=int(raw_length)
            if method=='POST': require(length<=16384,413)
            handler.connection.settimeout(10);body=handler.rfile.read(length);require(len(body)==length,422)
            mime=handler.headers.get('Content-Type','').split(';')[0]
            if method=='PUT' and re.fullmatch(r'uploads/[a-f0-9]{64}',path): result=STORE.put(path.split('/')[1],body,mime)
            else:
                require(method=='POST' and mime=='application/json' and path in ['prepare','commit','delete'],404)
                try: value=json.loads(body)
                except (ValueError,UnicodeError): raise Failure(400)
                result=getattr(STORE,path)(value)
        else: raise Failure(404)
        respond(handler,200,json.dumps(result,ensure_ascii=False).encode(),'application/json')
    except Failure as error: respond(handler,error.status,b'{"error":"local-mock-refused"}','application/json')
    except (TypeError,KeyError,ValueError): respond(handler,400,b'{"error":"invalid-request"}','application/json')
    except (OSError,TimeoutError): pass # interrupted transfer: no commit, no head
    return True

def respond(handler,status,body,mime):
    handler.send_response(status);handler.send_header('Content-Type',mime);handler.send_header('Content-Length',str(len(body)));handler.end_headers();handler.wfile.write(body)
