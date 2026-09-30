import {QUALITY_EVIDENCE} from './quality-evidence.js';
import {COVERAGE_EVIDENCE} from './coverage-evidence.js';
import { SHIMAMURA_LISTING_URL,SHIMAMURA_PATHS } from './shimamura-listing.js';
import { SHIMAMURA_EVIDENCE } from './shimamura-evidence.js';
import { policyRecord } from './source-policies.js';
// JP1-B classification supplied by user 2026-09-28: prototype assessment, not legal permission.
// Every source is disabled until complete policy evidence is approved. Production collection is off.
const entries = [
 ['yamaha','Yamaha','https://jp.yamaha.com/','official'],
 ['shimamura','島村楽器','https://www.shimamura.co.jp/','retailer_editorial'],
 ['natalie','音楽ナタリー','https://natalie.mu/','media'],
 ['skream','Skream!','https://skream.jp/','media'],
 ['morris','Morris','https://www.morris-guitar.com/','official'],
 ['deviser','Deviser','https://www.deviser.co.jp/','official'],
 ['roland','Roland / BOSS','https://www.roland.com/','official'],
 ['audio-technica','Audio-Technica','https://www.audio-technica.co.jp/','official'],
 ['kanda','神田商会','https://www.kandashokai.co.jp/','distributor'],
 ['zoom','ZOOM','https://zoomcorp.com/','official'],
 ['kikutani','キクタニ','https://www.kikutani.co.jp/','distributor'],
 ['ikebe','池部楽器','https://www.ikebe-gakki-pb.com/','retailer_editorial'],
 ['chuya','Discover chuya','https://discover.chuya-online.com/','retailer_editorial','feed/'],
 ['hookup','Hookup','https://hookup.co.jp/','distributor'],
 ['sonicwire','SONICWIRE','https://sonicwire.com/','distributor'],
 ['sleepfreaks','Sleepfreaks','https://sleepfreaks-dtm.com/','media','feed/'],
 ['ik','IK Multimedia','https://www.ikmultimedia.com/','official'],
 ['ahs','AHS','https://www.ah-soft.com/','official'],
 ['agm','AGM / Rittor Music','https://acousticguitarmagazine.jp/','media',null,'CONTACT'],
 ['korg','KORG / VOX','https://www.korg.com/','official',null,'CONTACT'],
 ['esp','ESP / BIGBOSS','https://espguitars.co.jp/','official',null,'CONTACT'],
 ['yamaha-newsroom','Yamaha newsroom','https://www.yamaha.com/','official',null,'CONTACT'],
 ['amass','amass','https://amass.jp/','media',null,'UNKNOWN'],
 ['tft','THE FIRST TIMES','https://www.thefirsttimes.jp/','media',null,'UNKNOWN'],
 ['takamine','Takamine','https://www.takamineguitars.co.jp/','official',null,'DO_NOT_USE'],
 ['kurosawa','クロサワ楽器','https://www.kurosawagakki.com/','retailer_editorial',null,'DO_NOT_USE'],
 // NEWS 1.5.0 sale-source planning. Not in the JP1-B whitelist: unreviewed, never collected.
 ['soundhouse','サウンドハウス','https://www.soundhouse.co.jp/','retailer_editorial',null,'UNKNOWN']
];
// Sale capability is per source and separate from product news. 'pending_evidence' means the sale
// listing/feed, terms and robots have not been reviewed: sales from it can never auto-publish.
const SALE_SOURCES=Object.freeze(['ikebe','soundhouse']);
export const SOURCES = Object.freeze(entries.map(([id,name,baseUrl,sourceKind,feed,legalStatus='SAFE'])=>Object.freeze({
 id,name,baseUrl,sourceKind,legalStatus,enabled:false,productionEnabled:false,localPilotEnabled:false,
 discoveryUrl:id==='shimamura'?SHIMAMURA_LISTING_URL:feed?new URL(feed,baseUrl).href:null,discoveryType:id==='shimamura'?'shimamura_listing':feed?'rss':'unconfigured',
 ...policyRecord(id),
 ...(id==='shimamura'?SHIMAMURA_EVIDENCE:{}),
 allowedPaths:id==='shimamura'?SHIMAMURA_PATHS:id==='sleepfreaks'?['/dtm-materials/','/softsynth/']:[],
 deniedPaths:id==='shimamura'?['/shops/','/update/sale/','/update/campaign/','/update/event/','/update/lesson/','/update/recruit/','/update/coupon/','/update/used/']:id==='sleepfreaks'?['/how-to-','/tutorial/','/sale/']:[],
 gearOnly:id==='shimamura',
 deniedPathSegments:id==='shimamura'?['shops','sale','campaign','event','lesson','recruit','coupon','used']:[],
 artistOnly:['natalie','skream'].includes(id),guitarEvidenceRequired:['natalie','skream'].includes(id),
 contentTypes:['natalie','skream'].includes(id)?['artist']:SALE_SOURCES.includes(id)?['product','sale']:['product'],
 saleCollection:SALE_SOURCES.includes(id)?'pending_evidence':'none',
 robotsUrl:new URL('/robots.txt',baseUrl).href,lastPolicyReviewAt:'2026-09-28',
 policyEvidence:'User supplied JP1-B whitelist; local prototype only. Specific Terms URL and expert review required before production.',
 crawlIntervalHours:24,priority:['official','distributor','retailer_editorial','media'].indexOf(sourceKind),
 robots404Reviewed:false,notes:feed?'Discovery known; collection disabled pending complete policy evidence.':'Disabled pending discovery and per-source policy review.',
 ...(COVERAGE_EVIDENCE[id]||{}),
 ...(QUALITY_EVIDENCE[id]||{})
})));
export function getSource(id) { return SOURCES.find(s=>s.id===id); }
export const PHASE_ONE_CANDIDATES = Object.freeze(['shimamura','sleepfreaks','hookup']);
const fresh=(date,now)=>typeof date==='string'&&Number.isFinite(Date.parse(date))&&Date.parse(date)<=now&&now-Date.parse(date)<=90*86400000;
const https=value=>{try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
export function evidenceGate(source,now) {
 if(source.legalStatus==='CONTACT'&&!source.permissionRef)return 'permission_required';
 if(source.legalStatus!=='SAFE')return 'legal_block';
 if(!https(source.termsUrl)||!https(source.linkPolicyUrl)||!source.policySummary||
    !['operator','manual','admin'].includes(source.reviewedBy)||!source.reviewedAt||
    !source.robotsReviewedAt||!source.discoveryReviewedAt||source.policyDecision!=='approved')return 'evidence_missing';
 if(![source.reviewedAt,source.robotsReviewedAt,source.discoveryReviewedAt].every(d=>fresh(d,now)))return 'policy_expired';
 if(!source.discoveryUrl)return 'discovery_missing';
 if(source.id==='shimamura'&&(source.discoveryType!=='shimamura_listing'||source.discoveryUrl!==SHIMAMURA_LISTING_URL||source.automationPolicy!=='documented_silence'||source.explicitAutomationPermission!==false))return 'evidence_missing';
 return null;
}
export function legalGate(source,state={},now=Date.now(),mode='off',registry=SOURCES,{requestMode='normal'}={}) {
 if(mode!=='local'&&!(mode==='production'&&source?.productionEnabled&&source?.enabled))return 'collection_off';
 if(!source||!registry.includes(source))return 'not_registry_source';
 const evidence=evidenceGate(source,now);if(evidence)return evidence;
 if((!source.enabled&&!(source.localPilotEnabled&&phaseOneSourceReady(source,now)))||state.disabled)return 'source_disabled';
 if(state.backoffUntil>now||state.failures>0&&state.nextAt>now)return 'backoff';
 if(requestMode==='normal'&&(state.nextAt>now||state.lastPublisherRequestAt>0&&state.lastPublisherRequestAt+Math.max(6,source.crawlIntervalHours)*3600000>now))return 'backoff';
 if(!['normal','scheduled','operator_validation'].includes(requestMode))return 'configuration_invalid';
 return null;
}

// Readiness never enables the production switch. Global OFF is checked independently.
export function phaseOneSourceReady(source,now=Date.now()) {
 return !!source&&!evidenceGate(source,now)&&source.robotsValid===true&&source.discoveryValid===true&&
  source.sourceRulesReviewed===true&&source.allowedPaths?.length>0&&source.deniedPaths?.length>0&&
  source.crawlIntervalHours>=(source.id==='shimamura'?24:12)&&source.productionEnabled===false&&source.enabled===false;
}
export function phaseOneReady(source,now,production) {
 return phaseOneSourceReady(source,now)&&production?.NEWS_COLLECTION_MODE==='off'&&
  production?.NEWS_API_MODE==='off'&&Array.isArray(production?.crons)&&production.crons.length===0;
}
