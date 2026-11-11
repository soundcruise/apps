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
export function tickerRank(item,now){
 const age=Math.max(0,(now-Date.parse(item.publishedAt||item.published_at))/86400000);
 return labelInformationScore(item.label)+Math.max(0,1-age/7);
}
export function compareTicker(a,b,now){return tickerRank(b,now)-tickerRank(a,now)||(b.publishedAt||b.published_at).localeCompare(a.publishedAt||a.published_at)||a.id.localeCompare(b.id);}
// Callers still own visibility, takedown and 7/14-day eligibility. Reserve the
// first slot for the newest JST day (respecting that day's manual order), then
// retain the established importance ranking. Reduced-motion users see slot 1.
export function selectTicker(items,now){
 if(!items.length)return [];
 const stamp=i=>i.publishedAt||i.published_at;
 const day=i=>new Date(Date.parse(stamp(i))+9*3600000).toISOString().slice(0,10);
 const latest=[...items].sort((a,b)=>day(b).localeCompare(day(a))||(a.displayOrder??100000)-(b.displayOrder??100000)||stamp(b).localeCompare(stamp(a))||a.id.localeCompare(b.id))[0];
 return [latest,...items.filter(i=>i!==latest).sort((a,b)=>compareTicker(a,b,now)).slice(0,4)];
}
export const validEventDeadline=value=>value==null||(Number.isSafeInteger(value)&&value>=0);
export function eventVisible(item,now){return validEventDeadline(item.eventEndsAt)&&(item.eventEndsAt==null||item.eventEndsAt>=now);}
