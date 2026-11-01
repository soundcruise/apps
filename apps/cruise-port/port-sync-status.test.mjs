import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortSyncStatus, portSyncStatusDetail, portSyncActionError } from './port-sync-status.js';

const cleanStructured = Object.freeze({
    known: true, connected: true, migrationState: 'complete', datasetState: 'ready',
    runtimeState: 'ready', lastSyncAt: 1, pendingCount: 0, conflictCount: 0
});
const cleanAssets = Object.freeze({ known: true, pendingCount: 0, running: false, error: false });

test('Port status reports the unified synced presentation only when structured and binary state are clean', () => {
    assert.equal(createPortSyncStatus({
        accountState: 'active', structured: cleanStructured, assets: cleanAssets, online: true
    }).label, '✓ 同期済み');
});

test('Port status keeps structured, upload and reference work in progress', () => {
    for (const [structured, assets] of [
        [{ ...cleanStructured, pendingCount: 1 }, cleanAssets],
        [cleanStructured, { ...cleanAssets, pendingCount: 1 }],
        [cleanStructured, { ...cleanAssets, running: true }],
        [{ ...cleanStructured, migrationState: 'not_started' }, cleanAssets]
    ]) {
        assert.equal(createPortSyncStatus({ accountState: 'active', structured, assets }).label, '同期中');
    }
});

test('Port status fails closed for errors, unknown state and offline state', () => {
    for (const input of [
        { accountState: 'active', structured: cleanStructured, assets: { ...cleanAssets, error: true } },
        { accountState: 'active', structured: { ...cleanStructured, known: false }, assets: cleanAssets },
        { accountState: 'active', structured: cleanStructured, assets: cleanAssets, online: false },
        { accountState: 'active', structured: { ...cleanStructured, lastSyncAt: null }, assets: cleanAssets }
    ]) {
        assert.equal(createPortSyncStatus(input).label, '確認が必要');
    }
});

test('Port status gives conflicts priority and recovers to complete after online convergence', () => {
    assert.equal(createPortSyncStatus({
        accountState: 'active', structured: { ...cleanStructured, conflictCount: 1 }, assets: cleanAssets
    }).label, '確認が必要');
    assert.equal(createPortSyncStatus({
        accountState: 'active', structured: cleanStructured, assets: cleanAssets, online: true
    }).state, 'synced');
    assert.equal(createPortSyncStatus({
        accountState: 'active', structured: { ...cleanStructured, pendingCount: 1, terminalCount: 1 }, assets: cleanAssets
    }).label, '確認が必要');
});

test('Port status distinguishes confirmed unconnected and deleting states from unknown state', () => {
    assert.equal(createPortSyncStatus({ accountState: 'unset' }).label, '未接続');
    assert.equal(createPortSyncStatus({
        accountState: 'active',
        structured: { ...cleanStructured, connected: false, runtimeState: 'not_connected' },
        assets: cleanAssets
    }).label, '未接続');
    assert.equal(createPortSyncStatus({ accountState: 'deleting' }).label, '削除中');
});

test('cached/stale/revoked AppDevice credential cannot be presented as synced',()=>{
 for(const credentialState of ['unknown','stale','revoked','expired']){
  assert.equal(createPortSyncStatus({accountState:'active',structured:{known:true,connected:true,credentialState,runtimeState:'ready',migrationState:'complete',datasetState:'ready',lastSyncAt:1000},assets:{known:true,pendingCount:0},online:true}).state,'attention');
 }
});


test('a retained stale credential is stopped, not a conflict, until the owner is explicitly started', () => {
    const structured = { ...cleanStructured, credentialExists: true, credentialState: 'stale' };
    const input = { accountState: 'active', structured, assets: { known: false }, runtimeActive: false };
    assert.equal(createPortSyncStatus(input).label, '同期は停止中');
    assert.match(createPortSyncStatus(input).detail, /同期を開始・再開/);
    assert.equal(createPortSyncStatus({ ...input, runtimeActive: true }).state, 'attention');
    for (const change of [{ conflictCount: 1 }, { terminalCount: 1 }, { credentialState: 'revoked' }, { runtimeState: 'credential_invalid' }, { runtimeState: 'attention' }]) {
        assert.equal(createPortSyncStatus({ ...input, structured: { ...structured, ...change } }).state, 'attention');
    }
});

test('guidance distinguishes actual conflict, offline, revoked, failed operation and unknown state', () => {
    for (const [structured, online, expected] of [
        [{ conflictCount: 2 }, true, /競合が2件/],
        [{}, false, /オフライン/],
        [{ credentialState: 'revoked' }, true, /同期資格/],
        [{ terminalCount: 1 }, true, /送信を完了できない/],
        [{}, true, /状態を確認できません/]
    ]) assert.match(portSyncStatusDetail({ accountState: 'active', structured, online, status: { state: 'attention' } }), expected);
    assert.match(portSyncActionError('offline'), /オフライン/);
    assert.match(portSyncActionError('pro_required'), /Pro版/);
    assert.match(portSyncActionError('account_generation_changed'), /Accountの接続が変わりました/);
    assert.match(portSyncActionError('synthetic_unknown'), /保存内容は保持/);
});
