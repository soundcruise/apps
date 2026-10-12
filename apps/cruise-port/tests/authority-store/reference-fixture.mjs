import { values } from './fixture.mjs';
export const REF_KEYS=Object.freeze({menus:'cruisePort.practiceMenus',assets:'cruisePort.syncAssetMetadata',apps:'cruisePort.myApps',intents:'cruisePort.syncDeletionIntent.v1'});
export function attachment(practiceId,id='attachment-a') {
 return {practiceId,kind:'file',mimeType:'application/pdf',fileName:'practice.pdf',byteSize:12,
  createdAt:'2026-10-10T12:00:00.000Z',updatedAt:'2026-10-10T12:00:00.000Z',
  published:{version:1,availability:'available',asset:{assetId:'asset-'+id,kind:'practice_attachment_pdf',ownerRecordId:practiceId,originalFilename:'practice.pdf',hash:'a'.repeat(64),mime:'application/pdf',byteSize:12,width:1,height:1,objectVersion:1}}};
}
export function referenceValues({attached=false,payload=0}={}) {
 const v=values(),menus=JSON.parse(v[REF_KEYS.menus]);
 menus.items.forEach((m,i)=>{m.id='menu-'+i;m.probePad=i===0?'x'.repeat(payload):'';});v[REF_KEYS.menus]=JSON.stringify(menus);
 const sets=JSON.parse(v['cruisePort.practiceMenuSets']);sets.items.forEach(s=>s.itemIds=menus.items.map(m=>m.id));v['cruisePort.practiceMenuSets']=JSON.stringify(sets);
 const meta=JSON.parse(v[REF_KEYS.assets]);if(attached)meta.attachments['attachment-a']=attachment('menu-0');v[REF_KEYS.assets]=JSON.stringify(meta);
 return v;
}
export function danglingAttachments(v) {
 const menus=new Set((JSON.parse(v[REF_KEYS.menus]||'null')?.items||[]).map(m=>m.id));
 return Object.entries(JSON.parse(v[REF_KEYS.assets]||'null')?.attachments||{}).filter(([,e])=>!menus.has(e.practiceId)).map(([id])=>id);
}
