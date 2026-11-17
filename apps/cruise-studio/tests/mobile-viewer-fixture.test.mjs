import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildMobileViewerFixture} from '../scripts/build-mobile-viewer-fixture.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
test('mobile fixture accepts only exact private HTTPS origins and external temporary destinations',()=>{
 for(const origin of ['http://192.168.0.1:18875','https://example.com','https://0.0.0.0:18875','https://127.0.0.1:18875/','https://192.168.0.1:18875/path','https://192.168.0.1:18875?x=y'])assert.throws(()=>buildMobileViewerFixture({destination:os.tmpdir(),origin}));
 assert.throws(()=>buildMobileViewerFixture({destination:process.cwd(),origin:'https://127.0.0.1:18875'}));
});
test('generated mobile worker is scoped to its exact test origin; source worker and static assets are verified',()=>{
 const destination=fs.mkdtempSync(path.join(os.tmpdir(),'score-mobile-build-')),origin='https://192.168.0.10:18875',worker=new URL('../../score-viewer/local/sw.js',import.meta.url),before=hash(fs.readFileSync(worker));
 try{const config=buildMobileViewerFixture({destination,origin});assert.equal(hash(fs.readFileSync(worker)),before);assert(config.files>250);const copy=fs.readFileSync(path.join(destination,'apps/score-viewer/local/sw.js'),'utf8');assert(copy.includes("self.location.origin!=='"+origin+"'"));assert(copy.includes(origin+'/apps/score-viewer/local/'));assert(!copy.includes('http://127.0.0.1:18874'));const boot=fs.readFileSync(path.join(destination,'apps/score-viewer/local/boot.mjs'),'utf8');assert(boot.includes('location.origin!=='+JSON.stringify(origin)));assert(!boot.includes('mountMockSync'));
 const m=JSON.parse(fs.readFileSync(path.join(destination,'apps/score-viewer/local/asset-list.js'),'utf8').split('self.VIEWER_LOCAL_ASSETS=')[1].trim().replace(/;$/,''));for(const a of m.assets){const bytes=fs.readFileSync(path.join(destination,a.path));assert.equal(bytes.length,a.bytes);assert.equal(hash(bytes),a.sha256);}assert(!config.allowed.includes('/fixture-config.json'));assert(!config.allowed.some(p=>p.includes('/cloud/')||p.includes('/sync-account/')||p.includes('/pro-gate')||p.includes('/.git/')));assert.throws(()=>buildMobileViewerFixture({destination,origin}),/destination-not-empty/);
 }finally{fs.rmSync(destination,{recursive:true,force:true});}
});
