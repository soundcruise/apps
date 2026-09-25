// Builds the ⓘ detail for one app row: the cloud state from the Account summary, and each active
// sync target's own last report from the devices list. It only repeats what those two responses
// say. It never infers a platform from a label, never names a target the responses do not single
// out, and never offers to launch an app, because Port cannot open a specific sync target.

const REPORT_STATES = Object.freeze({
    clean: Object.freeze({ mark: '✓', tone: 'clean', text: '前回の完了報告あり' }),
    pending: Object.freeze({ mark: '○', tone: 'unconfirmed', text: '最新の完了報告は未確認' }),
    none: Object.freeze({ mark: '○', tone: 'unconfirmed', text: '完了報告はまだ確認できていません' }),
    attention: Object.freeze({ mark: '!', tone: 'attention', text: '前回の同期報告に確認事項があります' }),
    error: Object.freeze({ mark: '!', tone: 'attention', text: '前回の同期報告でエラーが報告されています' }),
    unknown: Object.freeze({ mark: '?', tone: 'unconfirmed', text: '報告の状態を取得できませんでした' })
});
const PROBLEM_STATES = new Set(['attention', 'error']);
const UNCONFIRMED_STATES = new Set(['pending', 'none']);
const INFO_APP_STATUSES = new Set(['synced', 'attention', 'connecting', 'initial']);

export const SYNC_DETAIL_COPY = Object.freeze({
    cloudReady: 'クラウド上の同期データは利用できます',
    cloudUnknown: 'クラウド上の同期データの状態を確認できません',
    cloudConnecting: 'クラウド同期の接続を完了しています',
    cloudInitial: '初回の同期がまだ完了していません',
    offline: 'オフラインのため、最新の状態を確認できません。オンラインに戻ると確認できます。',
    summaryUnavailable: '最新の状態を取得できませんでした。通信状態を確認して、もう一度確認してください。',
    devicesUnavailable: '同期先の詳細情報を取得できませんでした',
    mismatch: 'アカウント情報と同期先の最新情報に差があります。もう一度確認してください。',
    noDevices: '同期先はありません',
    footnote: '各同期先のアプリから届いた、最後の報告を表示しています。',
    current: 'このCruise Portから接続'
});

export function appHasSyncDetail(app, kind = 'ready') {
    if (kind === 'offline' || kind === 'error') return true;
    return kind === 'ready' && INFO_APP_STATUSES.has(app?.status);
}

// Display-only short IDs from the app device ID (not a credential). Each starts at 4 characters
// and grows only as far as needed to differ from every other target in this app's list.
export function shortTargetIds(ids) {
    const normalized = ids.map((id) => (typeof id === 'string' ? id.replace(/[^0-9a-z]/gi, '').toUpperCase() : ''));
    return normalized.map((value, index) => {
        if (!value) return null;
        for (let length = Math.min(4, value.length); length <= value.length; length += 1) {
            const prefix = value.slice(0, length);
            if (!normalized.some((other, otherIndex) => otherIndex !== index && other.startsWith(prefix))) return prefix;
        }
        return value;
    });
}

function reportState(target) {
    if (!target?.reportKnown) return 'unknown';
    const report = target.lastReport;
    if (report == null) return 'none';
    return REPORT_STATES[report.state] && report.state !== 'none' && report.state !== 'unknown'
        ? report.state : 'unknown';
}

