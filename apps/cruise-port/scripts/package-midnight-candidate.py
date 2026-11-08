"""Compose verified Port 1.29 assets + reviewed 1.30 overlay; never deploy."""
import subprocess,json,hashlib,argparse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args();root=Path(__file__).resolve().parents[3];out=Path(a.out).resolve()
if out.exists() or out.is_relative_to(root):raise SystemExit('Use a NEW output directory outside the repository')
baseline='3af2a557';overlay=['app-version.js','index.html','pro_9a3943176561/index.html','practice-menu-app.js','pro-app-boot.js','settings-store.js','style.css','tuner-app.js']
files=subprocess.check_output(['git','ls-tree','-r','--name-only',baseline,'--','apps/cruise-port/'],cwd=root,text=True).splitlines();manifest={}
for name in files:
 rel=Path(name).relative_to('apps/cruise-port')
 if any(x in rel.parts for x in ['docs','tests','legacy','scripts']) or '.test.' in name:continue
 data=subprocess.check_output(['git','show',baseline+':'+name],cwd=root);target=out/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);manifest[name]={'sha256':hashlib.sha256(data).hexdigest(),'source':baseline}
for name in overlay:
 rel='apps/cruise-port/'+name;data=(root/rel).read_bytes();(out/rel).write_bytes(data);manifest[rel]={'sha256':hashlib.sha256(data).hexdigest(),'source':'reviewed-midnight-overlay'}
for name in ['ai-support-client.js','ai-support-ui.js','privacy.html','terms.html']:
 rel='apps/cruise-port/'+name
 assert (out/rel).read_bytes()==(root/rel).read_bytes(), 'release-only asset drift: '+rel
(out/'PORT-RELEASE-MANIFEST.json').write_text(json.dumps({'baseline':baseline,'overlay':overlay,'files':manifest,'deployApproved':False,'sharedAndStudio':'Existing dependencies; not bundled or deployed'},indent=2)+'\n')
print(out)
