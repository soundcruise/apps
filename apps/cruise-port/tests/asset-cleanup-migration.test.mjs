import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationFixture, assetFixture } from './migration-fixture.mjs';
import { binaryManifest } from '../port-migration-candidate.mjs';
for(const state of ['cleanup-claimed','deleting','recovery-required','deleted']) test(`migration retains ${state} evidence but cannot stage it as verified binary`,async()=>{
 const asset=await assetFixture();asset.metadata.cleanup={state,claimId:'fixed-claim',objectVersion:1,writeEpoch:1};
 const f=await migrationFixture({assets:[asset]}),c=await f.capture();
 assert.equal(c.ok,false);assert.ok(c.issues.includes('binary-cleanup-unavailable'));
 assert.equal(c.binaryManifest[0].cleanup.claimId,'fixed-claim');assert.equal(c.binaryManifest[0].deletionState,state);
 await assert.rejects(()=>binaryManifest(c.values,c.assets),/binary-cleanup-unavailable/);
 const e=f.engine();await e.begin(c);await assert.rejects(()=>e.stage(c));
});
test('available cleanup evidence is hashed; claim identity change invalidates the candidate',async()=>{
 const asset=await assetFixture();asset.metadata.cleanup={state:'available',objectVersion:1};
 const f=await migrationFixture({assets:[asset]}),c=await f.capture();assert.equal(c.ok,true);
 asset.metadata.cleanup={state:'deleting',claimId:'next-claim',objectVersion:1};f.state.assets=[asset];
 const next=await f.capture();assert.notEqual(next.sourceHash,c.sourceHash);assert.equal(next.ok,false);
});
