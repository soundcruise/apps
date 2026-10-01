// User-approved 23-record restoration. This grants only exact immutable fixture rows,
// never collection permission, publisher access, general manual approval or a source-wide bypass.
import {NEWS_BETA_ITEMS} from '../../../apps/cruise-port/data/news-beta.js';
import {hash,DAY} from './policy.js';
import {SOURCES} from './registry.js';
export const LEGACY_ORIGIN='legacy_fixture_backfill';
export const LEGACY_DIGEST='725009c0c71d4f472b4f5528e4675fc141085a9d4e76f2e4da01fd6f44ca4e55';
export const legacyRows=()=>NEWS_BETA_ITEMS.map(i=>({...i,sourceId:SOURCES.find(s=>s.name===i.sourceName)?.id}));
export function legacyPredicate(alias='c'){
 if(!/^[a-z]$/.test(alias))throw Error('sql_alias_invalid');
 return `(${alias}.origin='legacy_fixture_backfill' AND EXISTS(SELECT 1 FROM legacy_news_grants g WHERE g.item_id=${alias}.id AND g.fixture_digest='${LEGACY_DIGEST}' AND g.label=${alias}.label AND g.source_id=${alias}.source_id AND g.source_url=${alias}.source_url AND g.published_at=${alias}.published_at AND g.category=${alias}.category))`;
}
const DUPLICATE_PRODUCTS={'jp2a-boss-ex4':['BOSS','EX-4'],'jp2a-vox-ac-mini':['VOX','AC MINI'],'jp2a-fender-acoustasonic-limited':['Fender','FSR American Acoustasonic Telecaster'],'jp2a-lunacy-nova':['Lunacy Audio','NOVA'],'jp2a-jackson-pc1-e':['Jackson','PC1-E'],'jp2a-jam-wahcko-mk2':['JAM Pedals','Wahcko mk.2'],'jp2a-godin-century-maho-eq':['Godin','Century Maho EQ'],'jp2a-centerone3':['Leapwing','CenterOne 3'],'jp2a-dotec-deemultiwider':['DOTEC-AUDIO','DeeMultiWider']};
export async function backfillLegacy(store,now=Date.now()){
 const result={inserted:0,skippedDuplicates:0,expired:0,blocked:0,publisherRequests:0,origin:LEGACY_ORIGIN};
 if(await store.db.prepare("SELECT id FROM news_admin_audit WHERE action='legacy-backfill-complete'").first())return {...result,alreadyCompleted:true};
 if(!(await store.controls()).publication_enabled)throw Error('publication_off');
 const fixture=legacyRows();if(fixture.length!==23||fixture.some(i=>!i.sourceId||i.manualReviewStatus!=='approved'||i.sourceSafety!=='safe')||await hash(JSON.stringify(NEWS_BETA_ITEMS))!==LEGACY_DIGEST)throw Error('legacy_snapshot_changed');
 const rows=await store.candidates();
 for(const i of fixture){
  const published=new Date(i.publishedAt).toISOString(),expiry=Date.parse(published)+90*DAY,id=await hash(i.sourceUrl);
  if(expiry<=now){result.expired++;continue;}
  if((await store.state(i.sourceId)).disabled||await store.db.prepare('SELECT item_id FROM news_takedowns WHERE item_id=?').bind(id).first()){result.blocked++;continue;}
  const pair=DUPLICATE_PRODUCTS[i.id];
  if(rows.some(r=>r.normalized_url===i.sourceUrl||r.topic_key===i.topicKey||r.review_status==='approved'&&pair&&(()=>{try{const f=JSON.parse(r.product_facts);return f?.brand===pair[0]&&f?.product===pair[1];}catch{return false;}})())){result.skippedDuplicates++;continue;}
  const batch=await store.db.batch([
   store.db.prepare(`INSERT OR IGNORE INTO candidate_items(id,source_id,source_name,source_url,normalized_url,published_at,category,label,topic_key,collected_at,review_status,review_reason,reviewed_at,reviewed_by,expires_at,publication_decision,decision_reason,origin,product_facts)
    SELECT ?,?,?,?,?,?,?,?,?,?,'approved','legacy_fixture_verified',?,'operator',?,'PUBLISH_REVIEW','legacy_fixture_verified',?,? WHERE EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND publication_enabled=1) AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=?) AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=? AND (disabled=1 OR takedown=1 OR publication_blocked=1))`)
    .bind(id,i.sourceId,i.sourceName,i.sourceUrl,i.sourceUrl,published,i.category,i.label,i.topicKey,new Date(now).toISOString(),new Date(now).toISOString(),expiry,LEGACY_ORIGIN,pair?JSON.stringify({brand:pair[0],product:pair[1],version:null,category:i.category}):null,id,i.sourceId),
   store.db.prepare('INSERT OR IGNORE INTO legacy_news_grants VALUES(?,?,?,?,?,?,?)').bind(id,i.label,i.sourceId,i.sourceUrl,published,i.category,LEGACY_DIGEST),
   store.db.prepare('INSERT INTO news_admin_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'legacy-backfill',id,now,LEGACY_ORIGIN)
  ]);result.inserted+=batch[0].meta.changes;
 }
 await store.db.batch([store.db.prepare('INSERT INTO news_admin_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'legacy-backfill-complete',LEGACY_DIGEST,now,LEGACY_ORIGIN),store.db.prepare('UPDATE news_controls SET revision=revision+1 WHERE id=1')]);
 return result;
}
