// B1-4: pure migration evidence. No ambient storage, credentials or network.
export const MIGRATION_SCHEMA = 1;
export const MIGRATION_STATES = Object.freeze(['legacy', 'candidate-captured', 'staging', 'prepared',
    'awaiting-cloud-fence', 'reconciling', 'ready-to-publish', 'active', 'review-required', 'recovery-required']);
export const fail = code => Object.assign(new Error(code), { code });
export const clone = value => structuredClone(value);
export const canonical = value => JSON.stringify(sort(value));
function sort(value) {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
    return value;
}
export const equal = (a, b) => canonical(a ?? null) === canonical(b ?? null);
export const recordKey = r => `${r.recordType}/${r.recordId}`;
export const deleted = r => !!r && (r.deleted === true || r.deletedAt != null);
export const sameRecord = (a, b) => !a || !b ? a === b : deleted(a) === deleted(b) &&
    a.schemaVersion === b.schemaVersion && equal(a.payload, b.payload) && a.payloadHash === b.payloadHash;
export function safeEvidence(value) {
    const raw = JSON.stringify(value);
    if (/\b(?:sca1|scd1|scp1|sch1)\.[A-Za-z0-9_-]+\./.test(raw) ||
        /(?:\\?"|^)(?:[A-Za-z0-9_]*(?:credential|token|secret|password)|authorization|apiKey|recoveryCode|deviceKey|receipt)(?:\\?")\s*:/i.test(raw))
        throw fail('migration-secret-forbidden');
    return value;
}
export function assertIdentity(identity) {
    if (!identity || identity.appId !== 'port' || identity.datasetOwner !== 'port' ||
        typeof identity.partitionId !== 'string' || !identity.partitionId || identity.sourceNamespace !== 'legacy' ||
        !['unbound-local', 'bound-account', 'pending-transfer', 'unknown-owner'].includes(identity.ownership) ||
        (identity.ownership === 'bound-account' ? typeof identity.accountId !== 'string' || !identity.accountId : identity.accountId !== null))
        throw fail('migration-identity-invalid');
}
export const legacySyncName = account => `sound-cruise-sync-data-port-account-${encodeURIComponent(account)}`;
export function assertSyncProvenance(sync, identity) {
    if (identity.ownership === 'unbound-local') {
        if (sync?.inspected !== true || sync?.provenance?.state !== 'absent' || ['outbox', 'shadow', 'conflicts'].some(k => sync[k]?.length))
            throw fail('migration-sync-owner-unknown');
        return;
    }
    const p = sync?.provenance;
    if (!p || p.accountId !== identity.accountId || p.appId !== 'port' || p.partitionId !== identity.partitionId ||
        p.datasetId !== identity.datasetId || !identity.datasetId ||
        (p.databaseName !== legacySyncName(identity.accountId) && !(p.databaseName === 'sound-cruise-sync-data-port' && p.legacyDeviceVerified === true)))
        throw fail('migration-sync-provenance-mismatch');
    for (const name of ['outbox','shadow','conflicts']) {
        const rows=sync[name];if(!Array.isArray(rows))throw fail('migration-sync-incomplete');
        if(rows.some(r=>r.accountId!==undefined&&r.accountId!==identity.accountId||r.appId!==undefined&&r.appId!=='port'||r.datasetId!==undefined&&r.datasetId!==identity.datasetId))throw fail('migration-sync-provenance-mismatch');
        const identities=rows.map(r=>name==='outbox'?r.operationId:name==='shadow'?recordKey(r):r.id);
        if(identities.some(v=>typeof v!=='string'||!v)||new Set(identities).size!==identities.length)throw fail('migration-sync-record-identity');
        if(sync.keys&&(!Array.isArray(sync.keys[name])||!equal([...sync.keys[name]].sort(),identities.sort())))throw fail('migration-sync-key-mismatch');
    }
    if (!['present', 'absent'].includes(p.state) || sync.inspected !== true ||
        ['outbox', 'shadow', 'conflicts'].some(k => !Array.isArray(sync[k]) || p.state === 'absent' && sync[k].length)) throw fail('migration-sync-incomplete');
}
export const MIGRATION_RECORD_TYPES = Object.freeze(['settings', 'metronome_settings', 'tuner_settings', 'practice_cycle', 'metronome_preset', 'calendar_event', 'practice_menu', 'practice_menu_order', 'practice_menu_set', 'practice_attachment', 'practice_attachment_set', 'practice_history_event', 'gear_category', 'gear_category_order', 'gear_item', 'gear_order', 'my_app', 'my_app_order']);
export function graphIssues(records) {
    if (records.some(r => !MIGRATION_RECORD_TYPES.includes(r.recordType))) return [{reason:'unknown-record'}];
    const live = records.filter(r => !deleted(r)), issues = [];
    const by = type => live.filter(r => r.recordType === type);
    const ids = type => by(type).map(r => r.recordId).sort();
    const order = (type, id, expected) => {
        const found = by(type).find(r => r.recordId === id);
        if (expected.length || found) {
            const value = found?.payload?.value;
            if (!Array.isArray(value) || new Set(value).size !== value.length || !equal([...value].sort(), expected))
                issues.push({ key: `${type}/${id}`, reason: 'order-incomplete' });
        }
    };
    for (const [type, item] of [['practice_menu_order', 'practice_menu'], ['gear_category_order', 'gear_category'], ['my_app_order', 'my_app']]) order(type, 'default', ids(item));
    for (const status of ['owned', 'wishlist', 'sold']) order('gear_order', status, by('gear_item').filter(r => r.payload.value.item.status === status).map(r => r.recordId).sort());
    const menus = new Set(ids('practice_menu'));
    for (const r of by('practice_attachment')) if (!menus.has(r.payload.value.practiceId)) issues.push({ key: recordKey(r), reason: 'owner-missing' });
    for (const r of by('practice_menu_set')) if (!Array.isArray(r.payload.value.itemIds) || r.payload.value.itemIds.some(id => !menus.has(id))) issues.push({ key: recordKey(r), reason: 'owner-missing' });
    const owners = new Set([...by('practice_attachment').map(r => r.payload.value.practiceId), ...ids('practice_attachment_set')]);
    for (const id of owners) order('practice_attachment_set', id, by('practice_attachment').filter(r => r.payload.value.practiceId === id).map(r => r.recordId).sort());
    const presetOrders = by('metronome_preset').map(r => r.payload.value.order);
    if (!equal([...presetOrders].sort((a,b)=>a-b), presetOrders.map((_,i)=>i))) issues.push({ key: 'metronome_preset/*', reason: 'preset-order-conflict' });
    return issues;
}
