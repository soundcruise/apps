// Explicit, one-time administrative quality correction. Never a human decision.
import {articleHeadlineFacts,validHeadlineEvidence} from './headline-evidence.js';
import {validatedProductFacts,factualLabel,validLabel,allowedArticlePath} from './metadata.js';
import {sourceUrl} from './policy.js';
const permitted=new Set(['productType','productTypeEvidence','releaseEvent']);
function identity(f){return Object.fromEntries(Object.entries(f).filter(([k])=>!permitted.has(k)));}
export function verifiedHeadlineCorrection(html,row,source){
 if(row.review_status!=='approved'||!['release','new_product'].includes(row.event_type)||source?.id!==row.source_id||sourceUrl(row.source_url,source)!==row.source_url||!allowedArticlePath(row.source_url,source))throw Error('headline_correction_scope');
 const old=JSON.parse(row.product_facts||'null');if(!validatedProductFacts(old))throw Error('headline_correction_identity');
 const facts=articleHeadlineFacts(html,old,row,source),label=factualLabel(facts,row.event_type);
 if(!validatedProductFacts(facts)||!validLabel(label)||JSON.stringify(identity(old))!==JSON.stringify(identity(facts))||label===row.label)throw Error('headline_correction_patch');
 return {facts,label};
}
export function headlineCorrectionStatements(row,plan,q){
 const old=JSON.parse(row.product_facts||'null');
 if(row.review_status!=='approved'||!validatedProductFacts(plan.facts)||!validHeadlineEvidence(plan.facts)||factualLabel(plan.facts,row.event_type)!==plan.label||!validLabel(plan.label)||JSON.stringify(identity(old))!==JSON.stringify(identity(plan.facts)))throw Error('headline_correction_patch');
 const cas=Object.keys(row).map(k=>`"${k}" IS ${q(row[k])}`).join(' AND ');
 return [
  `UPDATE candidate_items SET product_facts=${q(JSON.stringify(plan.facts))},label=${q(plan.label)},facts_provenance=${q(JSON.stringify(plan.provenance))},review_revision=review_revision+1 WHERE ${cas} AND review_status='approved' AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=${q(row.id)})`,
  `INSERT INTO news_admin_audit(id,action,target,occurred_at,reason_code) SELECT ${q(plan.requestId)},'headline-quality-correction',${q(row.id)},${plan.at},'verified_primary_headline_only' WHERE changes()=1`
 ];
}
