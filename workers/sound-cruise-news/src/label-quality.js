import {labelInformationScore} from '../../../apps/cruise-port/news-quality.js';
export {labelInformationScore} from '../../../apps/cruise-port/news-quality.js';
import {NEWS_BETA_ITEMS} from '../../../apps/cruise-port/data/news-beta.js';
import {validatedProductEvent} from './product-event.js';
// Only Sound Cruise's immutable, independently reviewed labels are reused. Never publisher text.
const pairs=Object.freeze({
 'jp2a-fender-player-fusion':['Fender','Limited Edition Player Fusion'],
 'jp2a-xotic-xxp1':['Xotic','XXP-1'],'jp2a-boss-ex4':['BOSS','EX-4'],'jp2a-vox-ac-mini':['VOX','AC MINI'],
 'jp2a-fender-acoustasonic-limited':['Fender','FSR American Acoustasonic Telecaster'],
 'jp2a-lunacy-nova':['Lunacy Audio','NOVA'],'jp2a-jackson-pc1-e':['Jackson','PC1-E'],
 'jp2a-jam-wahcko-mk2':['JAM Pedals','Wahcko mk.2'],'jp2a-godin-century-maho-eq':['Godin','Century Maho EQ'],
 'jp2a-centerone3':['Leapwing','CenterOne 3'],'jp2a-dotec-deemultiwider':['DOTEC-AUDIO','DeeMultiWider']
});
function independentTopicItems(row){
 let facts;try{facts=typeof row.product_facts==='string'?JSON.parse(row.product_facts):row.product_facts;}catch{return [];}
 return NEWS_BETA_ITEMS.filter(i=>i.category===row.category&&['other','new_product','release'].includes(row.event_type||'other')&&Math.abs(Date.parse(i.publishedAt)-Date.parse(row.published_at))<=14*86400000&&
  (i.sourceUrl===row.source_url||(pairs[i.id]&&typeof facts?.brand==='string'&&typeof facts?.product==='string'&&!facts.version&&pairs[i.id][0]===facts.brand&&pairs[i.id][1]===facts.product&&['other','new_product','release'].includes(row.event_type)))&&
  !(row.event_type==='release'&&/発売予定/.test(i.label)));
}
export function independentTopicUrls(row){return independentTopicItems(row).map(i=>i.sourceUrl);}
export function preferredIndependentLabel(row){
 let facts;try{facts=typeof row.product_facts==='string'?JSON.parse(row.product_facts):row.product_facts;}catch{}
 // A verified action refinement must not be replaced by a coarse legacy label.
 if(validatedProductEvent(facts?.productEvent))return row.label;
 const match=independentTopicItems(row).sort((a,b)=>labelInformationScore(b.label)-labelInformationScore(a.label))[0];
 return match&&labelInformationScore(match.label)>=labelInformationScore(row.label)?match.label:row.label;
}
