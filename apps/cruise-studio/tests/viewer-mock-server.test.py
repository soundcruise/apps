import unittest,importlib.util,pathlib,hashlib,json,copy
spec=importlib.util.spec_from_file_location('mock',pathlib.Path(__file__).parents[1]/'scripts/local-viewer-sync.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class MockSyncTests(unittest.TestCase):
 def setUp(self): self.store=m.MockStore();self.body=b'{"format":"test"}'
 def proposal(self,revision='r1',base=0,body=None,record='record-1',kind='viewer_score'):
  body=self.body if body is None else body;digest=hashlib.sha256(body).hexdigest()
  d=dict(namespace=m.NAMESPACE,appId='score-viewer',recordId=record,type='viewer_preset' if kind=='viewer_preset' else 'viewer_document',title='海辺',documentId='viewer-id',revisionId=revision,asset=dict(kind=kind,mime=m.KINDS[kind][0],size=len(body),sha256=digest))
  intent=hashlib.sha256(json.dumps(dict(descriptor=d,baseVersion=base),sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
  return dict(protocol=1,descriptor=d,baseVersion=base,intent=intent)
 def commit(self,p,body=None):
  ticket=self.store.prepare(p);self.store.put(ticket['uploadId'],self.body if body is None else body,p['descriptor']['asset']['mime']);return self.store.commit(dict(protocol=1,uploadId=ticket['uploadId']))
 def failure(self,status,run):
  with self.assertRaises(m.Failure) as result:run()
  self.assertEqual(result.exception.status,status)
 def test_uncommitted_upload_and_bad_bytes_never_publish_index(self):
  p=self.proposal();self.store.prepare(p);self.assertEqual(self.store.list(m.TYPES)['records'],[])
  self.failure(422,lambda:self.store.put(p['intent'],b'bad',p['descriptor']['asset']['mime']))
  self.failure(409,lambda:self.store.commit(dict(protocol=1,uploadId=p['intent'])))
  self.assertEqual(self.commit(p)['version'],1)
 def test_lost_commit_response_retry_is_idempotent_and_does_not_rewind(self):
  p=self.proposal();first=self.commit(p);second=self.commit(self.proposal('r2',1))
  self.assertTrue(self.store.prepare(p)['committed']);self.assertEqual(self.store.commit(dict(protocol=1,uploadId=p['intent'])),first)
  self.assertEqual(self.store.list(m.TYPES)['records'][0],second)
 def test_concurrent_revision_cas_keeps_winner_and_old_bytes(self):
  self.commit(self.proposal());a=self.proposal('r2',1,body=b'{"a":2}');b=self.proposal('r3',1,body=b'{"a":3}')
  self.store.prepare(a);self.store.prepare(b);self.commit(a,b'{"a":2}')
  self.failure(409,lambda:self.commit(b,b'{"a":3}'))
  self.assertEqual(self.store.asset(hashlib.sha256(self.body).hexdigest())[0],self.body)
 def test_same_native_revision_cannot_change_bytes_even_via_other_record(self):
  self.commit(self.proposal());self.failure(409,lambda:self.store.prepare(self.proposal(body=b'{"changed":true}',record='other')))
 def test_quota_never_evicts_committed_data(self):
  self.commit(self.proposal());self.store.quota=len(self.body)
  self.failure(507,lambda:self.store.prepare(self.proposal('r2',1)))
  self.assertEqual(self.store.list(m.TYPES)['records'][0]['version'],1)
 def test_unknown_and_older_clients_cannot_drop_other_record_types(self):
  self.commit(self.proposal());future={'descriptor':{'type':'future-type','recordId':'future'},'version':1,'deleted':False};self.store.records['future']=future
  self.assertEqual(len(self.store.list(['viewer_document'])['records']),1)
  self.assertEqual(self.store.records['future'],future)
  self.failure(426,lambda:self.store.delete(dict(protocol=1,recordId='future',baseVersion=1,type='future-type')))
  p=self.proposal();p['protocol']=0;self.failure(426,lambda:self.store.prepare(p))
 def test_delete_is_cas_tombstone_retains_historical_asset(self):
  p=self.proposal();self.commit(p)
  self.failure(409,lambda:self.store.delete(dict(protocol=1,recordId='record-1',baseVersion=0,type='viewer_document')))
  deleted=self.store.delete(dict(protocol=1,recordId='record-1',baseVersion=1,type='viewer_document'));self.assertTrue(deleted['deleted']);self.assertEqual(deleted['version'],2)
  self.assertEqual(self.store.asset(p['descriptor']['asset']['sha256'])[0],self.body)
 def test_mime_namespace_app_and_payload_bounds_are_explicit(self):
  p=self.proposal();p['descriptor']['namespace']='actual-account';self.failure(400,lambda:self.store.prepare(p))
  p=self.proposal();p['descriptor']['asset']['mime']='text/plain';self.failure(400,lambda:self.store.prepare(p))
  p=self.proposal();p['descriptor']['asset']['size']=14*1024*1024;self.failure(400,lambda:self.store.prepare(p))
 def test_pdf_preset_replacement_changes_content_ids_but_not_kind(self):
  first=self.proposal(record='pdf',kind='viewer_pdf',body=b'%PDF-test');self.commit(first,b'%PDF-test')
  next=self.proposal('new',1,record='pdf',kind='viewer_pdf',body=b'%PDF-new');next['descriptor']['documentId']='pdf:new'
  next['intent']=hashlib.sha256(json.dumps(dict(descriptor=next['descriptor'],baseVersion=1),sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
  self.assertEqual(self.commit(next,b'%PDF-new')['version'],2)
  self.failure(409,lambda:self.store.prepare(self.proposal('r2',2,record='pdf')))
if __name__=='__main__': unittest.main()
