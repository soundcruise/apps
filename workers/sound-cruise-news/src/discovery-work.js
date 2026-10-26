// Durable operational states, never human verdicts, publisher prose or a new fetch surface.
import {sourceUrl,DAY} from './policy.js';
import {nextDailyCollectionAt} from './collection-clock.js';
export const DISCOVERY_STATES=Object.freeze(['discovered','known','duplicate','out_of_scope','outside_date_window','awaiting_fetch_budget','awaiting_allowed_retry','evidence_insufficient','parser_failed','validated_ready']);
const code=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)?v:'unknown';
const parse=s=>{try{return JSON.parse(s);}catch{return null;}};
export async function recordDiscovered(store,source,entries,now){
 const urls=new Map();for(const e of entries){const url=sourceUrl(e.url,source);if(!url)continue;const date=e.publishedAt||e.date,stamp=Date.parse(date);urls.set(url,Number.isFinite(stamp)?new Date(stamp).toISOString():null);}
 if(urls.size>600)throw Error('discovery_tracking_overflow');
 const rows=[...urls].map(([url,published])=>({url,published}));if(!rows.length)return;
 // Required before any editorial/facts work. A failed transaction stops collection.
 try{await store.db.batch([
 store.db.prepare(`INSERT INTO news_discovery_receipts(source_id,normalized_url,first_seen_at,last_seen_at,published_at,outcome,reason_code,candidate_id)
 SELECT ?,json_extract(j.value,'$.url'),?,?,json_extract(j.value,'$.published'),'discovered','awaiting_evaluation',NULL FROM json_each(?) j WHERE true
 ON CONFLICT(source_id,normalized_url) DO UPDATE SET last_seen_at=MAX(last_seen_at,excluded.last_seen_at),published_at=COALESCE(published_at,excluded.published_at)`).bind(source.id,now,now,JSON.stringify(rows)),
 store.db.prepare(`INSERT INTO news_discovery_work(source_id,normalized_url,first_seen_at,updated_at,processing_state,reason_code,next_action)
 SELECT ?,json_extract(j.value,'$.url'),?,?,'discovered','awaiting_evaluation','evaluate' FROM json_each(?) j WHERE true ON CONFLICT(source_id,normalized_url) DO NOTHING`).bind(source.id,now,now,JSON.stringify(rows))]);}catch{throw Error('discovery_tracking_failed');}
}
export async function discoveryState(store,sourceId,url,now,{state,reason='unknown',candidateId=null,nextAt=null,nextAction='none',parserVersion=null,evidenceRef=null,diagnostics={},evidence=null}={}){
 if(!DISCOVERY_STATES.includes(state))throw Error('discovery_state_invalid');
 const previous=await store.db.prepare('SELECT * FROM news_discovery_work WHERE source_id=? AND normalized_url=?').bind(sourceId,url).first();
 if(!previous)return; // Legacy pending records have their existing lifecycle, not invented discovery history.
 const safe={stage:code(diagnostics.stage||'evaluation'),missingFields:(diagnostics.missingFields||[]).filter(x=>typeof x==='string'&&/^[A-Za-z_]{1,60}$/.test(x)).slice(0,24),validationErrors:(diagnostics.validationErrors||[]).map(code).slice(0,24),retryEligible:nextAt!==null};
 const history=Array.isArray(parse(previous.history_json))?parse(previous.history_json):[];
 if(previous.processing_state!==state||previous.reason_code!==reason)history.push({at:now,state,reason:code(reason)});
 const payload=evidence?JSON.stringify(evidence):null;if(payload?.length>30000)throw Error('discovery_evidence_too_large');
 const r=await store.db.prepare(`UPDATE news_discovery_work SET processing_state=?,reason_code=?,updated_at=?,candidate_id=COALESCE(?,candidate_id),next_at=?,next_action=?,parser_version=COALESCE(?,parser_version),evidence_ref=COALESCE(?,evidence_ref),diagnostics_json=?,evidence_json=COALESCE(?,evidence_json),history_json=? WHERE source_id=? AND normalized_url=? AND updated_at<=?`)
 .bind(state,code(reason),now,candidateId,nextAt,code(nextAction),parserVersion,evidenceRef,JSON.stringify(safe),payload,JSON.stringify(history.slice(-20)),sourceId,url,now).run();if(r.meta.changes!==1)throw Error('discovery_tracking_conflict');
}
export function rejectedDiscoveryState(reason){return reason==='date_outside_window'?'outside_date_window':reason==='storage_duplicate'?'duplicate':reason==='before_watermark'?'discovered':/missing|uncertain|invalid|malformed|insufficient|unparsed|known_candidate/.test(reason)?'evidence_insufficient':'out_of_scope';}
export async function recordDiscoveryResult(store,source,entry,now,{row=null,reason='unknown',validation=null,result=null}={}){
 let state=row?'evidence_insufficient':rejectedDiscoveryState(reason),nextAt=null,nextAction='none',diagnostics={stage:row?'validation':'selection',validationErrors:validation?.errors||[],missingFields:result?.diagnostics?.missingFields||[]};
 if(!row&&reason==='agm_detail_budget_deferred'){state='awaiting_fetch_budget';nextAt=nextDailyCollectionAt(now);nextAction='daily_recovery';}
 if(!row&&Number.isFinite(Date.parse(entry.publishedAt||entry.date))&&(now-Date.parse(entry.publishedAt||entry.date)>=90*DAY||Date.parse(entry.publishedAt||entry.date)>now)){state='outside_date_window';reason='date_outside_window';}
 if(!row&&reason==='receipt_evaluation'&&state!=='outside_date_window'){state='evidence_insufficient';nextAction='permitted_saved_evidence';}
 if(row){
  if(['approved','rejected','system_excluded'].includes(row.review_status)){state='known';reason='human_or_system_decision_preserved';}
  else if(validation?.errors?.includes('duplicate')){state='duplicate';reason='duplicate_confirmed';}
  else if(validation?.errors?.includes('expired_candidate')){state='outside_date_window';reason='date_outside_window';}
  else if(validation?.valid){state='validated_ready';reason='formal_validation_passed';}
  else if(result?.outcome==='facts_daily_budget_deferred'){state='awaiting_fetch_budget';reason=result.outcome;nextAt=nextDailyCollectionAt(now);nextAction='daily_recovery';}
  else if(/^facts_(?:http_|timeout|recheck_busy|source_gate)/.test(result?.outcome||'')){state='awaiting_allowed_retry';reason=result.outcome;nextAt=nextDailyCollectionAt(now);nextAction='daily_recovery';}
  else if(result?.outcome&&/invalid|parser|identity|scope|unbound|evidence_unchanged/.test(result.outcome)){state='parser_failed';reason=result.outcome;nextAction='new_parser_or_evidence';diagnostics.stage='facts';}
  else if(!result){const previous=await store.db.prepare('SELECT processing_state FROM news_discovery_work WHERE source_id=? AND normalized_url=?').bind(source.id,row.source_url).first();if(previous&&['parser_failed','awaiting_fetch_budget','awaiting_allowed_retry'].includes(previous.processing_state))return;reason='facts_or_provenance_missing';nextAt=now;nextAction='daily_recovery';}
  else{reason=result.outcome||'facts_or_provenance_missing';nextAt=nextDailyCollectionAt(now);nextAction='daily_recovery';}
 }
 await discoveryState(store,source.id,entry.url||row.source_url,now,{state,reason,candidateId:row?.id,nextAt,nextAction,diagnostics});
}
export async function discoverySummary(store,now,sourceId=null){
 const r=(await store.db.prepare('SELECT processing_state,COUNT(*) n FROM news_discovery_work WHERE first_seen_at>?'+(sourceId?' AND source_id=?':'')+' GROUP BY processing_state').bind(now-90*DAY,...(sourceId?[sourceId]:[])).all()).results;
 return {states:Object.fromEntries(r.map(r=>[r.processing_state,r.n])),tracked:r.reduce((n,r)=>n+r.n,0),backlog:r.filter(r=>!['known','duplicate','out_of_scope','outside_date_window','validated_ready'].includes(r.processing_state)).reduce((n,r)=>n+r.n,0)};
}
// Inspect only the already-fetched permission-scoped listing, never related/detail pages.
export async function recordListingUrls(store,source,html,now){
 const {parseDocument,DomUtils:D}=await import('htmlparser2');
 const {allowedArticlePath}=await import('./metadata.js');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>1000000)throw Error('discovery_tracking_overflow');
 const hidden=n=>{for(let p=n;p;p=p.parent)if(['nav','footer','header','script','style','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
 const doc=parseDocument(html),urls=[...new Set(D.findAll(n=>n.name==='a'&&n.attribs?.href&&!hidden(n),doc.children).map(n=>{try{return sourceUrl(new URL(n.attribs.href,source.discoveryUrl).href,source);}catch{return null;}}).filter(u=>u&&allowedArticlePath(u,source)))];
 await recordDiscovered(store,source,urls.map(url=>({url})),now);return urls;
}
