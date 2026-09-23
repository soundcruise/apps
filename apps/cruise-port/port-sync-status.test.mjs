import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortSyncStatus } from './port-sync-status.js';

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
