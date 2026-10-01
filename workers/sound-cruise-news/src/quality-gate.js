// Offline release gate; only facts/links/independent labels. No publisher requests.
import {itemQuality,compareTicker} from '../../../apps/cruise-port/news-quality.js';
export {itemQuality} from '../../../apps/cruise-port/news-quality.js';
const DAY=86400000;
export function qualitySnapshot(items,{ticker=[],reviewBurden=0,now=Date.now()}={}){
 if(!Array.isArray(items)||!Array.isArray(ticker)||!Number.isSafeInteger(reviewBurden)||reviewBurden<0)throw Error('quality_snapshot_invalid');
 const counts={'HIGH VALUE':0,USEFUL:0,'LOW VALUE':0,NOISE:0},categories=new Set(),sources={},seen=new Set();let duplicates=0;
 const useful=i=>['HIGH VALUE','USEFUL'].includes(itemQuality(i));
 for(const i of items){counts[itemQuality(i)]++;if(useful(i))categories.add(i.category);sources[i.sourceName]=(sources[i.sourceName]||0)+1;const key=i.topicKey||[i.sourceName,i.label.normalize('NFKC').toLowerCase().replace(/[\s、,]/g,''),new Date(Date.parse(i.publishedAt)+9*3600000).toISOString().slice(0,10)].join('|');if(seen.has(key))duplicates++;seen.add(key);}
 const fresh=days=>items.filter(i=>useful(i)&&Date.parse(i.publishedAt)<=now&&Date.parse(i.publishedAt)>=now-days*DAY).length;
 const expected=candidateTicker(items,now),present=new Set(ticker.slice(0,5).map(i=>i.id));
 return {at:new Date(now).toISOString(),counts,genericLabels:items.filter(i=>/に関する話題|の製品情報$/.test(i.label)).length,categoriesCovered:[...categories].sort(),reviewBurden,visibleIds:items.map(i=>i.id),sourceCounts:sources,freshUseful24h:fresh(1),freshUseful7d:fresh(7),expiredEvents:items.filter(i=>i.eventEndsAt!=null&&i.eventEndsAt<now).map(i=>i.id),visibleDuplicates:duplicates,tickerOmissions:expected.filter(i=>itemQuality(i)==='HIGH VALUE'&&now-Date.parse(i.publishedAt)<=7*DAY&&!present.has(i.id)).map(i=>i.id),tickerTop5:ticker.slice(0,5).map(i=>({id:i.id,label:i.label,quality:itemQuality(i)}))};
}
export function qualityRegressionGate(current,candidate){
 const reasons=[];if(candidate.counts['HIGH VALUE']<current.counts['HIGH VALUE'])reasons.push('high_value_decreased');
 if(current.categoriesCovered.some(c=>!candidate.categoriesCovered.includes(c)))reasons.push('useful_category_decreased');
 if(candidate.counts.NOISE>current.counts.NOISE)reasons.push('noise_increased');if(candidate.genericLabels>current.genericLabels)reasons.push('generic_labels_increased');
 if(['LOW VALUE','NOISE'].includes(candidate.tickerTop5[0]?.quality))reasons.push('ticker_lead_low_value');
 if(candidate.tickerTop5.some(i=>['LOW VALUE','NOISE'].includes(i.quality)))reasons.push('ticker_low_value');
 if(candidate.reviewBurden>current.reviewBurden+Math.max(3,Math.floor(current.reviewBurden*.25)))reasons.push('review_burden_surge');
 for(const field of ['freshUseful24h','freshUseful7d'])if(current[field]>=3&&candidate[field]<current[field]*.7)reasons.push(field+'_loss');
 if(candidate.expiredEvents?.length)reasons.push('expired_event_visible');
 if(candidate.visibleDuplicates>current.visibleDuplicates)reasons.push('visible_duplicates_increased');
 if(candidate.tickerOmissions?.length)reasons.push('fresh_high_value_ticker_omission');
 const missing=(current.visibleIds||[]).filter(id=>!candidate.visibleIds?.includes(id));if(missing.length>=3)reasons.push('approved_mass_visibility_loss');
 for(const [source,count]of Object.entries(current.sourceCounts||{}))if(count>=3&&(candidate.sourceCounts?.[source]||0)<count*.7)reasons.push('source_mass_visibility_loss');
 return {pass:reasons.length===0,reasons:[...new Set(reasons)],current,candidate};
}
export function candidateTicker(items,now){
 const visible=items.filter(i=>Date.parse(i.publishedAt)<=now&&(i.eventEndsAt==null||i.eventEndsAt>=now)&&(i.saleEndsAt==null||i.saleEndsAt>=now));
 let rows=visible.filter(i=>Date.parse(i.publishedAt)>=now-7*DAY);if(!rows.length)rows=visible.filter(i=>Date.parse(i.publishedAt)>=now-14*DAY);return rows.sort((a,b)=>compareTicker(a,b,now)).slice(0,5);
}
