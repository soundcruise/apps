// Presentation reads the current Host model; it never owns a Port dataset or writer.
export function describeRead(state, { requested = false, loading = false, hadData = false } = {}) {
    if (state.account === 'unavailable' || state.pro === 'unavailable') return { status: 'error', text: '読込失敗・読み取り専用。保存データは変更していません。再確認できます。' };
    if (loading || (requested && !state.dataset)) return { status: hadData ? 'stale' : 'loading', text: hadData ? '保存値の更新を確認中（stale）・読み取り専用。' : '読込中・読み取り専用' };
    if (!state.dataset) return { status: 'unloaded', text: '未確認・読み取り専用' };
    if (state.dataset.state === 'forward-incompatible' || state.dataset.settings.schemaState === 'forward-incompatible') return { status: 'future', text: '新しい形式・閲覧のみ。一時設定への反映はできません。' };
    if (state.dataset.settings.schemaState === 'invalid') return { status: 'invalid', text: '設定形式を確認できません・読み取り専用' };
    if (state.dataset.settings.schemaState === 'absent' && state.dataset.presets.length === 0) return { status: 'empty', text: '保存データなし・読み取り専用' };
    return { status: 'loaded', text: 'ローカル保存値を読込済み・読み取り専用' };
}
export function findPreset(state, id) { return state.dataset?.presets.find(preset => preset.id === id) || null; }
export function standardBpm(state, presetId = null) {
    if (!state.dataset || state.dataset.state === 'forward-incompatible') return null;
    const value = presetId === null ? state.dataset.settings : findPreset(state, presetId);
    if (!value || !['current', 'legacy-view'].includes(value.schemaState)) return null;
    const bpm = value.savedBpm;
    return Number.isInteger(bpm) && bpm >= 30 && bpm <= 240 ? bpm : null;
}
export function copyStandardBpm(host, runtime, { revision, presetId = null }) {
    // Revalidate the visible revision at the synchronous user-action boundary.
    const state = host.getCachedStatus();
    if (host.canWrite !== false || state.canWrite !== false || state.dataset?.revision !== revision) return false;
    const bpm = standardBpm(state, presetId);
    if (bpm === null) return false;
    return runtime.setBpm(bpm) !== false;
}
