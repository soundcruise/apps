// Operates exclusively on REPORT_DB; no Sync, Account, NEWS or Project bindings.
const DAY=86400000;
export function redactReport(db,id,now,revision){
 const condition=revision===undefined?'report_id=? AND redacted_at IS NULL':'report_id=? AND revision=? AND redacted_at IS NULL';
 const args=revision===undefined?[now,id]:[now,id,revision];
 return db.prepare(`UPDATE studio_reports SET title='[本文削除済み]',feature='[削除済み]',app_version='redacted',description='',reproduction_steps='',expected_behavior='',environment='{}',ai_analysis=NULL,admin_decision=NULL,duplicate_group=NULL,related_issue=NULL,related_pr=NULL,resolved_version=NULL,request_hash='',ai_state='redacted',lease_until=0,redacted_at=?,revision=revision+1 WHERE ${condition}`).bind(...args);
}
export async function eraseReport(db,id,now,revision,actor){
 const result=await db.batch([
  redactReport(db,id,now,revision),
  db.prepare('UPDATE studio_report_audit SET details=\'{}\' WHERE report_id=? AND EXISTS(SELECT 1 FROM studio_reports WHERE report_id=? AND redacted_at=?)').bind(id,id,now),
  db.prepare("INSERT OR IGNORE INTO studio_report_audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM studio_reports WHERE report_id=? AND redacted_at=? AND revision=?)").bind('privacy:'+id+':'+(revision+1),id,now,actor,'privacy_erasure','{}',id,now,revision+1)
 ]);return Boolean(result[0].meta.changes);
}
export async function maintainReports(env,now=Date.now()){
 if(env.REPORT_RETENTION_ENABLED!=='true'||!env.REPORT_DB)return;
 const db=env.REPORT_DB;
 await db.batch([
  db.prepare("UPDATE studio_reports SET title='[本文削除済み]',feature='[削除済み]',app_version='redacted',description='',reproduction_steps='',expected_behavior='',environment='{}',ai_analysis=NULL,admin_decision=NULL,duplicate_group=NULL,related_issue=NULL,related_pr=NULL,resolved_version=NULL,request_hash='',ai_state='redacted',lease_until=0,redacted_at=?,revision=revision+1 WHERE created_at<=? AND redacted_at IS NULL").bind(now,now-90*DAY),
  db.prepare("UPDATE studio_report_audit SET details='{}' WHERE report_id IN (SELECT report_id FROM studio_reports WHERE redacted_at=?)").bind(now),
  db.prepare("INSERT OR IGNORE INTO studio_report_audit SELECT 'retention:'||report_id,report_id,?,'system:retention','privacy_erasure','{}' FROM studio_reports WHERE redacted_at=?").bind(now,now),
  db.prepare('DELETE FROM studio_report_audit WHERE created_at<=?').bind(now-365*DAY),
  // Legacy hashes cannot reveal their creation hour; give them one bounded grace window.
  db.prepare('UPDATE studio_report_limits SET expires_at=? WHERE expires_at=0').bind(now+2*DAY),
  db.prepare('DELETE FROM studio_report_limits WHERE expires_at<?').bind(now),
  db.prepare('DELETE FROM studio_report_budget WHERE day<?').bind(new Date(now-31*DAY).toISOString().slice(0,10))
 ]);
}
