import test from 'node:test';
import assert from 'node:assert/strict';
import { describeAccountObservation } from '../js/port-data/account-status-projection.mjs';

test('Account display does not promote local counters or a known Account to authorization', () => {
    const input = { account: 'membership-known', generation: 20, runtimeGeneration: 73,
        accountCredential: 'private', canWrite: true, accountGeneration: 99, membershipGeneration: 100 };
    const output = describeAccountObservation(input);
    assert.equal(output.localObservationRevision, 20); assert.equal(output.runtimeRevision, 73);
    assert.equal(output.serverAccountGeneration, null); assert.equal(output.serverMembershipGeneration, null);
    assert.equal(output.canWrite, false); assert.equal(output.authorizationConfirmed, false);
    assert.match(output.detail, /サーバー.*未確認/); assert(!JSON.stringify(output).includes('private'));
    assert.equal(input.canWrite, true); assert(Object.isFrozen(output));
});
test('all existing Host states and unknown inherited names stay explicit readonly observations', () => {
    const labels = { unknown: '未確認', unavailable: '確認できません', 'no-account-known': '保存済みAccountなし',
        'account-known': '保存済みAccountあり', 'membership-known': '保存済みmembershipあり' };
    for (const [account, expected] of Object.entries(labels)) {
        const output = describeAccountObservation({ account });
        assert.equal(output.label, expected); assert.equal(output.canWrite, false);
    }
    for (const account of ['toString', '__proto__', 'constructor']) assert.equal(describeAccountObservation({ account }).label, '未確認');
    assert.equal(describeAccountObservation().localObservationRevision, null);
});
test('isolated owner-read generation is labelled historical, never a lease or UI generation',()=>{
 const state={account:'owner-observed-readonly',generation:20,runtimeGeneration:73,
  accountObservation:{status:'observed-readonly',asOfRead:true,serverAccountGeneration:7,membershipGeneration:11,
   authorizationConfirmed:false,operationAuthorized:false,canWrite:false}};
 const view=describeAccountObservation(state);assert.equal(view.serverAccountGeneration,7);assert.equal(view.serverMembershipGeneration,11);
 assert.equal(view.localObservationRevision,20);assert.match(view.detail,/読取り時点/);assert.equal(view.canWrite,false);
 state.accountObservation.authorizationConfirmed=true;assert.equal(describeAccountObservation(state).serverAccountGeneration,null);
});
