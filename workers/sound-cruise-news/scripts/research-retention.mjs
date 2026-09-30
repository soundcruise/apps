// Research artifacts retain facts only; publisher titles exist only in the caller's memory.
import {writeFile} from 'node:fs/promises';
import {normalizeHeadline} from '../src/fingerprint.js';
const keys=new Set(['canonicalUrl','timestamp','status','hash','counts','facts','reasonCodes']);
const factKeys=new Set(['artist','eventType','eventName','eventDate','endDate','venue','relevanceReason','seller','saleType','startDate','endTime','equipment','brands','benefit','scope','publishedAt','sourceId','policyFinding','policyScope','robotsAllowed','optOut','discoveryType']);
const social=/(^|\.)(?:facebook\.com|twitter\.com|x\.com|t\.co|line\.me|linkedin\.com|pinterest\.com)$/i;
export function canonicalResearchUrl(raw,{queryKeys=[]}={}){
 const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||social.test(u.hostname)||/\/(?:share|sharer|intent)(?:[/.]|$)/i.test(u.pathname))throw Error('research_url_forbidden');
 u.hash='';for(const k of [...u.searchParams.keys()]){if(/text|title|headline|body|description|url/i.test(k))throw Error('research_query_forbidden');if(!queryKeys.includes(k))u.searchParams.delete(k);else if(u.searchParams.getAll(k).length!==1||!/^[A-Za-z0-9_-]{1,64}$/.test(u.searchParams.get(k)))throw Error('research_query_invalid');}
 return u.href;
}
function nearCopy(value,title){const a=normalizeHeadline(value),b=normalizeHeadline(title);if(b.length<8)return a===b;if(a.includes(b)||b.includes(a)&&a.length>=Math.max(8,b.length*.8))return true;
 const grams=t=>new Set(Array.from({length:Math.max(0,t.length-2)},(_,i)=>t.slice(i,i+3)));const x=grams(a),y=grams(b),n=[...x].filter(g=>y.has(g)).length;return x.size>0&&y.size>0&&(n/(x.size+y.size-n)>=.72||n/Math.min(x.size,y.size)>=.88&&a.length>=b.length*.8);}
export function guardedResearchArtifact(records,{originalTitles=[],queryKeys=[]}={}){
 if(!Array.isArray(records)||records.length>200||!Array.isArray(originalTitles)||originalTitles.some(t=>typeof t!=='string'))throw Error('research_input_invalid');
 const values=[];const inspect=(v,depth=0)=>{if(depth>5)throw Error('research_depth');if(typeof v==='string'){if(v.length>240||/[<>\x00-\x1f]/.test(v))throw Error('research_fact_invalid');values.push(v);}else if(Array.isArray(v)){if(v.length>100)throw Error('research_count_limit');v.forEach(x=>inspect(x,depth+1));}else if(typeof v==='object'&&v!==null){Object.values(v).forEach(x=>inspect(x,depth+1));}else if(typeof v!=='boolean'&&typeof v!=='number'&&v!==null)throw Error('research_fact_invalid');};
 const scalar=v=>v===null||['string','boolean'].includes(typeof v)||typeof v==='number'&&Number.isFinite(v);
 const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
 const output=records.map(r=>{if(!plain(r)||Object.keys(r).some(k=>!keys.has(k)))throw Error('research_field_forbidden');const o={...r};if(o.status!==undefined&&(!Number.isInteger(o.status)||o.status<100||o.status>599))throw Error('research_status_invalid');if(o.canonicalUrl)o.canonicalUrl=canonicalResearchUrl(o.canonicalUrl,{queryKeys});if(o.timestamp&&!Number.isFinite(Date.parse(o.timestamp)))throw Error('research_timestamp_invalid');if(o.hash&&!/^[a-f0-9]{64}$/.test(o.hash))throw Error('research_hash_invalid');if(o.facts&&(!plain(o.facts)||Object.entries(o.facts).some(([k,v])=>!factKeys.has(k)||!(scalar(v)||Array.isArray(v)&&v.every(scalar)))))throw Error('research_fact_forbidden');if(o.counts&&(!plain(o.counts)||Object.entries(o.counts).some(([k,v])=>!/^[_a-z0-9]{1,80}$/.test(k)||!Number.isSafeInteger(v)||v<0)))throw Error('research_counts_invalid');if(o.reasonCodes&&(!Array.isArray(o.reasonCodes)||o.reasonCodes.some(c=>typeof c!=='string'||!/^[_a-z0-9]{1,80}$/.test(c))))throw Error('research_reason_invalid');inspect(o);return o;});
 if(values.some(v=>originalTitles.some(t=>nearCopy(v,t))))throw Error('research_headline_match');return output;
}
export async function writeResearchArtifact(path,records,options){const output=guardedResearchArtifact(records,options);await writeFile(path,JSON.stringify(output,null,2),{flag:'wx'});return output.length;}
