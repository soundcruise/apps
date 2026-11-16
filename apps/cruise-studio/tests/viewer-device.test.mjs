import test from 'node:test';
import assert from 'node:assert/strict';
import {createScreenWakeLock} from '../../score-viewer/core/wake-lock.mjs';
import {buildLocalViewerOffline} from '../scripts/build-local-viewer-offline.mjs';
import {renderLocalPortViewer} from '../scripts/local-port-viewer.mjs';
const settle=()=>new Promise(r=>setImmediate(r));
class Grant extends EventTarget{released=false;calls=0;async release(){this.calls++;this.released=true;this.dispatchEvent(new Event('release'));}}
test('screen wake preference is not an acquired lock; start, pause and disposal own one grant',async()=>{
    const grants=[],wake=createScreenWakeLock({request:async kind=>{assert.equal(kind,'screen');const g=new Grant();grants.push(g);return g;}});
    assert.equal(wake.snapshot().phase,'idle');wake.setActive(true);await settle();assert.equal(wake.snapshot().phase,'held');wake.setActive(true);await settle();assert.equal(grants.length,1);
    wake.setActive(false);await settle();assert.equal(grants[0].calls,1);assert.equal(wake.snapshot().phase,'idle');wake.setActive(true);await settle();await wake.dispose();assert.equal(grants[1].calls,1);
});
test('late wake grants after pause, disabled preference or disposal are released, never reported held',async()=>{
    for(const stop of [w=>w.setActive(false),w=>w.setEnabled(false),w=>w.dispose()]){
        let resolve;const wake=createScreenWakeLock({request:()=>new Promise(r=>resolve=r)});wake.setActive(true);stop(wake);const g=new Grant();resolve(g);await settle();assert(g.released);assert.notEqual(wake.snapshot().phase,'held');
    }
});
test('visibility releases and returning reacquires only while the performance is still active',async()=>{
    let visible=true;const grants=[],wake=createScreenWakeLock({visible:()=>visible,request:async()=>{const g=new Grant();grants.push(g);return g;}});
    wake.setActive(true);await settle();visible=false;wake.visibilityChanged();await settle();assert(grants[0].released);visible=true;wake.visibilityChanged();await settle();assert.equal(grants.length,2);
    wake.setActive(false);visible=false;wake.visibilityChanged();visible=true;wake.visibilityChanged();await settle();assert.equal(grants.length,2);await wake.dispose();
});
test('OS revocation and rejection are truthful and do not spin; explicit retry may acquire',async()=>{
    let calls=0;const grant=new Grant(),wake=createScreenWakeLock({request:async()=>{if(++calls===1)throw Error('NotAllowed');return grant;}});wake.setActive(true);await settle();assert.equal(wake.snapshot().phase,'denied');assert.equal(calls,1);wake.retry();await settle();assert.equal(wake.snapshot().phase,'held');await grant.release();await settle();assert.equal(wake.snapshot().phase,'released');assert.equal(calls,2);await wake.dispose();
});
test('unsupported or insecure contexts never claim to prevent locking',async()=>{
    let calls=0;for(const options of [{},{secure:false,request:async()=>calls++}]){const wake=createScreenWakeLock(options);wake.setActive(true);await settle();assert.equal(wake.snapshot().phase,'unsupported');await wake.dispose();}assert.equal(calls,0);
});
test('offline dependency closure is content hashed, complete and excludes authentication, editing sessions and APIs',()=>{
    const m=buildLocalViewerOffline();assert(m.assets.length>200);assert(m.assets.every(a=>a.path.startsWith('/apps/')&&a.sha256.length===64&&a.bytes>0));
    assert(!m.assets.some(a=>/\/shared\/|\/cloud\/|sync-account|production-config|editing-session|project-repository/.test(a.path)));
    for(const suffix of ['local/index.html','local/port.html','acoustic-bank.js','salamander-bank.js','pdf.worker.min.mjs'])assert(m.assets.some(a=>a.path.endsWith(suffix)),suffix);
    assert(m.assets.reduce((n,a)=>n+a.bytes,0)<20*1024*1024);
});
test('local Port reuses the real tools markup while adding only an isolated viewer route',()=>{
    const html=renderLocalPortViewer();assert(html.includes('id="score-viewer-card"'));assert(html.includes('id="tuner-card"'));assert(html.includes('aria-disabled="true"'));assert(!html.includes('<script'));assert(!html.includes('production-config'));assert(html.includes('local/index.html?from=port'));
});
