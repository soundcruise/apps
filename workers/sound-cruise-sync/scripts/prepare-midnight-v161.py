from pathlib import Path
import re,json,shutil,hashlib,subprocess,argparse
parser=argparse.ArgumentParser(description='Local-only module preparation; never uploads or changes resources')
parser.add_argument('--baseline',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
repo=Path(__file__).resolve().parents[3];src=Path(args.baseline).resolve();out=Path(args.output).resolve();assert src!=out;out.mkdir(mode=0o700,exist_ok=True)
manifest=json.loads((src/'manifest.json').read_text())
assert next(r['sha256'] for r in manifest if r['name']=='production-v148.mjs')=='c3e2ecaa06731254201f02fe80d874fb6df9915a86d5e07d102bbd12956d7f7b', 'baseline changed; re-audit required'
for row in manifest: assert hashlib.sha256((src/row['name']).read_bytes()).hexdigest()==row['sha256']
for row in manifest:shutil.copyfile(src/row['name'],out/row['name']);(out/row['name']).chmod(0o600)
p=out/'production-v148.mjs';s=p.read_text();before=s
start=s.index('// ../pr222-v143-preserved/workers/sound-cruise-sync/src/sync-capabilities.js');end=s.index('// ../pr222-v143-preserved/workers/sound-cruise-sync/src/sync-database.js',start)
caps=(repo/'workers/sound-cruise-sync/src/sync-capabilities.js').read_text();caps=re.sub(r"import .*?;\n",'',caps);caps=caps.replace('export ','');caps=re.sub(r'^const ','var ',caps,flags=re.M)
s=s[:start]+'// PR249: preserved v161 + scoped Midnight compatibility\n'+caps+'\n'+s[end:]
old='var SETTINGS_THEMES = ["dark", "charcoal", "gray", "light"];';assert s.count(old)==1;s=s.replace(old,'var SETTINGS_THEMES = ["dark", "midnight", "charcoal", "gray", "light"];')
start=s.index('async function validatePushPayload(');end=s.index('function validateMigrationCompletePayload(',start);block=s[start:end];needle='    operations.push(result.ok ?';assert block.count(needle)==1
insert="""    if (result.ok && ['pitch', 'fretboard', 'rhythm'].includes(payload.appId) &&
        !capabilities.has('settings_theme_v2') && input.recordType === 'settings' &&
        input.payload?.values?.theme === 'midnight') {
      operations.push({ ok: false, operationId: input.operationId, index, code: 'settings_theme_upgrade_required' });
      continue;
    }
"""
s=s[:start]+block.replace(needle,insert+needle)+s[end:];p.write_text(s)
subprocess.run(['node','--check',str(p)],check=True)
rows=[]
for row in manifest:
 b=(out/row['name']).read_bytes();h=hashlib.sha256(b).hexdigest();rows.append({**row,'candidateSHA256':h,'changed':h!=row['sha256']})
assert [r['name'] for r in rows if r['changed']]==['production-v148.mjs'];(out/'manifest.json').write_text(json.dumps(rows,indent=2))
shutil.copyfile(src/'settings-private.json',out/'settings-private.json');(out/'settings-private.json').chmod(0o600)
settings=json.loads((src/'settings-private.json').read_text());meta={k:settings[k] for k in ['compatibility_date','compatibility_flags','usage_model','tags','tail_consumers','logpush','observability','placement'] if k in settings}
meta.update(main_module='report-overlay.mjs',keep_bindings=['secret_text'],keep_assets=True,bindings=[b for b in settings['bindings'] if b['type']!='secret_text'])
(out/'upload-metadata-private.json').write_text(json.dumps(meta));(out/'upload-metadata-private.json').chmod(0o600)
print(json.dumps({'moduleCount':len(rows),'changedModules':[r['name'] for r in rows if r['changed']],'otherModulesByteIdentical':4,'settingsCopiedUnchanged':True,'bundleSyntax':'PASS'}))
