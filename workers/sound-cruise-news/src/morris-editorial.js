// Bounded non-event facts. The caller supplies a verified primary card/article,
// never a transcribed audit record. No release or future-event inference.
const name=v=>typeof v==='string'&&v.length>=2&&v.length<=70&&!/[<>\x00-\x1f]/.test(v);
const topics={fingerpicking:'フィンガーピッキング',guitar_making:'アコースティックギターの製作工程',guitar_structure:'アコースティックギターの構造',guitar_maintenance:'アコースティックギターのメンテナンス'};
const types={event_report:'の開催レポートを紹介',craftsmanship:'を紹介',feature:'を解説',support:'を解説',catalog:'を公開',artist_activity:'の演奏活動を紹介'};
export function morrisEditorialLabel(f,eventType){
 if(eventType!=='morris_editorial'||f?.kind!=='morris_editorial'||!types[f.articleType]||f.action!=='information'||f.category!==(f.articleType==='artist_activity'?'artist_guitar':'media_other')||f.relevance!=='acoustic_guitar'||f.productEvent||f.releaseEvent||f.eventDate||f.endDate)return null;
 if(['event_report','catalog','artist_activity'].includes(f.articleType))return name(f.subject)?`Morris Guitars、「${f.subject}」${types[f.articleType]}`:null;
 const required={craftsmanship:'guitar_making',feature:'guitar_structure',support:'guitar_maintenance'}[f.articleType];
 return f.topic===required?`Morris Guitars、${topics[f.topic]}${types[f.articleType]}`:null;
}
export function extractMorrisEditorial(title,descriptions){
 const lead=descriptions.join(' ');
 if(!lead||!/Morris|モーリス/i.test(lead)||!/アコースティックギター|アコギ|フィンガーピッキング/.test(title+' '+lead)||/予定|計画|検討|予告|公開します|開催予定|開催します|開催いたします|参加募集|エントリー|出展します|発売予定|発売決定|発売|新製品|セール|再入荷|比較|受付停止|中止|延期/.test(title+' '+lead))return null;
 let articleType,subject,topic;
 const named=[...title.matchAll(/「([^」]{2,70})」/g)].map(m=>m[1]).filter(v=>lead.includes('「'+v+'」'));
 if(named.length===1&&/開催レポート/.test(title)&&/開催レポート|開催を振り返/.test(lead)){articleType='event_report';subject=named[0];}
 else if(/イベント|コンサート|コンテスト|診断会|ワークショップ|展示会|出展|出演|開催|募集|受付/.test(title+' '+lead))return null;
 else if(/ギター.{0,10}(?:製作工程|製造工程)/.test(title)&&/アコースティックギター.{0,30}(?:製作工程|製造工程)/.test(lead)){articleType='craftsmanship';topic='guitar_making';}
 else if(/ギター.{0,10}構造解説/.test(title)&&/アコースティックギター.{0,30}構造.{0,15}解説/.test(lead)){articleType='feature';topic='guitar_structure';}
 else if(/ギター.{0,10}メンテナンス解説/.test(title)&&/アコースティックギター.{0,30}メンテナンス.{0,15}解説/.test(lead)){articleType='support';topic='guitar_maintenance';}
 else if(named.length===1&&/ギターカタログ/.test(title)&&/ギターカタログ.{0,90}公開/.test(lead)){articleType='catalog';subject=named[0];}
 else if(named.length===1&&/ギタリスト「[^」]+」.{0,10}演奏活動/.test(title)&&/ギタリスト「[^」]+」.{0,30}演奏活動.{0,15}紹介/.test(lead)){articleType='artist_activity';subject=named[0];}
 if(!articleType)return null;
 const facts={kind:'morris_editorial',articleType,action:'information',category:articleType==='artist_activity'?'artist_guitar':'media_other',relevance:'acoustic_guitar',...(subject?{subject}:{}),...(topic?{topic}:{})};
 return morrisEditorialLabel(facts,'morris_editorial')?facts:null;
}
