import {NEWS_BETA_ITEMS} from '../../../apps/cruise-port/data/news-beta.js';
// Only Sound Cruise's immutable, independently reviewed labels are reused. Never publisher text.
const pairs=Object.freeze({
 'jp2a-boss-ex4':['BOSS','EX-4'],'jp2a-vox-ac-mini':['VOX','AC MINI'],
 'jp2a-fender-acoustasonic-limited':['Fender','FSR American Acoustasonic Telecaster'],
 'jp2a-lunacy-nova':['Lunacy Audio','NOVA'],'jp2a-jackson-pc1-e':['Jackson','PC1-E'],
 'jp2a-jam-wahcko-mk2':['JAM Pedals','Wahcko mk.2'],'jp2a-godin-century-maho-eq':['Godin','Century Maho EQ'],
 'jp2a-centerone3':['Leapwing','CenterOne 3'],'jp2a-dotec-deemultiwider':['DOTEC-AUDIO','DeeMultiWider']
});
export function labelInformationScore(label){
 if(typeof label!=='string'||/審査待ち|要確認|の製品情報$|、(?:ギター|音楽)に関する話題$/.test(label))return 0;
 if(/演奏に関する話題$/.test(label))return 1;
 return /総単板|限定|発売予定|復刻|シグネチャー|小型|追加ボイス|プラグイン\d+製品/.test(label)?4:3;
}
export function preferredIndependentLabel(row){
 let facts;try{facts=typeof row.product_facts==='string'?JSON.parse(row.product_facts):row.product_facts;}catch{return row.label;}
 const match=NEWS_BETA_ITEMS.find(i=>i.category===row.category&&['other','new_product','release'].includes(row.event_type||'other')&&Math.abs(Date.parse(i.publishedAt)-Date.parse(row.published_at))<=14*86400000&&
  (i.sourceUrl===row.source_url||(!facts?.version&&pairs[i.id]?.[0]===facts?.brand&&pairs[i.id]?.[1]===facts?.product&&['other','new_product','release'].includes(row.event_type)))&&
  !(row.event_type==='release'&&/発売予定/.test(i.label)));
 return match&&labelInformationScore(match.label)>labelInformationScore(row.label)?match.label:row.label;
}