function defaultFormatTime(value) {
    try {
        return new Date(value).toLocaleString('ja-JP', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    } catch (_) {
        return null;
    }
}

function describeTargets(app, formatTime) {
    const targets = Array.isArray(app?.environments) ? app.environments : [];
    const labels = targets.map((target) => target.registeredLabel || null);
    const shortIds = shortTargetIds(targets.map((target) => target.id));
    return targets.map((target, index) => {
        const label = labels[index];
        const identifiable = label != null && labels.filter((value) => value === label).length === 1;
        const state = reportState(target);
        const presentation = REPORT_STATES[state];
        const attentionCount = state === 'attention' && Number.isSafeInteger(target.lastReport?.attentionCount) &&
            target.lastReport.attentionCount > 0 ? target.lastReport.attentionCount : 0;
        const reportedAt = Number.isSafeInteger(target.lastReport?.reportedAt) ? target.lastReport.reportedAt : null;
        const meta = [];
        if (reportedAt != null && formatTime(reportedAt)) meta.push(`最終報告 ${formatTime(reportedAt)}`);
        if (target.createdAt != null && formatTime(target.createdAt)) meta.push(`追加 ${formatTime(target.createdAt)}`);
        if (target.isCurrent) meta.push(SYNC_DETAIL_COPY.current);
        return Object.freeze({
            id: target.id,
            name: identifiable ? `登録名「${label}」` : `同期先 ${shortIds[index] || '（IDなし）'}`,
            identifiable,
            state,
            tone: presentation.tone,
            mark: presentation.mark,
            stateText: presentation.text,
            countText: attentionCount > 0 ? `確認する内容 ${attentionCount}件` : null,
            meta: Object.freeze(meta)
        });
    });
}

function guidanceFor(app, rows) {
    const guidance = [];
    const anonymous = [];
    for (const row of rows) {
        if (!PROBLEM_STATES.has(row.state) && !UNCONFIRMED_STATES.has(row.state)) continue;
        if (!row.identifiable) {
            anonymous.push(row.name);
            continue;
        }
        guidance.push(PROBLEM_STATES.has(row.state)
            ? `${row.name}の${app.name}を開いて、同期の状態を確認してください。`
            : `${row.name}の${app.name}を開くと、最新の状態を確認できます。`);
    }
    if (anonymous.length) {
        guidance.push(`${anonymous.join('・')}は、登録名で区別できないため、Cruise Portからはどの端末・ブラウザかを特定できません。`);
    }
    return guidance;
}

// kind: the Account summary result ('ready' | 'offline' | 'error').
// devicesState: whether the devices list for this snapshot was received ('ready' | 'unavailable').
export function describeAppSyncDetail(app, { kind = 'ready', devicesState = 'ready', formatTime = defaultFormatTime } = {}) {
    if (kind === 'offline') {
        return Object.freeze({ cloudText: SYNC_DETAIL_COPY.offline, targets: null, notice: null,
            guidance: Object.freeze([]), retry: false });
    }
    if (kind !== 'ready') {
        return Object.freeze({ cloudText: SYNC_DETAIL_COPY.summaryUnavailable, targets: null, notice: null,
            guidance: Object.freeze([]), retry: true });
    }
    const cloudText = app?.status === 'synced' ? SYNC_DETAIL_COPY.cloudReady
        : app?.status === 'connecting' ? SYNC_DETAIL_COPY.cloudConnecting
            : app?.status === 'initial' ? SYNC_DETAIL_COPY.cloudInitial : SYNC_DETAIL_COPY.cloudUnknown;
    if (devicesState !== 'ready') {
        return Object.freeze({ cloudText, targets: null, notice: SYNC_DETAIL_COPY.devicesUnavailable,
            guidance: Object.freeze([]), retry: true });
    }
    // Mismatched snapshots: no target is listed or singled out, only a recheck is offered.
    if (app?.snapshot === 'mismatch') {
        return Object.freeze({ cloudText, targets: null, notice: SYNC_DETAIL_COPY.mismatch,
            guidance: Object.freeze([]), retry: true });
    }
    const rows = describeTargets(app, formatTime);
    return Object.freeze({
        cloudText,
        targets: Object.freeze(rows),
        emptyText: rows.length ? null : SYNC_DETAIL_COPY.noDevices,
        notice: null,
        guidance: Object.freeze(guidanceFor(app, rows)),
        footnote: rows.length ? SYNC_DETAIL_COPY.footnote : null,
        retry: false
    });
}
