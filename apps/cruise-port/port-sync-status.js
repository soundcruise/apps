const PRESENTATIONS = Object.freeze({
    synced: Object.freeze({
        state: 'synced',
        label: '✓ 同期済み'
    }),
    syncing: Object.freeze({
        state: 'syncing',
        label: '同期中'
    }),
    attention: Object.freeze({
        state: 'attention',
        label: '確認が必要'
    }),
    detached: Object.freeze({ state: 'detached', label: '未接続' }),
    deleting: Object.freeze({ state: 'deleting', label: '削除中' })
});

export function createPortSyncStatus({ accountState, structured, assets, online = true } = {}) {
    if (accountState === 'deleting') return PRESENTATIONS.deleting;
    if (accountState === 'unset') return PRESENTATIONS.detached;
    if (accountState !== 'active' || !structured?.known || !assets?.known) return PRESENTATIONS.attention;
    if (structured.connected === false && structured.runtimeState === 'not_connected') return PRESENTATIONS.detached;
    if (!structured.connected) return PRESENTATIONS.attention;
    if (structured.conflictCount > 0 || structured.terminalCount > 0 || structured.runtimeState === 'attention') {
        return PRESENTATIONS.attention;
    }
    if (!online || assets.error || ['paused', 'credential_invalid', 'not_connected'].includes(structured.runtimeState)) {
        return PRESENTATIONS.attention;
    }
    if (structured.pendingCount > 0 || assets.pendingCount > 0 || assets.running ||
        ['syncing', 'pending', 'retrying'].includes(structured.runtimeState) || structured.migrationState !== 'complete' ||
        structured.datasetState !== 'ready') return PRESENTATIONS.syncing;
    if (structured.runtimeState === 'ready' && Number.isFinite(structured.lastSyncAt)) return PRESENTATIONS.synced;
    return PRESENTATIONS.attention;
}

export { PRESENTATIONS as PORT_SYNC_STATUS_PRESENTATIONS };
