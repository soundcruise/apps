import {hash} from './policy.js';
// URL hashes prove an exact article identity only. A nonmatch never proves
// that an orphaned rejection or another event is unrelated.
export async function retainedArticleHashes(urls){
 const safe=urls.filter(x=>typeof x==='string'&&x.length<=2048&&/^https:\/\//.test(x));
 return Promise.all([...new Set(safe)].slice(0,18).map(x=>hash(x)));
}
export const retainedHumanRejectionSql="SELECT 1 AS found FROM news_decision_ledger l WHERE l.success_state='committed' AND l.verdict='reject' AND l.actor_type='human_operator' AND json_extract(CASE WHEN json_valid(l.decision_features_json) THEN l.decision_features_json ELSE '{}' END,'$.insightsProfile.articleIdentity') IN (SELECT value FROM json_each(?)) LIMIT 1";
export async function hasRetainedHumanRejection(db,hashes){return hashes.length>0&&!!(await db.prepare(retainedHumanRejectionSql).bind(JSON.stringify(hashes)).first());}
