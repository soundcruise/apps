import test from 'node:test';
import assert from 'node:assert/strict';
import {describeSyncConnection} from '../js/port-sync-status.mjs';
for(const state of ['checking','disconnected','connected','stored','attention','offline','error'])test('plain connection guidance: '+state,()=>{const copy=describeSyncConnection({state,errorCode:'account_required'});assert(copy.title&&copy.detail&&copy.action);assert(!JSON.stringify(copy).includes('account_required'));assert.equal(copy.recheck,!['checking','disconnected'].includes(state));});
test('stored credentials, outage and no credentials have distinct recovery paths',()=>{assert.equal(describeSyncConnection({state:'disconnected'}).action,'既存Accountに接続');assert.equal(describeSyncConnection({state:'attention'}).action,'接続を復旧する');assert.match(describeSyncConnection({state:'error'}).detail,/資格失効とは判定していません/);});
