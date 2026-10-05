// Owner-authorized, four-article editorial assessment, not a discovery surface.
// Facts and independent labels only; publisher expression/images are not retained.
const host='https://acousticguitarmagazine.jp/';
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const AGM_REPRESENTATIVES=Object.freeze([
 {path:'2026-1001-martin-crosroads-erickclapton-signature/',publishedAt:'2026-10-01T10:00:00.000Z',category:'acoustic_guitar',eventType:'new_product',
  label:'Martin、Eric Claptonシグネチャーのアコギ2モデルを発表',
  facts:{brand:'Martin',product:'Crossroads Collection',models:['Custom Shop 000-42 Eric Clapton Ziricote','000-13E Eric Clapton'],productType:'acoustic_guitar',event:'signature_models_announced',signatureArtist:'Eric Clapton',limitedModel:'Custom Shop 000-42 Eric Clapton Ziricote',limitedPerColor:50},
  duplicateTokens:['000-42 Eric Clapton Ziricote','000-13E Eric Clapton'],topic:'agm-editorial:martin-crossroads-clapton'},
 {path:'2026-0928-ortega-r24ro-rce24ro/',publishedAt:'2026-09-28T10:00:00.000Z',category:'acoustic_guitar',eventType:'new_product',
  label:'Ortega、ナイロン弦ギター「R24RO / RCE24RO」を発表',
  facts:{brand:'Ortega',product:'R24RO / RCE24RO',models:['R24RO','RCE24RO'],productType:'nylon_string_guitar',modelTypes:['classical_guitar','electric_nylon_guitar'],event:'new_models_announced'},
  duplicateTokens:['R24RO','RCE24RO'],topic:'agm-editorial:ortega-r24ro-rce24ro'},
 {path:'2026-0930-oshio-loveisallaround/',publishedAt:'2026-09-30T10:00:00.000Z',category:'artist_guitar',eventType:'guitar_artist',
  label:'押尾コータロー、アルバム「LOVE is All Around」発売とツアー開催',
  facts:{kind:'artist_editorial',artist:'押尾コータロー',product:'LOVE is All Around',productType:'album',event:'album_release_and_tour',releaseDate:'2026-08-26',tour:'LOVE is All Around',tourDates:['2026-10-02','2026-10-03','2026-10-17','2026-10-18','2026-10-29','2026-11-01'],relevanceReason:'acoustic_performance'},
  duplicateTokens:['押尾コータロー|LOVE is All Around'],topic:'agm-editorial:oshio-love-is-all-around'},
 {path:'gears/2026-0916-yamaha-ls36-proto-ntx1200r/',publishedAt:'2026-09-16T10:00:00.000Z',category:'artist_guitar',eventType:'guitar_artist',
  label:'大石昌良、Yamahaのアコギ・エレガット使用機材を紹介',
  facts:{kind:'artist_editorial',artist:'大石昌良',brand:'Yamaha',models:['LS36 PROTO','NTX1200R'],productType:'artist_guitar_equipment',event:'owned_equipment_introduction',author:'角 佳音',relevanceReason:'singer_songwriter'},
  duplicateTokens:['大石昌良|LS36 PROTO','大石昌良|NTX1200R'],topic:'agm-editorial:oishi-yamaha-equipment'}
].map(r=>freeze({...r,url:host+r.path})));
export function agmRepresentative(url,publishedAt){
 const record=AGM_REPRESENTATIVES.find(r=>r.url===url&&r.publishedAt===publishedAt);
 if(!record)throw Error('manual_representative_assessment_required');
 return {...record,productFacts:{...structuredClone(record.facts),category:record.category,evidence:'owner_reviewed_representative_test'}};
}
const normalize=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function agmRepresentativeDuplicate(item,rows){
 const record=AGM_REPRESENTATIVES.find(r=>r.url===item.sourceUrl);
 if(!record)throw Error('manual_representative_assessment_required');
 return rows.find(r=>r.review_status==='approved'&&r.id!==item.id&&record.duplicateTokens.some(token=>{
  const evidence=normalize(r.label+' '+(typeof r.product_facts==='string'?r.product_facts:JSON.stringify(r.product_facts)));
  return token.split('|').every(part=>evidence.includes(normalize(part)));
 }))||null;
}
