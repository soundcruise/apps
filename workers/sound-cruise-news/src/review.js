import { SOURCES, legalGate } from './registry.js';
import { validLabel, CATEGORIES, allowedArticlePath } from './metadata.js';
import { headlineSimilarity } from './fingerprint.js';
import { DAY, sourceUrl } from './policy.js';
export const REQUIRED_CHECKS=['relevanceChecked','factsChecked','articleOptOutChecked','duplicateChecked','dateChecked','sourcePolicyChecked','labelChecked'];
export const ARTICLE_CHECKS={
 metaRobots:['clear'],botSpecificMeta:['clear'],xRobotsTag:['clear'],access:['public'],
 linkReuseNotice:['clear'],canonical:['matches','verified_alternative'],publicationDate:['verified'],
 independentLabel:['verified'],relevance:['gear','guitar'],primarySource:['primary','no_primary_found','substitution_reviewed']
};
export async function reviewCandidate(store,input,now=Date.now(),registry=SOURCES,pepper){
 const item=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first();
 if(!item)throw new Error('candidate_missing');
 if(!['operator','manual','admin'].includes(input.reviewedBy))throw new Error('reviewer_required');
 const source=registry.find(s=>s.id===item.source_id),state=await store.state(item.source_id);
 if(!['approve','reject','reopen'].includes(input.action))throw new Error('review_action_invalid');
 if(input.action==='reopen'&&item.review_status!=='rejected')throw new Error('reopen_state_invalid');
 if(input.action==='approve'&&!['pending','reopened','approved'].includes(item.review_status))throw new Error('explicit_reopen_required');
 const stamp=new Date(now).toISOString();
 const audit=store.db.prepare('INSERT INTO news_admin_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'review-'+input.action,item.id,now,'quality_review');
 const revision=store.db.prepare('UPDATE news_controls SET revision=revision+1 WHERE id=1');
 if(input.action!=='approve'){
  await store.db.batch([store.db.prepare('UPDATE candidate_items SET review_status=?,reviewed_by=?,reviewed_at=? WHERE id=? AND review_status=?').bind(input.action==='reject'?'rejected':'reopened',input.reviewedBy,stamp,item.id,item.review_status),revision,audit]);return;
 }
 if(legalGate(source,{...state,nextAt:0},now,'local',registry))throw new Error('review_gate');
 if(item.expires_at<=now)throw new Error('expired_candidate');
 if(REQUIRED_CHECKS.some(k=>input.checks?.[k]!==true))throw new Error('review_checks_required');
 if(Object.entries(ARTICLE_CHECKS).some(([key,codes])=>!codes.includes(input.articleChecks?.[key])))throw new Error('article_checks_required');
 if(!validLabel(input.label)||/審査待ち|要確認/.test(input.label)||!CATEGORIES.includes(input.category)||await headlineSimilarity(input.label,item.title_fingerprint,pepper))throw new Error('label_or_similarity_invalid');
 if(['artist_guitar','live_guitar'].includes(input.category)||source.guitarEvidenceRequired){if(input.checks.guitarEvidenceChecked!==true||input.articleChecks.relevance!=='guitar')throw new Error('guitar_evidence_required');}
 if(source.artistOnly&&!['artist_guitar','live_guitar'].includes(input.category))throw new Error('source_scope');
 const published=Date.parse(input.publishedAt);
 if(!Number.isFinite(published)||published>now||now-published>=90*DAY||!sourceUrl(item.source_url,source)||!allowedArticlePath(item.source_url,source))throw new Error('publication_invalid');
 const changedDate=published!==Date.parse(item.feed_published_at);
 const reasons=['feed_date_incorrect','publication_verified','timezone_correction'];
 if(changedDate&&!reasons.includes(input.dateOverrideReason))throw new Error('date_override_reason_required');
 const topic=input.topicKey||item.topic_key;if(!/^[a-z0-9][a-z0-9:_-]{2,127}$/i.test(topic))throw new Error('topic_invalid');
 if(await store.db.prepare("SELECT id FROM candidate_items WHERE topic_key=? AND review_status='approved' AND id<>?").bind(topic,item.id).first())throw new Error('duplicate_topic');
 // Store allowlisted codes/booleans only. No free-text evidence or article text.
 const checks=Object.fromEntries([...REQUIRED_CHECKS,'guitarEvidenceChecked'].map(k=>[k,input.checks[k]===true]));
 const article=Object.fromEntries(Object.keys(ARTICLE_CHECKS).map(k=>[k,input.articleChecks[k]]));
 const update=store.db.prepare(`UPDATE candidate_items SET label=?,category=?,published_at=?,topic_key=?,review_status='approved',review_reason='structured_review_complete',reviewed_at=?,reviewed_by=?,review_checks=?,article_checks=?,date_override_reason=?,expires_at=?
 WHERE id=? AND review_status=? AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=? AND (disabled=1 OR takedown=1))`)
 .bind(input.label.trim(),input.category,new Date(published).toISOString(),topic,stamp,input.reviewedBy,JSON.stringify(checks),JSON.stringify(article),changedDate?input.dateOverrideReason:null,Math.min(item.expires_at,published+90*DAY),item.id,item.review_status,item.source_id);
 const result=await store.db.batch([update,revision,audit]);
 if(result[0].meta.changes!==1)throw new Error('review_state_changed');
}
