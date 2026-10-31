// Exact, bounded safety state. The same query is evaluated atomically by the
// decision INSERT. The preflight returns only counts/sizes for oversized data.
const tables=['candidate_items','news_decision_ledger','news_takedowns','news_discovery_work','news_controls','source_state','source_health','news_assisted_edits','news_dot_confirmations','news_dot_admission_receipts','news_dot_publication_checks','news_dot_history_checks','news_category_overrides'];
export async function safetySnapshot(db){
 const names=tables.map(x=>"'"+x+"'").join(',');
 const metadata=(await db.prepare(`SELECT m.name AS tbl,p.name AS col,p.cid AS cid FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type='table' AND m.name IN (${names}) ORDER BY m.name,p.cid`).all())?.results;
 if(!Array.isArray(metadata))throw Error('dot_snapshot_unavailable');
 const queries=[];
 for(const table of tables){const cols=metadata.filter(x=>x.tbl===table).map(x=>x.col);if(!cols.length||cols.length>32||cols.some(x=>!/^[_a-z]+$/.test(x)))throw Error('dot_snapshot_unavailable');const rows='SELECT json_array('+cols.map(c=>'"'+c+'"').join(',')+') AS v FROM "'+table+'" ORDER BY v LIMIT 501';queries.push({table,rows});}
 // Lower-bound byte preflight prevents oversized content leaving D1. It never
 // grants approval: the exact serialized result is still checked below.
 const preflight='SELECT json_object('+queries.flatMap(({table,rows})=>["'"+table+"'",`json((SELECT json_object('n',COUNT(*),'b',COALESCE(SUM(length(CAST(v AS BLOB))),0)) FROM (${rows})))`]).join(',')+') AS sizes';
 const raw=(await db.prepare(preflight).first())?.sizes;let sizes;try{sizes=JSON.parse(raw)}catch{throw Error('dot_snapshot_unavailable')};let count=0,bytes=0;
 for(const table of tables){const x=sizes?.[table];if(!Number.isSafeInteger(x?.n)||!Number.isSafeInteger(x?.b))throw Error('dot_snapshot_unavailable');count+=x.n;bytes+=x.b;if(count>500||bytes>262144)throw Error('dot_snapshot_too_large');}
 const sql='SELECT json_object('+queries.flatMap(({table,rows})=>["'"+table+"'",`json((SELECT json_object('n',COUNT(*),'rows',json_group_array(json(v))) FROM (${rows})))`]).join(',')+')';
 const value=(await db.prepare('SELECT ('+sql+') AS snapshot').first())?.snapshot;if(typeof value!=='string'||new TextEncoder().encode(value).length>262144)throw Error('dot_snapshot_too_large');let parsed;try{parsed=JSON.parse(value)}catch{throw Error('dot_snapshot_unavailable')};if(tables.some(t=>!Number.isSafeInteger(parsed?.[t]?.n)))throw Error('dot_snapshot_unavailable');if(tables.reduce((n,t)=>n+parsed[t].n,0)>500)throw Error('dot_snapshot_too_large');
 return [{sql,value}];
}
