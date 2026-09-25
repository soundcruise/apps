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
const INFO_APP_STATUSES = new Set(['synced', 'attention', 'connecting', 'initial', 'deleting']);

export const SYNC_DETAIL_COPY = Object.freeze({
    // 「✓ 同期済み」 is a product status, not a per-target guarantee (see appSyncStatusPresentation).
    synced: '「同期済み」は、クラウド同期を通常利用でき、現在確認されている問題がない状態です。',
    reportedError: '前回の同期報告でエラーが報告されています。',
    reportedAttention: '前回の同期報告に確認事項があります。',
    membershipAttention: '同期の状態に確認が必要な点があります。時間をおいて、もう一度確認してください。',
    progress: '接続したアプリを開くと、初回の同期が進みます。Cruise Portに戻ると表示が更新されます。',
    deleting: '削除を処理しています。完了まで、しばらくお待ちください。',
    cloudReady: 'クラウド上の同期データは利用できます',
    cloudUnknown: 'クラウド上の同期データの状態を確認できません',
    cloudConnecting: 'クラウド同期の接続を完了しています',
    cloudInitial: '初回の同期がまだ完了していません',
    cloudDeleting: 'クラウド上の同期データを削除しています',
    offline: 'オフラインのため、最新の状態を確認できません。インターネットに接続すると、自動で状態を確認します。',
    summaryUnavailable: '最新の状態を取得できませんでした。通信状態を確認して、もう一度確認してください。',
    devicesUnavailable: '同期先の詳細情報を取得できませんでした',
    mismatch: '状態を確定できませんでした。最新情報をもう一度確認してください。',
    noDevices: '同期先はありません',
    footnote: '各同期先のアプリから届いた、最後の報告を表示しています。',
    current: 'このCruise Portから接続',
    support: '解決しない場合は、画面下の「クラウド同期で困ったときは」からお知らせください。'
});

export function attentionCountText(count) {
    return Number.isSafeInteger(count) && count > 0 ? `確認する内容が${count}件あります。` : null;
}

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

// Per-target next steps, by registered name only. A target that cannot be told apart is never
// guessed at; when no reported problem can be pointed at, the app-wide step is given instead.
function guidanceFor(app, rows, needsAction) {
    const guidance = [];
    const anonymous = [];
    let pointed = false;
    for (const row of rows) {
        if (!PROBLEM_STATES.has(row.state) && !UNCONFIRMED_STATES.has(row.state)) continue;
        if (!row.identifiable) {
            anonymous.push(row.name);
            continue;
        }
        if (PROBLEM_STATES.has(row.state)) pointed = true;
        guidance.push(row.state === 'attention'
            ? `${row.name}の${app.name}を開き、同期画面で内容を確認してください。`
            : row.state === 'error'
                ? `${row.name}の${app.name}を開き、同期画面を確認してください。`
                : `${row.name}の${app.name}を開くと、最新の状態を確認できます。`);
    }
    if (anonymous.length) {
        guidance.push(`${anonymous.join('・')}は、登録名で区別できないため、Cruise Portからはどの端末・ブラウザかを特定できません。`);
    }
    if (needsAction && !pointed) {
        guidance.push(`${app.name}を使っている端末・ブラウザで${app.name}を開き、同期画面を確認してください。`);
    }
    return guidance;
}

// The one-line meaning of the row's main status, shown first in ⓘ.
function statusTextFor(app, presentationState, rows) {
    if (presentationState === 'available') return SYNC_DETAIL_COPY.synced;
    if (presentationState === 'syncing' || presentationState === 'connecting') return SYNC_DETAIL_COPY.progress;
    if (presentationState === 'deleting') return SYNC_DETAIL_COPY.deleting;
    if (presentationState !== 'attention') return null;
    if (app?.status !== 'synced') return SYNC_DETAIL_COPY.membershipAttention;
    return attentionCountText(app.attentionCount) ||
        (rows?.some((row) => row.state === 'error') ? SYNC_DETAIL_COPY.reportedError : SYNC_DETAIL_COPY.reportedAttention);
}

function detail(fields) {
    return Object.freeze({ statusText: null, targets: null, notice: null, guidance: Object.freeze([]),
        retry: false, support: false, ...fields });
}

// kind: the Account summary result ('ready' | 'offline' | 'error').
// devicesState: whether the devices list for this snapshot was received ('ready' | 'unavailable').
// Every state other than 「✓ 同期済み」 carries its next step here: a target to open, a recheck,
// waiting, or (when that does not resolve it) the support section at the bottom of Sync Center.
export function describeAppSyncDetail(app, { kind = 'ready', devicesState = 'ready', formatTime = defaultFormatTime } = {}) {
    if (kind === 'offline') {
        return detail({ cloudText: SYNC_DETAIL_COPY.offline });
    }
    if (kind !== 'ready') {
        return detail({ cloudText: SYNC_DETAIL_COPY.summaryUnavailable, retry: true, support: true });
    }
    const presentationState = app?.presentationStatus?.state || null;
    const cloudText = app?.status === 'synced' ? SYNC_DETAIL_COPY.cloudReady
        : app?.status === 'connecting' ? SYNC_DETAIL_COPY.cloudConnecting
            : app?.status === 'initial' ? SYNC_DETAIL_COPY.cloudInitial
                : app?.status === 'deleting' ? SYNC_DETAIL_COPY.cloudDeleting : SYNC_DETAIL_COPY.cloudUnknown;
    if (app?.status === 'deleting') {
        return detail({ statusText: SYNC_DETAIL_COPY.deleting, cloudText });
    }
    const inProgress = presentationState === 'syncing' || presentationState === 'connecting';
    const membershipAttention = presentationState === 'attention' && app?.status !== 'synced';
    const reportedAttention = presentationState === 'attention' && !membershipAttention;
    if (devicesState !== 'ready') {
        return detail({ statusText: statusTextFor(app, presentationState, null), cloudText,
            notice: SYNC_DETAIL_COPY.devicesUnavailable,
            guidance: Object.freeze(reportedAttention ? guidanceFor(app, [], true) : []),
            retry: true, support: true });
    }
    // Mismatched snapshots: no target is listed or singled out, only a recheck is offered.
    if (app?.snapshot === 'mismatch') {
        return detail({ cloudText, notice: SYNC_DETAIL_COPY.mismatch, retry: true, support: true });
    }
    const rows = describeTargets(app, formatTime);
    return detail({
        statusText: statusTextFor(app, presentationState, rows),
        cloudText,
        targets: Object.freeze(rows),
        emptyText: rows.length ? null : SYNC_DETAIL_COPY.noDevices,
        guidance: Object.freeze(guidanceFor(app, rows, reportedAttention)),
        footnote: rows.length ? SYNC_DETAIL_COPY.footnote : null,
        retry: inProgress || membershipAttention,
        support: presentationState === 'attention'
    });
}
