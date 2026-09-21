import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortSyncStatus } from './port-sync-status.js';

const cleanStructured = Object.freeze({
    known: true, connected: true, migrationState: 'complete', datasetState: 'ready',
    runtimeState: 'ready', lastSyncAt: 1, pendingCount: 0, conflictCount: 0
});
const cleanAssets = Object.freeze({ known: true, pendingCount: 0, running: false, error: false });

test('Port status reports complete only when structured and binary state are clean', () => {
    assert.equal(createPortSyncStatus({
        accountState: 'active', structured: cleanStructured, assets: cleanAssets, online: true
    }).label, '同期完了');
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

test('Port status fails closed for errors, unknown state, disconnected account and offline state', () => {
    for (const input of [
        { accountState: 'active', structured: cleanStructured, assets: { ...cleanAssets, error: true } },
        { accountState: 'active', structured: { ...cleanStructured, known: false }, assets: cleanAssets },
        { accountState: 'unset', structured: cleanStructured, assets: cleanAssets },
        { accountState: 'active', structured: cleanStructured, assets: cleanAssets, online: false },
        { accountState: 'active', structured: { ...cleanStructured, lastSyncAt: null }, assets: cleanAssets }
    ]) {
        assert.equal(createPortSyncStatus(input).label, '同期を確認してください');
    }
});

test('Port status gives conflicts priority and recovers to complete after online convergence', () => {
    assert.equal(createPortSyncStatus({
        accountState: 'active', structured: { ...cleanStructured, conflictCount: 1 }, assets: cleanAssets
    }).label, '確認が必要');
    assert.equal(createPortSyncStatus({
        accountState: 'active', structured: cleanStructured, assets: cleanAssets, online: true
    }).state, 'complete');
});
