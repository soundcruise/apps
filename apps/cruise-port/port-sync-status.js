const PRESENTATIONS = Object.freeze({
    complete: Object.freeze({
        state: 'complete',
        label: '同期完了',
        description: 'Cruise Port内で保存した変更はクラウドに同期されています。'
    }),
    syncing: Object.freeze({
        state: 'syncing',
        label: '同期中',
        description: '保存した変更をクラウドに同期しています。'
    }),
    check: Object.freeze({
        state: 'check',
        label: '同期を確認してください',
        description: '通信状態を確認し、Cruise Portを開いたまましばらくお待ちください。'
    }),
    attention: Object.freeze({
        state: 'attention',
        label: '確認が必要',
        description: '同期で確認が必要な項目があります。'
    })
});

export function createPortSyncStatus({ accountState, structured, assets, online = true } = {}) {
    if (accountState !== 'active' || !structured?.known || !structured.connected || !assets?.known) {
        return PRESENTATIONS.check;
    }
    if (structured.conflictCount > 0 || structured.runtimeState === 'attention') return PRESENTATIONS.attention;
    if (!online || assets.error || ['paused', 'retrying', 'credential_invalid', 'not_connected'].includes(structured.runtimeState)) {
        return PRESENTATIONS.check;
    }
    if (structured.pendingCount > 0 || assets.pendingCount > 0 || assets.running ||
        structured.runtimeState === 'syncing' || structured.migrationState !== 'complete' ||
        structured.datasetState !== 'ready') return PRESENTATIONS.syncing;
    if (structured.runtimeState === 'ready' && Number.isFinite(structured.lastSyncAt)) return PRESENTATIONS.complete;
    return PRESENTATIONS.check;
}

export { PRESENTATIONS as PORT_SYNC_STATUS_PRESENTATIONS };
