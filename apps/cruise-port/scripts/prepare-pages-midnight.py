"""Offline Pages release/recovery preparation. Never pushes or calls deployment APIs."""
import argparse,subprocess,tarfile,shutil,json,hashlib,os
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--release-ref',required=True);p.add_argument('--jekyll',required=True);a=p.parse_args();repo=Path(__file__).resolve().parents[3];out=Path(a.out).resolve()
if out.exists() or out.is_relative_to(repo):p.error('Use a NEW directory outside repository')
out.mkdir();ref=subprocess.check_output(['git','rev-parse',a.release_ref],cwd=repo,text=True).strip()
archive=out/'base.tar';subprocess.run(['git','archive','--output',str(archive),ref],cwd=repo,check=True)
base=out/'baseline-source';base.mkdir()
with tarfile.open(archive) as f:
 for member in f.getmembers():
  if member.issym() or member.islnk() or not (base/member.name).resolve().is_relative_to(base):raise SystemExit('Unsafe archive member')
 f.extractall(base)
archive.unlink();overlay=['app-version.js','index.html','pro_9a3943176561/index.html','practice-menu-app.js','pro-app-boot.js','settings-store.js','style.css','tuner-app.js']
release=out/'release-source';shutil.copytree(base,release)
for name in overlay:shutil.copy2(repo/'apps/cruise-port'/name,release/'apps/cruise-port'/name)
# Refuse to drop any deployed release-only Port implementation/legal assets.
for name in ['ai-support-client.js','ai-support-ui.js','privacy.html','terms.html']:
 if (base/'apps/cruise-port'/name).read_bytes()!=(repo/'apps/cruise-port'/name).read_bytes():raise SystemExit('Published asset drift: '+name)
recovery=out/'recovery-source';shutil.copytree(release,recovery)
for name in overlay:
 path=recovery/'apps/cruise-port'/name;data=path.read_text().replace('1.30.0','1.30.1')
 if name.endswith('index.html'):
  data='\n'.join(line for line in data.split('\n') if 'data-theme-choice="midnight"' not in line)
 path.write_text(data)
def hashes(root):return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file()}
def diff(a,b):return sorted(p for p in set(a)|set(b) if a.get(p)!=b.get(p))
expected={'apps/cruise-port/'+n for n in overlay};bh=hashes(base);rh=hashes(release);kh=hashes(recovery)
assert set(diff(bh,rh))==expected, diff(bh,rh)
assert set(diff(bh,kh))==expected, diff(bh,kh)
for name in ['settings-store.js','practice-menu-app.js']:
 # The recovery changes cache/version strings only; the persistence logic is identical.
 assert (recovery/'apps/cruise-port'/name).read_text().replace('1.30.1','1.30.0')==(release/'apps/cruise-port'/name).read_text()
manifest={'releaseBase':ref,'candidateHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'deploymentApproved':False,'overlay':overlay,'sourceDelta':{'release':diff(bh,rh),'recovery':diff(bh,kh)},'builds':{}}
for label,source in [('baseline',base),('release',release),('recovery',recovery)]:
 dest=out/(label+'-site');log=out/(label+'-jekyll.log')
 with log.open('w') as f:subprocess.run(['ruby',a.jekyll,'build','--safe','--source',str(source),'--destination',str(dest)],stdout=f,stderr=subprocess.STDOUT,check=True)
 h=hashes(dest);manifest['builds'][label]={'files':h,'count':len(h)}
builtbase=manifest['builds']['baseline']['files']
for label in ['release','recovery']:
 delta=diff(builtbase,manifest['builds'][label]['files']);assert set(delta)==expected,(label,delta)
 for name in expected:
  assert manifest['builds'][label]['files'][name]==hashlib.sha256((out/(label+'-source')/name).read_bytes()).hexdigest()
 manifest['builds'][label]['delta']=delta
(out/'PAGES-PREPARED-MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'releaseBase':ref,'buildCounts':{k:v['count'] for k,v in manifest['builds'].items()},'releaseDelta':manifest['builds']['release']['delta'],'recoveryDelta':manifest['builds']['recovery']['delta']},indent=2))
