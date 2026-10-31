import test from 'node:test';import assert from 'node:assert/strict';
import {proFixture} from './authority-store/pro-device-fixture.mjs';
import {PORT_DATASET_KEYS} from '../port-dataset-repository.js?v=1.26.0';
test('official Pro gate/Device Session can authorize dataset action but cannot substitute for Account Owner',async t=>{
 const x=await proFixture(t,{bound:true}),base=(await x.store.hydrate('g1')).snapshot,gear=JSON.parse(base.values['cruisePort.gearList']);gear.items[0].name='authenticated Pro';
 const p=await x.prepare({id:'dataset-pro',action:'savePortDataset',changes:{'cruisePort.gearList':JSON.stringify(gear)},dependencyKeys:PORT_DATASET_KEYS});assert(p.reserved.ok,p.reserved.reason);
 const r=await x.store.commit(p.handle,{commitGuard:p.proof.commitGuard,ownerCommitGuard:()=>true});assert.equal(r.ok,false);assert.equal(r.reason,'owner-commit-guard-required');
 x.change({generation:x.auth().generation+1});await assert.rejects(x.adapter.authorize({generation:'g1',operationId:'changed-pro',action:'savePortDataset'}),/pro-required/);
});
