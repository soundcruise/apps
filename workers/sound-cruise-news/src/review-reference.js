// This private identifier can help an operator recognize an unresolved article.
// It is never read by metadata, validation, duplicate or public NEWS generation.
export async function reviewReference(store,row){
 const r=await store.db.prepare('SELECT * FROM news_review_references WHERE candidate_id=?').bind(row.id).first();
 if(!r||r.source_url!==row.source_url||r.published_at!==row.published_at||r.basis!=='owner_audit_identifier'||typeof r.identifier!=='string'||r.identifier.length<2||r.identifier.length>80||/[<>\x00-\x1f]/.test(r.identifier))return null;
 return {identifier:r.identifier,basis:r.basis,verifiedForPublication:false};
}
