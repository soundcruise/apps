// Publisher-assented scope, not a site-wide crawling permission.
export const MORRIS_PERMISSION='morris-permission-2026-10-14';
export const MORRIS_LISTING='https://www.morris-guitar.com/information/';
export const MORRIS_PARSER='morris-explicit-fields-2';
export const MORRIS_LISTING_PARSER='morris-listing-facts-2';
export const morrisParserSupported=(version,listing=false)=>[listing?MORRIS_LISTING_PARSER:MORRIS_PARSER,listing?'morris-listing-facts-1':'morris-explicit-fields-1'].includes(version);
export const MORRIS_FRESH_MS=48*3600000;
export const morrisDay=at=>new Date(at+9*3600000).toISOString().slice(0,10);
export function morrisArticleUrl(url){return typeof url==='string'&&/^https:\/\/www\.morris-guitar\.com\/information\/20\d{2}\/\d{4}_\d{2}\.html$/.test(url)?url:null;}
export function morrisDate(value){
 const m=/^(20\d{2})[.\/-](\d{2})[.\/-](\d{2})$/.exec(value||'');if(!m)return null;
 const day=`${m[1]}-${m[2]}-${m[3]}`,at=Date.parse(day+'T00:00:00+09:00');
 return Number.isFinite(at)&&morrisDay(at)===day?new Date(at).toISOString():null;
}
export function morrisUrlDate(url){const m=/\/information\/(20\d{2})\/(\d{2})(\d{2})_\d{2}\.html$/.exec(url||'');return m?morrisDate(`${m[1]}-${m[2]}-${m[3]}`):null;}
export const MORRIS_EVIDENCE=Object.freeze({name:'Morris Guitars',discoveryUrl:MORRIS_LISTING,discoveryType:'morris_listing',legalStatus:'SAFE',
 termsUrl:MORRIS_LISTING,linkPolicyUrl:MORRIS_LISTING,permissionRef:MORRIS_PERMISSION,explicitAutomationPermission:true,automationPolicy:'publisher_permission',
 policySummary:'Moridaira Information Promotion Dept assented on 2026-10-14 to daily public Information listing and a single fact-verification visit per newly discovered article. No RSS, archive/product crawling, original headline/body/images/logos reuse or endorsement. Stop/correct/remove on request. Evidence: NEWS-SOURCE-DECISION-REGISTER.md.',
 policyEvidence:'Three verified Gmail messages: initial conditions, actual SENT operating method, affirmative assent. Canonical NEWS-SOURCE-DECISION-REGISTER.md.',lastPolicyReviewAt:'2026-10-14',
 reviewedBy:'operator',reviewedAt:'2026-10-14',robotsReviewedAt:'2026-10-14',discoveryReviewedAt:'2026-10-14',policyDecision:'approved',
 robots404Reviewed:true,robotsValid:true,discoveryValid:true,sourceRulesReviewed:true,crawlIntervalHours:24,
 allowedPaths:['/information/'],deniedPaths:['/products/','/artists/','/feed/','/rss/'],articlePathPattern:'^/information/20[0-9]{2}/[0-9]{4}_[0-9]{2}\\.html$',contentTypes:['product','artist','event','editorial'],gearOnly:false,
 notes:'Daily atomic D1 budget; permanent once-only detail receipts; 48h publication freshness; cache-only repair/recheck; human publication decision required.'});
export function morrisPermissionValid(s){return s?.id==='morris'&&s.name==='Morris Guitars'&&s.permissionRef===MORRIS_PERMISSION&&s.discoveryUrl===MORRIS_LISTING&&s.discoveryType==='morris_listing'&&s.explicitAutomationPermission===true&&s.automationPolicy==='publisher_permission'&&s.crawlIntervalHours>=24&&s.robots404Reviewed===true;}
