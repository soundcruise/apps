// Bounded safety state. The same SQL runs in the decision INSERT so D1 writes
// cannot race the checks. Large states HOLD; no triggers alter ordinary NEWS.
const tables=['candidate_items','news_decision_ledger','news_takedowns','news_discovery_work','news_controls','source_state','source_health','news_assisted_edits','news_dot_confirmations','news_dot_admission_receipts','news_dot_publication_checks','news_dot_history_checks','news_category_overrides'];
export async function safetySnapshot(db){
 const parts=[];let count=0,bytes=0;
 for(const table of tables){const cols=(await db.prepare('PRAGMA table_info("'+table+'")').all())?.results;if(!Array.isArray(cols)||!cols.length||cols.some(x=>!/^[_a-z]+$/.test(x.name)))throw Error('dot_snapshot_unavailable');const sql="SELECT json_object('n',COUNT(*),'rows',json_group_array(json(v))) FROM (SELECT json_array("+cols.map(c=>'"'+c.name+'"').join(',')+") AS v FROM \""+table+"\" ORDER BY v LIMIT 501)";const value=(await db.prepare('SELECT ('+sql+') AS snapshot').first())?.snapshot;if(typeof value!=='string')throw Error('dot_snapshot_unavailable');let parsed;try{parsed=JSON.parse(value)}catch{throw Error('dot_snapshot_unavailable')};if(!Number.isSafeInteger(parsed.n))throw Error('dot_snapshot_unavailable');count+=parsed.n;bytes+=new TextEncoder().encode(value).length;if(count>500||bytes>262144)throw Error('dot_snapshot_too_large');parts.push({sql,value});}
 return parts;
}
