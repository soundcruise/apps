const PRESENTATIONS = Object.freeze({
    checking: Object.freeze({ state: 'checking', label: '確認中…' }),
    unstarted: Object.freeze({ state: 'unstarted', label: '同期は未開始' }),
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

export function createPortSyncStatus({ accountState, structured, assets, online = true, runtimeActive, accountKind, accountErrorCode } = {}) {
    if (accountState === 'deleting') return PRESENTATIONS.deleting;
    if (accountState === 'unset') return PRESENTATIONS.detached;
    if (structured?.checking) return PRESENTATIONS.checking;
    if (!online || accountKind === 'offline') return Object.freeze({ ...PRESENTATIONS.attention, label: 'オフライン' });
    if (accountKind === 'error') return Object.freeze({ ...PRESENTATIONS.attention, detail: portSyncActionError(accountErrorCode) });
    if (structured?.autoResumeCode && !['activation_required', 'local_data_unconfirmed'].includes(structured.autoResumeCode)) {
        return Object.freeze({ ...PRESENTATIONS.attention, detail: portSyncActionError(structured.autoResumeCode) });
    }
    // Target counts describe membership, not whether this page has started Port Sync.
    // Retained AppDevice credentials are intentionally stale until explicit activation.
    if (accountState === 'active' && structured?.known && !structured.conflictCount && !structured.terminalCount &&
        !assets?.error && !['attention', 'credential_invalid'].includes(structured.runtimeState) &&
        structured.credentialState !== 'revoked' &&
        (structured.credentialExists === false || runtimeActive === false)) {
        return Object.freeze({ ...PRESENTATIONS.unstarted,
            label: structured.credentialExists ? '同期は停止中' : '同期は未開始',
            detail: structured.autoResumeCode === 'local_data_unconfirmed'
                ? '未同期変更のAccount帰属を自動確認できません。内容と接続先を確認して「同期を開始・再開」を押してください。'
                : online ? 'Accountは確認済みです。「同期を開始・再開」で、この端末とクラウドのデータを同期します。'
                : 'オフラインです。オンラインに戻ってから「同期を開始・再開」を押してください。' });
    }
    if (accountState !== 'active' || !structured?.known || !assets?.known) return PRESENTATIONS.attention;
    if (structured.connected === false && structured.runtimeState === 'not_connected') return PRESENTATIONS.detached;
    if (structured.credentialState !== 'revoked' && !structured.conflictCount && !structured.terminalCount &&
        ['syncing', 'pending', 'retrying'].includes(structured.runtimeState) && runtimeActive !== false) return PRESENTATIONS.syncing;
    if (!structured.connected || (structured.credentialState && structured.credentialState !== 'usable')) return PRESENTATIONS.attention;
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

// Display guidance only. This never admits a writer or changes an Outbox item.
export function portSyncStatusDetail({ accountState, structured, assets, online = true, status } = {}) {
    if (status?.state === 'checking') return '';
    if (status?.detail) return status.detail;
    if (accountState === 'unset') return '既存のAccountへ接続してから同期を開始してください。';
    if (accountState === 'deleting') return 'Accountの削除処理中です。';
    if (accountState !== 'active') return 'Accountを再確認してください。データ同期の状態は未確認です。';
    if (structured?.conflictCount > 0) return `未解決の競合が${structured.conflictCount}件あります。「競合を確認する」で残す内容を選んでください。`;
    if (!online) return 'オフラインです。保存内容は保持されています。オンラインに戻って同期を再開してください。';
    if (structured?.credentialState === 'revoked' || structured?.runtimeState === 'credential_invalid') return 'この端末の同期資格を確認できません。Accountの接続・端末状態を確認してください。';
    if (structured?.terminalCount > 0) return '送信を完了できない操作があります。同期を再開して確認してください。保存内容は保持されています。';
    if (assets?.error) return '画像・添付の同期を完了できませんでした。接続を確認して同期を再開してください。';
    if (status?.state === 'attention') return '同期状態を確認できません。「同期を開始・再開」で再確認してください。';
    return '';
}

export function portSyncActionError(code) {
    if (['account_device_revoked', 'app_device_revoked', 'credential_invalid', 'account_credential_invalid', 'pro_revoked', 'pro_expired'].includes(code)) return 'Account・端末・Proの資格を確認してください。入力内容は保持されています。';
    if (code === 'pro_required') return 'クラウド同期はPro版で利用できます。';
    if (code === 'offline') return 'オフラインです。オンラインに戻ってから同期を再開してください。';
    if (code === 'rate_limited') return '確認要求が混み合っています。少し待って同期を再開してください。保存内容は保持されています。';
    if (['service_unavailable', 'network_error', 'request_failed'].includes(code)) return '通信を完了できませんでした。接続を確認して同期を再開してください。保存内容は保持されています。';
    if (['account_generation_changed', 'runtime_disposed', 'account_not_configured'].includes(code)) return 'Accountの接続が変わりました。現在のAccountを確認してから同期を再開してください。';
    return '同期を完了できませんでした。接続とAccount・端末資格を確認して、もう一度お試しください。保存内容は保持されています。';
}
