// Authority logical references only. Synchronous/pure: no binary DB, network,
// normalization or cleanup. Soft/history/cache references stay representable.
const MENUS='cruisePort.practiceMenus',ASSETS='cruisePort.syncAssetMetadata';
const fail=code=>Object.assign(new Error(code),{code});
export function assertPortReferentialIntegrity(values, before = null) {
    const menuIds=new Set((JSON.parse(values[MENUS]||'null')?.items||[]).map(item=>item.id));
    const attachments=JSON.parse(values[ASSETS]||'null')?.attachments||{};
    const prior=before ? JSON.parse(before[ASSETS]||'null')?.attachments||{} : {};
    for(const [id,entry] of Object.entries(attachments)) {
        if(!id || typeof entry.practiceId!=='string' || !entry.practiceId) throw fail('attachment-owner-invalid');
        if(!menuIds.has(entry.practiceId)) throw fail('attachment-owner-missing');
        if(prior[id] && prior[id].practiceId!==entry.practiceId) throw fail('attachment-owner-change');
        const asset=entry.published?.asset;
        if(entry.published?.availability==='available' && (typeof asset?.assetId!=='string'||!asset.assetId)) throw fail('attachment-source-missing');
        if(asset?.ownerRecordId!==undefined && asset.ownerRecordId!==entry.practiceId) throw fail('attachment-owner-mismatch');
    }
}
