// Diagnostics project the existing publication policy; they do not grant eligibility.
export function missingFacts(row,facts,validation){
 const missing=[];
 if(!facts)missing.push(row.event_type==='guitar_event'?'人物・イベント種別・開催日・会場・ギターとの関連':'確認済みの製品識別情報（メーカー／製品名・型番）');
 else if(facts.kind==='guitar_event'){
  for(const [key,label]of [['artist','人物'],['eventType','イベント種別'],['eventDate','開催日'],['venue','会場'],['evidence','ギターとの関連']])if(!facts[key])missing.push(label);
 }else if(!facts.product&&!facts.artist&&!facts.performer&&!facts.seller)missing.push('対象を特定できる識別情報');
 if(facts?.scopeUncertain)missing.push('製品本体／拡張・パック等の対象範囲');
 if(row.event_type==='other')missing.push('確認済みの出来事（発表・発売・更新等）');
 if(!row.published_at)missing.push('確認済みの公開日');
 if(validation.errors.includes('facts_incomplete')&&facts&&!missing.length)missing.push('既存の識別・イベント方針を満たすfacts／label');
 return missing;
}
export function recoverySurface(row,source){
 // Fixed listing-only evidence must not become permission to crawl article bodies.
 if(source?.id==='ikebe-event'&&source.discoveryUrl==='https://www.ikebe-gakki.com/blog/category/event/')return {url:row.source_url,method:'explicit_event_fields',parser:'event-article-1'};
 if(['shimamura','ikebe','ik'].includes(source?.id)&&['official_listing','shimamura_listing'].includes(source.discoveryType))return {url:source.discoveryUrl,method:'existing_listing_parser',parser:'news-metadata-1'};
 return null;
}
