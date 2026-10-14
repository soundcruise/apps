// Import already-spent, owner-reviewed acquisition receipts while Morris remains OFF.
// No publisher network traffic, no approval/rejection, no original headline/body input.
import {readFile} from 'node:fs/promises';
import {NewsStore} from '../src/store.js';
import {remoteDatabase} from './remote-store.mjs';
import {checkedConfig} from './remote-db.mjs';
import {hash} from '../src/policy.js';
import {validatedFingerprint} from '../src/fingerprint.js';
import {MORRIS_PERMISSION,MORRIS_LISTING,MORRIS_PARSER,MORRIS_FRESH_MS,morrisArticleUrl,morrisUrlDate,morrisDay} from '../src/morris-policy.js';
import {morrisLabel} from '../src/morris-evidence.js';
const [path]=process.argv.slice(2);if(!path)throw Error('reviewed_receipt_file_required');await checkedConfig();
const input=JSON.parse(await readFile(path,'utf8')),now=Date.now(),pepper=JSON.parse(await readFile('.local/production-secrets.json','utf8')).NEWS_HEADLINE_PEPPER;
if(Object.keys(input).some(k=>!['listingDay','listingTimestamp','listingResponseHash','entries','article','permissionMessage'].includes(k))||input.listingDay!==morrisDay(now)||input.permissionMessage!=='1a1391d419b252c5'||!Array.isArray(input.entries)||input.entries.length!==1)throw Error('reviewed_daily_baseline_required');
const entry=input.entries[0],a=input.article,p=a?.proof,stamp=Date.parse(entry.publishedAt);
if(!morrisArticleUrl(entry.url)||morrisUrlDate(entry.url)!==entry.publishedAt||stamp>now||now-stamp>MORRIS_FRESH_MS||!await validatedFingerprint(entry.fingerprint,pepper)||
 !p||p.sourceId!=='morris'||p.sourceUrl!==entry.url||p.publishedAt!==entry.publishedAt||p.permissionRef!==MORRIS_PERMISSION||p.parserVersion!==MORRIS_PARSER||p.extractionMethod!=='morris_once_only_article'||!['canonical','og:url'].includes(p.canonicalBasis)||!/^[a-f0-9]{64}$/.test(p.responseHash)||!Number.isSafeInteger(p.verifiedAt)||p.verifiedAt>now||!Number.isSafeInteger(a.attemptedAt)||a.attemptedAt>p.verifiedAt||morrisDay(a.attemptedAt)!==input.listingDay||!await validatedFingerprint(a.fingerprint,pepper)||!morrisLabel(a.facts,a.eventType)||a.facts.articleUrl!==entry.url||Object.keys(a).some(k=>!['facts','eventType','proof','fingerprint','attemptedAt'].includes(k)))throw Error('reviewed_once_only_evidence_required');
if(input.listingTimestamp!==null&&(!Number.isSafeInteger(input.listingTimestamp)||morrisDay(input.listingTimestamp)!==input.listingDay)||input.listingResponseHash!==null&&!/^[a-f0-9]{64}$/.test(input.listingResponseHash))throw Error('listing_evidence_invalid');
const s=new NewsStore(remoteDatabase()),state=await s.state('morris');if(!state.disabled||state.publicationBlocked)throw Error('morris_must_be_off_during_bootstrap');
if(await s.db.prepare("SELECT 1 FROM candidate_items WHERE source_id='morris'").first())throw Error('morris_baseline_already_processed');
const existing=await s.db.prepare('SELECT COUNT(*) n FROM news_morris_acquisition').first();if(existing.n)throw Error('morris_receipts_already_initialized');
await s.db.batch([
 s.db.prepare("INSERT INTO news_morris_acquisition(request_key,scope,source_url,jst_day,discovered_at,attempted_at,actual_requests,outcome,response_hash,entries_json,proof_json,permission_ref) VALUES(?,'listing',?,?,?,?,2,'verified',?,?,?,?)")
 .bind('listing:'+input.listingDay,MORRIS_LISTING,input.listingDay,a.attemptedAt,input.listingTimestamp,input.listingResponseHash,JSON.stringify(input.entries),JSON.stringify({listingPreviouslyChecked:true,robotsStatus:404,exactTimestampRetained:input.listingTimestamp!==null,permissionMessage:input.permissionMessage}),MORRIS_PERMISSION),
 s.db.prepare("INSERT INTO news_morris_acquisition(request_key,scope,source_url,jst_day,published_at,discovered_at,attempted_at,actual_requests,outcome,response_hash,facts_json,proof_json,fingerprint_json,permission_ref) VALUES(?,'article',?,?,?,?,?,1,'verified',?,?,?,?,?)")
 .bind('article:'+await hash(entry.url),entry.url,input.listingDay,entry.publishedAt,a.attemptedAt,a.attemptedAt,p.responseHash,JSON.stringify(a.facts),JSON.stringify(p),JSON.stringify(a.fingerprint),MORRIS_PERMISSION),
 s.db.prepare("INSERT INTO news_admin_audit(id,action,target,occurred_at,reason_code) VALUES(?,'morris-receipt-import','morris',?,'review_complete')").bind(crypto.randomUUID(),now)
]);
console.log(JSON.stringify({importedDailyBudget:1,importedArticleReceipts:1,publisherRequests:0,sourceEnabled:false,humanDecisions:0}));
