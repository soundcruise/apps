// Bounded non-event facts. The caller supplies a verified primary card/article,
// never a transcribed audit record. No release or future-event inference.
const name=v=>typeof v==='string'&&v.length>=2&&v.length<=70&&!/[<>\x00-\x1f]/.test(v);
const topics={fingerpicking:'フィンガーピッキング',guitar_making:'アコースティックギターの製作工程',guitar_structure:'アコースティックギターの構造',guitar_maintenance:'アコースティックギターのメンテナンス'};
const types={event_report:'の開催レポートを紹介',craftsmanship:'を紹介',feature:'を解説',support:'を解説',catalog:'を公開',artist_activity:'の演奏活動を紹介',support_notice:'の修理受付停止を案内'};
export function morrisEditorialLabel(f,eventType){
 if(eventType!=='morris_editorial'||f?.kind!=='morris_editorial'||!types[f.articleType]||f.action!=='information'||f.category!==(f.articleType==='artist_activity'?'artist_guitar':'media_other')||f.relevance!=='acoustic_guitar'||f.productEvent||f.releaseEvent||f.eventDate||f.endDate)return null;
 if(f.articleType==='support_notice')return f.serviceAction!=='intake_stopped'?null:f.topic==='guitar_repair'?'Morris Guitars、アコースティックギターの修理受付停止を案内':f.topic==='guitar_finish_repair'?'Morris Guitars、塗装を伴うギター修理の受付停止を案内':null;
 if(['event_report','catalog','artist_activity'].includes(f.articleType))return name(f.subject)?`Morris Guitars、「${f.subject}」${types[f.articleType]}`:null;
 const required={craftsmanship:'guitar_making',feature:'guitar_structure',support:'guitar_maintenance'}[f.articleType];
 return f.topic===required?`Morris Guitars、${topics[f.topic]}${types[f.articleType]}`:null;
}
