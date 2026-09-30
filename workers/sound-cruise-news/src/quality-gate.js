// Offline release gate over stored independent labels; no publisher content or external fetch.
import {labelInformationScore} from './label-quality.js';
export function itemQuality(i){
 const label=i.label||'';if(/審査待ち|要確認/.test(label)||!label||!i.sourceUrl)return 'NOISE';
 if(/に関する話題|演奏に関する話題|の製品情報$/.test(label))return 'LOW VALUE';
 if(i.category==='sale'&&(!Number.isFinite(i.saleEndsAt)||i.saleEndsAt<=0))return 'NOISE';
 if(/限定|総単板|エクスプレッション|発売予定|シグネチャー|展示|公演|リサイタル|値下げ|セール/.test(label))return 'HIGH VALUE';
 return labelInformationScore(label)>=3?'USEFUL':'LOW VALUE';
}
export function qualitySnapshot(items,{ticker=[],reviewBurden=0,now=Date.now()}={}){
 if(!Array.isArray(items)||!Array.isArray(ticker)||!Number.isSafeInteger(reviewBurden)||reviewBurden<0)throw Error('quality_snapshot_invalid');
 const counts={'HIGH VALUE':0,USEFUL:0,'LOW VALUE':0,NOISE:0},categories=new Set();
 for(const i of items){const q=itemQuality(i);counts[q]++;if(['HIGH VALUE','USEFUL'].includes(q))categories.add(i.category);}
 return {at:new Date(now).toISOString(),counts,genericLabels:items.filter(i=>/に関する話題|演奏に関する話題|の製品情報$/.test(i.label)).length,categoriesCovered:[...categories].sort(),reviewBurden,tickerTop5:ticker.slice(0,5).map(i=>({id:i.id,label:i.label,quality:itemQuality(i)}))};
}
export function qualityRegressionGate(current,candidate){
 const reasons=[];if(candidate.counts['HIGH VALUE']<current.counts['HIGH VALUE'])reasons.push('high_value_decreased');
 if(current.categoriesCovered.some(c=>!candidate.categoriesCovered.includes(c)))reasons.push('useful_category_decreased');
 if(candidate.counts.NOISE>current.counts.NOISE)reasons.push('noise_increased');if(candidate.genericLabels>current.genericLabels)reasons.push('generic_labels_increased');
 if(['LOW VALUE','NOISE'].includes(candidate.tickerTop5[0]?.quality))reasons.push('ticker_lead_low_value');
 if(candidate.reviewBurden>current.reviewBurden+Math.max(3,Math.floor(current.reviewBurden*.25)))reasons.push('review_burden_surge');
 return {pass:reasons.length===0,reasons,current,candidate};
}
export function candidateTicker(items,now){let rows=items.filter(i=>Date.parse(i.publishedAt)>=now-7*86400000);if(!rows.length)rows=items.filter(i=>Date.parse(i.publishedAt)>=now-14*86400000);return rows.sort((a,b)=>labelInformationScore(b.label)-labelInformationScore(a.label)||b.publishedAt.localeCompare(a.publishedAt)||a.id.localeCompare(b.id)).slice(0,5);}
