// A missing additive migration cannot contain a committed Dot receipt. Other
// storage errors must not be mistaken for proof that a receipt is absent.
export async function findDotReceipt(store,candidateId){
 try{return await store.db.prepare('SELECT * FROM news_dot_admission_receipts WHERE candidate_id=?').bind(candidateId).first();}
 catch(error){if(/no such table:\s*(?:main\.)?news_dot_admission_receipts\b/i.test(String(error?.message)))return null;throw error;}
}
