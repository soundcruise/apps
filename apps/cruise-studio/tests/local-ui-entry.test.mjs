import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {renderLocalUIEntry} from '../scripts/local-ui-entry.mjs';
import {renderProEntry,renderStandardEntry} from '../scripts/edition-layout.mjs';
import {RELEASE_FILES} from '../scripts/package-port-pc.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('studio-template.html');
test('local entry replaces auth dependencies and labels synthetic identity explicitly',()=>{
 const h=renderLocalUIEntry(source);
 assert(h.includes('LOCAL DEVELOPMENT / 本番認証の検証対象外'));
 assert(h.includes('scripts/local-ui-adapter.js'));
 assert(h.includes('scripts/development-features.js'));
 assert(!/<script[^>]*src="[^"]*(?:pro-gate|pro-device-session|sync-account-|studio-entry\.mjs|port-sync-status|cloud\/canary-entry)/.test(h));
});
test('both public products retain coming soon and real authentication; neither packages local adapters',()=>{
 for(const h of [renderProEntry(source),renderStandardEntry(source)]){
  assert(h.includes('data-coming-soon'));
  assert(h.includes('js/core/release-features.js'));
  assert(!h.includes('local-ui-'));
 }
 assert(renderProEntry(source).includes('shared/pro-gate.js'));
 assert(RELEASE_FILES.every(p=>!p.startsWith('scripts/')&&!p.includes('local-ui')&&!p.includes('book-source')&&!p.includes('owner-chord-panel')));
 for(const p of RELEASE_FILES.filter(p=>/\.(?:js|mjs|html)$/.test(p)))assert(!read(p).includes('mock-account-bookshelf'));
 assert(read('scripts/local-ui-adapter.js').includes('createMockAccountBookshelf'));
 for(const p of RELEASE_FILES.filter(p=>/\.(?:js|mjs|html)$/.test(p)))assert(!read(p).includes('local-ui-adapter'));
 const config=fs.readFileSync(new URL('../../../_config.yml',import.meta.url),'utf8');
 assert(config.includes('  - apps/cruise-studio/scripts'));
});
test('adapter fails closed for wrong scheme, host, port or missing local marker',()=>{
 // The imported generated module only defines owner presentation functions.
 const adapter=read('scripts/local-ui-adapter.js').replace(/^import .*;\n/gm,'');
 for(const location of [{protocol:'https:',hostname:'127.0.0.1',port:'18874'},{protocol:'http:',hostname:'soundcruise.jp',port:'18874'},{protocol:'http:',hostname:'127.0.0.1',port:'18873'}])assert.throws(()=>vm.runInNewContext(adapter,{location,document:{querySelector:()=>true}}),/refused/);
 assert.throws(()=>vm.runInNewContext(adapter,{location:{protocol:'http:',hostname:'127.0.0.1',port:'18874'},document:{querySelector:()=>null}}),/refused/);
});
