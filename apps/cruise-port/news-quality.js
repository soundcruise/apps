// One vocabulary for API ranking, Port ticker and offline product release gates.
const HIGH = /総単板|限定|発売予定|復刻|シグネチャー|小型|追加ボイス|プラグイン\d+製品|エクスプレッション|展示|公演|リサイタル|ライブ|ツアー|セール|値下げ|新モデル|新製品|を発表|を発売|ファームウェア更新|(?:DAW|プラグイン|音源).*(?:更新|追加|新)/;
export function labelInformationScore(label) {
 if(typeof label!=='string'||!label||/審査待ち|要確認/.test(label))return 0;
 if(HIGH.test(label))return 4;
 return /に関する話題|の製品情報$/.test(label)?1:3;
}
export function itemQuality(item){
 if(!item?.label||!item.sourceUrl||/審査待ち|要確認/.test(item.label))return 'NOISE';
 if(item.category==='sale'&&(!Number.isSafeInteger(item.saleEndsAt)||item.saleEndsAt<=0))return 'NOISE';
 const score=labelInformationScore(item.label);return score===4?'HIGH VALUE':score===3?'USEFUL':'LOW VALUE';
}
// Article publication time is the only ranking signal. HOT stays presentation
// metadata; registration time, label scores and day-local manual order cannot
// move an older article ahead of a newer one. IDs break exact timestamp ties.
export function compareTicker(a,b){return Date.parse(b.publishedAt||b.published_at)-Date.parse(a.publishedAt||a.published_at)||a.id.localeCompare(b.id);}
// Callers still own visibility, takedown and 7/14-day eligibility.
export function selectTicker(items){return [...items].sort(compareTicker).slice(0,5);}
export const validEventDeadline=value=>value==null||(Number.isSafeInteger(value)&&value>=0);
export function eventVisible(item,now){return validEventDeadline(item.eventEndsAt)&&(item.eventEndsAt==null||item.eventEndsAt>=now);}
